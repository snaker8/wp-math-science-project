'use client';

// ============================================================================
// /student/solve/[sessionId] — 태블릿·노트북 문제 풀이
// ----------------------------------------------------------------------------
// 2026-11-27 대표 「문제를 출제해 학생에게 배포하면 태블릿이나 거기서 풀고 답 입력하면 되게」
//   · 한 문제씩 크게 — 시험지와 같은 렌더러(ExamProblemRenderer)
//   · 객관식 ①~⑤ 큰 버튼 / 숫자 답은 화면 키패드 / 서술형은 글로 (선생님 확인)
//   · 입력은 이 기기에 자동 저장(새로고침·잠깐 나갔다 와도 그대로). 문항별 머문 시간도 잰다
//   · 제출 → 자동 채점 → 결과(O/X · 내 답 · 정답 · 해설). 결과는 선생님 화면에 그대로 반영
// ★ 정답·해설은 제출 전엔 서버가 아예 보내지 않는다 (/api/student/sessions/[id]).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Loader2, AlertCircle, ChevronLeft, ChevronRight, LayoutGrid, Send, X, CheckCircle2, XCircle,
  HelpCircle, Delete, ArrowLeft, BookOpen, MinusCircle,
} from 'lucide-react';
import { ExamProblemRenderer, type ExamRenderProblem } from '@/components/shared/ExamProblemRenderer';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';

interface PaperItem {
  seq: number;
  problem: ExamRenderProblem;
  input_mode: 'objective' | 'numeric' | 'manual';
  choice_count: number;
  result: null | {
    is_correct: boolean;
    held: boolean;
    blank: boolean;
    student_answer: string;
    correct_answer: string;
    solution: string;
  };
}
interface Paper {
  session: { id: string; exam_title: string; started_at: string | null; completed_at: string | null };
  items: PaperItem[];
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

interface Draft {
  answers: Record<number, string>;
  times: Record<number, number>; // 초
  idx: number;
}

function loadDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function saveDraft(key: string, d: Draft) {
  try {
    localStorage.setItem(key, JSON.stringify(d));
  } catch { /* 저장 공간이 막혀도 풀이는 계속 */ }
}

export default function StudentSolvePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = (params?.id as string) || '';
  const draftKey = `solve-draft:${sessionId}`;

