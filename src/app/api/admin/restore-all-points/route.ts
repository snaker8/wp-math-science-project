// ============================================================================
// POST /api/admin/restore-all-points
//   모든 exam_problems의 points를 각 문제 content_latex의 [N점]에서 재추출
//   하드코딩된 points: 4가 적용된 과거 자산화분을 원 배점으로 복원.
// ============================================================================

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  const authed = await requireAuth();
  if (!authed.ok) return authed.response;

  const { user } = authed;
  const isAdmin = user.role === 'ADMIN' || user.role === 'TEACHER' || user.role === 'TUTOR';
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin not configured' }, { status: 500 });
  }

  const rescanRegex = /\[\s*(?:총\s*)?(\d+(?:\.\d+)?)\s*점\s*\]/;

  // 1. 모든 문제 content_latex 로드 (페이징 처리: 1000 단위)
  const pointsByProblem = new Map<string, number>();
  let page = 0;
  const PAGE = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const from = page * PAGE;
    const { data: problems, error } = await supabaseAdmin
      .from('problems')
      .select('id, content_latex')
      .is('deleted_at', null)
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!problems || problems.length === 0) break;
    for (const p of problems) {
      const content = (p as any).content_latex || '';
      const m = content.match(rescanRegex);
      if (m) {
        const pts = Math.min(100, Math.max(0, parseFloat(m[1])));
        pointsByProblem.set((p as any).id, pts);
      }
    }
    if (problems.length < PAGE) break;
    page++;
  }

  // 2. exam_problems 일괄 업데이트 (매칭된 것만)
  let updated = 0;
  let scanned = 0;
  for (const [problemId, pts] of pointsByProblem) {
    const { error, count } = await supabaseAdmin
      .from('exam_problems')
      .update({ points: pts }, { count: 'exact' })
      .eq('problem_id', problemId);
    if (!error && count) {
      updated += count;
      scanned++;
    }
  }

  return NextResponse.json({
    success: true,
    problemsWithPoints: pointsByProblem.size,
    examProblemRowsUpdated: updated,
    uniqueProblemsScanned: scanned,
  });
}
