// ============================================================================
// Classes API Route
// 반 목록 조회 및 생성
// ============================================================================

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// GET: 반 목록 조회
export async function GET() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 사용자 역할 확인
    const { data: userData } = await supabase
      .from('users')
      .select('role, institute_id')
      .eq('id', user.id)
      .single();

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let query = supabase
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
        tutor:users!tutor_id(id, full_name, email)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // 역할에 따라 필터링
    if (['TEACHER', 'TUTOR'].includes(userData.role)) {
      // 강사는 자신의 반만
      query = query.eq('tutor_id', user.id);
    } else if (userData.role !== 'ADMIN') {
      // 학생/학부모는 같은 학원 내 반만
      query = query.eq('institute_id', userData.institute_id);
    }

    const { data: classes, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ classes });
  } catch (error) {
    console.error('Classes GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: 새 반 생성
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 사용자 역할 확인 (ADMIN, TEACHER, TUTOR만 생성 가능)
    const { data: userData } = await supabase
      .from('users')
      .select('role, institute_id')
      .eq('id', user.id)
      .single();

    if (!userData || !['ADMIN', 'TEACHER', 'TUTOR'].includes(userData.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, subject, grade, maxStudents, schedule } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!userData.institute_id) {
      return NextResponse.json({ error: 'Institute not found' }, { status: 400 });
    }

    const { data: newClass, error: insertError } = await supabase
      .from('classes')
      .insert({
        institute_id: userData.institute_id,
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
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ class: newClass }, { status: 201 });
  } catch (error) {
    console.error('Classes POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
