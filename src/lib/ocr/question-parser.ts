// ============================================================================
// Question & Choice Parser
// 문항 번호 기준으로 문제와 보기를 분리하는 파서
// ============================================================================

import type { MathpixResponse, ParsedQuestion, ParsedChoice } from '@/types/ocr';
import { validateLatex } from './latex-validator';

/**
 * 문항 번호 패턴 (한국 수능/모의고사 형식)
 */
const QUESTION_NUMBER_PATTERNS = [
  // 기본 번호 패턴: "1.", "1)", "1번", "[1]", "(1)"
  /^[\s]*(\d{1,2})[\s]*[.)\]]\s*/m,
  /^[\s]*(\d{1,2})[\s]*번\s*/m,
  /^[\s]*\[(\d{1,2})\][\s]*/m,
  /^[\s]*\((\d{1,2})\)[\s]*/m,

  // 한글 번호: "가.", "나.", etc.
  /^[\s]*([가-힣])[\s]*[.)]\s*/m,
];

/**
 * 보기(선택지) 패턴
 */
const CHOICE_PATTERNS = {
  // 숫자 보기: ①, ②, ③, ④, ⑤ 또는 1), 2), 3), 4), 5)
  CIRCLED_NUMBER: /[①②③④⑤]/g,
  NUMBERED: /(?:^|\n)\s*([1-5])\s*[)]\s*/g,

  // 한글 보기: ㄱ, ㄴ, ㄷ, ㄹ (참/거짓 문제용)
  KOREAN_CONSONANT: /[ㄱㄴㄷㄹㅁ]/g,

  // 영문 보기: a), b), c), d), e)
  ALPHABETIC: /(?:^|\n)\s*([a-e])\s*[)]\s*/gi,
};

/**
 * 보기 구분 패턴 (한 줄에 여러 보기가 있는 경우)
 */
const MULTI_CHOICE_LINE_PATTERN = /([①②③④⑤])\s*([^①②③④⑤]+)/g;

/**
 * 원형 숫자를 일반 숫자로 변환
 */
const CIRCLED_TO_NUMBER: Record<string, string> = {
  '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
};

/**
 * QuestionParser 클래스
 */
export class QuestionParser {
  private rawText: string = '';
  private questions: ParsedQuestion[] = [];

  /**
   * Mathpix 응답에서 문제 파싱
   */
  parse(mathpixResponse: MathpixResponse): ParsedQuestion[] {
    this.questions = [];
    this.rawText = mathpixResponse.text || mathpixResponse.latex_styled || '';

    if (!this.rawText.trim()) {
      return [];
    }

    // 1. 문제 단위로 분할
    const questionBlocks = this.splitIntoQuestions(this.rawText);

    // 2. 각 블록을 파싱
    for (const block of questionBlocks) {
      const parsed = this.parseQuestionBlock(block);
      if (parsed) {
        this.questions.push(parsed);
      }
    }

    return this.questions;
  }

  /**
   * 텍스트를 문제 단위로 분할
   */
  private splitIntoQuestions(text: string): { number: number; content: string }[] {
    const blocks: { number: number; content: string }[] = [];

    console.log('[QuestionParser] Input text length:', text.length);
    console.log('[QuestionParser] First 1000 chars:', text.substring(0, 1000));
    console.log('[QuestionParser] Text contains "03"?', text.includes('03'));
    console.log('[QuestionParser] Text contains "04"?', text.includes('04'));
    console.log('[QuestionParser] Text contains "05"?', text.includes('05'));
    console.log('[QuestionParser] Text contains "06"?', text.includes('06'));

    // 문제 번호로 분할하는 정규식 (한국 수학 문제지 형식)
    // 패턴 1: "<서답형 4번>", "<객관식 1번>", "< 4 >" 등 부등호 괄호 형식
    // 패턴 2: "1.", "1)", "[1]", "1번", "01.", "01)", "01 " (공백) 등을 인식
    // 패턴 3: Mathpix MMD 볼드: "**01**", "*01*" 형식
    // 패턴 4: "03\n\n[출처]" 형식 - 번호 뒤에 빈 줄이 오는 경우
    const anglePattern = /(?:^|\n)\s*<\s*(?:서답형|객관식|단답형)?\s*(\d{1,2})\s*번?\s*>/gm;
    const basicPattern = /(?:^|\n)\s*(?:\*{1,2})?(?:\[)?(\d{1,2})(?:\*{1,2})?\s*(?:[.)번\]]|\s+(?=[가-힣])|(?=\s*\n))/gm;

