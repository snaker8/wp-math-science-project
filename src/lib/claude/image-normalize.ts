// ============================================================================
// 비전 모델에 보낼 이미지 정규화 — BMP 등 미지원 포맷을 PNG 로 바꾼다
// ============================================================================
//
// ★ 사고 (2026-11-04 해운대고 25-1-2-F 대수 13번): 수학비서 HML 그림은 BMP 로 저장되는데(3,154문제·3,748장)
//   AI 분석이 content-type 이 image/bmp 라고 `image/png` 로 바꿔 보내 Claude 가
//   "Image format image/png not supported" 로 거절 → 리포트 생성 실패.
//   Claude 는 png/jpeg/webp/gif, Gemini 는 png/jpeg/webp 만 받는다. 그 밖은 sharp 로 PNG 변환.
//   content-type 보다 매직바이트를 우선한다 (HML Format 속성이 png 여도 실제는 BMP 인 사고 — hml-parser 와 같은 이유).

export type VisionImage = { mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string };

/** 매직바이트로 실제 포맷 판독. 모르면 null. */
export function sniffImageType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp';
  return null;
}

const SUPPORTED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/**
 * 무압축 BMP(BI_RGB 24/32비트, 8비트 팔레트) → RGB 원시 픽셀. sharp(libvips 프리빌드)는 BMP 입력이 없다.
 * 실측(2026-11-04, 저장된 BMP 46장 표본): 전부 BITMAPINFOHEADER·24비트·무압축·bottom-up.
 * 그 밖(RLE·16비트 등)은 null → 호출측이 건너뛴다.
 */
export function decodeBmpToRgb(buf: Buffer): { width: number; height: number; data: Buffer } | null {
  if (buf.length < 54 || buf[0] !== 0x42 || buf[1] !== 0x4d) return null;
  const dataOffset = buf.readUInt32LE(10);
  const hdrSize = buf.readUInt32LE(14);
  if (hdrSize < 40) return null;
  const width = buf.readInt32LE(18);
  const rawH = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);
  if (compression !== 0 || width <= 0 || rawH === 0) return null;
  if (bpp !== 24 && bpp !== 32 && bpp !== 8) return null;
  const topDown = rawH < 0;
  const height = Math.abs(rawH);
  const rowBytes = Math.floor((width * bpp + 31) / 32) * 4;
  if (dataOffset + rowBytes * height > buf.length) return null;
  let palette: Buffer | null = null;
  if (bpp === 8) {
    const colorsUsed = buf.readUInt32LE(46) || 256;
    const palStart = 14 + hdrSize;
    if (palStart + colorsUsed * 4 > buf.length) return null;
    palette = buf.subarray(palStart, palStart + colorsUsed * 4);
  }
  const out = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const srcRow = dataOffset + (topDown ? y : height - 1 - y) * rowBytes;
    let o = y * width * 3;
    for (let x = 0; x < width; x++) {
      if (bpp === 8) {
        const idx = buf[srcRow + x] * 4;
        if (!palette || idx + 2 >= palette.length) return null;
        out[o++] = palette[idx + 2]; out[o++] = palette[idx + 1]; out[o++] = palette[idx];
      } else {
        const s = srcRow + x * (bpp / 8);
        out[o++] = buf[s + 2]; out[o++] = buf[s + 1]; out[o++] = buf[s]; // BGR → RGB
      }
    }
  }
  return { width, height, data: out };
}

/**
 * 비전 API 가 받는 포맷이면 그대로, 아니면(BMP·TIFF·octet-stream 등) PNG 로 변환해 base64 로 돌려준다.
 * 변환 실패 시 null — 호출측은 그 그림을 건너뛴다 (잘못된 media_type 으로 요청 전체가 400 나는 것보다 낫다).
 */
export async function normalizeImageForVision(buf: Buffer, declared?: string | null): Promise<VisionImage | null> {
  const sniffed = sniffImageType(buf);
  const type = sniffed ?? (declared || '').split(';')[0].trim().toLowerCase();
  if (SUPPORTED.has(type)) return { mediaType: type as VisionImage['mediaType'], data: buf.toString('base64') };
  try {
    const sharp = (await import('sharp')).default;
    const bmp = type === 'image/bmp' ? decodeBmpToRgb(buf) : null;
    const png = bmp
      ? await sharp(bmp.data, { raw: { width: bmp.width, height: bmp.height, channels: 3 } }).png().toBuffer()
      : await sharp(buf).png().toBuffer();
    return { mediaType: 'image/png', data: png.toString('base64') };
  } catch (e) {
    console.warn('[image-normalize] PNG 변환 실패:', type, e instanceof Error ? e.message : e);
    return null;
  }
}
