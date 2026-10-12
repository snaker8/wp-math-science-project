// ============================================================================
// 시험지 학부모 공유 토큰 API
// - POST /api/exams/[examId]/share : 토큰 생성 (없으면 새로, 있으면 그대로 반환)
// - GET  /api/exams/[examId]/share : 현재 토큰 조회 (강사용)
// - DELETE                          : 토큰 무효화 (공유 중단)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertExamAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

function generateToken(): string {
  // 32자 hex (16바이트)
  return randomBytes(16).toString('hex');
}

// ----------------------------------------------------------------------------
// GET — 현재 토큰 조회 (없으면 null)
// ----------------------------------------------------------------------------
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { examId } = await params;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }
  const guard = await assertExamAccess(supabaseAdmin, examId, authed.data.scope);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { data, error } = await supabaseAdmin
    .from('exams')
    .select('id, share_token, share_report_variant')
    .eq('id', examId)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
  }
  return NextResponse.json({ shareToken: data.share_token || null, variant: (data as { share_report_variant?: string | null }).share_report_variant ?? null });
}

// ----------------------------------------------------------------------------
// POST — 토큰 생성 / 기존 토큰 반환
// ----------------------------------------------------------------------------
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { examId } = await params;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }
  const guard = await assertExamAccess(supabaseAdmin, examId, authed.data.scope);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  // 1. 기존 토큰 확인
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('exams')
    .select('id, share_token, share_report_variant')
    .eq('id', examId)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
  }

  if (existing.share_token) {
    return NextResponse.json({ shareToken: existing.share_token, created: false, variant: (existing as { share_report_variant?: string | null }).share_report_variant ?? null });
  }

  // 2. 신규 토큰 생성 (충돌 시 재시도 — 매우 드뭄)
  let token = generateToken();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error: updateErr } = await supabaseAdmin
      .from('exams')
      .update({ share_token: token })
      .eq('id', examId);
    if (!updateErr) {
      return NextResponse.json({ shareToken: token, created: true });
    }
    // 유니크 충돌 시 재생성
    if (updateErr.code === '23505') {
      token = generateToken();
      continue;
    }
    return NextResponse.json(
      { error: 'Failed to create token', detail: updateErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ error: 'Token generation collisions' }, { status: 500 });
}

// ----------------------------------------------------------------------------
// DELETE — 공유 중단 (토큰 무효화)
// ----------------------------------------------------------------------------
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { examId } = await params;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }
  const guard = await assertExamAccess(supabaseAdmin, examId, authed.data.scope);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { error } = await supabaseAdmin
    .from('exams')
    .update({ share_token: null })
    .eq('id', examId);
  if (error) {
    return NextResponse.json({ error: 'Failed to revoke', detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ shareToken: null, revoked: true });
}

// ============================================================================
// PATCH — 리포트 버전 선택 (2026-10-12 대표: "자산화하다 보니 구분이 어렵다 — 링크 리포트 버전을 여러 개 선택할 수 있게")
//   body: { variant: string | null }  — report-brand.ts 의 키. null 이면 학원 자동.
// ============================================================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { examId } = await params;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }
  const guard = await assertExamAccess(supabaseAdmin, examId, authed.data.scope);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await request.json().catch(() => ({}))) as { variant?: unknown };
  const variant = body.variant === null || body.variant === '' ? null : body.variant;
  const { normalizeDesignKey } = await import('@/lib/report/report-brand');
  const key = variant === null ? null : normalizeDesignKey(variant);
  if (variant !== null && !key) {
    return NextResponse.json({ error: '알 수 없는 리포트 버전' }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from('exams').update({ share_report_variant: key }).eq('id', examId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, variant: key });
}
