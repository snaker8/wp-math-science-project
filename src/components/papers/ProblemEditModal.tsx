'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  X, Save, Loader2, Sigma, Trash2, AlertCircle,
  Bold, Italic, ImageIcon, Table2, List, Minus, Eye, EyeOff, Link2,
  LineChart, Underline as UnderlineIcon,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { LaTeXInputModal } from '@/components/editor/LaTeXInputModal';
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
  initialDifficulty?: number;
  initialCognitiveDomain?: string;
  initialTypeCode?: string;
  initialTypeName?: string;
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
        className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="굵게 (**text**)">
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onItalic}
        className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="기울임 (*text*)">
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
        className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="구분선 삽입">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onInsertLink}
        className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="링크 삽입">
        <Link2 className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onInsertGraph}
        className="p-1 rounded text-green-500 hover:text-green-300 hover:bg-green-500/10 transition-colors" title="그래프 삽입">
        <LineChart className="h-3.5 w-3.5" />
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onOpenLatex: () => void;
  onOpenGraph: () => void;
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

  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
      {/* 레이블 + 툴바 */}
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
          onInsertGraph={onOpenGraph}
          showPreview={showPreview}
          onTogglePreview={() => setShowPreview(!showPreview)}
        />
      </div>

      {/* 편집 영역 */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* textarea는 항상 표시 */}
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

        {/* 미리보기 (토글) */}
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
// 추가 정보 패널 (우측)
// ============================================================================

