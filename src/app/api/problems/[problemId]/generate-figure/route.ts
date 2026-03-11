// ============================================================================
// POST /api/problems/[problemId]/generate-figure
// 도형 이미지 처리: 업스케일 우선 → AI Vision 폴백
// 원본 크롭이 쓸만하면 업스케일만으로 완료, 안되면 AI 생성
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { interpretImage } from '@/lib/vision/image-interpreter';
import { generateGeometrySVG } from '@/lib/vision/figure-renderer';
import { tryUpscaleCrop } from '@/lib/vision/image-upscaler';

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

  // ★ OpenAI 키 체크는 AI Vision 폴백 시에만 필요 (업스케일은 키 불필요)
  // 최상단에서는 DB만 체크

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

    // 2. 도형 이미지 URL 찾기 (crop 우선, 없으면 다른 이미지 사용)
    const images: Array<{ url: string; type: string; label: string }> =
      Array.isArray(problem.images) ? problem.images : [];

    const cropImage = images.find((img) => img.type === 'crop');
    // crop이 없으면 다른 소스에서 이미지 URL 찾기 (우선순위)
    const aiAnalysis = (problem.ai_analysis as Record<string, unknown>) || {};
    const figureData = aiAnalysis.figureData as Record<string, unknown> | undefined;
    const savedCropUrl = aiAnalysis.cropImageUrl as string | undefined;      // delete-figure에서 보존한 URL
    const originalImageUrl = figureData?.originalImageUrl as string | undefined;
    const anyImage = images[0]; // 아무 이미지라도 사용

    let targetImageUrl = cropImage?.url || savedCropUrl || originalImageUrl || anyImage?.url;
    let isPageCrop = false; // 페이지 이미지에서 자동 크롭한 경우 (문제 전체 포함 → 업스케일 스킵)

    // ★ 크롭 이미지가 없으면 detection_annotations에서 페이지 이미지 + bbox로 자동 크롭
    if (!targetImageUrl && supabaseAdmin) {
      console.log(`[generate-figure] No crop image found. Trying page image fallback via detection_annotations...`);
      try {
        const { data: annot } = await supabaseAdmin
          .from('detection_annotations')
          .select('page_image_path, bbox_x, bbox_y, bbox_w, bbox_h, problem_number')
          .eq('problem_id', problemId)
          .order('created_at', { ascending: false })  // ★ 최신 레코드 우선
          .limit(1)
          .single();

        if (annot?.page_image_path) {
          const { data: pageBlob, error: pageDlErr } = await supabaseAdmin.storage
            .from('source-files')
            .download(annot.page_image_path);

          if (!pageDlErr && pageBlob) {
            const { default: sharp } = await import('sharp');
            const pageBuffer = Buffer.from(await pageBlob.arrayBuffer());
            const meta = await sharp(pageBuffer).metadata();
            const imgW = meta.width || 1;
            const imgH = meta.height || 1;

            const cropX = Math.round(annot.bbox_x * imgW);
            const cropY = Math.round(annot.bbox_y * imgH);
            const cropW = Math.min(Math.round(annot.bbox_w * imgW), imgW - cropX);
            const cropH = Math.min(Math.round(annot.bbox_h * imgH), imgH - cropY);

            if (cropW > 10 && cropH > 10) {
              const croppedBuf = await sharp(pageBuffer)
                .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
                .png()
                .toBuffer();

              // Storage에 크롭 저장
              const cropPath = `problem-crops/${problemId}.png`;
              await supabaseAdmin.storage
                .from('source-files')
                .upload(cropPath, croppedBuf, { contentType: 'image/png', upsert: true });

              const newCropUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/source-files/${cropPath}`;

              // DB에 크롭 URL 저장 (다음번엔 바로 사용)
              const curAnalysis = (problem.ai_analysis as Record<string, unknown>) || {};
              await supabaseAdmin
                .from('problems')
                .update({
                  ai_analysis: { ...curAnalysis, cropImageUrl: newCropUrl },
                  images: [{ url: newCropUrl, type: 'crop', label: '자동 크롭 (페이지)' }],
                })
                .eq('id', problemId);

              targetImageUrl = newCropUrl;
              isPageCrop = true; // 문제 전체 영역 크롭 → 업스케일 건너뛰고 AI Vision으로 직행
              console.log(`[generate-figure] ✅ Auto-cropped from page image: ${cropW}x${cropH} → ${cropPath} (isPageCrop=true, will skip upscale)`);
            }
          }
        }
      } catch (fallbackErr) {
        console.warn(`[generate-figure] Page image fallback failed:`, fallbackErr);
      }
    }

    if (!targetImageUrl) {
      return NextResponse.json(
        { error: 'No image found for this problem. Upload a crop image first.' },
        { status: 400 }
      );
    }

    console.log(`[generate-figure] Processing problem ${problemId}, source=${cropImage ? 'crop' : savedCropUrl ? 'savedCrop' : originalImageUrl ? 'figureData' : 'fallback'}, url: ${targetImageUrl}`);

    // 3. 이미지를 서버에서 다운로드하여 base64로 변환
    let imageDataUri: string;
    let imageRawBuffer: Buffer | null = null; // 업스케일용 원본 버퍼
    try {
      let imgBuffer: ArrayBuffer | null = null;
      let contentType = 'image/png';

      // URL에서 Storage bucket/path 추출
      const storagePath = extractStoragePath(targetImageUrl);
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
        console.log(`[generate-figure] Trying public URL fetch: ${targetImageUrl}`);
        const imgRes = await fetch(targetImageUrl);
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
      imageRawBuffer = Buffer.from(imgBuffer);
    } catch (dlErr) {
      console.error(`[generate-figure] Image download error:`, dlErr);
      return NextResponse.json(
        { error: 'Failed to download crop image' },
        { status: 400 }
      );
    }

    // ================================================================
    // 3.5. ★ 업스케일 우선 시도 (forceAI가 아닌 경우)
    // 원본 크롭이 쓸만하면 업스케일만으로 완료 → AI Vision 호출 스킵
    // ================================================================
    const body = await request.clone().json().catch(() => ({}));
    const forceAI = body?.forceAI === true || isPageCrop; // 페이지 크롭은 문제 전체 포함 → AI 필수
    const upscaleOnly = body?.upscaleOnly === true; // ★ 업스케일만 (AI 폴백 없음)

    if (upscaleOnly && !imageRawBuffer) {
      // 업스케일 전용인데 이미지 없음 → 즉시 반환
      return NextResponse.json({ success: true, noFigure: true, reason: 'no_crop_image' });
    }

    if ((!forceAI || upscaleOnly) && imageRawBuffer) {
      console.log(`[generate-figure] ★ 업스케일 우선 시도 (forceAI=${forceAI})`);
      const upscaleResult = await tryUpscaleCrop(imageRawBuffer);

      if (upscaleResult) {
        const { quality, upscaled } = upscaleResult;
        console.log(`[generate-figure] ✅ 업스케일 성공: ${quality.width}x${quality.height} → ${upscaled.width}x${upscaled.height} (${upscaled.scale}x)`);

        // 업스케일된 이미지를 Supabase Storage에 업로드
        let upscaledUrl: string | null = null;
        try {
          // problemId에서 storage 경로 생성
          const upscaledPath = `problem-crops/upscaled/${problemId}.png`;
          const upscaledBuffer = Buffer.from(upscaled.base64, 'base64');

          const { error: uploadError } = await supabaseAdmin.storage
            .from('source-files')
            .upload(upscaledPath, upscaledBuffer, {
              contentType: 'image/png',
              upsert: true, // 기존 파일 덮어쓰기
            });

          if (uploadError) {
            console.warn(`[generate-figure] 업스케일 이미지 업로드 실패: ${uploadError.message}`);
          } else {
            // ★ Private 버킷이므로 프록시 URL 사용 (/api/storage/image?path=...)
            upscaledUrl = `/api/storage/image?path=${encodeURIComponent(upscaledPath)}`;
            console.log(`[generate-figure] 업스케일 이미지 저장: ${upscaledUrl}`);
          }
        } catch (uploadErr) {
          console.warn(`[generate-figure] 업스케일 업로드 중 오류:`, uploadErr);
        }

        // DB에 업스케일 정보 저장
        if (upscaledUrl) {
          const currentAnalysis = (problem.ai_analysis as Record<string, unknown>) || {};
          const updatedAnalysis = {
            ...currentAnalysis,
            hasFigure: true,
            figureSource: 'upscaled_crop' as const,
            upscaledCropUrl: upscaledUrl,
            upscaleInfo: {
              originalSize: { width: quality.width, height: quality.height },
              upscaledSize: { width: upscaled.width, height: upscaled.height },
              scale: upscaled.scale,
              qualityScore: quality.score,
              processedAt: new Date().toISOString(),
            },
            cropImageUrl: targetImageUrl, // 원본 URL 보존
          };

          const { error: updateError } = await supabaseAdmin
            .from('problems')
            .update({ ai_analysis: updatedAnalysis })
            .eq('id', problemId);

          if (updateError) {
            console.error(`[generate-figure] DB 업데이트 실패:`, updateError.message);
          } else {
            console.log(`[generate-figure] ★ 업스케일 완료! AI Vision 스킵.`);
            return NextResponse.json({
              success: true,
              figureSource: 'upscaled_crop',
              upscaledCropUrl: upscaledUrl,
              upscaleInfo: {
                originalSize: `${quality.width}x${quality.height}`,
                upscaledSize: `${upscaled.width}x${upscaled.height}`,
                scale: upscaled.scale,
              },
              problemId,
            });
          }
        }
      } else {
        if (upscaleOnly) {
          // ★ upscaleOnly: AI 폴백 없이 즉시 반환
          console.log(`[generate-figure] 업스케일 불가 + upscaleOnly → AI 폴백 없이 종료`);
          return NextResponse.json({ success: true, noFigure: true, reason: 'upscale_failed' });
        }
        console.log(`[generate-figure] 업스케일 불가 → AI Vision으로 폴백`);
      }
    }

    // ★ upscaleOnly면 여기까지 왔으면 이미지 없거나 업로드 실패 → 종료
    if (upscaleOnly) {
      return NextResponse.json({ success: true, noFigure: true, reason: 'upscale_not_available' });
    }

    // ================================================================
    // 4. AI Vision 해석 (업스케일 불가하거나 forceAI일 때)
    // ================================================================
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured (업스케일도 실패하여 AI 폴백 필요하지만 키 없음)' },
        { status: 503 }
      );
    }
    // ★ content_latex 전체를 전달하여 수식 자동 감지가 정확히 동작하도록 함
    // (image-interpreter 내부에서 800자로 잘라서 AI에 전달)
    const contentContext = problem.content_latex || undefined;

    const interpreted = await interpretImage(imageDataUri, contentContext);

    console.log(`[generate-figure] Problem ${problemId}: type=${interpreted.figureType}, confidence=${interpreted.confidence}`);

    // 5. 도형 없음 처리 (photo 타입 — postProcess에서 forceGraph인 경우 이미 graph로 전환됨)
    if (interpreted.figureType === 'photo' || interpreted.confidence < 0.3) {
      console.log(`[generate-figure] Problem ${problemId}: No figure detected (${interpreted.figureType}, confidence: ${interpreted.confidence}). content 일부: ${(problem.content_latex || '').substring(0, 100)}`);

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
        ? targetImageUrl  // base64 대신 원본 이미지 URL 저장
        : interpreted.originalImageUrl,
    };

    const currentAnalysis = (problem.ai_analysis as Record<string, unknown>) || {};
    const updatedAnalysis = {
      ...currentAnalysis,
      hasFigure: true,
      figureData: figureDataForDb,
      figureSource: 'ai_generated' as const, // ★ 업스케일 → AI 전환
      upscaledCropUrl: undefined,             // ★ 업스케일 데이터 제거
      upscaleInfo: undefined,                 // ★ 업스케일 데이터 제거
      figureSvg: legacySvg || currentAnalysis.figureSvg || undefined,
      figureGeneratedAt: new Date().toISOString(),
      figureModel: process.env.VISION_PROVIDER === 'gpt' ? 'gpt-4o' : process.env.VISION_PROVIDER === 'claude' ? 'claude-sonnet' : `gemini (${process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview'})`,
      // EVPM 메타: confidence 기록 (VP 재시도 여부는 image-interpreter 로그 참조)
      figureConfidence: interpreted.confidence,
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