    // 먼저 모든 매치 찾기
    const matches: { index: number; number: number; matchText: string }[] = [];
    let match: RegExpExecArray | null;

    // 1) 부등호 패턴 검색
    while ((match = anglePattern.exec(text)) !== null) {
      const questionNumber = parseInt(match[1], 10);
      if (questionNumber > 0) {
        matches.push({ index: match.index, number: questionNumber, matchText: match[0] });
      }
    }

    // 2) 기본 패턴 검색
    while ((match = basicPattern.exec(text)) !== null) {
      const questionNumber = parseInt(match[1], 10);
      const matchIndex = match.index;
      const matchText = match[0];
      // 선택지 (1), (2) 등과 문제 번호를 구분하기 위해 괄호로 시작하는지 확인
      const isChoice = matchText.includes('(');
      if (!isChoice && questionNumber > 0) {
        // 중복 방지: 같은 index에 이미 매치가 있으면 스킵
        const isDuplicate = matches.some(m => Math.abs(m.index - matchIndex) < 10);
        if (!isDuplicate) {
          matches.push({ index: matchIndex, number: questionNumber, matchText });
        }
      }
    }

    // index 순으로 정렬
    matches.sort((a, b) => a.index - b.index);

    console.log('[QuestionParser] Found', matches.length, 'question number matches:', matches.map(m => `${m.number}: "${m.matchText.trim()}" at index ${m.index}`));

    // 디버깅: 03, 04, 05, 06이 포함된 모든 위치 찾기
    ['03', '04', '05', '06'].forEach(num => {
      let idx = -1;
      let count = 0;
      while ((idx = text.indexOf(num, idx + 1)) >= 0) {
        count++;
        const context = text.substring(Math.max(0, idx - 20), idx + 50);
        console.log(`[QuestionParser] Found "${num}" occurrence ${count} at index ${idx}, context:`, context);
      }
    });


    if (matches.length === 0) {
      // 번호를 찾지 못하면 전체 텍스트를 하나의 문제로 처리
      console.log('[QuestionParser] No question numbers found, treating as single problem');
      return [{ number: 1, content: text.trim() }];
    }

    // 각 매치 사이의 텍스트를 문제로 분할
    for (let i = 0; i < matches.length; i++) {
      const startIdx = matches[i].index;
      const endIdx = i < matches.length - 1 ? matches[i + 1].index : text.length;
      const part = text.substring(startIdx, endIdx).trim();

      // 문제 번호 패턴과 뒤의 내용 추출
      // 패턴 1: "<서답형 4번>" 형식
      // 패턴 2: "01 다음 중" / "1. 다음 중" 형식
      let numberMatch = part.match(/^\s*<\s*(?:서답형|객관식|단답형)?\s*\d{1,2}\s*번?\s*>\s*/);
      if (!numberMatch) {
        numberMatch = part.match(/^\s*(?:\*{1,2})?(?:\[)?(\d{1,2})(?:\*{1,2})?\s*(?:[.)번\]]|\s+)/);
      }

