'use client';

// ============================================================================
// 취약 보충 — 학생·기간만 정하면 약한 유형을 찾아 문제까지 담아준다
// ----------------------------------------------------------------------------
// 매쓰홀릭 "취약과제 만들기" 대응 (docs/benchmark/matholic/08-type-analysis.md §10-1).
//
// ★ 다른 출처 탭과 흐름이 반대다.
//   다른 탭 = 교사가 찾아서 **담는다** / 여기 = 시스템이 담아주고 교사가 **뺀다**.
//   그래서 결과가 나오면 전부 선택된 상태로 시작한다.
//
// ★ AI 안 쓴다. 이미 채점된 결과만 본다 (비용 0).
//   안 풀어본 유형은 추정하지 않고 "모름"으로 둔다 — 근거 없는 추정은 상담에 못 쓴다.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Target, Users, AlertTriangle, RefreshCw } from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
// ★ 숙달 색은 처방 화면과 같은 토큰을 쓴다 — 같은 뜻에 다른 색이면 사용자가 헷갈린다.
//   (인라인 style 이라 크롬 무채 가드에도 걸리지 않는다)
import { STATUS_COLOR } from '@/app/dashboard/prescription/lib/types';

export interface WeakProblemRow {
  id: string;
  content: string;
  answer: unknown;
  source: string;
  year: string | number;
  typeCode: string;
  typeName: string;
  difficulty: number;
  cognitiveDomain: string;
}

interface WeakGroup {
  code: string;
  name: string;
  status: 'gamma' | 'beta';
  studentNames: string[];
  lastScore: number | null;
  problems: WeakProblemRow[];
}

interface StudentOption {
  id: string;
  name: string;
  grade?: string | null;
  className?: string | null;
}

// ★ 처방 화면의 STATUS_LABEL 은 'γ 불안정' 처럼 그리스 문자를 쓰는데, 여기선 교사가
//   바로 읽을 말이 낫다. 색은 같고 말만 다르게 — 뜻이 어긋나지 않게 매핑을 한 곳에 둔다.
const STATUS_LABEL: Record<string, string> = { gamma: '약점', beta: '불안정' };

/** 최근 N주 전 날짜 (YYYY-MM-DD) */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
const today = () => new Date().toISOString().slice(0, 10);

