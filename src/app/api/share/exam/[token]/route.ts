// ============================================================================
// 학부모 공유 — 공개 분석 데이터 조회 API
// GET /api/share/exam/[token]
// 인증 없이 접근 가능 (토큰만 알면 OK). 미들웨어에서 /api/share/* 우회.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { ExamAIAnalysis } from '@/types/exam-ai-analysis';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  // 1. 토큰으로 시험지 조회 (problem_count는 exam_problems count로 derive)
  const { data: examRows, error: examErr } = await supabaseAdmin
    .from('exams')
    .select('id, title, grade, subject, total_points, ai_analysis, created_at, share_token')
    .eq('share_token', token);

  console.log('[share/exam] token=', token, 'rows=', examRows?.length, 'err=', examErr?.message);

  if (examErr) {
    return NextResponse.json(
      { error: 'DB query error', detail: examErr.message },
      { status: 500 }
    );
  }
  if (!examRows || examRows.length === 0) {
    return NextResponse.json(
      { error: 'Share link not found or revoked', token },
      { status: 404 }
    );
  }
  const exam = examRows[0];

  const ai = exam.ai_analysis as Record<string, unknown> | null;
  const hasAnalysis = !!(ai && typeof ai === 'object' && 'generatedAt' in ai);

  // 2. 시험지 + 분류 통계 조회 (난이도/단원 분포 차트용)
  const { data: examProblems } = await supabaseAdmin
    .from('exam_problems')
    .select('points, problem_id')
    .eq('exam_id', exam.id);

  const problemIds = (examProblems || []).map((p) => p.problem_id).filter(Boolean) as string[];

  const { data: classifications } = await supabaseAdmin
    .from('classifications')
    .select('problem_id, type_code, expanded_type_code, difficulty, cognitive_domain')
    .in('problem_id', problemIds);

  // 3. 통계 집계 (난이도 분포 / 인지영역 분포 / 단원 분포)
  const total = examProblems?.length || 0;
  const totalPoints =
    examProblems?.reduce((sum, p) => sum + (Number(p.points) || 0), 0) || exam.total_points || 0;

  const diffDist: Record<number, number> = {};
  for (let i = 1; i <= 10; i++) diffDist[i] = 0;
  const domDist: Record<string, number> = {
    CALCULATION: 0,
    UNDERSTANDING: 0,
    INFERENCE: 0,
    PROBLEM_SOLVING: 0,
  };

  (classifications || []).forEach((c) => {
    const d = Math.min(10, Math.max(1, parseInt(String(c.difficulty), 10) || 0));
    if (d > 0) diffDist[d] = (diffDist[d] || 0) + 1;
    const dom = c.cognitive_domain || 'UNDERSTANDING';
    domDist[dom] = (domDist[dom] || 0) + 1;
  });

  const avgDifficulty =
    total > 0
      ? (classifications || []).reduce(
          (sum, c) => sum + (parseInt(String(c.difficulty), 10) || 0),
          0
        ) / total
      : 0;

  return NextResponse.json({
    exam: {
      id: exam.id,
      title: exam.title,
      grade: exam.grade,
      subject: exam.subject,
      problemCount: total,
      totalPoints,
      createdAt: exam.created_at as string,
    },
    stats: {
      total,
      totalPoints,
      avgDifficulty: Math.round(avgDifficulty * 10) / 10,
      diffDist,
      domDist,
    },
    analysis: hasAnalysis ? (ai as unknown as ExamAIAnalysis) : null,
  });
}
