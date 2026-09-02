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
    .is('deleted_at', null)   // ★ 삭제한 학원은 목록에서 감춘다
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

// ============================================================================
// DELETE — 학원 삭제 (super_admin 만).  ?id=<organization_id>[&force=1]
// ----------------------------------------------------------------------------
// ★★ 실삭제 하지 않는다. `deleted_at` 만 찍는다. (institutes 와 같은 이유 — 그쪽 주석 참고)
//   산하 센터가 있으면 DB 가 RESTRICT 로 막기도 하지만, 그보다 자료 보존이 우선이다.
//
// 흐름: force 없이 부르면 **산하 센터를 세어 409 로 돌려준다.**
//       사용자가 보고 force=1 로 다시 부르면 학원과 **산하 센터를 함께** 감춘다.
//       (학원만 감추고 센터를 남기면 주인 없는 센터가 목록에 떠돈다)
// ============================================================================
export async function DELETE(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;
  if (!scope.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden — super_admin only' }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const force = searchParams.get('force') === '1';
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다' }, { status: 400 });

  const { data: org } = await sb
    .from('organizations').select('id, name, deleted_at').eq('id', id).maybeSingle();
  if (!org) return NextResponse.json({ error: '학원을 찾을 수 없습니다' }, { status: 404 });
  if ((org as { deleted_at: string | null }).deleted_at) {
    return NextResponse.json({ error: '이미 삭제된 학원입니다' }, { status: 400 });
  }

  const { data: insts } = await sb
    .from('institutes').select('id, name').eq('organization_id', id).is('deleted_at', null);
  const centers = (insts || []) as Array<{ id: string; name: string }>;

  if (centers.length > 0 && !force) {
    return NextResponse.json({
      needsConfirm: true,
      name: (org as { name: string }).name,
      centers: centers.map((c) => c.name),
      message: '산하 센터가 함께 감춰집니다. 자료는 지워지지 않습니다.',
    }, { status: 409 });
  }

  const now = new Date().toISOString();
  if (centers.length > 0) {
    // 학원만 감추고 센터를 남기면 주인 없는 센터가 떠돈다 → 같이 감춘다
    const { error: ce } = await sb
      .from('institutes')
      .update({ deleted_at: now, hidden: true })
      .eq('organization_id', id).is('deleted_at', null);
    if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });
  }

  const { error } = await sb.from('organizations').update({ deleted_at: now }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    name: (org as { name: string }).name,
    hiddenCenters: centers.map((c) => c.name),
  });
}
