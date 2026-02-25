// ============================================================================
// Twin Problem Generator - 쌍둥이 문제 생성 (Zero-Wrong Loop)
// LaTeX 구조 분석 → 숫자/조건 변형 → 유사 문제 생성
// ============================================================================

import type { TwinProblem, ProblemModification } from '@/types/workflow';

// ============================================================================
// LaTeX 분석 유틸리티
// ============================================================================

interface NumberMatch {
  value: string;
  index: number;
  type: 'integer' | 'fraction' | 'decimal' | 'coefficient';
}

interface LatexStructure {
  original: string;
  numbers: NumberMatch[];
  variables: string[];
  operators: string[];
  functions: string[];
}

/**
 * LaTeX 문자열에서 숫자 추출
 */
function extractNumbers(latex: string): NumberMatch[] {
  const numbers: NumberMatch[] = [];

  // 정수 추출 (변수 앞 계수 제외)
  const integerRegex = /(?<![a-zA-Z])(-?\d+)(?![a-zA-Z\d])/g;
  let match;
  while ((match = integerRegex.exec(latex)) !== null) {
    numbers.push({
      value: match[1],
      index: match.index,
      type: 'integer',
    });
  }

  // 분수 추출 (\frac{a}{b})
  const fractionRegex = /\\frac\{(-?\d+)\}\{(-?\d+)\}/g;
  while ((match = fractionRegex.exec(latex)) !== null) {
    numbers.push({
      value: match[0],
      index: match.index,
      type: 'fraction',
    });
  }

  // 소수 추출
  const decimalRegex = /(-?\d+\.\d+)/g;
  while ((match = decimalRegex.exec(latex)) !== null) {
    numbers.push({
      value: match[1],
      index: match.index,
      type: 'decimal',
    });
  }

  // 계수 추출 (2x, 3y 등)
  const coefficientRegex = /(-?\d+)([a-zA-Z])/g;
  while ((match = coefficientRegex.exec(latex)) !== null) {
    numbers.push({
      value: match[1],
      index: match.index,
      type: 'coefficient',
    });
  }

  return numbers.sort((a, b) => a.index - b.index);
}

/**
 * LaTeX 구조 분석
 */
function analyzeLatexStructure(latex: string): LatexStructure {
  const numbers = extractNumbers(latex);

  // 변수 추출
  const variableRegex = /(?<!\w)([a-zA-Z])(?=\s*[+\-=^_{}]|\s*$|\))/g;
  const variables: string[] = [];
  let match;
  while ((match = variableRegex.exec(latex)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }

  // 연산자 추출
  const operators = latex.match(/[+\-×÷=<>≤≥]/g) || [];

  // 수학 함수 추출
  const functions = latex.match(/\\(sin|cos|tan|log|ln|sqrt|lim|sum|int|frac)/g) || [];

  return {
    original: latex,
    numbers,
    variables,
    operators,
    functions: functions.map((f) => f.replace('\\', '')),
  };
}

// ============================================================================
// 숫자 변형 전략
// ============================================================================

interface VariationStrategy {
  name: string;
  apply: (value: number) => number;
}

const variationStrategies: VariationStrategy[] = [
  {
    name: 'increment',
    apply: (v) => v + Math.floor(Math.random() * 3) + 1,
  },
  {
    name: 'decrement',
    apply: (v) => v - Math.floor(Math.random() * 3) - 1,
  },
  {
    name: 'multiply',
    apply: (v) => v * (Math.floor(Math.random() * 2) + 2),
  },
  {
    name: 'similar',
    apply: (v) => {
      const offset = Math.floor(Math.random() * 5) - 2;
      return v + offset || v + 1;
    },
  },
];

/**
 * 숫자 변형
 */