function TagManagementPanel({
  difficulty, onDifficultyChange,
  cognitiveDomain, onCognitiveDomainChange,
  typeCode, typeName, onTypeCodeChange, onTypeNameChange,
}: {
  difficulty: number; onDifficultyChange: (d: number) => void;
  cognitiveDomain: string; onCognitiveDomainChange: (d: string) => void;
  typeCode: string; typeName: string;
  onTypeCodeChange: (v: string) => void; onTypeNameChange: (v: string) => void;
}) {
  const domains = [
    { key: 'CALCULATION', label: '계산' },
    { key: 'UNDERSTANDING', label: '이해' },
    { key: 'INFERENCE', label: '추론' },
    { key: 'PROBLEM_SOLVING', label: '해결' },
    { key: 'UNASSIGNED', label: '미지정' },
  ];
  const difficulties = [
    { key: 5, label: '최상' }, { key: 4, label: '상' }, { key: 3, label: '중' },
    { key: 2, label: '하' }, { key: 1, label: '최하' },
  ];

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
      <div className="px-4 py-2.5 bg-zinc-800/50 border-b border-zinc-700/50">
        <span className="text-xs font-bold text-zinc-300">태그 관리</span>
      </div>
      <div className="p-4 space-y-4">
        {/* 문제 영역 */}
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">문제 영역</label>
          <div className="flex flex-wrap gap-1">
            {domains.map((d) => (
              <button key={d.key} type="button" onClick={() => onCognitiveDomainChange(d.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  cognitiveDomain === d.key ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30' : 'text-zinc-500 border border-zinc-700 hover:text-zinc-300 hover:border-zinc-500'
                }`}>{d.label}</button>
            ))}
          </div>
        </div>

        {/* 난이도 */}
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">난이도 지정</label>
          <div className="flex flex-wrap gap-1">
            {difficulties.map((d) => (
              <button key={d.key} type="button" onClick={() => onDifficultyChange(d.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  difficulty === d.key ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30' : 'text-zinc-500 border border-zinc-700 hover:text-zinc-300 hover:border-zinc-500'
                }`}>{d.label}</button>
            ))}
          </div>
        </div>

        {/* 채점 방법 */}
        <div>
          <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">채점 방법</label>
          <div className="flex gap-1">
            <button type="button" className="px-2.5 py-1 rounded-md text-xs font-medium bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">자동 채점</button>
            <button type="button" className="px-2.5 py-1 rounded-md text-xs font-medium text-zinc-500 border border-zinc-700 hover:text-zinc-300">자기 채점</button>
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
            <button type="button" className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors border border-zinc-700" title="유형 검색">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
        </div>

        {/* 문제 원본 이미지 */}
        <details className="border-t border-zinc-800 pt-3">
          <summary className="text-[11px] font-medium text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors flex items-center justify-between">
            <span>문제 원본 이미지</span>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-800 p-4 text-center">
            <p className="text-xs text-zinc-600">원본 이미지 없음</p>
          </div>
        </details>

        {/* AI 해설 생성 */}
        <details className="border-t border-zinc-800 pt-3">
          <summary className="text-[11px] font-medium text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors flex items-center justify-between">
            <span>AI 해설 생성</span>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="mt-2">
            <button type="button" className="w-full rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors">
              AI로 해설 자동 생성
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
  initialDifficulty,
  initialCognitiveDomain,
  initialTypeCode,
  initialTypeName,
  onClose,
  onSaved,
  onDelete,
}: ProblemEditModalProps) {
  // 문제 내용
  const [content, setContent] = useState(initialContent);
  const [solution, setSolution] = useState(initialSolution);

  // 선택지 & 정답
  const parsedChoices = useMemo(() => {
    if (initialChoices && initialChoices.length > 0) return initialChoices;
    return ['', '', '', '', ''];
  }, [initialChoices]);

  const [choices, setChoices] = useState<string[]>(parsedChoices);
  const [answerType, setAnswerType] = useState<AnswerType>(() => {
    const ans = initialAnswer?.correct_answer || initialAnswer?.finalAnswer;
    if (typeof ans === 'number' && ans >= 1 && ans <= 5) return 'objective';
    if (typeof ans === 'string' && /^\d$/.test(ans) && Number(ans) >= 1 && Number(ans) <= 5) return 'objective';
    return ans ? 'subjective' : 'objective';
  });
  const [correctAnswer, setCorrectAnswer] = useState<number>(() => {
    const ans = initialAnswer?.correct_answer || initialAnswer?.finalAnswer;
    if (typeof ans === 'number') return ans;
    if (typeof ans === 'string' && /^\d$/.test(ans)) return Number(ans);
    return 0;
  });
  const [subjectiveAnswer, setSubjectiveAnswer] = useState<string>(() => {
    const ans = initialAnswer?.correct_answer || initialAnswer?.finalAnswer;
    if (typeof ans === 'string' && !/^\d$/.test(ans)) return ans;
    return '';
  });
  const [choiceLayout, setChoiceLayout] = useState(2);
  const [isMultipleAnswer, setIsMultipleAnswer] = useState(false);

  // 태그 정보
  const [difficulty, setDifficulty] = useState(initialDifficulty || 3);
  const [cognitiveDomain, setCognitiveDomain] = useState(initialCognitiveDomain || 'UNDERSTANDING');
  const [typeCode, setTypeCode] = useState(initialTypeCode || '');
  const [typeName, setTypeName] = useState(initialTypeName || '');

  // UI
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLatexModal, setShowLatexModal] = useState(false);
  const [latexTarget, setLatexTarget] = useState<'content' | 'solution'>('content');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showGraphModal, setShowGraphModal] = useState(false);
  const [graphTarget, setGraphTarget] = useState<'content' | 'solution'>('content');

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const solutionRef = useRef<HTMLTextAreaElement>(null);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLatexModal || showGraphModal) return;
        if (showDeleteConfirm) { setShowDeleteConfirm(false); return; }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showLatexModal, showDeleteConfirm, showGraphModal]);

  // 저장
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const finalAnswer = answerType === 'objective' ? correctAnswer : subjectiveAnswer;
      const circledNumbers = ['①', '②', '③', '④', '⑤'];
      const formattedChoices = choices.map((c, i) => {
        const stripped = c.replace(/^[①②③④⑤]\s*/, '');
        return stripped ? `${circledNumbers[i]} ${stripped}` : '';
      }).filter(Boolean);

      const res = await fetch(`/api/problems/${problemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_latex: content,
          solution_latex: solution,
          answer_json: {
            ...initialAnswer,
            correct_answer: finalAnswer,
            finalAnswer: finalAnswer,
            choices: formattedChoices,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error('[ProblemEdit] Save error:', err);
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setIsSaving(false);
    }
  }, [problemId, content, solution, answerType, correctAnswer, subjectiveAnswer, choices, initialAnswer, onSaved, onClose]);

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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex flex-col h-[92vh] w-[95vw] max-w-[1400px] overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
        {/* ======== 헤더 ======== */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-white">문제</span>
            <span className="text-xs text-zinc-500 font-mono bg-zinc-800 px-2 py-0.5 rounded-md">
              {problemId.slice(0, 20)}...
            </span>
          </div>
          <button type="button" onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 에러 */}
        {error && (
          <div className="mx-5 mt-2 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
          </div>
        )}

        {/* ======== 메인: 3열 ======== */}
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
            />
          </div>

          {/* 중: 해설 에디터 */}
          <div className="flex-1 flex flex-col p-3 min-w-0 overflow-hidden border-l border-zinc-800">
            <EditorPanel
              label="해설"
              value={solution}
              onChange={setSolution}
              placeholder="풀이 과정을 입력하세요..."
              textareaRef={solutionRef}
              onOpenLatex={() => openLatexModal('solution')}
              onOpenGraph={() => openGraphModal('solution')}
            />
          </div>

          {/* 우: 추가 정보 */}
          <div className="w-[280px] flex-shrink-0 border-l border-zinc-800 overflow-y-auto p-3 space-y-3">
            <TagManagementPanel
              difficulty={difficulty} onDifficultyChange={setDifficulty}
              cognitiveDomain={cognitiveDomain} onCognitiveDomainChange={setCognitiveDomain}
              typeCode={typeCode} typeName={typeName}
              onTypeCodeChange={setTypeCode} onTypeNameChange={setTypeName}
            />
          </div>
        </div>

        {/* ======== 하단: 선택지 ======== */}
        <div className="border-t border-zinc-800 px-5 py-3 flex-shrink-0">
          <ChoicesEditor
            choices={choices} onChange={setChoices}
            correctAnswer={correctAnswer} onCorrectAnswerChange={setCorrectAnswer}
            answerType={answerType} onAnswerTypeChange={setAnswerType}
            subjectiveAnswer={subjectiveAnswer} onSubjectiveAnswerChange={setSubjectiveAnswer}
            choiceLayout={choiceLayout} onChoiceLayoutChange={setChoiceLayout}
            isMultipleAnswer={isMultipleAnswer} onMultipleAnswerChange={setIsMultipleAnswer}
          />
        </div>

        {/* ======== 최하단: 삭제/저장/닫기 ======== */}
        <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-3 flex-shrink-0 bg-zinc-900/50">
          <div>
            {onDelete && (
              showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400">정말 삭제하시겠습니까?</span>
                  <button type="button" onClick={handleDelete} disabled={isDeleting}
                    className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500 transition-colors disabled:opacity-50">
                    {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}삭제
                  </button>
                  <button type="button" onClick={() => setShowDeleteConfirm(false)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors">취소</button>
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
            <button type="button" onClick={handleSave} disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-5 py-2 text-sm font-bold text-white transition-colors disabled:opacity-50 shadow-lg shadow-cyan-500/20">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              저장 하기
            </button>
            <button type="button" onClick={onClose}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-5 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors">
              닫기
            </button>
          </div>
        </div>
      </div>

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
    </div>
  );
}
