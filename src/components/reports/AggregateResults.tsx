'use client';

// ============================================================================
// 집계 분석 결과 뷰 — /dashboard/reports/aggregate 와 /dashboard/reports/[school] (시험지 선택 집계) 공용
// 2026-11-04 aggregate/page.tsx 에서 분리. 모든 수치는 /api/reports/aggregate 의 DB raw aggregation.
// ============================================================================

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import {
  BarChart3,
  School,
  Sparkles,
  Layers,
  TrendingUp,
  Target,
  Users,
  Lightbulb,
  AlertTriangle,
} from 'lucide-react';
import {
  DIFFICULTY_BANDS,
  difficultyHueClasses,
  formatAvgDifficulty,
  compareToGroup,
} from '@/lib/utils/difficulty-label';

export interface AggregateResponse {
  filters: {
    year: number | null;
    grade: string | null;
    semester: 1 | 2 | null;
    examType: string | null;
    schools: string[] | null;
  };
  matched: {
    schoolCount: number;
    examCount: number;
    analyzedExamCount: number;
    problemCount: number;
    classifiedProblemCount: number;
  };
  unitFrequency: Array<{
    level1Code: string;
    level1Name: string;
    problemCount: number;
    examCount: number;
    schoolCount: number;
  }>;
  difficultyDist: {
    examBandCounts: Array<{ band: string; hue: string; examCount: number }>;
    overallAvg: number | null;
    overallStdDev: number | null;
    examWithAvgCount: number;
  };
  schoolBreakdown: Array<{
    school: string;
    examCount: number;
    problemCount: number;
    classifiedCount: number;
    avgDifficulty: number | null;
    stdDevDifficulty: number | null;
    topUnits: Array<{ level1Name: string; problemCount: number }>;
  }>;
  pitfalls: Array<{
    code: string;
    label: string;
    category: string | null;
    problemCount: number;
    examCount: number;
  }>;
  exams: Array<{
    id: string;
    title: string;
    school: string;
    year: number | null;
    semester: 1 | 2 | null;
    examType: string | null;
    problemCount: number;
    classifiedCount: number;
    avgDifficulty: number | null;
    hasAnalysis: boolean;
    shareToken: string | null;
    createdAt: string;
  }>;
  // [Phase 2]
  unitSegmentation: {
    common: AggregateResponse['unitFrequency'];
    unique: AggregateResponse['unitFrequency'];
  };
  unitTrends: Array<{
    level1Code: string;
    level1Name: string;
    byYear: Record<string, { problemCount: number; schoolCount: number; examCount: number }>;
  }>;
  availableYears: number[];
  aiNarratives: Array<{
    examId: string;
    examTitle: string;
    school: string;
    year: number | null;
    summary: string | null;
    hardQuestions: Array<{
      problemId: string;
      number: number;
      subTitle: string;
      intent: string;
    }>;
    generatedAt: string | null;
  }>;
  narrative: Array<{ heading: string; paragraphs: string[] }>;
  /** 공개 링크에 붙일 학원 표기·디자인 파라미터 (2026-11-07) */
  shareParams?: { brand: string; org: string | null };
}

const fmt = (n: number) => n.toLocaleString('ko-KR');

// 결과 섹션 진입 모션 — 부모 stagger, 자식 y 10→0 (prefers-reduced-motion 은 MotionConfig 가 존중)
const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } } };
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const } },
};

