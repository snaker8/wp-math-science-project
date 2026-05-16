// ============================================================================
// POST /api/exams/[examId]/sync-answers-from-solutions
// 시험지의 모든 problems 순회 → answer_json.finalAnswer 비고 solution_latex
// 있으면 해설 패턴에서 정답 추출하여 박음.
//
// 사용처: 진단평가(BS_H1S1_R1 류) 등 자산화 시 빠른답 누락된 시험지 복구.
// "해설 박히면 빠른답 자동 추출" 회로의 사후 보강.
// 가드: PR #141 객관식 normalize + 박힘 차단 (feedback_objective_answer_safety).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertExamAccess } from '@/lib/security/institute-guard';
import { extractFinalAnswerFromSolution } from '@/lib/ocr/answer-parser';
import { normalizeObjectiveAnswer } from '@/lib/validation/objective-answer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  // 시험지 problems 목록
  const { data: examProblems, error: epErr } = await supabaseAdmin
    .from('exam_problems')
    .select('problem_id, sequence_number')
    .eq('exam_id', examId)
    .order('sequence_number');

  if (epErr || !examProblems || examProblems.length === 0) {
    return NextResponse.json({ error: '시험지에 문제가 없습니다.' }, { status: 404 });
  }

  const problemIds = examProblems.map((ep) => ep.problem_id);

  // problems 본문 (페이지네이션 — 1000 limit 사고 차단)
  const PAGE = 500;
  const problems: Array<{ id: string; answer_json: Record<string, unknown> | null; solution_latex: string | null }> = [];
  for (let i = 0; i < problemIds.length; i += PAGE) {
    const slice = problemIds.slice(i, i + PAGE);
    const { data, error } = await supabaseAdmin
      .from('problems')
      .select('id, answer_json, solution_latex')
      .in('id', slice);
    if (error) {
      console.error('[sync-answers-from-solutions] problems fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (data) problems.push(...(data as typeof problems));
  }

  let updatedCount = 0;
  let skippedAlreadyFilled = 0;
  let skippedNoSolution = 0;
  let skippedNoExtraction = 0;
  const failed: Array<{ problemId: string; reason: string }> = [];
  const sample: Array<{ problemId: string; extracted: string; type: string }> = [];

  for (const p of problems) {
    const aj = (p.answer_json || {}) as Record<string, unknown>;
    const currentAnswer = String(aj.finalAnswer ?? aj.correct_answer ?? '').trim();

    if (currentAnswer) {
      skippedAlreadyFilled++;
      continue;
    }
    if (!p.solution_latex || !p.solution_latex.trim()) {
      skippedNoSolution++;
      continue;
    }

    const extracted = extractFinalAnswerFromSolution(p.solution_latex);
    if (!extracted) {
      skippedNoExtraction++;
      continue;
    }

    // 객관식 여부 — answer_json.type 또는 choices 배열
    const isObjective =
      aj.type === 'multiple_choice' ||
      (Array.isArray(aj.choices) && (aj.choices as unknown[]).length > 0);
    const safeAns = isObjective ? normalizeObjectiveAnswer(extracted.answer) : extracted.answer;

    if (!safeAns) {
      // 객관식 normalize 결과 빈값 — 추출은 됐지만 무효 (예: numeric 인데 객관식 슬롯)
      skippedNoExtraction++;
      continue;
    }

    const merged = {
      ...aj,
      finalAnswer: safeAns,
      correct_answer: safeAns,
      sync_source: 'solution_extract',
      sync_at: new Date().toISOString(),
    };

    const { error: updErr } = await supabaseAdmin
      .from('problems')
      .update({ answer_json: merged })
      .eq('id', p.id);

    if (updErr) {
      console.error(`[sync-answers-from-solutions] update 실패 ${p.id}:`, updErr.message);
      failed.push({ problemId: p.id, reason: updErr.message });
    } else {
      updatedCount++;
      if (sample.length < 10) {
        sample.push({ problemId: p.id, extracted: safeAns, type: extracted.answerType });
      }
    }
  }

  console.log(
    `[sync-answers-from-solutions] examId=${examId} totalProblems=${problems.length} updated=${updatedCount} ` +
    `skippedFilled=${skippedAlreadyFilled} skippedNoSol=${skippedNoSolution} skippedNoExtract=${skippedNoExtraction} failed=${failed.length}`
  );

  return NextResponse.json({
    examId,
    totalProblems: problems.length,
    updatedCount,
    skippedAlreadyFilled,
    skippedNoSolution,
    skippedNoExtraction,
    failed,
    sample,
  });
}
