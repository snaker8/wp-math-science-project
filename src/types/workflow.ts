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
  | 'VERIFYING_ANSWER'
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
  bookGroupId?: string | null;  // ★ 클라우드 북그룹 ID (자산화 시 사용)
  appendToExamId?: string;       // ★ 기존 시험지에 병합 (문제 추가 기능)
  subjectArea?: 'math' | 'science';  // ★ 과목 영역 (수학/과학)
  scienceSubject?: string;           // ★ 과학 세부 과목 코드 (ScienceSubjectCode)
  curriculumVersion?: '2015' | '2022'; // ★ 교육과정 버전
  // ★ 사용자 명시 출처 카테고리 — 자산화 시 자동 태깅 override (사용자 지시 2026-05-16)
  sourceCategory?: 'auto' | 'school' | 'diagnostic' | 'textbook' | 'mock';
  // ★ 학교 기출 단원집 메타 (2026-05-28) — sourceCategory='school' 일 때 폴더 업로드가 채움.
  //   부분 누락 허용: 빈 필드는 title 기반 자동 추출로 fallback.
  schoolMeta?: SchoolMetaInput;
  // ★ 단원집 일련번호 모드 (2026-05-29) — 분할 자산화 시 각 청크가 OCR 번호를 1부터 재시작해
  //   source_number 가 중복되는 문제 차단. true 면 source_number/source_label 을 시험지 내 누적
  //   순번(exam_problems.sequence_number 와 동일)으로 부여 → 1~N 연속. 폴더 import 가 설정.
  useSequenceNumbering?: boolean;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/**
 * 학교 기출 단원집 자산화 시 폴더/사용자 입력으로 전달되는 메타.
 * 모든 필드 optional — 빈 필드는 자동 추출 fallback.
 */
export interface SchoolMetaInput {
  /** 학교명 raw (예: "동래중학교"). DB 저장 직전 normalizeSchoolName() 적용. */
  schoolName?: string;
  /** 학년 표기 — "중2" / "고1" 등. exams.grade 컬럼에 그대로 박힘. */
  grade?: string;
  /** "부산 동래구" 같은 시도+시군구 조합. */
  district?: string;
  /** 1 또는 2. */
  semester?: 1 | 2;
  /** 4자리 년도 (2026). 파일명 YYMMDD prefix 에서 자동 추출 가능. */
  examYear?: number;
  /** "중간" / "기말" / "단원집" / "수행평가". */
  examRound?: string;
  /** 단원명 (예: "방정식"). 단원집 PDF 전용. */
  chapter?: string;
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

// 505개 교육과정 성취기준 기반 분류 시스템 (다사람수학)
export interface TypeClassification {
  typeCode: string; // e.g., "MA-HS1-ALG-01-003"
  typeName: string;
  subject: string; // 수학I, 수학II, 미적분, 확률과 통계, 기하
  scienceSubject?: string; // 과학 과목 (PHY, CHE, BIO, EAR — math 외 트랙)
  chapter: string; // 대단원
  section: string; // 중단원
  subSection?: string; // 소단원
  difficulty: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10; // 수학비서 1~10 스케일
  cognitiveDomain: 'CALCULATION' | 'UNDERSTANDING' | 'INFERENCE' | 'PROBLEM_SOLVING';
  confidence: number; // AI 신뢰도 0-1
  prerequisites: string[]; // 선수 유형 코드들
  /** Phase C-1b: 학생 함정 유형 자동 추출 — caller가 problem_pitfalls INSERT용으로 활용 */
  pitfalls?: Array<{ code: string; confidence: number; reason?: string }>;
}

export interface LLMAnalysisResult {
  problemId: string;
  problemNumber?: number;      // 문제 번호 (1-based)
  originalText?: string;      // OCR 추출 원본 텍스트
  originalMathExpressions?: string[]; // OCR 추출 수식
  contentWithMath?: string;   // Mathpix Markdown (수식 $...$ 인라인 포함)
  contentMmd?: string;        // Mathpix Markdown 원본 (도형 마커 [도형] 포함)
  choices?: string[];         // 선택지 배열 (수식 포함)
  choiceLayout?: number;      // ★ 원본 보기 배치 감지값 (1=세로/2=2열/3=3열/5=가로). 자산화·수정모달 기본값용.
  choiceImages?: (string | null)[]; // 선택지별 이미지 URL (그림 객관식). choices와 인덱스 정렬.
  pageIndex?: number;         // PDF 페이지 인덱스 (0-based)
  bbox?: { x: number; y: number; w: number; h: number }; // 문제 영역 bbox (비율 0~1)
  hasFigure?: boolean;        // 도형/다이어그램 포함 여부
  figureBbox?: { x: number; y: number; w: number; h: number } | null; // 도형 영역 bbox
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
  choices: string[];           // ★ 객관식 선택지
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
