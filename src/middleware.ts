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
  type UserRole,
} from '@/lib/supabase/middleware';
import { isSubjectTrack, type SubjectTrack } from '@/lib/subject-track';

// 경로별 허용 역할 설정
// ★ /admin 은 별도 처리 (super_admin only) — ROUTE_PERMISSIONS 에서 제외.
//   사용자 요구사항 (2026-05-17): "관리자 콘솔도 플랫폼관리자 말고는 보게 하면 안된다"
const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
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

// ★ 2026-06-03 perf: /api/* 는 미들웨어에서 users DB 쿼리(getAuthUser)를 하지 않음.
//   - 인가는 각 라우트가 getUserAccessScope 로 users 를 자체 재조회 → 미들웨어 쿼리는 중복.
//   - x-user-* 헤더 소비처는 get-active-track.ts(x-user-active-track) 1곳뿐이며,
//     헤더 없으면 세션 DB fallback 으로 동일 결과 (TRACK_SPLIT off 면 영향 0).
//   - 토큰 갱신은 페이지 네비게이션·라우트 핸들러(createSupabaseServerClient)에서 계속 발생.
//   → referer URL 기반 트랙만 헤더로 주입(DB 불필요). 소비처 없는 나머지 헤더는 생략.
//     결과: API 호출당 Supabase 왕복 1회 제거 (페이지가 API n개 호출 시 n회 중복 제거).
function passThroughApiWithTrackHeaders(request: NextRequest): NextResponse {
  const refererTrack = trackFromReferer(request.headers.get('referer'));
  if (!refererTrack) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set('x-user-active-track', refererTrack);
  return NextResponse.next({ request: { headers } });
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

  // ★ /admin/* 가드 — super_admin only (플랫폼 관리자 전용)
  //   사용자 요구사항: 외부 개발팀이 ORG_ADMIN 권한으로 들어와도 admin 콘솔 보면 안 됨.
  //   ADMIN role (학원 관리자), ORG_ADMIN, TEACHER+isAcademyAdmin 모두 차단.
  if (pathname.startsWith('/admin')) {
    if (!user.isSuperAdmin) {
      const redirectUrl = getRoleBasedRedirect(user.role, request.url);
      return NextResponse.redirect(redirectUrl);
    }
    // super_admin 통과 — 아래 트랙 분리 / 헤더 주입 로직으로
  }

  for (const [routePrefix, allowedRoles] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname.startsWith(routePrefix)) {
      // /tutor·/student 등 다른 영역은 super_admin·ORG_ADMIN·ADMIN 은 자유 진입 (운영 관리 차원)
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
  // ★ /admin 은 super_admin 전용 (2026-05-17 보안 강화)
  //   ADMIN/ORG_ADMIN 학원 운영자도 /dashboard 로 — admin 콘솔 접근 불가.
  const redirectPaths: Record<UserRole, string> = {
    ADMIN: '/dashboard',
    ORG_ADMIN: '/dashboard',
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
