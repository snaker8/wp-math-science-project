'use client';

// ============================================================================
// 진단평가 세트(A/B/C) 종합 리포트 — 표시 컴포넌트 (스태프 + 학부모 공용)
//   "학교별 시험지 분석" 디자인 언어(다크 zinc · 그라데이션 · Panel/StatCard ·
//    커스텀 그라데이션 바 · cyan/indigo 액센트).
//   데이터 fetch/선택은 호출 페이지가 담당, 여기는 순수 표시.
// ============================================================================

import React, { useMemo } from 'react';
import {
  Layers, TrendingUp, AlertTriangle, CheckCircle2, ClipboardList,
  ChevronDown, Target, Pin, Sparkles,
} from 'lucide-react';
import { DIFFICULTY_BANDS, difficultyToBand, difficultyHueClasses } from '@/lib/utils/difficulty-label';
import { gradeIntToLabel } from '@/lib/students/grade-label';
import { buildNarrative, unitShortName, type Achievement } from '@/lib/diagnostics/report-narrative';
import type { ComprehensiveReportPayload, VariantResult } from '@/lib/diagnostics/compute-report';

export type { ComprehensiveReportPayload } from '@/lib/diagnostics/compute-report';

const LEVEL_TONE: Record<Achievement, { text: string; bar: string; bg: string; border: string; stroke: string; emoji: string }> = {
  strong:  { text: 'text-emerald-300', bar: 'bg-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', stroke: '#10b981', emoji: '🟢' },
  caution: { text: 'text-amber-300',   bar: 'bg-amber-500',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   stroke: '#f59e0b', emoji: '🟡' },
  weak:    { text: 'text-rose-300',    bar: 'bg-rose-500',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    stroke: '#f43f5e', emoji: '🔴' },
};
const VARIANT_LABEL = (v: 'A' | 'B' | 'C' | null) => (v ? `${v}형` : '기타');

function Panel({ title, icon, hint, children, className = '' }: {
  title: string; icon?: React.ReactNode; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 ${className}`}>
      <div className="mb-4 flex items-baseline gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-white">{icon}{title}</div>
        {hint && <span className="text-[10px] text-zinc-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, icon, accent = 'text-white' }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; accent?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">{icon}{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${accent}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

function Gauge({ pct, stroke }: { pct: number | null; stroke: string }) {
  const r = 52, c = 2 * Math.PI * r, val = Math.max(0, Math.min(100, pct ?? 0));
  const dash = (val / 100) * c;
  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28 flex-shrink-0">
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(39 39 42)" strokeWidth="10" />
      <circle cx="60" cy="60" r={r} fill="none" stroke={stroke} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`} transform="rotate(-90 60 60)" />
      <text x="60" y="60" textAnchor="middle" className="fill-white" style={{ fontSize: 24, fontWeight: 700 }}>
        {pct != null ? `${Math.round(pct)}` : '-'}
      </text>
      <text x="60" y="78" textAnchor="middle" className="fill-zinc-500" style={{ fontSize: 10 }}>정답률 %</text>
    </svg>
  );
}

