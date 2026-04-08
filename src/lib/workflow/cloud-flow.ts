// ============================================================================
// Cloud Flow - 업로드 → OCR → LLM 분류/해설 자동화 파이프라인
// PDF, HWP(한글), 이미지 파일 지원
// ============================================================================

import type {
  UploadJob,
  ProcessingStatus,
  OCRResult,
  OCRPage,
  LLMAnalysisResult,
  TypeClassification,
  StepByStepSolution,
} from '@/types/workflow';
import {
  parseHWPFile,
  convertHWPToOCRResult,
  processHWPWithPython,
  type HWPParseResult,
} from './hwp-processor';
import { getMathpixClient, MathpixError } from '@/lib/ocr/mathpix';
import { parseQuestions, getQuestionParser } from '@/lib/ocr/question-parser';
import type { MathpixResponse, ParsedQuestion, MathpixLine, MathpixPageLines } from '@/types/ocr';

// ============================================================================
// Configuration
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';  // ★ gpt-4o 기본 (분류 전담)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';  // ★ Claude Sonnet (풀이 생성 전담)

// 다사람수학 교육과정 성취기준 체계 (505개 = 2022 개정 319개 + 2015 개정 186개)
export const MATH_CURRICULUM_SYSTEM = {
  name: '다사람수학 505개 성취기준 분류체계',
  curriculums: [
    { version: '2022 개정', count: 319, coverage: '초등·중등·고등 전체' },
    { version: '2015 개정', count: 186, coverage: '고등학교 (2027년까지 고3 적용)' },
  ],
  totalStandards: 505,
  difficultyLevels: 5,  // 하, 중하, 중, 중상, 상
  difficultyItems: 6,    // 6항목 채점 (3~16점)
};

// ============================================================================
// 파일 타입별 처리 (PDF, HWP, IMG)
// ============================================================================

export type FileType = 'PDF' | 'HWP' | 'IMG';

/**
 * 파일 확장자로 타입 판별
 */
export function detectFileType(fileName: string): FileType {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'hwp':
    case 'hwpx':
      return 'HWP';
    case 'pdf':
      return 'PDF';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'bmp':
      return 'IMG';
    default:
      return 'PDF';
  }
}

/**
 * 통합 문서 처리 함수 (PDF, HWP, IMG 지원)
 */
export async function processDocument(
  fileBuffer: ArrayBuffer,
  fileName: string,
  onProgress?: (progress: number) => void
): Promise<OCRResult> {
  const fileType = detectFileType(fileName);
  const jobId = crypto.randomUUID();

  if (onProgress) onProgress(5);

  switch (fileType) {
    case 'HWP':
      return processHWPDocument(fileBuffer, jobId, onProgress);
    case 'PDF':
      return processPDFDocument(fileBuffer, jobId, onProgress);
    case 'IMG':
      return processImageDocument(fileBuffer, jobId, onProgress);
    default:
      return processOCR('', onProgress);
  }
}

// ============================================================================
// HWP → PDF 변환 (LibreOffice headless)
// ============================================================================

// 변환된 PDF 버퍼를 저장하여 미리보기에 활용
const globalForConvertedPdf = globalThis as unknown as {
  __convertedPdfStore?: Map<string, ArrayBuffer>;
};
export const convertedPdfStore = globalForConvertedPdf.__convertedPdfStore ??
  (globalForConvertedPdf.__convertedPdfStore = new Map<string, ArrayBuffer>());

/**
 * HWP 파일 처리
 * ★ LibreOffice 변환은 API Route에서 사전에 처리됨
 *   변환 성공 시: convertedPdfBuffer가 전달되어 PDF 파이프라인 사용
 *   변환 실패 시: 기존 클라이언트 사이드 파싱 (폴백)
 */
async function processHWPDocument(
  fileBuffer: ArrayBuffer,
  jobId: string,
  onProgress?: (progress: number) => void
): Promise<OCRResult> {
  if (onProgress) onProgress(5);

  // ★ 변환된 PDF가 이미 있으면 (API Route에서 LibreOffice로 변환 완료) PDF 파이프라인으로
  const convertedPdf = convertedPdfStore.get(jobId);
  if (convertedPdf) {
    console.log(`[Cloud Flow] HWP→PDF 변환 완료된 버퍼 사용 (${convertedPdf.byteLength} bytes)`);
    if (onProgress) onProgress(20);
    return processPDFDocument(convertedPdf, jobId, onProgress);
  }

  // ★ HWP 바이너리 직접 파싱은 신뢰할 수 없음 (OLE 메타데이터가 텍스트로 추출됨)
  // LibreOffice 변환 실패 시 빈 결과 반환 + 에러 메시지
  console.error('[Cloud Flow] HWP→PDF 변환 실패: LibreOffice 변환 결과 없음. HWP 파일은 LibreOffice가 정상 작동해야 처리 가능합니다.');
  if (onProgress) onProgress(50);

  // 빈 OCR 결과 반환 (쓰레기 데이터로 문제를 만들지 않음)
  return {
    jobId,
    pages: [],
    totalPages: 0,
    mathExpressions: [],
    rawText: '',
    confidence: 0,
  };
}

/**
 * PDF 파일 처리 (OCR 포함)
 * lines.json이 있으면 실제 bbox 사용, 없으면 기존 방식 fallback
 */
async function processPDFDocument(
  fileBuffer: ArrayBuffer,
  jobId: string,
  onProgress?: (progress: number) => void
): Promise<OCRResult> {
  if (onProgress) onProgress(10);

  try {
    const mathpix = getMathpixClient();
    const buffer = Buffer.from(fileBuffer);

    if (onProgress) onProgress(20);

    // Mathpix PDF API 호출
    const responses = await mathpix.processPDF(buffer);

    if (onProgress) onProgress(40);

    const response = responses[0];
    const linesData = response?.lines_data;

    let pages: OCRPage[];

    if (linesData && linesData.pages && linesData.pages.length > 0) {
      // ✅ lines.json 데이터 있음 → 실제 bbox 사용
      console.log(`[Cloud Flow] Using lines.json data: ${linesData.pages.length} pages`);

      pages = linesData.pages.map((pageData: MathpixPageLines) => {
        const pageW = pageData.page_width || 1;
        const pageH = pageData.page_height || 1;

        // 수식 라인에서 실제 bbox 추출 (비율 기반 0~1)
        const mathExpressions = pageData.lines
          .filter((l: MathpixLine) => l.type === 'math' || (l.text_display && /\$[^$]+\$/.test(l.text_display)))
          .map((l: MathpixLine) => ({
            latex: l.text_display || l.text,
            boundingBox: {
              x: l.region.top_left_x / pageW,
              y: l.region.top_left_y / pageH,
              width: l.region.width / pageW,
              height: l.region.height / pageH,
            },
            confidence: l.confidence,
          }));

        // 페이지 전체 텍스트: text_display 사용 (수식 $...$ 인라인 포함)
        const pageText = pageData.lines
          .map((l: MathpixLine) => l.text_display || l.text)
          .join('\n');

        const minConfidence = pageData.lines.length > 0
          ? Math.min(...pageData.lines.map((l: MathpixLine) => l.confidence))
          : 0.9;

        return {
          pageNumber: pageData.page,
          text: pageText,
          mathExpressions,
          images: [],
          confidence: Math.max(minConfidence, 0.5),
          // 원본 라인 데이터 보존 (문제별 bbox 그룹화에 사용)
          lineData: pageData.lines,
          pageWidth: pageW,
          pageHeight: pageH,
        };
      });
    } else {
      // ⚠️ lines.json 없음 → 기존 방식 fallback (mmd 텍스트만)
      console.log('[Cloud Flow] No lines.json data, using fallback text parsing');

      pages = responses.map((resp, idx) => {
        const parsedQuestions = parseQuestions(resp);
        const mathExpressions = parsedQuestions.flatMap(q =>
          q.content_latex ? [{
            latex: q.content_latex,
            boundingBox: { x: 0, y: 0, width: 0, height: 0 },
            confidence: q.confidence,
          }] : []
        );

        return {
          pageNumber: idx + 1,
          text: resp.text || resp.latex_styled || '',
          mathExpressions,
          images: [],
          confidence: resp.confidence || 0.9,
        };
      });
    }

    if (onProgress) onProgress(50);

    return {
      jobId,
      pages,
      rawText: pages.map(p => p.text).join('\n\n'),
      confidence: responses[0]?.confidence || 0.9,
      processedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Cloud Flow] PDF OCR error:', error);
    if (error instanceof MathpixError) {
      console.error('[Cloud Flow] Mathpix API Error:', error.code, error.details);
    }
    throw error;
  }
}

/**
 * lines.json 라인들을 문제 번호 기준으로 그룹화하여 문제별 bbox 계산
 * @returns 문제별 { questionNumber, bbox (비율 0~1), contentMmd, choices }
 */
function groupLinesIntoQuestions(
  allPages: OCRPage[]
): Array<{
  questionNumber: number;
  pageIndex: number;
  bbox: { x: number; y: number; w: number; h: number };
  contentMmd: string;
  choices: string[];
  hasFigure: boolean;
  figureBbox: { x: number; y: number; w: number; h: number } | null;
}> {
  const results: Array<{
    questionNumber: number;
    pageIndex: number;
    bbox: { x: number; y: number; w: number; h: number };
    contentMmd: string;
    choices: string[];
    hasFigure: boolean;
    figureBbox: { x: number; y: number; w: number; h: number } | null;
  }> = [];

  // 문제 번호 패턴 (한국 수능/모의고사 형식)
  // "01 다음", "1.", "1)", "1번", "[1]", "01.", "02 " 등 다양한 형식 지원
  // Mathpix MMD 형식: "**01**", "\\textbf{01}" 등 볼드 마커도 처리
  // "03" 단독 라인 (번호만 있고 뒤에 아무것도 없는 경우)도 매칭
  const questionStartPattern = /^[\s]*(?:\*{1,2})?(\d{1,2})(?:\*{1,2})?[\s]*(?:[.)번\]]|[\s]+(?=[가-힣])|$)/;
  // 선택지 패턴: ①②③④⑤ 원문자 또는 (1)(2)(3) 괄호 패턴
  const choicePattern = /[①②③④⑤]|\([1-5]\)\s*\S/;

  for (let pageIdx = 0; pageIdx < allPages.length; pageIdx++) {
    const page = allPages[pageIdx];
    const lines = page.lineData;
    const pageW = page.pageWidth || 1;
    const pageH = page.pageHeight || 1;

    if (!lines || lines.length === 0) {
      console.log(`[Cloud Flow] Page ${pageIdx}: no line data`);
      continue;
    }

    console.log(`[Cloud Flow] Page ${pageIdx}: ${lines.length} lines, first 5 lines:`);
    lines.slice(0, 5).forEach((l, i) => {
      const txt = (l.text_display || l.text || '').trim();
      console.log(`  [${i}] "${txt.substring(0, 80)}" (match: ${questionStartPattern.test(txt)})`);
    });

    // 라인을 문제 단위로 그룹화
    let currentQuestion: {
      number: number;
      lines: MathpixLine[];
      choiceTexts: string[];
    } | null = null;

    let matchedNumbers: number[] = [];

    for (const line of lines) {
      const lineText = (line.text_display || line.text || '').trim();
      const numberMatch = lineText.match(questionStartPattern);

      if (numberMatch) {
        const qNum = parseInt(numberMatch[1], 10);

        // ★ 선택지 오인식 방지: 1~5번이고 ㄱ,ㄴ,ㄷ,ㄹ 조합이면 보기 선택지
        // 예: "1) ㄱ, ㄴ", "(2) ㄱ, ㄷ", "3) ㄱ, ㄴ, ㄷ"
        const afterNumber = lineText.substring(numberMatch[0].length).trim();
        const isChoiceLine = qNum >= 1 && qNum <= 5 && /^[ㄱㄴㄷㄹㅁ,\s]+$/.test(afterNumber);
        // 괄호로 시작: "(1)", "(2)" 등은 선택지 — 단, 서술형 소문제는 제외
        const startsWithParen = /^\s*\([1-5]\)/.test(lineText);
        // ★ 서술형 소문제 키워드: 긴 문장 + 지시 동사면 선택지가 아님
        const subProblemKeywords = /구하시오|구하여라|구해라|서술하시오|설명하시오|증명하시오|나타내시오|보이시오|판단하시오|풀이\s*과정|쓰시오|쓰고|답하시오|완성하시오|그리시오|작도하시오|구하세요|구해\s*보시오|이유를?\s*서술|넓이를?\s*구|길이를?\s*구|값을?\s*구|과정을?\s*쓰|\[\s*\d+\s*점\s*\]|\d+점/;
        const parenContent = startsWithParen ? lineText.replace(/^\s*\([1-5]\)\s*/, '').trim() : '';
        const isParenSubProblem = startsWithParen && (parenContent.length > 30 || subProblemKeywords.test(parenContent));

        if (isChoiceLine || (startsWithParen && !isParenSubProblem)) {
          // 선택지 → 현재 문제에 포함
          if (currentQuestion) {
            currentQuestion.lines.push(line);
            currentQuestion.choiceTexts.push(lineText);
          }
          continue;
        }

        matchedNumbers.push(qNum);

        // 이전 문제 저장
        if (currentQuestion && currentQuestion.lines.length > 0) {
          results.push(buildQuestionResult(currentQuestion, pageIdx, pageW, pageH));
        }
        // 새 문제 시작
        currentQuestion = {
          number: qNum,
          lines: [line],
          choiceTexts: [],
        };
      } else if (currentQuestion) {
        currentQuestion.lines.push(line);
        // 선택지 감지: ①②③ 또는 (1)(2)(3) 패턴
        // ★ 서술형 소문제 키워드가 있으면 선택지로 분류하지 않음
        const _subKw = /구하시오|구하여라|구해라|서술하시오|설명하시오|증명하시오|나타내시오|보이시오|판단하시오|풀이\s*과정|쓰시오|쓰고|답하시오|완성하시오|그리시오|작도하시오|구하세요|구해\s*보시오|넓이를?\s*구|길이를?\s*구|값을?\s*구|과정을?\s*쓰|\[\s*\d+\s*점\s*\]|\d+점/;
        const _hasCircled = /[①②③④⑤]/.test(lineText);
        const _hasParenChoice = /\([1-5]\)\s*\S/.test(lineText);
        const _isSubProblemLine = _hasParenChoice && !_hasCircled && (_subKw.test(lineText) || lineText.length > 60);

        if (_hasCircled && !_isSubProblemLine) {
          currentQuestion.choiceTexts.push(lineText);
        } else if (_hasParenChoice && !_isSubProblemLine && (lineText.match(/\([1-5]\)/g) || []).length >= 2) {
          // (1)(2)...(5) 패턴이 한 줄에 2개 이상 있으면 선택지 라인
          currentQuestion.choiceTexts.push(lineText);
        }
      }
    }

    // 마지막 문제 저장
    if (currentQuestion && currentQuestion.lines.length > 0) {
      results.push(buildQuestionResult(currentQuestion, pageIdx, pageW, pageH));
    }

    console.log(`[Cloud Flow] Page ${pageIdx}: matched question numbers: [${matchedNumbers.join(', ')}]`);
  }

  console.log(`[Cloud Flow] groupLinesIntoQuestions: found ${results.length} questions across ${allPages.length} pages`);
  return results;
}

