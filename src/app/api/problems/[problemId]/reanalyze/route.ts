// ============================================================================
// 개별 문제 재분석 API
// POST /api/problems/[problemId]/reanalyze
// - 기존 content_latex를 기반으로 GPT-4o 재분석
// - advanced: true 시 고급 분석 (gpt-4o 사용)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { buildClassificationPrompt } from '@/lib/ai/classification-prompt';

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
      .select('id, content_latex, solution_latex, answer_json, ai_analysis, tags')
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

    // 3. GPT-4o로 재분석
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      // API 키 없으면 기존 데이터 그대로 반환
      return NextResponse.json({
        problem,
        classification: existingClassification,
        message: 'OpenAI API key not configured - returning existing data',
      });
    }

    const model = isAdvanced ? 'gpt-4o' : (process.env.OPENAI_MODEL || 'gpt-4o-mini');
    const contentText = problem.content_latex || '';

    // 확장 세부유형 기반 시스템 프롬프트 생성
    const systemPrompt = await buildClassificationPrompt({
      mode: isAdvanced ? 'full' : 'light',
      levelCode: body.levelCode, // 선택적 레벨 필터
    });

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

    // 4. DB 업데이트 - content 수정이 있으면 반영
    const updateData: any = {
      ai_analysis: {
        ...problem.ai_analysis,
        classification: analysis.classification,
        solution: analysis.solution,
        reanalyzedAt: new Date().toISOString(),
        model,
      },
    };

    if (analysis.correctedContent) {
      updateData.content_latex = analysis.correctedContent;
    }

    if (analysis.solution) {
      const solutionText = analysis.solution.steps
        ?.map((s: any) => `${s.description}\n${s.latex || ''}`)
        .join('\n') || '';
      updateData.solution_latex = solutionText;
    }

    if (analysis.solution?.finalAnswer) {
      updateData.answer_json = {
        ...problem.answer_json,
        finalAnswer: analysis.solution.finalAnswer,
        correct_answer: analysis.solution.finalAnswer,
      };
    }

    const { error: updateError } = await supabaseAdmin
      .from('problems')
      .update(updateData)
      .eq('id', problemId);

    if (updateError) {
      console.error('[Reanalyze] Problem update error:', updateError);
    }

    // 5. Classification 업데이트 (expanded_type_code 포함)
    if (analysis.classification) {
      const expandedCode = analysis.classification.expandedTypeCode || analysis.classification.typeCode || '';
      const classData: any = {
        problem_id: problemId,
        type_code: expandedCode || existingClassification?.type_code || '',
        expanded_type_code: expandedCode || null,
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

    // 6. 업데이트된 데이터 반환
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
      message: 'Reanalysis completed',
    });
  } catch (error) {
    console.error('[Reanalyze] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
