// ============================================================================
// 시험지 분석 — 단원별 문항 수 「확정 표」 (2026-10-14, 동백중 1-2 중간 리포트 사고)
// ----------------------------------------------------------------------------
// 사고: 총평 "정비례와 반비례(9문항)" vs 단원 카드 "8문항" — AI 가 문장과 questionNumbers 에서 따로 세어 어긋났다.
//       총평 "중1-2 수학 범위" — 실제는 1학기 끝(정비례와 반비례) + 2학기 도형이 섞인 범위.
// 원칙: 숫자·범위는 서버가 센다. AI 는 이 표를 받아 그대로 쓰고, 결과도 이 표로 다시 맞춘다 (리포트의 수는 전부 같은 출처).
// ============================================================================

export interface UnitFact {
  majorUnit: string;
  /** 시험지 내 문제 번호 (출제 순) */
  numbers: number[];
  count: number;
  /** 학기 라벨 (중1-1 등). 모르면 null */
  semester: string | null;
}

export interface UnitFactInput {
  number: number;
  majorUnit: string;
  semester?: string | null;
}

const norm = (s: string) => s.replace(/\s+/g, '').replace(/[·ㆍ]/g, '·');

/** 문항 → 단원별 표 (문항 번호 순으로 처음 나온 단원부터). 학기는 그 단원 문항 중 가장 많이 나온 라벨 */
export function buildUnitFacts(problems: UnitFactInput[]): UnitFact[] {
  const order: string[] = [];
  const by = new Map<string, { numbers: number[]; sems: Map<string, number> }>();
  for (const p of [...problems].sort((a, b) => a.number - b.number)) {
    const u = (p.majorUnit || '미분류').trim();
    if (!by.has(u)) { by.set(u, { numbers: [], sems: new Map() }); order.push(u); }
    const e = by.get(u)!;
    e.numbers.push(p.number);
    if (p.semester) e.sems.set(p.semester, (e.sems.get(p.semester) ?? 0) + 1);
  }
  return order.map((u) => {
    const e = by.get(u)!;
    let semester: string | null = null; let best = 0;
    for (const [s, n] of e.sems) if (n > best) { best = n; semester = s; }
    return { majorUnit: u, numbers: e.numbers, count: e.numbers.length, semester };
  });
}

/** 학기가 둘 이상 섞였으면 "중1-1 정비례와 반비례 + 중1-2 기본 도형·위치 관계" 식 범위 문장. 하나면 그 학기만 */
export function describeRange(facts: UnitFact[]): string {
  const bySem = new Map<string, string[]>();
  for (const f of facts) {
    const k = f.semester ?? '학기 미상';
    if (!bySem.has(k)) bySem.set(k, []);
    bySem.get(k)!.push(f.majorUnit);
  }
  return [...bySem.entries()].map(([s, units]) => `${s} ${units.join('·')}`).join(' + ');
}

/** 프롬프트에 넣을 확정 표 */
export function formatUnitFactsForPrompt(facts: UnitFact[], total: number): string {
  const sems = new Set(facts.map((f) => f.semester).filter(Boolean));
  const lines = facts.map((f) => `| ${f.majorUnit} | ${f.semester ?? '-'} | ${f.count} | ${f.numbers.join(', ')} |`);
  return [
    `# 단원별 문항 수 (서버가 센 확정값 — 총 ${total}문항. summary·unitAnalyses 의 숫자는 반드시 이 표와 같아야 한다)`,
    '| 대단원 | 학기 | 문항 수 | 문항 번호 |',
    '|---|---|---|---|',
    ...lines,
    sems.size > 1
      ? `- ★ 시험 범위가 두 학기에 걸쳐 있다: ${describeRange(facts)}. summary 에서 범위를 말할 때 한 학기로 뭉뚱그리지 말고 이렇게 쓸 것.`
      : `- 시험 범위: ${describeRange(facts)}.`,
  ].join('\n');
}

export interface UnitAnalysisLike {
  majorUnit: string;
  questionNumbers: number[];
  keyPoints: string;
  strategy: string;
}

