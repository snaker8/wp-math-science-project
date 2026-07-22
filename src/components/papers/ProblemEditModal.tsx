'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  X, Save, Loader2, Sigma, Trash2, AlertCircle,
  Bold, Italic, ImageIcon, Table2, List, Minus, Eye, EyeOff, Link2,
  LineChart, Underline as UnderlineIcon, RefreshCw, Sparkles,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { AdvancedAnalysisModal } from '@/components/workflow/AdvancedAnalysisModal';
import { LaTeXInputModal } from '@/components/editor/LaTeXInputModal';
import RenderRepairPanel from '@/components/papers/RenderRepairPanel';
import { MathsecrTreePicker } from '@/components/papers/MathsecrTreePicker';
import { DiagramBrowserModal } from '@/components/papers/DiagramBrowserModal';
import dynamic from 'next/dynamic';

// GraphModal은 Desmos API 사용하므로 dynamic import
const GraphModal = dynamic(
  () => import('@/components/editor/modals/GraphModal'),
  { ssr: false }
);

// ============================================================================
// Types
// ============================================================================

interface ProblemEditModalProps {
  problemId: string;
  initialContent: string;
  initialSolution: string;
  initialAnswer: Record<string, any>;
  initialChoices?: string[];
  /** 그림 객관식: 선택지별 이미지 URL 초기값 (choices 인덱스 정렬, null = 텍스트 옵션) */
  initialChoiceImages?: (string | null)[];
  initialDifficulty?: number;
  initialCognitiveDomain?: string;
  initialTypeCode?: string;
  initialTypeName?: string;
  /** 본문 도형 이미지 배열 (figure_crop 등) — 모달에서 이미지 추가/저장 */
  initialImages?: Array<{ url: string; type: string; label?: string }>;
  cropImageUrl?: string;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
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
// 에디터 툴바 (기능 동작)
// ============================================================================

function EditorToolbar({
  onInsertMath,
  onBold,
  onItalic,
  onUnderline,
  onInsertImage,
  onInsertTable,
  onInsertList,
  onInsertDivider,
  onInsertLink,
  onInsertGraph,
  onCircleConvert,
  showPreview,
  onTogglePreview,
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
  onInsertGraph: () => void;
  onCircleConvert: () => void;
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
        className="p-1 rounded text-content-tertiary hover:text-content-secondary hover:bg-surface-raised transition-colors" title="굵게 (**text**)">
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onItalic}
        className="p-1 rounded text-content-tertiary hover:text-content-secondary hover:bg-surface-raised transition-colors" title="기울임 (*text*)">
        <Italic className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onUnderline}
        className="p-1 rounded text-content-tertiary hover:text-content-secondary hover:bg-surface-raised transition-colors" title="밑줄">
        <UnderlineIcon className="h-3.5 w-3.5" />
      </button>
      <div className="w-px h-4 bg-zinc-700 mx-0.5" />
      <button type="button" onClick={onInsertImage}
        className="p-1 rounded text-content-tertiary hover:text-content-secondary hover:bg-surface-raised transition-colors" title="이미지 삽입">
        <ImageIcon className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onInsertTable}
        className="p-1 rounded text-content-tertiary hover:text-content-secondary hover:bg-surface-raised transition-colors" title="표 삽입">
        <Table2 className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onInsertList}
        className="p-1 rounded text-content-tertiary hover:text-content-secondary hover:bg-surface-raised transition-colors" title="번호 목록">
        <List className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onInsertDivider}
        className="p-1 rounded text-content-tertiary hover:text-content-secondary hover:bg-surface-raised transition-colors" title="구분선 삽입">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onInsertLink}
        className="p-1 rounded text-content-tertiary hover:text-content-secondary hover:bg-surface-raised transition-colors" title="링크 삽입">
        <Link2 className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onInsertGraph}
        className="p-1 rounded text-green-500 hover:text-green-300 hover:bg-green-500/10 transition-colors" title="그래프 삽입">
        <LineChart className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onCircleConvert}
        className="px-1.5 py-0.5 rounded text-[10px] font-bold text-blue-400 hover:bg-blue-500/10 transition-colors" title="(1)(2)(3) → ①②③ 변환">
        ①②③
      </button>
      <div className="w-px h-4 bg-zinc-700 mx-0.5" />
      <button type="button" onClick={onTogglePreview}
        className={`p-1 rounded transition-colors ${showPreview ? 'text-indigo-400 bg-indigo-500/10' : 'text-content-tertiary hover:text-content-secondary hover:bg-surface-raised'}`}
        title={showPreview ? '미리보기 끄기' : '수식 미리보기'}>
        {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ============================================================================
// 에디터 영역 (항상 textarea + 선택적 미리보기)
// ============================================================================

function EditorPanel({
  label,
  value,
  onChange,
  placeholder,
  textareaRef,
  onOpenLatex,
  onOpenGraph,
  onImageButton,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onOpenLatex: () => void;
  onOpenGraph: () => void;
  /** 있으면 이미지 버튼이 이걸 호출(도식 선택창). 없으면 URL prompt 폴백. */
  onImageButton?: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);

  // 툴바 액션들 — textarea에 직접 삽입
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

  const handleCircleConvert = () => {
    const map: Record<string, string> = { '1': '①', '2': '②', '3': '③', '4': '④', '5': '⑤' };
    onChange(value.replace(/\(([1-5])\)/g, (_, n) => map[n] || _));
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-xl border border/60 bg-surface-card/80 overflow-hidden">
      {/* 레이블 + 툴바 */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-raised/50 border-b border/50">
        <span className="text-xs font-bold text-indigo-400 flex-shrink-0">{label}</span>
        <EditorToolbar
          onInsertMath={onOpenLatex}
          onBold={handleBold}
          onItalic={handleItalic}
          onUnderline={handleUnderline}
          onInsertImage={onImageButton || handleInsertImage}
          onInsertTable={handleInsertTable}
          onInsertList={handleInsertList}
          onInsertDivider={handleInsertDivider}
          onInsertLink={handleInsertLink}
          onInsertGraph={onOpenGraph}
          onCircleConvert={handleCircleConvert}
          showPreview={showPreview}
          onTogglePreview={() => setShowPreview(!showPreview)}
        />
      </div>

      {/* 편집 영역 */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* textarea는 항상 표시 — flex-1로 세로 전체 채움 */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`flex-1 resize-none bg-surface-card px-4 py-3 text-sm text-content-primary leading-relaxed placeholder:text-content-muted focus:outline-none ${
            showPreview ? 'w-1/2 border-r border/50' : 'w-full'
          }`}
          placeholder={placeholder}
          spellCheck={false}
          style={{ minHeight: '200px' }}
        />

        {/* 미리보기 (토글) */}
        {showPreview && (
          <div className="w-1/2 flex-1 overflow-y-auto bg-white px-4 py-3">
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
// 선택지 편집 영역
// ============================================================================

function ChoicesEditor({
  choices,
  onChange,
  correctAnswer,
  onCorrectAnswerChange,
  answerType,
  onAnswerTypeChange,
  subjectiveAnswer,
  onSubjectiveAnswerChange,
  choiceLayout,
  onChoiceLayoutChange,
  isMultipleAnswer,
  onMultipleAnswerChange,
  choiceImages,
  onUploadChoiceImage,
  onRemoveChoiceImage,
  uploadingChoiceIdx,
  onOpenDiagramBrowser,
  choiceHeaders,
  onChoiceHeadersChange,
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
  choiceImages: (string | null)[];
  onUploadChoiceImage: (idx: number, file: File | Blob) => void;
  onRemoveChoiceImage: (idx: number) => void;
  uploadingChoiceIdx: number | null;
  onOpenDiagramBrowser: (idx: number) => void;
  // ★ 표 객관식 헤더 (A/B 등). 길이 0 = 일반 객관식, 1+ = 표 객관식.
  choiceHeaders: string[];
  onChoiceHeadersChange: (h: string[]) => void;
}) {
  const circledNumbers = ['①', '②', '③', '④', '⑤'];

  const handleChoiceChange = (idx: number, value: string) => {
    const newChoices = [...choices];
    newChoices[idx] = value;
    onChange(newChoices);
  };

  // ★ 표 객관식 헤더 핸들러
  const hasHeaders = choiceHeaders.length >= 1;
  const columnCount = hasHeaders ? choiceHeaders.length : 1;
  const handleHeaderChange = (ci: number, v: string) => {
    const next = [...choiceHeaders];
    next[ci] = v;
    onChoiceHeadersChange(next);
  };
  const handleAddColumn = () => {
    if (choiceHeaders.length >= 4) return;
    const defaults = ['A', 'B', 'C', 'D'];
    const next = [...choiceHeaders, defaults[choiceHeaders.length] || ''];
    onChoiceHeadersChange(next);
  };
  const handleRemoveColumn = () => {
    if (choiceHeaders.length === 0) return;
    const next = choiceHeaders.slice(0, -1);
    onChoiceHeadersChange(next);
    const trimmed = choices.map((c) => {
      const parts = c.replace(/^[①②③④⑤]\s*/, '').split(/\s*\|\s*|\s+\/\s+/);
      return parts.slice(0, Math.max(1, next.length || 1)).join(' | ');
    });
    onChange(trimmed);
  };
  const handleEnableTableMode = () => {
    onChoiceHeadersChange(['A', 'B']);
  };
  const handleDisableTableMode = () => {
    onChoiceHeadersChange([]);
    const flattened = choices.map((c) => {
      const parts = c.replace(/^[①②③④⑤]\s*/, '').split(/\s*\|\s*|\s+\/\s+/);
      return parts[0]?.trim() || '';
    });
    onChange(flattened);
  };

  return (
    <div className="rounded-xl border border/60 bg-surface-card/80 overflow-hidden">
      {/* 정답 유형 헤더 — 컴팩트 */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-raised/50 border-b border/50">
        <span className="text-xs font-bold text-content-secondary">정답 유형</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onAnswerTypeChange('objective')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              answerType === 'objective' ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30' : 'text-content-tertiary hover:text-content-secondary border border-transparent'
            }`}>객관식</button>
          <button type="button" onClick={() => onAnswerTypeChange('subjective')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              answerType === 'subjective' ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30' : 'text-content-tertiary hover:text-content-secondary border border-transparent'
            }`}>주관식</button>
        </div>
      </div>

      {answerType === 'objective' ? (
        <div className="px-3 py-2 space-y-1.5">
          {/* 표 객관식 토글 + 레이아웃 옵션 */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={hasHeaders ? handleDisableTableMode : handleEnableTableMode}
              className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition-colors ${
                hasHeaders ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'text-content-tertiary border border hover:text-content-secondary'
              }`}
              title={hasHeaders ? '표 객관식 해제 (헤더 제거, 각 보기는 첫 칸 값만 남김)' : '표 객관식 활성화 (A/B 헤더 추가)'}>
              표 객관식
            </button>
            <div className="flex items-center gap-1 ml-auto">
              {[1, 2, 3, 5].map((cols) => (
                <button key={cols} type="button"
                  disabled={hasHeaders}
                  onClick={() => onChoiceLayoutChange(cols)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                    hasHeaders ? 'text-content-tertiary/40 border border-subtle cursor-not-allowed' :
                    choiceLayout === cols ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30' : 'text-content-tertiary border border hover:text-content-secondary'
                  }`}
                  title={hasHeaders ? '표 객관식 모드는 1줄 고정' : `${cols}줄 레이아웃`}>{cols}줄</button>
              ))}
            </div>
          </div>

          {/* ★ 헤더 입력 영역 — 표 객관식일 때만 표시 */}
          {hasHeaders && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-amber-400 flex-shrink-0">컬럼 헤더</span>
                <div className="flex-1 grid gap-1.5 items-center" style={{ gridTemplateColumns: `1rem repeat(${columnCount}, 1fr) auto` }}>
                  <span />
                  {choiceHeaders.map((h, ci) => (
                    <input
                      key={ci}
                      type="text"
                      value={h}
                      onChange={(e) => handleHeaderChange(ci, e.target.value)}
                      className="rounded border border-amber-500/40 bg-surface-raised px-2 py-0.5 text-xs text-amber-300 font-bold text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                      placeholder={String.fromCharCode(65 + ci)}
                    />
                  ))}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button type="button" onClick={handleRemoveColumn}
                      disabled={choiceHeaders.length <= 1}
                      className="w-5 h-5 rounded text-[10px] font-bold text-amber-400 border border-amber-500/40 bg-surface-raised hover:bg-amber-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="컬럼 제거">−</button>
                    <button type="button" onClick={handleAddColumn}
                      disabled={choiceHeaders.length >= 4}
                      className="w-5 h-5 rounded text-[10px] font-bold text-amber-400 border border-amber-500/40 bg-surface-raised hover:bg-amber-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="컬럼 추가 (최대 4)">+</button>
                  </div>
                </div>
              </div>
              <p className="text-[9px] text-amber-400/70 pl-[3.5rem]">각 선택지를 ` | ` 로 컬럼 구분 (예: `2 | 16 | 2`).</p>
            </div>
          )}

          {/* 선택지 입력 — 컴팩트화 */}
          <div className={`grid gap-1 ${
            hasHeaders ? 'grid-cols-1' :
            choiceLayout === 1 ? 'grid-cols-1' : choiceLayout === 2 ? 'grid-cols-2' : choiceLayout === 3 ? 'grid-cols-3' : 'grid-cols-5'
          }`}>
            {choices.map((choice, i) => {
              const imgUrl = choiceImages[i] || null;
              const isUploading = uploadingChoiceIdx === i;
              const handleCellPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (const item of Array.from(items)) {
                  if (item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    if (blob) {
                      e.preventDefault();
                      onUploadChoiceImage(i, blob);
                      return;
                    }
                  }
                }
              };
              // ★ 표 객관식 모드: 컬럼별 input 분리 (이미지 슬롯 숨김)
              if (hasHeaders) {
                // ★ raw tabular 패턴 자동 인식 (2026-05-25 사고 fix):
                //   과학 자산화 OCR 시 표 객관식이 `& 지권 & 기권 & 생물권 \\` 또는
                //   끝에 `\end{tabular}` 가 박힌 raw 형태로 저장됨 — 변환 누락 케이스.
                //   `|` 만 인식하면 raw 가 첫 셀에 통째로 박혀 사용자가 셀별로 수정 못 함.
                //   `\\` 또는 `\end{tabular}` 또는 ` & ` 패턴이 있으면 raw 로 판정 → `&` 도 분리.
                //   수학 영향 0 — 수학 표 객관식은 `|` 형식으로 박혀 raw 패턴 매칭 안 됨.
                const rawValue = choice
                  .replace(/^[①②③④⑤]\s*/, '')
                  .replace(/^&\s*/, '')                      // 시작 & 제거 (첫 셀 빈 표시)
                  .replace(/\\\\\s*$/, '')                   // 끝 \\ 제거
                  .replace(/\\end\{tabular\}\s*$/, '')       // 끝 \end{tabular} 제거
                  .trim();
                const isRawTabular = /\\\\|\\end\{tabular\}|\s+&\s+/.test(choice);
                const splitRegex = isRawTabular
                  ? /\s*\|\s*|\s+\/\s+|\s*&\s*/              // raw tabular: & 도 셀 구분
                  : /\s*\|\s*|\s+\/\s+/;                     // 일반: 기존 분리
                const cols = rawValue.split(splitRegex).filter(s => s.length > 0);
                while (cols.length < columnCount) cols.push('');
                const handleColChange = (ci: number, v: string) => {
                  const next = [...cols];
                  next[ci] = v;
                  handleChoiceChange(i, next.slice(0, columnCount).join(' | '));
                };
                return (
                  <div key={i} className="flex items-center gap-1">
                    <span className="text-xs text-content-tertiary w-4 text-center flex-shrink-0">{circledNumbers[i]}</span>
                    <div className="flex-1 grid gap-1 min-w-0" style={{ gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}>
                      {cols.slice(0, columnCount).map((col, ci) => (
                        <input
                          key={ci}
                          type="text"
                          value={col}
                          onChange={(e) => handleColChange(ci, e.target.value)}
                          className="rounded-md border border bg-surface-raised px-2 py-0.5 text-xs text-content-primary font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 min-w-0"
                          placeholder={`컬럼 ${ci + 1}`}
                        />
                      ))}
                    </div>
                    {i === choices.length - 1 && choices.length > 2 && (
                      <button type="button" onClick={() => onChange(choices.slice(0, -1))}
                        className="text-content-tertiary hover:text-red-400 transition-colors flex-shrink-0 p-0.5"
                        title="선택지 삭제">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div key={i} className="flex flex-col gap-1" onPaste={handleCellPaste}>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-content-tertiary w-4 text-center flex-shrink-0">{circledNumbers[i]}</span>
                    <input type="text"
                      value={choice.replace(/^[①②③④⑤]\s*/, '')}
                      onChange={(e) => handleChoiceChange(i, e.target.value)}
                      className="flex-1 rounded-md border border bg-surface-raised px-2 py-0.5 text-xs text-content-primary font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 min-w-0"
                      placeholder={`선택지 ${i + 1}`} />
                    {/* 마지막 선택지에 삭제 버튼 (2개 이상일 때) */}
                    {i === choices.length - 1 && choices.length > 2 && (
                      <button type="button" onClick={() => onChange(choices.slice(0, -1))}
                        className="text-content-tertiary hover:text-red-400 transition-colors flex-shrink-0 p-0.5"
                        title="선택지 삭제">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {/* 그림 객관식: 이미지 슬롯 — 본문 도식 교체와 동일 흐름(DiagramBrowserModal) */}
                  <div className="pl-5 flex items-center gap-1.5 flex-wrap">
                    {imgUrl ? (
                      <>
                        <div className="relative inline-block">
                          <img
                            src={imgUrl.match(/\/storage\/v1\/object\/(?:public|sign(?:ed)?)\/source-files\/(.+)/) ? `/api/storage/image?path=${encodeURIComponent(imgUrl.match(/\/storage\/v1\/object\/(?:public|sign(?:ed)?)\/source-files\/(.+)/)![1])}` : imgUrl}
                            alt={`선택지 ${i + 1} 이미지`}
                            className="max-h-20 max-w-full rounded border border bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => onRemoveChoiceImage(i)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[11px] leading-none shadow hover:bg-red-600"
                            title="이미지 제거"
                          >×</button>
                        </div>
                        {/* 교체 버튼 — DiagramBrowserModal 호출 */}
                        <button
                          type="button"
                          onClick={() => onOpenDiagramBrowser(i)}
                          className="text-[10px] inline-flex items-center gap-1 self-start px-1.5 py-0.5 rounded border border-dashed border-zinc-700 text-content-tertiary hover:text-indigo-400 hover:border-indigo-500/50 transition-colors"
                          title="SVG·이미지·도형 DB로 교체"
                        >교체</button>
                      </>
                    ) : (
                      <>
                        {/* 1) 도식 입력 — 본문과 동일 (SVG paste/SVG 파일/이미지 업로드/도형 DB) */}
                        <button
                          type="button"
                          onClick={() => onOpenDiagramBrowser(i)}
                          className="text-[10px] inline-flex items-center gap-1 self-start px-1.5 py-0.5 rounded border border-dashed border-zinc-700 text-content-tertiary hover:text-indigo-400 hover:border-indigo-500/50 transition-colors"
                          title="SVG · 이미지 파일 · 도형 DB"
                        >+ 도식 입력</button>
                        {/* 2) 빠른 클립보드/파일 업로드 (paste 가능) */}
                        <label className={`cursor-pointer text-[10px] inline-flex items-center gap-1 self-start px-1.5 py-0.5 rounded border border-dashed transition-colors ${
                          isUploading
                            ? 'text-content-tertiary border-zinc-700'
                            : 'text-content-tertiary border-zinc-700 hover:text-indigo-400 hover:border-indigo-500/50'
                        }`}>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={isUploading}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) onUploadChoiceImage(i, f);
                              e.target.value = '';
                            }}
                          />
                          {isUploading ? '업로드 중…' : '클립보드 paste'}
                        </label>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* 정답 선택 + 선택지 추가 — 한 줄로 통합 */}
          <div className="flex items-center gap-2 pt-1 border-t border-subtle">
            <span className="text-xs font-medium text-content-secondary">정답 :</span>
            <div className="flex items-center gap-1">
              {circledNumbers.map((num, i) => (
                <button key={i} type="button" onClick={() => onCorrectAnswerChange(i + 1)}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    correctAnswer === i + 1
                      ? 'bg-red-500 text-content-primary ring-2 ring-red-400/50 shadow-lg shadow-red-500/20'
                      : 'bg-surface-raised text-content-tertiary border border hover:border-zinc-500 hover:text-content-secondary'
                  }`}>{num}</button>
              ))}
            </div>
            {/* 선택지 추가 — 같은 줄로 통합 */}
            {choices.length < 5 && (
              <button type="button" onClick={() => onChange([...choices, ''])}
                className="ml-2 px-2 py-0.5 rounded-md border border-dashed border-zinc-600 text-[10px] text-content-tertiary hover:text-indigo-400 hover:border-indigo-500/50 transition-colors">
                + 추가 ({choices.length}/5)
              </button>
            )}
            <label className="flex items-center gap-1 ml-auto text-[11px] text-content-tertiary cursor-pointer">
              <input type="checkbox" checked={isMultipleAnswer} onChange={(e) => onMultipleAnswerChange(e.target.checked)}
                className="w-3 h-3 accent-indigo-500 rounded" />
              복수정답
            </label>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2">
          <label className="block text-xs font-medium text-content-secondary mb-1.5">주관식 정답</label>
          <input type="text" value={subjectiveAnswer} onChange={(e) => onSubjectiveAnswerChange(e.target.value)}
            className="w-full rounded-md border border bg-surface-raised px-2.5 py-1.5 text-sm text-content-primary font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="정답을 입력하세요" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 추가 정보 패널 (우측)
// ============================================================================

function TagManagementPanel({
  difficulty, onDifficultyChange,
  cognitiveDomain, onCognitiveDomainChange,
  typeCode, typeName, onTypeCodeChange, onTypeNameChange,
  correctionReason, onCorrectionReasonChange,
  onGenerateSolution, isGenerating,
  cropImageUrl,
}: {
  difficulty: number; onDifficultyChange: (d: number) => void;
  cognitiveDomain: string; onCognitiveDomainChange: (d: string) => void;
  typeCode: string; typeName: string;
  onTypeCodeChange: (v: string) => void; onTypeNameChange: (v: string) => void;
  correctionReason?: string;
  onCorrectionReasonChange?: (v: string) => void;
  onGenerateSolution: () => void; isGenerating: boolean;
  cropImageUrl?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // 현재 typeCode에서 subject_code 추출 (예: MS09-... → 09). 모달 default로.
  const initialSubjectCode = (typeCode.match(/^MS(\d{2})/) || [])[1] || '09';
  const domains = [
    { key: 'CALCULATION', label: '계산' },
    { key: 'UNDERSTANDING', label: '이해' },
    { key: 'INFERENCE', label: '추론' },
    { key: 'PROBLEM_SOLVING', label: '해결' },
    { key: 'UNASSIGNED', label: '미지정' },
  ];
  // ★ 수학비서 10단계 — 카드 표시(쉬움1~매우어려움10)와 동일
  const difficulties = [
    { key: 1, label: '쉬움1', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' },
    { key: 2, label: '쉬움2', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' },
    { key: 3, label: '보통3', cls: 'border-blue-500/30 bg-blue-500/10 text-blue-400' },
    { key: 4, label: '보통4', cls: 'border-blue-500/30 bg-blue-500/10 text-blue-400' },
    { key: 5, label: '어려움5', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
    { key: 6, label: '어려움6', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
    { key: 7, label: '매우어려움7', cls: 'border-red-600/30 bg-red-600/10 text-red-400' },
    { key: 8, label: '매우어려움8', cls: 'border-red-600/30 bg-red-600/10 text-red-400' },
    { key: 9, label: '매우어려움9', cls: 'border-red-600/30 bg-red-600/10 text-red-400' },
    { key: 10, label: '매우어려움10', cls: 'border-red-600/30 bg-red-600/10 text-red-400' },
  ];

  return (
    <div className="rounded-xl border border/60 bg-surface-card/80 overflow-hidden">
      <div className="px-4 py-2.5 bg-surface-raised/50 border-b border/50">
        <span className="text-xs font-bold text-content-secondary">태그 관리</span>
      </div>
      <div className="p-4 space-y-4">
        {/* 문제 영역 */}
        <div>
          <label className="block text-[11px] font-medium text-content-tertiary mb-1.5">문제 영역</label>
          <div className="flex flex-wrap gap-1">
            {domains.map((d) => (
              <button key={d.key} type="button" onClick={() => onCognitiveDomainChange(d.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  cognitiveDomain === d.key ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30' : 'text-content-tertiary border border hover:text-content-secondary hover:border-zinc-500'
                }`}>{d.label}</button>
            ))}
          </div>
        </div>

        {/* 난이도 — 수학비서 10단계 */}
        <div>
          <label className="block text-[11px] font-medium text-content-tertiary mb-1.5">난이도 지정 (1~10)</label>
          <div className="grid grid-cols-5 gap-1">
            {difficulties.map((d) => (
              <button key={d.key} type="button" onClick={() => onDifficultyChange(d.key)}
                className={`px-1.5 py-1 rounded-md text-[10px] font-medium transition-colors border ${
                  difficulty === d.key
                    ? `${d.cls} ring-1 ring-current`
                    : 'text-content-tertiary border hover:text-content-secondary hover:border-zinc-500'
                }`}>{d.label}</button>
            ))}
          </div>
        </div>

        {/* 채점 방법 */}
        <div>
          <label className="block text-[11px] font-medium text-content-tertiary mb-1.5">채점 방법</label>
          <div className="flex gap-1">
            <button type="button" className="px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">자동 채점</button>
            <button type="button" className="px-2.5 py-1 rounded-md text-xs font-medium text-content-tertiary border border hover:text-content-secondary">자기 채점</button>
          </div>
        </div>

        {/* 유형 코드 */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <input type="text"
              value={typeCode ? `${typeCode}. ${typeName}` : ''}
              onChange={(e) => {
                const parts = e.target.value.split('. ');
                onTypeCodeChange(parts[0] || '');
                onTypeNameChange(parts.slice(1).join('. ') || '');
              }}
              className="flex-1 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-sm text-amber-400 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
              placeholder="유형코드. 유형명" />
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="p-1.5 rounded-lg text-content-tertiary hover:text-indigo-400 hover:bg-surface-raised transition-colors border border"
              title="매쓰싸이 뱅크 분류 트리에서 선택"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
          {/* ★ Phase C-2c-3: 트리 selector 모달 — 직접 텍스트 입력 대체 */}
          <MathsecrTreePicker
            open={pickerOpen}
            initialSubjectCode={initialSubjectCode}
            onSelect={(code, fullPath) => {
              onTypeCodeChange(code);
              onTypeNameChange(fullPath);
            }}
            onClose={() => setPickerOpen(false)}
          />
          {/* ★ Phase C-2c: 분류 보정 이유 — 강사가 왜 보정했는지 메모.
              classification_corrections.reason에 누적 → 다음 분류 호출 시 few-shot에 보정 이유까지 포함 → 정확도 향상. */}
          {onCorrectionReasonChange && (
            <textarea
              value={correctionReason || ''}
              onChange={(e) => onCorrectionReasonChange(e.target.value)}
              placeholder="분류 보정 이유 (선택) — 예: log 보조값 + 매시간 비율 → 식 세우기"
              rows={2}
              className="w-full rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-300 placeholder-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500/50 resize-none"
            />
          )}
        </div>

        {/* 문제 원본 이미지 */}
        <details className="border-t border-subtle pt-3">
          <summary className="text-[11px] font-medium text-content-tertiary cursor-pointer hover:text-content-secondary transition-colors flex items-center justify-between">
            <span>문제 원본 이미지</span>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="mt-2 rounded-lg border border bg-surface-raised p-2 text-center">
            {cropImageUrl ? (
              <img src={cropImageUrl} alt="문제 원본" className="w-full h-auto rounded" />
            ) : (
              <p className="text-xs text-content-muted py-4">원본 이미지 없음</p>
            )}
          </div>
        </details>

        {/* AI 해설 생성 */}
        <details className="border-t border-subtle pt-3">
          <summary className="text-[11px] font-medium text-content-tertiary cursor-pointer hover:text-content-secondary transition-colors flex items-center justify-between">
            <span>AI 해설 생성</span>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="mt-2">
            <button
              type="button"
              onClick={onGenerateSolution}
              disabled={isGenerating}
              className="w-full rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-400 hover:bg-indigo-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  해설 생성 + 검증 중...
                </>
              ) : (
                'AI문 해설 자동 생성'
              )}
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}

// ============================================================================
// ProblemEditModal - 메인 컴포넌트
// ============================================================================

export function ProblemEditModal({
  problemId,
  initialContent,
  initialSolution,
  initialAnswer,
  initialChoices,
  initialChoiceImages,
  initialDifficulty,
  initialCognitiveDomain,
  initialTypeCode,
  initialTypeName,
  initialImages,
  cropImageUrl,
  onClose,
  onSaved,
  onDelete,
}: ProblemEditModalProps) {
  // 텍스트 읽어내기 (OCR)
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const handleReadText = useCallback(async () => {
    if (!cropImageUrl) return;
    setIsOcrLoading(true);
    try {
      // 크롭 이미지 다운로드 → base64
      const imgRes = await fetch(cropImageUrl);
      const imgBlob = await imgRes.blob();
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(imgBlob);
      });
      // reanalyze-crop API 호출
      const res = await fetch('/api/workflow/reanalyze-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, fullAnalysis: false, analyzeGraph: false }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ocrText && data.ocrText.trim()) {
          // ★ 이미지 마커 위치 보존 (2026-05-25 사고 fix):
          //   "텍스트 다시 읽기" 가 OCR 결과로 본문 통째 덮어쓰면 사용자가 카드에서
          //   변경한 이미지 마커 (`![이미지](...)`) 위치 사라짐 → 카드가 마커 없으니
          //   기본 위치 (본문 위) 로 reset + 본문 짤림 사고.
          //   기존 본문 마커를 추출해서 OCR 결과의 앞/뒤에 다시 박는다 (위치 추정).
          //   OCR 결과에 이미 마커가 있으면 (가능성 낮음) 그대로 둠.
          setContent((prevContent) => {
            if (data.ocrText.includes('![')) return data.ocrText;
            const imageMarkerRegex = /!\[[^\]]*\]\([^)]+\)/g;
            const matches = [...prevContent.matchAll(imageMarkerRegex)];
            if (matches.length === 0) return data.ocrText;
            const markersText = matches.map((m) => m[0]).join('\n');
            const totalLen = prevContent.length;
            const firstIdx = matches[0].index ?? 0;
            const isPrefix = firstIdx < totalLen / 2;
            return isPrefix
              ? `${markersText}\n\n${data.ocrText}`
              : `${data.ocrText}\n\n${markersText}`;
          });
          if (data.choices && data.choices.length > 0) {
            setChoices(data.choices.map((c: string) => c.replace(/^[①②③④⑤]\s*/, '')));
          }
        }
      }
    } catch (err) {
      console.error('OCR failed:', err);
    } finally {
      setIsOcrLoading(false);
    }
  }, [cropImageUrl]);

  // 문제 내용
  const [content, setContent] = useState(initialContent);
  const [solution, setSolution] = useState(initialSolution);

  // 선택지 & 정답
  const parsedChoices = useMemo(() => {
    if (initialChoices && initialChoices.length > 0) {
      // ★ raw tabular 자동 정규화 (2026-05-25 사고 fix 2/2):
      //   과학 자산화의 raw `& 지권 & 기권 & 생물권 \\` 가 들어오면 마운트 시점에
      //   자동으로 `"지권 | 기권 | 생물권"` 형식으로 변환해 state 에 박는다.
      //   이전엔 모달 셀별 input 표시는 분리됐지만 (cols 변수 — 렌더링용) state.choices 는
      //   raw 그대로 → 사용자가 셀 수정 안 하고 저장하면 raw 가 PATCH body 에 그대로
      //   박혀 DB 도 raw → 카드 표시 그대로 사고. 마운트 시 state 정규화로 차단.
      //   영향 0 — 이미 `|` 형식인 데이터는 split → join 거치며 동일 결과 (수학 보호).
      return initialChoices.map((choice) => {
        const isRawTabular = /\\\\|\\end\{tabular\}|\s+&\s+/.test(choice);
        if (!isRawTabular) return choice;
        const normalized = choice
          .replace(/^[①②③④⑤]\s*/, '')
          .replace(/^&\s*/, '')
          .replace(/\\\\\s*$/, '')
          .replace(/\\end\{tabular\}\s*$/, '')
          .trim();
        const cells = normalized.split(/\s*\|\s*|\s+\/\s+|\s*&\s*/).filter((s) => s.length > 0);
        if (cells.length === 0) return choice;
        return cells.join(' | ');
      });
    }
    return ['', '', '', '', ''];
  }, [initialChoices]);

  const [choices, setChoices] = useState<string[]>(parsedChoices);

  // ★ 그림 객관식: 선택지별 이미지 URL (choices 인덱스 정렬, null = 텍스트 옵션)
  const initialChoiceImagesPadded = useMemo(() => {
    const arr: (string | null)[] = [null, null, null, null, null];
    if (Array.isArray(initialChoiceImages)) {
      initialChoiceImages.forEach((url, i) => {
        if (i < 5) arr[i] = (typeof url === 'string' && url.length > 0) ? url : null;
      });
    }
    return arr;
  }, [initialChoiceImages]);
  const [choiceImages, setChoiceImages] = useState<(string | null)[]>(initialChoiceImagesPadded);
  const [uploadingChoiceIdx, setUploadingChoiceIdx] = useState<number | null>(null);
  // ★ DiagramBrowserModal 트리거 — 본문 도식 교체와 동일 컴포넌트 재사용.
  //   -1 = 닫힘, 0~4 = 해당 선택지 인덱스로 열림.
  const [choiceDiagramIdx, setChoiceDiagramIdx] = useState<number>(-1);

  // 업로드 헬퍼 — base64 → /api/storage/upload-image 프록시
  const uploadChoiceImage = useCallback(async (idx: number, file: File | Blob) => {
    setUploadingChoiceIdx(idx);
    try {
      const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const path = `problem-crops/choice-images/${problemId}/${idx}-${Date.now()}.${ext}`;
      const res = await fetch('/api/storage/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, path, contentType: file.type || `image/${ext}` }),
      });
      if (!res.ok) throw new Error(`업로드 실패: ${res.status}`);
      const data = await res.json();
      const url = data.publicUrl as string | null;
      if (!url) throw new Error('publicUrl 없음');
      setChoiceImages((prev) => {
        const next = [...prev];
        next[idx] = url;
        return next;
      });
    } catch (e) {
      console.error('[ChoiceImage] upload failed', e);
      alert(`선택지 이미지 업로드 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploadingChoiceIdx(null);
    }
  }, [problemId]);

  const removeChoiceImage = useCallback((idx: number) => {
    setChoiceImages((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  }, []);
  const [answerType, setAnswerType] = useState<AnswerType>(() => {
    // ★ 1순위: answer_json.type 명시값 (short_answer = 서술형)
    const explicitType = (initialAnswer as Record<string, unknown> | undefined)?.type;
    if (explicitType === 'short_answer' || explicitType === 'subjective') return 'subjective';
    if (explicitType === 'multiple_choice' || explicitType === 'objective') return 'objective';

    // ★ 2순위: 선택지가 없으면 무조건 서술형 (객관식은 항상 선택지가 있음)
    if (!initialChoices || initialChoices.length === 0) return 'subjective';

    // ★ 3순위: 정답이 1~5 숫자면 객관식
    const ans = initialAnswer?.correct_answer || initialAnswer?.finalAnswer;
    if (typeof ans === 'number' && ans >= 1 && ans <= 5) return 'objective';
    if (typeof ans === 'string' && /^\d$/.test(ans) && Number(ans) >= 1 && Number(ans) <= 5) return 'objective';

    // 그 외엔 서술형 기본값 (이전엔 객관식이 기본이라 서술형 문제가 객관식으로 잘못 표시됐음)
    return 'subjective';
  });
  const [correctAnswer, setCorrectAnswer] = useState<number>(() => {
    const ans = initialAnswer?.correct_answer || initialAnswer?.finalAnswer;
    if (typeof ans === 'number') return ans >= 1 && ans <= 5 ? ans : 0;
    if (typeof ans === 'string') {
      const s = ans.trim();
      // ★ 동그라미 객관식 답(①~⑤) 복원 — 안 하면 0 으로 기본값 → 저장 시 업로드 답이 0 으로 덮임.
      const circ = ['①', '②', '③', '④', '⑤'].indexOf(s);
      if (circ >= 0) return circ + 1;
      if (/^[1-5]$/.test(s)) return Number(s);
    }
    return 0;
  });
  const [subjectiveAnswer, setSubjectiveAnswer] = useState<string>(() => {
    const ans = initialAnswer?.correct_answer || initialAnswer?.finalAnswer;
    // 객관식(동그라미/1~5)은 subjective 가 아님 — 그 외 문자열만 단답으로 복원
    if (typeof ans === 'string') {
      const s = ans.trim();
      if (['①', '②', '③', '④', '⑤'].includes(s) || /^[1-5]$/.test(s)) return '';
      return ans;
    }
    return '';
  });
  const [choiceLayout, setChoiceLayout] = useState(() => {
    const saved = initialAnswer?.choiceLayout;
    return typeof saved === 'number' && [1, 2, 3, 5].includes(saved) ? saved : 2;
  });
  const [isMultipleAnswer, setIsMultipleAnswer] = useState(false);
  // ★ 표 객관식 헤더 — initialAnswer.choiceHeaders 에서 복원. 빈 배열 = 일반 객관식.
  const [choiceHeaders, setChoiceHeaders] = useState<string[]>(() => {
    const saved = initialAnswer?.choiceHeaders;
    return Array.isArray(saved) && saved.length >= 1 ? (saved as string[]) : [];
  });

  // 태그 정보
  const [difficulty, setDifficulty] = useState(initialDifficulty || 3);
  const [cognitiveDomain, setCognitiveDomain] = useState(initialCognitiveDomain || 'UNDERSTANDING');
  const [typeCode, setTypeCode] = useState(initialTypeCode || '');
  const [typeName, setTypeName] = useState(initialTypeName || '');
  // ★ Phase C-2c: 분류 보정 이유 — 사용자가 type_code 변경 시 메모.
  //   classification_corrections.reason에 누적 → few-shot에 포함.
  const [correctionReason, setCorrectionReason] = useState('');

  // AI 해설 생성
  const [isGeneratingSolution, setIsGeneratingSolution] = useState(false);

  // UI
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLatexModal, setShowLatexModal] = useState(false);
  const [latexTarget, setLatexTarget] = useState<'content' | 'solution'>('content');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showGraphModal, setShowGraphModal] = useState(false);
  const [graphTarget, setGraphTarget] = useState<'content' | 'solution'>('content');
  // ★ 고급 분석(채팅형 수정) 모달 — 1차 분석페이지와 동일 기능
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  // ★ 본문 도형 이미지 — 모달에서 추가/저장 (figure_crop). 클라우드 [도형] 렌더와 연동.
  const [images, setImages] = useState<Array<{ url: string; type: string; label?: string }>>(initialImages || []);
  const [showContentDiagram, setShowContentDiagram] = useState(false);
  // ★ AI 재분석
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [reanalyzeSuccess, setReanalyzeSuccess] = useState(false);

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const solutionRef = useRef<HTMLTextAreaElement>(null);

  // AI 해설 자동 생성 + 교차 검증
  const handleGenerateSolution = useCallback(async () => {
    setIsGeneratingSolution(true);
    setError(null);
    try {
      const res = await fetch(`/api/problems/${problemId}/generate-solution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, choices: choices.filter(c => c.trim()) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '해설 생성 실패');

      // 해설 텍스트를 solution 에디터에 반영
      if (data.solution) {
        setSolution(data.solution);
      }

      // 정답 반영
      if (data.finalAnswer) {
        const ans = String(data.finalAnswer).trim();
        // ①~⑤ → 숫자 변환
        const circledToNum: Record<string, number> = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };
        const numFromCircled = circledToNum[ans];

        if (numFromCircled) {
          // ①~⑤ 형식
          setAnswerType('objective');
          setCorrectAnswer(numFromCircled);
        } else if (/^[1-5]$/.test(ans)) {
          // 숫자 1~5
          setAnswerType('objective');
          setCorrectAnswer(Number(ans));
        } else {
          // 주관식 정답
          setAnswerType('subjective');
          setSubjectiveAnswer(ans);
        }
      }

      // 검증 결과 로그
      if (data.verification) {
        if (data.verification.mismatchFlag) {
          setError(`⚠️ 정답 불일치: 풀이="${data.verification.sonnetAnswer}" vs 검산="${data.verification.verifyAnswer || data.verification.gptoAnswer}" — 확인 필요`);
        }
      }

      console.log(`[ProblemEditModal] Solution generated with ${data.usedModel}, verified: ${data.verification?.verified}`);
      if (data.sonnetError) {
        console.warn(`[ProblemEditModal] ⚠️ Sonnet 실패 원인: ${data.sonnetError}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '해설 생성 중 오류');
    } finally {
      setIsGeneratingSolution(false);
    }
  }, [problemId, content, choices]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLatexModal || showGraphModal || showAdvancedModal || showContentDiagram) return;
        if (showDeleteConfirm) { setShowDeleteConfirm(false); return; }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showLatexModal, showDeleteConfirm, showGraphModal, showAdvancedModal, showContentDiagram]);

  // 저장
  const handleSave = useCallback(async () => {
    // 객관식 정답 미선택 (correctAnswer < 1) 도 저장 허용 — 사용자가 답 모르는 상태에서도
    // 본문/선택지/분류 등 다른 필드 수정 가능해야 함. "0 박힘" 사고는 서버 PATCH 정규화
    // (src/lib/validation/objective-answer.ts isEmptyAnswer → '') 가 차단.
    setIsSaving(true);
    setError(null);
    try {
      const finalAnswer = answerType === 'objective' ? correctAnswer : subjectiveAnswer;
      const circledNumbers = ['①', '②', '③', '④', '⑤'];
      // ★ choices prefix 정규화 — ①②③ / (1)(2)(3) / 1) 1. 등 모두 제거 후 ① 으로 통일
      // ★ 그림 객관식 보존 (2026-05-19): 텍스트 비어있어도 이미지가 있으면
      //   선택지로 유지. 이전엔 filter(Boolean) 이 image-only 선택지를 통째
      //   삭제하고 choiceImages 인덱스도 어긋났던 사고 차단.
      const mapped = choices.map((c, i) => {
        const stripped = c
          .replace(/^[①②③④⑤]\s*/, '')          // ① 제거
          .replace(/^\(\s*[1-5]\s*\)\s*/, '')   // (1) 제거
          .replace(/^[1-5]\s*[).]\s*/, '')      // 1) 또는 1. 제거
          .trim();
        const hasImg = typeof choiceImages[i] === 'string' && (choiceImages[i] as string).length > 0;
        // 텍스트 있으면 `① text`, 없고 이미지 있으면 `①` 만 (placeholder 로 인덱스 유지)
        if (stripped) return `${circledNumbers[i]} ${stripped}`;
        if (hasImg) return circledNumbers[i] || '';
        return '';
      });
      // 마지막 빈 선택지부터 trailing trim — 인덱스는 보존, 끝 빈칸만 제거
      let formattedLen = mapped.length;
      while (formattedLen > 0 && !mapped[formattedLen - 1]) formattedLen--;
      const formattedChoices = mapped.slice(0, formattedLen);

      // ★ 그림 객관식: choiceImages — formattedChoices 길이만큼 자르고, 모두 null 이면 미저장.
      const trimmedChoiceImages = choiceImages.slice(0, formattedChoices.length);
      const hasAnyChoiceImage = trimmedChoiceImages.some((v) => typeof v === 'string' && v.length > 0);

      const res = await fetch(`/api/problems/${problemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_latex: content,
          solution_latex: solution,
          // ★ 본문 도형 이미지 — 모달에서 추가한 figure_crop 포함 저장 (클라우드 [도형] 렌더용)
          images,
          answer_json: {
            ...initialAnswer,
            correct_answer: finalAnswer,
            finalAnswer: finalAnswer,
            choices: formattedChoices,
            // ★ 그림 객관식: 인덱스 정렬된 이미지 URL 배열. 모두 null 이면 키 자체 제거(텍스트 객관식).
            ...(hasAnyChoiceImage ? { choiceImages: trimmedChoiceImages } : { choiceImages: undefined }),
            type: answerType === 'objective' ? 'multiple_choice' : 'short_answer',
            choiceLayout: choiceLayout,
            // ★ 표 객관식 헤더 — trim 후 1개+ 만 박음. 0개면 빈 배열 (모드 해제 의도).
            //    spread 보다 뒤에 와야 initialAnswer 값 덮어쓸 수 있음.
            choiceHeaders: choiceHeaders.map((h) => h.trim()).filter((h) => h.length > 0),
            // ★ 사용자가 모달에서 직접 저장 — 재생성 시 이 답/해설을 보존(덮어쓰지 않음)
            answer_user_edited: true,
            solution_user_edited: true,
            user_edited_at: new Date().toISOString(),
          },
          difficulty,
          type_code: typeCode || undefined,
          cognitive_domain: cognitiveDomain || undefined,
          // ★ Phase C-2c: 분류 보정 이유. type_code가 기존과 다를 때만 PATCH endpoint가
          //   classification_corrections.reason으로 저장. 변경 없으면 무시됨.
          correction_reason: correctionReason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error || `저장 실패 (HTTP ${res.status})`;
        throw new Error(msg);
      }

      // ★ 렌더 수정 학습 — (원본, 수정본) 쌍을 fire-and-forget 으로 저장.
      //   저장 흐름을 막지 않기 위해 await 하지 않고 실패해도 조용히 무시.
      try {
        if (initialContent && content && initialContent !== content) {
          fetch('/api/latex-corrections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              problem_id: problemId,
              source: 'content',
              original: initialContent,
              corrected: content,
            }),
          }).catch(() => { /* ignore */ });
        }
        if (initialSolution && solution && initialSolution !== solution) {
          fetch('/api/latex-corrections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              problem_id: problemId,
              source: 'solution',
              original: initialSolution,
              corrected: solution,
            }),
          }).catch(() => { /* ignore */ });
        }
      } catch { /* 학습 저장 실패는 무시 */ }

      onSaved();
      onClose();
    } catch (err) {
      console.error('[ProblemEdit] Save error:', err);
      setError(err instanceof Error ? err.message : String(err) || '저장 실패');
    } finally {
      setIsSaving(false);
    }
  // ★ choiceLayout / isMultipleAnswer / choiceImages / choiceHeaders 가 deps 에 빠지면
  //   stale closure 로 변경이 저장 안 되던 회귀. 그림 객관식·표 객관식 추가 시 같은 패턴 발생.
  }, [problemId, content, solution, images, initialContent, initialSolution, answerType, correctAnswer, subjectiveAnswer, choices, choiceImages, choiceHeaders, initialAnswer, difficulty, typeCode, cognitiveDomain, choiceLayout, isMultipleAnswer, correctionReason, onSaved, onClose]);

  // ★ AI 재분석: 분류 재실행
  const handleReanalyze = useCallback(async () => {
    if (isReanalyzing) return;
    setIsReanalyzing(true);
    setError(null);
    setReanalyzeSuccess(false);

    try {
      const res = await fetch(`/api/problems/${problemId}/reanalyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanced: true }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `재분석 실패 (HTTP ${res.status})`);
      }

      const result = await res.json();
      const { problem: updatedProblem, classification: updatedClassification } = result;

      // 에디터 필드 갱신
      if (updatedProblem?.content_latex) setContent(updatedProblem.content_latex);
      if (updatedProblem?.solution_latex) setSolution(updatedProblem.solution_latex);

      // 정답 갱신
      if (updatedProblem?.answer_json) {
        const aj = updatedProblem.answer_json;
        const answer = aj.finalAnswer ?? aj.correct_answer ?? '';
        if (typeof answer === 'number' && answer >= 1 && answer <= 5) {
          setAnswerType('objective');
          setCorrectAnswer(answer);
        } else {
          setAnswerType('subjective');
          setSubjectiveAnswer(String(answer));
        }

        // 선택지 갱신
        if (aj.choices && Array.isArray(aj.choices) && aj.choices.length > 0) {
          setChoices(aj.choices.map((c: string) => c.replace(/^[①②③④⑤]\s*/, '')));
        }
      }

      // 분류 갱신
      if (updatedClassification) {
        if (updatedClassification.difficulty) setDifficulty(Number(updatedClassification.difficulty) || 3);
        if (updatedClassification.cognitive_domain) setCognitiveDomain(updatedClassification.cognitive_domain);
        if (updatedClassification.type_code) setTypeCode(updatedClassification.type_code);
        if (updatedClassification.type_name) setTypeName(updatedClassification.type_name);
      }

      setReanalyzeSuccess(true);
      setTimeout(() => setReanalyzeSuccess(false), 3000);
    } catch (err) {
      console.error('[ProblemEdit] Reanalyze error:', err);
      setError(err instanceof Error ? err.message : '재분석 실패');
    } finally {
      setIsReanalyzing(false);
    }
  }, [problemId, isReanalyzing]);

  // 삭제
  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try { onDelete(); onClose(); } finally { setIsDeleting(false); }
  }, [onDelete, onClose]);

  // LaTeX 수식 삽입 핸들러
  const handleLatexInsert = useCallback((latex: string, options: { displayStyle: boolean; block: boolean }) => {
    const wrapper = options.block ? `$$${latex}$$` : `$${latex}$`;
    const targetRef = latexTarget === 'solution' ? solutionRef : contentRef;
    const setter = latexTarget === 'solution' ? setSolution : setContent;
    const currentValue = latexTarget === 'solution' ? solution : content;
    insertAtCursor(targetRef.current, wrapper, currentValue, setter);
    setShowLatexModal(false);
  }, [latexTarget, content, solution]);

  // 그래프 삽입 핸들러
  const handleGraphInsert = useCallback((imageDataUrl: string) => {
    const targetRef = graphTarget === 'solution' ? solutionRef : contentRef;
    const setter = graphTarget === 'solution' ? setSolution : setContent;
    const currentValue = graphTarget === 'solution' ? solution : content;
    // 이미지 data URL을 마크다운 이미지로 삽입
    insertAtCursor(targetRef.current, `\n![그래프](${imageDataUrl})\n`, currentValue, setter);
    setShowGraphModal(false);
  }, [graphTarget, content, solution]);

  const openLatexModal = (target: 'content' | 'solution') => {
    setLatexTarget(target);
    setShowLatexModal(true);
  };

  const openGraphModal = (target: 'content' | 'solution') => {
    setGraphTarget(target);
    setShowGraphModal(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-surface-base/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex flex-col h-[min(92vh,92dvh)] max-h-[900px] w-[95vw] max-w-[1400px] overflow-hidden rounded-2xl border border bg-surface-raised shadow-2xl">
        {/* ======== 헤더 ======== */}
        <div className="flex items-center justify-between border-b border-subtle px-5 py-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-content-primary">문제</span>
            <span className="text-xs text-content-tertiary font-mono bg-surface-raised px-2 py-0.5 rounded-md">
              {problemId.slice(0, 20)}...
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* ★ 고급 분석 — 채팅형 AI 수정 (본문+선택지 통합) */}
            <button
              type="button"
              onClick={() => setShowAdvancedModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 transition-colors"
              title="AI 에게 지시해 본문·선택지를 수정 (채팅형, 여러 번 반복 가능)"
            >
              <Sparkles className="h-3.5 w-3.5" />
              고급 분석
            </button>
            <button type="button" onClick={onClose}
              className="p-2 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-raised transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 에러 */}
        {error && (
          <div className="mx-5 mt-2 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
          </div>
        )}

        {/* ======== 메인: 3열 — min-h 제거하여 작은 모니터에서 저장 버튼 가려지지 않도록 ======== */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* 좌: 문제 에디터 */}
          <div className="flex-1 flex flex-col p-3 min-w-0 overflow-hidden">
            <EditorPanel
              label="문제"
              value={content}
              onChange={setContent}
              placeholder="문제 내용을 입력하세요... (LaTeX: $x^2+1$, 디스플레이: $$\frac{a}{b}$$)"
              textareaRef={contentRef}
              onOpenLatex={() => openLatexModal('content')}
              onOpenGraph={() => openGraphModal('content')}
              onImageButton={() => setShowContentDiagram(true)}
            />
            {/* ★ 렌더 수정 제안 — KaTeX 에러 유발 패턴/학습 규칙 자동 감지 */}
            <RenderRepairPanel
              value={content}
              label="문제"
              onApply={setContent}
              source="content"
            />
            {cropImageUrl && (
              <button
                type="button"
                onClick={handleReadText}
                disabled={isOcrLoading}
                className="mx-3 mb-2 px-3 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-medium flex items-center gap-1.5"
              >
                {isOcrLoading ? '읽는 중...' : '📄 텍스트 읽어내기'}
              </button>
            )}
          </div>

          {/* 중: 해설 에디터 */}
          <div className="flex-1 flex flex-col p-3 min-w-0 overflow-hidden border-l border-subtle">
            <EditorPanel
              label="해설"
              value={solution}
              onChange={setSolution}
              placeholder="풀이 과정을 입력하세요..."
              textareaRef={solutionRef}
              onOpenLatex={() => openLatexModal('solution')}
              onOpenGraph={() => openGraphModal('solution')}
            />
            {/* ★ 해설 렌더 수정 제안 */}
            <RenderRepairPanel
              value={solution}
              label="해설"
              onApply={setSolution}
              source="solution"
            />
          </div>

          {/* 우: 추가 정보 */}
          <div className="w-[400px] flex-shrink-0 border-l border-subtle overflow-y-auto p-3 space-y-3">
            <TagManagementPanel
              difficulty={difficulty} onDifficultyChange={setDifficulty}
              cognitiveDomain={cognitiveDomain} onCognitiveDomainChange={setCognitiveDomain}
              typeCode={typeCode} typeName={typeName}
              onTypeCodeChange={setTypeCode} onTypeNameChange={setTypeName}
              correctionReason={correctionReason}
              onCorrectionReasonChange={setCorrectionReason}
              onGenerateSolution={handleGenerateSolution}
              isGenerating={isGeneratingSolution}
              cropImageUrl={cropImageUrl}
            />
          </div>
        </div>

        {/* ======== 하단: 선택지 — 컴팩트, 위 수정 영역이 더 넓게 ======== */}
        <div className="border-t border-subtle px-3 py-2 flex-shrink-0">
          <ChoicesEditor
            choices={choices} onChange={setChoices}
            correctAnswer={correctAnswer} onCorrectAnswerChange={setCorrectAnswer}
            answerType={answerType} onAnswerTypeChange={setAnswerType}
            subjectiveAnswer={subjectiveAnswer} onSubjectiveAnswerChange={setSubjectiveAnswer}
            choiceLayout={choiceLayout} onChoiceLayoutChange={setChoiceLayout}
            isMultipleAnswer={isMultipleAnswer} onMultipleAnswerChange={setIsMultipleAnswer}
            choiceImages={choiceImages}
            onUploadChoiceImage={uploadChoiceImage}
            onRemoveChoiceImage={removeChoiceImage}
            uploadingChoiceIdx={uploadingChoiceIdx}
            onOpenDiagramBrowser={(idx) => setChoiceDiagramIdx(idx)}
            choiceHeaders={choiceHeaders}
            onChoiceHeadersChange={setChoiceHeaders}
          />
        </div>

        {/* ======== 최하단: 삭제/저장/닫기 ======== */}
        <div className="flex items-center justify-between border-t border-subtle px-5 py-3 flex-shrink-0 bg-surface-card/50">
          <div>
            {onDelete && (
              showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400">정말 삭제하시겠습니까?</span>
                  <button type="button" onClick={handleDelete} disabled={isDeleting}
                    className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-content-primary hover:bg-red-500 transition-colors disabled:opacity-50">
                    {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}삭제
                  </button>
                  <button type="button" onClick={() => setShowDeleteConfirm(false)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-content-secondary hover:text-content-primary transition-colors">취소</button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors">
                  <Trash2 className="h-4 w-4" />삭제
                </button>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* ★ AI 재분석 버튼 */}
            <button type="button" onClick={handleReanalyze} disabled={isReanalyzing || isSaving}
              className={`flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                reanalyzeSuccess
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
              }`}>
              {isReanalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {reanalyzeSuccess ? 'AI 분석 완료' : isReanalyzing ? 'AI 분석 중...' : 'AI 재분석'}
            </button>
            <button type="button" onClick={handleSave} disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-5 py-2 text-sm font-bold text-content-primary transition-colors disabled:opacity-50 shadow-lg shadow-indigo-500/20">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              저장 하기
            </button>
            <button type="button" onClick={onClose}
              className="rounded-lg border border bg-surface-raised px-5 py-2 text-sm font-medium text-content-secondary hover:bg-zinc-700 transition-colors">
              닫기
            </button>
          </div>
        </div>
      </div>

      {/* ★ 본문 도형 이미지 추가 — 도식 선택창(브라우즈/업로드). 선택 시 본문 끝에 [도형] 마커 +
          images 에 figure_crop 추가 → 저장 시 클라우드 페이지에서 [도형]으로 렌더됨. */}
      <DiagramBrowserModal
        isOpen={showContentDiagram}
        onClose={() => setShowContentDiagram(false)}
        currentImageUrl={undefined}
        problemNumber={undefined}
        onSelect={(imageUrl) => {
          setContent((prev) => `${prev.trimEnd()}\n[도형]\n`);
          setImages((prev) => [...prev, { url: imageUrl, type: 'figure_crop', label: '수동 추가 도형' }]);
          setShowContentDiagram(false);
        }}
      />

      {/* ★ 고급 분석(채팅형 수정) 모달 — 본문+선택지를 AI 지시로 정제 */}
      {showAdvancedModal && (
        <AdvancedAnalysisModal
          initialContent={content}
          initialChoices={choices}
          onApply={(finalContent, finalChoices) => {
            setContent(finalContent);
            // choices state 는 ① prefix 없이 보관 (기존 컨벤션) — prefix 제거 후 주입
            setChoices(finalChoices.map((c) => c.replace(/^[①②③④⑤]\s*/, '').trim()));
            setShowAdvancedModal(false);
          }}
          onCancel={() => setShowAdvancedModal(false)}
        />
      )}

      {/* LaTeX 수식 입력 모달 */}
      {showLatexModal && (
        <LaTeXInputModal
          onInsert={handleLatexInsert}
          onCancel={() => setShowLatexModal(false)}
        />
      )}

      {/* 그래프 모달 (Desmos) */}
      {showGraphModal && (
        <GraphModal
          isOpen={showGraphModal}
          onClose={() => setShowGraphModal(false)}
          onInsert={(imageDataUrl) => handleGraphInsert(imageDataUrl)}
        />
      )}

      {/* 그림 객관식: 선택지별 도식 입력 — 본문 도식 교체와 동일 컴포넌트 재사용 */}
      <DiagramBrowserModal
        isOpen={choiceDiagramIdx >= 0}
        onClose={() => setChoiceDiagramIdx(-1)}
        currentImageUrl={choiceDiagramIdx >= 0 ? (choiceImages[choiceDiagramIdx] || undefined) : undefined}
        problemNumber={undefined}
        onSelect={(imageUrl) => {
          if (choiceDiagramIdx >= 0) {
            setChoiceImages((prev) => {
              const next = [...prev];
              next[choiceDiagramIdx] = imageUrl;
              return next;
            });
          }
          setChoiceDiagramIdx(-1);
        }}
      />
    </div>
  );
}
