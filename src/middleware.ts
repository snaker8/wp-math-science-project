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
