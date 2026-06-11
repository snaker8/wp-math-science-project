'use client';

// ============================================================================
// 학생 개별 시험 리포트 — 다크 통일 뷰 (진단 세트 종합 리포트와 동일 디자인 언어)
//   unified 센터 전용. legacy(동부산 등)는 기존 A4 라이트 유지 — 이 컴포넌트 미사용.
//   순수 표시: 데이터(API 응답)만 받아, 룰베이스 narrative(buildNarrative, AI 비용 0)로
//   서술/처방/액션플랜 생성 + 난이도 1~10·인지영역 4축·세부유형·문항별 상세를 렌더.
//   staffSlot/commentSlot 으로 페이지가 강사 컨트롤(공유·AI재생성·강사코멘트)을 주입.
// ============================================================================

import React, { useMemo } from 'react';
import {
  Target, Layers, ClipboardList, AlertTriangle, CheckCircle2,
  TrendingUp, TrendingDown, Minus, Sparkles, Brain, ListChecks, GraduationCap,
} from 'lucide-react';
import { DIFFICULTY_BANDS, difficultyToBand, difficultyHueClasses } from '@/lib/utils/difficulty-label';
import { gradeIntToLabel } from '@/lib/students/grade-label';
import {
  buildNarrative, unitShortName,
  type DiffStat, type UnitStat, type TypeStat,
} from '@/lib/diagnostics/report-narrative';
import { LEVEL_TONE, Panel, StatCard, Gauge } from '@/components/diagnostics/report-primitives';
import { resolveReportKind, REPORT_KIND_LABEL, readinessLabelFor, narrativeFraming, ACTION_PLAN_TITLE } from '@/lib/report/report-kind';

// ── 입력 타입 (개별 리포트 API 응답의 부분집합) ─────────────────────────────
export interface StudentReportResult {
  qNum: number;
  majorUnit: string;
  minorUnit: string;
  subUnit: string;
  fineUnit: string;
  cognitiveDomain: string;
  type: string;
  difficulty: number;
  fullScore: number;
  earnedScore: number;
  status: 'O' | '△' | 'X';
  isCorrect: boolean;
  concept: string;
  typeCode: string | null;
}
export interface StudentReportFineUnit { name: string; fullPath: string; total: number; correct: number; pct: number; }
export interface StudentReportCognitive { code: string; total: number; correct: number; pct: number; }
export interface StudentReportTrendRow {
  name: string; prevPct: number; currPct: number;
  prevCorrect: number; prevTotal: number; currCorrect: number; currTotal: number; delta: number;
}
export interface StudentReportTrend {
  prevExamTitle: string; prevConductedAt: string | null; units: StudentReportTrendRow[];
}
export interface StudentReportData {
  student: { id: string; name: string; grade: number | null; classLabel: string | null };
  exam: { id: string; title: string };
  examType?: string | null;
  isDiagnostic?: boolean;
  scorePct: number;
  totalEarned: number;
  totalPossible: number;
  results: StudentReportResult[];
  fineUnitStats?: StudentReportFineUnit[];
  cognitiveDomainStats?: StudentReportCognitive[];
  classPercentile?: number | null;
  classRank?: number | null;
  classSize?: number;
  classAvg?: number | null;
  unitTrend?: StudentReportTrend | null;
}

const COG_LABEL: Record<string, string> = {
  CALCULATION: '계산', UNDERSTANDING: '이해', INFERENCE: '추론', PROBLEM_SOLVING: '문제해결',
};
const COG_ORDER = ['CALCULATION', 'UNDERSTANDING', 'INFERENCE', 'PROBLEM_SOLVING'];
const COG_BAR: Record<string, string> = {
  CALCULATION: 'bg-sky-500', UNDERSTANDING: 'bg-emerald-500', INFERENCE: 'bg-violet-500', PROBLEM_SOLVING: 'bg-orange-500',
};
const COG_TEXT: Record<string, string> = {
  CALCULATION: 'text-sky-300', UNDERSTANDING: 'text-emerald-300', INFERENCE: 'text-violet-300', PROBLEM_SOLVING: 'text-orange-300',
};

