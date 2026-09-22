// `\multicolumn{n}{spec}{내용}` 셀 → { content, span }.
//
// 사고 (2026-09-22, 분포고 25-1-2-M 공통수학2 #7): AI 채팅으로 "가독성 있게 정리" 한 표가 `\multicolumn` 을 쓰는
//   `\begin{array}` 로 돌아왔다. KaTeX 는 `\multicolumn` 을 지원하지 않고, 우리 표 파서도 몰라서 셀에
//   `\multicolumn3c|1명만 선택` 이 글자로 찍혔다. 여기서 span 을 읽어 <td colSpan> 으로 그린다.

export function splitMulticolumn(cell: string): { content: string; span: number } {
  const s = cell.trim();
  const m = /^\\multicolumn\s*\{\s*(\d+)\s*\}\s*\{[^}]*\}\s*\{/.exec(s);
  if (!m) return { content: s, span: 1 };
  // 세 번째 인자 — 중괄호 균형으로 끝을 찾는다 (\text{…} 등 중첩 허용)
  let depth = 1; let i = m[0].length;
  for (; i < s.length && depth > 0; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '{') depth++;
    else if (s[i] === '}') depth--;
  }
  if (depth !== 0) return { content: s, span: 1 };
  const inner = s.slice(m[0].length, i - 1).trim();
  const rest = s.slice(i).trim();
  return { content: rest ? `${inner} ${rest}` : inner, span: Math.max(1, parseInt(m[1], 10) || 1) };
}
