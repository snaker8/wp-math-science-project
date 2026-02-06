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

    // 문제 번호로 분할하는 정규식
    // "1." 또는 "1)" 또는 "[1]" 등의 패턴 앞에서 분할
    const splitPattern = /(?=(?:^|\n)\s*\d{1,2}\s*[.)번\]]\s*)/;
    const parts = text.split(splitPattern).filter(p => p.trim());

    for (const part of parts) {
      const numberMatch = part.match(/^\s*(\d{1,2})\s*[.)번\]]/);
      if (numberMatch) {
        const questionNumber = parseInt(numberMatch[1], 10);
        const content = part.substring(numberMatch[0].length).trim();

        blocks.push({
          number: questionNumber,
          content,
        });
      }
    }

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

    // 보기와 문제 본문 분리
    const { questionText, choices } = this.extractChoices(content);

    // LaTeX 검증 및 정규화
    const validation = validateLatex(questionText);

    // 이미지 URL 추출
    const imageUrls = this.extractImageUrls(content);

    return {
      question_number: number,
      content_latex: validation.normalized_latex,
      choices,
      has_image: imageUrls.length > 0,
      image_urls: imageUrls,
      raw_text: content,
      confidence: this.calculateConfidence(validation, choices),
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
