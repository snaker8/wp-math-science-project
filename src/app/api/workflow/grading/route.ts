// ============================================================================
// Deep Grading API - 4단계 채점 저장 및 히트맵 자동 업데이트
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { GradingStatus, GradingRecord } from '@/types/workflow';
import { GRADING_WEIGHTS } from '@/lib/workflow/deep-grading';

/**
 * POST /api/workflow/grading
 * 채점 결과 저장 (4단계 채점)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const body = await request.json();

    const {
      examRecordId,
      examProblemId,
      problemId,
      status,
      feedback,
      timeSpentSeconds,
    }: {
      examRecordId: string;
      examProblemId: string;
      problemId: string;
      status: GradingStatus;
      feedback?: string;
      timeSpentSeconds?: number;
    } = body;

    // 유효성 검사
    if (!examRecordId || !examProblemId || !problemId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const validStatuses: GradingStatus[] = ['CORRECT', 'PARTIAL_CORRECT', 'PARTIAL_WRONG', 'WRONG'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid grading status' },
        { status: 400 }
      );
    }

    // 점수 계산
    const earnedPoints = GRADING_WEIGHTS[status];

    if (!supabase) {
      // Supabase 미설정 시 Mock 응답
      const mockRecord: GradingRecord = {
        id: crypto.randomUUID(),
        examId: 'mock-exam',
        studentId: 'mock-student',
        problemId,
        gradedBy: 'mock-teacher',
        status,
        score: earnedPoints,
        feedback,
        timeSpentSeconds,
        gradedAt: new Date().toISOString(),
      };

      return NextResponse.json({
        success: true,
        record: mockRecord,
        message: 'Grading saved (mock)',
      });
    }

    // 현재 사용자 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 배점 조회
    const { data: examProblem, error: epError } = await supabase
      .from('exam_problems')
      .select('points')
      .eq('id', examProblemId)
      .single();

    if (epError) {
      console.error('Error fetching exam problem:', epError);
    }

    const maxPoints = examProblem?.points || 10;
    const calculatedPoints = (earnedPoints / 100) * maxPoints;

    // exam_answers 업데이트 또는 삽입
    const { data: answer, error: answerError } = await supabase
      .from('exam_answers')
      .upsert({
        exam_record_id: examRecordId,
        exam_problem_id: examProblemId,
        problem_id: problemId,
        grading_status: status,
        earned_points: calculatedPoints,
        max_points: maxPoints,
        teacher_feedback: feedback,
        is_reviewed: true,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        time_spent_seconds: timeSpentSeconds,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'exam_record_id,exam_problem_id',
      })
      .select()
      .single();

    if (answerError) {
      console.error('Error saving answer:', answerError);
      return NextResponse.json(
        { error: 'Failed to save grading', details: answerError.message },
        { status: 500 }
      );
    }

    // 학생 ID 조회
    const { data: examRecord } = await supabase
      .from('exam_records')
      .select('student_id, exam_id')
      .eq('id', examRecordId)
      .single();

    // student_analytics 업데이트는 DB 트리거로 자동 처리됨
    // (schema.sql의 update_student_analytics_on_answer 트리거)

    // 시험 전체 점수 재계산
    if (examRecord) {
      await recalculateExamScore(supabase, examRecordId);
    }

    return NextResponse.json({
      success: true,
      record: {
        id: answer.id,
        examId: examRecord?.exam_id,
        studentId: examRecord?.student_id,
        problemId,
        gradedBy: user.id,
        status,
        score: calculatedPoints,
        feedback,
        gradedAt: answer.reviewed_at,
      },
      message: '채점이 저장되었습니다.',
    });
  } catch (error) {
    console.error('[Grading API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workflow/grading?examId=xxx&studentId=xxx
 * 채점 결과 조회
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const searchParams = request.nextUrl.searchParams;
    const examId = searchParams.get('examId');
    const studentId = searchParams.get('studentId');

    if (!examId) {
      return NextResponse.json(
        { error: 'examId is required' },
        { status: 400 }
      );
    }

    if (!supabase) {
      // Mock 데이터 반환
      return NextResponse.json({
        answers: [],
        summary: {
          total: 0,
          graded: 0,
          correct: 0,
          partialCorrect: 0,
          partialWrong: 0,
          wrong: 0,
        },
      });
    }

    // exam_record 조회
    let query = supabase
      .from('exam_records')
      .select('id')
      .eq('exam_id', examId);

    if (studentId) {
      query = query.eq('student_id', studentId);
    }

    const { data: records, error: recordsError } = await query;

    if (recordsError || !records || records.length === 0) {
      return NextResponse.json({
        answers: [],
        summary: {
          total: 0,
          graded: 0,
          correct: 0,
          partialCorrect: 0,
          partialWrong: 0,
          wrong: 0,
        },
      });
    }

    const recordIds = records.map((r) => r.id);

    // 답안 조회
    const { data: answers, error: answersError } = await supabase
      .from('exam_answers')
      .select(`
        id,
        exam_record_id,
        problem_id,
        grading_status,
        earned_points,
        max_points,
        teacher_feedback,
        reviewed_at,
        exam_records!inner (
          student_id,
          exam_id
        )
      `)
      .in('exam_record_id', recordIds);

    if (answersError) {
      console.error('Error fetching answers:', answersError);
      return NextResponse.json(
        { error: 'Failed to fetch answers' },
        { status: 500 }
      );
    }

    // 통계 계산
    const summary = {
      total: answers?.length || 0,
      graded: 0,
      correct: 0,
      partialCorrect: 0,
      partialWrong: 0,
      wrong: 0,
    };

    answers?.forEach((answer) => {
      if (answer.grading_status) {
        summary.graded++;
        switch (answer.grading_status) {
          case 'CORRECT':
            summary.correct++;
            break;
          case 'PARTIAL_CORRECT':
            summary.partialCorrect++;
            break;
          case 'PARTIAL_WRONG':
            summary.partialWrong++;
            break;
          case 'WRONG':
            summary.wrong++;
            break;
        }
      }
    });

    return NextResponse.json({
      answers: answers || [],
      summary,
    });
  } catch (error) {
    console.error('[Grading API] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

async function recalculateExamScore(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  examRecordId: string
) {
  // 해당 시험 기록의 모든 답안 조회
  const { data: answers, error } = await supabase
    .from('exam_answers')
    .select('earned_points, max_points')
    .eq('exam_record_id', examRecordId);

  if (error || !answers) return;

  const totalScore = answers.reduce((sum, a) => sum + (a.earned_points || 0), 0);
  const maxScore = answers.reduce((sum, a) => sum + (a.max_points || 0), 0);
  const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

  // exam_records 업데이트
  await supabase
    .from('exam_records')
    .update({
      total_score: totalScore,
      max_score: maxScore,
      score_percentage: percentage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', examRecordId);
}
