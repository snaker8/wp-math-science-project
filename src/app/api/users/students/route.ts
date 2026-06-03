// ============================================================================
// GET /api/users/students
//   현재 로그인한 강사·원장·관리자가 접근 가능한 학생 목록 조회.
//
// ★ Multi-Tenancy 격리 (CLAUDE.md #8) — institute-guard 적용:
//   super_admin  → 전체 학생
//   ORG_ADMIN    → 자기 학원(organization) 산하 모든 institute 의 학생
//   TEACHER/TUTOR/ADMIN(일반) → 자기 institute 의 학생만
//   STUDENT / PARENT → 접근 거부 (403)
//   (이전엔 role==='ADMIN' 이면 무필터 전체였음 → 다른 학원 학생 노출 누수. applyInstituteFilter 로 제거.)
//
// institute 선택 우선순위: ?institute_id=(스코프 내, 출제 모달) > activeInstitute(쿠키) > applyInstituteFilter(기본)
//
// 데이터 소스 두 갈래 (2026-05-29 통합):
//   - users (role=STUDENT): auth 가입된 실 학생 — source: 'user'
//   - roster_students: 엑셀 일괄 채점 시 자동등록된 명단 학생 — source: 'roster'
//     promoted_user_id 채워진 roster 는 users 와 중복이라 제외.
//
// 반환 스키마:
//   { students: [{ id, name, grade, className, email, phone, instituteId, institute, source }], institutes }
// ============================================================================

import { NextResponse } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter } from '@/lib/security/institute-guard';
import { resolveActiveInstitute } from '@/lib/security/active-institute';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];

interface StudentRow {
  id: string;
  name: string;
  grade: string;
  school: string | null;
  className: string;
  email: string | null;
  phone: string | null;
  instituteId: string | null;
  institute: string;
  source: 'user' | 'roster';
}