/**
 * 문제 그룹에서 bbox와 콘텐츠 생성
 */
function buildQuestionResult(
  group: { number: number; lines: MathpixLine[]; choiceTexts: string[] },
  pageIndex: number,
  pageW: number,
  pageH: number
): {
  questionNumber: number;
  pageIndex: number;
  bbox: { x: number; y: number; w: number; h: number };
  contentMmd: string;
  choices: string[];
  hasFigure: boolean;
  figureBbox: { x: number; y: number; w: number; h: number } | null;
} {
  // 모든 라인의 region을 합쳐 문제 전체 bbox 계산
  let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;

  for (const line of group.lines) {
    const r = line.region;
    if (r) {
      minX = Math.min(minX, r.top_left_x);
      minY = Math.min(minY, r.top_left_y);
      maxX = Math.max(maxX, r.top_left_x + r.width);
      maxY = Math.max(maxY, r.top_left_y + r.height);
    }
  }

  // padding 추가: 라인 region이 텍스트에 딱 맞아 수식/선택지가 잘리는 문제 방지
  const padX = pageW * 0.015;  // 좌우 1.5%
  const padY = pageH * 0.01;   // 상하 1%
  const paddedMinX = Math.max(0, minX - padX);
  const paddedMinY = Math.max(0, minY - padY);
  const paddedMaxX = Math.min(pageW, maxX + padX);
  const paddedMaxY = Math.min(pageH, maxY + padY);

  // 비율 기반 bbox (0~1)
  const bbox = {
    x: paddedMinX / pageW,
    y: paddedMinY / pageH,
    w: (paddedMaxX - paddedMinX) / pageW,
    h: (paddedMaxY - paddedMinY) / pageH,
  };

  // ★ 도형/그래프 감지: diagram, figure_label 타입 라인 확인
  const figureLines = group.lines.filter(
    l => l.type === 'diagram' || l.type === 'figure' || l.type === 'figure_label'
  );
  const hasFigure = figureLines.length > 0;

  // 도형 영역 bbox (도형 라인만의 bbox)
  let figureBbox: { x: number; y: number; w: number; h: number } | null = null;
  if (hasFigure) {
    let fMinX = Infinity, fMinY = Infinity, fMaxX = 0, fMaxY = 0;
    for (const fl of figureLines) {
      const r = fl.region;
      if (r) {
        fMinX = Math.min(fMinX, r.top_left_x);
        fMinY = Math.min(fMinY, r.top_left_y);
        fMaxX = Math.max(fMaxX, r.top_left_x + r.width);
        fMaxY = Math.max(fMaxY, r.top_left_y + r.height);
      }
    }
    if (fMinX < Infinity) {
      figureBbox = {
        x: Math.max(0, fMinX - padX) / pageW,
        y: Math.max(0, fMinY - padY) / pageH,
        w: Math.min(pageW, fMaxX - fMinX + padX * 2) / pageW,
        h: Math.min(pageH, fMaxY - fMinY + padY * 2) / pageH,
      };
      console.log(`[Cloud Flow] Q${group.number}: 도형 감지 (${figureLines.length}개 라인), figureBbox: ${JSON.stringify(figureBbox)}`);
    }
  }

  // Mathpix Markdown 텍스트 (수식 $...$ 인라인 포함)
  // diagram 라인은 텍스트가 비어있을 수 있으므로 [도형] 마커 삽입
  const rawContentMmd = group.lines
    .map(l => {
      if ((l.type === 'diagram' || l.type === 'figure') && !(l.text_display || l.text || '').trim()) {
        return '[도형]';
      }
      return l.text_display || l.text;
    })
    .join('\n');

  // ★ 전각 괄호 → 반각 정규화 (Mathpix가 （1）형식으로 출력하는 경우)
  const halfWidthMmd = rawContentMmd.replace(/\uff08/g, '(').replace(/\uff09/g, ')');
  // ★ (1)(2)(3)(4)(5) → ①②③④⑤ 정규화 (content_latex에도 원문자 반영)
  const contentMmd = normalizeChoiceParensForCloudFlow(halfWidthMmd);

  // 선택지 파싱: "① A ② B ③ C ④ D ⑤ E" 형식 분리
  const choices = parseChoicesFromText(group.choiceTexts.join('\n'));

  return {
    questionNumber: group.number,
    pageIndex,
    bbox,
    contentMmd,
    choices,
    hasFigure,
    figureBbox,
  };
}

/**
 * 텍스트에서 선택지 분리 (①②③④⑤ / (1)(2)(3)(4)(5) 형식)
 */
function parseChoicesFromText(text: string): string[] {
  if (!text.trim()) return [];

  // ★ 전각 괄호 → 반각 정규화
  const halfWidth = text.replace(/\uff08/g, '(').replace(/\uff09/g, ')');
  // ★ (1)(2)(3)(4)(5) → ①②③④⑤ 정규화 (Mathpix 원문자 오변환 교정)
  const normalizedText = normalizeChoiceParensForCloudFlow(halfWidth);

  const circledNumbers = ['①', '②', '③', '④', '⑤'];
  const parts: string[] = [];

  // ①②③④⑤로 분할
  let remaining = normalizedText;
  for (let i = circledNumbers.length - 1; i >= 0; i--) {
    const idx = remaining.lastIndexOf(circledNumbers[i]);
    if (idx >= 0) {
      const after = remaining.substring(idx + circledNumbers[i].length).trim();
      if (after) parts.unshift(after);
      remaining = remaining.substring(0, idx);
    }
  }

  // 원형 숫자 분할이 안 된 경우 번호 기반 시도
  if (parts.length === 0) {
    const numbered = normalizedText.match(/[1-5]\s*\)\s*([^1-5)]+)/g);
    if (numbered) {
      return numbered.map(m => m.replace(/^\d\s*\)\s*/, '').trim());
    }
  }

  return parts;
}

/**
 * (1)(2)(3)(4)(5) → ①②③④⑤ 정규화 (cloud-flow용)
 * Mathpix가 잘못 변환한 괄호 숫자를 원문자로 복원
 *
 * ★ 서술형 소문제 구별:
 *   - (1)~(5) 5개 모두 존재 → 선택지 → 변환
 *   - (1)~(4) 4개 + 내용 짧음 → 선택지 → 변환
 *   - (1)~(3) 3개 이하 → 서술형 소문제 가능성 → 변환 안 함
 *   - "구하시오", "[N점]" 등 포함 → 소문제 → 변환 안 함
 */
function normalizeChoiceParensForCloudFlow(text: string): string {
  const NUMBER_TO_CIRCLED: Record<string, string> = {
    '1': '①', '2': '②', '3': '③', '4': '④', '5': '⑤',
  };

  // 이미 ①②③ 가 있으면 변환 불필요
  if (/[①②③④⑤]/.test(text)) return text;

  // (1)~(5) 위치 수집
  const parenMatches = [...text.matchAll(/\(([1-5])\)/g)];
  if (parenMatches.length < 4) return text; // 4개 미만이면 소문제일 수 있음

  // 번호 검증: (1)(2)(3)(4) 최소 포함
  const nums = parenMatches.map(m => parseInt(m[1]));
  if (!nums.includes(1) || !nums.includes(2) || !nums.includes(3) || !nums.includes(4)) return text;

  // ★ 서술형 소문제 키워드 감지 (강화됨)
  const subQuestionKeywords = /구하시오|구하여라|구해라|서술하시오|증명하시오|의\s*값을?\s*구|풀이\s*과정|설명하시오|나타내시오|보이시오|판단하시오|구하는\s*풀이|완성하시오|답하시오|쓰시오|이유를?\s*서술|넓이를?\s*구|길이를?\s*구|값을?\s*구|과정을?\s*쓰|이용하여|풀이 과정|\[\s*\d+\s*점\s*\]|\d+점/;

  // 각 (N) 사이 내용 검증
  for (let i = 0; i < parenMatches.length - 1; i++) {
    const start = parenMatches[i].index! + parenMatches[i][0].length;
    const end = parenMatches[i + 1].index!;
    const content = text.substring(start, end).trim();
    if (content.length > 100 || subQuestionKeywords.test(content)) {
      return text; // 소문제 패턴 감지 → 변환 안 함
    }
  }

  // (5)가 없으면 추가 검증: 각 내용이 50자 이하여야 함
  if (!nums.includes(5)) {
    for (let i = 0; i < parenMatches.length - 1; i++) {
      const start = parenMatches[i].index! + parenMatches[i][0].length;
      const end = parenMatches[i + 1].index!;
      const content = text.substring(start, end).trim();
      if (content.length > 50) return text;
    }
  }

  // 안전하게 변환
  return text.replace(/\(([1-5])\)/g, (full, num) => {
    return NUMBER_TO_CIRCLED[num] || full;
  });
}

/**
 * 선택지 배열 검증 — 문제 텍스트가 선택지에 섞인 경우 필터링
 * - 최대 5개
 * - 너무 긴 선택지 (50자 초과)는 문제 텍스트일 가능성 높음
 * - 문제 패턴 ("의 값은", "[점]", "구하시오" 등) 포함 시 제외
 */
