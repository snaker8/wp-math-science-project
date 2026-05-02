'use client';

// ============================================================================
// 학부모/블로그 공유용 집계 분석 리포트 (공개)
// /share/aggregate?year=&grade=&semester=&examType=&schools=
//
// 인증 없이 접근. /share/exam/[token] 톤(크림+오렌지) 일관 — 친근한 학원 보고서.
// 모든 수치는 DB raw aggregation. 시험지별 분석 인용은 출처 시험지명 명시.
// 베테랑 강사 톤의 narrative 인사이트 + 시험지 상세 분석 진입 유도 CTA.
// ============================================================================

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Printer,
  Link2,
  Check,
  Loader2,
  BookOpenText,
  BarChart3,
  PieChart,
  TrendingUp,
  Users,
  Lightbulb,
  AlertTriangle,
  Sparkles,
  ScrollText,
} from 'lucide-react';

// ─── 타입 ────────────────────────────────────────────────────────────────
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
    avgDifficulty: number | null;
    stdDevDifficulty: number | null;
    topUnits: Array<{ level1Name: string; problemCount: number }>;
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
  pitfalls: Array<{
    code: string;
    label: string;
    category: string | null;
    problemCount: number;
    examCount: number;
  }>;
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

// 5밴드 색상 (크림 톤 기준 매핑)
const BAND_COLOR: Record<string, { bg: string; text: string; bar: string; soft: string }> = {
  '평이': { bg: 'bg-yellow-50', text: 'text-yellow-700', bar: 'bg-yellow-400', soft: '#FEF3C7' },
  '보통': { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-400', soft: '#D1FAE5' },
  '난이도 있음': { bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-400', soft: '#FFEBD7' },
  '매우 난이도 있음': { bg: 'bg-rose-50', text: 'text-rose-700', bar: 'bg-rose-400', soft: '#FFE4E6' },
  '최고난도': { bg: 'bg-rose-100', text: 'text-rose-800', bar: 'bg-rose-600', soft: '#FECACA' },
};

function bandFor(avg: number | null | undefined): string {
  if (avg == null) return '';
  if (avg <= 2) return '평이';
  if (avg <= 4) return '보통';
  if (avg <= 6) return '난이도 있음';
  if (avg <= 8) return '매우 난이도 있음';
  return '최고난도';
}

// ─── 메인 ────────────────────────────────────────────────────────────────
export default function ShareAggregateClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5]">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      }
    >
      <ShareAggregateContent />
    </Suspense>
  );
}

