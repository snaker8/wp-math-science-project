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

// 3,569개 유형 분류 시스템
export interface TypeClassification {
  typeCode: string; // e.g., "MA-HS1-ALG-01-003"
  typeName: string;
  subject: string; // 수학I, 수학II, 미적분, 확률과 통계, 기하
  chapter: string; // 대단원
  section: string; // 중단원
  subSection?: string; // 소단원
  difficulty: 1 | 2 | 3 | 4 | 5;
  cognitiveDomain: 'CALCULATION' | 'UNDERSTANDING' | 'INFERENCE' | 'PROBLEM_SOLVING';
  confidence: number; // AI 신뢰도 0-1
  prerequisites: string[]; // 선수 유형 코드들
}

export interface LLMAnalysisResult {
  problemId: string;
  originalText?: string;      // OCR 추출 원본 텍스트
  originalMathExpressions?: string[]; // OCR 추출 수식
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
