// ============================================================================
// /api/admin/notices/[id]  (super_admin 전용)
// PATCH  — 공지 수정 (title/body/is_urgent/is_published)
// DELETE — 공지 삭제
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authed = await requireSuperAdmin();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  if (typeof body.title === 'string') {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: '제목은 비울 수 없습니다.' }, { status: 400 });
    updates.title = t;
  }
  if ('body' in body) updates.body = body.body ? String(body.body).trim() : null;
  if (typeof body.is_urgent === 'boolean') updates.is_urgent = body.is_urgent;
  if (typeof body.is_published === 'boolean') updates.is_published = body.is_published;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '변경할 내용이 없습니다.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('notices')
    .update(updates)
    .eq('id', params.id)
    .select('id, title, body, is_urgent, is_published, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ notice: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authed = await requireSuperAdmin();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { error } = await supabaseAdmin.from('notices').delete().eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