function ShareAggregateContent() {
  const sp = useSearchParams();
  const [data, setData] = useState<AggregateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/reports/aggregate?${sp.toString()}`, {
          cache: 'no-store',
        });
        if (!r.ok) {
          if (!cancelled) setErr(`HTTP ${r.status}`);
          return;
        }
        const d = (await r.json()) as AggregateResponse;
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
  }, [sp]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      window.prompt('이 페이지 링크를 복사하세요', window.location.href);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5]">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }
  if (err || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#FAF8F5] text-zinc-700">
        <AlertTriangle className="h-10 w-10 text-orange-300" />
        <div className="text-sm">{err || '데이터를 불러올 수 없습니다.'}</div>
      </div>
    );
  }

  const m = data.matched;
  const filterChips = [
    data.filters.year ? `${data.filters.year}년` : null,
    data.filters.grade,
    data.filters.semester ? `${data.filters.semester}학기` : null,
    data.filters.examType,
    data.filters.schools && data.filters.schools.length > 0
      ? `학교 ${data.filters.schools.length}곳 선택`
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-screen bg-[#FAF8F5] px-4 pb-20 pt-8 text-zinc-800 print:bg-white print:px-0 print:py-0">
      {/* 액션바 (인쇄·공유) */}
      <div className="sticky top-3 z-10 mx-auto mb-6 max-w-5xl print:hidden">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-orange-200/60 bg-white/90 p-1.5 shadow-sm backdrop-blur">
          <button
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-orange-50 hover:text-orange-700"
          >
            {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
            {linkCopied ? '링크 복사됨' : '링크 복사'}
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-orange-50 hover:text-orange-700"
          >
            <Printer className="h-3.5 w-3.5" />
            인쇄
          </button>
          <div className="ml-auto flex items-center pr-2 text-[10px] text-zinc-500">
            과사람 수학 분석 리포트
          </div>
        </div>
      </div>

      {/* 본문 — A4 비율 카드 */}
      <article className="mx-auto max-w-5xl rounded-2xl border border-orange-100 bg-white p-8 shadow-md sm:p-10 print:border-0 print:shadow-none">
        {/* HEADER */}
        <header className="mb-8 flex flex-wrap items-end justify-between gap-3 border-b-2 border-orange-200 pb-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-600">
              SCHOOL EXAM AGGREGATE REPORT
            </div>
            <h1 className="mt-1.5 text-2xl font-bold text-zinc-900 sm:text-3xl">
              <span className="text-orange-600">학교별 시험지</span> 집계 분석
            </h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {filterChips.length > 0 ? (
                filterChips.map((c, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-700"
                  >
                    {c}
                  </span>
                ))
              ) : (
                <span className="text-xs text-zinc-500">전체 기준</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">
              MATCHED
            </div>
            <div className="text-3xl font-bold tabular-nums text-zinc-900">{m.examCount}</div>
            <div className="text-[11px] text-zinc-500">
              시험지 · 학교 {m.schoolCount}곳 · 문항 {m.problemCount}
            </div>
          </div>
        </header>

        {/* CTA 배너 — 시험지별 상세 분석 진입 강조 */}
        {(() => {
          const detailCount = data.exams.filter((e) => e.hasAnalysis && e.shareToken).length;
          if (detailCount === 0) return null;
          return (
            <div className="mt-6 mb-2 rounded-xl border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-amber-50 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-orange-900">
                    이 통합 리포트는 ‘큰 흐름’입니다 — 시험지 한 건씩 깊이 들어가 보세요
                  </h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-700">
                    학교별 시험지 <strong className="text-orange-700">{detailCount}건</strong>이
                    문항 단위까지 상세 분석 완료된 상태입니다. 각 시험지 카드를 클릭하면{' '}
                    <strong>실제 수식 · 단계별 풀이 전략 · 출제 의도</strong>까지 보실 수 있습니다.
                    이 깊이 있는 시험지별 분석이 본 시스템의 가장 큰 강점입니다.
                  </p>
                  <p className="mt-2 text-[13.5px] text-zinc-600">
                    아래 <strong>섹션 07 시험지별 분석 인용</strong> 또는{' '}
                    <strong>섹션 08 시험지 목록</strong>의 ‘상세 보기’ 버튼에서 진입하세요.
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 기본 통계 4 카드 */}
        <Section number="01" title="기본 정보">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="학교" value={`${m.schoolCount}곳`} />
            <Stat label="시험지" value={`${m.examCount}건`} />
            <Stat
              label="분석 완료"
              value={`${m.analyzedExamCount}/${m.examCount}`}
              hint={
                m.examCount > 0 ? `${Math.round((m.analyzedExamCount / m.examCount) * 100)}%` : ''
              }
            />
            <Stat
              label="분류된 문항"
              value={`${m.classifiedProblemCount}`}
              hint={
                m.problemCount > 0
                  ? `${Math.round((m.classifiedProblemCount / m.problemCount) * 100)}%`
                  : ''
              }
            />
          </div>
        </Section>

        {/* ★ HERO — 학교별 비교 (집계 분석의 핵심) */}
        <Section number="02" title="학교별 비교" icon={<TrendingUp className="h-4 w-4" />}>
          <SchoolComparison data={data} />
        </Section>

        {/* 강사 인사이트 — narrative */}
        {data.narrative.length > 0 && (
          <Section number="03" title="강사 인사이트" icon={<Lightbulb className="h-4 w-4" />}>
            <div className="space-y-6 rounded-xl border border-orange-100 bg-orange-50/40 p-6 text-[15.5px] leading-[1.8] text-zinc-700">
              {data.narrative.map((sec, i) => (
                <div key={i}>
                  <h4 className="mb-2 text-[15px] font-bold text-orange-700">{sec.heading}</h4>
                  {sec.paragraphs.map((p, j) => (
                    <p key={j} className="mb-2 text-zinc-700 last:mb-0">
                      {p}
                    </p>
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-zinc-500">
              ※ 모든 수치는 시험지 분류·난이도 데이터에서 직접 도출됩니다 (할루시네이션 없음).
            </div>
          </Section>
        )}

        {/* 난이도 분포 */}
        <Section number="04" title="시험지 전체 난이도" icon={<BarChart3 className="h-4 w-4" />}>
          <DifficultyView data={data} />
        </Section>

        {/* 단원 빈도 + 시계열 */}
        <Section number="05" title="단원 출제 빈도" icon={<PieChart className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <UnitListView data={data} />
            <UnitTrendsView data={data} />
          </div>
        </Section>

        {/* 공통 vs 차별 단원 */}
        <Section number="06" title="공통 단원 vs 학교별 차별 단원" icon={<Users className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <UnitSegmentView
              title={`공통 출제 (≥80% 학교)`}
              units={data.unitSegmentation.common}
              totalSchools={m.schoolCount}
              accent="cyan"
              empty="공통 단원 없음"
            />
            <UnitSegmentView
              title={`학교 차별 (≤30% 학교)`}
              units={data.unitSegmentation.unique}
              totalSchools={m.schoolCount}
              accent="amber"
              empty="모든 단원이 고르게 출제됨"
            />
          </div>
        </Section>

        {/* 함정(있을 때만) + 시험지별 분석 인용 */}
        {(data.pitfalls.length > 0 || data.aiNarratives.length > 0) && (
          <Section
            number="07"
            title={
              data.pitfalls.length > 0
                ? '함정 패턴 · 시험지별 분석 인용'
                : '시험지별 분석 인용'
            }
            icon={<ScrollText className="h-4 w-4" />}
          >
            <div
              className={`grid grid-cols-1 gap-5 ${
                data.pitfalls.length > 0 ? 'lg:grid-cols-2' : ''
              }`}
            >
              {data.pitfalls.length > 0 && <PitfallView data={data} />}
              <AiNarrativeView data={data} />
            </div>
          </Section>
        )}

        {/* 매칭 시험지 목록 */}
        <Section number="08" title={`매칭 시험지 (${data.exams ? '' : ''}${m.examCount}건)`}>
          <ExamTable data={data} />
        </Section>

        {/* 푸터 */}
        <footer className="mt-10 border-t border-orange-100 pt-4 text-center text-[10px] text-zinc-500">
          과사람 수학프로그램 · 학교별 시험지 집계 분석 리포트
          {data.aiNarratives.length > 0 && (
            <span className="ml-2">
              · 시험지별 분석 {data.aiNarratives.length}건 인용 (출처 시험지 ID 명시)
            </span>
          )}
        </footer>
      </article>
    </div>
  );
}

// ─── 공통 컴포넌트 ───────────────────────────────────────────────────────
function Section({
  number,
  title,
  icon,
  children,
}: {
  number: string;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-9 first:mt-0">
      <div className="mb-4 flex items-center gap-2.5 border-l-4 border-orange-500 pl-3">
        <span className="font-mono text-sm text-orange-600">{number}</span>
        {icon && <span className="text-orange-600">{icon}</span>}
        <h2 className="text-lg font-bold text-zinc-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-orange-100 bg-orange-50/30 p-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-orange-600">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums text-zinc-900">
        {value}
        {hint && <span className="ml-1.5 text-[12px] font-medium text-zinc-500">({hint})</span>}
      </div>
    </div>
  );
}

function DifficultyView({ data }: { data: AggregateResponse }) {
  const dd = data.difficultyDist;
  const total = dd.examWithAvgCount;
  const overall = dd.overallAvg;
  const overallBand = bandFor(overall);
  const cls = overallBand ? BAND_COLOR[overallBand] : null;

  return (
    <div>
      <div className="mb-4 rounded-xl border border-orange-100 bg-orange-50/30 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <span className="text-3xl font-bold tabular-nums text-zinc-900">
              {overall != null ? overall.toFixed(2) : '-'}
            </span>
            <span className="ml-1.5 text-xs text-zinc-500">/ 10 — 시험지 평균의 평균</span>
            {cls && (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${cls.bg} ${cls.text}`}
              >
                {overallBand}
              </span>
            )}
          </div>
          {dd.overallStdDev != null && (
            <span className="text-xs text-zinc-500">표준편차 σ {dd.overallStdDev.toFixed(2)}</span>
          )}
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-200">
          {overall != null && (
            <div
              className="h-full bg-gradient-to-r from-yellow-400 via-orange-400 to-rose-500"
              style={{ width: `${(overall / 10) * 100}%` }}
            />
          )}
        </div>
        <div className="mt-1 flex justify-between text-[10px] font-medium text-zinc-500">
          <span>1 평이</span>
          <span>5 난이도 있음</span>
          <span>10 최고난도</span>
        </div>
      </div>

      <div className="space-y-2">
        {dd.examBandCounts.map((bc) => {
          const cls2 = BAND_COLOR[bc.band];
          if (!cls2) return null;
          const pct = total > 0 ? (bc.examCount / total) * 100 : 0;
          return (
            <div key={bc.band} className="flex items-center gap-3 text-sm">
              <div className={`w-24 text-right font-bold ${cls2.text}`}>{bc.band}</div>
              <div className="flex-1 overflow-hidden rounded-full bg-zinc-100">
                <div className={`h-2.5 ${cls2.bar}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="w-16 text-right tabular-nums font-semibold text-zinc-700">
                {bc.examCount}건
              </div>
              <div className="w-14 text-right tabular-nums text-zinc-500">{pct.toFixed(0)}%</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 rounded-md bg-zinc-50 p-3 text-[12.5px] leading-relaxed text-zinc-600">
        <strong className="text-orange-700">학부모 가이드</strong> — 1~2 평이 (교과서 기본) / 3~4 보통 / 5~6 난이도 있음 (내신 평균) / 7~8 매우 난이도 있음 (상위권 변별) / 9~10 최고난도
      </div>
    </div>
  );
}

function UnitListView({ data }: { data: AggregateResponse }) {
  const top = data.unitFrequency.slice(0, 12);
  const max = Math.max(1, ...top.map((u) => u.problemCount));
  return (
    <div>
      <div className="mb-2.5 text-sm font-semibold text-zinc-700">단원 출제 빈도 (TOP 12)</div>
      <div className="space-y-2">
        {top.map((u) => {
          const pct = (u.problemCount / max) * 100;
          return (
            <div key={u.level1Code} className="flex items-center gap-2.5 text-[13.5px]">
              <div className="w-36 truncate font-medium text-zinc-700" title={u.level1Name}>
                {u.level1Name}
              </div>
              <div className="flex-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-orange-400 to-orange-600"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="w-10 text-right tabular-nums font-semibold text-zinc-700">
                {u.problemCount}
              </div>
              <div className="w-16 text-right text-[11.5px] text-zinc-500">
                {u.schoolCount}/{data.matched.schoolCount}곳
              </div>
            </div>
          );
        })}
        {top.length === 0 && (
          <div className="py-4 text-center text-sm text-zinc-500">분류된 문항 없음</div>
        )}
      </div>
    </div>
  );
}

function UnitTrendsView({ data }: { data: AggregateResponse }) {
  const years = data.availableYears;
  if (years.length < 2) {
    return (
      <div>
        <div className="mb-2 text-xs font-semibold text-zinc-700">단원 시계열 추세</div>
        <div className="rounded-lg border border-orange-100 bg-orange-50/20 py-6 text-center text-xs text-zinc-500">
          비교할 년도 데이터가 1개 이하 — 추세 미생성
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-zinc-700">
        단원 시계열 추세 ({years[0]}~{years[years.length - 1]}, TOP 5)
      </div>
      <div className="space-y-2">
        {data.unitTrends.map((t) => {
          const cells = years.map(
            (y) => t.byYear[String(y)] || { problemCount: 0, schoolCount: 0, examCount: 0 }
          );
          const maxC = Math.max(1, ...cells.map((c) => c.problemCount));
          const last = cells[cells.length - 1].problemCount;
          const prev = cells[cells.length - 2].problemCount;
          const trendPct =
            prev > 0
              ? Math.round(((last - prev) / prev) * 100)
              : last > 0
                ? null
                : 0;
          return (
            <div key={t.level1Code} className="rounded-lg border border-orange-100 bg-orange-50/20 p-2.5">
              <div className="mb-1.5 flex items-baseline justify-between">
                <div className="text-xs font-semibold text-zinc-800">{t.level1Name}</div>
                <div className="text-[10px] tabular-nums">
                  {trendPct === null ? (
                    <span className="font-bold text-emerald-600">신규</span>
                  ) : Math.abs(trendPct) >= 5 ? (
                    <span
                      className={`font-bold ${trendPct > 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                    >
                      {trendPct > 0 ? '+' : ''}
                      {trendPct}%
                    </span>
                  ) : (
                    <span className="text-zinc-500">≈</span>
                  )}
                </div>
              </div>
              <div className="flex items-end gap-1.5" style={{ height: 40 }}>
                {cells.map((c, i) => {
                  const h = (c.problemCount / maxC) * 100;
                  return (
                    <div key={years[i]} className="flex flex-1 flex-col items-center gap-0.5">
                      <div
                        className="w-full rounded-sm bg-gradient-to-t from-orange-500 to-orange-300"
                        style={{
                          height: `${h}%`,
                          minHeight: c.problemCount > 0 ? 2 : 0,
                        }}
                        title={`${years[i]}: ${c.problemCount}문 / ${c.schoolCount}학교`}
                      />
                      <div className="text-[9px] tabular-nums text-zinc-500">{years[i]}</div>
                      <div className="text-[10px] tabular-nums font-semibold text-zinc-700">
                        {c.problemCount}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UnitSegmentView({
  title,
  units,
  totalSchools,
  accent,
  empty,
}: {
  title: string;
  units: AggregateResponse['unitFrequency'];
  totalSchools: number;
  accent: 'cyan' | 'amber';
  empty: string;
}) {
  const bar =
    accent === 'cyan' ? 'bg-cyan-500' : 'bg-amber-500';
  const labelCls =
    accent === 'cyan' ? 'text-cyan-700' : 'text-amber-700';
  return (
    <div>
      <div className={`mb-2.5 text-sm font-semibold ${labelCls}`}>{title}</div>
      {units.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 py-6 text-center text-sm text-zinc-500">
          {empty}
        </div>
      ) : (
        <div className="space-y-2">
          {units.slice(0, 8).map((u) => {
            const pct = totalSchools > 0 ? (u.schoolCount / totalSchools) * 100 : 0;
            return (
              <div key={u.level1Code} className="flex items-center gap-2.5 text-[13.5px]">
                <div className="w-36 truncate font-medium text-zinc-700" title={u.level1Name}>
                  {u.level1Name}
                </div>
                <div className="flex-1 overflow-hidden rounded-full bg-zinc-100">
                  <div className={`h-2.5 rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="w-16 text-right tabular-nums font-semibold text-zinc-700">
                  {u.schoolCount}/{totalSchools}
                </div>
                <div className="w-14 text-right tabular-nums text-zinc-500">{u.problemCount}문</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── 학교별 비교 (HERO) ─────────────────────────────────────────────────
// 막대 차트(그룹 평균 점선) + 랭킹 3카드(가장 어려운/특이/평이) + 카드 그리드(차별 단원 ★).
// 마지막에 SchoolTable 을 접기로 노출 (데이터 디테일 원하는 사람용).
function SchoolComparison({ data }: { data: AggregateResponse }) {
  const groupAvg = data.difficultyDist.overallAvg;
  // avgDifficulty 있는 학교만 + 높은 난이도 순 정렬
  const sorted = [...data.schoolBreakdown]
    .filter((s) => s.avgDifficulty != null)
    .sort((a, b) => (b.avgDifficulty || 0) - (a.avgDifficulty || 0));

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-orange-100 bg-orange-50/30 py-8 text-center text-sm text-zinc-500">
        평균 난이도 계산 가능한 학교 데이터 없음
      </div>
    );
  }

  const hardest = sorted[0];
  const easiest = sorted[sorted.length - 1];
  // 가장 특이 = 그룹 평균에서 가장 멀리 떨어진 학교 (절댓값 기준)
  const mostUnique =
    groupAvg != null
      ? [...sorted].sort(
          (a, b) =>
            Math.abs((b.avgDifficulty || 0) - groupAvg) -
            Math.abs((a.avgDifficulty || 0) - groupAvg),
        )[0]
      : null;
  // 차별(unique) 단원 lookup — 학교 카드의 ★ 표시용
  const uniqueUnits = new Set(data.unitSegmentation.unique.map((u) => u.level1Name));

  return (
    <div className="space-y-6">
      {/* 1. 학교별 평균 난이도 막대 차트 (그룹 평균 점선) */}
      <div className="rounded-xl border border-orange-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="text-sm font-bold text-zinc-800">학교별 평균 난이도 (높은 순)</div>
          {groupAvg != null && (
            <div className="text-[12.5px] text-zinc-500">
              그룹 평균 <span className="font-bold text-orange-700">{groupAvg.toFixed(2)}</span>
            </div>
          )}
        </div>
        <div className="space-y-2">
          {sorted.map((s, i) => {
            const pct = ((s.avgDifficulty || 0) / 10) * 100;
            const band = bandFor(s.avgDifficulty);
            const cls = band ? BAND_COLOR[band] : null;
            return (
              <div key={s.school} className="flex items-center gap-3">
                <div className="w-24 truncate text-right text-[13px] font-semibold text-zinc-800" title={s.school}>
                  {i === 0 && <span className="mr-1 text-rose-600">▲</span>}
                  {i === sorted.length - 1 && sorted.length > 1 && <span className="mr-1 text-emerald-600">▼</span>}
                  {s.school}
                </div>
                <div className="relative flex-1 overflow-hidden rounded-full bg-zinc-100" style={{ height: 18 }}>
                  <div
                    className={`h-full ${cls?.bar || 'bg-zinc-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                  {/* 그룹 평균 점선 */}
                  {groupAvg != null && (
                    <div
                      className="absolute top-0 bottom-0 border-l-2 border-dashed border-zinc-700/70"
                      style={{ left: `${(groupAvg / 10) * 100}%` }}
                      title={`그룹 평균 ${groupAvg.toFixed(2)}`}
                    />
                  )}
                </div>
                <div className="w-14 text-right tabular-nums text-[14px] font-bold text-zinc-900">
                  {(s.avgDifficulty || 0).toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between text-[11.5px] text-zinc-500">
          <span>← 평이 (1)</span>
          <span className="text-zinc-700">┊ 그룹 평균 (점선)</span>
          <span>최고난도 (10) →</span>
        </div>
      </div>

      {/* 2. 랭킹 3카드 — 가장 어려운 / 그룹 대비 가장 특이 / 가장 평이 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <RankingCard
          tone="rose"
          label="가장 어려운 학교"
          school={hardest.school}
          metric={hardest.avgDifficulty != null ? hardest.avgDifficulty.toFixed(2) : '-'}
          band={bandFor(hardest.avgDifficulty)}
          subtle={
            groupAvg != null && hardest.avgDifficulty != null
              ? `그룹 평균 대비 +${(hardest.avgDifficulty - groupAvg).toFixed(2)}`
              : undefined
          }
        />
        {mostUnique && (
          <RankingCard
            tone="amber"
            label="그룹 대비 가장 특이"
            school={mostUnique.school}
            metric={
              groupAvg != null && mostUnique.avgDifficulty != null
                ? `${(mostUnique.avgDifficulty - groupAvg) > 0 ? '+' : ''}${(mostUnique.avgDifficulty - groupAvg).toFixed(2)}`
                : '-'
            }
            subtle={`평균 ${(mostUnique.avgDifficulty || 0).toFixed(2)} · ${bandFor(mostUnique.avgDifficulty)}`}
          />
        )}
        <RankingCard
          tone="emerald"
          label="가장 평이한 학교"
          school={easiest.school}
          metric={easiest.avgDifficulty != null ? easiest.avgDifficulty.toFixed(2) : '-'}
          band={bandFor(easiest.avgDifficulty)}
          subtle={
            groupAvg != null && easiest.avgDifficulty != null
              ? `그룹 평균 대비 ${(easiest.avgDifficulty - groupAvg).toFixed(2)}`
              : undefined
          }
        />
      </div>

      {/* 3. 학교별 상세 카드 그리드 (3열) */}
      <div>
        <div className="mb-2.5 flex items-baseline justify-between">
          <div className="text-sm font-bold text-zinc-800">학교별 한눈에 보기</div>
          <div className="text-[11.5px] text-zinc-500">★ 이 학교 특화 단원 (그룹 30% 이하 학교에서만 출제)</div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((s) => {
            const band = bandFor(s.avgDifficulty);
            const cls = band ? BAND_COLOR[band] : null;
            const diff = groupAvg != null && s.avgDifficulty != null ? s.avgDifficulty - groupAvg : null;
            const borderCls =
              band === '최고난도' ? 'border-rose-300' :
              band === '매우 난이도 있음' ? 'border-rose-200' :
              band === '난이도 있음' ? 'border-orange-200' :
              band === '보통' ? 'border-emerald-200' :
              band === '평이' ? 'border-yellow-200' : 'border-zinc-200';
            return (
              <div
                key={s.school}
                className={`rounded-xl border-2 ${borderCls} bg-white p-4 shadow-sm transition-shadow hover:shadow-md`}
              >
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h4 className="truncate text-[15.5px] font-bold text-zinc-900" title={s.school}>{s.school}</h4>
                  <span className="flex-shrink-0 text-[11px] text-zinc-500">
                    {s.examCount}건 · {s.problemCount}문항
                  </span>
                </div>
                <div className="mb-3 flex items-baseline gap-2">
                  <span className="text-[28px] font-bold tabular-nums leading-none text-zinc-900">
                    {(s.avgDifficulty || 0).toFixed(2)}
                  </span>
                  {cls && band && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls.bg} ${cls.text}`}>
                      {band}
                    </span>
                  )}
                  {diff != null && Math.abs(diff) >= 0.05 && (
                    <span className={`text-[12.5px] font-bold ${diff > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {diff > 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(2)}
                    </span>
                  )}
                </div>
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-orange-600">자주 출제 단원</div>
                  <div className="flex flex-wrap gap-1">
                    {s.topUnits.slice(0, 3).map((u) => {
                      const isUnique = uniqueUnits.has(u.level1Name);
                      return (
                        <span
                          key={u.level1Name}
                          className={`rounded-md border px-2 py-0.5 text-[12px] ${
                            isUnique
                              ? 'border-amber-300 bg-amber-100 text-amber-800'
                              : 'border-orange-200 bg-orange-50 text-orange-700'
                          }`}
                          title={isUnique ? '이 학교 특화 단원 (그룹 30% 이하 학교에서만 출제)' : undefined}
                        >
                          {isUnique && '★ '}{u.level1Name}
                          <span className="ml-1 opacity-60">{u.problemCount}</span>
                        </span>
                      );
                    })}
                    {s.topUnits.length === 0 && (
                      <span className="text-[11.5px] text-zinc-400">단원 데이터 없음</span>
                    )}
                  </div>
                </div>
                {s.stdDevDifficulty != null && (
                  <div className="mt-2 text-[10.5px] text-zinc-400">
                    난이도 표준편차 σ {s.stdDevDifficulty.toFixed(2)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. 상세 표 (접기) — 그룹 비교 코멘트 포함, 데이터 디테일 원하는 사람용 */}
      <details className="rounded-lg border border-orange-100 bg-orange-50/20 p-3">
        <summary className="cursor-pointer text-[13.5px] font-semibold text-orange-700">
          상세 표 보기 (그룹 비교 코멘트 포함)
        </summary>
        <div className="mt-3">
          <SchoolTable data={data} />
        </div>
      </details>
    </div>
  );
}

function RankingCard({
  tone,
  label,
  school,
  metric,
  band,
  subtle,
}: {
  tone: 'rose' | 'amber' | 'emerald';
  label: string;
  school: string;
  metric: string;
  band?: string | null;
  subtle?: string;
}) {
  const toneCls = {
    rose: 'border-rose-300 bg-gradient-to-br from-rose-50 to-rose-50/30',
    amber: 'border-amber-300 bg-gradient-to-br from-amber-50 to-amber-50/30',
    emerald: 'border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-50/30',
  }[tone];
  const labelCls = {
    rose: 'text-rose-700',
    amber: 'text-amber-700',
    emerald: 'text-emerald-700',
  }[tone];
  const metricCls = {
    rose: 'text-rose-700',
    amber: 'text-amber-700',
    emerald: 'text-emerald-700',
  }[tone];
  return (
    <div className={`rounded-xl border-2 ${toneCls} p-4 shadow-sm`}>
      <div className={`mb-1.5 text-[11.5px] font-bold uppercase tracking-wider ${labelCls}`}>{label}</div>
      <div className="text-[16px] font-bold text-zinc-900">{school}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className={`text-[26px] font-bold tabular-nums leading-none ${metricCls}`}>{metric}</span>
        {band && <span className="text-[11.5px] font-semibold text-zinc-600">{band}</span>}
      </div>
      {subtle && <div className="mt-1.5 text-[11.5px] text-zinc-500">{subtle}</div>}
    </div>
  );
}

function SchoolTable({ data }: { data: AggregateResponse }) {
  const groupAvg = data.difficultyDist.overallAvg;
  return (
    <div className="overflow-x-auto rounded-lg border border-orange-100">
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="border-b border-orange-200 bg-orange-50/50 text-[11.5px] uppercase tracking-wider text-zinc-600">
            <th className="px-3 py-2.5 text-left">학교</th>
            <th className="px-3 py-2.5 text-right">시험지</th>
            <th className="px-3 py-2.5 text-right">문항</th>
            <th className="px-3 py-2.5 text-left">평균 난이도</th>
            <th className="px-3 py-2.5 text-left">그룹 비교</th>
            <th className="px-3 py-2.5 text-left">자주 출제 단원</th>
          </tr>
        </thead>
        <tbody>
          {data.schoolBreakdown.map((s) => {
            const band = bandFor(s.avgDifficulty);
            const cls = band ? BAND_COLOR[band] : null;
            const cmp =
              s.avgDifficulty != null && groupAvg != null ? compareToGroupKo(s.avgDifficulty, groupAvg) : '-';
            return (
              <tr key={s.school} className="border-b border-orange-50">
                <td className="px-3 py-2.5 font-bold text-zinc-800">{s.school}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.examCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.problemCount}</td>
                <td className="px-3 py-2.5">
                  {cls ? (
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className="font-bold tabular-nums text-zinc-900">
                        {(s.avgDifficulty || 0).toFixed(2)}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${cls.bg} ${cls.text}`}>
                        {band}
                      </span>
                      {s.stdDevDifficulty != null && (
                        <span className="text-[11px] text-zinc-500">σ{s.stdDevDifficulty.toFixed(1)}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-zinc-500">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-zinc-600">{cmp}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {s.topUnits.slice(0, 3).map((u) => (
                      <span
                        key={u.level1Name}
                        className="rounded bg-orange-50 px-2 py-0.5 text-[11.5px] text-orange-700"
                      >
                        {u.level1Name}
                        <span className="ml-1 text-orange-400">{u.problemCount}</span>
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PitfallView({ data }: { data: AggregateResponse }) {
  const top = data.pitfalls.slice(0, 6);
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-zinc-700">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        함정 패턴
      </div>
      {top.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 py-6 text-center text-sm text-zinc-500">
          매칭된 함정 태깅 없음
        </div>
      ) : (
        <ul className="space-y-2">
          {top.map((p) => (
            <li
              key={p.code}
              className="flex items-center justify-between rounded-md border border-amber-100 bg-amber-50/40 px-3.5 py-2.5 text-[13.5px]"
            >
              <div>
                <div className="font-bold text-zinc-800">{p.label}</div>
                {p.category && <div className="text-[11.5px] text-zinc-500">{p.category}</div>}
              </div>
              <div className="text-right">
                <div className="font-bold text-amber-700">{p.problemCount}문항</div>
                <div className="text-[11.5px] text-zinc-500">
                  {p.examCount}/{data.matched.examCount}건
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AiNarrativeView({ data }: { data: AggregateResponse }) {
  // examId → shareToken 매핑 (상세 페이지 진입 링크용)
  const tokenByExam = new Map<string, string>();
  for (const e of data.exams) {
    if (e.shareToken) tokenByExam.set(e.id, e.shareToken);
  }
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-zinc-700">
        <Sparkles className="h-4 w-4 text-orange-500" />
        시험지별 분석 인용 ({data.aiNarratives.length}건)
        <span className="text-[11px] font-normal text-zinc-500">
          ✻ 출처 시험지명 명시
        </span>
      </div>
      {data.aiNarratives.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 py-6 text-center text-sm text-zinc-500">
          시험지별 분석 완료 데이터 없음
        </div>
      ) : (
        <div className="max-h-[28rem] space-y-2.5 overflow-y-auto pr-1">
          {data.aiNarratives.map((n) => (
            <details
              key={n.examId}
              className="rounded-lg border border-orange-100 bg-orange-50/30 p-3.5 text-[14px] open:bg-orange-50/60"
            >
              <summary className="cursor-pointer text-[14.5px]">
                <span className="font-bold text-zinc-800">{n.school}</span>
                <span className="ml-1.5 text-zinc-500">
                  {n.year} · {n.examTitle.slice(0, 30)}
                </span>
                <span className="ml-1.5 text-[11px] text-orange-600">✻</span>
              </summary>
              {n.summary && (
                <div className="mt-2.5">
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-orange-600">요약</div>
                  <p className="leading-[1.75] text-zinc-700">{n.summary}</p>
                </div>
              )}
              {n.hardQuestions.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1.5 text-[11px] uppercase tracking-wider text-orange-600">
                    고난도 문항
                  </div>
                  <ul className="space-y-2">
                    {n.hardQuestions.map((h) => (
                      <li
                        key={h.problemId}
                        className="border-l-2 border-orange-300 pl-2.5 text-zinc-700"
                      >
                        <span className="font-bold text-orange-700">#{h.number}</span>
                        <span className="ml-1.5 font-semibold">{h.subTitle}</span>
                        <div className="mt-1 text-[13px] leading-relaxed text-zinc-600">{h.intent}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {tokenByExam.has(n.examId) && (
                <div className="mt-3 border-t border-orange-200 pt-2.5">
                  <a
                    href={`/share/exam/${tokenByExam.get(n.examId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-orange-600"
                  >
                    이 시험지 상세 분석 보기 →
                  </a>
                  <span className="ml-2 text-[11.5px] text-zinc-500">
                    수식·풀이 단계·학습 전략까지
                  </span>
                </div>
              )}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function ExamTable({ data }: { data: AggregateResponse }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-orange-100">
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="border-b border-orange-200 bg-orange-50/50 text-[11.5px] uppercase tracking-wider text-zinc-600">
            <th className="px-3 py-2.5 text-left">제목</th>
            <th className="px-3 py-2.5 text-left">학교</th>
            <th className="px-3 py-2.5 text-left">메타</th>
            <th className="px-3 py-2.5 text-right">문항</th>
            <th className="px-3 py-2.5 text-left">난이도</th>
            <th className="px-3 py-2.5 text-center">상세</th>
          </tr>
        </thead>
        <tbody>
          {data.exams.map((e) => {
            const band = bandFor(e.avgDifficulty);
            const cls = band ? BAND_COLOR[band] : null;
            return (
              <tr key={e.id} className="border-b border-orange-50">
                <td className="max-w-md truncate px-3 py-2.5 text-zinc-800" title={e.title}>
                  {e.title}
                </td>
                <td className="px-3 py-2.5 font-semibold text-zinc-700">{e.school}</td>
                <td className="px-3 py-2.5 text-zinc-500">
                  {[e.year, e.semester ? `${e.semester}학기` : '', e.examType]
                    .filter(Boolean)
                    .join(' · ')}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-700">{e.problemCount}</td>
                <td className="px-3 py-2.5">
                  {cls ? (
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className="font-bold tabular-nums text-zinc-900">
                        {(e.avgDifficulty || 0).toFixed(2)}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${cls.bg} ${cls.text}`}>
                        {band}
                      </span>
                    </span>
                  ) : (
                    <span className="text-zinc-400">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {e.hasAnalysis && e.shareToken ? (
                    <a
                      href={`/share/exam/${e.shareToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-[12px] font-bold text-orange-700 hover:bg-orange-100"
                    >
                      상세 보기 →
                    </a>
                  ) : e.hasAnalysis ? (
                    <span className="text-[12px] text-zinc-400">분석 완료</span>
                  ) : (
                    <span className="text-zinc-300">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function compareToGroupKo(schoolAvg: number, groupAvg: number): string {
  const diff = schoolAvg - groupAvg;
  const abs = Math.abs(diff);
  if (abs < 0.3) return '평균과 거의 동일';
  const sign = diff > 0 ? '+' : '−';
  if (abs < 1) return `${sign}${abs.toFixed(1)} 약간 ${diff > 0 ? '높음' : '낮음'}`;
  if (abs < 2) return `${sign}${abs.toFixed(1)} 한 밴드 차이`;
  return `${sign}${abs.toFixed(1)} 두 밴드 이상 ${diff > 0 ? '높음' : '낮음'}`;
}