      if (numberMatch) {
        const content = part.substring(numberMatch[0].length).trim();
        if (content.length > 0) {  // 내용이 있는 경우만 추가
          blocks.push({
            number: matches[i].number,
            content,
          });
        }
      }
    }


    console.log('[QuestionParser] Extracted', blocks.length, 'question blocks');

    // 번호 순으로 정렬
    blocks.sort((a, b) => a.number - b.number);

    return blocks;
  }


  /**
   * 개별 문제 블록 파싱
   */
  private parseQuestionBlock(block: { number: number; content: string }): ParsedQuestion | null {
    const { number, content } = block;

    if (!content.trim()) {
      return null;
    }

    // 출처 정보 추출
    const { sourceInfo, cleanedText } = extractSourceInfo(content);

    // 보기와 문제 본문 분리
    const { questionText, choices } = this.extractChoices(cleanedText);

    // LaTeX 검증 및 정규화
    const validation = validateLatex(questionText);

    // 이미지 URL 추출
    const imageUrls = this.extractImageUrls(cleanedText);

    return {
      question_number: number,
      content_latex: validation.normalized_latex,
      choices,
      has_image: imageUrls.length > 0,
      image_urls: imageUrls,
      raw_text: cleanedText,
      confidence: this.calculateConfidence(validation, choices),
      source_info: sourceInfo,
    };
  }

  /**
   * 보기(선택지) 추출
   */
  private extractChoices(text: string): { questionText: string; choices: ParsedChoice[] } {
    const choices: ParsedChoice[] = [];
    let questionText = text;

    // 1. 원형 숫자 보기 (①②③④⑤) 추출
    const circledMatches = text.match(CHOICE_PATTERNS.CIRCLED_NUMBER);
    if (circledMatches && circledMatches.length >= 2) {
      const result = this.parseCircledChoices(text);
      return result;
    }

    // 2. 숫자 보기 (1), 2), 3)...) 추출
    const numberedMatches = [...text.matchAll(/(?:^|\n)\s*([1-5])\s*\)\s*(.+?)(?=(?:\n\s*[1-5]\s*\))|$)/gs)];
    if (numberedMatches.length >= 2) {
      for (const match of numberedMatches) {
        const label = match[1];
        const choiceContent = match[2].trim();
        const validation = validateLatex(choiceContent);

        choices.push({
          label,
          content_latex: validation.normalized_latex,
        });
      }

      // 첫 번째 보기 이전 텍스트를 문제 본문으로
      const firstChoiceIndex = text.search(/(?:^|\n)\s*1\s*\)/);
      if (firstChoiceIndex > 0) {
        questionText = text.substring(0, firstChoiceIndex).trim();
      }

      return { questionText, choices };
    }

    // 3. 한글 자음 보기 (ㄱ, ㄴ, ㄷ) - 참/거짓 문제
    const koreanMatches = text.match(/[ㄱㄴㄷㄹㅁ]\s*[.:]\s*.+/g);
    if (koreanMatches && koreanMatches.length >= 2) {
      for (const match of koreanMatches) {
        const consonantMatch = match.match(/^([ㄱㄴㄷㄹㅁ])\s*[.:]\s*(.+)$/);
        if (consonantMatch) {
          const validation = validateLatex(consonantMatch[2].trim());
          choices.push({
            label: consonantMatch[1],
            content_latex: validation.normalized_latex,
          });
        }
      }

      // 보기 이전 텍스트를 문제 본문으로
      const firstKoreanIndex = text.search(/[ㄱㄴㄷㄹㅁ]\s*[.:]/);
      if (firstKoreanIndex > 0) {
        questionText = text.substring(0, firstKoreanIndex).trim();
      }

      return { questionText, choices };
    }

    // 보기가 없는 경우 (주관식)
    return { questionText, choices: [] };
  }

  /**
   * 원형 숫자 보기 파싱 (①②③④⑤)
   */
  private parseCircledChoices(text: string): { questionText: string; choices: ParsedChoice[] } {
    const choices: ParsedChoice[] = [];

    // 원형 숫자 위치 찾기
    const circledNumbers = ['①', '②', '③', '④', '⑤'];
    const positions: { index: number; label: string }[] = [];

    for (const cn of circledNumbers) {
      let idx = text.indexOf(cn);
      while (idx !== -1) {
        positions.push({ index: idx, label: CIRCLED_TO_NUMBER[cn] });
        idx = text.indexOf(cn, idx + 1);
      }
    }

    // 위치순 정렬
    positions.sort((a, b) => a.index - b.index);

    // 중복 제거 (같은 라벨)
    const uniquePositions: { index: number; label: string }[] = [];
    const seenLabels = new Set<string>();
    for (const pos of positions) {
      if (!seenLabels.has(pos.label)) {
        uniquePositions.push(pos);
        seenLabels.add(pos.label);
      }
    }

    // 각 보기 내용 추출
    for (let i = 0; i < uniquePositions.length; i++) {
      const current = uniquePositions[i];
      const next = uniquePositions[i + 1];

      const startIdx = current.index + 1; // 원형 숫자 다음부터
      const endIdx = next ? next.index : text.length;

      let choiceContent = text.substring(startIdx, endIdx).trim();

      // 다음 문제 번호가 나오면 거기서 자름
      const nextQuestionMatch = choiceContent.match(/\n\s*\d{1,2}\s*[.)번\]]/);
      if (nextQuestionMatch) {
        choiceContent = choiceContent.substring(0, nextQuestionMatch.index).trim();
      }

      const validation = validateLatex(choiceContent);
      choices.push({
        label: current.label,
        content_latex: validation.normalized_latex,
      });
    }

    // 첫 번째 원형 숫자 이전을 문제 본문으로
    const questionText = uniquePositions.length > 0
      ? text.substring(0, uniquePositions[0].index).trim()
      : text;

    return { questionText, choices };
  }

  /**
   * 이미지 URL 추출
   */
  private extractImageUrls(text: string): string[] {
    const urls: string[] = [];

    // Markdown 이미지 문법
    const markdownImages = text.matchAll(/!\[.*?\]\((.*?)\)/g);
    for (const match of markdownImages) {
      urls.push(match[1]);
    }

    // HTML img 태그
    const htmlImages = text.matchAll(/<img[^>]+src="([^"]+)"/g);
    for (const match of htmlImages) {
      urls.push(match[1]);
    }

    // LaTeX includegraphics
    const latexImages = text.matchAll(/\\includegraphics(?:\[.*?\])?\{(.*?)\}/g);
    for (const match of latexImages) {
      urls.push(match[1]);
    }

    return urls;
  }

  /**
   * 신뢰도 계산
   */
  private calculateConfidence(
    validation: { is_valid: boolean; issues: Array<{ type: string }> },
    choices: ParsedChoice[]
  ): number {
    let confidence = 1.0;

    // LaTeX 검증 이슈에 따른 감점
    const errors = validation.issues.filter(i => i.type === 'error').length;
    const warnings = validation.issues.filter(i => i.type === 'warning').length;

    confidence -= errors * 0.2;
    confidence -= warnings * 0.05;

    // 보기 개수가 비정상적인 경우
    if (choices.length > 0 && choices.length < 2) {
      confidence -= 0.3;
    }
    if (choices.length > 5) {
      confidence -= 0.2;
    }

    return Math.max(0, Math.min(1, confidence));
  }
}

