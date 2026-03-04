// ============================================================================
// POST /api/problems/[problemId]/generate-figure
// 문제의 도형 이미지를 AI Vision으로 분석하여 구조화된 데이터 + 클린 렌더링 생성
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { interpretImage } from '@/lib/vision/image-interpreter';
import { generateGeometrySVG } from '@/lib/vision/figure-renderer';

/**
 * Supabase Storage URL에서 bucket과 파일 경로를 추출
 * URL 예: https://xxx.supabase.co/storage/v1/object/public/source-files/path/to/file.png
 */
function extractStoragePath(url: string): { bucket: string; path: string } | null {
  try {
    const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/);
    if (match) {
      return { bucket: match[1], path: decodeURIComponent(match[2]) };
    }
    return null;
  } catch {
    return null;
  }
}

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

    console.log(`[generate-figure] Processing problem ${problemId}, fullUrl: ${cropImage.url}`);

    // 3. 이미지를 서버에서 다운로드하여 base64로 변환
    let imageDataUri: string;
    try {
      let imgBuffer: ArrayBuffer | null = null;
      let contentType = 'image/png';

      // URL에서 Storage bucket/path 추출
      const storagePath = extractStoragePath(cropImage.url);
      console.log(`[generate-figure] extractStoragePath:`, JSON.stringify(storagePath));

      if (storagePath && supabaseAdmin) {
        // 방법 1: supabaseAdmin.storage.download (인증됨)
        console.log(`[generate-figure] Trying storage.download: ${storagePath.bucket}/${storagePath.path}`);
        const { data: blob, error: dlError } = await supabaseAdmin.storage
          .from(storagePath.bucket)
          .download(storagePath.path);

        if (!dlError && blob) {
          imgBuffer = await blob.arrayBuffer();
          contentType = blob.type || 'image/png';
          console.log(`[generate-figure] storage.download OK: ${Math.round(imgBuffer.byteLength / 1024)}KB`);
        } else {
          console.warn(`[generate-figure] storage.download failed: ${dlError?.message}`);

          // 방법 2: createSignedUrl → fetch
          console.log(`[generate-figure] Trying createSignedUrl...`);
          const { data: signedData, error: signErr } = await supabaseAdmin.storage
            .from(storagePath.bucket)
            .createSignedUrl(storagePath.path, 120);

          if (!signErr && signedData?.signedUrl) {
            console.log(`[generate-figure] signedUrl: ${signedData.signedUrl.substring(0, 100)}...`);
            const signedRes = await fetch(signedData.signedUrl);
            if (signedRes.ok) {
              imgBuffer = await signedRes.arrayBuffer();
              contentType = signedRes.headers.get('content-type') || 'image/png';
              console.log(`[generate-figure] signedUrl download OK: ${Math.round(imgBuffer.byteLength / 1024)}KB`);
            } else {
              console.warn(`[generate-figure] signedUrl fetch failed: ${signedRes.status}`);
            }
          } else {
            console.warn(`[generate-figure] createSignedUrl failed: ${signErr?.message}`);
          }
        }
      }

      // 방법 3: Public URL fetch (최종 fallback)
      if (!imgBuffer) {
        console.log(`[generate-figure] Trying public URL fetch: ${cropImage.url}`);
        const imgRes = await fetch(cropImage.url);
        if (!imgRes.ok) {
          console.error(`[generate-figure] All download methods failed. Last: public URL ${imgRes.status}`);
          return NextResponse.json(
            { error: `Failed to download crop image (all methods failed)` },
            { status: 400 }
          );
        }
        imgBuffer = await imgRes.arrayBuffer();
        contentType = imgRes.headers.get('content-type') || 'image/png';
        console.log(`[generate-figure] Public URL download OK: ${Math.round(imgBuffer.byteLength / 1024)}KB`);
      }

      const base64 = Buffer.from(imgBuffer).toString('base64');
      imageDataUri = `data:${contentType};base64,${base64}`;
    } catch (dlErr) {
      console.error(`[generate-figure] Image download error:`, dlErr);
      return NextResponse.json(
        { error: 'Failed to download crop image' },
        { status: 400 }
      );
    }

    // 4. 구조화된 Vision 해석 (image-interpreter 사용)
    // ★ content_latex 전체를 전달하여 수식 자동 감지가 정확히 동작하도록 함
    // (image-interpreter 내부에서 800자로 잘라서 AI에 전달)
    const contentContext = problem.content_latex || undefined;

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
    // originalImageUrl에서 base64 데이터 제거 (JSONB 크기 최적화)
    const figureDataForDb = {
      ...interpreted,
      originalImageUrl: interpreted.originalImageUrl?.startsWith('data:')
        ? cropImage.url  // base64 대신 원본 crop URL 저장
        : interpreted.originalImageUrl,
    };

    const currentAnalysis = (problem.ai_analysis as Record<string, unknown>) || {};
    const updatedAnalysis = {
      ...currentAnalysis,
      hasFigure: true,
      figureData: figureDataForDb,
      figureSvg: legacySvg || currentAnalysis.figureSvg || undefined,
      figureGeneratedAt: new Date().toISOString(),
      figureModel: process.env.VISION_PROVIDER === 'gpt' ? 'gpt-4o' : 'claude-sonnet',
    };

    const renderingAny = figureDataForDb.rendering as unknown as Record<string, unknown> | null;
    console.log(`[generate-figure] Saving figureData: type=${figureDataForDb.figureType}, hasSvg=${!!renderingAny?.svg}, svgLen=${typeof renderingAny?.svg === 'string' ? renderingAny.svg.length : 0}`);

    // ★ 크롭 이미지 유지 (도형 재생성 시 필요하므로 삭제하지 않음)
    const { error: updateError } = await supabaseAdmin
      .from('problems')
      .update({
        ai_analysis: updatedAnalysis,
      })
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
