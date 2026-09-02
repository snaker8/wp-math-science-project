// ============================================================================
// (시험지 × 학생) → 채점 세션 찾기 — B라인 단일 (2026-09-02)
// ----------------------------------------------------------------------------
// 채점 결과가 두 곳에 나뉘어 있던 걸 B(print_sessions + session_results)로 통일했다.
// 그런데 "이 학생의 이 시험 채점 세션" 을 찾는 코드가 리포트·AI코멘트·공유링크에
// **제각각 복사**돼 있었고, 대부분 옛 A라인을 보거나 신원 병합을 빼먹었다.
//
// 실제 사고 (2026-09-02)
//   · AI 코멘트: A 만 봐서 QR 로만 채점한 학생은 "채점 기록이 없습니다" 로 **기능 자체가 죽음**
//   · 신원 병합 누락: 승격된 학생은 데이터가 옛 roster id 에 남아 있어 못 찾음
//
// 그래서 한 곳에 모은다. 복사본이 늘면 또 갈라진다.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export interface GradingSession {
  id: string;
  studentId: string;              // 세션에 실제로 박힌 id (roster 일 수도, user 일 수도)
  completedAt: string | null;
  aiComment: unknown | null;
  teacherComment: unknown | null;
}

/**
 * ★ 한 학생이 id 두 개를 갖는다.
 *   명단(roster)으로 채점한 뒤 정식 학생으로 승격하면 **데이터는 옛 roster id 에 남는다.**
 *   승격된 user id 로만 찾으면 그 학생의 기록이 통째로 안 보인다.
 */
export async function resolveStudentIdentity(
  sb: SupabaseClient,
  studentId: string,
): Promise<string[]> {
  const ids = new Set<string>([studentId]);

  // 이 user 로 승격된 roster (데이터가 거기 있다)
  const { data: promoted } = await sb
    .from('roster_students').select('id').eq('promoted_user_id', studentId);
  for (const r of (promoted || []) as Array<{ id: string }>) ids.add(r.id);

  // 넘어온 id 자체가 roster 면 승격된 user id 도 포함
  const { data: self } = await sb
    .from('roster_students').select('promoted_user_id').eq('id', studentId).maybeSingle();
  const p = (self as { promoted_user_id: string | null } | null)?.promoted_user_id;
  if (p) ids.add(p);

  return Array.from(ids);
}

/**
 * (시험지, 학생) 의 가장 최근 채점 세션.
 *
 * ★ session_type 을 못박지 않는다 — QR 세션은 BS/DD/PT/SC/WS/EX 어느 것이든 될 수 있고,
 *   "이 학생이 이 시험지를 쳤다"는 사실에는 종류가 상관없다.
 *   (옛 코드는 `EX` 로 못박아 진단 세션을 놓쳤다)
 */
export async function findGradingSession(
  sb: SupabaseClient,
  examId: string,
  studentId: string,
): Promise<GradingSession | null> {
  const ids = await resolveStudentIdentity(sb, studentId);

  const { data } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, student_id, completed_at, issued_at, ai_comment_json, teacher_comment_json')
    .eq('exam_id', examId)
    .in('student_id', ids)
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(1);

  const row = (data || [])[0] as {
    id: string; student_id: string;
    completed_at: string | null; issued_at: string | null;
    ai_comment_json: unknown | null; teacher_comment_json: unknown | null;
  } | undefined;
  if (!row) return null;

  return {
    id: row.id,
    studentId: row.student_id,
    completedAt: row.completed_at ?? row.issued_at,
    aiComment: row.ai_comment_json ?? null,
    teacherComment: row.teacher_comment_json ?? null,
  };
}
