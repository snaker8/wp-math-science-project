'use client';

import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Search,
  GripVertical,
  BookOpenCheck,
  Puzzle,
  Hash,
  Brain,
  Gauge,
  Tag,
  FileText,
  Loader2,
  LayoutGrid,
  ScrollText,
  CheckSquare,
  BookOpen,
  ListTree,
} from 'lucide-react';
import {
  COGNITIVE_LABELS_KR,
  COGNITIVE_COLORS,
  DIFFICULTY_LABELS,
  DIFFICULTY_COLORS,
} from '@/types/expanded-types';
import type {
  LevelNode,
  ExpandedMathType,
  CognitiveDomain,
} from '@/types/expanded-types';
import { useTypeTree, useTypeDetail, useExpandedTypesSearch } from '@/hooks/useExpandedTypes';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import {
  CURRICULUM_GRADES,
  CURRICULUM_BY_SCHOOL,
  type CurriculumGrade,
  type CurriculumChapter,
} from '@/data/curriculum-tree';

// ============================================================================
// Constants
// ============================================================================

const subjects = ['전체', '수학', '과학'];

const schoolTabs = [
  { key: 'all', label: '전체' },
  { key: '초등학교', label: '초등' },
  { key: '중학교', label: '중학' },
  { key: '고등학교', label: '고등' },
] as const;

type ViewMode = 'type' | 'curriculum';

// ============================================================================
// Sub-components
// ============================================================================

/** 과목 선택 드롭다운 */
function SubjectSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 w-28 items-center justify-between rounded-lg border border bg-surface-card px-3 text-sm text-content-primary hover:border-accent/30"
      >
        <span>{value}</span>
        <ChevronDown className="h-4 w-4 text-content-tertiary" />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border bg-surface-card py-1 shadow-xl">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setIsOpen(false); }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-surface-raised ${
                  value === opt ? 'bg-surface-raised text-content-primary font-medium' : 'text-content-secondary'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** 통계 배지 */
function StatsBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
      style={{ borderColor: color, color }}
    >
      {label} <span className="font-semibold">{count}</span>
    </span>
  );
}

/** 로마 숫자 변환 (대단원 넘버링) */
function romanNumeral(n: number): string {
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
    'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
  return numerals[n - 1] || String(n);
}

/** 성취기준 내용을 소단원명으로 요약 */
function summarizeStandard(content: string): string {
  if (!content) return '(내용 없음)';
  let text = content
    .replace(/을\s*할\s*수\s*있다\.?$/g, '')
    .replace(/를\s*할\s*수\s*있다\.?$/g, '')
    .replace(/를?\s*이해한다\.?$/g, '')
    .replace(/를?\s*안다\.?$/g, '')
    .replace(/를?\s*구한다\.?$/g, '')
    .replace(/를?\s*설명할\s*수\s*있다\.?$/g, '')
    .replace(/할\s*수\s*있다\.?$/g, '')
    .trim();
  if (text.length > 40) text = text.slice(0, 38) + '…';
  return text;
}

// ============================================================================
// TypeTreeView — 세부유형 DB 기반 트리
// ============================================================================

