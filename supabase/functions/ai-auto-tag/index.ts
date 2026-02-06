// ============================================================================
// AI Auto-Tagging Edge Function
// 자동 유형 분류 (Auto-Tagging) - GPT-4o 기반
// ============================================================================
// 입력: 문제의 텍스트와 LaTeX 수식
// 출력: 유형 분류, 난이도(1~5), 인지 영역(계산/이해/추론/해결)
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { callOpenAI, parseJSONResponse } from '../_shared/openai.ts';
import { handleCORS, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { AutoTagRequest, AutoTagResponse } from '../_shared/types.ts';

// ============================================================================
// System Prompt for Auto-Tagging
// ============================================================================

const SYSTEM_PROMPT = `당신은 수학 문제 분류 전문가입니다. 주어진 수학 문제를 분석하여 다음 정보를 JSON 형식으로 반환하세요.

## 분류 기준

### 1. 유형 분류 (skillId, skillName, skillPath)
한국 중고등 수학 교육과정에 따라 3,569개 유형 중 가장 적합한 유형을 선택합니다.
- skillId: 고유 유형 ID (예: "M1-2-3-001")
- skillName: 유형명 (예: "이차방정식의 근의 공식")
- skillPath: 상위 분류 경로 배열 (예: ["수학", "방정식", "이차방정식"])

### 2. 난이도 (difficulty, difficultyLabel)
1~5 척도로 평가합니다:
- 1 (최하): 기본 개념 확인, 단순 계산
- 2 (하): 기본 공식 적용, 한 단계 풀이
- 3 (중): 복합 개념, 2~3단계 풀이
- 4 (상): 심화 응용, 다단계 추론
- 5 (최상): 창의적 문제해결, 복합 추론

### 3. 인지 영역 (cognitiveType, cognitiveLabel)
- calculation (계산): 연산 능력 중심
- understanding (이해): 개념 이해도 확인
- reasoning (추론): 논리적 사고력
- problem_solving (해결): 종합적 문제해결력

### 4. 신뢰도 (confidence)
분류 확신도를 0.0~1.0 사이 값으로 제시합니다.

### 5. 분류 근거 (reasoning)
분류 이유를 간결하게 설명합니다 (한국어).

## 응답 형식 (JSON)
{
  "skillId": "문자열",
  "skillName": "문자열",
  "skillPath": ["문자열", ...],
  "difficulty": 숫자(1-5),
  "difficultyLabel": "최하|하|중|상|최상",
  "cognitiveType": "calculation|understanding|reasoning|problem_solving",
  "cognitiveLabel": "계산|이해|추론|해결",
  "confidence": 숫자(0.0-1.0),
  "reasoning": "문자열"
}`;

// ============================================================================
// Handler
// ============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCORS(req);
  if (corsResponse) return corsResponse;

  try {
    // Validate request method
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405);
    }

    // Get OpenAI API key from environment
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return errorResponse('OpenAI API key not configured', 500);
    }

    // Parse request body
    const body: AutoTagRequest = await req.json();
    const { problemText, latex, subject } = body;

    if (!problemText && !latex) {
      return errorResponse('problemText or latex is required', 400);
    }

    // Build user message
    let userMessage = '다음 수학 문제를 분석하여 분류해 주세요.\n\n';

    if (subject) {
      userMessage += `[과목: ${subject}]\n\n`;
    }

    if (problemText) {
      userMessage += `[문제 텍스트]\n${problemText}\n\n`;
    }

    if (latex) {
      userMessage += `[LaTeX 수식]\n${latex}\n`;
    }

    // Call OpenAI API
    const response = await callOpenAI(openaiApiKey, {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      model: 'gpt-4o',
      temperature: 0.3,
      maxTokens: 1024,
      responseFormat: { type: 'json_object' },
    });

    // Parse and validate response
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return errorResponse('No response from OpenAI', 500);
    }

    const tagData = parseJSONResponse<AutoTagResponse['data']>(content);

    // Validate required fields
    if (!tagData?.skillId || !tagData?.skillName || !tagData?.difficulty) {
      return errorResponse('Invalid classification response', 500);
    }

    const result: AutoTagResponse = {
      success: true,
      data: tagData,
    };

    return jsonResponse(result);
  } catch (error) {
    console.error('Auto-tag error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
});
