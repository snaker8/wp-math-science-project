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
import { MotionConfig } from 'framer-motion';
import {
  ArrowLeft,
  Filter,
  RefreshCw,
  BarChart3,
  Info,
  Share2,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { useSmartBack } from '@/lib/navigation/useSmartBack';
import { AggregateResults, type AggregateResponse } from '@/components/reports/AggregateResults';

// ─── 타입 ────────────────────────────────────────────────────────────────
interface SchoolFromHub {
  school: string;
  level: '초' | '중' | '고' | '대' | '미분류';
  years: number[];
  grades: string[];
  examCount: number;
}


const GRADE_OPTIONS = ['중1', '중2', '중3', '고1', '고2', '고3'] as const;
const SEMESTER_OPTIONS = [1, 2] as const;
const EXAM_TYPE_OPTIONS = ['중간', '기말', '모의고사', '수행평가'] as const;

const fmt = (n: number) => n.toLocaleString('ko-KR');


// ─── 메인 ────────────────────────────────────────────────────────────────
export default function AggregatePage() {
  const goBack = useSmartBack('/dashboard/reports');
  const [hubSchools, setHubSchools] = useState<SchoolFromHub[]>([]);
  const [hubLoading, setHubLoading] = useState(true);
  const [hubError, setHubError] = useState<string | null>(null);
  const [allYears, setAllYears] = useState<number[]>([]);
  const [data, setData] = useState<AggregateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 마지막으로 실행한 조회 문자열 — 공유 링크·"필터 변경됨" 판정은 화면에 보이는 결과 기준 (2026-11-04 B21·B22) */
  const [lastQuery, setLastQuery] = useState<string | null>(null);

  // 필터
  const [year, setYear] = useState<number | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [semester, setSemester] = useState<1 | 2 | null>(null);
  const [examType, setExamType] = useState<string | null>(null);
  const [selectedSchools, setSelectedSchools] = useState<Set<string>>(new Set());

  // 학교 목록·년도 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/reports/by-school', { cache: 'no-store' });
        if (!r.ok) {
          if (!cancelled) setHubError(`학교 목록을 불러오지 못했습니다 (${r.status})`);
          return;
        }
        const d = await r.json();
        if (cancelled) return;
        setHubSchools(d.schools || []);
        const yearSet = new Set<number>();
        ((d.schools || []) as SchoolFromHub[]).forEach((s) => s.years.forEach((y) => yearSet.add(y)));
        setAllYears(Array.from(yearSet).sort((a, b) => b - a));
      } catch {
        if (!cancelled) setHubError('네트워크 오류로 학교 목록을 불러오지 못했습니다');
      } finally {
        if (!cancelled) setHubLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visibleSchools = useMemo(() => {
    if (!grade) return hubSchools;
    return hubSchools.filter((s) => s.grades.includes(grade));
  }, [hubSchools, grade]);

  // ★ 학년을 바꾸면 칩에서 사라진 학교는 선택에서도 뺀다 (종전엔 숨은 채 요청에 실려 갔다 — B24)
  useEffect(() => {
    if (hubLoading) return;
    const visible = new Set(visibleSchools.map((s) => s.school));
    setSelectedSchools((prev) => {
      const next = new Set(Array.from(prev).filter((s) => visible.has(s)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleSchools, hubLoading]);

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
    const qs = buildQueryString();
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/reports/aggregate?${qs}`, { cache: 'no-store' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d?.detail || d?.error || `집계에 실패했습니다 (${r.status})`);
        return;
      }
      setData(await r.json());
      setLastQuery(qs);
    } catch (e) {
      setError(e instanceof Error ? `네트워크 오류: ${e.message}` : '네트워크 오류로 집계하지 못했습니다');
    } finally {
      setLoading(false);
    }
  };

  const currentQuery = buildQueryString();
  const filterDirty = data != null && lastQuery != null && currentQuery !== lastQuery;

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
  // ★ 공개 링크에 학원 표기·디자인 파라미터 (비로그인 학부모는 세션이 없어 서버가 학원을 못 안다)
  const shareSuffix = data?.shareParams
    ? `&brand=${encodeURIComponent(data.shareParams.brand)}${data.shareParams.org ? `&org=${encodeURIComponent(data.shareParams.org)}` : ''}`
    : '';
  const handleShareClick = async () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/share/aggregate?${lastQuery ?? buildQueryString()}${shareSuffix}`;
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
    <MotionConfig reducedMotion="user">
    <div className="flex h-full w-full flex-col overflow-hidden bg-black text-white">
      {/* Header — [school] 패턴 */}
      <div className="flex-shrink-0 border-b border-zinc-800/50 px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[.08] bg-white/[.04]">
              <BarChart3 className="h-5 w-5 text-content-tertiary" />
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
            {data && data.matched.examCount > 0 && lastQuery != null && (
              <a
                href={`/share/aggregate?${lastQuery}${shareSuffix}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleShareClick}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-1.5 text-xs font-bold text-content-secondary hover:bg-white/[.06] hover:text-content-primary"
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
            <Filter className="h-4 w-4 text-content-tertiary" />
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
                        ? 'border-white/[.14] bg-white/[.08] text-content-primary'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600'
                    }`}
                  >
                    {s.school}
                    <span className="ml-1 text-[10px] text-zinc-500">{s.examCount}</span>
                  </button>
                );
              })}
              {hubLoading && (
                <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                  <span className="h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-transparent" />
                  학교 목록 불러오는 중
                </span>
              )}
              {!hubLoading && hubError && (
                <span className="inline-flex items-center gap-1 text-xs text-content-secondary">
                  <AlertTriangle className="h-3 w-3" />
                  {hubError}
                </span>
              )}
              {!hubLoading && !hubError && visibleSchools.length === 0 && (
                <span className="text-xs text-zinc-500">해당 조건의 학교 없음</span>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={fetchAggregate}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50"
            >
              {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />}
              {loading ? '집계 중...' : filterDirty ? '바뀐 필터로 다시 실행' : '집계 분석 실행'}
            </button>
            {data && !filterDirty && (
              <span className="text-xs text-zinc-400 tabular-nums">
                매칭 {fmt(data.matched.examCount)}건 / 학교 {fmt(data.matched.schoolCount)}곳
              </span>
            )}
            {filterDirty && (
              <span className="inline-flex items-center gap-1 rounded-md border border-white/[.14] bg-white/[.06] px-2 py-1 text-[11px] text-content-primary">
                <RefreshCw className="h-3 w-3" />
                필터가 바뀌었습니다. 아래 결과는 이전 조건입니다.
              </span>
            )}
            {error && (
              <span className="inline-flex items-center gap-1 text-xs text-content-primary">
                <AlertTriangle className="h-3 w-3" />
                {error}
              </span>
            )}
          </div>
        </div>

        {/* 결과 — 다시 실행할 때마다 key 가 바뀌어 진입 모션이 다시 나온다 */}
        <div className={`relative transition-opacity ${loading && data ? 'pointer-events-none opacity-50' : ''} ${filterDirty ? 'opacity-70' : ''}`} aria-busy={loading}>
          {data && data.matched.examCount > 0 ? (
            <AggregateResults key={lastQuery ?? 'result'} data={data} />
          ) : data && data.matched.examCount === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-400">
              매칭되는 시험지가 없습니다. 필터를 조정해보세요.
            </div>
          ) : loading ? (
            <div className="space-y-4" aria-label="집계 중">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-[88px] animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40" />
                ))}
              </div>
              <div className="h-40 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40" />
              <div className="h-64 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40" />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 p-8 text-center text-zinc-500">
              필터를 선택하고 <span className="text-content-primary">집계 분석 실행</span> 을 누르세요.
            </div>
          )}
        </div>
      </div>
    </div>
    </MotionConfig>
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
