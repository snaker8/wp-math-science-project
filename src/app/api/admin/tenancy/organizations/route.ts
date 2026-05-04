// ============================================================================
// /api/admin/tenancy/organizations
// GET  — 학원 목록
// POST — 학원 생성 (super_admin 만)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;
  if (!scope.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden — super_admin only' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug, subscription_tier, metadata, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 각 organization 의 institute 수 + member 수 동시 조회
  const orgIds = (data || []).map((o) => o.id as string);
  let institutesByOrg = new Map<string, number>();
  let membersByOrg = new Map<string, number>();

  if (orgIds.length > 0) {
    const { data: instCounts } = await supabaseAdmin
      .from('institutes')
      .select('organization_id')
      .in('organization_id', orgIds);
    for (const r of (instCounts || []) as { organization_id: string }[]) {
      institutesByOrg.set(r.organization_id, (institutesByOrg.get(r.organization_id) || 0) + 1);
    }

    const { data: memberCounts } = await supabaseAdmin
      .from('users')
      .select('organization_id')
      .in('organization_id', orgIds);
    for (const r of (memberCounts || []) as { organization_id: string }[]) {
      membersByOrg.set(r.organization_id, (membersByOrg.get(r.organization_id) || 0) + 1);
    }
  }

  const enriched = (data || []).map((o) => ({
    ...o,
    instituteCount: institutesByOrg.get(o.id as string) || 0,
    memberCount: membersByOrg.get(o.id as string) || 0,
  }));

  return NextResponse.json({ organizations: enriched });
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

  let body: { name?: string; slug?: string; subscription_tier?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  const slug = (body.slug || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!name || !slug) {
    return NextResponse.json({ error: 'name 과 slug 필수' }, { status: 400 });
  }
  // slug 검증: 영소문자/숫자/하이픈만
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: 'slug 는 영소문자/숫자/하이픈만 사용' }, { status: 400 });
  }

  const tier = body.subscription_tier || 'internal';

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .insert({ name, slug, subscription_tier: tier })
    .select('id, name, slug')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 존재하는 slug 입니다' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ organization: data }, { status: 201 });
}
