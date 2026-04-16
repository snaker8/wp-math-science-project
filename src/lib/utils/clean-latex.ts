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

  // ─── tabular → HTML table 변환 (KaTeX는 tabular 미지원) ───
  result = result.replace(
    /\\begin\{tabular\}(?:\{[^}]*\})?([\s\S]*?)\\end\{tabular\}/gi,
    (_m, inner: string) => {
      const rows = inner.split(/\\\\/).map(r => r.trim()).filter(r => r.length > 0);
      const htmlRows = rows.map((row, rowIdx) => {
        const cells = row.split('&').map(c => c.trim());
        const tag = rowIdx === 0 ? 'th' : 'td';
        const cellsHtml = cells.map(c => `<${tag} style="padding:4px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${c}</${tag}>`).join('');
        return `<tr>${cellsHtml}</tr>`;
      });
      return `<table style="border-collapse:collapse;margin:8px 0;font-size:14px;">${htmlRows.join('')}</table>`;
    }
  );

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