function TypeTreeView({
  tree,
  selectedTypeCode,
  onSelectType,
}: {
  tree: LevelNode[];
  selectedTypeCode: string | null;
  onSelectType: (code: string) => void;
}) {
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set());
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const [expandedStandards, setExpandedStandards] = useState<Set<string>>(new Set());

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
    setter(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-0.5">
      {tree.map((level, li) => {
        void li;
        const isLevelOpen = expandedLevels.has(level.levelCode);
        return (
          <div key={level.levelCode}>
            <button
              type="button"
              onClick={() => toggle(setExpandedLevels, level.levelCode)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold text-content-primary hover:bg-surface-raised/80"
            >
              {isLevelOpen
                ? <ChevronDown className="h-4 w-4 text-violet-400 flex-shrink-0" />
                : <ChevronRight className="h-4 w-4 text-content-tertiary flex-shrink-0" />}
              <span>{level.label}</span>
              <span className="ml-auto rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-content-tertiary">
                {level.typeCount}
              </span>
            </button>

            {isLevelOpen && level.domains.map((domain, di) => {
              const domKey = `${level.levelCode}-${domain.domainCode}`;
              const isDomOpen = expandedDomains.has(domKey);
              return (
                <div key={domKey}>
                  <button
                    type="button"
                    onClick={() => toggle(setExpandedDomains, domKey)}
                    className="flex w-full items-center gap-2 rounded-lg py-1.5 text-left text-[13px] text-content-secondary hover:bg-surface-raised/60"
                    style={{ paddingLeft: '20px' }}
                  >
                    {isDomOpen
                      ? <ChevronDown className="h-3.5 w-3.5 text-content-tertiary flex-shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 text-content-tertiary flex-shrink-0" />}
                    <span className="text-violet-400/80 text-xs mr-0.5">{romanNumeral(di + 1)}.</span>
                    <span>{domain.label}</span>
                    <span className="ml-auto text-[10px] text-content-muted">{domain.typeCount}</span>
                  </button>

                  {isDomOpen && domain.standards.map((std, si) => {
                    const stdKey = `${domKey}-${std.standardCode}`;
                    const isStdOpen = expandedStandards.has(stdKey);
                    const hasTypes = std.types.length > 1;
                    return (
                      <div key={stdKey}>
                        <button
                          type="button"
                          onClick={() => {
                            if (hasTypes) {
                              toggle(setExpandedStandards, stdKey);
                            } else if (std.types.length === 1) {
                              onSelectType(std.types[0].typeCode);
                            }
                          }}
                          className={`flex w-full items-center gap-1.5 rounded-lg py-1.5 text-left text-xs hover:bg-surface-raised/50 ${
                            !hasTypes && std.types.length === 1 && selectedTypeCode === std.types[0].typeCode
                              ? 'bg-violet-900/30 text-violet-300'
                              : 'text-content-secondary'
                          }`}
                          style={{ paddingLeft: '40px' }}
                        >
                          {hasTypes ? (
                            isStdOpen
                              ? <ChevronDown className="h-3 w-3 text-content-muted flex-shrink-0" />
                              : <ChevronRight className="h-3 w-3 text-content-muted flex-shrink-0" />
                          ) : (
                            <span className="w-3 flex-shrink-0 text-center text-content-muted">·</span>
                          )}
                          <span className="text-content-tertiary mr-0.5">{si + 1}.</span>
                          <span className="truncate leading-snug">
                            {summarizeStandard(std.standardContent)}
                          </span>
                          <span className="ml-auto flex-shrink-0 text-[10px] text-content-muted">
                            {std.typeCount}
                          </span>
                        </button>

                        {isStdOpen && hasTypes && (
                          <div>
                            {std.types.map(t => (
                              <button
                                key={t.typeCode}
                                type="button"
                                onClick={() => onSelectType(t.typeCode)}
                                className={`flex w-full items-center gap-2 rounded-lg py-1.5 text-left text-xs transition-colors ${
                                  selectedTypeCode === t.typeCode
                                    ? 'bg-violet-900/30 text-violet-300 font-medium'
                                    : 'text-content-tertiary hover:bg-surface-raised/50 hover:text-content-secondary'
                                }`}
                                style={{ paddingLeft: '56px' }}
                              >
                                <span
                                  className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: COGNITIVE_COLORS[t.cognitive] || '#666' }}
                                />
                                <span className="truncate">{t.typeName}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// CurriculumTreeView — 교과과정 기반 트리 (2015 개정 교육과정)
// ============================================================================

function CurriculumTreeView({
  grades,
  selectedChapterId,
  onSelectChapter,
}: {
  grades: CurriculumGrade[];
  selectedChapterId: string | null;
  onSelectChapter: (chapter: CurriculumChapter, gradeName: string) => void;
}) {
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(new Set());
  const [expandedSemesters, setExpandedSemesters] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
    setter(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-0.5">
      {grades.map((grade) => {
        const isGradeOpen = expandedGrades.has(grade.id);
        const hasSemesters = grade.semesters.length > 1;
        return (
          <div key={grade.id}>
            {/* 학년 / 과목 */}
            <button
              type="button"
              onClick={() => toggle(setExpandedGrades, grade.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold text-content-primary hover:bg-surface-raised/80"
            >
              {isGradeOpen
                ? <ChevronDown className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                : <ChevronRight className="h-4 w-4 text-content-tertiary flex-shrink-0" />}
              <BookOpen className="h-3.5 w-3.5 text-emerald-500/60 flex-shrink-0" />
              <span>{grade.label}</span>
            </button>

            {isGradeOpen && grade.semesters.map((sem) => {
              const semKey = sem.id;
              const isSemOpen = !hasSemesters || expandedSemesters.has(semKey);

              return (
                <div key={semKey}>
                  {/* 학기 (초/중등만) */}
                  {hasSemesters && (
                    <button
                      type="button"
                      onClick={() => toggle(setExpandedSemesters, semKey)}
                      className="flex w-full items-center gap-2 rounded-lg py-1.5 text-left text-[13px] text-content-secondary hover:bg-surface-raised/60"
                      style={{ paddingLeft: '20px' }}
                    >
                      {isSemOpen
                        ? <ChevronDown className="h-3.5 w-3.5 text-content-tertiary flex-shrink-0" />
                        : <ChevronRight className="h-3.5 w-3.5 text-content-tertiary flex-shrink-0" />}
                      <span className="text-emerald-400/70 text-xs">{sem.label}</span>
                    </button>
                  )}

                  {isSemOpen && sem.chapters.map((chapter, ci) => {
                    const chapKey = chapter.id;
                    const isChapOpen = expandedChapters.has(chapKey);
                    const hasUnits = chapter.units.length > 0;
                    const isSelected = selectedChapterId === chapter.id;

                    return (
                      <div key={chapKey}>
                        {/* 대단원 */}
                        <button
                          type="button"
                          onClick={() => {
                            if (hasUnits) {
                              toggle(setExpandedChapters, chapKey);
                            }
                            onSelectChapter(chapter, grade.label);
                          }}
                          className={`flex w-full items-center gap-1.5 rounded-lg py-1.5 text-left text-xs transition-colors ${
                            isSelected
                              ? 'bg-emerald-900/30 text-emerald-300'
                              : 'text-content-secondary hover:bg-surface-raised/50'
                          }`}
                          style={{ paddingLeft: hasSemesters ? '40px' : '20px' }}
                        >
                          {hasUnits ? (
                            isChapOpen
                              ? <ChevronDown className="h-3 w-3 text-content-muted flex-shrink-0" />
                              : <ChevronRight className="h-3 w-3 text-content-muted flex-shrink-0" />
                          ) : (
                            <span className="w-3 flex-shrink-0 text-center text-content-muted">·</span>
                          )}
                          <span className="text-content-tertiary mr-0.5">{romanNumeral(ci + 1)}.</span>
                          <span className="truncate">{chapter.name}</span>
                          <span className="ml-auto flex-shrink-0 text-[10px] text-content-muted">
                            {chapter.units.length}
                          </span>
                        </button>

                        {/* 소단원 */}
                        {isChapOpen && chapter.units.map((unit, ui) => (
                          <button
                            key={unit.id}
                            type="button"
                            onClick={() => onSelectChapter({ ...chapter, name: unit.name, id: unit.id, units: [] }, grade.label)}
                            className={`flex w-full items-center gap-2 rounded-lg py-1.5 text-left text-xs transition-colors ${
                              selectedChapterId === unit.id
                                ? 'bg-emerald-900/30 text-emerald-300 font-medium'
                                : 'text-content-tertiary hover:bg-surface-raised/50 hover:text-content-secondary'
                            }`}
                            style={{ paddingLeft: hasSemesters ? '56px' : '36px' }}
                          >
                            <span className="h-1 w-1 rounded-full bg-zinc-600 flex-shrink-0" />
                            <span className="text-content-muted mr-0.5">{ui + 1}.</span>
                            <span className="truncate">{unit.name}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// TypeDetailCard
// ============================================================================

function TypeDetailCard({ typeCode }: { typeCode: string | null }) {
  const { type, relatedTypes, loading } = useTypeDetail(typeCode);

  if (!typeCode) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-content-tertiary">
        트리에서 유형을 선택하세요
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-content-tertiary" />
      </div>
    );
  }

  if (!type) {
    return <div className="flex h-full items-center justify-center text-sm text-content-tertiary">유형을 찾을 수 없습니다</div>;
  }

  const cog = type.cognitive as CognitiveDomain;

  return (
    <div className="flex flex-col gap-3 p-3 text-sm overflow-auto">
      <div>
        <h3 className="text-base font-semibold text-content-primary">{type.type_name}</h3>
        <p className="mt-0.5 font-mono text-xs text-content-tertiary">{type.type_code}</p>
      </div>

      {type.description && (
        <div className="flex items-start gap-2 text-content-secondary">
          <FileText className="h-4 w-4 mt-0.5 text-content-muted flex-shrink-0" />
          <span>{type.description}</span>
        </div>
      )}

      {type.solution_method && (
        <div className="flex items-start gap-2 text-content-secondary">
          <BookOpenCheck className="h-4 w-4 mt-0.5 text-content-muted flex-shrink-0" />
          <span>풀이: {type.solution_method}</span>
        </div>
      )}

      <div className="rounded-lg border border-subtle bg-surface-card/80 p-2.5">
        <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-mono mb-1">
          <Hash className="h-3 w-3" />
          {type.standard_code}
        </div>
        <p className="text-xs text-content-secondary leading-relaxed">{type.standard_content}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-content-muted" />
          <span
            className="rounded-md border px-2 py-0.5 text-xs font-medium"
            style={{ borderColor: COGNITIVE_COLORS[cog], color: COGNITIVE_COLORS[cog] }}
          >
            {COGNITIVE_LABELS_KR[cog]}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Gauge className="h-3.5 w-3.5 text-content-muted" />
          <span className="text-xs text-content-secondary">
            난이도 {DIFFICULTY_LABELS[type.difficulty_min]} ~ {DIFFICULTY_LABELS[type.difficulty_max]}
          </span>
        </div>
      </div>

      {type.keywords && (
        <div className="flex flex-wrap gap-1.5">
          <Tag className="h-3.5 w-3.5 text-content-muted mt-0.5" />
          {(Array.isArray(type.keywords) ? type.keywords : JSON.parse(type.keywords as string)).map((kw: string) => (
            <span key={kw} className="rounded-full bg-surface-raised px-2 py-0.5 text-xs text-content-secondary">
              {kw}
            </span>
          ))}
        </div>
      )}

      {relatedTypes.length > 0 && (
        <div className="mt-1">
          <p className="text-xs text-content-tertiary mb-1.5">같은 성취기준의 다른 유형</p>
          <div className="flex flex-col gap-1">
            {(relatedTypes as { type_code: string; type_name: string; cognitive: string }[]).map(rt => (
              <span key={rt.type_code} className="text-xs text-content-tertiary">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full mr-1.5"
                  style={{ backgroundColor: COGNITIVE_COLORS[rt.cognitive as CognitiveDomain] || '#666' }}
                />
                {rt.type_name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CurriculumSearchPanel — 교과과정 모드 오른쪽 패널
// ============================================================================

function CurriculumSearchPanel({
  searchTerm,
  gradeName,
  chapterName,
  onSelectType,
  selectedTypeCode,
}: {
  searchTerm: string;
  gradeName: string;
  chapterName: string;
  onSelectType: (code: string) => void;
  selectedTypeCode: string | null;
}) {
  const { results, count, loading } = useExpandedTypesSearch({
    search: searchTerm,
    limit: 50,
  });

  if (!searchTerm) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BookOpen className="h-12 w-12 text-zinc-700 mb-4" />
        <p className="text-sm text-content-secondary mb-1">교과과정에서 단원을 선택하세요</p>
        <p className="text-xs text-content-muted">단원 클릭 → 관련 세부유형 목록 표시</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-content-tertiary mb-2" />
        <p className="text-sm text-content-tertiary">유형 검색 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="px-1 pb-1">
        <p className="text-xs text-content-tertiary">
          <span className="text-content-secondary font-medium">{gradeName}</span>
          <span className="mx-1 text-content-muted">›</span>
          <span className="text-emerald-400/80">{chapterName}</span>
          <span className="ml-2 text-content-muted">— 관련 유형 {count}개</span>
        </p>
      </div>
      {results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Search className="h-8 w-8 text-zinc-700 mb-2" />
          <p className="text-sm text-content-tertiary">관련 세부유형이 없습니다.</p>
          <p className="text-xs text-content-muted mt-1">DB에 매핑된 유형을 추가하거나 다른 단원을 선택하세요.</p>
        </div>
      ) : (
        results.map((t: ExpandedMathType) => (
          <button
            key={t.typeCode}
            type="button"
            onClick={() => onSelectType(t.typeCode)}
            className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
              selectedTypeCode === t.typeCode
                ? 'border-emerald-700/50 bg-emerald-900/20'
                : 'border-subtle bg-surface-card hover:border-emerald-700/30 hover:bg-surface-raised/50'
            }`}
          >
            <span
              className="h-2 w-2 rounded-full flex-shrink-0 mt-0.5"
              style={{ backgroundColor: COGNITIVE_COLORS[t.cognitive] || '#666' }}
            />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${selectedTypeCode === t.typeCode ? 'text-emerald-300' : 'text-content-secondary'}`}>
                {t.typeName}
              </p>
              <p className="text-xs text-content-muted mt-0.5">{t.subject} · {t.area}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span
                className="rounded-md border px-1.5 py-0.5 text-[10px]"
                style={{ borderColor: COGNITIVE_COLORS[t.cognitive], color: COGNITIVE_COLORS[t.cognitive] }}
              >
                {COGNITIVE_LABELS_KR[t.cognitive]}
              </span>
              {t.problemCount > 0 && (
                <span className="text-[10px] text-content-tertiary">{t.problemCount}문제</span>
              )}
            </div>
          </button>
        ))
      )}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function SkillsPage() {
  const [selectedSubject, setSelectedSubject] = useState('전체');
  const [schoolFilter, setSchoolFilter] = useState<string>('all');
  const [selectedTypeCode, setSelectedTypeCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 뷰 모드: 유형별 | 교과과정별
  const [viewMode, setViewMode] = useState<ViewMode>('type');

  // 교과과정 모드에서 선택된 단원
  const [curriculumSelectedId, setCurriculumSelectedId] = useState<string | null>(null);
  const [curriculumSearchTerm, setCurriculumSearchTerm] = useState('');
  const [curriculumGradeName, setCurriculumGradeName] = useState('');
  const [curriculumChapterName, setCurriculumChapterName] = useState('');

  // 유형별 트리 (DB)
  const treeFilters = useMemo(() => {
    const f: { school?: string } = {};
    if (schoolFilter !== 'all') f.school = schoolFilter;
    return f;
  }, [schoolFilter]);

  const { tree, totalTypes, totalStandards, loading } = useTypeTree(treeFilters);
  const { type: selectedTypeDetail, problems, loading: detailLoading } = useTypeDetail(selectedTypeCode);

  // 교과과정 모드 학년 목록 필터링
  const curriculumGrades = useMemo(() => {
    if (schoolFilter === 'all') return CURRICULUM_GRADES;
    const schoolLevelMap: Record<string, string> = {
      '초등학교': '초등학교',
      '중학교': '중학교',
      '고등학교': '고등학교',
    };
    const level = schoolLevelMap[schoolFilter];
    if (!level) return CURRICULUM_GRADES;
    return CURRICULUM_BY_SCHOOL[level as keyof typeof CURRICULUM_BY_SCHOOL] ?? CURRICULUM_GRADES;
  }, [schoolFilter]);

  // 검색 필터 (유형별 트리)
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;
    const q = searchQuery.toLowerCase();
    return tree
      .map(level => ({
        ...level,
        domains: level.domains
          .map(domain => ({
            ...domain,
            standards: domain.standards
              .map(std => ({
                ...std,
                types: std.types.filter(
                  t =>
                    t.typeName.toLowerCase().includes(q) ||
                    t.typeCode.toLowerCase().includes(q) ||
                    (t.standardContent || '').toLowerCase().includes(q) ||
                    t.keywords.some(k => k.toLowerCase().includes(q))
                ),
              }))
              .filter(std => std.types.length > 0),
          }))
          .filter(domain => domain.standards.length > 0),
      }))
      .filter(level => level.domains.length > 0);
  }, [tree, searchQuery]);

  // 문제 통계
  const problemStats = useMemo(() => {
    const diffCounts: Record<number, number> = {};
    const cogCounts: Record<string, number> = {};
    for (const item of problems as { difficulty?: number; cognitive_domain?: string }[]) {
      if (item.difficulty) diffCounts[item.difficulty] = (diffCounts[item.difficulty] || 0) + 1;
      if (item.cognitive_domain) cogCounts[item.cognitive_domain] = (cogCounts[item.cognitive_domain] || 0) + 1;
    }
    return { diffCounts, cogCounts };
  }, [problems]);

  const handleSchoolFilterChange = (key: string) => {
    setSchoolFilter(key);
    setSelectedTypeCode(null);
    setCurriculumSelectedId(null);
    setCurriculumSearchTerm('');
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setSelectedTypeCode(null);
    setCurriculumSelectedId(null);
    setCurriculumSearchTerm('');
  };

  return (
    <section className="flex h-full w-full overflow-hidden bg-surface-base text-content-primary">
      <div className="flex h-full w-full min-w-0 flex-col gap-2 p-4 px-4 py-1 font-pretendard text-sm">
        {/* Header */}
        <header className="flex w-full flex-shrink-0 items-center justify-between gap-x-4 pb-1">
          <div className="flex items-center gap-3 flex-shrink-0">
            <Puzzle className="h-5 w-5 text-violet-400" />
            <h1 className="text-lg font-semibold text-content-primary">유형/문제 관리</h1>
            <div className="ml-2 flex items-center gap-2">
              <span className="text-xs text-content-tertiary">과목</span>
              <SubjectSelect
                value={selectedSubject}
                options={subjects}
                onChange={setSelectedSubject}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* 검색 (유형별 모드에서만) */}
            {viewMode === 'type' && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-tertiary" />
                <input
                  type="text"
                  placeholder="유형 검색..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="h-9 w-64 rounded-lg border border bg-surface-card pl-9 pr-3 text-sm text-content-primary placeholder:text-content-tertiary focus:border-violet-500 focus:outline-none"
                />
              </div>
            )}
            {/* 통계 */}
            {viewMode === 'type' && (
              <div className="flex items-center gap-2 text-xs text-content-tertiary">
                <span className="rounded-md bg-surface-raised px-2 py-1">
                  <span className="font-semibold text-content-primary">{totalTypes}</span> 유형
                </span>
                <span className="rounded-md bg-surface-raised px-2 py-1">
                  <span className="font-semibold text-content-primary">{totalStandards}</span> 성취기준
                </span>
              </div>
            )}
            {viewMode === 'curriculum' && (
              <div className="flex items-center gap-2 text-xs text-content-tertiary">
                <span className="rounded-md bg-surface-raised px-2 py-1">
                  2015 개정 교육과정 기준
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Main Content - Split Panel */}
        <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
          {/* Left Panel */}
          <div className="flex w-[28%] flex-shrink-0 flex-col gap-2">
            {/* 학교급 탭 */}
            <div className="flex flex-shrink-0 gap-1 rounded-lg border border-subtle bg-surface-card/50 p-1">
              {schoolTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleSchoolFilterChange(tab.key)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    schoolFilter === tab.key
                      ? 'bg-violet-600 text-content-primary'
                      : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 뷰 모드 토글 */}
            <div className="flex flex-shrink-0 gap-1 rounded-lg border border-subtle bg-surface-card/50 p-1">
              <button
                type="button"
                onClick={() => handleViewModeChange('type')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'type'
                    ? 'bg-violet-700/60 text-violet-200 border border-violet-700/50'
                    : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary'
                }`}
              >
                <ListTree className="h-3.5 w-3.5" />
                유형별
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange('curriculum')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'curriculum'
                    ? 'bg-emerald-800/60 text-emerald-200 border border-emerald-700/50'
                    : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                교과과정별
              </button>
            </div>

            {/* 트리 영역 */}
            <div className={`flex flex-col rounded-xl border border-subtle bg-surface-card/50 ${viewMode === 'type' ? 'h-[55%]' : 'flex-1'}`}>
              <div className="flex items-center justify-between border-b border-subtle px-3 py-2 flex-shrink-0">
                {viewMode === 'type' ? (
                  <>
                    <span className="text-xs font-medium text-content-secondary">교과과정 (세부유형)</span>
                    <span className="text-xs text-content-muted">{totalTypes}개 유형</span>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-medium text-content-secondary">교과과정 (단원별)</span>
                    <span className="text-xs text-content-muted">2015 개정</span>
                  </>
                )}
              </div>
              <div className="flex-1 overflow-auto p-2">
                {viewMode === 'type' ? (
                  loading ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-content-tertiary" />
                    </div>
                  ) : filteredTree.length > 0 ? (
                    <TypeTreeView
                      tree={filteredTree}
                      selectedTypeCode={selectedTypeCode}
                      onSelectType={setSelectedTypeCode}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-sm text-content-tertiary">
                      {searchQuery ? (
                        <>
                          <Search className="h-6 w-6 mb-2 text-content-muted" />
                          <p>&quot;{searchQuery}&quot; 검색 결과 없음</p>
                        </>
                      ) : (
                        <p>데이터를 불러오는 중...</p>
                      )}
                    </div>
                  )
                ) : (
                  <CurriculumTreeView
                    grades={curriculumGrades}
                    selectedChapterId={curriculumSelectedId}
                    onSelectChapter={(chapter, gradeName) => {
                      setCurriculumSelectedId(chapter.id);
                      setCurriculumSearchTerm(chapter.name);
                      setCurriculumGradeName(gradeName);
                      setCurriculumChapterName(chapter.name);
                      setSelectedTypeCode(null);
                    }}
                  />
                )}
              </div>
            </div>

            {/* 유형 상세 (유형별 모드에서만) */}
            {viewMode === 'type' && (
              <div className="flex flex-1 flex-col rounded-xl border border-subtle bg-surface-card/50 overflow-hidden">
                <div className="flex items-center gap-2 border-b border-subtle px-3 py-2 flex-shrink-0">
                  <BookOpenCheck className="h-3.5 w-3.5 text-content-tertiary" />
                  <span className="text-xs font-medium text-content-secondary">유형 상세</span>
                </div>
                <div className="flex-1 overflow-auto">
                  <TypeDetailCard typeCode={selectedTypeCode} />
                </div>
              </div>
            )}
          </div>

          {/* Resize Handle */}
          <div className="flex w-px items-center justify-center mx-1">
            <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-surface-raised border">
              <GripVertical className="h-2.5 w-2.5" />
            </div>
          </div>

          {/* Right Panel */}
          <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden">
            {/* Current Type Header */}
            <div className="flex-shrink-0 rounded-xl border border-subtle bg-surface-card/50">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised shadow-sm ${
                    viewMode === 'curriculum' ? 'text-emerald-400' : 'text-violet-400'
                  }`}>
                    {viewMode === 'curriculum' ? <BookOpen className="h-5 w-5" /> : <LayoutGrid className="h-5 w-5" />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold uppercase tracking-wide text-content-tertiary">
                      {viewMode === 'curriculum' ? '선택된 단원' : '현재 유형'}
                    </span>
                    <span className="text-base font-semibold text-content-primary">
                      {viewMode === 'curriculum'
                        ? (curriculumChapterName || '단원을 선택해 주세요')
                        : (selectedTypeDetail?.type_name || '유형을 선택해 주세요')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!selectedTypeCode}
                    className="flex h-9 items-center gap-1 rounded-md border border bg-surface-raised px-3 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:pointer-events-none text-content-secondary"
                  >
                    <ScrollText className="h-4 w-4 text-content-secondary" />
                    <span>시험지</span>
                  </button>
                  <button
                    type="button"
                    disabled={!selectedTypeCode}
                    className="flex h-9 items-center gap-1 rounded-md border border bg-surface-raised px-3 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:pointer-events-none text-content-secondary"
                  >
                    <CheckSquare className="h-4 w-4 text-content-secondary" />
                    <span>빠른정답</span>
                  </button>
                  <button
                    type="button"
                    disabled={!selectedTypeCode}
                    className="flex h-9 items-center gap-1 rounded-md border border bg-surface-raised px-3 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:pointer-events-none text-content-secondary"
                  >
                    <BookOpenCheck className="h-4 w-4 text-content-secondary" />
                    <span>해설지</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-subtle bg-surface-card/50">
              {/* 교과과정 모드: 단원 → 유형 검색 패널 */}
              {viewMode === 'curriculum' && !selectedTypeCode && (
                <div className="flex-1 overflow-auto p-3">
                  <CurriculumSearchPanel
                    searchTerm={curriculumSearchTerm}
                    gradeName={curriculumGradeName}
                    chapterName={curriculumChapterName}
                    onSelectType={setSelectedTypeCode}
                    selectedTypeCode={selectedTypeCode}
                  />
                </div>
              )}

              {/* 유형 선택됨 → 문제 목록 (두 모드 공통) */}
              {selectedTypeCode && (
                <>
                  {/* Stats bar */}
                  {problems.length > 0 && (
                    <div className="flex-shrink-0 flex items-center gap-3 border-b border-subtle px-4 py-2">
                      <span className="flex items-center rounded-md border border-zinc-600 bg-zinc-700 px-2 py-0.5 font-bold text-gray-100 text-sm">
                        {problems.length}<span className="pl-1 font-normal"> 문제</span>
                      </span>
                      {detailLoading && <Loader2 className="h-4 w-4 animate-spin text-content-tertiary" />}
                      {Object.keys(problemStats.diffCounts).length > 0 && (
                        <>
                          <span className="text-xs text-content-tertiary">난이도</span>
                          {[1, 2, 3, 4, 5].map((d) =>
                            problemStats.diffCounts[d] ? (
                              <StatsBadge
                                key={d}
                                label={DIFFICULTY_LABELS[d]}
                                count={problemStats.diffCounts[d]}
                                color={DIFFICULTY_COLORS[d]}
                              />
                            ) : null
                          )}
                        </>
                      )}
                      {Object.keys(problemStats.cogCounts).length > 0 && (
                        <>
                          <span className="mx-1 h-4 border-l border" />
                          <span className="text-xs text-content-tertiary">인지</span>
                          {Object.entries(problemStats.cogCounts).map(([cog, count]) => (
                            <StatsBadge
                              key={cog}
                              label={COGNITIVE_LABELS_KR[cog as CognitiveDomain] || cog}
                              count={count}
                              color={COGNITIVE_COLORS[cog as CognitiveDomain] || '#666'}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                  <div className="flex-1 overflow-auto p-3">
                    {detailLoading ? (
                      <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-content-tertiary mb-2" />
                        <p className="text-sm text-content-tertiary">문제 불러오는 중...</p>
                      </div>
                    ) : problems.length > 0 ? (
                      <div className="space-y-2">
                        {(problems as { id: string; problem_id: string; difficulty: number; cognitive_domain: string; problems: Record<string, unknown> | null }[])
                          .map((item, i) => {
                            const prob = item.problems;
                            if (!prob) return null;
                            return (
                              <div
                                key={String(item.id)}
                                className="flex items-start gap-3 rounded-xl border border-subtle bg-surface-card p-4 hover:border-violet-500/30 transition-colors"
                              >
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-sm font-semibold text-content-secondary">
                                  {i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-content-secondary leading-relaxed">
                                    <MixedContentRenderer
                                      content={String(prob.content_latex || '')}
                                      className="text-sm"
                                    />
                                  </div>
                                  <div className="mt-2 flex items-center gap-2">
                                    <span
                                      className="rounded-md border px-2 py-0.5 text-xs"
                                      style={{
                                        borderColor: DIFFICULTY_COLORS[item.difficulty] || '#666',
                                        color: DIFFICULTY_COLORS[item.difficulty] || '#666',
                                      }}
                                    >
                                      {DIFFICULTY_LABELS[item.difficulty] || '미지정'}
                                    </span>
                                    <span className="text-xs text-content-tertiary">
                                      {COGNITIVE_LABELS_KR[item.cognitive_domain as CognitiveDomain] || ''}
                                    </span>
                                    {String(prob.source_name || '') && (
                                      <span className="text-xs text-content-muted">
                                        {String(prob.source_name)} {prob.source_year ? String(prob.source_year) : ''}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <FileText className="h-10 w-10 text-zinc-700 mb-3" />
                        <p className="text-sm text-content-tertiary">이 유형에 등록된 문제가 없습니다.</p>
                        <p className="text-xs text-content-muted mt-1">PDF 자산화를 통해 문제를 추가해 주세요.</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* 아무것도 선택 안 됨 (유형별 모드) */}
              {viewMode === 'type' && !selectedTypeCode && (
                <div className="flex-1 overflow-auto p-3">
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <LayoutGrid className="h-12 w-12 text-zinc-700 mb-4" />
                    <p className="text-sm text-content-secondary mb-1">
                      왼쪽 트리에서 유형을 선택하면 문제 목록이 표시됩니다.
                    </p>
                    <p className="text-xs text-content-muted">
                      학년 → 대단원 → 소단원 순서로 탐색하세요.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
