'use client';

import React, { useMemo } from 'react';
import { BarChart3, Tag, Layers } from 'lucide-react';
import { COGNITIVE_DOMAIN_LABELS } from '@/types/analytics';

interface Problem {
  id: string;
  ai_analysis: Record<string, any> | null;
  classifications?: {
    type_code: string;
    difficulty: string;
    cognitive_domain: string;
    ai_confidence: number;
  }[];
}

interface ExamAnalyticsSidebarProps {
  problems: Problem[];
}

const DIFFICULTY_LABELS: Record<number, string> = {
  1: '최하', 2: '하', 3: '중', 4: '상', 5: '최상',
};

const DIFFICULTY_BAR_COLORS: Record<number, string> = {
  1: 'bg-blue-500',
  2: 'bg-green-500',
  3: 'bg-yellow-500',
  4: 'bg-orange-500',
  5: 'bg-red-500',
};

const DOMAIN_BAR_COLORS: Record<string, string> = {
  UNDERSTANDING: 'bg-emerald-500',
  CALCULATION: 'bg-emerald-400',
  PROBLEM_SOLVING: 'bg-amber-500',
  INFERENCE: 'bg-emerald-300',
};

export function ExamAnalyticsSidebar({ problems }: ExamAnalyticsSidebarProps) {
  const { difficultyDist, domainDist, chapterDist } = useMemo(
    () => computeDistributions(problems),
    [problems]
  );

  const total = problems.length;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6 bg-white border-l border-gray-200">
      {/* 난이도 분포 */}
      <section>
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800 mb-3">
          <BarChart3 size={16} className="text-indigo-500" />
          난이도 분포
        </h3>

        {/* 요약 표 */}
        <div className="grid grid-cols-5 gap-1 mb-3">
          {[5, 4, 3, 2, 1].map((level) => {
            const count = difficultyDist[level] || 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={level} className="text-center">
                <div className="text-[10px] font-semibold text-gray-500">{DIFFICULTY_LABELS[level]}</div>
                <div className="text-lg font-bold text-gray-900">{count}</div>
                <div className="text-[10px] text-gray-400">{pct}%</div>
              </div>
            );
          })}
        </div>
        <div className="text-xs text-gray-400">전체 : {total}문항</div>
      </section>

      {/* 영역별 분포 */}
      <section>
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800 mb-3">
          <Tag size={16} className="text-indigo-500" />
          영역별 분포
        </h3>
        <div className="space-y-2">
          {Object.entries(domainDist)
            .sort(([, a], [, b]) => b - a)
            .map(([domain, count]) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const label = COGNITIVE_DOMAIN_LABELS[domain] || domain;
              const barColor = DOMAIN_BAR_COLORS[domain] || 'bg-gray-400';
              return (
                <div key={domain}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">{label}</span>
                    <span className="text-xs text-gray-500">{count}문항 {pct}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </section>

      {/* 단원별 분포 */}
      <section>
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800 mb-3">
          <Layers size={16} className="text-indigo-500" />
          단원별 분포
        </h3>
        <div className="space-y-2">
          {Object.entries(chapterDist)
            .sort(([, a], [, b]) => b - a)
            .map(([chapter, count]) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div
                  key={chapter}
                  className="flex items-center justify-between p-2 rounded-lg border border-gray-100"
                >
                  <span className="text-xs font-medium text-gray-700 truncate flex-1">{chapter}</span>
                  <span className="text-xs font-bold text-gray-500 ml-2 shrink-0">{count}문항 {pct}%</span>
                </div>
              );
            })}
        </div>
      </section>
    </div>
  );
}

function computeDistributions(problems: Problem[]) {
  const difficultyDist: Record<number, number> = {};
  const domainDist: Record<string, number> = {};
  const chapterDist: Record<string, number> = {};

  for (const p of problems) {
    const cls = p.classifications?.[0];
    const ai = p.ai_analysis as any;
    const classification = ai?.classification;

    // 난이도
    const diff = cls?.difficulty
      ? parseInt(cls.difficulty)
      : (classification?.difficulty || 3);
    difficultyDist[diff] = (difficultyDist[diff] || 0) + 1;

    // 인지영역
    const domain = cls?.cognitive_domain || classification?.cognitiveDomain || 'UNKNOWN';
    if (domain !== 'UNKNOWN') {
      domainDist[domain] = (domainDist[domain] || 0) + 1;
    }

    // 단원 (section 우선, 없으면 chapter)
    const section = classification?.section;
    const chapter = classification?.chapter;
    const unitName = section && section !== '미분류' ? section : (chapter || '미분류');
    if (unitName !== '미분류') {
      chapterDist[unitName] = (chapterDist[unitName] || 0) + 1;
    }
  }

  return { difficultyDist, domainDist, chapterDist };
}
