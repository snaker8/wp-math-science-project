// ============================================================================
// /admin/* 서버 측 가드 — super_admin (플랫폼 관리자) 전용
//
// 사용자 요구사항 (2026-05-17):
//   "관리자 콘솔도 플랫폼관리자 말고는 보게 하면 안된다"
//   외부 개발팀이 ORG_ADMIN 권한으로 들어와도 admin 콘솔 접근 차단 필수.
//
// 방어심층화 (defense in depth):
//   1. middleware.ts — pathname.startsWith('/admin') 차단 (1차)
//   2. 이 layout — 서버에서 직접 검증 (2차, middleware 우회 시 방어)
//   3. /api/admin/* 라우트 — requireSuperAdmin() (3차, API 직접 호출 차단)
// ============================================================================

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import AdminLayoutClient from './AdminLayoutClient';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supa = await createSupabaseServerClient();
  if (!supa) {
    // Supabase 설정 안 됨 → 안전을 위해 로그인 페이지로
    redirect('/auth/login');
  }

  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) {
    redirect('/auth/login?redirect=/admin/dashboard');
  }

  // auth.users.app_metadata.super_admin 만 인정 (public.users.role 은 불인정)
  const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;
  const isSuperAdmin = appMetadata.super_admin === true;

  if (!isSuperAdmin) {
    // 일반 사용자·ADMIN·ORG_ADMIN — 모두 거부
    redirect('/dashboard');
  }

  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
