// ============================================================================
// Class Detail API Route — 반 상세 조회, 수정, 삭제
//
// 보안 가드 (2026-05-17 P0-3): institute-guard 적용
//   - requireAuthScope() 로 인증 + scope 획득
//   - classId 조회 후 assertInstituteAccess(scope, institute_id) 로 격리 검증
//   - supabaseAdmin 사용 (RLS 우회) + 앱 레벨 격리 가드
//   - 다른 학원 classId 알아도 접근 차단
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';

interface RouteParams {
  params: Promise<{ classId: string }>;
}

// GET: 반 상세 조회
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { classId } = await params;

  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const { data: classData, error: classError } = await supabaseAdmin
      .from('classes')
      .select(`
        *,
        tutor:users!tutor_id(id, full_name, email)
      `)
      .eq('id', classId)
      .is('deleted_at', null)
      .single();

    if (classError || !classData) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // ★ 격리 가드 — 다른 학원 반 접근 차단
    try {
      assertInstituteAccess(scope, (classData as { institute_id: string | null }).institute_id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: enrollments } = await supabaseAdmin
      .from('class_enrollments')
      .select(`
        id,
        status,
        enrolled_at,
        invited_at,
        invitation_code,
        student:users!student_id(id, full_name, email, grade)
      `)
      .eq('class_id', classId)
      .order('enrolled_at', { ascending: false });

    return NextResponse.json({
      class: classData,
      enrollments: enrollments || [],
    });
  } catch (error) {
    console.error('Class GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: 반 수정
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { classId } = await params;

  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const { data: classData } = await supabaseAdmin
      .from('classes')
      .select('tutor_id, institute_id')
      .eq('id', classId)
      .single();

    if (!classData) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // ★ 격리 가드 — 다른 학원 반 수정 차단
    try {
      assertInstituteAccess(scope, (classData as { institute_id: string | null }).institute_id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // tutor 본인 또는 ADMIN/ORG_ADMIN/super_admin 만 수정 가능
    const canEdit =
      classData.tutor_id === user.id ||
      user.role === 'ADMIN' ||
      user.role === 'ORG_ADMIN' ||
      scope.isSuperAdmin;
    if (!canEdit) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, subject, grade, maxStudents, schedule, isActive } = body;

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (subject !== undefined) updateData.subject = subject || null;
    if (grade !== undefined) updateData.grade = grade ? parseInt(grade) : null;
    if (maxStudents !== undefined) updateData.max_students = parseInt(maxStudents) || 30;
    if (schedule !== undefined) updateData.schedule = schedule;
    if (isActive !== undefined) updateData.is_active = isActive;

    const { data: updatedClass, error: updateError } = await supabaseAdmin
      .from('classes')
      .update(updateData)
      .eq('id', classId)
      .select()
      .single();

    if (updateError) {
      console.error('[classes/PUT] update error:', updateError.message);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    return NextResponse.json({ class: updatedClass });
  } catch (error) {
    console.error('Class PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: 반 삭제 (소프트 삭제)
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { classId } = await params;

  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const { data: classData } = await supabaseAdmin
      .from('classes')
      .select('tutor_id, institute_id')
      .eq('id', classId)
      .single();

    if (!classData) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // ★ 격리 가드 — 다른 학원 반 삭제 차단
    try {
      assertInstituteAccess(scope, (classData as { institute_id: string | null }).institute_id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const canDelete =
      classData.tutor_id === user.id ||
      user.role === 'ADMIN' ||
      user.role === 'ORG_ADMIN' ||
      scope.isSuperAdmin;
    if (!canDelete) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('classes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', classId);

    if (deleteError) {
      console.error('[classes/DELETE] delete error:', deleteError.message);
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Class DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