// ── results → buildNarrative 입력 변환 (룰베이스, 비용 0) ────────────────────
function adaptNarrativeInput(data: StudentReportData) {
  const results = data.results;

  // byDifficulty — 1~10 전 구간(0 포함)으로 풀스케일 히스토그램
  const diffAgg = new Map<number, { total: number; correct: number }>();
  for (let d = 1; d <= 10; d++) diffAgg.set(d, { total: 0, correct: 0 });
  for (const r of results) {
    const d = Math.min(10, Math.max(1, Math.round(r.difficulty || 0)));
    if (d < 1) continue;
    const a = diffAgg.get(d)!;
    a.total++; if (r.earnedScore > 0) a.correct++;
  }
  const byDifficulty: DiffStat[] = Array.from(diffAgg.entries()).map(([difficulty, v]) => ({
    difficulty, total: v.total, correct: v.correct, pct: v.total > 0 ? Math.round((v.correct * 100) / v.total) : null,
  }));

  // byUnit — 대단원 기준
  const unitAgg = new Map<string, { total: number; correct: number }>();
  for (const r of results) {
    const key = r.majorUnit || '미분류';
    const a = unitAgg.get(key) ?? { total: 0, correct: 0 };
    a.total++; if (r.earnedScore > 0) a.correct++; unitAgg.set(key, a);
  }
  const byUnit: UnitStat[] = Array.from(unitAgg.entries()).map(([name, v]) => ({
    code: name, name, total: v.total, correct: v.correct, pct: v.total > 0 ? Math.round((v.correct * 100) / v.total) : 0,
  }));

  // byType — typeCode(없으면 세부유형) 기준, unitCode=대단원
  const typeAgg = new Map<string, { unitCode: string; name: string; total: number; correct: number }>();
  for (const r of results) {
    const key = r.typeCode || r.fineUnit || r.subUnit || `${r.majorUnit}#${r.qNum}`;
    const a = typeAgg.get(key) ?? {
      unitCode: r.majorUnit || '미분류',
      name: r.fineUnit || r.subUnit || r.minorUnit || r.majorUnit || '미분류',
      total: 0, correct: 0,
    };
    a.total++; if (r.earnedScore > 0) a.correct++; typeAgg.set(key, a);
  }
  const byType: TypeStat[] = Array.from(typeAgg.entries()).map(([code, v]) => ({
    code, unitCode: v.unitCode, name: v.name, total: v.total, correct: v.correct,
    pct: v.total > 0 ? Math.round((v.correct * 100) / v.total) : 0,
  }));

  return { studentName: data.student.name, setTitle: data.exam.title, overallPct: data.scorePct, byDifficulty, byUnit, byType };
}

