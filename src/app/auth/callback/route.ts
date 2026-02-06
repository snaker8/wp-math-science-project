// ============================================================================
// Auth Callback Route
// 이메일 인증 또는 OAuth 콜백 처리
// ============================================================================

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = await createSupabaseServerClient();

    if (supabase) {
      // 코드를 세션으로 교환
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error && data.user) {
        // 사용자 역할 조회
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', data.user.id)
          .single();

        // 역할에 따른 리다이렉트
        const redirectPath: Record<string, string> = {
          ADMIN: '/admin/dashboard',
          TEACHER: '/tutor/dashboard',
          TUTOR: '/tutor/dashboard',
          STUDENT: '/student/dashboard',
          PARENT: '/parent/dashboard',
        };

        const targetPath = userData?.role
          ? redirectPath[userData.role] || '/dashboard'
          : '/dashboard';

        return NextResponse.redirect(new URL(targetPath, requestUrl.origin));
      }
    }
  }

  // 오류 발생 시 로그인 페이지로 리다이렉트
  return NextResponse.redirect(new URL('/auth/login?error=auth_failed', requestUrl.origin));
}
