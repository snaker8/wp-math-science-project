// ============================================================================
// Class Enrollments API Route
// 반 등록 목록 조회 및 학생 초대
// ============================================================================

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{ classId: string }>;
}

// 초대 코드 생성 함수
function generateInvitationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// GET: 등록 목록 조회
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

    // 반 정보 및 권한 확인
    const { data: classData } = await supabase
      .from('classes')
      .select('tutor_id, institute_id')
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

    // 등록 목록 조회
    const { data: enrollments, error } = await supabase
      .from('class_enrollments')
      .select(`
        id,
        status,
        enrolled_at,
        invited_at,
        invitation_code,
        invitation_message,
        responded_at,
        notes,
        student:users!student_id(id, full_name, email, phone, grade)
      `)
      .eq('class_id', classId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ enrollments });
  } catch (error) {
    console.error('Enrollments GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: 학생 초대
export async function POST(request: NextRequest, { params }: RouteParams) {
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

    // 반 정보 및 권한 확인
    const { data: classData } = await supabase
      .from('classes')
      .select('tutor_id, institute_id, max_students')
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
    const { studentId, studentEmail, message } = body;

    // studentId 또는 studentEmail로 학생 찾기
    let targetStudentId = studentId;

    if (!targetStudentId && studentEmail) {
      const { data: studentData } = await supabase
        .from('users')
        .select('id, role')
        .eq('email', studentEmail)
        .single();

      if (!studentData) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }

      if (studentData.role !== 'STUDENT') {
        return NextResponse.json({ error: 'User is not a student' }, { status: 400 });
      }

      targetStudentId = studentData.id;
    }

    if (!targetStudentId) {
      return NextResponse.json({ error: 'Student ID or email is required' }, { status: 400 });
    }

    // 현재 등록된 학생 수 확인
    const { count: enrolledCount } = await supabase
      .from('class_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('status', 'ACCEPTED');

    if (enrolledCount && enrolledCount >= classData.max_students) {
      return NextResponse.json({ error: 'Class is full' }, { status: 400 });
    }

    // 이미 등록/초대된 학생인지 확인
    const { data: existingEnrollment } = await supabase
      .from('class_enrollments')
      .select('id, status')
      .eq('class_id', classId)
      .eq('student_id', targetStudentId)
      .single();

    if (existingEnrollment) {
      if (existingEnrollment.status === 'ACCEPTED') {
        return NextResponse.json({ error: 'Student is already enrolled' }, { status: 409 });
      }
      if (existingEnrollment.status === 'PENDING') {
        return NextResponse.json({ error: 'Invitation already sent' }, { status: 409 });
      }
    }

    // 초대 생성 또는 업데이트
    const invitationCode = generateInvitationCode();

    const { data: enrollment, error: enrollError } = await supabase
      .from('class_enrollments')
      .upsert({
        class_id: classId,
        student_id: targetStudentId,
        status: 'PENDING',
        invited_by: user.id,
        invited_at: new Date().toISOString(),
        invitation_message: message || null,
        invitation_code: invitationCode,
        responded_at: null,
      }, {
        onConflict: 'class_id,student_id',
      })
      .select(`
        id,
        status,
        invited_at,
        invitation_code,
        student:users!student_id(id, full_name, email)
      `)
      .single();

    if (enrollError) {
      return NextResponse.json({ error: enrollError.message }, { status: 500 });
    }

    return NextResponse.json({ enrollment }, { status: 201 });
  } catch (error) {
    console.error('Enrollments POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
