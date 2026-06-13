// ============================================================================
// Classes API Route — 반 목록 조회 및 생성
//
// 보안 가드 (2026-05-17 P0-3): institute-guard 적용
//   - requireAuthScope() 로 인증 + scope 획득
//   - applyInstituteFilter() 로 자기 institute 만 SELECT
//   - resolveInsertInstituteId() 로 INSERT institute_id 결정
//   - 다른 학원 반 누설 차단 (RLS 의존 → 앱 레벨 격리)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter, resolveInsertInstituteId } from '@/lib/security/institute-guard';
import { resolveActiveInstitute } from '@/lib/security/active-institute';

// GET: 반 목록 조회
export async function GET() {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    let baseQuery = supabaseAdmin
      .from('classes')
      .select(`
        id,
        name,
        description,
        subject,
        grade,
        max_students,
        is_active,
        schedule,
        created_at,
        institute_id,
        tutor:users!tutor_id(id, full_name, email)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // ★ 격리 필터 — 자기 institute (또는 ORG_ADMIN: 학원 산하)
    baseQuery = applyInstituteFilter(baseQuery, scope);

    // ★ 활성 학원 핀 — "학원마다 들어가면" 그 학원 반만. super_admin/ORG_ADMIN 이 여러 학원을
    //   가질 때 전체가 섞이지 않게(학생목록 API 와 동일 규칙). 미선택(null)이면 기존 동작.
    const activeInstituteId = resolveActiveInstitute(scope);
    if (activeInstituteId) {
      baseQuery = baseQuery.eq('institute_id', activeInstituteId);
    }

    // ★ 권한별 가시성:
    //   - 관리자(super_admin / ADMIN / ORG_ADMIN): 학원 내 모든 반(다른 선생님이 만든 반 포함).
    //   - 일반 강사(TEACHER / TUTOR): 자기가 만든 반만.
    const isManager =
      scope.isSuperAdmin || user.role === 'ADMIN' || user.role === 'ORG_ADMIN';
    if (!isManager && (user.role === 'TEACHER' || user.role === 'TUTOR')) {
      baseQuery = baseQuery.eq('tutor_id', user.id);
    }

    const { data: classesRaw, error } = await baseQuery;

    if (error) {
      console.error('[classes/GET] query error:', error.message);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }
    const classRows = (classesRaw ?? []) as Array<{ id: string }>;

    // ★ 반별 등원/대기 인원 카운트 (서버 집계 — 다른 선생님 반도 RLS 우회해 정확히 셈).
    //   class_enrollments 를 한 번에 in() 조회 후 JS 집계. 1000행 한계 대비 range 페이지네이션.
    const enrolledCountById = new Map<string, number>();
    const pendingCountById = new Map<string, number>();
    const classIds = classRows.map((c) => c.id);
    if (classIds.length > 0) {
      for (let from = 0; ; from += 1000) {
        const { data: enr } = await supabaseAdmin
          .from('class_enrollments')
          .select('class_id, status')
          .in('class_id', classIds)
          .range(from, from + 999);
        const rows = (enr ?? []) as Array<{ class_id: string; status: string }>;
        for (const r of rows) {
          if (r.status === 'ACCEPTED') enrolledCountById.set(r.class_id, (enrolledCountById.get(r.class_id) || 0) + 1);
          else if (r.status === 'PENDING') pendingCountById.set(r.class_id, (pendingCountById.get(r.class_id) || 0) + 1);
        }
        if (rows.length < 1000) break;
      }
    }

    const classes = classRows.map((c) => ({
      ...c,
      enrolledCount: enrolledCountById.get(c.id) || 0,
      pendingCount: pendingCountById.get(c.id) || 0,
    }));

    return NextResponse.json({ classes });
  } catch (error) {
    console.error('Classes GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: 새 반 생성
export async function POST(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    // 권한: ADMIN, ORG_ADMIN, TEACHER, TUTOR, super_admin
    if (
      !scope.isSuperAdmin &&
      user.role !== 'ADMIN' &&
      user.role !== 'ORG_ADMIN' &&
      user.role !== 'TEACHER' &&
      user.role !== 'TUTOR'
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, subject, grade, maxStudents, schedule } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // ★ INSERT institute_id — scope 기반 결정 (자기 institute 또는 super_admin override)
    let instituteId: string | null;
    try {
      instituteId = resolveInsertInstituteId(scope, null);
    } catch (e) {
      return NextResponse.json({ error: 'Institute not assigned' }, { status: 400 });
    }
    if (!instituteId) {
      return NextResponse.json({ error: 'Institute not found' }, { status: 400 });
    }

    const { data: newClass, error: insertError } = await supabaseAdmin
      .from('classes')
      .insert({
        institute_id: instituteId,
        tutor_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        subject: subject || null,
        grade: grade ? parseInt(grade) : null,
        max_students: maxStudents ? parseInt(maxStudents) : 30,
        schedule: schedule || {},
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'Class name already exists' }, { status: 409 });
      }
      console.error('[classes/POST] insert error:', insertError.message);
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    }

    return NextResponse.json({ class: newClass }, { status: 201 });
  } catch (error) {
    console.error('Classes POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
