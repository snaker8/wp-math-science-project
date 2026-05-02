'use client';

// ============================================================================
// 학교별 집계 분석 대시보드
// /dashboard/reports/aggregate
//
// 필터 (년도·학년·학기·구분·학교 다중) + 매칭 시험지 raw aggregation 시각화.
// 모든 수치는 classifications/problem_pitfalls/exam_problems DB 값에서 직접 도출
// (할루시네이션 0). ai_analysis 자연어 텍스트는 표시 시 "AI 생성" 라벨 명시.
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Filter, BarChart3, School, Sparkles, Info } from 'lucide-react';
import {
  DIFFICULTY_BANDS,
  difficultyToBand,
  difficultyHueClasses,
  formatAvgDifficulty,
  compareToGroup,
} from '@/lib/utils/difficulty-label';

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
}

const GRADE_OPTIONS = ['중1', '중2', '중3', '고1', '고2', '고3'] as const;
const SEMESTER_OPTIONS = [1, 2] as const;
const EXAM_TYPE_OPTIONS = ['중간', '기말', '모의고사', '수행평가'] as const;

export default function AggregatePage() {
  const [hubSchools, setHubSchools] = useState<SchoolFromHub[]>([]);
  const [allYears, setAllYears] = useState<number[]>([]);
  const [data, setData] = useState<AggregateResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // 필터 상태
  const [year, setYear] = useState<number | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [semester, setSemester] = useState<1 | 2 | null>(null);
  const [examType, setExamType] = useState<string | null>(null);
  const [selectedSchools, setSelectedSchools] = useState<Set<string>>(new Set());

  // 첫 진입 시 학교 목록·년도 수집
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

  // 학년 필터 변경 시 → 해당 학년의 학교만 표시
  const visibleSchools = useMemo(() => {
    if (!grade) return hubSchools;
    return hubSchools.filter((s) => s.grades.includes(grade));
  }, [hubSchools, grade]);

  // 필터 적용
  const fetchAggregate = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (year != null) qs.set('year', String(year));
      if (grade) qs.set('grade', grade);
      if (semester != null) qs.set('semester', String(semester));
      if (examType) qs.set('examType', examType);
      if (selectedSchools.size > 0) qs.set('schools', Array.from(selectedSchools).join(','));
      const r = await fetch(`/api/reports/aggregate?${qs.toString()}`, { cache: 'no-store' });
      if (!r.ok) {
        setData(null);
        return;
      }
      const d = await r.json();
      setData(d);
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

  const hasActiveFilter =
    year != null || grade != null || semester != null || examType != null || selectedSchools.size > 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* 상단 — breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/dashboard/reports"
            className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
          >
            <ArrowLeft className="h-4 w-4" />
            학교별 분석 리포트
          </Link>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-400">
            <Info className="h-3 w-3" />
            모든 수치는 DB raw 데이터 기반 (할루시네이션 0)
          </div>
        </div>

        <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold">
          <BarChart3 className="h-6 w-6 text-violet-400" />
          학교별 집계 분석
        </h1>
        <p className="mb-6 text-sm text-zinc-400">
          여러 학교의 시험지를 묶어 단원 출제 빈도·난이도·함정 패턴을 한눈에 비교합니다.
        </p>

        {/* 필터 바 */}
        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-300">
            <Filter className="h-4 w-4 text-violet-400" />
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

          {/* 4개 select 한 행 */}
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

          {/* 학교 multi-select — pill chips */}
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
                        ? 'border-violet-500 bg-violet-500/20 text-violet-200'
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

          {/* 적용 버튼 */}
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={fetchAggregate}
              disabled={loading}
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-50"
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

        {/* 결과 카드 */}
        {data && data.matched.examCount > 0 ? (
          <ResultsView data={data} />
        ) : data && data.matched.examCount === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-400">
            매칭되는 시험지가 없습니다. 필터를 조정해보세요.
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/50 p-8 text-center text-zinc-500">
            필터를 선택하고 <span className="text-violet-400">집계 분석 실행</span> 을 누르세요.
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// SelectField 작은 컴포넌트
// ────────────────────────────────────────────────────────────────────────
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
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
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

// ────────────────────────────────────────────────────────────────────────
// 결과 뷰
// ────────────────────────────────────────────────────────────────────────
function ResultsView({ data }: { data: AggregateResponse }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <MatchSummaryCard data={data} />
      <DifficultyOverviewCard data={data} />
      <UnitFrequencyCard data={data} />
      <PitfallCard data={data} />
      <SchoolBreakdownCard data={data} />
      <ExamListCard data={data} />
    </div>
  );
}

function MatchSummaryCard({ data }: { data: AggregateResponse }) {
  const m = data.matched;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 md:col-span-2">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-zinc-300">
        <School className="h-4 w-4 text-violet-400" />
        매칭 요약
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="학교" value={`${m.schoolCount}곳`} />
        <Stat label="시험지" value={`${m.examCount}건`} />
        <Stat
          label="AI 분석 완료"
          value={`${m.analyzedExamCount}/${m.examCount}`}
          hint={m.examCount > 0 ? `${Math.round((m.analyzedExamCount / m.examCount) * 100)}%` : ''}
        />
        <Stat label="문항" value={`${m.problemCount}개`} />
        <Stat
          label="분류된 문항"
          value={`${m.classifiedProblemCount}/${m.problemCount}`}
          hint={
            m.problemCount > 0
              ? `${Math.round((m.classifiedProblemCount / m.problemCount) * 100)}%`
              : ''
          }
        />
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-0.5 font-bold text-white">{value}</div>
      {hint && <div className="text-[10px] text-zinc-500">{hint}</div>}
    </div>
  );
}

