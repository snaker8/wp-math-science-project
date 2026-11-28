// ============================================================================
// 학생 본인 세션 확인
// ----------------------------------------------------------------------------
// ★ assertStudentAccess 를 학생 API 에 쓰면 안 된다 — 학생 scope 는 「자기 학원」이라
//   같은 학원 다른 학생 세션도 통과한다. 학생은 「내 id(승격 전 명단 id 포함)」만.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveStudentIdentity } from '@/lib/diagnostics/find-session';

export interface OwnSession {
  id: string;
  student_id: string;
  exam_id: string;
  round_number: number;
  session_type: string;
  started_at: string | null;
  completed_at: string | null;
}

export async function loadOwnSession(
  sb: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<{ ok: true; session: OwnSession; myIds: string[] } | { ok: false; status: number; error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return { ok: false, status: 400, error: '잘못된 세션' };
  const { data, error } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, student_id, exam_id, round_number, session_type, started_at, completed_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 404, error: '세션을 찾을 수 없습니다' };
  const session = data as OwnSession;
  const myIds = await resolveStudentIdentity(sb, userId);
  if (!myIds.includes(session.student_id)) return { ok: false, status: 403, error: '내 과제가 아닙니다' };
  return { ok: true, session, myIds };
}
