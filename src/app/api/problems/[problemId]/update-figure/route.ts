// ============================================================================
// POST /api/problems/[problemId]/update-figure
// 사용자가 GraphModal에서 수정한 그래프 데이터를 DB에 저장
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const { problemId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { figureType, rendering } = body;

    if (!figureType || !rendering) {
      return NextResponse.json(
        { error: 'figureType and rendering are required' },
        { status: 400 }
      );
    }

    // 1. 기존 문제 조회
    const { data: problem, error: fetchError } = await supabaseAdmin
      .from('problems')
      .select('id, ai_analysis')
      .eq('id', problemId)
      .single();

    if (fetchError || !problem) {
      return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
    }

    // 2. ai_analysis.figureData 업데이트
    const currentAnalysis = (problem.ai_analysis as Record<string, unknown>) || {};
    const currentFigureData = (currentAnalysis.figureData as Record<string, unknown>) || {};

    const updatedFigureData = {
      ...currentFigureData,
      figureType,
      rendering,
      confidence: 1.0, // 사용자 수정 → 최대 신뢰도
      description: (currentFigureData.description as string) || '사용자 수정 그래프',
    };

    const updatedAnalysis = {
      ...currentAnalysis,
      hasFigure: true,
      figureData: updatedFigureData,
      figureSource: 'user_edited' as const,
      figureEditedAt: new Date().toISOString(),
      figureEditedBy: 'user', // 나중에 auth user id로 교체 가능
    };

    // 3. DB 저장
    const { error: updateError } = await supabaseAdmin
      .from('problems')
      .update({ ai_analysis: updatedAnalysis })
      .eq('id', problemId);

    if (updateError) {
      console.error(`[update-figure] DB update failed:`, updateError.message);
      return NextResponse.json(
        { error: 'Failed to save figure', detail: updateError.message },
        { status: 500 }
      );
    }

    console.log(`[update-figure] ✅ Problem ${problemId}: graph edited and saved`);

    return NextResponse.json({
      success: true,
      problemId,
      figureSource: 'user_edited',
    });
  } catch (error) {
    console.error('[update-figure] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