/**
 * AI 가 낸 unitAnalyses 를 확정 표에 맞춘다.
 *  - 표에 있는 단원: questionNumbers 를 표의 번호로 덮어쓴다 (AI 가 센 것은 버린다)
 *  - 표에 없는 단원(지어낸 것): 버린다
 *  - AI 가 빠뜨린 단원: 빈 분석으로 채워 넣는다 (카드에 문항 수라도 맞게 나오게)
 * 순서는 표 순서(문항 번호 순).
 */
export function reconcileUnitAnalyses<T extends UnitAnalysisLike>(analyses: T[], facts: UnitFact[]): { result: T[]; dropped: string[]; added: string[] } {
  const byNorm = new Map<string, T>();
  for (const a of analyses) if (a && a.majorUnit) byNorm.set(norm(a.majorUnit), a);
  const dropped = analyses.filter((a) => a && a.majorUnit && !facts.some((f) => norm(f.majorUnit) === norm(a.majorUnit))).map((a) => a.majorUnit);
  const added: string[] = [];
  const result = facts.map((f) => {
    const hit = byNorm.get(norm(f.majorUnit));
    if (hit) return { ...hit, majorUnit: f.majorUnit, questionNumbers: [...f.numbers] };
    added.push(f.majorUnit);
    return { majorUnit: f.majorUnit, questionNumbers: [...f.numbers], keyPoints: '', strategy: '' } as T;
  });
  return { result, dropped, added };
}

/**
 * summary 문장 속 "단원명(N문항)" / "단원명 N문항" 의 N 을 표의 수로 고친다. 고친 건수를 돌려준다.
 */
export function reconcileSummaryCounts(summary: string, facts: UnitFact[]): { text: string; fixed: number } {
  let text = summary || '';
  let fixed = 0;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const f of facts) {
    const unit = esc(f.majorUnit);
    const re = new RegExp(`(${unit})(\\s*\\(?\\s*(?:총\\s*)?)(\\d+)(\\s*문항)`, 'g');
    text = text.replace(re, (m, a: string, b: string, n: string, d: string) => {
      if (parseInt(n, 10) === f.count) return m;
      fixed++;
      return `${a}${b}${f.count}${d}`;
    });
  }
  return { text, fixed };
}

// ============================================================================
// 시험 총평 난이도 라벨 — 서버 계산, **수학비서 1~10 척도 그대로** (2026-10-16 대표 "수학비서 난도 기준으로", "4면 쉬운 게 아닌데")
//   문항 난이도 라벨(cloud-flow 분류 기준): 쉬움 1~2 · 보통 3~4 · 어려움 5~6 · 매우 어려움 7~10
//   시험지 = 평균 난이도를 반올림해 같은 칸에 넣는다. 평이=쉬움 · 보통 · 난이도 있음=어려움 · 매우 난이도 있음.
//   난이도 7 이상이 전체의 1/4 을 넘으면 한 칸 올린다 (평균이 낮아도 변별 문항이 많으면 어려운 시험).
// ============================================================================
export type OverallDifficultyLabel = '평이' | '보통' | '난이도 있음' | '매우 난이도 있음';
const LABEL_ORDER: OverallDifficultyLabel[] = ['평이', '보통', '난이도 있음', '매우 난이도 있음'];

/** 수학비서 1~10 한 문항 라벨 */
export function problemDifficultyLabel(d: number): OverallDifficultyLabel {
  if (d <= 2) return '평이';
  if (d <= 4) return '보통';
  if (d <= 6) return '난이도 있음';
  return '매우 난이도 있음';
}

export function judgeOverallDifficulty(difficulties: number[]): { label: OverallDifficultyLabel; avg: number; pct7: number } {
  const ds = difficulties.filter((d) => Number.isFinite(d));
  if (ds.length === 0) return { label: '보통', avg: 0, pct7: 0 };
  const avg = Math.round((ds.reduce((a, b) => a + b, 0) / ds.length) * 100) / 100;
  const pct7 = Math.round((ds.filter((d) => d >= 7).length / ds.length) * 100);
  let idx = LABEL_ORDER.indexOf(problemDifficultyLabel(Math.round(avg)));
  if (pct7 >= 25) idx = Math.min(LABEL_ORDER.length - 1, idx + 1);
  return { label: LABEL_ORDER[idx], avg, pct7 };
}
