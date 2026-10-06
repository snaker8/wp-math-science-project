// SVG 래스터라이즈 — 번들 폰트(Pretendard)로 한글 라벨이 실제로 찍히는지. 서버(Vercel)엔 시스템 폰트가 없어 이게 깨지면 검증기가 라벨을 못 본다.
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { rasterizeSvg, ensureFontConfig } from './svg-raster';

async function darkPixelsIn(png: Buffer, box: { left: number; top: number; width: number; height: number }): Promise<number> {
  const { data } = await sharp(png).extract(box).greyscale().raw().toBuffer({ resolveWithObject: true });
  let n = 0; for (let i = 0; i < data.length; i++) if (data[i] < 128) n++;
  return n;
}

describe('rasterizeSvg', () => {
  it('번들 폰트 파일과 fonts.conf 가 있다', () => {
    expect(ensureFontConfig().hasFont).toBe(true);
  });

  it('width="100%" SVG 를 1000px 흰 배경 PNG 로 그린다', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="100%"><line x1="20" y1="180" x2="380" y2="180" stroke="#000" stroke-width="3"/></svg>';
    const png = await rasterizeSvg(svg);
    expect(png).not.toBeNull();
    const meta = await sharp(png!).metadata();
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(500);
  });

  it('한글·영문 라벨이 글자로 찍힌다 (빈칸·□ 가 아니다)', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect width="400" height="200" fill="#fff"/>' +
      '<text x="20" y="100" font-size="48" font-family="serif">가격(원)</text><text x="260" y="100" font-size="48" font-family="sans-serif">ABC</text></svg>';
    const png = await rasterizeSvg(svg, { width: 800 });
    expect(png).not.toBeNull();
    // 한글 영역(좌측)과 영문 영역(우측) 모두 잉크가 있어야 한다. □(tofu)는 테두리만이라 잉크가 적다 → 임계 넉넉히
    const ko = await darkPixelsIn(png!, { left: 40, top: 120, width: 360, height: 100 });
    const en = await darkPixelsIn(png!, { left: 520, top: 120, width: 240, height: 100 });
    expect(ko).toBeGreaterThan(1500);
    expect(en).toBeGreaterThan(800);
  });
});
