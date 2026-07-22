'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Pencil,
  PlusCircle,
  RotateCcw,
  AlertCircle,
  Loader2,
  Wand2,
  ChevronRight,
  ChevronDown,
  Check,
  ArrowRight,
  X,
  Minus,
  Plus,
  Printer,
  FileEdit,
  Download,
  Search,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSubjectTrack } from '@/contexts/SubjectTrackContext';
import { Beaker } from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { EditableExamHeader, HEADER_THEMES, HeaderDesignGallery } from '@/components/exam/EditableExamHeader';
import { TemplateSelector } from '@/components/exam/TemplateSelector';
import { DEFAULT_EXAM_META, type ExamMeta } from '@/config/exam-templates';
import { downloadPDF } from '@/lib/pdf/generator';

// ============================================================================
// Types
// ============================================================================

interface MathsecrNode {
  t: string; // text
  c: string; // code
  ch?: MathsecrNode[];
}

interface SubjectInfo {
  code: string;
  name: string;
}

type CreateMode = 'auto' | 'manual';
type DifficultyLevel = '최상' | '상' | '중' | '하' | '최하';
type PreviewTab = '시험지' | '빠른정답' | '해설지';

interface PreviewProblem {
  id: string;
  number: number;
  content: string;
  typeCode: string;
  typeName: string;
  difficulty: number;
  choices: string[];
  answer: string | number;
  solution: string;
  source: string;
}

