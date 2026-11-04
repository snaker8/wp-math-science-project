'use client';

// ============================================================================
// 학교 상세 — 시험지 리스트 + 누적 통계
// /dashboard/reports/[school]
// ============================================================================

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import {
  ArrowLeft,
  School,
  FileText,
  Sparkles,
  Share2,
  ChevronRight,
  ChevronDown,
  BarChart3,
  Layers,
  TrendingUp,
  ExternalLink,
  Search,
  Pin,
  Target,
  Lightbulb,
  Check,
  ListChecks,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { useSmartBack } from '@/lib/navigation/useSmartBack';
import { AggregateResults, type AggregateResponse } from '@/components/reports/AggregateResults';
import type { ExamAIAnalysis } from '@/types/exam-ai-analysis';

interface ExamRow {
  id: string;
  title: string;
  grade: string | null;
  subject: string | null;
  problemCount: number;
  totalPoints: number;
  createdAt: string | null;
  year: number | null;
  semester: 1 | 2 | null;
  examType: string | null;
  hasAnalysis: boolean;
  hasShare: boolean;
  shareToken: string | null;
  overallDifficulty: string | null;
  unitCount: number;
  analysis: ExamAIAnalysis | null;
}

interface SchoolDetail {
  school: string;
  summary: {
    totalExams: number;
    analyzedExams: number;
    sharedExams: number;
    totalProblems: number;
    totalPoints: number;
  };
  gradeDistribution: Array<{ grade: string; count: number }>;
  topUnits: Array<{ unit: string; problemCount: number }>;
  overallDifficultyDist: Record<string, number>;
  availableYears: number[];
  exams: ExamRow[];
}

const DIFF_COLOR: Record<string, string> = {
  평이: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  보통: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  '난이도 있음': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  '매우 난이도 있음': 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

const fmt = (n: number) => n.toLocaleString('ko-KR');
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('ko-KR');
};
/** "2025 · 2학기 기말" — 년도·학기·구분 중 있는 것만 */
const examLabel = (e: { year: number | null; semester: 1 | 2 | null; examType: string | null }) => {
  const tail = [e.semester ? `${e.semester}학기` : null, e.examType].filter(Boolean).join(' ');
  if (e.year && tail) return `${e.year} · ${tail}`;
  return e.year ? String(e.year) : tail || '-';
};
const TYPE_ORDER: Record<string, number> = { 중간: 1, 기말: 2 };
const ERROR_KO: Record<string, string> = {
  'School not found': '이 학교로 묶인 시험지가 없습니다',
  'Fetch failed': '시험지를 불러오지 못했습니다',
};

// 섹션 진입 모션 — 부모 stagger, 자식 y 10→0
const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } } };
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const } },
};
/** 가로 막대 — width 대신 scaleX (리플로우 없음) */
function Bar({ pct, delay = 0 }: { pct: number; delay?: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
      <motion.div
        className="h-full origin-left rounded-full bg-white/40"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: Math.max(0, Math.min(1, pct / 100)) }}
        transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

