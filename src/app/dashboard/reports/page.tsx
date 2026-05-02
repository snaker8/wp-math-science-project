'use client';

// ============================================================================
// 학교별 분석 리포트 허브
// /dashboard/reports
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  School,
  Search,
  ChevronRight,
  Sparkles,
  Share2,
  FileText,
  Loader2,
  Filter,
} from 'lucide-react';

interface SchoolCard {
  school: string;
  level: '초' | '중' | '고' | '대' | '미분류';
  examCount: number;
  analyzedCount: number;
  sharedCount: number;
  totalProblems: number;
  grades: string[];
  years: number[];
  latestExamAt: string | null;
  earliestExamAt: string | null;
}

const LEVEL_LABEL: Record<string, string> = {
  초: '초등',
  중: '중등',
  고: '고등',
  대: '대학',
  미분류: '미분류',
};

const LEVEL_COLOR: Record<string, string> = {
  초: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  중: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  고: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  대: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  미분류: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
};

export default function ReportsHubPage() {
  const [schools, setSchools] = useState<SchoolCard[]>([]);
  const [totalExams, setTotalExams] = useState(0);
  const [unclassified, setUnclassified] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | '초' | '중' | '고' | '대'>('all');
  const [yearFilter, setYearFilter] = useState<'all' | number>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/reports/by-school', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) {
          setSchools(d.schools || []);
          setTotalExams(d.totalExams || 0);
          setUnclassified(d.unclassified || 0);
        }
      } catch (err) {
        console.error('[Reports] fetch error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSchools = useMemo(() => {
    let result = schools;
    if (levelFilter !== 'all') {
      result = result.filter((s) => s.level === levelFilter);
    }
    if (yearFilter !== 'all') {
      result = result.filter((s) => s.years.includes(yearFilter));
    }
    if (search.trim()) {
      const q = search.toLowerCase().replace(/\s+/g, '');
      result = result.filter((s) => s.school.toLowerCase().replace(/\s+/g, '').includes(q));
    }
    return result;
  }, [schools, search, levelFilter, yearFilter]);

  // 모든 학교의 발행 년도 union (내림차순)
  const allYears = useMemo(() => {
    const set = new Set<number>();
    schools.forEach((s) => s.years.forEach((y) => set.add(y)));
    return Array.from(set).sort((a, b) => b - a);
  }, [schools]);

  const totals = useMemo(
    () => ({
      analyzed: schools.reduce((s, c) => s + c.analyzedCount, 0),
      shared: schools.reduce((s, c) => s + c.sharedCount, 0),
      problems: schools.reduce((s, c) => s + c.totalProblems, 0),
    }),
    [schools]
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black text-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-800/50 bg-gradient-to-r from-indigo-900/40 via-cyan-900/30 to-zinc-900/30 px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10">
              <School className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">학교별 분석 리포트</h1>
              <p className="mt-0.5 text-xs text-zinc-400">
                자산화된 시험지를 학교별로 묶어 누적 출제 경향과 학부모 공유를 한눈에 관리
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <span>학교 {schools.length}곳</span>
              <span className="text-zinc-700">·</span>
              <span>시험지 {totalExams}건</span>
              <span className="text-zinc-700">·</span>
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-cyan-400" />
                분석 {totals.analyzed}
              </span>
              <span className="text-zinc-700">·</span>
              <span className="flex items-center gap-1">
                <Share2 className="h-3 w-3 text-emerald-400" />
                공유 {totals.shared}
              </span>
            </div>
            <Link
              href="/dashboard/reports/aggregate"
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-bold text-violet-300 hover:bg-violet-500/20"
            >
              <Filter className="h-3.5 w-3.5" />
              집계 분석 →
            </Link>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-shrink-0 border-b border-zinc-800/50 px-8 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="학교명 검색..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-10 pr-3 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 p-1">
            <Filter className="ml-1 h-3.5 w-3.5 text-zinc-500" />
            {(['all', '초', '중', '고', '대'] as const).map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setLevelFilter(lv)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  levelFilter === lv
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {lv === 'all' ? '전체' : LEVEL_LABEL[lv]}
              </button>
            ))}
          </div>
          {allYears.length > 0 && (
            <select
              value={yearFilter === 'all' ? 'all' : String(yearFilter)}
              onChange={(e) =>
                setYearFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))
              }
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">전체 년도</option>
              {allYears.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          )}
          {unclassified > 0 && (
            <span className="text-[11px] text-amber-400">
              미분류 시험지 {unclassified}건 (학교명 없음)
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            로딩 중...
          </div>
        ) : filteredSchools.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <School className="mb-3 h-10 w-10 text-zinc-700" />
            <p className="text-sm">조건에 맞는 학교가 없습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredSchools.map((s) => (
              <Link
                key={s.school}
                href={`/dashboard/reports/${encodeURIComponent(s.school)}`}
                className="group relative flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 transition-all hover:border-cyan-500/40 hover:bg-zinc-900/60"
              >
                {/* Top: 학교명 + level 배지 */}
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">{s.school}</h3>
                    <span
                      className={`mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${LEVEL_COLOR[s.level]}`}
                    >
                      {LEVEL_LABEL[s.level]}
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-cyan-400" />
                </div>

                {/* Mid: 통계 */}
                <div className="grid grid-cols-2 gap-3 border-t border-zinc-800 pt-4 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">시험지</div>
                    <div className="mt-0.5 text-base font-bold text-white">{s.examCount}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">문항</div>
                    <div className="mt-0.5 text-base font-bold text-white">{s.totalProblems}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
                      <Sparkles className="h-3 w-3" />
                      분석
                    </div>
                    <div className="mt-0.5 text-sm font-bold text-cyan-400">
                      {s.analyzedCount}
                      <span className="ml-1 text-[10px] text-zinc-500">/ {s.examCount}</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
                      <Share2 className="h-3 w-3" />
                      공유
                    </div>
                    <div className="mt-0.5 text-sm font-bold text-emerald-400">
                      {s.sharedCount}
                      <span className="ml-1 text-[10px] text-zinc-500">/ {s.examCount}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom: 학년 + 발행기간 */}
                <div className="mt-4 flex flex-wrap gap-1">
                  {s.grades.slice(0, 4).map((g) => (
                    <span
                      key={g}
                      className="rounded-md bg-zinc-800/60 px-2 py-0.5 text-[10px] text-zinc-300"
                    >
                      {g}
                    </span>
                  ))}
                  {s.grades.length > 4 && (
                    <span className="text-[10px] text-zinc-500">+{s.grades.length - 4}</span>
                  )}
                </div>
                {s.latestExamAt && (
                  <div className="mt-2 text-[10px] text-zinc-500">
                    최근 발행: {new Date(s.latestExamAt).toLocaleDateString('ko-KR')}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
