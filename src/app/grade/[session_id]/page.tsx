'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Check, X, Loader2, ChevronLeft, Save, AlertCircle, Clock, CheckCircle2,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';

// ============================================================================
// Types — API 응답 형태와 맞춤
// ============================================================================
type ErrorCause = '개념' | '유형' | '계산' | '문장제' | '시간';
const ERROR_CAUSES: ErrorCause[] = ['개념', '유형', '계산', '문장제', '시간'];

interface SessionMeta {
  id: string;
  student_id: string;
  student_name: string;
  exam_id: string;
  exam_title: string;
  round_number: number;
  session_type: string;
  issued_at: string;
  started_at: string | null;
  completed_at: string | null;
  teacher_note: string | null;
}

interface GradeItem {
  sequence_number: number;
  problem_id: string;
  type_code: string | null;
  difficulty: number | null;
  content: string;
  answer_json: Record<string, unknown> | null;
  result: null | {
    is_correct: boolean;
    error_cause: ErrorCause | null;
    teacher_note: string | null;
    graded_at: string;
  };
}

interface LocalMark {
  is_correct: boolean | null;
  error_cause: ErrorCause | null;
  teacher_note: string | null;
  dirty: boolean;           // 서버와 불일치 (저장 필요)
  saving?: boolean;
  savedAt?: string;
}

const SESSION_TYPE_LABEL: Record<string, string> = {
  BS: '광역 스캔',
  DD: '정밀 진단',
  PT: '선수 추적',
  SC: '스팟 체크',
};

