'use client';

// ============================================================================
// 학교별 분석 리포트 허브
// /dashboard/reports
//
// 2026-11-04 다듬기: 스켈레톤·오류 상태 분리·정렬·검색 지우기·천 단위 표기·
//   모의고사 분리 집계·카드 진입 모션(prefers-reduced-motion 존중)
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import {
  School,
  Search,
  ChevronRight,
  Sparkles,
  Share2,
  Filter,
  BarChart3,
  Layers,
  X,
  AlertTriangle,
  ArrowUpDown,
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
  초: 'border-white/[.08] bg-white/[.04] text-content-secondary',
  중: 'border-white/[.08] bg-white/[.04] text-content-secondary',
  고: 'border-white/[.08] bg-white/[.04] text-content-secondary',
  대: 'border-white/[.08] bg-white/[.04] text-content-secondary',
  미분류: 'border-white/[.08] bg-white/[.04] text-content-tertiary',
};

type SortKey = 'name' | 'exams' | 'recent' | 'analysis';
const SORT_LABEL: Record<SortKey, string> = {
  name: '학교명순',
  exams: '시험지 많은순',
  recent: '최근 반영순',
  analysis: '분석률 낮은순',
};

const fmt = (n: number) => n.toLocaleString('ko-KR');

// 카드 진입 — 부모 stagger, 자식 y 8→0
const gridVariants = { hidden: {}, show: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } } };
const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const } },
};