/**
 * 출처 정보 추출
 * 예: "[2018년 9월 고1 14년 변형]", "[2024 수능]", "[고1 19년 6월 ~ 고1 15년 3월]"
 */
export function extractSourceInfo(text: string): {
  sourceInfo?: {
    name?: string;
    year?: number;
    month?: number;
    grade?: string;
  };
  cleanedText: string;
} {
  // 패턴 1: [YYYY년 M월 고N] 형식
  const yearMonthGradePattern = /\[?\s*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(고\s*[1-3])\s*(?:\d{1,2}\s*년)?\s*(?:변형)?\s*\]?/;
  const match1 = text.match(yearMonthGradePattern);

  if (match1) {
    return {
      sourceInfo: {
        name: match1[0].replace(/^\[|\]$/g, '').trim(),
        year: parseInt(match1[1], 10),
        month: parseInt(match1[2], 10),
        grade: match1[3].replace(/\s/g, ''),
      },
      cleanedText: text.replace(match1[0], '').trim(),
    };
  }

  // 패턴 2: [YYYY 수능] 형식
  const suneungPattern = /\[?\s*(\d{4})\s*수능\s*\]?/;
  const match2 = text.match(suneungPattern);

  if (match2) {
    return {
      sourceInfo: {
        name: match2[0].replace(/^\[|\]$/g, '').trim(),
        year: parseInt(match2[1], 10),
      },
      cleanedText: text.replace(match2[0], '').trim(),
    };
  }

  // 패턴 3: [고N YY년 M월] 범위 형식
  const gradeYearMonthPattern = /\[?\s*(고\s*[1-3])\s*(\d{2,4})\s*년\s*(\d{1,2})\s*월(?:\s*~\s*고\s*[1-3]\s*\d{2,4}\s*년\s*\d{1,2}\s*월)?\s*\]?/;
  const match3 = text.match(gradeYearMonthPattern);

  if (match3) {
    const year = match3[2].length === 2 ? 2000 + parseInt(match3[2], 10) : parseInt(match3[2], 10);
    return {
      sourceInfo: {
        name: match3[0].replace(/^\[|\]$/g, '').trim(),
        year,
        month: parseInt(match3[3], 10),
        grade: match3[1].replace(/\s/g, ''),
      },
      cleanedText: text.replace(match3[0], '').trim(),
    };
  }

  return { cleanedText: text };
}