export function WeakClinicPanel({
  pickedIds,
  onTogglePick,
  onAddMany,
}: {
  pickedIds: Set<string>;
  onTogglePick: (p: WeakProblemRow) => void;
  /** 결과가 나오면 전부 담는다 (교사는 빼기만) */
  onAddMany: (rows: WeakProblemRow[]) => void;
}) {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const [from, setFrom] = useState(daysAgo(28));   // 기본 최근 4주
  const [to, setTo] = useState(today());
  const [perType, setPerType] = useState(1);

  const [groups, setGroups] = useState<WeakGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 학생 목록 — 활성 센터 기준 (서버가 격리 처리)
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
    setLoading(true);
    setErr(null);
    setNotice(null);
    setGroups(null);
    try {
      const res = await fetch('/api/clinic/weak-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: Array.from(selected), from, to, perType }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      const gs = (d.groups || []) as WeakGroup[];
      setGroups(gs);
      if (d.message) setNotice(d.message as string);
      // ★ 전부 담고 시작 — 교사는 빼기만 한다
      onAddMany(gs.flatMap((g) => g.problems));
    } catch (e) {
      setErr(e instanceof Error ? e.message : '취약 탐색 실패');
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
        <p className="mt-1 text-[10px] text-zinc-500">진단·채점 기록이 있는 학생만 결과가 나옵니다</p>

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

        <div className="mt-2 max-h-[280px] space-y-0.5 overflow-y-auto">
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

        {/* 조건 */}
        <div className="mt-4 space-y-3 border-t border-subtle pt-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">분석 기간</div>
            <div className="mt-1 flex items-center gap-1">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-content-primary focus:border-white/25 focus:outline-none" />
              <span className="text-[10px] text-zinc-500">~</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-content-primary focus:border-white/25 focus:outline-none" />
            </div>
            <div className="mt-1 flex gap-1">
              {[[14, '2주'], [28, '4주'], [90, '3개월']].map(([d, label]) => (
                <button key={label as string} type="button"
                  onClick={() => { setFrom(daysAgo(d as number)); setTo(today()); }}
                  className="rounded px-1.5 py-0.5 text-[10px] text-content-tertiary hover:bg-white/10">
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">유형당 문제</div>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3].map((n) => (
                <button key={n} type="button" onClick={() => setPerType(n)}
                  className={`flex-1 rounded-md border py-1 text-[11px] font-semibold transition-colors ${
                    perType === n ? 'border-white bg-white text-black' : 'border-zinc-700 text-content-secondary hover:bg-white/5'
                  }`}>
                  {n}개
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={selected.size === 0 || loading}
            onClick={runSearch}
            className="flex w-full items-center justify-center gap-1.5 rounded-full bg-white py-2 text-xs font-semibold text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
            {loading ? '탐색 중…' : '취약 유형 찾기'}
          </button>
          {selected.size === 0 && (
            <p className="text-center text-[10px] text-zinc-500">학생을 1명 이상 선택해주세요</p>
          )}
        </div>
      </aside>

      {/* ── 우: 결과 ── */}
      <div className="flex-1 overflow-y-auto p-5">
        {err && (
          <div
            className="mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs text-content-primary"
            style={{ borderColor: `${STATUS_COLOR.gamma}4d`, background: `${STATUS_COLOR.gamma}1a` }}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: STATUS_COLOR.gamma }} />
            <span>{err}</span>
          </div>
        )}

        {groups === null && !loading && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Target className="mb-3 h-8 w-8 text-zinc-700" />
            <p className="text-sm text-content-secondary">학생과 기간을 정하고 <span className="font-semibold text-content-primary">취약 유형 찾기</span></p>
            <p className="mt-1 max-w-sm text-xs text-zinc-500">
              채점된 결과에서 약한 유형을 찾아 문제까지 담아드립니다. 담긴 것 중 필요 없는 건 빼시면 됩니다.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex h-full items-center justify-center text-xs text-content-tertiary">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 약한 유형을 찾는 중…
          </div>
        )}

        {groups !== null && !loading && groups.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Users className="mb-3 h-8 w-8 text-zinc-700" />
            <p className="text-sm text-content-secondary">약한 유형이 나오지 않았습니다</p>
            <p className="mt-1 max-w-sm text-xs text-zinc-500">
              {notice || '기간을 넓히거나, 진단·채점을 먼저 진행해 주세요.'}
            </p>
          </div>
        )}

        {groups !== null && groups.length > 0 && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="text-xs text-content-secondary">
                취약유형 <span className="font-bold text-content-primary tabular-nums">{groups.length}</span>
                <span className="mx-2 text-zinc-600">·</span>
                담긴 문제 <span className="font-bold text-content-primary tabular-nums">{pickedHere}</span> / {totalProblems}
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
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ background: `${STATUS_COLOR[g.status]}26`, color: STATUS_COLOR[g.status] }}
                    >
                      {STATUS_LABEL[g.status] || g.status}
                    </span>
                    <span className="text-xs font-semibold text-content-primary">{g.name}</span>
                    {g.lastScore != null && (
                      <span className="text-[10px] text-zinc-500 tabular-nums">최근 {g.lastScore}%</span>
                    )}
                    {g.studentNames.length > 0 && (
                      <span className="ml-auto flex items-center gap-1 text-[10px] text-content-tertiary">
                        <Users className="h-3 w-3" />
                        {g.studentNames.slice(0, 3).join(', ')}
                        {g.studentNames.length > 3 && ` 외 ${g.studentNames.length - 3}명`}
                      </span>
                    )}
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
                          <div className="mb-1.5 flex items-center gap-1.5">
                            <span className={`h-3 w-3 flex-shrink-0 rounded-sm border ${on ? 'border-white bg-white' : 'border-zinc-600'}`} />
                            <span className="rounded bg-white/10 px-1 py-0.5 text-[9px] font-bold text-content-secondary">
                              난이도 {p.difficulty || '-'}
                            </span>
                            {p.source && <span className="truncate text-[9px] text-zinc-500">{p.source}</span>}
                          </div>
                          <div className="max-h-28 overflow-hidden text-[11px] leading-relaxed text-content-secondary">
                            <MixedContentRenderer content={p.content} />
                          </div>
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
