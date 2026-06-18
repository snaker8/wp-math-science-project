// ============================================================================
// /api/admin/notices  (super_admin 전용)
// GET  — 전체 공지(미게시 포함) 최신순
// POST — 공지 생성
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authed = await requireSuperAdmin();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from('notices')
    .select('id, title, body, is_urgent, is_published, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    { notices: data || [] },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: NextRequest) {
  const authed = await requireSuperAdmin();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  if (!title) {
    return NextResponse.json({ error: '제목은 필수입니다.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('notices')
    .insert({
      title,
      body: body.body ? String(body.body).trim() : null,
      is_urgent: !!body.is_urgent,
      is_published: body.is_published !== false,
      created_by: authed.data.user.id,
    })
    .select('id, title, body, is_urgent, is_published, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ notice: data });
}
