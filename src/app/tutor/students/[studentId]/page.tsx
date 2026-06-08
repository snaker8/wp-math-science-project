'use client';

// ============================================================================
// /tutor/students/[studentId] — 학생 통합 상세 허브 (2026-06-08)
//   흩어진 학생 화면(성적·진단·개별 리포트·관리)을 한 학생당 한 페이지 탭으로 통합.
//   데이터는 기존 analytics API(/api/students/[id]/analytics) 재사용 — 새 백엔드 0, 가산.
//   1단계: 라우트 + 탭 골격 + 개요. 2단계: 개별 리포트 탭(시험지별 리포트 카드).
//   성적·진단·관리 탭은 후속 단계에서 기존 페이지 로직 이식 (지금은 진입 링크).
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, FileText, BarChart3, Brain, Settings, LayoutDashboard,
  ExternalLink, Loader2, AlertTriangle, Activity, Target, Calendar,
  type LucideIcon,
} from 'lucide-react';
import { gradeIntToLabel } from '@/lib/students/grade-label';

interface SessionRow {
  id: string;
  exam_id: string;
  exam_title: string;
  round_number: number;
  session_type: string;
  issued_at: string;
  completed_at: string | null;
  total: number;
  correct: number;
  pct: number | null;
  report_student_id?: string | null;
}
interface AnalyticsData {
  student: { id: string; name: string; grade: number | null };
  source?: 'user' | 'roster';
  summary: {
    totalSessions: number;
    totalGraded: number;
    avgScorePct: number | null;
    lastActiveAt: string | null;
  };
  errorCauses: Record<string, number>;
  sessions: SessionRow[];
}

const SESSION_TYPE_LABEL: Record<string, string> = {
  BS: '광역 스캔', DD: '정밀 진단', PT: '선수 추적', SC: '스팟 체크', EX: '시험 분석',
};

const TABS: Array<{ key: string; label: string; icon: LucideIcon }> = [
  { key: 'overview', label: '개요', icon: LayoutDashboard },
  { key: 'grades', label: '성적', icon: BarChart3 },
  { key: 'diagnostics', label: '진단', icon: Brain },
  { key: 'reports', label: '개별 리포트', icon: FileText },
  { key: 'manage', label: '관리', icon: Settings },
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
  } catch {
    return iso.slice(0, 10);
  }
}

function StatCell({ label, value, sub, icon: Icon }: {
  label: string; value: string | number; sub?: string; icon: LucideIcon;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
        <Icon size={14} /> {label}
      </div>
      <div className="text-2xl font-bold text-zinc-900">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function StudentHubPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = (params?.studentId as string) || '';

  const [tab, setTab] = useState('overview');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/students/${studentId}/analytics`)
      .then((r) => r.json().then((j) => {
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        return j as AnalyticsData;
      }))
      .then((j) => { if (!cancelled) setData(j); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  // 개별 리포트 — exam_id 있는 시험지 세션 (최신순)
  const reportSessions = useMemo(
    () => (data?.sessions || []).filter((s) => !!s.exam_id),
    [data],
  );

  const studentName = data?.student.name || '학생';
  const gradeLabel = data?.student.grade != null ? gradeIntToLabel(data.student.grade) : null;

  return (
    <div className="min-h-screen bg-gray-50 text-zinc-900">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={() => router.push('/tutor/students')}
            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-gray-800 hover:bg-gray-100"
            title="학생 목록"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold truncate">{studentName}</h1>
              {gradeLabel && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200">
                  {gradeLabel}
                </span>
              )}
              {data?.source && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">
                  {data.source === 'roster' ? '채점명단' : '정식'}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">학생 통합 상세 — 성적·진단·개별 리포트·관리</p>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex items-center gap-1 border-b border-gray-200 mb-5 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-400 hover:text-gray-700'
                }`}
              >
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* 본문 */}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <Loader2 className="animate-spin mr-2" size={18} /> 불러오는 중…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 text-sm">
            <AlertTriangle size={16} /> {error}
          </div>
        ) : !data ? null : (
          <>
            {/* ── 개요 ── */}
            {tab === 'overview' && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCell label="평균 정답률" value={data.summary.avgScorePct != null ? `${data.summary.avgScorePct}%` : '-'} icon={Target} />
                <StatCell label="세션 수" value={data.summary.totalSessions} icon={Activity} />
                <StatCell label="채점 문항" value={data.summary.totalGraded} icon={FileText} />
                <StatCell label="최근 활동" value={fmtDate(data.summary.lastActiveAt)} icon={Calendar} />
                <div className="col-span-2 md:col-span-4 mt-2 flex flex-wrap gap-2">
                  <button onClick={() => setTab('reports')} className="text-sm font-semibold px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                    개별 리포트 보기 ({reportSessions.length})
                  </button>
                  <button onClick={() => setTab('diagnostics')} className="text-sm font-semibold px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100">
                    진단 보기
                  </button>
                </div>
              </div>
            )}

            {/* ── 개별 리포트 (2단계 핵심) ── */}
            {tab === 'reports' && (
              <div>
                {reportSessions.length === 0 ? (
                  <div className="py-16 text-center text-gray-400 text-sm">
                    채점된 시험지가 없습니다.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {reportSessions.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-3 p-4 rounded-xl border border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm transition-all">
                        <div className="min-w-0">
                          <div className="font-bold text-zinc-800 truncate">{s.exam_title || '(제목 없음)'}</div>
                          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                            <span>{SESSION_TYPE_LABEL[s.session_type] || s.session_type} · R{s.round_number}</span>
                            <span>· {fmtDate(s.issued_at)}</span>
                            <span>·{' '}
                              {s.pct != null ? (
                                <span className="font-bold text-indigo-600">{s.pct}%</span>
                              ) : '-'}
                              <span className="text-gray-400"> ({s.correct}/{s.total})</span>
                            </span>
                          </div>
                        </div>
                        <Link
                          href={`/dashboard/exam-analysis/${s.exam_id}/students/${s.report_student_id || studentId}`}
                          target="_blank"
                          className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
                        >
                          <FileText size={14} /> 리포트 보기
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── 성적 (후속 단계: /tutor/analytics 이식) ── */}
            {tab === 'grades' && (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-500 mb-3">통합 성적표는 다음 단계에서 이 탭으로 이식됩니다.</p>
                <Link href="/tutor/analytics" className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                  <ExternalLink size={14} /> 현재 성적 분석 페이지 열기
                </Link>
              </div>
            )}

            {/* ── 진단 (후속 단계: prescription 이식) ── */}
            {tab === 'diagnostics' && (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-500 mb-3">히트맵·단원 상태·약점 체인은 다음 단계에서 이 탭으로 이식됩니다.</p>
                <Link href="/dashboard/prescription" className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                  <ExternalLink size={14} /> 현재 학생 진단 페이지 열기
                </Link>
              </div>
            )}

            {/* ── 관리 (후속 단계: /tutor/students 편집 이식) ── */}
            {tab === 'manage' && (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-500 mb-3">학교·학년·반·연락처 편집은 다음 단계에서 이 탭으로 이식됩니다.</p>
                <Link href="/tutor/students" className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                  <ExternalLink size={14} /> 학생 관리 페이지 열기
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
