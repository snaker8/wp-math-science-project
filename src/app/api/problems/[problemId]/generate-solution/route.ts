// ============================================================================
// 개별 문제 AI 해설 생성 API
// POST /api/problems/[problemId]/generate-solution
// - Claude Sonnet으로 풀이 생성 + Gemini Flash 정답 교차검증
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

    // 1. 문제 데이터 조회 (이미지, AI 분석 데이터 포함)
    const body = await request.json().catch(() => ({}));
    const frontendChoices: string[] = body.choices || [];

    const { data: problem, error: fetchError } = await supabaseAdmin
      .from('problems')
      .select('id, content_latex, solution_latex, answer_json, images, ai_analysis, source_name')
      .eq('id', problemId)
      .single();

    if (fetchError || !problem) {
      return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
    }

    // 1-b. 분류 정보 조회 (학년/과목/단원)
    const { data: classification } = await supabaseAdmin
      .from('classifications')
      .select('type_code, expanded_type_code, difficulty, cognitive_domain')
      .eq('problem_id', problemId)
      .single();

    // 1-c. 유형명 조회
    let typeName = '';
    const typeCode = classification?.expanded_type_code || classification?.type_code || '';
    if (typeCode) {
      const LEVEL_PREFIXES = ['MA-HS0', 'MA-HS1', 'MA-HS2', 'MA-MS1', 'MA-MS2', 'MA-MS3', 'MA-EL4', 'MA-EL5', 'MA-EL6'];
      const lookupCodes = [typeCode];
      if (!typeCode.startsWith('MA-')) {
        LEVEL_PREFIXES.forEach(prefix => lookupCodes.push(`${prefix}-${typeCode}`));
      }
      const { data: typeData } = await supabaseAdmin
        .from('expanded_math_types')
        .select('type_code, type_name')
        .in('type_code', lookupCodes)
        .limit(1);
      if (typeData?.[0]) typeName = typeData[0].type_name;
    }

    // 1-d. AI 분석에서 과목/단원 정보 추출
    const aiAnalysis = problem.ai_analysis as Record<string, any> | null;
    const aiClassification = aiAnalysis?.classification || {};
    const subject = aiClassification.subject || '';
    const chapter = aiClassification.chapter || '';
    const section = aiClassification.section || '';

    const problemText = problem.content_latex || '';
    if (!problemText.trim()) {
      return NextResponse.json({ error: 'Problem content is empty' }, { status: 400 });
    }

    // 1-e. 이미지/그래프 정보 수집
    const images = (problem.images as Array<{ url: string; type: string; label: string }>) || [];
    const graphData = aiAnalysis?.graphData || aiAnalysis?.figureData || null;
    const hasImages = images.length > 0 || problemText.includes('![');

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

    // ★ 학년/과목 컨텍스트 구성
    const curriculumParts: string[] = [];
    if (subject) curriculumParts.push(`과목: ${subject}`);
    if (chapter) curriculumParts.push(`단원: ${chapter}`);
    if (section) curriculumParts.push(`중단원: ${section}`);
    if (typeName) curriculumParts.push(`유형: ${typeName}`);
    if (typeCode) curriculumParts.push(`유형코드: ${typeCode}`);
    const curriculumContext = curriculumParts.length > 0
      ? `\n\n[교육과정 정보]\n${curriculumParts.join('\n')}`
      : '';

    // ★ 그래프/이미지 컨텍스트 구성
    let imageContext = '';
    if (hasImages && graphData) {
      // Desmos 분석 데이터가 있는 경우 → 수식 정보 전달
      const expressions = graphData.expressions || [];
      const description = graphData.description || '';
      const points = (graphData.points || []).map((p: any) => `${p.label || ''}(${p.x}, ${p.y})`).join(', ');
      imageContext = `\n\n[문제에 포함된 그래프/도형 정보]
${description ? `설명: ${description}` : ''}
${expressions.length > 0 ? `수식: ${expressions.join(', ')}` : ''}
${points ? `주요 점: ${points}` : ''}
${graphData.xRange ? `x축 범위: [${graphData.xRange}]` : ''}
${graphData.yRange ? `y축 범위: [${graphData.yRange}]` : ''}
★ 위 그래프/도형 정보를 반드시 참고하여 풀이하세요. 그래프가 없다고 말하지 마세요.`;
    } else if (hasImages) {
      imageContext = `\n\n[참고] 이 문제에는 그래프/도형 이미지가 포함되어 있습니다. 문제 텍스트에서 함수식, 도형 조건, 좌표 등을 파악하여 풀이하세요. 이미지를 직접 볼 수 없지만, 문제의 수학적 조건만으로 풀이가 가능합니다. "그래프가 없어서 풀 수 없다"고 답하지 마세요.`;
    }

    // ★ 학년 수준에 맞는 풀이 지시
    const levelInstruction = subject
      ? `\n\n★★ 중요: 이 문제는 "${subject}" 과목입니다. 반드시 해당 교육과정 범위 내의 개념과 공식만 사용하여 풀이하세요.
- 해당 과목에서 아직 배우지 않은 상위 과정의 공식이나 정리는 사용하지 마세요.
- 예: 중학교 문제에 미적분 사용 금지, 수학I 문제에 미적분 개념 사용 금지
- 학생이 배운 범위 내에서 이해할 수 있는 풀이를 작성하세요.`
      : '';

    // 2. Claude Sonnet으로 풀이 생성 (시중 교재 해설지 스타일 — 간결)
    const solutionPrompt = `시중 수학 교재(쎈, 마플) 해설지처럼 **간결하고 핵심만** 작성하세요.
${curriculumContext}

문제:
${problemText}${choicesSection}${imageContext}${levelInstruction}

★ 작성 규칙:
1. steps는 **2~4단계**로 간결하게. 각 단계는 핵심 계산/논리만 1~2문장.
2. 불필요한 설명/반복 금지. "~이다.", "따라서" 등 간결체.
3. 수식: $...$로 인라인, 핵심 전개만.
4. finalAnswer: ${isObjective ? '반드시 번호(①~⑤) 포함' : '최종 수치/식 정확히 제시'}. 빈 문자열 불가.
${hasImages ? `5. 그래프/도형: 문제 조건에서 수학적 관계 파악하여 풀이. "볼 수 없다" 금지.` : ''}

JSON:
{
  "concept": "핵심 공식/개념 1줄",
  "steps": [
    { "stepNumber": 1, "description": "간결한 풀이 (수식 포함)", "latex": "핵심 수식" }
  ],
  "finalAnswer": "정답",
  "tip": "풀이 포인트 1줄"
}`;

    let solution: any = null;
    let usedModel = '';

    // Sonnet 시도 (이미지 있으면 Vision 모드)
    if (ANTHROPIC_API_KEY) {
      try {
        console.log(`[generate-solution] Calling Claude Sonnet for problem ${problemId} (images: ${images.length})`);

        // ★ 이미지가 있으면 Vision 메시지 구성
        let userContent: any;
        if (images.length > 0) {
          // 이미지 URL → base64 변환 or URL 직접 전달
          const contentParts: any[] = [];
          for (const img of images.slice(0, 3)) { // 최대 3개
            try {
              const imgRes = await fetch(img.url);
              if (imgRes.ok) {
                const arrayBuffer = await imgRes.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                const contentType = imgRes.headers.get('content-type') || 'image/png';
                contentParts.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: contentType,
                    data: base64,
                  },
                });
              }
            } catch (imgErr) {
              console.warn(`[generate-solution] Image fetch failed: ${img.url}`, imgErr);
            }
          }
          contentParts.push({ type: 'text', text: solutionPrompt });
          userContent = contentParts;
        } else {
          userContent = solutionPrompt;
        }

        const systemPrompt = subject
          ? `당신은 한국 "${subject}" 과목 시중 교재(수학의 정석, 쎈, 마플, RPM 등)의 해설지를 집필하는 전문가입니다. 반드시 ${subject} 교육과정 범위 내의 개념만 사용하여 풀이하세요. 상위 과정 개념 사용을 금지합니다. 학생이 혼자 읽고 완전히 이해할 수 있도록 교재 해설지처럼 명확하고 체계적으로 작성합니다. 반드시 유효한 JSON으로만 응답하세요. LaTeX 수식은 반드시 이중 백슬래시(\\\\)를 사용하세요.`
          : '당신은 한국 수학 시중 교재(수학의 정석, 쎈, 마플, RPM 등)의 해설지를 집필하는 전문가입니다. 학생이 혼자 읽고 완전히 이해할 수 있도록 교재 해설지처럼 명확하고 체계적으로 작성합니다. 반드시 유효한 JSON으로만 응답하세요. LaTeX 수식은 반드시 이중 백슬래시(\\\\)를 사용하세요.';

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
            system: systemPrompt,
            messages: [{ role: 'user', content: userContent }],
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

    // Sonnet 실패 시 GPT-4o 폴백 (Vision 지원)
    if (!solution && OPENAI_API_KEY) {
      console.log(`[generate-solution] Falling back to GPT-4o for problem ${problemId} (images: ${images.length})`);
      try {
        // GPT-4o Vision 메시지 구성
        let gptUserContent: any;
        if (images.length > 0) {
          const parts: any[] = images.slice(0, 3).map(img => ({
            type: 'image_url',
            image_url: { url: img.url, detail: 'high' },
          }));
          parts.push({ type: 'text', text: solutionPrompt });
          gptUserContent = parts;
        } else {
          gptUserContent = solutionPrompt;
        }

        const gptSystemMsg = subject
          ? `당신은 한국 "${subject}" 과목 시중 교재 해설지를 집필하는 전문가입니다. 반드시 ${subject} 교육과정 범위 내의 개념만 사용하세요. 교재처럼 명확하고 체계적으로 작성합니다. 반드시 유효한 JSON으로만 응답하세요.`
          : '당신은 한국 수학 시중 교재 해설지를 집필하는 전문가입니다. 교재처럼 명확하고 체계적으로 작성합니다. 반드시 유효한 JSON으로만 응답하세요.';

        const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: gptSystemMsg },
              { role: 'user', content: gptUserContent },
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

    // 3. Gemini Flash로 정답 교차검증
    let verification = { verified: false, verifyAnswer: '', sonnetAnswer: solution.finalAnswer || '', mismatchFlag: true };
    const geminiKey = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY;

    if (geminiKey && solution.finalAnswer) {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(geminiKey);
        const geminiModelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
        const verifyModel = genAI.getGenerativeModel({
          model: geminiModelName,
          generationConfig: { temperature: 0.0, maxOutputTokens: 500 },
        });

        const verifyPrompt = `다음 수학 문제의 정답만 간결하게 구해주세요. JSON으로만 응답하세요.

문제:
${problemText}${choicesSection}

JSON 형식: { "finalAnswer": "최종 정답" }`;

        const verifyResult = await verifyModel.generateContent(verifyPrompt);
        const verifyText = verifyResult.response.text()?.trim() || '';
        const verifyClean = verifyText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
        const verifyParsed = parseJsonResponse(verifyClean);
        const geminiAnswer = String(verifyParsed?.finalAnswer || '').trim();
        const sonnetAnswer = String(solution.finalAnswer || '').trim();
        const match = normalizeAnswer(geminiAnswer) === normalizeAnswer(sonnetAnswer);

        verification = {
          verified: match,
          verifyAnswer: geminiAnswer,
          sonnetAnswer,
          mismatchFlag: !match,
        };

        console.log(`[generate-solution] Verification: ${match ? '✅ MATCH' : '⚠️ MISMATCH'} — Sonnet: "${sonnetAnswer}" vs Gemini: "${geminiAnswer}"`);
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
