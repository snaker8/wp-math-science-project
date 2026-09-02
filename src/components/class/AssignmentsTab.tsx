'use client';

// ============================================================================
// 반 허브 「과제」 탭
// ----------------------------------------------------------------------------
// 과제 = 시험지 + 대상 + 기간. 여기서 보는 건 딱 하나: **누가 아직 안 했나.**
// 그래서 목록의 주인공은 제목이 아니라 「제출 n/N」 이고, 펼치면 이름이 나온다.
//
// 시험지 고르기는 기존 시험지 목록(/api/exams)을 그대로 쓴다 — 출제 라인은 불가침.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Plus, Loader2, ChevronDown, ChevronRight, Trash2, Search, X, ExternalLink,
} from 'lucide-react';

export interface AssignmentStudent {
  id: string;
  name: string;
  status: 'assigned' | 'submitted' | 'graded' | 'excused';
  submitted: boolean;
  correctPct: number | null;
  gradedAt: string | null;
}

export interface Assignment {
  id: string;
  title: string;
  kind: 'unit' | 'wrong' | 'weak' | 'type';
  examId: string | null;
  examTitle: string | null;
  startsAt: string;
  dueAt: string | null;
  note: string | null;
  total: number;
  submitted: number;
  excused: number;
  avgPct: number | null;
  students: AssignmentStudent[];
}

const KIND_LABEL: Record<Assignment['kind'], string> = {
  unit: '단원',
  wrong: '오답',
  weak: '취약',
  type: '유형',
};

function dateLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 마감이 지났는데 안 낸 사람이 있으면 그게 제일 급한 정보다 */
function overdue(a: Assignment): boolean {
  return !!a.dueAt && new Date(a.dueAt).getTime() < Date.now() && a.submitted < a.total - a.excused;
}

