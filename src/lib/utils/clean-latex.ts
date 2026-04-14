/**
 * LaTeX 콘텐츠 정리 유틸리티
 * KaTeX 렌더링 호환성을 위한 전처리
 * 모든 페이지에서 공통으로 사용
 */

export function cleanLatexContent(content: string): string {
  return content
    // 마크다운 이미지 → [도형] 마커
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '[도형]')
    // \displaystyle 제거
    .replace(/\\displaystyle\s*/g, '')
    // \lbrace → \left\{ , \rbrace → \right\} (KaTeX 호환)
    .replace(/\\lbrace/g, '\\left\\{')
    .replace(/\\rbrace/g, '\\right\\}')
    // \begin{table}...\end{table} 래퍼 제거 (KaTeX 미지원, tabular만 남김)
    .replace(/\\begin\{table\}[\s\S]*?(?=\\begin\{tabular\})/gi, '')
    .replace(/\\end\{tabular\}[\s\S]*?\\end\{table\}/gi, '\\end{tabular}')
    // \begin{aligned}...\end{aligned} → 줄별 $...$ 변환
    .replace(/\$\$\s*\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}\s*\$\$/gi, (_match, inner) => {
      return inner
        .split('\\\\')
        .map((line: string) => line.replace(/&/g, '').trim())
        .filter((line: string) => line.length > 0)
        .map((line: string) => `$${line}$`)
        .join('\n');
    })
    .trim();
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