function varyNumber(
  value: string,
  type: NumberMatch['type'],
  difficultyAdjustment: -1 | 0 | 1 = 0
): { newValue: string; modification: ProblemModification } {
  let newValue: string;
  let modificationType: ProblemModification['type'] = 'NUMBER';

  if (type === 'fraction') {
    // 분수 변형: \frac{a}{b}
    const fractionMatch = value.match(/\\frac\{(-?\d+)\}\{(-?\d+)\}/);
    if (fractionMatch) {
      const numerator = parseInt(fractionMatch[1]);
      const denominator = parseInt(fractionMatch[2]);
      const strategy = variationStrategies[Math.floor(Math.random() * variationStrategies.length)];

      // 난이도에 따라 분자 또는 분모 변형
      if (difficultyAdjustment >= 0) {
        const newNumerator = strategy.apply(numerator);
        newValue = `\\frac{${newNumerator}}{${denominator}}`;
      } else {
        const newDenominator = Math.max(2, strategy.apply(denominator));
        newValue = `\\frac{${numerator}}{${newDenominator}}`;
      }
    } else {
      newValue = value;
    }
  } else if (type === 'decimal') {
    // 소수 변형
    const num = parseFloat(value);
    const strategy = variationStrategies[Math.floor(Math.random() * 2)]; // increment or decrement
    const varied = strategy.apply(num * 10) / 10;
    newValue = varied.toFixed(1);
  } else if (type === 'coefficient') {
    // 계수 변형
    modificationType = 'COEFFICIENT';
    const num = parseInt(value);
    const newNum = num + (Math.floor(Math.random() * 3) + 1) * (Math.random() > 0.5 ? 1 : -1);
    newValue = newNum === 0 ? '1' : String(newNum);
  } else {
    // 정수 변형
    const num = parseInt(value);
    const strategy = variationStrategies[Math.floor(Math.random() * variationStrategies.length)];
    newValue = String(strategy.apply(num));
  }

  return {
    newValue,
    modification: {
      type: modificationType,
      original: value,
      modified: newValue,
      location: `index-${type}`,
    },
  };
}

// ============================================================================
// 문제 조건 변형
// ============================================================================

const conditionVariations: Record<string, string[]> = {
  '실수': ['정수', '자연수', '유리수'],
  '정수': ['자연수', '실수', '홀수'],
  '양수': ['음수', '0이 아닌', '양의 정수'],
  '음수': ['양수', '0이 아닌', '음의 정수'],
  '최댓값': ['최솟값', '극값', '극댓값'],
  '최솟값': ['최댓값', '극값', '극솟값'],
  '증가': ['감소', '일정', '변화'],
  '감소': ['증가', '일정', '변화'],
};

/**
 * 조건 변형
 */
function varyConditions(text: string): { newText: string; modifications: ProblemModification[] } {
  let newText = text;
  const modifications: ProblemModification[] = [];

  for (const [original, alternatives] of Object.entries(conditionVariations)) {
    if (text.includes(original) && Math.random() > 0.5) {
      const replacement = alternatives[Math.floor(Math.random() * alternatives.length)];
      newText = newText.replace(original, replacement);
      modifications.push({
        type: 'CONDITION',
        original,
        modified: replacement,
        location: 'text',
      });
    }
  }

  return { newText, modifications };
}

// ============================================================================
// Twin Problem 생성
// ============================================================================

export interface TwinGenerationOptions {
  difficultyAdjustment?: -1 | 0 | 1;
  preserveStructure?: boolean;
  variationCount?: number;
  numberVariationRatio?: number; // 변형할 숫자 비율 (0-1)
}

const DEFAULT_OPTIONS: Required<TwinGenerationOptions> = {
  difficultyAdjustment: 0,
  preserveStructure: true,
  variationCount: 1,
  numberVariationRatio: 0.7,
};

// ============================================================================
// 이미지 추출/재삽입 유틸리티
// ============================================================================

const IMAGE_MARKDOWN_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * content에서 ![alt](url) 이미지 마크다운을 분리
 * - base64 이미지가 수천 글자라 GPT 프롬프트에 넣으면 혼란
 * - 텍스트만 GPT에 전달하고, 이미지는 나중에 재삽입
 */
function extractImages(content: string): { textOnly: string; images: string[] } {
  const images: string[] = [];
  const textOnly = content.replace(IMAGE_MARKDOWN_REGEX, (match) => {
    images.push(match);
    return ''; // 이미지 제거
  }).replace(/\n{3,}/g, '\n\n').trim(); // 빈 줄 정리

  return { textOnly, images };
}

/**
 * 생성된 twin content에 원본 이미지를 재삽입
 */
function reinsertImages(twinContent: string, images: string[]): string {
  if (images.length === 0) return twinContent;
  return twinContent + '\n\n' + images.join('\n');
}

/**
 * 쌍둥이 문제 생성
 */
