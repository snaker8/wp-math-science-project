'use client';

import React, { useState, useMemo } from 'react';
import { X, Printer, ChevronRight } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface Problem {
  id: string;
  number: number;
  difficulty: number;
  cognitiveDomain: string;
  typeCode: string;
  typeName: string;
  chapter?: string;
  section?: string;
}

interface ExamStatsModalProps {
  examTitle: string;
  problems: Problem[];
  onClose: () => void;
}

type TabKey = 'table' | 'chart';

// ============================================================================
// Constants
// ============================================================================

const DIFFICULTY_LABELS: Record<number, string> = {
  1: '최하', 2: '하', 3: '중', 4: '상', 5: '최상',
};

const DOMAIN_LABELS: Record<string, string> = {
  CALCULATION: '계산',
  UNDERSTANDING: '이해',
  INFERENCE: '추론',
  PROBLEM_SOLVING: '해결',
  UNASSIGNED: '미분류',
};

const DIFFICULTY_BAR_COLORS: Record<number, string> = {
  1: 'bg-zinc-500',
  2: 'bg-blue-500',
  3: 'bg-amber-400',
  4: 'bg-orange-500',
  5: 'bg-red-500',
};

const DOMAIN_PIE_COLORS: Record<string, string> = {
  CALCULATION: '#3b82f6',
  UNDERSTANDING: '#10b981',
  INFERENCE: '#eab308',
  PROBLEM_SOLVING: '#f97316',
  UNASSIGNED: '#71717a',
};

// ============================================================================
// Helpers
// ============================================================================

function inferChapterSection(typeCode: string, typeName: string): { chapter: string; section: string } {
  // Mock: 유형코드에서 단원 추론
  const chapterMap: Record<string, { chapter: string; section: string }> = {
    'A001': { chapter: '1.1', section: '1.1.1 다항식의 연산' },
    'A006': { chapter: '1.1', section: '1.1.1 다항식의 연산' },
    'A036': { chapter: '1.3', section: '1.3.1 인수분해' },
    'A048': { chapter: '2.1', section: '2.1.1 복소수' },
    'A058': { chapter: '2.2', section: '2.2.2 근과 계수의 관계' },
    'A076': { chapter: '2.3', section: '2.3.2 이차함수의 최대 최소' },
  };
  return chapterMap[typeCode] || { chapter: '기타', section: typeName };
}

// ============================================================================
// Tab 1: 단원 및 유형별 문항 수
// ============================================================================

