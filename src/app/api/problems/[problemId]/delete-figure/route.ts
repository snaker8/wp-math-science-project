// ============================================================================
// POST /api/problems/[problemId]/delete-figure
// AI 생성 도형(figureData, figureSvg) 삭제 — 크롭 이미지는 유지
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(
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
    // 1. 현재 ai_analysis 가져오기
    const { data: problem, error: fetchError } = await supabaseAdmin
      .from('problems')
      .select('ai_analysis')
      .eq('id', problemId)
      .single();

    if (fetchError || !problem) {
      return NextResponse.json(
        { error: 'Problem not found', detail: fetchError?.message },
        { status: 404 }
      );
    }

    // 2. figureData, figureSvg 키 제거
    const aiAnalysis = problem.ai_analysis || {};
    const { figureData, figureSvg, ...cleanedAnalysis } = aiAnalysis as Record<string, any>;

    // 3. 업데이트
    const { error: updateError } = await supabaseAdmin
      .from('problems')
      .update({ ai_analysis: cleanedAnalysis })
      .eq('id', problemId);

    if (updateError) {
      console.error('[delete-figure] Update error:', updateError.message);
      return NextResponse.json(
        { error: 'Failed to delete figure', detail: updateError.message },
        { status: 500 }
      );
    }

    console.log(`[delete-figure] Cleared figureData/figureSvg for problem ${problemId}`);
    return NextResponse.json({
      success: true,
      deleted: {
        hadFigureData: !!figureData,
        hadFigureSvg: !!figureSvg,
      },
    });
  } catch (err) {
    console.error('[delete-figure] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