export function generateTwinProblem(
  originalProblem: {
    id: string;
    contentLatex: string;
    solutionLatex?: string;
    typeCode: string;
    answer?: string;
    choices?: string[];
  },
  studentId: string,
  options: TwinGenerationOptions = {}
): TwinProblem {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // ★ 이미지 분리 — 숫자 변형 시 base64 문자열이 깨지지 않도록
  const { textOnly, images: originalImages } = extractImages(originalProblem.contentLatex);

  const structure = analyzeLatexStructure(textOnly);
  const modifications: ProblemModification[] = [];

  let newContentLatex = textOnly;

  // 숫자 변형 (뒤에서부터 치환하여 인덱스 유지)
  const numbersToVary = structure.numbers
    .filter(() => Math.random() < opts.numberVariationRatio)
    .reverse();

  for (const num of numbersToVary) {
    const { newValue, modification } = varyNumber(
      num.value,
      num.type,
      opts.difficultyAdjustment
    );

    // LaTeX에서 해당 위치의 숫자 치환
    newContentLatex =
      newContentLatex.substring(0, num.index) +
      newValue +
      newContentLatex.substring(num.index + num.value.length);

    modifications.push({
      ...modification,
      location: `position-${num.index}`,
    });
  }

  // 조건 변형 (선택적)
  if (!opts.preserveStructure) {
    const { newText, modifications: condMods } = varyConditions(newContentLatex);
    newContentLatex = newText;
    modifications.push(...condMods);
  }

  // ★ 선택지 변형: 원본 선택지의 숫자도 동일하게 변형
  const originalChoices = originalProblem.choices || [];
  let newChoices: string[] = [];
  if (originalChoices.length > 0) {
    newChoices = originalChoices.map((choice) => {
      let newChoice = choice;
      for (const mod of modifications) {
        if (mod.type === 'NUMBER' || mod.type === 'COEFFICIENT') {
          newChoice = newChoice.split(mod.original).join(mod.modified);
        }
      }
      return newChoice;
    });
  }

  // 해설 생성 (간단한 치환)
  let newSolutionLatex = originalProblem.solutionLatex || '';
  if (newSolutionLatex) {
    for (const mod of modifications) {
      if (mod.type === 'NUMBER' || mod.type === 'COEFFICIENT') {
        newSolutionLatex = newSolutionLatex.split(mod.original).join(mod.modified);
      }
    }
  }

  // ★ 원본 이미지 재삽입
  newContentLatex = reinsertImages(newContentLatex, originalImages);

  // HTML 변환 (간단한 버전)
  const newContentHtml = latexToSimpleHtml(newContentLatex);
  const newSolutionHtml = newSolutionLatex ? latexToSimpleHtml(newSolutionLatex) : '';

  return {
    id: crypto.randomUUID(),
    originalProblemId: originalProblem.id,
    originalTypeCode: originalProblem.typeCode,
    contentLatex: newContentLatex,
    contentHtml: newContentHtml,
    solutionLatex: newSolutionLatex,
    solutionHtml: newSolutionHtml,
    answer: calculateNewAnswer(originalProblem.answer, modifications),
    choices: newChoices,
    modifications,
    generatedAt: new Date().toISOString(),
    generatedFor: studentId,
  };
}

/**
 * 여러 쌍둥이 문제 일괄 생성
 */
export function generateTwinProblems(
  problems: Array<{
    id: string;
    contentLatex: string;
    solutionLatex?: string;
    typeCode: string;
    answer?: string;
    choices?: string[];
  }>,
  studentId: string,
  options: TwinGenerationOptions = {}
): TwinProblem[] {
  return problems.map((problem) => generateTwinProblem(problem, studentId, options));
}

// ============================================================================
// GPT-4o 기반 쌍둥이 문제 생성 (고급)
// ============================================================================

