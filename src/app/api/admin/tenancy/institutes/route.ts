// ============================================================================
// /api/admin/tenancy/institutes
// GET  — 센터 목록 (organization_id 필터 가능)
// POST — 센터 생성 (super_admin 만 — organization_id 필수)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;
  if (!scope.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden — super_admin only' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get('organization_id');

  let q = supabaseAdmin
    .from('institutes')
    .select('id, name, organization_id, created_at, report_style')
    .order('created_at', { ascending: true });

  if (organizationId) {
    q = q.eq('organization_id', organizationId);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 멤버 수 조회
  const ids = (data || []).map((i) => i.id as string);
  const memberByInst = new Map<string, number>();
  if (ids.length > 0) {
    const { data: counts } = await supabaseAdmin
      .from('users')
      .select('institute_id')
      .in('institute_id', ids);
    for (const r of (counts || []) as { institute_id: string }[]) {
      memberByInst.set(r.institute_id, (memberByInst.get(r.institute_id) || 0) + 1);
    }
  }

  const enriched = (data || []).map((i) => ({
    ...i,
    memberCount: memberByInst.get(i.id as string) || 0,
  }));

  return NextResponse.json({ institutes: enriched });
}

export async function POST(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;
  if (!scope.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden — super_admin only' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  let body: { name?: string; organization_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  const organizationId = body.organization_id;
  if (!name || !organizationId) {
    return NextResponse.json({ error: 'name 과 organization_id 필수' }, { status: 400 });
  }

  // organization 존재 확인
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('id', organizationId)
    .maybeSingle();
  if (!org) {
    return NextResponse.json({ error: 'organization 을 찾을 수 없습니다' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('institutes')
    .insert({ name, organization_id: organizationId })
    .select('id, name, organization_id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ institute: data }, { status: 201 });
}

// PATCH — 센터 리포트 스타일 변경 (super_admin 만)
//   body: { id, report_style: 'legacy' | 'unified' }
export async function PATCH(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;
  if (!scope.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden — super_admin only' }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  let body: { id?: string; report_style?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = body.id;
  const reportStyle = body.report_style;
  if (!id || (reportStyle !== 'legacy' && reportStyle !== 'unified')) {
    return NextResponse.json(
      { error: 'id 와 report_style(legacy|unified) 필수' },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from('institutes')
    .update({ report_style: reportStyle })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
