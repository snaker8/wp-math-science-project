// ============================================================================
// AI Twin Problem Generator Edge Function
// 유사 문제 생성 (Twin Problem) - GPT-4o 기반
// ============================================================================
// 입력: 원본 문제 LaTeX
// 출력: 수학적 논리 유지 + 숫자/변수 변경된 쌍둥이 문제 및 해설
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { callOpenAI, parseJSONResponse } from '../_shared/openai.ts';
import { handleCORS, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { TwinProblemRequest, TwinProblemResponse } from '../_shared/types.ts';

// ============================================================================
// System Prompt for Twin Problem Generation
// ============================================================================

const SYSTEM_PROMPT = `당신은 수학 문제 출제 전문가입니다. 주어진 원본 문제를 바탕으로 "쌍둥이 문제"를 생성합니다.

## 쌍둥이 문제 생성 원칙

### 1. 유지해야 할 요소
- 수학적 개념과 논리 구조
- 풀이 방법과 단계
- 문제의 난이도 수준
- 문제 유형과 형식

### 2. 변경해야 할 요소
- 숫자 (계수, 상수, 범위 등)
- 변수명 (필요시)
- 문제 상황/맥락 (서술형인 경우)
- 보기 순서 (객관식인 경우)

### 3. 품질 기준
- 원본과 동일한 풀이 과정이 적용되어야 함
- 정답이 깔끔한 값이 되도록 숫자 조정
- 계산이 지나치게 복잡해지지 않도록 주의
- LaTeX 문법이 정확해야 함

## 응답 형식 (JSON)
{
  "problemLatex": "새 문제의 LaTeX 코드",
  "problemText": "새 문제의 텍스트 버전",
  "answer": "최종 정답",
  "answerLatex": "정답의 LaTeX 표현 (수식인 경우)",
  "solution": "상세 풀이 과정 (텍스트)",
  "solutionLatex": "상세 풀이 과정 (LaTeX 포함)",
  "changesApplied": ["변경사항1", "변경사항2", ...]
}

## 풀이 작성 가이드
- 각 단계를 명확히 구분
- 사용된 공식이나 정리 명시
- 계산 과정 상세히 기술
- 최종 답 확인 과정 포함`;

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
    const body: TwinProblemRequest = await req.json();
    const { originalLatex, originalText, difficulty, preserveStructure = true } = body;

    if (!originalLatex && !originalText) {
      return errorResponse('originalLatex or originalText is required', 400);
    }

    // Build user message
    let userMessage = '다음 원본 문제를 바탕으로 쌍둥이 문제를 생성해 주세요.\n\n';

    userMessage += `[원본 문제 - LaTeX]\n${originalLatex || '(없음)'}\n\n`;

    if (originalText) {
      userMessage += `[원본 문제 - 텍스트]\n${originalText}\n\n`;
    }

    if (difficulty) {
      const difficultyLabels = ['최하', '하', '중', '상', '최상'];
      userMessage += `[요청 난이도: ${difficulty} (${difficultyLabels[difficulty - 1]})]\n\n`;
    }

    if (preserveStructure) {
      userMessage += '[주의: 문제의 구조와 형식을 최대한 유지해 주세요.]\n';
    } else {
      userMessage += '[참고: 문제의 구조를 다소 변형해도 됩니다.]\n';
    }

    // Call OpenAI API
    const response = await callOpenAI(openaiApiKey, {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      model: 'gpt-4o',
      temperature: 0.8,
      maxTokens: 2048,
      responseFormat: { type: 'json_object' },
    });

    // Parse and validate response
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return errorResponse('No response from OpenAI', 500);
    }

    const twinData = parseJSONResponse<TwinProblemResponse['data']>(content);

    // Validate required fields
    if (!twinData?.problemLatex || !twinData?.answer || !twinData?.solution) {
      return errorResponse('Invalid twin problem response', 500);
    }

    const result: TwinProblemResponse = {
      success: true,
      data: twinData,
    };

    return jsonResponse(result);
  } catch (error) {
    console.error('Twin problem error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
});
