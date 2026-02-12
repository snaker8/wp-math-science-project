'use client';

// ============================================================================
// 분석 페이지 문제 편집 모달
// 좌: PDF 크롭 이미지 + OCR 텍스트 | 우: 에디터 + 선택지 + 정답
// ============================================================================

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  X, Save, Loader2, Sigma, Trash2, AlertCircle,
  Bold, Italic, ImageIcon, Table2, List, Minus, Eye, EyeOff, Link2,
  LineChart, Underline as UnderlineIcon, FileText, Type,
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
        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors" title="수식 삽입 (Σ)">
        <Sigma className="h-3.5 w-3.5" />
      </button>
      <div className="w-px h-4 bg-zinc-700 mx-0.5" />
      <button type="button" onClick={onBold}
        className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="굵게">
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onItalic}
        className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="기울임">
        <Italic className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onUnderline}
        className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="밑줄">
        <UnderlineIcon className="h-3.5 w-3.5" />
      </button>
      <div className="w-px h-4 bg-zinc-700 mx-0.5" />
      <button type="button" onClick={onInsertImage}
        className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="이미지 삽입">
        <ImageIcon className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onInsertTable}
        className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="표 삽입">
        <Table2 className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onInsertList}
        className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="번호 목록">
        <List className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onInsertDivider}
        className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="구분선">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onInsertLink}
        className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="링크 삽입">
        <Link2 className="h-3.5 w-3.5" />
      </button>
      <div className="w-px h-4 bg-zinc-700 mx-0.5" />
      <button type="button" onClick={onTogglePreview}
        className={`p-1 rounded transition-colors ${showPreview ? 'text-cyan-400 bg-cyan-500/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
        title={showPreview ? '미리보기 끄기' : '수식 미리보기'}>
        {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ============================================================================
// 에디터 영역 (textarea + 미리보기)
// ============================================================================

function EditorPanel({
  label, value, onChange, placeholder, textareaRef, onOpenLatex,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onOpenLatex: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);

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

  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 border-b border-zinc-700/50">
        <span className="text-xs font-bold text-cyan-400 flex-shrink-0">{label}</span>
        <EditorToolbar
          onInsertMath={onOpenLatex}
          onBold={handleBold}
          onItalic={handleItalic}
          onUnderline={handleUnderline}
          onInsertImage={handleInsertImage}
          onInsertTable={handleInsertTable}
          onInsertList={handleInsertList}
          onInsertDivider={handleInsertDivider}
          onInsertLink={handleInsertLink}
          showPreview={showPreview}
          onTogglePreview={() => setShowPreview(!showPreview)}
        />
      </div>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`resize-none bg-zinc-900 px-4 py-3 text-sm text-zinc-200 leading-relaxed placeholder:text-zinc-600 focus:outline-none ${
            showPreview ? 'w-1/2 border-r border-zinc-700/50' : 'w-full'
          }`}
          placeholder={placeholder}
          spellCheck={false}
        />
        {showPreview && (
          <div className="w-1/2 overflow-y-auto bg-white px-4 py-3">
            {value ? (
              <div className="text-sm text-gray-800 leading-relaxed">
                <MixedContentRenderer content={value} className="text-gray-800" />
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">미리보기 영역</p>
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
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
      {/* 정답 유형 헤더 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-800/50 border-b border-zinc-700/50">
        <span className="text-xs font-bold text-zinc-400">정답 유형</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onAnswerTypeChange('objective')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              answerType === 'objective' ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
            }`}>객관식</button>
          <button type="button" onClick={() => onAnswerTypeChange('subjective')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              answerType === 'subjective' ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
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
                    choiceLayout === cols ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30' : 'text-zinc-500 border border-zinc-700 hover:text-zinc-300'
                  }`}>{cols}줄</button>
              ))}
            </div>
          </div>

          {/* 선택지 입력 */}
          <div className={`grid gap-2 ${
            choiceLayout === 1 ? 'grid-cols-1' : choiceLayout === 2 ? 'grid-cols-2' : choiceLayout === 3 ? 'grid-cols-3' : 'grid-cols-5'
          }`}>
            {choices.map((choice, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-sm text-zinc-500 w-5 text-center flex-shrink-0">{circledNumbers[i]}</span>
                <input type="text"
                  value={choice.replace(/^[①②③④⑤]\s*/, '')}
                  onChange={(e) => handleChoiceChange(i, e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 min-w-0"
                  placeholder={`선택지 ${i + 1}`} />
              </div>
            ))}
          </div>

          {/* 정답 선택 */}
          <div className="flex items-center gap-3 pt-1 border-t border-zinc-800">
            <span className="text-xs font-medium text-zinc-400">정답 :</span>
            <div className="flex items-center gap-1.5">
              {circledNumbers.map((num, i) => (
                <button key={i} type="button" onClick={() => onCorrectAnswerChange(i + 1)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    correctAnswer === i + 1
                      ? 'bg-red-500 text-white ring-2 ring-red-400/50 shadow-lg shadow-red-500/20'
                      : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-300'
                  }`}>{num}</button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 ml-auto text-xs text-zinc-500 cursor-pointer">
              <input type="checkbox" checked={isMultipleAnswer} onChange={(e) => onMultipleAnswerChange(e.target.checked)}
                className="w-3.5 h-3.5 accent-cyan-500 rounded" />
              복수정답
            </label>
          </div>
        </div>
      ) : (
        <div className="p-4">
          <label className="block text-xs font-medium text-zinc-400 mb-2">주관식 정답</label>
          <input type="text" value={subjectiveAnswer} onChange={(e) => onSubjectiveAnswerChange(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-lg text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
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
      <div className="flex items-center justify-center h-48 bg-zinc-800 rounded-lg border border-zinc-700">
        <div className="text-center">
          <FileText className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-xs text-zinc-500">PDF 미리보기 없음</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-white rounded-lg border border-zinc-700 overflow-hidden flex items-center justify-center"
      style={{ minHeight: '150px', maxHeight: '350px' }}>
      <canvas ref={canvasRef} className="block" />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-100">
          <div className="text-center">
            <AlertCircle className="h-6 w-6 text-red-400 mx-auto mb-1" />
            <span className="text-xs text-zinc-500">이미지 로드 실패</span>
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
    if (problem.choices && problem.choices.length > 0) return [...problem.choices];
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

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const solutionRef = useRef<HTMLTextAreaElement>(null);

  // 현재 활성 textarea
  const activeRef = activeTab === 'content' ? contentRef : solutionRef;
  const activeValue = activeTab === 'content' ? content : solution;
  const activeSetter = activeTab === 'content' ? setContent : setSolution;

  // === 난이도 상수 ===
  const difficulties = [
    { key: 5, label: '최상', color: 'text-red-300 border-red-700 bg-red-700/10' },
    { key: 4, label: '상', color: 'text-red-400 border-red-500 bg-red-500/10' },
    { key: 3, label: '중', color: 'text-amber-400 border-amber-500 bg-amber-500/10' },
    { key: 2, label: '하', color: 'text-blue-400 border-blue-500 bg-blue-500/10' },
    { key: 1, label: '최하', color: 'text-zinc-400 border-zinc-500 bg-zinc-800' },
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

  // === LaTeX 삽입 ===
  const handleLatexInsert = useCallback((latex: string, opts?: { displayStyle?: boolean; block?: boolean }) => {
    const ref = activeRef.current;
    const val = activeValue;
    const set = activeSetter;

    const wrapped = opts?.block ? `\n$$${latex}$$\n` : `$${latex}$`;
    insertAtCursor(ref, wrapped, val, set);
    setShowLatexModal(false);
  }, [activeRef, activeValue, activeSetter]);

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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="relative flex h-[92vh] w-[95vw] max-w-[1400px] flex-col rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50 overflow-hidden">

          {/* ======== Header ======== */}
          <div className="flex items-center justify-between border-b border-zinc-800/50 px-5 py-3 flex-shrink-0">
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-white">문제</span>
              {problem.problemId && (
                <span className="text-[10px] text-zinc-500 font-mono bg-zinc-800 px-2 py-0.5 rounded">
                  {problem.problemId}
                </span>
              )}
              {/* 문제/해설 탭 */}
              <div className="flex items-center gap-1 ml-2">
                <button type="button" onClick={() => setActiveTab('content')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    activeTab === 'content'
                      ? 'bg-indigo-600 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}>
                  문제
                </button>
                <button type="button" onClick={() => setActiveTab('solution')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    activeTab === 'solution'
                      ? 'bg-indigo-600 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}>
                  해설
                </button>
              </div>
            </div>
            <button type="button" onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* ======== Body: 2-column ======== */}
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* === 좌측 패널 === */}
            <div className="w-[420px] flex-shrink-0 border-r border-zinc-800/50 overflow-y-auto p-4 space-y-4">

              {/* PDF 크롭 이미지 */}
              <div>
                <div className="text-xs font-bold text-zinc-400 mb-2">원본 이미지</div>
                <PdfCropPanel
                  pdfUrl={pdfUrl}
                  pageIndex={problem.pageIndex}
                  bbox={problem.bbox}
                />
                <p className="text-[10px] text-zinc-600 text-center mt-1.5">이미지 영역을 선택하세요.</p>
              </div>

              {/* 텍스트 읽어내기 버튼 */}
              <div className="flex items-center gap-2">
                <button type="button"
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors">
                  <Type className="h-3.5 w-3.5" />
                  텍스트 읽어내기
                </button>
                <button type="button"
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors">
                  <ImageIcon className="h-3.5 w-3.5" />
                  이미지 추가
                </button>
              </div>

              {/* OCR 텍스트 영역 */}
              <div>
                <div className="text-xs font-bold text-zinc-400 mb-1.5">OCR 추출 텍스트</div>
                <textarea
                  readOnly
                  value={problem.content}
                  className="w-full h-24 resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-400 font-mono focus:outline-none"
                  placeholder="OCR 추출 텍스트가 여기에 표시됩니다"
                />
                <div className="flex items-center justify-between mt-1">
                  <button type="button" className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1">
                    <Trash2 className="h-3 w-3" />
                    비우기
                  </button>
                  <button type="button"
                    onClick={() => {
                      activeSetter(prev => prev + '\n' + problem.content);
                    }}
                    className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white transition-colors">
                    넣기
                  </button>
                </div>
              </div>

              {/* 메타 정보 */}
              <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4 space-y-3">
                {/* 문제 번호 */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-500">문제 번호</span>
                  <input
                    type="number"
                    value={problemNumber}
                    onChange={(e) => setProblemNumber(parseInt(e.target.value, 10) || 1)}
                    className="w-16 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 text-center font-bold focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    min={1}
                  />
                </div>

                {/* 난이도 */}
                <div>
                  <span className="block text-[11px] font-medium text-zinc-500 mb-1.5">난이도</span>
                  <div className="flex flex-wrap gap-1">
                    {difficulties.map((d) => (
                      <button key={d.key} type="button" onClick={() => setDifficulty(d.key as 1 | 2 | 3 | 4 | 5)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          difficulty === d.key
                            ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                            : 'text-zinc-500 border border-zinc-700 hover:text-zinc-300 hover:border-zinc-500'
                        }`}>{d.label}</button>
                    ))}
                  </div>
                </div>

                {/* 유형 분류 */}
                <div>
                  <span className="block text-[11px] font-medium text-zinc-500 mb-1.5">유형 분류</span>
                  <div className="flex flex-wrap gap-1.5">
                    {problem.typeCode && (
                      <span className="text-xs px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        {problem.typeCode}
                      </span>
                    )}
                    {problem.typeName && (
                      <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {problem.typeName}
                      </span>
                    )}
                  </div>
                </div>

                {/* 신뢰도 */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-500">AI 신뢰도</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-500 rounded-full"
                        style={{ width: `${(problem.confidence * 100).toFixed(0)}%` }}
                      />
                    </div>
                    <span className="text-xs text-cyan-400 font-bold">
                      {(problem.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* === 우측 패널 === */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* 에디터 */}
              <EditorPanel
                label={activeTab === 'content' ? '문제 내용' : '해설'}
                value={activeTab === 'content' ? content : solution}
                onChange={activeTab === 'content' ? setContent : setSolution}
                placeholder={activeTab === 'content' ? '문제 내용을 입력하세요. $...$ 로 수식을 감싸세요.' : '해설을 입력하세요.'}
                textareaRef={activeTab === 'content' ? contentRef : solutionRef}
                onOpenLatex={() => setShowLatexModal(true)}
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
                <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-zinc-400">AI 분류 결과</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                      {problem.typeCode}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {problem.typeName}
                    </span>
                    <span className={`text-xs px-2.5 py-1 rounded border ${
                      difficulties.find(d => d.key === problem.difficulty)?.color || ''
                    }`}>
                      난이도: {difficulties.find(d => d.key === problem.difficulty)?.label || '중'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ======== Footer ======== */}
          <div className="flex items-center justify-between border-t border-zinc-800/50 px-5 py-3 flex-shrink-0">
            {/* 삭제 */}
            <div>
              {!showDeleteConfirm ? (
                <button type="button" onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-red-600/80 hover:bg-red-500 px-4 py-2 text-xs font-bold text-white transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                  삭제
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400 font-medium">정말 삭제하시겠습니까?</span>
                  <button type="button" onClick={() => { onDelete(); onClose(); }}
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white transition-colors">
                    확인
                  </button>
                  <button type="button" onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
                    취소
                  </button>
                </div>
              )}
            </div>

            {/* 저장 & 닫기 */}
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleSave} disabled={isSaving}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-5 py-2 text-xs font-bold text-white transition-colors disabled:opacity-50 shadow-lg shadow-cyan-500/20">
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                저장 하기
              </button>
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg border border-zinc-700 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors">
                닫기
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* LaTeX 입력 모달 */}
      {showLatexModal && (
        <LaTeXInputModal
          onInsert={handleLatexInsert}
          onCancel={() => setShowLatexModal(false)}
        />
      )}
    </>
  );
}
