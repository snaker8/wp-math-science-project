'use client';

// ============================================================================
// 학부모 설명회·공유용 학교 기출 집계 리포트 (공개)
// /share/aggregate?examIds=…  |  ?year=&grade=&semester=&examType=&schools=
//
// ★ 2026-11-07 재설계 — 시험지 상세 리포트(/share/exam/[token])와 같은 토큰(report.css --rp-*)을 써서
//   학원 디자인(크림·네이비·포레스트…)이 두 리포트에 똑같이 입혀진다.
//   - 학교 1곳: "한 문장 + 난이도 궤적" 히어로 → 연도별 시험지 카드(요약·고난도 문항 포함) → 단원 출제 표(연도×단원)
//   - 학교 여러 곳: "한 문장 + 학교별 난이도 막대" → 학교 카드 → 단원 출제 표(학교×단원) → 난이도 분포 → 시험지 목록
//   같은 시험지를 네 번 다르게 보여 주던 중복(막대·카드·접기·표)을 걷어냈다. 섹션 번호는 순서 정보가 아니라 뺐다.
//   모든 수치는 API 집계값. 인용 문장은 출처 시험지로 연결.
// ============================================================================

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Printer, Link2, Check, Loader2, AlertTriangle, Lightbulb, BarChart3, Grid3X3, Layers, ScrollText } from 'lucide-react';
import '../exam/[token]/report.css';
import './aggregate.css';

// ─── 타입 ────────────────────────────────────────────────────────────────
interface SubUnitRow {
  code: string; name: string; problemCount: number; examCount: number; schoolCount: number;
  avgDifficulty: number | null; hardCount: number; bySchool: Record<string, number>; byExam: Record<string, number>;
}
interface UnitRow {
  level1Code: string; level1Name: string; problemCount: number; examCount: number; schoolCount: number;
  avgDifficulty?: number | null; hardCount?: number; children?: SubUnitRow[];
}
type SchoolAction = { kind: 'always' | 'hard' | 'unique'; text: string };
interface ExamRow {
  id: string; title: string; school: string; year: number | null; semester: 1 | 2 | null; examType: string | null;
  problemCount: number; classifiedCount: number; avgDifficulty: number | null; hasAnalysis: boolean; shareToken: string | null;
  createdAt: string; topUnits?: Array<{ level1Name: string; problemCount: number }>;
  unitCounts?: Array<{ level1Name: string; problemCount: number }>;
}
interface AggregateResponse {
  filters: { year: number | null; grade: string | null; semester: 1 | 2 | null; examType: string | null; schools: string[] | null; examIds?: string[] | null };
  matched: { schoolCount: number; examCount: number; analyzedExamCount: number; problemCount: number; classifiedProblemCount: number };
  unitFrequency: UnitRow[];
  difficultyDist: { examBandCounts: Array<{ band: string; hue: string; examCount: number }>; overallAvg: number | null; overallStdDev: number | null; examWithAvgCount: number };
  schoolBreakdown: Array<{ school: string; examCount: number; problemCount: number; classifiedCount?: number; avgDifficulty: number | null; stdDevDifficulty: number | null; topUnits: Array<{ level1Name: string; problemCount: number }>; unitCounts?: Array<{ level1Name: string; problemCount: number }>; actions?: SchoolAction[] }>;
  exams: ExamRow[];
  pitfalls: Array<{ code: string; label: string; category: string | null; problemCount: number; examCount: number }>;
  unitSegmentation: { common: UnitRow[]; unique: UnitRow[] };
  unitTrends: Array<{ level1Code: string; level1Name: string; byYear: Record<string, { problemCount: number; schoolCount: number; examCount: number }> }>;
  availableYears: number[];
  aiNarratives: Array<{ examId: string; examTitle: string; school: string; year: number | null; summary: string | null; hardQuestions: Array<{ problemId: string; number: number; subTitle: string; intent: string }>; generatedAt: string | null }>;
  narrative: Array<{ heading: string; paragraphs: string[] }>;
  brand?: { key: string; name: string; eyebrow: string; footer?: string; showChip: boolean; og: { bgFrom: string; bgTo: string; badgeFrom: string; badgeTo: string; badgeText: string; accent: string; label: string } };
}

