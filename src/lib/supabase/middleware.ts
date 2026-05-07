// ============================================================================
// Supabase Middleware Client
// Next.js 미들웨어에서 사용하는 Supabase 클라이언트
// ============================================================================

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { isSubjectTrack, type SubjectTrack } from '@/lib/subject-track';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isSupabaseConfigured = supabaseUrl &&
  !supabaseUrl.includes('your-project') &&
  supabaseAnonKey &&
  !supabaseAnonKey.includes('your-');

export type UserRole = 'ADMIN' | 'TEACHER' | 'TUTOR' | 'STUDENT' | 'PARENT' | 'ORG_ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  instituteId: string | null;
  fullName: string;
  isAcademyAdmin: boolean; // 선생님에게 부여된 학원 관리자 권한
  // ★ 시스템 슈퍼관리자 — auth.users.app_metadata.super_admin = true (service_role 만 set 가능).
  //   학원·센터 소속과 무관하게 모든 학원·센터 관리. 운영 주체.
  isSuperAdmin: boolean;
  // PR-T7 — 트랙 분리. flag false 일 때도 채워짐 (DB DEFAULT 'math'); 호출처가 무시하면 영향 0.
  subjectTracks: SubjectTrack[];
  activeSubjectTrack: SubjectTrack | null;
}

/**
 * 미들웨어에서 사용할 Supabase 클라이언트와 응답 객체를 생성
 */
export function createSupabaseMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  if (!isSupabaseConfigured) {
    return { supabase: null, response };
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  return { supabase, response };
}

/**
 * 현재 인증된 사용자 정보 조회 (역할 포함)
 */
export async function getAuthUser(supabase: ReturnType<typeof createServerClient>, request?: NextRequest): Promise<AuthUser | null> {
  try {
    // 먼저 getSession으로 시도
    let { data: { session } } = await supabase.auth.getSession();

    // 세션이 없으면 쿠키에서 직접 토큰 추출 시도 (SSR 호환성 문제 해결)
    if (!session && request) {
      const allCookies = request.cookies.getAll();
      const authCookie = allCookies.find(c => c.name.includes('-auth-token'));

      if (authCookie) {
        try {
          const tokenData = JSON.parse(authCookie.value);

          if (tokenData.access_token && tokenData.refresh_token) {
            const { data: setSessionData } = await supabase.auth.setSession({
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token,
            });

            if (setSessionData?.session) {
              session = setSessionData.session;
            }
          }
        } catch {
          // 쿠키 파싱 실패 시 무시
        }
      }
    }

    let user = session?.user ?? null;

    if (!user) {
      // getUser로도 시도
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

      if (authError || !authUser) {
        return null;
      }
      user = authUser;
    }

    // users 테이블에서 역할 + 트랙 정보 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role, institute_id, full_name, preferences, subject_tracks, active_subject_track')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return null;
    }

    // preferences에서 isAcademyAdmin 플래그 확인
    const preferences = userData.preferences as Record<string, unknown> || {};
    const isAcademyAdmin = preferences.isAcademyAdmin === true;

    // ★ super_admin — auth.users.app_metadata.super_admin = true (institute-guard.ts:82 패턴)
    //   service_role 만 set 가능 → 보안 가드용 정답. 운영 주체로 시스템 전체 관리.
    const appMetadata = user.app_metadata as Record<string, unknown> | undefined;
    const isSuperAdmin = appMetadata?.super_admin === true;

    // 트랙 정규화 (DB 값 비정상이면 빈 배열 / null)
    const rawTracks = (userData as { subject_tracks?: unknown }).subject_tracks;
    const subjectTracks = Array.isArray(rawTracks)
      ? (rawTracks.filter(isSubjectTrack) as SubjectTrack[])
      : [];
    const rawActive = (userData as { active_subject_track?: unknown }).active_subject_track;
    const activeSubjectTrack: SubjectTrack | null = isSubjectTrack(rawActive)
      ? rawActive
      : null;

    return {
      id: user.id,
      email: user.email || '',
      role: userData.role as UserRole,
      instituteId: userData.institute_id,
      fullName: userData.full_name,
      isAcademyAdmin,
      isSuperAdmin,
      subjectTracks,
      activeSubjectTrack,
    };
  } catch {
    return null;
  }
}

/**
 * 학원·시스템 관리자 권한 검사 — /admin/* 영역 진입 가드.
 *
 * 통과 조건:
 *   1. super_admin (auth.users.app_metadata.super_admin = true) — 운영 주체, 모든 학원·센터
 *   2. ORG_ADMIN (users.role) — 학원장, 자기 학원 산하 모든 센터 통합
 *   3. ADMIN (users.role) — 센터 관리자, 자기 센터
 *   4. TEACHER + isAcademyAdmin (preferences) — 강사에게 부여된 학원 관리자 권한
 */
export function hasAcademyAdminAccess(user: AuthUser): boolean {
  if (user.isSuperAdmin) return true;
  if (user.role === 'ADMIN') return true;
  if (user.role === 'ORG_ADMIN') return true;
  if (user.role === 'TEACHER' && user.isAcademyAdmin) return true;
  return false;
}

/**
 * 역할 기반 접근 권한 검사
 */
export function hasAccess(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole);
}

/**
 * 관리자 권한 검사 (ADMIN만)
 */
export function isAdmin(role: UserRole): boolean {
  return role === 'ADMIN';
}

/**
 * 강사 권한 검사 (ADMIN, TEACHER, TUTOR)
 */
export function isTutor(role: UserRole): boolean {
  return ['ADMIN', 'TEACHER', 'TUTOR'].includes(role);
}

/**
 * 학생 권한 검사 (STUDENT만)
 */
export function isStudent(role: UserRole): boolean {
  return role === 'STUDENT';
}
