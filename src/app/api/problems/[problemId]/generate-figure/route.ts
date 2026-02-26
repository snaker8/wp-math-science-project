// ============================================================================
// POST /api/problems/[problemId]/generate-figure
// 문제의 도형 이미지를 AI Vision으로 분석하여 클린 SVG로 재생성
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// SVG 생성 프롬프트
const FIGURE_ANALYSIS_PROMPT = `You are a math figure reproduction specialist. Analyze the image and determine if it contains any mathematical figures, diagrams, or geometric shapes that need to be reproduced.

IMPORTANT FIRST STEP:
- If the image contains ONLY text, equations, or multiple-choice options with NO geometric figures/diagrams/graphs/shapes, respond with exactly: NO_FIGURE
- If the image contains geometric figures, graphs, coordinate systems, diagrams, or other visual mathematical elements, generate SVG code.

SVG Rules (only if figure exists):
1. Output ONLY valid SVG code (starting with <svg and ending with </svg>)
2. Use viewBox for responsive sizing (e.g., viewBox="0 0 300 250")
3. Set width="100%" so it scales properly
4. Use clean, sharp lines (stroke-width: 1.5~2)
5. Use black (#000) for lines/text, light fill colors for shaded regions
6. For shaded/highlighted areas, use semi-transparent fills (e.g., rgba(255,220,100,0.3) for yellow shading)
7. Label all points, angles, and measurements exactly as shown
8. For Korean text labels, use font-family="sans-serif"
9. Position text labels clearly near their reference points
10. Use proper geometric constructions (circles for arcs, paths for curves)
11. Keep the SVG clean and minimal - no unnecessary elements
12. For right angle markers, use small squares at the corner

Common math figure elements:
- Triangles, rectangles, parallelograms
- Circles, arcs, sectors
- Coordinate axes with graphs
- Function graphs (parabolas, lines, etc.)
- Shaded regions
- Measurement labels (lengths, angles)
- Number lines, tables

Output either NO_FIGURE or SVG code only, no explanations.`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const { problemId } = await params;

  if (!OPENAI_API_KEY) {
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

    // 3. GPT-4o Vision으로 도형 분석 + SVG 생성
    const imageUrl = cropImage.url;

    const contentContext = problem.content_latex
      ? `\n\nProblem text for reference (use this to ensure labels are correct):\n${problem.content_latex.substring(0, 500)}`
      : '';

    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: FIGURE_ANALYSIS_PROMPT,
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: 'high',
                },
              },
              {
                type: 'text',
                text: `Look at this math problem image. If it contains geometric figures, graphs, or diagrams, generate clean SVG to reproduce them. If there are no figures (only text/equations/choices), respond with NO_FIGURE.${contentContext}`,
              },
            ],
          },
        ],
        max_tokens: 4000,
        temperature: 0.1,
      }),
    });

    if (!gptResponse.ok) {
      const errText = await gptResponse.text();
      console.error(`[generate-figure] GPT-4o Vision failed: ${gptResponse.status}`, errText.substring(0, 300));
      return NextResponse.json(
        { error: `AI model failed (${gptResponse.status})`, detail: errText.substring(0, 200) },
        { status: 502 }
      );
    }

    const gptData = await gptResponse.json();
    const rawContent = gptData.choices?.[0]?.message?.content || '';

    // 4. NO_FIGURE 응답 처리 (도형 없는 문제)
    if (rawContent.trim().startsWith('NO_FIGURE') || rawContent.trim() === 'NO_FIGURE') {
      console.log(`[generate-figure] Problem ${problemId}: No figure detected`);

      // hasFigure를 false로 업데이트
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

    // 5. SVG 코드 추출 (마크다운 코드블록 제거)
    let svgCode = rawContent.trim();
    if (svgCode.includes('```svg')) {
      svgCode = svgCode.split('```svg')[1].split('```')[0].trim();
    } else if (svgCode.includes('```xml')) {
      svgCode = svgCode.split('```xml')[1].split('```')[0].trim();
    } else if (svgCode.includes('```html')) {
      svgCode = svgCode.split('```html')[1].split('```')[0].trim();
    } else if (svgCode.includes('```')) {
      svgCode = svgCode.split('```')[1].split('```')[0].trim();
    }

    // SVG 태그 확인
    if (!svgCode.includes('<svg') || !svgCode.includes('</svg>')) {
      // SVG를 추출 못했으면 도형 없음으로 처리 (에러가 아님)
      console.log(`[generate-figure] Problem ${problemId}: AI response is not SVG, treating as no figure`);
      return NextResponse.json({
        success: true,
        noFigure: true,
        message: 'AI could not identify a reproducible figure',
        problemId,
      });
    }

    // <svg 시작 ~ </svg> 끝까지만 추출
    const svgStart = svgCode.indexOf('<svg');
    const svgEnd = svgCode.lastIndexOf('</svg>') + '</svg>'.length;
    svgCode = svgCode.substring(svgStart, svgEnd);

    console.log(`[generate-figure] SVG generated for ${problemId}: ${svgCode.length} chars`);

    // 6. DB 저장 (ai_analysis.figureSvg에 저장)
    const currentAnalysis = (problem.ai_analysis as Record<string, unknown>) || {};
    const updatedAnalysis = {
      ...currentAnalysis,
      hasFigure: true,
      figureSvg: svgCode,
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
        { error: 'Failed to save SVG to database', detail: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      figureSvg: svgCode,
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
