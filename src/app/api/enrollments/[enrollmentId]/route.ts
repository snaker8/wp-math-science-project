// ============================================================================
// Enrollment Detail API Route
// 등록 상세 조회, 수정 (수락/거절), 삭제
// ============================================================================

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{ enrollmentId: string }>;
}

// GET: 등록 상세 조회
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { enrollmentId } = await params;
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: enrollment, error } = await supabase
      .from('class_enrollments')
      .select(`
        *,
        class:classes(id, name, subject, tutor_id),
        student:users!student_id(id, full_name, email, grade)
      `)
      .eq('id', enrollmentId)
      .single();

    if (error || !enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
    }

    return NextResponse.json({ enrollment });
  } catch (error) {
    console.error('Enrollment GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: 등록 상태 업데이트 (수락/거절)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { enrollmentId } = await params;
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 등록 정보 조회
    const { data: enrollment } = await supabase
      .from('class_enrollments')
      .select(`
        *,
        class:classes(tutor_id)
      `)
      .eq('id', enrollmentId)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
    }

    const body = await request.json();
    const { status, notes, rejectionReason } = body;

    // 권한 확인
    // 학생: 자신의 초대에 대해 ACCEPTED/REJECTED로 변경 가능
    // 강사/관리자: 어떤 상태로든 변경 가능
    const isStudent = enrollment.student_id === user.id;
    const isTutor = enrollment.class?.tutor_id === user.id;

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = userData?.role === 'ADMIN';

    if (!isStudent && !isTutor && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 학생은 PENDING -> ACCEPTED/REJECTED만 가능
    if (isStudent && !isTutor && !isAdmin) {
      if (enrollment.status !== 'PENDING') {
        return NextResponse.json({ error: 'Cannot change enrollment status' }, { status: 400 });
      }
      if (!['ACCEPTED', 'REJECTED'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = {};

    if (status) {
      updateData.status = status;

      if (status === 'ACCEPTED') {
        updateData.enrolled_at = new Date().toISOString();
        updateData.responded_at = new Date().toISOString();
      } else if (['REJECTED', 'WITHDRAWN'].includes(status)) {
        updateData.responded_at = new Date().toISOString();
        if (rejectionReason) {
          updateData.rejection_reason = rejectionReason;
        }
      }
    }

    if (notes !== undefined && (isTutor || isAdmin)) {
      updateData.notes = notes;
    }

    const { data: updatedEnrollment, error: updateError } = await supabase
      .from('class_enrollments')
      .update(updateData)
      .eq('id', enrollmentId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ enrollment: updatedEnrollment });
  } catch (error) {
    console.error('Enrollment PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: 등록 삭제 (강사만)
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { enrollmentId } = await params;
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 등록 정보 조회
    const { data: enrollment } = await supabase
      .from('class_enrollments')
      .select(`
        *,
        class:classes(tutor_id)
      `)
      .eq('id', enrollmentId)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
    }

    // 권한 확인 (강사 또는 관리자)
    const isTutor = enrollment.class?.tutor_id === user.id;

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = userData?.role === 'ADMIN';

    if (!isTutor && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error: deleteError } = await supabase
      .from('class_enrollments')
      .delete()
      .eq('id', enrollmentId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Enrollment DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
