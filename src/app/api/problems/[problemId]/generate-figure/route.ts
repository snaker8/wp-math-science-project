// ============================================================================
// POST /api/problems/[problemId]/generate-figure
// 문제의 도형 이미지를 AI Vision으로 분석하여 구조화된 데이터 + 클린 렌더링 생성
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { interpretImage } from '@/lib/vision/image-interpreter';
import { generateGeometrySVG } from '@/lib/vision/figure-renderer';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const { problemId } = await params;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OpenAI API key not configured' },
      { status: 503 }
    );
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  try {
    // 1. 문제 데이터 조회 (이미지 URL 필요)
    const { data: problem, error: fetchError } = await supabaseAdmin
      .from('problems')
      .select('id, content_latex, images, ai_analysis')
      .eq('id', problemId)
      .single();

    if (fetchError || !problem) {
      return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
    }

    // 2. 도형 이미지 URL 찾기
    const images: Array<{ url: string; type: string; label: string }> =
      Array.isArray(problem.images) ? problem.images : [];

    const cropImage = images.find((img) => img.type === 'crop');

    if (!cropImage?.url) {
      return NextResponse.json(
        { error: 'No crop image found for this problem.' },
        { status: 400 }
      );
    }

    console.log(`[generate-figure] Processing problem ${problemId}, image: ${cropImage.url.substring(0, 80)}...`);

    // 3. 이미지를 서버에서 다운로드하여 base64로 변환
    //    (GPT-4o Vision이 Supabase Storage URL에 직접 접근 불가)
    let imageDataUri: string;
    try {
      const imgRes = await fetch(cropImage.url);
      if (!imgRes.ok) {
        console.error(`[generate-figure] Image download failed: ${imgRes.status}`);
        return NextResponse.json(
          { error: `Failed to download crop image (${imgRes.status})` },
          { status: 400 }
        );
      }
      const imgBuffer = await imgRes.arrayBuffer();
      const base64 = Buffer.from(imgBuffer).toString('base64');
      const contentType = imgRes.headers.get('content-type') || 'image/png';
      imageDataUri = `data:${contentType};base64,${base64}`;
      console.log(`[generate-figure] Image downloaded: ${Math.round(imgBuffer.byteLength / 1024)}KB`);
    } catch (dlErr) {
      console.error(`[generate-figure] Image download error:`, dlErr);
      return NextResponse.json(
        { error: 'Failed to download crop image' },
        { status: 400 }
      );
    }

    // 4. 구조화된 Vision 해석 (image-interpreter 사용)
    const contentContext = problem.content_latex
      ? problem.content_latex.substring(0, 500)
      : undefined;

    const interpreted = await interpretImage(imageDataUri, contentContext);

    console.log(`[generate-figure] Problem ${problemId}: type=${interpreted.figureType}, confidence=${interpreted.confidence}`);

    // 5. 도형 없음 처리 (photo 타입 + 낮은 confidence)
    if (interpreted.figureType === 'photo' || interpreted.confidence < 0.3) {
      console.log(`[generate-figure] Problem ${problemId}: No figure detected (${interpreted.figureType}, confidence: ${interpreted.confidence})`);

      const currentAnalysis = (problem.ai_analysis as Record<string, unknown>) || {};
      await supabaseAdmin
        .from('problems')
        .update({
          ai_analysis: { ...currentAnalysis, hasFigure: false },
        })
        .eq('id', problemId);

      return NextResponse.json({
        success: true,
        noFigure: true,
        message: 'No figure detected in this problem',
        problemId,
      });
    }

    // 6. 레거시 figureSvg 생성 (하위 호환성)
    let legacySvg: string | undefined;
    if (interpreted.rendering?.type === 'geometry') {
      legacySvg = generateGeometrySVG(interpreted.rendering) || undefined;
    }

    // 7. DB 저장 (figureData + figureSvg)
    const currentAnalysis = (problem.ai_analysis as Record<string, unknown>) || {};
    const updatedAnalysis = {
      ...currentAnalysis,
      hasFigure: true,
      figureData: interpreted,
      figureSvg: legacySvg || currentAnalysis.figureSvg || undefined,
      figureGeneratedAt: new Date().toISOString(),
      figureModel: 'gpt-4o',
    };

    const { error: updateError } = await supabaseAdmin
      .from('problems')
      .update({ ai_analysis: updatedAnalysis })
      .eq('id', problemId);

    if (updateError) {
      console.error(`[generate-figure] DB update failed:`, updateError.message);
      return NextResponse.json(
        { error: 'Failed to save figure data to database', detail: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      figureData: interpreted,
      figureType: interpreted.figureType,
      figureSvg: legacySvg,
      problemId,
    });
  } catch (error) {
    console.error('[generate-figure] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
