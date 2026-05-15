// ============================================================================
// /api/students  (직접 등록 — 반 없이도 가능)
// 강사·원장이 학생 정보(이름·연락처·학년·이메일?)를 직접 입력해 계정 발급.
// 반 배정은 옵션 (classId 전달 시 즉시 ACCEPTED enrollment).
// ============================================================================

import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { resolveInsertInstituteId } from '@/lib/security/institute-guard';
import { phoneToStudentEmail, STUDENT_INITIAL_PASSWORD } from '@/lib/students/phone-id';
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

// phoneToStudentEmail / STUDENT_INITIAL_PASSWORD 는 @/lib/students/phone-id 로 이동됨.

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

  // 자격 증명 결정 — 학생 ID = 전화번호 (숫자만 normalize)
  //   providedEmail 명시: 그대로 사용 (역호환 / 일반 강사 등록 시 사용)
  //   phone 명시:        phoneToStudentEmail 로 normalize → 학생 로그인 ID
  //   둘 다 없음:        랜덤 local email (fallback)
  let email: string;
  let emailGenerated = false;
  if (providedEmail) {
    email = providedEmail;
  } else if (phone) {
    const phoneEmail = phoneToStudentEmail(phone);
    if (!phoneEmail) {
      return NextResponse.json(
        { error: '전화번호 형식이 올바르지 않습니다 (예: 010-1234-5678)' },
        { status: 400 }
      );
    }
    email = phoneEmail;
    emailGenerated = true;
  } else {
    email = generateLocalEmail();
    emailGenerated = true;
  }

  // 비밀번호 — 학생은 초기 '123456', 강사 이메일 가입은 자동 생성
  //   학생 로그인 후 본인이 비밀번호 변경 (계정 설정 페이지)
  const password = providedPassword || (phone && !providedEmail ? STUDENT_INITIAL_PASSWORD : (randomToken(8).toLowerCase() + Math.floor(Math.random() * 100)));
  const passwordGenerated = !providedPassword;

  let studentId: string | null = null;
  let createdNew = false;

  // 기존 user 확인 — providedEmail 이든 자동 생성(phone/random) 이든 동일 검증.
  //   이전 코드는 providedEmail 만 검사 → phone 등록 시 이메일 중복(이미 가입된
  //   학생) 검사 누락 → createUser 단계에서 'already registered' 사고.
  //   (사용자가 같은 전화번호로 두 번 등록 시도 또는 다른 강사가 먼저 등록한 경우)
  {
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('email', email)
      .maybeSingle();
    if (existing) {
      if (existing.role !== 'STUDENT') {
        return NextResponse.json({
          error: phone && !providedEmail
            ? '해당 전화번호는 이미 다른 역할(강사·관리자) 계정으로 등록되어 있습니다'
            : '해당 이메일은 학생 계정이 아닙니다',
        }, { status: 400 });
      }
      studentId = existing.id;
      // 기존 학생 계정 재사용 — 신규 발급 스킵, 반 enrollment 만 진행 가능
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
      // supabase 의 'A user with this email address has already been registered'
      // 등을 학생 가입 맥락에서 한글 + '전화번호' 표현으로 변환.
      const raw = (createErr?.message || '').toLowerCase();
      const friendly = raw.includes('already')
        ? (phone && !providedEmail
            ? `이미 등록된 전화번호입니다 (${phone}). 기존 학생 계정을 확인해주세요.`
            : '이미 등록된 계정입니다. 기존 계정을 확인해주세요.')
        : (createErr?.message || '학생 계정 생성 실패');
      return NextResponse.json({ error: friendly }, { status: 500 });
    }
    studentId = created.user.id;
    createdNew = true;

    // ★ upsert (ignoreDuplicates) — handle_new_auth_user 트리거가 이미 INSERT
    //   했으면 PK 충돌 (users_pkey) 발생. 트리거 실패 시에만 본 INSERT 가 백업
    //   동작. ignoreDuplicates 로 충돌 무시.
    //   사고 (2026-05-15): 트리거 fix 후 본 INSERT 가 중복 → users_pkey 위반.
    const { error: insertErr } = await supabaseAdmin
      .from('users')
      .upsert({
        id: studentId,
        email,
        full_name: fullName,
        phone,
        grade,
        role: 'STUDENT',
        institute_id: instituteId,
      }, { onConflict: 'id', ignoreDuplicates: true });
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
