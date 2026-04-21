// ============================================================================
// API Route 인증 가드 유틸
// ============================================================================

import { NextResponse } from 'next/server';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';

export type GuardUser = {
  id: string;
  email: string | null;
  role: 'ADMIN' | 'TEACHER' | 'TUTOR' | 'STUDENT' | 'PARENT' | null;
  instituteId: string | null;
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
