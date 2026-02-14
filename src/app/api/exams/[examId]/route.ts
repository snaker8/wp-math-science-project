// ============================================================================
// GET /api/exams/[examId] - 시험지 정보 + 연결된 문제 조회
// PATCH /api/exams/[examId] - 시험지 수정 (제목, 북그룹 이동)
// DELETE /api/exams/[examId] - 시험지 완전 삭제 (hard delete)
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
      .select('id, title, description, status, total_points, book_group_id, created_at')
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
// PATCH /api/exams/[examId] - 시험지 수정 (제목 변경, 북그룹 이동)
// ============================================================================

export async function PATCH(
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
    const body = await request.json();
    const { title, bookGroupId } = body;

    const updateData: Record<string, any> = {};

    if (title !== undefined) updateData.title = title.trim();
    if (bookGroupId !== undefined) updateData.book_group_id = bookGroupId; // null allowed (move to unclassified)

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const { data: exam, error } = await supabaseAdmin
      .from('exams')
      .update(updateData)
      .eq('id', examId)
      .select('id, title, book_group_id')
      .single();

    if (error) {
      console.error('[API/exams] Patch error:', error.message);
      return NextResponse.json(
        { error: 'Failed to update exam', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ exam });
  } catch (err) {
    console.error('[API/exams] Patch unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE /api/exams/[examId] - 시험지 완전 삭제 (hard delete)
// exam_problems, exam_records, exam_answers는 CASCADE로 자동 삭제
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
    // Hard delete: DB에서 완전 삭제 (CASCADE로 연관 테이블 자동 정리)
    const { error } = await supabaseAdmin
      .from('exams')
      .delete()
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
