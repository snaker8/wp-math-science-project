// ============================================================================
// 빠른답(Quick Answer) + 해설(Solution) 파서
// OCR 텍스트에서 문제 번호별 정답과 해설을 추출
// ============================================================================

export interface ParsedAnswer {
  problemNumber: number;
  answer: string;
  answerType: 'choice' | 'numeric' | 'text';
}

export interface ParsedSolution {
  problemNumber: number;
  solutionLatex: string;
}

export interface ParseResult {
  answers: ParsedAnswer[];
  solutions: ParsedSolution[];
  rawText: string;
  detectedType: 'quick_answer' | 'solution' | 'mixed' | 'unknown';
}

// 원형 숫자 → 번호 매핑
const CIRCLED_TO_NUM: Record<string, string> = {
  '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
};

// 원형 숫자 패턴
const CIRCLED_PATTERN = /[①②③④⑤]/;

/**
 * 빠른답 텍스트 파싱
 * 형식 예시:
 * - "1.③  2.④  3.38  4.18  5.①"
 * - "1  ③    2  ④    3  38"
 * - "1)③ 2)④ 3)38"
 * - 테이블 형태 (행별 번호-답)
 */
export function parseQuickAnswers(ocrText: string): ParsedAnswer[] {
  const answers: ParsedAnswer[] = [];
  const text = ocrText.trim();
  if (!text) return answers;

  // 방법 1: "N.답" 또는 "N)답" 패턴 (가장 일반적)
  // 1.③ 2.④ 3.38 4.18 또는 1)③ 2)④ 등
  const inlinePattern = /(\d{1,2})\s*[.)]\s*([①②③④⑤]|\d+(?:\.\d+)?)/g;
  let match;

  while ((match = inlinePattern.exec(text)) !== null) {
    const num = parseInt(match[1]);
    const rawAnswer = match[2].trim();

    if (num < 1 || num > 50) continue;

    // 원형 숫자면 choice, 아니면 numeric
    if (CIRCLED_PATTERN.test(rawAnswer)) {
      answers.push({
        problemNumber: num,
        answer: CIRCLED_TO_NUM[rawAnswer] || rawAnswer,
        answerType: 'choice',
      });
    } else {
      answers.push({
        problemNumber: num,
        answer: rawAnswer,
        answerType: 'numeric',
      });
    }
  }

  if (answers.length >= 3) return deduplicateAnswers(answers);

  // 방법 2: 줄별 파싱 — "번호  답" 형태
  const lines = text.split('\n').filter(l => l.trim());
  for (const line of lines) {
    // "1  ③" 또는 "1    4" 형태
    const lineMatch = line.match(/^\s*(\d{1,2})\s{2,}([①②③④⑤]|\d+(?:\.\d+)?)\s*$/);
    if (lineMatch) {
      const num = parseInt(lineMatch[1]);
      const rawAnswer = lineMatch[2].trim();
      if (num < 1 || num > 50) continue;

      answers.push({
        problemNumber: num,
        answer: CIRCLED_PATTERN.test(rawAnswer) ? (CIRCLED_TO_NUM[rawAnswer] || rawAnswer) : rawAnswer,
        answerType: CIRCLED_PATTERN.test(rawAnswer) ? 'choice' : 'numeric',
      });
    }
  }

  return deduplicateAnswers(answers);
}

/**
 * 해설 텍스트 파싱
 * 형식 예시:
 * - "1. [풀이] f(x) = x^2 + 3x에서 ..."
 * - "1. 주어진 조건을 정리하면 ..."
 * - "[개념] ... [풀이] 1. ... 2. ..."
 */