  const [paper, setPaper] = useState<Paper | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showGrid, setShowGrid] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timesRef = useRef<Record<number, number>>({});
  const enterRef = useRef<number>(Date.now());

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/student/sessions/${sessionId}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setPaper(d as Paper);
      if (!(d as Paper).session.completed_at) {
        const dr = loadDraft(draftKey);
        if (dr) {
          setAnswers(dr.answers || {});
          timesRef.current = dr.times || {};
          setIdx(Math.min(dr.idx || 0, Math.max(0, (d as Paper).items.length - 1)));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sessionId, draftKey]);

  useEffect(() => { load(); }, [load]);

  const done = !!paper?.session.completed_at;
  const items = useMemo(() => paper?.items ?? [], [paper]);
  const cur = items[idx];

  // 문항별 머문 시간 — 문항을 떠날 때 누적
  const flushTime = useCallback(() => {
    if (!cur || done) return;
    const sec = (Date.now() - enterRef.current) / 1000;
    timesRef.current[cur.seq] = (timesRef.current[cur.seq] || 0) + Math.min(sec, 3600);
    enterRef.current = Date.now();
  }, [cur, done]);

  const go = useCallback((n: number) => {
    if (n < 0 || n >= items.length) return;
    flushTime();
    setIdx(n);
    setShowGrid(false);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, [items.length, flushTime]);

  // 자동 저장
  useEffect(() => {
    if (!paper || done) return;
    saveDraft(draftKey, { answers, times: timesRef.current, idx });
  }, [answers, idx, paper, done, draftKey]);

  // 화면을 떠났다 돌아오면 그 사이 시간은 빼고 잰다
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) flushTime();
      else enterRef.current = Date.now();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [flushTime]);

  const setAnswer = (seq: number, v: string) => setAnswers((a) => ({ ...a, [seq]: v }));
  const answeredCount = items.filter((it) => (answers[it.seq] ?? '').trim()).length;

  const submit = async () => {
    if (!paper || submitting) return;
    flushTime();
    setSubmitting(true);
    try {
      const body = {
        answers: items.map((it) => ({
          sequence_number: it.seq,
          student_answer: (answers[it.seq] ?? '').trim(),
          time_taken_sec: Math.round(timesRef.current[it.seq] || 0),
        })),
      };
      const r = await fetch(`/api/student/sessions/${sessionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      try { localStorage.removeItem(draftKey); } catch { /* noop */ }
      setConfirm(false);
      setIdx(0);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // 키보드(노트북) — ←/→ 이동, 1~5 객관식
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!cur || confirm) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') go(idx + 1);
      else if (e.key === 'ArrowLeft') go(idx - 1);
      else if (!done && cur.input_mode === 'objective' && /^[1-9]$/.test(e.key)) {
        const n = Number(e.key);
        if (n <= cur.choice_count) setAnswer(cur.seq, CIRCLED[n - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cur, idx, go, done, confirm]);

  if (error && !paper) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 text-red-600 text-sm">
          <AlertCircle size={18} /> {error}
        </div>
        <button onClick={() => router.push('/student/assignments')} className="mt-4 text-sm text-gray-900 font-semibold">
          ← 과제 목록으로
        </button>
      </div>
    );
  }
  if (!paper) {
    return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" /></div>;
  }
  if (items.length === 0) {
    return <div className="p-6 text-gray-500 text-sm">문제가 없습니다.</div>;
  }

  return (
    <div className="pb-40 md:pb-36">
      {/* 위 줄 */}
      <div className="sticky top-[65px] z-20 bg-gray-50/95 backdrop-blur px-3 md:px-0 py-2.5 flex items-center gap-2">
        <button
          onClick={() => { flushTime(); router.push('/student/assignments'); }}
          className="p-2 -ml-1 rounded-lg text-gray-500 hover:bg-gray-200/60"
          aria-label="과제 목록"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-gray-900 truncate">{paper.session.exam_title}</div>
          <div className="text-xs text-gray-500">
            {done ? '채점 결과' : `${answeredCount} / ${items.length} 입력`}
          </div>
        </div>
        <button
          onClick={() => setShowGrid((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700"
        >
          <LayoutGrid size={16} /> {idx + 1}/{items.length}
        </button>
        {!done && (
          <button
            onClick={() => { flushTime(); setConfirm(true); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold shadow-sm"
          >
            <Send size={15} /> 제출
          </button>
        )}
      </div>

      {/* 진행 막대 */}
      <div className="h-1 bg-gray-200 mx-3 md:mx-0 rounded-full overflow-hidden">
        <div className="h-full bg-gray-900 transition-all" style={{ width: `${((idx + 1) / items.length) * 100}%` }} />
      </div>

      {/* 결과 요약 */}
      {done && <ResultSummary items={items} onPick={go} current={idx} />}

      {/* 번호판 */}
      {showGrid && (
        <div className="mx-3 md:mx-0 mt-3 p-3 bg-white rounded-2xl border border-gray-200 grid grid-cols-6 sm:grid-cols-10 gap-2">
          {items.map((it, i) => {
            const a = (answers[it.seq] ?? '').trim();
            const r = it.result;
            const cls = r
              ? r.held ? 'bg-gray-100 text-gray-700 border-gray-300'
                : r.is_correct ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'
              : a ? 'bg-gray-100 text-gray-900 border-gray-300' : 'bg-white text-gray-500 border-gray-200';
            return (
              <button
                key={it.seq}
                onClick={() => go(i)}
                className={`h-10 rounded-lg border text-sm font-bold ${cls} ${i === idx ? 'ring-2 ring-gray-900' : ''}`}
              >
                {it.seq}
              </button>
            );
          })}
        </div>
      )}

      {/* 문제 */}
      {/* 보기 글자 — 공용 렌더러는 인쇄 기준(13.5px)이라 이 화면에서만 키운다 (렌더러는 건드리지 않음) */}
      <style>{'.solve-paper .text-\\[13\\.5px\\]{font-size:17px!important;line-height:1.8!important}'}</style>
      <div className="solve-paper mx-3 md:mx-0 mt-3 bg-white rounded-2xl border border-gray-200 p-5 md:p-8 shadow-sm">
        <ExamProblemRenderer problem={{ ...cur.problem, number: cur.seq }} textSize="17px" lineHeight="1.8" maxFigureWidth={360} numberStyle="pad" />
      </div>

      {/* 채점 후 — 내 답 · 정답 · 해설 */}
      {done && cur.result && <ResultDetail key={cur.seq} it={cur} />}
      {done && !cur.result && (
        <div className="mx-3 md:mx-0 mt-3 p-4 rounded-2xl bg-gray-100 text-sm text-gray-600">이 문항은 아직 채점되지 않았어요.</div>
      )}

      {/* 아래 — 답 입력 + 이동 */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-gray-200">
        <div className="max-w-4xl mx-auto px-3 py-3 md:py-4">
          {!done && (
            <AnswerInput
              key={cur.seq}
              item={cur}
              value={answers[cur.seq] ?? ''}
              onChange={(v) => setAnswer(cur.seq, v)}
            />
          )}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => go(idx - 1)}
              disabled={idx === 0}
              className="flex-1 md:flex-none md:w-36 flex items-center justify-center gap-1 h-12 rounded-xl border border-gray-200 text-gray-700 font-semibold disabled:opacity-30"
            >
              <ChevronLeft size={18} /> 이전
            </button>
            {idx < items.length - 1 ? (
              <button
                onClick={() => go(idx + 1)}
                className="flex-1 md:ml-auto md:flex-none md:w-36 flex items-center justify-center gap-1 h-12 rounded-xl bg-gray-900 text-white font-semibold"
              >
                다음 <ChevronRight size={18} />
              </button>
            ) : !done ? (
              <button
                onClick={() => { flushTime(); setConfirm(true); }}
                className="flex-1 md:ml-auto md:flex-none md:w-36 flex items-center justify-center gap-1.5 h-12 rounded-xl bg-gray-900 text-white font-bold"
              >
                <Send size={16} /> 제출하기
              </button>
            ) : (
              <button
                onClick={() => router.push('/student/assignments')}
                className="flex-1 md:ml-auto md:flex-none md:w-36 flex items-center justify-center gap-1 h-12 rounded-xl bg-gray-900 text-white font-semibold"
              >
                목록으로
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 제출 확인 */}
      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-6">
          <div className="w-full md:max-w-md bg-white rounded-t-3xl md:rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">제출할까요?</h3>
              <button onClick={() => setConfirm(false)} className="p-1 text-gray-400"><X size={20} /></button>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              {items.length}문제 중 <b className="text-gray-900">{answeredCount}문제</b>에 답을 입력했어요.
            </p>
            {answeredCount < items.length && (
              <div className="mt-3 p-3 rounded-xl bg-gray-100 text-gray-800 text-sm">
                답을 안 쓴 {items.length - answeredCount}문제는 틀린 것으로 처리돼요.
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {items.filter((it) => !(answers[it.seq] ?? '').trim()).map((it) => (
                    <button
                      key={it.seq}
                      onClick={() => { setConfirm(false); go(items.indexOf(it)); }}
                      className="px-2 py-0.5 rounded-md bg-white border border-gray-300 text-xs font-bold"
                    >
                      {it.seq}번
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-3 text-xs text-gray-500">제출하면 답을 바꿀 수 없어요.</p>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirm(false)} className="flex-1 h-12 rounded-xl border border-gray-200 font-semibold text-gray-700">
                더 풀기
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 h-12 rounded-xl bg-gray-900 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={16} />} 제출
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 답 입력 ───────────────────────────────────────────────────────────────
function AnswerInput({ item, value, onChange }: { item: PaperItem; value: string; onChange: (v: string) => void }) {
  if (item.input_mode === 'objective') {
    const n = Math.max(item.choice_count || 5, 1);
    return (
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(n, 5)}, minmax(0, 1fr))` }}>
        {CIRCLED.slice(0, n).map((c) => (
          <button
            key={c}
            onClick={() => onChange(value === c ? '' : c)}
            className={`h-14 rounded-2xl text-2xl font-bold border-2 transition-all ${
              value === c ? 'bg-gray-900 border-gray-900 text-white scale-[1.02]' : 'bg-white border-gray-200 text-gray-700 active:bg-gray-100'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
    );
  }

  if (item.input_mode === 'numeric') {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', '.'];
    const push = (k: string) => {
      if (k === '-' && value.length > 0) return;
      if (value.length >= 12) return;
      onChange(value + k);
    };
    return (
      <div className="flex flex-col md:flex-row gap-2 md:items-stretch">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9./\-]/g, '').slice(0, 12))}
          placeholder="답 (예: 12, -3, 3/4)"
          className="md:w-56 h-14 px-4 rounded-2xl border-2 border-gray-200 text-2xl font-bold text-gray-900 focus:border-gray-900 outline-none"
        />
        <div className="grid grid-cols-7 gap-1.5 flex-1">
          {keys.slice(0, 9).map((k) => (
            <button key={k} onClick={() => push(k)} className="h-12 md:h-14 rounded-xl bg-gray-100 text-lg font-bold text-gray-800 active:bg-gray-200">{k}</button>
          ))}
          {keys.slice(9).map((k) => (
            <button key={k} onClick={() => push(k)} className="h-12 md:h-14 rounded-xl bg-gray-100 text-lg font-bold text-gray-800 active:bg-gray-200">{k}</button>
          ))}
          <button onClick={() => push('/')} className="h-12 md:h-14 rounded-xl bg-gray-100 text-sm font-bold text-gray-800 active:bg-gray-200">분수</button>
          <button onClick={() => onChange(value.slice(0, -1))} className="h-12 md:h-14 rounded-xl bg-gray-200 text-gray-700 flex items-center justify-center active:bg-gray-300" aria-label="지우기">
            <Delete size={20} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 500))}
        rows={2}
        placeholder="답을 적어 주세요. 이 문제는 선생님이 확인해요."
        className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-base text-gray-900 focus:border-gray-900 outline-none resize-none"
      />
    </div>
  );
}

// ── 결과 ─────────────────────────────────────────────────────────────────
function ResultSummary({ items, onPick, current }: { items: PaperItem[]; onPick: (i: number) => void; current: number }) {
  const graded = items.filter((it) => it.result && !it.result.held);
  const correct = graded.filter((it) => it.result!.is_correct).length;
  const held = items.filter((it) => it.result?.held).length;
  const pct = graded.length ? Math.round((correct / graded.length) * 100) : null;
  return (
    <div className="mx-3 md:mx-0 mt-3 p-5 bg-white rounded-2xl border border-gray-200">
      <div className="flex items-end gap-4">
        <div>
          <div className="text-xs font-semibold text-gray-500">맞힌 문제</div>
          <div className="text-3xl font-extrabold text-gray-900">
            {correct}<span className="text-lg text-gray-400 font-bold"> / {graded.length}</span>
          </div>
        </div>
        {pct != null && <div className="text-2xl font-extrabold text-gray-900 pb-0.5">{pct}점</div>}
        {held > 0 && <div className="ml-auto text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 font-semibold">선생님 확인 {held}문제</div>}
      </div>
      <div className="mt-4 grid grid-cols-8 sm:grid-cols-12 gap-1.5">
        {items.map((it, i) => {
          const r = it.result;
          const cls = !r ? 'bg-gray-100 text-gray-400'
            : r.held ? 'bg-gray-200 text-gray-700'
              : r.is_correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600';
          return (
            <button key={it.seq} onClick={() => onPick(i)} className={`h-9 rounded-lg text-xs font-bold ${cls} ${i === current ? 'ring-2 ring-gray-900' : ''}`}>
              {it.seq}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResultDetail({ it }: { it: PaperItem }) {
  const r = it.result!;
  const [showSol, setShowSol] = useState(!r.is_correct);
  return (
    <div className="mx-3 md:mx-0 mt-3 space-y-3">
      <div className={`p-4 rounded-2xl border flex flex-wrap items-center gap-x-6 gap-y-2 ${
        r.held ? 'bg-gray-100 border-gray-300' : r.is_correct ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
      }`}>
        <div className="flex items-center gap-2 font-bold">
          {r.held ? <HelpCircle className="text-gray-600" size={22} />
            : r.is_correct ? <CheckCircle2 className="text-emerald-600" size={22} />
              : r.blank ? <MinusCircle className="text-red-500" size={22} /> : <XCircle className="text-red-500" size={22} />}
          <span className={r.held ? 'text-gray-800' : r.is_correct ? 'text-emerald-800' : 'text-red-700'}>
            {r.held ? '선생님 확인 중' : r.is_correct ? '정답' : r.blank ? '미응답' : '오답'}
          </span>
        </div>
        <div className="text-base text-gray-700">
          내 답 <b className="text-gray-900 ml-1 text-lg">{r.blank ? '—' : r.student_answer || '—'}</b>
        </div>
        <div className="text-base text-gray-700 flex items-center gap-1">
          정답 <b className="text-gray-900 ml-1 text-lg"><MixedContentRenderer content={r.correct_answer || '—'} /></b>
        </div>
      </div>
      {r.solution && (
        <div className="bg-white rounded-2xl border border-gray-200">
          <button onClick={() => setShowSol((v) => !v)} className="w-full flex items-center gap-2 px-5 py-4 text-sm font-bold text-gray-800">
            <BookOpen size={17} className="text-gray-700" /> 해설 {showSol ? '접기' : '보기'}
          </button>
          {showSol && (
            <div className="px-5 pb-5 text-[15px] leading-[1.9] text-gray-800 whitespace-pre-wrap">
              <MixedContentRenderer content={r.solution} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
