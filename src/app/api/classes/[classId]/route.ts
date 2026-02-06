// ============================================================================
// Class Detail API Route
// 반 상세 조회, 수정, 삭제
// ============================================================================

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{ classId: string }>;
}

// GET: 반 상세 조회
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { classId } = await params;
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 반 조회
    const { data: classData, error: classError } = await supabase
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

    // 등록된 학생 목록
    const { data: enrollments } = await supabase
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
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 반 소유자 확인
    const { data: classData } = await supabase
      .from('classes')
      .select('tutor_id')
      .eq('id', classId)
      .single();

    if (!classData) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // 사용자 역할 확인
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (classData.tutor_id !== user.id && userData?.role !== 'ADMIN') {
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

    const { data: updatedClass, error: updateError } = await supabase
      .from('classes')
      .update(updateData)
      .eq('id', classId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
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
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 반 소유자 확인
    const { data: classData } = await supabase
      .from('classes')
      .select('tutor_id')
      .eq('id', classId)
      .single();

    if (!classData) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // 사용자 역할 확인
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (classData.tutor_id !== user.id && userData?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 소프트 삭제
    const { error: deleteError } = await supabase
      .from('classes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', classId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Class DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
