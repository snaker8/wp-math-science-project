'use client';

// ============================================================================
// 반 허브 「과제」 탭 상단 — 코스(회차 묶음)
// ----------------------------------------------------------------------------
// 매쓰홀릭 학습 탭: 수업(교재) 아래 회차 카드 — 회차·소단원·문항·평균점수·전원/일부/미제출.
// docs/PLAN_COURSE_LAYER.md §3.  회차 = 소단원 × 난이도 계단. 내기 전엔 계획, 낸 뒤엔 과제.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronDown, ChevronRight, Loader2, Plus, Send, Trash2, X, ExternalLink } from 'lucide-react';
import type { CourseRow, CourseStepRow } from '@/app/api/classes/[classId]/courses/route';
import { BAND_SCHEMES } from '@/lib/class/mastery-bands';

const BAND_LABEL: Record<string, string> = Object.fromEntries(
  [...BAND_SCHEMES[4], ...BAND_SCHEMES[6]].map((b) => [b.key, b.label])
);

function planText(plan: Record<string, number>): string {
  return Object.entries(plan)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${BAND_LABEL[k] ?? k} ${n}`)
    .join(' · ');
}

function dateLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function CoursePanel({
  classId, studentCount, onIssued,
}: { classId: string; studentCount: number; onIssued: () => void }) {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/courses`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const rows = (data.courses || []) as CourseRow[];
      setCourses(rows);
      setOpen((prev) => prev ?? rows[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);

  const issue = async (course: CourseRow, body: { stepIds?: string[]; next?: number }) => {
    const key = `${course.id}:${body.stepIds?.join(',') ?? `next${body.next}`}`;
    setBusy(key);
    setNotice(null);
    try {
      const res = await fetch(`/api/classes/${classId}/courses/${course.id}/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const results = (data.results || []) as Array<{ label: string; unitName: string; problems: number; error?: string; short: Record<string, number> }>;
      const failed = results.filter((r) => r.error);
      const shortOnes = results.filter((r) => !r.error && Object.keys(r.short || {}).length > 0);
      const parts = [`${data.issued}회차 냈습니다`];
      if (shortOnes.length > 0) parts.push(`${shortOnes.length}회차는 문제은행이 모자라 계획보다 적게 나갔습니다`);
      if (failed.length > 0) parts.push(`${failed.length}회차 실패: ${failed.map((f) => `${f.unitName} ${f.label} (${f.error})`).join(', ')}`);
      setNotice(parts.join(' · '));
      await load();
      onIssued();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const wrongSimilar = async (course: CourseRow, stepId: string) => {
    setBusy(`${course.id}:ws:${stepId}`);
    setNotice(null);
    try {
      const res = await fetch(`/api/classes/${classId}/courses/${course.id}/wrong-similar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stepId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const rs = (data.results || []) as Array<{ name: string; wrong: number; problems: number; skipped?: string; error?: string; assignmentId?: string }>;
      const made = rs.filter((r) => r.assignmentId);
      const parts = [`오답유사 학습 ${made.length}명 만들었습니다`];
      if (made.length > 0) parts.push(made.map((r) => `${r.name} 오답 ${r.wrong} → ${r.problems}문항`).join(', '));
      const failed = rs.filter((r) => r.error);
      if (failed.length > 0) parts.push(`실패: ${failed.map((r) => `${r.name}(${r.error})`).join(', ')}`);
      setNotice(parts.join(' · '));
      await load();
      onIssued();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (course: CourseRow) => {
    if (!confirm(`코스 「${course.title}」를 지웁니다.\n이미 낸 회차의 과제·채점은 그대로 남습니다.`)) return;
    const res = await fetch(`/api/classes/${classId}/courses/${course.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || '삭제 실패');
      return;
    }
    void load();
  };

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-content-secondary">
          <BookOpen className="h-3.5 w-3.5" />
          코스
          <span className="text-xs text-content-muted">소단원마다 난이도 계단으로 회차를 쌓아 순서대로 냅니다</span>
        </h3>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-content-secondary transition-colors hover:border-white/20 hover:text-content-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          코스 만들기
        </button>
      </div>

      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
      {notice && (
        <p className="mb-2 rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-xs text-content-secondary">{notice}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-content-tertiary">
          <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-5 py-6 text-sm text-content-muted">
          코스가 없습니다. 과정과 범위를 고르면 문제은행 공급에 맞춰 회차가 자동으로 잡힙니다. 진행도는 회차로 셉니다.
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map((c) => {
            const expanded = open === c.id;
            const nextStep = c.steps.find((s) => !s.assignmentId);
            const remaining = c.steps.length - c.issued;
            return (
              <div key={c.id} className="overflow-hidden rounded-xl border border-white/10">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => setOpen(expanded ? null : c.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    {expanded
                      ? <ChevronDown className="h-4 w-4 shrink-0 text-content-tertiary" />
                      : <ChevronRight className="h-4 w-4 shrink-0 text-content-tertiary" />}
                    <span className="truncate font-medium text-content-primary">{c.title}</span>
                    <span className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-content-tertiary">{c.subjectName}</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-4 text-sm">
                    <span className="tabular-nums text-content-secondary" title="낸 회차 / 전체 회차">
                      회차 {c.issued}/{c.steps.length}
                    </span>
                    <span className="inline-flex items-center gap-2" title="반 평균 진행도 (완료 회차 / 전체 회차)">
                      <span className="block h-1 w-20 overflow-hidden rounded-full bg-white/10">
                        <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${c.avgProgressPct ?? 0}%` }} />
                      </span>
                      <span className="w-9 text-right tabular-nums text-content-secondary">{c.avgProgressPct == null ? '—' : `${c.avgProgressPct}%`}</span>
                    </span>
                    <button
                      onClick={() => void issue(c, { next: 1 })}
                      disabled={!nextStep || studentCount === 0 || busy != null}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
                      title={nextStep ? `${nextStep.unitName} ${nextStep.label}` : '다 냈습니다'}
                    >
                      {busy === `${c.id}:next1` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      다음 회차 내기
                    </button>
                    <button
                      onClick={() => {
                        const n = Math.min(remaining, 5);
                        if (n <= 0) return;
                        if (!confirm(`안 낸 회차 중 앞에서 ${n}회차를 한 번에 냅니다. 회차마다 시험지와 과제가 하나씩 생깁니다.`)) return;
                        void issue(c, { next: n });
                      }}
                      disabled={remaining <= 0 || studentCount === 0 || busy != null}
                      className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-content-secondary transition-colors hover:border-white/20 hover:text-content-primary disabled:opacity-40"
                    >
                      5회차 일괄
                    </button>
                    <button onClick={() => void remove(c)} className="text-content-muted transition-colors hover:text-red-400" title="코스 삭제">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-white/5 bg-white/[.02]">
                    {/* 학생별 진행도 */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-white/5 px-4 py-2 text-xs">
                      {c.progress.map((p) => (
                        <span key={p.studentId} className="text-content-tertiary">
                          {p.name} <span className="tabular-nums text-content-secondary">{p.done}/{c.steps.length}</span>
                        </span>
                      ))}
                    </div>
                    <StepTable course={c} busy={busy} onIssue={(ids) => void issue(c, { stepIds: ids })} onWrongSimilar={(id) => void wrongSimilar(c, id)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <CreateCourseModal
          classId={classId}
          onClose={() => setCreating(false)}
          onDone={() => { setCreating(false); void load(); }}
        />
      )}
    </section>
  );
}

// ============================================================================
// 회차 표 — 매쓰홀릭 학습 탭 카드의 정보(회차·소단원·문항·평균·제출)를 표로
// ============================================================================
function StepTable({ course, busy, onIssue, onWrongSimilar }: { course: CourseRow; busy: string | null; onIssue: (ids: string[]) => void; onWrongSimilar: (stepId: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const firstPending = course.steps.findIndex((s) => !s.assignmentId);
  // 기본은 낸 회차 + 다음 8회차만 — 300회차를 다 펼치면 못 읽는다
  const visible = useMemo(() => {
    if (showAll) return course.steps;
    const cut = (firstPending < 0 ? course.steps.length : firstPending) + 8;
    return course.steps.slice(0, cut);
  }, [course.steps, showAll, firstPending]);
  const students = course.progress.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-content-tertiary">
            <th className="px-4 py-2 text-left font-medium">#</th>
            <th className="px-2 py-2 text-left font-medium">소단원</th>
            <th className="px-2 py-2 text-left font-medium">회차</th>
            <th className="px-2 py-2 text-left font-medium">계단</th>
            <th className="px-2 py-2 text-right font-medium">문항</th>
            <th className="px-2 py-2 text-right font-medium">제출</th>
            <th className="px-2 py-2 text-right font-medium">평균</th>
            <th className="px-2 py-2 text-right font-medium" title="오답유사 학습 — 틀린 문제와 같은 유형의 새 문제, 학생마다">오답유사</th>
            <th className="px-2 py-2 text-right font-medium">기간</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {visible.map((s: CourseStepRow) => {
            const issued = !!s.assignmentId;
            const all = issued && s.submitted >= students && students > 0;
            return (
              <tr key={s.id} className={`border-b border-white/5 last:border-0 ${issued ? '' : 'text-content-tertiary'}`}>
                <td className="px-4 py-1.5 tabular-nums text-content-muted">{s.seq}</td>
                <td className="px-2 py-1.5 text-content-primary">{s.unitName}</td>
                <td className="px-2 py-1.5">{s.label}<span className="ml-1 text-content-muted">{s.rungLabel}</span></td>
                <td className="px-2 py-1.5 text-content-secondary">
                  {planText(s.levelPlan)}
                  {s.short && <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] text-amber-300" title="문제은행이 모자라 계획보다 적게 잡힌 회차">부족</span>}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{s.total}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {issued
                    ? <span className={all ? 'text-emerald-300' : s.submitted > 0 ? 'text-content-secondary' : 'text-content-muted'}>
                        {all ? '전원' : s.submitted === 0 ? '미제출' : `${s.submitted}/${students}`}
                      </span>
                    : <span className="text-content-muted">계획</span>}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{s.avgPct == null ? '—' : `${s.avgPct}%`}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {!issued ? '' : s.wrongSimilar.eligible === 0 ? <span className="text-content-muted">—</span> : (
                    <span className="inline-flex items-center gap-1.5">
                      <span className={s.wrongSimilar.made >= s.wrongSimilar.eligible ? 'text-emerald-300' : 'text-content-secondary'}>{s.wrongSimilar.made}/{s.wrongSimilar.eligible}명</span>
                      {s.wrongSimilar.made < s.wrongSimilar.eligible && (
                        <button onClick={() => onWrongSimilar(s.id)} disabled={busy != null}
                          className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-content-secondary hover:border-white/20 hover:text-content-primary disabled:opacity-40">
                          {busy === `${course.id}:ws:${s.id}` ? '만드는 중' : '만들기'}
                        </button>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-content-muted">
                  {issued ? `${dateLabel(s.issuedAt)}${s.dueAt ? ` ~ ${dateLabel(s.dueAt)}` : ''}` : ''}
                </td>
                <td className="px-4 py-1.5 text-right">
                  {issued ? (
                    s.examId && (
                      <Link href={`/dashboard/cloud/${s.examId}`} className="inline-flex items-center gap-1 text-content-tertiary hover:text-content-primary">
                        시험지 <ExternalLink className="h-3 w-3" />
                      </Link>
                    )
                  ) : (
                    <button
                      onClick={() => onIssue([s.id])}
                      disabled={busy != null}
                      className="rounded border border-white/10 px-2 py-0.5 text-[11px] text-content-secondary hover:border-white/20 hover:text-content-primary disabled:opacity-40"
                    >
                      {busy === `${course.id}:${s.id}` ? '내는 중' : '내기'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {visible.length < course.steps.length && (
        <button onClick={() => setShowAll(true)} className="w-full border-t border-white/5 py-2 text-xs text-content-tertiary hover:text-content-primary">
          나머지 {course.steps.length - visible.length}회차 보기
        </button>
      )}
    </div>
  );
}

// ============================================================================
// 코스 만들기 — 과정 → 범위(대단원) → 회차당 문항 → 미리보기 → 생성
// ============================================================================
interface Subject { code: string; name: string }
interface L1 { code: string; name: string }
interface Preview {
  subjectName: string;
  steps: Array<{ seq: number; unit: string; unitName: string; label: string; rungLabel: string; levelPlan: Record<string, number>; total: number; short: boolean }>;
  summary: { steps: number; problems: number; short: number; unitsTotal: number; unitsCovered: number; unitsEmpty: string[] };
  emptyUnits: Array<{ unit: string; name: string }>;
}

function CreateCourseModal({ classId, onClose, onDone }: { classId: string; onClose: () => void; onDone: () => void }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subject, setSubject] = useState<string>('');
  const [l1s, setL1s] = useState<L1[]>([]);
  const [l1Sel, setL1Sel] = useState<Set<string>>(new Set());
  const [perStep, setPerStep] = useState(10);
  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'create' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/mathsecr/tree');
        const data = await res.json();
        setSubjects(((data.subjects || []) as Array<{ code: string; name: string }>).map((s) => ({ code: `MS${s.code}`, name: s.name })));
      } catch { /* 과정 목록 실패 → 아래에서 표시 */ }
    })();
  }, []);

  useEffect(() => {
    if (!subject) { setL1s([]); return; }
    (async () => {
      try {
        const res = await fetch(`/api/mathsecr/tree?subject=${subject.slice(2)}`);
        const data = await res.json();
        // 트리 코드는 상대값("01") — 대단원 코드는 과정 + 번호 (MS05-01)
        const ch = ((data.tree && data.tree.ch) || []) as Array<{ c: string; t: string }>;
        setL1s(ch.map((n) => ({ code: `${subject}-${n.c}`, name: n.t })));
        setL1Sel(new Set());
        setPreview(null);
      } catch { setL1s([]); }
    })();
  }, [subject]);

  const subjectName = subjects.find((s) => s.code === subject)?.name ?? '';

  const run = async (mode: 'preview' | 'create') => {
    if (!subject) { setErr('과정을 고르세요'); return; }
    setBusy(mode);
    setErr(null);
    try {
      const res = await fetch(`/api/classes/${classId}/courses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectCode: subject, l1: Array.from(l1Sel), perStep,
          title: title.trim() || undefined, preview: mode === 'preview',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (mode === 'preview') setPreview(data as Preview);
      else onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-card">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <h2 className="text-base font-semibold text-content-primary">코스 만들기</h2>
          <button onClick={onClose} className="text-content-tertiary hover:text-content-primary"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-content-tertiary">과정</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-sm text-content-primary focus:border-white/20 focus:outline-none"
              >
                <option value="">고르세요</option>
                {subjects.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-content-tertiary">회차당 문항</label>
              <input
                type="number" min={3} max={30} value={perStep}
                onChange={(e) => { setPerStep(Math.min(30, Math.max(3, Number(e.target.value) || 10))); setPreview(null); }}
                className="w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-sm text-content-primary focus:border-white/20 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-content-tertiary">코스 이름 <span className="text-content-muted">(비우면 과정 이름)</span></label>
              <input
                value={title} onChange={(e) => setTitle(e.target.value)} placeholder={subjectName ? `${subjectName} 코스` : ''}
                className="w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-sm text-content-primary placeholder:text-content-muted focus:border-white/20 focus:outline-none"
              />
            </div>
          </div>

          {subject && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs text-content-tertiary">범위 (대단원) <span className="text-content-muted">— 아무것도 안 고르면 전체</span></label>
                {l1Sel.size > 0 && <button onClick={() => { setL1Sel(new Set()); setPreview(null); }} className="text-xs text-content-muted hover:text-content-primary">전체로</button>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {l1s.map((u) => {
                  const on = l1Sel.has(u.code);
                  return (
                    <button
                      key={u.code}
                      onClick={() => {
                        const next = new Set(l1Sel);
                        if (on) next.delete(u.code); else next.add(u.code);
                        setL1Sel(next);
                        setPreview(null);
                      }}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? 'border-white/40 bg-white/10 text-content-primary' : 'border-white/10 text-content-secondary hover:border-white/20'}`}
                    >
                      {u.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-xs leading-relaxed text-content-muted">
            소단원마다 개념 → 기본 → 실력 → 심화 순으로 회차가 쌓입니다(매쓰홀릭 교재 회차와 같은 계단).
            문제은행에 그 층의 문제가 없으면 그 회차는 만들지 않고 「부족」으로 표시합니다. 분류가 늘면 다시 만들면 됩니다.
          </p>

          {preview && (
            <div className="rounded-xl border border-white/10">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-white/5 px-4 py-2.5 text-sm">
                <span className="text-content-primary">회차 <b className="tabular-nums">{preview.summary.steps}</b></span>
                <span className="text-content-secondary">문항 <span className="tabular-nums">{preview.summary.problems}</span></span>
                <span className="text-content-secondary">소단원 <span className="tabular-nums">{preview.summary.unitsCovered}/{preview.summary.unitsTotal}</span></span>
                {preview.summary.short > 0 && <span className="text-amber-300">부족 회차 {preview.summary.short}</span>}
                {preview.emptyUnits.length > 0 && (
                  <span className="text-content-muted" title={preview.emptyUnits.map((u) => u.name).join(', ')}>
                    문제 없는 소단원 {preview.emptyUnits.length}
                  </span>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {preview.steps.map((s) => (
                      <tr key={s.seq} className="border-b border-white/5 last:border-0">
                        <td className="px-4 py-1 tabular-nums text-content-muted">{s.seq}</td>
                        <td className="px-2 py-1 text-content-primary">{s.unitName}</td>
                        <td className="px-2 py-1 text-content-secondary">{s.label} <span className="text-content-muted">{s.rungLabel}</span></td>
                        <td className="px-2 py-1 text-content-secondary">{planText(s.levelPlan)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{s.total}{s.short && <span className="ml-1 text-amber-300">부족</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {err && <p className="text-sm text-red-400">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-content-secondary hover:text-content-primary">취소</button>
          <button
            onClick={() => void run('preview')}
            disabled={!subject || busy != null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-1.5 text-sm text-content-secondary hover:border-white/20 hover:text-content-primary disabled:opacity-50"
          >
            {busy === 'preview' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            미리보기
          </button>
          <button
            onClick={() => void run('create')}
            disabled={!preview || busy != null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
            title={preview ? '' : '먼저 미리보기로 회차를 확인하세요'}
          >
            {busy === 'create' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            코스 만들기
          </button>
        </div>
      </div>
    </div>
  );
}