function validateChoices(choices: string[]): string[] {
  if (!choices || choices.length === 0) return [];

  const invalidPatterns = /의\s*값은|구하시오|구하여라|구해라|서술하시오|증명하시오|만족시킬\s*때|완성하시오|답하시오|쓰시오|넓이를?\s*구|길이를?\s*구|값을?\s*구|과정을?\s*쓰|이용하여|풀이\s*과정|\[\s*\d+\.?\d*\s*점\s*\]|\d+점|^\d{2,}\)/;

  const validated = choices.filter(c => {
    const text = c.replace(/^[①②③④⑤]\s*/, '').replace(/^[1-5]\s*\)\s*/, '').trim();
    // 빈 선택지 제외
    if (!text) return false;
    // 50자 초과면 문제 텍스트일 가능성 높음 (일반 선택지는 짧음)
    if (text.length > 80) {
      console.warn(`[Cloud Flow] validateChoices: 선택지 너무 김 (${text.length}자) — 제외: "${text.substring(0, 40)}..."`);
      return false;
    }
    // 문제 패턴 포함 시 제외
    if (invalidPatterns.test(text)) {
      console.warn(`[Cloud Flow] validateChoices: 문제 텍스트 패턴 감지 — 제외: "${text.substring(0, 40)}..."`);
      return false;
    }
    return true;
  });

  // 최대 5개
  return validated.slice(0, 5);
}

function createMockPDFResult(jobId: string): OCRResult {
  return {
    jobId,
    pages: [
      {
        pageNumber: 1,
        text: '[PDF 추출] 다음 이차방정식의 두 근을 구하시오.\n$x^2 - 7x + 12 = 0$',
        mathExpressions: [
          {
            latex: 'x^2 - 7x + 12 = 0',
            boundingBox: { x: 50, y: 100, width: 250, height: 40 },
            confidence: 0.93,
          },
        ],
        images: [],
        confidence: 0.91,
      },
    ],
    rawText: '다음 이차방정식의 두 근을 구하시오. x² - 7x + 12 = 0',
    confidence: 0.91,
    processedAt: new Date().toISOString(),
  };
}

/**
 * 이미지 파일 처리 (OCR)
 */
async function processImageDocument(
  fileBuffer: ArrayBuffer,
  jobId: string,
  onProgress?: (progress: number) => void
): Promise<OCRResult> {
  if (onProgress) onProgress(10);

  try {
    const mathpix = getMathpixClient();
    const buffer = Buffer.from(fileBuffer);

    if (onProgress) onProgress(25);

    // Mathpix Image API 호출
    const response = await mathpix.processImage(buffer);

    if (onProgress) onProgress(40);

    // 응답을 OCRResult 형식으로 변환
    const parsedQuestions = parseQuestions(response);
    const mathExpressions = parsedQuestions.flatMap(q =>
      q.content_latex ? [{
        latex: q.content_latex,
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
        confidence: q.confidence,
      }] : []
    );

    if (onProgress) onProgress(50);

    return {
      jobId,
      pages: [{
        pageNumber: 1,
        text: response.text || response.latex_styled || '',
        mathExpressions,
        images: [],
        confidence: response.confidence || 0.9,
      }],
      rawText: response.text || '',
      confidence: response.confidence || 0.9,
      processedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Cloud Flow] Image OCR error:', error);
    // API 설정 오류는 상세히 로깅
    if (error instanceof MathpixError) {
      console.error('[Cloud Flow] Mathpix API Error:', error.code, error.details);
    }
    throw error;
  }
}

function createMockImageResult(jobId: string): OCRResult {
  return {
    jobId,
    pages: [
      {
        pageNumber: 1,
        text: '[이미지 OCR] 다음 극한값을 구하시오.\n$\\lim_{x \\to 0} \\frac{\\sin x}{x}$',
        mathExpressions: [
          {
            latex: '\\lim_{x \\to 0} \\frac{\\sin x}{x}',
            boundingBox: { x: 80, y: 150, width: 200, height: 60 },
            confidence: 0.88,
          },
        ],
        images: [],
        confidence: 0.86,
      },
    ],
    rawText: '다음 극한값을 구하시오. lim(x→0) sin(x)/x',
    confidence: 0.86,
    processedAt: new Date().toISOString(),
  };
}

// ============================================================================
// OCR Processing (레거시 - storagePath 기반)
// ============================================================================

export async function processOCR(
  storagePath: string,
  onProgress?: (progress: number) => void
): Promise<OCRResult> {
  // Mock fallback removed for production
  throw new Error('OCR process for this file type is not implemented or supported in this environment.');
}

// ============================================================================
// LLM Analysis (GPT-4o)
// ============================================================================

const CLASSIFICATION_PROMPT = `당신은 "다사람수학"의 AI 수학 교육 전문가입니다.
한국 교육과정(2015 개정, 2022 개정) 505개 성취기준에 기반하여 문제를 분류합니다.

■ 수학 과목 체계 (학년별 매핑)
| 학년 | 과목 | 주요 내용 |
|------|------|----------|
| 고1 | 공통수학1 | 다항식, 방정식과 부등식, 경우의 수 |
| 고1 | 공통수학2 | 도형의 방정식, 집합과 명제, 함수 |
| 고2 | 수학I | 지수·로그함수, 삼각함수, 수열 |
| 고2 | 수학II | 함수의 극한과 연속, 미분, 적분 |
| 고2 | 확률과 통계 | 순열과 조합, 확률, 통계 |
| 고3 | 미적분 | 수열의 극한, 미분법, 적분법 |
| 고3 | 기하 | 이차곡선, 벡터, 공간좌표 |
| 진로 | 대수 | 행렬, 일차변환, 벡터공간 (2022 개정 신설) |
| 진로 | 실용 통계 | 자료 분석, 통계적 추론 |
| 진로 | 미적분II | 편미분, 중적분 (2022 개정 신설) |

★ 분류 시 반드시 위 과목 체계에 맞춰 subject를 정하세요.
★ "고1 모의고사" 또는 "공통수학" 문제는 공통수학1 또는 공통수학2로 분류하세요.
★ 수학I/수학II/확률과통계는 고2 과목입니다. 고1로 분류하지 마세요.

■ 난이도 채점 (6항목, 총점 3~16점 → 5등급)
| 항목 | 1점 | 2점 | 3점 |
| 필요 개념 수 | 1개 | 2개 | 3개+ |
| 풀이 단계 수 | 1~2 | 3~4 | 5+ |
| 계산 복잡도 | 단순 | 중간 | 복잡 |
| 사고력 요구 | 단순적용 | 응용/변형 | 추론/증명 |
| 자료 해석 | 0:불필요 | 1:단순 | 2:복합 |
| 함정/오개념 | 0:없음 | - | 2:있음 |
등급: 하(3~5)=1, 중하(6~7)=2, 중(8~9)=3, 중상(10~11)=4, 상(12+)=5

주어진 수학 문제를 분석하여 **반드시 아래의 정확한 JSON 구조**로만 응답해주세요.

{
  "classification": {
    "achievementCode": "[12수학01-02]",
    "typeCode": "MS07-01-03-02 (수학비서 유형 코드, 아래 테이블에서 선택)",
    "typeName": "대단원 > 중단원 > 소단원",
    "subject": "과목명 (공통수학1, 공통수학2, 대수, 미적분1, 확률과 통계, 미적분2, 기하 등)",
    "chapter": "대단원명",
    "section": "중단원명",
    "difficulty": 3,
    "difficultyLabel": "중",
    "difficultyScores": {
      "concept_count": 2, "step_count": 2, "calc_complexity": 1,
      "thinking_level": 2, "data_interpretation": 0, "trap_misconception": 0, "total": 7
    },
    "cognitiveDomain": "CALCULATION 또는 UNDERSTANDING 또는 INFERENCE 또는 PROBLEM_SOLVING",
    "confidence": 0.85,
    "prerequisites": []
  },
  "solution": {
    "approach": "풀이의 핵심 전략을 한 문장으로 요약",
    "steps": [
      {"stepNumber": 1, "description": "이 단계에서 하는 일 (30자 이상)", "latex": "이 단계의 수식 (필수)", "explanation": "왜 이렇게 하는지 설명"}
    ],
    "verification": "검산: 최종 답을 원래 문제 조건에 대입하여 확인한 결과",
    "finalAnswer": "최종 정답 (예: 24, x=3, 5/2 등) ★필수★",
    "commonMistakes": ["학생들이 자주 하는 실수"]
  },

★ 해설(solution) 필수 규칙:
1. steps: 최소 2단계 이상, 각 단계에 latex 수식 반드시 포함
2. finalAnswer: 최종 답을 반드시 명시하세요. 빈 문자열("")은 절대 불가
3. 계산 과정을 절대 생략하지 마세요. 중간 과정도 모두 포함
4. 객관식이면 finalAnswer에 정답 번호(1~5)도 포함
5. ★★ 학년 수준 맞춤: 분류한 subject(과목)의 교육과정 범위 내 개념만 사용하여 풀이하세요.
   - 중학교 문제에 고등 과정(미적분, 삼각함수 등) 사용 금지
   - 수학I 문제에 미적분/기하 개념 사용 금지
   - 학생이 해당 과목에서 배운 범위로만 이해할 수 있게 작성
6. 그래프/도형이 문제에 포함된 경우, 문제 텍스트의 수학적 조건(함수식, 좌표, 길이 등)을 기반으로 풀이하세요. "그래프를 볼 수 없어 풀이 불가"라고 절대 답하지 마세요.
7. ★★ 검산 필수: 풀이 완료 후 최종 답을 원래 문제 조건에 대입하여 반드시 검산하세요.
   - 객관식: 정답 번호의 값이 문제 조건을 만족하는지 확인
   - 주관식: 구한 값을 원래 식에 대입하여 성립하는지 확인
   - 검산 결과가 맞지 않으면 풀이를 처음부터 다시 수행하세요
   - verification 필드에 검산 과정을 기술하세요

★★ 참고 자료(해설지/정답지)가 제공된 경우:
- 참고 자료의 정답을 최우선으로 사용하세요. AI 자체 계산과 다르면 참고 자료를 신뢰하세요.
- 풀이 과정은 참고 자료의 흐름을 기반으로 정리하되, 학생이 이해하기 쉽게 보충하세요.
- finalAnswer는 반드시 참고 자료의 정답과 일치해야 합니다.
  "metadata": {
    "estimatedTimeMinutes": 5,
    "keywordsTags": ["키워드"],
    "similarTypes": []
  }
}

중요: 위 JSON 키 이름을 정확히 사용하세요. 한글 키 이름을 사용하지 마세요.

{MATHSECR_TYPES}

문제:
{PROBLEM_TEXT}

참고 자료 (해설지/정답지 내용):
{REFERENCE_TEXT}

JSON만 응답하세요. 설명 텍스트를 추가하지 마세요.`;

// ============================================================================
// 과학 분류 프롬프트 — 2022 개정 교육과정 기반
// ============================================================================

