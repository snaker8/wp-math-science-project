// ============================================================================
// 학생 ID = 전화번호 — 변환 헬퍼
//
// Supabase Auth 의 email 컬럼은 RFC 형식 검증을 하므로, 학생 로그인 ID 인
// 전화번호를 '<digits>@local.suzag.com' 형태로 저장. UI 노출 시 도메인 제거.
//
// 사용처:
//   - /api/students POST   (학생 등록)
//   - /api/students/[id] PATCH (전화번호 수정)
//   - /auth/login          (학생 탭에서 입력값 normalize)
// ============================================================================

const STUDENT_EMAIL_DOMAIN = '@local.suzag.com';

/**
 * 전화번호를 학생 로그인 ID (이메일 형태) 로 변환.
 * 하이픈·공백 모두 제거, 한국 휴대전화 9~11자리만 유효.
 *
 * @example
 *   phoneToStudentEmail('010-1234-5678')   → '01012345678@local.suzag.com'
 *   phoneToStudentEmail('010 1234 5678')   → '01012345678@local.suzag.com'
 *   phoneToStudentEmail('01012345678')     → '01012345678@local.suzag.com'
 *   phoneToStudentEmail('123')             → null  (자릿수 부족)
 *   phoneToStudentEmail('')                → null
 */
export function phoneToStudentEmail(rawPhone: string): string | null {
  if (!rawPhone) return null;
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 9 || digits.length > 11) return null;
  return `${digits}${STUDENT_EMAIL_DOMAIN}`;
}

/**
 * 학생 이메일에서 도메인 부분을 제거해 전화번호만 추출.
 * 학생 ID UI 노출 시 사용.
 *
 * @example
 *   stripStudentDomain('01012345678@local.suzag.com')  → '01012345678'
 *   stripStudentDomain('student-XXX@local.suzag.com')  → 'student-XXX'
 *   stripStudentDomain('teacher@gmail.com')            → 'teacher@gmail.com' (변환 X)
 */
export function stripStudentDomain(email: string): string {
  if (!email) return '';
  return email.replace(/@local\.suzag\.com$/i, '');
}

/** 학생 ID 가 전화번호 기반(@local.suzag.com)인지 판별 */
export function isPhoneBasedStudentEmail(email: string): boolean {
  return /@local\.suzag\.com$/i.test(email || '');
}

/** 학생 초기 비밀번호 — 강사가 학생에게 전달, 학생이 로그인 후 변경 */
export const STUDENT_INITIAL_PASSWORD = '123456';
