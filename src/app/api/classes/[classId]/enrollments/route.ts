// ============================================================================
// Class Enrollments API Route — 반 등록 목록 조회 및 학생 초대
//
// 보안 가드 (2026-05-17 P0-3): institute-guard 적용
//   - requireAuthScope() + classId 격리 검증
//   - 초대 시 학생도 같은 institute 내인지 검증 (다른 학원 학생 ID 변조 차단)
//   - supabaseAdmin 사용 (RLS 우회) + 앱 레벨 격리 가드
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';

interface RouteParams {
  params: Promise<{ classId: string }>;
}

// 초대 코드 생성
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

    // ★ 격리 가드 — 다른 학원 반 enrollments 노출 차단
    try {
      assertInstituteAccess(scope, (classData as { institute_id: string | null }).institute_id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // tutor 본인 또는 ADMIN/ORG_ADMIN/super_admin 만
    const canView =
      classData.tutor_id === user.id ||
      user.role === 'ADMIN' ||
      user.role === 'ORG_ADMIN' ||
      scope.isSuperAdmin;
    if (!canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: enrollments, error } = await supabaseAdmin
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
      console.error('[enrollments/GET] query error:', error.message);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
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

  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const { data: classData } = await supabaseAdmin
      .from('classes')
      .select('tutor_id, institute_id, max_students')
      .eq('id', classId)
      .single();

    if (!classData) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // ★ 격리 가드 — 다른 학원 반에 학생 등록 시도 차단
    try {
      assertInstituteAccess(scope, (classData as { institute_id: string | null }).institute_id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const canInvite =
      classData.tutor_id === user.id ||
      user.role === 'ADMIN' ||
      user.role === 'ORG_ADMIN' ||
      scope.isSuperAdmin;
    if (!canInvite) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { studentId, studentEmail, message, direct } = body;
    // direct=true → 초대(PENDING+코드) 대신 즉시 ACCEPTED 배정 (학원장이 가입 학생을 반에 직접 추가).
    //   기본값 false — 기존 초대 플로우 동작 불변.

    // studentId 또는 studentEmail 로 학생 찾기
    let targetStudentId: string | undefined = studentId;
    let targetStudentInstituteId: string | null = null;

    if (!targetStudentId && studentEmail) {
      const { data: studentData } = await supabaseAdmin
        .from('users')
        .select('id, role, institute_id')
        .eq('email', studentEmail)
        .single();

      if (!studentData) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }
      if (studentData.role !== 'STUDENT') {
        return NextResponse.json({ error: 'User is not a student' }, { status: 400 });
      }
      targetStudentId = studentData.id;
      targetStudentInstituteId = studentData.institute_id;
    } else if (targetStudentId) {
      // studentId 입력 — institute_id 검증
      const { data: studentData } = await supabaseAdmin
        .from('users')
        .select('id, role, institute_id')
        .eq('id', targetStudentId)
        .single();
      if (!studentData) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }
      if (studentData.role !== 'STUDENT') {
        return NextResponse.json({ error: 'User is not a student' }, { status: 400 });
      }
      targetStudentInstituteId = studentData.institute_id;
    }

    if (!targetStudentId) {
      return NextResponse.json({ error: 'Student ID or email is required' }, { status: 400 });
    }

    // ★ 격리 검증 — 다른 institute 학생을 자기 반에 등록 시도 차단
    //   (super_admin / ORG_ADMIN 산하 institute 는 통과 — 같은 학원 산하 센터끼리 이동 가능)
    if (
      targetStudentInstituteId &&
      classData.institute_id &&
      targetStudentInstituteId !== classData.institute_id
    ) {
      // super_admin / ORG_ADMIN 의 산하 institute 인지 추가 확인
      if (
        !scope.isSuperAdmin &&
        !(scope.accessibleInstituteIds && scope.accessibleInstituteIds.includes(targetStudentInstituteId))
      ) {
        return NextResponse.json({ error: 'Student belongs to different institute' }, { status: 403 });
      }
    }

    // 현재 등록 학생 수
    const { count: enrolledCount } = await supabaseAdmin
      .from('class_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('status', 'ACCEPTED');

    if (enrolledCount && enrolledCount >= classData.max_students) {
      return NextResponse.json({ error: 'Class is full' }, { status: 400 });
    }

    // 이미 등록/초대된 학생인지
    const { data: existingEnrollment } = await supabaseAdmin
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

    const { data: enrollment, error: enrollError } = await supabaseAdmin
      .from('class_enrollments')
      .upsert(
        direct
          ? {
              class_id: classId,
              student_id: targetStudentId,
              status: 'ACCEPTED',
              invited_by: user.id,
              invited_at: new Date().toISOString(),
              enrolled_at: new Date().toISOString(),
              invitation_message: message || null,
              invitation_code: null,
              responded_at: new Date().toISOString(),
            }
          : {
              class_id: classId,
              student_id: targetStudentId,
              status: 'PENDING',
              invited_by: user.id,
              invited_at: new Date().toISOString(),
              invitation_message: message || null,
              invitation_code: generateInvitationCode(),
              responded_at: null,
            },
        { onConflict: 'class_id,student_id' }
      )
      .select(
        `
        id,
        status,
        invited_at,
        invitation_code,
        student:users!student_id(id, full_name, email)
      `
      )
      .single();

    if (enrollError) {
      console.error('[enrollments/POST] enroll error:', enrollError.message);
      return NextResponse.json({ error: 'Enrollment failed' }, { status: 500 });
    }

    return NextResponse.json({ enrollment }, { status: 201 });
  } catch (error) {
    console.error('Enrollments POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
