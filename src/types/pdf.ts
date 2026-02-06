// ============================================================================
// PDF Generation Types
// ============================================================================

export interface PDFProblem {
  id: string;
  number: number;
  content: string;        // HTML content
  points?: number;        // 배점
  type?: string;          // 문제 유형
}

export interface PDFExamConfig {
  // 기본 정보
  title: string;
  subtitle?: string;
  instituteName?: string;
  instituteLogo?: string;  // Base64 or URL
  date?: string;

  // 응시자 정보 필드
  showNameField: boolean;
  showClassField: boolean;
  showScoreField: boolean;

  // 레이아웃 설정
  layout: 'single' | 'two-column';
  problemSpacing: number;   // 문제 간격 (px)
  fontSize: number;         // 기본 글자 크기 (pt)

  // 워터마크
  watermark: {
    enabled: boolean;
    text?: string;
    image?: string;         // Base64 or URL
    opacity: number;        // 0-1
  };

  // 페이지 설정
  pageSize: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };

  // 추가 옵션
  showProblemPoints: boolean;
  showProblemNumbers: boolean;
  showAnswerSheet: boolean;  // 별도 답안지 페이지 생성
}

export const DEFAULT_PDF_CONFIG: PDFExamConfig = {
  title: '수학 평가',
  instituteName: '',
  date: new Date().toLocaleDateString('ko-KR'),

  showNameField: true,
  showClassField: true,
  showScoreField: true,

  layout: 'two-column',
  problemSpacing: 24,
  fontSize: 11,

  watermark: {
    enabled: false,
    opacity: 0.1,
  },

  pageSize: 'A4',
  orientation: 'portrait',
  margin: {
    top: 20,
    right: 15,
    bottom: 20,
    left: 15,
  },

  showProblemPoints: true,
  showProblemNumbers: true,
  showAnswerSheet: false,
};
