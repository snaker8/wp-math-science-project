// ============================================================================
// OCR Pipeline Type Definitions
// ============================================================================

/**
 * Mathpix API 요청 옵션
 */
export interface MathpixRequestOptions {
  src: string; // base64 data URL or URL
  formats: ('text' | 'data' | 'html' | 'latex_styled')[];
  data_options?: {
    include_asciimath?: boolean;
    include_latex?: boolean;
    include_mathml?: boolean;
    include_svg?: boolean;
    include_table_html?: boolean;
  };
  include_line_data?: boolean;
  include_word_data?: boolean;
}

/**
 * Mathpix API 응답 - Line Data
 */
export interface MathpixLineData {
  type: 'text' | 'math' | 'table';
  value: string;
  latex?: string;
  cnt?: number[]; // bounding box coordinates
}

/**
 * Mathpix API 응답
 */
export interface MathpixResponse {
  request_id: string;
  text: string;
  latex_styled?: string;
  data?: MathpixLineData[];
  html?: string;
  confidence?: number;
  confidence_rate?: number;
  error?: string;
  error_info?: {
    id: string;
    message: string;
  };
}

/**
 * 파싱된 보기 (선택지)
 */
export interface ParsedChoice {
  label: string; // "1", "2", "3", "4", "5" 또는 "ㄱ", "ㄴ", "ㄷ"
  content_latex: string;
}

/**
 * 파싱된 문제
 */
export interface ParsedQuestion {
  question_number: number;
  content_latex: string;
  choices: ParsedChoice[];
  has_image: boolean;
  image_urls: string[];
  raw_text: string;
  confidence: number;
}

/**
 * OCR 파이프라인 결과
 */
export interface OCRPipelineResult {
  success: boolean;
  source_file_id?: string;
  questions: ParsedQuestion[];
  total_questions: number;
  processing_time_ms: number;
  mathpix_request_id?: string;
  errors: OCRError[];
  warnings: string[];
}

/**
 * OCR 에러
 */
export interface OCRError {
  code: string;
  message: string;
  question_number?: number;
  details?: unknown;
}

/**
 * LaTeX 검증 결과
 */
export interface LaTeXValidationResult {
  is_valid: boolean;
  normalized_latex: string;
  issues: LaTeXIssue[];
}

/**
 * LaTeX 이슈
 */
export interface LaTeXIssue {
  type: 'warning' | 'error';
  message: string;
  position?: number;
  original: string;
  suggested?: string;
}

/**
 * 문제 저장 요청
 */
export interface SaveProblemRequest {
  institute_id: string;
  created_by: string;
  source_file_id: string;
  questions: ParsedQuestion[];
}

/**
 * 문제 저장 결과
 */
export interface SaveProblemResult {
  success: boolean;
  saved_count: number;
  problem_ids: string[];
  errors: Array<{
    question_number: number;
    error: string;
  }>;
}

/**
 * 파일 업로드 메타데이터
 */
export interface FileUploadMetadata {
  file_name: string;
  file_type: 'PDF' | 'IMG' | 'HWP';
  file_size_bytes: number;
  mime_type: string;
  page_count?: number;
}
