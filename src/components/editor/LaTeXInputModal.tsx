'use client';

// ============================================================================
// LaTeX 수식 입력 모달
// 레퍼런스 5번 사진: LaTeX 직접 입력 + KaTeX 실시간 프리뷰
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import katex from 'katex';

interface LaTeXInputModalProps {
  initialLatex?: string;
  onInsert: (latex: string, options: { displayStyle: boolean; block: boolean }) => void;
  onCancel: () => void;
  onRemoveMath?: () => void; // 수식 해제
}

export function LaTeXInputModal({
  initialLatex = '',
  onInsert,
  onCancel,
  onRemoveMath,
}: LaTeXInputModalProps) {
  const [latex, setLatex] = useState(initialLatex);
  const [displayStyle, setDisplayStyle] = useState(true);
  const [block, setBlock] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 자동 포커스
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // ESC로 닫기
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleInsert();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latex, displayStyle, block]);

  // KaTeX 실시간 프리뷰
  useEffect(() => {
    if (!latex.trim()) {
      setPreviewHtml('');
      setPreviewError(null);
      return;
    }

    try {
      const html = katex.renderToString(latex, {
        throwOnError: false,
        displayMode: displayStyle,
        trust: true,
        strict: false,
      });
      setPreviewHtml(html);
      setPreviewError(null);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : '수식 오류');
    }
  }, [latex, displayStyle]);

  const handleInsert = () => {
    onInsert(latex, { displayStyle, block });
  };

  // 자주 사용하는 수식 기호 빠른 입력
  const quickSymbols = [
    { label: '분수', latex: '\\frac{a}{b}' },
    { label: '제곱', latex: 'x^{2}' },
    { label: '아래첨자', latex: 'x_{n}' },
    { label: '루트', latex: '\\sqrt{x}' },
    { label: '합', latex: '\\sum_{i=1}^{n}' },
    { label: '적분', latex: '\\int_{a}^{b}' },
    { label: '극한', latex: '\\lim_{x \\to \\infty}' },
    { label: '≤', latex: '\\leq' },
    { label: '≥', latex: '\\geq' },
    { label: '≠', latex: '\\neq' },
    { label: 'α', latex: '\\alpha' },
    { label: 'β', latex: '\\beta' },
    { label: 'π', latex: '\\pi' },
    { label: '∞', latex: '\\infty' },
    { label: '±', latex: '\\pm' },
    { label: '×', latex: '\\times' },
  ];

  const insertSymbol = (sym: string) => {
    const textarea = inputRef.current;
    if (!textarea) {
      setLatex(prev => prev + sym);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = latex.slice(0, start) + sym + latex.slice(end);
    setLatex(newValue);

    // 커서 위치 조정
    setTimeout(() => {
      textarea.focus();
      const newPos = start + sym.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* 배경 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      {/* 모달 */}
      <div className="relative z-10 w-[560px] max-h-[80vh] rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
          <h3 className="text-base font-bold text-white">수식 입력하기</h3>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 프리뷰 영역 */}
        <div className="border-b border-zinc-800 px-5 py-4">
          <div className="min-h-[48px] flex items-center justify-center rounded-xl border border-zinc-700 bg-white px-4 py-3">
            {previewError ? (
              <span className="text-sm text-red-500">{previewError}</span>
            ) : previewHtml ? (
              <div
                className="text-gray-900"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <span className="text-sm text-gray-400 italic">수식을 입력하세요...</span>
            )}
          </div>
        </div>

        {/* 옵션 */}
        <div className="flex items-center gap-6 px-5 py-2.5 border-b border-zinc-800/50">
          <span className="text-xs text-zinc-500 font-medium">LaTeX</span>
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={displayStyle}
              onChange={(e) => setDisplayStyle(e.target.checked)}
              className="w-3.5 h-3.5 accent-cyan-500 rounded"
            />
            displaystyle 적용
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={block}
              onChange={(e) => setBlock(e.target.checked)}
              className="w-3.5 h-3.5 accent-cyan-500 rounded"
            />
            block 적용
          </label>
        </div>

        {/* 빠른 기호 입력 */}
        <div className="flex flex-wrap gap-1 px-5 py-2 border-b border-zinc-800/50">
          {quickSymbols.map((sym) => (
            <button
              key={sym.label}
              type="button"
              onClick={() => insertSymbol(sym.latex)}
              className="px-2 py-1 rounded text-[11px] font-medium text-zinc-400 bg-zinc-800 hover:bg-zinc-700 hover:text-zinc-200 border border-zinc-700/50 transition-colors"
              title={sym.latex}
            >
              {sym.label}
            </button>
          ))}
        </div>

        {/* LaTeX 입력 */}
        <div className="px-5 py-3 flex-1">
          <textarea
            ref={inputRef}
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            placeholder="LaTeX 수식을 입력하세요 (예: x^2 + y^2 = r^2)"
            className="w-full h-32 resize-none rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-cyan-200 font-mono leading-relaxed placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
            spellCheck={false}
          />
        </div>

        {/* 버튼 */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-3.5">
          {onRemoveMath && (
            <button
              type="button"
              onClick={onRemoveMath}
              className="mr-auto rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
            >
              수식 해제
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleInsert}
            disabled={!latex.trim()}
            className="rounded-lg bg-amber-600 hover:bg-amber-500 px-5 py-2 text-sm font-bold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            입력
          </button>
        </div>
      </div>
    </div>
  );
}
