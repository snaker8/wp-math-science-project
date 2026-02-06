'use client';

// ============================================================================
// Math Editor Toolbar Component
// ============================================================================

import React, { useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Image,
  Table,
  Code,
  Superscript,
  Subscript,
  Divide,
  PiSquare,
  LineChart,
  Sigma,
  ChevronDown,
} from 'lucide-react';

interface MathEditorToolbarProps {
  editor: Editor | null;
  onOpenGraphModal: () => void;
  onOpenSymbolPicker: () => void;
}

const MathEditorToolbar: React.FC<MathEditorToolbarProps> = ({
  editor,
  onOpenGraphModal,
  onOpenSymbolPicker,
}) => {
  const [showMathMenu, setShowMathMenu] = useState(false);

  if (!editor) return null;

  // 빠른 수식 삽입
  const quickMathInserts = [
    { label: '분수', latex: '\\frac{a}{b}', icon: '𝑎/𝑏' },
    { label: '제곱근', latex: '\\sqrt{x}', icon: '√' },
    { label: '거듭제곱', latex: 'x^{n}', icon: 'xⁿ' },
    { label: '아래첨자', latex: 'x_{n}', icon: 'xₙ' },
    { label: '적분', latex: '\\int_{a}^{b}', icon: '∫' },
    { label: '합', latex: '\\sum_{i=1}^{n}', icon: 'Σ' },
    { label: '극한', latex: '\\lim_{x \\to a}', icon: 'lim' },
  ];

  const insertMathInline = (latex: string) => {
    editor.chain().focus().insertMathInline(latex).run();
    setShowMathMenu(false);
  };

  const insertMathBlock = (latex: string) => {
    editor.chain().focus().insertMathBlock(latex).run();
    setShowMathMenu(false);
  };

  return (
    <div className="math-editor-toolbar">
      {/* 기본 서식 */}
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`}
          title="굵게 (Ctrl+B)"
        >
          <Bold size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`}
          title="기울임 (Ctrl+I)"
        >
          <Italic size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`toolbar-btn ${editor.isActive('underline') ? 'active' : ''}`}
          title="밑줄 (Ctrl+U)"
        >
          <Underline size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`toolbar-btn ${editor.isActive('strike') ? 'active' : ''}`}
          title="취소선"
        >
          <Strikethrough size={16} />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* 위첨자/아래첨자 */}
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
          className={`toolbar-btn ${editor.isActive('superscript') ? 'active' : ''}`}
          title="위첨자"
        >
          <Superscript size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleSubscript().run()}
          className={`toolbar-btn ${editor.isActive('subscript') ? 'active' : ''}`}
          title="아래첨자"
        >
          <Subscript size={16} />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* 수학 도구 */}
      <div className="toolbar-group math-tools">
        {/* 인라인 수식 */}
        <button
          onClick={() => editor.chain().focus().insertMathInline('').run()}
          className="toolbar-btn math-btn"
          title="인라인 수식 삽입 (Ctrl+M)"
        >
          <span className="math-icon">$x$</span>
        </button>

        {/* 블록 수식 */}
        <button
          onClick={() => editor.chain().focus().insertMathBlock('').run()}
          className="toolbar-btn math-btn"
          title="블록 수식 삽입 (Ctrl+Shift+M)"
        >
          <span className="math-icon">$$</span>
        </button>

        {/* 빠른 수식 메뉴 */}
        <div className="toolbar-dropdown">
          <button
            onClick={() => setShowMathMenu(!showMathMenu)}
            className={`toolbar-btn dropdown-trigger ${showMathMenu ? 'active' : ''}`}
            title="빠른 수식"
          >
            <Sigma size={16} />
            <ChevronDown size={12} />
          </button>

          {showMathMenu && (
            <div className="dropdown-menu">
              <div className="dropdown-header">빠른 수식 삽입</div>
              {quickMathInserts.map((item) => (
                <button
                  key={item.latex}
                  onClick={() => insertMathInline(item.latex)}
                  className="dropdown-item"
                >
                  <span className="dropdown-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
              <div className="dropdown-divider" />
              <button onClick={onOpenSymbolPicker} className="dropdown-item">
                <PiSquare size={14} />
                <span>전체 기호 보기...</span>
              </button>
            </div>
          )}
        </div>

        {/* 기호 선택기 */}
        <button
          onClick={onOpenSymbolPicker}
          className="toolbar-btn"
          title="수학 기호 삽입"
        >
          <PiSquare size={16} />
        </button>

        {/* 그래프 도구 */}
        <button
          onClick={onOpenGraphModal}
          className="toolbar-btn graph-btn"
          title="그래프 삽입"
        >
          <LineChart size={16} />
          <span className="btn-label">그래프</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* 목록 */}
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`toolbar-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
          title="글머리 기호 목록"
        >
          <List size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`toolbar-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
          title="번호 매기기 목록"
        >
          <ListOrdered size={16} />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* 정렬 */}
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          className={`toolbar-btn ${editor.isActive({ textAlign: 'left' }) ? 'active' : ''}`}
          title="왼쪽 정렬"
        >
          <AlignLeft size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          className={`toolbar-btn ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`}
          title="가운데 정렬"
        >
          <AlignCenter size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          className={`toolbar-btn ${editor.isActive({ textAlign: 'right' }) ? 'active' : ''}`}
          title="오른쪽 정렬"
        >
          <AlignRight size={16} />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* 이미지/테이블 */}
      <div className="toolbar-group">
        <button
          onClick={() => {
            const url = window.prompt('이미지 URL을 입력하세요:');
            if (url) {
              editor.chain().focus().setImage({ src: url }).run();
            }
          }}
          className="toolbar-btn"
          title="이미지 삽입"
        >
          <Image size={16} />
        </button>
        <button
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
          className="toolbar-btn"
          title="표 삽입"
        >
          <Table size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={`toolbar-btn ${editor.isActive('codeBlock') ? 'active' : ''}`}
          title="코드 블록"
        >
          <Code size={16} />
        </button>
      </div>

      <div className="toolbar-spacer" />

      {/* 실행 취소/다시 실행 */}
      <div className="toolbar-group">
        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="toolbar-btn"
          title="실행 취소 (Ctrl+Z)"
        >
          <Undo size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="toolbar-btn"
          title="다시 실행 (Ctrl+Y)"
        >
          <Redo size={16} />
        </button>
      </div>

      <style jsx>{`
        .math-editor-toolbar {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          background-color: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
          gap: 4px;
          flex-wrap: wrap;
        }

        .toolbar-group {
          display: flex;
          align-items: center;
          gap: 2px;
        }

        .toolbar-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 8px;
          background: none;
          border: none;
          border-radius: 6px;
          color: #4b5563;
          cursor: pointer;
          transition: all 0.15s;
        }

        .toolbar-btn:hover {
          background-color: #e5e7eb;
          color: #111827;
        }

        .toolbar-btn.active {
          background-color: #e0e7ff;
          color: #4f46e5;
        }

        .toolbar-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .toolbar-btn.math-btn {
          font-family: 'Times New Roman', serif;
          font-style: italic;
        }

        .math-icon {
          font-size: 14px;
          font-weight: 500;
        }

        .toolbar-btn.graph-btn {
          padding: 6px 12px;
          background-color: #eef2ff;
          color: #4f46e5;
        }

        .toolbar-btn.graph-btn:hover {
          background-color: #e0e7ff;
        }

        .btn-label {
          font-size: 12px;
          font-weight: 500;
        }

        .toolbar-divider {
          width: 1px;
          height: 24px;
          background-color: #e5e7eb;
          margin: 0 8px;
        }

        .toolbar-spacer {
          flex: 1;
        }

        .toolbar-dropdown {
          position: relative;
        }

        .dropdown-trigger {
          gap: 2px;
        }

        .dropdown-menu {
          position: absolute;
          top: 100%;
          left: 0;
          margin-top: 4px;
          min-width: 180px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
          z-index: 100;
          overflow: hidden;
        }

        .dropdown-header {
          padding: 8px 12px;
          font-size: 11px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          background-color: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }

        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 12px;
          font-size: 13px;
          color: #374151;
          background: none;
          border: none;
          text-align: left;
          cursor: pointer;
          transition: background-color 0.15s;
        }

        .dropdown-item:hover {
          background-color: #f3f4f6;
        }

        .dropdown-icon {
          width: 24px;
          text-align: center;
          font-size: 16px;
          color: #6366f1;
        }

        .dropdown-divider {
          height: 1px;
          background-color: #e5e7eb;
          margin: 4px 0;
        }
      `}</style>
    </div>
  );
};

export default MathEditorToolbar;
