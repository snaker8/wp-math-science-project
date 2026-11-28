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
  const local = email.replace(/@local\.suzag\.com$/i, '');
  // 이름 아이디(EDG홍길동 등)는 u<hex> 로 저장 — 화면엔 원래 아이디로
  if (local !== email && /^u[0-9a-f]+$/.test(local)) return decodeNameLoginId(local) ?? local;
  return local;
}

// ============================================================================
// ★ 이름 아이디 (2026-11-28 대표 「매쓰홀릭과 같게」 — 동부산과사람 = EDG+학생이름)
//   Supabase Auth 이메일엔 한글을 못 넣으므로 아이디를 UTF-8 hex 로 바꿔 'u<hex>@local.suzag.com' 에 저장.
//   대소문자·공백 차이로 다른 계정이 되지 않게 정규화(NFC · 공백 제거 · 영문 대문자) 후 변환한다.
// ============================================================================

const NAME_ID_MAX_BYTES = 28; // 'u' + 56 hex = 57자 < 이메일 로컬 64자

/** 아이디 정규화 — 공백 제거, NFC, 영문 대문자 (EDG홍길동 = edg 홍길동) */
export function normalizeLoginId(raw: string): string {
  return (raw || '').normalize('NFC').replace(/\s+/g, '').toUpperCase();
}

function toHex(str: string): string {
  return Array.from(new TextEncoder().encode(str)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function decodeNameLoginId(local: string): string | null {
  try {
    const hex = local.slice(1);
    if (hex.length % 2) return null;
    const bytes = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** 이름 아이디로 쓸 수 있는 글자인가 — 한글·영문·숫자만, 2~ 자, 바이트 한도 안 */
export function isValidNameLoginId(raw: string): boolean {
  const id = normalizeLoginId(raw);
  if (id.length < 2) return false;
  if (!/^[A-Z0-9가-힣]+$/.test(id)) return false;
  return new TextEncoder().encode(id).length <= NAME_ID_MAX_BYTES;
}

/** 이름 아이디 → 로그인 이메일. 쓸 수 없는 아이디면 null */
export function nameLoginIdToEmail(raw: string): string | null {
  if (!isValidNameLoginId(raw)) return null;
  return `u${toHex(normalizeLoginId(raw))}${STUDENT_EMAIL_DOMAIN}`;
}

/**
 * 학생 로그인 칸 입력 → 로그인 이메일.
 *   이메일(@ 포함) → 그대로 / 전화번호(숫자·하이픈 9~11자리) → '<digits>@…' / 그 밖 → 이름 아이디
 */
export function studentLoginInputToEmail(raw: string): string {
  const v = (raw || '').trim();
  if (v.includes('@')) return v;
  if (/^[0-9\-\s]+$/.test(v)) return phoneToStudentEmail(v) ?? v;
  return nameLoginIdToEmail(v) ?? v;
}

/** 학생 ID 가 전화번호 기반(@local.suzag.com)인지 판별 */
export function isPhoneBasedStudentEmail(email: string): boolean {
  return /@local\.suzag\.com$/i.test(email || '');
}

/** 학생 초기 비밀번호 — 강사가 학생에게 전달, 학생이 로그인 후 변경 */
export const STUDENT_INITIAL_PASSWORD = '123456';
