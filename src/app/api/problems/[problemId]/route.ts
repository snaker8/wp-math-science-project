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
    const { content_latex, solution_latex, answer_json, images, difficulty, type_code, cognitive_domain } = body;

    // problems 테이블 업데이트
    const updateData: Record<string, any> = {};
    if (content_latex !== undefined) updateData.content_latex = content_latex;
    if (solution_latex !== undefined) updateData.solution_latex = solution_latex;
    if (answer_json !== undefined) updateData.answer_json = answer_json;
    if (images !== undefined) updateData.images = images;

    let problem = null;
    if (Object.keys(updateData).length > 0) {
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
      problem = data;
    }

    // classifications 테이블 업데이트 (난이도, 유형코드, 인지영역)
    if (difficulty !== undefined || type_code !== undefined || cognitive_domain !== undefined) {
      const classUpdate: Record<string, any> = { is_verified: true };
      if (difficulty !== undefined) classUpdate.difficulty = String(difficulty);
      if (type_code !== undefined) classUpdate.type_code = type_code;
      if (cognitive_domain !== undefined) classUpdate.cognitive_domain = cognitive_domain;

      const { error: clsError } = await supabaseAdmin
        .from('classifications')
        .update(classUpdate)
        .eq('problem_id', problemId);

      if (clsError) {
        // classifications 레코드가 없을 수 있으므로 insert 시도
        await supabaseAdmin.from('classifications').insert({
          problem_id: problemId,
          ...classUpdate,
          classification_source: 'MANUAL',
        });
      }
      console.log(`[API/problems] Classification updated: difficulty=${difficulty}, type_code=${type_code}`);
    }

    if (!problem && difficulty === undefined && type_code === undefined) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, problem });
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