interface SearchProblem {
  id: string;
  content: string;
  typeCode: string;
  typeName: string;
  difficulty: number;
  choices: string[];
  answer: string | number;
  source: string;
  year: string;
  alreadyInExam: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DIFF_LEVEL_MAP: Record<DifficultyLevel, string> = {
  '최상': '5', '상': '4', '중': '3', '하': '2', '최하': '1',
};

const DIFF_COLORS: Record<DifficultyLevel, { bg: string; text: string; border: string }> = {
  '최상': { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/30' },
  '상':   { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  '중':   { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  '하':   { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  '최하': { bg: 'bg-zinc-500/20', text: 'text-zinc-400', border: 'border-zinc-500/30' },
};

const DIFF_BADGE: Record<number, { label: string; cls: string }> = {
  1: { label: '최하', cls: 'border-zinc-500 bg-zinc-500/10 text-zinc-400' },
  2: { label: '하', cls: 'border-blue-500 bg-blue-500/10 text-blue-400' },
  3: { label: '중', cls: 'border-amber-500 bg-amber-500/10 text-amber-400' },
  4: { label: '상', cls: 'border-red-500 bg-red-500/10 text-red-400' },
  5: { label: '최상', cls: 'border-red-700 bg-red-700/10 text-red-300' },
};

// ============================================================================
// Sub Components
// ============================================================================

function StepBadge({ number, active }: { number: number; active?: boolean }) {
  return (
    <span className={`
      flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors
      ${active ? 'bg-indigo-500 text-white' : 'bg-zinc-700 text-content-secondary'}
    `}>
      {number}
    </span>
  );
}

// ============================================================================
// Column 1: Mathsecr Tree Panel
// ============================================================================

function MathsecrTreePanel({
  tree,
  subjectCode,
  selectedL2Keys,
  onToggleL1,
  onToggleL2,
  onToggleL3,
  selectedL3Keys,
}: {
  tree: MathsecrNode | null;
  subjectCode: string;
  selectedL2Keys: Set<string>;
  selectedL3Keys: Set<string>;
  onToggleL1: (l1: MathsecrNode) => void;
  onToggleL2: (l1: MathsecrNode, l2: MathsecrNode) => void;
  onToggleL3: (key: string) => void;
}) {
  const [expandedL1, setExpandedL1] = useState<Set<string>>(new Set());
  const [expandedL2, setExpandedL2] = useState<Set<string>>(new Set());

  if (!tree || !tree.ch) return null;

  const toggleExpandL1 = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    setExpandedL1(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const toggleExpandL2 = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    setExpandedL2(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-0.5">
      {tree.ch.map((l1, l1Idx) => {
        const l1Key = `${subjectCode}-${l1.c}`;
        const isL1Expanded = expandedL1.has(l1Key);
        // L1 selected if ALL its L2 children are selected
        const l2Children = l1.ch || [];
        const l2SelectedCount = l2Children.filter(l2 => {
          const l2Key = `${l1Key}-${l2.c}`;
          return selectedL2Keys.has(l2Key);
        }).length;
        const isL1Selected = l2Children.length > 0 && l2SelectedCount === l2Children.length;
        const isL1Partial = l2SelectedCount > 0 && l2SelectedCount < l2Children.length;

        return (
          <div key={l1Key}>
            {/* L1: 대단원 */}
            <div className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-all ${
              isL1Selected
                ? 'bg-indigo-500/10 text-indigo-300'
                : 'text-content-secondary hover:bg-surface-raised/50 hover:text-content-primary'
            }`}>
              <button type="button" onClick={(e) => toggleExpandL1(e, l1Key)} className="p-0.5 shrink-0">
                {isL1Expanded ? <ChevronDown size={14} className="text-content-muted" /> : <ChevronRight size={14} className="text-content-muted" />}
              </button>
              <button type="button" onClick={() => onToggleL1(l1)} className="flex items-center gap-2 flex-1 text-left">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isL1Selected ? 'border-indigo-500 bg-indigo-500'
                  : isL1Partial ? 'border-indigo-400 bg-indigo-500/40'
                  : 'border-zinc-600'
                }`}>
                  {(isL1Selected || isL1Partial) && <Check size={9} className="text-white" />}
                </div>
                <span className="font-medium">{l1Idx + 1}. {l1.t}</span>
              </button>
            </div>

            {/* L2: 중단원 */}
            <AnimatePresence>
              {isL1Expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="overflow-hidden"
                >
                  <div className="ml-6 space-y-0.5 border-l border-subtle pl-2 py-0.5">
                    {l2Children.map((l2, l2Idx) => {
                      const l2Key = `${l1Key}-${l2.c}`;
                      const isL2Expanded = expandedL2.has(l2Key);
                      const l3Children = l2.ch || [];
                      const l3SelectedCount = l3Children.filter(l3 => selectedL3Keys.has(`${l2Key}-${l3.c}`)).length;
                      const isL2Selected = selectedL2Keys.has(l2Key);
                      const isL2Partial = l3SelectedCount > 0 && l3SelectedCount < l3Children.length;

                      return (
                        <div key={l2Key}>
                          <div className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-all ${
                            isL2Selected
                              ? 'bg-blue-500/10 text-blue-300'
                              : 'text-content-tertiary hover:bg-surface-raised/30 hover:text-content-secondary'
                          }`}>
                            {l3Children.length > 0 && (
                              <button type="button" onClick={(e) => toggleExpandL2(e, l2Key)} className="p-0.5 shrink-0">
                                {isL2Expanded ? <ChevronDown size={12} className="text-content-muted" /> : <ChevronRight size={12} className="text-content-muted" />}
                              </button>
                            )}
                            {l3Children.length === 0 && <span className="w-5" />}
                            <button type="button" onClick={() => onToggleL2(l1, l2)} className="flex items-center gap-2 flex-1 text-left">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                isL2Selected ? 'border-blue-500 bg-blue-500'
                                : isL2Partial ? 'border-blue-400 bg-blue-500/40'
                                : 'border-zinc-600'
                              }`}>
                                {(isL2Selected || isL2Partial) && <Check size={9} className="text-white" />}
                              </div>
                              <span className={`text-[10px] font-bold shrink-0 ${isL2Selected ? 'text-blue-400' : 'text-content-muted'}`}>
                                {l1Idx + 1}.{l2Idx + 1}
                              </span>
                              <span className="flex-1 text-left truncate">{l2.t}</span>
                            </button>
                          </div>

                          {/* L3: 소단원 */}
                          <AnimatePresence>
                            {isL2Expanded && l3Children.length > 0 && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.1 }}
                                className="overflow-hidden"
                              >
                                <div className="ml-6 space-y-0.5 border-l border-subtle/50 pl-2 py-0.5">
                                  {l3Children.map((l3, l3Idx) => {
                                    const l3Key = `${l2Key}-${l3.c}`;
                                    const isL3Selected = selectedL3Keys.has(l3Key);

                                    return (
                                      <button
                                        key={l3Key}
                                        type="button"
                                        onClick={() => onToggleL3(l3Key)}
                                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-[11px] transition-all ${
                                          isL3Selected
                                            ? 'bg-emerald-500/10 text-emerald-300'
                                            : 'text-content-tertiary hover:bg-surface-raised/20 hover:text-content-secondary'
                                        }`}
                                      >
                                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                          isL3Selected ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600'
                                        }`}>
                                          {isL3Selected && <Check size={8} className="text-white" />}
                                        </div>
                                        <span className={`text-[9px] font-bold shrink-0 ${isL3Selected ? 'text-emerald-400' : 'text-content-muted'}`}>
                                          {l3Idx + 1}
                                        </span>
                                        <span className="flex-1 text-left truncate">{l3.t}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Column 2: Type Detail Panel (세부유형)
// ============================================================================

function TypeDetailPanel({
  typeGroups,
  selectedTypeItems,
  onToggleType,
  onSelectAllGroup,
  onChangeTypeCount,
}: {
  typeGroups: { label: string; key: string; items: { code: string; name: string; typeCode: string }[] }[];
  selectedTypeItems: Map<string, number>;
  onToggleType: (typeCode: string) => void;
  onSelectAllGroup: (key: string, items: { typeCode: string }[]) => void;
  onChangeTypeCount: (typeCode: string, count: number) => void;
}) {
  if (typeGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
        <AlertCircle size={24} className="text-content-muted" />
        <p className="text-xs text-content-muted text-center leading-relaxed">
          왼쪽에서 단원을 선택하면<br />세부 유형이 여기에 표시됩니다
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {typeGroups.map((group) => (
        <div key={group.key}>
          <div className="flex items-center justify-between px-3 py-2 sticky top-0 bg-surface-raised/95 backdrop-blur-sm z-10 border-b border-subtle">
            <span className="text-xs font-bold text-content-secondary truncate flex-1">
              {group.label}
            </span>
            <button
              type="button"
              onClick={() => onSelectAllGroup(group.key, group.items)}
              className="text-[10px] text-blue-400 hover:text-blue-300 font-medium shrink-0 ml-2"
            >
              전체 선택
            </button>
          </div>

          <div className="space-y-0.5 px-1">
            {group.items.map((item, idx) => {
              const isSelected = selectedTypeItems.has(item.typeCode);
              const count = selectedTypeItems.get(item.typeCode) || 0;

              return (
                <div
                  key={item.typeCode}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-500/10 text-blue-300 ring-1 ring-blue-500/20'
                      : 'text-content-tertiary hover:bg-surface-raised/30 hover:text-content-secondary'
                  }`}
                  onClick={() => onToggleType(item.typeCode)}
                >
                  <span className="font-mono text-[10px] text-content-muted shrink-0 w-6">{idx + 1}.</span>
                  <span className="flex-1 text-left truncate">{item.name}</span>

                  {isSelected && (
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <Check size={10} className="text-blue-400" />
                      <button onClick={() => onChangeTypeCount(item.typeCode, Math.max(1, count - 1))} className="p-0.5 text-blue-400 hover:text-blue-300">
                        <Minus size={10} />
                      </button>
                      <span className="text-blue-400 font-bold w-4 text-center">{count}</span>
                      <button onClick={() => onChangeTypeCount(item.typeCode, count + 1)} className="p-0.5 text-blue-400 hover:text-blue-300">
                        <Plus size={10} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Column 2 (Manual Mode): Problem Search Panel
// ============================================================================

function ManualSearchPanel({
  subjectCode,
  selectedTypeCodes,
  manualSelected,
  onToggleSelect,
}: {
  subjectCode: string;
  selectedTypeCodes: string[];
  manualSelected: Set<string>;
  onToggleSelect: (id: string, problem: SearchProblem) => void;
}) {
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [results, setResults] = useState<SearchProblem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (difficulty) params.set('difficulty', difficulty);
      // ★ 선택된 typeCode 전체를 쉼표 구분으로 전달 (OR 검색)
      const tc = selectedTypeCodes.length > 0
        ? selectedTypeCodes.join(',')
        : subjectCode ? `MS${subjectCode}` : '';
      if (tc) params.set('typeCode', tc);
      params.set('limit', '30');

      const res = await fetch(`/api/problems/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.problems || []);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [query, difficulty, subjectCode, selectedTypeCodes]);

  // 엔터키 검색
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-subtle space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="키워드 검색..."
              className="w-full rounded-md border border-subtle bg-surface-raised pl-8 pr-3 py-1.5 text-xs text-content-primary placeholder:text-content-muted focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <select
            value={difficulty}
            onChange={e => setDifficulty(e.target.value)}
            className="rounded-md border border-subtle bg-surface-raised px-2 py-1.5 text-xs text-content-primary focus:border-indigo-500 focus:outline-none"
          >
            <option value="">난이도</option>
            <option value="1">최하</option>
            <option value="2">하</option>
            <option value="3">중</option>
            <option value="4">상</option>
            <option value="5">최상</option>
          </select>
          <button
            type="button"
            onClick={handleSearch}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-500 disabled:opacity-50 transition-colors shrink-0"
          >
            {isLoading ? <Loader2 size={12} className="animate-spin" /> : '검색'}
          </button>
        </div>
        {manualSelected.size > 0 && (
          <div className="text-[10px] text-blue-400 font-medium">
            {manualSelected.size}개 문제 선택됨
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto p-2 space-y-2 scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 gap-2">
            <Loader2 size={16} className="animate-spin text-content-muted" />
            <span className="text-xs text-content-muted">검색 중...</span>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Search size={20} className="text-content-muted" />
            <span className="text-xs text-content-muted text-center">
              {hasSearched ? '검색 결과가 없습니다' : '키워드로 문제를 검색하세요'}
            </span>
          </div>
        ) : (
          results.map((p) => {
            const isSelected = manualSelected.has(p.id);
            const diffBadge = DIFF_BADGE[p.difficulty] || DIFF_BADGE[3];

            return (
              <div
                key={p.id}
                onClick={() => onToggleSelect(p.id, p)}
                className={`rounded-lg border p-3 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500/30'
                    : 'border-subtle bg-surface-card/80 hover:border-accent/30'
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* Checkbox */}
                  <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-zinc-600'
                  }`}>
                    {isSelected && <Check size={10} className="text-white" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Badges */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${diffBadge.cls}`}>
                        {diffBadge.label}
                      </span>
                      {p.typeCode && (
                        <span className="text-[9px] font-mono text-content-muted">{p.typeCode}</span>
                      )}
                      {p.source && (
                        <span className="text-[9px] text-content-muted truncate">{p.source}</span>
                      )}
                    </div>

                    {/* Content preview */}
                    <div className="text-xs text-content-secondary line-clamp-3">
                      <MixedContentRenderer content={p.content} className="text-xs" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Column 3: Exam Preview Panel
// ============================================================================

function ExamPreviewPanel({
  previewTab,
  onTabChange,
  problems,
  isLoading,
  paperName,
  categoryLabel,
  totalQuestions,
  layout,
  onLayoutChange,
  gap,
  onGapChange,
  templateId,
  examMeta,
  onOpenTemplateModal,
  previewRef,
  onDownloadPDF,
  isPDFGenerating,
}: {
  previewTab: PreviewTab;
  onTabChange: (tab: PreviewTab) => void;
  problems: PreviewProblem[];
  isLoading: boolean;
  paperName: string;
  categoryLabel: string;
  totalQuestions: number;
  layout: 'single' | 'two-column';
  onLayoutChange: (layout: 'single' | 'two-column') => void;
  gap: number;
  onGapChange: (gap: number) => void;
  templateId: string;
  examMeta: ExamMeta;
  onOpenTemplateModal: () => void;
  previewRef: React.MutableRefObject<HTMLDivElement | null>;
  onDownloadPDF: () => void;
  isPDFGenerating: boolean;
}) {
  const tabs: PreviewTab[] = ['시험지', '빠른정답', '해설지'];
  // ★ 헤더 디자인(테마+색) — cloud/exam-management 와 동일한 디자인 갤러리 연동
  const [headerColor, setHeaderColor] = useState<string | null>(null);
  const [headerTheme, setHeaderTheme] = useState<string>('none');
  const [showDesignGallery, setShowDesignGallery] = useState(false);

  const midIdx = Math.ceil(problems.length / 2);
  const leftProblems = problems.slice(0, midIdx);
  const rightProblems = problems.slice(midIdx);

  const hasLatex = (text: string) => /[$\\]/.test(text);
  const shouldStackChoices = (choices: string[]) =>
    choices.some((c) => hasLatex(c) || c.length > 20);

  // 문제 렌더 함수 (중복 제거)
  const renderProblem = (p: PreviewProblem) => (
    <div key={p.id} className="break-inside-avoid" style={{ marginBottom: `${gap}px` }}>
      <div className="flex items-start gap-1.5">
        <span className="text-sm font-bold text-gray-900 shrink-0 pt-0.5" style={{ minWidth: '24px' }}>
          {p.number}.
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-800 leading-relaxed">
            <MixedContentRenderer content={p.content} className="text-sm text-gray-800" />
          </div>
          {p.choices.length > 0 && (
            shouldStackChoices(p.choices) ? (
              <div className="mt-2 pl-2 space-y-1">
                {p.choices.map((c, i) => (
                  <div key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
                    <span className="shrink-0 text-gray-500">{'①②③④⑤'[i]}</span>
                    <MixedContentRenderer content={c} className="text-sm text-gray-700" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 pl-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700">
                {p.choices.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <span className="text-gray-500">{'①②③④⑤'[i]}</span>
                    <MixedContentRenderer content={c} className="text-sm text-gray-700 inline" />
                  </span>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* 상단 탭 바 */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-subtle flex-shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-all ${
              previewTab === tab
                ? 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/20'
                : 'text-content-muted hover:text-content-secondary hover:bg-surface-raised/50'
            }`}
          >
            {tab}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowDesignGallery(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-indigo-400 hover:bg-indigo-500/10 transition-colors"
            title="헤더 디자인 갤러리"
          >
            <FileEdit size={12} />
            디자인{headerTheme && headerTheme !== 'none' ? ` · ${HEADER_THEMES.find((t) => t.id === headerTheme)?.label ?? ''}` : ''}
          </button>
          <span className="text-xs font-bold text-content-secondary">{totalQuestions}</span>
          <span className="text-[10px] text-content-muted">문항</span>
        </div>
      </div>
      {showDesignGallery && (
        <HeaderDesignGallery
          activeTheme={headerTheme}
          onSelect={(theme, color) => { setHeaderTheme(theme); setHeaderColor(color); }}
          onClose={() => setShowDesignGallery(false)}
        />
      )}

      {/* 미리보기 본문 */}
      <div className="flex-1 min-h-0 overflow-auto bg-zinc-950/50 p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full gap-2">
            <Loader2 size={16} className="animate-spin text-indigo-400" />
            <span className="text-xs text-content-muted">시험지 생성 중...</span>
          </div>
        ) : problems.length > 0 ? (
          <div ref={previewRef} className="mx-auto bg-white rounded shadow-xl" style={{ maxWidth: '720px' }}>
            <EditableExamHeader
              templateId={templateId}
              meta={{ ...examMeta, subject: examMeta.subject || categoryLabel || '수학' }}
              examTitle={paperName || '시험지'}
              editable={false}
              accentColor={headerColor}
              headerTheme={headerTheme}
            />

            {/* 시험지 탭 */}
            {previewTab === '시험지' && (
              <div className="px-6 py-5">
                {layout === 'two-column' ? (
                  <div className="grid grid-cols-2 gap-x-6">
                    <div>{leftProblems.map(renderProblem)}</div>
                    <div>{rightProblems.map(renderProblem)}</div>
                  </div>
                ) : (
                  <div>{problems.map(renderProblem)}</div>
                )}
              </div>
            )}

            {/* 빠른정답 탭 */}
            {previewTab === '빠른정답' && (
              <div className="px-6 py-4">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="py-1.5 text-left text-gray-500 w-12">번호</th>
                      <th className="py-1.5 text-left text-gray-500">정답</th>
                      <th className="py-1.5 text-left text-gray-500">유형</th>
                    </tr>
                  </thead>
                  <tbody>
                    {problems.map((p) => (
                      <tr key={p.id} className="border-b border-gray-100">
                        <td className="py-1.5 font-bold text-gray-700">{p.number}</td>
                        <td className="py-1.5 text-gray-800">{p.answer || '-'}</td>
                        <td className="py-1.5 text-gray-500 text-[10px]">{p.typeCode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 해설지 탭 */}
            {previewTab === '해설지' && (
              <div className="px-6 py-5 space-y-5">
                {problems.map((p) => (
                  <div key={p.id} className="break-inside-avoid">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-gray-900">{p.number}.</span>
                      <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">정답: {p.answer || '-'}</span>
                    </div>
                    {p.solution ? (
                      <div className="pl-7 text-sm text-gray-700 leading-relaxed">
                        <MixedContentRenderer content={p.solution} className="text-sm text-gray-700" />
                      </div>
                    ) : (
                      <p className="pl-7 text-xs text-gray-400 italic">해설 없음</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="p-4 rounded-xl bg-surface-card/30 border border-dashed border-subtle">
              <FileText size={32} className="text-content-muted" />
            </div>
            <p className="text-xs text-content-muted text-center leading-relaxed">
              과목과 단원을 선택한 후<br />
              <strong className="text-content-secondary">자동출제</strong> 또는 <strong className="text-content-secondary">수동출제</strong>로<br />
              시험지를 생성하세요
            </p>
          </div>
        )}
      </div>

      {/* 하단 바 */}
      <div className="flex items-center gap-3 px-3 py-2 border-t border-subtle flex-shrink-0 bg-surface-card/50">
        {/* 1단/2단 토글 */}
        <div className="flex border border-subtle rounded overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => onLayoutChange('single')}
            className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
              layout === 'single'
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'text-content-muted hover:text-content-secondary hover:bg-surface-raised/50'
            }`}
          >
            1단
          </button>
          <button
            type="button"
            onClick={() => onLayoutChange('two-column')}
            className={`px-2.5 py-1 text-[11px] font-medium transition-colors border-l border-subtle ${
              layout === 'two-column'
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'text-content-muted hover:text-content-secondary hover:bg-surface-raised/50'
            }`}
          >
            2단
          </button>
        </div>

        {/* 간격 슬라이더 */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[11px] text-content-muted whitespace-nowrap">간격</span>
          <input
            type="range"
            min={0}
            max={700}
            step={1}
            value={gap}
            onChange={(e) => onGapChange(parseInt(e.target.value))}
            className="flex-1 h-1.5 appearance-none bg-zinc-700 rounded-full cursor-pointer accent-emerald-500"
            style={{ minWidth: '80px' }}
          />
          <span className="text-[11px] text-content-secondary tabular-nums w-8 text-right">{gap}</span>
        </div>

        {/* PDF 저장 */}
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded transition-colors shrink-0 disabled:opacity-50"
          onClick={onDownloadPDF}
          disabled={problems.length === 0 || isPDFGenerating}
        >
          {isPDFGenerating ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          PDF 저장
        </button>

        {/* 출력 버튼 */}
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-content-secondary bg-surface-raised/50 hover:bg-surface-raised border border-subtle rounded transition-colors shrink-0"
          onClick={() => window.print()}
        >
          <Printer size={13} />
          출력
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Bottom: Difficulty Distribution Bar
// ============================================================================

function DifficultyDistributionBar({
  difficulties,
  availableCounts,
  totalQuestions,
  onChange,
}: {
  difficulties: Record<DifficultyLevel, number>;
  availableCounts: Record<string, number>;
  totalQuestions: number;
  onChange: (d: Record<DifficultyLevel, number>) => void;
}) {
  const levels: DifficultyLevel[] = ['최상', '상', '중', '하', '최하'];

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <StepBadge number={3} active={totalQuestions > 0} />
          <span className="text-sm font-semibold text-content-primary">문항수를 선택해 주세요</span>
          <span className="text-[10px] text-content-muted">(최대 50문항)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-content-secondary">전체 문항</span>
          <span className="text-lg font-bold text-indigo-400">{totalQuestions}</span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {levels.map((level) => {
          const dbKey = DIFF_LEVEL_MAP[level];
          const available = availableCounts[dbKey] || 0;
          const value = difficulties[level];
          const maxForThis = Math.min(50 - (totalQuestions - value), available || 99);
          const colors = DIFF_COLORS[level];

          return (
            <div key={level} className={`flex flex-col items-center gap-1 rounded-lg border ${colors.border} ${colors.bg} px-2 py-2`}>
              <span className={`text-[10px] font-bold ${colors.text}`}>{level}</span>
              <input
                type="number"
                value={value}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(maxForThis, parseInt(e.target.value) || 0));
                  onChange({ ...difficulties, [level]: v });
                }}
                className="h-8 w-12 rounded border border-subtle bg-surface-raised text-center text-sm font-bold text-content-primary
                  focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500
                  [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="text-[9px] text-content-muted">{available}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function PaperCreatePage() {
  const router = useRouter();
  const previewRef = useRef<HTMLDivElement>(null);
  // PR-T10 G-13d — 과학 트랙은 출제기 임시 안내 (수학비서 분류 마스터 정식 분기 전)
  const { activeTrack, isEnabled: trackSplitEnabled } = useSubjectTrack();
  if (trackSplitEnabled && activeTrack === 'science') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md text-center bg-surface-card border border-subtle rounded-2xl p-8">
          <Beaker className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-content-primary mb-2">과학 시험지 출제 준비 중</h2>
          <p className="text-sm text-content-tertiary leading-relaxed">
            현재 시험지 출제는 매쓰싸이 뱅크 분류 트리 기반으로 운영됩니다.
            <br />
            과학 분류 마스터 데이터 적재 후 정식 분기 예정입니다.
            <br />
            상단 토글에서 [수학] 트랙으로 전환하면 사용 가능합니다.
          </p>
        </div>
      </div>
    );
  }

  // ---- State ----
  const [paperName, setPaperName] = useState(() =>
    `[${new Date().toISOString().slice(0, 10)}] 시험지`
  );
  const [createMode, setCreateMode] = useState<CreateMode>('auto');

  // Mathsecr subject/tree
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [selectedSubjectCode, setSelectedSubjectCode] = useState('');
  const [mathsecrTree, setMathsecrTree] = useState<MathsecrNode | null>(null);
  const [isLoadingTree, setIsLoadingTree] = useState(false);

  // Tree selection: L2 keys = "{subjectCode}-{L1.c}-{L2.c}", L3 keys = "{subjectCode}-{L1.c}-{L2.c}-{L3.c}"
  const [selectedL2Keys, setSelectedL2Keys] = useState<Set<string>>(new Set());
  const [selectedL3Keys, setSelectedL3Keys] = useState<Set<string>>(new Set());

  // Type-level selection (Column 2) — key: full MS typeCode
  const [selectedTypeItems, setSelectedTypeItems] = useState<Map<string, number>>(new Map());

  // Difficulty
  const [difficulties, setDifficulties] = useState<Record<DifficultyLevel, number>>({
    '최상': 0, '상': 0, '중': 0, '하': 0, '최하': 0,
  });
  const [availableCounts, setAvailableCounts] = useState<Record<string, number>>({});

  // Manual mode
  const [manualSelected, setManualSelected] = useState<Set<string>>(new Set());
  const [manualProblems, setManualProblems] = useState<Map<string, SearchProblem>>(new Map());

  // Preview
  const [previewTab, setPreviewTab] = useState<PreviewTab>('시험지');
  const [previewLayout, setPreviewLayout] = useState<'single' | 'two-column'>('two-column');
  const [previewGap, setPreviewGap] = useState(30);
  const [previewProblems, setPreviewProblems] = useState<PreviewProblem[]>([]);

  // Template
  const [previewTemplateId, setPreviewTemplateId] = useState('simple');
  const [previewExamMeta, setPreviewExamMeta] = useState<ExamMeta>({ ...DEFAULT_EXAM_META });
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedExamId, setGeneratedExamId] = useState<string | null>(null);
  const [isPDFGenerating, setIsPDFGenerating] = useState(false);

  // ---- Computed ----
  const selectedTypeCodes = useMemo(() => {
    // L3 keys → MS prefix codes for API
    return [...selectedL3Keys].map(key => {
      // key format: "07-01-02-03" → "MS07-01-02-03"
      const parts = key.split('-');
      return `MS${parts.join('-')}`;
    });
  }, [selectedL3Keys]);

  // typeGroups for Column 2 — 선택된 L3의 세부유형(L4)
  const typeGroups = useMemo(() => {
    if (!mathsecrTree || selectedL3Keys.size === 0) return [];

    const groups: { label: string; key: string; items: { code: string; name: string; typeCode: string }[] }[] = [];

    for (const l3Key of selectedL3Keys) {
      const parts = l3Key.split('-'); // [subjectCode, l1c, l2c, l3c]
      if (parts.length < 4) continue;

      const [, l1c, l2c, l3c] = parts;
      const l1 = mathsecrTree.ch?.find(n => n.c === l1c);
      if (!l1) continue;
      const l2 = l1.ch?.find(n => n.c === l2c);
      if (!l2) continue;
      const l3 = l2.ch?.find(n => n.c === l3c);
      if (!l3 || !l3.ch || l3.ch.length === 0) continue;

      groups.push({
        label: `${l1.t} > ${l2.t} > ${l3.t}`,
        key: l3Key,
        items: l3.ch.map(l4 => ({
          code: l4.c,
          name: l4.t,
          typeCode: `MS${selectedSubjectCode}-${l1c}-${l2c}-${l3c}-${l4.c}`,
        })),
      });
    }

    return groups;
  }, [mathsecrTree, selectedL3Keys, selectedSubjectCode]);

  const totalQuestions = createMode === 'manual'
    ? manualSelected.size
    : Object.values(difficulties).reduce((sum, val) => sum + val, 0);

  const categoryLabel = useMemo(() => {
    const subj = subjects.find(s => s.code === selectedSubjectCode);
    return subj?.name || '';
  }, [subjects, selectedSubjectCode]);

  const scopeText = useMemo(() => {
    if (selectedL2Keys.size === 0) return '';
    const labels: string[] = [];
    if (!mathsecrTree) return '';
    for (const key of selectedL2Keys) {
      const parts = key.split('-');
      if (parts.length < 3) continue;
      const [, l1c, l2c] = parts;
      const l1 = mathsecrTree.ch?.find(n => n.c === l1c);
      const l2 = l1?.ch?.find(n => n.c === l2c);
      if (l2) labels.push(l2.t);
    }
    if (labels.length <= 2) return labels.join(', ');
    return `${labels[0]} ~ ${labels[labels.length - 1]}`;
  }, [selectedL2Keys, mathsecrTree]);

  // ---- Fetch subjects on mount ----
  useEffect(() => {
    async function fetchSubjects() {
      try {
        const res = await fetch('/api/mathsecr/tree');
        if (!res.ok) return;
        const data = await res.json();
        setSubjects(data.subjects || []);
      } catch {
        // ignore
      }
    }
    fetchSubjects();
  }, []);

  // ---- Fetch tree when subject changes ----
  useEffect(() => {
    if (!selectedSubjectCode) {
      setMathsecrTree(null);
      return;
    }
    let cancelled = false;
    setIsLoadingTree(true);
    async function fetchTree() {
      try {
        const res = await fetch(`/api/mathsecr/tree?subject=${selectedSubjectCode}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setMathsecrTree(data.tree || null);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setIsLoadingTree(false);
      }
    }
    fetchTree();
    return () => { cancelled = true; };
  }, [selectedSubjectCode]);

  // ---- Fetch available counts (debounced) ----
  useEffect(() => {
    if (selectedTypeCodes.length === 0) {
      setAvailableCounts({});
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/exams/available-counts?typeCodes=${selectedTypeCodes.join(',')}`);
        if (res.ok) {
          const data = await res.json();
          setAvailableCounts(data);
        }
      } catch {
        // ignore
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [selectedTypeCodes]);

  // ---- Handlers ----
  const handleReset = () => {
    setPaperName(`[${new Date().toISOString().slice(0, 10)}] 시험지`);
    setSelectedSubjectCode('');
    setMathsecrTree(null);
    setSelectedL2Keys(new Set());
    setSelectedL3Keys(new Set());
    setSelectedTypeItems(new Map());
    setCreateMode('auto');
    setDifficulties({ '최상': 0, '상': 0, '중': 0, '하': 0, '최하': 0 });
    setPreviewProblems([]);
    setGeneratedExamId(null);
    setAvailableCounts({});
    setManualSelected(new Set());
    setManualProblems(new Map());
  };

  const handleSubjectChange = (code: string) => {
    setSelectedSubjectCode(code);
    setSelectedL2Keys(new Set());
    setSelectedL3Keys(new Set());
    setSelectedTypeItems(new Map());
    setDifficulties({ '최상': 0, '상': 0, '중': 0, '하': 0, '최하': 0 });
  };

  // Toggle L1: select/deselect all L2 and L3 children
  const handleToggleL1 = useCallback((l1: MathsecrNode) => {
    const sc = selectedSubjectCode;
    const l2Children = l1.ch || [];
    const l2Keys = l2Children.map(l2 => `${sc}-${l1.c}-${l2.c}`);
    const l3Keys: string[] = [];
    l2Children.forEach(l2 => {
      (l2.ch || []).forEach(l3 => l3Keys.push(`${sc}-${l1.c}-${l2.c}-${l3.c}`));
    });

    setSelectedL2Keys(prev => {
      const allSelected = l2Keys.every(k => prev.has(k));
      const next = new Set(prev);
      if (allSelected) {
        l2Keys.forEach(k => next.delete(k));
      } else {
        l2Keys.forEach(k => next.add(k));
      }
      return next;
    });
    setSelectedL3Keys(prev => {
      const allSelected = l3Keys.every(k => prev.has(k));
      const next = new Set(prev);
      if (allSelected) {
        l3Keys.forEach(k => next.delete(k));
      } else {
        l3Keys.forEach(k => next.add(k));
      }
      return next;
    });
  }, [selectedSubjectCode]);

  // Toggle L2: select/deselect all L3 children
  const handleToggleL2 = useCallback((l1: MathsecrNode, l2: MathsecrNode) => {
    const sc = selectedSubjectCode;
    const l2Key = `${sc}-${l1.c}-${l2.c}`;
    const l3Children = l2.ch || [];
    const l3Keys = l3Children.map(l3 => `${l2Key}-${l3.c}`);

    setSelectedL2Keys(prev => {
      const next = new Set(prev);
      next.has(l2Key) ? next.delete(l2Key) : next.add(l2Key);
      return next;
    });
    setSelectedL3Keys(prev => {
      const allSelected = l3Keys.every(k => prev.has(k));
      const next = new Set(prev);
      if (allSelected) {
        l3Keys.forEach(k => next.delete(k));
      } else {
        l3Keys.forEach(k => next.add(k));
      }
      return next;
    });
  }, [selectedSubjectCode]);

  // Toggle L3
  const handleToggleL3 = useCallback((l3Key: string) => {
    setSelectedL3Keys(prev => {
      const next = new Set(prev);
      next.has(l3Key) ? next.delete(l3Key) : next.add(l3Key);
      return next;
    });
    // Also update L2 parent
    const parts = l3Key.split('-');
    if (parts.length >= 4) {
      const l2Key = parts.slice(0, 3).join('-');
      // Check if all siblings of this L3 are now selected/deselected
      // We need the tree to know siblings, so just toggle L2 based on any child selected
      setSelectedL2Keys(prev => {
        const next = new Set(prev);
        // If we're deselecting and this might leave L2 empty, still keep L2 selected
        // as long as any L3 under it is selected. This is checked in the tree panel.
        // For simplicity, always keep L2 selected when any L3 is.
        next.add(l2Key);
        return next;
      });
    }
  }, []);

  // Type item handlers (Column 2)
  const handleToggleType = useCallback((typeCode: string) => {
    setSelectedTypeItems(prev => {
      const next = new Map(prev);
      next.has(typeCode) ? next.delete(typeCode) : next.set(typeCode, 1);
      return next;
    });
  }, []);

  const handleSelectAllGroup = useCallback((key: string, items: { typeCode: string }[]) => {
    setSelectedTypeItems(prev => {
      const next = new Map(prev);
      const allSelected = items.every(t => next.has(t.typeCode));
      if (allSelected) {
        items.forEach(t => next.delete(t.typeCode));
      } else {
        items.forEach(t => { if (!next.has(t.typeCode)) next.set(t.typeCode, 1); });
      }
      return next;
    });
  }, []);

  const handleChangeTypeCount = useCallback((typeCode: string, count: number) => {
    setSelectedTypeItems(prev => {
      const next = new Map(prev);
      next.set(typeCode, Math.max(1, count));
      return next;
    });
  }, []);

  // Manual mode: toggle problem selection
  const handleManualToggle = useCallback((id: string, problem: SearchProblem) => {
    setManualSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setManualProblems(prev => {
      const next = new Map(prev);
      next.set(id, problem);
      return next;
    });
  }, []);

  // Save / Generate exam
  const handleSaveExam = async () => {
    if (!paperName.trim()) {
      alert('시험지 이름을 입력해주세요.');
      return;
    }

    if (createMode === 'manual') {
      if (manualSelected.size === 0) {
        alert('문제를 선택해주세요.');
        return;
      }
    } else {
      if (totalQuestions === 0) {
        alert('문항수를 설정해주세요.');
        return;
      }
    }

    setIsGenerating(true);

    try {
      const body: Record<string, unknown> = {
        title: paperName,
      };

      if (createMode === 'manual') {
        body.problemIds = [...manualSelected];
      } else {
        body.criteria = {
          subject: categoryLabel || '',
          typeCodes: selectedTypeCodes,
          difficulty_distribution: difficulties,
          mode: createMode,
        };
      }

      const response = await fetch('/api/exams/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate');

      if (data.examId) {
        setGeneratedExamId(data.examId);
        // Fetch generated problems for preview
        try {
          const examRes = await fetch(`/api/exams/${data.examId}`);
          if (examRes.ok) {
            const examData = await examRes.json();
            const probs: PreviewProblem[] = (examData.problems || []).map((ep: Record<string, unknown>, idx: number) => {
              const prob = (ep.problems || ep) as Record<string, unknown>;
              const classification = Array.isArray(prob.classifications) ? prob.classifications[0] as Record<string, unknown> | undefined : undefined;
              const answerJson = prob.answer_json as Record<string, unknown> | null;
              const choices: string[] = answerJson?.choices ? (answerJson.choices as string[]) : [];

              return {
                id: (prob.id || `gen-${idx}`) as string,
                number: ((ep.sequence_number as number) || idx + 1),
                content: (prob.content_latex || prob.content_html || '') as string,
                typeCode: (classification?.type_code || '') as string,
                typeName: '',
                difficulty: (classification?.difficulty || 3) as number,
                choices,
                answer: (answerJson?.answer || answerJson?.correct_answer || '') as string | number,
                solution: (prob.solution_latex || '') as string,
                source: (prob.source_name || '') as string,
              };
            });
            setPreviewProblems(probs);
            setPreviewTab('시험지');
          }
        } catch {
          // Preview fetch failed, but exam was created
        }
      }
    } catch (e) {
      console.error(e);
      alert('시험지 생성 실패: ' + (e instanceof Error ? e.message : '알 수 없는 오류'));
    } finally {
      setIsGenerating(false);
    }
  };

  // PDF download
  const handleDownloadPDF = async () => {
    if (!previewRef.current || previewProblems.length === 0) return;
    setIsPDFGenerating(true);
    try {
      await downloadPDF({
        element: previewRef.current,
        config: {
          title: paperName,
          layout: previewLayout,
          fontSize: 12,
          pageSize: 'A4',
          orientation: 'portrait',
          margin: { top: 15, right: 15, bottom: 15, left: 15 },
          showProblemPoints: false,
          showProblemNumbers: true,
          showAnswerSheet: false,
          showNameField: true,
          showClassField: true,
          showScoreField: false,
          problemSpacing: previewGap,
          watermark: { enabled: false, opacity: 0 },
        },
        filename: `${paperName.replace(/[[\]]/g, '')}.pdf`,
      });
    } catch (e) {
      console.error('PDF 생성 실패:', e);
      alert('PDF 생성에 실패했습니다.');
    } finally {
      setIsPDFGenerating(false);
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <section className="flex h-[calc(100vh-6rem)] flex-col overflow-hidden">
      {/* Header Area */}
      <div className="flex-shrink-0 pb-2">
        {/* Row 1: Title + actions */}
        <div className="flex items-center justify-between gap-4 mb-2">
          <h1 className="text-xl font-bold text-content-primary">시험지 출제</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg border border-subtle bg-surface-raised/80 px-3 py-2 text-xs font-medium text-content-secondary transition-all hover:bg-zinc-700"
            >
              <RotateCcw size={14} />
              <span>초기화</span>
            </button>
            <button
              type="button"
              onClick={generatedExamId ? () => router.push('/dashboard/exam-management') : handleSaveExam}
              disabled={generatedExamId ? false : (
                createMode === 'manual' ? manualSelected.size === 0 : totalQuestions === 0
              ) || !paperName.trim() || isGenerating}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-500/50 bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:shadow-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {isGenerating ? (
                <><Loader2 size={14} className="animate-spin" /><span>생성 중...</span></>
              ) : generatedExamId ? (
                <><ArrowRight size={14} /><span>시험지 관리로</span></>
              ) : (
                <><Wand2 size={14} /><span>{createMode === 'manual' ? '시험지 생성' : '자동 출제'}</span></>
              )}
            </button>
          </div>
        </div>

        {/* Row 2: Scope + paper name + mode */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-widest text-content-tertiary">범위</span>
                <p className="text-xs text-content-secondary truncate mt-0.5">
                  {scopeText || '아래에서 과목 및 단원을 선택해 주세요'}
                </p>
              </div>
              <div className="shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-widest text-content-tertiary">시험지명</span>
                <input
                  type="text"
                  value={paperName}
                  onChange={(e) => setPaperName(e.target.value)}
                  className="block w-52 rounded-md border border-subtle bg-surface-raised px-2 py-1 text-xs text-content-primary mt-0.5 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-center px-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-content-tertiary">총 문항수</span>
              <div className="text-xl font-bold text-indigo-400 mt-0.5">{totalQuestions}</div>
            </div>

            <div className="flex gap-1">
              {[
                { mode: 'auto' as CreateMode, icon: <Wand2 size={13} />, label: '자동출제' },
                { mode: 'manual' as CreateMode, icon: <Pencil size={13} />, label: '수동출제' },
              ].map(({ mode, icon, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCreateMode(mode)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-all ${
                    createMode === mode
                      ? mode === 'auto' ? 'bg-indigo-600 ring-2 ring-indigo-400/50' : 'bg-zinc-600 ring-2 ring-zinc-400/50'
                      : 'bg-zinc-700/50 text-content-secondary hover:bg-zinc-700'
                  }`}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main 3-Column Area */}
      <div className="flex flex-1 gap-0 overflow-hidden rounded-xl border border-subtle bg-surface-raised">
        {/* Left Group: Column 1 + Column 2 + Bottom */}
        <div className="flex flex-col overflow-hidden" style={{ width: '56%' }}>
          <div className="flex flex-1 min-h-0">
            {/* Column 1: Mathsecr Tree */}
            <div className="w-1/2 border-r border-subtle flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-subtle flex-shrink-0">
                <StepBadge number={1} active={!selectedSubjectCode} />
                <span className="text-sm font-semibold text-content-primary">과목·단원 선택</span>
              </div>

              {/* Subject selector */}
              <div className="flex-shrink-0 px-3 py-2 border-b border-subtle">
                {selectedSubjectCode ? (
                  <div className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2">
                    <span className="text-xs font-medium text-indigo-300 flex-1 truncate">{categoryLabel}</span>
                    <button
                      type="button"
                      onClick={() => handleSubjectChange('')}
                      className="p-0.5 text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <select
                    value={selectedSubjectCode}
                    onChange={e => handleSubjectChange(e.target.value)}
                    className="w-full rounded-lg border border-subtle bg-surface-raised px-3 py-2 text-sm text-content-primary focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">과목을 선택해 주세요</option>
                    <optgroup label="중학교">
                      {subjects.filter(s => parseInt(s.code) <= 6).map(s => (
                        <option key={s.code} value={s.code}>{s.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="고등학교">
                      {subjects.filter(s => parseInt(s.code) >= 7).map(s => (
                        <option key={s.code} value={s.code}>{s.name}</option>
                      ))}
                    </optgroup>
                  </select>
                )}
              </div>

              {/* Tree */}
              <div className="flex-1 overflow-auto p-2 scrollbar-thin">
                {isLoadingTree ? (
                  <div className="flex items-center justify-center py-8 gap-2">
                    <Loader2 size={16} className="animate-spin text-content-muted" />
                    <span className="text-xs text-content-muted">트리 로딩 중...</span>
                  </div>
                ) : !mathsecrTree ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <AlertCircle size={20} className="text-content-muted" />
                    <span className="text-xs text-content-muted text-center">
                      {selectedSubjectCode ? '트리를 불러올 수 없습니다' : '과목을 먼저 선택해 주세요'}
                    </span>
                  </div>
                ) : (
                  <MathsecrTreePanel
                    tree={mathsecrTree}
                    subjectCode={selectedSubjectCode}
                    selectedL2Keys={selectedL2Keys}
                    selectedL3Keys={selectedL3Keys}
                    onToggleL1={handleToggleL1}
                    onToggleL2={handleToggleL2}
                    onToggleL3={handleToggleL3}
                  />
                )}
              </div>
            </div>

            {/* Column 2: Type Detail or Manual Search */}
            <div className="w-1/2 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-subtle flex-shrink-0">
                <StepBadge number={2} active={selectedL2Keys.size > 0 || createMode === 'manual'} />
                <span className="text-sm font-semibold text-content-primary">
                  {createMode === 'manual' ? '문제 검색' : '세부유형 선택'}
                </span>
                {createMode === 'auto' && selectedTypeItems.size > 0 && (
                  <span className="ml-auto text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                    {selectedTypeItems.size}개 선택
                  </span>
                )}
                {createMode === 'manual' && manualSelected.size > 0 && (
                  <span className="ml-auto text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                    {manualSelected.size}개 선택
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-auto scrollbar-thin">
                {createMode === 'manual' ? (
                  <ManualSearchPanel
                    subjectCode={selectedSubjectCode}
                    selectedTypeCodes={selectedTypeCodes}
                    manualSelected={manualSelected}
                    onToggleSelect={handleManualToggle}
                  />
                ) : (
                  <TypeDetailPanel
                    typeGroups={typeGroups}
                    selectedTypeItems={selectedTypeItems}
                    onToggleType={handleToggleType}
                    onSelectAllGroup={handleSelectAllGroup}
                    onChangeTypeCount={handleChangeTypeCount}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Bottom: Difficulty Distribution (auto mode only) */}
          {createMode === 'auto' && (
            <div className="flex-shrink-0 border-t border-subtle">
              <DifficultyDistributionBar
                difficulties={difficulties}
                availableCounts={availableCounts}
                totalQuestions={totalQuestions}
                onChange={setDifficulties}
              />
            </div>
          )}

          {/* Bottom: Manual mode summary */}
          {createMode === 'manual' && manualSelected.size > 0 && (
            <div className="flex-shrink-0 border-t border-subtle px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StepBadge number={3} active />
                  <span className="text-sm font-semibold text-content-primary">선택된 문제</span>
                  <span className="text-lg font-bold text-indigo-400">{manualSelected.size}</span>
                  <span className="text-xs text-content-muted">문항</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setManualSelected(new Set()); setManualProblems(new Map()); }}
                  className="text-xs text-content-muted hover:text-content-secondary transition-colors"
                >
                  선택 초기화
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Column 3: Exam Preview */}
        <div className="flex-1 flex flex-col overflow-hidden border-l border-subtle">
          <ExamPreviewPanel
            previewTab={previewTab}
            onTabChange={setPreviewTab}
            problems={previewProblems}
            isLoading={isGenerating}
            paperName={paperName}
            categoryLabel={categoryLabel}
            totalQuestions={previewProblems.length}
            layout={previewLayout}
            onLayoutChange={setPreviewLayout}
            gap={previewGap}
            onGapChange={setPreviewGap}
            templateId={previewTemplateId}
            examMeta={previewExamMeta}
            onOpenTemplateModal={() => setShowTemplateModal(true)}
            previewRef={previewRef}
            onDownloadPDF={handleDownloadPDF}
            isPDFGenerating={isPDFGenerating}
          />
        </div>
      </div>

      {/* 템플릿 선택 모달 */}
      <TemplateSelector
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        templateId={previewTemplateId}
        meta={previewExamMeta}
        onApply={(id, meta) => {
          setPreviewTemplateId(id);
          setPreviewExamMeta(meta);
        }}
      />
    </section>
  );
}
