// ============================================================================
// POST /api/sessions/[id]/complete
// 강사가 채점을 마무리하고 명시적으로 세션 완료 처리.
// - print_sessions.completed_at = NOW()
// - 트리거 sync_print_session_progress 가 누락된 환경 / 캐시 회피 안전망.
//
// 권한: ADMIN / TEACHER / TUTOR / ORG_ADMIN / super_admin — 자기 institute 학생 세션만.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  const allowedRoles = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];
  if (!user.role || (!allowedRoles.includes(user.role) && !scope.isSuperAdmin)) {
    return NextResponse.json({ error: 'Forbidden — 권한 없음' }, { status: 403 });
  }

  const { id: sessionId } = await params;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  // 세션 + 학생 institute 가드
  const { data: session, error: sErr } = await supabaseAdmin
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, student_id, completed_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });

  const { data: student } = await supabaseAdmin
    .from('users')
    .select('institute_id')
    .eq('id', (session as { student_id: string }).student_id)
    .maybeSingle();
  try {
    assertInstituteAccess(scope, (student as { institute_id?: string } | null)?.institute_id ?? null);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  const completedAt = new Date().toISOString();
  const { error: upErr } = await supabaseAdmin
    .schema('diagnostics' as never)
    .from('print_sessions')
    .update({ completed_at: completedAt })
    .eq('id', sessionId);

  if (upErr) {
    console.error('[sessions/complete] update error:', upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  console.log(`[sessions/complete] session=${sessionId} completed_at=${completedAt}`);
  return NextResponse.json({ ok: true, completed_at: completedAt });
}
