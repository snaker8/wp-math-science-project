// ============================================================================
// 브라우저에서 업로드 전에 이미지를 줄인다 — Vercel 함수 본문 한도(4.5MB) 413 FUNCTION_PAYLOAD_TOO_LARGE 차단.
// 2026-10-07 대표 캡처: 도형 교체 모달에서 PNG 스크린샷 업로드 → 413. 도형은 긴 변 2400px 이면 인쇄에도 충분하다.
//   1) 긴 변 > maxSide 면 비율 유지로 축소  2) 그래도 maxBytes 넘으면 WebP(품질 0.92) → 그래도 넘으면 JPEG(0.9, 흰 배경)
//   SVG 는 여기 오지 않는다(호출측이 PNG 로 바꾼 뒤 넘긴다). 실패하면 원본 그대로 돌려준다(업로드는 서버가 최종 판단).
// ============================================================================

export interface ShrinkOptions {
  /** 긴 변 최대 px (기본 2400) */
  maxSide?: number;
  /** 결과 최대 바이트 (기본 3.5MB — base64/멀티파트 오버헤드 여유) */
  maxBytes?: number;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지 디코딩 실패')); };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/** 업로드용으로 줄인 File 을 돌려준다. 줄일 필요가 없으면 원본 그대로. */
export async function shrinkImageFile(file: File, opts: ShrinkOptions = {}): Promise<{ file: File; shrunk: boolean; note?: string }> {
  const maxSide = opts.maxSide ?? 2400;
  const maxBytes = opts.maxBytes ?? 3.5 * 1024 * 1024;
  if (!/^image\/(png|jpeg|jpg|webp|gif|bmp)$/i.test(file.type)) return { file, shrunk: false };
  try {
    const img = await loadImage(file);
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) return { file, shrunk: false };
    const scale = Math.min(1, maxSide / Math.max(w, h));
    if (scale === 1 && file.size <= maxBytes) return { file, shrunk: false };

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return { file, shrunk: false };
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const base = file.name.replace(/\.[^.]+$/, '');
    let blob = await canvasToBlob(canvas, 'image/png');
    let name = `${base}.png`;
    if (blob && blob.size > maxBytes) {
      const webp = await canvasToBlob(canvas, 'image/webp', 0.92);
      if (webp && webp.size < blob.size) { blob = webp; name = `${base}.webp`; }
    }
    if (blob && blob.size > maxBytes) {
      // JPEG 는 투명을 못 가진다 — 흰 배경 깔고
      const c2 = document.createElement('canvas'); c2.width = canvas.width; c2.height = canvas.height;
      const x2 = c2.getContext('2d');
      if (x2) { x2.fillStyle = '#ffffff'; x2.fillRect(0, 0, c2.width, c2.height); x2.drawImage(canvas, 0, 0); }
      const jpg = await canvasToBlob(c2, 'image/jpeg', 0.9);
      if (jpg && jpg.size < blob.size) { blob = jpg; name = `${base}.jpg`; }
    }
    if (!blob) return { file, shrunk: false };
    const out = new File([blob], name, { type: blob.type });
    const note = `${w}×${h} ${(file.size / 1048576).toFixed(1)}MB → ${canvas.width}×${canvas.height} ${(out.size / 1048576).toFixed(2)}MB`;
    return { file: out, shrunk: true, note };
  } catch {
    return { file, shrunk: false };
  }
}
