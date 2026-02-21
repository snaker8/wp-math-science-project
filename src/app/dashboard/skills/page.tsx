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
import { useTypeTree, useTypeDetail, useExpandedTypesStats } from '@/hooks/useExpandedTypes';

// ============================================================================
// Sub-components
// ============================================================================

/** 레벨 선택 드롭다운 */
function LevelSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = [
    { value: '', label: '전체' },
    ...Object.entries(LEVEL_CODE_LABELS).map(([k, v]) => ({ value: k, label: v })),
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 w-48 items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-white hover:border-zinc-600"
      >
        <span>{options.find(o => o.value === value)?.label || '전체'}</span>
        <ChevronDown className="h-4 w-4 text-zinc-500" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl max-h-80 overflow-auto">
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 ${
                  value === opt.value ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400'
                }`}
              >
                {opt.label}
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
              {isLevelOpen ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
              <span>{level.label}</span>
              <span className="ml-auto text-xs text-zinc-600">{level.typeCount}</span>
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
                    {isDomOpen ? <ChevronDown className="h-3 w-3 text-zinc-500" /> : <ChevronRight className="h-3 w-3 text-zinc-500" />}
                    <span className="text-violet-400 text-xs font-mono">{domain.domainCode}</span>
                    <span>{domain.label}</span>
                    <span className="ml-auto text-xs text-zinc-600">{domain.typeCount}</span>
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
                          {isStdOpen ? <ChevronDown className="h-3 w-3 text-zinc-600" /> : <ChevronRight className="h-3 w-3 text-zinc-600" />}
                          <span className="font-mono text-emerald-500/70">{std.standardCode}</span>
                          <span className="ml-auto text-zinc-600">{std.typeCount}</span>
                        </button>

                        {isStdOpen && (
                          <div className="ml-1">
                            {/* Standard content */}
                            <p className="text-xs text-zinc-500 px-2 py-1" style={{ paddingLeft: '52px' }}>
                              {std.standardContent}
                            </p>
                            {/* Types */}
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
      {/* 유형명 */}
      <div>
        <h3 className="text-base font-semibold text-white">{type.type_name}</h3>
        <p className="mt-0.5 font-mono text-xs text-zinc-500">{type.type_code}</p>
      </div>

      {/* 설명 */}
      {type.description && (
        <div className="flex items-start gap-2 text-zinc-400">
          <FileText className="h-4 w-4 mt-0.5 text-zinc-600 flex-shrink-0" />
          <span>{type.description}</span>
        </div>
      )}

      {/* 풀이법 */}
      {type.solution_method && (
        <div className="flex items-start gap-2 text-zinc-400">
          <BookOpenCheck className="h-4 w-4 mt-0.5 text-zinc-600 flex-shrink-0" />
          <span>풀이: {type.solution_method}</span>
        </div>
      )}

      {/* 성취기준 */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5">
        <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-mono mb-1">
          <Hash className="h-3 w-3" />
          {type.standard_code}
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">{type.standard_content}</p>
      </div>

      {/* 인지영역 + 난이도 */}
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

      {/* 키워드 */}
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

      {/* 관련 유형 */}
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
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedTypeCode, setSelectedTypeCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { tree, totalTypes, totalStandards, loading } = useTypeTree(
    selectedLevel ? { level: selectedLevel } : undefined
  );
  const stats = useExpandedTypesStats();

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

  return (
    <section className="flex h-full w-full overflow-hidden bg-black text-white">
      <div className="flex h-full w-full min-w-0 flex-col gap-2 p-4 px-4 py-1 font-pretendard text-sm">
        {/* Header */}
        <header className="flex w-full flex-shrink-0 items-center justify-between gap-x-4 pb-1">
          <div className="flex items-center gap-3 flex-shrink-0">
            <Puzzle className="h-5 w-5 text-violet-400" />
            <h1 className="text-lg font-semibold text-white">유형/문제 관리</h1>
            <LevelSelector value={selectedLevel} onChange={setSelectedLevel} />
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
            {/* 통계 요약 */}
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="rounded-md bg-zinc-800 px-2 py-1">
                <span className="font-semibold text-white">{stats.total || totalTypes}</span> 유형
              </span>
              <span className="rounded-md bg-zinc-800 px-2 py-1">
                <span className="font-semibold text-white">{stats.totalStandards || totalStandards}</span> 성취기준
              </span>
            </div>
          </div>
        </header>

        {/* Main Content - Split Panel */}
        <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
          {/* Left Panel - 28% (트리 + 상세) */}
          <div className="flex w-[28%] flex-shrink-0 flex-col gap-2">
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
                  <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                    {searchQuery ? '검색 결과가 없습니다' : '데이터를 불러오는 중...'}
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
            {/* Stats Bar */}
            <div className="flex-shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                {/* 인지 영역 통계 */}
                <span className="text-xs text-zinc-500">인지영역</span>
                {Object.entries(stats.byCognitive || {}).map(([key, count]) => (
                  <StatsBadge
                    key={key}
                    label={COGNITIVE_LABELS_KR[key as CognitiveDomain] || key}
                    count={count}
                    color={COGNITIVE_COLORS[key as CognitiveDomain] || '#666'}
                  />
                ))}
                <span className="mx-2 h-4 border-l border-zinc-700" />
                {/* 학교급 통계 */}
                <span className="text-xs text-zinc-500">학교급</span>
                {Object.entries(stats.bySchool || {}).map(([key, count]) => (
                  <StatsBadge key={key} label={key.replace('학교', '')} count={count} color="#6b7280" />
                ))}
              </div>
            </div>

            {/* 문제 영역 / 레벨별 분포 */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
                <span className="text-xs font-medium text-zinc-400">레벨별 유형 분포</span>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {stats.loading ? (
                  <div className="flex h-32 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(LEVEL_CODE_LABELS).map(([code, label]) => {
                      const count = stats.byLevel?.[code] || 0;
                      if (count === 0) return null;
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setSelectedLevel(code)}
                          className={`flex items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                            selectedLevel === code
                              ? 'border-violet-500/50 bg-violet-900/20'
                              : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                          }`}
                        >
                          <div>
                            <p className="text-sm font-medium text-white">{label}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">{code}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-white">{count}</p>
                            <p className="text-xs text-zinc-500">유형</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 선택된 유형의 문제 미리보기 */}
                {selectedTypeCode && (
                  <div className="mt-6">
                    <SelectedTypeProblemPreview typeCode={selectedTypeCode} />
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

/** 선택된 유형의 문제 미리보기 */
function SelectedTypeProblemPreview({ typeCode }: { typeCode: string }) {
  const { type, problems, loading } = useTypeDetail(typeCode);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        문제 불러오는 중...
      </div>
    );
  }

  if (!type) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-medium text-white">
          {type.type_name}
        </h3>
        <span className="text-xs text-zinc-500 font-mono">{typeCode}</span>
        <span className="ml-auto text-xs text-zinc-500">
          {problems.length}개 문제
        </span>
      </div>

      {problems.length > 0 ? (
        <div className="space-y-2">
          {problems.slice(0, 10).map((item: unknown, i: number) => {
            const cls = item as Record<string, unknown>;
            const prob = cls.problems as Record<string, unknown> | null;
            if (!prob) return null;
            return (
              <div
                key={String(cls.id)}
                className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3 hover:border-violet-500/30 transition-colors"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300 line-clamp-2">
                    {String(prob.content_latex || '').slice(0, 200)}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span
                      className="rounded-md border px-1.5 py-0.5 text-[10px]"
                      style={{
                        borderColor: DIFFICULTY_COLORS[Number(cls.difficulty)] || '#666',
                        color: DIFFICULTY_COLORS[Number(cls.difficulty)] || '#666',
                      }}
                    >
                      {DIFFICULTY_LABELS[Number(cls.difficulty)] || cls.difficulty as string}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      {prob.source_name ? `${prob.source_name} ${prob.source_year || ''}` : ''}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">이 유형에 연결된 문제가 아직 없습니다.</p>
      )}
    </div>
  );
}
