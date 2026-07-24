// ============================================================================
// 표 객관식 자동 감지 — 공용 (2026-07-24 cloud-flow 에서 추출)
//
// content 안의 \begin{tabular}/\begin{array} 블록이 "헤더행 + (1)~(5)/①~⑤ 라벨 행" 인
// 보기 표면 → choiceHeaders + `|` 구분 choices 로 변환. (예: 화명중 #5, 사직중 #13)
//
// ★ PDF/OCR(cloud-flow) 와 HML(hml-parser) 두 자산화 경로가 같은 로직을 쓰도록 분리
//   (복제 drift 방지). 원장님 "수정모달뿐 아니라 분석시에도 헤더 넣고 읽게" 요청 반영.
// ★ 보수적 발동 — 라벨((1)~(5)/①~⑤)행 3~5개 + 헤더 셀 수 == 보기 셀 수 일 때만.
//   데이터 표(#1 집합·x/y 행)·조건 박스는 미발동(오탐 0). vitest 로 고정.
// ============================================================================

const MARKS = ['①', '②', '③', '④', '⑤'];

/**
 * content 에서 표 객관식 블록을 찾아 변환. 아니면 null(호출측은 원본 유지).
 * 반환: { content(표 제거), choices(`① a | b`), choiceHeaders } | null
 */
export function detectTabularChoices(content: string):
  { content: string; choices: string[]; choiceHeaders: string[] } | null {
  const blockRe = /\\begin\{(?:tabular|array)\}(?:\s*\{[^}]*\})?([\s\S]*?)\\end\{(?:tabular|array)\}/;
  const m = content.match(blockRe);
  if (!m || m.index == null) return null;
  const rawRows = m[1].split(/\\\\|\n/).map((r) => r.replace(/\\hline/g, '').trim()).filter(Boolean);
  if (rawRows.length < 4) return null; // 헤더 + 최소 3보기
  const rows = rawRows.map((r) => r.split('&').map((c) => c.trim()));
  const labelRe = /^\$?\s*[(（]?\s*([1-5])\s*[)）]?\s*\$?$/;
  const circRe = /^\$?\s*([①②③④⑤])\s*\$?$/;

  const labeled: { idx: number; cells: string[] }[] = [];
  let header: string[] | null = null;
  for (const cells of rows) {
    const first = cells[0] || '';
    const lm = first.match(labelRe);
    const cm = first.match(circRe);
    if (lm) labeled.push({ idx: parseInt(lm[1], 10), cells: cells.slice(1) });
    else if (cm) labeled.push({ idx: MARKS.indexOf(cm[1]) + 1, cells: cells.slice(1) });
    else if (header === null && cells.some((c) => c)) header = cells;
  }
  if (labeled.length < 3 || labeled.length > 5) return null;
  labeled.sort((a, b) => a.idx - b.idx);
  for (let i = 0; i < labeled.length; i++) if (labeled[i].idx !== i + 1) return null; // 1..N 연속
  const colN = labeled[0].cells.length;
  if (colN < 1 || !labeled.every((l) => l.cells.length === colN)) return null;
  // 헤더: 라벨열(첫 빈칸) 제거 후 셀 수가 보기 셀 수와 일치해야 표 객관식
  const headerCells = header
    ? (header[0] === '' ? header.slice(1) : header).map((c) => c.trim()).filter(Boolean)
    : [];
  if (headerCells.length !== colN) return null;

  const choices = labeled.map((l) => `${MARKS[l.idx - 1] || ''} ${l.cells.join(' | ')}`.trim());
  const newContent = (content.slice(0, m.index) + content.slice(m.index + m[0].length))
    .replace(/\n{2,}/g, '\n').trim();
  return { content: newContent, choices, choiceHeaders: headerCells };
}
