// ============================================================================
// Math Editor Type Definitions
// ============================================================================

import type { Editor } from '@tiptap/react';

/**
 * 에디터 Props
 */
export interface MathEditorProps {
  /** 초기 콘텐츠 (LaTeX 포함 HTML 또는 순수 LaTeX) */
  initialContent?: string;
  /** 콘텐츠 변경 콜백 */
  onChange?: (content: EditorContent) => void;
  /** 저장 콜백 */
  onSave?: (content: EditorContent) => void;
  /** 읽기 전용 모드 */
  readOnly?: boolean;
  /** 플레이스홀더 */
  placeholder?: string;
  /** 최소 높이 */
  minHeight?: string;
  /** 최대 높이 */
  maxHeight?: string;
  /** 클래스명 */
  className?: string;
}

/**
 * 에디터 콘텐츠
 */
export interface EditorContent {
  /** HTML 형식 */
  html: string;
  /** LaTeX 형식 (수식 부분만) */
  latex: string;
  /** 순수 텍스트 */
  text: string;
  /** JSON 형식 (tiptap) */
  json: Record<string, unknown>;
}

/**
 * 수학 노드 속성
 */
export interface MathNodeAttrs {
  /** LaTeX 코드 */
  latex: string;
  /** 디스플레이 모드 (블록) 여부 */
  display: boolean;
}

/**
 * 그래프 노드 속성
 */
export interface GraphNodeAttrs {
  /** 함수식 목록 */
  expressions: GraphExpression[];
  /** 이미지 URL (렌더링된 그래프) */
  imageUrl?: string;
  /** 그래프 설정 */
  settings: GraphSettings;
}

/**
 * 그래프 표현식
 */
export interface GraphExpression {
  id: string;
  latex: string;
  color?: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineWidth?: number;
  hidden?: boolean;
}

/**
 * 그래프 설정
 */
export interface GraphSettings {
  /** X축 범위 */
  xAxisRange: [number, number];
  /** Y축 범위 */
  yAxisRange: [number, number];
  /** 격자 표시 */
  showGrid: boolean;
  /** 축 표시 */
  showAxes: boolean;
  /** 너비 */
  width: number;
  /** 높이 */
  height: number;
}

/**
 * 툴바 버튼 정의
 */
export interface ToolbarButton {
  id: string;
  icon: React.ReactNode;
  label: string;
  action: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
  disabled?: (editor: Editor) => boolean;
}

/**
 * 수학 기호 카테고리
 */
export interface MathSymbolCategory {
  name: string;
  symbols: MathSymbol[];
}

/**
 * 수학 기호
 */
export interface MathSymbol {
  latex: string;
  display: string;
  description: string;
}

/**
 * Desmos Calculator State
 */
export interface DesmosState {
  expressions: {
    list: Array<{
      id: string;
      type: string;
      latex?: string;
      color?: string;
    }>;
  };
  graph: {
    viewport: {
      xmin: number;
      xmax: number;
      ymin: number;
      ymax: number;
    };
  };
}
