// ============================================================================
// GET /api/corrections/summary
//
// 분류 보정 누적 통계 — 카파시 self-compiling 가시화 (Phase C-2c-4).
// 1) 총 보정 수 + 최근 7일/30일 추이
// 2) 자주 보정되는 변환 패턴 TOP (before_code → after_code)
// 3) after_code 영역(stage1Code prefix)별 누적
// 4) 최근 보정 이력 리스트 (간략)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireEditor } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

interface CorrectionRow {
  before_code: string | null;
  after_code: string;
  after_type_name: string | null;
  exam_subject: string | null;
  reason: string | null;
  corrected_at: string;
}

export async function GET(_request: NextRequest) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = supabaseAdmin;

  const { data, error } = await sb
    .from('classification_corrections')
    .select('before_code, after_code, after_type_name, exam_subject, reason, corrected_at')
    .order('corrected_at', { ascending: false });

  if (error) {
    console.error('[corrections/summary] fetch error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data || []) as CorrectionRow[];
  const now = Date.now();
  const sevenDays = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDays = now - 30 * 24 * 60 * 60 * 1000;

  let recent7 = 0;
  let recent30 = 0;
  const transitions = new Map<string, { count: number; afterTypeName: string | null }>();
  const subjectAreaMap = new Map<string, number>(); // stage1Code prefix(예: MS09-02)별
  const dailyMap = new Map<string, number>(); // YYYY-MM-DD별 (최근 30일)

  for (const r of rows) {
    const t = new Date(r.corrected_at).getTime();
    if (t >= sevenDays) recent7++;
    if (t >= thirtyDays) recent30++;

    const key = `${r.before_code || '(없음)'} → ${r.after_code}`;
    const cur = transitions.get(key);
    if (cur) cur.count++;
    else transitions.set(key, { count: 1, afterTypeName: r.after_type_name });

    if (r.after_code.startsWith('MS')) {
      const prefix = r.after_code.split('-').slice(0, 2).join('-');
      subjectAreaMap.set(prefix, (subjectAreaMap.get(prefix) || 0) + 1);
    }

    if (t >= thirtyDays) {
      const day = new Date(r.corrected_at).toISOString().slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    }
  }

  const topTransitions = Array.from(transitions.entries())
    .map(([transition, v]) => ({ transition, count: v.count, afterTypeName: v.afterTypeName }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const topAreas = Array.from(subjectAreaMap.entries())
    .map(([prefix, count]) => ({ prefix, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 일별 추이 (최근 30일, 빈 날도 0으로 채움)
  const daily: Array<{ date: string; count: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    daily.push({ date: d, count: dailyMap.get(d) || 0 });
  }

  // 최근 보정 리스트 (상위 20건)
  const recentList = rows.slice(0, 20).map((r) => ({
    beforeCode: r.before_code,
    afterCode: r.after_code,
    afterTypeName: r.after_type_name,
    examSubject: r.exam_subject,
    reason: r.reason,
    correctedAt: r.corrected_at,
  }));

  return NextResponse.json({
    total: rows.length,
    recent7,
    recent30,
    topTransitions,
    topAreas,
    daily,
    recent: recentList,
  });
}
