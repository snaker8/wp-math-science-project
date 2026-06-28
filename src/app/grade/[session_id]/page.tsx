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
    sub_scores?: SubScore[] | null;
    awarded_points?: number | null;
    max_points?: number | null;
  };
}

interface SubScore { number: string; points: number; awarded: number }

interface LocalMark {
  is_correct: boolean | null;
  error_cause: ErrorCause | null;
  teacher_note: string | null;
  dirty: boolean;           // 서버와 불일치 (저장 필요)
  saving?: boolean;
  savedAt?: string;
  // ★ 서술형 소문제별 부분점수 (있으면 점수 기반 채점)
  subScores?: SubScore[];
  awardedPoints?: number;
  maxPoints?: number;
}

/** answer_json 에서 소문제 배점 목록 추출 (서술형 부분점수 채점 대상 판별). */
function getSubQuestions(aj: Record<string, unknown> | null): Array<{ number: string; points: number }> {
  const arr = aj && Array.isArray((aj as Record<string, unknown>).subQuestions)
    ? ((aj as Record<string, unknown>).subQuestions as Array<{ number?: string | number; points?: number }>)
    : [];
  return arr.map((s, i) => ({ number: String(s?.number ?? i + 1), points: typeof s?.points === 'number' ? s.points : 0 }));
}

