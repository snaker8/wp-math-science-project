// ============================================================================
// 중복출제 방지 — 「최근 N일 안에 이 학원이 출제한 문항」 집합
// ----------------------------------------------------------------------------
// 매쓰홀릭 유형별 출제의 「중복출제 방지(최근 한달간 출제했던 문항을 제외)」 를 우리 데이터로 구현한다.
//   docs/benchmark/matholic/12-rea-unit-group.md §2·§9 (2026-10-13 실측).
//
// 출제 이력 = 이 institute 의 시험지(exams) 중 **학교기출이 아닌 것**(school_name IS NULL — 출제·수동·진단으로 만든 것)에
// 들어간 exam_problems. 학교기출 시험지는 「자료」지 「출제」가 아니므로 이력에서 뺀다.
//   - 학원 단위(institute)로 센다 — 매쓰홀릭도 학원 단위. 같은 학원 다른 강사가 낸 것도 제외.
//   - 기간 0 = 끄기. 기본 30일. 최대 365일.
//
// 호출처: available-counts(표시 수) · generate(실제 뽑기) · candidates(교체 후보) — 세 곳이 같은 집합을 써야
//   「보이는 수 = 실제 뽑히는 수」 가 유지된다.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_EXCLUDE_RECENT_DAYS = 30;
export const MAX_EXCLUDE_RECENT_DAYS = 365;

/** 요청값 → 0(끄기)~365 정수. 비어 있으면 기본 30. */
export function parseExcludeRecentDays(v: unknown): number {
  if (v === undefined || v === null || v === '') return DEFAULT_EXCLUDE_RECENT_DAYS;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_EXCLUDE_RECENT_DAYS, Math.floor(n));
}

/** 오늘(now) 기준 N일 전 ISO 시각 — created_at >= cutoff 로 쓴다 */
export function recentCutoffIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/**
 * 최근 `days` 일 안에 `instituteId` 가 출제한 문항 id 집합. days<=0 이면 빈 집합.
 * 1,000행 cap 회피 — exams·exam_problems 모두 range 루프.
 */
export async function loadRecentlyIssuedProblemIds(
  sb: SupabaseClient,
  instituteId: string | null | undefined,
  days: number,
  now: Date = new Date(),
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!instituteId || days <= 0) return out;
  const cutoff = recentCutoffIso(days, now);
  const PAGE = 1000;

  const examIds: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('exams')
      .select('id')
      .eq('institute_id', instituteId)
      .is('deleted_at', null)
      .is('school_name', null)
      .gte('created_at', cutoff)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`recent exams: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as { id: string }[]) examIds.push(r.id);
    if (data.length < PAGE) break;
  }
  if (examIds.length === 0) return out;

  const ID_CHUNK = 200;
  for (let i = 0; i < examIds.length; i += ID_CHUNK) {
    const slice = examIds.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from('exam_problems')
        .select('problem_id')
        .in('exam_id', slice)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`recent exam_problems: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const r of data as { problem_id: string | null }[]) if (r.problem_id) out.add(r.problem_id);
      if (data.length < PAGE) break;
    }
  }
  return out;
}
