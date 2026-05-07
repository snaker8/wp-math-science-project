// ============================================================================
// Next.js Middleware - 역할 기반 접근 제어 (RBAC) + 트랙 분리 (URL 기반)
// ----------------------------------------------------------------------------
// PR-T7 foundation:
//   - URL 첫 세그먼트가 /math, /science 면 'x-user-active-track' 헤더 주입
//   - /api/* 진입 시 referer URL 의 track 또는 user.activeSubjectTrack 으로 헤더 주입
//
// PR-T8 활성:
//   - legacy /dashboard/* → /{cookieTrack}/dashboard/* redirect (쿠키 있을 때)
//     · (tracks)/[track]/dashboard/* 라우트 그룹 신설 후 활성
//     · 쿠키 없으면 T6 로직으로 /select-track redirect (카드 흐름)
// ============================================================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  createSupabaseMiddlewareClient,
  getAuthUser,
  hasAcademyAdminAccess,
  type UserRole,
} from '@/lib/supabase/middleware';
import { isSubjectTrack, type SubjectTrack } from '@/lib/subject-track';

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

// URL 첫 세그먼트가 'math'/'science' 면 그 값 반환 (예: /math/dashboard → 'math')
function extractUrlTrack(pathname: string): SubjectTrack | null {
  const seg = pathname.split('/')[1];
  return isSubjectTrack(seg) ? seg : null;
}

// /api/* 진입 시 — Referer URL 또는 사용자 active_subject_track 으로 트랙 헤더 주입.
// SELECT 필터·INSERT 태깅 헬퍼가 이 헤더 읽고 활성 트랙 결정.
function trackFromReferer(refererHeader: string | null): SubjectTrack | null {
  if (!refererHeader) return null;
  try {
    const path = new URL(refererHeader).pathname;
    return extractUrlTrack(path);
  } catch {
    return null;
  }
}

