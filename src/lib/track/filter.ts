// ============================================================================
// Supabase 쿼리에 트랙 필터 일관 적용 (PR-T7)
// ----------------------------------------------------------------------------
// applyTrackFilter(query, 'math')        → query.eq('subject_track', 'math')
// applyTrackFilter(query, null)          → query (변경 X)
// applyTrackFilter(query, 'math', 'col') → query.eq('col', 'math')
//
// 안전성: track 이 null/undefined 면 필터 미적용. 기존 동작 100% 유지.
// 호출처는 SELECT 라우트에서 활성 트랙 알 때만 적용.
//
// 비고: institute-guard 의 applyTrackFilter (PR-T2) 와는 별개 — institute-guard 쪽은
//   InstituteAccessScope 기반, 이 파일은 단순히 SubjectTrack | null 받음. URL 헤더에서
//   추출한 트랙 (PR-T11 이후) 으로 직접 호출 가능.
// ============================================================================

import type { SubjectTrack } from '@/lib/subject-track';

interface EqQueryLike {
  eq(column: string, value: string): unknown;
}

// 주의: 반환 타입은 입력과 동일하다고 단언 (cast).
// supabase PostgrestFilterBuilder 가 너무 깊은 generic chain 이라
// `T extends EqQueryLike<T>` 형태로는 TS2589 (Type instantiation excessively deep) 발생.
export function applyTrackFilter<T extends EqQueryLike>(
  query: T,
  track: SubjectTrack | null | undefined,
  column: string = 'subject_track'
): T {
  if (!track) return query;
  return query.eq(column, track) as T;
}
