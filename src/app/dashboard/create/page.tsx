'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
  CheckCircle2,
  Minus,
  Plus,
  Printer,
  FileEdit,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { LevelNode, DomainNode, StandardNode, ExpandedMathType, SubjectCategory } from '@/types/expanded-types';
import { SUBJECT_CATEGORIES, extractStandardNumber } from '@/types/expanded-types';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { ExamPaperHeader } from '@/components/exam/ExamPaperHeader';
import { TemplateSelector } from '@/components/exam/TemplateSelector';
import { DEFAULT_EXAM_META, type ExamMeta } from '@/config/exam-templates';

// ============================================================================
// Types
// ============================================================================

interface SubjectTree {
  subject: string;
  levelCode: string;
  chapters: ChapterNode[];
  totalProblems: number;
}

interface ChapterNode {
  chapter: string;
  domainCode: string;
  sections: SectionNode[];
  totalProblems: number;
}

interface SectionNode {
  section: string;
  typeCode: string;
  totalProblems: number;
}

type CreateMode = 'auto' | 'manual' | 'add';
type QuestionTypeFilter = '전체' | '교과서 유형' | '문제집 유형' | '기출 유형' | '모의고사 유형';
type DifficultyLevel = '최상' | '상' | '중' | '하' | '최하';
type PreviewTab = '시험지' | '빠른정답' | '해설지';

interface TypeGroup {
  standardLabel: string;
  standardCode: string;
  items: ExpandedMathType[];
}

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

// ============================================================================
// Utility Functions
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

function levelNodeToSubjectTree(level: LevelNode, category: SubjectCategory): SubjectTree | null {
  // 1. 도메인 필터링
  let filteredDomains = category.domainFilter
    ? level.domains.filter((d) => category.domainFilter!.includes(d.domainCode))
    : [...level.domains];

  // 2. domainFilter 순서대로 정렬 (교과서 목차 순서)
  if (category.domainFilter) {
    const order = category.domainFilter;
    filteredDomains.sort((a, b) => order.indexOf(a.domainCode) - order.indexOf(b.domainCode));
  }

  if (filteredDomains.length === 0) return null;

  // 3. 성취기준 필터링 (standardFilter가 있을 때만)
  const chapters: ChapterNode[] = [];
  let totalProblems = 0;

  for (const domain of filteredDomains) {
    const allowedStds = category.standardFilter?.[domain.domainCode];

    // standardFilter가 있으면 해당 번호의 성취기준만 포함
    const filteredStandards = allowedStds
      ? domain.standards.filter((std) => {
          const num = extractStandardNumber(std.standardCode);
          return num !== null && allowedStds.includes(num);
        })
      : domain.standards;

    if (filteredStandards.length === 0) continue;

    const domainProblems = filteredStandards.reduce((sum, s) => sum + s.typeCount, 0);
    totalProblems += domainProblems;

    chapters.push({
      chapter: domain.label,
      domainCode: domain.domainCode,
      sections: filteredStandards.map((std) => ({
        section: std.standardContent || std.standardCode,
        typeCode: std.standardCode,
        totalProblems: std.typeCount,
      })),
      totalProblems: domainProblems,
    });
  }

  if (chapters.length === 0) return null;

  return {
    subject: category.curriculum
      ? `${category.label} [${category.curriculum}]`
      : category.label,
    levelCode: level.levelCode,
    chapters,
    totalProblems,
  };
}