// ─── 공통 유틸 ───────────────────────────────────────────────────────────
function bandFor(avg: number | null | undefined): string {
  if (avg == null) return '';
  if (avg <= 2) return '평이';
  if (avg <= 4) return '보통';
  if (avg <= 6) return '난이도 있음';
  if (avg <= 8) return '매우 난이도 있음';
  return '최고난도';
}
/** 난이도 → 색 (report.css 난이도 팔레트와 같은 4단) */
function diffColor(avg: number | null | undefined): string {
  if (avg == null) return 'var(--rp-text-4)';
  if (avg <= 2) return 'var(--rp-diff-low)';
  if (avg <= 4) return 'var(--rp-diff-mid)';
  if (avg <= 6) return 'var(--rp-diff-high)';
  return 'var(--rp-diff-extra)';
}
function examLabel(e: { title: string; year: number | null; semester: 1 | 2 | null; examType: string | null }, withYear = true): string {
  const parts = [withYear && e.year ? `${e.year}년` : null, e.semester ? `${e.semester}학기` : null, e.examType].filter(Boolean);
  return parts.length ? parts.join(' ') : e.title;
}
function fmt2(n: number | null | undefined): string { return n == null ? '-' : n.toFixed(2); }
/** 시험지 1장당 문항 수 — 수집량이 적은 학교가 「단원을 적게 내는 것처럼」 보이던 것을 비율로 바로잡는다 (2026-11-09) */
function perExam(count: number, exams: number): string { return exams > 0 ? (count / exams).toFixed(1) : '-'; }
/** 학교의 「장당」 분모 = 분류된 문항이 있는 시험지 수 (없으면 전체 시험지 수) */
function schoolDen(s: { classifiedCount?: number; examCount: number }): number { return s.classifiedCount || s.examCount; }
/** 받침 유무로 조사 선택 — 마지막 글자가 한글이 아니면 받침 없는 쪽 */
function josa(word: string, withBatchim: string, without: string): string {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return without;
  return (ch - 0xac00) % 28 === 0 ? without : withBatchim;
}
/** AI 문장 속 $…$ 수식 기호를 걷어 학부모가 읽을 수 있는 평문으로 */
function plain(s: string): string {
  return s.replace(/\$([^$]*)\$/g, (_, inner: string) => inner.replace(/\\[a-zA-Z]+\s?/g, '').replace(/[{}]/g, '')).replace(/\s{2,}/g, ' ').trim();
}
function signed(n: number): string { return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`; }
function Delta({ d, threshold = 0.05 }: { d: number | null; threshold?: number }) {
  if (d == null) return null;
  if (Math.abs(d) < threshold) return <span className="ag-delta flat">≈ 비슷</span>;
  return <span className={`ag-delta ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(2)}</span>;
}
function Band({ avg }: { avg: number | null | undefined }) {
  const b = bandFor(avg);
  return b ? <span className="ag-band" data-band={b}>{b}</span> : null;
}

