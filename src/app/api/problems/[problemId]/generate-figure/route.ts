// ============================================================================
// POST /api/problems/[problemId]/generate-figure
// 문제의 도형 이미지를 AI Vision으로 분석하여 클린 SVG로 재생성
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// SVG 생성 프롬프트
const FIGURE_ANALYSIS_PROMPT = `You are a math figure reproduction specialist. Analyze the mathematical figure in this image and generate clean SVG code that precisely reproduces it.

Rules:
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
13. For parallel marks, use small arrow marks on lines
14. Ensure all mathematical notation (like angles, parallel symbols) is accurate

Common math figure elements to handle:
- Triangles (with labeled vertices A, B, C etc.)
- Rectangles, squares, parallelograms
- Circles, arcs, sectors
- Coordinate axes with gridlines
- Function graphs (parabolas, lines, etc.)
- Shaded regions (intersections, areas)
- Measurement labels (lengths, angles)
- Right angle markers (small squares)
- Parallel/equal length markers
- Number lines
- Tables (synthetic division, etc.)

Output the SVG code only, no explanations.`;

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
    // images 배열에서 crop 이미지 사용 (전체 문제 크롭)
    const images: Array<{ url: string; type: string; label: string }> =
      Array.isArray(problem.images) ? problem.images : [];

    const cropImage = images.find((img) => img.type === 'crop');

    if (!cropImage?.url) {
      return NextResponse.json(
        { error: 'No crop image found for this problem. Upload and process the PDF first.' },
        { status: 400 }
      );
    }

    console.log(`[generate-figure] Processing problem ${problemId}, image: ${cropImage.url.substring(0, 80)}...`);

    // 3. GPT-4o Vision으로 도형 분석 + SVG 생성
    const imageUrl = cropImage.url;

    // 문제 본문도 컨텍스트로 제공 (정확한 라벨링을 위해)
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
                text: `Analyze the mathematical figure(s) in this problem image and generate clean SVG code to reproduce them. Focus on geometric shapes, graphs, diagrams, and any visual elements. Ignore the text/equations - only reproduce the figures/diagrams.${contentContext}`,
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
        { error: `AI model failed (${gptResponse.status})` },
        { status: 500 }
      );
    }

    const gptData = await gptResponse.json();
    const rawContent = gptData.choices?.[0]?.message?.content || '';

    // 4. SVG 코드 추출 (마크다운 코드블록 제거)
    let svgCode = rawContent.trim();
    if (svgCode.includes('```svg')) {
      svgCode = svgCode.split('```svg')[1].split('```')[0].trim();
    } else if (svgCode.includes('```xml')) {
      svgCode = svgCode.split('```xml')[1].split('```')[0].trim();
    } else if (svgCode.includes('```')) {
      svgCode = svgCode.split('```')[1].split('```')[0].trim();
    }

    // SVG 태그 확인
    if (!svgCode.includes('<svg') || !svgCode.includes('</svg>')) {
      console.error(`[generate-figure] Invalid SVG output:`, svgCode.substring(0, 200));
      return NextResponse.json(
        { error: 'AI failed to generate valid SVG', rawOutput: svgCode.substring(0, 500) },
        { status: 500 }
      );
    }

    // <svg 시작 ~ </svg> 끝까지만 추출
    const svgStart = svgCode.indexOf('<svg');
    const svgEnd = svgCode.lastIndexOf('</svg>') + '</svg>'.length;
    svgCode = svgCode.substring(svgStart, svgEnd);

    console.log(`[generate-figure] SVG generated: ${svgCode.length} chars`);

    // 5. DB 저장 (ai_analysis.figureSvg에 저장)
    const currentAnalysis = (problem.ai_analysis as Record<string, unknown>) || {};
    const updatedAnalysis = {
      ...currentAnalysis,
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
