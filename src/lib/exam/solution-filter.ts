// ============================================================================
// 「해설 있는 문제만」 — 출제 세 곳(있는 문제 수 · 자동 출제 · 교체 후보)이 같은 조건으로 거른다
//
// 2026-11-11 대표: 수학비서에서도 수업용은 해설 있는 문항만 골라 교재를 만든다. 해설은 비싸서 문제만 산 시험지가 많다 →
// 해설이 원래 없는 문항은 우리도 빼고, 필요하면 나중에 해설을 만들거나 산다. 기본 꺼짐(종전 출제 불변).
// ============================================================================

/** 쿼리·본문 값 → boolean ('1' · 'true' · true 만 켜짐) */
export function parseWithSolution(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true';
}

type Filterable<T> = { not(column: string, operator: string, value: unknown): T; neq(column: string, value: unknown): T };

/** problems 쿼리에 「해설 칸이 비어 있지 않음」을 건다 */
export function applySolutionFilter<T>(q: T, withSolution: boolean): T {
  if (!withSolution) return q;
  const a = (q as unknown as Filterable<T>).not('solution_latex', 'is', null);
  return (a as unknown as Filterable<T>).neq('solution_latex', '');
}
