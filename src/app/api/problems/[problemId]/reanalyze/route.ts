// ============================================================================
// 개별 문제 재분석 API
// POST /api/problems/[problemId]/reanalyze
// - 기존 content_latex를 기반으로 GPT-4o 재분석
// - advanced: true 시 고급 분석 (gpt-4o 사용)
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

    const systemPrompt = `당신은 한국 수학 교육 전문가입니다. 주어진 수학 문제를 분석하여 다음 JSON 형식으로 응답하세요:
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
  "solution": {
    "approach": "풀이 접근법",
    "steps": [{"stepNumber": 1, "description": "단계 설명", "latex": "수식"}],
    "finalAnswer": "최종 답"
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

    // 5. Classification 업데이트
    if (analysis.classification) {
      const classData: any = {
        problem_id: problemId,
        type_code: analysis.classification.typeCode || existingClassification?.type_code || '',
        type_name: analysis.classification.typeName || existingClassification?.type_name || '',
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
