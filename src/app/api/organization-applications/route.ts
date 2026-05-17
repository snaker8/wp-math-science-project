// ============================================================================
// /api/organization-applications
//
// POST  — 신규 가맹 학원 신청 (가입 직후 사용자가 자유 입력한 학원이 매칭
//          안 됐을 때 호출). pending 상태로 INSERT, super_admin 승인 대기.
//
// GET   — super_admin 만 — 신청 목록 (?status=pending|approved|rejected|all)
//
// PATCH /[id] — super_admin 만 — 승인/거부 (별도 동적 라우트)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { apiError } from '@/lib/api/error';

export const dynamic = 'force-dynamic';

// ----------------------------------------------------------------------------
// POST — 가맹 신청
// ----------------------------------------------------------------------------
interface CreateBody {
  proposed_organization_name?: string;
  proposed_institute_name?: string;
  applicant_role?: string;
  applicant_full_name?: string;
  applicant_email?: string;
  applicant_phone?: string;
}

export async function POST(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const proposed_organization_name = (body.proposed_organization_name || '').trim();
  if (!proposed_organization_name) {
    return NextResponse.json({ error: '학원 이름은 필수입니다' }, { status: 400 });
  }

  // 동일 사용자의 pending 신청 중복 차단
  const { data: existing } = await supabaseAdmin
    .from('organization_applications')
    .select('id, status')
    .eq('applicant_user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      ok: true,
      application_id: (existing as { id: string }).id,
      already_pending: true,
    });
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('organization_applications')
    .insert({
      proposed_organization_name,
      proposed_institute_name: (body.proposed_institute_name || '').trim() || null,
      applicant_user_id: user.id,
      applicant_role: body.applicant_role || null,
      applicant_full_name: body.applicant_full_name || null,
      applicant_email: body.applicant_email || user.email || null,
      applicant_phone: body.applicant_phone || null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insErr || !inserted) {
    console.error('[organization-applications POST] insert error:', insErr?.message);
    return NextResponse.json({ error: insErr?.message || '신청 저장 실패' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    application_id: (inserted as { id: string }).id,
    already_pending: false,
  });
}

// ----------------------------------------------------------------------------
// GET — super_admin 만 — 신청 목록
// ----------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!scope.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden — super_admin 만 조회' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const sp = request.nextUrl.searchParams;
  const status = sp.get('status') || 'pending';
  const limit = Math.min(Math.max(parseInt(sp.get('limit') || '50') || 50, 1), 200);

  let query = supabaseAdmin
    .from('organization_applications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    return apiError('/api/organization-applications GET', error, 'Failed to load applications', 500);
  }

  return NextResponse.json({ applications: data || [] });
}
