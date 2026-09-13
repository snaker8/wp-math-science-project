'use client';

// ============================================================================
// 오답 소스 — 학생이 틀린 것을 근거로 시험지를 만든다 (설계서 S4)
// ----------------------------------------------------------------------------
// 취약 보충이 「약한 유형에서 새 문제」라면, 여기는 「틀린 그 문제」가 출발점이다.
//   그대로  = 다시 풀려 확인한다 (넘어갔는지 본다)
//   유사    = 같은 유형의 새 문제 (답을 외운 게 아닌지 본다)
//
// ★ 취약 보충과 흐름을 맞춘다 — 결과가 나오면 전부 담긴 상태로 시작하고, 교사는 뺀다.
// ★ AI 안 쓴다. 채점 기록만 본다 (비용 0).
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Undo2, Users, AlertTriangle, RefreshCw, Copy } from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import type { WrongSourceRow, WrongSourceGroup, WrongSourceMode } from '@/app/api/exams/wrong-source/route';

interface StudentOption {
  id: string;
  name: string;
  grade?: string | null;
}

const BAND_CLS: Record<string, string> = {
  '개념': 'border-sky-500/40 text-sky-300',
  '기본': 'border-emerald-500/40 text-emerald-300',
  '실력': 'border-amber-500/40 text-amber-300',
  '심화': 'border-orange-500/40 text-orange-300',
  '고난도': 'border-rose-500/40 text-rose-300',
};

