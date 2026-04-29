// POST /api/exams/[examId]/recover
// auto-fix FIX 2가 잘못 붙인 (1)(2) 소문제를 content에서 분리하여 choices로 복원

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    // 1. 시험지의 모든 문제 조회
    const { data: examProblems } = await supabaseAdmin
      .from('exam_problems')
      .select('problem_id, sequence_number')
      .eq('exam_id', examId)
      .order('sequence_number');

    if (!examProblems || examProblems.length === 0) {
      return NextResponse.json({ message: '문제가 없습니다.', recovered: 0 });
    }

    const problemIds = examProblems.map(ep => ep.problem_id);
    const seqMap = new Map(examProblems.map(ep => [ep.problem_id, ep.sequence_number]));

    const { data: problems } = await supabaseAdmin
      .from('problems')
      .select('id, content_latex, answer_json')
      .in('id', problemIds);

    if (!problems) {
      return NextResponse.json({ message: '문제 조회 실패', recovered: 0 });
    }

    let recovered = 0;
    const details: string[] = [];

    for (const problem of problems) {
      const seqNum = seqMap.get(problem.id) || 0;
      const content = problem.content_latex || '';
      const answerJson = (problem.answer_json as Record<string, unknown>) || {};
      const choices = (answerJson.choices as string[]) || [];

      // 감지: choices가 비어있고 content에 \n\n(1) ... \n(2) ... 패턴이 있으면 복구 대상
      if (choices.length === 0) {
        // 패턴: content 중간에 \n\n 후 (1) 또는 (N)으로 시작하는 블록
        const splitMatch = content.match(/^([\s\S]*?)\n\n(\(\d+\)\s[\s\S]+)$/);
        if (splitMatch) {
          const originalContent = splitMatch[1].trim();
          const appendedText = splitMatch[2];

          // (N) 패턴으로 분리
          const subProblems = appendedText.split(/(?=\(\d+\)\s)/).filter((s: string) => s.trim());

          if (subProblems.length >= 2) {
            // choices로 복원 (번호 제거)
            const restoredChoices = subProblems.map((s: string) =>
              s.replace(/^\(\d+\)\s*/, '').trim()
            );

            await supabaseAdmin
              .from('problems')
              .update({
                content_latex: originalContent,
                answer_json: { ...answerJson, choices: restoredChoices },
              })
              .eq('id', problem.id);

            recovered++;
            details.push(`#${seqNum}: content 분리 → ${restoredChoices.length}개 choices 복원`);
          }
        }
      }
    }

    return NextResponse.json({
      examId,
      totalProblems: problems.length,
      recovered,
      details,
    });
  } catch (error) {
    console.error('[recover] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