function formatTypeCodeShort(code: string): string {
  if (!code) return '';
  // MA-HS0-POL-01-003 → A003 형태로 변환
  const parts = code.split('-');
  if (parts.length >= 5) {
    const seq = parts[parts.length - 1];
    return `A${seq}`;
  }
  return code;
}

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

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
        active
          ? 'border-indigo-500 bg-indigo-500 text-white shadow-sm shadow-indigo-500/20'
          : 'border-subtle bg-surface-raised/80 text-content-secondary hover:bg-zinc-700 hover:text-content-primary'
      }`}
    >
      {label}
    </button>
  );
}

// ============================================================================
// Column 1: Subject Tree Panel
// ============================================================================

function SubjectTreePanel({
  tree,
  selectedChapters,
  selectedSections,
  onToggleChapter,
  onToggleSection,
}: {
  tree: SubjectTree[];
  selectedChapters: string[];
  selectedSections: string[];
  onToggleChapter: (chapter: string, sections: SectionNode[]) => void;
  onToggleSection: (section: string, typeCode: string) => void;
}) {
  const [expandedChapters, setExpandedChapters] = useState<string[]>([]);

  const toggleExpand = (e: React.MouseEvent, chapter: string) => {
    e.stopPropagation();
    setExpandedChapters((prev) =>
      prev.includes(chapter) ? prev.filter((c) => c !== chapter) : [...prev, chapter]
    );
  };

  const subj = tree[0];
  if (!subj) return null;

  return (
    <div className="space-y-0.5">
      {subj.chapters.map((ch, chIdx) => {
        const chapterNum = chIdx + 1;
        const isChExpanded = expandedChapters.includes(ch.chapter);
        const isChSelected = selectedChapters.includes(ch.chapter);
        // 모든 하위 섹션이 선택된 경우 full check, 일부만 partial
        const selectedChildCount = ch.sections.filter(s => selectedSections.includes(s.section)).length;
        const isPartial = selectedChildCount > 0 && selectedChildCount < ch.sections.length;

        return (
          <div key={ch.chapter}>
            <div className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-all ${
              isChSelected
                ? 'bg-indigo-500/10 text-indigo-300'
                : 'text-content-secondary hover:bg-surface-raised/50 hover:text-content-primary'
            }`}>
              {/* 접기/펼치기 토글 */}
              <button
                type="button"
                onClick={(e) => toggleExpand(e, ch.chapter)}
                className="p-0.5 shrink-0"
              >
                {isChExpanded ? (
                  <ChevronDown size={14} className="text-content-muted" />
                ) : (
                  <ChevronRight size={14} className="text-content-muted" />
                )}
              </button>

              {/* 챕터 체크박스 + 라벨 (클릭 시 전체선택) */}
              <button
                type="button"
                onClick={() => onToggleChapter(ch.chapter, ch.sections)}
                className="flex items-center gap-2 flex-1 text-left"
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isChSelected
                    ? 'border-indigo-500 bg-indigo-500'
                    : isPartial
                    ? 'border-indigo-400 bg-indigo-500/40'
                    : 'border-zinc-600'
                }`}>
                  {(isChSelected || isPartial) && <Check size={9} className="text-white" />}
                </div>
                <span className="font-medium">{chapterNum} {ch.chapter}</span>
              </button>
            </div>

            {/* Sections */}
            <AnimatePresence>
              {isChExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="overflow-hidden"
                >
                  <div className="ml-6 space-y-0.5 border-l border-subtle pl-2 py-0.5">
                    {ch.sections.map((sec, secIdx) => {
                      const sectionNum = `${chapterNum}.${secIdx + 1}`;
                      const isSecSelected = selectedSections.includes(sec.section);

                      return (
                        <button
                          key={sec.section}
                          type="button"
                          onClick={() => onToggleSection(sec.section, sec.typeCode)}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-all ${
                            isSecSelected
                              ? 'bg-indigo-500/10 text-indigo-300'
                              : 'text-content-tertiary hover:bg-surface-raised/30 hover:text-content-secondary'
                          }`}
                        >
                          {/* 원형 체크 */}
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                            isSecSelected
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-zinc-600'
                          }`}>
                            {isSecSelected && <Check size={9} className="text-white" />}
                          </div>
                          <span className={`text-[10px] font-bold shrink-0 ${isSecSelected ? 'text-indigo-400' : 'text-content-muted'}`}>
                            {sectionNum}
                          </span>
                          <span className="flex-1 text-left">{sec.section}</span>
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
  );
}

// ============================================================================
// Column 2: Type Detail Panel
// ============================================================================

function TypeDetailPanel({
  typeGroups,
  selectedTypeItems,
  onToggleType,
  onSelectAllGroup,
  onChangeTypeCount,
}: {
  typeGroups: TypeGroup[];
  selectedTypeItems: Map<string, number>;
  onToggleType: (typeCode: string) => void;
  onSelectAllGroup: (standardCode: string, items: ExpandedMathType[]) => void;
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
        <div key={group.standardCode}>
          {/* Group header */}
          <div className="flex items-center justify-between px-3 py-2 sticky top-0 bg-surface-raised/95 backdrop-blur-sm z-10 border-b border-subtle">
            <span className="text-xs font-bold text-content-secondary truncate flex-1">
              {group.standardLabel}
            </span>
            <button
              type="button"
              onClick={() => onSelectAllGroup(group.standardCode, group.items)}
              className="text-[10px] text-blue-400 hover:text-blue-300 font-medium shrink-0 ml-2"
            >
              전체 선택
            </button>
          </div>

          {/* Type items */}
          <div className="space-y-0.5 px-1">
            {group.items.map((type) => {
              const isSelected = selectedTypeItems.has(type.typeCode);
              const count = selectedTypeItems.get(type.typeCode) || 0;
              const shortCode = formatTypeCodeShort(type.typeCode);

              return (
                <div
                  key={type.typeCode}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-500/10 text-blue-300 ring-1 ring-blue-500/20'
                      : 'text-content-tertiary hover:bg-surface-raised/30 hover:text-content-secondary'
                  }`}
                  onClick={() => onToggleType(type.typeCode)}
                >
                  {/* Type code + name */}
                  <span className="font-mono text-[10px] text-content-muted shrink-0 w-8">{shortCode}.</span>
                  <span className="flex-1 text-left truncate">{type.typeName}</span>

                  {/* Selected count control */}
                  {isSelected && (
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <Check size={10} className="text-blue-400" />
                      <button
                        onClick={() => onChangeTypeCount(type.typeCode, Math.max(1, count - 1))}
                        className="p-0.5 text-blue-400 hover:text-blue-300"
                      >
                        <Minus size={10} />
                      </button>
                      <span className="text-blue-400 font-bold w-4 text-center">{count}</span>
                      <button
                        onClick={() => onChangeTypeCount(type.typeCode, count + 1)}
                        className="p-0.5 text-blue-400 hover:text-blue-300"
                      >
                        <Plus size={10} />
                      </button>
                    </div>
                  )}

                  {/* Problem count */}
                  <span className="text-[10px] text-content-muted shrink-0 w-8 text-right">
                    {type.problemCount}
                  </span>
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
// Column 3: Exam Preview Panel
// ============================================================================

