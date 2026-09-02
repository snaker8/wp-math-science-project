'use client';

// ============================================================================
// StudentsTab — exam-analysis 페이지의 "학생 채점" 탭
//
// 기능:
//   1) 채점된 학생 리스트 (학년/반/이름/점수/채점일시/리포트보기/삭제)
//   2) 행 클릭 → /dashboard/exam-analysis/[examId]/students/[studentId] 이동
//
// ★ 엑셀 일괄 업로드는 제거했다 (2026-09-02).
//   대표 판단: "엑셀채점은 이제 필요없을거 같다 / 사용할일이 없다".
//   채점은 QR 세션으로 일원화한다.
// ============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Loader2,
  AlertTriangle,
  Trash2,
  ExternalLink,
  Users,
  RefreshCw,
} from 'lucide-react';

interface StudentSummary {
  rosterId: string;
  sessionId: string;
  fullName: string;
  grade: number | null;
  classLabel: string | null;
  isPromoted: boolean;
  correctCount: number;
  totalGraded: number;
  scorePct: number;
  conductedAt: string | null;
}

export default function StudentsTab({ examId }: { examId: string }) {
  // (tracks) 라우트 그룹 안에서는 [track] 동적 세그먼트가 URL 에 포함됨 (e.g. /math/dashboard/...).
  // 직접 dashboard/ 경로에서 접근하면 track 이 undefined. 둘 다 지원.
  const params = useParams();
  const track = params?.track as string | undefined;
  const baseHref = track
    ? `/${track}/dashboard/exam-analysis/${examId}/students`
    : `/dashboard/exam-analysis/${examId}/students`;

  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 활성 센터 표시용 — 변경은 TopNav 우측 드롭다운에서 (쿠키 기반)
  const [activeInstituteName, setActiveInstituteName] = useState<string | null>(
    null
  );
  const [canSwitch, setCanSwitch] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/me/active-institute', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        setActiveInstituteName(d.activeInstituteName ?? null);
        setCanSwitch(!!d.canSwitch);
      } catch {
        // 무시
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ----------- 학생 리스트 조회 -----------
  const fetchStudents = useCallback(async () => {
    if (!examId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/exams/${examId}/students`, { cache: 'no-store' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || `HTTP ${r.status}`);
        setStudents([]);
        return;
      }
      const d = await r.json();
      setStudents(d.students || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // ----------- 학생 삭제 (세션 삭제) -----------
  const handleDelete = useCallback(
    async (s: StudentSummary) => {
      if (!confirm(`${s.fullName} 학생의 이 시험 채점 결과를 삭제할까요?`)) return;
      setDeletingId(s.sessionId);
      try {
        const r = await fetch(
          `/api/exams/${examId}/students?sessionId=${encodeURIComponent(s.sessionId)}`,
          { method: 'DELETE' }
        );
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          alert(`삭제 실패: ${d.error || r.status}`);
          return;
        }
        setStudents((prev) => prev.filter((x) => x.sessionId !== s.sessionId));
      } finally {
        setDeletingId(null);
      }
    },
    [examId]
  );

  // ============================================================================
  // Render
  // ============================================================================
  return (
    <div className="space-y-6">
      {/* 엑셀 일괄 업로드 카드는 제거했다 (2026-09-02).
          대표 판단: "엑셀채점은 이제 필요없을거 같다 / 사용할일이 없다".
          채점은 QR 세션(print_sessions + session_results)으로 일원화한다.
          이 화면은 **채점된 학생 목록·리포트 링크**만 남긴다. */}

      {/* ───── 에러 ───── */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg p-3 text-sm flex items-center gap-2">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* ───── 학생 리스트 ───── */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-base font-semibold text-content-primary flex items-center gap-2">
            <Users size={18} className="text-content-tertiary" />
            채점된 학생
            <span className="text-xs font-normal text-zinc-400">
              ({students.length}명)
            </span>
          </h3>
          {/* 업로드 카드가 사라지면서 새로고침 버튼도 같이 없어져 여기로 옮겼다 */}
          <button
            onClick={fetchStudents}
            disabled={loading}
            className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/[.06] hover:text-content-primary disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center">
            <Loader2 size={20} className="inline animate-spin text-zinc-500" />
          </div>
        ) : students.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-500">
            아직 채점된 학생이 없습니다. 채점하기에서 QR 세션으로 채점하세요.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-950/60 text-zinc-400">
                <tr>
                  <th className="px-4 py-2.5 text-left font-bold w-16">학년</th>
                  <th className="px-4 py-2.5 text-left font-bold w-20">반</th>
                  <th className="px-4 py-2.5 text-left font-bold">이름</th>
                  <th className="px-4 py-2.5 text-center font-bold w-24">
                    채점/총문항
                  </th>
                  <th className="px-4 py-2.5 text-center font-bold w-20">정답률</th>
                  <th className="px-4 py-2.5 text-left font-bold w-32">채점일시</th>
                  <th className="px-4 py-2.5 text-center font-bold w-32">리포트</th>
                  <th className="px-4 py-2.5 text-center font-bold w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {students.map((s) => (
                  <tr key={s.sessionId} className="hover:bg-zinc-800/40">
                    <td className="px-4 py-2.5 text-zinc-300">{s.grade ?? '-'}</td>
                    <td className="px-4 py-2.5 text-zinc-300">{s.classLabel ?? '-'}</td>
                    <td className="px-4 py-2.5 font-semibold text-content-primary flex items-center gap-2">
                      {s.fullName}
                      {s.isPromoted && (
                        <span
                          className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded"
                          title="실제 회원가입 사용자와 머지됨"
                        >
                          연결
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center text-zinc-300">
                      {s.correctCount}/{s.totalGraded}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`font-black ${
                          s.scorePct >= 80
                            ? 'text-emerald-400'
                            : s.scorePct >= 60
                              ? 'text-amber-400'
                              : 'text-rose-400'
                        }`}
                      >
                        {s.scorePct}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs">
                      {s.conductedAt
                        ? new Date(s.conductedAt).toLocaleDateString('ko-KR', {
                            year: '2-digit',
                            month: '2-digit',
                            day: '2-digit',
                          })
                        : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <Link
                        href={`${baseHref}/${s.rosterId}`}
                        className="inline-flex items-center gap-1 text-content-secondary hover:text-content-primary font-semibold text-xs whitespace-nowrap"
                      >
                        <ExternalLink size={12} /> 리포트
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => handleDelete(s)}
                        disabled={deletingId === s.sessionId}
                        className="text-zinc-500 hover:text-rose-400 p-1 rounded disabled:opacity-50"
                        title="이 채점 결과 삭제"
                      >
                        {deletingId === s.sessionId ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