const SCIENCE_CLASSIFICATION_PROMPT = `당신은 "다사람" AI 과학 교육 전문가입니다.
한국 교육과정(2015 개정, 2022 개정)에 기반하여 과학 문제를 분류합니다.

■ 과목 체계 (2022 개정 교육과정)
| 과목코드 | 과목명 | 분류 |
|---------|--------|------|
| MS_SCI | 과학 | 중학교 |
| IS1 | 통합과학1 | 고등 공통 |
| IS2 | 통합과학2 | 고등 공통 |
| SEL1 | 과학탐구실험1 | 고등 공통 |
| SEL2 | 과학탐구실험2 | 고등 공통 |
| PHY | 물리학 | 일반선택 |
| CHM | 화학 | 일반선택 |
| BIO | 생명과학 | 일반선택 |
| EAR | 지구과학 | 일반선택 |
| PHY_ME | 역학과 에너지 | 진로선택 |
| PHY_EQ | 전자기와 양자 | 진로선택 |
| CHM_ME | 물질과 에너지 | 진로선택 |
| CHM_RW | 화학 반응의 세계 | 진로선택 |
| BIO_CM | 세포와 물질대사 | 진로선택 |
| BIO_GN | 생명의 유전 | 진로선택 |
| EAR_SS | 지구시스템과학 | 진로선택 |
| EAR_PS | 행성우주과학 | 진로선택 |
| FUS_CC | 기후변화와 환경생태 | 융합선택 |
| FUS_SI | 융합과학탐구 | 융합선택 |
| FUS_HC | 과학의 역사와 문화 | 융합선택 |

★ 2015 개정 과목(물리학I/II 등)은 다음과 같이 매핑:
  물리학I→PHY, 물리학II→PHY_ME 또는 PHY_EQ (내용에 따라)
  화학I→CHM, 화학II→CHM_ME 또는 CHM_RW
  생명과학I→BIO, 생명과학II→BIO_CM 또는 BIO_GN
  지구과학I→EAR, 지구과학II→EAR_SS 또는 EAR_PS

■ 공통과학 소단원 + 유형분류 (2022 개정, 하이탑 기준)
1-1-1.기본량과 측정: 01.시간과 공간, 02.기본량과 유도량, 03.측정과 측정 표준
1-1-2.신호와 디지털 정보: 01.신호와 정보
2-1-1.우주 초기의 원소: 01.스펙트럼과 우주의 원소 분포, 02.빅뱅과 우주 초기 원소의 생성
2-1-2.지구와 생명체를 이루는 원소의 생성: 01.지구와 생명체를 구성하는 원소의 생성, 02.태양계와 지구의 형성
2-2-1.원소의 주기성: 01.원소와 주기율표, 02.원소의 주기성이 나타나는 까닭
2-2-2.화학 결합과 물질의 성질: 01.화학 결합의 원리, 02.화학 결합의 종류와 물질의 성질
2-2-3.자연의 구성 물질: 01.지각과 생명체의 구성 물질, 02.지각을 구성하는 물질의 규칙성, 03.생명체를 구성하는 물질의 규칙성, 04.단백질, 05.핵산
2-2-4.물질의 전기적 성질과 활용: 01.물질의 전기적 성질, 02.반도체
3-1-1.지구시스템의 구성요소: 01.지구 시스템의 구성 요소
3-1-2.지구시스템의 상호작용: 01.지구 시스템의 에너지 이동과 물질 순환, 02.지구시스템의 상호 작용
3-1-3.지권의 변화: 01.변동대와 판 구조론, 02.판의 경계와 지각 변동, 03.지권의 변화가 지구 시스템에 미치는 영향
3-2-1.중력장 내의 운동: 01.자유 낙하 운동, 02.수평 방향으로 던진 물체의 운동, 03.지구 주위를 공전하는 물체의 운동
3-2-2.운동량과 충격량: 01.관성과 관성 법칙, 02.운동량과 충격량, 03.충돌과 안전장치
3-3-1.생명 시스템의 기본 단위: 01.생명 시스템, 02.세포의 구조와 기능
3-3-2.물질대사와 효소: 01.물질대사, 02.효소
3-3-3.세포 내 정보의 흐름: 01.세포막의 구조와 기능, 02.확산, 03.삼투, 04.유전자와 단백질, 05.유전정보의 흐름
4-1-1.지질 시대의 환경과 생물: 01.화석과 지질 시대, 02.지질 시대의 환경과 생물, 03.대멸종과 생물다양성
4-1-2.자연선택과 진화: 01.변이와 자연 선택, 02.변이와 자연선택에 의한 생물의 진화
4-1-3.생물다양성과 보전: 01.생물 다양성, 02.생물다양성의 감소 원인과 보전
4-2-1.산화와 환원: 01.산소의 이동과 산화 환원 반응, 02.전자의 이동과 산화 환원 반응, 03.일상생활 속 산화 환원 반응
4-2-2.산과 염기의 중화반응: 01.산과 염기, 02.지시약, 03.중화 반응, 04.중화 반응이 일어날 때의 변화, 05.일상생활 속 중화반응
4-2-3.물질 변화에서 에너지 출입: 01.물질 변화와 에너지 출입, 02.우리 주변에서 에너지 출입을 이용한 예
5-1-1.생태계의 구성 요소: 01.생태계를 구성하는 요소, 02.생물과 환경의 상호작용
5-1-2.생태계의 평형: 01.먹이 관계와 생태 피라미드
5-1-3.환경 변화가 생태계에 미치는 영향: 01.생태계평형과 환경변화
5-2-1.온실 효과와 지구 온난화: 01.온실효과와 지구 온난화, 02.엘니뇨, 03.사막화
5-2-2.지구 환경 변화와 인간 생활: 01.미래의 지구 환경변화와 대처방안
5-3-1.태양 에너지의 생성과 전환: 01.태양 에너지의 생성과 전환, 02.태양 에너지의 전환과 흐름
5-3-2.발전: 01.전자기 유도, 02.발전
5-3-3.에너지 효율과 신재생 에너지: 01.에너지 전환과 보존, 02.에너지 효율, 03.신재생 에너지
6-1-1.과학의 유용성과 빅데이터의 활용: 01.과학의 유용성과 필요성, 02.과학 기술 사회에서의 빅데이터의 활용
6-1-2.과학 기술의 발전과 과학 윤리: 01.과학 기술과 미래 사회, 02.과학 관련 사회적 쟁점과 과학 윤리

■ 난이도 6단계 (사고 과정의 복잡도 기준 — "문항 길이/그림 유무/계산량"이 아닌 학생의 사고 과정 복잡도로 결정)
※ 기본 태그는 <1>~<5> 중 1개만 선택. <6>특이는 필요 시 추가 중복 가능.
※ 한 문항에 여러 요소가 섞이면 가장 높은 수준의 사고를 요구하는 요소 기준으로 상향 적용.

<1>개념: 정의/용어/사실을 '알면 바로' 푸는 문항
  - 핵심: 개념·용어의 직접 확인, 단순 구분/암기 기반 판단
  - 대표: 용어 정의 묻기, 단순 분류(순물질/혼합물, 지구형/목성형), 한 문장 개념 진위 판단
  - 판정: 계산이 없거나 개념 확인 수준. 자료(그래프/표)가 있어도 읽을 필요 없이 답이 나오면 <1>

<2>이해: 원리/개념을 '한 번 적용'하거나 '단순 계산'으로 해결
  - 핵심: 1개 핵심 개념 → 익숙한 상황에 적용, 공식 1회 대입 수준
  - 대표: 에너지 전환/밀도/전압-전류-저항 관계 바로 적용, 한 단계 계산으로 답
  - 판정: "개념 1개 + 절차 1개(대입/비교)"로 끝남. 자료해석이 본질이 아니며 추론이 길지 않음

<3>해석: 자료(그래프/표/실험결과)를 읽고 해석하는 것이 핵심
  - 핵심: 주어진 자료에서 의미 추출 → 판단/계산
  - 대표: 그래프 기울기/변곡/구간 특징으로 결론 도출, 실험 설계/결과 해석, 표에서 규칙성 찾기
  - 판정: 자료를 안 읽으면 못 푸는 구조. 계산이 있더라도 "자료에서 값/관계 추출"이 더 중요하면 <3>

<4>응용: 복합 조건/합답형/상위·타단원 연계 등 '여러 개념을 묶어' 해결
  - 핵심: 두 개 이상 개념/조건을 연결, 단원 간 연결, 합답형 판단
  - 대표: ㄱㄴㄷ "옳은 것만 고르기" 합답형, 서로 다른 파트 연결, 조건 여러 개 → 중간 판단 → 최종 선택
  - 판정: 단일 공식으로 끝나지 않음. "개념 A 적용 → 결과를 개념 B에 다시 적용" 연결이 존재
  - ★ 합답형(ㄱㄴㄷ)은 원칙적으로 <4>응용에 우선 배치

<5>최고난도: 고2·고3 모의고사 연계 수준의 추론/모델링/복합 계산
  - 핵심: 비정형 상황에서 모델 세우기, 숨은 조건 추론, 긴 논증/복합 계산
  - 대표: 조건 불충분해 보이지만 관계식을 스스로 구성, 자료 해석이 아닌 추론으로 새 변수 도출, 선택지 함정 강함
  - 판정: "왜 그렇게 되는지" 구성 과정이 길고, 풀이가 여러 갈래 판단(분기)을 거치며, 계산·추론·연계가 동시에 높은 수준
  - ★ 합답형이면서 추론 구조가 고난도면 <5>

<6>특이 (중복 태그): 범위 밖/출제 방식 비정형/문항 자체 특이 케이스
  - 부여 사유: 범위 밖(심화 전공/과도한 미적분), 문항 오류/불완전(조건 누락/복수정답), 형식 특이(서술형/퍼즐형), 과도한 융합
  - 예: <3>해석 + <6>특이 (그래프 축/단위 누락), <4>응용 + <6>특이 (문항 조건 애매)

■ 난이도 빠른 판정 절차 (순서대로 판정):
1) 범위 밖/오류/비정형 요소가 있는가? → Yes: <6>특이 추가 예정(중복)
2) 개념·용어만 알면 즉시 풀리는가? → Yes: <1>개념
3) 원리 1개 적용/단순 계산 1회로 끝나는가? → Yes: <2>이해
4) 그래프/표/실험결과 해석이 없으면 풀 수 없는가? → Yes: <3>해석
5) 여러 개념 연결/합답형/상위단원 연계가 핵심인가? → Yes: <4>응용
6) 비정형 추론/모델링/복합 계산으로 풀이 난도가 확 올라가는가? → Yes: <5>최고난도

■ 경계 사례 처리 규칙 (일관성 확보):
- 자료가 있지만 "읽기만 하면 답" → <3>해석
- 자료해석 + 개념 2개 이상 연결 → <4>응용
- 자료해석 + 숨은 조건 추론/모델링/긴 논증 → <5>최고난도
- 계산이 길어 보여도 공식 대입 반복 수준이면 <2>이해 또는 <3>해석 (자료 기반이면 <3>)
- ★ 합답형(ㄱㄴㄷ)은 원칙적으로 <4>응용 쪽 우선 배치. 단, 추론 구조가 고난도면 <5>최고난도

주어진 과학 문제를 분석하여 **반드시 아래의 정확한 JSON 구조**로만 응답해주세요.

{
  "classification": {
    "achievementCode": "[10통과01-01]",
    "typeCode": "IS1-01-001",
    "typeName": "유형 이름 (예: 원소의 주기적 성질)",
    "subject": "과목명 (통합과학1, 물리학, 화학, 생명과학, 지구과학, 역학과 에너지 등)",
    "scienceSubject": "과목코드 (IS1, PHY, CHM, BIO, EAR, PHY_ME, PHY_EQ, CHM_ME 등)",
    "chapter": "대단원명 (예: 2-2.물질의 규칙성과 결합)",
    "section": "소단원명 (예: 2-2-1.원소의 주기성)",
    "subsection": "유형분류 (예: 01.원소와 주기율표)",
    "difficulty": 3,
    "difficultyLabel": "해석",
    "difficultyScores": {
      "concept_count": 1, "step_count": 2, "calc_complexity": 1,
      "thinking_level": 2, "data_interpretation": 2, "trap_misconception": 0, "total": 8,
      "extra_tag": ""
    },
    "cognitiveDomain": "UNDERSTANDING 또는 CALCULATION 또는 INFERENCE 또는 PROBLEM_SOLVING",
    "confidence": 0.85,
    "prerequisites": []
  },
  "solution": {
    "approach": "풀이의 핵심 전략을 한 문장으로 요약",
    "steps": [
      {"stepNumber": 1, "description": "이 단계에서 하는 일 (30자 이상)", "latex": "관련 수식/공식 (있는 경우)", "explanation": "왜 이렇게 하는지 설명"}
    ],
    "verification": "검산: 최종 답을 원래 문제 조건에 대입하여 확인한 결과",
    "finalAnswer": "최종 정답 (예: ㄱ,ㄷ, 3, ② 등) ★필수★",
    "commonMistakes": ["학생들이 자주 하는 실수"]
  },
  "metadata": {
    "estimatedTimeMinutes": 3,
    "keywordsTags": ["키워드"],
    "similarTypes": []
  }
}

★ difficulty 매핑: 1=개념, 2=이해, 3=해석, 4=응용, 5=최고난도, 6=특이
★ difficultyLabel: "개념"/"이해"/"해석"/"응용"/"최고난도"/"특이"
★ difficultyScores.extra_tag: 특이 사유 (예: "범위 밖", "문항 오류", "형식 특이"). 해당 없으면 빈 문자열.

★ 해설(solution) 필수 규칙:
1. steps: 최소 2단계 이상
2. finalAnswer: 최종 답을 반드시 명시. 빈 문자열("") 절대 불가
3. ㄱ,ㄴ,ㄷ 보기 문제: 각 보기를 하나씩 검증하고 맞는 것을 finalAnswer에 명시
4. 객관식이면 finalAnswer에 정답 번호(①~⑤)도 포함
5. 그래프/표가 포함된 경우, 문제 텍스트의 조건을 기반으로 풀이. "그래프를 볼 수 없다"고 답하지 마세요.
6. 실험 과정: 실험 목적과 변인을 파악하고, 각 단계를 논리적으로 분석
7. ★★ 검산 필수: 풀이 완료 후 최종 답을 원래 문제 조건에 대입하여 반드시 검산하세요.
   - 각 보기(ㄱ,ㄴ,ㄷ)의 참/거짓을 다시 한 번 확인
   - 계산 문제는 구한 값을 원래 조건에 대입하여 성립하는지 확인
   - 검산 결과가 맞지 않으면 풀이를 처음부터 다시 수행하세요

★★ 참고 자료(해설지/정답지)가 제공된 경우:
- 참고 자료의 정답을 최우선으로 사용하세요. AI 자체 계산과 다르면 참고 자료를 신뢰하세요.
- 풀이 과정은 참고 자료의 흐름을 기반으로 정리하되, 학생이 이해하기 쉽게 보충하세요.
- finalAnswer는 반드시 참고 자료의 정답과 일치해야 합니다.

중요: 위 JSON 키 이름을 정확히 사용하세요. 한글 키 이름을 사용하지 마세요.
공통과학 문제는 위의 소단원 + 유형분류 체계에서 가장 적합한 것을 선택하세요.

문제:
{PROBLEM_TEXT}

참고 자료 (해설지/정답지 내용):
{REFERENCE_TEXT}

JSON만 응답하세요. 설명 텍스트를 추가하지 마세요.`;