export function ComprehensiveReportView({ report, actionSlot }: { report: ComprehensiveReportPayload; actionSlot?: React.ReactNode }) {
  const { student, set, overall, variants, byDifficulty, byUnit, byType } = report;
  const partial = set.gradedVariantCount < set.variantCount;

  const narrative = useMemo(() => buildNarrative({
    studentName: student.name, setTitle: set.setTitle, overallPct: overall.pct, byDifficulty, byUnit, byType,
  }), [student.name, set.setTitle, overall.pct, byDifficulty, byUnit, byType]);

  const tone = LEVEL_TONE[narrative.readiness.level];

  const bandSummary = useMemo(() => DIFFICULTY_BANDS.map((band) => {
    let t = 0, c = 0;
    for (const d of byDifficulty) if (d.difficulty >= band.min && d.difficulty <= band.max) { t += d.total; c += d.correct; }
    return { band, total: t, correct: c, pct: t > 0 ? Math.round((c / t) * 100) : null };
  }), [byDifficulty]);

  const diffWithData = byDifficulty.filter((d) => d.difficulty <= 10);
  const anyDiff = diffWithData.some((d) => d.total > 0);
  const weakCount = narrative.weakUnits.filter((w) => w.level === 'weak').length;

  return (
    <div className="space-y-5">
      {actionSlot}

      {/* ① Hero */}
      <div className={`rounded-xl border ${tone.border} bg-gradient-to-br ${
        narrative.readiness.level === 'weak' ? 'from-rose-900/20 via-zinc-900/40 to-zinc-900/40'
        : narrative.readiness.level === 'caution' ? 'from-amber-900/20 via-zinc-900/40 to-zinc-900/40'
        : 'from-emerald-900/20 via-zinc-900/40 to-zinc-900/40'
      } p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
          <div className="mx-auto sm:mx-0 flex-shrink-0"><Gauge pct={overall.pct} stroke={tone.stroke} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold">{student.name}</h2>
              {student.grade != null && <span className="text-zinc-400 text-sm">{gradeIntToLabel(String(student.grade), '-')}</span>}
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${tone.bg} border ${tone.border} ${tone.text} text-xs font-bold`}>
                <span className="text-sm leading-none">{narrative.readiness.emoji}</span>{narrative.readiness.label}
              </span>
            </div>
            <p className="text-zinc-400 text-sm mt-0.5">{set.setTitle}</p>
            <p className="text-zinc-200 text-sm leading-relaxed mt-3">{narrative.summary}</p>
            {partial && <p className="text-[11px] text-zinc-500 mt-2">※ 아직 채점되지 않은 변형이 있어, 추가 채점 시 분석에 자동 반영됩니다.</p>}
          </div>
        </div>
      </div>

      {/* ② KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="합산 정답률" value={overall.pct != null ? `${overall.pct}%` : '-'} sub={`${overall.correct}/${overall.total} 문항`} icon={<Target className="h-3.5 w-3.5" />} accent={tone.text} />
        <StatCard label="채점 변형" value={`${set.gradedVariantCount}/${set.variantCount}`} sub="A·B·C 중" icon={<Layers className="h-3.5 w-3.5" />} accent="text-cyan-300" />
        <StatCard label="총 문항" value={`${overall.total}`} sub="합산 문항 수" icon={<ClipboardList className="h-3.5 w-3.5" />} />
        <StatCard label="취약 단원" value={`${weakCount}`} sub={`주의 포함 ${narrative.weakUnits.length}곳`} icon={<AlertTriangle className="h-3.5 w-3.5" />} accent={weakCount > 0 ? 'text-rose-300' : 'text-emerald-300'} />
      </div>

      {/* ③ 약한 단원 진단 + 처방 */}
      <Panel title="약한 단원 진단 & 처방" icon={<AlertTriangle className="h-4 w-4 text-rose-400" />} hint="시험 대비 보강 우선">
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
          {bandSummary.map(({ band, total, correct, pct }) => {
            const hue = difficultyHueClasses(band.hue);
            const has = total > 0;
            return (
              <div key={band.label} className="flex items-center gap-2 text-[11px] sm:text-xs">
                <div className={`w-16 sm:w-28 shrink-0 text-right font-semibold leading-tight ${has ? hue.text : 'text-zinc-600'}`}>{band.label}</div>
                <div className="flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <div className={`h-2.5 rounded-full ${has ? hue.bar : 'bg-transparent'}`} style={{ width: `${has && pct != null ? Math.max(3, pct) : 0}%` }} />
                </div>
                <div className="w-16 sm:w-20 shrink-0 text-right tabular-nums text-zinc-400">{has ? `${correct}/${total}·${pct}%` : '–'}</div>
              </div>
            );
          })}
        </div>
        {anyDiff && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">난이도 1~10 정답률</div>
            <div className="flex items-end gap-1.5 h-24">
              {diffWithData.map((d) => {
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

      {/* ⑤ 액션플랜 */}
      <Panel title="시험 대비 액션플랜" icon={<ClipboardList className="h-4 w-4 text-indigo-400" />} hint="취약 우선 순서">
        <ol className="space-y-2.5">
          {narrative.actionPlan.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-zinc-200 leading-relaxed">
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 text-[11px] font-bold">{i + 1}</span>
              <span>{step.replace(/^\d+\.\s*/, '')}</span>
            </li>
          ))}
        </ol>
      </Panel>

      {/* ⑥ 시험지별 세부 진단 */}
      <Panel title="시험지별 세부 진단 (A·B·C)" icon={<Layers className="h-4 w-4 text-cyan-400" />} hint="시험지 제목을 누르면 접을 수 있어요">
        <div className="space-y-2.5">
          {variants.map((v) => <VariantDetail key={v.examId} v={v} />)}
        </div>
      </Panel>

      <p className="text-center text-[10px] text-zinc-600 pt-1">과사람 수학 · 진단평가 종합 리포트</p>
    </div>
  );
}

function VariantDetail({ v }: { v: VariantResult }) {
  if (!v.graded) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-4 py-3">
        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-zinc-800/60 text-zinc-400 border border-zinc-700">{VARIANT_LABEL(v.variant)}</span>
        <span className="text-sm text-zinc-500 truncate flex-1" title={v.title}>{v.title}</span>
        <span className="text-[11px] text-zinc-500 flex-shrink-0">미채점</span>
      </div>
    );
  }
  return (
    <details open className="group rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-3 hover:bg-zinc-900/70">
        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex-shrink-0">{VARIANT_LABEL(v.variant)}</span>
        <span className="text-sm text-zinc-300 truncate flex-1" title={v.title}>{v.title}</span>
        <span className="text-sm font-bold text-white flex-shrink-0 tabular-nums">{v.pct != null ? `${v.pct}%` : '-'} <span className="text-[10px] text-zinc-500 font-normal">({v.correct}/{v.total})</span></span>
        <ChevronDown size={16} className="text-zinc-500 transition-transform group-open:rotate-180 flex-shrink-0" />
      </summary>
      <div className="px-4 pb-4 pt-1 space-y-4 border-t border-zinc-800 bg-zinc-950/40">
        {v.byUnit.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 mt-3">단원별 정답률</div>
            <div className="space-y-2">
              {v.byUnit.map((u) => {
                const bar = u.pct >= 80 ? 'bg-emerald-500' : u.pct >= 60 ? 'bg-amber-500' : 'bg-rose-500';
                return (
                  <div key={u.code} className="flex items-center gap-2 text-[11px]">
                    <div className="w-20 sm:w-32 shrink-0 truncate text-zinc-300 text-right" title={u.name}>{unitShortName(u.name)}</div>
                    <div className="flex-1 overflow-hidden rounded-full bg-zinc-800">
                      <div className={`h-2 rounded-full ${bar}`} style={{ width: `${Math.max(3, u.pct)}%` }} />
                    </div>
                    <div className="w-14 sm:w-16 shrink-0 text-right tabular-nums text-zinc-400">{u.correct}/{u.total}·{u.pct}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {v.items.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">문항별 채점 <span className="normal-case text-zinc-600">(칸에 마우스 올리면 유형)</span></div>
            <div className="flex flex-wrap gap-1.5">
              {v.items.map((it) => {
                const band = it.difficulty != null ? difficultyToBand(it.difficulty) : null;
                const typeShort = it.typeName ? unitShortName(it.typeName) : null;
                return (
                  <div key={it.seq}
                    className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold border tabular-nums ${
                      it.isCorrect ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                    title={`${it.seq}번 — ${it.isCorrect ? '정답' : '오답'}${band ? ` · 난이도 ${it.difficulty} (${band.label})` : ''}${typeShort ? `\n${typeShort}` : ''}`}>
                    {it.seq}
                  </div>
                );
              })}
            </div>
            {v.items.some((it) => !it.isCorrect && it.typeName) && (
              <div className="mt-3 pt-3 border-t border-zinc-800">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-rose-300/90 mb-1.5"><Pin className="h-3 w-3" /> 오답 문항 유형</div>
                <ul className="space-y-1">
                  {v.items.filter((it) => !it.isCorrect && it.typeName).map((it) => (
                    <li key={it.seq} className="text-[11px] text-zinc-300 flex gap-2">
                      <span className="text-rose-400 font-bold flex-shrink-0 tabular-nums">{it.seq}번</span>
                      <span className="truncate" title={it.typeName || ''}>{unitShortName(it.typeName || '')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