async function passThroughApiWithTrackHeaders(request: NextRequest) {
  // /api/* 는 인증 강제 안 함 (기존 동작 유지). 인증된 경우 트랙 헤더만 추가.
  try {
    const { supabase } = createSupabaseMiddlewareClient(request);
    if (!supabase) return NextResponse.next();
    const user = await getAuthUser(supabase, request);
    if (!user) return NextResponse.next();

    const headers = new Headers(request.headers);
    headers.set('x-user-id', user.id);
    headers.set('x-user-role', user.role);
    headers.set('x-user-tracks', (user.subjectTracks ?? []).join(','));
    const refererTrack = trackFromReferer(request.headers.get('referer'));
    const effectiveTrack = refererTrack ?? user.activeSubjectTrack ?? null;
    if (effectiveTrack) headers.set('x-user-active-track', effectiveTrack);
    return NextResponse.next({ request: { headers } });
  } catch {
    return NextResponse.next();
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (IGNORED_PATHS.some((path) => pathname.startsWith(path))) {
    // /api/* 만 트랙 헤더 주입 (다른 IGNORED 는 그대로). 헤더 주입은 항상 동작 (flag 무관) —
    // route 가 헤더 안 읽으면 무시되므로 안전.
    if (pathname.startsWith('/api')) {
      return passThroughApiWithTrackHeaders(request);
    }
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
      // /admin/* 는 hasAcademyAdminAccess (super_admin·ORG_ADMIN·ADMIN·TEACHER+isAcademyAdmin) 통과
      if (routePrefix === '/admin' && hasAcademyAdminAccess(user)) break;
      // /tutor·/student 등 다른 영역도 super_admin·ORG_ADMIN·ADMIN 은 자유 진입 (운영 관리 차원)
      if (user.isSuperAdmin || user.role === 'ORG_ADMIN' || user.role === 'ADMIN') break;
      if (!allowedRoles.includes(user.role)) {
        const redirectUrl = getRoleBasedRedirect(user.role, request.url);
        return NextResponse.redirect(redirectUrl);
      }
      break;
    }
  }

  // ★ 트랙 분리 redirect — feature flag true 시:
  //   1. 쿠키 없음 → /select-track (카드 흐름 — T6 로직)
  //   2. 쿠키 있음 + legacy /dashboard/* (URL 에 [track] 없음) → /{cookieTrack}/dashboard/* (T8)
  //   3. 쿠키 있음 + URL 에 [track] 있음 → 통과 (헤더 주입 단계로)
  //   쿠키 기반 → middleware 매 요청 DB 쿼리 0.
  const TRACK_SPLIT_ENABLED = process.env.NEXT_PUBLIC_TRACK_SPLIT_ENABLED === 'true';
  if (TRACK_SPLIT_ENABLED && pathname !== TRACK_CHOICE_PATH) {
    const trackCookie = request.cookies.get('track-chosen');
    const isAnyGated = TRACK_GATED_PREFIXES.some((p) => pathname.startsWith(p));

    // 1. 쿠키 없음 + 보호 영역 → /select-track (T6 카드 흐름)
    if (!trackCookie && isAnyGated) {
      const selectUrl = new URL(TRACK_CHOICE_PATH, request.url);
      selectUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(selectUrl);
    }

    // 2. 쿠키 있음 + legacy /dashboard/* (URL [track] 없음) → /{cookieTrack}/dashboard/* (T8)
    //    (tracks)/[track]/dashboard/* 라우트 그룹이 PR-T8 에 신설됨.
    //    /admin·/tutor·/student·/parent 는 라우트 그룹 미신설 — redirect 안 함.
    if (trackCookie) {
      const hasUrlTrack = !!extractUrlTrack(pathname);
      const isLegacyDashboard =
        !hasUrlTrack && (pathname === '/dashboard' || pathname.startsWith('/dashboard/'));
      if (isLegacyDashboard) {
        const target = isSubjectTrack(trackCookie.value) ? trackCookie.value : 'math';
        const newUrl = new URL(`/${target}${pathname}`, request.url);
        newUrl.search = request.nextUrl.search;
        return NextResponse.redirect(newUrl);
      }
    }
  }

  // ★ 트랙 헤더 주입 — URL [track] 우선, 없으면 user.activeSubjectTrack.
  //   PR-T8 이전엔 /math/* /science/* URL 자체가 없으므로 user.active 만 흐름.
  //   request.headers 에도 동일하게 set 해서 RSC/server route 가 headers() 로 읽을 수 있게 함.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', user.id);
  requestHeaders.set('x-user-role', user.role);
  requestHeaders.set('x-user-email', user.email);
  requestHeaders.set('x-user-academy-admin', String(user.isAcademyAdmin));
  requestHeaders.set('x-user-tracks', (user.subjectTracks ?? []).join(','));
  const urlTrack = extractUrlTrack(pathname);
  const effectiveTrack = urlTrack ?? user.activeSubjectTrack ?? null;
  if (effectiveTrack) requestHeaders.set('x-user-active-track', effectiveTrack);

  // 새 response — supabase auth cookie 는 그대로 옮김
  const finalResponse = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.getAll().forEach((c) => {
    finalResponse.cookies.set(c.name, c.value);
  });
  // 클라이언트 응답에도 동일 헤더 노출 (디버그·CSR 코드 호환용)
  finalResponse.headers.set('x-user-id', user.id);
  finalResponse.headers.set('x-user-role', user.role);
  finalResponse.headers.set('x-user-email', user.email);
  finalResponse.headers.set('x-user-academy-admin', String(user.isAcademyAdmin));
  finalResponse.headers.set('x-user-tracks', (user.subjectTracks ?? []).join(','));
  if (effectiveTrack) finalResponse.headers.set('x-user-active-track', effectiveTrack);

  return finalResponse;
}

function getRoleBasedRedirect(role: UserRole, baseUrl: string): URL {
  const redirectPaths: Record<UserRole, string> = {
    ADMIN: '/admin/dashboard',
    ORG_ADMIN: '/admin/dashboard',  // 학원장도 운영 관리 영역 진입
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
