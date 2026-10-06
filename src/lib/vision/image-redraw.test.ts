// prepareRedrawInput — 재작성 모델 입력 정리(줄무늬 제거·업스케일) 회귀 가드
// 사고(2026-10-06 부흥중 산점도 보기 ④): 희미한 스캔 줄무늬를 모델이 "눈금선 6개"로 살려 그려 검증 탈락 반복.
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { prepareRedrawInput, REDRAW_PROMPT } from './image-redraw';

async function makeStripedImage(w: number, h: number): Promise<Buffer> {
  // 흰 바탕 + 중간 행에 밝은 회색(200) 줄무늬 + 검은(20) 선 하나
  const data = Buffer.alloc(w * h, 255);
  for (let x = 0; x < w; x++) {
    data[Math.floor(h / 3) * w + x] = 200;                       // 줄무늬 1px
    for (let dy = -1; dy <= 1; dy++) data[(Math.floor(h / 2) + dy) * w + x] = 20; // 잉크 선 3px
  }
  return sharp(data, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
}

describe('prepareRedrawInput', () => {
  it('밝은 회색 줄무늬는 흰색으로, 잉크는 그대로, 작은 입력은 2배 업스케일', async () => {
    const src = await makeStripedImage(300, 240);
    const out = await prepareRedrawInput(src);
    expect(out.cleaned).toBe(true);
    expect(out.upscaled).toBe(true);
    expect(out.width).toBe(600);
    expect(out.height).toBe(480);
    const { data, info } = await sharp(out.png).greyscale().raw().toBuffer({ resolveWithObject: true });
    const row = (y: number) => data.subarray(y * info.width, (y + 1) * info.width);
    // 줄무늬(원래 y=80 → 업스케일 후 y≈160) 는 전부 흰색
    expect(Math.min(...row(160))).toBe(255);
    // 잉크 선(원래 y=119~121 → y≈238~242) 은 어두운 값이 남아 있어야 한다
    expect(Math.min(...row(240))).toBeLessThan(80);
  });

  it('큰 입력은 업스케일하지 않는다', async () => {
    const src = await makeStripedImage(1200, 400);
    const out = await prepareRedrawInput(src);
    expect(out.upscaled).toBe(false);
    expect(out.width).toBe(1200);
    expect(out.cleaned).toBe(true);
  });

  it('프롬프트는 눈금선·화살표 추가 금지와 스캔 잡티 제거를 명시한다', () => {
    expect(REDRAW_PROMPT).toMatch(/NEVER add grid lines/);
    expect(REDRAW_PROMPT).toMatch(/Faint scan lines/);
  });
});
