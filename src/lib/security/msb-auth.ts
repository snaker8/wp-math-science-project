// ============================================================================
// 매쓰사이뱅크(MSB) 외부 API 키 인증 — 자사관 플래너(PLAN.html) 연동 전용
//
//   자사관 플래너는 쿠키 세션이 아닌 'Authorization: Bearer <키>' 로 호출한다
//   (cross-origin). 일반 라우트의 requireAuthScope(쿠키) 를 쓸 수 없어 전용
//   API 키 인증을 둔다.
//
//   ★ 멀티테넌시 안전 (가드 #8):
//     키는 env MSB_INSTITUTE_ID 단일 학원에 고정된다. super_admin/org 권한을
//     절대 부여하지 않으므로, 이 라우트는 설정된 학원 1곳의 학생만 노출한다.
//     (다른 학원 데이터 누수 원천 차단.)
//
//   ★ 키 노출 주의:
//     플래너는 키를 브라우저 localStorage 에 평문 저장한다(클라이언트 노출).
//     그래서 이 키로 접근 가능한 건 "읽기 전용 + 단일 학원" 으로 제한된다.
//     유출 시 Vercel env 의 MSB_API_KEY 를 교체(rotate)하면 즉시 무효화된다.
//
//   설정 (Vercel 환경변수):
//     MSB_API_KEY        — 플래너에 입력할 Bearer 토큰 (임의의 긴 시크릿 문자열)
//     MSB_INSTITUTE_ID   — 서비스할 학원(institute) UUID
//     MSB_ALLOWED_ORIGINS(선택) — CORS 추가 허용 origin (cors.ts 에서 사용)
// ============================================================================

import { NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';

export interface MsbAuth {
  /** 이 키가 서비스하는 단일 학원 id */
  instituteId: string;
}

export type MsbAuthResult =
  | { ok: true; auth: MsbAuth }
  | { ok: false; status: number; error: string };

/**
 * 상수시간 비교 — 두 문자열을 각각 sha256(고정 32바이트) 으로 해시해 비교.
 * 길이가 항상 같아 timingSafeEqual 안전, 타이밍 사이드채널로 키 길이/내용 노출 X.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Authorization: Bearer 헤더를 검증하고 학원 scope 를 돌려준다. */
export function requireMsbKey(req: NextRequest): MsbAuthResult {
  const expected = process.env.MSB_API_KEY || '';
  const instituteId = process.env.MSB_INSTITUTE_ID || '';

  // fail-closed: 설정 누락이면 누구도 통과 못 함
  if (!expected || !instituteId) {
    return {
      ok: false,
      status: 503,
      error: 'MSB API 미설정 — 서버에 MSB_API_KEY / MSB_INSTITUTE_ID 가 필요합니다',
    };
  }

  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1].trim() : '';
  if (!token) {
    return { ok: false, status: 401, error: 'Bearer 토큰이 없습니다' };
  }
  if (!safeEqual(token, expected)) {
    return { ok: false, status: 401, error: 'API 키가 올바르지 않습니다' };
  }
  return { ok: true, auth: { instituteId } };
}

/** 학생 학년 정수(7=중1 …) → 자사관 플래너가 기대하는 라벨('중1' 등) */
const GRADE_INT_TO_LABEL: Record<number, string> = {
  1: '초1', 2: '초2', 3: '초3', 4: '초4', 5: '초5', 6: '초6',
  7: '중1', 8: '중2', 9: '중3',
  10: '고1', 11: '고2', 12: '고3',
};
export function gradeIntToLabel(grade: number | null | undefined): string {
  if (grade == null) return '';
  return GRADE_INT_TO_LABEL[grade] || '';
}
