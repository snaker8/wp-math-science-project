// ============================================================================
// PATCH /api/problems/[problemId] - 문제 내용 수정
// DELETE /api/problems/[problemId] - 문제 삭제
// supabaseAdmin으로 RLS 바이패스
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const { problemId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { content_latex, solution_latex, answer_json } = body;

    // 업데이트할 필드만 포함
    const updateData: Record<string, any> = {};
    if (content_latex !== undefined) updateData.content_latex = content_latex;
    if (solution_latex !== undefined) updateData.solution_latex = solution_latex;
    if (answer_json !== undefined) updateData.answer_json = answer_json;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('problems')
      .update(updateData)
      .eq('id', problemId)
      .select('id, content_latex, solution_latex, answer_json')
      .single();

    if (error) {
      console.error('[API/problems] Update error:', error.message);
      return NextResponse.json(
        { error: 'Failed to update problem', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, problem: data });
  } catch (err) {
    console.error('[API/problems] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE /api/problems/[problemId] - 문제 삭제
// ============================================================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const { problemId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    // 1. 분류 데이터 먼저 삭제 (외래키 관계)
    await supabaseAdmin
      .from('classifications')
      .delete()
      .eq('problem_id', problemId);

    // 2. exam_problems 연결 삭제
    await supabaseAdmin
      .from('exam_problems')
      .delete()
      .eq('problem_id', problemId);

    // 3. 문제 본체 삭제
    const { error } = await supabaseAdmin
      .from('problems')
      .delete()
      .eq('id', problemId);

    if (error) {
      console.error('[API/problems] Delete error:', error.message);
      return NextResponse.json(
        { error: 'Failed to delete problem', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, deleted: problemId });
  } catch (err) {
    console.error('[API/problems] Delete unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
