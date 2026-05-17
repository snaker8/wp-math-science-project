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

    // 강사는 자기 반만 추가 필터링 (super_admin / ADMIN / ORG_ADMIN 제외)
    if (
      !scope.isSuperAdmin &&
      user.role !== 'ADMIN' &&
      user.role !== 'ORG_ADMIN' &&
      (user.role === 'TEACHER' || user.role === 'TUTOR')
    ) {
      baseQuery = baseQuery.eq('tutor_id', user.id);
    }

    const { data: classes, error } = await baseQuery;

    if (error) {
      console.error('[classes/GET] query error:', error.message);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

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
