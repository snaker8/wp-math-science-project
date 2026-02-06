// ============================================================================
// Next.js Middleware - 역할 기반 접근 제어 (RBAC)
// ============================================================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  createSupabaseMiddlewareClient,
  getAuthUser,
  hasAcademyAdminAccess,
  type UserRole,
} from '@/lib/supabase/middleware';

// 경로별 허용 역할 설정
const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  // /admin/* : 관리자만
  '/admin': ['ADMIN'],

  // /tutor/* : 강사와 관리자
  '/tutor': ['ADMIN', 'TEACHER', 'TUTOR'],

  // /student/* : 학생만
  '/student': ['STUDENT'],
};

// 인증이 필요 없는 공개 경로
const PUBLIC_PATHS = [
  '/',
  '/auth/login',
  '/auth/signup',
  '/auth/callback',
  '/auth/forgot-password',
  '/auth/reset-password',
];

// 정적 파일 및 API 경로 패턴
const IGNORED_PATHS = [
  '/_next',
  '/api',
  '/favicon.ico',
  '/images',
  '/fonts',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 정적 파일 및 무시할 경로 스킵
  if (IGNORED_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // 공개 경로 스킵
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'))) {
    return NextResponse.next();
  }

  // Supabase 클라이언트 생성
  const { supabase, response } = createSupabaseMiddlewareClient(request);

  // Supabase가 설정되지 않은 경우 (개발 환경)
  if (!supabase) {
    console.warn('[Middleware] Supabase not configured, allowing access');
    return response;
  }

  // 사용자 인증 확인 (request도 전달하여 쿠키에서 직접 토큰 추출 가능하도록)
  const user = await getAuthUser(supabase, request);

  // 미인증 사용자 -> 로그인 페이지로 리다이렉트
  if (!user) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 역할 기반 접근 제어
  for (const [routePrefix, allowedRoles] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname.startsWith(routePrefix)) {
      // /admin 경로는 학원 관리자 권한이 있는 선생님도 접근 가능
      if (routePrefix === '/admin' && hasAcademyAdminAccess(user)) {
        break;
      }

      if (!allowedRoles.includes(user.role)) {
        // 권한 없음 -> 역할에 맞는 대시보드로 리다이렉트
        const redirectUrl = getRoleBasedRedirect(user.role, request.url);
        return NextResponse.redirect(redirectUrl);
      }
      break;
    }
  }

  // 인증된 사용자 정보를 헤더에 추가 (서버 컴포넌트에서 사용)
  response.headers.set('x-user-id', user.id);
  response.headers.set('x-user-role', user.role);
  response.headers.set('x-user-email', user.email);
  response.headers.set('x-user-academy-admin', String(user.isAcademyAdmin));

  return response;
}

/**
 * 역할에 따른 기본 대시보드 경로 반환
 */
function getRoleBasedRedirect(role: UserRole, baseUrl: string): URL {
  const redirectPaths: Record<UserRole, string> = {
    ADMIN: '/admin/dashboard',
    TEACHER: '/tutor/dashboard',
    TUTOR: '/tutor/dashboard',
    STUDENT: '/student/dashboard',
    PARENT: '/parent/dashboard',
  };

  return new URL(redirectPaths[role] || '/dashboard', baseUrl);
}

// 미들웨어가 실행될 경로 설정
export const config = {
  matcher: [
    /*
     * 다음 경로를 제외한 모든 요청에서 실행:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - favicon.ico (파비콘)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
