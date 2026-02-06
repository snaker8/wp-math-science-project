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
import { parseQuestions } from '@/lib/ocr/question-parser';

// ============================================================================
// Configuration
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = 'gpt-4o';
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

    // Mathpix 미설정 시 Mock 데이터 반환
    if (error instanceof MathpixError || (error instanceof Error && error.message.includes('not configured'))) {
      console.log('[Cloud Flow] Mathpix not configured, using mock data');
      return createMockPDFResult(jobId);
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

    // Mathpix 미설정 시 Mock 데이터 반환
    if (error instanceof MathpixError || (error instanceof Error && error.message.includes('not configured'))) {
      console.log('[Cloud Flow] Mathpix not configured, using mock data');
      return createMockImageResult(jobId);
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
  // Simulate OCR processing
  if (onProgress) onProgress(10);

  // TODO: 실제 OCR API 연동 (Mathpix, Google Vision 등)
  await simulateProcessing(2000);
  if (onProgress) onProgress(30);

  // Mock OCR result
  const mockOCRResult: OCRResult = {
    jobId: crypto.randomUUID(),
    pages: [
      {
        pageNumber: 1,
        text: '다음 이차방정식을 풀이하시오.\n\\( x^2 - 5x + 6 = 0 \\)',
        mathExpressions: [
          {
            latex: 'x^2 - 5x + 6 = 0',
            boundingBox: { x: 100, y: 200, width: 300, height: 50 },
            confidence: 0.95,
          },
        ],
        images: [],
        confidence: 0.92,
      },
    ],
    rawText: '다음 이차방정식을 풀이하시오. x² - 5x + 6 = 0',
    confidence: 0.92,
    processedAt: new Date().toISOString(),
  };

  if (onProgress) onProgress(50);
  return mockOCRResult;
}

// ============================================================================
// LLM Analysis (GPT-4o)
// ============================================================================

const CLASSIFICATION_PROMPT = `당신은 수학 문제 분류 전문가입니다. 주어진 수학 문제를 분석하여 다음 정보를 JSON 형태로 반환해주세요:

1. 유형 분류 (3,569개 유형 체계 기준):
   - typeCode: 유형 코드 (예: MA-HS1-ALG-01-003)
   - typeName: 유형 이름
   - subject: 과목 (수학I, 수학II, 미적분, 확률과 통계, 기하)
   - chapter: 대단원
   - section: 중단원
   - difficulty: 난이도 (1-5)
   - cognitiveDomain: 인지 영역 (CALCULATION, UNDERSTANDING, INFERENCE, PROBLEM_SOLVING)

2. 단계별 풀이:
   - approach: 풀이 접근법
   - steps: 각 단계별 설명과 LaTeX 수식
   - finalAnswer: 최종 답
   - commonMistakes: 자주 하는 실수들

3. 메타데이터:
   - prerequisites: 선수 지식 유형 코드들
   - estimatedTimeMinutes: 예상 풀이 시간
   - keywordsTags: 키워드 태그들

문제:
{PROBLEM_TEXT}

JSON 형식으로 응답해주세요.`;

export async function analyzeProblemWithLLM(
  problemText: string,
  mathExpressions: string[],
  onProgress?: (progress: number) => void
): Promise<LLMAnalysisResult> {
  if (onProgress) onProgress(55);

  const fullProblemText = `${problemText}\n\n수식: ${mathExpressions.join(', ')}`;

  try {
    // GPT-4o API 호출
    const response = await callOpenAI(
      CLASSIFICATION_PROMPT.replace('{PROBLEM_TEXT}', fullProblemText)
    );

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

async function callOpenAI(prompt: string): Promise<string> {
  // 실제 OpenAI API 호출
  if (!OPENAI_API_KEY) {
    console.log('[Cloud Flow] OpenAI API key not configured, using mock response');
    return getMockLLMResponse();
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: '당신은 한국 고등학교 수학 교육 전문가입니다. 정확한 분류와 상세한 풀이를 제공합니다.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
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

function parseAnalysisResponse(response: string): LLMAnalysisResult {
  try {
    // JSON 추출 (마크다운 코드 블록 처리)
    let jsonStr = response;
    if (response.includes('```json')) {
      jsonStr = response.split('```json')[1].split('```')[0].trim();
    } else if (response.includes('```')) {
      jsonStr = response.split('```')[1].split('```')[0].trim();
    }

    const parsed = JSON.parse(jsonStr);

    return {
      problemId: crypto.randomUUID(),
      classification: {
        typeCode: parsed.classification.typeCode,
        typeName: parsed.classification.typeName,
        subject: parsed.classification.subject,
        chapter: parsed.classification.chapter,
        section: parsed.classification.section,
        subSection: parsed.classification.subSection,
        difficulty: parsed.classification.difficulty,
        cognitiveDomain: parsed.classification.cognitiveDomain,
        confidence: parsed.classification.confidence || 0.8,
        prerequisites: parsed.classification.prerequisites || [],
      },
      solution: {
        approach: parsed.solution.approach,
        steps: parsed.solution.steps,
        finalAnswer: parsed.solution.finalAnswer,
        alternativeMethods: parsed.solution.alternativeMethods,
        commonMistakes: parsed.solution.commonMistakes,
      },
      similarTypes: parsed.metadata?.similarTypes || [],
      keywordsTags: parsed.metadata?.keywordsTags || [],
      estimatedTimeMinutes: parsed.metadata?.estimatedTimeMinutes || 5,
      analyzedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Failed to parse LLM response:', error);
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
  fileBuffer?: ArrayBuffer
): Promise<LLMAnalysisResult[]> {
  const results: LLMAnalysisResult[] = [];

  try {
    // Step 1: 파일 타입에 따른 텍스트/수식 추출
    const fileTypeLabel = job.fileType === 'HWP' ? 'HWP 파싱' :
                          job.fileType === 'PDF' ? 'PDF OCR' : '이미지 OCR';
    callbacks.onStatusChange('OCR_PROCESSING', `${fileTypeLabel} 처리 중...`);

    let ocrResult: OCRResult;

    if (fileBuffer) {
      // 파일 버퍼가 있으면 통합 처리 함수 사용
      ocrResult = await processDocument(fileBuffer, job.fileName, callbacks.onProgress);
    } else {
      // 레거시: storagePath 기반 처리
      ocrResult = await processOCR(job.storagePath, callbacks.onProgress);
    }

    console.log(`[Cloud Flow] Extracted ${ocrResult.pages.length} pages from ${job.fileName}`);

    // Step 2: 각 페이지/문제에 대해 LLM 분석
    callbacks.onStatusChange('LLM_ANALYZING', 'AI 분석 중 (GPT-4o)...');

    for (let i = 0; i < ocrResult.pages.length; i++) {
      const page = ocrResult.pages[i];

      // Step 3: 3,569개 유형 중 하나로 분류
      callbacks.onStatusChange('CLASSIFYING', `문제 ${i + 1}/${ocrResult.pages.length} - 유형 분류 중...`);

      const mathExpressions = page.mathExpressions.map((m) => m.latex);
      const analysis = await analyzeProblemWithLLM(
        page.text,
        mathExpressions,
        (p) => {
          const baseProgress = 50 + (i / ocrResult.pages.length) * 40;
          callbacks.onProgress(baseProgress + (p - 50) * 0.4);
        }
      );

      // Step 4: 해설이 없으면 생성
      if (!analysis.solution.steps || analysis.solution.steps.length === 0) {
        callbacks.onStatusChange('GENERATING_SOLUTION', `문제 ${i + 1} - 해설 생성 중...`);
        const solutionResult = await generateStepByStepSolution(page.text, mathExpressions);
        analysis.solution = solutionResult;
      }

      results.push(analysis);
      console.log(`[Cloud Flow] Problem ${i + 1}: ${analysis.classification.typeCode} (${analysis.classification.typeName})`);
    }

    // Step 5: 완료
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
    return JSON.parse(jsonStr);
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
