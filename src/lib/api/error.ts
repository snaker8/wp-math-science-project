// ============================================================================
// API Error Response Helper
//
// 목적: 보안 감사 E-2/G-1 — raw error.message 노출 차단.
//   - Supabase / DB 에러 메시지에 컬럼명·FK 제약·internal ID 노출 가능
//   - 외부 클라이언트(특히 외부 개발팀 ORG_ADMIN) 가 분석 단서로 활용 위험
//
// 정책:
//   - 클라이언트 응답: generic 메시지만 (DB 구조 누설 X)
//   - 서버 로그: raw error 전체 보존 (디버깅용)
//
// @example
//   if (error) {
//     return apiError('/api/classes', error, 'Failed to load classes', 500);
//   }
// ============================================================================

import { NextResponse } from 'next/server';

export interface ApiErrorOptions {
  /** 응답 body 에 추가할 필드 (예: 검증 실패 코드) */
  extras?: Record<string, unknown>;
}

/**
 * API 라우트 표준 error 응답.
 *
 * @param logTag 서버 로그 prefix — 예: '/api/classes/POST'
 * @param error 원본 에러 (supabase PostgrestError, Error, 임의 객체)
 * @param userMessage 클라이언트에 노출할 generic 메시지 (한글 OK, DB 컬럼명 금지)
 * @param status HTTP status code (400/401/403/404/500/503 등)
 * @param options 추가 옵션
 */
export function apiError(
  logTag: string,
  error: unknown,
  userMessage: string,
  status: number,
  options: ApiErrorOptions = {}
): NextResponse {
  // 서버 로그 — raw 디테일 (Supabase PostgrestError 는 code/message/details/hint 포함)
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null
        ? JSON.stringify(error)
        : String(error);
  console.error(`[${logTag}] error (${status}):`, detail);

  // 클라이언트 응답 — generic
  return NextResponse.json(
    { error: userMessage, ...(options.extras || {}) },
    { status }
  );
}

/**
 * 인증 실패 응답 (401)
 */
export function unauthorized(logTag = 'auth'): NextResponse {
  return apiError(logTag, 'unauthorized access', 'Unauthorized', 401);
}

/**
 * 권한 부족 응답 (403)
 */
export function forbidden(logTag = 'auth', message = 'Forbidden'): NextResponse {
  return apiError(logTag, 'forbidden access', message, 403);
}

/**
 * 404 Not Found
 */
export function notFound(logTag = 'api', message = 'Not found'): NextResponse {
  return apiError(logTag, 'resource not found', message, 404);
}
