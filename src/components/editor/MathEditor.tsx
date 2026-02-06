'use client';

// ============================================================================
// Math Editor Component (메인 에디터) - Tailwind CSS
// ============================================================================

import React, { useState, useCallback, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';

import { MathInline, MathBlock } from './extensions/math-extension';
import MathEditorToolbar from './MathEditorToolbar';
import GraphModal from './modals/GraphModal';
import MathSymbolPicker from './modals/MathSymbolPicker';

import type { MathEditorProps, EditorContent as EditorContentType, GraphExpression } from '@/types/editor';

const MathEditor: React.FC<MathEditorProps> = ({
  initialContent = '',
  onChange,
  onSave,
  readOnly = false,
  placeholder = '문제를 입력하세요... (수식: Ctrl+M, 블록 수식: Ctrl+Shift+M)',
  minHeight = '200px',
  maxHeight = '600px',
  className = '',
}) => {
  const [isGraphModalOpen, setIsGraphModalOpen] = useState(false);
  const [isSymbolPickerOpen, setIsSymbolPickerOpen] = useState(false);

  // Tiptap 에디터 설정
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Subscript,
      Superscript,
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder,
      }),
      MathInline,
      MathBlock,
    ],
    content: initialContent,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      if (onChange) {
        const content = getEditorContent(editor);
        onChange(content);
      }
    },
  });

  // 에디터 콘텐츠 추출
  const getEditorContent = useCallback((editorInstance: typeof editor): EditorContentType => {
    if (!editorInstance) {
      return { html: '', latex: '', text: '', json: {} };
    }

    const html = editorInstance.getHTML();
    const text = editorInstance.getText();
    const json = editorInstance.getJSON();

    // LaTeX 추출 (mathInline, mathBlock 노드에서)
    const latexParts: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extractLatex = (node: any) => {
      if (node?.type === 'mathInline' || node?.type === 'mathBlock') {
        if (node?.attrs?.latex) {
          latexParts.push(node.attrs.latex);
        }
      }
      if (node?.content && Array.isArray(node.content)) {
        node.content.forEach((child: unknown) => extractLatex(child));
      }
    };
    extractLatex(json);

    return {
      html,
      latex: latexParts.join('\n'),
      text,
      json: json as Record<string, unknown>,
    };
  }, []);

  // 저장 단축키 (Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (onSave && editor) {
          onSave(getEditorContent(editor));
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editor, onSave, getEditorContent]);

  // 그래프 삽입 핸들러
  const handleGraphInsert = useCallback(
    (imageDataUrl: string, expressions: GraphExpression[]) => {
      if (!editor) return;

      editor
        .chain()
        .focus()
        .setImage({ src: imageDataUrl })
        .run();

      const expressionText = expressions.map((e) => e.latex).join(', ');
      console.log('Graph expressions:', expressionText);
    },
    [editor]
  );

  // 기호 삽입 핸들러
  const handleSymbolInsert = useCallback(
    (latex: string) => {
      if (!editor) return;
      editor.chain().focus().insertMathInline(latex).run();
    },
    [editor]
  );

  return (
    <div
      className={`
        flex flex-col
        border border-gray-200 rounded-xl
        overflow-hidden bg-white shadow-soft
        ${className}
      `}
    >
      {/* 툴바 */}
      {!readOnly && (
        <MathEditorToolbar
          editor={editor}
          onOpenGraphModal={() => setIsGraphModalOpen(true)}
          onOpenSymbolPicker={() => setIsSymbolPickerOpen(true)}
        />
      )}

      {/* 에디터 본문 */}
      <div
        className="prose-editor overflow-y-auto p-5 scrollbar-thin"
        style={{ minHeight, maxHeight }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* 상태 바 */}
      {!readOnly && editor && (
        <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
          <span className="px-2 py-0.5 bg-gray-200 rounded">
            {editor.storage.characterCount?.characters?.() ?? 0} 자
          </span>
          <span className="px-2 py-0.5 bg-gray-200 rounded">
            {editor.storage.characterCount?.words?.() ?? 0} 단어
          </span>
          <span className="ml-auto text-gray-400">
            Ctrl+M: 인라인 수식 | Ctrl+Shift+M: 블록 수식 | Ctrl+S: 저장
          </span>
        </div>
      )}

      {/* 그래프 모달 */}
      <GraphModal
        isOpen={isGraphModalOpen}
        onClose={() => setIsGraphModalOpen(false)}
        onInsert={handleGraphInsert}
      />

      {/* 기호 선택기 */}
      <MathSymbolPicker
        isOpen={isSymbolPickerOpen}
        onClose={() => setIsSymbolPickerOpen(false)}
        onSelect={handleSymbolInsert}
      />
    </div>
  );
};

export default MathEditor;
