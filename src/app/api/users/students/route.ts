// ============================================================================
// GET /api/users/students
//   현재 로그인한 강사·원장·관리자가 접근 가능한 학생 목록 조회.
//
// 역할별 동작:
//   ADMIN  — 전체 학생
//   TEACHER / TUTOR / ORG_ADMIN — 같은 institute_id 의 학생
//   STUDENT / PARENT — 접근 거부 (403)
//
// 데이터 소스 두 갈래 (2026-05-29 통합):
//   - users (role=STUDENT): auth 가입된 실 학생 — source: 'user'
//   - roster_students: 엑셀 일괄 채점 시 자동등록된 명단 학생 — source: 'roster'
//     promoted_user_id 채워진 roster 는 users 와 중복이라 제외.
//
// 반환 스키마:
//   { students: [{ id, name, grade, className, email, source }] }
//
// ★ 이 엔드포인트는 prescription / tutor analytics 페이지의 학생 드롭다운
//   실 데이터 연결용.
// ============================================================================

import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { resolveActiveInstitute } from '@/lib/security/active-institute';

export const dynamic = 'force-dynamic';

interface StudentRow {
  id: string;
  name: string;
  grade: string;
  className: string;
  email: string | null;
  source: 'user' | 'roster';
}

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

  // 활성 센터 우선 — 쿠키로 박힌 활성 institute 가 있으면 그걸 사용
  // 그 외엔 기존 동작 (ADMIN=모든 학생, 일반 강사=본인 institute)
  const scopeAuth = await requireAuthScope();
  const activeInstituteId = scopeAuth.ok
    ? resolveActiveInstitute(scopeAuth.data.scope)
    : null;
  if (activeInstituteId) {
    query = query.eq('institute_id', activeInstituteId);
  } else if (me.role !== 'ADMIN') {
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
  const userStudents: StudentRow[] = (data || []).map((u: Record<string, unknown>) => ({
    id: u.id as string,
    name:
      (u.full_name as string) ||
      (u.name as string) ||
      (u.email as string) ||
      '(이름 없음)',
    grade: (u.grade as string | null) || '',
    className: (u.class_name as string | null) || (u.className as string | null) || '',
    email: (u.email as string | null) || null,
    source: 'user',
  }));
  const userIdSet = new Set(userStudents.map((s) => s.id));

  // ──────────────────────────────────────────────────────────────────────
  // 자동등록 학생 (roster_students) 병합
  //
  // 엑셀 일괄 채점에서 만든 명단 학생을 학습분석 드롭다운에서도 보이게.
  // 데이터 모델은 분리(diagnostics.sessions vs print_sessions)되어 있어서
  // analytics 엔드포인트에서 source 별로 다르게 집계.
  //
  // 중복 제거 — promoted_user_id 가 채워진 roster 는 이미 users 에 있는
  // 학생과 머지된 상태라 users 측에 포함되어 있으면 skip.
  //
  // institute 필터: 활성 센터 우선, 없으면 본인 institute (ADMIN 은 전체).
  // 트랙: roster_students 에 subject_tracks 컬럼 없으므로 트랙 격리 미적용
  //       (현 단계 — 추후 컬럼 추가 시 동일 패턴 적용 가능).
  // ──────────────────────────────────────────────────────────────────────
  let rosterStudents: StudentRow[] = [];
  if (supabaseAdmin) {
    let rosterQuery = supabaseAdmin
      .from('roster_students')
      .select('id, full_name, grade, class_label, promoted_user_id, institute_id');
    if (activeInstituteId) {
      rosterQuery = rosterQuery.eq('institute_id', activeInstituteId);
    } else if (me.role !== 'ADMIN' && me.institute_id) {
      rosterQuery = rosterQuery.eq('institute_id', me.institute_id);
    } else if (me.role !== 'ADMIN') {
      // 활성 institute · 본인 institute 둘 다 없는 비-ADMIN — 빈 결과
      rosterQuery = rosterQuery.eq(
        'institute_id',
        '00000000-0000-0000-0000-000000000000'
      );
    }
    // ADMIN + 활성 institute 없음 → institute 필터 없음 (모든 roster)

    const { data: rosterData, error: rosterErr } = await rosterQuery;
    if (rosterErr) {
      console.warn('[users/students] roster_students 조회 실패:', rosterErr.message);
    } else {
      rosterStudents = (rosterData || [])
        .filter((r: Record<string, unknown>) => {
          const promoted = r.promoted_user_id as string | null;
          return !promoted || !userIdSet.has(promoted);
        })
        .map((r: Record<string, unknown>) => ({
          id: r.id as string,
          name: (r.full_name as string) || '(이름 없음)',
          grade:
            typeof r.grade === 'number'
              ? String(r.grade)
              : ((r.grade as string | null) || ''),
          className: (r.class_label as string | null) || '',
          email: null,
          source: 'roster' as const,
        }));
    }
  }

  const students = [...userStudents, ...rosterStudents].sort((a, b) =>
    a.name.localeCompare(b.name, 'ko')
  );

  return NextResponse.json({ students });
}
