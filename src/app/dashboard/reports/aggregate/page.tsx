'use client';

// ============================================================================
// 학교별 집계 분석 대시보드
// /dashboard/reports/aggregate
//
// 5개 필터 + Phase 1·2 결과 카드. 모든 수치는 DB raw aggregation (할루시네이션 0).
// ai_analysis 자연어는 examId/problemId 출처 명시.
// /dashboard/reports/[school] 와 톤·레이아웃 통일 — bg-black + zinc-900/40 + cyan/indigo.
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Filter,
  BarChart3,
  School,
  Sparkles,
  Info,
  Layers,
  TrendingUp,
  Target,
  Users,
  Lightbulb,
  Share2,
  Check,
  AlertTriangle,
} from 'lucide-react';
import {
  DIFFICULTY_BANDS,
  difficultyToBand,
  difficultyHueClasses,
  formatAvgDifficulty,
  compareToGroup,
} from '@/lib/utils/difficulty-label';

// ─── 타입 ────────────────────────────────────────────────────────────────
interface SchoolFromHub {
  school: string;
  level: '초' | '중' | '고' | '대' | '미분류';
  years: number[];
  grades: string[];
  examCount: number;
}

interface AggregateResponse {
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
}

const GRADE_OPTIONS = ['중1', '중2', '중3', '고1', '고2', '고3'] as const;
const SEMESTER_OPTIONS = [1, 2] as const;
const EXAM_TYPE_OPTIONS = ['중간', '기말', '모의고사', '수행평가'] as const;

