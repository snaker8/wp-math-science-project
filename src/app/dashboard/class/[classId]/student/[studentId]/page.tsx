'use client';

// ============================================================================
// 반 허브 ▸ 학생 화면 — 매쓰홀릭 /student/screen/:studentId 대응
// ----------------------------------------------------------------------------
// 09 §5-2: 학습 이력(날짜) · 이력 코멘트 · 학생별 학습지 전부 · 상담 기록. 여기서 한 학생만 본다.
//   요약(회차 진행도 · 정답률 · 기록 수 · 최근) → 학습 이력(종류 라벨 · 점수 · 코멘트) → 상담 기록.
//   유형분석 판은 반 허브 유형분석 탭에서 학생을 고르면 된다 — 같은 판을 두 번 만들지 않는다.
// ============================================================================

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Copy, Link2, Loader2, MessageSquare, Phone, Plus, Trash2, Users, ExternalLink } from 'lucide-react';
import type { HistoryItem, LogKind } from '@/app/api/classes/[classId]/students/[studentId]/history/route';
import type { Counselling } from '@/app/api/classes/[classId]/students/[studentId]/counsellings/route';

const KIND_TONE: Record<LogKind, string> = {
  course: 'border-sky-400/40 text-sky-300',
  wrong_similar: 'border-amber-400/40 text-amber-300',
  assignment: 'border-white/20 text-content-secondary',
  diagnostic: 'border-emerald-400/40 text-emerald-300',
  exam: 'border-white/10 text-content-tertiary',
};
const TARGET_LABEL = { parent: '학부모', student: '학생' } as const;
const METHOD_LABEL = { phone: '전화', visit: '직접', other: '기타' } as const;

function dateLabel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
function pctTone(p: number | null): string {
  if (p == null) return 'text-content-muted';
  return p >= 80 ? 'text-emerald-300' : p >= 60 ? 'text-content-primary' : 'text-red-300';
}

interface Payload {
  class: { id: string; name: string };
  student: { id: string; name: string; grade: string | null };
  summary: { stepsDone: number; stepsTotal: number; graded: number; correct: number; pct: number | null; sessions: number; lastAt: string | null };
  items: HistoryItem[];
}

