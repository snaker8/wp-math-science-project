/**
 * LaTeX 콘텐츠 정리 유틸리티
 * KaTeX 렌더링 호환성을 위한 전처리
 * 모든 페이지에서 공통으로 사용
 */

export function cleanLatexContent(content: string): string {
  let result = content
    // 마크다운 이미지 → [도형] 마커
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '[도형]')
    // \displaystyle 제거
    .replace(/\\displaystyle\s*/g, '')
    // \lbrace → \left\{ , \rbrace → \right\} (KaTeX 호환)
    .replace(/\\lbrace/g, '\\left\\{')
    .replace(/\\rbrace/g, '\\right\\}');

  // ★ \[ ... \] (display math 구분자, Mathpix/AMS 표준) → $$ ... $$
  //   downstream MixedContentRenderer 도 같은 변환을 하지만 splitAtQuestion 등
  //   `$$` 기준으로 동작하는 호출자가 있어서 진입 시점에 통일.
  //   (예: 신곡중 13번 `\[\begin{array}{l}...\end{array}\]` 가 빨간 raw 로 표시되던 버그)
  //   ※ 단일 $ 안의 환경 자동 승격은 위험 — clean-latex 가 만든 `$\begin{cases}...\end{cases}$`
  //     같은 정상 콘텐츠를 깨뜨릴 수 있어 추가하지 않는다. 필요한 경우 MixedContentRenderer
  //     phase 1-4 ($-balance 기반 판정)에서 처리.
  result = result.replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner: string) => `$$${inner.trim()}$$`);

  // ─── 연립방정식 괄호 패턴 수정 ───
  // OCR 출력: $\left\{$eq1$\n$eq2$\right.$ → KaTeX에서 $ 구분자 꼬임
  // 수정: $\begin{cases} eq1 \\ eq2 \end{cases}$

  // (a) 쌍 연립방정식: $\left\{$eq1$\n$eq2$,\left\{$eq3$\n$eq4$\right.\right.$
  const dfrac = (s: string) => s.trim().replace(/\\frac\b/g, '\\dfrac');
  result = result.replace(
    /\$\\left\\\{\$([^$]*)\$(?:\\n|\n)\$([^$]*)\$\s*,\s*\\left\\\{\$([^$]*)\$(?:\\n|\n)\$([^$]*)\$\\right\.\\right\.\$/g,
    (_m, eq1: string, eq2: string, eq3: string, eq4: string) =>
      `$\\begin{cases} ${dfrac(eq1)} \\\\ ${dfrac(eq2)} \\end{cases}$, $\\begin{cases} ${dfrac(eq3)} \\\\ ${dfrac(eq4)} \\end{cases}$`
  );

  // (b) 단일 연립방정식: $\left\{$eq1$\n$eq2$\right.$
  result = result.replace(
    /\$\\left\\\{\$([^$]*)\$(?:\\n|\n)\$([^$]*)\$\\right\.\$/g,
    (_m, eq1: string, eq2: string) =>
      `$\\begin{cases} ${dfrac(eq1)} \\\\ ${dfrac(eq2)} \\end{cases}$`
  );

  // \begin{table}...\end{table} 래퍼 제거
  result = result
    .replace(/\\begin\{table\}[\s\S]*?(?=\\begin\{tabular\})/gi, '')
    .replace(/\\end\{tabular\}[\s\S]*?\\end\{table\}/gi, '\\end{tabular}');

  // tabular는 MixedContentRenderer가 자체 파싱하므로 여기서 변환하지 않음

  // \begin{aligned}...\end{aligned} → 줄별 $...$ 변환
  result = result.replace(/\$\$\s*\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}\s*\$\$/gi, (_match, inner) => {
    return inner
      .split('\\\\')
      .map((line: string) => line.replace(/&/g, '').trim())
      .filter((line: string) => line.length > 0)
      .map((line: string) => `$${line}$`)
      .join('\n');
  });

  return result.trim();
}

/**
 * 선택지 텍스트 정리 — \begin{array}/\begin{aligned} 블록을 줄별 $...$로 변환
 */
export function cleanChoiceText(text: string): string {
  return text.replace(
    /\$?\s*\\begin\{(?:array|aligned)\}(?:\{[^}]*\})?([\s\S]*?)\\end\{(?:array|aligned)\}\s*\$?/gi,
    (_m, inner) => {
      return inner
        .split('\\\\')
        .map((l: string) => `$${l.replace(/&/g, '').trim()}$`)
        .filter((l: string) => l !== '$$')
        .join(' ');
    }
  );
}
