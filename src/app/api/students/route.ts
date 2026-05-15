// ============================================================================
// /api/students  (직접 등록 — 반 없이도 가능)
// 강사·원장이 학생 정보(이름·연락처·학년·이메일?)를 직접 입력해 계정 발급.
// 반 배정은 옵션 (classId 전달 시 즉시 ACCEPTED enrollment).
// ============================================================================

import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { resolveInsertInstituteId } from '@/lib/security/institute-guard';
import { NextRequest, NextResponse } from 'next/server';

function randomToken(len: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function generateLocalEmail(): string {
  return `student-${randomToken(8).toLowerCase()}@local.suzag.com`;
}

function generatePassword(): string {
  return randomToken(8).toLowerCase() + Math.floor(Math.random() * 100);
}

// 학년 입력을 integer 로 정규화 — public.users.grade 컬럼이 integer 라
// 한글 라벨('중1','고1' 등) 또는 문자열 숫자가 들어오면 변환 필요.
// 매핑은 signup 페이지 select(value=7..12) 와 동일.
//   초1~6 = 1~6, 중1~3 = 7~9, 고1~3 = 10~12
const GRADE_LABEL_TO_INT: Record<string, number> = {
  '초1': 1, '초2': 2, '초3': 3, '초4': 4, '초5': 5, '초6': 6,
  '중1': 7, '중2': 8, '중3': 9,
  '고1': 10, '고2': 11, '고3': 12,
};
function normalizeGrade(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= 1 && raw <= 12 ? raw : null;
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) {
      const n = parseInt(s, 10);
      return n >= 1 && n <= 12 ? n : null;
    }
    if (GRADE_LABEL_TO_INT[s] != null) return GRADE_LABEL_TO_INT[s];
  }
  return null;
}

export async function POST(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  // 등록 권한: ADMIN/TEACHER/TUTOR/ORG_ADMIN
  const allowedRoles = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];
  if (!user.role || !allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden — 등록 권한 없음' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  // 입력 파싱
  const body = await request.json().catch(() => ({}));
  const fullName = String(body.fullName || '').trim();
  const phone = body.phone ? String(body.phone).trim() : null;
  const grade = normalizeGrade(body.grade);
  const providedEmail = body.email ? String(body.email).trim().toLowerCase() : '';
  const providedPassword = body.password ? String(body.password) : '';
  const classId = body.classId ? String(body.classId) : null; // 옵션

  if (!fullName) {
    return NextResponse.json({ error: '이름은 필수입니다' }, { status: 400 });
  }

  // institute_id 결정
  let instituteId: string;
  try {
    instituteId = resolveInsertInstituteId(scope);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  // 자격 증명 결정
  const email = providedEmail || generateLocalEmail();
  const password = providedPassword || generatePassword();
  const emailGenerated = !providedEmail;
  const passwordGenerated = !providedPassword;

  let studentId: string | null = null;
  let createdNew = false;

  // 기존 user 확인 (이메일 명시 시)
  if (providedEmail) {
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('email', providedEmail)
      .maybeSingle();
    if (existing) {
      if (existing.role !== 'STUDENT') {
        return NextResponse.json({ error: '해당 이메일은 학생 계정이 아닙니다' }, { status: 400 });
      }
      studentId = existing.id;
    }
  }

  // 신규 발급
  //   ★ user_metadata 에 institute_id 동봉 — handle_new_auth_user() 트리거가 이를 읽어
  //     public.users.institute_id 에 박음. 안 박으면 트리거 NULL fallback → users
  //     NOT NULL 제약 위반 ('Database error creating new user' 사고, 2026-05-15).
  if (!studentId) {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'STUDENT',
        institute_id: instituteId,
      },
    });
    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message || '학생 계정 생성 실패' },
        { status: 500 }
      );
    }
    studentId = created.user.id;
    createdNew = true;

    const { error: insertErr } = await supabaseAdmin.from('users').insert({
      id: studentId,
      email,
      full_name: fullName,
      phone,
      grade,
      role: 'STUDENT',
      institute_id: instituteId,
    });
    if (insertErr) {
      // public.users 실패 → auth.users orphan 정리
      await supabaseAdmin.auth.admin.deleteUser(studentId).catch(() => {});
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  // (옵션) 반 enrollment
  let enrolledClassId: string | null = null;
  if (classId) {
    // 반 존재 + scope 검증
    const { data: cls } = await supabaseAdmin
      .from('classes')
      .select('id, institute_id, max_students, tutor_id')
      .eq('id', classId)
      .maybeSingle();
    if (!cls) {
      return NextResponse.json({
        warning: '학생 등록은 완료되었으나 반을 찾을 수 없어 반 배정은 건너뜀',
        student: { id: studentId, email, fullName, createdNew },
      }, { status: 200 });
    }
    // 정원 체크
    const { count: enrolledCount } = await supabaseAdmin
      .from('class_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('status', 'ACCEPTED');
    if (enrolledCount && enrolledCount >= ((cls as { max_students: number }).max_students || 100)) {
      return NextResponse.json({
        warning: '학생 등록은 완료되었으나 반 정원 초과로 배정은 건너뜀',
        student: { id: studentId, email, fullName, createdNew },
      }, { status: 200 });
    }

    const { error: enrollErr } = await supabaseAdmin.from('class_enrollments').insert({
      class_id: classId,
      student_id: studentId,
      status: 'ACCEPTED',
      invited_by: user.id,
      invited_at: new Date().toISOString(),
      enrolled_at: new Date().toISOString(),
      responded_at: new Date().toISOString(),
    });
    if (!enrollErr) enrolledClassId = classId;
  }

  return NextResponse.json({
    student: {
      id: studentId,
      email,
      fullName,
      grade,
      phone,
      createdNew,
    },
    credentials: createdNew ? { email, password, emailGenerated, passwordGenerated } : null,
    enrolledClassId,
  });
}
