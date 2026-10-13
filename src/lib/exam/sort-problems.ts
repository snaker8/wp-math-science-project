// ============================================================================
// 시험지 문항 정렬 6종 (2026-10-14, 매쓰홀릭 2단계 「정렬 ▾」 등가 — 12-rea-unit-group.md §6)
//   단원별 · 유형별 · 주관식 후순위 · 난이도 오름순 · 난이도 내림순 · 랜덤으로 섞기
// 순수 함수. 안정 정렬(같은 키면 원래 순서 유지)이라 "단원별 → 난이도 오름" 처럼 이어 눌러도 뜻이 산다.
// ============================================================================

export type ProblemSortMode = 'unit' | 'type' | 'subjective-last' | 'diff-asc' | 'diff-desc' | 'shuffle';

export const PROBLEM_SORT_OPTIONS: { value: ProblemSortMode; label: string; hint: string }[] = [
  { value: 'unit', label: '단원별 정렬', hint: '소단원(유형 코드 앞 4칸) 순, 같은 단원 안은 원래 순서' },
  { value: 'type', label: '유형별 정렬', hint: '유형 코드 순' },
  { value: 'subjective-last', label: '주관식 후순위 정렬', hint: '객관식을 앞으로, 주관식(보기 없음)을 뒤로' },
  { value: 'diff-asc', label: '난이도 오름순 정렬', hint: '쉬운 문제부터' },
  { value: 'diff-desc', label: '난이도 내림순 정렬', hint: '어려운 문제부터' },
  { value: 'shuffle', label: '랜덤으로 섞기', hint: '무작위' },
];

export interface SortableProblem {
  id: string;
  typeCode?: string | null;
  difficulty?: number | string | null;
  choices?: unknown[] | null;
}

const unitOf = (p: SortableProblem) => (p.typeCode ?? '').split('-').slice(0, 4).join('-');
const diffOf = (p: SortableProblem) => { const d = parseInt(String(p.difficulty ?? ''), 10); return Number.isFinite(d) ? d : 5; };
const isObjective = (p: SortableProblem) => Array.isArray(p.choices) && p.choices.length > 0;

/** 정렬된 id 배열. 원본은 건드리지 않는다. */
export function sortProblemIds<T extends SortableProblem>(problems: T[], mode: ProblemSortMode, rng: () => number = Math.random): string[] {
  const idx = new Map(problems.map((p, i) => [p.id, i]));
  const stable = (a: T, b: T) => (idx.get(a.id)! - idx.get(b.id)!);
  const cmpStr = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  let sorted: T[];
  switch (mode) {
    case 'unit':
      sorted = [...problems].sort((a, b) => cmpStr(unitOf(a), unitOf(b)) || stable(a, b));
      break;
    case 'type':
      sorted = [...problems].sort((a, b) => cmpStr(a.typeCode ?? '', b.typeCode ?? '') || stable(a, b));
      break;
    case 'subjective-last':
      sorted = [...problems].sort((a, b) => (Number(!isObjective(a)) - Number(!isObjective(b))) || stable(a, b));
      break;
    case 'diff-asc':
      sorted = [...problems].sort((a, b) => (diffOf(a) - diffOf(b)) || stable(a, b));
      break;
    case 'diff-desc':
      sorted = [...problems].sort((a, b) => (diffOf(b) - diffOf(a)) || stable(a, b));
      break;
    case 'shuffle': {
      sorted = [...problems];
      for (let i = sorted.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      }
      break;
    }
    default:
      sorted = [...problems];
  }
  return sorted.map((p) => p.id);
}

/** 순서가 실제로 바뀌는지 — 같으면 서버에 안 보낸다 */
export function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
