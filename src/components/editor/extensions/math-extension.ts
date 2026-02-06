// ============================================================================
// Tiptap Math Extension (KaTeX 기반)
// ============================================================================

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import MathNodeView from '../nodes/MathNodeView';

export interface MathOptions {
  /** 인라인 수식 구분자 */
  inlineDelimiters: [string, string];
  /** 블록 수식 구분자 */
  blockDelimiters: [string, string];
  /** KaTeX 옵션 */
  katexOptions: {
    throwOnError: boolean;
    errorColor: string;
    macros: Record<string, string>;
  };
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mathInline: {
      /** 인라인 수식 삽입 */
      insertMathInline: (latex: string) => ReturnType;
      /** 수식 수정 */
      updateMath: (latex: string) => ReturnType;
    };
    mathBlock: {
      /** 블록 수식 삽입 */
      insertMathBlock: (latex: string) => ReturnType;
    };
    graph: {
      /** 그래프 삽입 */
      insertGraph: (attrs: { expressions: unknown[]; imageUrl: string; settings: unknown }) => ReturnType;
    };
  }
}

/**
 * 인라인 수식 노드 ($ ... $)
 */
export const MathInline = Node.create<MathOptions>({
  name: 'mathInline',

  group: 'inline',

  inline: true,

  atom: true,

  addOptions() {
    return {
      inlineDelimiters: ['$', '$'],
      blockDelimiters: ['$$', '$$'],
      katexOptions: {
        throwOnError: false,
        errorColor: '#ef4444',
        macros: {
          '\\RR': '\\mathbb{R}',
          '\\NN': '\\mathbb{N}',
          '\\ZZ': '\\mathbb{Z}',
          '\\QQ': '\\mathbb{Q}',
          '\\CC': '\\mathbb{C}',
        },
      },
    };
  },

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-latex') || '',
        renderHTML: (attributes) => ({
          'data-latex': attributes.latex,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="math-inline"]',
      },
      {
        tag: 'span.math-inline',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'math-inline',
        class: 'math-inline',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },

  addCommands() {
    return {
      insertMathInline:
        (latex: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { latex },
          });
        },
      updateMath:
        (latex: string) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { latex });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Ctrl/Cmd + M: 인라인 수식 삽입
      'Mod-m': () => {
        // 선택된 텍스트가 있으면 수식으로 변환
        const { from, to } = this.editor.state.selection;
        const text = this.editor.state.doc.textBetween(from, to);

        if (text) {
          return this.editor.commands.insertMathInline(text);
        }

        // 선택된 텍스트 없으면 빈 수식 삽입
        return this.editor.commands.insertMathInline('');
      },
    };
  },
});

/**
 * 블록 수식 노드 ($$ ... $$)
 */
export const MathBlock = Node.create<MathOptions>({
  name: 'mathBlock',

  group: 'block',

  atom: true,

  addOptions() {
    return {
      inlineDelimiters: ['$', '$'],
      blockDelimiters: ['$$', '$$'],
      katexOptions: {
        throwOnError: false,
        errorColor: '#ef4444',
        macros: {},
      },
    };
  },

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-latex') || '',
        renderHTML: (attributes) => ({
          'data-latex': attributes.latex,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="math-block"]',
      },
      {
        tag: 'div.math-display',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'math-block',
        class: 'math-block',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },

  addCommands() {
    return {
      insertMathBlock:
        (latex: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { latex },
          });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Ctrl/Cmd + Shift + M: 블록 수식 삽입
      'Mod-Shift-m': () => {
        return this.editor.commands.insertMathBlock('');
      },
    };
  },
});

/**
 * 그래프 노드
 */
export const GraphNode = Node.create({
  name: 'graph',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      expressions: {
        default: [],
        parseHTML: (element) => {
          const data = element.getAttribute('data-expressions');
          return data ? JSON.parse(data) : [];
        },
        renderHTML: (attributes) => ({
          'data-expressions': JSON.stringify(attributes.expressions),
        }),
      },
      imageUrl: {
        default: null,
      },
      settings: {
        default: {
          xAxisRange: [-10, 10],
          yAxisRange: [-10, 10],
          showGrid: true,
          showAxes: true,
          width: 400,
          height: 300,
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="graph"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'graph',
        class: 'graph-container',
      }),
    ];
  },

  addCommands() {
    return {
      insertGraph:
        (attrs: { expressions: unknown[]; imageUrl: string; settings: unknown }) =>
        ({ commands }) => {
          return commands.insertContent({
            type: 'graph',
            attrs,
          });
        },
    };
  },
});
