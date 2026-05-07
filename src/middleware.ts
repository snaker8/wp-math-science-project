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
  '/admin': ['ADMIN'],
  '/tutor': ['ADMIN', 'TEACHER', 'TUTOR'],
  '/student': ['STUDENT'],
};

// 인증이 필요 없는 공개 경로
const PUBLIC_PATHS = [
  '/',
  '/auth/login',
  '/auth/signup',
  '/auth/callback',
  '/auth/otp',
  '/auth/forgot-password',
  '/auth/reset-password',
  // ★ 외부 공유 리포트 (링크 공유 시 로그인 없이 접근)
  '/share',
];

// 트랙 선택 검사 대상 경로 — 로그인 후 진입하는 영역
const TRACK_GATED_PREFIXES = ['/dashboard', '/admin', '/tutor', '/student', '/parent'];

// 트랙 선택 페이지 자체 — redirect 대상에서 제외 (loop 방지)
const TRACK_CHOICE_PATH = '/select-track';

const IGNORED_PATHS = [
  '/_next',
  '/api',
  '/favicon.ico',
  '/images',
  '/fonts',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (IGNORED_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'))) {
    return NextResponse.next();
  }

  const { supabase, response } = createSupabaseMiddlewareClient(request);

  if (!supabase) {
    console.warn('[Middleware] Supabase not configured, allowing access');
    return response;
  }

  const user = await getAuthUser(supabase, request);

  if (!user) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  for (const [routePrefix, allowedRoles] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname.startsWith(routePrefix)) {
      if (routePrefix === '/admin' && hasAcademyAdminAccess(user)) break;
      if (!allowedRoles.includes(user.role)) {
        const redirectUrl = getRoleBasedRedirect(user.role, request.url);
        return NextResponse.redirect(redirectUrl);
      }
      break;
    }
  }

  // ★ 트랙 선택 redirect — feature flag true 시 로그인 사용자가 대시보드 영역
  //   진입 시 track-chosen 쿠키 검사. 미설정이면 /select-track 으로 보냄.
  //   /select-track 페이지가 사용자 트랙 수 (1 vs 2+) 에 따라 자동 처리:
  //     - 1 트랙: 자동 PATCH + 쿠키 set + /dashboard redirect (사용자 눈에 거의 안 띔)
  //     - 2+ 트랙: 카드 표시 → 선택 → 쿠키 set → /dashboard
  //   쿠키 기반 → middleware 매 요청 DB 쿼리 0.
  const TRACK_SPLIT_ENABLED = process.env.NEXT_PUBLIC_TRACK_SPLIT_ENABLED === 'true';
  if (
    TRACK_SPLIT_ENABLED &&
    pathname !== TRACK_CHOICE_PATH &&
    TRACK_GATED_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    const trackCookie = request.cookies.get('track-chosen');
    if (!trackCookie) {
      const selectUrl = new URL(TRACK_CHOICE_PATH, request.url);
      selectUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(selectUrl);
    }
  }

  response.headers.set('x-user-id', user.id);
  response.headers.set('x-user-role', user.role);
  response.headers.set('x-user-email', user.email);
  response.headers.set('x-user-academy-admin', String(user.isAcademyAdmin));

  return response;
}

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

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
