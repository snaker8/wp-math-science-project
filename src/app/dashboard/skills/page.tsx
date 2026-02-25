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
} from 'lucide-react';
import {
  LEVEL_CODE_LABELS,
  DOMAIN_CODE_LABELS,
  COGNITIVE_LABELS_KR,
  COGNITIVE_COLORS,
  DIFFICULTY_LABELS,
  DIFFICULTY_COLORS,
} from '@/types/expanded-types';
import type {
  LevelNode,
  DomainNode,
  StandardNode,
  ExpandedMathType,
  CognitiveDomain,
} from '@/types/expanded-types';
import { useTypeTree, useTypeDetail } from '@/hooks/useExpandedTypes';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';

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
        className="flex h-9 w-28 items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-white hover:border-zinc-600"
      >
        <span>{value}</span>
        <ChevronDown className="h-4 w-4 text-zinc-500" />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setIsOpen(false); }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 ${
                  value === opt ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400'
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

/** 4단 트리 (Level → Domain → Standard → Type) */
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

  const toggleLevel = (code: string) => {
    setExpandedLevels(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const toggleDomain = (key: string) => {
    setExpandedDomains(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleStandard = (key: string) => {
    setExpandedStandards(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-0.5">
      {tree.map(level => {
        const isLevelOpen = expandedLevels.has(level.levelCode);
        return (
          <div key={level.levelCode}>
            {/* Level */}
            <button
              type="button"
              onClick={() => toggleLevel(level.levelCode)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-zinc-200 hover:bg-zinc-800"
            >
              {isLevelOpen
                ? <ChevronDown className="h-3.5 w-3.5 text-violet-400" />
                : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
              <span>{level.label}</span>
              <span className="ml-auto rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{level.typeCount}</span>
            </button>

            {isLevelOpen && level.domains.map(domain => {
              const domKey = `${level.levelCode}-${domain.domainCode}`;
              const isDomOpen = expandedDomains.has(domKey);
              return (
                <div key={domKey}>
                  {/* Domain */}
                  <button
                    type="button"
                    onClick={() => toggleDomain(domKey)}
                    className="flex w-full items-center gap-2 rounded-lg py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800"
                    style={{ paddingLeft: '24px' }}
                  >
                    {isDomOpen
                      ? <ChevronDown className="h-3 w-3 text-zinc-500" />
                      : <ChevronRight className="h-3 w-3 text-zinc-500" />}
                    <span className="text-violet-400 text-xs font-mono">{domain.domainCode}</span>
                    <span>{domain.label}</span>
                    <span className="ml-auto text-[10px] text-zinc-600">{domain.typeCount}</span>
                  </button>

                  {isDomOpen && domain.standards.map(std => {
                    const stdKey = `${domKey}-${std.standardCode}`;
                    const isStdOpen = expandedStandards.has(stdKey);
                    return (
                      <div key={stdKey}>
                        {/* Standard */}
                        <button
                          type="button"
                          onClick={() => toggleStandard(stdKey)}
                          className="flex w-full items-center gap-2 rounded-lg py-1 text-left text-xs text-zinc-400 hover:bg-zinc-800"
                          style={{ paddingLeft: '40px' }}
                        >
                          {isStdOpen
                            ? <ChevronDown className="h-3 w-3 text-zinc-600" />
                            : <ChevronRight className="h-3 w-3 text-zinc-600" />}
                          <span className="font-mono text-emerald-500/70">{std.standardCode}</span>
                          <span className="ml-auto text-zinc-600">{std.typeCount}</span>
                        </button>

                        {isStdOpen && (
                          <div className="ml-1">
                            <p className="text-xs text-zinc-500 px-2 py-1" style={{ paddingLeft: '52px' }}>
                              {std.standardContent}
                            </p>
                            {std.types.map(t => (
                              <button
                                key={t.typeCode}
                                type="button"
                                onClick={() => onSelectType(t.typeCode)}
                                className={`flex w-full items-center gap-2 rounded-lg py-1.5 text-left text-xs transition-colors ${
                                  selectedTypeCode === t.typeCode
                                    ? 'bg-violet-900/30 text-violet-300 font-medium'
                                    : 'text-zinc-400 hover:bg-zinc-800/70'
                                }`}
                                style={{ paddingLeft: '56px' }}
                              >
                                <span
                                  className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: COGNITIVE_COLORS[t.cognitive] || '#666' }}
                                />
                                <span className="truncate">{t.typeName}</span>
                                <span className="ml-auto text-zinc-600 font-mono text-[10px]">
                                  {t.difficultyMin}-{t.difficultyMax}
                                </span>
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

/** 유형 상세 카드 */
function TypeDetailCard({ typeCode }: { typeCode: string | null }) {
  const { type, relatedTypes, loading } = useTypeDetail(typeCode);

  if (!typeCode) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        트리에서 유형을 선택하세요
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!type) {
    return <div className="flex h-full items-center justify-center text-sm text-zinc-500">유형을 찾을 수 없습니다</div>;
  }

  const cog = type.cognitive as CognitiveDomain;

  return (
    <div className="flex flex-col gap-3 p-3 text-sm overflow-auto">
      <div>
        <h3 className="text-base font-semibold text-white">{type.type_name}</h3>
        <p className="mt-0.5 font-mono text-xs text-zinc-500">{type.type_code}</p>
      </div>

      {type.description && (
        <div className="flex items-start gap-2 text-zinc-400">
          <FileText className="h-4 w-4 mt-0.5 text-zinc-600 flex-shrink-0" />
          <span>{type.description}</span>
        </div>
      )}

      {type.solution_method && (
        <div className="flex items-start gap-2 text-zinc-400">
          <BookOpenCheck className="h-4 w-4 mt-0.5 text-zinc-600 flex-shrink-0" />
          <span>풀이: {type.solution_method}</span>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5">
        <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-mono mb-1">
          <Hash className="h-3 w-3" />
          {type.standard_code}
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">{type.standard_content}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-zinc-600" />
          <span
            className="rounded-md border px-2 py-0.5 text-xs font-medium"
            style={{ borderColor: COGNITIVE_COLORS[cog], color: COGNITIVE_COLORS[cog] }}
          >
            {COGNITIVE_LABELS_KR[cog]}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Gauge className="h-3.5 w-3.5 text-zinc-600" />
          <span className="text-xs text-zinc-400">
            난이도 {DIFFICULTY_LABELS[type.difficulty_min]} ~ {DIFFICULTY_LABELS[type.difficulty_max]}
          </span>
        </div>
      </div>

      {type.keywords && (
        <div className="flex flex-wrap gap-1.5">
          <Tag className="h-3.5 w-3.5 text-zinc-600 mt-0.5" />
          {(Array.isArray(type.keywords) ? type.keywords : JSON.parse(type.keywords as string)).map((kw: string) => (
            <span key={kw} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
              {kw}
            </span>
          ))}
        </div>
      )}

      {relatedTypes.length > 0 && (
        <div className="mt-1">
          <p className="text-xs text-zinc-500 mb-1.5">같은 성취기준의 다른 유형</p>
          <div className="flex flex-col gap-1">
            {(relatedTypes as { type_code: string; type_name: string; cognitive: string }[]).map(rt => (
              <span key={rt.type_code} className="text-xs text-zinc-500">
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
// Main Page
// ============================================================================

export default function SkillsPage() {
  const [selectedSubject, setSelectedSubject] = useState('전체');
  const [schoolFilter, setSchoolFilter] = useState<string>('all');
  const [selectedTypeCode, setSelectedTypeCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // useTypeTree: school 필터 적용
  const treeFilters = useMemo(() => {
    const f: { school?: string } = {};
    if (schoolFilter !== 'all') f.school = schoolFilter;
    return f;
  }, [schoolFilter]);

  const { tree, totalTypes, totalStandards, loading } = useTypeTree(treeFilters);
  const { type: selectedTypeDetail, problems, relatedTypes, loading: detailLoading } = useTypeDetail(selectedTypeCode);

  // 검색 필터 (클라이언트 사이드)
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

  // 문제 통계 (선택된 유형의 문제들에서 집계)
  const problemStats = useMemo(() => {
    const diffCounts: Record<number, number> = {};
    const cogCounts: Record<string, number> = {};
    for (const item of problems as { difficulty?: number; cognitive_domain?: string }[]) {
      if (item.difficulty) diffCounts[item.difficulty] = (diffCounts[item.difficulty] || 0) + 1;
      if (item.cognitive_domain) cogCounts[item.cognitive_domain] = (cogCounts[item.cognitive_domain] || 0) + 1;
    }
    return { diffCounts, cogCounts };
  }, [problems]);

  return (
    <section className="flex h-full w-full overflow-hidden bg-black text-white">
      <div className="flex h-full w-full min-w-0 flex-col gap-2 p-4 px-4 py-1 font-pretendard text-sm">
        {/* Header */}
        <header className="flex w-full flex-shrink-0 items-center justify-between gap-x-4 pb-1">
          <div className="flex items-center gap-3 flex-shrink-0">
            <Puzzle className="h-5 w-5 text-violet-400" />
            <h1 className="text-lg font-semibold text-white">유형/문제 관리</h1>
            <div className="ml-2 flex items-center gap-2">
              <span className="text-xs text-zinc-500">과목</span>
              <SubjectSelect
                value={selectedSubject}
                options={subjects}
                onChange={setSelectedSubject}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* 검색 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                placeholder="유형 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-9 w-64 rounded-lg border border-zinc-700 bg-zinc-900 pl-9 pr-3 text-sm text-white placeholder:text-zinc-500 focus:border-violet-500 focus:outline-none"
              />
            </div>
            {/* 통계 */}
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="rounded-md bg-zinc-800 px-2 py-1">
                <span className="font-semibold text-white">{totalTypes}</span> 유형
              </span>
              <span className="rounded-md bg-zinc-800 px-2 py-1">
                <span className="font-semibold text-white">{totalStandards}</span> 성취기준
              </span>
            </div>
          </div>
        </header>

        {/* Main Content - Split Panel */}
        <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
          {/* Left Panel - 28% (학교급 탭 + 트리 + 상세) */}
          <div className="flex w-[28%] flex-shrink-0 flex-col gap-2">
            {/* School Level Tabs */}
            <div className="flex flex-shrink-0 gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
              {schoolTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setSchoolFilter(tab.key);
                    setSelectedTypeCode(null);
                  }}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    schoolFilter === tab.key
                      ? 'bg-violet-600 text-white'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Type Tree */}
            <div className="flex h-[55%] flex-col rounded-xl border border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
                <span className="text-xs font-medium text-zinc-400">분류 체계</span>
                <span className="text-xs text-zinc-600">{totalTypes}개 유형</span>
              </div>
              <div className="flex-1 overflow-auto p-2">
                {loading ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                  </div>
                ) : filteredTree.length > 0 ? (
                  <TypeTreeView
                    tree={filteredTree}
                    selectedTypeCode={selectedTypeCode}
                    onSelectType={setSelectedTypeCode}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-sm text-zinc-500">
                    {searchQuery ? (
                      <>
                        <Search className="h-6 w-6 mb-2 text-zinc-600" />
                        <p>&quot;{searchQuery}&quot; 검색 결과 없음</p>
                      </>
                    ) : (
                      <p>데이터를 불러오는 중...</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Type Detail */}
            <div className="flex flex-1 flex-col rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
                <BookOpenCheck className="h-3.5 w-3.5 text-zinc-500" />
                <span className="text-xs font-medium text-zinc-400">유형 상세</span>
              </div>
              <div className="flex-1 overflow-auto">
                <TypeDetailCard typeCode={selectedTypeCode} />
              </div>
            </div>
          </div>

          {/* Resize Handle */}
          <div className="flex w-px items-center justify-center mx-1">
            <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-zinc-800 border-zinc-700">
              <GripVertical className="h-2.5 w-2.5" />
            </div>
          </div>

          {/* Right Panel - 문제 목록 */}
          <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden">
            {/* Current Type Header */}
            <div className="flex-shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/50">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-violet-400 shadow-sm">
                    <LayoutGrid className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">현재 유형</span>
                    <span className="text-base font-semibold text-white">
                      {selectedTypeDetail?.type_name || '유형을 선택해 주세요'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!selectedTypeCode}
                    className="flex h-9 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:pointer-events-none text-zinc-300"
                  >
                    <ScrollText className="h-4 w-4 text-zinc-400" />
                    <span>시험지</span>
                  </button>
                  <button
                    type="button"
                    disabled={!selectedTypeCode}
                    className="flex h-9 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:pointer-events-none text-zinc-300"
                  >
                    <CheckSquare className="h-4 w-4 text-zinc-400" />
                    <span>빠른정답</span>
                  </button>
                  <button
                    type="button"
                    disabled={!selectedTypeCode}
                    className="flex h-9 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:pointer-events-none text-zinc-300"
                  >
                    <BookOpenCheck className="h-4 w-4 text-zinc-400" />
                    <span>해설지</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Problem List Area */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
              {/* Stats bar (only when type selected) */}
              {selectedTypeCode && problems.length > 0 && (
                <div className="flex-shrink-0 flex items-center gap-3 border-b border-zinc-800 px-4 py-2">
                  <span className="flex items-center rounded-md border border-zinc-600 bg-zinc-700 px-2 py-0.5 font-bold text-gray-100 text-sm">
                    {problems.length}<span className="pl-1 font-normal"> 문제</span>
                  </span>
                  {detailLoading && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
                  {Object.keys(problemStats.diffCounts).length > 0 && (
                    <>
                      <span className="text-xs text-zinc-500">난이도</span>
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
                      <span className="mx-1 h-4 border-l border-zinc-700" />
                      <span className="text-xs text-zinc-500">인지</span>
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

              {/* Problem list */}
              <div className="flex-1 overflow-auto p-3">
                {selectedTypeCode ? (
                  detailLoading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-zinc-500 mb-2" />
                      <p className="text-sm text-zinc-500">문제 불러오는 중...</p>
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
                              className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-violet-500/30 transition-colors"
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-300">
                                {i + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-zinc-300 leading-relaxed">
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
                                  <span className="text-xs text-zinc-500">
                                    {COGNITIVE_LABELS_KR[item.cognitive_domain as CognitiveDomain] || ''}
                                  </span>
                                  {String(prob.source_name || '') && (
                                    <span className="text-xs text-zinc-600">
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
                      <p className="text-sm text-zinc-500">이 유형에 등록된 문제가 없습니다.</p>
                      <p className="text-xs text-zinc-600 mt-1">PDF 자산화를 통해 문제를 추가해 주세요.</p>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <LayoutGrid className="h-12 w-12 text-zinc-700 mb-4" />
                    <p className="text-sm text-zinc-400 mb-1">
                      왼쪽 트리에서 유형을 선택하면 문제 목록이 표시됩니다.
                    </p>
                    <p className="text-xs text-zinc-600">
                      초/중/고 → 영역 → 성취기준 → 세부유형 순서로 탐색하세요.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
