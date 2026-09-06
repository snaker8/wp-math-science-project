'use client';

// ============================================================================
// 반 허브 「일일학습」 탭 — 주간 캘린더 (매쓰홀릭 /course/{id}/daily-stats 실측, 07 문서)
// ----------------------------------------------------------------------------
// 행 = 학생(이름 밑에 주간 달성 61/70 (87%)) · 열 = 월~일(토 파랑 · 일 빨강 · 오늘 강조) ·
// 셀 = 그날 학습을 「색 + 한 글자 + N/M ✓」 칩으로 쌓는다. 학생 체크 → 선택한 학생에게 취약/오답 과제.
// 「이 학생이 이번 주 뭘 했나」가 한 화면에 — 편중(동영상만·특정 요일만)이 바로 보인다.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Loader2, Sparkles, RotateCcw, CalendarDays } from 'lucide-react';
import type { DailyRow, DailyKind } from '@/app/api/classes/[classId]/daily/route';
import { GenerateAssignmentModal, type GenKind } from './GenerateAssignmentModal';

const KIND_CLASS: Record<DailyKind, string> = {
  course: 'bg-sky-500/20 text-sky-200 border-sky-400/30',
  wrong_similar: 'bg-amber-500/20 text-amber-200 border-amber-400/30',
  assignment: 'bg-violet-500/20 text-violet-200 border-violet-400/30',
  diagnostic: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
  exam: 'bg-white/10 text-content-secondary border-white/15',
};
const KIND_LABEL: Record<DailyKind, string> = { course: '회차 학습', wrong_similar: '오답유사', assignment: '과제', diagnostic: '진단', exam: '시험지' };
const DOW = ['월', '화', '수', '목', '금', '토', '일'];

