// ============================================================================
// POST /api/students/[id]/reset-password
//   학생 비밀번호를 초기값 '123456' 으로 재설정.
//   강사가 학생에게 직접 전달, 학생이 로그인 후 본인이 변경.
//
// 권한: ADMIN / TEACHER / TUTOR / ORG_ADMIN / super_admin — 자기 institute 학생만.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import { STUDENT_INITIAL_PASSWORD } from '@/lib/students/phone-id';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  const allowedRoles = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];
  if (!user.role || !allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden — 권한 없음' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { studentId } = await params;

  // 학생 institute 검증
  const { data: student, error: stErr } = await supabaseAdmin
    .from('users')
    .select('id, role, institute_id, email')
    .eq('id', studentId)
    .maybeSingle();
  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });
  if (!student) return NextResponse.json({ error: '학생을 찾을 수 없습니다' }, { status: 404 });
  if (student.role !== 'STUDENT') {
    return NextResponse.json({ error: '학생 계정이 아닙니다' }, { status: 400 });
  }

  try {
    assertInstituteAccess(scope, student.institute_id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  // auth.users 비밀번호 갱신
  const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(studentId, {
    password: STUDENT_INITIAL_PASSWORD,
  });
  if (pwErr) {
    return NextResponse.json({ error: pwErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    password: STUDENT_INITIAL_PASSWORD,
  });
}
