/**
 * 인쇄용 — 붙어 있는 그림(`[도형][도형]`)을 한 줄로 묶는다.
 *
 * 카드(FigureMarkerRenderer)는 연속 그림을 옆으로 나란히 놓고 캡션을 그림 밑에 다는데,
 * 인쇄(ExamProblemRenderer)는 그림마다 한 줄씩 세로로 쌓고 캡션 「[그림1][그림2]」 는 맨 아래 글자로 남았다
 * (2026-11-17 해운대여고 25-1-2-F 공통수학2 #8, 부산외고 #15).
 *
 * 규칙(카드의 축약판) — 사이에 글이 없는 그림 2개 이상 = 런. 런 바로 뒤 텍스트가 대괄호 캡션으로 **시작**하고
 * 그 수가 런 길이와 같으면 그림 밑 캡션으로 옮긴다. 폭 지정·플로트 그림은 런에 넣지 않는다.
 */
export interface FigRunPart {
  type: 'text' | 'figure';
  text: string;
  floatMode?: 'right' | 'left';
  widthPercent?: number;
}

export type FigRunGroup =
  | { kind: 'text'; text: string; partIndex: number }
  | { kind: 'figure'; figIdx: number; widthPercent?: number; partIndex: number }
  | { kind: 'run'; figIdxs: number[]; captions: string[]; partIndex: number };

const LEADING_CAPTIONS = /^\s*((?:\[[^\][\n]{1,20}\]\s*)+)/;

export function groupFigureRuns(parts: FigRunPart[]): FigRunGroup[] {
  const out: FigRunGroup[] = [];
  let figIdx = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.type === 'text') { out.push({ kind: 'text', text: p.text, partIndex: i }); continue; }
    const plain = (q?: FigRunPart) => !!q && q.type === 'figure' && !q.widthPercent && !q.floatMode;
    let len = 1;
    if (plain(p)) while (plain(parts[i + len])) len++;
    if (len < 2) {
      out.push({ kind: 'figure', figIdx: figIdx++, widthPercent: p.widthPercent, partIndex: i });
      continue;
    }
    const figIdxs = Array.from({ length: len }, (_, k) => figIdx + k);
    figIdx += len;
    let captions: string[] = [];
    const next = parts[i + len];
    let rest: string | null = null;
    if (next && next.type === 'text') {
      const m = next.text.match(LEADING_CAPTIONS);
      const caps = m ? m[1].match(/\[[^\][\n]{1,20}\]/g) || [] : [];
      if (m && caps.length === len) {
        captions = caps.map((s) => s.trim());
        rest = next.text.slice(m[0].length);
      }
    }
    out.push({ kind: 'run', figIdxs, captions, partIndex: i });
    i += len - 1;
    if (rest !== null) {
      i++; // 캡션을 떼어 낸 텍스트 파트
      if (rest.trim()) out.push({ kind: 'text', text: rest, partIndex: i });
    }
  }
  return out;
}