function StudentScreenInner() {
  const params = useParams<{ classId: string; studentId: string }>();
  const classId = params?.classId ?? '';
  const studentId = params?.studentId ?? '';
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<LogKind | ''>('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/classes/${classId}/students/${studentId}/history`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j as Payload);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [classId, studentId]);
  useEffect(() => { void load(); }, [load]);

  const saveComment = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/classes/${classId}/students/${studentId}/history`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: editing.id, comment: editing.text }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setEditing(null);
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  };

  const items = useMemo(() => (data?.items ?? []).filter((it) => !kindFilter || it.kind === kindFilter), [data, kindFilter]);
  const kindCounts = useMemo(() => {
    const c = new Map<LogKind, number>();
    for (const it of data?.items ?? []) c.set(it.kind, (c.get(it.kind) ?? 0) + 1);
    return c;
  }, [data]);

  if (error) return <div className="p-6 text-sm text-red-300">{error}</div>;
  if (!data) return <div className="flex items-center gap-2 p-6 text-sm text-content-tertiary"><Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중</div>;
  const { student, summary } = data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={`/dashboard/class/${classId}`} className="inline-flex items-center gap-1 text-sm text-content-tertiary hover:text-content-primary">
          <ArrowLeft className="h-4 w-4" /> {data.class.name}
        </Link>
        <h1 className="text-lg font-semibold text-content-primary">{student.name}</h1>
        {student.grade && <span className="text-xs text-content-tertiary">{student.grade}</span>}
        <div className="ml-auto flex items-center gap-2 text-xs">
          <Link href={`/dashboard/class/${classId}?tab=mastery&student=${student.id}`} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-content-secondary hover:border-white/20 hover:text-content-primary">
            유형분석 판 <ExternalLink className="h-3 w-3" />
          </Link>
          <Link href={`/dashboard/prescription?student=${student.id}`} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-content-secondary hover:border-white/20 hover:text-content-primary">
            처방 <ExternalLink className="h-3 w-3" />
          </Link>
          {/* 단계 9 IA 정리 — 메뉴에서 걷은 옛 입구는 학생 화면에서 링크로 간다 */}
          <Link href={`/dashboard/prescription/report?studentId=${student.id}`} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-content-secondary hover:border-white/20 hover:text-content-primary" title="진단 세트(A/B/C) 종합 리포트">
            진단 종합 <ExternalLink className="h-3 w-3" />
          </Link>
          <Link href={`/tutor/analytics?student=${student.id}`} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-content-secondary hover:border-white/20 hover:text-content-primary" title="내신·모의고사·진단 통합 성적표">
            성적표 <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* 요약 — 매쓰홀릭 학생 탭의 진행도·정답률을 학생 하나로 */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="진행도" value={summary.stepsTotal > 0 ? `${Math.round((summary.stepsDone * 100) / summary.stepsTotal)}%` : '—'} sub={summary.stepsTotal > 0 ? `${summary.stepsDone}/${summary.stepsTotal}회차` : '코스 없음'} />
        <Stat label="정답률" value={summary.pct == null ? '—' : `${summary.pct}%`} sub={`${summary.correct}/${summary.graded}문항`} tone={pctTone(summary.pct)} />
        <Stat label="학습 기록" value={String(summary.sessions)} sub="채점된 학습" />
        <Stat label="최근 학습" value={dateLabel(summary.lastAt)} sub="" />
      </div>

      {/* 학습 이력 */}
      <section className="mb-6 overflow-hidden rounded-xl border border-white/10">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-content-primary">학습 이력</h2>
          <div className="ml-2 flex flex-wrap gap-1 text-[11px]">
            <button onClick={() => setKindFilter('')} className={`rounded-full px-2 py-0.5 ${kindFilter === '' ? 'bg-white text-black' : 'border border-white/10 text-content-tertiary hover:text-content-primary'}`}>전체 {data.items.length}</button>
            {(['course', 'wrong_similar', 'assignment', 'diagnostic', 'exam'] as LogKind[]).filter((k) => kindCounts.get(k)).map((k) => (
              <button key={k} onClick={() => setKindFilter(k)} className={`rounded-full px-2 py-0.5 ${kindFilter === k ? 'bg-white text-black' : 'border border-white/10 text-content-tertiary hover:text-content-primary'}`}>
                {data.items.find((it) => it.kind === k)?.kindLabel} {kindCounts.get(k)}
              </button>
            ))}
          </div>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-content-muted">채점된 학습 기록이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-content-tertiary">
                <th className="px-4 py-2 text-left font-medium">날짜</th>
                <th className="px-2 py-2 text-left font-medium">종류</th>
                <th className="px-2 py-2 text-left font-medium">학습</th>
                <th className="px-2 py-2 text-right font-medium">채점</th>
                <th className="px-2 py-2 text-right font-medium">정답률</th>
                <th className="px-4 py-2 text-left font-medium">코멘트</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.sessionId} className="border-b border-white/5 last:border-0 align-top">
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-content-tertiary">{dateLabel(it.at)}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] ${KIND_TONE[it.kind]}`}>{it.kindLabel}{it.sub ? ` · ${it.sub}` : ''}</span>
                  </td>
                  <td className="px-2 py-2 text-content-primary">
                    {it.examId ? <Link href={`/dashboard/cloud/${it.examId}`} className="hover:underline">{it.title}</Link> : it.title}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-content-secondary">{it.graded}/{it.total}</td>
                  <td className={`px-2 py-2 text-right tabular-nums font-medium ${pctTone(it.pct)}`}>{it.pct == null ? '—' : `${it.pct}%`}</td>
                  <td className="px-4 py-2 text-xs">
                    {editing?.id === it.sessionId ? (
                      <div className="flex items-start gap-1">
                        <textarea value={editing.text} onChange={(e) => setEditing({ id: it.sessionId, text: e.target.value })} rows={2}
                          className="w-full rounded border border-white/10 bg-white/[.03] px-2 py-1 text-xs text-content-primary focus:border-white/20 focus:outline-none" />
                        <button onClick={() => void saveComment()} disabled={saving} className="rounded bg-white px-2 py-1 text-[11px] font-semibold text-black disabled:opacity-40">저장</button>
                        <button onClick={() => setEditing(null)} className="rounded px-1.5 py-1 text-[11px] text-content-muted hover:text-content-primary">취소</button>
                      </div>
                    ) : (
                      <button onClick={() => setEditing({ id: it.sessionId, text: it.comment ?? '' })} className="group inline-flex max-w-xs items-start gap-1 text-left text-content-tertiary hover:text-content-primary" title="이 학습에 교사 코멘트">
                        <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100" />
                        <span className={it.comment ? 'text-content-secondary' : 'text-content-muted'}>{it.comment || '코멘트'}</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <ReportLinkSection classId={classId} studentId={studentId} />

      <CounsellingSection classId={classId} studentId={studentId} />
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/10 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-content-tertiary">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? 'text-content-primary'}`}>{value}</div>
      {sub && <div className="text-xs text-content-muted">{sub}</div>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 학부모 학습 리포트 링크 — 매쓰홀릭 「일일 학습 리포트 발송」. 문자 대신 링크(열 때마다 최신 계산)
// ────────────────────────────────────────────────────────────────────────────
interface ReportLink { token: string; days: number; label: string | null; note: string | null; isActive: boolean; createdAt: string; lastViewedAt: string | null; url: string }

function ReportLinkSection({ classId, studentId }: { classId: string; studentId: string }) {
  const [items, setItems] = useState<ReportLink[]>([]);
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  /** 선생님 총평 — 리포트 상단에 실린다. AI 초안(Opus 5, 버튼 누를 때만 호출)을 고쳐 쓴다 */
  const [note, setNote] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiInfo, setAiInfo] = useState<string | null>(null);
  const aiDraft = async () => {
    setAiBusy(true); setAiInfo(null);
    try {
      const res = await fetch(`/api/classes/${classId}/students/${studentId}/ai-comment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setNote(j.draft as string);
      setAiInfo(`AI 초안 (${j.model}, 입력 ${j.usage.input}·출력 ${j.usage.output} 토큰) — 고쳐서 쓰세요`);
    } catch (e) { setAiInfo(e instanceof Error ? e.message : String(e)); } finally { setAiBusy(false); }
  };
  const load = useCallback(async () => {
    const res = await fetch(`/api/classes/${classId}/students/${studentId}/learning-report`, { cache: 'no-store' });
    const j = await res.json();
    if (res.ok) setItems((j.items || []) as ReportLink[]);
  }, [classId, studentId]);
  useEffect(() => { void load(); }, [load]);

  const copy = async (url: string) => {
    // ★ prompt/alert 같은 대화상자는 쓰지 않는다 — 브라우저 자동화·백그라운드 탭을 멈춘다. 복사 실패면 링크 목록에서 직접 복사.
    try { await navigator.clipboard.writeText(url); setCopied(url); setTimeout(() => setCopied(null), 1500); } catch { setCopied(null); }
  };
  const issue = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/classes/${classId}/students/${studentId}/learning-report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days, note }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setNote(''); setAiInfo(null);
      await load();
      await copy(j.url as string);
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const revoke = async (token: string) => {
    if (!confirm('이 링크를 회수합니다. 학부모가 더 이상 열 수 없습니다.')) return;
    const res = await fetch('/api/diagnostics/report-tokens', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'parent_token', ref: token }),
    });
    if (res.ok) void load();
  };
  const active = items.filter((i) => i.isActive);
  return (
    <section className="mb-6 rounded-xl border border-white/10">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <Link2 className="h-4 w-4 text-content-tertiary" />
        <h2 className="text-sm font-semibold text-content-primary">학부모 학습 리포트</h2>
        <span className="text-xs text-content-tertiary">링크를 만들어 카카오톡·문자에 붙입니다. 열 때마다 최근 기간 기준으로 다시 계산됩니다.</span>
        <div className="ml-auto flex items-center gap-1 text-xs">
          {([1, 7, 30] as const).map((n) => (
            <button key={n} onClick={() => setDays(n)} className={`rounded-full px-2 py-0.5 ${days === n ? 'bg-white text-black' : 'border border-white/10 text-content-tertiary hover:text-content-primary'}`}>
              {n === 1 ? '오늘' : `최근 ${n}일`}
            </button>
          ))}
          <button onClick={() => void issue()} disabled={busy} className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-40">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} 링크 만들기
          </button>
        </div>
      </div>
      <div className="border-b border-white/10 px-4 py-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs text-content-tertiary">선생님 총평 <span className="text-content-muted">(리포트 상단에 실립니다 · 비우면 없음)</span></span>
          <button onClick={() => void aiDraft()} disabled={aiBusy} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-content-secondary hover:border-white/20 hover:text-content-primary disabled:opacity-40" title="최근 기간 학습 기록으로 초안을 씁니다 (Opus 5, 1건 약 19원). 누를 때만 호출">
            {aiBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />} AI 초안
          </button>
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="예: 강다현 학생은 이번 주 제곱근 단원에서 정답률 84%로 안정적입니다. 실력 문제에서 계산 실수가 두 번 있어…"
          className="w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-sm text-content-primary placeholder:text-content-muted focus:border-white/20 focus:outline-none" />
        {aiInfo && <p className="mt-1 text-[11px] text-content-muted">{aiInfo}</p>}
      </div>
      {active.length === 0 ? (
        <p className="px-4 py-4 text-sm text-content-muted">발급한 링크가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {active.map((r) => (
            <li key={r.token} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="w-24 shrink-0 text-content-secondary" title={r.note ?? ''}>{r.label ?? `${r.days}일`}{r.note ? ' · 총평' : ''}</span>
              <a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs text-content-tertiary hover:text-content-primary">{r.url}</a>
              <span className="shrink-0 text-xs text-content-muted">{r.lastViewedAt ? `열람 ${dateLabel(r.lastViewedAt)}` : '미열람'}</span>
              <button onClick={() => void copy(r.url)} className="shrink-0 text-content-tertiary hover:text-content-primary" title="복사"><Copy className="h-3.5 w-3.5" /></button>
              {copied === r.url && <span className="text-[11px] text-emerald-300">복사됨</span>}
              <button onClick={() => void revoke(r.token)} className="shrink-0 text-content-muted hover:text-red-400" title="회수"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 상담 기록 — 매쓰홀릭 counsellings (대상 · 방법 · 내용 · 일시 · 내가 쓴 글만)
// ────────────────────────────────────────────────────────────────────────────
function CounsellingSection({ classId, studentId }: { classId: string; studentId: string }) {
  const [items, setItems] = useState<Counselling[]>([]);
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<'parent' | 'student'>('parent');
  const [method, setMethod] = useState<'phone' | 'visit' | 'other'>('phone');
  const [content, setContent] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mineOnly, setMineOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/classes/${classId}/students/${studentId}/counsellings`, { cache: 'no-store' });
    const j = await res.json();
    if (res.ok) setItems((j.items || []) as Counselling[]);
  }, [classId, studentId]);
  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/classes/${classId}/students/${studentId}/counsellings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, method, content, counselledAt: `${date}T12:00:00` }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setContent(''); setAdding(false);
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!confirm('이 상담 기록을 지웁니다.')) return;
    const res = await fetch(`/api/classes/${classId}/students/${studentId}/counsellings?id=${id}`, { method: 'DELETE' });
    if (res.ok) void load();
  };

  const shown = mineOnly ? items.filter((i) => i.mine) : items;
  return (
    <section className="rounded-xl border border-white/10">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <Users className="h-4 w-4 text-content-tertiary" />
        <h2 className="text-sm font-semibold text-content-primary">상담 기록</h2>
        <span className="text-xs tabular-nums text-content-tertiary">{items.length}건</span>
        <label className="ml-2 inline-flex cursor-pointer items-center gap-1 text-xs text-content-tertiary">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="h-3.5 w-3.5 accent-white" /> 내가 쓴 글만
        </label>
        <button onClick={() => setAdding((v) => !v)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> 상담 기록
        </button>
      </div>
      {adding && (
        <div className="grid gap-2 border-b border-white/10 bg-white/[.02] px-4 py-3 sm:grid-cols-[110px_110px_140px_1fr_auto]">
          <select value={target} onChange={(e) => setTarget(e.target.value as 'parent' | 'student')} className="rounded-lg border border-white/10 bg-white/[.03] px-2 py-1.5 text-sm text-content-primary">
            <option value="parent">학부모</option><option value="student">학생</option>
          </select>
          <select value={method} onChange={(e) => setMethod(e.target.value as 'phone' | 'visit' | 'other')} className="rounded-lg border border-white/10 bg-white/[.03] px-2 py-1.5 text-sm text-content-primary">
            <option value="phone">전화</option><option value="visit">직접</option><option value="other">기타</option>
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-white/10 bg-white/[.03] px-2 py-1.5 text-sm text-content-primary" />
          <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="상담 내용" onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            className="rounded-lg border border-white/10 bg-white/[.03] px-3 py-1.5 text-sm text-content-primary placeholder:text-content-muted focus:border-white/20 focus:outline-none" />
          <button onClick={() => void submit()} disabled={busy || !content.trim()} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-40">저장</button>
        </div>
      )}
      {shown.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-content-muted">상담 기록이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {shown.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              <span className="w-20 shrink-0 tabular-nums text-content-tertiary">{dateLabel(c.counselledAt)}</span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-content-secondary">
                <Phone className="h-3 w-3" /> {TARGET_LABEL[c.target]} · {METHOD_LABEL[c.method]}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap text-content-primary">{c.content}</span>
              <span className="shrink-0 text-xs text-content-muted">{c.createdByName ?? ''}</span>
              {c.mine && (
                <button onClick={() => void remove(c.id)} className="shrink-0 text-content-muted hover:text-red-400" title="삭제"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function StudentScreenPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-content-tertiary">불러오는 중</div>}>
      <StudentScreenInner />
    </Suspense>
  );
}
