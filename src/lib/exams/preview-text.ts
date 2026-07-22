// ============================================================================
// 시험지 카드 미리보기 텍스트 — 첫 문제 본문(content_latex) → 아주 작게 그릴 평문.
//
// ★ 왜 (2026-07-23)
//   목록 카드의 액자 자리가 회색 문서 아이콘(플레이스홀더)이었다. 카드 높이의 40%,
//   가장 눈이 먼저 가는 자리인데 아무 정보가 없어 화면이 허전하면서 복잡해 보였다.
//   (원본 주석: "액자형 썸네일 — 은은한 문서 모티브(실제 미리보기는 후속 단계)")
//   운영 195건 전부 1번 문제 본문이 있으므로(실측 100%), 그 첫 줄을 실제로 그린다.
//   이미지 생성·저장·비용 0.
//
// ★ 목표는 "읽는 것"이 아니라 "구분되는 것"이다. 10px 이하로 그려지므로
//   수식은 기호만 남기고 뼈대를 없앤다. 정확한 수식 렌더링은 상세 화면의 몫.
// ============================================================================

/** 미리보기 최대 길이 — 액자 3~4줄 분량 */
const MAX_LEN = 110;

/**
 * 표·도형·배점처럼 미리보기에서 소음이 되는 덩어리를 걷어낸다.
 * 순서 주의: 표를 먼저 지워야 표 안의 마커까지 함께 사라진다.
 */
function stripNoise(src: string): string {
  return src
    // 표 블록 (닫히지 않은 것도 끝까지)
    .replace(/\\begin\{tabular\}[\s\S]*?(?:\\end\{tabular\}|$)/g, ' ')
    .replace(/\\begin\{(array|cases|aligned|align)\}[\s\S]*?(?:\\end\{\1\}|$)/g, ' ')
    // 도형·이미지 마커
    .replace(/\[도형\]/g, ' ')
    // 배점 표기 [3점] [총 5점] (3점)
    .replace(/[[(]\s*(?:총\s*)?\d+(?:\.\d+)?\s*[점졈졍]\s*[\])]/g, ' ')
    // 객관식 보기는 stem 이 아니므로 첫 보기부터 잘라낸다
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩][\s\S]*$/, ' ');
}

/**
 * LaTeX 뼈대 제거 — 명령·중괄호·달러를 없애고 사람이 읽는 기호만 남긴다.
 * `$x^{2}-4x+k=0$` → `x2-4x+k=0`
 */
function flattenMath(src: string): string {
  return src
    // \frac{a}{b} 류는 인자만 남기고 명령 제거
    .replace(/\\[a-zA-Z]+\s*/g, ' ')
    // 남은 제어 문자·구분자
    .replace(/[${}\\^_&~]/g, '')
    // 표 잔재
    .replace(/\|/g, ' ')
    .replace(/\bhline\b/g, ' ');
}

/**
 * 첫 문제 본문 → 카드 액자에 그릴 한 토막.
 * 만들 수 없으면 빈 문자열(호출측이 기존 문서 모티브로 폴백).
 */
export function buildPreviewText(contentLatex: string | null | undefined): string {
  if (!contentLatex) return '';
  const flat = flattenMath(stripNoise(contentLatex))
    .replace(/\s+/g, ' ')
    .trim();
  if (!flat) return '';
  if (flat.length <= MAX_LEN) return flat;
  // 단어 중간에서 자르지 않도록 마지막 공백까지만
  const cut = flat.slice(0, MAX_LEN);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > MAX_LEN * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}