// users.grade 는 integer (1~6=초, 7~9=중1~3, 10~12=고1~3) → 한국 학년 라벨로 변환
function gradeLabel(g: unknown): string {
  const n = typeof g === 'number' ? g : parseInt(String(g ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1 && n <= 6) return `초${n}`;
  if (n >= 7 && n <= 9) return `중${n - 6}`;
  if (n >= 10 && n <= 12) return `고${n - 9}`;
  return String(n);
}

export async function GET(request: Request) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  // 학생/학부모는 학생 목록 접근 불가
  if (!scope.isSuperAdmin && !ALLOWED_ROLES.includes(scope.role || '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  // institute 선택 — ?institute_id=(스코프 내) > activeInstitute(쿠키) > 기본(applyInstituteFilter)
  const requested = new URL(request.url).searchParams.get('institute_id');
  const canUseRequested = !!requested && (scope.isSuperAdmin || (scope.accessibleInstituteIds ?? []).includes(requested));
  const activeInstituteId = resolveActiveInstitute(scope);
  const pinnedInstitute: string | null = canUseRequested ? requested : (activeInstituteId || null);

  // ── 1) users (실 학생) ──
  let query = sb
    .from('users')
    .select('*')
    .eq('role', 'STUDENT')
    .is('deleted_at', null); // soft delete 제외
  if (pinnedInstitute) {
    query = query.eq('institute_id', pinnedInstitute); // 선택/활성 학원으로 좁힘
  } else {
    query = applyInstituteFilter(query, scope); // super_admin=전체 / ORG_ADMIN=학원 산하 / 일반=자기 institute
  }
  // 트랙 격리 (수학/과학) — active_subject_track 기준
  if (scope.activeTrack === 'science') {
    query = query.contains('subject_tracks', ['science']);
  } else {
    query = query.or('subject_tracks.cs.{math},subject_tracks.is.null');
  }

  const { data, error } = await query;
  if (error) {
    console.error('[users/students] query error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 반(class) 파생 — users 에 컬럼 없음. class_enrollments(ACCEPTED) → classes.name.
  const studentIds = (data || []).map((u: Record<string, unknown>) => u.id as string);
  const classByStudent = new Map<string, string>();
  if (studentIds.length > 0) {
    const { data: enr } = await sb
      .from('class_enrollments')
      .select('student_id, class_id')
      .in('student_id', studentIds)
      .eq('status', 'ACCEPTED');
    const classIds = Array.from(new Set((enr || []).map((e: Record<string, unknown>) => e.class_id as string).filter(Boolean)));
    const classNameById = new Map<string, string>();
    if (classIds.length > 0) {
      const { data: cls } = await sb.from('classes').select('id, name').in('id', classIds);
      (cls || []).forEach((c: Record<string, unknown>) => classNameById.set(c.id as string, (c.name as string) || ''));
    }
    (enr || []).forEach((e: Record<string, unknown>) => {
      const sid = e.student_id as string;
      const cname = classNameById.get(e.class_id as string) || '';
      if (sid && cname && !classByStudent.has(sid)) classByStudent.set(sid, cname);
    });
  }

  const userStudents: StudentRow[] = (data || []).map((u: Record<string, unknown>) => ({
    id: u.id as string,
    name: (u.full_name as string) || (u.name as string) || (u.email as string) || '(이름 없음)',
    grade: gradeLabel(u.grade),
    school: (u.school as string | null) || null,
    className: classByStudent.get(u.id as string) || '',
    email: (u.email as string | null) || null,
    phone: (u.phone as string | null) || null, // 학생 정보 수정(전화번호) 편집 폼 프리필용
    instituteId: (u.institute_id as string | null) || null,
    institute: '', // 아래에서 institute 이름 일괄 매핑
    source: 'user',
  }));
  const userIdSet = new Set(userStudents.map((s) => s.id));

  // ── 2) roster_students (엑셀 일괄 채점 자동등록 명단) 병합 ──
  //   promoted_user_id 채워진 roster 는 users 와 중복이라 제외. institute 격리 동일.
  let rosterStudents: StudentRow[] = [];
  {
    let rosterQuery = sb
      .from('roster_students')
      .select('id, full_name, grade, class_label, promoted_user_id, institute_id, school');
    if (pinnedInstitute) {
      rosterQuery = rosterQuery.eq('institute_id', pinnedInstitute);
    } else {
      rosterQuery = applyInstituteFilter(rosterQuery, scope);
    }
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
          grade: gradeLabel(r.grade),
          school: (r.school as string | null) || null,
          className: (r.class_label as string | null) || '',
          email: null,
          phone: null,
          instituteId: (r.institute_id as string | null) || null,
          institute: '',
          source: 'roster' as const,
        }));
    }
  }

  // ── institute 이름 일괄 매핑 (user + roster 양쪽) — "어디 학생인지" 구분 ──
  const allInstIds = Array.from(new Set(
    [...userStudents, ...rosterStudents].map((s) => s.instituteId).filter(Boolean),
  )) as string[];
  if (allInstIds.length > 0) {
    const { data: insts } = await sb.from('institutes').select('id, name').in('id', allInstIds);
    const instMap = new Map<string, string>(
      (insts || []).map((i: Record<string, unknown>) => [i.id as string, (i.name as string) || '']),
    );
    for (const s of userStudents) s.institute = s.instituteId ? (instMap.get(s.instituteId) || '') : '';
    for (const s of rosterStudents) s.institute = s.instituteId ? (instMap.get(s.instituteId) || '') : '';
  }

  const students = [...userStudents, ...rosterStudents].sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  // ── 선택 가능한 학원 목록 (super_admin=전체 / 다중 institute 스코프=자기 학원들) ──
  let institutes: Array<{ id: string; name: string }> = [];
  if (scope.isSuperAdmin) {
    const { data: all } = await sb.from('institutes').select('id, name').order('name');
    institutes = (all || []) as Array<{ id: string; name: string }>;
  } else if ((scope.accessibleInstituteIds?.length ?? 0) > 1) {
    const { data: mine } = await sb
      .from('institutes')
      .select('id, name')
      .in('id', scope.accessibleInstituteIds as string[])
      .order('name');
    institutes = (mine || []) as Array<{ id: string; name: string }>;
  }

  return NextResponse.json({ students, institutes });
}
