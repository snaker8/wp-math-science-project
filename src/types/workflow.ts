// ============================================================================
// Workflow Types - 과사람 완전학습 사이클 타입 정의
// ============================================================================

// ============================================================================
// 1. Cloud Flow Types (업로드 → 자산화)
// ============================================================================

export type ProcessingStatus =
  | 'PENDING'
  | 'UPLOADING'
  | 'OCR_PROCESSING'
  | 'LLM_ANALYZING'
  | 'CLASSIFYING'
  | 'GENERATING_SOLUTION'
  | 'COMPLETED'
  | 'FAILED';

export interface UploadJob {
  id: string;
  userId: string;
  instituteId: string;
  fileName: string;
  fileSize: number;
  fileType: 'PDF' | 'IMG' | 'HWP';
  documentType: 'PROBLEM' | 'ANSWER' | 'QUICK_ANSWER';
  storagePath: string;
  status: ProcessingStatus;
  progress: number; // 0-100
  currentStep: string;
  autoClassify?: boolean;
  generateSolutions?: boolean;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface OCRResult {
  jobId: string;
  pages: OCRPage[];
  rawText: string;
  confidence: number;
  processedAt: string;
}

export interface OCRPage {
  pageNumber: number;
  text: string;
  mathExpressions: MathExpression[];
  images: ExtractedImage[];
  confidence: number;
  // Mathpix lines.json 원본 데이터 (bbox 추출용)
  lineData?: import('@/types/ocr').MathpixLine[];
  pageWidth?: number;
  pageHeight?: number;
}

export interface MathExpression {
  latex: string;
  boundingBox: BoundingBox;
  confidence: number;
}

export interface ExtractedImage {
  id: string;
  url: string;
  boundingBox: BoundingBox;
  type: 'figure' | 'graph' | 'table' | 'diagram';
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 분류 시스템 (505개 성취기준 → 1,139+ 세부유형)
export interface TypeClassification {
  typeCode: string; // e.g., "MA-HS0-POL-01-001"
  expandedTypeCode?: string; // expanded_math_types FK (새 코드 체계)
  typeName: string;
  subject: string; // 수학, 수학I, 미적분, 확률과 통계, 기하
  chapter: string; // 대단원 (= area)
  section: string; // 중단원 (= standard_code)
  subSection?: string; // 소단원
  difficulty: 1 | 2 | 3 | 4 | 5;
  cognitiveDomain: 'CALCULATION' | 'UNDERSTANDING' | 'INFERENCE' | 'PROBLEM_SOLVING';
  confidence: number; // AI 신뢰도 0-1
  prerequisites: string[]; // 선수 유형 코드들
  standardCode?: string; // 성취기준 코드 (예: [10수학01-01])
  standardContent?: string; // 성취기준 내용
  solutionMethod?: string; // 풀이 접근법
}

export interface LLMAnalysisResult {
  problemId: string;
  originalText?: string;      // OCR 추출 원본 텍스트
  originalMathExpressions?: string[]; // OCR 추출 수식
  contentWithMath?: string;   // Mathpix Markdown (수식 $...$ 인라인 포함)
  choices?: string[];         // 선택지 배열 (수식 포함)
  pageIndex?: number;         // PDF 페이지 인덱스 (0-based)
  bbox?: { x: number; y: number; w: number; h: number }; // 문제 영역 bbox (비율 0~1)
  classification: TypeClassification;
  solution: StepByStepSolution;
  similarTypes: string[]; // 유사 유형 코드들
  keywordsTags: string[];
  estimatedTimeMinutes: number;
  analyzedAt: string;
}

export interface StepByStepSolution {
  approach: string; // 풀이 접근법
  steps: SolutionStep[];
  finalAnswer: string;
  alternativeMethods?: string[]; // 다른 풀이법
  commonMistakes?: string[]; // 자주 하는 실수
}

export interface SolutionStep {
  stepNumber: number;
  description: string;
  latex: string;
  explanation: string;
}

// ============================================================================
// 2. Deep Grading Types (4단계 정밀 진단)
// ============================================================================

export type GradingStatus = 'CORRECT' | 'PARTIAL_CORRECT' | 'PARTIAL_WRONG' | 'WRONG';

export interface GradingRecord {
  id: string;
  examId: string;
  studentId: string;
  problemId: string;
  gradedBy: string; // 강사 ID
  status: GradingStatus;
  score: number; // 가중치 점수 (100, 70, 30, 0)
  feedback?: string;
  timeSpentSeconds?: number;
  gradedAt: string;
}

export interface ExamSession {
  id: string;
  title: string;
  classId: string;
  createdBy: string;
  problems: string[]; // problem IDs
  students: string[]; // student IDs
  status: 'DRAFT' | 'IN_PROGRESS' | 'GRADING' | 'COMPLETED';
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

export interface StudentAnswer {
  id: string;
  examId: string;
  studentId: string;
  problemId: string;
  answerText?: string;
  answerLatex?: string;
  answerImage?: string; // 스캔된 답안 이미지
  submittedAt: string;
}

// ============================================================================
// 3. Zero-Wrong Loop Types (오답 제로 루프)
// ============================================================================

export interface TwinProblem {
  id: string;
  originalProblemId: string;
  originalTypeCode: string;
  contentLatex: string;
  contentHtml: string;
  solutionLatex: string;
  solutionHtml: string;
  answer: string;
  modifications: ProblemModification[];
  generatedAt: string;
  generatedFor: string; // 학생 ID
}

export interface ProblemModification {
  type: 'NUMBER' | 'COEFFICIENT' | 'CONDITION' | 'CONTEXT';
  original: string;
  modified: string;
  location: string; // LaTeX 위치
}

export interface ClinicExam {
  id: string;
  studentId: string;
  title: string;
  originalExamId?: string;
  wrongProblemIds: string[]; // 원본 오답 문제들
  twinProblemIds: string[]; // 생성된 쌍둥이 문제들
  status: 'GENERATED' | 'ASSIGNED' | 'COMPLETED';
  pdfUrl?: string;
  createdAt: string;
  completedAt?: string;
}

// ============================================================================
// Workflow State (전체 플로우 상태)
// ============================================================================

export interface WorkflowState {
  currentPhase: 'UPLOAD' | 'GRADING' | 'ANALYSIS' | 'CLINIC';
  uploadJobs: UploadJob[];
  activeExams: ExamSession[];
  pendingGradings: GradingRecord[];
  generatedClinics: ClinicExam[];
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface UploadRequest {
  file: File;
  instituteId: string;
  userId: string;
  options?: {
    autoClassify: boolean;
    generateSolutions: boolean;
  };
}

export interface GradingRequest {
  examId: string;
  studentId: string;
  problemId: string;
  status: GradingStatus;
  feedback?: string;
}

export interface TwinGenerationRequest {
  studentId: string;
  wrongProblemIds: string[];
  options?: {
    difficultyAdjustment: -1 | 0 | 1; // 난이도 조절
    variationCount: number; // 변형 개수
  };
}

export interface ClinicExamRequest {
  studentId: string;
  twinProblemIds: string[];
  title: string;
  includeOriginals: boolean;
}
