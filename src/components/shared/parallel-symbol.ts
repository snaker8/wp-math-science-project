// KaTeX 가 모르는·다르게 그리는 기호를 한국 교과서 표기로 — 그릴 때만 바꾼다(DB 원문 불변).
//
// 1) 평행 — 대표 10-05: "평행선 기호가 // 이렇게 사선으로 표현되어야 하는데 계속 || 로 표현된다".
//    Mathpix·HML 변환 모두 `\parallel` 을 내보내고 KaTeX 는 `∥`(세로 두 줄)로 그린다. `\mathrel{/\!/}` 로 사선 두 개.
//    `\nparallel`·`\|`(노름)은 건드리지 않는다.
// 2) 호 — 대표 10-05: "호 기호도 계속 오류 나서 수정하고 있다". Mathpix 가 호 AB 를 `\overparen{AC}` 로 내보내는데
//    KaTeX 는 `\overparen`·`\wideparen`·`\overarc` 를 지원하지 않아 빨간 원문이 된다 → `\overset{\frown}{…}`.
//    (HML 경로는 hangul-equation 이 이미 `\stackrel{\frown}` 으로 낸다 — 같은 모양.)

export const SLANT_PARALLEL = '\\mathrel{/\\!/}';

export function slantParallel(latex: string): string {
  if (!latex || (!latex.includes('\\parallel') && !latex.includes('∥'))) return latex;
  return latex
    .replace(/\\parallel(?![a-zA-Z])/g, SLANT_PARALLEL)
    .replace(/∥/g, SLANT_PARALLEL);
}

export function arcToFrown(latex: string): string {
  if (!latex || !/\\(?:overparen|wideparen|overarc)\b/.test(latex)) return latex;
  return latex.replace(/\\(?:overparen|wideparen|overarc)(?![a-zA-Z])/g, '\\overset{\\frown}');
}

/** 렌더 직전 한 번에 */
export function katexKoreanSymbols(latex: string): string {
  return arcToFrown(slantParallel(latex));
}
