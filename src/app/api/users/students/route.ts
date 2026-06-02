// ============================================================================
// GET /api/users/students
//   현재 로그인한 강사·원장·관리자가 접근 가능한 학생 목록 조회.
//
// ★ Multi-Tenancy 격리 (CLAUDE.md #8) — institute-guard 적용:
//   super_admin  → 전체 학생
//   ORG_ADMIN    → 자기 학원(organization) 산하 모든 institute 의 학생
//   TEACHER/TUTOR/ADMIN(일반) → 자기 institute 의 학생만
//   STUDENT / PARENT → 접근 거부 (403)
//   (이전엔 role==='ADMIN' 이면 무필터 전체였음 → 다른 학원 학생 노출 누수. 제거.)
//
// 반환 스키마: { students: [{ id, name, grade, className, email }] }
// ============================================================================

import { NextResponse } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter } from '@/lib/security/institute-guard';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];

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

  // 학원 선택 — 스코프 내(super_admin=임의 / 그 외=accessibleInstituteIds 내)일 때만 honor
  const requested = new URL(request.url).searchParams.get('institute_id');
  const canUseRequested = !!requested && (scope.isSuperAdmin || (scope.accessibleInstituteIds ?? []).includes(requested));

  // ★ supabaseAdmin(RLS 우회) + 앱 레벨 institute 격리
  let query = sb
    .from('users')
    .select('*')
    .eq('role', 'STUDENT')
    .is('deleted_at', null); // soft delete 된 학생 제외
  if (canUseRequested) {
    query = query.eq('institute_id', requested); // 선택한 학원으로 좁힘
  } else {
    query = applyInstituteFilter(query, scope); // super_admin=전체 / ORG_ADMIN=학원 산하 / 일반=자기 institute
  }

  // 트랙 격리 (수학/과학) — active_subject_track 기준
  if (scope.activeTrack === 'science') {
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

  // 학생 소속 학원(institute) 이름 매핑 — super_admin/다중학원에서 "어디 학생인지" 구분용
  const instIds = Array.from(
    new Set((data || []).map((u: Record<string, unknown>) => u.institute_id as string | null).filter(Boolean)),
  ) as string[];
  const instMap = new Map<string, string>();
  if (instIds.length > 0) {
    const { data: insts } = await sb.from('institutes').select('id, name').in('id', instIds);
    (insts || []).forEach((i: Record<string, unknown>) => instMap.set(i.id as string, (i.name as string) || ''));
  }

  // 반(class) 파생 — users 에 컬럼 없음. class_enrollments(ACCEPTED) → classes.name.
  //   학생을 반에 등록하면 자동으로 반이 채워짐.
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
      if (sid && cname && !classByStudent.has(sid)) classByStudent.set(sid, cname); // 첫 ACCEPTED 반
    });
  }

  // 프론트 편의 shape (full_name / name 둘 다 지원)
  const students = (data || [])
    .map((u: Record<string, unknown>) => ({
      id: u.id as string,
      name:
        (u.full_name as string) ||
        (u.name as string) ||
        (u.email as string) ||
        '(이름 없음)',
      grade: gradeLabel(u.grade),
      className: classByStudent.get(u.id as string) || '',
      email: (u.email as string | null) || null,
      instituteId: (u.institute_id as string | null) || null,
      institute: u.institute_id ? (instMap.get(u.institute_id as string) || '') : '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  // 선택 가능한 학원 목록 (super_admin=전체 / 다중 institute 스코프=자기 학원들). 단일/일반은 빈 배열.
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
