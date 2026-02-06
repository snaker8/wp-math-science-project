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
  },
  studentId: string,
  options: TwinGenerationOptions = {}
): TwinProblem {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const structure = analyzeLatexStructure(originalProblem.contentLatex);
  const modifications: ProblemModification[] = [];

  let newContentLatex = originalProblem.contentLatex;

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

  // 해설 생성 (간단한 치환)
  let newSolutionLatex = originalProblem.solutionLatex || '';
  if (newSolutionLatex) {
    for (const mod of modifications) {
      if (mod.type === 'NUMBER' || mod.type === 'COEFFICIENT') {
        newSolutionLatex = newSolutionLatex.split(mod.original).join(mod.modified);
      }
    }
  }

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
  }>,
  studentId: string,
  options: TwinGenerationOptions = {}
): TwinProblem[] {
  return problems.map((problem) => generateTwinProblem(problem, studentId, options));
}

// ============================================================================
// GPT-4o 기반 쌍둥이 문제 생성 (고급)
// ============================================================================

const TWIN_GENERATION_PROMPT = `당신은 수학 문제 변형 전문가입니다. 주어진 원본 문제를 분석하여 구조는 유지하면서 숫자와 조건만 변형한 쌍둥이 문제를 생성해주세요.

원본 문제:
{ORIGINAL_PROBLEM}

요구사항:
1. 문제의 수학적 구조와 풀이 방법은 동일하게 유지
2. 숫자, 계수, 상수 등을 변형
3. 난이도 조절: {DIFFICULTY_ADJUSTMENT}
4. 새로운 정답 계산

다음 JSON 형식으로 응답해주세요:
{
  "contentLatex": "변형된 문제 (LaTeX)",
  "solutionLatex": "변형된 풀이 (LaTeX)",
  "answer": "새로운 정답",
  "modifications": [
    {"type": "NUMBER", "original": "원본값", "modified": "변경값"}
  ]
}`;

export async function generateTwinWithLLM(
  originalProblem: {
    id: string;
    contentLatex: string;
    solutionLatex?: string;
    typeCode: string;
  },
  studentId: string,
  options: TwinGenerationOptions = {}
): Promise<TwinProblem> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log('[Twin Generator] OpenAI API not configured, using rule-based generation');
    return generateTwinProblem(
      { ...originalProblem, answer: '' },
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

  const prompt = TWIN_GENERATION_PROMPT
    .replace('{ORIGINAL_PROBLEM}', originalProblem.contentLatex)
    .replace('{DIFFICULTY_ADJUSTMENT}', difficultyText);

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
            content: '수학 문제 변형 전문가입니다. LaTeX 수식을 정확하게 작성합니다.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 1500,
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

    return {
      id: crypto.randomUUID(),
      originalProblemId: originalProblem.id,
      originalTypeCode: originalProblem.typeCode,
      contentLatex: parsed.contentLatex,
      contentHtml: latexToSimpleHtml(parsed.contentLatex),
      solutionLatex: parsed.solutionLatex || '',
      solutionHtml: parsed.solutionLatex ? latexToSimpleHtml(parsed.solutionLatex) : '',
      answer: parsed.answer || '',
      modifications: parsed.modifications || [],
      generatedAt: new Date().toISOString(),
      generatedFor: studentId,
    };
  } catch (error) {
    console.error('[Twin Generator] LLM generation failed, using rule-based:', error);
    return generateTwinProblem(
      { ...originalProblem, answer: '' },
      studentId,
      options
    );
  }
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
