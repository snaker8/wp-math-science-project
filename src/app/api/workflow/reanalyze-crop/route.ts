// ============================================================================
// 크롭 이미지 기반 재분석 API
// bbox 영역의 크롭 이미지를 Mathpix OCR로 전송하여 텍스트/수식 재추출
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getMathpixClient, MathpixError } from '@/lib/ocr/mathpix';

/**
 * POST /api/workflow/reanalyze-crop
 *
 * Body:
 *   imageBase64: string  — bbox 영역의 PNG 크롭 이미지 (data:image/png;base64,...)
 *   customPrompt?: string — 고급 분석 요구사항 (선택)
 *
 * Response:
 *   ocrText: string — Mathpix OCR 변환 텍스트 (수식 $...$ 인라인)
 *   choices: string[] — 감지된 선택지
 *   confidence: number
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64, customPrompt } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'imageBase64 is required' },
        { status: 400 }
      );
    }

    // 1. Mathpix OCR로 크롭 이미지 텍스트 추출
    console.log('[Reanalyze] Sending crop image to Mathpix OCR...');
    const mathpix = getMathpixClient();

    const ocrResult = await mathpix.processImage(imageBase64, {
      formats: ['text', 'latex_styled'],
      data_options: {
        include_latex: true,
        include_asciimath: false,
        include_mathml: false,
        include_svg: false,
        include_table_html: false,
      },
      include_line_data: true,
    });

    // Mathpix Markdown 텍스트 (수식 $...$ 인라인)
    const ocrText = ocrResult.latex_styled || ocrResult.text || '';
    const confidence = ocrResult.confidence || 0.8;

    console.log(`[Reanalyze] OCR result: ${ocrText.length} chars, confidence=${confidence}`);

    // 2. 선택지 추출
    const choices = extractChoicesFromOCR(ocrText);

    // 3. 고급 분석: customPrompt가 있으면 GPT-4o로 추가 정제
    let refinedText = ocrText;
    if (customPrompt && customPrompt.trim()) {
      try {
        refinedText = await refineWithGPT(ocrText, customPrompt);
      } catch (err) {
        console.warn('[Reanalyze] GPT refinement failed, using raw OCR:', err);
        // GPT 실패 시 원본 OCR 텍스트 반환
      }
    }

    return NextResponse.json({
      ocrText: refinedText,
      rawOcrText: ocrText,
      choices,
      confidence,
    });
  } catch (error) {
    console.error('[Reanalyze] Error:', error);

    if (error instanceof MathpixError) {
      return NextResponse.json(
        { error: 'OCR failed', message: error.message, code: error.code },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: 'Reanalyze failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * OCR 텍스트에서 선택지 추출
 */
function extractChoicesFromOCR(text: string): string[] {
  const circledNumbers = ['①', '②', '③', '④', '⑤'];
  const parts: string[] = [];

  // ①②③④⑤로 분할
  let remaining = text;
  for (let i = circledNumbers.length - 1; i >= 0; i--) {
    const idx = remaining.lastIndexOf(circledNumbers[i]);
    if (idx >= 0) {
      const after = remaining.substring(idx + circledNumbers[i].length).trim();
      if (after) parts.unshift(`${circledNumbers[i]} ${after}`);
      remaining = remaining.substring(0, idx);
    }
  }

  if (parts.length > 0) return parts;

  // 번호 기반 시도 (1) 2) 3) ...)
  const numbered = text.match(/[1-5]\s*\)\s*[^1-5)]+/g);
  if (numbered && numbered.length >= 2) {
    return numbered.map(m => m.trim());
  }

  return [];
}

/**
 * GPT로 OCR 결과 정제 (고급 분석)
 */
async function refineWithGPT(ocrText: string, customPrompt: string): Promise<string> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.warn('[Reanalyze] No OpenAI API key, skipping GPT refinement');
    return ocrText;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `당신은 수학 문제 OCR 결과를 정제하는 전문가입니다.
주어진 OCR 텍스트를 사용자 요구사항에 맞게 수정해주세요.
수식은 반드시 $...$ (인라인) 또는 $$...$$ (디스플레이) 형식으로 유지하세요.
수정된 텍스트만 반환하세요. 설명 없이 텍스트만 출력하세요.`,
        },
        {
          role: 'user',
          content: `OCR 원본 텍스트:
${ocrText}

수정 요구사항:
${customPrompt}

위 요구사항에 맞게 OCR 텍스트를 수정해주세요. 수정된 텍스트만 반환하세요.`,
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`GPT API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() || ocrText;
}