const TWIN_GENERATION_PROMPT = `당신은 수학 문제 출제 및 풀이 전문가입니다. 주어진 원본 문제를 분석하여 구조는 유지하면서 숫자와 조건만 변형한 유사 문제를 생성하고, **변형된 문제에 대해 처음부터 완전한 풀이를 작성**해주세요.

## 원본 문제
{ORIGINAL_PROBLEM}
{CHOICES_SECTION}
## 원본 풀이
{ORIGINAL_SOLUTION}

## 원본 정답
{ORIGINAL_ANSWER}

## 난이도 조절
{DIFFICULTY_ADJUSTMENT}

## 핵심 요구사항
1. 문제의 수학적 구조와 풀이 방법은 동일하게 유지하되, 숫자/계수/상수를 변형
2. **풀이(solutionLatex)는 반드시 처음부터 끝까지 완전하게 작성** — 단계별로 계산 과정을 빠짐없이 서술
3. 풀이의 각 단계에서 계산이 수학적으로 정확한지 스스로 검증
4. **정답(answer)은 반드시 풀이의 최종 결과와 정확히 일치**해야 함
5. 원본 풀이가 불완전하거나 없는 경우: 변형된 문제를 직접 분석하여 처음부터 풀이를 작성
6. 객관식: 변형된 문제에 맞는 새로운 선택지 5개 생성. **정답이 반드시 선택지 중 하나와 일치**. answer에 정답 번호(1~5) 기재
7. 주관식: answer에 최종 계산 결과값 기재
8. 풀이에 LaTeX 수식을 사용하되, 한국어로 설명
9. **표/도표 재현 (매우 중요)**:
   - 원본에 표(조립제법, 함수값 표 등)가 있으면 변형 문제에도 **반드시 표를 포함**
   - 표는 \\begin{array} 환경을 사용 ($$로 감싸지 말 것!)
   - 표의 모든 셀에 **구체적인 숫자**를 채울 것 (빈 셀이나 대수식(ak, bk 등) 금지)
   - 조립제법 예시: \\begin{array}{c|cccc} k & a_3 & a_2 & a_1 & a_0 \\\\ & & \\cdots & \\cdots & \\\\ \\hline & \\cdots & \\cdots & \\cdots & \\text{나머지} \\end{array}
   - 행렬: \\begin{pmatrix} 또는 \\begin{bmatrix} 사용

## 응답 형식 (JSON만 출력, 다른 텍스트 없이)
\`\`\`json
{
  "contentLatex": "변형된 문제 (LaTeX)",
  "solutionLatex": "단계별 완전한 풀이 (LaTeX)",
  "answer": "정답 (객관식: 번호 1~5, 주관식: 계산 결과값)",
  "choices": ["① 보기1", "② 보기2", "③ 보기3", "④ 보기4", "⑤ 보기5"],
  "modifications": [
    {"type": "NUMBER", "original": "원본값", "modified": "변경값"}
  ]
}
\`\`\`
객관식이 아닌 경우 "choices"는 빈 배열 []로 응답하세요.`;

