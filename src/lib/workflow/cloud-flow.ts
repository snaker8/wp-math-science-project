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
import type { MathpixResponse, ParsedQuestion } from '@/types/ocr';

// ============================================================================
// Configuration
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const HWP_PYTHON_API = process.env.HWP_PYTHON_API || '/api/hwp/parse';

// 3,569개 유형 분류 체계 (요약)
export const MATH_TYPE_HIERARCHY = {
  subjects: [
    { code: 'MA-HS1', name: '수학I', chapters: 12 },
    { code: 'MA-HS2', name: '수학II', chapters: 10 },
    { code: 'MA-CAL', name: '미적분', chapters: 8 },
    { code: 'MA-PRB', name: '확률과 통계', chapters: 6 },
    { code: 'MA-GEO', name: '기하', chapters: 5 },
  ],
  totalTypes: 3569,
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

/**
 * HWP 파일 처리
 */
async function processHWPDocument(
  fileBuffer: ArrayBuffer,
  jobId: string,
  onProgress?: (progress: number) => void
): Promise<OCRResult> {
  if (onProgress) onProgress(10);

  let hwpResult: HWPParseResult;

  try {
    // 먼저 Python API 서비스 시도 (더 정확한 파싱)
    hwpResult = await processHWPWithPython(fileBuffer, HWP_PYTHON_API);
  } catch {
    // 폴백: 클라이언트 사이드 파싱
    console.log('[Cloud Flow] Python HWP API unavailable, using client-side parsing');
    hwpResult = await parseHWPFile(fileBuffer);
  }

  if (onProgress) onProgress(40);

  // HWP 결과를 OCR 형식으로 변환
  const ocrResult = convertHWPToOCRResult(hwpResult, jobId);

  if (onProgress) onProgress(50);

  return ocrResult;
}

/**
 * PDF 파일 처리 (OCR 포함)
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

    // 응답을 OCRResult 형식으로 변환
    const pages: OCRPage[] = responses.map((response, idx) => {
      const parsedQuestions = parseQuestions(response);
      const mathExpressions = parsedQuestions.flatMap(q =>
        q.content_latex ? [{
          latex: q.content_latex,
          boundingBox: { x: 0, y: 0, width: 0, height: 0 },
          confidence: q.confidence,
        }] : []
      );

      return {
        pageNumber: idx + 1,
        text: response.text || response.latex_styled || '',
        mathExpressions,
        images: [],
        confidence: response.confidence || 0.9,
      };
    });

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
    // API 설정 오류는 상세히 로깅
    if (error instanceof MathpixError) {
      console.error('[Cloud Flow] Mathpix API Error:', error.code, error.details);
    }
    throw error;
  }
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

const CLASSIFICATION_PROMPT = `당신은 수학 문제 분류 전문가입니다. 주어진 수학 문제를 분석하여 **반드시 아래의 정확한 JSON 구조**로만 응답해주세요. 키 이름을 변경하지 마세요.

{
  "classification": {
    "typeCode": "MA-HS1-ALG-01-003",
    "typeName": "유형 이름",
    "subject": "수학I 또는 수학II 또는 미적분 또는 확률과 통계 또는 기하",
    "chapter": "대단원명",
    "section": "중단원명",
    "difficulty": 3,
    "cognitiveDomain": "CALCULATION 또는 UNDERSTANDING 또는 INFERENCE 또는 PROBLEM_SOLVING",
    "confidence": 0.85,
    "prerequisites": []
  },
  "solution": {
    "approach": "풀이 접근법",
    "steps": [
      {"stepNumber": 1, "description": "설명", "latex": "수식", "explanation": "상세설명"}
    ],
    "finalAnswer": "최종 답",
    "commonMistakes": ["흔한 실수"]
  },
  "metadata": {
    "estimatedTimeMinutes": 5,
    "keywordsTags": ["키워드"],
    "similarTypes": []
  }
}

중요: 위 JSON 키 이름(classification, solution, metadata, typeCode, typeName 등)을 정확히 사용하세요. 한글 키 이름을 사용하지 마세요.

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

export async function analyzeProblemWithLLM(
  problemText: string,
  mathExpressions: string[],
  documentType: 'PROBLEM' | 'ANSWER' | 'QUICK_ANSWER' = 'PROBLEM',
  onProgress?: (progress: number) => void,
  referenceTexts: { answer?: string; quickAnswer?: string } = {}
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
    // GPT-4o API 호출
    let prompt = CLASSIFICATION_PROMPT;
    if (documentType === 'ANSWER') prompt = ANSWER_PROMPT;
    if (documentType === 'QUICK_ANSWER') prompt = QUICK_ANSWER_PROMPT;

    const finalPrompt = prompt
      .replace('{PROBLEM_TEXT}', fullProblemText)
      .replace('{REFERENCE_TEXT}', referenceText);

    const response = await callOpenAI(finalPrompt);

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

async function callOpenAI(prompt: string, retries = 6, backoff = 5000, model?: string): Promise<string> {
  // 실제 OpenAI API 호출
  if (!OPENAI_API_KEY) {
    throw new Error('[Cloud Flow] OpenAI API key not configured. Set OPENAI_API_KEY in .env');
  }

  const currentModel = model || OPENAI_MODEL;

  try {
    console.log(`[Cloud Flow] Calling OpenAI with model: ${currentModel}`);
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
            content: '당신은 한국 고등학교 수학 교육 전문가입니다. 반드시 유효한 JSON으로만 응답하세요. 설명 텍스트 없이 JSON만 출력하세요. 키 이름은 영문 camelCase를 사용하세요.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      // 429 Rate Limit 처리
      if (response.status === 429 && retries > 0) {
        // Retry-After 헤더가 있으면 그 값을 사용, 없으면 backoff 사용
        const retryAfterHeader = response.headers.get('Retry-After');
        const waitTime = retryAfterHeader
          ? Math.max(parseInt(retryAfterHeader, 10) * 1000, backoff)
          : backoff;

        // 재시도 3회 이하 남으면 gpt-4o-mini로 폴백
        let nextModel = currentModel;
        if (retries <= 3 && currentModel !== 'gpt-4o-mini') {
          nextModel = 'gpt-4o-mini';
          console.warn(`[Cloud Flow] Falling back to ${nextModel} due to rate limits`);
        }

        console.warn(`[Cloud Flow] OpenAI 429 Rate Limit. Retrying in ${waitTime}ms with ${nextModel}... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return callOpenAI(prompt, retries - 1, backoff * 2, nextModel);
      }
      throw new Error(`OpenAI API error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    // 네트워크 에러 등도 재시도
    if (retries > 0 && error instanceof Error && error.message.includes('429')) {
      let nextModel = currentModel;
      if (retries <= 3 && currentModel !== 'gpt-4o-mini') {
        nextModel = 'gpt-4o-mini';
        console.warn(`[Cloud Flow] Falling back to ${nextModel} due to rate limits`);
      }
      console.warn(`[Cloud Flow] OpenAI 429 Rate Limit (Exception). Retrying in ${backoff}ms with ${nextModel}... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return callOpenAI(prompt, retries - 1, backoff * 2, nextModel);
    }
    throw error;
  }
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
        // 3차 시도: 백슬래시를 모두 제거하고 파싱
        console.warn('[Cloud Flow] Aggressive sanitization failed, trying backslash removal');
        const noBackslash = jsonStr.replace(/\\/g, '');
        try {
          parsed = JSON.parse(noBackslash);
        } catch {
          // 최종 실패 — 원래 에러를 throw
          throw firstError;
        }
      }
    }

    // GPT 응답 구조를 유연하게 추출
    const cls = extractClassification(parsed);
    const sol = extractSolution(parsed);
    const meta = extractMetadata(parsed);

    console.log(`[Cloud Flow] Parsed classification keys: ${Object.keys(cls).join(', ')}`);
    console.log(`[Cloud Flow] Parsed solution keys: ${Object.keys(sol).join(', ')}`);

    return {
      problemId: crypto.randomUUID(),
      classification: {
        typeCode: cls.typeCode || cls.type_code || 'MA-UNKNOWN-001',
        typeName: cls.typeName || cls.type_name || cls['유형이름'] || '미분류',
        subject: cls.subject || cls['과목'] || '수학',
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
  onComplete: (result: LLMAnalysisResult[]) => void;
  onError: (error: string) => void;
}

/**
 * 업로드 Job 처리 (Background Worker)
 * 1. 파일 타입 감지 (PDF/HWP/IMG)
 * 2. 텍스트/수식 추출
 * 3. LLM으로 3,569개 유형 분류
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
    const fileTypeLabel = job.fileType === 'HWP' ? 'HWP 파싱' :
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

    // 모든 페이지의 텍스트를 합침 (Problem File)
    const fullText = ocrResult.pages.map(p => p.text).join('\n\n');

    // QuestionParser로 개별 문제 분리
    const parser = getQuestionParser();
    const parsedQuestions = parser.parse({
      text: fullText,
      latex_styled: fullText,
      confidence: ocrResult.confidence,
      request_id: ocrResult.jobId,
    } as MathpixResponse);

    console.log(`[Cloud Flow] QuestionParser found ${parsedQuestions.length} questions`);

    // 파싱된 문제가 없으면 페이지 단위로 폴백
    type QuestionToAnalyze = { index: number; text: string; mathExpressions: string[] };
    const questionsToAnalyze: QuestionToAnalyze[] = parsedQuestions.length > 0
      ? parsedQuestions.map((q: ParsedQuestion, idx: number) => ({
        index: idx,
        text: q.raw_text || q.content_latex,
        mathExpressions: q.content_latex ? [q.content_latex] : [],
      }))
      : ocrResult.pages.map((page, idx: number) => ({
        index: idx,
        text: page.text,
        mathExpressions: page.mathExpressions.map(m => m.latex),
      }));

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

      // Step 4: 3,569개 유형 중 하나로 분류 + 해설 매칭
      callbacks.onStatusChange('CLASSIFYING', `문제 ${i + 1}/${questionsToAnalyze.length} - 유형 분류 및 해설 매칭...`);

      const analysis = await analyzeProblemWithLLM(
        question.text,
        question.mathExpressions,
        job.documentType || 'PROBLEM',
        (p) => {
          const baseProgress = 50 + (i / questionsToAnalyze.length) * 40;
          callbacks.onProgress(baseProgress + (p - 50) * 0.4);
        },
        { answer: answerText, quickAnswer: quickAnswerText }
      );

      // 원본 텍스트를 분석 결과에 포함 (DB 저장 시 content_latex로 사용)
      analysis.originalText = question.text;
      analysis.originalMathExpressions = question.mathExpressions;

      // Step 5: 해설이 없으면 생성 (generateSolutions 옵션이 true인 경우에만)
      const shouldGenerateSolutions = job.generateSolutions !== false; // 기본값 true
      if (shouldGenerateSolutions && (!analysis.solution.steps || analysis.solution.steps.length === 0)) {
        callbacks.onStatusChange('GENERATING_SOLUTION', `문제 ${i + 1} - AI 해설 생성 중...`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Rate limit 방지 대기
        const solutionResult = await generateStepByStepSolution(question.text, question.mathExpressions);
        analysis.solution = solutionResult;
      } else if (!shouldGenerateSolutions) {
        console.log(`[Cloud Flow] Skipping solution generation for problem ${i + 1} (generateSolutions=false)`);
      }

      results.push(analysis);
      console.log(`[Cloud Flow] Problem ${i + 1}: ${analysis.classification.typeCode} (${analysis.classification.typeName})`);
    }

    // Step 6: 완료
    callbacks.onStatusChange('COMPLETED', `${results.length}개 문제 처리 완료`);
    callbacks.onProgress(100);
    callbacks.onComplete(results);

    return results;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '처리 중 오류 발생';
    callbacks.onStatusChange('FAILED', errorMsg);
    callbacks.onError(errorMsg);
    throw error;
  }
}

/**
 * 해설이 없는 문제에 대해 단계별 해설 생성
 */
async function generateStepByStepSolution(
  problemText: string,
  mathExpressions: string[]
): Promise<StepByStepSolution> {
  const SOLUTION_PROMPT = `당신은 수학 교사입니다. 다음 문제의 단계별 풀이를 작성해주세요.

문제: ${problemText}
수식: ${mathExpressions.join(', ')}

다음 JSON 형식으로 응답해주세요:
{
  "approach": "풀이 접근법",
  "steps": [
    { "stepNumber": 1, "description": "설명", "latex": "수식", "explanation": "상세 설명" }
  ],
  "finalAnswer": "최종 답",
  "commonMistakes": ["흔한 실수들"]
}`;

  try {
    const response = await callOpenAI(SOLUTION_PROMPT);
    let jsonStr = response;
    if (response.includes('```json')) {
      jsonStr = response.split('```json')[1].split('```')[0].trim();
    } else if (response.includes('```')) {
      jsonStr = response.split('```')[1].split('```')[0].trim();
    }
    jsonStr = sanitizeJsonString(jsonStr);
    try {
      return JSON.parse(jsonStr);
    } catch {
      // 폴백: aggressive 백슬래시 처리
      const aggressiveSanitized = jsonStr.replace(/\\/g, '\\\\');
      try {
        return JSON.parse(aggressiveSanitized);
      } catch {
        return JSON.parse(jsonStr.replace(/\\/g, ''));
      }
    }
  } catch {
    return {
      approach: '자동 생성 실패',
      steps: [],
      finalAnswer: '',
      commonMistakes: [],
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
    COMPLETED: '#22c55e',
    FAILED: '#ef4444',
  };
  return colors[status];
}