const SESSION_TYPE_LABEL: Record<string, string> = {
  BS: '광역 스캔',
  DD: '정밀 진단',
  PT: '선수 추적',
  SC: '스팟 체크',
  WS: '학습지',
  EX: '시험지',
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

  // 채점 완료 처리 상태
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

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
            subScores: it.result.sub_scores ?? undefined,
            awardedPoints: it.result.awarded_points ?? undefined,
            maxPoints: it.result.max_points ?? undefined,
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
    async (seq: number, data: { is_correct: boolean; error_cause?: ErrorCause | null; teacher_note?: string | null; sub_scores?: SubScore[] | null; awarded_points?: number | null; max_points?: number | null }) => {
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
              sub_scores: data.sub_scores ?? null,
              awarded_points: data.awarded_points ?? null,
              max_points: data.max_points ?? null,
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

  // ★ 서술형 소문제 부분점수 — 한 소문제 점수 변경 → 합계·정오 재계산 후 저장.
  const handleSubScore = useCallback((seq: number, subs: Array<{ number: string; points: number }>, idx: number, awardedRaw: number) => {
    const cur = marks[seq];
    const base: SubScore[] = subs.map((s) => {
      const existing = cur?.subScores?.find(x => x.number === s.number);
      return { number: s.number, points: s.points, awarded: existing?.awarded ?? 0 };
    });
    const clamped = Math.max(0, Math.min(subs[idx].points, Number.isFinite(awardedRaw) ? awardedRaw : 0));
    base[idx] = { ...base[idx], awarded: clamped };
    const maxPoints = subs.reduce((a, s) => a + s.points, 0);
    const awardedPoints = base.reduce((a, s) => a + s.awarded, 0);
    const isCorrect = maxPoints > 0 && awardedPoints >= maxPoints;
    setMarks(prev => ({ ...prev, [seq]: { ...prev[seq], is_correct: isCorrect, subScores: base, awardedPoints, maxPoints, dirty: true, saving: false } }));
    void saveOne(seq, {
      is_correct: isCorrect, error_cause: cur?.error_cause ?? null, teacher_note: cur?.teacher_note ?? null,
      sub_scores: base, awarded_points: awardedPoints, max_points: maxPoints,
    });
  }, [marks, saveOne]);

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
  // 채점 완료 처리 — 명시 버튼
  // ──────────────────────────────────
  const handleComplete = useCallback(async () => {
    if (completing) return;
    setCompleting(true);
    setCompleteError(null);
    try {
      // 1. dirty 마크(자동저장 실패 잔여) 일괄 재시도
      const pending = Object.entries(marks).filter(
        ([, m]) => m.dirty && m.is_correct !== null,
      );
      for (const [seqStr, m] of pending) {
        const seq = Number(seqStr);
        await saveOne(seq, {
          is_correct: m.is_correct as boolean,
          error_cause: m.error_cause,
          teacher_note: m.teacher_note,
        });
      }
      // 2. 명시 완료 처리 — print_sessions.completed_at = NOW()
      const res = await fetch(`/api/sessions/${sessionId}/complete`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // 3. 대시보드 복귀
      router.push('/dashboard/grading');
    } catch (e) {
      setCompleteError(e instanceof Error ? e.message : String(e));
      console.error('[grade] complete error:', e);
    } finally {
      setCompleting(false);
    }
  }, [completing, marks, saveOne, sessionId, router]);

  // ──────────────────────────────────
  // 집계
  // ──────────────────────────────────
  const stats = useMemo(() => {
    const total = items.length;
    let graded = 0;
    let fractionSum = 0; // ★ 부분점수 반영 — 서술형은 획득/만점 비율, 그 외는 정오(1/0)
    for (const it of items) {
      const m = marks[it.sequence_number];
      if (!m || m.is_correct === null) continue;
      graded++;
      if (m.maxPoints && m.maxPoints > 0) {
        fractionSum += Math.min(1, (m.awardedPoints ?? 0) / m.maxPoints);
      } else {
        fractionSum += m.is_correct ? 1 : 0;
      }
    }
    const correct = Math.round(fractionSum * 10) / 10;
    const pct = graded > 0 ? Math.round((fractionSum / graded) * 1000) / 10 : null;
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
          // ★ 서술형 + 소문제 배점 있으면 부분점수 채점, 아니면 O/X
          const subs = getSubQuestions(item.answer_json);
          const isShortAnswer = ((item.answer_json as Record<string, unknown> | null)?.type === 'short_answer') && subs.length > 0;
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

              {/* ★ 정답 — 채점 기준. answer_json 의 정답/소문제 배점을 표시(이미 받아오는 값). */}
              {(() => {
                const aj = (item.answer_json || {}) as Record<string, unknown>;
                const ans = String((aj.finalAnswer ?? aj.correct_answer ?? '') || '').trim();
                const subQ = Array.isArray(aj.subQuestions) ? (aj.subQuestions as Array<{ number?: string; points?: number; answer?: string }>) : [];
                if (!ans && subQ.length === 0) return null;
                return (
                  <div className="px-4 pb-2">
                    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2">
                      <div className="text-[11px] font-bold text-emerald-400 mb-1">정답</div>
                      {ans && (
                        <div className="text-sm leading-relaxed text-content-secondary">
                          <MixedContentRenderer content={ans} />
                        </div>
                      )}
                      {subQ.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {subQ.map((s, i) => (
                            <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              ({s.number ?? i + 1}) {s.points != null ? `${s.points}점` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 채점 — 서술형(소문제 배점 있음)은 소문제별 부분점수, 그 외는 O/X */}
              {isShortAnswer ? (
                <div className="px-4 pb-3 space-y-2">
                  {subs.map((s, idx) => {
                    const awarded = mark.subScores?.find(x => x.number === s.number)?.awarded ?? 0;
                    return (
                      <div key={s.number} className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-content-secondary w-10">({s.number})</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {Array.from({ length: s.points + 1 }, (_, p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => handleSubScore(item.sequence_number, subs, idx, p)}
                              className={`min-w-[34px] px-2 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                                awarded === p
                                  ? 'bg-indigo-500 text-white border-indigo-500'
                                  : 'bg-white/5 text-content-secondary border-white/10 hover:border-indigo-500/40'
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                          <span className="text-xs text-content-tertiary ml-1">/ {s.points}점</span>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-end gap-1 pt-1 text-sm">
                    <span className="text-content-tertiary">획득</span>
                    <span className="font-bold text-indigo-300">{mark.awardedPoints ?? 0}</span>
                    <span className="text-content-tertiary">/ {mark.maxPoints ?? subs.reduce((a, s) => a + s.points, 0)}점</span>
                  </div>
                </div>
              ) : (
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
              )}

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
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-emerald-600 text-white">
          {completeError && (
            <div className="bg-rose-700/90 px-4 py-1.5 text-xs text-center flex items-center justify-center gap-1">
              <AlertCircle size={12} /> {completeError}
            </div>
          )}
          <button
            type="button"
            onClick={handleComplete}
            disabled={completing}
            className="w-full px-4 py-3 hover:bg-emerald-500 active:bg-emerald-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <div className="text-center text-sm font-semibold flex items-center justify-center gap-2">
              {completing ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> 완료 처리 중…
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  채점 완료 — 정답률 {stats.pct}% (탭하여 마무리)
                </>
              )}
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