function ExamPreviewPanel({
  previewTab,
  onTabChange,
  problems,
  isLoading,
  paperName,
  scopeText,
  categoryLabel,
  totalQuestions,
  layout,
  onLayoutChange,
  gap,
  onGapChange,
  templateId,
  examMeta,
  onOpenTemplateModal,
}: {
  previewTab: PreviewTab;
  onTabChange: (tab: PreviewTab) => void;
  problems: PreviewProblem[];
  isLoading: boolean;
  paperName: string;
  scopeText: string;
  categoryLabel: string;
  totalQuestions: number;
  layout: 'single' | 'two-column';
  onLayoutChange: (layout: 'single' | 'two-column') => void;
  gap: number;
  onGapChange: (gap: number) => void;
  templateId: string;
  examMeta: ExamMeta;
  onOpenTemplateModal: () => void;
}) {
  const tabs: PreviewTab[] = ['시험지', '빠른정답', '해설지'];

  // 2단 레이아웃: 문제를 좌/우 컬럼으로 분할
  const midIdx = Math.ceil(problems.length / 2);
  const leftProblems = problems.slice(0, midIdx);
  const rightProblems = problems.slice(midIdx);

  // 보기가 수식을 포함하는지 판별 ($ 또는 \ 포함 시 수식)
  const hasLatex = (text: string) => /[$\\]/.test(text);
  const shouldStackChoices = (choices: string[]) =>
    choices.some((c) => hasLatex(c) || c.length > 20);

  return (
    <div className="flex flex-col h-full">
      {/* ── 상단 탭 바 ── */}
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
            onClick={onOpenTemplateModal}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-violet-400 hover:bg-violet-500/10 transition-colors"
          >
            <FileEdit size={12} />
            템플릿
          </button>
          <span className="text-xs font-bold text-content-secondary">{totalQuestions}</span>
          <span className="text-[10px] text-content-muted">문항</span>
        </div>
      </div>

      {/* ── 미리보기 본문 (흰색 A4 용지) ── */}
      <div className="flex-1 min-h-0 overflow-auto bg-zinc-950/50 p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full gap-2">
            <Loader2 size={16} className="animate-spin text-indigo-400" />
            <span className="text-xs text-content-muted">시험지 생성 중...</span>
          </div>
        ) : problems.length > 0 ? (
          <div className="mx-auto bg-white rounded shadow-xl" style={{ maxWidth: '720px' }}>
            {/* ── 헤더: 템플릿 기반 ── */}
            <ExamPaperHeader
              templateId={templateId}
              meta={{ ...examMeta, subject: examMeta.subject || categoryLabel || '수학' }}
              examTitle={paperName || '시험지'}
            />

            {/* ── 시험지 탭: 문제 목록 ── */}
            {previewTab === '시험지' && (
              <div className="px-6 py-5">
                {layout === 'two-column' ? (
                  <div className="grid grid-cols-2 gap-x-6">
                    {/* 좌측 컬럼 */}
                    <div>
                      {leftProblems.map((p) => (
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
                      ))}
                    </div>
                    {/* 우측 컬럼 */}
                    <div>
                      {rightProblems.map((p) => (
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
                      ))}
                    </div>
                  </div>
                ) : (
                  /* 1단 레이아웃 */
                  <div>
                    {problems.map((p) => (
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
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── 빠른정답 탭 ── */}
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
                        <td className="py-1.5 text-gray-500 text-[10px]">{formatTypeCodeShort(p.typeCode)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── 해설지 탭 ── */}
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
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="p-4 rounded-xl bg-surface-card/30 border border-dashed border-subtle">
              <FileText size={32} className="text-content-muted" />
            </div>
            <p className="text-xs text-content-muted text-center leading-relaxed">
              과목과 단원을 선택한 후<br />
              <strong className="text-content-secondary">자동출제</strong>를 클릭하면<br />
              시험지 미리보기가 표시됩니다
            </p>
          </div>
        )}
      </div>

      {/* ── 하단 바: 1단/2단 토글 + 간격 슬라이더 + 출력 (참조사이트 스타일) ── */}
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

      {/* Difficulty rows */}
      <div className="grid grid-cols-5 gap-2">
        {levels.map((level) => {
          const dbKey = DIFF_LEVEL_MAP[level];
          const available = availableCounts[dbKey] || 0;
          const value = difficulties[level];
          const maxForThis = Math.min(50 - (totalQuestions - value), available || 99);
          const colors = DIFF_COLORS[level];

          return (
            <div key={level} className={`flex flex-col items-center gap-1 rounded-lg border ${colors.border} ${colors.bg} px-2 py-2`}>
              <span className={`text-[10px] font-bold ${colors.text}`}>{level}{level !== '최상' && level !== '최하' ? ' ↑' : ''}</span>
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

  // ---- State ----
  const [paperName, setPaperName] = useState(() =>
    `[${new Date().toISOString().slice(0, 10)}] 시험지`
  );
  const [createMode, setCreateMode] = useState<CreateMode>('auto');
  const [questionTypeFilter, setQuestionTypeFilter] = useState<QuestionTypeFilter>('전체');

  // Subject/Chapter/Section selections
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [selectedTypeCodes, setSelectedTypeCodes] = useState<string[]>([]);

  // Type-level selection (Column 2)
  const [selectedTypeItems, setSelectedTypeItems] = useState<Map<string, number>>(new Map());

  // Difficulty
  const [difficulties, setDifficulties] = useState<Record<DifficultyLevel, number>>({
    '최상': 0, '상': 0, '중': 0, '하': 0, '최하': 0,
  });

  // Available counts from DB
  const [availableCounts, setAvailableCounts] = useState<Record<string, number>>({});

  // Subject tree data
  const [allLevelNodes, setAllLevelNodes] = useState<LevelNode[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(true);

  // Category selection
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

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

  // ---- Computed ----
  const selectedCategory = useMemo(() =>
    SUBJECT_CATEGORIES.find((c) => c.id === selectedCategoryId) || null,
    [selectedCategoryId]
  );

  const subjectTree = useMemo(() => {
    if (!selectedCategory) return [];
    const level = allLevelNodes.find((l) => l.levelCode === selectedCategory.levelCode);
    if (!level) return [];
    const tree = levelNodeToSubjectTree(level, selectedCategory);
    return tree ? [tree] : [];
  }, [allLevelNodes, selectedCategory]);

  const availableCategories = useMemo(() => {
    const levelCodes = new Set(allLevelNodes.map((l) => l.levelCode));
    return SUBJECT_CATEGORIES.filter((c) => levelCodes.has(c.levelCode));
  }, [allLevelNodes]);

  // Type groups for Column 2 (derived from in-memory tree)
  const typeGroups = useMemo<TypeGroup[]>(() => {
    if (!selectedCategory || subjectTree.length === 0) return [];
    const groups: TypeGroup[] = [];
    const subj = subjectTree[0];
    if (!subj) return groups;

    const level = allLevelNodes.find(l => l.levelCode === selectedCategory.levelCode);
    if (!level) return groups;

    for (const ch of subj.chapters) {
      for (const sec of ch.sections) {
        if (!selectedSections.includes(sec.section)) continue;

        const domain = level.domains.find(d => d.domainCode === ch.domainCode);
        if (!domain) continue;
        const standard = domain.standards.find(s => s.standardCode === sec.typeCode);
        if (!standard || standard.types.length === 0) continue;

        groups.push({
          standardLabel: sec.section,
          standardCode: sec.typeCode,
          items: standard.types,
        });
      }
    }
    return groups;
  }, [subjectTree, selectedSections, selectedCategory, allLevelNodes]);

  const totalQuestions = Object.values(difficulties).reduce((sum, val) => sum + val, 0);
  const hasSelection = selectedSections.length > 0;

  const categoryLabel = useMemo(() => {
    if (!selectedCategory) return '';
    return selectedCategory.curriculum
      ? `${selectedCategory.label}[${selectedCategory.curriculum}]`
      : selectedCategory.label;
  }, [selectedCategory]);

  // Scope text — range format
  const scopeText = useMemo(() => {
    if (selectedSections.length === 0) return '';
    if (selectedSections.length === 1) return selectedSections[0];
    return `${selectedSections[0]} ~ ${selectedSections[selectedSections.length - 1]}`;
  }, [selectedSections]);

  // ---- Fetch tree ----
  useEffect(() => {
    async function fetchExpandedTypesTree() {
      setIsLoadingTree(true);
      try {
        const res = await fetch('/api/expanded-types/tree');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { tree } = await res.json() as { tree: LevelNode[] };
        if (tree && tree.length > 0) {
          setAllLevelNodes(tree);
        }
      } catch (err) {
        console.error('[Create] Failed to fetch tree:', err);
      } finally {
        setIsLoadingTree(false);
      }
    }
    fetchExpandedTypesTree();
  }, []);

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
    setSelectedCategoryId('');
    setSelectedChapters([]);
    setSelectedSections([]);
    setSelectedTypeCodes([]);
    setSelectedTypeItems(new Map());
    setQuestionTypeFilter('전체');
    setCreateMode('auto');
    setDifficulties({ '최상': 0, '상': 0, '중': 0, '하': 0, '최하': 0 });
    setPreviewProblems([]);
    setGeneratedExamId(null);
    setAvailableCounts({});
  };

  const handleToggleChapter = useCallback((chapter: string, sections: SectionNode[]) => {
    setSelectedChapters((prev) => {
      const isSelected = prev.includes(chapter);
      if (isSelected) {
        // Deselect chapter + all its sections
        const sectionNames = new Set(sections.map(s => s.section));
        const sectionCodes = new Set(sections.map(s => s.typeCode));
        setSelectedSections(p => p.filter(s => !sectionNames.has(s)));
        setSelectedTypeCodes(p => p.filter(t => !sectionCodes.has(t)));
        return prev.filter(c => c !== chapter);
      } else {
        // Select chapter + all its sections
        const newSections = sections.map(s => s.section);
        const newCodes = sections.map(s => s.typeCode);
        setSelectedSections(p => [...new Set([...p, ...newSections])]);
        setSelectedTypeCodes(p => [...new Set([...p, ...newCodes])]);
        return [...prev, chapter];
      }
    });
  }, []);

  const handleToggleSection = useCallback((section: string, typeCode: string) => {
    setSelectedSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );
    setSelectedTypeCodes((prev) =>
      prev.includes(typeCode) ? prev.filter((t) => t !== typeCode) : [...prev, typeCode]
    );
  }, []);

  // Type item handlers (Column 2)
  const handleToggleType = useCallback((typeCode: string) => {
    setSelectedTypeItems(prev => {
      const next = new Map(prev);
      if (next.has(typeCode)) {
        next.delete(typeCode);
      } else {
        next.set(typeCode, 1);
      }
      return next;
    });
  }, []);

  const handleSelectAllGroup = useCallback((standardCode: string, items: ExpandedMathType[]) => {
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

  // Save / Generate exam
  const handleSaveExam = async () => {
    if (!paperName.trim()) {
      alert('시험지 이름을 입력해주세요.');
      return;
    }
    if (totalQuestions === 0) {
      alert('문항수를 설정해주세요.');
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch('/api/exams/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: paperName,
          criteria: {
            subject: selectedCategory?.label || '',
            chapters: selectedChapters,
            sections: selectedSections,
            typeCodes: selectedTypeCodes,
            questionType: questionTypeFilter,
            difficulty_distribution: difficulties,
            mode: createMode,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate');
      }

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

              // Extract choices from answer_json
              const answerJson = prob.answer_json as Record<string, unknown> | null;
              const choices: string[] = answerJson?.choices
                ? (answerJson.choices as string[])
                : [];

              return {
                id: (prob.id || `gen-${idx}`) as string,
                number: ((ep.sequence_number as number) || idx + 1),
                content: (prob.content_latex || prob.content_html || '') as string,
                typeCode: (classification?.type_code || classification?.expanded_type_code || '') as string,
                typeName: '',
                difficulty: (classification?.difficulty || 3) as number,
                choices,
                answer: (answerJson?.answer || '') as string | number,
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

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <section className="flex h-[calc(100vh-6rem)] flex-col overflow-hidden">
      {/* ================================================================ */}
      {/* Header Area */}
      {/* ================================================================ */}
      <div className="flex-shrink-0 pb-2">
        {/* Row 1: Title + actions */}
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-content-primary">시험지 출제</h1>
          </div>

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
              disabled={generatedExamId ? false : (totalQuestions === 0 || !paperName.trim() || isGenerating)}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-500/50 bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:shadow-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>생성 중...</span>
                </>
              ) : generatedExamId ? (
                <>
                  <ArrowRight size={14} />
                  <span>다음 단계로</span>
                </>
              ) : (
                <>
                  <ArrowRight size={14} />
                  <span>다음 단계로</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Row 2: Scope + paper name + total + mode buttons */}
        <div className="flex items-center gap-3 mb-2">
          {/* Scope text */}
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
                  className="block w-52 rounded-md border border-subtle bg-surface-raised px-2 py-1 text-xs text-content-primary mt-0.5
                    focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Total + mode buttons */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-center px-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-content-tertiary">총 문항수</span>
              <div className="text-xl font-bold text-indigo-400 mt-0.5">{totalQuestions}</div>
            </div>

            <div className="flex gap-1">
              {[
                { mode: 'auto' as CreateMode, icon: <Wand2 size={13} />, label: '자동출제', bg: 'bg-indigo-600 hover:bg-indigo-500' },
                { mode: 'manual' as CreateMode, icon: <Pencil size={13} />, label: '수동출제', bg: 'bg-zinc-600 hover:bg-zinc-500' },
                { mode: 'add' as CreateMode, icon: <PlusCircle size={13} />, label: '문제추가', bg: 'bg-zinc-600 hover:bg-zinc-500' },
              ].map(({ mode, icon, label, bg }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCreateMode(mode)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-all ${
                    createMode === mode
                      ? `${mode === 'auto' ? 'bg-indigo-600 ring-2 ring-indigo-400/50' : 'bg-zinc-600 ring-2 ring-zinc-400/50'}`
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

        {/* Row 3: Question type filter chips */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-content-tertiary shrink-0">출제유형</span>
          <div className="flex flex-wrap gap-1.5">
            {(['전체', '교과서 유형', '문제집 유형', '기출 유형', '모의고사 유형'] as QuestionTypeFilter[]).map((type) => (
              <FilterChip
                key={type}
                label={type}
                active={questionTypeFilter === type}
                onClick={() => setQuestionTypeFilter(type)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* Main 3-Column Area */}
      {/* ================================================================ */}
      <div className="flex flex-1 gap-0 overflow-hidden rounded-xl border border-subtle bg-surface-raised">
        {/* ============================================================ */}
        {/* Left Group: Column 1 + Column 2 + Bottom */}
        {/* ============================================================ */}
        <div className="flex flex-col overflow-hidden" style={{ width: '56%' }}>
          {/* Top: Two columns side by side */}
          <div className="flex flex-1 min-h-0">
            {/* Column 1: Subject Tree */}
            <div className="w-1/2 border-r border-subtle flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-subtle flex-shrink-0">
                <StepBadge number={1} active={!selectedCategoryId} />
                <span className="text-sm font-semibold text-content-primary">과목을 선택해 주세요</span>
              </div>

              {/* Subject tag or dropdown */}
              <div className="flex-shrink-0 px-3 py-2 border-b border-subtle">
                {selectedCategoryId && selectedCategory ? (
                  /* Tag chip */
                  <div className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2">
                    <span className="text-xs font-medium text-indigo-300 flex-1 truncate">
                      {categoryLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategoryId('');
                        setSelectedChapters([]);
                        setSelectedSections([]);
                        setSelectedTypeCodes([]);
                        setSelectedTypeItems(new Map());
                      }}
                      className="p-0.5 text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  /* Dropdown */
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => {
                      setSelectedCategoryId(e.target.value);
                      setSelectedChapters([]);
                      setSelectedSections([]);
                      setSelectedTypeCodes([]);
                      setSelectedTypeItems(new Map());
                    }}
                    className="w-full rounded-lg border border-subtle bg-surface-raised px-3 py-2 text-sm text-content-primary focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">과목을 선택해 주세요</option>
                    {availableCategories.some((c) => c.curriculum === '2022개정') && (
                      <optgroup label="2022 개정교육과정">
                        {availableCategories
                          .filter((c) => c.curriculum === '2022개정')
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label} [{c.curriculum}]
                            </option>
                          ))}
                      </optgroup>
                    )}
                    {availableCategories.some((c) => c.curriculum === '개정전') && (
                      <optgroup label="개정전 (2015 교육과정)">
                        {availableCategories
                          .filter((c) => c.curriculum === '개정전')
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label} [{c.curriculum}]
                            </option>
                          ))}
                      </optgroup>
                    )}
                    {availableCategories.some((c) => c.curriculum === '' && c.levelCode === 'MS') && (
                      <optgroup label="중학교">
                        {availableCategories
                          .filter((c) => c.curriculum === '' && c.levelCode === 'MS')
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                      </optgroup>
                    )}
                    {availableCategories.some((c) => c.curriculum === '' && c.levelCode.startsWith('ES')) && (
                      <optgroup label="초등학교">
                        {availableCategories
                          .filter((c) => c.curriculum === '' && c.levelCode.startsWith('ES'))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                )}
              </div>

              {/* Tree */}
              <div className="flex-1 overflow-auto p-2 scrollbar-thin">
                {isLoadingTree ? (
                  <div className="flex items-center justify-center py-8 gap-2">
                    <Loader2 size={16} className="animate-spin text-content-muted" />
                    <span className="text-xs text-content-muted">과목 트리 로딩 중...</span>
                  </div>
                ) : subjectTree.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <AlertCircle size={20} className="text-content-muted" />
                    <span className="text-xs text-content-muted text-center">
                      {selectedCategoryId ? '등록된 유형이 없습니다' : '과목을 먼저 선택해 주세요'}
                    </span>
                  </div>
                ) : (
                  <SubjectTreePanel
                    tree={subjectTree}
                    selectedChapters={selectedChapters}
                    selectedSections={selectedSections}
                    onToggleChapter={handleToggleChapter}
                    onToggleSection={handleToggleSection}
                  />
                )}
              </div>
            </div>

            {/* Column 2: Type Detail */}
            <div className="w-1/2 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-subtle flex-shrink-0">
                <StepBadge number={2} active={hasSelection} />
                <span className="text-sm font-semibold text-content-primary">항목을 선택해 주세요</span>
                {selectedTypeItems.size > 0 && (
                  <span className="ml-auto text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                    {selectedTypeItems.size}개 선택
                  </span>
                )}
              </div>

              {/* Type list */}
              <div className="flex-1 overflow-auto p-1 scrollbar-thin">
                <TypeDetailPanel
                  typeGroups={typeGroups}
                  selectedTypeItems={selectedTypeItems}
                  onToggleType={handleToggleType}
                  onSelectAllGroup={handleSelectAllGroup}
                  onChangeTypeCount={handleChangeTypeCount}
                />
              </div>
            </div>
          </div>

          {/* Bottom: Difficulty Distribution */}
          <div className="flex-shrink-0 border-t border-subtle">
            <DifficultyDistributionBar
              difficulties={difficulties}
              availableCounts={availableCounts}
              totalQuestions={totalQuestions}
              onChange={setDifficulties}
            />
          </div>
        </div>

        {/* ============================================================ */}
        {/* Column 3: Exam Preview */}
        {/* ============================================================ */}
        <div className="flex-1 flex flex-col overflow-hidden border-l border-subtle">
          <ExamPreviewPanel
            previewTab={previewTab}
            onTabChange={setPreviewTab}
            problems={previewProblems}
            isLoading={isGenerating}
            paperName={paperName}
            scopeText={scopeText}
            categoryLabel={categoryLabel}
            totalQuestions={totalQuestions}
            layout={previewLayout}
            onLayoutChange={setPreviewLayout}
            gap={previewGap}
            onGapChange={setPreviewGap}
            templateId={previewTemplateId}
            examMeta={previewExamMeta}
            onOpenTemplateModal={() => setShowTemplateModal(true)}
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
