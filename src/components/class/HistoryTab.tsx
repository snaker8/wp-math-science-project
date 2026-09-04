'use client';

// ============================================================================
// 반 허브 ▸ 이력 — 주차별 숙달 추이 (매쓰홀릭 「유형이력」 /score-history 대응)
// ----------------------------------------------------------------------------
// docs/PLAN_CLASS_HUB_REBUILD.md 단계 6 · 조사 docs/benchmark/matholic/10 §1 + 스크린샷(2026-09-04).
//
// 매쓰홀릭 화면: [학생 ▾] [2026/08/31 이력 ‹ ›] · 범례 카운트 · 「8월 31일부터 이전 9주간 학습이력」 꺾은선
//   GREEN(마스터+잘함) · RED(불안정+약점+심각) · GRAY(미학습) — GRAY 가 내려가고 GREEN 이 올라가는 게 한 장에 보인다.
//   그 아래 그 시점의 판. 상담에 그대로 쓴다.
// 여기: 같은 구성 + 주차별 학습량·정답률(학습 목표 기준선) + 「이 시점의 판 보기」→ 숙달 탭을 그 날짜로 연다.
//
// ★ 스냅샷 테이블 없이 — 숙달 API 의 문항별 채점 시각으로 매 주를 다시 판정한다 (lib/class/mastery-trend).
// ★ 숙달 탭과 같은 판정 규칙(judgeCell). 두 탭의 숫자가 다르면 그건 버그다.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle, ChevronLeft, ChevronRight, Grid3x3 } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar, ReferenceLine,
} from 'recharts';
import type { MasteryPayload } from '@/app/api/classes/[classId]/mastery/route';
import { subjectOf, LEVEL_LABEL, type CellLevel } from '@/lib/class/mastery-bands';
import { weeklyTrend, type TrendPoint } from '@/lib/class/mastery-trend';
import { weekKeyKST, type LearningGoals } from '@/lib/class/learning-goals';

interface Props {
  classId: string;
  students: Array<{ id: string; name: string }>;
  goals: LearningGoals;
  /** 「이 시점의 판 보기」 — 숙달 탭을 그 날짜(까지)로 연다 */
  onOpenMastery: (toDate: string) => void;
}

const LEVEL_ORDER: CellLevel[] = ['master', 'good', 'shaky', 'weak', 'severe', 'thin', 'none'];
const LEVEL_SWATCH: Record<CellLevel, string> = {
  master: 'bg-emerald-300', good: 'bg-emerald-500', shaky: 'bg-amber-400', weak: 'bg-red-500',
  severe: 'bg-red-800', thin: 'bg-white/25', none: 'bg-white/10',
};
// 차트 색 — 데이터 그래픽. 매쓰홀릭 GREEN/RED/GRAY 와 같은 뜻
const C_GREEN = '#34d399';
const C_RED = '#f87171';
const C_GRAY = '#71717a';
const C_PENDING = '#a1a1aa';
const C_BAR = '#e4e4e7';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function fmtMD(iso: string): string {
  return `${parseInt(iso.slice(5, 7), 10)}/${parseInt(iso.slice(8, 10), 10)}`;
}