// ─── 공통 컴포넌트 ───────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  unit,
  icon,
  accent,
}: {
  label: string;
  value: number | string;
  unit?: string;
  icon: React.ReactNode;
  accent?: 'cyan' | 'emerald' | 'amber';
}) {
  const accentColor =
    accent === 'cyan'
      ? 'text-content-primary'
      : accent === 'emerald'
        ? 'text-emerald-400'
        : accent === 'amber'
          ? 'text-content-primary'
          : 'text-white';
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
        {icon}
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${accentColor}`}>
        {typeof value === 'number' ? fmt(value) : value}
        {unit && <span className="ml-1 text-xs font-medium text-zinc-500">{unit}</span>}
      </div>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
  hint,
  className = '',
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <motion.div variants={itemVariants} className={`rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 ${className}`}>
      <div className="mb-3 flex items-baseline gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          {icon}
          {title}
        </div>
        {hint && <span className="text-[10px] text-zinc-500">{hint}</span>}
      </div>
      {children}
    </motion.div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-xs text-zinc-500">{children}</div>;
}

// ─── 결과 뷰 ─────────────────────────────────────────────────────────────
export function AggregateResults({ data }: { data: AggregateResponse }) {
  return (
    <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-4">
      {/* 매칭 4 stat cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="학교"
          value={data.matched.schoolCount}
          unit="곳"
          icon={<School className="h-4 w-4" />}
        />
        <StatCard
          label="시험지"
          value={data.matched.examCount}
          unit="건"
          icon={<Layers className="h-4 w-4" />}
        />
        <StatCard
          label="분석 완료"
          value={`${data.matched.analyzedExamCount}/${data.matched.examCount}`}
          icon={<Sparkles className="h-4 w-4" />}
          accent="cyan"
        />
        <StatCard
          label="문항"
          value={data.matched.problemCount}
          unit={`(분류 ${data.matched.classifiedProblemCount})`}
          icon={<Target className="h-4 w-4" />}
        />
      </motion.div>

      {/* 강사 인사이트 — narrative 형식 (베테랑 수학 강사가 학부모에게 풀어 설명) */}
      {data.narrative.length > 0 && (
        <Panel
          title="강사 인사이트"
          icon={<Lightbulb className="h-4 w-4 text-content-tertiary" />}
          hint="모든 수치는 DB 분류·난이도에서 직접 도출 (할루시네이션 0)"
        >
          <div className="space-y-4 text-sm leading-relaxed text-zinc-200">
            {data.narrative.map((sec, i) => (
              <div key={i}>
                <h4 className="mb-1 text-[13px] font-bold text-zinc-100">{sec.heading}</h4>
                {sec.paragraphs.map((p, j) => (
                  <p key={j} className="text-zinc-300">{p}</p>
                ))}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* 시험지 전체 난이도 */}
      <DifficultyPanel data={data} />

      {/* 단원 빈도 + 시계열 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UnitFrequencyPanel data={data} />
        <UnitTrendsPanel data={data} />
      </div>

      {/* 공통 vs 차별 단원 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UnitSegmentPanel
          title="공통 출제 단원 (≥80% 학교)"
          icon={<Users className="h-4 w-4 text-content-tertiary" />}
          units={data.unitSegmentation.common}
          totalSchools={data.matched.schoolCount}
          accent="cyan"
        />
        <UnitSegmentPanel
          title="학교 차별 단원 (≤30% 학교)"
          icon={<TrendingUp className="h-4 w-4 text-content-tertiary" />}
          units={data.unitSegmentation.unique}
          totalSchools={data.matched.schoolCount}
          accent="amber"
        />
      </div>

      {/* 학교별 비교 */}
      <SchoolBreakdownPanel data={data} />

      {/* 함정(있을 때만) + 시험지별 분석 인용 */}
      <div
        className={`grid grid-cols-1 gap-4 ${
          data.pitfalls.length > 0 ? 'lg:grid-cols-2' : ''
        }`}
      >
        {data.pitfalls.length > 0 && <PitfallPanel data={data} />}
        <AiNarrativePanel data={data} />
      </div>

      {/* 매칭 시험지 목록 */}
      <ExamListPanel data={data} />
    </motion.div>
  );
}

/** 가로 막대 — width 는 그대로 두고 scaleX 로 차오르게 (리플로우 없음) */
function GrowBar({ pct, className }: { pct: number; className: string }) {
  return (
    <motion.div
      className={`origin-left ${className}`}
      style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

function DifficultyPanel({ data }: { data: AggregateResponse }) {
  const dd = data.difficultyDist;
  const totalExams = dd.examWithAvgCount;
  const overall = formatAvgDifficulty(dd.overallAvg);

  return (
    <Panel
      title={`시험지 전체 난이도 (${totalExams}건)`}
      icon={<BarChart3 className="h-4 w-4 text-content-tertiary" />}
      hint="시험지마다 problem 평균(1~10) → 5밴드 라벨"
    >
      <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-2xl font-bold text-white">{overall.numeric}</span>
            <span className="ml-1.5 text-xs text-zinc-500">/10 — 시험지 평균의 평균</span>
            {overall.band && (
              <span
                className={`ml-2 rounded px-1.5 py-0.5 text-xs ${difficultyHueClasses(overall.band.hue).bg} ${difficultyHueClasses(overall.band.hue).text}`}
              >
                {overall.band.label}
              </span>
            )}
          </div>
          {dd.overallStdDev != null && (
            <span className="text-xs text-zinc-500">σ {dd.overallStdDev.toFixed(2)}</span>
          )}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
          {dd.overallAvg != null && (
            <GrowBar pct={(dd.overallAvg / 10) * 100} className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500" />
          )}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
          <span>1 평이</span>
          <span>5 난이도 있음</span>
          <span>10 최고난도</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {dd.examBandCounts.map((bc) => {
          const band = DIFFICULTY_BANDS.find((b) => b.label === bc.band);
          if (!band) return null;
          const pct = totalExams > 0 ? (bc.examCount / totalExams) * 100 : 0;
          const cls = difficultyHueClasses(band.hue);
          return (
            <div key={bc.band} className="flex items-center gap-2 text-xs">
              <div className={`w-20 text-right font-semibold ${cls.text}`}>{band.label}</div>
              <div className="w-12 text-right tabular-nums text-zinc-400">
                {band.min}-{band.max}
              </div>
              <div className="flex-1 overflow-hidden rounded-full bg-zinc-800">
                <GrowBar pct={pct} className={`h-2 ${cls.bar}`} />
              </div>
              <div className="w-16 text-right tabular-nums text-zinc-300">{bc.examCount}건</div>
              <div className="w-12 text-right tabular-nums text-zinc-500">{pct.toFixed(0)}%</div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[10px] text-zinc-500">
        학부모 가이드 — 1~2 평이 / 3~4 보통 / 5~6 난이도 있음 (내신 평균) / 7~8 매우 난이도 있음 (상위권 변별) / 9~10 최고난도
      </div>
    </Panel>
  );
}

function UnitFrequencyPanel({ data }: { data: AggregateResponse }) {
  const top = data.unitFrequency.slice(0, 15);
  const max = Math.max(1, ...top.map((u) => u.problemCount));
  return (
    <Panel title="단원 출제 빈도 (TOP 15)" icon={<BarChart3 className="h-4 w-4 text-content-tertiary" />}>
      <div className="space-y-1.5">
        {top.map((u) => {
          const pct = (u.problemCount / max) * 100;
          return (
            <div key={u.level1Code} className="flex items-center gap-2 text-xs">
              <div className="w-44 truncate text-zinc-200" title={u.level1Name}>
                {u.level1Name}
              </div>
              <div className="flex-1 overflow-hidden rounded-full bg-zinc-800">
                <GrowBar pct={pct} className="h-2 bg-gradient-to-r from-cyan-500 to-indigo-500" />
              </div>
              <div className="w-12 text-right tabular-nums text-zinc-300">{u.problemCount}</div>
              <div className="w-20 text-right text-[10px] text-zinc-500">
                {u.schoolCount}/{data.matched.schoolCount}곳
              </div>
            </div>
          );
        })}
        {top.length === 0 && <Empty>분류된 문항 없음</Empty>}
      </div>
    </Panel>
  );
}

function UnitTrendsPanel({ data }: { data: AggregateResponse }) {
  const years = data.availableYears;
  if (years.length < 2) {
    return (
      <Panel title="단원 시계열 추세" icon={<TrendingUp className="h-4 w-4 text-content-tertiary" />}>
        <Empty>비교할 년도 데이터가 1개 이하 — 추세 미생성</Empty>
      </Panel>
    );
  }
  return (
    <Panel
      title={`단원 시계열 추세 (${years[0]}~${years[years.length - 1]})`}
      icon={<TrendingUp className="h-4 w-4 text-content-tertiary" />}
      hint="TOP 5 단원 · 년도별 문항수"
    >
      <div className="space-y-2">
        {data.unitTrends.map((t) => {
          const cells = years.map((y) => t.byYear[String(y)] || { problemCount: 0, schoolCount: 0, examCount: 0 });
          const maxC = Math.max(1, ...cells.map((c) => c.problemCount));
          return (
            <div key={t.level1Code} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5">
              <div className="mb-1 flex items-baseline justify-between">
                <div className="text-xs font-semibold text-zinc-200">{t.level1Name}</div>
                <TrendArrow cells={cells} />
              </div>
              <div className="flex items-end gap-1.5" style={{ height: 36 }}>
                {cells.map((c, i) => {
                  const h = (c.problemCount / maxC) * 100;
                  return (
                    <div key={years[i]} className="flex flex-1 flex-col items-center gap-0.5">
                      <motion.div
                        className="w-full origin-bottom rounded-sm bg-gradient-to-t from-cyan-600 to-cyan-400"
                        style={{ height: `${h}%`, minHeight: c.problemCount > 0 ? 2 : 0 }}
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ duration: 0.45, delay: 0.15 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                        title={`${years[i]}: ${c.problemCount}문 / ${c.schoolCount}학교`}
                      />
                      <div className="text-[9px] tabular-nums text-zinc-500">{years[i]}</div>
                      <div className="text-[10px] tabular-nums text-zinc-300">{c.problemCount}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function TrendArrow({ cells }: { cells: Array<{ problemCount: number }> }) {
  if (cells.length < 2) return null;
  const last = cells[cells.length - 1].problemCount;
  const prev = cells[cells.length - 2].problemCount;
  if (prev === 0) {
    return last > 0 ? <span className="text-[10px] font-bold text-emerald-400">신규</span> : null;
  }
  const pct = Math.round(((last - prev) / prev) * 100);
  if (Math.abs(pct) < 5)
    return <span className="text-[10px] tabular-nums text-zinc-500">≈</span>;
  const cls = pct > 0 ? 'text-emerald-400' : 'text-rose-400';
  return <span className={`text-[10px] font-bold tabular-nums ${cls}`}>{pct > 0 ? '+' : ''}{pct}%</span>;
}

function UnitSegmentPanel({
  title,
  icon,
  units,
  totalSchools,
  accent,
}: {
  title: string;
  icon: React.ReactNode;
  units: AggregateResponse['unitFrequency'];
  totalSchools: number;
  accent: 'cyan' | 'amber';
}) {
  const accentBar = accent === 'cyan' ? 'bg-cyan-500' : 'bg-amber-500';
  return (
    <Panel title={title} icon={icon}>
      {totalSchools < 3 ? (
        <Empty>학교가 3곳 이상 매칭될 때 공통·차별 단원을 나눕니다 (지금 {totalSchools}곳)</Empty>
      ) : units.length === 0 ? (
        <Empty>{accent === 'cyan' ? '공통 단원 없음' : '차별 단원 없음 (모든 단원이 고르게 출제됨)'}</Empty>
      ) : (
        <div className="space-y-1.5">
          {units.slice(0, 10).map((u) => {
            const pct = totalSchools > 0 ? (u.schoolCount / totalSchools) * 100 : 0;
            return (
              <div key={u.level1Code} className="flex items-center gap-2 text-xs">
                <div className="w-36 truncate text-zinc-200" title={u.level1Name}>
                  {u.level1Name}
                </div>
                <div className="flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <GrowBar pct={pct} className={`h-2 ${accentBar}`} />
                </div>
                <div className="w-16 text-right tabular-nums text-zinc-300">
                  {u.schoolCount}/{totalSchools}
                </div>
                <div className="w-14 text-right tabular-nums text-zinc-400">{u.problemCount}문</div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function SchoolBreakdownPanel({ data }: { data: AggregateResponse }) {
  const groupAvg = data.difficultyDist.overallAvg;
  return (
    <Panel title="학교별 비교" icon={<School className="h-4 w-4 text-content-tertiary" />}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
            <tr className="border-b border-zinc-800">
              <th className="py-1.5 pr-2 text-left">학교</th>
              <th className="py-1.5 px-2 text-right">시험지</th>
              <th className="py-1.5 px-2 text-right">문항</th>
              <th className="py-1.5 px-2 text-left">평균 난이도</th>
              <th className="py-1.5 px-2 text-left">그룹 비교</th>
              <th className="py-1.5 pl-2 text-left">자주 출제 단원 (TOP 3)</th>
            </tr>
          </thead>
          <tbody>
            {data.schoolBreakdown.map((s) => {
              const f = formatAvgDifficulty(s.avgDifficulty);
              const cmp =
                s.avgDifficulty != null && groupAvg != null
                  ? compareToGroup(s.avgDifficulty, groupAvg)
                  : '-';
              return (
                <tr key={s.school} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-2 font-semibold text-zinc-200">
                    <Link href={`/dashboard/reports/${encodeURIComponent(s.school)}`} className="hover:text-white hover:underline underline-offset-2" title="학교 상세">
                      {s.school}
                    </Link>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{s.examCount}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{s.problemCount}</td>
                  <td className="py-2 px-2">
                    {f.band ? (
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-bold tabular-nums text-white">{f.numeric}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${difficultyHueClasses(f.band.hue).bg} ${difficultyHueClasses(f.band.hue).text}`}
                        >
                          {f.band.label}
                        </span>
                        {s.stdDevDifficulty != null && (
                          <span className="text-[10px] text-zinc-500">σ{s.stdDevDifficulty.toFixed(1)}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-zinc-500">-</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-zinc-400">{cmp}</td>
                  <td className="py-2 pl-2">
                    <div className="flex flex-wrap gap-1">
                      {s.topUnits.map((u) => (
                        <span
                          key={u.level1Name}
                          className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300"
                        >
                          {u.level1Name}
                          <span className="ml-1 text-zinc-500">{u.problemCount}</span>
                        </span>
                      ))}
                      {s.topUnits.length === 0 && <span className="text-[10px] text-zinc-500">-</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function PitfallPanel({ data }: { data: AggregateResponse }) {
  const top = data.pitfalls.slice(0, 8);
  return (
    <Panel title="함정 패턴" icon={<AlertTriangle className="h-4 w-4 text-content-tertiary" />}>
      {top.length > 0 ? (
        <div className="space-y-1.5">
          {top.map((p) => (
            <div
              key={p.code}
              className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/40 px-2.5 py-1.5 text-xs"
            >
              <div>
                <div className="font-semibold text-zinc-200">{p.label}</div>
                {p.category && <div className="text-[10px] text-zinc-500">{p.category}</div>}
              </div>
              <div className="text-right">
                <div className="font-bold tabular-nums text-zinc-200">{p.problemCount}문항</div>
                <div className="text-[10px] text-zinc-500">
                  {p.examCount}/{data.matched.examCount}건
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty>매칭된 함정 태깅 없음 — 자산화 시 함정 태깅 누적 필요</Empty>
      )}
    </Panel>
  );
}

function AiNarrativePanel({ data }: { data: AggregateResponse }) {
  return (
    <Panel
      title={`시험지별 분석 인용 (${data.aiNarratives.length}건)`}
      icon={<Sparkles className="h-4 w-4 text-content-tertiary" />}
      hint="출처 시험지 ID 명시"
    >
      {data.aiNarratives.length === 0 ? (
        <Empty>분석 완료 시험지 없음</Empty>
      ) : (
        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {data.aiNarratives.map((n) => (
            <details key={n.examId} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5 text-xs">
              <summary className="cursor-pointer text-zinc-200">
                <span className="font-semibold">{n.school}</span>
                <span className="ml-1.5 text-zinc-500">{[n.year, n.examTitle.slice(0, 30)].filter(Boolean).join(' · ')}</span>
                <span className="ml-1.5 text-[10px] text-content-tertiary">시험지 분석</span>
              </summary>
              {n.summary && (
                <div className="mt-2 text-zinc-300">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">요약</div>
                  <p>{n.summary}</p>
                </div>
              )}
              {n.hardQuestions.length > 0 && (
                <div className="mt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">고난도 문항</div>
                  <ul className="space-y-1.5">
                    {n.hardQuestions.map((h) => (
                      <li key={`${n.examId}-${h.number}`} className="border-l-2 border-white/[.14] pl-2 text-zinc-300">
                        <span className="font-semibold text-zinc-100">#{h.number}</span>
                        <span className="ml-1.5 text-zinc-200 [&_p]:inline [&_div]:inline"><MixedContentRenderer content={h.subTitle} inline /></span>
                        <div className="mt-0.5 text-[11px] text-zinc-400">{h.intent}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </details>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ExamListPanel({ data }: { data: AggregateResponse }) {
  return (
    <Panel title={`매칭 시험지 (${data.exams.length}건)`} icon={<Layers className="h-4 w-4 text-content-tertiary" />}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
            <tr className="border-b border-zinc-800">
              <th className="py-1.5 pr-2 text-left">제목</th>
              <th className="py-1.5 px-2 text-left">학교</th>
              <th className="py-1.5 px-2 text-left">메타</th>
              <th className="py-1.5 px-2 text-right">문항</th>
              <th className="py-1.5 px-2 text-right">분류</th>
              <th className="py-1.5 px-2 text-left">난이도</th>
              <th className="py-1.5 pl-2 text-center">분석</th>
            </tr>
          </thead>
          <tbody>
            {data.exams.map((e) => {
              const f = formatAvgDifficulty(e.avgDifficulty);
              return (
                <tr key={e.id} className="border-b border-zinc-800/50">
                  <td className="max-w-md truncate py-2 pr-2">
                    <Link
                      href={`/dashboard/exam-analysis/${e.id}`}
                      className="text-zinc-200 hover:text-white"
                      title={`${e.title} — 분석 페이지`}
                    >
                      {e.title}
                    </Link>
                  </td>
                  <td className="py-2 px-2 text-zinc-300">{e.school}</td>
                  <td className="py-2 px-2 text-zinc-400">
                    {[e.year, e.semester ? `${e.semester}학기` : '', e.examType]
                      .filter(Boolean)
                      .join(' · ')}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{e.problemCount}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-zinc-400">
                    {e.classifiedCount}/{e.problemCount}
                  </td>
                  <td className="py-2 px-2">
                    {f.band ? (
                      <span className="inline-flex items-baseline gap-1.5">
                        <span className="font-bold tabular-nums text-white">{f.numeric}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${difficultyHueClasses(f.band.hue).bg} ${difficultyHueClasses(f.band.hue).text}`}
                        >
                          {f.band.label}
                        </span>
                      </span>
                    ) : (
                      <span className="text-zinc-600">-</span>
                    )}
                  </td>
                  <td className="py-2 pl-2 text-center">
                    {e.hasAnalysis ? (
                      <Sparkles className="inline h-3.5 w-3.5 text-content-secondary" />
                    ) : (
                      <span className="text-zinc-700">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
