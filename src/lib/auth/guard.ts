// ============================================================================
// API Route 인증 가드 유틸
// ============================================================================

import { NextResponse } from 'next/server';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import { getUserAccessScope, type InstituteAccessScope } from '@/lib/security/institute-guard';

export type GuardUser = {
  id: string;
  email: string | null;
  role: 'ADMIN' | 'TEACHER' | 'TUTOR' | 'STUDENT' | 'PARENT' | 'ORG_ADMIN' | null;
  instituteId: string | null;
};

export type AuthedSession = {
  user: GuardUser;
  scope: InstituteAccessScope;
};

/**
 * 현재 요청의 인증된 유저 + public.users role 반환.
 * 미로그인이면 null 반환.
 */
export async function getAuthUser(): Promise<GuardUser | null> {
  try {
    const supa = await createSupabaseServerClient();
    if (!supa) return null;

    const { data: { user }, error } = await supa.auth.getUser();
    if (error || !user) return null;

    // public.users에서 role/institute 조회 (supabaseAdmin으로 RLS 우회)
    let role: GuardUser['role'] = null;
    let instituteId: string | null = null;
    if (supabaseAdmin) {
      const { data: profile } = await supabaseAdmin
        .from('users')
        .select('role, institute_id')
        .eq('id', user.id)
        .maybeSingle();
      if (profile) {
        role = (profile as { role: GuardUser['role'] }).role;
        instituteId = (profile as { institute_id: string | null }).institute_id;
      }
    }

    return {
      id: user.id,
      email: user.email ?? null,
      role,
      instituteId,
    };
  } catch {
    return null;
  }
}

/**
 * 인증된 유저만 통과. 미로그인이면 401 응답 반환.
 */
export async function requireAuth(): Promise<
  { ok: true; user: GuardUser } | { ok: false; response: NextResponse }
> {
  const user = await getAuthUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true, user };
}

/**
 * 특정 role만 통과. role이 맞지 않으면 403.
 */
export async function requireRole(
  allowed: Array<NonNullable<GuardUser['role']>>
): Promise<{ ok: true; user: GuardUser } | { ok: false; response: NextResponse }> {
  const authed = await requireAuth();
  if (!authed.ok) return authed;
  if (!authed.user.role || !allowed.includes(authed.user.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden', message: '이 작업 권한이 없습니다.' },
        { status: 403 }
      ),
    };
  }
  return authed;
}

/**
 * ADMIN만 통과 (관리 전용 엔드포인트).
 */
export const requireAdmin = () => requireRole(['ADMIN']);

/**
 * 문제/시험지 수정 권한 (ADMIN 또는 TEACHER/TUTOR).
 */
export const requireEditor = () => requireRole(['ADMIN', 'TEACHER', 'TUTOR']);

/**
 * ★ super_admin (플랫폼 관리자) 만 통과. /api/admin/* 엔드포인트 전용.
 *   auth.users.app_metadata.super_admin === true 인 계정만 인정.
 *
 *   사용자 요구사항 (2026-05-17): "관리자 콘솔도 플랫폼관리자 말고는 보게 하면 안된다"
 *   외부 개발팀이 ORG_ADMIN 으로 들어오므로 admin 콘솔 접근 격리 필수.
 *
 * @example
 *   const authed = await requireSuperAdmin();
 *   if (!authed.ok) return authed.response;
 *   const { user, scope } = authed.data;
 */
export async function requireSuperAdmin(): Promise<
  { ok: true; data: AuthedSession } | { ok: false; response: NextResponse }
> {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed;
  if (!authed.data.scope.isSuperAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden', message: '플랫폼 관리자만 접근 가능합니다.' },
        { status: 403 }
      ),
    };
  }
  return authed;
}

/**
 * 인증 + 격리 scope 통합. Multi-tenancy API 라우트에서 권장.
 *
 * @example
 *   const authed = await requireAuthScope();
 *   if (!authed.ok) return authed.response;
 *   const { user, scope } = authed.data;
 *
 *   const q = supabaseAdmin!.from('exams').select('*');
 *   const { data } = await applyInstituteFilter(q, scope);
 */
export async function requireAuthScope(): Promise<
  { ok: true; data: AuthedSession } | { ok: false; response: NextResponse }
> {
  const supa = await createSupabaseServerClient();
  if (!supa) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Supabase not configured' }, { status: 500 }),
    };
  }
  const { data: { user: rawUser }, error } = await supa.auth.getUser();
  if (error || !rawUser) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  if (!supabaseAdmin) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Supabase admin not configured' }, { status: 500 }),
    };
  }

  const scope = await getUserAccessScope(supabaseAdmin, rawUser.id, rawUser.app_metadata);
  const guardUser: GuardUser = {
    id: rawUser.id,
    email: rawUser.email ?? null,
    role: scope.role as GuardUser['role'],
    instituteId: scope.instituteId,
  };
  return { ok: true, data: { user: guardUser, scope } };
}