// ─── 진입 ────────────────────────────────────────────────────────────────
export default function ShareAggregateClient() {
  return (
    <Suspense fallback={<div className="report-shell flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--rp-accent)' }} /></div>}>
      <ShareAggregateContent />
    </Suspense>
  );
}

function ShareAggregateContent() {
  const sp = useSearchParams();
  // ★ 문자열로 고정 — 객체 동일성에 의존하면 렌더마다 fetch 가 다시 돌 수 있다
  const query = sp.toString();
  const [data, setData] = useState<AggregateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/reports/aggregate?${query}`, { cache: 'no-store' });
        if (!r.ok) { if (!cancelled) setErr(`HTTP ${r.status}`); return; }
        const d = (await r.json()) as AggregateResponse;
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '로드 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [query]);

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
    return <div className="report-shell flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--rp-accent)' }} /></div>;
  }
  if (err || !data) {
    return (
      <div className="report-shell flex min-h-screen flex-col items-center justify-center gap-3">
        <AlertTriangle className="h-10 w-10" style={{ color: 'var(--rp-accent)' }} />
        <div className="text-sm" style={{ color: 'var(--rp-text-2)' }}>
          {err === 'HTTP 401' ? '이 링크는 열 수 없습니다. 리포트를 보낸 분께 새 링크를 요청해 주세요.' : err || '데이터를 불러올 수 없습니다.'}
        </div>
      </div>
    );
  }

  const m = data.matched;
  const single = m.schoolCount === 1;
  const brand = data.brand;
  const brandLabel = brand?.showChip ? brand.name : 'Math×Sci Bank';
  const schoolName = single ? data.exams[0]?.school ?? '' : '';
  const years = Array.from(new Set(data.exams.map((e) => e.year).filter((y): y is number => y != null))).sort((a, b) => a - b);
  const yearRange = years.length === 0 ? '' : years.length === 1 ? `${years[0]}년` : `${years[0]}~${years[years.length - 1]}년`;
  const semesters = Array.from(new Set(data.exams.map((e) => e.semester).filter(Boolean)));
  const types = Array.from(new Set(data.exams.map((e) => e.examType).filter(Boolean)));
  const kindLabel = [semesters.length === 1 ? `${semesters[0]}학기` : null, types.length === 1 ? (types[0] === '중간' || types[0] === '기말' ? `${types[0]}고사` : types[0]) : null].filter(Boolean).join(' ');
  const filterChips = [
    data.filters.year ? `${data.filters.year}년` : null,
    data.filters.grade,
    data.filters.semester ? `${data.filters.semester}학기` : null,
    data.filters.examType,
    data.filters.schools && data.filters.schools.length > 0 ? `학교 ${m.schoolCount}곳` : null,
  ].filter(Boolean) as string[];
  const narrative = data.narrative.filter((n) => !/깊이까지/.test(n.heading));

  return (
    <div className="report-shell ag-shell" data-brand={brand?.key ?? 'cream-orange'}>
      {/* 액션 바 */}
      <div className="ag-actions print:hidden">
        <div className="ag-actions-inner">
          <button type="button" className="ag-action" onClick={handleCopyLink}>
            {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
            {linkCopied ? '링크 복사됨' : '링크 복사'}
          </button>
          <button type="button" className="ag-action" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            인쇄
          </button>
          <div className="ag-actions-brand">{brandLabel} — 학교 기출 분석</div>
        </div>
      </div>

      <article className="ag-paper">
        {/* 헤더 */}
        <header className="ag-head">
          <div>
            <div className="ag-eyebrow-row">
              <span className="ag-eyebrow">{brand?.showChip ? brand.eyebrow : '학교 기출 분석 리포트'}</span>
              {brand?.showChip && (
                <span className="ag-brandchip" style={{ background: brand.og.badgeFrom, color: brand.og.badgeText }}>{brand.name}</span>
              )}
            </div>
            <h1 className="ag-title">
              {single ? <><span className="accent">{schoolName}</span> 기출 분석</> : <><span className="accent">학교별 시험지</span> 집계 분석</>}
            </h1>
            <div className="ag-sub">
              {single ? (
                <>{kindLabel ? <><b>{kindLabel}</b> · </> : null}{yearRange ? <><b>{yearRange}</b> · </> : null}시험지 {m.examCount}장 · 문항 {m.problemCount}개</>
              ) : (
                <>{filterChips.length ? <><b>{filterChips.join(' · ')}</b> · </> : null}{data.filters.schools?.length ? null : <>학교 {m.schoolCount}곳 · </>}시험지 {m.examCount}장 · 문항 {m.problemCount}개</>
              )}
            </div>
          </div>
          <div className="ag-head-right">
            <div className="k">평균 난이도</div>
            <div className="v">{data.difficultyDist.overallAvg != null ? data.difficultyDist.overallAvg.toFixed(1) : '-'}<small>/ 10</small></div>
            <div className="s"><Band avg={data.difficultyDist.overallAvg} /></div>
          </div>
        </header>

        {/* 히어로 */}
        {single ? <HeroSingle data={data} school={schoolName} /> : <HeroMulti data={data} />}

        {/* 본문 */}
        {single ? <ExamYearCards data={data} /> : <SchoolCards data={data} />}

        <UnitHeat data={data} single={single} />

        {!single && <DifficultyBands data={data} />}

        {narrative.length > 0 && (
          <section className="ag-section">
            <div className="ag-section-head">
              <h2 className="ag-section-title"><Lightbulb className="h-4 w-4" />강사 인사이트</h2>
              <span className="ag-section-desc">숫자를 수업 경험으로 풀어 쓴 해석입니다</span>
            </div>
            <div className="ag-narr">
              {narrative.map((sec, i) => (
                <div key={i}>
                  <h4>{sec.heading}</h4>
                  {sec.paragraphs.map((p, j) => <p key={j}>{p}</p>)}
                </div>
              ))}
            </div>
            <div className="ag-note">※ 모든 수치는 실제 시험지 문항 데이터에서 직접 계산했습니다.</div>
          </section>
        )}

        {data.pitfalls.length > 0 && <Pitfalls data={data} />}

        {!single && <ExamTable data={data} />}

        <footer className="ag-foot">
          {brand?.footer ? <><b>{brand.name}</b> · {brand.footer}</> : <>{brandLabel} · 학교 기출 분석 리포트</>}
        </footer>
      </article>
    </div>
  );
}

// ─── 히어로 (학교 1곳) — 한 문장 + 연도별 난이도 궤적 ────────────────────────
function HeroSingle({ data, school }: { data: AggregateResponse; school: string }) {
  const rows = [...data.exams]
    .filter((e) => e.avgDifficulty != null)
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || (a.semester ?? 0) - (b.semester ?? 0) || a.title.localeCompare(b.title));
  const groupAvg = data.difficultyDist.overallAvg;
  const first = rows[0]; const last = rows[rows.length - 1];
  const span = rows.length >= 2 && first.avgDifficulty != null && last.avgDifficulty != null ? last.avgDifficulty - first.avgDifficulty : null;
  const everyTime = data.unitFrequency.filter((u) => data.exams.length >= 2 && u.examCount === data.exams.length);
  const topUnits = (everyTime.length ? everyTime : data.unitFrequency).slice(0, 2).map((u) => u.level1Name);
  const hardest = rows.length ? [...rows].sort((a, b) => (b.avgDifficulty || 0) - (a.avgDifficulty || 0))[0] : null;

  // 한 문장 — 데이터로 만든 이 리포트의 주장
  const thesis = (() => {
    if (!rows.length) return <>{school} 시험지 {data.exams.length}장을 모았습니다.</>;
    const trend = span == null ? '' : Math.abs(span) < 0.3 ? '비슷한 수준을 유지했고' : span > 0 ? '점점 어려워졌고' : '점점 평이해졌고';
    const kind = kindOf(rows);
    return (
      <>
        {school} {kind}{josa(kind, '은', '는')}{' '}
        {rows.length >= 2 && first.year && last.year
          ? <>{first.year}년 <span className="accent">{fmt2(first.avgDifficulty)}</span> → {last.year}년 <span className="accent">{fmt2(last.avgDifficulty)}</span>, {trend} </>
          : <>평균 <span className="accent">{fmt2(groupAvg)}</span>이고, </>}
        {topUnits.length ? <>해마다 <span className="accent">{topUnits.join('·')}</span>{josa(topUnits[topUnits.length - 1], '이', '가')} 빠지지 않습니다.</> : <>단원 분포는 아래 표에 있습니다.</>}
      </>
    );
  })();

  return (
    <section className="ag-hero">
      <div>
        <p className="ag-thesis">{thesis}</p>
        <div className="ag-kpis">
          <div className="ag-kpi"><div className="n">{groupAvg != null ? groupAvg.toFixed(2) : '-'}</div><div className="l">{rows.length}장 평균 난이도</div></div>
          {span != null && <div className="ag-kpi"><div className="n" style={{ color: span > 0.3 ? '#B4332B' : span < -0.3 ? '#1F6B36' : undefined }}>{signed(span)}</div><div className="l">{first.year}→{last.year} 변화</div></div>}
          {hardest && <div className="ag-kpi"><div className="n">{hardest.year ?? '-'}<small>년</small></div><div className="l">가장 어려웠던 해 · {fmt2(hardest.avgDifficulty)}</div></div>}
          <div className="ag-kpi"><div className="n">{everyTime.length}<small>개</small></div><div className="l">매 시험 나온 단원</div></div>
        </div>
      </div>
      <Trajectory rows={rows} groupAvg={groupAvg} />
    </section>
  );
}

function kindOf(rows: ExamRow[]): string {
  const sems = new Set(rows.map((r) => r.semester).filter(Boolean));
  const types = new Set(rows.map((r) => r.examType).filter(Boolean));
  const s = sems.size === 1 ? `${Array.from(sems)[0]}학기 ` : '';
  const t = types.size === 1 ? (() => { const v = Array.from(types)[0] as string; return v === '중간' || v === '기말' ? `${v}고사` : v; })() : '시험';
  return `${s}${t}`;
}

/** 연도별 난이도 궤적 — 이 리포트의 서명. 점 = 시험지, 색 = 난이도 밴드, 점선 = 전체 평균 */
function Trajectory({ rows, groupAvg }: { rows: ExamRow[]; groupAvg: number | null }) {
  const W = 520, H = 230, PL = 40, PR = 18, PT = 26, PB = 40;
  const n = rows.length;
  if (n === 0) return <div className="ag-empty">난이도를 계산할 수 있는 시험지가 없습니다</div>;
  const vals = rows.map((r) => r.avgDifficulty || 0);
  const lo = Math.max(1, Math.floor(Math.min(...vals, groupAvg ?? 10) - 1));
  const hi = Math.min(10, Math.ceil(Math.max(...vals, groupAvg ?? 1) + 1));
  const x = (i: number) => (n === 1 ? (PL + (W - PL - PR) / 2) : PL + (i * (W - PL - PR)) / (n - 1));
  const y = (v: number) => PT + ((hi - v) / (hi - lo)) * (H - PT - PB);
  const path = rows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(r.avgDifficulty || 0).toFixed(1)}`).join(' ');
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v++) ticks.push(v);
  return (
    <div className="ag-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="연도별 평균 난이도 궤적">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="var(--rp-line-soft)" strokeWidth={1} />
            <text x={PL - 8} y={y(v) + 4} fontSize={10.5} textAnchor="end" fill="var(--rp-text-4)">{v}</text>
          </g>
        ))}
        {groupAvg != null && (
          <g>
            <line x1={PL} x2={W - PR} y1={y(groupAvg)} y2={y(groupAvg)} stroke="var(--rp-text-3)" strokeWidth={1.2} strokeDasharray="4 4" />
            <text x={W - PR} y={y(groupAvg) - 6} fontSize={10.5} textAnchor="end" fill="var(--rp-text-3)">평균 {groupAvg.toFixed(2)}</text>
          </g>
        )}
        {n >= 2 && <path d={path} fill="none" stroke="var(--rp-accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
        {rows.map((r, i) => {
          const cx = x(i), cy = y(r.avgDifficulty || 0);
          return (
            <g key={r.id}>
              <circle cx={cx} cy={cy} r={7} fill={diffColor(r.avgDifficulty)} stroke="var(--rp-paper)" strokeWidth={2.5} />
              <text x={cx} y={cy - 14} fontSize={12.5} fontWeight={700} textAnchor="middle" fill="var(--rp-text)">{fmt2(r.avgDifficulty)}</text>
              <text x={cx} y={H - PB + 18} fontSize={11.5} fontWeight={600} textAnchor="middle" fill="var(--rp-text-2)">{r.year ?? ''}</text>
              <text x={cx} y={H - PB + 32} fontSize={10} textAnchor="middle" fill="var(--rp-text-4)">{examLabel(r, false)}</text>
            </g>
          );
        })}
      </svg>
      <div className="ag-chart-caption">
        <span>세로축 1(평이) ~ 10(최고난도)</span>
        <span>점 색 = 난이도 단계 · 점선 = {n}장 평균</span>
      </div>
    </div>
  );
}

