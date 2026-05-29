'use client';

// ============================================================================
// StudentsTab — exam-analysis 페이지의 "학생 채점" 탭
//
// 기능:
//   1) 학생 답안 엑셀 일괄 업로드 (수직형 1인/파일 또는 수평형 학급/파일)
//   2) 업로드 결과 요약 (학생 N명 처리, M명 신규 등록)
//   3) 채점된 학생 리스트 (학년/반/이름/점수/채점일시/리포트보기/삭제)
//   4) 행 클릭 → /dashboard/exam-analysis/[examId]/students/[studentId] 이동
// ============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  ExternalLink,
  Users,
  X as XIcon,
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

interface UploadResultRow {
  studentName: string;
  rosterId: string;
  sessionId: string | null;
  totalEarned: number;
  totalPossible: number;
  gradedCount: number;
  ungraded: number;
  isNewRoster: boolean;
  status: 'ok' | 'no_match' | 'error';
  message?: string;
}

interface UploadResponse {
  ok: boolean;
  examTitle?: string;
  results: UploadResultRow[];
  warnings: string[];
  error?: string;
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
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  // ----------- 업로드 -----------
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploadBusy(true);
      setUploadResult(null);
      setError(null);

      try {
        const fd = new FormData();
        Array.from(files).forEach((f) => fd.append('files', f));

        const r = await fetch(`/api/exams/${examId}/student-responses`, {
          method: 'POST',
          body: fd,
        });
        const d = (await r.json()) as UploadResponse;
        if (!r.ok || !d.ok) {
          setError(d.error || `HTTP ${r.status}`);
          return;
        }
        setUploadResult(d);
        await fetchStudents();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setUploadBusy(false);
      }
    },
    [examId, fetchStudents]
  );

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
      {/* ───── 업로드 카드 ───── */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Upload size={18} className="text-indigo-400" />
              학생 답안 엑셀 업로드
            </h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              수직형(1파일=1학생, 파일명에 학생이름) 또는 수평형(1파일=학급, "이름" 컬럼) 둘 다 지원.
              <br />
              컬럼: <span className="text-zinc-300">문제·점수·배점</span> (수직) 또는{' '}
              <span className="text-zinc-300">이름·1·2·3...</span> (수평)
            </p>
          </div>
          <button
            onClick={fetchStudents}
            disabled={loading}
            className="shrink-0 text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <label
          className={`block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            uploadBusy
              ? 'border-zinc-700 bg-zinc-800/40 cursor-not-allowed'
              : 'border-zinc-700 hover:border-indigo-500 hover:bg-indigo-500/5'
          }`}
        >
          <input
            type="file"
            multiple
            accept=".xlsx,.xls,.csv,.tsv"
            className="hidden"
            disabled={uploadBusy}
            onClick={(e) => ((e.target as HTMLInputElement).value = '')}
            onChange={(e) => handleFiles(e.target.files)}
          />
          {uploadBusy ? (
            <div className="flex items-center justify-center gap-2 text-indigo-400">
              <Loader2 size={18} className="animate-spin" />
              <span className="font-bold">업로드 및 채점 중...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <FileSpreadsheet size={28} className="text-zinc-500" />
              <p className="text-sm font-bold text-zinc-300">
                파일을 선택하거나 여기로 드래그
              </p>
              <p className="text-xs text-zinc-500">
                .xlsx / .xls / .csv / .tsv · 다중 파일 가능
              </p>
            </div>
          )}
        </label>

        {/* 업로드 결과 */}
        {uploadResult && (
          <div className="mt-4 bg-zinc-950/50 border border-zinc-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={14} />
                업로드 결과 (학생 {uploadResult.results.length}명)
              </p>
              <button
                onClick={() => setUploadResult(null)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <XIcon size={14} />
              </button>
            </div>
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {uploadResult.results.map((r, i) => (
                <li
                  key={i}
                  className="text-xs flex items-center justify-between bg-zinc-900/50 px-2 py-1.5 rounded"
                >
                  <span className="flex items-center gap-2">
                    {r.status === 'ok' ? (
                      <CheckCircle2 size={12} className="text-emerald-500" />
                    ) : (
                      <AlertTriangle size={12} className="text-amber-400" />
                    )}
                    <span className="font-bold text-zinc-200">{r.studentName}</span>
                    {r.isNewRoster && (
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded">
                        신규
                      </span>
                    )}
                  </span>
                  <span className="text-zinc-400">
                    {r.status === 'ok' ? (
                      <>
                        {r.totalEarned}/{r.totalPossible}점 · {r.gradedCount}문항 채점
                        {r.ungraded > 0 && ` · 미응답 ${r.ungraded}`}
                      </>
                    ) : (
                      r.message || r.status
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {uploadResult.warnings.length > 0 && (
              <details className="text-xs text-amber-400">
                <summary className="cursor-pointer font-bold">
                  경고 {uploadResult.warnings.length}건
                </summary>
                <ul className="mt-1 pl-3 space-y-0.5">
                  {uploadResult.warnings.map((w, i) => (
                    <li key={i} className="list-disc text-zinc-400">
                      {w}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

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
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Users size={18} className="text-indigo-400" />
            채점된 학생
            <span className="text-xs font-normal text-zinc-400">
              ({students.length}명)
            </span>
          </h3>
        </div>

        {loading ? (
          <div className="p-10 text-center">
            <Loader2 size={20} className="inline animate-spin text-zinc-500" />
          </div>
        ) : students.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-500">
            아직 채점된 학생이 없습니다. 위에서 엑셀을 업로드하세요.
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
                    <td className="px-4 py-2.5 font-bold text-white flex items-center gap-2">
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
                        className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-bold text-xs"
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
