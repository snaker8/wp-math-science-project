// ============================================================================
// GET /api/notices — 게시된 시스템 공지 목록 (로그인 사용자 누구나).
//   대시보드 공지 섹션에서 사용. 작성/관리는 /api/admin/notices (super_admin).
// ============================================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from('notices')
    .select('id, title, body, is_urgent, created_at')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { notices: data || [] },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
