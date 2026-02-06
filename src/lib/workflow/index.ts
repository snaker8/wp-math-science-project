// ============================================================================
// Workflow Library Export
// 수작(Suzag) 완전학습 사이클 유틸리티
// ============================================================================

// Cloud Flow (업로드 → OCR → LLM 분류/해설)
export {
  processOCR,
  processDocument,
  detectFileType,
  analyzeProblemWithLLM,
  processUploadJob,
  getStatusLabel,
  getStatusColor,
  MATH_TYPE_HIERARCHY,
  type JobUpdateCallback,
  type FileType,
} from './cloud-flow';

// HWP Processor (한글 파일 처리)
export {
  parseHWPFile,
  convertHWPToOCRResult,
  processHWPWithPython,
  convertHWPEquationToLatex,
  type HWPParseResult,
  type HWPParagraph,
  type HWPEquation,
} from './hwp-processor';

// Deep Grading (4단계 정밀 채점)
export {
  GRADING_WEIGHTS,
  GRADING_LABELS,
  GRADING_COLORS,
  GRADING_ICONS,
  calculateMastery,
  aggregateByType,
  extractWrongProblems,
  subscribeToGradingEvents,
  emitGradingEvent,
  getGradingStatusFromScore,
  formatMasteryPercentage,
  getMasteryColor,
  type MasteryCalculation,
  type TypeMastery,
  type WrongProblem,
  type GradingEventType,
  type GradingEvent,
} from './deep-grading';

// Twin Problem Generator (쌍둥이 문제 생성)
export {
  generateTwinProblem,
  generateTwinProblems,
  generateTwinWithLLM,
  analyzeLatexStructure,
  extractNumbers,
  varyNumber,
  varyConditions,
  type TwinGenerationOptions,
  type LatexStructure,
  type NumberMatch,
} from './twin-generator';

// Clinic Exam (클리닉 시험지 PDF)
export {
  createClinicExamData,
  generateClinicPdfHtml,
  generateClinicPdf,
  createClinicExam,
  type ClinicExamProblem,
  type ClinicExamData,
} from './clinic-exam';