const ANSWER_PROMPT = `당신은 수학 해설 데이터 추출 전문가입니다. 주어진 텍스트는 수학 문제의 해설지입니다.
다음 정보를 JSON 형태로 반환해주세요:

1. 유형 분류:
   - typeCode: "ANSWER-SHEET"
   - typeName: "해설지 데이터"
   - subject: "해설"
   - chapter: "해설"
   - section: "해설"
   - difficulty: 1
   - cognitiveDomain: "UNDERSTANDING"

2. 단계별 풀이:
   - approach: 풀이의 핵심 접근법 요약
   - steps: 해설의 각 단계를 잘게 나누어 설명 (LaTeX 수식 포함)
   - finalAnswer: 최종 정답 추출
   - commonMistakes: (텍스트에 있다면) 실수 포인트, 없다면 빈 배열

3. 메타데이터:
   - prerequisites: []
   - estimatedTimeMinutes: 0
   - keywordsTags: ["해설"]

텍스트:
{PROBLEM_TEXT}

JSON 형식으로 응답해주세요.`;

const QUICK_ANSWER_PROMPT = `당신은 수학 정답 추출 전문가입니다. 주어진 텍스트는 빠른 정답표(Answer Key)입니다.
다음 정보를 JSON 형태로 반환해주세요:

1. 유형 분류:
   - typeCode: "QUICK-ANSWER"
   - typeName: "빠른 정답"
   - subject: "정답"
   - chapter: "정답"
   - section: "정답"
   - difficulty: 1
   - cognitiveDomain: "CALCULATION"

2. 단계별 풀이:
   - approach: "빠른 정답"
   - steps: []
   - finalAnswer: 정답 텍스트 추출 (예: "3", "5", "12")
   - commonMistakes: []

3. 메타데이터:
   - prerequisites: []
   - estimatedTimeMinutes: 0
   - keywordsTags: ["정답"]

텍스트:
{PROBLEM_TEXT}

JSON 형식으로 응답해주세요.`;

/** 파일명에서 학년/과목 힌트 추출 — GPT 분류 정확도 향상용 */
function detectGradeFromFileName(fileName?: string): string {
  if (!fileName) return '';
  const f = fileName;
  // 중등
  if (/중1|1-1|1-2/.test(f) && /중/.test(f)) return '중1 수학';
  if (/2-1/.test(f) && /중/.test(f)) return '중2-1 수학';
  if (/2-2/.test(f) && /중/.test(f)) return '중2-2 수학';
  if (/중2/.test(f)) return '중2 수학';
  if (/3-1/.test(f) && /중/.test(f)) return '중3-1 수학';
  if (/3-2/.test(f) && /중/.test(f)) return '중3-2 수학';
  if (/중3/.test(f)) return '중3 수학';
  // 고등 과목 구분
  if (/수[학Ⅰ1].*1|수1/.test(f)) return '고등 수학Ⅰ';
  if (/수[학Ⅱ2].*2|수2/.test(f)) return '고등 수학Ⅱ';
  if (/미적/.test(f)) return '고등 미적분';
  if (/확[률통]/.test(f)) return '고등 확률과 통계';
  if (/기[하학]/.test(f)) return '고등 기하';
  if (/공통수학/.test(f)) return '고등 공통수학';
  // 고등 학년
  if (/고3|3학년/.test(f)) return '고3 수학';
  if (/고2|2학년/.test(f)) return '고2 수학';
  if (/고1|1학년/.test(f)) return '고1 수학';
  // 과학
  if (/과학|물리|화학|생명|지구/.test(f)) return '';  // 과학은 별도 처리
  return '';
}

/** subject가 과학 과목인지 판별 */
function isScienceSubject(subject?: string): boolean {
  if (!subject) return false;
  return /과학|물리|화학|생명|생물|지구|IS[12]|PHY|CHE|BIO|ESC|science/i.test(subject);
}

export async function analyzeProblemWithLLM(
  problemText: string,
  mathExpressions: string[],
  documentType: 'PROBLEM' | 'ANSWER' | 'QUICK_ANSWER' = 'PROBLEM',
  onProgress?: (progress: number) => void,
  referenceTexts: { answer?: string; quickAnswer?: string } = {},
  subject?: string,
  gradeHint?: string
): Promise<LLMAnalysisResult> {
  if (onProgress) onProgress(55);

  const fullProblemText = `${problemText}\n\n수식: ${mathExpressions.join(', ')}`;

  // Construct Reference Text
  let referenceText = "없음";
  if (referenceTexts.answer || referenceTexts.quickAnswer) {
    referenceText = `[해설지]\n${referenceTexts.answer || '없음'}\n\n[빠른 정답]\n${referenceTexts.quickAnswer || '없음'}`;
    // Limit reference text length to avoid token limits (approx 10000 chars)
    if (referenceText.length > 10000) {
      referenceText = referenceText.substring(0, 10000) + "... (truncated)";
    }
  }

  try {
    // GPT-4o API 호출 — 과목에 따라 프롬프트 분기
    const isScience = isScienceSubject(subject);
    let prompt = isScience ? SCIENCE_CLASSIFICATION_PROMPT : CLASSIFICATION_PROMPT;
    if (documentType === 'ANSWER') prompt = ANSWER_PROMPT;
    if (documentType === 'QUICK_ANSWER') prompt = QUICK_ANSWER_PROMPT;
    console.log(`[analyzeProblemWithLLM] subject="${subject}", isScience=${isScience}, docType=${documentType}`);

    // ★ 수학비서 유형 테이블 동적 주입 — 분류 정확도 대폭 향상
    let mathsecrSection = '';
    if (!isScience) {
      try {
        const { resolveSubjectCode, buildMathsecrPromptSection, buildSubjectOnlyPrompt } = await import('./mathsecr-prompt');
        const subjectCode = resolveSubjectCode(gradeHint, subject);
        mathsecrSection = subjectCode
          ? await buildMathsecrPromptSection(subjectCode)
          : buildSubjectOnlyPrompt();
      } catch (e) {
        console.warn('[analyzeProblemWithLLM] mathsecr-prompt load failed:', e);
      }
    }

    const gradeContext = gradeHint
      ? `\n\n★★ 중요: 이 문제는 "${gradeHint}" 시험지의 문제입니다. 반드시 해당 학년/과목 교육과정 범위 내에서 분류하세요.\n- 해당 학년에서 배우지 않는 상위 과정 단원으로 분류하지 마세요.`
      : '';

    const finalPrompt = prompt
      .replace('{PROBLEM_TEXT}', fullProblemText + gradeContext)
      .replace('{REFERENCE_TEXT}', referenceText)
      .replace('{MATHSECR_TYPES}', mathsecrSection);

    const scienceSystemMsg = isScience
      ? '당신은 한국 고등학교 과학 교육과정(통합과학, 물리학, 화학, 생명과학, 지구과학) 전문가이자 수능/모의고사 과학 출제위원급 전문가입니다. 문제의 과목, 단원, 난이도를 정확히 분류하고 상세한 풀이를 제공합니다. 반드시 유효한 JSON으로만 응답하세요. 설명 텍스트 없이 JSON만 출력하세요. 키 이름은 영문 camelCase를 사용하세요. LaTeX 수식은 반드시 이중 백슬래시(\\\\)를 사용하세요.'
      : undefined;

    const response = await callOpenAI(finalPrompt, {
      systemMessage: scienceSystemMsg,
    });

    if (onProgress) onProgress(75);

    // 응답 파싱
    const analysis = parseAnalysisResponse(response);

    if (onProgress) onProgress(90);

    return analysis;
  } catch (error) {
    console.error('LLM Analysis Error:', error);
    // 폴백: 기본 분류 반환
    return createFallbackAnalysis(problemText);
  }
}

const DEFAULT_SYSTEM_MESSAGE = '당신은 한국 고등학교 수학 교육과정 전문가이자 수능/모의고사 출제위원급 전문가입니다. 문제의 유형, 난이도, 단원을 정확히 분류하고 상세한 풀이를 제공합니다. 반드시 유효한 JSON으로만 응답하세요. 설명 텍스트 없이 JSON만 출력하세요. 키 이름은 영문 camelCase를 사용하세요. LaTeX 수식은 반드시 이중 백슬래시(\\\\)를 사용하세요.';

const SOLUTION_SYSTEM_MESSAGE = '당신은 한국 수학 시중 교재(수학의 정석, 쎈, 마플, RPM 등)의 해설지를 집필하는 전문가입니다. 학생이 혼자 읽고 완전히 이해할 수 있도록 교재 해설지처럼 명확하고 체계적으로 작성합니다. 반드시 유효한 JSON으로만 응답하세요. LaTeX 수식은 반드시 이중 백슬래시(\\\\)를 사용하세요. 필수 규칙: (1) 핵심 개념/공식부터 제시 (2) 교재처럼 자연스러운 서술체 풀이 (3) 최종 답 반드시 명시 (4) 계산 과정 절대 생략 금지.';

interface CallOpenAIOptions {
  retries?: number;
  backoff?: number;
  model?: string;
  systemMessage?: string;
  temperature?: number;
}

