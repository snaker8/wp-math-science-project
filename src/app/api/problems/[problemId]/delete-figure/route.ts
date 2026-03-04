// ============================================================================
// POST /api/problems/[problemId]/delete-figure
// AI 생성 도형(figureData, figureSvg) 삭제 — 크롭 이미지 URL은 보존
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
    // 1. 현재 ai_analysis + images 가져오기
    const { data: problem, error: fetchError } = await supabaseAdmin
      .from('problems')
      .select('ai_analysis, images')
      .eq('id', problemId)
      .single();

    if (fetchError || !problem) {
      return NextResponse.json(
        { error: 'Problem not found', detail: fetchError?.message },
        { status: 404 }
      );
    }

    // 2. figureData에서 originalImageUrl 추출 (삭제 전에 보존)
    const aiAnalysis = problem.ai_analysis || {};
    const { figureData, figureSvg, ...cleanedAnalysis } = aiAnalysis as Record<string, any>;

    // ★ 크롭 이미지 URL 보존: figureData.originalImageUrl → ai_analysis.cropImageUrl
    const originalImageUrl = figureData?.originalImageUrl as string | undefined;
    if (originalImageUrl && !originalImageUrl.startsWith('data:')) {
      cleanedAnalysis.cropImageUrl = originalImageUrl;
      console.log(`[delete-figure] Preserved cropImageUrl: ${originalImageUrl.substring(0, 80)}...`);
    }

    // ★ images 배열에 crop 이미지가 없으면 추가 (복구)
    const images: Array<{ url: string; type: string; label: string }> =
      Array.isArray(problem.images) ? [...problem.images] : [];
    const hasCropImage = images.some(img => img.type === 'crop');

    let updateData: Record<string, any> = { ai_analysis: cleanedAnalysis };

    if (!hasCropImage && originalImageUrl && !originalImageUrl.startsWith('data:')) {
      images.push({ url: originalImageUrl, type: 'crop', label: '도형 크롭' });
      updateData.images = images;
      console.log(`[delete-figure] Restored crop image to images array`);
    }

    // 3. 업데이트
    const { error: updateError } = await supabaseAdmin
      .from('problems')
      .update(updateData)
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
      preserved: {
        cropImageUrl: !!originalImageUrl,
        restoredToImages: !hasCropImage && !!originalImageUrl,
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
