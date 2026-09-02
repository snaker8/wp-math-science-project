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
    .is('deleted_at', null)   // ★ 삭제한 센터는 목록에서 감춘다
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

// ============================================================================
// DELETE — 센터 삭제 (super_admin 만).  ?id=<institute_id>[&force=1]
// ----------------------------------------------------------------------------
// ★★ 실삭제(DELETE) 하지 않는다. `deleted_at` 만 찍는다.
//   institutes 를 가리키는 FK 상당수가 **CASCADE** 라, 행을 실제로 지우면
//   그 센터의 **시험지·반·명단·성적이 함께 사라진다.** 되돌릴 수 없다.
//     exams · classes · roster_students · source_files ·
//     student_exam_scores · student_school_exam_scores  → CASCADE
//   (2026-09-02 실측 FK 조사)
//
// 흐름: force 없이 부르면 **무엇이 딸려 있는지 세어서 409 로 돌려준다.**
//       사용자가 그걸 보고 다시 force=1 로 부르면 그때 삭제.
//       "몰라서 지웠다"를 막기 위한 것이지, 못 지우게 하려는 게 아니다.
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

  const { data: inst } = await sb
    .from('institutes').select('id, name, deleted_at').eq('id', id).maybeSingle();
  if (!inst) return NextResponse.json({ error: '센터를 찾을 수 없습니다' }, { status: 404 });
  if ((inst as { deleted_at: string | null }).deleted_at) {
    return NextResponse.json({ error: '이미 삭제된 센터입니다' }, { status: 400 });
  }

  // 딸린 자료 세기 (삭제되진 않지만, 이 센터를 지우면 안 보이게 되는 것들)
  const countOf = async (table: string, col = 'institute_id', schema?: string) => {
    const q = schema ? sb.schema(schema as never) : sb;
    const { count } = await q.from(table).select('id', { count: 'exact', head: true }).eq(col, id);
    return count ?? 0;
  };
  const attached = {
    시험지: await countOf('exams'),
    사용자: await countOf('users'),
    명단: await countOf('roster_students'),
    반: await countOf('classes'),
    진단세션: await countOf('sessions', 'institute_id', 'diagnostics'),
    숙달기록: await countOf('student_node_status', 'institute_id', 'diagnostics'),
  };
  const total = Object.values(attached).reduce((a, b) => a + b, 0);

  if (total > 0 && !force) {
    return NextResponse.json({
      needsConfirm: true,
      name: (inst as { name: string }).name,
      attached,
      message: '이 센터에 딸린 자료가 있습니다. 삭제해도 자료는 지워지지 않고 함께 감춰집니다.',
    }, { status: 409 });
  }

  // ★ 소프트 삭제만. hidden 도 같이 세워 다른 화면에서도 안 보이게.
  const { error } = await sb
    .from('institutes')
    .update({ deleted_at: new Date().toISOString(), hidden: true })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, name: (inst as { name: string }).name, attached });
}
