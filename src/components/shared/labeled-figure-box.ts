/**
 * 「ㄱ. [도형] ㄴ. [도형] …」 꼴 보기 — 라벨마다 그림이 하나씩 붙는 보기를 찾아낸다.
 *
 * 그대로 그리면 라벨 「ㄱ.」만 보기 박스에 들어가고 그림은 박스 밖 본문으로 풀린다
 * (2026-11-16 부산외고·해운대여고 25-1-2-F 공통수학2). 카드(FigureMarkerRenderer)는 PR #746·#747 에서 고쳤고,
 * 이 함수는 같은 판정을 인쇄(ExamProblemRenderer)에서 쓴다.
 *
 * 조건 — 그림 2개 이상 · 모든 그림 바로 앞 텍스트가 라벨로 끝남 · 그림이 한 칸 건너 하나씩 ·
 *        그림 사이 텍스트는 라벨뿐 · 폭 지정/플로트 그림 없음. 하나라도 어긋나면 null(종전 렌더).
 */
export interface LabeledFigurePart {
  type: 'text' | 'figure';
  text: string;
  floatMode?: 'right' | 'left';
  widthPercent?: number;
}

export interface LabeledFigureBox {
  /** 박스 앞에 그릴 parts 인덱스 (first-1 미만) */
  headEnd: number;
  /** 박스 바로 앞 텍스트에서 라벨·「<보 기>」 표제를 떼어 낸 나머지 */
  head: string;
  /** 그림 parts 인덱스 */
  figIdxs: number[];
  labels: string[];
  /** 박스 뒤에 그릴 parts 시작 인덱스 */
  tailStart: number;
}

const LABEL_TAIL = /(?<=^|\n|[>〉])[ \t]*([ㄱ-ㅎ])[ \t]*[.)][ \t]*$/;
const BOGI_HEADER_TAIL = /\n?[ \t]*[<〈][ \t]*보[ \t]*기[ \t]*[>〉]\s*$/;

export function detectLabeledFigureBox(parts: LabeledFigurePart[]): LabeledFigureBox | null {
  const figIdxs = parts.map((p, k) => (p.type === 'figure' ? k : -1)).filter((k) => k >= 0);
  if (figIdxs.length < 2) return null;
  const labels = figIdxs.map((k) => {
    const prev = parts[k - 1];
    const m = prev && prev.type === 'text' ? prev.text.match(LABEL_TAIL) : null;
    return m ? m[1] : '';
  });
  if (!labels.every(Boolean)) return null;
  if (figIdxs.some((k) => parts[k].widthPercent || parts[k].floatMode)) return null;
  if (!figIdxs.every((k, n) => n === 0 || k === figIdxs[n - 1] + 2)) return null;
  const first = figIdxs[0];
  const last = figIdxs[figIdxs.length - 1];
  const between = parts.slice(first + 1, last).filter((p) => p.type === 'text');
  if (!between.every((p) => p.text.replace(LABEL_TAIL, '').trim() === '')) return null;
  const head = parts[first - 1].text.replace(LABEL_TAIL, '').replace(BOGI_HEADER_TAIL, '');
  return { headEnd: first - 1, head, figIdxs, labels, tailStart: last + 1 };
}
