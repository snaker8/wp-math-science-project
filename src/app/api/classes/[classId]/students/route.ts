// ============================================================================
// /api/classes/[classId]/students  (option A — 학원장 직접 등록)
// 강사가 학생 정보(이름·연락처·학년·이메일?)를 직접 입력해 계정 발급 + 반 ACCEPTED 등록.
// 이메일/비번 미입력 시 자동 생성, 응답에 자격증명 포함 (강사가 학생에게 전달).
// ============================================================================

import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{ classId: string }>;
}

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
  // 영문 + 숫자 8자리 (학원장이 학생에게 전달하기 쉬운 길이)
  return randomToken(8).toLowerCase() + Math.floor(Math.random() * 100);
}

// 학년 입력을 integer 로 정규화 — public.users.grade 가 integer 라
// 한글 라벨('중1','고1' 등) 또는 숫자 문자열이 그대로 들어가면
// "invalid input syntax for type integer" 사고. (/api/students 와 동일 규칙)
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

// POST: 학생 직접 등록 + 반 ACCEPTED enrollment
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { classId } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase || !supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  // 1) 권한
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: cls } = await supabase
    .from('classes')
    .select('id, tutor_id, institute_id, max_students')
    .eq('id', classId)
    .maybeSingle();
  if (!cls) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  }

  const { data: tutorRow } = await supabase
    .from('users')
    .select('role, institute_id')
    .eq('id', user.id)
    .maybeSingle();
  if (cls.tutor_id !== user.id && tutorRow?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 2) 입력 파싱
  const body = await request.json();
  const fullName = String(body.fullName || '').trim();
  const phone = body.phone ? String(body.phone).trim() : null;
  const grade = normalizeGrade(body.grade); // 한글 라벨/숫자 → integer (NULL 허용)
  const providedEmail = body.email ? String(body.email).trim().toLowerCase() : '';
  const providedPassword = body.password ? String(body.password) : '';
  const note = body.note ? String(body.note).trim() : null;

  if (!fullName) {
    return NextResponse.json({ error: '이름은 필수입니다' }, { status: 400 });
  }

  // 3) 정원 체크
  const { count: enrolledCount } = await supabaseAdmin
    .from('class_enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('class_id', classId)
    .eq('status', 'ACCEPTED');
  if (enrolledCount && enrolledCount >= (cls.max_students || 100)) {
    return NextResponse.json({ error: '반 정원이 가득 찼습니다' }, { status: 400 });
  }

  // 4) 학생 user 찾기 또는 새로 발급
  const email = providedEmail || generateLocalEmail();
  const password = providedPassword || generatePassword();
  const emailGenerated = !providedEmail;
  const passwordGenerated = !providedPassword;

  let studentId: string | null = null;
  let createdNew = false;

  // 4a) 이메일 입력했는데 이미 user 존재하는지 확인 (재등록 시나리오)
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

  // 4b) 신규 발급
  if (!studentId) {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'STUDENT',
      },
    });
    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message || '학생 계정 생성 실패' },
        { status: 500 },
      );
    }
    studentId = created.user.id;
    createdNew = true;

    // public.users 동기화 — institute_id 는 tutor 기준
    const instituteId = tutorRow?.institute_id || cls.institute_id || null;
    // ★ upsert(onConflict id) — auth.admin.createUser 시 handle_new_auth_user
    //   트리거가 이미 public.users 행을 INSERT 함. 직접 .insert 면 users_pkey 충돌
    //   ('duplicate key value violates unique constraint "users_pkey"' 사고).
    //   트리거 행은 institute_id/grade/phone 이 비어 있으므로 ignoreDuplicates 대신
    //   UPDATE(기본)로 올바른 값 덮어쓰기. (/api/students 와 동일 취지)
    const { error: insertErr } = await supabaseAdmin.from('users').upsert({
      id: studentId,
      email,
      full_name: fullName,
      phone,
      grade,
      role: 'STUDENT',
      institute_id: instituteId,
    }, { onConflict: 'id' });
    if (insertErr) {
      // public.users 실패 → auth.users orphan 정리
      await supabaseAdmin.auth.admin.deleteUser(studentId).catch(() => {});
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  // 5) 이미 등록된 학생인지 확인
  const { data: existingEnroll } = await supabaseAdmin
    .from('class_enrollments')
    .select('id, status')
    .eq('class_id', classId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (existingEnroll && existingEnroll.status === 'ACCEPTED') {
    return NextResponse.json({ error: '이미 이 반에 등록된 학생입니다' }, { status: 409 });
  }

  // 6) 즉시 ACCEPTED 등록 (option A — 학원장 직접 등록은 초대 흐름 건너뜀)
  const enrollPayload = {
    class_id: classId,
    student_id: studentId,
    status: 'ACCEPTED' as const,
    invited_by: user.id,
    invited_at: new Date().toISOString(),
    enrolled_at: new Date().toISOString(),
    responded_at: new Date().toISOString(),
    notes: note,
  };
  const { error: enrollErr } = existingEnroll
    ? await supabaseAdmin
        .from('class_enrollments')
        .update(enrollPayload)
        .eq('id', existingEnroll.id)
    : await supabaseAdmin.from('class_enrollments').insert(enrollPayload);
  if (enrollErr) {
    return NextResponse.json({ error: enrollErr.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      student: {
        id: studentId,
        fullName,
        email,
        phone,
        grade,
        createdNew,
      },
      // 신규 발급 시에만 자동 생성된 자격증명 반환 — 강사가 학생에게 전달
      credentials: createdNew
        ? {
            email,
            password,
            emailGenerated,
            passwordGenerated,
          }
        : null,
    },
    { status: 201 },
  );
}