// ─── 히어로 (학교 여러 곳) — 한 문장 + 학교별 난이도 막대 ─────────────────
function HeroMulti({ data }: { data: AggregateResponse }) {
  const groupAvg = data.difficultyDist.overallAvg;
  const sorted = [...data.schoolBreakdown].filter((s) => s.avgDifficulty != null).sort((a, b) => (b.avgDifficulty || 0) - (a.avgDifficulty || 0));
  const hardest = sorted[0]; const easiest = sorted[sorted.length - 1];
  const common = data.unitSegmentation.common.slice(0, 2).map((u) => u.level1Name);
  const thesis = sorted.length === 0
    ? <>학교 {data.matched.schoolCount}곳의 시험지 {data.matched.examCount}장을 모았습니다.</>
    : (
      <>
        학교 {data.matched.schoolCount}곳 가운데 <span className="accent">{hardest.school}</span>{josa(hardest.school, '이', '가')} {fmt2(hardest.avgDifficulty)}로 가장 어렵고 <span className="accent">{easiest.school}</span>{josa(easiest.school, '이', '가')} {fmt2(easiest.avgDifficulty)}로 가장 평이합니다.
        {common.length ? <> <span className="accent">{common.join('·')}</span>는 거의 모든 학교가 냅니다.</> : null}
      </>
    );
  return (
    <section className="ag-hero">
      <div>
        <p className="ag-thesis">{thesis}</p>
        <div className="ag-kpis">
          <div className="ag-kpi"><div className="n">{groupAvg != null ? groupAvg.toFixed(2) : '-'}</div><div className="l">전체 평균 난이도</div></div>
          {hardest && easiest && hardest !== easiest && <div className="ag-kpi"><div className="n">{((hardest.avgDifficulty || 0) - (easiest.avgDifficulty || 0)).toFixed(2)}</div><div className="l">학교 간 최대 차이</div></div>}
          <div className="ag-kpi"><div className="n">{data.unitSegmentation.common.length}<small>개</small></div><div className="l">대부분 학교가 내는 단원</div></div>
        </div>
      </div>
      <div>
        <div className="ag-bars">
          {sorted.slice(0, 10).map((s) => (
            <div key={s.school} className="ag-bar">
              <div className="name" title={s.school}>{s.school}</div>
              <div className="track">
                <div className="fill" style={{ width: `${((s.avgDifficulty || 0) / 10) * 100}%`, background: diffColor(s.avgDifficulty) }} />
                {groupAvg != null && <div className="avg" style={{ left: `${(groupAvg / 10) * 100}%` }} title={`전체 평균 ${groupAvg.toFixed(2)}`} />}
              </div>
              <div className="val">{fmt2(s.avgDifficulty)}</div>
              <div className="tail">{s.examCount}장</div>
            </div>
          ))}
        </div>
        <div className="ag-axis"><span>← 평이 (1)</span><span>┊ 전체 평균</span><span>최고난도 (10) →</span></div>
        {sorted.length > 10 && <div className="ag-note">상위 10곳만 표시 · 나머지는 아래 표에 있습니다</div>}
      </div>
    </section>
  );
}