export function StudentExamReportDark({ data, staffSlot, commentSlot }: {
  data: StudentReportData;
  /** 헤더 우측 강사 컨트롤(돌아가기·인쇄·공유·AI재생성) */
  staffSlot?: React.ReactNode;
  /** 하단 AI/강사 코멘트 (페이지가 핸들러와 함께 주입) */
  commentSlot?: React.ReactNode;
}) {
  // 시험지 성격(진단/내신/모의/교재/학습지) — 레버1(라벨)·레버2(신호등)·레버3(프레이밍)·레버4(섹션)
  const kind = resolveReportKind({ isDiagnostic: data.isDiagnostic, examType: data.examType });
  const kindLabel = REPORT_KIND_LABEL[kind];
  const narrative = useMemo(
    () => buildNarrative({ ...adaptNarrativeInput(data), framing: narrativeFraming(kind) }),
    [data, kind],
  );
  const tone = LEVEL_TONE[narrative.readiness.level];
  const readinessLabel = readinessLabelFor(kind, narrative.readiness.level);

  const bandSummary = useMemo(() => {
    const input = adaptNarrativeInput(data);
    return DIFFICULTY_BANDS.map((band) => {
      let t = 0, c = 0;
      for (const d of input.byDifficulty) if (d.difficulty >= band.min && d.difficulty <= band.max) { t += d.total; c += d.correct; }
      return { band, total: t, correct: c, pct: t > 0 ? Math.round((c / t) * 100) : null };
    });
  }, [data]);
  const diffScale = useMemo(() => adaptNarrativeInput(data).byDifficulty, [data]);
  const anyDiff = diffScale.some((d) => d.total > 0);

  const weakCount = narrative.weakUnits.filter((w) => w.level === 'weak').length;
  const total = data.results.length;
  const correct = data.results.filter((r) => r.earnedScore > 0).length;

  const cog = (data.cognitiveDomainStats ?? []).filter((c) => c.total > 0);
  const fine = (data.fineUnitStats ?? []).slice().sort((a, b) => a.pct - b.pct).slice(0, 8);
  const trend = data.unitTrend ?? null;

  const rankSub = data.classRank != null && data.classSize
    ? `${data.classSize}명 중 ${data.classRank}위${data.classPercentile != null ? ` · 상위 ${data.classPercentile}%` : ''}`
    : data.classAvg != null ? `반 평균 ${data.classAvg}%` : '비교 데이터 없음';

  return (
    <div className="space-y-5">
      {/* 레버1 — 학부모용 성격 라벨 ("이 리포트는 무슨 분석인지") */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/70 px-3 py-1 text-xs font-bold text-zinc-200">
          <span className="text-sm leading-none">{kindLabel.emoji}</span>
          {kindLabel.name}<span className="text-zinc-500">·</span><span className="text-zinc-400 font-semibold">{kindLabel.analysis}</span>
        </span>
      </div>

      {/* ① Hero */}
      <div className={`rounded-xl border ${tone.border} bg-gradient-to-br ${
        narrative.readiness.level === 'weak' ? 'from-rose-900/20 via-zinc-900/40 to-zinc-900/40'
        : narrative.readiness.level === 'caution' ? 'from-amber-900/20 via-zinc-900/40 to-zinc-900/40'
        : 'from-emerald-900/20 via-zinc-900/40 to-zinc-900/40'
      } p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
          <div className="mx-auto sm:mx-0 flex-shrink-0"><Gauge pct={data.scorePct} stroke={tone.stroke} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold">{data.student.name}</h2>
              {data.student.grade != null && <span className="text-zinc-400 text-sm">{gradeIntToLabel(String(data.student.grade), '-')}</span>}
              {data.student.classLabel && <span className="text-zinc-500 text-xs">{data.student.classLabel}</span>}
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${tone.bg} border ${tone.border} ${tone.text} text-xs font-bold`}>
                <span className="text-sm leading-none">{narrative.readiness.emoji}</span>{readinessLabel}
              </span>
            </div>
            <p className="text-zinc-400 text-sm mt-0.5">{data.exam.title}</p>
            <p className="text-zinc-200 text-sm leading-relaxed mt-3">{narrative.summary}</p>
          </div>
          {staffSlot && <div className="flex-shrink-0 self-start">{staffSlot}</div>}
        </div>
      </div>

      {/* ② KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="점수" value={`${data.scorePct}%`} sub={`${Math.round(data.totalEarned)}/${Math.round(data.totalPossible)}점`} icon={<Target className="h-3.5 w-3.5" />} accent={tone.text} />
        <StatCard label="반 석차" value={data.classRank != null ? `${data.classRank}위` : '-'} sub={rankSub} icon={<GraduationCap className="h-3.5 w-3.5" />} accent="text-cyan-300" />
        <StatCard label="문항" value={`${correct}/${total}`} sub="정답/총 문항" icon={<ListChecks className="h-3.5 w-3.5" />} />
        <StatCard label="취약 단원" value={`${weakCount}`} sub={`주의 포함 ${narrative.weakUnits.length}곳`} icon={<AlertTriangle className="h-3.5 w-3.5" />} accent={weakCount > 0 ? 'text-rose-300' : 'text-emerald-300'} />
      </div>

      {/* ③ 약한 단원 진단 + 처방 */}
      <Panel title="약한 단원 진단 & 처방" icon={<AlertTriangle className="h-4 w-4 text-rose-400" />} hint="보강 우선">
        {narrative.weakUnits.length === 0 ? (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-200">
            두드러진 취약 단원이 없습니다. 강점을 유지하며 실전 문제로 마무리 점검하세요.
          </div>
        ) : (
          <div className="space-y-3">
            {narrative.weakUnits.map((wp) => {
              const t = LEVEL_TONE[wp.level];
              return (
                <div key={wp.unit.code} className={`rounded-lg border ${t.border} ${t.bg} p-4`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="font-bold text-sm flex items-center gap-2">
                      <span className={t.text}>{unitShortName(wp.unit.name)}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${t.border} ${t.text}`}>{wp.level === 'weak' ? '취약' : '주의'}</span>
                    </div>
                    <div className="text-xs text-zinc-400 tabular-nums">{wp.unit.correct}/{wp.unit.total} · {wp.unit.pct}%</div>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-800 overflow-hidden mb-2">
                    <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${Math.max(3, wp.unit.pct)}%` }} />
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">{wp.prescription}</p>
                </div>
              );
            })}
          </div>
        )}
        {narrative.strongUnits.length > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> 강점 단원</div>
            <div className="flex flex-wrap gap-2">
              {narrative.strongUnits.map((u) => (
                <span key={u.code} className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 tabular-nums">
                  {unitShortName(u.name)} {u.pct}%
                </span>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* ④ 난이도 분석 */}
      <Panel title="난이도 분석" icon={<TrendingUp className="h-4 w-4 text-cyan-400" />} hint="문제별 1~10 분류 기준">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 mb-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5"><Sparkles className="h-3 w-3" /> 시험 시사점</div>
          <p className="text-sm text-zinc-200 leading-relaxed">{narrative.difficultyInsight}</p>
        </div>
        <div className="space-y-2 mb-5">
          {bandSummary.map(({ band, total: t, correct: c, pct }) => {
            const hue = difficultyHueClasses(band.hue);
            const has = t > 0;
            return (
              <div key={band.label} className="flex items-center gap-2 text-[11px] sm:text-xs">
                <div className={`w-16 sm:w-28 shrink-0 text-right font-semibold leading-tight ${has ? hue.text : 'text-zinc-600'}`}>{band.label}</div>
                <div className="flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <div className={`h-2.5 rounded-full ${has ? hue.bar : 'bg-transparent'}`} style={{ width: `${has && pct != null ? Math.max(3, pct) : 0}%` }} />
                </div>
                <div className="w-16 sm:w-20 shrink-0 text-right tabular-nums text-zinc-400">{has ? `${c}/${t}·${pct}%` : '–'}</div>
              </div>
            );
          })}
        </div>
        {anyDiff && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">난이도 1~10 정답률</div>
            <div className="flex items-end gap-1.5 h-24">
              {diffScale.map((d) => {
                const band = difficultyToBand(d.difficulty);
                const hue = band ? difficultyHueClasses(band.hue) : null;
                const has = d.total > 0;
                const h = has && d.pct != null ? Math.max(4, d.pct) : 0;
                return (
                  <div key={d.difficulty} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
                    <div className="w-full flex-1 flex items-end">
                      <div className={`w-full rounded-t ${has && hue ? hue.bar : 'bg-zinc-800'}`} style={{ height: `${h}%` }}
                        title={has ? `난이도 ${d.difficulty} — ${d.correct}/${d.total} (${d.pct}%)` : `난이도 ${d.difficulty} — 없음`} />
                    </div>
                    <div className={`text-[10px] mt-1 tabular-nums ${has && hue ? hue.text : 'text-zinc-600'}`}>{d.difficulty}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Panel>

      {/* ⑤ 인지영역 4축 */}
      {cog.length > 0 && (
        <Panel title="인지영역 분석" icon={<Brain className="h-4 w-4 text-violet-400" />} hint="계산·이해·추론·문제해결">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COG_ORDER.map((code) => {
              const s = cog.find((c) => c.code === code);
              if (!s) return null;
              return (
                <div key={code} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-bold ${COG_TEXT[code] ?? 'text-zinc-300'}`}>{COG_LABEL[code] ?? code}</span>
                    <span className="text-xs text-zinc-400 tabular-nums">{s.correct}/{s.total} · {s.pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div className={`h-full rounded-full ${COG_BAR[code] ?? 'bg-zinc-500'}`} style={{ width: `${Math.max(3, s.pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* ⑥ 세부유형 약점 */}
      {fine.length > 0 && (
        <Panel title="세부유형 정답률" icon={<Layers className="h-4 w-4 text-cyan-400" />} hint="약점 순">
          <div className="space-y-2">
            {fine.map((u) => {
              const bar = u.pct >= 80 ? 'bg-emerald-500' : u.pct >= 60 ? 'bg-amber-500' : 'bg-rose-500';
              const txt = u.pct >= 80 ? 'text-emerald-300' : u.pct >= 60 ? 'text-amber-300' : 'text-rose-300';
              return (
                <div key={u.name} className="flex items-center gap-2 text-[11px] sm:text-xs">
                  <div className="w-24 sm:w-40 shrink-0 truncate text-right text-zinc-300" title={u.fullPath || u.name}>{u.name}</div>
                  <div className="flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <div className={`h-2 rounded-full ${bar}`} style={{ width: `${Math.max(3, u.pct)}%` }} />
                  </div>
                  <div className={`w-16 shrink-0 text-right tabular-nums ${txt}`}>{u.correct}/{u.total}·{u.pct}%</div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* ⑦ 액션플랜 (제목 성격별 — 레버4) */}
      <Panel title={ACTION_PLAN_TITLE[kind]} icon={<ClipboardList className="h-4 w-4 text-indigo-400" />} hint="취약 우선 순서">
        <ol className="space-y-2.5">
          {narrative.actionPlan.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-zinc-200 leading-relaxed">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-bold">{i + 1}</span>
              <span>{step.replace(/^\d+\.\s*/, '')}</span>
            </li>
          ))}
        </ol>
      </Panel>

      {/* ⑧ 시계열 추이 */}
      {trend && trend.units.length > 0 && (
        <Panel title="이전 시험 대비 추이" icon={<TrendingUp className="h-4 w-4 text-emerald-400" />} hint={trend.prevExamTitle}>
          <div className="space-y-2">
            {trend.units.map((u) => {
              const up = u.delta > 0, down = u.delta < 0;
              const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
              const c = up ? 'text-emerald-300' : down ? 'text-rose-300' : 'text-zinc-400';
              return (
                <div key={u.name} className="flex items-center gap-2 text-xs">
                  <div className="w-24 sm:w-40 shrink-0 truncate text-right text-zinc-300" title={u.name}>{unitShortName(u.name)}</div>
                  <div className="flex-1 flex items-center gap-2 tabular-nums text-zinc-400">
                    <span>{u.prevPct}%</span>
                    <span className="text-zinc-600">→</span>
                    <span className="text-zinc-200 font-semibold">{u.currPct}%</span>
                  </div>
                  <div className={`flex items-center gap-1 shrink-0 tabular-nums font-bold ${c}`}>
                    <Icon className="h-3.5 w-3.5" />{up ? '+' : ''}{u.delta}%p
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* ⑨ 문항별 상세 */}
      <Panel title="문항별 상세" icon={<ListChecks className="h-4 w-4 text-zinc-300" />} hint={`총 ${total}문항`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data.results.slice().sort((a, b) => a.qNum - b.qNum).map((r) => {
            const band = r.difficulty ? difficultyToBand(r.difficulty) : null;
            const hue = band ? difficultyHueClasses(band.hue) : null;
            const st = r.status === 'O'
              ? { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' }
              : r.status === '△'
                ? { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30' }
                : { bg: 'bg-rose-500/15', text: 'text-rose-300', border: 'border-rose-500/40' };
            return (
              <div key={r.qNum} className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-300 text-[11px] font-bold tabular-nums">{r.qNum}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-zinc-300" title={r.fineUnit || r.subUnit || r.majorUnit}>{unitShortName(r.majorUnit || '미분류')}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {r.difficulty > 0 && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border tabular-nums ${hue ? `${hue.text} ${hue.border}` : 'text-zinc-400 border-zinc-700'}`}>난이도 {r.difficulty}</span>
                    )}
                    {r.cognitiveDomain && COG_LABEL[r.cognitiveDomain] && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border border-zinc-700 ${COG_TEXT[r.cognitiveDomain] ?? 'text-zinc-400'}`}>{COG_LABEL[r.cognitiveDomain]}</span>
                    )}
                    {r.type && <span className="text-[9px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400">{r.type}</span>}
                  </div>
                </div>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-sm font-bold ${st.bg} ${st.text} ${st.border}`}>
                  {r.status}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      {commentSlot}

      <p className="text-center text-[10px] text-zinc-600 pt-1">과사람 수학 · 개별 성적 리포트</p>
    </div>
  );
}