export default function SchoolReportPage() {
  const params = useParams();
  const router = useRouter();
  const goBack = useSmartBack('/dashboard/reports');
  const schoolParam = decodeURIComponent((params?.school as string) || '');

  const [data, setData] = useState<SchoolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [yearFilter, setYearFilter] = useState<'all' | number>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ★ 시험지 선택 → 그 묶음만 집계 분석 (2026-11-04 대표: "학교 내에서도 시험지별로 선택해서 분석")
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [agg, setAgg] = useState<AggregateResponse | null>(null);
  const [aggIds, setAggIds] = useState<string[]>([]); // 결과가 어떤 선택으로 만들어졌는지 (공유 링크·"선택 바뀜" 판정)
  const [aggLoading, setAggLoading] = useState(false);
  const [aggError, setAggError] = useState<string | null>(null);
  const [aggCopied, setAggCopied] = useState(false);
  const toggleSelect = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const runAggregate = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setAggLoading(true);
    setAggError(null);
    try {
      const r = await fetch(`/api/reports/aggregate?examIds=${ids.join(',')}`, { cache: 'no-store' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setAggError(d?.detail || d?.error || `집계에 실패했습니다 (${r.status})`);
        return;
      }
      setAgg((await r.json()) as AggregateResponse);
      setAggIds(ids);
      // 결과는 목록 아래에 붙으니 거기로 내려 준다
      setTimeout(() => document.getElementById('selected-aggregate')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    } catch (e) {
      setAggError(e instanceof Error ? `네트워크 오류: ${e.message}` : '네트워크 오류로 집계하지 못했습니다');
    } finally {
      setAggLoading(false);
    }
  };
  const aggShareQuery = aggIds.length ? `examIds=${aggIds.join(',')}` : null;
  const aggDirty = agg != null && (aggIds.length !== selected.size || aggIds.some((id) => !selected.has(id)));

  useEffect(() => {
    if (!schoolParam) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/reports/${encodeURIComponent(schoolParam)}`, {
          cache: 'no-store',
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          if (!cancelled) setErr(d.error || `HTTP ${r.status}`);
          return;
        }
        const d = (await r.json()) as SchoolDetail;
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '로드 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolParam]);

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-black text-white" aria-busy="true" aria-label="불러오는 중">
        <div className="flex-shrink-0 border-b border-zinc-800/50 px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-white/[.04]" />
            <div className="h-10 w-10 rounded-xl border border-white/[.08] bg-white/[.04]" />
            <div>
              <div className="h-6 w-40 animate-pulse rounded bg-white/[.08]" />
              <div className="mt-1.5 h-3 w-56 animate-pulse rounded bg-white/[.05]" />
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-hidden px-8 py-6">
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[88px] animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40" />
            ))}
          </div>
          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="h-48 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40" />
            <div className="h-48 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40" />
          </div>
          <div className="h-72 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40" />
        </div>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-black text-white">
        <School className="h-10 w-10 text-zinc-700" />
        <div className="text-sm text-zinc-400">{(err && ERROR_KO[err]) || err || '학교를 찾을 수 없습니다'}</div>
        <button
          type="button"
          onClick={() => router.push('/dashboard/reports')}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800"
        >
          학교 목록으로
        </button>
      </div>
    );
  }

  const maxUnitCount = Math.max(1, ...data.topUnits.map((u) => u.problemCount));
  const maxGradeCount = Math.max(1, ...data.gradeDistribution.map((g) => g.count));

  // 검색·년도 필터 + 학년·생성일 정렬
  const filteredExams = (() => {
    let result = data.exams;
    if (yearFilter !== 'all') {
      result = result.filter((e) => e.year === yearFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase().replace(/\s+/g, '');
      const norm = (s: string | null | undefined) =>
        (s || '').toLowerCase().replace(/\s+/g, '');
      result = result.filter((e) => {
        if (norm(e.title).includes(q)) return true;
        if (norm(e.grade).includes(q)) return true;
        const a = e.analysis;
        if (a) {
          if (norm(a.summary).includes(q)) return true;
          for (const u of a.unitAnalyses || []) {
            if (norm(u.majorUnit).includes(q)) return true;
            if (norm(u.keyPoints).includes(q)) return true;
            if (norm(u.strategy).includes(q)) return true;
          }
          for (const h of a.hardQuestions || []) {
            if (norm(h.subTitle).includes(q)) return true;
            if (norm(h.intent).includes(q)) return true;
          }
        }
        return false;
      });
    }
    // 학년(없으면 뒤) → 시험 연도 내림차순 → 학기 → 중간→기말 → 반영일 내림차순
    //   (종전: 학년 null 이면 비교가 뒤섞였고, 같은 학년 안에서는 업로드일 순이라 옛 시험을 늦게 올리면 맨 위로 왔다)
    return [...result].sort((a, b) => {
      if (a.grade !== b.grade) {
        if (!a.grade) return 1;
        if (!b.grade) return -1;
        return a.grade.localeCompare(b.grade, 'ko');
      }
      if ((a.year ?? 0) !== (b.year ?? 0)) return (b.year ?? 0) - (a.year ?? 0);
      if ((a.semester ?? 0) !== (b.semester ?? 0)) return (a.semester ?? 9) - (b.semester ?? 9);
      const ta = TYPE_ORDER[a.examType || ''] ?? 9, tb = TYPE_ORDER[b.examType || ''] ?? 9;
      if (ta !== tb) return ta - tb;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  })();

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex h-full w-full flex-col overflow-hidden bg-black text-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-800/50 px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              aria-label="학교 목록으로"
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[.08] bg-white/[.04]">
              <School className="h-5 w-5 text-content-tertiary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{data.school}</h1>
              <p className="mt-0.5 text-xs text-zinc-400 tabular-nums">
                시험지 {fmt(data.summary.totalExams)}건 · 총 {fmt(data.summary.totalProblems)}문항
                {data.availableYears.length > 0 && (
                  <> · {data.availableYears[data.availableYears.length - 1]}~{data.availableYears[0]}년</>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Body — 섹션 순차 진입 */}
      <motion.div variants={listVariants} initial="hidden" animate="show" className="flex-1 overflow-y-auto px-8 py-6">
        {/* 통계 4 카드 */}
        <motion.div variants={itemVariants} className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="시험지"
            value={data.summary.totalExams}
            unit="건"
            icon={<FileText className="h-4 w-4" />}
          />
          <StatCard
            label="AI 분석 완료"
            value={data.summary.analyzedExams}
            unit={`/ ${data.summary.totalExams}`}
            icon={<Sparkles className="h-4 w-4" />}
            accent="cyan"
          />
          <StatCard
            label="학부모 공유"
            value={data.summary.sharedExams}
            unit={`/ ${data.summary.totalExams}`}
            icon={<Share2 className="h-4 w-4" />}
            accent="emerald"
          />
          <StatCard
            label="총 문항"
            value={data.summary.totalProblems}
            unit="문항"
            icon={<Layers className="h-4 w-4" />}
          />
        </motion.div>

        {/* Row: 학년 분포 + 자주 출제 단원 */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 학년 분포 */}
          <Panel title="학년별 시험지" icon={<BarChart3 className="h-4 w-4" />}>
            {data.gradeDistribution.length === 0 ? (
              <Empty>학년 정보 없음</Empty>
            ) : (
              <div className="space-y-2">
                {data.gradeDistribution.map((g, i) => {
                  const pct = (g.count / maxGradeCount) * 100;
                  return (
                    <div key={g.grade} className="grid grid-cols-[80px_1fr_60px] items-center gap-3">
                      <div className="text-xs text-zinc-300">{g.grade}</div>
                      <Bar pct={pct} delay={0.15 + i * 0.04} />
                      <div className="text-right text-xs text-zinc-400 tabular-nums">{fmt(g.count)}건</div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* 자주 출제 단원 TOP10 */}
          <Panel title="자주 출제되는 단원" icon={<TrendingUp className="h-4 w-4" />}>
            {data.topUnits.length === 0 ? (
              <Empty>분석 완료된 시험지가 없습니다</Empty>
            ) : (
              <div className="space-y-2">
                {data.topUnits.map((u, i) => {
                  const pct = (u.problemCount / maxUnitCount) * 100;
                  return (
                    <div key={u.unit} className="grid grid-cols-[1fr_60px] items-center gap-3">
                      <div>
                        <div className="text-xs text-zinc-300">{u.unit}</div>
                        <div className="mt-1">
                          <Bar pct={pct} delay={0.15 + i * 0.04} />
                        </div>
                      </div>
                      <div className="text-right text-xs text-zinc-400 tabular-nums">
                        {fmt(u.problemCount)}문항
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* 난이도 분포 */}
        {Object.values(data.overallDifficultyDist).some((v) => v > 0) && (
          <Panel title="시험지 난이도 분포" icon={<Sparkles className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['평이', '보통', '난이도 있음', '매우 난이도 있음'] as const).map((d) => (
                <div
                  key={d}
                  className={`rounded-lg border px-3 py-3 ${DIFF_COLOR[d]}`}
                >
                  <div className="text-[10px] font-semibold opacity-80">{d}</div>
                  <div className="mt-1 text-2xl font-bold">
                    {data.overallDifficultyDist[d] || 0}
                    <span className="ml-1 text-[10px] font-medium opacity-70">건</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* 시험지 리스트 — 검색·년도 필터 + 행 펼침으로 ai_analysis 그대로 표시 */}
        <Panel title={`시험지 목록 (${filteredExams.length}/${data.exams.length}건)`} icon={<FileText className="h-4 w-4" />}>
          {/* 검색바 + 년도 필터 */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="시험지 / 단원 / 출제경향 검색..."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-1.5 pl-9 pr-3 text-xs text-white placeholder-zinc-500 focus:border-white/[.25] focus:outline-none"
              />
            </div>
            {data.availableYears.length > 0 && (
              <select
                value={yearFilter === 'all' ? 'all' : String(yearFilter)}
                onChange={(e) =>
                  setYearFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))
                }
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-white/[.25] focus:outline-none"
              >
                <option value="all">전체 년도</option>
                {data.availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                ))}
              </select>
            )}
            {(query.trim() || yearFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setYearFilter('all');
                }}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                초기화
              </button>
            )}
          </div>

          {/* 시험지 선택 → 묶음 집계 */}
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/[.08] bg-white/[.03] px-3 py-2">
            <ListChecks className="h-3.5 w-3.5 text-content-tertiary" />
            <span className="text-xs text-zinc-300 tabular-nums">
              선택 <span className="font-semibold text-white">{selected.size}</span>건
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set(filteredExams.map((e) => e.id)))}
              disabled={filteredExams.length === 0}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 hover:text-white disabled:opacity-40"
            >
              보이는 {filteredExams.length}건 모두 선택
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:text-white"
              >
                선택 해제
              </button>
            )}
            <button
              type="button"
              onClick={runAggregate}
              disabled={selected.size === 0 || aggLoading}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-zinc-200 disabled:opacity-40"
            >
              {aggLoading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-black/30 border-t-black" />}
              {aggLoading ? '집계 중...' : aggDirty ? '바뀐 선택으로 다시 분석' : '선택 시험지 집계 분석'}
            </button>
            {aggError && (
              <span className="inline-flex items-center gap-1 text-[11px] text-content-primary">
                <AlertTriangle className="h-3 w-3" />
                {aggError}
              </span>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900/60 text-zinc-400">
                <tr>
                  <th className="w-8 px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label="보이는 시험지 모두 선택"
                      className="h-3.5 w-3.5 cursor-pointer accent-white"
                      checked={filteredExams.length > 0 && filteredExams.every((e) => selected.has(e.id))}
                      onChange={(ev) => {
                        const ids = filteredExams.map((e) => e.id);
                        setSelected((prev) => {
                          const n = new Set(prev);
                          ids.forEach((id) => (ev.target.checked ? n.add(id) : n.delete(id)));
                          return n;
                        });
                      }}
                    />
                  </th>
                  <th className="w-8 px-2 py-2"></th>
                  <th className="px-3 py-2 text-left">제목</th>
                  <th className="px-3 py-2 text-left">학년</th>
                  <th className="px-3 py-2 text-center">시험</th>
                  <th className="px-3 py-2 text-center">문항</th>
                  <th className="px-3 py-2 text-center">분석</th>
                  <th className="px-3 py-2 text-center">난이도</th>
                  <th className="px-3 py-2 text-center">공유</th>
                  <th className="px-3 py-2 text-right" title="자산화(업로드)한 날">반영</th>
                  <th className="px-3 py-2 text-center w-28">액션</th>
                </tr>
              </thead>
              <tbody>
                {filteredExams.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-zinc-500">
                      조건에 맞는 시험지가 없습니다
                    </td>
                  </tr>
                )}
                {filteredExams.map((e) => {
                  const expanded = expandedId === e.id;
                  return (
                    <React.Fragment key={e.id}>
                      <tr
                        className={`border-t border-zinc-800/60 transition-colors ${
                          expanded ? 'bg-zinc-900/60' : 'hover:bg-zinc-900/40'
                        } ${e.hasAnalysis ? 'cursor-pointer focus:outline-none focus-visible:bg-zinc-900/60' : ''}`}
                        tabIndex={e.hasAnalysis ? 0 : undefined}
                        role={e.hasAnalysis ? 'button' : undefined}
                        aria-expanded={e.hasAnalysis ? expanded : undefined}
                        onClick={() => {
                          if (e.hasAnalysis) {
                            setExpandedId(expanded ? null : e.id);
                          }
                        }}
                        onKeyDown={(ev) => {
                          if (!e.hasAnalysis) return;
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault();
                            setExpandedId(expanded ? null : e.id);
                          }
                        }}
                      >
                        <td className="px-2 py-2 text-center" onClick={(ev) => ev.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`${e.title} 선택`}
                            className="h-3.5 w-3.5 cursor-pointer accent-white"
                            checked={selected.has(e.id)}
                            onChange={() => toggleSelect(e.id)}
                          />
                        </td>
                        <td className="px-2 py-2 text-center text-zinc-500">
                          {e.hasAnalysis ? (
                            expanded ? (
                              <ChevronDown className="mx-auto h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="mx-auto h-3.5 w-3.5" />
                            )
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-white">{e.title}</td>
                        <td className="px-3 py-2 text-zinc-400">{e.grade || '-'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-center text-zinc-400 tabular-nums">{examLabel(e)}</td>
                        <td className="px-3 py-2 text-center text-zinc-300 tabular-nums">{e.problemCount}</td>
                        <td className="px-3 py-2 text-center">
                          {e.hasAnalysis ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/[.08] bg-white/[.04] px-2 py-0.5 text-content-secondary">
                              <Sparkles className="h-3 w-3" />
                              완료
                            </span>
                          ) : (
                            <span className="text-zinc-600">미생성</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {e.overallDifficulty ? (
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${DIFF_COLOR[e.overallDifficulty] || ''}`}
                            >
                              {e.overallDifficulty}
                            </span>
                          ) : (
                            <span className="text-zinc-600">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {e.hasShare ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
                              <Share2 className="h-3 w-3" />
                              활성
                            </span>
                          ) : (
                            <span className="text-zinc-600">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                          {fmtDate(e.createdAt)}
                        </td>
                        <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/dashboard/exam-analysis/${e.id}`}
                              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                              title="분석 페이지"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                            {e.shareToken && (
                              <a
                                href={`/share/exam/${e.shareToken}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                                title="학부모 페이지"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* 펼침 행 — tr 은 height 애니메이션이 안 되니 td 안쪽 div 에 건다 */}
                      <AnimatePresence initial={false}>
                        {expanded && e.analysis && (
                          <tr className="border-t border-zinc-800/40 bg-zinc-950/60">
                            <td colSpan={11} className="p-0">
                              <motion.div
                                key="expand"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                className="overflow-hidden"
                              >
                                <div className="px-6 py-5">
                                  <ExamAnalysisInline analysis={e.analysis} />
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* 선택 시험지 집계 결과 */}
        {(agg || aggLoading) && (
          <div id="selected-aggregate" className={`transition-opacity ${aggLoading && agg ? 'pointer-events-none opacity-50' : ''} ${aggDirty ? 'opacity-70' : ''}`} aria-busy={aggLoading}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <BarChart3 className="h-4 w-4 text-content-tertiary" />
                선택 시험지 집계 분석
                {agg && <span className="text-xs font-normal text-zinc-400 tabular-nums">시험지 {fmt(aggIds.length)}건</span>}
              </h2>
              {aggDirty && (
                <span className="inline-flex items-center gap-1 rounded-md border border-white/[.14] bg-white/[.06] px-2 py-1 text-[11px] text-content-primary">
                  <RefreshCw className="h-3 w-3" />
                  선택이 바뀌었습니다. 아래 결과는 이전 선택입니다.
                </span>
              )}
              {agg && aggShareQuery && agg.matched.examCount > 0 && (
                <a
                  href={`/share/aggregate?${aggShareQuery}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`${window.location.origin}/share/aggregate?${aggShareQuery}`);
                      setAggCopied(true);
                      setTimeout(() => setAggCopied(false), 2200);
                    } catch { /* 새 탭은 anchor 가 연다 */ }
                  }}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-1.5 text-xs font-bold text-content-secondary hover:bg-white/[.06] hover:text-content-primary"
                  title="새 탭에서 학부모 공유 페이지를 엽니다 (링크도 자동 복사)"
                >
                  {aggCopied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                  {aggCopied ? '링크 복사됨' : '학부모 공유 페이지'}
                </a>
              )}
            </div>
            {agg && agg.matched.examCount > 0 ? (
              <AggregateResults key={aggIds.join(',')} data={agg} />
            ) : agg ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-400">
                선택한 시험지에서 집계할 문항이 없습니다.
              </div>
            ) : (
              <div className="space-y-4" aria-label="집계 중">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-[88px] animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40" />
                  ))}
                </div>
                <div className="h-40 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40" />
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
    </MotionConfig>
  );
}

// ============================================================================
// 작은 헬퍼 컴포넌트들
// ============================================================================

function StatCard({
  label,
  value,
  unit,
  icon,
  accent,
}: {
  label: string;
  value: number;
  unit: string;
  icon: React.ReactNode;
  accent?: 'cyan' | 'emerald';
}) {
  const accentColor =
    accent === 'cyan' ? 'text-content-primary' : accent === 'emerald' ? 'text-emerald-400' : 'text-white';
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
        {icon}
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${accentColor}`}>
        {fmt(value)}
        <span className="ml-1 text-xs font-medium text-zinc-500">{unit}</span>
      </div>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={itemVariants} className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
        {icon}
        {title}
      </div>
      {children}
    </motion.div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-8 text-center text-xs text-zinc-500">{children}</div>
  );
}

// ============================================================================
// 시험지 ai_analysis 인라인 표시 — 그대로 펼쳐 보기
// (summary / unitAnalyses / hardQuestions)
// ============================================================================

function ExamAnalysisInline({ analysis }: { analysis: ExamAIAnalysis }) {
  return (
    <div className="space-y-5 text-xs">
      {/* 총평 */}
      {analysis.summary && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
            <Pin className="h-3 w-3" />
            시험 총평
          </div>
          <div className="text-zinc-200 leading-relaxed">
            <MixedContentRenderer content={analysis.summary} />
          </div>
        </div>
      )}

      {/* 단원별 분석 */}
      {analysis.unitAnalyses && analysis.unitAnalyses.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
            <Layers className="h-3 w-3" />
            단원별 분석 ({analysis.unitAnalyses.length})
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {analysis.unitAnalyses.map((u, i) => (
              <div
                key={i}
                className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="font-bold text-zinc-100">{u.majorUnit}</div>
                  <div className="flex flex-wrap gap-1">
                    {u.questionNumbers.map((n) => (
                      <span
                        key={n}
                        className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
                {u.keyPoints && (
                  <div className="mt-2">
                    <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">
                      <Target className="h-3 w-3" />
                      출제경향
                    </div>
                    <div className="text-zinc-300 leading-relaxed">
                      <MixedContentRenderer content={u.keyPoints} />
                    </div>
                  </div>
                )}
                {u.strategy && (
                  <div className="mt-2">
                    <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">
                      <Lightbulb className="h-3 w-3" />
                      대비전략
                    </div>
                    <div className="text-zinc-300 leading-relaxed">
                      <MixedContentRenderer content={u.strategy} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 고난도 문항 심층분석 */}
      {analysis.hardQuestions && analysis.hardQuestions.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
            <TrendingUp className="h-3 w-3" />
            고난도 문항 ({analysis.hardQuestions.length})
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {analysis.hardQuestions.map((h) => (
              <div
                key={`${h.problemId}-${h.number}`}
                className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/20 text-[11px] font-bold text-rose-300">
                    {h.number}
                  </span>
                  {h.subTitle && (
                    <div className="font-semibold text-rose-200">
                      <MixedContentRenderer content={h.subTitle} />
                    </div>
                  )}
                </div>
                {h.intent && (
                  <div className="mt-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">출제 의도</div>
                    <div className="text-zinc-300 leading-relaxed">
                      <MixedContentRenderer content={h.intent} />
                    </div>
                  </div>
                )}
                {h.strategy && (
                  <div className="mt-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">공략</div>
                    <div className="text-zinc-300 leading-relaxed">
                      <MixedContentRenderer content={h.strategy} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 메타 */}
      {analysis.generatedAt && (
        <div className="text-right text-[10px] text-zinc-600">
          분석 생성: {new Date(analysis.generatedAt).toLocaleString('ko-KR')}
        </div>
      )}
    </div>
  );
}
