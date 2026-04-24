// ============================================================================
// GET /api/users/students
//   현재 로그인한 강사·원장·관리자가 접근 가능한 학생 목록 조회.
//
// 역할별 동작:
//   ADMIN  — 전체 학생
//   TEACHER / TUTOR / ORG_ADMIN — 같은 institute_id 의 학생
//   STUDENT / PARENT — 접근 거부 (403)
//
// 반환 스키마:
//   [{ id, name, grade, className, email, ... }]
//
// ★ 이 엔드포인트는 prescription 페이지의 학생 드롭다운 실 데이터 연결용.
// ============================================================================

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: me, error: meErr } = await supabase
    .from('users')
    .select('role, institute_id')
    .eq('id', user.id)
    .single();

  if (meErr || !me) {
    return NextResponse.json({ error: 'User record not found' }, { status: 404 });
  }

  if (!['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'].includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // users 테이블 컬럼 이름은 full_name / name 둘 다 존재하는 코드베이스이므로
  // 안전하게 select '*' 로 받아 공통 필드만 추려낸다.
  let query = supabase
    .from('users')
    .select('*')
    .eq('role', 'STUDENT');

  if (me.role !== 'ADMIN') {
    if (!me.institute_id) {
      return NextResponse.json({ students: [] });
    }
    query = query.eq('institute_id', me.institute_id);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[users/students] query error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 프론트에서 편히 쓰도록 shape 정리 (full_name / name 둘 다 지원)
  const students = (data || [])
    .map((u: Record<string, unknown>) => ({
      id: u.id as string,
      name:
        (u.full_name as string) ||
        (u.name as string) ||
        (u.email as string) ||
        '(이름 없음)',
      grade: (u.grade as string | null) || '',
      className: (u.class_name as string | null) || (u.className as string | null) || '',
      email: (u.email as string | null) || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  return NextResponse.json({ students });
}
