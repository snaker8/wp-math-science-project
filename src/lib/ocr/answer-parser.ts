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

  // ★ 방법 1: 줄 단위 파싱 — "N. 답" 또는 "N) 답" 형태
  // 답에 수식, 좌표, 공백, LaTeX 모두 허용
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^(\d{1,2})\s*[.)]\s*(.+)$/);
    if (!m) continue;
    const num = parseInt(m[1]);
    const rawAnswer = m[2].trim();
    if (num < 1 || num > 50 || !rawAnswer) continue;
    // markdown 구분자 스킵 (| -- | -- |)
    if (/^[-=|\s]+$/.test(rawAnswer)) continue;

    const soleCircled = /^[①②③④⑤]\s*$/.test(rawAnswer);
    if (soleCircled) {
      answers.push({
        problemNumber: num,
        answer: CIRCLED_TO_NUM[rawAnswer.trim()] || rawAnswer,
        answerType: 'choice',
      });
    } else {
      answers.push({
        problemNumber: num,
        answer: extractAnswer(rawAnswer),
        answerType: detectAnswerType(rawAnswer),
      });
    }
  }

  if (answers.length >= 3) return deduplicateAnswers(answers);

  // 방법 2: "N. ..." 위치로 분할해서 각 답 추출 (한 줄에 여러 답이 있거나 복잡한 서술형)
  // 번호 패턴으로 텍스트를 분할 → 각 구간 = 한 문제의 답
  const numPattern = /(?:^|\s|\n)(\d{1,2})\s*[.)]\s+/g;
  const numPositions: Array<{ num: number; answerStart: number; matchStart: number }> = [];
  let nm;
  while ((nm = numPattern.exec(text)) !== null) {
    const n = parseInt(nm[1]);
    if (n < 1 || n > 50) continue;
    // 이전 번호보다 큰 번호만 (순서대로)
    const last = numPositions.length > 0 ? numPositions[numPositions.length - 1].num : 0;
    if (n <= last) continue;
    numPositions.push({ num: n, answerStart: nm.index + nm[0].length, matchStart: nm.index });
  }
  for (let i = 0; i < numPositions.length; i++) {
    const cur = numPositions[i];
    const next = numPositions[i + 1];
    let answerText = text.substring(cur.answerStart, next ? next.matchStart : text.length).trim();
    // 마크다운 표 잔해 제거
    answerText = answerText.replace(/^\|+|\|+$/g, '').trim();
    if (!answerText) continue;
    if (/^[-=|\s]+$/.test(answerText)) continue;
    if (answers.some(a => a.problemNumber === cur.num)) continue;

    const soleCircled = /^[①②③④⑤]\s*$/.test(answerText);
    if (soleCircled) {
      answers.push({
        problemNumber: cur.num,
        answer: CIRCLED_TO_NUM[answerText.trim()] || answerText,
        answerType: 'choice',
      });
    } else {
      answers.push({
        problemNumber: cur.num,
        answer: extractAnswer(answerText),
        answerType: detectAnswerType(answerText),
      });
    }
  }

  if (answers.length >= 3) return deduplicateAnswers(answers);

  // 방법 3: 줄별 파싱 — 다양한 형태 (공백/테이블/탭 구분)
  const altLines = text.split('\n').filter(l => l.trim());
  for (const line of altLines) {
    const trimmed = line.trim();

    // 3a. "번호  답" 형태 (공백 2개 이상 구분)
    const spaceMatch = trimmed.match(/^(\d{1,2})\s{2,}(.+)$/);
    if (spaceMatch) {
      const num = parseInt(spaceMatch[1]);
      const rawAnswer = spaceMatch[2].trim();
      if (num >= 1 && num <= 50 && rawAnswer) {
        answers.push({ problemNumber: num, answer: extractAnswer(rawAnswer), answerType: detectAnswerType(rawAnswer) });
        continue;
      }
    }

    // 2b. 마크다운 테이블 "| 번호 | 답 |" 또는 "|번호|답|"
    const tableMatch = trimmed.match(/^\|?\s*(\d{1,2})\s*\|\s*(.+?)\s*\|?\s*$/);
    if (tableMatch) {
      const num = parseInt(tableMatch[1]);
      const rawAnswer = tableMatch[2].trim();
      if (num >= 1 && num <= 50 && rawAnswer && !/^[-=]+$/.test(rawAnswer) && !/경남|학교|번호/.test(rawAnswer)) {
        answers.push({ problemNumber: num, answer: extractAnswer(rawAnswer), answerType: detectAnswerType(rawAnswer) });
        continue;
      }
    }

    // 2c. 탭 구분 "번호\t답"
    const tabMatch = trimmed.match(/^(\d{1,2})\t+(.+)$/);
    if (tabMatch) {
      const num = parseInt(tabMatch[1]);
      const rawAnswer = tabMatch[2].trim();
      if (num >= 1 && num <= 50 && rawAnswer) {
        answers.push({ problemNumber: num, answer: extractAnswer(rawAnswer), answerType: detectAnswerType(rawAnswer) });
        continue;
      }
    }

    // 2d. 단순 "번호 답" (공백 1개, 숫자 답)
    const simpleMatch = trimmed.match(/^(\d{1,2})\s+([①②③④⑤]|\d+(?:[.,]\d+)?)\s*$/);
    if (simpleMatch) {
      const num = parseInt(simpleMatch[1]);
      const rawAnswer = simpleMatch[2].trim();
      if (num >= 1 && num <= 50) {
        answers.push({ problemNumber: num, answer: extractAnswer(rawAnswer), answerType: detectAnswerType(rawAnswer) });
      }
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
  // ★ 서술형 답 포함: "N. 뭐든지" 형태 (내용 제한 없음)
  const anyAnswerLineCount = (text.match(/(?:^|\n)\s*\d{1,2}\s*[.)]\s*\S/g) || []).length;
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
  // ★ 서술형 답 포함 시나리오: "N. ..." 줄이 5개 이상이면 quick_answer로 처리
  if (anyAnswerLineCount >= 5 && solutionKeywordCount < 3) return 'quick_answer';

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

  // ★ 해설지만 있고 빠른답이 없는 경우(또는 일부 누락) — 각 해설 상단에서 정답 추출해 보충
  //   학원 해설지는 "정답 ②", "답: 3", "**①**" 형태로 상단/말미에 정답을 명시하는 경우가 많음
  if (solutions.length > 0) {
    const existingNums = new Set(answers.map(a => a.problemNumber));
    for (const sol of solutions) {
      if (existingNums.has(sol.problemNumber)) continue;
      const extracted = extractFinalAnswerFromSolution(sol.solutionLatex);
      if (extracted) {
        answers.push({ ...extracted, problemNumber: sol.problemNumber });
      }
    }
    answers.sort((a, b) => a.problemNumber - b.problemNumber);
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

/**
 * 해설 텍스트에서 최종 정답만 추출 (빠른답 자동 도출용)
 * 흔한 해설지 패턴을 순차 매칭
 *
 * ★ 자산화 fallback 으로도 사용 — edited.answer 비고 edited.solution 있으면 호출
 *   (workflow/upload/route.ts). 진단평가 BS_H1S1_R1 류 자동 회로의 핵심.
 */
export function extractFinalAnswerFromSolution(solutionText: string): Omit<ParsedAnswer, 'problemNumber'> | null {
  if (!solutionText) return null;
  const s = solutionText.trim();
  if (s.length < 2) return null;

  const top = s.slice(0, 300);

  // 1. "정답: ②" / "정답 ③" / "정답 : 3번"
  const labelCircled = s.match(/정\s*답[:：]?\s*([①②③④⑤])/);
  if (labelCircled) return { answer: CIRCLED_TO_NUM[labelCircled[1]] || labelCircled[1], answerType: 'choice' };
  const labelNum = s.match(/정\s*답[:：]?\s*([1-5])\s*번?(?![0-9])/);
  if (labelNum) return { answer: labelNum[1], answerType: 'choice' };

  // 2. "답: ②" / "답 ③번"
  const ansCircled = s.match(/(?:^|\n|\s)답[:：]?\s*([①②③④⑤])/);
  if (ansCircled) return { answer: CIRCLED_TO_NUM[ansCircled[1]] || ansCircled[1], answerType: 'choice' };
  const ansNum = s.match(/(?:^|\n|\s)답[:：]?\s*([1-5])\s*번(?![0-9])/);
  if (ansNum) return { answer: ansNum[1], answerType: 'choice' };

  // 3. 해설 상단(첫 300자) — **①** / \textbf{①} / 단독 원형 숫자
  const topCircled = top.match(/(?:\*\*|\\textbf\{)?\s*([①②③④⑤])\s*(?:\*\*|\})?/);
  if (topCircled) return { answer: CIRCLED_TO_NUM[topCircled[1]] || topCircled[1], answerType: 'choice' };

  // 4. "따라서/그러므로/∴ 답은 ②" / "... = 3" 말미 패턴
  const endCircled = s.match(/(?:따라서|그러므로|∴)[^.\n]*?(?:답은|정답은)[^.\n]*?([①②③④⑤])/);
  if (endCircled) return { answer: CIRCLED_TO_NUM[endCircled[1]] || endCircled[1], answerType: 'choice' };

  // 5. 주관식 — 해설 끝부분 "= 숫자" 패턴 (마지막 등호 이후 값)
  const numericTail = s.match(/=\s*(-?\d+(?:\s*\/\s*\d+)?(?:\.\d+)?)\s*(?:이다|입니다|\.|\s*$)/);
  if (numericTail) return { answer: numericTail[1].replace(/\s+/g, ''), answerType: 'numeric' };

  // 6. "답은 숫자" (마지막에 정수 단독)
  const finalNum = s.match(/(?:답은|정답은|최종\s*답은?)\s*(-?\d+(?:\.\d+)?)/);
  if (finalNum) return { answer: finalNum[1], answerType: 'numeric' };

  return null;
}

/** 답 텍스트에서 핵심 답만 추출 */
function extractAnswer(raw: string): string {
  let s = raw.trim();
  // 단독 원형 숫자 → 번호만 반환 (객관식)
  if (/^[①②③④⑤]\s*$/.test(s)) {
    return CIRCLED_TO_NUM[s.trim()] || s;
  }
  // ★ LaTeX 수식이 있으면 그대로 보존 (서술형 답 수식 처리)
  const hasLatex = /\\[a-zA-Z]+|[\^_{}]|\\frac|\\sqrt|\\dfrac/.test(s);
  if (hasLatex) {
    // $ 래퍼 제거하되 내부 LaTeX는 보존
    s = s.replace(/^\$+|\$+$/g, '').trim();
    return s;
  }
  // 단순 답: $ 제거 + 앞뒤 공백만 정리
  s = s.replace(/^\$+|\$+$/g, '').trim();
  // 후행 구두점/특수문자 제거 (마침표, 쉼표 등은 답 경계일 수 있으므로 앞뒤만)
  s = s.replace(/^[,;\s]+|[,;\s]+$/g, '');
  return s;
}

/** 답 유형 감지 */
function detectAnswerType(raw: string): 'choice' | 'numeric' | 'text' {
  const s = raw.trim();
  // 단독 원형 숫자만 choice
  if (/^[①②③④⑤]\s*$/.test(s)) return 'choice';
  // 순수 숫자 (정수/소수/분수)
  if (/^-?\d+([.,]\d+)?$/.test(s)) return 'numeric';
  // LaTeX 수식 또는 복합 답 → text (서술형)
  return 'text';
}

/** 중복 제거 (같은 번호면 마지막 것 사용) */
function deduplicateAnswers(answers: ParsedAnswer[]): ParsedAnswer[] {
  const map = new Map<number, ParsedAnswer>();
  for (const a of answers) {
    map.set(a.problemNumber, a);
  }
  return [...map.values()].sort((a, b) => a.problemNumber - b.problemNumber);
}