function UnitTypeTable({ problems }: { problems: Problem[] }) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const map = new Map<string, {
      section: string;
      total: number;
      byDifficulty: Record<number, number>;
      problems: Problem[];
    }>();

    for (const p of problems) {
      const { section } = inferChapterSection(p.typeCode, p.typeName);
      if (!map.has(section)) {
        map.set(section, {
          section,
          total: 0,
          byDifficulty: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          problems: [],
        });
      }
      const row = map.get(section)!;
      row.total++;
      row.byDifficulty[p.difficulty] = (row.byDifficulty[p.difficulty] || 0) + 1;
      row.problems.push(p);
    }

    return Array.from(map.values()).sort((a, b) => a.section.localeCompare(b.section));
  }, [problems]);

  const toggleRow = (section: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-bold text-zinc-200 mb-3">단원 및 유형별 문항 수</h3>

      {/* 테이블 헤더 */}
      <div className="grid grid-cols-[1fr_80px_60px_60px_60px_60px_60px] gap-0 rounded-t-lg bg-zinc-800 px-3 py-2 text-[11px] font-semibold text-zinc-400">
        <span>단원 및 유형</span>
        <span className="text-center">총 문항 수</span>
        <span className="text-center">최하</span>
        <span className="text-center">하</span>
        <span className="text-center">중</span>
        <span className="text-center">상</span>
        <span className="text-center">최상</span>
      </div>

      {/* 테이블 바디 */}
      <div className="divide-y divide-zinc-800/50 rounded-b-lg border border-zinc-800 overflow-hidden">
        {rows.map((row) => (
          <React.Fragment key={row.section}>
            <div
              className="grid grid-cols-[1fr_80px_60px_60px_60px_60px_60px] gap-0 px-3 py-2.5 hover:bg-zinc-800/30 cursor-pointer transition-colors"
              onClick={() => toggleRow(row.section)}
            >
              <div className="flex items-center gap-2">
                <ChevronRight
                  className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${
                    expandedRows.has(row.section) ? 'rotate-90' : ''
                  }`}
                />
                <span className="text-xs font-medium text-zinc-300">{row.section}</span>
              </div>
              <span className="text-center text-sm font-bold text-zinc-200">{row.total}</span>
              {[1, 2, 3, 4, 5].map((d) => (
                <span
                  key={d}
                  className={`text-center text-sm ${
                    row.byDifficulty[d] > 0 ? 'font-semibold text-zinc-300' : 'text-zinc-600'
                  }`}
                >
                  {row.byDifficulty[d]}
                </span>
              ))}
            </div>

            {/* 확장 시 개별 문제 표시 */}
            {expandedRows.has(row.section) && (
              <div className="bg-zinc-900/50 px-6 py-2 space-y-1">
                {row.problems.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 text-[11px] text-zinc-500 py-1"
                  >
                    <span className="w-6 text-right font-mono text-zinc-400">#{p.number}</span>
                    <span className="text-zinc-400">{p.typeCode}</span>
                    <span className="text-zinc-500 flex-1">{p.typeName}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      p.difficulty >= 4 ? 'bg-red-500/10 text-red-400' :
                      p.difficulty === 3 ? 'bg-amber-500/10 text-amber-400' :
                      'bg-blue-500/10 text-blue-400'
                    }`}>
                      {DIFFICULTY_LABELS[p.difficulty]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Tab 2: 통계 데이터 뷰 (차트)
// ============================================================================

function StatsChartView({ problems }: { problems: Problem[] }) {
  // 난이도별 분포
  const difficultyDist = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    problems.forEach((p) => { counts[p.difficulty]++; });
    return counts;
  }, [problems]);

  // 인지영역별 분포
  const domainDist = useMemo(() => {
    const counts: Record<string, number> = {};
    problems.forEach((p) => {
      const d = p.cognitiveDomain || 'UNASSIGNED';
      counts[d] = (counts[d] || 0) + 1;
    });
    return counts;
  }, [problems]);

  // 단원별 분포
  const chapterDist = useMemo(() => {
    const counts: Record<string, number> = {};
    problems.forEach((p) => {
      const { section } = inferChapterSection(p.typeCode, p.typeName);
      counts[section] = (counts[section] || 0) + 1;
    });
    return counts;
  }, [problems]);

  const maxDiffCount = Math.max(...Object.values(difficultyDist), 1);
  const totalProblems = problems.length;

  // 파이 차트를 위한 SVG 계산
  const pieSegments = useMemo(() => {
    const entries = Object.entries(domainDist).filter(([, count]) => count > 0);
    const segments: Array<{ domain: string; count: number; color: string; startAngle: number; endAngle: number }> = [];
    let currentAngle = -90; // 12시 방향 시작

    for (const [domain, count] of entries) {
      const angle = (count / totalProblems) * 360;
      segments.push({
        domain,
        count,
        color: DOMAIN_PIE_COLORS[domain] || '#71717a',
        startAngle: currentAngle,
        endAngle: currentAngle + angle,
      });
      currentAngle += angle;
    }
    return segments;
  }, [domainDist, totalProblems]);

  function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
    const start = polarToCartesian(cx, cy, r, startAngle);
    const end = polarToCartesian(cx, cy, r, endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
  }

  return (
    <div className="space-y-6">
      {/* 상단: 바 차트 + 파이 차트 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 난이도별 분포 - 바 차트 */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h4 className="text-sm font-bold text-zinc-200 mb-4">난이도별 분포</h4>
          <div className="flex items-end gap-3 h-40 px-2">
            {[1, 2, 3, 4, 5].map((d) => {
              const count = difficultyDist[d];
              const heightPct = maxDiffCount > 0 ? (count / maxDiffCount) * 100 : 0;
              return (
                <div key={d} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[11px] font-bold text-zinc-300">{count}</span>
                  <div className="w-full relative" style={{ height: '120px' }}>
                    <div
                      className={`absolute bottom-0 w-full rounded-t ${DIFFICULTY_BAR_COLORS[d]} transition-all`}
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500">{DIFFICULTY_LABELS[d]}</span>
                </div>
              );
            })}
            {/* 미분류 */}
            <div className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[11px] font-bold text-zinc-300">0</span>
              <div className="w-full relative" style={{ height: '120px' }}>
                <div className="absolute bottom-0 w-full rounded-t bg-zinc-700" style={{ height: '2%' }} />
              </div>
              <span className="text-[10px] text-zinc-500">미분류</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mt-3">
            <span className="inline-block w-3 h-3 rounded-sm bg-indigo-500" />
            <span className="text-[10px] text-zinc-500">문항 수</span>
          </div>
        </div>

        {/* 출제 형태(L-Type) 분포 - 파이 차트 */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h4 className="text-sm font-bold text-zinc-200 mb-4">출제 형태(L-Type) 분포</h4>
          <div className="flex items-center justify-center">
            <div className="relative">
              <svg width="180" height="180" viewBox="0 0 200 200">
                {pieSegments.map((seg, i) => (
                  <path
                    key={i}
                    d={describeArc(100, 100, 85, seg.startAngle, seg.endAngle)}
                    fill={seg.color}
                    stroke="#18181b"
                    strokeWidth="2"
                  />
                ))}
              </svg>
              {/* 라벨 */}
              {pieSegments.map((seg, i) => {
                const midAngle = (seg.startAngle + seg.endAngle) / 2;
                const labelR = 105;
                const pos = polarToCartesian(100, 100, labelR, midAngle);
                const label = DOMAIN_LABELS[seg.domain] || seg.domain;
                return (
                  <div
                    key={i}
                    className="absolute text-[10px] font-semibold whitespace-nowrap"
                    style={{
                      left: `${(pos.x / 200) * 100}%`,
                      top: `${(pos.y / 200) * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      color: seg.color,
                    }}
                  >
                    {label}: {seg.count}
                  </div>
                );
              })}
            </div>
          </div>
          {/* 범례 */}
          <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
            {Object.entries(DOMAIN_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ backgroundColor: DOMAIN_PIE_COLORS[key] || '#71717a' }}
                />
                <span className="text-[10px] text-zinc-500">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 하단: 단원별 문항 수 분포 */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h4 className="text-sm font-bold text-zinc-200 mb-3">단원별 문항 수 분포</h4>
        <div className="space-y-2">
          {Object.entries(chapterDist)
            .sort(([, a], [, b]) => b - a)
            .map(([section, count]) => {
              const pct = totalProblems > 0 ? Math.round((count / totalProblems) * 100) : 0;
              return (
                <div key={section}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-zinc-300 truncate flex-1">{section}</span>
                    <span className="text-xs text-zinc-500 ml-2 shrink-0">{count}문항 ({pct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cyan-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Modal
// ============================================================================

export function ExamStatsModal({ examTitle, problems, onClose }: ExamStatsModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('table');

  // 객관식/주관식 카운트
  const objectiveCount = problems.filter((p) => p.cognitiveDomain !== 'PROBLEM_SOLVING').length;
  const subjectiveCount = problems.length - objectiveCount;

  // ESC 닫기
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex flex-col w-[90vw] max-w-4xl h-[80vh] rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-zinc-100">문제 유형 분석</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{examTitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">
              총 <span className="font-bold text-zinc-200">{problems.length}문항</span>
              {' '}(객관식 {objectiveCount} / 주관식 {subjectiveCount})
            </span>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              프린트
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-zinc-800 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('table')}
            className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
              activeTab === 'table'
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            단원 및 유형별 문항 수
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chart')}
            className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
              activeTab === 'chart'
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            통계 데이터 뷰
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 p-5">
          {activeTab === 'table' ? (
            <UnitTypeTable problems={problems} />
          ) : (
            <StatsChartView problems={problems} />
          )}
        </div>

        {/* 하단 안내 */}
        <div className="flex-shrink-0 border-t border-zinc-800 px-5 py-2 text-center">
          <span className="text-[11px] text-zinc-600">
            통계 데이터는 <span className="text-cyan-500">실시간</span>으로 갱신됩니다. 최신 결과가 보이지 않으면 잠시 후 다시 확인하거나 새로고침해주세요.
          </span>
        </div>
      </div>
    </div>
  );
}
