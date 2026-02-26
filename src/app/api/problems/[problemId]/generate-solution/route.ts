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
    const body = await request.json().catch(() => ({}));
    const frontendChoices: string[] = body.choices || [];

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

    // ★ 선택지 구성: 프론트에서 받은 choices 우선, 없으면 content_latex에서 추출
    let choicesForPrompt: string[] = frontendChoices.filter(c => c.trim().length > 0);
    if (choicesForPrompt.length === 0) {
      // content_latex에서 ①~⑤ 패턴 추출 시도
      choicesForPrompt = extractChoicesFromContent(problemText);
    }

    // 선택지가 있으면 프롬프트에 명시적으로 포함
    const choicesSection = choicesForPrompt.length > 0
      ? `\n\n[선택지]\n${choicesForPrompt.map((c, i) => `${['①','②','③','④','⑤'][i] || `(${i+1})`} ${c.replace(/^[①②③④⑤]\s*/, '')}`).join('\n')}`
      : '';

    const isObjective = choicesForPrompt.length > 0;

    // 2. Claude Sonnet으로 풀이 생성 (시중 교재 해설 스타일)
    const solutionPrompt = `당신은 한국 수학 시중 교재(수학의 정석, 쎈, 마플 등)의 해설지를 집필하는 전문가입니다.
학생이 혼자 읽고 완전히 이해할 수 있도록 **교재 해설지 스타일**로 풀이를 작성하세요.

문제:
${problemText}${choicesSection}

★ 작성 규칙:
1. **개념 정리**: 이 문제를 풀기 위해 필요한 핵심 개념/공식을 1~2줄로 먼저 제시
2. **풀이 과정**: 교재처럼 자연스러운 서술체로 작성 (번호 매기되, "~이므로", "~에 의해", "따라서" 등 접속사 활용)
3. **수식 표기**: LaTeX 인라인 수식은 $...$, 독립 수식은 $$...$$ 사용. 중간 계산을 절대 생략하지 마세요
4. **최종 답**: finalAnswer를 반드시 명시 (빈 문자열 절대 불가)
${isObjective ? `5. **선택지 검증**: 객관식이므로 각 선택지(①~⑤)를 하나씩 대입/검증하여 참/거짓을 판별하세요. choiceAnalysis 배열에 각 선택지의 판별 결과를 작성하세요
6. finalAnswer에 정답 번호(④ 또는 4 등)를 반드시 포함` : `5. 주관식이면 최종 수치/식을 정확히 제시하세요`}

다음 JSON 형식으로만 응답하세요:
{
  "concept": "핵심 개념/공식 요약 (1~2줄, 예: '항등식은 모든 x값에 대해 양변이 같은 식이다. f(x)=g(x)가 항등식이면 동류항의 계수가 모두 같다.')",
  "steps": [
    { "stepNumber": 1, "description": "교재 서술체로 풀이 과정 설명 (수식 포함하여 자연스럽게)", "latex": "핵심 수식 (있으면)" }
  ],${isObjective ? `
  "choiceAnalysis": [
    { "choice": "①", "expression": "선택지 수식/내용", "result": "항등식이다 / 항등식이 아니다 등 판별 결과", "isCorrect": true }
  ],` : ''}
  "finalAnswer": "최종 정답 (예: ④, 24, x=3 등)",
  "tip": "이 유형 문제를 풀 때 핵심 포인트 또는 학생들이 자주 하는 실수 (1줄)"
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
            system: '당신은 한국 수학 시중 교재(수학의 정석, 쎈, 마플, RPM 등)의 해설지를 집필하는 전문가입니다. 학생이 혼자 읽고 완전히 이해할 수 있도록 교재 해설지처럼 명확하고 체계적으로 작성합니다. 반드시 유효한 JSON으로만 응답하세요. LaTeX 수식은 반드시 이중 백슬래시(\\\\)를 사용하세요.',
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
              { role: 'system', content: '당신은 한국 수학 시중 교재 해설지를 집필하는 전문가입니다. 교재처럼 명확하고 체계적으로 작성합니다. 반드시 유효한 JSON으로만 응답하세요.' },
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
              { role: 'user', content: `다음 수학 문제의 정답만 간결하게 구해주세요.\n\n문제:\n${problemText}${choicesSection}\n\nJSON 형식: { "finalAnswer": "최종 정답" }` },
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

/** content_latex에서 ①~⑤ 선택지 추출 */
function extractChoicesFromContent(latex: string): string[] {
  const choices: string[] = [];
  const circledMarkers = ['①', '②', '③', '④', '⑤'];
  const firstIdx = latex.indexOf('①');
  if (firstIdx === -1) return choices;

  const remaining = latex.substring(firstIdx);
  for (let i = 0; i < circledMarkers.length; i++) {
    const marker = circledMarkers[i];
    const nextMarker = circledMarkers[i + 1];
    const startIdx = remaining.indexOf(marker);
    if (startIdx === -1) continue;

    let endIdx = nextMarker ? remaining.indexOf(nextMarker) : remaining.length;
    if (endIdx === -1) endIdx = remaining.length;

    const choiceText = remaining.substring(startIdx, endIdx).trim();
    if (choiceText) choices.push(choiceText);
  }
  return choices;
}

/** 시중 교재 해설지 스타일로 포맷팅 */
function formatSolutionText(solution: any): string {
  const parts: string[] = [];

  // ── 개념 정리 ──
  if (solution.concept) {
    parts.push(`[개념] ${solution.concept}`);
    parts.push('');
  }

  // ── 풀이 ──
  parts.push('[풀이]');
  if (solution.steps && Array.isArray(solution.steps)) {
    for (const step of solution.steps) {
      const desc = step.description || '';
      const latex = step.latex ? ` $${step.latex}$` : '';
      // 교재처럼 자연스러운 서술 (번호 + 설명 + 수식 인라인)
      parts.push(`${step.stepNumber || ''}. ${desc}${latex}`);
    }
    parts.push('');
  }

  // ── 선택지 분석 (객관식) ──
  if (solution.choiceAnalysis && Array.isArray(solution.choiceAnalysis) && solution.choiceAnalysis.length > 0) {
    parts.push('[선택지 검증]');
    for (const ca of solution.choiceAnalysis) {
      const marker = ca.choice || '';
      const expr = ca.expression ? ` ${ca.expression}` : '';
      const result = ca.result || '';
      const icon = ca.isCorrect === false ? '✓' : (ca.isCorrect === true ? '✗' : '');
      parts.push(`${marker}${expr} → ${result} ${icon}`);
    }
    parts.push('');
  }

  // ── 정답 ──
  if (solution.finalAnswer) {
    parts.push(`∴ 정답: ${solution.finalAnswer}`);
  }

  // ── 풀이 팁 ──
  if (solution.tip) {
    parts.push('');
    parts.push(`💡 ${solution.tip}`);
  }

  // ── 레거시 호환: commonMistakes (기존 데이터) ──
  if (!solution.tip && solution.commonMistakes && solution.commonMistakes.length > 0) {
    parts.push('');
    parts.push(`💡 ${solution.commonMistakes[0]}`);
  }

  // ── 레거시 호환: approach (기존 데이터) ──
  if (!solution.concept && solution.approach && !solution.steps?.length) {
    return `[풀이 접근] ${solution.approach}\n\n∴ 정답: ${solution.finalAnswer || ''}`;
  }

  return parts.join('\n');
}