export function parseSolutions(ocrText: string): ParsedSolution[] {
  const solutions: ParsedSolution[] = [];
  const text = ocrText.trim();
  if (!text) return solutions;

  // 문제 번호로 분할: "N." 또는 "N)" 패턴
  // 주의: 풀이 내부 "1. 좌변을 정리하면..." 같은 서브 번호와 구분 필요
  // → 줄 시작에 있는 1~50 범위의 번호만 문제 구분자로 인식
  const problemSplitPattern = /(?:^|\n)\s*(\d{1,2})\s*[.)]\s/g;

  const positions: { number: number; start: number }[] = [];
  let splitMatch;

  while ((splitMatch = problemSplitPattern.exec(text)) !== null) {
    const num = parseInt(splitMatch[1]);
    if (num < 1 || num > 50) continue;

    // 이전 번호보다 큰 번호만 (순서대로 나와야 함)
    const lastNum = positions.length > 0 ? positions[positions.length - 1].number : 0;
    if (num > lastNum || positions.length === 0) {
      positions.push({ number: num, start: splitMatch.index });
    }
  }

  // 각 구간의 텍스트 추출
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].start;
    const end = i + 1 < positions.length ? positions[i + 1].start : text.length;
    let solutionText = text.substring(start, end).trim();

    // 첫 줄의 번호 제거: "3. [풀이] ..." → "[풀이] ..."
    solutionText = solutionText.replace(/^\d{1,2}\s*[.)]\s*/, '');

    if (solutionText.length > 5) {
      solutions.push({
        problemNumber: positions[i].number,
        solutionLatex: solutionText,
      });
    }
  }

  return solutions;
}

/**
 * OCR 텍스트에서 콘텐츠 유형 자동 감지
 */
export function detectContentType(ocrText: string): 'quick_answer' | 'solution' | 'mixed' | 'unknown' {
  const text = ocrText.trim();
  if (!text) return 'unknown';

  // 빠른답 특징: 짧은 텍스트, 원형 숫자 많음, "N.답" 패턴 밀집
  const circledCount = (text.match(/[①②③④⑤]/g) || []).length;
  const inlineAnswerCount = (text.match(/\d{1,2}\s*[.)]\s*[①②③④⑤\d]/g) || []).length;
  const totalLength = text.length;

  // 해설 특징: 긴 텍스트, "풀이", "개념", "따라서" 등 키워드
  const solutionKeywords = /\[풀이\]|\[개념\]|따라서|그러므로|이므로|구하면|정리하면|대입하면|계산하면/g;
  const solutionKeywordCount = (text.match(solutionKeywords) || []).length;

  // 헤더 감지
  const hasQuickAnswerHeader = /빠른\s*정?답|정\s*답\s*표|ANSWER/i.test(text.slice(0, 200));
  const hasSolutionHeader = /해\s*설|풀\s*이|SOLUTION/i.test(text.slice(0, 200));

  if (hasQuickAnswerHeader && hasSolutionHeader) return 'mixed';
  if (hasQuickAnswerHeader) return 'quick_answer';
  if (hasSolutionHeader) return 'solution';

  // 내용 기반 판단
  if (inlineAnswerCount >= 5 && totalLength < 500) return 'quick_answer';
  if (solutionKeywordCount >= 3 && totalLength > 500) return 'solution';
  if (circledCount >= 5 && totalLength / circledCount < 30) return 'quick_answer';

  // 혼합 판단
  if (inlineAnswerCount >= 3 && solutionKeywordCount >= 2) return 'mixed';

  return 'unknown';
}

/**
 * 전체 파싱 (자동 감지 + 파싱)
 */
export function parseAnswerDocument(ocrText: string): ParseResult {
  const detectedType = detectContentType(ocrText);

  let answers: ParsedAnswer[] = [];
  let solutions: ParsedSolution[] = [];

  if (detectedType === 'quick_answer' || detectedType === 'mixed') {
    answers = parseQuickAnswers(ocrText);
  }
  if (detectedType === 'solution' || detectedType === 'mixed') {
    solutions = parseSolutions(ocrText);
  }

  // unknown이면 둘 다 시도
  if (detectedType === 'unknown') {
    answers = parseQuickAnswers(ocrText);
    solutions = parseSolutions(ocrText);
  }

  return {
    answers,
    solutions,
    rawText: ocrText,
    detectedType: answers.length > 0 && solutions.length > 0 ? 'mixed'
      : answers.length > 0 ? 'quick_answer'
      : solutions.length > 0 ? 'solution'
      : 'unknown',
  };
}

/** 중복 제거 (같은 번호면 마지막 것 사용) */
function deduplicateAnswers(answers: ParsedAnswer[]): ParsedAnswer[] {
  const map = new Map<number, ParsedAnswer>();
  for (const a of answers) {
    map.set(a.problemNumber, a);
  }
  return [...map.values()].sort((a, b) => a.problemNumber - b.problemNumber);
}