const MODES: Array<{ id: WrongSourceMode; label: string; hint: string }> = [
  { id: 'original', label: '틀린 문제 그대로', hint: '그 문제를 다시 풀린다 — 넘어갔는지 확인' },
  { id: 'similar', label: '같은 유형 새 문제', hint: '답을 외운 게 아닌지 본다 (이미 푼 문제는 뺍니다)' },
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
const today = () => new Date().toISOString().slice(0, 10);

export type { WrongSourceRow };

export function WrongSourcePanel({
  pickedIds, onTogglePick, onAddMany,
}: {
  pickedIds: Set<string>;
  onTogglePick: (p: WrongSourceRow) => void;
  onAddMany: (rows: WrongSourceRow[]) => void;
}) {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const [mode, setMode] = useState<WrongSourceMode>('original');
  // ★ 기본은 **전체 기간**이다. 채점은 학기 단위로 몰려서, 최근 4주로 열면 보통 빈 화면이 된다
  //   (실측 2026-09: 마지막 채점 6/28 — 4주 기본이었으면 「기록 없음」만 보였다).
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [perWrong, setPerWrong] = useState(1);

  const [groups, setGroups] = useState<WrongSourceGroup[] | null>(null);
  const [unclassified, setUnclassified] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStudentsLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/users/students', { cache: 'no-store' });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
        if (!cancelled) setStudents((d.students || []) as StudentOption[]);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setStudentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => (s.name || '').toLowerCase().includes(q));
  }, [students, query]);

  const runSearch = async () => {
    if (selected.size === 0) return;
    setLoading(true); setErr(null); setNotice(null); setGroups(null);
    try {
      const res = await fetch('/api/exams/wrong-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentIds: Array.from(selected),
          ...(from ? { from } : {}), ...(to ? { to } : {}),
          mode, perWrong,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      const gs = (d.groups || []) as WrongSourceGroup[];
      setGroups(gs);
      setUnclassified(Number(d.unclassified) || 0);
      if (d.message) setNotice(d.message as string);
      onAddMany(gs.flatMap((g) => g.problems));   // 전부 담고 시작 — 교사는 빼기만
    } catch (e) {
      setErr(e instanceof Error ? e.message : '오답 찾기 실패');
    } finally {
      setLoading(false);
    }
  };

  const totalProblems = groups?.reduce((s, g) => s + g.problems.length, 0) ?? 0;
  const pickedHere = groups
    ? groups.flatMap((g) => g.problems).filter((p) => pickedIds.has(p.id)).length
    : 0;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── 좌: 학생 + 조건 ── */}
      <aside className="w-[260px] flex-shrink-0 overflow-y-auto border-r border-subtle bg-surface-sunken/40 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-content-tertiary">학생 선택</h3>
        <p className="mt-1 text-[10px] text-zinc-500">채점 기록이 있는 학생만 결과가 나옵니다</p>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 검색"
          className="mt-3 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-content-primary placeholder-zinc-500 focus:border-white/25 focus:outline-none"
        />

        <div className="mt-2 flex items-center justify-between text-[10px] text-content-tertiary">
          <span className="tabular-nums">{selected.size} / {students.length}명 선택</span>
          <button
            type="button"
            onClick={() => setSelected(selected.size === visible.length
              ? new Set()
              : new Set(visible.map((s) => s.id)))}
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-content-secondary hover:bg-white/10"
          >
            {selected.size === visible.length && visible.length > 0 ? '전체 해제' : '전체 선택'}
          </button>
        </div>

        <div className="mt-2 max-h-[240px] space-y-0.5 overflow-y-auto">
          {studentsLoading ? (
            <div className="py-4 text-center text-[11px] text-zinc-500">불러오는 중…</div>
          ) : visible.length === 0 ? (
            <div className="py-4 text-center text-[11px] text-zinc-500">학생이 없습니다</div>
          ) : visible.map((s) => {
            const on = selected.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                  return next;
                })}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                  on ? 'bg-white/10 text-content-primary' : 'text-content-secondary hover:bg-white/5'
                }`}
              >
                <span className={`h-3 w-3 flex-shrink-0 rounded-sm border ${on ? 'border-white bg-white' : 'border-zinc-600'}`} />
                <span className="truncate">{s.name}</span>
                {s.grade && <span className="ml-auto text-[10px] text-zinc-500">{s.grade}</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-4 space-y-3 border-t border-subtle pt-3">
          {/* 무엇을 뽑나 */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">무엇을 뽑나</div>
            <div className="mt-1 space-y-1">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors ${
                    mode === m.id ? 'border-white bg-white/10' : 'border-zinc-700 hover:bg-white/5'
                  }`}
                >
                  <div className={`text-[11px] font-semibold ${mode === m.id ? 'text-content-primary' : 'text-content-secondary'}`}>
                    {m.label}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-snug text-zinc-500">{m.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">채점 기간</span>
              {!from && !to && <span className="text-[10px] text-zinc-500">전체</span>}
            </div>
            <div className="mt-1 flex items-center gap-1">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-content-primary focus:border-white/25 focus:outline-none" />
              <span className="text-[10px] text-zinc-500">~</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-content-primary focus:border-white/25 focus:outline-none" />
            </div>
            <div className="mt-1 flex gap-1">
              {([[28, '4주'], [90, '3개월'], [365, '1년']] as Array<[number, string]>).map(([d, label]) => (
                <button key={label} type="button"
                  onClick={() => { setFrom(daysAgo(d)); setTo(today()); }}
                  className="rounded px-1.5 py-0.5 text-[10px] text-content-tertiary hover:bg-white/10">
                  {label}
                </button>
              ))}
              <button type="button" onClick={() => { setFrom(''); setTo(''); }}
                className={`rounded px-1.5 py-0.5 text-[10px] hover:bg-white/10 ${!from && !to ? 'font-semibold text-content-primary' : 'text-content-tertiary'}`}>
                전체
              </button>
            </div>
          </div>

          {mode === 'similar' && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">오답 하나당 새 문제</div>
              <div className="mt-1 flex gap-1">
                {[1, 2, 3].map((n) => (
                  <button key={n} type="button" onClick={() => setPerWrong(n)}
                    className={`flex-1 rounded-md border py-1 text-[11px] font-semibold transition-colors ${
                      perWrong === n ? 'border-white bg-white text-black' : 'border-zinc-700 text-content-secondary hover:bg-white/5'
                    }`}>
                    {n}개
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={selected.size === 0 || loading}
            onClick={runSearch}
            className="flex w-full items-center justify-center gap-1.5 rounded-full bg-white py-2 text-xs font-semibold text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
            {loading ? '찾는 중…' : '오답 찾기'}
          </button>
          {selected.size === 0 && (
            <p className="text-center text-[10px] text-zinc-500">학생을 1명 이상 선택해주세요</p>
          )}
        </div>
      </aside>

      {/* ── 우: 결과 ── */}
      <div className="flex-1 overflow-y-auto p-5">
        {err && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-content-primary">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-400" />
            <span>{err}</span>
          </div>
        )}

        {groups === null && !loading && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Undo2 className="mb-3 h-8 w-8 text-zinc-700" />
            <p className="text-sm text-content-secondary">학생과 기간을 정하고 <span className="font-semibold text-content-primary">오답 찾기</span></p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">
              채점 기록에서 아직 못 넘어간 문제를 모읍니다. 마지막에 맞힌 문제는 빼고 셉니다.
              담긴 것 중 필요 없는 건 빼시면 됩니다.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex h-full items-center justify-center text-xs text-content-tertiary">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 오답을 모으는 중…
          </div>
        )}

        {groups !== null && !loading && groups.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Users className="mb-3 h-8 w-8 text-zinc-700" />
            <p className="text-sm text-content-secondary">뽑을 오답이 없습니다</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">
              {notice || '기간을 넓히거나, 채점을 먼저 진행해 주세요.'}
            </p>
          </div>
        )}

        {groups !== null && groups.length > 0 && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-content-secondary">
                유형 <span className="font-bold text-content-primary tabular-nums">{groups.length}</span>
                <span className="mx-2 text-zinc-600">·</span>
                담긴 문제 <span className="font-bold text-content-primary tabular-nums">{pickedHere}</span> / {totalProblems}
                {unclassified > 0 && (
                  <>
                    <span className="mx-2 text-zinc-600">·</span>
                    <span className="text-zinc-500">유형 없는 오답 {unclassified}개는 {mode === 'similar' ? '유사를 못 찾습니다' : '미분류로 묶였습니다'}</span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => onAddMany(groups.flatMap((g) => g.problems))}
                className="flex items-center gap-1 rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] text-content-secondary hover:bg-white/5"
              >
                <RefreshCw className="h-3 w-3" /> 전부 다시 담기
              </button>
            </div>

            <div className="space-y-4">
              {groups.map((g) => (
                <section key={g.code} className="rounded-xl border border-subtle bg-surface-card/40 p-3">
                  <header className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-content-secondary">
                      {mode === 'similar' ? '유사' : '오답'} {g.problems.length}
                    </span>
                    <span className="text-xs font-semibold text-content-primary">{g.name}</span>
                  </header>

                  <div className="grid gap-2 md:grid-cols-2">
                    {g.problems.map((p) => {
                      const on = pickedIds.has(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onTogglePick(p)}
                          title={on ? '빼기' : '담기'}
                          className={`rounded-lg border p-2.5 text-left transition-colors ${
                            on ? 'border-white/30 bg-white/[0.06]' : 'border-subtle bg-surface-sunken/40 opacity-60 hover:opacity-100'
                          }`}
                        >
                          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                            <span className={`h-3 w-3 flex-shrink-0 rounded-sm border ${on ? 'border-white bg-white' : 'border-zinc-600'}`} />
                            {p.bandLabel ? (
                              <span className={`rounded border px-1 py-0.5 text-[9px] font-bold tabular-nums ${BAND_CLS[p.bandLabel] ?? 'border-zinc-700 text-zinc-400'}`}>
                                {p.bandLabel} {p.difficulty}
                              </span>
                            ) : (
                              <span className="rounded border border-zinc-700 px-1 py-0.5 text-[9px] text-zinc-500">난이도 미분류</span>
                            )}
                            {mode === 'similar' && p.basedOnDifficulty != null && (
                              <span className="flex items-center gap-0.5 text-[9px] text-zinc-500">
                                <Copy className="h-2.5 w-2.5" /> 오답 난이도 {p.basedOnDifficulty}
                              </span>
                            )}
                            {p.source && <span className="truncate text-[9px] text-zinc-500">{p.source}</span>}
                          </div>
                          <div className="max-h-28 overflow-hidden text-[11px] leading-relaxed text-content-secondary">
                            <MixedContentRenderer content={p.content} />
                          </div>
                          {p.missedBy.length > 0 && (
                            <div className="mt-1.5 flex items-center gap-1 text-[9px] text-content-tertiary">
                              <Users className="h-2.5 w-2.5" />
                              {mode === 'similar' ? '근거 오답: ' : ''}
                              {p.missedBy.slice(0, 3).join(', ')}
                              {p.missedBy.length > 3 && ` 외 ${p.missedBy.length - 3}명`}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