function todayKST(): string {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}
function shiftWeek(ymd: string, weeks: number): string {
  const d = new Date(`${ymd}T00:00:00+09:00`);
  d.setDate(d.getDate() + weeks * 7);
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function md(ymd: string): string { const [, m, d] = ymd.split('-'); return `${Number(m)}/${Number(d)}`; }

export function DailyTab({ classId }: { classId: string }) {
  const [week, setWeek] = useState<string>(() => todayKST());
  const [data, setData] = useState<{ week: string[]; rows: DailyRow[]; goal: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [gen, setGen] = useState<GenKind | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/daily?week=${week}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }, [classId, week]);
  useEffect(() => { void load(); }, [load]);

  const today = todayKST();
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const allSel = rows.length > 0 && rows.every((r) => sel.has(r.studentId));
  const toggleAll = () => setSel(allSel ? new Set() : new Set(rows.map((r) => r.studentId)));
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const totals = useMemo(() => {
    const graded = rows.reduce((n, r) => n + r.weekGraded, 0);
    const active = rows.filter((r) => r.activeDays > 0).length;
    const perDay = Array.from({ length: 7 }, (_, i) => rows.reduce((n, r) => n + r.days[i].length, 0));
    return { graded, active, perDay };
  }, [rows]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 text-content-secondary"><CalendarDays className="h-4 w-4" /> 주간</span>
        <button onClick={() => setWeek((w) => shiftWeek(w, -1))} className="rounded-md border border-white/10 p-1 text-content-tertiary hover:text-content-primary"><ChevronLeft className="h-4 w-4" /></button>
        <span className="tabular-nums text-content-primary">{data ? `${data.week[0].slice(0, 4)}년 ${md(data.week[0])} ~ ${md(data.week[6])}` : ''}</span>
        <button onClick={() => setWeek((w) => shiftWeek(w, 1))} disabled={week >= today} className="rounded-md border border-white/10 p-1 text-content-tertiary hover:text-content-primary disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        <button onClick={() => setWeek(today)} className="rounded-md border border-white/10 px-2 py-1 text-xs text-content-secondary hover:text-content-primary">이번 주</button>
        <span className="ml-3 text-xs text-content-tertiary">
          학습한 학생 <b className="tabular-nums text-content-secondary">{totals.active}/{rows.length}</b> · 채점 <b className="tabular-nums text-content-secondary">{totals.graded}</b>문항
          {data?.goal != null && <> · 목표 주당 <b className="tabular-nums text-content-secondary">{data.goal}</b>문항</>}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-content-tertiary">{sel.size > 0 ? `${sel.size}명 선택` : '학생을 골라 과제를 냅니다'}</span>
          <button onClick={() => setGen('weak')} disabled={sel.size === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-content-secondary hover:border-white/20 hover:text-content-primary disabled:opacity-40">
            <Sparkles className="h-3.5 w-3.5" /> 취약 과제
          </button>
          <button onClick={() => setGen('wrong')} disabled={sel.size === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-content-secondary hover:border-white/20 hover:text-content-primary disabled:opacity-40">
            <RotateCcw className="h-3.5 w-3.5" /> 오답 과제
          </button>
        </div>
      </div>

      {/* 범례 */}
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-content-tertiary">
        {(Object.keys(KIND_LABEL) as DailyKind[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className={`inline-block rounded border px-1 leading-4 ${KIND_CLASS[k]}`}>{{ course: '회', wrong_similar: '오', assignment: '과', diagnostic: '진', exam: '시' }[k]}</span>
            {KIND_LABEL[k]}
          </span>
        ))}
        <span className="text-content-muted">칩 = 푼 문항/전체 · ✓ 전부 채점</span>
      </div>

      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
      {loading && !data ? (
        <div className="flex items-center gap-2 py-16 text-sm text-content-tertiary"><Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-content-tertiary">
                <th className="w-40 px-3 py-2 text-left font-medium">
                  <label className="inline-flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" checked={allSel} onChange={toggleAll} className="h-3.5 w-3.5 accent-white" /> 모두선택 ({sel.size})
                  </label>
                </th>
                {(data?.week ?? []).map((d, i) => (
                  <th key={d} className={`px-2 py-2 text-center font-medium ${i === 5 ? 'text-sky-300' : i === 6 ? 'text-red-300' : ''} ${d === today ? 'bg-white/[.06] text-content-primary' : ''}`}>
                    {md(d)} {DOW[i]}
                    <div className="text-[10px] font-normal tabular-nums text-content-muted">{totals.perDay[i] > 0 ? `${totals.perDay[i]}건` : ''}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = r.goal ? Math.round((r.weekGraded * 100) / r.goal) : null;
                return (
                  <tr key={r.studentId} className="border-b border-white/5 last:border-0 align-top hover:bg-white/[.02]">
                    <td className="px-3 py-2">
                      <label className="flex cursor-pointer items-start gap-2">
                        <input type="checkbox" checked={sel.has(r.studentId)} onChange={() => toggle(r.studentId)} className="mt-0.5 h-3.5 w-3.5 accent-white" />
                        <span>
                          <Link href={`/dashboard/class/${classId}/student/${r.studentId}`} className="font-medium text-content-primary hover:underline">{r.name}</Link>
                          <span className={`block tabular-nums ${pct == null ? 'text-content-muted' : pct >= 100 ? 'text-emerald-300' : pct >= 50 ? 'text-content-secondary' : 'text-amber-300'}`}>
                            {r.goal ? `${r.weekGraded}/${r.goal} (${pct}%)` : `${r.weekGraded}문항`}
                            {r.activeDays === 0 && <span className="ml-1 text-content-muted">이번 주 학습 없음</span>}
                          </span>
                        </span>
                      </label>
                    </td>
                    {r.days.map((chips, i) => (
                      <td key={i} className={`px-1.5 py-1.5 ${data?.week[i] === today ? 'bg-white/[.03]' : ''}`}>
                        <div className="flex flex-col gap-1">
                          {chips.map((c) => (
                            <Link key={c.sessionId} href={c.examId ? `/dashboard/cloud/${c.examId}` : '#'}
                              title={`${KIND_LABEL[c.kind]} · ${c.title}\n${c.graded}/${c.total} 채점 · 정답 ${c.correct}`}
                              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 tabular-nums leading-4 ${KIND_CLASS[c.kind]}`}>
                              <b>{c.short}</b> {c.graded} / {c.total}{c.done ? ' ✓' : ''}
                            </Link>
                          ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-content-muted">이 반에 학생이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {gen && (
        <GenerateAssignmentModal
          classId={classId}
          studentIds={Array.from(sel)}
          kind={gen}
          onClose={() => setGen(null)}
          onDone={() => { setGen(null); setSel(new Set()); void load(); }}
        />
      )}
    </div>
  );
}
