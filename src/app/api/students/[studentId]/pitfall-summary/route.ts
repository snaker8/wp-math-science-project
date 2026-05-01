// ============================================================================
// GET /api/students/[studentId]/pitfall-summary
//
// 학생별 함정 누적 통계 — 카파시 self-compiling 4번째 차원 시각화 base.
// diagnostics.v_student_pitfall_summary 뷰 + 최근 발생 이력 + 트렌드.
// 학부모 대시보드 "이번 주 새 연결" 위젯 + 학생 약점 히트맵용.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

interface SummaryRow {
  pitfallCode: string;
  label: string;
  category: string;
  occurrenceCount: number;
  distinctProblemCount: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
  /** 최근 7일 발생 빈도 (이번 주 새 연결용) */
  recentWeekCount: number;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { studentId } = await params;
  if (!studentId) {
    return NextResponse.json({ error: 'studentId required' }, { status: 400 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = supabaseAdmin;

  // 누적 빈도 — v_student_pitfall_summary 활용
  const { data: summaryData, error: sumErr } = await sb
    .schema('diagnostics' as never)
    .from('v_student_pitfall_summary')
    .select('pitfall_code, pitfall_label, pitfall_category, occurrence_count, distinct_problem_count, first_occurred_at, last_occurred_at')
    .eq('student_id', studentId)
    .order('occurrence_count', { ascending: false });

  if (sumErr) {
    console.error('[pitfall-summary] view fetch error:', sumErr.message);
    return NextResponse.json({ error: 'Failed to fetch summary', detail: sumErr.message }, { status: 500 });
  }

  // 최근 7일 발생 빈도 — student_pitfall_history 직접 조회
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentData } = await sb
    .schema('diagnostics' as never)
    .from('student_pitfall_history')
    .select('pitfall_code')
    .eq('student_id', studentId)
    .gte('occurred_at', sevenDaysAgo);

  const recentCount = new Map<string, number>();
  (recentData || []).forEach((r: Record<string, unknown>) => {
    const code = String(r.pitfall_code || '');
    if (code) recentCount.set(code, (recentCount.get(code) || 0) + 1);
  });

  const summary: SummaryRow[] = (summaryData || []).map((r: Record<string, unknown>) => ({
    pitfallCode: String(r.pitfall_code || ''),
    label: String(r.pitfall_label || r.pitfall_code || ''),
    category: String(r.pitfall_category || ''),
    occurrenceCount: Number(r.occurrence_count) || 0,
    distinctProblemCount: Number(r.distinct_problem_count) || 0,
    firstOccurredAt: String(r.first_occurred_at || ''),
    lastOccurredAt: String(r.last_occurred_at || ''),
    recentWeekCount: recentCount.get(String(r.pitfall_code || '')) || 0,
  }));

  // 카테고리별 합계
  const byCategory = new Map<string, number>();
  summary.forEach((s) => {
    byCategory.set(s.category, (byCategory.get(s.category) || 0) + s.occurrenceCount);
  });

  return NextResponse.json({
    studentId,
    totalOccurrences: summary.reduce((s, r) => s + r.occurrenceCount, 0),
    distinctPitfalls: summary.length,
    recentWeekTotal: Array.from(recentCount.values()).reduce((s, c) => s + c, 0),
    byCategory: Array.from(byCategory.entries()).map(([category, count]) => ({ category, count })),
    summary,
  });
}
