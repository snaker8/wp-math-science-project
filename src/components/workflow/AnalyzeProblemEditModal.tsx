'use client';

// ============================================================================
// 분석 페이지 문제 편집 모달
// 좌: PDF 크롭 이미지 + OCR 텍스트 | 우: 에디터 + 선택지 + 정답
// ============================================================================

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  X, Save, Loader2, Sigma, Trash2, AlertCircle,
  Bold, Italic, ImageIcon, Table2, List, Minus, Eye, EyeOff, Link2,
  LineChart, Underline as UnderlineIcon, FileText, Type, Upload,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { LaTeXInputModal } from '@/components/editor/LaTeXInputModal';

// ============================================================================
// Types
// ============================================================================

export interface AnalyzedProblemData {
  id: string;
  problemId?: string;
  number: number;
  content: string;
  choices: string[];
  answer: number | string;
  solution: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  typeCode: string;
  typeName: string;
  cognitiveDomain?: string;
  confidence: number;
  status: 'analyzing' | 'completed' | 'error' | 'edited';
  pageIndex: number;
  bbox?: { x: number; y: number; w: number; h: number };
}

interface AnalyzeProblemEditModalProps {
  problem: AnalyzedProblemData;
  pdfUrl?: string;
  onSave: (updated: Partial<AnalyzedProblemData>) => void;
  onDelete: () => void;
  onClose: () => void;
  isSaving?: boolean;
}

type AnswerType = 'objective' | 'subjective';

// ============================================================================
// 텍스트 삽입 헬퍼
// ============================================================================

function insertAtCursor(
  textarea: HTMLTextAreaElement | null,
  text: string,
  currentValue: string,
  setter: (v: string) => void,
) {
  if (!textarea) {
    setter(currentValue + text);
    return;
  }
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const newValue = currentValue.slice(0, start) + text + currentValue.slice(end);
  setter(newValue);
  setTimeout(() => {
    textarea.focus();
    const pos = start + text.length;
    textarea.setSelectionRange(pos, pos);
  }, 0);
}

function wrapSelection(
  textarea: HTMLTextAreaElement | null,
  before: string,
  after: string,
  currentValue: string,
  setter: (v: string) => void,
) {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = currentValue.slice(start, end);
  const newValue = currentValue.slice(0, start) + before + selected + after + currentValue.slice(end);
  setter(newValue);
  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(start + before.length, end + before.length);
  }, 0);
}

// ============================================================================
// OCR 텍스트에서 문제 본문과 선택지 분리
// ============================================================================

function splitContentAndChoices(text: string): { body: string; extractedChoices: string[] } {
  const circledNumbers = ['①', '②', '③', '④', '⑤'];

  // 원번호(①②③④⑤)로 선택지 분리 시도
  const firstCircled = circledNumbers.findIndex(cn => text.includes(cn));
  if (firstCircled >= 0) {
    const firstIdx = text.indexOf(circledNumbers[firstCircled]);
    const body = text.substring(0, firstIdx).trim();
    const choicesPart = text.substring(firstIdx);
    const choices: string[] = [];

    for (let i = 0; i < circledNumbers.length; i++) {
      const cn = circledNumbers[i];
      const cnIdx = choicesPart.indexOf(cn);
      if (cnIdx < 0) continue;
      // 다음 원번호 또는 끝까지
      let endIdx = choicesPart.length;
      for (let j = i + 1; j < circledNumbers.length; j++) {
        const nextIdx = choicesPart.indexOf(circledNumbers[j]);
        if (nextIdx > cnIdx) { endIdx = nextIdx; break; }
      }
      const choiceText = choicesPart.substring(cnIdx + cn.length, endIdx).trim();
      choices.push(choiceText);
    }

    if (choices.length > 0) return { body, extractedChoices: choices };
  }

  // (1) (2) (3) (4) (5) 또는 1) 2) 3) 패턴
  // ★ 소문제 판별: "구하시오", "구하여라", "[N점]" 등이 있으면 소문제이므로 선택지로 분리하지 않음
  const subProblemPatterns = /구하시오|구하여라|구해라|서술하시오|설명하시오|증명하시오|나타내시오|보이시오|\[\s*\d+\s*점\s*\]/;
  if (!subProblemPatterns.test(text)) {
    const numberedMatch = text.match(/(?:^|\n)\s*(?:\(?\s*[1-5]\s*\)|[1-5]\s*\))\s*/);
    if (numberedMatch && numberedMatch.index !== undefined) {
      const body = text.substring(0, numberedMatch.index).trim();
      const choicesPart = text.substring(numberedMatch.index);
      const choices = choicesPart
        .split(/(?:^|\n)\s*(?:\(?\s*[1-5]\s*\)|[1-5]\s*\))/)
        .filter(s => s.trim())
        .map(s => s.trim());
      if (choices.length >= 2) return { body, extractedChoices: choices };
    }
  }

  return { body: text, extractedChoices: [] };
}

// ============================================================================
// 에디터 툴바
// ============================================================================