// ─── 연도별 시험지 카드 (학교 1곳) — 요약·고난도 문항·상세 보기까지 한 장에 ──
function ExamYearCards({ data }: { data: AggregateResponse }) {
  const rows = [...data.exams].sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || (a.semester ?? 0) - (b.semester ?? 0) || a.title.localeCompare(b.title));
  const groupAvg = data.difficultyDist.overallAvg;
  const narr = new Map(data.aiNarratives.map((n) => [n.examId, n]));
  return (
    <section className="ag-section">
      <div className="ag-section-head">
        <h2 className="ag-section-title"><Layers className="h-4 w-4" />연도별 시험지</h2>
        <span className="ag-section-desc">직전 시험 대비 변화와 자주 나온 단원, 분석 요약</span>
      </div>
      <div className="ag-cards">
        {rows.map((e, i) => {
          const prev = i > 0 ? rows[i - 1].avgDifficulty : null;
          const delta = prev != null && e.avgDifficulty != null ? e.avgDifficulty - prev : null;
          const n = narr.get(e.id);
          return (
            <div key={e.id} className="ag-card">
              <div className="ag-card-head">
                <div className="ag-card-year">{examLabel(e)}</div>
                <div className="ag-card-meta">{e.problemCount}문항</div>
              </div>
              <div className="ag-card-num">
                <span className="n">{fmt2(e.avgDifficulty)}</span>
                <Band avg={e.avgDifficulty} />
                <Delta d={delta} />
              </div>
              <div>
                <div className="ag-label">자주 나온 단원</div>
                <div className="ag-units">
                  {(e.topUnits ?? []).map((u) => <span key={u.level1Name} className="ag-unit">{u.level1Name}<b>{u.problemCount}</b></span>)}
                  {(e.topUnits ?? []).length === 0 && <span className="ag-section-desc">단원 데이터 없음</span>}
                </div>
              </div>
              {n?.summary && <p className="ag-summary">{(() => { const s = plain(n.summary); return s.length > 180 ? `${s.slice(0, 180)}…` : s; })()}</p>}
              {n && n.hardQuestions.length > 0 && (
                <div>
                  <div className="ag-label">고난도 문항</div>
                  <ul className="ag-hard" style={{ marginTop: 6 }}>
                    {n.hardQuestions.slice(0, 2).map((h) => <li key={h.problemId}><b>#{h.number}</b>{plain(h.subTitle)}</li>)}
                  </ul>
                </div>
              )}
              <div className="ag-card-foot">
                {e.hasAnalysis && e.shareToken ? (
                  <a className="ag-link" href={`/share/exam/${e.shareToken}`} target="_blank" rel="noopener noreferrer">상세 보기 →</a>
                ) : (
                  <span className="ag-section-desc">{groupAvg != null && e.avgDifficulty != null ? `전체 평균 대비 ${signed(e.avgDifficulty - groupAvg)}` : ''}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── 학교 카드 (학교 여러 곳) ─────────────────────────────────────────────
function SchoolCards({ data }: { data: AggregateResponse }) {
  const groupAvg = data.difficultyDist.overallAvg;
  const sorted = [...data.schoolBreakdown].sort((a, b) => (b.avgDifficulty ?? -1) - (a.avgDifficulty ?? -1));
  const unique = new Set(data.unitSegmentation.unique.map((u) => u.level1Name));
  return (
    <section className="ag-section">
      <div className="ag-section-head">
        <h2 className="ag-section-title"><Layers className="h-4 w-4" />학교별 한눈에 보기</h2>
        <span className="ag-section-desc">★ 표시는 소수 학교만 내는 그 학교 특화 단원</span>
      </div>
      <div className="ag-cards">
        {sorted.map((s) => {
          const diff = groupAvg != null && s.avgDifficulty != null ? s.avgDifficulty - groupAvg : null;
          return (
            <div key={s.school} className="ag-card">
              <div className="ag-card-head">
                <div className="ag-card-year">{s.school}</div>
                <div className="ag-card-meta">{s.examCount}장 · {s.problemCount}문항</div>
              </div>
              <div className="ag-card-num">
                <span className="n">{fmt2(s.avgDifficulty)}</span>
                <Band avg={s.avgDifficulty} />
                <Delta d={diff} />
              </div>
              <div>
                <div className="ag-label">자주 출제 단원 · 시험지 1장당 문항</div>
                <div className="ag-units">
                  {s.topUnits.slice(0, 3).map((u) => <span key={u.level1Name} className="ag-unit" title={`${u.problemCount}문항 / ${schoolDen(s)}장`}>{unique.has(u.level1Name) ? '★ ' : ''}{u.level1Name}<b>{perExam(u.problemCount, schoolDen(s))}</b></span>)}
                  {s.topUnits.length === 0 && <span className="ag-section-desc">단원 데이터 없음</span>}
                </div>
              </div>
              {(s.actions ?? []).length > 0 && (
                <ul className="ag-actions-list">
                  {(s.actions ?? []).map((a) => <li key={a.kind} data-kind={a.kind}>{a.text}</li>)}
                </ul>
              )}
              {s.stdDevDifficulty != null && <div className="ag-section-desc">시험지 간 편차 ±{s.stdDevDifficulty.toFixed(2)}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── 단원 출제 표 — 행 = 단원(누르면 소단원), 열 = 연도(학교 1곳) / 학교(여러 곳) ─────────
// ★ 2026-11-09: 여러 학교일 때 셀은 「시험지 1장당 문항 수」. 수집량이 적은 학교가 단원을 적게 내는 것처럼 보이던 것을 바로잡는다.
//   대단원만 보이면 「이차함수와 이차방정식 85」로 뭉뚱그려져 읽을 게 없다 → 행을 누르면 소단원(중단원 › 소단원)까지 펼친다.
//   난이도 열 = 그 단원 문항 평균 · 7+ 문항 수 — 어느 단원에서 변별이 나는지.
function UnitHeat({ data, single }: { data: AggregateResponse; single: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const units = data.unitFrequency.slice(0, 10);
  if (units.length === 0) {
    return (
      <section className="ag-section">
        <div className="ag-section-head"><h2 className="ag-section-title"><Grid3X3 className="h-4 w-4" />단원 출제 표</h2></div>
        <div className="ag-empty">분류된 문항이 없어 단원 표를 만들 수 없습니다</div>
      </section>
    );
  }
  // 열
  const cols: Array<{ key: string; label: string; sub?: string; den: number }> = single
    ? [...data.exams].sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || (a.semester ?? 0) - (b.semester ?? 0)).map((e) => ({ key: e.id, label: e.year ? `${e.year}` : e.title.slice(0, 8), sub: examLabel(e, false), den: 1 }))
    : [...data.schoolBreakdown].sort((a, b) => b.problemCount - a.problemCount).slice(0, 8).map((s) => ({ key: s.school, label: s.school, sub: `${schoolDen(s)}장`, den: schoolDen(s) }));
  const totalDen = single ? 1 : Math.max(1, data.difficultyDist.examWithAvgCount || data.matched.examCount);
  // 셀 값(원문항 수) — unitCounts(전체)가 있으면 정확한 수, 없으면(옛 응답) topUnits 로만 채우고 나머지는 '·'
  const cell = (unitName: string, col: { key: string }): number | null => {
    const src = single
      ? data.exams.find((x) => x.id === col.key)
      : data.schoolBreakdown.find((x) => x.school === col.key);
    if (!src) return null;
    if (src.unitCounts) return src.unitCounts.find((u) => u.level1Name === unitName)?.problemCount ?? 0;
    const hit = (src.topUnits ?? []).find((u) => u.level1Name === unitName);
    return hit ? hit.problemCount : null;
  };
  const subCell = (su: SubUnitRow, col: { key: string }): number => (single ? su.byExam?.[col.key] : su.bySchool?.[col.key]) ?? 0;
  const show = (v: number | null, den: number): string => (v == null ? '·' : single ? String(v) : (v / den).toFixed(1));
  // 진하기 = 장당 비율 기준 (표 전체 최대 대비)
  const maxRatio = Math.max(0.1, ...units.flatMap((u) => cols.map((c) => { const v = cell(u.level1Name, c); return v ? v / c.den : 0; })));
  const heat = (v: number | null, den: number) => {
    if (!v) return undefined;
    const alpha = 0.12 + 0.55 * Math.min(1, v / den / maxRatio);
    return { background: `color-mix(in srgb, var(--rp-accent) ${Math.round(alpha * 100)}%, var(--rp-paper))` };
  };
  const diffCell = (avg: number | null | undefined, hard: number | undefined) => (
    avg == null ? <span className="zero">·</span> : <><b style={{ color: diffColor(avg) }}>{avg.toFixed(1)}</b>{hard ? <small> · 7+ {hard}</small> : null}</>
  );
  const nCols = cols.length + 3;
  return (
    <section className="ag-section">
      <div className="ag-section-head">
        <h2 className="ag-section-title"><Grid3X3 className="h-4 w-4" />단원 출제 표</h2>
        <span className="ag-section-desc">{single ? '어느 해에 어떤 단원이 몇 문항 나왔는지 · 단원을 누르면 소단원까지' : '어느 학교가 어떤 단원을 시험지 1장당 몇 문항 내는지 · 단원을 누르면 소단원까지'}</span>
      </div>
      <div className="ag-heat-wrap">
        <table className="ag-heat">
          <thead>
            <tr>
              <th>단원</th>
              {cols.map((c) => <th key={c.key}>{c.label}{c.sub ? <><br /><span style={{ fontWeight: 400 }}>{c.sub}</span></> : null}</th>)}
              <th>{single ? '합계' : '전체 장당'}</th>
              <th>난이도</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => {
              const kids = (u.children ?? []).slice(0, 10);
              const isOpen = !!open[u.level1Code];
              return (
                <React.Fragment key={u.level1Code}>
                  <tr className={`parent${kids.length ? ' has-kids' : ''}`} onClick={() => kids.length && setOpen((o) => ({ ...o, [u.level1Code]: !o[u.level1Code] }))} aria-expanded={kids.length ? isOpen : undefined}>
                    <td className="u">
                      <span className="caret">{kids.length ? (isOpen ? '▾' : '▸') : ''}</span>{u.level1Name}
                      <small>{single ? `${u.examCount}/${data.exams.length}회 출제` : `${u.schoolCount}/${data.matched.schoolCount}곳 출제`}{kids.length ? ` · 소단원 ${u.children!.length}` : ''}</small>
                    </td>
                    {cols.map((c) => {
                      const v = cell(u.level1Name, c);
                      return (
                        <td key={c.key}>
                          <span className={`cell${!v ? ' zero' : ''}`} style={heat(v, c.den)} title={v != null && !single ? `${v}문항 / ${c.den}장` : undefined}>{show(v, c.den)}</span>
                        </td>
                      );
                    })}
                    <td className="t" title={single ? undefined : `${u.problemCount}문항 / ${totalDen}장`}>{show(u.problemCount, totalDen)}</td>
                    <td className="d">{diffCell(u.avgDifficulty, u.hardCount)}</td>
                  </tr>
                  {isOpen && kids.map((su) => (
                    <tr key={su.code} className="sub">
                      <td className="u">{su.name}<small>{single ? `${su.examCount}/${data.exams.length}회` : `${su.schoolCount}/${data.matched.schoolCount}곳`}</small></td>
                      {cols.map((c) => {
                        const v = subCell(su, c);
                        return (
                          <td key={c.key}>
                            <span className={`cell${!v ? ' zero' : ''}`} style={heat(v, c.den)} title={!single ? `${v}문항 / ${c.den}장` : undefined}>{show(v, c.den)}</span>
                          </td>
                        );
                      })}
                      <td className="t">{show(su.problemCount, totalDen)}</td>
                      <td className="d">{diffCell(su.avgDifficulty, su.hardCount)}</td>
                    </tr>
                  ))}
                  {isOpen && (u.children?.length ?? 0) > kids.length && (
                    <tr className="sub more"><td className="u" colSpan={nCols}><small>소단원 {u.children!.length - kids.length}개 더 있음 (문항 수 적은 순으로 생략)</small></td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="ag-heat-legend">
        {!single && <span>숫자 = 시험지 1장당 평균 문항 수 (원문항 수는 셀에 마우스를 올리면)</span>}
        <span>진할수록 많이 출제</span>
        <span>· = 자료 없음</span>
        <span>난이도 = 그 단원 문항 평균(1~10), 7+ = 변별 문항 수</span>
        {units.length < data.unitFrequency.length && <span>상위 {units.length}개 단원만 표시</span>}
      </div>
    </section>
  );
}

// ─── 난이도 분포 (학교 여러 곳) ──────────────────────────────────────────
function DifficultyBands({ data }: { data: AggregateResponse }) {
  const dd = data.difficultyDist;
  const total = dd.examWithAvgCount;
  const colorOf: Record<string, string> = { '평이': 'var(--rp-diff-low)', '보통': 'var(--rp-diff-mid)', '난이도 있음': 'var(--rp-diff-high)', '매우 난이도 있음': 'var(--rp-diff-extra)', '최고난도': '#9F4F4A' };
  return (
    <section className="ag-section">
      <div className="ag-section-head">
        <h2 className="ag-section-title"><BarChart3 className="h-4 w-4" />시험지 난이도 분포</h2>
        <span className="ag-section-desc">시험지 {total}장을 평균 난이도 단계별로 나눴습니다</span>
      </div>
      <div className="ag-bars">
        {dd.examBandCounts.map((b) => {
          const pct = total > 0 ? (b.examCount / total) * 100 : 0;
          return (
            <div key={b.band} className="ag-bar">
              <div className="name">{b.band}</div>
              <div className="track"><div className="fill" style={{ width: `${pct}%`, background: colorOf[b.band] ?? 'var(--rp-accent)' }} /></div>
              <div className="val">{b.examCount}장</div>
              <div className="tail">{pct.toFixed(0)}%</div>
            </div>
          );
        })}
      </div>
      <div className="ag-note">1~2 평이(교과서 기본) · 3~4 보통 · 5~6 난이도 있음(내신 평균) · 7~8 매우 난이도 있음(상위권 변별) · 9~10 최고난도</div>
    </section>
  );
}

// ─── 함정 ────────────────────────────────────────────────────────────────
function Pitfalls({ data }: { data: AggregateResponse }) {
  return (
    <section className="ag-section">
      <div className="ag-section-head">
        <h2 className="ag-section-title"><AlertTriangle className="h-4 w-4" />자주 걸리는 함정</h2>
        <span className="ag-section-desc">학생들이 같은 방식으로 틀리기 쉬운 지점</span>
      </div>
      <ul className="ag-pits">
        {data.pitfalls.slice(0, 6).map((p) => (
          <li key={p.code} className="ag-pit">
            <div><div className="l">{p.label}</div>{p.category && <div className="c">{p.category}</div>}</div>
            <div className="n">{p.problemCount}문항<small>{p.examCount}/{data.matched.examCount}장</small></div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── 시험지 목록 (학교 여러 곳) ──────────────────────────────────────────
function ExamTable({ data }: { data: AggregateResponse }) {
  const rows = [...data.exams].sort((a, b) => a.school.localeCompare(b.school) || (b.year ?? 0) - (a.year ?? 0));
  return (
    <section className="ag-section">
      <div className="ag-section-head">
        <h2 className="ag-section-title"><ScrollText className="h-4 w-4" />시험지 목록</h2>
        <span className="ag-section-desc">{rows.length}장 · 분석 완료 시험지는 상세 보기로 들어갈 수 있습니다</span>
      </div>
      <div className="ag-table-wrap">
        <table className="ag-table">
          <thead><tr><th>학교</th><th>시험</th><th>제목</th><th style={{ textAlign: 'right' }}>문항</th><th>난이도</th><th></th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td style={{ fontWeight: 600, color: 'var(--rp-text)' }}>{e.school}</td>
                <td>{examLabel(e)}</td>
                <td className="title" title={e.title}>{e.title}</td>
                <td className="num">{e.problemCount}</td>
                <td><span style={{ fontWeight: 700, color: 'var(--rp-text)', marginRight: 6 }}>{fmt2(e.avgDifficulty)}</span><Band avg={e.avgDifficulty} /></td>
                <td>{e.hasAnalysis && e.shareToken ? <a className="ag-link ghost" href={`/share/exam/${e.shareToken}`} target="_blank" rel="noopener noreferrer">상세 보기 →</a> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
