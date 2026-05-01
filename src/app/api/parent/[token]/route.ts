// ============================================================================
// GET /api/parent/[token]
//
// 학부모 페이지(/parent/[token])용 데이터. token 검증 후 학생 함정·약점·
// 진척 종합 반환. 인증 없이 호출 가능 (token 자체가 인증).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface PitfallSummaryRow {
  pitfall_code: string;
  pitfall_label: string | null;
  pitfall_category: string | null;
  occurrence_count: number;
  distinct_problem_count: number;
  first_occurred_at: string;
  last_occurred_at: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = supabaseAdmin;

  // 1) token 검증 + student_id 조회
  const { data: tokenRow, error: tErr } = await sb
    .from('parent_share_tokens')
    .select('token, student_id, label, expires_at, is_active')
    .eq('token', token)
    .maybeSingle();

  if (tErr || !tokenRow) {
    return NextResponse.json({ error: '유효하지 않은 링크입니다' }, { status: 404 });
  }
  if (!(tokenRow as { is_active: boolean }).is_active) {
    return NextResponse.json({ error: '비활성화된 링크입니다' }, { status: 403 });
  }
  const expiresAt = (tokenRow as { expires_at?: string }).expires_at;
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: '만료된 링크입니다' }, { status: 403 });
  }

  const studentId = (tokenRow as { student_id: string }).student_id;

  // 2) 학생 정보
  const { data: student } = await sb
    .from('users')
    .select('id, name, email, school, grade')
    .eq('id', studentId)
    .maybeSingle();

  // 3) 함정 누적 (v_student_pitfall_summary)
  const { data: summaryData } = await sb
    .schema('diagnostics' as never)
    .from('v_student_pitfall_summary')
    .select('pitfall_code, pitfall_label, pitfall_category, occurrence_count, distinct_problem_count, first_occurred_at, last_occurred_at')
    .eq('student_id', studentId)
    .order('occurrence_count', { ascending: false });

  // 4) 최근 7일 발생 빈도
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

  const summary = ((summaryData as PitfallSummaryRow[]) || []).map((r) => ({
    pitfallCode: r.pitfall_code,
    label: r.pitfall_label || r.pitfall_code,
    category: r.pitfall_category || '',
    occurrenceCount: Number(r.occurrence_count) || 0,
    distinctProblemCount: Number(r.distinct_problem_count) || 0,
    firstOccurredAt: r.first_occurred_at,
    lastOccurredAt: r.last_occurred_at,
    recentWeekCount: recentCount.get(r.pitfall_code) || 0,
  }));

  const newConnections = summary.filter(
    (s) => s.recentWeekCount > 0 && new Date(s.firstOccurredAt).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000
  );
  const intensifying = summary.filter(
    (s) => s.recentWeekCount > 0 && new Date(s.firstOccurredAt).getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000
  );

  // 5) last_viewed_at 갱신 (백그라운드)
  sb.from('parent_share_tokens')
    .update({ last_viewed_at: new Date().toISOString() })
    .eq('token', token)
    .then(({ error }) => {
      if (error) console.warn('[parent] last_viewed_at update 실패:', error.message);
    });

  return NextResponse.json({
    student: student
      ? {
          id: (student as { id?: string }).id,
          name: (student as { name?: string }).name || '학생',
          school: (student as { school?: string }).school || null,
          grade: (student as { grade?: string }).grade || null,
        }
      : { id: studentId, name: '학생', school: null, grade: null },
    label: (tokenRow as { label?: string }).label || null,
    totalOccurrences: summary.reduce((s, r) => s + r.occurrenceCount, 0),
    distinctPitfalls: summary.length,
    recentWeekTotal: Array.from(recentCount.values()).reduce((s, c) => s + c, 0),
    summary,
    newConnections,
    intensifying,
  });
}
