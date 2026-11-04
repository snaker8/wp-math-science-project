import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { normalizeImageForVision, sniffImageType } from './image-normalize';

// 해운대고 25-1-2-F 13번 — HML 그림이 BMP 로 저장돼 AI 분석이 "image/png not supported" 로 죽던 사고 (2026-11-04)
async function makeBmp(): Promise<Buffer> {
  // sharp 는 BMP 출력이 없어 24bit BMP 를 손으로 만든다 (2×2 흰색)
  const w = 2, h = 2, rowBytes = 8; // 2px*3B = 6 → 4의 배수 8
  const pixels = h * rowBytes;
  const buf = Buffer.alloc(54 + pixels, 0xff);
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(54 + pixels, 2); buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14); buf.writeInt32LE(w, 18); buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(pixels, 34);
  return buf;
}

describe('normalizeImageForVision — 비전 모델 미지원 포맷은 PNG 로', () => {
  it('★ BMP 는 image/png 로 변환된다 (content-type 이 뭐라 하든)', async () => {
    const bmp = await makeBmp();
    expect(sniffImageType(bmp)).toBe('image/bmp');
    const out = await normalizeImageForVision(bmp, 'image/bmp');
    expect(out?.mediaType).toBe('image/png');
    expect(sniffImageType(Buffer.from(out!.data, 'base64'))).toBe('image/png');
  });
  it('PNG 는 그대로 (재인코딩 안 함)', async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).png().toBuffer();
    const out = await normalizeImageForVision(png, 'application/octet-stream');
    expect(out?.mediaType).toBe('image/png');
    expect(out?.data).toBe(png.toString('base64'));
  });
  it('JPEG 는 매직바이트로 jpeg 판정 — 선언이 png 여도', async () => {
    const jpg = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    expect((await normalizeImageForVision(jpg, 'image/png'))?.mediaType).toBe('image/jpeg');
  });
  it('이미지가 아니면 null (요청 전체를 400 내지 않고 그 그림만 건너뛰게)', async () => {
    expect(await normalizeImageForVision(Buffer.from('<html>not an image</html>'), 'text/html')).toBeNull();
  });
});
