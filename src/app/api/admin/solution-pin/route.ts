// ============================================================================
// 해설 생성 PIN 관리 API
// GET  /api/admin/solution-pin           → { isSet, approver } (인증 사용자 기준)
// POST /api/admin/solution-pin { pin }   → 설정/변경 (ADMIN·ORG_ADMIN·super_admin 만)
// POST { verify: true, pin }             → PIN 검증만 (강사가 프롬프트 입력값 확인용)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { hashSolutionPin, isSolutionApprover, resolveSolutionPinHash } from '@/lib/security/solution-pin';

export async function GET() {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const resolved = await resolveSolutionPinHash(scope.instituteId, scope.organizationId);
  return NextResponse.json({
    isSet: !!resolved.hash,
    // 'organization' = 학원 전체 공용 / 'institute' = 이 센터 전용 (센터 값이 우선)
    scopeLabel: resolved.scopeLabel,
    approver: isSolutionApprover(scope),
  });
}

export async function POST(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  let body: { pin?: string; verify?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  const pin = (body.pin || '').trim();
  if (!/^\d{4,8}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN은 숫자 4~8자리입니다.' }, { status: 400 });
  }
  if (!scope.instituteId) {
    return NextResponse.json({ error: '소속 센터가 없습니다.' }, { status: 400 });
  }

  // 검증 모드 — 누구나 자기 센터 PIN 을 확인해 볼 수 있다 (게이트 통과용)
  if (body.verify) {
    const resolved = await resolveSolutionPinHash(scope.instituteId, scope.organizationId);
    if (!resolved.hash) return NextResponse.json({ ok: false, code: 'PIN_NOT_SET' }, { status: 403 });
    const ok = hashSolutionPin(pin) === resolved.hash;
    return NextResponse.json({ ok }, { status: ok ? 200 : 403 });
  }

  // 설정 모드 — 승인 주체(관리자)만
  if (!isSolutionApprover(scope)) {
    return NextResponse.json({ error: 'PIN 설정은 관리자만 가능합니다.' }, { status: 403 });
  }
  // ★ 저장 범위 (2026-08-29): 학원 관리자(super_admin·ORG_ADMIN)는 학원 단위로 저장 →
  //   산하 전 센터에 한 번에 적용. 센터 원장(ADMIN)은 자기 센터만.
  //   센터 값이 있으면 게이트에서 센터가 우선하므로, 센터 원장의 개별 설정도 유효하다.
  const asOrganization = scope.isSuperAdmin || scope.role === 'ORG_ADMIN';
  const hash = hashSolutionPin(pin);

  if (asOrganization) {
    // super_admin 이 organization_id 를 안 가진 경우가 있어 센터에서 역추적
    let orgId = scope.organizationId;
    if (!orgId && scope.instituteId) {
      const { data } = await supabaseAdmin
        .from('institutes').select('organization_id').eq('id', scope.instituteId).maybeSingle();
      orgId = (data as { organization_id: string | null } | null)?.organization_id ?? null;
    }
    if (orgId) {
      const { error } = await supabaseAdmin
        .from('organizations').update({ solution_pin_hash: hash }).eq('id', orgId);
      if (error) return NextResponse.json({ error: 'PIN 저장에 실패했습니다.' }, { status: 500 });
      return NextResponse.json({ ok: true, scopeLabel: 'organization' });
    }
  }

  const { error } = await supabaseAdmin
    .from('institutes')
    .update({ solution_pin_hash: hash })
    .eq('id', scope.instituteId);
  if (error) {
    return NextResponse.json({ error: 'PIN 저장에 실패했습니다.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, scopeLabel: 'institute' });
}
