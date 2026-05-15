// ============================================================================
// PATCH /api/organization-applications/[id]
//   가맹 신청 승인/거부 — super_admin 만.
//
// body:
//   { action: 'approve' | 'reject',
//     decision_note?: string,
//     // 승인 옵션 (둘 중 하나)
//     assigned_organization_id?: string,    // 기존 학원에 배정
//     new_organization_name?: string,       // 새 학원 생성
//     new_institute_name?: string,          // 함께 만들 첫 센터 이름 (옵션)
//   }
//
// 동작:
//   approve:
//     a) assigned_organization_id 제공 → 그 학원 산하 새 센터(new_institute_name) 생성
//        → 신청자 user 의 institute_id 박음 → application status='approved'
//     b) new_organization_name 제공 → 신규 organization + 신규 institute 동시 생성
//        → 신청자 user 의 institute_id + 둘 다 박음 → application status='approved'
//   reject:
//     decision_note 와 함께 status='rejected' 박음. 신청자 user 변경 X
//     (institute_id NULL 유지 → 본인이 다시 신청하거나 어드민이 사후 배정).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

interface PatchBody {
  action?: 'approve' | 'reject';
  decision_note?: string;
  assigned_organization_id?: string;
  new_organization_name?: string;
  new_institute_name?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  if (!scope.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden — super_admin 만' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { id: appId } = await params;
  if (!UUID_RE.test(appId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.action !== 'approve' && body.action !== 'reject') {
    return NextResponse.json({ error: "action 은 'approve' 또는 'reject'" }, { status: 400 });
  }

  // 신청 조회
  const { data: appRow, error: appErr } = await supabaseAdmin
    .from('organization_applications')
    .select('*')
    .eq('id', appId)
    .maybeSingle();
  if (appErr) {
    return NextResponse.json({ error: appErr.message }, { status: 500 });
  }
  if (!appRow) {
    return NextResponse.json({ error: '신청을 찾을 수 없습니다' }, { status: 404 });
  }
  if (appRow.status !== 'pending') {
    return NextResponse.json({
      error: `이미 ${appRow.status === 'approved' ? '승인' : '거부'}된 신청입니다`,
    }, { status: 400 });
  }

  const decisionNote = (body.decision_note || '').trim() || null;

  // ──────────────────────────────────────────────
  // REJECT 분기
  // ──────────────────────────────────────────────
  if (body.action === 'reject') {
    const { error: updErr } = await supabaseAdmin
      .from('organization_applications')
      .update({
        status: 'rejected',
        decided_by: user.id,
        decided_at: new Date().toISOString(),
        decision_note: decisionNote,
      })
      .eq('id', appId);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  // ──────────────────────────────────────────────
  // APPROVE 분기
  // ──────────────────────────────────────────────
  let organizationId = body.assigned_organization_id?.trim() || null;
  let instituteId: string | null = null;
  const newInstituteName = (body.new_institute_name || appRow.proposed_institute_name || '본원').trim();

  // (a) 기존 학원에 배정 vs (b) 신규 학원 생성
  if (!organizationId) {
    // 신규 학원 생성
    const newOrgName = (body.new_organization_name || appRow.proposed_organization_name || '').trim();
    if (!newOrgName) {
      return NextResponse.json({
        error: 'assigned_organization_id 또는 new_organization_name 필요',
      }, { status: 400 });
    }
    // 같은 이름의 학원이 이미 있으면 그것 재사용 (race condition 회피)
    const { data: existingOrg } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('name', newOrgName)
      .maybeSingle();
    if (existingOrg) {
      organizationId = (existingOrg as { id: string }).id;
    } else {
      const { data: inserted, error: orgErr } = await supabaseAdmin
        .from('organizations')
        .insert({ name: newOrgName })
        .select('id')
        .single();
      if (orgErr || !inserted) {
        return NextResponse.json({ error: orgErr?.message || '학원 생성 실패' }, { status: 500 });
      }
      organizationId = (inserted as { id: string }).id;
    }
  } else {
    // 기존 학원 존재 검증
    if (!UUID_RE.test(organizationId)) {
      return NextResponse.json({ error: 'assigned_organization_id 형식 오류' }, { status: 400 });
    }
    const { data: orgRow } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('id', organizationId)
      .maybeSingle();
    if (!orgRow) {
      return NextResponse.json({ error: '지정한 학원이 존재하지 않습니다' }, { status: 400 });
    }
  }

  // 산하 센터 — 새 institute 생성 (같은 이름 있으면 재사용)
  {
    const { data: existingInst } = await supabaseAdmin
      .from('institutes')
      .select('id')
      .eq('name', newInstituteName)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (existingInst) {
      instituteId = (existingInst as { id: string }).id;
    } else {
      const { data: inserted, error: instErr } = await supabaseAdmin
        .from('institutes')
        .insert({ name: newInstituteName, organization_id: organizationId })
        .select('id')
        .single();
      if (instErr || !inserted) {
        return NextResponse.json({ error: instErr?.message || '센터 생성 실패' }, { status: 500 });
      }
      instituteId = (inserted as { id: string }).id;
    }
  }

  // 신청자 user 의 institute_id 박음
  const { error: userUpdErr } = await supabaseAdmin
    .from('users')
    .update({ institute_id: instituteId })
    .eq('id', appRow.applicant_user_id);
  if (userUpdErr) {
    console.error('[org-app PATCH] user institute_id 갱신 실패:', userUpdErr.message);
    // 학원/센터 생성은 성공 — 사용자 배정만 실패하면 어드민이 사후 사용자 배정 가능
  }

  // application 상태 갱신
  const { error: appUpdErr } = await supabaseAdmin
    .from('organization_applications')
    .update({
      status: 'approved',
      decided_by: user.id,
      decided_at: new Date().toISOString(),
      decision_note: decisionNote,
      assigned_organization_id: organizationId,
      assigned_institute_id: instituteId,
    })
    .eq('id', appId);
  if (appUpdErr) {
    return NextResponse.json({ error: appUpdErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: 'approved',
    organization_id: organizationId,
    institute_id: instituteId,
  });
}