/**
 * <보기>에서 조건 찾기 (한국 수능 특유의 패턴)
 * 예: "<보기>를 참고하여..." 또는 "다음 <보기>에서..."
 */
export function extractBogi(text: string): { hasBogi: boolean; bogiContent: string; mainQuestion: string } {
  const bogiPattern = /<보기>([\s\S]*?)(?=<\/보기>|(?=①)|(?=\d\s*[).])|$)/i;
  const match = text.match(bogiPattern);

  if (match) {
    const bogiContent = match[1].trim();
    const mainQuestion = text.replace(bogiPattern, '').trim();

    return {
      hasBogi: true,
      bogiContent,
      mainQuestion,
    };
  }

  // 대괄호 형식: [보기]
  const bracketBogiPattern = /\[보기\]([\s\S]*?)(?=\[\/보기\]|(?=①)|(?=\d\s*[).])|$)/i;
  const bracketMatch = text.match(bracketBogiPattern);

  if (bracketMatch) {
    return {
      hasBogi: true,
      bogiContent: bracketMatch[1].trim(),
      mainQuestion: text.replace(bracketBogiPattern, '').trim(),
    };
  }

  return {
    hasBogi: false,
    bogiContent: '',
    mainQuestion: text,
  };
}

/**
 * 문제 유형 감지
 */
export function detectQuestionType(question: ParsedQuestion): string {
  const { choices, content_latex } = question;

  // 객관식 (5지선다)
  if (choices.length === 5 && choices.every(c => /^[1-5]$/.test(c.label))) {
    return 'multiple_choice';
  }

  // ㄱ,ㄴ,ㄷ 문제 (옳은 것만 고르기)
  if (choices.some(c => /^[ㄱㄴㄷㄹㅁ]$/.test(c.label))) {
    // 보기에 "옳은 것", "참인 것" 등이 있으면 true/false 조합 문제
    if (content_latex.match(/옳은\s*것|참인\s*것|바르게\s*설명/)) {
      return 'true_false_combination';
    }
    return 'select_correct';
  }

  // 주관식 (보기 없음)
  if (choices.length === 0) {
    // 빈칸 채우기
    if (content_latex.match(/\(\s*\)|_{2,}|□|▢/)) {
      return 'fill_in_blank';
    }
    // 서술형
    if (content_latex.match(/풀이\s*과정|서술|설명/)) {
      return 'essay';
    }
    return 'short_answer';
  }

  return 'unknown';
}

// 싱글톤 인스턴스
let parser: QuestionParser | null = null;

export function getQuestionParser(): QuestionParser {
  if (!parser) {
    parser = new QuestionParser();
  }
  return parser;
}

/**
 * 간편 파싱 함수
 */
export function parseQuestions(mathpixResponse: MathpixResponse): ParsedQuestion[] {
  return getQuestionParser().parse(mathpixResponse);
}
