// ============================================================================
// 개별 문제 AI 해설 생성 API
// POST /api/problems/[problemId]/generate-solution
// - Claude Sonnet으로 풀이 생성 + GPT-4o 정답 교차검증
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const { problemId } = await params;

  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // 1. 문제 데이터 조회
    const { data: problem, error: fetchError } = await supabaseAdmin
      .from('problems')
      .select('id, content_latex, solution_latex, answer_json')
      .eq('id', problemId)
      .single();

    if (fetchError || !problem) {
      return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
    }

    const problemText = problem.content_latex || '';
    if (!problemText.trim()) {
      return NextResponse.json({ error: 'Problem content is empty' }, { status: 400 });
    }

    // 2. Claude Sonnet으로 풀이 생성
    const solutionPrompt = `다음 수학 문제의 완전한 단계별 풀이를 작성하세요.

문제:
${problemText}

★ 필수 규칙:
1. 각 단계마다 LaTeX 수식을 반드시 포함하세요
2. 계산 과정을 절대 생략하지 마세요 (중간 과정 모두 표시)
3. 최종 답(finalAnswer)을 반드시 명시하세요 — 빈 문자열 절대 불가
4. 객관식이면 finalAnswer에 정답 번호(①~⑤ 또는 1~5)도 포함
5. LaTeX 수식에서 백슬래시는 이중(\\\\)으로 작성

다음 JSON 형식으로만 응답하세요:
{
  "approach": "풀이의 핵심 전략 (한 문장)",
  "steps": [
    { "stepNumber": 1, "description": "이 단계에서 하는 일", "latex": "수식", "explanation": "왜 이렇게 하는지" }
  ],
  "finalAnswer": "최종 정답",
  "commonMistakes": ["학생들이 자주 하는 실수"]
}`;

    let solution: any = null;
    let usedModel = '';

    // Sonnet 시도
    if (ANTHROPIC_API_KEY) {
      try {
        console.log(`[generate-solution] Calling Claude Sonnet for problem ${problemId}`);
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 4000,
            system: '당신은 한국 수능/모의고사 수학 해설 전문가입니다. 학생이 완전히 이해할 수 있도록 단계별 풀이를 명확하게 작성합니다. 반드시 유효한 JSON으로만 응답하세요. LaTeX 수식은 반드시 이중 백슬래시(\\\\)를 사용하세요.',
            messages: [{ role: 'user', content: solutionPrompt }],
            temperature: 0.2,
          }),
        });

        if (claudeRes.ok) {
          const claudeData = await claudeRes.json();
          const textBlock = claudeData.content?.find((c: { type: string }) => c.type === 'text');
          const rawText = textBlock?.text || '';
          solution = parseJsonResponse(rawText);
          usedModel = 'claude-sonnet';
        }
      } catch (e) {
        console.error('[generate-solution] Claude Sonnet failed:', e);
      }
    }

    // Sonnet 실패 시 GPT-4o 폴백
    if (!solution && OPENAI_API_KEY) {
      console.log(`[generate-solution] Falling back to GPT-4o for problem ${problemId}`);
      try {
        const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: '당신은 한국 수능/모의고사 수학 해설 전문가입니다. 반드시 유효한 JSON으로만 응답하세요.' },
              { role: 'user', content: solutionPrompt },
            ],
            temperature: 0.2,
            max_tokens: 4000,
            response_format: { type: 'json_object' },
          }),
        });

        if (gptRes.ok) {
          const gptData = await gptRes.json();
          const rawText = gptData.choices?.[0]?.message?.content || '';
          solution = parseJsonResponse(rawText);
          usedModel = 'gpt-4o';
        }
      } catch (e) {
        console.error('[generate-solution] GPT-4o fallback failed:', e);
      }
    }

    if (!solution) {
      return NextResponse.json({ error: 'All AI models failed to generate solution' }, { status: 500 });
    }

    // 3. GPT-4o로 정답 교차검증
    let verification = { verified: false, gptoAnswer: '', sonnetAnswer: solution.finalAnswer || '', mismatchFlag: true };

    if (OPENAI_API_KEY && solution.finalAnswer) {
      try {
        const verifyRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: '당신은 수학 문제의 정답을 빠르고 정확하게 구하는 전문가입니다. 반드시 유효한 JSON으로만 응답하세요.' },
              { role: 'user', content: `다음 수학 문제의 정답만 간결하게 구해주세요.\n\n문제:\n${problemText}\n\nJSON 형식: { "finalAnswer": "최종 정답" }` },
            ],
            temperature: 0.0,
            max_tokens: 500,
            response_format: { type: 'json_object' },
          }),
        });

        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          const verifyText = verifyData.choices?.[0]?.message?.content || '';
          const verifyParsed = parseJsonResponse(verifyText);
          const gptoAnswer = String(verifyParsed?.finalAnswer || '').trim();
          const sonnetAnswer = String(solution.finalAnswer || '').trim();
          const match = normalizeAnswer(gptoAnswer) === normalizeAnswer(sonnetAnswer);

          verification = {
            verified: match,
            gptoAnswer,
            sonnetAnswer,
            mismatchFlag: !match,
          };

          console.log(`[generate-solution] Verification: ${match ? '✅ MATCH' : '⚠️ MISMATCH'} — Sonnet: "${sonnetAnswer}" vs GPT-4o: "${gptoAnswer}"`);
        }
      } catch (e) {
        console.error('[generate-solution] Verification failed:', e);
      }
    }

    // 4. 해설 텍스트 포매팅
    const solutionText = formatSolutionText(solution);

    // 5. DB 업데이트
    const updatedAnswerJson = {
      ...(problem.answer_json as Record<string, any> || {}),
      finalAnswer: solution.finalAnswer,
      correct_answer: solution.finalAnswer,
    };

    await supabaseAdmin
      .from('problems')
      .update({
        solution_latex: solutionText,
        answer_json: updatedAnswerJson,
      })
      .eq('id', problemId);

    return NextResponse.json({
      success: true,
      solution: solutionText,
      finalAnswer: solution.finalAnswer,
      approach: solution.approach,
      steps: solution.steps,
      verification,
      usedModel,
    });
  } catch (error) {
    console.error('[generate-solution] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

function parseJsonResponse(text: string): any {
  let jsonStr = text;
  if (text.includes('```json')) {
    jsonStr = text.split('```json')[1].split('```')[0].trim();
  } else if (text.includes('```')) {
    jsonStr = text.split('```')[1].split('```')[0].trim();
  }

  try {
    return JSON.parse(jsonStr);
  } catch {
    // aggressive: double all backslashes
    try {
      return JSON.parse(jsonStr.replace(/\\/g, '\\\\'));
    } catch {
      console.error('[generate-solution] JSON parse failed:', jsonStr.substring(0, 200));
      return null;
    }
  }
}

function normalizeAnswer(ans: string): string {
  return ans
    .replace(/\s+/g, '')
    .replace(/[①②③④⑤]/g, m => {
      const map: Record<string, string> = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5' };
      return map[m] || m;
    })
    .replace(/^\(|\)$/g, '')
    .replace(/\\text\{[^}]*\}/g, '')
    .replace(/\\quad/g, '')
    .replace(/\\,/g, '')
    .toLowerCase()
    .trim();
}

function formatSolutionText(solution: any): string {
  const parts: string[] = [];

  if (solution.approach) {
    parts.push(`[풀이 접근] ${solution.approach}`);
    parts.push('');
  }

  if (solution.steps && Array.isArray(solution.steps)) {
    for (const step of solution.steps) {
      parts.push(`${step.stepNumber || ''}. ${step.description || ''}`);
      if (step.latex) parts.push(`$${step.latex}$`);
      if (step.explanation) parts.push(`→ ${step.explanation}`);
      parts.push('');
    }
  }

  if (solution.finalAnswer) {
    parts.push(`∴ 정답: ${solution.finalAnswer}`);
  }

  if (solution.commonMistakes && solution.commonMistakes.length > 0) {
    parts.push('');
    parts.push('[주의할 점]');
    for (const mistake of solution.commonMistakes) {
      parts.push(`• ${mistake}`);
    }
  }

  return parts.join('\n');
}
