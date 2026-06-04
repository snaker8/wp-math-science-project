'use client';

// ============================================================================
// /answer/[session_id]
//   학생이 인쇄된 시험지의 QR 을 스캔해 진입하는 모바일 답 입력 페이지.
//   객관식 ①~⑤ 라디오 / 숫자 단답 텍스트 입력 → 일괄 제출 →
//   POST /api/session-results/from-student 가 자동 채점 + session_results upsert.
//
// 자동채점 보류 (서답형) 은 결과 화면에 "선생님 확인 필요" 로 표시.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2, AlertCircle, CheckCircle2, Send, ChevronLeft, HelpCircle,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';

// ============================================================================
// Types
// ============================================================================
interface SessionMeta {
  id: string;
  student_id: string;
  student_name: string;
  exam_id: string;
  exam_title: string;
  round_number: number;
  session_type: string;
  completed_at: string | null;
}

interface AnswerItem {
  sequence_number: number;
  problem_id: string;
  type_code: string | null;
  difficulty: number | null;
  content: string;
  answer_json: Record<string, unknown> | null;
}

interface ItemMode {
  /** UI 모드 — answer_json 으로부터 결정 */
  kind: 'objective' | 'numeric' | 'manual';
  /** 객관식 선택지 수 (보통 5) */
  choiceCount: number;
}

const SESSION_TYPE_LABEL: Record<string, string> = {
  BS: '광역 스캔',
  DD: '정밀 진단',
  PT: '선수 추적',
  SC: '스팟 체크',
  WS: '학습지',
  EX: '시험지',
};

const CIRCLED = ['①', '②', '③', '④', '⑤'] as const;

// ----------------------------------------------------------------------------
// answer_json → UI 모드 결정 (서버 compareAnswer 와 같은 룰)
// ----------------------------------------------------------------------------
function decideMode(answerJson: Record<string, unknown> | null): ItemMode {
  if (!answerJson) return { kind: 'manual', choiceCount: 0 };
  const choices = Array.isArray(answerJson.choices) ? (answerJson.choices as unknown[]) : [];
  const declaredType = (answerJson.type as string) || '';
  const correctRaw = String(answerJson.finalAnswer ?? answerJson.correct_answer ?? '').trim();

  if (declaredType === 'multiple_choice' || choices.length > 0 || /^[①②③④⑤]$/.test(correctRaw) || /^[1-5]$/.test(correctRaw)) {
    return { kind: 'objective', choiceCount: Math.max(choices.length || 5, 5) > 5 ? choices.length : 5 };
  }
  if (/^-?\d+(\.\d+)?$/.test(correctRaw.replace(/\s/g, '')) || /^-?\d+\/-?\d+$/.test(correctRaw.replace(/\s/g, ''))) {
    return { kind: 'numeric', choiceCount: 0 };
  }
  return { kind: 'manual', choiceCount: 0 };
}

