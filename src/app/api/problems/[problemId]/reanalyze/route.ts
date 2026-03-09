// ============================================================================
// 개별 문제 재분석 API
// POST /api/problems/[problemId]/reanalyze
// - 크롭 이미지가 있으면: OCR 재실행 + 선택지 재추출 + 분류
// - 크롭 이미지 없으면: 기존 content_latex 기반 분류만 재실행
// - advanced: true 시 gpt-4o 사용
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const { problemId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const isAdvanced = body.advanced === true;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // 1. 기존 문제 데이터 조회
    const { data: problem, error: fetchError } = await supabaseAdmin
      .from('problems')
      .select('id, content_latex, solution_latex, answer_json, ai_analysis, images, question_number, tags')
      .eq('id', problemId)
      .single();

    if (fetchError || !problem) {
      return NextResponse.json(
        { error: 'Problem not found' },
        { status: 404 }
      );
    }

    // 2. 기존 분류 데이터 조회
    const { data: existingClassification } = await supabaseAdmin
      .from('classifications')
      .select('*')
      .eq('problem_id', problemId)
      .single();

    // 3. 크롭 이미지가 있는지 확인 → 있으면 OCR 재실행
    const cropImageUrl = findCropImageUrl(problem);

    if (cropImageUrl) {
      console.log(`[Reanalyze] 크롭 이미지 발견 — OCR 재실행: ${cropImageUrl}`);
      return await reanalyzeWithOCR(
        problemId, problem, existingClassification, cropImageUrl, isAdvanced, request
      );
    }

    // 4. 크롭 이미지 없음 → 기존 content_latex 기반 분류만 재실행
    console.log(`[Reanalyze] 크롭 이미지 없음 — 분류만 재실행`);
    return await reanalyzeClassificationOnly(
      problemId, problem, existingClassification, isAdvanced
    );
  } catch (error) {
    console.error('[Reanalyze] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * 문제 데이터에서 크롭 이미지 URL 찾기
 */
function findCropImageUrl(problem: any): string | null {
  // 1. images 배열에서 crop 타입 찾기
  if (problem.images && Array.isArray(problem.images)) {
    const cropImage = problem.images.find((img: any) => img.type === 'crop' && img.url);
    if (cropImage) return cropImage.url;
  }

  // 2. ai_analysis.cropImageUrl 확인
  if (problem.ai_analysis?.cropImageUrl) {
    return problem.ai_analysis.cropImageUrl;
  }

  // 3. Storage에 problem-crops/{id}.png 있는지 확인
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (supabaseUrl) {
    // 직접 URL 구성 (존재 여부는 다운로드 시 확인)
    return `${supabaseUrl}/storage/v1/object/public/source-files/problem-crops/${problem.id}.png`;
  }

  return null;
}

/**
 * 크롭 이미지로 OCR 재실행 + 선택지 재추출 + 분류
 */
async function reanalyzeWithOCR(
  problemId: string,
  problem: any,
  existingClassification: any,
  cropImageUrl: string,
  isAdvanced: boolean,
  request: NextRequest
) {
  try {
    // 1. 크롭 이미지 다운로드 → base64 변환
    console.log(`[Reanalyze] 크롭 이미지 다운로드 중: ${cropImageUrl}`);
    const imgResponse = await fetch(cropImageUrl);

    if (!imgResponse.ok) {
      console.warn(`[Reanalyze] 크롭 이미지 다운로드 실패 (${imgResponse.status}) — 분류만 실행`);
      return await reanalyzeClassificationOnly(
        problemId, problem, existingClassification, isAdvanced
      );
    }

    const imgBuffer = await imgResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imgBuffer).toString('base64');

    // 2. reanalyze-crop API 호출 (내부 HTTP 요청)
    const baseUrl = getBaseUrl(request);
    console.log(`[Reanalyze] reanalyze-crop API 호출 중...`);

    const reanalyzeRes = await fetch(`${baseUrl}/api/workflow/reanalyze-crop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64,
        fullAnalysis: true,
        problemNumber: problem.question_number,
        problemId,
        analyzeGraph: true,
      }),
    });

    if (!reanalyzeRes.ok) {
      const errData = await reanalyzeRes.json().catch(() => ({}));
      console.warn(`[Reanalyze] reanalyze-crop 실패:`, errData);
      return await reanalyzeClassificationOnly(
        problemId, problem, existingClassification, isAdvanced
      );
    }

    const ocrData = await reanalyzeRes.json();
    console.log(`[Reanalyze] OCR 완료: ${ocrData.ocrText?.length || 0}자, 선택지 ${ocrData.choices?.length || 0}개`);

    // 3. DB 업데이트 — OCR 텍스트 + 선택지 + 분류 모두 갱신
    const updateData: Record<string, unknown> = {
      content_latex: ocrData.ocrText,
    };

    // 선택지 업데이트
    if (ocrData.choices && ocrData.choices.length > 0) {
      updateData.answer_json = {
        ...(problem.answer_json || {}),
        choices: ocrData.choices,
      };
    }

    // ai_analysis 업데이트
    const aiAnalysis: Record<string, unknown> = {
      ...(problem.ai_analysis || {}),
      ...(ocrData.classification || {}),
      reanalyzedAt: new Date().toISOString(),
      reanalyzedWithOCR: true,
    };

    if (ocrData.cropUrl) {
      aiAnalysis.cropImageUrl = ocrData.cropUrl;
    }
    if (ocrData.graphData && ocrData.graphData.type !== 'none') {
      aiAnalysis.hasFigure = true;
      aiAnalysis.graphAnalysis = ocrData.graphData;
    }

    updateData.ai_analysis = aiAnalysis;

    // 이미지 업데이트
    if (ocrData.cropUrl) {
      const existingImages = (problem.images || []).filter(
        (img: { type: string }) => img.type !== 'crop'
      );
      updateData.images = [
        { url: ocrData.cropUrl, type: 'crop', label: '재분석 크롭' },
        ...existingImages,
      ];
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('problems')
      .update(updateData)
      .eq('id', problemId);

    if (updateError) {
      console.error('[Reanalyze] Problem update error:', updateError);
    }

    // 4. Classification 테이블 업데이트
    if (ocrData.classification?.classification) {
      const cls = ocrData.classification.classification;
      const classData: Record<string, unknown> = {
        problem_id: problemId,
        type_code: cls.typeCode || existingClassification?.type_code || '',
        difficulty: String(cls.difficulty || 3),
        cognitive_domain: cls.cognitiveDomain || 'UNDERSTANDING',
        ai_confidence: cls.confidence || 0.5,
        is_verified: false,
      };

      if (existingClassification) {
        await supabaseAdmin
          .from('classifications')
          .update(classData)
          .eq('id', existingClassification.id);
      } else {
        await supabaseAdmin
          .from('classifications')
          .insert(classData);
      }
    }

    // 5. 업데이트된 데이터 반환
    const { data: updatedProblem } = await supabaseAdmin
      .from('problems')
      .select('*')
      .eq('id', problemId)
      .single();

    const { data: updatedClassification } = await supabaseAdmin
      .from('classifications')
      .select('*')
      .eq('problem_id', problemId)
      .single();

    return NextResponse.json({
      problem: updatedProblem,
      classification: updatedClassification,
      ocrRedone: true,
      ocrText: ocrData.ocrText,
      choices: ocrData.choices,
      message: 'OCR 재실행 + 재분류 완료',
    });
  } catch (err) {
    console.error('[Reanalyze] OCR 재실행 오류:', err);
    // OCR 실패 시 분류만 시도
    return await reanalyzeClassificationOnly(
      problemId, problem, existingClassification, isAdvanced
    );
  }
}

/**
 * 기존 content_latex 기반 분류만 재실행 (크롭 이미지 없을 때)
 */
async function reanalyzeClassificationOnly(
  problemId: string,
  problem: any,
  existingClassification: any,
  isAdvanced: boolean
) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({
      problem,
      classification: existingClassification,
      message: 'OpenAI API key not configured - returning existing data',
    });
  }

  const model = isAdvanced ? 'gpt-4o' : (process.env.OPENAI_MODEL || 'gpt-4o-mini');
  const contentText = problem.content_latex || '';

  const systemPrompt = `당신은 한국 수학 교육 전문가입니다. 주어진 수학 문제의 **분류(유형/단원/난이도)만** 분석하세요.
풀이나 해설은 생성하지 마세요.

다음 JSON 형식으로 응답하세요:
{
  "classification": {
    "typeCode": "유형 코드 (예: MA-HS1-ALG-01-003)",
    "typeName": "유형 이름 (한국어)",
    "subject": "과목명",
    "chapter": "단원명",
    "difficulty": 1-5,
    "cognitiveDomain": "CALCULATION|UNDERSTANDING|INFERENCE|PROBLEM_SOLVING",
    "confidence": 0.0-1.0
  },
  "correctedContent": "수정이 필요하면 수정된 LaTeX 내용, 아니면 null"
}`;

  const userPrompt = `다음 수학 문제를 분석해주세요:\n\n${contentText}`;

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    console.error('[Reanalyze] OpenAI error:', errText);
    return NextResponse.json({
      problem,
      classification: existingClassification,
      message: 'OpenAI API error - returning existing data',
    });
  }

  const openaiData = await openaiRes.json();
  const rawContent = openaiData.choices?.[0]?.message?.content || '{}';

  let analysis: any;
  try {
    analysis = JSON.parse(rawContent);
  } catch {
    console.error('[Reanalyze] JSON parse error:', rawContent);
    return NextResponse.json({
      problem,
      classification: existingClassification,
      message: 'Analysis parse error - returning existing data',
    });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  // DB 업데이트 — 분류만 갱신
  const updateData: any = {
    ai_analysis: {
      ...problem.ai_analysis,
      classification: analysis.classification,
      reanalyzedAt: new Date().toISOString(),
      model,
    },
  };

  if (analysis.correctedContent) {
    updateData.content_latex = analysis.correctedContent;
  }

  const { error: updateError } = await supabaseAdmin
    .from('problems')
    .update(updateData)
    .eq('id', problemId);

  if (updateError) {
    console.error('[Reanalyze] Problem update error:', updateError);
  }

  // Classification 업데이트
  if (analysis.classification) {
    const classData: any = {
      problem_id: problemId,
      type_code: analysis.classification.typeCode || existingClassification?.type_code || '',
      difficulty: String(analysis.classification.difficulty || 3),
      cognitive_domain: analysis.classification.cognitiveDomain || 'UNDERSTANDING',
      ai_confidence: analysis.classification.confidence || 0.5,
      is_verified: false,
    };

    if (existingClassification) {
      await supabaseAdmin
        .from('classifications')
        .update(classData)
        .eq('id', existingClassification.id);
    } else {
      await supabaseAdmin
        .from('classifications')
        .insert(classData);
    }
  }

  // 업데이트된 데이터 반환
  const { data: updatedProblem } = await supabaseAdmin
    .from('problems')
    .select('*')
    .eq('id', problemId)
    .single();

  const { data: updatedClassification } = await supabaseAdmin
    .from('classifications')
    .select('*')
    .eq('problem_id', problemId)
    .single();

  return NextResponse.json({
    problem: updatedProblem,
    classification: updatedClassification,
    analysis,
    model,
    ocrRedone: false,
    message: '분류 재실행 완료 (크롭 이미지 없어 OCR 미실행)',
  });
}

/**
 * 요청에서 기본 URL 추출
 */
function getBaseUrl(request: NextRequest): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