export default function ReportsHubPage() {
  const [schools, setSchools] = useState<SchoolCard[]>([]);
  const [totalExams, setTotalExams] = useState(0);
  const [schoolExams, setSchoolExams] = useState(0);
  const [mockCount, setMockCount] = useState(0);
  const [unclassified, setUnclassified] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | '초' | '중' | '고' | '대'>('all');
  const [yearFilter, setYearFilter] = useState<'all' | number>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/reports/by-school', { cache: 'no-store' });
        if (!r.ok) {
          if (!cancelled) setError(`불러오지 못했습니다 (${r.status})`);
          return;
        }
        const d = await r.json();
        if (!cancelled) {
          setSchools(d.schools || []);
          setTotalExams(d.totalExams || 0);
          setSchoolExams(d.schoolExams ?? d.totalExams ?? 0);
          setMockCount(d.mockCount || 0);
          setUnclassified(d.unclassified || 0);
        }
      } catch (err) {
        console.error('[Reports] fetch error:', err);
        if (!cancelled) setError('네트워크 오류로 불러오지 못했습니다');
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
    const levelOrder: Record<string, number> = { 초: 1, 중: 2, 고: 3, 대: 4, 미분류: 9 };
    const byName = (a: SchoolCard, b: SchoolCard) =>
      (levelOrder[a.level] || 9) - (levelOrder[b.level] || 9) || a.school.localeCompare(b.school, 'ko');
    const sorted = [...result];
    switch (sortKey) {
      case 'exams':
        sorted.sort((a, b) => b.examCount - a.examCount || byName(a, b));
        break;
      case 'recent':
        sorted.sort((a, b) => (b.latestExamAt || '').localeCompare(a.latestExamAt || '') || byName(a, b));
        break;
      case 'analysis':
        sorted.sort((a, b) => a.analyzedCount / Math.max(1, a.examCount) - b.analyzedCount / Math.max(1, b.examCount) || b.examCount - a.examCount || byName(a, b));
        break;
      default:
        sorted.sort(byName);
    }
    return sorted;
  }, [schools, search, levelFilter, yearFilter, sortKey]);

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

  const hasFilter = search.trim() !== '' || levelFilter !== 'all' || yearFilter !== 'all';

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex h-full w-full flex-col overflow-hidden bg-black text-white">
      {/* Header — 두 진입점(학교별 / 집계) 균형 배치 */}
      <div className="flex-shrink-0 border-b border-white/[.08] bg-white/[.03] px-8 py-6">
        <div className="flex items-stretch gap-6">
          {/* LEFT: 페이지 타이틀 + 통계 */}
          <div className="flex flex-1 items-center gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10">
              <School className="h-6 w-6 text-content-tertiary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">학교별 분석 리포트</h1>
                <span className="rounded-md border border-white/[.08] bg-white/[.04] px-1.5 py-0.5 text-[10px] font-semibold text-content-secondary">
                  학교별
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-400">
                자산화된 시험지를 학교별로 묶어 누적 출제 경향과 학부모 공유를 한눈에 관리
              </p>
              {loading ? (
                <div className="mt-2 h-4 w-72 animate-pulse rounded bg-white/[.06]" aria-hidden />
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                  <span>
                    학교 <span className="font-semibold text-white tabular-nums">{fmt(schools.length)}</span>곳
                  </span>
                  <span className="text-zinc-700">·</span>
                  <span title={`전체 ${fmt(totalExams)}건 중 모의고사 ${fmt(mockCount)}건 제외`}>
                    학교 시험지 <span className="font-semibold text-white tabular-nums">{fmt(schoolExams)}</span>건
                  </span>
                  <span className="text-zinc-700">·</span>
                  <span className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-content-tertiary" />
                    분석 <span className="font-semibold text-content-primary tabular-nums">{fmt(totals.analyzed)}</span>
                  </span>
                  <span className="text-zinc-700">·</span>
                  <span className="flex items-center gap-1">
                    <Share2 className="h-3 w-3 text-content-tertiary" />
                    공유 <span className="font-semibold text-content-primary tabular-nums">{fmt(totals.shared)}</span>
                  </span>
                  {mockCount > 0 && (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span className="text-zinc-500">모의고사 {fmt(mockCount)}건은 학교 집계에서 제외</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: 집계 분석 — 동등한 무게의 진입점 */}
          <Link
            href="/dashboard/reports/aggregate"
            className="group relative flex w-80 flex-shrink-0 items-center gap-3 overflow-hidden rounded-xl border border-white/[.08] bg-white/[.04] px-4 py-3 transition-all hover:border-white/[.14] hover:bg-white/[.06]"
          >
            <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/[.04] blur-2xl transition-opacity group-hover:opacity-80" />
            <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-white/[.08] bg-white/[.06]">
              <BarChart3 className="h-6 w-6 text-content-secondary" />
            </div>
            <div className="relative min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-content-primary">다학교 집계 분석</h2>
                <span className="rounded-md border border-white/[.08] bg-white/[.04] px-1.5 py-0.5 text-[10px] font-semibold text-content-secondary">
                  집계
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-tight text-content-tertiary">
                학년·학기·구분 매칭 → 단원·난이도·함정 패턴 한눈에 비교
              </p>
              <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-content-secondary">
                <Layers className="h-3 w-3" />
                집계 분석 시작
                <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-shrink-0 border-b border-zinc-800/50 px-8 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="학교명 검색..."
              aria-label="학교명 검색"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-10 pr-9 text-sm text-white placeholder-zinc-500 focus:border-white/[.25] focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="검색어 지우기"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 hover:bg-white/[.06] hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 p-1" role="group" aria-label="학교급">
            <Filter className="ml-1 h-3.5 w-3.5 text-zinc-500" />
            {(['all', '초', '중', '고', '대'] as const).map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setLevelFilter(lv)}
                aria-pressed={levelFilter === lv}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  levelFilter === lv
                    ? 'bg-white/[.08] text-content-primary'
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
              aria-label="시험 연도"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-white/[.25] focus:outline-none"
            >
              <option value="all">전체 년도</option>
              {allYears.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-xs text-zinc-400">
            <ArrowUpDown className="h-3.5 w-3.5 text-zinc-500" />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="정렬"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-white/[.25] focus:outline-none"
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>{SORT_LABEL[k]}</option>
              ))}
            </select>
          </label>
          {!loading && (
            <span className="text-[11px] text-zinc-500 tabular-nums">
              {hasFilter ? `${fmt(filteredSchools.length)} / ${fmt(schools.length)}곳` : `${fmt(schools.length)}곳`}
            </span>
          )}
          {unclassified > 0 && (
            <span className="ml-auto text-[11px] text-amber-400" title="제목에서 학교명을 읽지 못한 학교기출 시험지. 제목에 학교명을 넣으면 집계됩니다.">
              학교명 못 읽은 시험지 {fmt(unclassified)}건
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="불러오는 중">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-56 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
            <AlertTriangle className="mb-3 h-8 w-8 text-content-secondary" />
            <p className="text-sm">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-white hover:bg-zinc-800"
            >
              다시 시도
            </button>
          </div>
        ) : filteredSchools.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
            <School className="mb-3 h-10 w-10 text-zinc-700" />
            <p className="text-sm">{schools.length === 0 ? '아직 학교별로 묶인 시험지가 없습니다' : '조건에 맞는 학교가 없습니다'}</p>
            {hasFilter && (
              <button
                type="button"
                onClick={() => { setSearch(''); setLevelFilter('all'); setYearFilter('all'); }}
                className="mt-3 text-xs text-zinc-400 underline-offset-2 hover:text-white hover:underline"
              >
                필터 지우기
              </button>
            )}
          </div>
        ) : (
          <motion.div
            key={`${levelFilter}-${yearFilter}-${sortKey}`}
            variants={gridVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            <AnimatePresence initial={false}>
            {filteredSchools.map((s) => {
              const yearRange = s.years.length
                ? s.years.length === 1 ? `${s.years[0]}` : `${s.years[s.years.length - 1]}~${s.years[0]}`
                : null;
              const rate = s.examCount ? Math.round((s.analyzedCount / s.examCount) * 100) : 0;
              return (
              <motion.div key={s.school} variants={cardVariants} exit={{ opacity: 0, transition: { duration: 0.12 } }} layout="position">
              <Link
                href={`/dashboard/reports/${encodeURIComponent(s.school)}`}
                className="group relative flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 transition-all hover:border-white/[.14] hover:bg-zinc-900/60"
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
                  <ChevronRight className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-content-primary" />
                </div>

                {/* Mid: 통계 */}
                <div className="grid grid-cols-2 gap-3 border-t border-zinc-800 pt-4 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">시험지</div>
                    <div className="mt-0.5 text-base font-bold text-white tabular-nums">{fmt(s.examCount)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">문항</div>
                    <div className="mt-0.5 text-base font-bold text-white tabular-nums">{fmt(s.totalProblems)}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
                      <Sparkles className="h-3 w-3" />
                      분석
                    </div>
                    <div className="mt-0.5 text-sm font-bold text-content-primary tabular-nums">
                      {fmt(s.analyzedCount)}
                      <span className="ml-1 text-[10px] text-zinc-500">/ {fmt(s.examCount)}</span>
                      {s.examCount > 0 && s.analyzedCount < s.examCount && (
                        <span className={`ml-1.5 text-[10px] font-medium ${rate < 50 ? 'text-content-secondary' : 'text-zinc-500'}`}>{rate}%</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
                      <Share2 className="h-3 w-3" />
                      공유
                    </div>
                    <div className="mt-0.5 text-sm font-bold text-content-primary tabular-nums">
                      {fmt(s.sharedCount)}
                      <span className="ml-1 text-[10px] text-zinc-500">/ {fmt(s.examCount)}</span>
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
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-zinc-500 tabular-nums">
                  {yearRange && <span>시험 {yearRange}년</span>}
                  {s.latestExamAt && (
                    <span>최근 반영 {new Date(s.latestExamAt).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' })}</span>
                  )}
                </div>
              </Link>
              </motion.div>
              );
            })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
    </MotionConfig>
  );
}