export function HistoryTab({ classId, students, goals, onOpenMastery }: Props) {
  const [data, setData] = useState<MasteryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [studentSel, setStudentSel] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<9 | 13 | 26>(9);
  /** 기준일 — 이 날이 속한 주가 마지막 점 */
  const [asOf, setAsOf] = useState<string>(() => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/mastery`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const p = json as MasteryPayload;
      setData(p);
      setSubject((cur) => (cur && p.subjects.some((s) => s.code === cur) ? cur : (p.subjects[0]?.code ?? '')));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [classId]);
  useEffect(() => { void load(); }, [load]);

  const typeCodes = useMemo(() => {
    if (!data || !subject) return [];
    const codes = data.tree.filter((n) => n.depth === 5 && subjectOf(n.code) === subject).map((n) => n.code);
    // depth4 로만 분류된 문제도 판의 칸이다 (숙달 탭과 같은 규칙)
    const extra = new Set<string>();
    for (const s of data.supply) if (subjectOf(s.code) === subject && s.code.split('-').length === 4) extra.add(s.code);
    for (const it of data.items) if (subjectOf(it.code) === subject && it.code.split('-').length === 4) extra.add(it.code);
    return [...codes, ...extra];
  }, [data, subject]);

  const items = useMemo(() => {
    if (!data) return [];
    return data.items
      .filter((it) => subjectOf(it.code) === subject && (!studentSel || it.s === studentSel))
      .map((it) => ({ code: it.code, ok: it.ok, at: it.at }));
  }, [data, subject, studentSel]);

  const points = useMemo<TrendPoint[]>(() => {
    if (typeCodes.length === 0 && items.length === 0) return [];
    // asOf(KST 날짜) 의 정오를 기준 시각으로 — 그 주가 마지막 점
    return weeklyTrend(items, typeCodes, `${asOf}T12:00:00+09:00`, weeks);
  }, [items, typeCodes, asOf, weeks]);

  const last = points[points.length - 1];
  const first = points[0];
  const itemCountByStudent = useMemo(() => {
    const m = new Map<string, number>();
    if (!data) return m;
    for (const it of data.items) if (subjectOf(it.code) === subject) m.set(it.s, (m.get(it.s) ?? 0) + 1);
    return m;
  }, [data, subject]);

  const shiftWeek = (delta: number) => {
    const t = Date.parse(`${asOf}T12:00:00+09:00`) + delta * WEEK_MS;
    setAsOf(new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10));
  };
  const todayKey = weekKeyKST(Date.now());
  const atLatest = weekKeyKST(`${asOf}T12:00:00+09:00`) >= todayKey;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-content-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        채점 기록에서 주차별 추이를 계산하는 중
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4" />
        {error}
      </div>
    );
  }
  if (!data || data.subjects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 px-6 py-14 text-center">
        <p className="text-sm text-content-secondary">아직 이 반의 채점 기록이 없어 추이를 그릴 수 없습니다.</p>
        <p className="mt-1 text-xs text-content-muted">시험지를 QR 로 채점하면 주마다 잘함·약점·미학습이 어떻게 움직였는지 여기에 쌓입니다.</p>
      </div>
    );
  }

  const chartData = points.map((p) => ({
    name: fmtMD(p.week), 잘함: p.green, 약함: p.red, 미학습: p.gray, 보류: p.pending,
    학습량: p.graded, 정답률: p.pct,
  }));
  const tooltipStyle = { background: '#18181b', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, fontSize: 12 };

  return (
    <div className="space-y-4">
      {/* 도구 줄 — 매쓰홀릭: [학생] [날짜 ‹ ›] */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={studentSel ?? ''}
          onChange={(e) => setStudentSel(e.target.value || null)}
          className="rounded-lg border border-white/10 bg-white/[.03] px-2.5 py-1.5 text-sm text-content-primary focus:border-white/20 focus:outline-none"
        >
          <option value="" className="bg-black">반 전체</option>
          {students.map((s) => (
            <option key={s.id} value={s.id} className="bg-black">{s.name}{(itemCountByStudent.get(s.id) ?? 0) === 0 ? ' (기록 없음)' : ''}</option>
          ))}
        </select>
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/[.03] px-2.5 py-1.5 text-sm text-content-primary focus:border-white/20 focus:outline-none"
        >
          {data.subjects.map((s) => <option key={s.code} value={s.code} className="bg-black">{s.name}</option>)}
        </select>

        <span className="inline-flex items-center overflow-hidden rounded-lg border border-white/10">
          <button onClick={() => shiftWeek(-1)} className="px-2 py-1.5 text-content-secondary hover:text-content-primary" title="한 주 전">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <input
            type="date" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)}
            className="bg-transparent px-1 py-1.5 text-sm text-content-primary focus:outline-none"
          />
          <button onClick={() => shiftWeek(1)} disabled={atLatest} className="px-2 py-1.5 text-content-secondary hover:text-content-primary disabled:opacity-30" title="한 주 후">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </span>

        <span className="inline-flex overflow-hidden rounded-lg border border-white/10">
          {([9, 13, 26] as const).map((n) => (
            <button
              key={n}
              onClick={() => setWeeks(n)}
              className={`px-2.5 py-1.5 transition-colors ${weeks === n ? 'bg-white text-black' : 'text-content-secondary hover:text-content-primary'}`}
            >
              {n}주
            </button>
          ))}
        </span>

        <button
          onClick={() => onOpenMastery(last ? last.weekEnd : asOf)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-content-secondary transition-colors hover:border-white/20 hover:text-content-primary"
          title="숙달 탭을 이 주까지의 채점으로 연다"
        >
          <Grid3x3 className="h-3.5 w-3.5" />
          이 시점의 판 보기
        </button>
      </div>

      {/* 범례 카운트 — 기준 주 (매쓰홀릭 ⭐59 🟩176 …) */}
      {last && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-content-tertiary">
          {LEVEL_ORDER.map((lv) => (
            <span key={lv} className="inline-flex items-center gap-1">
              <span className={`inline-block h-2.5 w-2.5 rounded-[2px] ${LEVEL_SWATCH[lv]}`} />
              {LEVEL_LABEL[lv]} <span className="tabular-nums text-content-secondary">{last.counts[lv]}</span>
            </span>
          ))}
          <span className="ml-auto text-content-muted">
            {fmtMD(last.weekEnd)} 기준 · 판 {typeCodes.length}유형 · {first ? `${fmtMD(first.week)}부터 ${weeks}주` : ''}
          </span>
        </div>
      )}

      {/* 추이 — 매쓰홀릭 GREEN/RED/GRAY */}
      <div className="rounded-xl border border-white/10 p-3">
        <p className="mb-2 text-xs text-content-tertiary">
          유형 수 — <span className="text-content-secondary">잘함</span>(마스터+잘함) · <span className="text-content-secondary">약함</span>(불안정+약점+심각) · 미학습 · 판정 보류.
          미학습이 내려가고 잘함이 올라가는 게 한 장에 보여야 한다.
        </p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e4e4e7' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="잘함" stroke={C_GREEN} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="약함" stroke={C_RED} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="미학습" stroke={C_GRAY} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="보류" stroke={C_PENDING} strokeWidth={1} strokeDasharray="4 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 주차별 학습량 · 정답률 — 학습 목표가 있으면 기준선 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 p-3">
          <p className="mb-2 text-xs text-content-tertiary">
            주간 학습량 (채점 문항){goals.weeklyProblems != null && <> · 목표 <span className="text-content-secondary">{goals.weeklyProblems}</span></>}
          </p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e4e4e7' }} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
                {goals.weeklyProblems != null && <ReferenceLine y={goals.weeklyProblems} stroke={C_GREEN} strokeDasharray="4 3" />}
                <Bar dataKey="학습량" fill={C_BAR} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 p-3">
          <p className="mb-2 text-xs text-content-tertiary">
            주간 정답률 (%){goals.accuracy != null && <> · 목표 <span className="text-content-secondary">{goals.accuracy}</span></>}
          </p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#e4e4e7' }} />
                {goals.accuracy != null && <ReferenceLine y={goals.accuracy} stroke={C_GREEN} strokeDasharray="4 3" />}
                <Line type="monotone" dataKey="정답률" stroke={C_BAR} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 주차 표 — 숫자로도 */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-content-tertiary">
              <th className="px-3 py-2 text-left font-medium">주</th>
              <th className="px-3 py-2 text-right font-medium">잘함</th>
              <th className="px-3 py-2 text-right font-medium">약함</th>
              <th className="px-3 py-2 text-right font-medium">보류</th>
              <th className="px-3 py-2 text-right font-medium">미학습</th>
              <th className="px-3 py-2 text-right font-medium">학습량</th>
              <th className="px-3 py-2 text-right font-medium">정답률</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.week} className="border-b border-white/5 last:border-0 tabular-nums">
                <td className="px-3 py-1.5 text-content-secondary">{fmtMD(p.week)} ~ {fmtMD(p.weekEnd)}</td>
                <td className="px-3 py-1.5 text-right text-emerald-400">{p.green}</td>
                <td className="px-3 py-1.5 text-right text-red-400">{p.red}</td>
                <td className="px-3 py-1.5 text-right text-content-tertiary">{p.pending}</td>
                <td className="px-3 py-1.5 text-right text-content-tertiary">{p.gray}</td>
                <td className="px-3 py-1.5 text-right text-content-secondary">{p.graded || <span className="text-content-muted">—</span>}</td>
                <td className="px-3 py-1.5 text-right text-content-secondary">{p.pct == null ? <span className="text-content-muted">—</span> : `${p.pct}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
