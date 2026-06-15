'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSmartBack } from '@/lib/navigation/useSmartBack';
import {
  ArrowLeft,
  ClipboardList,
  PlayCircle,
  CheckCircle2,
  MinusCircle,
  Eye,
  Loader2,
  AlertCircle,
} from 'lucide-react';

// ============================================================================
// /student/exams — 학생 본인 진단평가 목록 + 결과 요약
//   API: GET /api/students/me/sessions
//   세션 유형: BS(광역 스캔) / DD(정밀 진단) / PT(선수 추적) / SC(스팟 체크)
// ============================================================================

interface SessionRow {
  id: string;
  exam_id: string;
  exam_title: string;
  round_number: number;
  session_type: 'BS' | 'DD' | 'PT' | 'SC' | string;
  issued_at: string;
  started_at: string | null;
  completed_at: string | null;
  problems_total: number;
  problems_graded: number;
  correct_cnt: number;
  score_pct: number | null;
}

type DerivedStatus = '미응시' | '진행중' | '완료';

const SESSION_TYPE_LABEL: Record<string, string> = {
  BS: '광역 스캔',
  DD: '정밀 진단',
  PT: '선수 추적',
  SC: '스팟 체크',
  WS: '학습지',
  EX: '시험지',
};

function deriveStatus(s: SessionRow): DerivedStatus {
  if (s.completed_at) return '완료';
  if (s.problems_graded > 0) return '진행중';
  return '미응시';
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return iso.slice(0, 10);
  }
}

export default function StudentExamsPage() {
  const goBack = useSmartBack('/student');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/students/me/sessions');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) setSessions((data.sessions || []) as SessionRow[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = {
    pending: sessions.filter((s) => deriveStatus(s) === '미응시').length,
    progress: sessions.filter((s) => deriveStatus(s) === '진행중').length,
    done: sessions.filter((s) => deriveStatus(s) === '완료').length,
  };

  const getStatusBadge = (status: DerivedStatus) => {
    switch (status) {
      case '미응시':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
            <MinusCircle size={12} />
            미응시
          </span>
        );
      case '진행중':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
            <PlayCircle size={12} />
            진행중
          </span>
        );
      case '완료':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-600 border border-green-200">
            <CheckCircle2 size={12} />
            완료
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            type="button"
            onClick={goBack}
            className="p-2 rounded-lg border border-gray-200 text-zinc-600 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">시험·진단 목록</h1>
            <p className="text-sm text-zinc-500 mt-1">나의 진단평가 현황과 결과를 확인하세요</p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20 text-zinc-500 gap-2">
            <Loader2 size={18} className="animate-spin" /> 불러오는 중…
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2 p-4 mb-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm">
            <AlertCircle size={16} className="mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {!loading && (
          <>
            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl">
                <MinusCircle size={20} className="text-gray-400" />
                <div>
                  <p className="text-lg font-bold text-zinc-900">{counts.pending}</p>
                  <p className="text-xs text-zinc-500">미응시</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <PlayCircle size={20} className="text-blue-500" />
                <div>
                  <p className="text-lg font-bold text-zinc-900">{counts.progress}</p>
                  <p className="text-xs text-zinc-500">진행중</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-xl">
                <CheckCircle2 size={20} className="text-green-500" />
                <div>
                  <p className="text-lg font-bold text-zinc-900">{counts.done}</p>
                  <p className="text-xs text-zinc-500">완료</p>
                </div>
              </div>
            </div>

            {/* Sessions Table - Desktop */}
            <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">시험명</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">유형</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">회차</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">발급일</th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">상태</th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">정답률</th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sessions.map((s) => {
                    const status = deriveStatus(s);
                    return (
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4">
                          <p className="text-sm font-medium text-zinc-800">{s.exam_title || '(제목 없음)'}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm text-zinc-500">{SESSION_TYPE_LABEL[s.session_type] || s.session_type}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm text-zinc-500">R{s.round_number}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm text-zinc-500">{fmtDate(s.issued_at)}</p>
                        </td>
                        <td className="px-5 py-4 text-center">{getStatusBadge(status)}</td>
                        <td className="px-5 py-4 text-center">
                          {s.score_pct != null ? (
                            <span className="text-sm font-semibold text-indigo-600">
                              {s.score_pct}% ({s.correct_cnt}/{s.problems_graded})
                            </span>
                          ) : (
                            <span className="text-sm text-zinc-300">-</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-center">
                          {status === '미응시' && (
                            <Link
                              href={`/answer/${s.id}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                            >
                              응시하기
                            </Link>
                          )}
                          {status === '진행중' && (
                            <Link
                              href={`/answer/${s.id}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              이어서
                            </Link>
                          )}
                          {status === '완료' && (
                            <Link
                              href={`/student/sessions/${s.id}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white text-indigo-600 text-xs font-medium rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors"
                            >
                              <Eye size={12} />
                              결과보기
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Sessions Cards - Mobile */}
            <div className="md:hidden space-y-3">
              {sessions.map((s) => {
                const status = deriveStatus(s);
                return (
                  <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-zinc-800">{s.exam_title || '(제목 없음)'}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {SESSION_TYPE_LABEL[s.session_type] || s.session_type} · R{s.round_number}
                        </p>
                      </div>
                      {getStatusBadge(status)}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-500 mb-3">
                      <span>{fmtDate(s.issued_at)}</span>
                      {s.score_pct != null && (
                        <span className="font-semibold text-indigo-600">
                          {s.score_pct}% ({s.correct_cnt}/{s.problems_graded})
                        </span>
                      )}
                    </div>
                    <div>
                      {status === '미응시' && (
                        <Link
                          href={`/answer/${s.id}`}
                          className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          응시하기
                        </Link>
                      )}
                      {status === '진행중' && (
                        <Link
                          href={`/answer/${s.id}`}
                          className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          이어서
                        </Link>
                      )}
                      {status === '완료' && (
                        <Link
                          href={`/student/sessions/${s.id}`}
                          className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-white text-indigo-600 text-sm font-medium rounded-lg border border-indigo-200 hover:bg-indigo-50 transition-colors"
                        >
                          <Eye size={14} />
                          결과보기
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Empty State */}
            {sessions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <ClipboardList size={48} className="text-gray-300 mb-4" />
                <p className="text-zinc-600 font-medium">진단평가가 없습니다</p>
                <p className="text-sm text-zinc-400 mt-1">선생님이 발급하면 여기에 표시됩니다</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