// ============================================================================
// Page
// ============================================================================
export default function GradeSessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = (params?.session_id as string) || '';

  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [items, setItems] = useState<GradeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 로컬 마킹 상태 — seq → mark
  const [marks, setMarks] = useState<Record<number, LocalMark>>({});

  // ──────────────────────────────────
  // 데이터 로드
  // ──────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMeta(data.session);
      setItems((data.items || []) as GradeItem[]);

      // 기존 채점 결과를 local marks 로 반영
      const m: Record<number, LocalMark> = {};
      for (const it of data.items || []) {
        if (it.result) {
          m[it.sequence_number] = {
            is_correct: it.result.is_correct,
            error_cause: it.result.error_cause,
            teacher_note: it.result.teacher_note,
            dirty: false,
            savedAt: it.result.graded_at,
          };
        } else {
          m[it.sequence_number] = {
            is_correct: null,
            error_cause: null,
            teacher_note: null,
            dirty: false,
          };
        }
      }
      setMarks(m);
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
  // 마킹 변경 — 개별 문항 자동 저장
  // ──────────────────────────────────
  const saveOne = useCallback(
    async (seq: number, data: { is_correct: boolean; error_cause?: ErrorCause | null; teacher_note?: string | null }) => {
      setMarks(prev => ({ ...prev, [seq]: { ...prev[seq], saving: true } }));
      try {
        const res = await fetch('/api/session-results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            results: [{
              sequence_number: seq,
              is_correct: data.is_correct,
              error_cause: data.error_cause ?? null,
              teacher_note: data.teacher_note ?? null,
            }],
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        setMarks(prev => ({
          ...prev,
          [seq]: {
            ...prev[seq],
            is_correct: data.is_correct,
            error_cause: data.error_cause ?? null,
            teacher_note: data.teacher_note ?? null,
            dirty: false,
            saving: false,
            savedAt: new Date().toISOString(),
          },
        }));
      } catch (e) {
        setMarks(prev => ({ ...prev, [seq]: { ...prev[seq], saving: false, dirty: true } }));
        console.error('[grade] saveOne error:', e);
      }
    },
    [sessionId],
  );

  const handleMark = useCallback((seq: number, isCorrect: boolean) => {
    setMarks(prev => ({
      ...prev,
      [seq]: {
        is_correct: isCorrect,
        error_cause: isCorrect ? null : (prev[seq]?.error_cause ?? null),
        teacher_note: prev[seq]?.teacher_note ?? null,
        dirty: true,
        saving: false,
      },
    }));
    // 즉시 저장 (fire-and-forget)
    void saveOne(seq, {
      is_correct: isCorrect,
      error_cause: isCorrect ? null : (marks[seq]?.error_cause ?? null),
      teacher_note: marks[seq]?.teacher_note ?? null,
    });
  }, [saveOne, marks]);

  const handleErrorCause = useCallback((seq: number, cause: ErrorCause | null) => {
    const current = marks[seq];
    if (!current || current.is_correct !== false) return; // X 인 경우에만 의미
    setMarks(prev => ({
      ...prev,
      [seq]: { ...prev[seq], error_cause: cause, dirty: true },
    }));
    void saveOne(seq, {
      is_correct: false,
      error_cause: cause,
      teacher_note: current.teacher_note ?? null,
    });
  }, [marks, saveOne]);

  // ──────────────────────────────────
  // 집계
  // ──────────────────────────────────
  const stats = useMemo(() => {
    const total = items.length;
    let graded = 0;
    let correct = 0;
    for (const it of items) {
      const m = marks[it.sequence_number];
      if (m?.is_correct === true) { graded++; correct++; }
      else if (m?.is_correct === false) { graded++; }
    }
    const pct = graded > 0 ? Math.round((correct / graded) * 1000) / 10 : null;
    return { total, graded, correct, pct };
  }, [items, marks]);

  // ──────────────────────────────────
  // 렌더
  // ──────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-surface-base text-content-primary flex items-center justify-center">
        <Loader2 className="animate-spin mr-2" size={18} /> 세션 로딩 중…
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="min-h-screen bg-surface-base text-content-primary p-6">
        <button type="button" onClick={() => router.back()} className="text-xs text-content-tertiary mb-3 flex items-center gap-1">
          <ChevronLeft size={14} /> 뒤로
        </button>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400 text-sm">
          {error || '세션을 찾을 수 없습니다.'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-base text-content-primary pb-20">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-surface-base/95 backdrop-blur border-b border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-xs text-content-tertiary mb-2 flex items-center gap-1"
        >
          <ChevronLeft size={14} /> 뒤로
        </button>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] text-content-tertiary mb-0.5">
              <span className="font-semibold">
                {SESSION_TYPE_LABEL[meta.session_type] || meta.session_type}
              </span>
              <span>·</span>
              <span>{meta.round_number}회차</span>
              {meta.completed_at && (
                <span className="ml-auto flex items-center gap-1 text-emerald-500">
                  <CheckCircle2 size={12} /> 완료
                </span>
              )}
            </div>
            <div className="font-bold text-sm truncate">{meta.student_name}</div>
            <div className="text-[11px] text-content-tertiary truncate">{meta.exam_title}</div>
          </div>
        </div>

        {/* 진행률 바 */}
        <div className="mt-3">
          <div className="flex justify-between items-center text-[11px] text-content-tertiary mb-1">
            <span>
              채점 {stats.graded}/{stats.total}
              {stats.pct != null && <span className="ml-2 text-emerald-400">{stats.pct}% 정답</span>}
            </span>
            <span>{stats.correct}O · {stats.graded - stats.correct}X</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all"
              style={{ width: stats.total > 0 ? `${(stats.graded / stats.total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      </header>

      {/* 문항 리스트 */}
      <div className="p-4 space-y-4">
        {items.length === 0 && (
          <div className="text-center text-content-tertiary py-10">문항이 없습니다.</div>
        )}
        {items.map(item => {
          const mark = marks[item.sequence_number] || {
            is_correct: null, error_cause: null, teacher_note: null, dirty: false,
          };
          const isO = mark.is_correct === true;
          const isX = mark.is_correct === false;
          return (
            <div
              key={item.sequence_number}
              className={`rounded-2xl border bg-surface-card overflow-hidden ${
                isO ? 'border-emerald-500/40' :
                isX ? 'border-red-500/40' :
                'border-white/10'
              }`}
            >
              {/* 상단: 번호 + 코드/난이도 배지 */}
              <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-white/10 bg-surface-raised/40">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">{item.sequence_number}.</span>
                  {item.type_code && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                      {item.type_code}
                    </span>
                  )}
                  {item.difficulty != null && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      ★{item.difficulty}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-content-tertiary flex items-center gap-1">
                  {mark.saving ? (
                    <>
                      <Loader2 size={10} className="animate-spin" /> 저장중
                    </>
                  ) : mark.dirty ? (
                    <>
                      <Clock size={10} /> 미저장
                    </>
                  ) : mark.savedAt ? (
                    <>
                      <Check size={10} className="text-emerald-500" /> 저장됨
                    </>
                  ) : null}
                </div>
              </div>

              {/* 문제 내용 */}
              <div className="px-4 py-3 text-sm leading-relaxed">
                <MixedContentRenderer content={item.content} />
              </div>

              {/* O / X 버튼 */}
              <div className="grid grid-cols-2 gap-2 px-4 pb-3">
                <button
                  type="button"
                  onClick={() => handleMark(item.sequence_number, true)}
                  className={`flex items-center justify-center gap-1 py-3 rounded-xl font-bold text-lg transition-all ${
                    isO
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'bg-white/5 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10'
                  }`}
                  aria-label="정답"
                >
                  <Check size={22} />
                  <span>O</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleMark(item.sequence_number, false)}
                  className={`flex items-center justify-center gap-1 py-3 rounded-xl font-bold text-lg transition-all ${
                    isX
                      ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                      : 'bg-white/5 text-red-400 border border-red-500/30 hover:bg-red-500/10'
                  }`}
                  aria-label="오답"
                >
                  <X size={22} />
                  <span>X</span>
                </button>
              </div>

              {/* 오답 원인 — X 일 때만 표시 */}
              {isX && (
                <div className="px-4 pb-3 space-y-2">
                  <div className="text-[11px] text-content-tertiary flex items-center gap-1">
                    <AlertCircle size={12} /> 오답 원인
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ERROR_CAUSES.map(cause => {
                      const selected = mark.error_cause === cause;
                      return (
                        <button
                          key={cause}
                          type="button"
                          onClick={() => handleErrorCause(item.sequence_number, selected ? null : cause)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            selected
                              ? 'bg-red-500 text-white border-red-500'
                              : 'bg-white/5 text-red-400 border-red-500/30 hover:bg-red-500/10'
                          }`}
                        >
                          {cause}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 하단 고정 — 전체 저장 (이미 per-problem 저장되지만 안전망) */}
      {stats.graded > 0 && stats.graded < stats.total && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-surface-base/95 backdrop-blur border-t border-white/10 px-4 py-3">
          <div className="text-center text-xs text-content-tertiary flex items-center justify-center gap-2">
            <Save size={12} />
            변경사항은 자동 저장됩니다 · {stats.total - stats.graded}문항 남음
          </div>
        </div>
      )}
      {stats.graded === stats.total && stats.total > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-emerald-600 text-white px-4 py-3">
          <div className="text-center text-sm font-semibold flex items-center justify-center gap-2">
            <CheckCircle2 size={16} />
            채점 완료 — 정답률 {stats.pct}%
          </div>
        </div>
      )}
    </div>
  );
}
