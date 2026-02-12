// ============================================================================
// GET /api/exams/[examId] - 시험지 정보 + 연결된 문제 조회
// DELETE /api/exams/[examId] - 시험지 소프트 삭제 (deleted_at 업데이트)
// supabaseAdmin으로 RLS 바이패스
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    // 1. 시험지 정보 조회 (schema.sql 기준 컬럼)
    const { data: exam, error: examError } = await supabaseAdmin
      .from('exams')
      .select('id, title, description, status, total_points, created_at')
      .eq('id', examId)
      .single();

    if (examError) {
      console.error('[API/exams] Exam fetch error:', examError.message);
      return NextResponse.json(
        { error: 'Exam not found', detail: examError.message },
        { status: 404 }
      );
    }

    // 2. exam_problems → problems + classifications 조인 (schema.sql: sequence_number)
    const { data: examProblems, error: epError } = await supabaseAdmin
      .from('exam_problems')
      .select(`
        sequence_number,
        points,
        problem_id,
        problems (
          id,
          content_latex,
          solution_latex,
          answer_json,
          source_name,
          source_year,
          status,
          ai_analysis,
          tags,
          created_at,
          classifications (
            type_code,
            difficulty,
            cognitive_domain,
            ai_confidence
          )
        )
      `)
      .eq('exam_id', examId)
      .order('sequence_number', { ascending: true });

    if (epError) {
      console.error('[API/exams] exam_problems fetch error:', epError.message);
    }

    return NextResponse.json({
      exam,
      problems: examProblems || [],
      problemCount: examProblems?.length || 0,
    });
  } catch (err) {
    console.error('[API/exams] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE /api/exams/[examId] - 시험지 소프트 삭제
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    // soft delete: deleted_at 설정
    const { error } = await supabaseAdmin
      .from('exams')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', examId);

    if (error) {
      console.error('[API/exams] Delete error:', error.message);
      return NextResponse.json(
        { error: 'Failed to delete exam', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, examId });
  } catch (err) {
    console.error('[API/exams] Delete unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
