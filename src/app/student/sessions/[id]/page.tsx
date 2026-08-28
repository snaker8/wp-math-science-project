'use client';

// ============================================================================
// /student/sessions/[id] — 학생 본인 진단평가 결과 상세 (read-only)
//   API: GET /api/sessions/[id] (학생 본인 검증 통과)
//   본인이 채점된 진단평가의 O/X·정답·본인 답·정답률 확인.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, Loader2, HelpCircle } from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { useSmartBack } from '@/lib/navigation/useSmartBack';

type ErrorCause = '개념' | '유형' | '계산' | '문장제' | '시간';

interface ItemRow {
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

interface SessionData {
  id: string;
  student_name: string;
  exam_title: string;
  round_number: number;
  session_type: string;
  issued_at: string;
  completed_at: string | null;
}

const SESSION_TYPE_LABEL: Record<string, string> = {
  BS: '광역 스캔',
  DD: '정밀 진단',
  PT: '선수 추적',
  SC: '스팟 체크',
  WS: '학습지',
  EX: '시험지',
};

// teacher_note 에서 "[학생답: ...]" 추출
function extractStudentAnswer(note: string | null | undefined): string | null {
  if (!note) return null;
  const m = note.match(/\[학생답:\s*([^\]]+)\]/);
  return m ? m[1].trim() : null;
}

// answer_json 에서 정답 추출 (간단)
function extractCorrectAnswer(aj: Record<string, unknown> | null | undefined): string {
  if (!aj) return '';
  const v = (aj.finalAnswer ?? aj.correct_answer ?? aj.answer ?? '') as unknown;
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return '';
}

export default function StudentSessionResultPage() {
  const params = useParams();
  const router = useRouter();
  const goBack = useSmartBack('/student/exams');
  const sessionId = (params?.id as string) || '';

  const [session, setSession] = useState<SessionData | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSession(data.session as SessionData);
      setItems((data.items || []) as ItemRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) void load();
  }, [sessionId, load]);

  const stats = useMemo(() => {
    const total = items.length;
    let graded = 0;
    let correct = 0;
    const wrongCauses: Record<string, number> = {};
    for (const it of items) {
      if (!it.result) continue;
      graded++;
      if (it.result.is_correct) correct++;
      else if (it.result.error_cause) {
        wrongCauses[it.result.error_cause] = (wrongCauses[it.result.error_cause] || 0) + 1;
      }
    }
    const pct = graded > 0 ? Math.round((correct / graded) * 1000) / 10 : null;
    return { total, graded, correct, wrong: graded - correct, pct, wrongCauses };
  }, [items]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center text-zinc-500 gap-2">
        <Loader2 size={18} className="animate-spin" /> 불러오는 중…
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-white p-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-xs text-zinc-500 mb-3 flex items-center gap-1"
        >
          <ArrowLeft size={14} /> 뒤로
        </button>
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 text-sm flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5" /> {error || '세션을 찾을 수 없습니다.'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={goBack}
            className="p-2 rounded-lg border border-gray-200 text-zinc-600 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-0.5">
              <span className="font-semibold">{SESSION_TYPE_LABEL[session.session_type] || session.session_type}</span>
              <span>·</span>
              <span>R{session.round_number}</span>
              {session.completed_at && (
                <span className="ml-auto flex items-center gap-1 text-green-600">
                  <CheckCircle2 size={12} /> 완료
                </span>
              )}
            </div>
            <h1 className="text-lg font-bold text-zinc-900 truncate">{session.exam_title}</h1>
          </div>
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">전체</p>
            <p className="text-lg font-bold text-zinc-900">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-center">
            <p className="text-[10px] text-emerald-600 uppercase tracking-wider">정답</p>
            <p className="text-lg font-bold text-emerald-700">{stats.correct}</p>
          </div>
          <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-center">
            <p className="text-[10px] text-rose-600 uppercase tracking-wider">오답</p>
            <p className="text-lg font-bold text-rose-700">{stats.wrong}</p>
          </div>
          <div className="rounded-xl border border-zinc-300 bg-zinc-100 p-3 text-center">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider">정답률</p>
            <p className="text-lg font-bold text-zinc-900 tabular-nums">
              {stats.pct != null ? `${stats.pct}%` : '-'}
            </p>
          </div>
        </div>

        {/* 오답 원인 별 집계 */}
        {Object.keys(stats.wrongCauses).length > 0 && (
          <div className="mb-6 rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-zinc-700 mb-2">오답 원인 분석</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.wrongCauses).map(([cause, n]) => (
                <span
                  key={cause}
                  className="px-2.5 py-1 rounded-full text-xs bg-zinc-50 text-zinc-700 border border-zinc-200 tabular-nums"
                >
                  {cause} · {n}건
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 문항 리스트 */}
        <div className="space-y-3">
          {items.length === 0 && (
            <div className="text-center text-zinc-400 py-10 text-sm">문항이 없습니다.</div>
          )}
          {items.map((it) => {
            const studentAnswer = extractStudentAnswer(it.result?.teacher_note);
            const correctAnswer = extractCorrectAnswer(it.answer_json);
            const isCorrect = it.result?.is_correct === true;
            const isWrong = it.result?.is_correct === false;
            const ungraded = !it.result;
            return (
              <div
                key={it.sequence_number}
                className={`rounded-xl border p-4 ${
                  ungraded
                    ? 'border-gray-200 bg-gray-50'
                    : isCorrect
                      ? 'border-emerald-200 bg-emerald-50/30'
                      : 'border-rose-200 bg-rose-50/30'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-bold text-zinc-900 w-7">{it.sequence_number}</span>
                  {ungraded ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 flex items-center gap-1">
                      <HelpCircle size={10} /> 미채점
                    </span>
                  ) : isCorrect ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 size={10} /> 정답
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 flex items-center gap-1">
                      <XCircle size={10} /> 오답
                    </span>
                  )}
                  {it.result?.error_cause && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-50 text-zinc-700 border border-zinc-200">
                      {it.result.error_cause}
                    </span>
                  )}
                </div>
                {it.content && (
                  <div className="text-sm text-zinc-700 mb-3 line-clamp-3">
                    <MixedContentRenderer content={it.content} />
                  </div>
                )}
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-zinc-500">내 답: </span>
                    <span className={`font-semibold ${isWrong ? 'text-rose-600' : 'text-zinc-700'}`}>
                      {studentAnswer || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500">정답: </span>
                    <span className="font-semibold text-emerald-700">{correctAnswer || '—'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