export function AssignmentsTab({ classId }: { classId: string }) {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/assignments`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRows((data.assignments || []) as Assignment[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);

  const remove = async (id: string, title: string) => {
    if (!confirm(`과제 「${title}」을 지웁니다.\n채점 기록은 지워지지 않습니다.`)) return;
    const res = await fetch(`/api/classes/${classId}/assignments?id=${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || '삭제 실패');
      return;
    }
    void load();
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-content-tertiary">
          {loading ? ' ' : rows.length === 0 ? '아직 낸 과제가 없습니다.' : `과제 ${rows.length}개`}
        </p>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          과제 내기
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-content-tertiary">
          <Loader2 className="h-4 w-4 animate-spin" />
          불러오는 중
        </div>
      ) : rows.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-white/10 px-6 py-14 text-center">
          <p className="text-sm text-content-secondary">과제를 내면 누가 했고 누가 안 했는지가 여기 모입니다.</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-content-muted">
            시험지는 이미 만들 수 있습니다. 과제는 그 위에 <b>대상</b>과 <b>기간</b>을 씌우는 것뿐입니다.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {rows.map((a) => {
            const expanded = open === a.id;
            const late = overdue(a);
            const pending = a.total - a.excused - a.submitted;
            return (
              <div key={a.id} className="border-b border-white/5 last:border-0">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => setOpen(expanded ? null : a.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {expanded
                      ? <ChevronDown className="h-4 w-4 shrink-0 text-content-tertiary" />
                      : <ChevronRight className="h-4 w-4 shrink-0 text-content-tertiary" />}
                    <span className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-content-tertiary">
                      {KIND_LABEL[a.kind]}
                    </span>
                    <span className="truncate font-medium text-content-primary">{a.title}</span>
                    {a.examTitle && (
                      <span className="hidden truncate text-xs text-content-muted sm:inline">
                        {a.examTitle}
                      </span>
                    )}
                  </button>

                  <div className="flex shrink-0 items-center gap-4 text-sm">
                    <span className="text-xs text-content-tertiary">
                      {dateLabel(a.startsAt)}
                      {a.dueAt && ` ~ ${dateLabel(a.dueAt)}`}
                    </span>
                    <span className={`tabular-nums ${late ? 'text-red-400' : 'text-content-secondary'}`}>
                      제출 {a.submitted}/{a.total - a.excused}
                      {pending > 0 && (
                        <span className={late ? 'ml-1' : 'ml-1 text-content-muted'}>
                          ({pending}명 미제출)
                        </span>
                      )}
                    </span>
                    <span className="w-12 text-right tabular-nums text-content-secondary">
                      {a.avgPct == null ? '—' : `${a.avgPct}%`}
                    </span>
                    <button
                      onClick={() => void remove(a.id, a.title)}
                      className="text-content-muted transition-colors hover:text-red-400"
                      title="과제 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-white/5 bg-white/[.02] px-4 py-3">
                    {a.examId && (
                      <div className="mb-3">
                        <Link
                          href={`/dashboard/cloud/${a.examId}`}
                          className="inline-flex items-center gap-1 text-xs text-content-tertiary transition-colors hover:text-content-primary"
                        >
                          시험지 열기
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
                      {a.students.map((s) => (
                        <div key={s.id} className="flex items-baseline justify-between gap-2 text-sm">
                          <span className={s.submitted ? 'text-content-primary' : 'text-content-muted'}>
                            {s.name}
                            {s.status === 'excused' && (
                              <span className="ml-1 text-[11px] text-content-muted">면제</span>
                            )}
                          </span>
                          <span className="tabular-nums text-xs text-content-tertiary">
                            {s.status === 'excused'
                              ? '—'
                              : s.submitted
                                ? (s.correctPct == null ? '제출' : `${s.correctPct}%`)
                                : '미제출'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <CreateAssignmentModal
          classId={classId}
          onClose={() => setCreating(false)}
          onDone={() => { setCreating(false); void load(); }}
        />
      )}
    </div>
  );
}

// ============================================================================
// 과제 만들기 — 시험지 고르기 + 이름 + 마감
// ============================================================================
interface ExamOption { id: string; title: string; problemCount?: number }

function CreateAssignmentModal({
  classId, onClose, onDone,
}: { classId: string; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [examId, setExamId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadingExams, setLoadingExams] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/exams?limit=300');
        const data = await res.json();
        if (!alive) return;
        setExams(((data.exams || []) as Array<Record<string, unknown>>).map((e) => ({
          id: e.id as string,
          title: (e.title as string) || '(제목 없음)',
          problemCount: typeof e.problemCount === 'number' ? e.problemCount : undefined,
        })));
      } catch {
        /* 시험지를 못 불러와도 과제는 만들 수 있다 (시험지 없이) */
      } finally {
        if (alive) setLoadingExams(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim();
    if (!needle) return exams.slice(0, 40);
    return exams.filter((e) => e.title.includes(needle)).slice(0, 40);
  }, [exams, q]);

  const selected = exams.find((e) => e.id === examId) ?? null;

  const submit = async () => {
    const name = title.trim() || selected?.title || '';
    if (!name) { setErr('과제 이름을 적거나 시험지를 고르세요'); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/classes/${classId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: name,
          kind: 'unit',
          examId,
          // 날짜만 받아 그날 끝(23:59)으로 — "6일까지" 는 6일 밤까지라는 뜻이다
          dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-surface-card">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <h2 className="text-base font-semibold text-content-primary">과제 내기</h2>
          <button onClick={onClose} className="text-content-tertiary hover:text-content-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs text-content-tertiary">시험지</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={loadingExams ? '시험지 불러오는 중…' : '시험지 이름으로 찾기'}
                className="w-full rounded-lg border border-white/10 bg-white/[.03] py-2 pl-9 pr-3 text-sm text-content-primary placeholder:text-content-muted focus:border-white/20 focus:outline-none"
              />
            </div>
            <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-white/10">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-content-muted">
                  {loadingExams ? '불러오는 중' : '찾는 시험지가 없습니다'}
                </p>
              ) : filtered.map((e) => (
                <button
                  key={e.id}
                  onClick={() => { setExamId(e.id === examId ? null : e.id); }}
                  className={`flex w-full items-center justify-between gap-2 border-b border-white/5 px-3 py-2 text-left text-sm last:border-0 transition-colors ${
                    e.id === examId ? 'bg-white/10 text-content-primary' : 'text-content-secondary hover:bg-white/5'
                  }`}
                >
                  <span className="truncate">{e.title}</span>
                  {e.problemCount != null && (
                    <span className="shrink-0 text-xs tabular-nums text-content-muted">{e.problemCount}문항</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-content-tertiary">
                과제 이름 <span className="text-content-muted">(비우면 시험지 이름)</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={selected?.title || '예: 3주차 이차방정식'}
                className="w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-sm text-content-primary placeholder:text-content-muted focus:border-white/20 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-content-tertiary">마감</label>
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-sm text-content-primary focus:border-white/20 focus:outline-none"
              />
            </div>
          </div>

          <p className="text-xs leading-relaxed text-content-muted">
            반에 등록된 학생 전원에게 나갑니다. 제출 여부는 채점 기록에서 자동으로 잡히므로
            따로 표시할 필요가 없습니다.
          </p>

          {err && <p className="text-sm text-red-400">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-content-secondary transition-colors hover:text-content-primary"
          >
            취소
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            내기
          </button>
        </div>
      </div>
    </div>
  );
}
