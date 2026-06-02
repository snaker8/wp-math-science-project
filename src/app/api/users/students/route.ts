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

  // 프론트 편의 shape (full_name / name 둘 다 지원)
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