async function callOpenAI(prompt: string, retriesOrOptions?: number | CallOpenAIOptions, backoff = 5000, model?: string): Promise<string> {
  // 실제 OpenAI API 호출
  if (!OPENAI_API_KEY) {
    throw new Error('[Cloud Flow] OpenAI API key not configured. Set OPENAI_API_KEY in .env');
  }

  // 하위 호환: (prompt, retries, backoff, model) 또는 (prompt, options) 모두 지원
  let opts: CallOpenAIOptions;
  if (typeof retriesOrOptions === 'object') {
    opts = retriesOrOptions;
  } else {
    opts = { retries: retriesOrOptions ?? 6, backoff, model };
  }

  const currentModel = opts.model || OPENAI_MODEL;
  const currentSystemMessage = opts.systemMessage || DEFAULT_SYSTEM_MESSAGE;
  const currentTemperature = opts.temperature ?? 0.1;
  const currentRetries = opts.retries ?? 6;
  const currentBackoff = opts.backoff ?? 5000;

  try {
    console.log(`[Cloud Flow] Calling OpenAI with model: ${currentModel}, temp: ${currentTemperature}`);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: currentModel,
        messages: [
          {
            role: 'system',
            content: currentSystemMessage,
          },
          { role: 'user', content: prompt },
        ],
        temperature: currentTemperature,
        max_tokens: 6000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      // 429 Rate Limit 처리
      if (response.status === 429 && currentRetries > 0) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const waitTime = retryAfterHeader
          ? Math.max(parseInt(retryAfterHeader, 10) * 1000, currentBackoff)
          : currentBackoff;

        console.warn(`[Cloud Flow] OpenAI 429 Rate Limit. Retrying in ${waitTime}ms with ${currentModel}... (${currentRetries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return callOpenAI(prompt, { ...opts, retries: currentRetries - 1, backoff: currentBackoff * 2 });
      }
      throw new Error(`OpenAI API error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    if (currentRetries > 0 && error instanceof Error && error.message.includes('429')) {
      console.warn(`[Cloud Flow] OpenAI 429 Rate Limit (Exception). Retrying in ${currentBackoff}ms with ${currentModel}... (${currentRetries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, currentBackoff));
      return callOpenAI(prompt, { ...opts, retries: currentRetries - 1, backoff: currentBackoff * 2 });
    }
    throw error;
  }
}

// ============================================================================
// Claude Sonnet API — 풀이 생성 전담
// ============================================================================

interface CallClaudeOptions {
  retries?: number;
  backoff?: number;
  systemMessage?: string;
  temperature?: number;
  maxTokens?: number;
}

async function callClaude(prompt: string, options: CallClaudeOptions = {}): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[Cloud Flow] ANTHROPIC_API_KEY not configured. Falling back to OpenAI for solution generation.');
    return callOpenAI(prompt, {
      systemMessage: options.systemMessage || SOLUTION_SYSTEM_MESSAGE,
      temperature: options.temperature ?? 0.2,
    });
  }

  const retries = options.retries ?? 3;
  const backoff = options.backoff ?? 5000;
  const systemMessage = options.systemMessage || SOLUTION_SYSTEM_MESSAGE;
  const temperature = options.temperature ?? 0.2;
  const maxTokens = options.maxTokens ?? 4000;

  try {
    console.log(`[Cloud Flow] Calling Claude Sonnet (${ANTHROPIC_MODEL}), temp: ${temperature}`);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system: systemMessage,
        messages: [
          { role: 'user', content: prompt },
        ],
        temperature,
      }),
    });

    if (!response.ok) {
      if (response.status === 429 && retries > 0) {
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter ? Math.max(parseInt(retryAfter, 10) * 1000, backoff) : backoff;
        console.warn(`[Cloud Flow] Claude 429 Rate Limit. Retrying in ${waitTime}ms... (${retries} left)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return callClaude(prompt, { ...options, retries: retries - 1, backoff: backoff * 2 });
      }
      if (response.status === 529 && retries > 0) {
        console.warn(`[Cloud Flow] Claude 529 Overloaded. Retrying in ${backoff}ms... (${retries} left)`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        return callClaude(prompt, { ...options, retries: retries - 1, backoff: backoff * 2 });
      }
      const errorBody = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${errorBody.substring(0, 200)}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find((c: { type: string }) => c.type === 'text');
    return textBlock?.text || '';
  } catch (error) {
    if (retries > 0 && error instanceof Error && (error.message.includes('429') || error.message.includes('529'))) {
      console.warn(`[Cloud Flow] Claude error. Retrying in ${backoff}ms... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return callClaude(prompt, { ...options, retries: retries - 1, backoff: backoff * 2 });
    }
    // Claude 완전 실패 시 GPT-4o 폴백
    console.error('[Cloud Flow] Claude failed, falling back to OpenAI:', error);
    return callOpenAI(prompt, {
      systemMessage: options.systemMessage || SOLUTION_SYSTEM_MESSAGE,
      temperature: options.temperature ?? 0.2,
    });
  }
}

// ============================================================================
// 정답 교차 검증 — GPT-4o로 독립 풀이 후 정답 비교
// ============================================================================

interface VerificationResult {
  verified: boolean;       // 정답 일치 여부
  gptoAnswer: string;      // GPT-4o가 구한 정답
  sonnetAnswer: string;    // Sonnet이 구한 정답
  mismatchFlag: boolean;   // 불일치 플래그 (사람 검수 필요)
}

async function verifyAnswerWithGPT(
  problemText: string,
  sonnetAnswer: string,
  mathExpressions: string[] = [],
  choices?: string[]
): Promise<VerificationResult> {
  // ★ 선택지가 있으면 검증 프롬프트에도 포함
  const validChoices = (choices || []).filter(c => c && c.trim().length > 0);
  const choicesSection = validChoices.length > 0
    ? `\n\n[선택지]\n${validChoices.map((c, i) => `${['①','②','③','④','⑤'][i] || `(${i+1})`} ${c.replace(/^[①②③④⑤]\s*/, '')}`).join('\n')}`
    : '';

  const VERIFY_PROMPT = `다음 수학 문제의 정답만 간결하게 구해주세요.
풀이 과정은 최소화하고, 최종 정답만 명확하게 출력하세요.

문제:
${problemText}
${mathExpressions.length > 0 ? `수식: ${mathExpressions.join(', ')}` : ''}${choicesSection}

반드시 아래 JSON 형식으로만 응답하세요:
{
  "finalAnswer": "최종 정답 (예: 24, x=3, ②, 5/2 등)",
  "brief": "핵심 풀이 한 줄 요약"
}`;

  try {
    const response = await callOpenAI(VERIFY_PROMPT, {
      systemMessage: '당신은 수학 문제의 정답을 빠르고 정확하게 구하는 전문가입니다. 반드시 유효한 JSON으로만 응답하세요.',
      temperature: 0.0,  // 검증은 결정론적으로
    });

    let jsonStr = response;
    if (response.includes('```json')) {
      jsonStr = response.split('```json')[1].split('```')[0].trim();
    } else if (response.includes('```')) {
      jsonStr = response.split('```')[1].split('```')[0].trim();
    }

    const parsed = JSON.parse(jsonStr);
    const gptoAnswer = String(parsed.finalAnswer || '').trim();
    const cleanSonnet = String(sonnetAnswer || '').trim();

    // 정답 비교 (정규화 후)
    const verified = normalizeAnswer(gptoAnswer) === normalizeAnswer(cleanSonnet);

    if (!verified) {
      console.warn(`[Cloud Flow] ⚠️ 정답 불일치! Sonnet: "${cleanSonnet}" vs GPT-4o: "${gptoAnswer}"`);
    } else {
      console.log(`[Cloud Flow] ✅ 정답 일치 확인: "${cleanSonnet}"`);
    }

    return {
      verified,
      gptoAnswer,
      sonnetAnswer: cleanSonnet,
      mismatchFlag: !verified,
    };
  } catch (error) {
    console.error('[Cloud Flow] Answer verification failed:', error);
    // 검증 실패 시 플래그 처리 (정답은 Sonnet 것 유지)
    return {
      verified: false,
      gptoAnswer: '',
      sonnetAnswer: String(sonnetAnswer || '').trim(),
      mismatchFlag: true,
    };
  }
}

/**
 * 정답 문자열 정규화 (비교용)
 * "② 24", "24", "  24 " 등을 통일
 */
function normalizeAnswer(ans: string): string {
  return ans
    .replace(/\s+/g, '')          // 공백 제거
    .replace(/[①②③④⑤]/g, m => {  // 동그라미 번호 → 숫자
      const map: Record<string, string> = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5' };
      return map[m] || m;
    })
    .replace(/^\(|\)$/g, '')      // 괄호 제거
    .replace(/\\text\{[^}]*\}/g, '') // \text{} 제거
    .replace(/\\quad/g, '')
    .replace(/\\,/g, '')
    .toLowerCase()
    .trim();
}

function getMockLLMResponse(): string {
  return JSON.stringify({
    classification: {
      typeCode: 'MA-HS1-ALG-02-015',
      typeName: '이차방정식의 풀이 - 인수분해',
      subject: '수학I',
      chapter: '방정식과 부등식',
      section: '이차방정식',
      difficulty: 2,
      cognitiveDomain: 'CALCULATION',
      confidence: 0.95,
      prerequisites: ['MA-HS1-ALG-01-003', 'MA-HS1-ALG-01-008'],
    },
    solution: {
      approach: '좌변을 인수분해하여 근을 구한다.',
      steps: [
        {
          stepNumber: 1,
          description: '이차방정식의 좌변을 인수분해한다.',
          latex: 'x^2 - 5x + 6 = (x-2)(x-3) = 0',
          explanation: '두 수의 합이 -5이고 곱이 6인 수는 -2와 -3이다.',
        },
        {
          stepNumber: 2,
          description: '각 인수가 0이 되는 x의 값을 구한다.',
          latex: 'x - 2 = 0 \\quad \\text{또는} \\quad x - 3 = 0',
          explanation: '영인수의 법칙을 적용한다.',
        },
        {
          stepNumber: 3,
          description: '해를 구한다.',
          latex: 'x = 2 \\quad \\text{또는} \\quad x = 3',
          explanation: '이차방정식의 두 근은 2와 3이다.',
        },
      ],
      finalAnswer: 'x = 2 또는 x = 3',
      alternativeMethods: ['근의 공식 이용'],
      commonMistakes: [
        '인수분해 부호 실수',
        '두 근 중 하나만 답으로 제출',
      ],
    },
    metadata: {
      estimatedTimeMinutes: 3,
      keywordsTags: ['이차방정식', '인수분해', '근의 공식'],
      similarTypes: ['MA-HS1-ALG-02-016', 'MA-HS1-ALG-02-017'],
    },
  });
}

/**
 * GPT 응답의 JSON 문자열에서 잘못된 이스케이프 시퀀스를 정리
 * LaTeX 수식에 \sin, \frac 등이 포함되면 JSON 파서가 \s, \f 를 제어 문자로 해석하여 실패함
 *
 * 전략: JSON 문자열 값 내부만 처리하여 구조적 이스케이프(\", \\)를 보존
 */
function sanitizeJsonString(raw: string): string {
  // 1단계: 먼저 그냥 파싱 시도 — 이미 올바른 JSON이면 건드리지 않음
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    // 파싱 실패 시 아래 정리 로직 수행
  }

  // 2단계: JSON 문자열 리터럴 내부에서만 잘못된 이스케이프 수정
  // JSON 문자열: "..." 내부를 찾아서, 그 안의 백슬래시 처리
  // 정규식: 따옴표로 감싼 문자열 매칭 (이스케이프된 따옴표 포함)
  const result = raw.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    // 문자열 리터럴 내부에서 잘못된 이스케이프만 수정
    // 이미 이스케이프된 \\ 는 건드리지 않음
    // \" \/ \b \f \n \r \t \uXXXX 도 건드리지 않음
    // 그 외 \X → \\X 로 변환
    return match.replace(/\\(\\)|\\(["\\/bfnrtu])|\\([^"\\/bfnrtu\\])/g,
      (m, escaped, valid, invalid) => {
        if (escaped) return '\\\\';  // 이미 \\인 것 보존
        if (valid) return m;          // 유효 이스케이프 보존
        if (invalid) return '\\\\' + invalid; // 잘못된 이스케이프 수정
        return m;
      }
    );
  });

  return result;
}

/**
 * GPT 응답에서 classification 객체를 찾는다.
 * GPT-4o-mini는 키 이름을 다양하게 반환할 수 있음:
 *   classification, 유형_분류, type_classification, 또는 루트에 typeCode를 직접 넣기도 함
 */
function extractClassification(parsed: Record<string, any>): Record<string, any> {
  // 1. 정확한 키
  if (parsed.classification && typeof parsed.classification === 'object') return parsed.classification;
  // 2. 한글 변형
  if (parsed['유형_분류'] && typeof parsed['유형_분류'] === 'object') return parsed['유형_분류'];
  if (parsed['유형 분류'] && typeof parsed['유형 분류'] === 'object') return parsed['유형 분류'];
  if (parsed['유형분류'] && typeof parsed['유형분류'] === 'object') return parsed['유형분류'];
  // 3. 영문 변형
  if (parsed.type_classification && typeof parsed.type_classification === 'object') return parsed.type_classification;
  if (parsed.type && typeof parsed.type === 'object') return parsed.type;
  // 4. 루트 레벨에 typeCode가 있는 경우 (GPT가 flat하게 반환)
  if (parsed.typeCode) return parsed;
  // 5. 첫 번째로 발견되는 객체 중 typeCode를 가진 것
  for (const key of Object.keys(parsed)) {
    const val = parsed[key];
    if (val && typeof val === 'object' && !Array.isArray(val) && (val.typeCode || val.type_code)) {
      return val;
    }
  }
  return {};
}

/**
 * GPT 응답에서 solution 객체를 찾는다.
 */
function extractSolution(parsed: Record<string, any>): Record<string, any> {
  if (parsed.solution && typeof parsed.solution === 'object') return parsed.solution;
  if (parsed['단계별_풀이'] && typeof parsed['단계별_풀이'] === 'object') return parsed['단계별_풀이'];
  if (parsed['단계별 풀이'] && typeof parsed['단계별 풀이'] === 'object') return parsed['단계별 풀이'];
  if (parsed['풀이'] && typeof parsed['풀이'] === 'object') return parsed['풀이'];
  if (parsed.steps && Array.isArray(parsed.steps)) return { steps: parsed.steps, approach: '', finalAnswer: '' };
  // fallback: approach/steps가 루트에 있는 경우
  if (parsed.approach || parsed.finalAnswer) return parsed;
  return {};
}

/**
 * GPT 응답에서 metadata 객체를 찾는다.
 */
