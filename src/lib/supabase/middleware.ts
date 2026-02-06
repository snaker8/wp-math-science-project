// ============================================================================
// Supabase Middleware Client
// Next.js 미들웨어에서 사용하는 Supabase 클라이언트
// ============================================================================

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isSupabaseConfigured = supabaseUrl &&
  !supabaseUrl.includes('your-project') &&
  supabaseAnonKey &&
  !supabaseAnonKey.includes('your-');

export type UserRole = 'ADMIN' | 'TEACHER' | 'TUTOR' | 'STUDENT' | 'PARENT';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  instituteId: string | null;
  fullName: string;
  isAcademyAdmin: boolean; // 선생님에게 부여된 학원 관리자 권한
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

    if (!session) {
      // getUser로도 시도
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        return null;
      }
    }

    const user = session?.user;
    if (!user) {
      return null;
    }

    // users 테이블에서 역할 정보 조회
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role, institute_id, full_name, preferences')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return null;
    }

    // preferences에서 isAcademyAdmin 플래그 확인
    const preferences = userData.preferences as Record<string, unknown> || {};
    const isAcademyAdmin = preferences.isAcademyAdmin === true;

    return {
      id: user.id,
      email: user.email || '',
      role: userData.role as UserRole,
      instituteId: userData.institute_id,
      fullName: userData.full_name,
      isAcademyAdmin,
    };
  } catch {
    return null;
  }
}

/**
 * 학원 관리자 권한 검사 (ADMIN 또는 isAcademyAdmin이 true인 TEACHER)
 */
export function hasAcademyAdminAccess(user: AuthUser): boolean {
  return user.role === 'ADMIN' || (user.role === 'TEACHER' && user.isAcademyAdmin);
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