export async function generateTwinWithLLM(
  originalProblem: {
    id: string;
    contentLatex: string;
    solutionLatex?: string;
    typeCode: string;
    answer?: string;
    choices?: string[];
  },
  studentId: string,
  options: TwinGenerationOptions = {}
): Promise<TwinProblem> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log('[Twin Generator] OpenAI API not configured, using rule-based generation');
    return generateTwinProblem(
      { ...originalProblem, answer: originalProblem.answer || '' },
      studentId,
      options
    );
  }

  const difficultyText =
    opts.difficultyAdjustment === -1
      ? '난이도 하향 (쉽게)'
      : opts.difficultyAdjustment === 1
        ? '난이도 상향 (어렵게)'
        : '동일 난이도';

  // ★ 이미지 분리 — base64 이미지가 GPT 프롬프트에 포함되지 않도록
  const { textOnly: contentTextOnly, images: originalImages } = extractImages(originalProblem.contentLatex);
  if (originalImages.length > 0) {
    console.log(`[Twin Generator] Extracted ${originalImages.length} images from original problem, will reinsert after generation`);
  }

  // ★ 선택지가 있으면 프롬프트에 포함 (동그라미 번호 → 괄호 번호 통일)
  const choicesSection = originalProblem.choices && originalProblem.choices.length > 0
    ? `\n원본 선택지:\n${originalProblem.choices.map(c => convertCircledNumbers(c)).join('\n')}\n`
    : '\n(주관식 문제 - 선택지 없음)\n';

  // ★ 원본 풀이 — 있으면 포함, 없거나 불완전하면 GPT에게 직접 풀도록 지시
  const solutionText = originalProblem.solutionLatex && originalProblem.solutionLatex.trim().length > 10
    ? originalProblem.solutionLatex
    : '(원본 풀이가 제공되지 않았습니다. 변형된 문제를 직접 분석하여 처음부터 완전한 풀이를 작성하세요.)';

  // ★ 원본 정답 — 있으면 포함, 없으면 GPT에게 도출하도록 지시
  const answerText = originalProblem.answer && originalProblem.answer.trim() && originalProblem.answer !== '-'
    ? originalProblem.answer
    : '(원본 정답이 제공되지 않았습니다. 풀이를 통해 정확한 정답을 도출하세요.)';

  // ★ 시각적 요소 감지 힌트 — 원본에 표/그래프가 있으면 GPT에게 재현 지시
  // ★ 동그라미 번호 → 괄호 번호 통일 (GPT 입력에도 적용)
  const contentText = convertCircledNumbers(contentTextOnly);
  const visualHints: string[] = [];
  if (/조립제법|조립 제법/.test(contentText)) {
    visualHints.push(
      '이 문제에는 조립제법 표가 포함되어 있습니다.\n' +
      '변형된 문제의 contentLatex에 반드시 조립제법 표를 포함하세요.\n' +
      '형식: \\begin{array}{c|cccc} k & a & b & c & d \\\\\\\\ & & 계산값1 & 계산값2 & 계산값3 \\\\\\\\ \\hline & a & 결과1 & 결과2 & 나머지 \\end{array}\n' +
      '중요: $$로 감싸지 마세요. 모든 셀에 구체적인 숫자를 넣으세요. \\Box나 빈 셀은 금지입니다.'
    );
  }
  if (/\\begin\{(array|tabular|matrix|pmatrix|bmatrix)/.test(contentText)) {
    visualHints.push('이 문제에는 표/행렬이 포함되어 있습니다. 변형된 문제에서도 동일한 LaTeX 환경(\\begin{array} 등)을 사용하여 재현하세요. $$로 감싸지 마세요.');
  }
  if (/그래프|좌표|수직선|수선|그림/.test(contentText)) {
    visualHints.push('이 문제에는 그래프/도형이 참조됩니다. 변형된 문제에서도 해당 시각적 요소를 텍스트로 설명하거나 LaTeX로 표현하세요.');
  }
  if (/함수값|표[는가를이]|다음 표/.test(contentText)) {
    visualHints.push('이 문제에는 값의 표가 포함되어 있습니다. \\begin{array} 환경으로 표를 재현하세요. $$로 감싸지 마세요. 모든 셀에 구체적인 숫자를 넣으세요.');
  }
  const visualSection = visualHints.length > 0
    ? `\n\n## ⚠ 시각적 요소 재현 필수\n${visualHints.join('\n')}\n`
    : '';

  // ★ 이미지가 있었으면 GPT에게 "원본에 그림이 포함되어 있다"고 알림
  const imageNote = originalImages.length > 0
    ? '\n\n(참고: 원본 문제에는 도형/그래프 이미지가 포함되어 있습니다. 이미지는 자동으로 삽입되므로 contentLatex에 이미지를 포함하지 마세요.)\n'
    : '';

  const prompt = TWIN_GENERATION_PROMPT
    .replace('{ORIGINAL_PROBLEM}', contentText + imageNote)
    .replace('{CHOICES_SECTION}', choicesSection)
    .replace('{ORIGINAL_SOLUTION}', solutionText)
    .replace('{ORIGINAL_ANSWER}', answerText)
    .replace('{DIFFICULTY_ADJUSTMENT}', difficultyText + visualSection);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: '당신은 수학 교사이자 문제 출제 전문가입니다. 수학적 정확성이 최우선입니다. LaTeX 수식을 정확하게 작성하고, 모든 계산 과정을 빠짐없이 서술합니다. 풀이의 최종 결과와 정답이 반드시 일치해야 합니다.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // JSON 파싱
    let jsonStr = content;
    if (content.includes('```json')) {
      jsonStr = content.split('```json')[1].split('```')[0].trim();
    } else if (content.includes('```')) {
      jsonStr = content.split('```')[1].split('```')[0].trim();
    }

    const parsed = JSON.parse(jsonStr);

    // ★ GPT 출력 후처리 — MixedContentRenderer 호환성 확보
    const cleanedContent = cleanLLMOutput(parsed.contentLatex || '');
    const cleanedSolution = cleanLLMOutput(parsed.solutionLatex || '');

    // ★ 원본 이미지 재삽입 — 도형/그래프가 유사문제에서도 표시되도록
    const finalContent = reinsertImages(cleanedContent, originalImages);

    return {
      id: crypto.randomUUID(),
      originalProblemId: originalProblem.id,
      originalTypeCode: originalProblem.typeCode,
      contentLatex: finalContent,
      contentHtml: latexToSimpleHtml(finalContent),
      solutionLatex: cleanedSolution,
      solutionHtml: cleanedSolution ? latexToSimpleHtml(cleanedSolution) : '',
      answer: String(parsed.answer || '').trim(),
      choices: Array.isArray(parsed.choices) ? parsed.choices : [],
      modifications: parsed.modifications || [],
      generatedAt: new Date().toISOString(),
      generatedFor: studentId,
    };
  } catch (error) {
    console.error('[Twin Generator] LLM generation failed, using rule-based:', error);
    return generateTwinProblem(
      { ...originalProblem, answer: originalProblem.answer || '' },
      studentId,
      options
    );
  }
}

