// ============================================================================
// OCR Library - Barrel Export
// ============================================================================

// Mathpix Client
export { getMathpixClient, MathpixClient, MathpixError } from './mathpix';

// LaTeX Validator
export {
  getLatexValidator,
  LaTeXValidator,
  validateLatex,
  extractMathExpressions,
  latexToHtml,
} from './latex-validator';

// Question Parser
export {
  getQuestionParser,
  QuestionParser,
  parseQuestions,
  extractBogi,
  detectQuestionType,
} from './question-parser';

// Types
export type {
  MathpixRequestOptions,
  MathpixLineData,
  MathpixResponse,
  ParsedChoice,
  ParsedQuestion,
  OCRPipelineResult,
  OCRError,
  LaTeXValidationResult,
  LaTeXIssue,
  SaveProblemRequest,
  SaveProblemResult,
  FileUploadMetadata,
} from '@/types/ocr';
