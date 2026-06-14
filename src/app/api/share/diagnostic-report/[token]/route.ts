// ============================================================================
// GET /api/share/diagnostic-report/[token]
//   학부모 공개 페이지(/share/diagnostic-report/[token])용 데이터.
//   토큰 검증(active·미만료·report_kind=diagnostic_set) 후 종합 리포트 반환.
//   인증 없이 호출 (token 자체가 인증). 집계 코어는 compute-report.ts 공용.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { computeComprehensiveReport } from '@/lib/diagnostics/compute-report';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const sb = supabaseAdmin;

  const { data: tokenRow, error: tErr } = await sb
    .from('parent_share_tokens')
    .select('token, student_id, set_key, exam_ids, report_kind, is_active, expires_at, label')
    .eq('token', token)
    .maybeSingle();
  if (tErr || !tokenRow) return NextResponse.json({ error: '유효하지 않은 링크입니다' }, { status: 404 });

  const t = tokenRow as { student_id: string; set_key: string | null; exam_ids: string | null; report_kind: string; is_active: boolean; expires_at: string | null; label: string | null };
  if (!t.is_active) return NextResponse.json({ error: '비활성화된 링크입니다' }, { status: 403 });
  if (t.expires_at && new Date(t.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: '만료된 링크입니다' }, { status: 403 });
  }
  // ★ 자유 조합(exam_ids) 토큰은 set_key 가 'none::자유 조합' 합성값이라 examIds 로 계산.
  const examIds = t.exam_ids ? t.exam_ids.split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (t.report_kind !== 'diagnostic_set' || (!t.set_key && examIds.length === 0)) {
    return NextResponse.json({ error: '진단 종합 리포트 링크가 아닙니다' }, { status: 400 });
  }

  const result = await computeComprehensiveReport(
    sb, t.student_id, t.set_key || 'none::자유 조합',
    examIds.length > 0 ? examIds : undefined,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // last_viewed_at 갱신 (백그라운드)
  sb.from('parent_share_tokens').update({ last_viewed_at: new Date().toISOString() }).eq('token', token)
    .then(({ error }) => { if (error) console.warn('[share/diagnostic-report] last_viewed_at 실패:', error.message); });

  return NextResponse.json({ report: result.payload, label: t.label });
}