// ============================================================================
// GPT 출력 후처리 — MixedContentRenderer 호환
// ============================================================================

/**
 * GPT-4o의 LaTeX 출력을 MixedContentRenderer가 올바르게 렌더링할 수 있도록 정리
 * - $$...$$ 블록 수식 내부의 \begin{array}를 분리 (array는 별도 파싱됨)
 * - \Box, \square 등 빈 플레이스홀더 제거
 * - 불필요한 공백/줄바꿈 정리
 */
function cleanLLMOutput(text: string): string {
  let result = text;

  // 1. $$\begin{array}...\end{array}$$ → \begin{array}...\end{array} ($$제거)
  //    MixedContentRenderer가 \begin{array}를 직접 감지하여 테이블로 렌더링하므로
  //    $$로 감싸면 충돌이 발생함
  result = result.replace(
    /\$\$\s*(\\begin\{(?:array|tabular|pmatrix|bmatrix|matrix)\}[\s\S]*?\\end\{(?:array|tabular|pmatrix|bmatrix|matrix)\})\s*\$\$/g,
    '$1'
  );

  // 2. 단독 $$ 라인 제거 (고아 $$)
  result = result.replace(/^\$\$\s*$/gm, '');

  // 3. \Box, \square → 빈 문자열 (빈 셀이 □로 표시되는 것 방지)
  //    단, 표 셀 내부에서만 — 실제 수학에서 \Box 사용은 드묾
  result = result.replace(/\\(?:Box|square)/g, '');

  // 4. ①②③④⑤ → (1)(2)(3)(4)(5) 소문제 번호 통일
  result = convertCircledNumbers(result);

  // 5. 연속 줄바꿈 정리
  result = result.replace(/\n{3,}/g, '\n\n');

  // 6. 앞뒤 공백 제거
  result = result.trim();

  return result;
}

/**
 * 동그라미 번호(①②③④⑤) → 괄호 번호((1)(2)(3)(4)(5)) 변환
 * 소문제 표기 통일용
 */
function convertCircledNumbers(text: string): string {
  const circledMap: Record<string, string> = {
    '①': '(1)', '②': '(2)', '③': '(3)', '④': '(4)', '⑤': '(5)',
    '⑥': '(6)', '⑦': '(7)', '⑧': '(8)', '⑨': '(9)', '⑩': '(10)',
  };
  let result = text;
  for (const [circled, paren] of Object.entries(circledMap)) {
    result = result.replaceAll(circled, paren);
  }
  return result;
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

function latexToSimpleHtml(latex: string): string {
  // 간단한 LaTeX → HTML 변환 (실제로는 KaTeX 사용 권장)
  return latex
    .replace(/\\\\/g, '<br>')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '<span class="frac">$1/$2</span>')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\^(\d)/g, '<sup>$1</sup>')
    .replace(/\_(\d)/g, '<sub>$1</sub>')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠');
}

function calculateNewAnswer(
  originalAnswer: string | undefined,
  modifications: ProblemModification[]
): string {
  if (!originalAnswer) return '';

  // 간단한 경우: 숫자 치환
  let newAnswer = originalAnswer;
  for (const mod of modifications) {
    if (mod.type === 'NUMBER') {
      newAnswer = newAnswer.replace(mod.original, mod.modified);
    }
  }

  return newAnswer;
}

// ============================================================================
// Export
// ============================================================================

export {
  analyzeLatexStructure,
  extractNumbers,
  varyNumber,
  varyConditions,
  type LatexStructure,
  type NumberMatch,
};