function EditorToolbar({
  onInsertMath, onBold, onItalic, onUnderline,
  onInsertImage, onInsertTable, onInsertList, onInsertDivider, onInsertLink,
  showPreview, onTogglePreview,
}: {
  onInsertMath: () => void;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onInsertImage: () => void;
  onInsertTable: () => void;
  onInsertList: () => void;
  onInsertDivider: () => void;
  onInsertLink: () => void;
  showPreview: boolean;
  onTogglePreview: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button type="button" onClick={onInsertMath}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-amber-600 hover:bg-amber-50 transition-colors" title="수식 삽입 (Σ)">
        <Sigma className="h-3.5 w-3.5" />
      </button>
      <div className="w-px h-4 bg-gray-200 mx-0.5" />
      <button type="button" onClick={onBold}
        className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="굵게">
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onItalic}
        className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="기울임">
        <Italic className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onUnderline}
        className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="밑줄">
        <UnderlineIcon className="h-3.5 w-3.5" />
      </button>
      <div className="w-px h-4 bg-gray-200 mx-0.5" />
      <button type="button" onClick={onInsertImage}
        className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="이미지 삽입">
        <ImageIcon className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onInsertTable}
        className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="표 삽입">
        <Table2 className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onInsertList}
        className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="번호 목록">
        <List className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onInsertDivider}
        className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="구분선">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onInsertLink}
        className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="링크 삽입">
        <Link2 className="h-3.5 w-3.5" />
      </button>
      <div className="w-px h-4 bg-gray-200 mx-0.5" />
      <button type="button" onClick={onTogglePreview}
        className={`p-1 rounded transition-colors ${showPreview ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
        title={showPreview ? '소스 편집' : '미리보기'}>
        {showPreview ? <Eye className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ============================================================================
// 에디터 영역 (textarea + 미리보기)
// ============================================================================

function EditorPanel({
  label, value, onChange, placeholder, textareaRef, onOpenLatex,
  onMathClick,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onOpenLatex: () => void;
  /** 수식 클릭 시 호출 — 미리보기에서 수식을 클릭하면 LaTeX 편집기를 엶 */
  onMathClick?: (latex: string, isDisplay: boolean) => void;
}) {
  // 기본: 렌더링 모드(참조사이트 스타일), 토글하면 raw 편집 모드
  const [editMode, setEditMode] = useState<'rendered' | 'raw'>('rendered');

  const handleBold = () => wrapSelection(textareaRef.current, '**', '**', value, onChange);
  const handleItalic = () => wrapSelection(textareaRef.current, '*', '*', value, onChange);
  const handleUnderline = () => wrapSelection(textareaRef.current, '<u>', '</u>', value, onChange);

  const handleInsertImage = () => {
    const url = prompt('이미지 URL을 입력하세요:');
    if (url) insertAtCursor(textareaRef.current, `\n![이미지](${url})\n`, value, onChange);
  };

  const handleInsertTable = () => {
    const table = '\n| 항목1 | 항목2 | 항목3 |\n|-------|-------|-------|\n|       |       |       |\n';
    insertAtCursor(textareaRef.current, table, value, onChange);
  };

  const handleInsertList = () => {
    insertAtCursor(textareaRef.current, '\n1. \n2. \n3. \n', value, onChange);
  };

  const handleInsertDivider = () => {
    insertAtCursor(textareaRef.current, '\n---\n', value, onChange);
  };

  const handleInsertLink = () => {
    const url = prompt('링크 URL을 입력하세요:');
    if (url) {
      const text = prompt('표시할 텍스트:', url) || url;
      insertAtCursor(textareaRef.current, `[${text}](${url})`, value, onChange);
    }
  };

  // 렌더링 모드에서 텍스트(수식 외) 클릭 시 → raw 편집 모드 전환 + 커서 위치 추정
  const handleTextClick = useCallback((e: React.MouseEvent) => {
    // 수식 클릭은 onMathClick에서 처리하므로 여기서는 텍스트만 처리
    const target = e.target as HTMLElement;
    // 수식(.katex) 영역을 클릭한 경우 — onMathClick이 이미 처리함
    if (target.closest('.katex') || target.closest('[data-math-click]')) return;

    // 클릭한 텍스트 노드의 내용을 기반으로 커서 위치 추정
    const clickedText = window.getSelection()?.toString() || target.textContent || '';
    setEditMode('raw');

    // raw 모드 전환 후 textarea에 포커스 + 클릭한 텍스트 위치로 커서 이동
    setTimeout(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();

      // 클릭한 텍스트가 있으면 해당 위치 근처로 커서 이동
      if (clickedText && clickedText.length > 1) {
        const idx = value.indexOf(clickedText);
        if (idx >= 0) {
          ta.setSelectionRange(idx, idx + clickedText.length);
          return;
        }
      }
      // 폴백: 끝에 커서
      ta.setSelectionRange(value.length, value.length);
    }, 50);
  }, [value, textareaRef]);

  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-bold text-emerald-600 flex-shrink-0">{label}</span>
        <EditorToolbar
          onInsertMath={onOpenLatex}
          onBold={() => { setEditMode('raw'); setTimeout(handleBold, 50); }}
          onItalic={() => { setEditMode('raw'); setTimeout(handleItalic, 50); }}
          onUnderline={() => { setEditMode('raw'); setTimeout(handleUnderline, 50); }}
          onInsertImage={handleInsertImage}
          onInsertTable={() => { setEditMode('raw'); setTimeout(handleInsertTable, 50); }}
          onInsertList={() => { setEditMode('raw'); setTimeout(handleInsertList, 50); }}
          onInsertDivider={() => { setEditMode('raw'); setTimeout(handleInsertDivider, 50); }}
          onInsertLink={handleInsertLink}
          showPreview={editMode === 'rendered'}
          onTogglePreview={() => setEditMode(editMode === 'rendered' ? 'raw' : 'rendered')}
        />
      </div>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {editMode === 'raw' ? (
          /* raw 편집 모드: textarea 전체 */
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              // Escape 누르면 렌더링 모드로 복귀
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setEditMode('rendered');
              }
            }}
            className="w-full resize-none bg-white px-4 py-3 text-sm text-gray-800 leading-relaxed placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-300/50"
            placeholder={placeholder}
            spellCheck={false}
            autoFocus
          />
        ) : (
          /* 렌더링 모드: 수식 클릭→LaTeX편집, 텍스트 클릭→raw편집 전환 */
          <div
            className="w-full overflow-y-auto bg-white px-4 py-3 cursor-text"
            onClick={handleTextClick}
          >
            {value ? (
              <div className="text-sm text-gray-800 leading-relaxed">
                <MixedContentRenderer
                  content={value}
                  className="text-gray-800"
                  onMathClick={onMathClick}
                />
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">{placeholder}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 선택지 편집기
// ============================================================================

/**
 * Mathpix 형식(\( \)를 $ $로) 변환 + 불필요한 원번호 제거
 */
function normalizeChoiceLatex(text: string): string {
  let result = text.replace(/^[①②③④⑤]\s*/, '');
  // \( ... \) → $ ... $
  result = result.replace(/\\\((.+?)\\\)/g, (_, inner) => `$${inner.trim()}$`);
  // \[ ... \] → $$ ... $$
  result = result.replace(/\\\[(.+?)\\\]/gs, (_, inner) => `$$${inner.trim()}$$`);
  return result.trim();
}

/**
 * 선택지 한 개: 편집 input + 렌더링 미리보기 (토글)
 */
function ChoiceCell({
  index, value, onChange,
}: {
  index: number;
  value: string;
  onChange: (v: string) => void;
}) {
  const circledNumbers = ['①', '②', '③', '④', '⑤'];
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const displayValue = normalizeChoiceLatex(value);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-gray-500 w-5 text-center flex-shrink-0">{circledNumbers[index]}</span>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => { if (e.key === 'Enter') setEditing(false); }}
          className="flex-1 rounded-lg border border-emerald-400 bg-white px-2.5 py-1.5 text-sm text-gray-800 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-400 min-w-0"
          placeholder={`선택지 ${index + 1}`}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 cursor-text min-w-0 min-h-[32px] flex items-center hover:border-gray-400 transition-colors"
          title="클릭하여 편집"
        >
          {displayValue ? (
            <MixedContentRenderer content={displayValue} className="text-sm text-gray-800" />
          ) : (
            <span className="text-gray-400">선택지 {index + 1}</span>
          )}
        </div>
      )}
    </div>
  );
}

function ChoicesEditor({
  choices, onChange,
  correctAnswer, onCorrectAnswerChange,
  answerType, onAnswerTypeChange,
  subjectiveAnswer, onSubjectiveAnswerChange,
  choiceLayout, onChoiceLayoutChange,
  isMultipleAnswer, onMultipleAnswerChange,
}: {
  choices: string[];
  onChange: (choices: string[]) => void;
  correctAnswer: number;
  onCorrectAnswerChange: (n: number) => void;
  answerType: AnswerType;
  onAnswerTypeChange: (t: AnswerType) => void;
  subjectiveAnswer: string;
  onSubjectiveAnswerChange: (v: string) => void;
  choiceLayout: number;
  onChoiceLayoutChange: (n: number) => void;
  isMultipleAnswer: boolean;
  onMultipleAnswerChange: (v: boolean) => void;
}) {
  const circledNumbers = ['①', '②', '③', '④', '⑤'];

  const handleChoiceChange = (idx: number, value: string) => {
    const newChoices = [...choices];
    newChoices[idx] = value;
    onChange(newChoices);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* 정답 유형 헤더 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-bold text-gray-500">정답 유형</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onAnswerTypeChange('objective')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              answerType === 'objective' ? 'bg-emerald-50 text-emerald-600 border border-emerald-300' : 'text-gray-400 hover:text-gray-700 border border-transparent'
            }`}>객관식</button>
          <button type="button" onClick={() => onAnswerTypeChange('subjective')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              answerType === 'subjective' ? 'bg-emerald-50 text-emerald-600 border border-emerald-300' : 'text-gray-400 hover:text-gray-700 border border-transparent'
            }`}>주관식</button>
        </div>
      </div>

      {answerType === 'objective' ? (
        <div className="p-4 space-y-3">
          {/* 레이아웃 옵션 */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 ml-auto">
              {[1, 2, 3, 5].map((cols) => (
                <button key={cols} type="button" onClick={() => onChoiceLayoutChange(cols)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                    choiceLayout === cols ? 'bg-emerald-50 text-emerald-600 border border-emerald-300' : 'text-gray-400 border border-gray-200 hover:text-gray-700'
                  }`}>{cols}줄</button>
              ))}
            </div>
          </div>

          {/* 선택지 입력 — 렌더링된 수식으로 표시 (클릭하면 편집) */}
          <div className={`grid gap-2 ${
            choiceLayout === 1 ? 'grid-cols-1' : choiceLayout === 2 ? 'grid-cols-2' : choiceLayout === 3 ? 'grid-cols-3' : 'grid-cols-5'
          }`}>
            {choices.map((choice, i) => (
              <ChoiceCell
                key={i}
                index={i}
                value={choice}
                onChange={(v) => handleChoiceChange(i, v)}
              />
            ))}
          </div>
          <p className="text-[10px] text-gray-400">수식은 <code className="bg-gray-100 px-1 rounded text-gray-600">$...$</code> 로 감싸세요 (예: <code className="bg-gray-100 px-1 rounded text-gray-600">$x^2+1$</code>)</p>

          {/* 정답 선택 */}
          <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
            <span className="text-xs font-medium text-gray-500">정답 :</span>
            <div className="flex items-center gap-1.5">
              {circledNumbers.map((num, i) => (
                <button key={i} type="button" onClick={() => onCorrectAnswerChange(i + 1)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    correctAnswer === i + 1
                      ? 'bg-emerald-500 text-white ring-2 ring-emerald-300 shadow-lg shadow-emerald-500/20'
                      : 'bg-gray-50 text-gray-400 border border-gray-200 hover:border-gray-400 hover:text-gray-700'
                  }`}>{num}</button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 ml-auto text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={isMultipleAnswer} onChange={(e) => onMultipleAnswerChange(e.target.checked)}
                className="w-3.5 h-3.5 accent-emerald-500 rounded" />
              복수정답
            </label>
          </div>
        </div>
      ) : (
        <div className="p-4">
          <label className="block text-xs font-medium text-gray-500 mb-2">주관식 정답</label>
          <input type="text" value={subjectiveAnswer} onChange={(e) => onSubjectiveAnswerChange(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-lg text-gray-800 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-400"
            placeholder="정답을 입력하세요" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PDF 크롭 패널 (좌측)
// ============================================================================

function PdfCropPanel({
  pdfUrl,
  pageIndex,
  bbox,
}: {
  pdfUrl?: string;
  pageIndex: number;
  bbox?: { x: number; y: number; w: number; h: number };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!pdfUrl || !canvasRef.current) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const renderCrop = async () => {
      try {
        setIsLoading(true);
        setError(false);

        const { loadPdfDocument } = await import('@/lib/pdf-viewer');
        const pdf = await loadPdfDocument(pdfUrl);

        const pageNum = pageIndex + 1;
        if (pageNum > pdf.numPages || cancelled) return;

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.5 });

        // 전체 페이지를 offscreen canvas에 렌더링
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = viewport.width;
        fullCanvas.height = viewport.height;
        const fullCtx = fullCanvas.getContext('2d');
        if (!fullCtx || cancelled) return;

        await page.render({
          canvasContext: fullCtx,
          viewport,
        }).promise;

        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (bbox) {
          // bbox 영역만 크롭
          const sx = bbox.x * fullCanvas.width;
          const sy = bbox.y * fullCanvas.height;
          const sw = bbox.w * fullCanvas.width;
          const sh = bbox.h * fullCanvas.height;

          const displayWidth = 380;
          const aspectRatio = sh / sw;
          const displayHeight = Math.min(displayWidth * aspectRatio, 350);

          canvas.width = sw;
          canvas.height = sh;
          canvas.style.width = `${displayWidth}px`;
          canvas.style.height = `${displayHeight}px`;

          ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
        } else {
          // bbox 없으면 전체 페이지 축소 표시
          const displayWidth = 380;
          const aspectRatio = fullCanvas.height / fullCanvas.width;
          const displayHeight = Math.min(displayWidth * aspectRatio, 350);

          canvas.width = fullCanvas.width;
          canvas.height = fullCanvas.height;
          canvas.style.width = `${displayWidth}px`;
          canvas.style.height = `${displayHeight}px`;

          ctx.drawImage(fullCanvas, 0, 0);
        }

        setIsLoading(false);
      } catch (err) {
        console.error('PDF crop render error:', err);
        if (!cancelled) {
          setError(true);
          setIsLoading(false);
        }
      }
    };

    renderCrop();

    return () => { cancelled = true; };
  }, [pdfUrl, pageIndex, bbox]);

  if (!pdfUrl) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-50 rounded-lg border border-gray-200">
        <div className="text-center">
          <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-400">PDF 미리보기 없음</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-white rounded-lg border border-gray-200 overflow-hidden flex items-center justify-center shadow-sm"
      style={{ minHeight: '150px', maxHeight: '350px' }}>
      <canvas ref={canvasRef} className="block" />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <AlertCircle className="h-6 w-6 text-red-400 mx-auto mb-1" />
            <span className="text-xs text-gray-500">이미지 로드 실패</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 메인 모달 컴포넌트
// ============================================================================

export default function AnalyzeProblemEditModal({
  problem,
  pdfUrl,
  onSave,
  onDelete,
  onClose,
  isSaving = false,
}: AnalyzeProblemEditModalProps) {
  // === 탭 ===
  const [activeTab, setActiveTab] = useState<'content' | 'solution'>('content');

  // === 문제 내용 ===
  const [content, setContent] = useState(problem.content);
  const [solution, setSolution] = useState(problem.solution);

  // === 선택지 & 정답 ===
  const initialChoices = useMemo(() => {
    if (problem.choices && problem.choices.length > 0) {
      const normalized = problem.choices.map(c => normalizeChoiceLatex(c));
      while (normalized.length < 5) normalized.push('');
      return normalized.slice(0, 5);
    }
    return ['', '', '', '', ''];
  }, [problem.choices]);

  const [choices, setChoices] = useState<string[]>(initialChoices);
  const [answerType, setAnswerType] = useState<AnswerType>(() => {
    const ans = problem.answer;
    if (typeof ans === 'number' && ans >= 1 && ans <= 5) return 'objective';
    if (typeof ans === 'string' && /^\d$/.test(ans) && Number(ans) >= 1 && Number(ans) <= 5) return 'objective';
    return problem.choices.length > 0 ? 'objective' : 'subjective';
  });
  const [correctAnswer, setCorrectAnswer] = useState<number>(() => {
    const ans = problem.answer;
    if (typeof ans === 'number') return ans;
    if (typeof ans === 'string' && /^\d$/.test(ans)) return Number(ans);
    return 0;
  });
  const [subjectiveAnswer, setSubjectiveAnswer] = useState<string>(() => {
    const ans = problem.answer;
    if (typeof ans === 'string' && !/^\d$/.test(ans)) return ans;
    return '';
  });
  const [choiceLayout, setChoiceLayout] = useState(2);
  const [isMultipleAnswer, setIsMultipleAnswer] = useState(false);

  // === 메타데이터 ===
  const [difficulty, setDifficulty] = useState(problem.difficulty);
  const [problemNumber, setProblemNumber] = useState(problem.number);

  // === UI ===
  const [showLatexModal, setShowLatexModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // === OCR 텍스트 읽어내기 ===
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrText, setOcrText] = useState(problem.content);
  const [ocrChoices, setOcrChoices] = useState<string[]>([]);

  // === 이미지 추가 ===
  const imageFileRef = useRef<HTMLInputElement>(null);
  // === 해설 이미지 드래그&드롭 ===
  const [solutionImage, setSolutionImage] = useState<string | null>(null);
  const [isDraggingSolution, setIsDraggingSolution] = useState(false);
  const solutionImageFileRef = useRef<HTMLInputElement>(null);
  const [isSolutionOcrLoading, setIsSolutionOcrLoading] = useState(false);

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const solutionRef = useRef<HTMLTextAreaElement>(null);

  // 현재 활성 textarea
  const activeRef = activeTab === 'content' ? contentRef : solutionRef;
  const activeValue = activeTab === 'content' ? content : solution;
  const activeSetter = activeTab === 'content' ? setContent : setSolution;

  // === 난이도 상수 (5등급: 상/중상/중/중하/하) ===
  const difficulties = [
    { key: 5, label: '상', color: 'text-red-600 border-red-200 bg-red-50' },
    { key: 4, label: '중상', color: 'text-orange-600 border-orange-200 bg-orange-50' },
    { key: 3, label: '중', color: 'text-amber-600 border-amber-200 bg-amber-50' },
    { key: 2, label: '중하', color: 'text-blue-600 border-blue-200 bg-blue-50' },
    { key: 1, label: '하', color: 'text-gray-500 border-gray-200 bg-gray-50' },
  ];

  // === ESC 키 ===
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLatexModal) return;
        if (showDeleteConfirm) { setShowDeleteConfirm(false); return; }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLatexModal, showDeleteConfirm, onClose]);

  // === 수식 클릭 편집 상태 ===
  const [editingMath, setEditingMath] = useState<{ latex: string; isDisplay: boolean } | null>(null);

  // === LaTeX 삽입 (신규) ===
  const handleLatexInsert = useCallback((latex: string, opts?: { displayStyle?: boolean; block?: boolean }) => {
    if (editingMath) {
      // 기존 수식 교체 모드
      const val = activeValue;
      const set = activeSetter;
      const oldWrapped = editingMath.isDisplay ? `$$${editingMath.latex}$$` : `$${editingMath.latex}$`;
      const newWrapped = (opts?.block || editingMath.isDisplay) ? `$$${latex}$$` : `$${latex}$`;
      const replaced = val.replace(oldWrapped, newWrapped);
      if (replaced !== val) {
        set(replaced);
      } else {
        // 정확한 매칭 실패 시 삽입으로 폴백
        insertAtCursor(activeRef.current, newWrapped, val, set);
      }
      setEditingMath(null);
      setShowLatexModal(false);
      return;
    }

    // 신규 삽입 모드
    const ref = activeRef.current;
    const val = activeValue;
    const set = activeSetter;

    const wrapped = opts?.block ? `\n$$${latex}$$\n` : `$${latex}$`;
    insertAtCursor(ref, wrapped, val, set);
    setShowLatexModal(false);
  }, [activeRef, activeValue, activeSetter, editingMath]);

  // === 미리보기에서 수식 클릭 → 편집기 열기 ===
  const handleMathClick = useCallback((latex: string, isDisplay: boolean) => {
    setEditingMath({ latex, isDisplay });
    setShowLatexModal(true);
  }, []);

  // === 텍스트 읽어내기 (OCR) ===
  const handleReadText = useCallback(async () => {
    if (!pdfUrl || !problem.bbox) return;
    setIsOcrLoading(true);
    try {
      // PDF → canvas → base64
      const { loadPdfDocument } = await import('@/lib/pdf-viewer');
      const pdf = await loadPdfDocument(pdfUrl);
      const page = await pdf.getPage(problem.pageIndex + 1);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context failed');
      await page.render({ canvasContext: ctx, viewport }).promise;

      // bbox 영역만 크롭
      const bbox = problem.bbox;
      const sx = bbox.x * canvas.width;
      const sy = bbox.y * canvas.height;
      const sw = bbox.w * canvas.width;
      const sh = bbox.h * canvas.height;
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = sw;
      cropCanvas.height = sh;
      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) throw new Error('Crop canvas context failed');
      cropCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

      const imageBase64 = cropCanvas.toDataURL('image/jpeg', 0.9);

      // OCR API 호출
      const res = await fetch('/api/workflow/reanalyze-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });

      if (!res.ok) throw new Error(`OCR API error: ${res.status}`);
      const data = await res.json();
      const ocrContent = data.ocrText || data.rawOcrText || '';
      setOcrText(ocrContent);
      // API가 추출한 선택지 저장
      if (data.choices && data.choices.length > 0) {
        setOcrChoices(data.choices);
      }
    } catch (err) {
      console.error('텍스트 읽어내기 실패:', err);
      alert('텍스트 읽어내기에 실패했습니다.');
    } finally {
      setIsOcrLoading(false);
    }
  }, [pdfUrl, problem.pageIndex, problem.bbox]);

  // === 이미지 파일 추가 ===
  const handleImageFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const markdown = `\n![이미지](${base64})\n`;
      activeSetter(prev => prev + markdown);
    };
    reader.readAsDataURL(file);
    // reset input
    e.target.value = '';
  }, [activeSetter]);

  // === 해설 이미지 드래그&드롭 ===
  const handleSolutionImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingSolution(false);
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSolutionImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSolutionImageFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSolutionImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  // === 해설 이미지 OCR ===
  const handleSolutionOcr = useCallback(async () => {
    if (!solutionImage) return;
    setIsSolutionOcrLoading(true);
    try {
      const res = await fetch('/api/workflow/reanalyze-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: solutionImage }),
      });
      if (!res.ok) throw new Error(`OCR API error: ${res.status}`);
      const data = await res.json();
      const ocrContent = data.ocrText || data.rawOcrText || '';
      setSolution(prev => prev + (prev ? '\n' : '') + ocrContent);
    } catch (err) {
      console.error('해설 OCR 실패:', err);
      alert('해설 텍스트 읽어내기에 실패했습니다.');
    } finally {
      setIsSolutionOcrLoading(false);
    }
  }, [solutionImage]);

  // === 저장 ===
  const handleSave = useCallback(() => {
    const formattedChoices = choices.map((c, i) => {
      const stripped = c.replace(/^[①②③④⑤]\s*/, '');
      return stripped;
    });

    const updated: Partial<AnalyzedProblemData> = {
      content,
      solution,
      choices: formattedChoices,
      answer: answerType === 'objective' ? correctAnswer : subjectiveAnswer,
      difficulty: difficulty as 1 | 2 | 3 | 4 | 5,
      number: problemNumber,
      status: 'edited',
    };

    onSave(updated);
  }, [content, solution, choices, answerType, correctAnswer, subjectiveAnswer, difficulty, problemNumber, onSave]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="relative flex h-[92vh] w-[95vw] max-w-[1400px] flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">

          {/* ======== Header ======== */}
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 flex-shrink-0 bg-gray-50">
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-gray-900">문제</span>
              {problem.problemId && (
                <span className="text-[10px] text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded">
                  {problem.problemId}
                </span>
              )}
              {/* 문제/해설 탭 */}
              <div className="flex items-center gap-1 ml-2">
                <button type="button" onClick={() => setActiveTab('content')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    activeTab === 'content'
                      ? 'bg-emerald-500 text-white'
                      : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                  }`}>
                  문제
                </button>
                <button type="button" onClick={() => setActiveTab('solution')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    activeTab === 'solution'
                      ? 'bg-emerald-500 text-white'
                      : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                  }`}>
                  해설
                </button>
              </div>
            </div>
            <button type="button" onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* ======== Body: 2-column ======== */}
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* === 좌측 패널 === */}
            <div className="w-[420px] flex-shrink-0 border-r border-gray-200 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
              {/* 숨겨진 파일 인풋 */}
              <input ref={imageFileRef} type="file" accept="image/*" className="hidden" onChange={handleImageFileChange} />
              <input ref={solutionImageFileRef} type="file" accept="image/*" className="hidden" onChange={handleSolutionImageFileChange} />

              {activeTab === 'content' ? (
                <>
                  {/* PDF 크롭 이미지 */}
                  <div>
                    <div className="text-xs font-bold text-gray-500 mb-2">원본 이미지</div>
                    <PdfCropPanel
                      pdfUrl={pdfUrl}
                      pageIndex={problem.pageIndex}
                      bbox={problem.bbox}
                    />
                    <p className="text-[10px] text-gray-400 text-center mt-1.5">이미지 영역을 선택하세요.</p>
                  </div>

                  {/* 텍스트 읽어내기 + 이미지 추가 버튼 */}
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleReadText} disabled={isOcrLoading}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 shadow-sm">
                      {isOcrLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Type className="h-3.5 w-3.5" />}
                      텍스트 읽어내기
                    </button>
                    <button type="button" onClick={() => imageFileRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
                      <ImageIcon className="h-3.5 w-3.5" />
                      이미지 추가
                    </button>
                  </div>

                  {/* OCR 텍스트 영역 */}
                  <div>
                    <div className="text-xs font-bold text-gray-500 mb-1.5">OCR 추출 텍스트</div>
                    <textarea
                      value={ocrText}
                      onChange={(e) => setOcrText(e.target.value)}
                      className="w-full h-24 resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-400 shadow-sm"
                      placeholder="OCR 추출 텍스트가 여기에 표시됩니다"
                    />
                    <div className="flex items-center justify-between mt-1">
                      <button type="button" onClick={() => setOcrText('')}
                        className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1">
                        <Trash2 className="h-3 w-3" />
                        비우기
                      </button>
                      <button type="button"
                        onClick={() => {
                          if (ocrText.trim()) {
                            const { body, extractedChoices } = splitContentAndChoices(ocrText);
                            setContent(prev => prev + (prev ? '\n' : '') + body);
                            const finalChoices = ocrChoices.length > 0 ? ocrChoices : extractedChoices;
                            if (finalChoices.length > 0) {
                              const padded = [...finalChoices];
                              while (padded.length < 5) padded.push('');
                              setChoices(padded.slice(0, 5).map(c => normalizeChoiceLatex(c)));
                              setAnswerType('objective');
                            }
                          }
                        }}
                        className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-xs font-bold text-white transition-colors shadow-sm">
                        넣기
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* 해설 탭 — 이미지 드래그&드롭 업로드 */}
                  <div>
                    <div className="text-xs font-bold text-gray-500 mb-2">해설 이미지</div>
                    {solutionImage ? (
                      <div className="relative rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm">
                        <img src={solutionImage} alt="해설 이미지" className="w-full max-h-[300px] object-contain" />
                        <button type="button" onClick={() => setSolutionImage(null)}
                          className="absolute top-2 right-2 p-1 rounded-full bg-gray-900/50 text-white hover:bg-red-500 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onDragOver={(e) => { e.preventDefault(); setIsDraggingSolution(true); }}
                        onDragLeave={() => setIsDraggingSolution(false)}
                        onDrop={handleSolutionImageDrop}
                        className={`flex flex-col items-center justify-center h-48 rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
                          isDraggingSolution
                            ? 'border-emerald-400 bg-emerald-50'
                            : 'border-gray-300 bg-white hover:border-gray-400'
                        }`}
                        onClick={() => solutionImageFileRef.current?.click()}
                      >
                        <Upload className="h-8 w-8 text-gray-300 mb-2" />
                        <p className="text-xs text-gray-500 font-medium">이미지를 드래그하거나 클릭해서 추가하세요</p>
                        <p className="text-[10px] text-gray-400 mt-1">붙여넣기(Ctrl+V/Cmd+V)도 지원합니다.</p>
                      </div>
                    )}
                  </div>

                  {/* 해설 이미지 OCR 버튼 */}
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleSolutionOcr} disabled={!solutionImage || isSolutionOcrLoading}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 shadow-sm">
                      {isSolutionOcrLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Type className="h-3.5 w-3.5" />}
                      텍스트 읽어내기
                    </button>
                    <button type="button" onClick={() => solutionImageFileRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
                      <ImageIcon className="h-3.5 w-3.5" />
                      이미지 추가
                    </button>
                  </div>
                </>
              )}

              {/* 메타 정보 (양쪽 탭 공통) */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
                {/* 문제 번호 */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-500">문제 번호</span>
                  <input
                    type="number"
                    value={problemNumber}
                    onChange={(e) => setProblemNumber(parseInt(e.target.value, 10) || 1)}
                    className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 text-center font-bold focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    min={1}
                  />
                </div>

                {/* 난이도 */}
                <div>
                  <span className="block text-[11px] font-medium text-gray-500 mb-1.5">난이도</span>
                  <div className="flex flex-wrap gap-1">
                    {difficulties.map((d) => (
                      <button key={d.key} type="button" onClick={() => setDifficulty(d.key as 1 | 2 | 3 | 4 | 5)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          difficulty === d.key
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-300'
                            : 'text-gray-400 border border-gray-200 hover:text-gray-700 hover:border-gray-400'
                        }`}>{d.label}</button>
                    ))}
                  </div>
                </div>

                {/* 유형 분류 */}
                <div>
                  <span className="block text-[11px] font-medium text-gray-500 mb-1.5">유형 분류</span>
                  <div className="flex flex-wrap gap-1.5">
                    {problem.typeCode && (
                      <span className="text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-600 border border-indigo-200">
                        {problem.typeCode}
                      </span>
                    )}
                    {problem.typeName && (
                      <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 border border-gray-200">
                        {problem.typeName}
                      </span>
                    )}
                  </div>
                </div>

                {/* 신뢰도 */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-500">AI 신뢰도</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${(problem.confidence * 100).toFixed(0)}%` }}
                      />
                    </div>
                    <span className="text-xs text-emerald-600 font-bold">
                      {(problem.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* === 우측 패널 === */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
              {/* 에디터 — 수식 클릭 시 편집기 열기 (참조사이트 스타일) */}
              <EditorPanel
                label={activeTab === 'content' ? '문제 내용' : '해설'}
                value={activeTab === 'content' ? content : solution}
                onChange={activeTab === 'content' ? setContent : setSolution}
                placeholder={activeTab === 'content' ? '문제 내용을 입력하세요. $...$ 로 수식을 감싸세요.' : '해설을 입력하세요.'}
                textareaRef={activeTab === 'content' ? contentRef : solutionRef}
                onOpenLatex={() => { setEditingMath(null); setShowLatexModal(true); }}
                onMathClick={handleMathClick}
              />

              {/* 선택지 편집기 */}
              <ChoicesEditor
                choices={choices}
                onChange={setChoices}
                correctAnswer={correctAnswer}
                onCorrectAnswerChange={setCorrectAnswer}
                answerType={answerType}
                onAnswerTypeChange={setAnswerType}
                subjectiveAnswer={subjectiveAnswer}
                onSubjectiveAnswerChange={setSubjectiveAnswer}
                choiceLayout={choiceLayout}
                onChoiceLayoutChange={setChoiceLayout}
                isMultipleAnswer={isMultipleAnswer}
                onMultipleAnswerChange={setIsMultipleAnswer}
              />

              {/* 유형 분류 표시 (읽기 전용) */}
              {problem.typeCode && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-gray-500">AI 분류 결과</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs px-2.5 py-1 rounded bg-indigo-50 text-indigo-600 border border-indigo-200 font-mono">
                      {problem.typeCode}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded bg-gray-100 text-gray-600 border border-gray-200">
                      {problem.typeName}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200">
                      난이도: {difficulties.find(d => d.key === problem.difficulty)?.label || '중'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ======== Footer ======== */}
          <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 flex-shrink-0 bg-gray-50">
            {/* 삭제 */}
            <div>
              {!showDeleteConfirm ? (
                <button type="button" onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 text-xs font-bold transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                  삭제
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-500 font-medium">정말 삭제하시겠습니까?</span>
                  <button type="button" onClick={() => { onDelete(); onClose(); }}
                    className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-xs font-bold text-white transition-colors">
                    확인
                  </button>
                  <button type="button" onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:text-gray-700 transition-colors">
                    취소
                  </button>
                </div>
              )}
            </div>

            {/* 저장 & 닫기 */}
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleSave} disabled={isSaving}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 px-5 py-2 text-xs font-bold text-white transition-colors disabled:opacity-50 shadow-lg shadow-emerald-500/20">
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                저장 하기
              </button>
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors">
                닫기
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* LaTeX 입력 모달 — 수식 클릭 편집 시 initialLatex 전달 */}
      {showLatexModal && (
        <LaTeXInputModal
          initialLatex={editingMath?.latex || ''}
          onInsert={handleLatexInsert}
          onCancel={() => { setShowLatexModal(false); setEditingMath(null); }}
        />
      )}
    </>
  );
}