// ─── 메인 ────────────────────────────────────────────────────────────────
export default function AggregatePage() {
  const [hubSchools, setHubSchools] = useState<SchoolFromHub[]>([]);
  const [allYears, setAllYears] = useState<number[]>([]);
  const [data, setData] = useState<AggregateResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // 필터
  const [year, setYear] = useState<number | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [semester, setSemester] = useState<1 | 2 | null>(null);
  const [examType, setExamType] = useState<string | null>(null);
  const [selectedSchools, setSelectedSchools] = useState<Set<string>>(new Set());

  // 학교 목록·년도 로드
  useEffect(() => {
    (async () => {
      const r = await fetch('/api/reports/by-school', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      setHubSchools(d.schools || []);
      const yearSet = new Set<number>();
      ((d.schools || []) as SchoolFromHub[]).forEach((s) => s.years.forEach((y) => yearSet.add(y)));
      setAllYears(Array.from(yearSet).sort((a, b) => b - a));
    })();
  }, []);

  const visibleSchools = useMemo(() => {
    if (!grade) return hubSchools;
    return hubSchools.filter((s) => s.grades.includes(grade));
  }, [hubSchools, grade]);

  const buildQueryString = (): string => {
    const qs = new URLSearchParams();
    if (year != null) qs.set('year', String(year));
    if (grade) qs.set('grade', grade);
    if (semester != null) qs.set('semester', String(semester));
    if (examType) qs.set('examType', examType);
    if (selectedSchools.size > 0) qs.set('schools', Array.from(selectedSchools).join(','));
    return qs.toString();
  };

  const fetchAggregate = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/reports/aggregate?${buildQueryString()}`, { cache: 'no-store' });
      if (!r.ok) {
        setData(null);
        return;
      }
      setData(await r.json());
    } finally {
      setLoading(false);
    }
  };

  const toggleSchool = (s: string) => {
    setSelectedSchools((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const clearSchools = () => setSelectedSchools(new Set());

  // 학부모 공유 — 새 탭으로 열기 + 클립보드 복사 동시 (popup 차단 회피용 anchor 기반)
  const [shareCopied, setShareCopied] = useState(false);
  const handleShareClick = async () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/share/aggregate?${buildQueryString()}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2200);
    } catch {
      // 클립보드 실패해도 anchor target=_blank 가 새 탭을 열어줌
    }
  };

  const hasActiveFilter =
    year != null || grade != null || semester != null || examType != null || selectedSchools.size > 0;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black text-white">
      {/* Header — [school] 패턴 */}
      <div className="flex-shrink-0 border-b border-zinc-800/50 px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/reports"
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10">
              <BarChart3 className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">학교별 집계 분석</h1>
              <p className="mt-0.5 text-xs text-zinc-400">
                여러 학교의 시험지를 묶어 단원·난이도·추세를 한눈에 비교
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-400">
              <Info className="h-3 w-3" />
              모든 수치는 DB 기반 (할루시네이션 0)
            </span>
            {data && data.matched.examCount > 0 && (
              <a
                href={`/share/aggregate?${buildQueryString()}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleShareClick}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20"
                title="새 탭에서 학부모 공유 페이지를 엽니다 (링크도 자동 복사)"
              >
                {shareCopied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                {shareCopied ? '링크 복사됨 + 새 탭 열림' : '학부모 공유 페이지 열기'}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* 필터 */}
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
            <Filter className="h-4 w-4 text-cyan-400" />
            필터
            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setYear(null);
                  setGrade(null);
                  setSemester(null);
                  setExamType(null);
                  clearSchools();
                  setData(null);
                }}
                className="ml-auto text-xs font-normal text-zinc-500 hover:text-zinc-300"
              >
                초기화
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SelectField
              label="년도"
              value={year != null ? String(year) : ''}
              onChange={(v) => setYear(v ? parseInt(v, 10) : null)}
              options={[
                { value: '', label: '전체' },
                ...allYears.map((y) => ({ value: String(y), label: `${y}년` })),
              ]}
            />
            <SelectField
              label="학년"
              value={grade || ''}
              onChange={(v) => setGrade(v || null)}
              options={[
                { value: '', label: '전체' },
                ...GRADE_OPTIONS.map((g) => ({ value: g, label: g })),
              ]}
            />
            <SelectField
              label="학기"
              value={semester != null ? String(semester) : ''}
              onChange={(v) => setSemester(v ? (parseInt(v, 10) as 1 | 2) : null)}
              options={[
                { value: '', label: '전체' },
                ...SEMESTER_OPTIONS.map((s) => ({ value: String(s), label: `${s}학기` })),
              ]}
            />
            <SelectField
              label="구분"
              value={examType || ''}
              onChange={(v) => setExamType(v || null)}
              options={[
                { value: '', label: '전체' },
                ...EXAM_TYPE_OPTIONS.map((t) => ({ value: t, label: t })),
              ]}
            />
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-400">
              <span>학교 (다중선택, 미선택 시 전체)</span>
              {selectedSchools.size > 0 && (
                <button type="button" onClick={clearSchools} className="text-zinc-500 hover:text-zinc-300">
                  지우기 ({selectedSchools.size}개)
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {visibleSchools.map((s) => {
                const active = selectedSchools.has(s.school);
                return (
                  <button
                    key={s.school}
                    type="button"
                    onClick={() => toggleSchool(s.school)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      active
                        ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600'
                    }`}
                  >
                    {s.school}
                    <span className="ml-1 text-[10px] text-zinc-500">{s.examCount}</span>
                  </button>
                );
              })}
              {visibleSchools.length === 0 && (
                <span className="text-xs text-zinc-500">해당 조건의 학교 없음</span>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={fetchAggregate}
              disabled={loading}
              className="rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2 text-sm font-bold text-white hover:from-cyan-400 hover:to-indigo-400 disabled:opacity-50"
            >
              {loading ? '집계 중...' : '집계 분석 실행'}
            </button>
            {data && (
              <span className="text-xs text-zinc-400">
                매칭 {data.matched.examCount}건 / 학교 {data.matched.schoolCount}곳
              </span>
            )}
          </div>
        </div>

        {/* 결과 */}
        {data && data.matched.examCount > 0 ? (
          <ResultsView data={data} />
        ) : data && data.matched.examCount === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-400">
            매칭되는 시험지가 없습니다. 필터를 조정해보세요.
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 p-8 text-center text-zinc-500">
            필터를 선택하고 <span className="text-cyan-400">집계 분석 실행</span> 을 누르세요.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 공통 컴포넌트 ───────────────────────────────────────────────────────
function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

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
      ? 'text-cyan-400'
      : accent === 'emerald'
        ? 'text-emerald-400'
        : accent === 'amber'
          ? 'text-amber-400'
          : 'text-white';
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
        {icon}
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${accentColor}`}>
        {value}
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
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 ${className}`}>
      <div className="mb-3 flex items-baseline gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          {icon}
          {title}
        </div>
        {hint && <span className="text-[10px] text-zinc-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-xs text-zinc-500">{children}</div>;
}

// ─── 결과 뷰 ─────────────────────────────────────────────────────────────
function ResultsView({ data }: { data: AggregateResponse }) {
  return (
    <div className="space-y-4">
      {/* 매칭 4 stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
      </div>

      {/* 강사 인사이트 — narrative 형식 (베테랑 수학 강사가 학부모에게 풀어 설명) */}
      {data.narrative.length > 0 && (
        <Panel
          title="강사 인사이트"
          icon={<Lightbulb className="h-4 w-4 text-amber-400" />}
          hint="모든 수치는 DB 분류·난이도에서 직접 도출 (할루시네이션 0)"
        >
          <div className="space-y-4 text-sm leading-relaxed text-zinc-200">
            {data.narrative.map((sec, i) => (
              <div key={i}>
                <h4 className="mb-1 text-[13px] font-bold text-amber-300">{sec.heading}</h4>
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
          icon={<Users className="h-4 w-4 text-cyan-400" />}
          units={data.unitSegmentation.common}
          totalSchools={data.matched.schoolCount}
          accent="cyan"
        />
        <UnitSegmentPanel
          title="학교 차별 단원 (≤30% 학교)"
          icon={<TrendingUp className="h-4 w-4 text-amber-400" />}
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
    </div>
  );
}

function DifficultyPanel({ data }: { data: AggregateResponse }) {
  const dd = data.difficultyDist;
  const totalExams = dd.examWithAvgCount;
  const overall = formatAvgDifficulty(dd.overallAvg);

  return (
    <Panel
      title={`시험지 전체 난이도 (${totalExams}건)`}
      icon={<BarChart3 className="h-4 w-4 text-cyan-400" />}
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
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500"
              style={{ width: `${(dd.overallAvg / 10) * 100}%` }}
            />
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
                <div className={`h-2 ${cls.bar}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="w-16 text-right tabular-nums text-zinc-300">{bc.examCount}건</div>
              <div className="w-12 text-right tabular-nums text-zinc-500">{pct.toFixed(0)}%</div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[10px] text-zinc-500">
        💡 학부모 가이드 — 1~2 평이 / 3~4 보통 / 5~6 난이도 있음 (내신 평균) / 7~8 매우 난이도 있음 (상위권 변별) / 9~10 최고난도
      </div>
    </Panel>
  );
}

function UnitFrequencyPanel({ data }: { data: AggregateResponse }) {
  const top = data.unitFrequency.slice(0, 15);
  const max = Math.max(1, ...top.map((u) => u.problemCount));
  return (
    <Panel title="단원 출제 빈도 (TOP 15)" icon={<BarChart3 className="h-4 w-4 text-cyan-400" />}>
      <div className="space-y-1.5">
        {top.map((u) => {
          const pct = (u.problemCount / max) * 100;
          return (
            <div key={u.level1Code} className="flex items-center gap-2 text-xs">
              <div className="w-44 truncate text-zinc-200" title={u.level1Name}>
                {u.level1Name}
              </div>
              <div className="flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-2 bg-gradient-to-r from-cyan-500 to-indigo-500"
                  style={{ width: `${pct}%` }}
                />
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
      <Panel title="단원 시계열 추세" icon={<TrendingUp className="h-4 w-4 text-cyan-400" />}>
        <Empty>비교할 년도 데이터가 1개 이하 — 추세 미생성</Empty>
      </Panel>
    );
  }
  return (
    <Panel
      title={`단원 시계열 추세 (${years[0]}~${years[years.length - 1]})`}
      icon={<TrendingUp className="h-4 w-4 text-cyan-400" />}
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
                      <div
                        className="w-full rounded-sm bg-gradient-to-t from-cyan-600 to-cyan-400"
                        style={{ height: `${h}%`, minHeight: c.problemCount > 0 ? 2 : 0 }}
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
      {units.length === 0 ? (
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
                  <div className={`h-2 ${accentBar}`} style={{ width: `${pct}%` }} />
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
    <Panel title="학교별 비교" icon={<School className="h-4 w-4 text-cyan-400" />}>
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
                  <td className="py-2 pr-2 font-semibold text-zinc-200">{s.school}</td>
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
    <Panel title="함정 패턴" icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}>
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
                <div className="font-bold text-amber-400">{p.problemCount}문항</div>
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
      icon={<Sparkles className="h-4 w-4 text-violet-400" />}
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
                <span className="ml-1.5 text-zinc-500">{n.year} · {n.examTitle.slice(0, 30)}</span>
                <span className="ml-1.5 text-[10px] text-violet-400">✻ 시험지 분석</span>
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
                      <li key={h.problemId} className="border-l-2 border-violet-500/40 pl-2 text-zinc-300">
                        <span className="font-semibold text-violet-300">#{h.number}</span>
                        <span className="ml-1.5 text-zinc-200">{h.subTitle}</span>
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
    <Panel title={`매칭 시험지 (${data.exams.length}건)`} icon={<Layers className="h-4 w-4 text-cyan-400" />}>
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
                      href={`/dashboard/cloud/${e.id}`}
                      className="text-zinc-200 hover:text-cyan-300"
                      title={e.title}
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
                      <Sparkles className="inline h-3.5 w-3.5 text-violet-400" />
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