// ============================================================================
// Page
// ============================================================================
export default function StudentAnswerPage() {
  const params = useParams();
  const sessionId = (params?.session_id as string) || '';

  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [items, setItems] = useState<AnswerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // seq → 학생 입력 값
  const [inputs, setInputs] = useState<Record<number, string>>({});

  // 제출 상태
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | {
    saved: number;
    auto_correct: number;
    auto_wrong: number;
    needs_review: Array<{ seq: number; student_answer: string; correct: string; mode: string }>;
  }>(null);

  // ──────────────────────────────────
  // 로드
  // ──────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMeta(data.session);
      setItems((data.items || []) as AnswerItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) void load();
  }, [sessionId, load]);

  // ──────────────────────────────────
  // 진행률
  // ──────────────────────────────────
  const filledCount = useMemo(() => {
    let n = 0;
    for (const it of items) {
      const v = (inputs[it.sequence_number] || '').trim();
      if (v) n += 1;
    }
    return n;
  }, [items, inputs]);

  // ──────────────────────────────────
  // 제출
  // ──────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        session_id: sessionId,
        answers: items
          .map(it => ({
            sequence_number: it.sequence_number,
            student_answer: (inputs[it.sequence_number] || '').trim(),
          }))
          .filter(a => a.student_answer.length > 0),
      };
      if (payload.answers.length === 0) {
        alert('입력된 답이 없습니다.');
        setSubmitting(false);
        return;
      }
      const res = await fetch('/api/session-results/from-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setResult(json);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [submitting, sessionId, items, inputs]);

  // ──────────────────────────────────
  // 렌더 — 로딩 / 에러
  // ──────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <Loader2 className="animate-spin mr-2" size={18} /> 시험지를 불러오는 중…
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <div>{error || '세션을 찾을 수 없습니다.'}</div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────
  // 렌더 — 제출 완료 결과 화면
  // ──────────────────────────────────
  if (result) {
    const graded = result.auto_correct + result.auto_wrong;
    const pct = graded > 0 ? Math.round((result.auto_correct / graded) * 1000) / 10 : null;
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-20">
        <header className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur border-b border-white/10 px-4 py-3">
          <div className="text-[11px] text-zinc-400 mb-0.5">
            {SESSION_TYPE_LABEL[meta.session_type] || meta.session_type} · {meta.round_number}회차
          </div>
          <div className="font-bold text-sm">{meta.student_name}</div>
          <div className="text-[11px] text-zinc-400 truncate">{meta.exam_title}</div>
        </header>

        <div className="p-4 space-y-4">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
            <CheckCircle2 size={36} className="text-emerald-400 mx-auto mb-2" />
            <div className="text-base font-semibold mb-1">답안 제출 완료</div>
            <div className="text-xs text-zinc-300">
              저장된 문항 {result.saved}개 · 자동채점 {graded}개
              {pct != null && (
                <span className="ml-2 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                  {pct}% 정답
                </span>
              )}
            </div>
            <div className="text-[11px] text-zinc-400 mt-2">
              O {result.auto_correct} · X {result.auto_wrong}
              {result.needs_review.length > 0 && (
                <> · 선생님 확인 {result.needs_review.length}</>
              )}
            </div>
          </div>

          {result.needs_review.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm mb-2">
                <HelpCircle size={14} /> 선생님 확인 필요 문항
              </div>
              <div className="text-[11px] text-zinc-300 space-y-1">
                {result.needs_review.map(r => (
                  <div key={r.seq} className="flex gap-2">
                    <span className="font-mono">{r.seq}번</span>
                    <span className="text-zinc-400">학생답: {r.student_answer}</span>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-zinc-400 mt-2">
                서답형/식 답안은 자동채점 보류 — 선생님이 직접 확인합니다.
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ──────────────────────────────────
  // 렌더 — 입력 화면
  // ──────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-24">
      {/* 헤더 */}
      <header className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] text-zinc-400 mb-0.5">
          <span className="font-semibold">{SESSION_TYPE_LABEL[meta.session_type] || meta.session_type}</span>
          <span>·</span>
          <span>{meta.round_number}회차</span>
        </div>
        <div className="font-bold text-sm truncate">{meta.student_name}</div>
        <div className="text-[11px] text-zinc-400 truncate">{meta.exam_title}</div>

        {/* 진행률 */}
        <div className="mt-3">
          <div className="flex justify-between items-center text-[11px] text-zinc-400 mb-1">
            <span>입력 {filledCount}/{items.length}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all"
              style={{ width: items.length > 0 ? `${(filledCount / items.length) * 100}%` : '0%' }}
            />
          </div>
        </div>
      </header>

      {/* 문항 리스트 */}
      <div className="p-4 space-y-4">
        {items.length === 0 && (
          <div className="text-center text-zinc-400 py-10">문항이 없습니다.</div>
        )}
        {items.map(item => {
          const mode = decideMode(item.answer_json);
          const value = inputs[item.sequence_number] || '';

          return (
            <div
              key={item.sequence_number}
              className="rounded-2xl border border-white/10 bg-zinc-900/60 overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-white/10 bg-zinc-900/80">
                <span className="font-bold text-base">{item.sequence_number}번</span>
                <span className="text-[10px] text-zinc-400">
                  {mode.kind === 'objective' && '객관식'}
                  {mode.kind === 'numeric' && '단답형'}
                  {mode.kind === 'manual' && '서답형'}
                </span>
              </div>

              {/* 문제 내용 */}
              <div className="px-4 py-3 text-sm leading-relaxed">
                <MixedContentRenderer content={item.content} />
              </div>

              {/* 답 입력 UI */}
              <div className="px-4 pb-4">
                {mode.kind === 'objective' && (
                  <div className="grid grid-cols-5 gap-2">
                    {CIRCLED.slice(0, Math.min(mode.choiceCount, 5)).map((ch, i) => {
                      const isSelected = value === ch || value === String(i + 1);
                      return (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => setInputs(prev => ({ ...prev, [item.sequence_number]: ch }))}
                          className={`py-3 rounded-xl text-xl font-bold transition-all ${
                            isSelected
                              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                              : 'bg-white/5 border border-white/10 hover:bg-white/10'
                          }`}
                          aria-label={`${ch} 선택`}
                        >
                          {ch}
                        </button>
                      );
                    })}
                  </div>
                )}

                {(mode.kind === 'numeric' || mode.kind === 'manual') && (
                  <>
                    <input
                      type="text"
                      inputMode={mode.kind === 'numeric' ? 'decimal' : 'text'}
                      placeholder={mode.kind === 'numeric' ? '예: -3, 1/2, 0.25' : '답 입력'}
                      value={value}
                      onChange={(e) =>
                        setInputs(prev => ({ ...prev, [item.sequence_number]: e.target.value }))
                      }
                      className="w-full px-3 py-3 rounded-xl bg-white/5 border border-white/10 text-base focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/30"
                    />
                    {mode.kind === 'manual' && (
                      <div className="text-[10px] text-amber-400/80 mt-1.5 flex items-center gap-1">
                        <HelpCircle size={10} />
                        서답형 — 선생님이 직접 채점합니다
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 하단 고정 제출 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-zinc-950/95 backdrop-blur border-t border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || filledCount === 0}
          className={`w-full py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all ${
            submitting || filledCount === 0
              ? 'bg-zinc-800 text-zinc-500'
              : 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-400'
          }`}
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" /> 제출 중…
            </>
          ) : (
            <>
              <Send size={16} /> 답안 제출 ({filledCount}/{items.length})
            </>
          )}
        </button>
      </div>
    </div>
  );
}