function extractMetadata(parsed: Record<string, any>): Record<string, any> {
  if (parsed.metadata && typeof parsed.metadata === 'object') return parsed.metadata;
  if (parsed['메타데이터'] && typeof parsed['메타데이터'] === 'object') return parsed['메타데이터'];
  return {};
}

function parseAnalysisResponse(response: string): LLMAnalysisResult {
  try {
    // JSON 추출 (마크다운 코드 블록 처리)
    let jsonStr = response;
    if (response.includes('```json')) {
      jsonStr = response.split('```json')[1].split('```')[0].trim();
    } else if (response.includes('```')) {
      jsonStr = response.split('```')[1].split('```')[0].trim();
    }

    // GPT 응답에서 잘못된 이스케이프 문자 정리 (LaTeX \sin, \frac 등)
    jsonStr = sanitizeJsonString(jsonStr);

    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (firstError) {
      // 2차 시도: 모든 단일 백슬래시를 이중 백슬래시로 변환 (aggressive)
      console.warn('[Cloud Flow] First JSON parse failed, trying aggressive sanitization');
      const aggressiveSanitized = jsonStr.replace(/\\/g, '\\\\');
      try {
        parsed = JSON.parse(aggressiveSanitized);
      } catch {
        // ★ 3차 시도(백슬래시 전체 제거) 제거됨 — LaTeX 수식을 완전히 파괴하므로
        // 대신 파싱 실패로 처리하여 fallback 분석 결과 반환
        console.error('[Cloud Flow] JSON parse failed after aggressive sanitization. Throwing error for fallback.');
        console.error('[Cloud Flow] Raw response (first 300 chars):', jsonStr.substring(0, 300));
        throw firstError;
      }
    }

    // GPT 응답 구조를 유연하게 추출
    const cls = extractClassification(parsed);
    const sol = extractSolution(parsed);
    const meta = extractMetadata(parsed);

    console.log(`[Cloud Flow] Parsed classification keys: ${Object.keys(cls).join(', ')}`);
    console.log(`[Cloud Flow] Parsed solution keys: ${Object.keys(sol).join(', ')}`);

    // ★ 2015 구 과목 코드 → 2022 신 코드 자동 변환
    const LEGACY_CODE_MAP: Record<string, string> = {
      'PHY1': 'PHY', 'PHY2': 'PHY_ME', 'CHE1': 'CHM', 'CHE2': 'CHM_ME',
      'BIO1': 'BIO', 'BIO2': 'BIO_CM', 'ESC1': 'EAR', 'ESC2': 'EAR_SS',
    };
    const rawScienceSubject = cls.scienceSubject || cls.science_subject || '';
    const mappedScienceSubject = LEGACY_CODE_MAP[rawScienceSubject] || rawScienceSubject;

    return {
      problemId: crypto.randomUUID(),
      classification: {
        typeCode: cls.typeCode || cls.type_code || 'MA-UNKNOWN-001',
        typeName: cls.typeName || cls.type_name || cls['유형이름'] || '미분류',
        subject: cls.subject || cls['과목'] || '수학',
        scienceSubject: mappedScienceSubject || undefined,
        chapter: cls.chapter || cls['대단원'] || '미분류',
        section: cls.section || cls['중단원'] || '미분류',
        subSection: cls.subSection || cls.sub_section || cls['소단원'],
        difficulty: cls.difficulty || cls['난이도'] || 3,
        cognitiveDomain: cls.cognitiveDomain || cls.cognitive_domain || cls['인지영역'] || 'PROBLEM_SOLVING',
        confidence: cls.confidence || cls['신뢰도'] || 0.7,
        prerequisites: cls.prerequisites || cls['선수지식'] || [],
      },
      solution: {
        approach: sol.approach || sol['접근법'] || sol['풀이접근법'] || '',
        steps: sol.steps || sol['단계'] || [],
        finalAnswer: sol.finalAnswer || sol.final_answer || sol['최종답'] || sol['정답'] || '',
        alternativeMethods: sol.alternativeMethods || sol['다른풀이법'] || [],
        commonMistakes: sol.commonMistakes || sol.common_mistakes || sol['흔한실수'] || [],
      },
      similarTypes: meta.similarTypes || meta['유사유형'] || [],
      keywordsTags: meta.keywordsTags || meta.keywords || meta['키워드'] || [],
      estimatedTimeMinutes: meta.estimatedTimeMinutes || meta['예상시간'] || 5,
      analyzedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Failed to parse LLM response:', error);
    console.error('Raw response (first 500 chars):', response.substring(0, 500));
    throw error;
  }
}

function createFallbackAnalysis(problemText: string): LLMAnalysisResult {
  return {
    problemId: crypto.randomUUID(),
    classification: {
      typeCode: 'MA-UNKNOWN-001',
      typeName: '미분류 문제',
      subject: '수학',
      chapter: '미분류',
      section: '미분류',
      difficulty: 3,
      cognitiveDomain: 'PROBLEM_SOLVING',
      confidence: 0.3,
      prerequisites: [],
    },
    solution: {
      approach: '자동 분석 실패 - 수동 입력 필요',
      steps: [],
      finalAnswer: '',
    },
    similarTypes: [],
    keywordsTags: [],
    estimatedTimeMinutes: 5,
    analyzedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Background Job Processor
// ============================================================================

export interface JobUpdateCallback {
  onStatusChange: (status: ProcessingStatus, step: string) => void;
  onProgress: (progress: number) => void;
  onComplete: (result: LLMAnalysisResult[]) => void | Promise<void>;
  onError: (error: string) => void;
  onPartialResult?: (results: LLMAnalysisResult[]) => void; // 문제별 중간 결과
}

/**
 * 업로드 Job 처리 (Background Worker)
 * 1. 파일 타입 감지 (PDF/HWP/IMG)
 * 2. 텍스트/수식 추출
 * 3. LLM으로 505개 성취기준 분류
 * 4. 해설이 없으면 단계별 해설 생성
 * 5. DB(Problems)에 저장
 */
export async function processUploadJob(
  job: UploadJob,
  callbacks: JobUpdateCallback,
  buffers: {
    problem?: ArrayBuffer;
    answer?: ArrayBuffer;
    quickAnswer?: ArrayBuffer;
  }
): Promise<LLMAnalysisResult[]> {
  const results: LLMAnalysisResult[] = [];

  try {
    // Step 1: Main Problem File Processing
    const fileTypeLabel = job.fileType === 'HWP' ? '한글(HWP) → PDF 변환 + OCR' :
      job.fileType === 'PDF' ? 'PDF OCR' : '이미지 OCR';
    callbacks.onStatusChange('OCR_PROCESSING', `${fileTypeLabel} 처리 중...`);

    let ocrResult: OCRResult;
    if (buffers.problem) {
      ocrResult = await processDocument(buffers.problem, job.fileName, callbacks.onProgress);
    } else {
      ocrResult = await processOCR(job.storagePath, callbacks.onProgress);
    }
    console.log(`[Cloud Flow] Extracted ${ocrResult.pages.length} pages from Problem file`);

    // Step 1.1: Process Auxiliary Files (if present)
    let answerText = '';
    let quickAnswerText = '';

    if (buffers.answer) {
      callbacks.onStatusChange('OCR_PROCESSING', `해설지 OCR 처리 중...`);
      const answerResult = await processDocument(buffers.answer, 'answer_sheet.pdf');
      answerText = answerResult.pages.map(p => p.text).join('\n\n');
      console.log(`[Cloud Flow] Extracted Answer Sheet text: ${answerText.length} chars`);
    }

    if (buffers.quickAnswer) {
      callbacks.onStatusChange('OCR_PROCESSING', `빠른 정답지 OCR 처리 중...`);
      const quickResult = await processDocument(buffers.quickAnswer, 'quick_answer.pdf');
      quickAnswerText = quickResult.pages.map(p => p.text).join('\n\n');
      console.log(`[Cloud Flow] Extracted Quick Answer text: ${quickAnswerText.length} chars`);
    }

    // Step 2: 모든 페이지에서 개별 문제 추출
    callbacks.onStatusChange('LLM_ANALYZING', '문제 분리 중...');

    // lines.json 라인 데이터가 있으면 문제별 bbox 그룹화 시도
    const hasLineData = ocrResult.pages.some(p => p.lineData && p.lineData.length > 0);
    const lineBasedQuestions = hasLineData ? groupLinesIntoQuestions(ocrResult.pages) : [];
    console.log(`[Cloud Flow] Line-based question grouping: ${lineBasedQuestions.length} questions found`);

    // 모든 페이지의 텍스트를 합침 (Problem File)
    const fullText = ocrResult.pages.map(p => p.text).join('\n\n');

    // 디버깅: 각 페이지의 텍스트 길이와 처음 200자 확인
    console.log(`[Cloud Flow] OCR Result - ${ocrResult.pages.length} pages`);
    ocrResult.pages.forEach((page, idx) => {
      console.log(`[Cloud Flow] Page ${idx + 1} text length: ${page.text.length}, first 200 chars:`, page.text.substring(0, 200));
    });

    // QuestionParser로 개별 문제 분리
    const parser = getQuestionParser();
    const parsedQuestions = parser.parse({
      text: fullText,
      latex_styled: fullText,
      confidence: ocrResult.confidence,
      request_id: ocrResult.jobId,
    } as MathpixResponse);

    console.log(`[Cloud Flow] QuestionParser found ${parsedQuestions.length} questions`);

    // 문제 분리 우선순위:
    // 1) lineBasedQuestions (lines.json bbox 기반) — 가장 정확, 개별 bbox 포함
    // 2) parsedQuestions (QuestionParser, 전체 텍스트 기반) — bbox 없지만 수식 파싱 정확
    // 3) 페이지 단위 폴백
    // ※ lineBasedQuestions가 더 많은 문제를 찾았으면 그것을 우선 사용
    type QuestionToAnalyze = {
      index: number;
      text: string;
      mathExpressions: string[];
      // bbox 관련 데이터 (lines.json 기반)
      pageIndex?: number;
      bbox?: { x: number; y: number; w: number; h: number };
      contentMmd?: string;  // Mathpix Markdown (수식 인라인)
      choicesFromOCR?: string[];
      // 도형/그래프 감지
      hasFigure?: boolean;
      figureBbox?: { x: number; y: number; w: number; h: number } | null;
    };

    let questionsToAnalyze: QuestionToAnalyze[];

    // lineBasedQuestions가 있고 parsedQuestions보다 많거나 같으면 우선 사용
    // (lines.json 기반이 bbox도 있고 페이지 정보도 정확함)
    if (lineBasedQuestions.length > 0 && lineBasedQuestions.length >= parsedQuestions.length) {
      console.log(`[Cloud Flow] Using lineBasedQuestions (${lineBasedQuestions.length}) over parsedQuestions (${parsedQuestions.length})`);
      questionsToAnalyze = lineBasedQuestions.map((lq, idx) => {
        // parsedQuestions에서 같은 문제 번호의 수식 파싱 보완
        const parsedMatch = parsedQuestions.find(pq => pq.question_number === lq.questionNumber);

        return {
          index: idx,
          text: lq.contentMmd,
          mathExpressions: parsedMatch?.content_latex ? [parsedMatch.content_latex] : [],
          pageIndex: lq.pageIndex,
          bbox: lq.bbox,
          contentMmd: lq.contentMmd,
          choicesFromOCR: validateChoices(
            lq.choices.length > 0 ? lq.choices
              : parsedMatch?.choices?.map(c => `${c.label}) ${c.content_latex}`) || []
          ),
          hasFigure: lq.hasFigure,
          figureBbox: lq.figureBbox,
        };
      });
    } else if (parsedQuestions.length > 0) {
      console.log(`[Cloud Flow] Using parsedQuestions (${parsedQuestions.length}) over lineBasedQuestions (${lineBasedQuestions.length})`);
      questionsToAnalyze = parsedQuestions.map((q: ParsedQuestion, idx: number) => {
        // lineBasedQuestions에서 같은 문제 번호 매칭하여 bbox 가져오기
        const lineMatch = lineBasedQuestions.find(lq => lq.questionNumber === q.question_number);

        return {
          index: idx,
          text: q.raw_text || q.content_latex,
          mathExpressions: q.content_latex ? [q.content_latex] : [],
          pageIndex: lineMatch?.pageIndex,
          bbox: lineMatch?.bbox,
          contentMmd: lineMatch?.contentMmd || q.raw_text,
          choicesFromOCR: validateChoices(
            lineMatch?.choices.length ? lineMatch.choices
              : q.choices?.map(c => `${c.label}) ${c.content_latex}`) || []
          ),
          hasFigure: lineMatch?.hasFigure,
          figureBbox: lineMatch?.figureBbox,
        };
      });
    } else {
      // 둘 다 없으면 페이지 단위 폴백
      console.log('[Cloud Flow] No question parsing succeeded, falling back to page-level analysis');
      questionsToAnalyze = ocrResult.pages.map((page, idx: number) => ({
        index: idx,
        text: page.text,
        mathExpressions: page.mathExpressions.map(m => m.latex),
      }));
    }

    // Step 3: 각 문제에 대해 LLM 분석
    callbacks.onStatusChange('LLM_ANALYZING', `AI 분석 중 (${questionsToAnalyze.length}개 문제)...`);

    for (let i = 0; i < questionsToAnalyze.length; i++) {
      const question = questionsToAnalyze[i];

      // Rate limit 방지: 첫 번째 문제 제외하고 대기 (문제 수에 따라 동적 조절)
      if (i > 0) {
        const delayMs = questionsToAnalyze.length > 5 ? 8000 : 5000; // 문제 6개 이상이면 8초, 아니면 5초
        callbacks.onStatusChange('LLM_ANALYZING', `문제 ${i + 1}/${questionsToAnalyze.length} 대기 중... (Rate Limit 방지)`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      // Step 4: 505개 성취기준 분류 + 해설 매칭
      callbacks.onStatusChange('CLASSIFYING', `문제 ${i + 1}/${questionsToAnalyze.length} - 유형 분류 및 해설 매칭...`);

      // ★ 과목 감지: job.subjectArea 또는 파일명에서 과학 여부 판별
      const jobSubject = job.subjectArea === 'science'
        ? (job.scienceSubject || '과학')
        : (job.subjectArea === 'math' ? '수학' : undefined);
      // 파일명 기반 fallback
      const detectedSubject = jobSubject || (isScienceSubject(job.fileName) ? '과학' : undefined);

      // ★ 학년 힌트: 파일명에서 학년 감지 → 분류 프롬프트에 강제 주입
      const gradeHint = detectGradeFromFileName(job.fileName);
      console.log(`[processUploadJob] subject="${detectedSubject}", gradeHint="${gradeHint}"`);

      const analysis = await analyzeProblemWithLLM(
        question.text,
        question.mathExpressions,
        job.documentType || 'PROBLEM',
        (p) => {
          const baseProgress = 50 + (i / questionsToAnalyze.length) * 40;
          callbacks.onProgress(baseProgress + (p - 50) * 0.4);
        },
        { answer: answerText, quickAnswer: quickAnswerText },
        detectedSubject,
        gradeHint
      );

      // 원본 텍스트를 분석 결과에 포함 (DB 저장 시 content_latex로 사용)
      analysis.originalText = question.text;
      analysis.originalMathExpressions = question.mathExpressions;

      // bbox + 페이지 인덱스 + Mathpix Markdown 콘텐츠 + 선택지 추가
      if (question.pageIndex !== undefined) {
        analysis.pageIndex = question.pageIndex;
      }
      if (question.bbox) {
        analysis.bbox = question.bbox;
      }
      if (question.contentMmd) {
        analysis.contentWithMath = question.contentMmd;
      }
      if (question.choicesFromOCR && question.choicesFromOCR.length > 0) {
        analysis.choices = question.choicesFromOCR;
      }

      // ★ 도형/그래프 감지 정보 저장
      if (question.hasFigure) {
        analysis.hasFigure = true;
        if (question.figureBbox) {
          analysis.figureBbox = question.figureBbox;
        }
        console.log(`[Cloud Flow] Problem ${i + 1}: 도형 포함 문제 (hasFigure=true)`);
      }

      // Step 5: Claude Sonnet 풀이 생성 + GPT-4o 교차검증
      const shouldGenerateSolutions = job.generateSolutions !== false; // 기본값 true
      if (shouldGenerateSolutions && (!analysis.solution.steps || analysis.solution.steps.length === 0)) {
        callbacks.onStatusChange('GENERATING_SOLUTION', `문제 ${i + 1} - Claude Sonnet 해설 생성 중...`);
        await new Promise(resolve => setTimeout(resolve, 3000)); // Rate limit 방지 대기
        const solutionResult = await generateStepByStepSolution(
          question.text,
          question.mathExpressions,
          { onStatusChange: (status, msg) => callbacks.onStatusChange(status as ProcessingStatus, `문제 ${i + 1} - ${msg}`) },
          question.choicesFromOCR || analysis.choices
        );
        // verification 정보 분리
        const { verification, ...solutionOnly } = solutionResult;
        analysis.solution = solutionOnly;
        // 검증 결과를 analysis에 첨부
        if (verification) {
          (analysis as any).verification = verification;
          if (verification.mismatchFlag) {
            console.warn(`[Cloud Flow] ⚠️ 문제 ${i + 1}: 정답 불일치 — Sonnet: "${verification.sonnetAnswer}" vs GPT-4o: "${verification.gptoAnswer}"`);
          }
        }
      } else if (shouldGenerateSolutions && analysis.solution.finalAnswer) {
        // GPT-4o 분류 시 이미 해설이 생성된 경우에도 정답 교차검증 실행
        callbacks.onStatusChange('GENERATING_SOLUTION', `문제 ${i + 1} - 정답 교차검증 중...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        const verification = await verifyAnswerWithGPT(
          question.text,
          analysis.solution.finalAnswer,
          question.mathExpressions,
          question.choicesFromOCR || analysis.choices
        );
        (analysis as any).verification = verification;
        if (verification.mismatchFlag) {
          console.warn(`[Cloud Flow] ⚠️ 문제 ${i + 1}: 정답 불일치 — 기존: "${verification.sonnetAnswer}" vs GPT-4o: "${verification.gptoAnswer}"`);
        }
      } else if (!shouldGenerateSolutions) {
        console.log(`[Cloud Flow] Skipping solution generation for problem ${i + 1} (generateSolutions=false)`);
      }

      results.push(analysis);
      console.log(`[Cloud Flow] Problem ${i + 1}: ${analysis.classification.typeCode} (${analysis.classification.typeName})`);

      // 중간 결과 전달 (실시간 UI 업데이트용)
      if (callbacks.onPartialResult) {
        callbacks.onPartialResult([...results]);
      }
    }

    // Step 6: 완료
    callbacks.onStatusChange('COMPLETED', `${results.length}개 문제 처리 완료`);
    callbacks.onProgress(100);
    await callbacks.onComplete(results);

    return results;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '처리 중 오류 발생';
    callbacks.onStatusChange('FAILED', errorMsg);
    callbacks.onError(errorMsg);
    throw error;
  }
}

/**
 * ★ Claude Sonnet으로 단계별 해설 생성 + GPT-4o 정답 교차검증
 * 기존 GPT-4o 단독 → Sonnet 생성 + GPT-4o 검증 2단계로 개선
 */
async function generateStepByStepSolution(
  problemText: string,
  mathExpressions: string[],
  callbacks?: { onStatusChange?: (status: string, msg: string) => void },
  choices?: string[]
): Promise<StepByStepSolution & { verification?: VerificationResult }> {
  // ★ 선택지가 있으면 프롬프트에 명시적으로 포함
  const validChoices = (choices || []).filter(c => c && c.trim().length > 0);
  const choicesSection = validChoices.length > 0
    ? `\n\n[선택지]\n${validChoices.map((c, i) => `${['①','②','③','④','⑤'][i] || `(${i+1})`} ${c.replace(/^[①②③④⑤]\s*/, '')}`).join('\n')}`
    : '';
  const isObjective = validChoices.length > 0;

  const SOLUTION_PROMPT = `당신은 한국 수학 시중 교재의 해설지를 집필하는 전문가입니다.
학생이 혼자 읽고 완전히 이해할 수 있도록 **교재 해설지 스타일**로 풀이를 작성하세요.

문제:
${problemText}
${mathExpressions.length > 0 ? `수식: ${mathExpressions.join(', ')}` : ''}${choicesSection}

★ 작성 규칙:
1. **개념 정리**: 이 문제를 풀기 위해 필요한 핵심 개념/공식을 1~2줄로 먼저 제시
2. **풀이 과정**: 교재처럼 자연스러운 서술체로 작성 (번호 매기되, "~이므로", "~에 의해", "따라서" 등 접속사 활용)
3. **수식 표기**: LaTeX 수식을 단계마다 포함. 중간 계산을 절대 생략하지 마세요
4. **최종 답**: finalAnswer를 반드시 명시 (빈 문자열 절대 불가)
${isObjective ? `5. finalAnswer에 정답 번호(④ 또는 4 등) 반드시 포함` : `5. 주관식이면 최종 수치/식을 정확히 제시하세요`}

다음 JSON 형식으로만 응답하세요. 설명 텍스트 없이 JSON만 출력하세요:
{
  "concept": "핵심 개념/공식 요약 (1~2줄)",
  "approach": "풀이 전략 (한 문장)",
  "steps": [
    { "stepNumber": 1, "description": "교재 서술체로 풀이 과정 (수식 포함하여 자연스럽게)", "latex": "핵심 수식 (있으면)" }
  ],
  "finalAnswer": "최종 정답 (예: ④, 24, x=3 등) — 반드시 작성",
  "tip": "이 유형 문제를 풀 때 핵심 포인트 또는 학생이 자주 하는 실수 (1줄)"
}`;

  try {
    // ── Step 1: Claude Sonnet으로 풀이 생성 ──
    console.log('[Cloud Flow] 🧠 Generating solution with Claude Sonnet...');
    const response = await callClaude(SOLUTION_PROMPT, {
      systemMessage: SOLUTION_SYSTEM_MESSAGE,
      temperature: 0.2,
    });

    let jsonStr = response;
    if (response.includes('```json')) {
      jsonStr = response.split('```json')[1].split('```')[0].trim();
    } else if (response.includes('```')) {
      jsonStr = response.split('```')[1].split('```')[0].trim();
    }
    jsonStr = sanitizeJsonString(jsonStr);

    let solution: StepByStepSolution;
    try {
      solution = JSON.parse(jsonStr);
    } catch {
      const aggressiveSanitized = jsonStr.replace(/\\/g, '\\\\');
      try {
        solution = JSON.parse(aggressiveSanitized);
      } catch {
        console.error('[Cloud Flow] Sonnet solution JSON parse failed. Raw:', jsonStr.substring(0, 200));
        throw new Error('Solution JSON parse failed');
      }
    }

    // ── Step 2: GPT-4o로 정답 교차검증 ──
    console.log('[Cloud Flow] 🔍 Verifying answer with GPT-4o...');
    callbacks?.onStatusChange?.('VERIFYING_ANSWER', '정답 교차검증 중...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Rate limit 방지

    const verification = await verifyAnswerWithGPT(
      problemText,
      solution.finalAnswer || '',
      mathExpressions,
      choices
    );

    // 검증 결과를 solution에 첨부
    return {
      ...solution,
      verification,
    };
  } catch (error) {
    console.error('[Cloud Flow] Solution generation failed:', error);
    return {
      approach: '자동 생성 실패 - 수동 입력 필요',
      steps: [],
      finalAnswer: '',
      commonMistakes: [],
      verification: { verified: false, gptoAnswer: '', sonnetAnswer: '', mismatchFlag: true },
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function simulateProcessing(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getStatusLabel(status: ProcessingStatus): string {
  const labels: Record<ProcessingStatus, string> = {
    PENDING: '대기 중',
    UPLOADING: '업로드 중',
    OCR_PROCESSING: 'OCR 변환 중',
    LLM_ANALYZING: 'AI 분석 중',
    CLASSIFYING: '유형 분류 중',
    GENERATING_SOLUTION: '해설 생성 중',
    VERIFYING_ANSWER: '정답 검증 중',
    COMPLETED: '완료',
    FAILED: '실패',
  };
  return labels[status];
}

export function getStatusColor(status: ProcessingStatus): string {
  const colors: Record<ProcessingStatus, string> = {
    PENDING: '#6b7280',
    UPLOADING: '#3b82f6',
    OCR_PROCESSING: '#8b5cf6',
    LLM_ANALYZING: '#f59e0b',
    CLASSIFYING: '#10b981',
    GENERATING_SOLUTION: '#06b6d4',
    VERIFYING_ANSWER: '#f97316',
    COMPLETED: '#22c55e',
    FAILED: '#ef4444',
  };
  return colors[status];
}
