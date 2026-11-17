/**
 * 원본 보기 배치 감지 — 크롭 OCR(Mathpix line_data)의 「줄 위치」로 한 줄에 보기가 몇 개 놓였는지 센다.
 *
 * 글자만 보면 못 가린다: Mathpix 는 `① 1  ② 2  ③ 3` 한 줄을 보기마다 따로 내주는 일이 흔해,
 * 「한 줄에 마커 몇 개」로는 3열 원본도 1개씩으로 보인다 → 감지 실패 → 화면 기본값 2줄
 * (2026-11-18 대표: 「원본 3줄인데 거의 2줄로 나온다」). 그래서 같은 높이에 놓인 줄을 한 행으로 묶어 센다.
 *
 * 반환: 1=세로 / 2=2열 / 3=3열 / 5=가로(4~5개) / undefined=확정 못 함(호출부 기존 값 유지).
 */

export interface OcrLineBox {
  text?: string;
  text_display?: string;
  /** 다각형 꼭짓점 [[x,y],…] (Mathpix line_data.cnt) */
  cnt?: number[][];
}

const CIRCLED = /[①②③④⑤]/g;
/** 줄 머리의 보기 마커 — `①`, `(1)`, 수식 여는 기호(`\(`, `$`) 뒤 포함 */
const LEAD = /^(?:\\\(|\$|\s)*(?:[①②③④⑤]|\(\s*[1-5]\s*\))/;

function markerCount(text: string): number {
  const circled = (text.match(CIRCLED) || []).length;
  if (circled > 0) return circled;
  return (text.match(/\(\s*[1-5]\s*\)/g) || []).length;
}

export function detectChoiceLayoutFromLines(lines: OcrLineBox[] | null | undefined): number | undefined {
  if (!Array.isArray(lines) || lines.length === 0) return undefined;

  type Item = { n: number; top: number; bottom: number };
  const items: Item[] = [];
  for (const l of lines) {
    const text = (l.text_display || l.text || '').trim();
    // 보기 줄 = 마커로 「시작」하는 줄만. 본문 중간의 ①(「①~⑤ 중」·그림 라벨)은 세지 않는다.
    if (!text || !LEAD.test(text) || !Array.isArray(l.cnt) || l.cnt.length < 2) continue;
    const ys = l.cnt.map((p) => p?.[1]).filter((v): v is number => typeof v === 'number');
    if (ys.length < 2) continue;
    const n = markerCount(text);
    if (n === 0) continue;
    items.push({ n, top: Math.min(...ys), bottom: Math.max(...ys) });
  }
  const total = items.reduce((s, it) => s + it.n, 0);
  // 보기 4~5개가 다 잡혔을 때만 확정 (일부만 잡히면 열 수를 잘못 센다)
  if (total < 4 || total > 5) return undefined;

  // 같은 높이(세로 중심이 행 높이의 절반 안)에 놓인 줄을 한 행으로
  items.sort((a, b) => (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
  const rows: Array<{ n: number; center: number; height: number }> = [];
  for (const it of items) {
    const center = (it.top + it.bottom) / 2;
    const height = Math.max(1, it.bottom - it.top);
    const last = rows[rows.length - 1];
    if (last && Math.abs(center - last.center) <= Math.max(last.height, height) * 0.5) {
      last.n += it.n;
      last.height = Math.max(last.height, height);
    } else {
      rows.push({ n: it.n, center, height });
    }
  }
  const cols = Math.max(...rows.map((r) => r.n));
  if (cols >= 4) return 5;
  if (cols === 3) return 3;
  if (cols === 2) return 2;
  return 1; // 한 행에 하나씩 = 세로
}

/**
 * 원본이 세로(1)여도 보기가 전부 짧으면 3열로 돌린다.
 *
 * 원본은 「보기 왼쪽 세로 + 그림 오른쪽」 배치가 흔한데(학장중 25-2-2-F #1~3), 우리 지면은 그림이 본문 아래로
 * 내려가 보기만 세로로 길게 남는다 (2026-11-18 대표: 「전부 1자로 나오노」). 짧은 보기(`45°` 류)는 세로일
 * 이유가 없으므로 3열, 문장형 보기는 원본대로 세로를 지킨다.
 */
export function relaxVerticalForShortChoices(layout: number | undefined, choices: string[]): number | undefined {
  if (layout !== 1 || choices.length < 4) return layout;
  const visibleLen = (c: string) =>
    c
      .replace(/^\s*(?:[①②③④⑤]|\(\s*[1-5]\s*\))\s*/, '')
      .replace(/\^\s*\{?\s*\\circ\s*\}?/g, '°')
      .replace(/\\[dt]?frac/g, '')
      .replace(/\\[a-zA-Z]+/g, 'x')
      .replace(/[${}\s\\]/g, '').length;
  return choices.every((c) => visibleLen(c) <= 8) ? 3 : layout;
}
