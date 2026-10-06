// ============================================================================
// SVG → PNG 래스터라이즈 (서버) — AI 가 만든 SVG 도형을 원본 크롭과 "그림으로" 대조하기 위해.
//
// 2026-10-06 대표: "SVG 가 싸니(26원 vs 이미지 130원) SVG 먼저 가고, 제대로 안 되면 이미지로".
//   SVG 를 믿고 저장하던 종전 방식은 라벨 위치·선 누락을 못 잡았다. 여기서 그림으로 바꿔 image-redraw 의 검증기에 넣는다.
//
// 폰트: Vercel 람다에는 시스템 폰트가 없어 <text> 가 비거나 □ 로 나온다 → assets/fonts/Pretendard-Regular.otf 를 번들하고
//   fontconfig 를 그 디렉토리로 고정한다(FONTCONFIG_PATH). 반드시 sharp 가 글자를 처음 그리기 전에 설정돼야 하므로
//   이 모듈을 import 하는 순간 설정한다(generate-figure 라우트가 정적 import).
// ============================================================================
import path from 'node:path';
import fs from 'node:fs';

export const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');

export function ensureFontConfig(): { dir: string; hasFont: boolean } {
  const hasFont = fs.existsSync(path.join(FONT_DIR, 'Pretendard-Regular.otf')) && fs.existsSync(path.join(FONT_DIR, 'fonts.conf'));
  if (hasFont) {
    if (!process.env.FONTCONFIG_PATH) process.env.FONTCONFIG_PATH = FONT_DIR;
    if (!process.env.FONTCONFIG_FILE) process.env.FONTCONFIG_FILE = path.join(FONT_DIR, 'fonts.conf');
  }
  return { dir: FONT_DIR, hasFont };
}
ensureFontConfig();

/** width="100%" 같은 상대 크기는 래스터라이즈 때 0 이 되므로 걷어내고, viewBox 기준으로 그린다 */
function normalizeSvgForRaster(svg: string): string {
  let s = svg.trim();
  if (!/^<svg[\s>]/i.test(s)) {
    const i = s.search(/<svg[\s>]/i);
    if (i >= 0) s = s.slice(i);
  }
  s = s.replace(/<svg([^>]*?)\s(width|height)="[^"]*%"/gi, '<svg$1');
  s = s.replace(/<svg([^>]*?)\s(width|height)="[^"]*%"/gi, '<svg$1'); // 두 속성 모두
  if (!/xmlns=/.test(s.slice(0, 200))) s = s.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return s;
}

/**
 * SVG → 흰 배경 PNG. 실패하면 null (호출측은 검증 생략).
 * @param width 출력 가로(px). 검증기 입력은 1000px 정도면 충분.
 */
export async function rasterizeSvg(svg: string, opts: { width?: number } = {}): Promise<Buffer | null> {
  ensureFontConfig();
  try {
    const { default: sharp } = await import('sharp');
    const src = Buffer.from(normalizeSvgForRaster(svg));
    const width = opts.width ?? 1000;
    return await sharp(src, { density: 192 })
      .resize({ width, withoutEnlargement: false })
      .flatten({ background: '#ffffff' })
      .png()
      .toBuffer();
  } catch (e) {
    console.warn('[svg-raster] 실패:', e instanceof Error ? e.message : e);
    return null;
  }
}
