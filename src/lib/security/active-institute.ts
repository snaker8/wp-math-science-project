// ============================================================================
// active-institute.ts — 활성 센터(institute) 쿠키 헬퍼
//
// super_admin/ORG_ADMIN 이 작업할 센터를 쿠키로 저장. 모든 API 가
// 자동 활용 (학생 채점, 시험 관리, 자산화 등).
//
// 우선순위: 요청 body/form 의 institute_id > 쿠키 > scope.instituteId
//
// 쿠키 이름: 'active_institute_id'
// 쿠키 옵션: httpOnly=false (클라이언트 표시용 필요), sameSite=lax, path=/, max-age=1년
//
// 클라이언트 React Context 안 씀 — hydration 위험 회피.
// 쿠키 변경은 POST /api/me/active-institute 호출 → router.refresh() 로 반영.
// ============================================================================

import { cookies } from 'next/headers';
import type { InstituteAccessScope } from '@/lib/security/institute-guard';

export const ACTIVE_INSTITUTE_COOKIE = 'active_institute_id';

/**
 * 쿠키에서 활성 institute_id 조회.
 * Server Component / Route Handler 에서 사용.
 */
export function readActiveInstituteCookie(): string | null {
  try {
    return cookies().get(ACTIVE_INSTITUTE_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * 사용자가 해당 institute_id 에 접근 권한이 있는지 검증.
 * 권한 없으면 false. 권한 있으면 true.
 */
export function canAccessInstitute(
  scope: InstituteAccessScope,
  instituteId: string
): boolean {
  if (scope.isSuperAdmin) return true;
  const accessible = scope.accessibleInstituteIds ?? [];
  return accessible.includes(instituteId);
}

/**
 * 활성 institute 결정 — 우선순위:
 *   1. 쿠키 (TopNav 활성 센터 선택) — 권한 검증 통과한 것만
 *   2. scope.instituteId — 본인 institute (쿠키 없거나 권한 잃은 경우)
 *
 * 폼 필드는 받지 않음 — 모든 작업은 TopNav 활성 센터 기준으로 통일.
 *
 * @returns 활성 institute_id 또는 null (배정 안 됨)
 */
export function resolveActiveInstitute(
  scope: InstituteAccessScope
): string | null {
  // 1. 쿠키
  const cookieValue = readActiveInstituteCookie();
  if (cookieValue && canAccessInstitute(scope, cookieValue)) {
    return cookieValue;
  }

  // 2. 본인 institute
  return scope.instituteId ?? null;
}
