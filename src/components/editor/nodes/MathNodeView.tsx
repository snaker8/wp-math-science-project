'use client';

// ============================================================================
// Math Node View Component (KaTeX 렌더링) - Tailwind CSS
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import katex from 'katex';

const MathNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  selected,
  extension,
}) => {
  const latexValue = (node.attrs.latex as string) || '';
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(latexValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const renderRef = useRef<HTMLSpanElement>(null);

  // display 모드 확인 (블록 수식 여부)
  const isDisplay = extension.name === 'mathBlock';

  // KaTeX 렌더링
  const renderMath = useCallback((latex: string) => {
    if (!renderRef.current) return;

    try {
      katex.render(latex || '\\text{수식을 입력하세요}', renderRef.current, {
        displayMode: isDisplay,
        throwOnError: false,
        errorColor: '#ef4444',
        macros: {
          '\\RR': '\\mathbb{R}',
          '\\NN': '\\mathbb{N}',
          '\\ZZ': '\\mathbb{Z}',
          '\\QQ': '\\mathbb{Q}',
          '\\CC': '\\mathbb{C}',
        },
        trust: true,
        strict: false,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'LaTeX 렌더링 오류');
    }
  }, [isDisplay]);

  // 초기 렌더링 및 latex 변경 시 재렌더링
  useEffect(() => {
    if (!isEditing) {
      renderMath(latexValue);
    }
  }, [latexValue, isEditing, renderMath]);

  // 편집 모드 시작
  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
    setEditValue(latexValue);
  }, [latexValue]);

  // 편집 모드에서 포커스
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 편집 완료
  const handleBlur = useCallback(() => {
    updateAttributes({ latex: editValue });
    setIsEditing(false);
  }, [editValue, updateAttributes]);

  // 키보드 이벤트
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleBlur();
    }
    if (e.key === 'Escape') {
      setEditValue(latexValue);
      setIsEditing(false);
    }
  }, [handleBlur, latexValue]);

  // 실시간 미리보기
  useEffect(() => {
    if (isEditing && renderRef.current) {
      renderMath(editValue);
    }
  }, [editValue, isEditing, renderMath]);

  // 컨테이너 클래스
  const containerClasses = isDisplay
    ? `flex flex-col items-center p-4 my-3 bg-gray-50 rounded-lg border transition-all
       ${selected ? 'bg-primary-50 border-primary-500' : 'border-gray-200 hover:bg-gray-100 hover:border-gray-300'}`
    : `inline-flex items-center px-0.5 rounded transition-colors
       ${selected ? 'bg-primary-100 outline outline-2 outline-primary-500 outline-offset-1' : 'hover:bg-gray-100'}`;

  return (
    <NodeViewWrapper className={containerClasses} data-display={isDisplay}>
      {isEditing ? (
        <div className="w-full flex flex-col gap-3">
          {/* LaTeX 입력 영역 */}
          <div className="w-full">
            <textarea
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="
                w-full p-3 font-mono text-sm leading-relaxed
                border-2 border-primary-500 rounded-md
                bg-white text-gray-800
                resize-y outline-none
                focus:border-primary-600 focus:ring-2 focus:ring-primary-100
                placeholder:text-gray-400
              "
              placeholder="LaTeX 수식 입력..."
              rows={isDisplay ? 3 : 1}
            />
            <div className="mt-1 text-[11px] text-gray-500">
              Enter: 저장 | Esc: 취소 | Shift+Enter: 줄바꿈
            </div>
          </div>

          {/* 실시간 미리보기 */}
          <div className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-md">
            <span className="text-xs text-gray-500 shrink-0">미리보기:</span>
            <span
              ref={renderRef}
              className={`flex-1 min-h-[24px] ${error ? 'text-red-500' : ''}`}
            />
          </div>

          {error && (
            <div className="px-3 py-2 text-xs text-red-500 bg-red-50 border border-red-200 rounded">
              {error}
            </div>
          )}
        </div>
      ) : (
        <span
          ref={renderRef}
          className={`cursor-pointer ${!node.attrs.latex ? 'text-gray-400 italic' : ''}`}
          onDoubleClick={handleDoubleClick}
          title="더블클릭하여 수정"
        />
      )}
    </NodeViewWrapper>
  );
};

export default MathNodeView;