function DifficultyOverviewCard({ data }: { data: AggregateResponse }) {
  const dd = data.difficultyDist;
  const totalExams = dd.examWithAvgCount;
  const overall = formatAvgDifficulty(dd.overallAvg);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 md:col-span-2">
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-zinc-300">시험지 전체 난이도 ({totalExams}건)</h3>
        <span className="text-[10px] text-zinc-500">▣ DB 기반 — 시험지마다 problem 평균(1~10) → 5 밴드 라벨</span>
      </div>

      {/* 그룹 평균 게이지 */}
      <div className="mb-4 rounded-md border border-zinc-800 bg-zinc-950 p-3">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-2xl font-bold text-white">{overall.numeric}</span>
            <span className="ml-1.5 text-xs text-zinc-500">/10 — 시험지 평균의 평균</span>
            {overall.band && (
              <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${difficultyHueClasses(overall.band.hue).bg} ${difficultyHueClasses(overall.band.hue).text}`}>
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
          <span>1 기초</span>
          <span>5 심화</span>
          <span>10 최고난도</span>
        </div>
      </div>

      {/* 밴드별 시험지 수 */}
      <div className="space-y-1.5">
        {dd.examBandCounts.map((bc) => {
          const band = DIFFICULTY_BANDS.find((b) => b.label === bc.band);
          if (!band) return null;
          const pct = totalExams > 0 ? (bc.examCount / totalExams) * 100 : 0;
          const cls = difficultyHueClasses(band.hue);
          return (
            <div key={bc.band} className="flex items-center gap-2 text-xs">
              <div className={`w-20 text-right ${cls.text} font-semibold`}>
                {band.label}
              </div>
              <div className="w-12 text-right tabular-nums text-zinc-400">
                {band.min}-{band.max}
              </div>
              <div className="flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-2 ${cls.bar}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="w-16 text-right tabular-nums text-zinc-300">
                {bc.examCount}건
              </div>
              <div className="w-12 text-right tabular-nums text-zinc-500">
                {pct.toFixed(0)}%
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[10px] text-zinc-500">
        💡 학부모 가이드 — 1~2 기초 / 3~4 응용 / 5~6 심화 (내신 평균) / 7~8 고난도 (상위권 변별) / 9~10 최고난도
      </div>
    </div>
  );
}

function UnitFrequencyCard({ data }: { data: AggregateResponse }) {
  const top = data.unitFrequency.slice(0, 15);
  const max = Math.max(1, ...top.map((u) => u.problemCount));
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-zinc-300">단원 출제 빈도 (TOP 15)</h3>
        <span className="text-[10px] text-zinc-500">▣ DB 기반</span>
      </div>
      <div className="space-y-1.5">
        {top.map((u) => {
          const pct = (u.problemCount / max) * 100;
          return (
            <div key={u.level1Code} className="flex items-center gap-2 text-xs">
              <div className="w-44 truncate text-zinc-300" title={u.level1Name}>
                {u.level1Name}
              </div>
              <div className="flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-2 bg-violet-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="w-12 text-right tabular-nums text-zinc-300">
                {u.problemCount}
              </div>
              <div className="w-20 text-right text-[10px] text-zinc-500">
                {u.schoolCount}/{data.matched.schoolCount}곳
              </div>
            </div>
          );
        })}
        {top.length === 0 && (
          <div className="py-4 text-center text-xs text-zinc-500">
            분류된 문항이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

function PitfallCard({ data }: { data: AggregateResponse }) {
  const top = data.pitfalls.slice(0, 8);
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-zinc-300">함정 패턴</h3>
        <span className="text-[10px] text-zinc-500">▣ DB 기반</span>
      </div>
      {top.length > 0 ? (
        <div className="space-y-1.5">
          {top.map((p) => (
            <div
              key={p.code}
              className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
            >
              <div>
                <div className="font-semibold text-zinc-200">{p.label}</div>
                {p.category && (
                  <div className="text-[10px] text-zinc-500">{p.category}</div>
                )}
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
        <div className="py-4 text-center text-xs text-zinc-500">
          매칭된 함정 태깅이 없습니다.
        </div>
      )}
    </div>
  );
}

function SchoolBreakdownCard({ data }: { data: AggregateResponse }) {
  const groupAvg = data.difficultyDist.overallAvg;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 md:col-span-2">
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-zinc-300">학교별 비교</h3>
        <span className="text-[10px] text-zinc-500">▣ DB 기반</span>
      </div>
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
                  <td className="py-2 px-2 text-right tabular-nums text-zinc-300">
                    {s.examCount}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-zinc-300">
                    {s.problemCount}
                  </td>
                  <td className="py-2 px-2">
                    {f.band ? (
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-bold tabular-nums text-white">{f.numeric}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${difficultyHueClasses(f.band.hue).bg} ${difficultyHueClasses(f.band.hue).text}`}>
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
                      {s.topUnits.length === 0 && (
                        <span className="text-[10px] text-zinc-500">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExamListCard({ data }: { data: AggregateResponse }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 md:col-span-2">
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-zinc-300">매칭 시험지 ({data.exams.length}건)</h3>
        <span className="ml-auto text-[10px] text-zinc-500">
          <Sparkles className="inline h-3 w-3" /> AI 분석 완료 표시
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
            <tr className="border-b border-zinc-800">
              <th className="py-1.5 pr-2 text-left">제목</th>
              <th className="py-1.5 px-2 text-left">학교</th>
              <th className="py-1.5 px-2 text-left">학년·학기·구분</th>
              <th className="py-1.5 px-2 text-right">문항</th>
              <th className="py-1.5 px-2 text-right">분류</th>
              <th className="py-1.5 px-2 text-left">난이도</th>
              <th className="py-1.5 pl-2 text-center">AI</th>
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
                      className="text-zinc-200 hover:text-violet-300"
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
                  <td className="py-2 px-2 text-right tabular-nums text-zinc-300">
                    {e.problemCount}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-zinc-400">
                    {e.classifiedCount}/{e.problemCount}
                  </td>
                  <td className="py-2 px-2">
                    {f.band ? (
                      <span className="inline-flex items-baseline gap-1.5">
                        <span className="font-bold tabular-nums text-white">{f.numeric}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${difficultyHueClasses(f.band.hue).bg} ${difficultyHueClasses(f.band.hue).text}`}>
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
    </div>
  );
}
