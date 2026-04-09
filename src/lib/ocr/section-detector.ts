// ============================================================================
// 섹션 자동 감지: PDF OCR 결과에서 문제/빠른답/해설 영역 자동 분리
// ============================================================================

export interface DetectedSection {
  type: 'problem' | 'quick_answer' | 'solution';
  startPage: number; // 0-indexed
  endPage: number;   // 0-indexed (inclusive)
  headerText?: string;
}

export interface SectionDetectionResult {
  sections: DetectedSection[];
  confidence: number; // 0~1
  hasQuickAnswer: boolean;
  hasSolution: boolean;
}

// 섹션 헤더 패턴
const QUICK_ANSWER_HEADERS = /빠른\s*정?답|정\s*답\s*표|정\s*답$/m;
const SOLUTION_HEADERS = /해\s*설|풀\s*이\s*$|풀이\s*과정|해설지/m;

/**
 * 페이지별 OCR 텍스트에서 섹션 경계를 감지
 * @param pageTexts 페이지별 OCR 텍스트 배열
 * @returns 감지된 섹션 정보
 */
export function detectSections(pageTexts: string[]): SectionDetectionResult {
  if (pageTexts.length === 0) {
    return { sections: [], confidence: 0, hasQuickAnswer: false, hasSolution: false };
  }

  const sections: DetectedSection[] = [];
  let quickAnswerStart = -1;
  let solutionStart = -1;

  // 각 페이지의 첫 300자에서 헤더 검색
  for (let i = 0; i < pageTexts.length; i++) {
    const pagePreview = pageTexts[i].slice(0, 300);

    if (QUICK_ANSWER_HEADERS.test(pagePreview) && quickAnswerStart === -1) {
      quickAnswerStart = i;
    }
    if (SOLUTION_HEADERS.test(pagePreview) && solutionStart === -1) {
      solutionStart = i;
    }
  }

  // 빠른답 페이지의 밀도 검증: 짧은 답(①②③④⑤, 숫자)이 밀집된 페이지
  if (quickAnswerStart >= 0) {
    const qaText = pageTexts[quickAnswerStart];
    const answerDensity = (qaText.match(/\d{1,2}\s*[.)]\s*[①②③④⑤\d]/g) || []).length;
    if (answerDensity < 3) {
      // 밀도가 낮으면 오탐 가능성 — 무시
      quickAnswerStart = -1;
    }
  }

  // 섹션 구성
  const lastPage = pageTexts.length - 1;

  if (quickAnswerStart === -1 && solutionStart === -1) {
    // 섹션 구분 불가 → 전체를 문제로
    sections.push({ type: 'problem', startPage: 0, endPage: lastPage });
    return { sections, confidence: 0, hasQuickAnswer: false, hasSolution: false };
  }

  // 문제 영역: 0 ~ (첫 번째 비-문제 섹션 시작 전)
  const firstNonProblem = Math.min(
    quickAnswerStart >= 0 ? quickAnswerStart : Infinity,
    solutionStart >= 0 ? solutionStart : Infinity,
  );

  if (firstNonProblem > 0) {
    sections.push({ type: 'problem', startPage: 0, endPage: firstNonProblem - 1 });
  }

  // 빠른답 영역
  if (quickAnswerStart >= 0) {
    const qaEnd = solutionStart > quickAnswerStart ? solutionStart - 1
      : (quickAnswerStart === firstNonProblem ? quickAnswerStart : lastPage);
    sections.push({
      type: 'quick_answer',
      startPage: quickAnswerStart,
      endPage: Math.min(qaEnd, quickAnswerStart), // 빠른답은 보통 1페이지
      headerText: pageTexts[quickAnswerStart].slice(0, 50).trim(),
    });
  }

  // 해설 영역
  if (solutionStart >= 0) {
    sections.push({
      type: 'solution',
      startPage: solutionStart,
      endPage: lastPage,
      headerText: pageTexts[solutionStart].slice(0, 50).trim(),
    });
  }

  const confidence = (quickAnswerStart >= 0 ? 0.5 : 0) + (solutionStart >= 0 ? 0.5 : 0);

  return {
    sections,
    confidence,
    hasQuickAnswer: quickAnswerStart >= 0,
    hasSolution: solutionStart >= 0,
  };
}

/**
 * 페이지 텍스트 배열을 섹션별로 분리
 */
export function splitBySection(
  pageTexts: string[],
  result: SectionDetectionResult
): { problemText: string; quickAnswerText: string; solutionText: string } {
  let problemText = '';
  let quickAnswerText = '';
  let solutionText = '';

  for (const section of result.sections) {
    const text = pageTexts.slice(section.startPage, section.endPage + 1).join('\n\n');
    switch (section.type) {
      case 'problem': problemText += text; break;
      case 'quick_answer': quickAnswerText += text; break;
      case 'solution': solutionText += text; break;
    }
  }

  return { problemText, quickAnswerText, solutionText };
}
