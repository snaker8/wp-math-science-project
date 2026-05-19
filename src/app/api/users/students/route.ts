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
    .select('role, institute_id, active_subject_track')
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
    .eq('role', 'STUDENT')
    .is('deleted_at', null); // soft delete 된 학생은 목록에서 제외

  if (me.role !== 'ADMIN') {
    if (!me.institute_id) {
      return NextResponse.json({ students: [] });
    }
    query = query.eq('institute_id', me.institute_id);
  }

  // ★ 트랙 격리 (2026-05-19): 사용자 active_subject_track 기준으로
  //   subject_tracks 배열에 해당 트랙 포함된 학생만 반환.
  //   수학 트랙에서 등록한 학생은 과학에 안 보이고, 그 반대도 성립.
  //   active_subject_track 없거나 'math' 면 기본값. NULL subject_tracks 인
  //   기존 학생은 'math' 로 간주 (기존 운영 흐름 호환).
  const activeTrack = (me.active_subject_track as string | null) || 'math';
  if (activeTrack === 'science') {
    query = query.contains('subject_tracks', ['science']);
  } else {
    // 수학 트랙 — 'math' 포함 OR subject_tracks NULL (기존 미태깅 학생)
    query = query.or('subject_tracks.cs.{math},subject_tracks.is.null');
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
