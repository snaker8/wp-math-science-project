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
  ExternalLink, Loader2, AlertTriangle, Activity, Target, Calendar, TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';
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
  performanceTrend: Array<{
    date: string; sessionId: string; sessionType: string; roundNumber: number;
    total: number; correct: number; pct: number;
  }>;
  mathsecrHeatmap: Array<Record<string, unknown>>;
  pitfalls: Array<{ pitfall_code: string; hitCount: number; recent: string }>;
  sessions: SessionRow[];
}

const SESSION_TYPE_LABEL: Record<string, string> = {
  BS: '광역 스캔', DD: '정밀 진단', PT: '선수 추적', SC: '스팟 체크', EX: '시험 분석',
};

const ERROR_CAUSE_COLORS: Record<string, string> = {
  개념: '#6366f1', 유형: '#8b5cf6', 계산: '#ec4899', 문장제: '#f59e0b', 시간: '#10b981',
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

function Card({ children, title, icon: Icon, className = '' }: {
  children: React.ReactNode; title: string; icon?: LucideIcon; className?: string;
}) {
  return (
    <div className={`bg-white border border-gray-200 rounded-2xl p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-4 text-gray-500">
        {Icon && <Icon size={16} />}
        <h3 className="font-bold text-xs uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 py-2 border-b border-gray-100 last:border-0">
      <div className="w-20 text-xs font-semibold text-gray-400 shrink-0">{label}</div>
      <div className="text-sm text-zinc-800">{value}</div>
    </div>
  );
}

interface ManageStudent {
  name?: string; school?: string | null; className?: string | null;
  email?: string | null; phone?: string | null; status?: string; source?: string;
}

export default function StudentHubPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = (params?.studentId as string) || '';

  const [tab, setTab] = useState('overview');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manageStudent, setManageStudent] = useState<ManageStudent | null>(null);
  const [manageLoading, setManageLoading] = useState(false);

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

  // 관리 탭 — 학생 정보(학교·반·연락처) 지연 로드 (기존 /api/users/students 재사용)
  useEffect(() => {
    if (tab !== 'manage' || manageStudent || !studentId) return;
    let cancelled = false;
    setManageLoading(true);
    fetch('/api/users/students')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const found = (j.students || []).find((s: { id: string }) => s.id === studentId);
        setManageStudent((found as ManageStudent) || {});
      })
      .catch(() => { if (!cancelled) setManageStudent({}); })
      .finally(() => { if (!cancelled) setManageLoading(false); });
    return () => { cancelled = true; };
  }, [tab, manageStudent, studentId]);

  // 개별 리포트 — exam_id 있는 시험지 세션 (최신순)
  const reportSessions = useMemo(
    () => (data?.sessions || []).filter((s) => !!s.exam_id),
    [data],
  );
  const errorCauseChart = useMemo(
    () => Object.entries(data?.errorCauses || {})
      .filter(([, v]) => v > 0)
      .map(([cause, value]) => ({ cause, value })),
    [data],
  );

  const studentName = data?.student.name || '학생';
  const gradeLabel = data?.student.grade != null ? gradeIntToLabel(data.student.grade) : null;

  return (
    <div className="min-h-screen bg-gray-50 text-zinc-900 font-sans">
      <div className="p-6 md:p-8">
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

            {/* ── 성적 (정답률 추이 + 최근 세션) ── */}
            {tab === 'grades' && (
              <div className="space-y-4">
                <Card title="세션별 정답률 추이" icon={TrendingUp}>
                  <div className="h-[280px]">
                    {data.performanceTrend.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                        채점된 세션이 누적되면 차트가 표시됩니다.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.performanceTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="date" stroke="#6b7280" tickFormatter={(d) => String(d).slice(5)} />
                          <YAxis stroke="#6b7280" domain={[0, 100]} unit="%" />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'white', borderColor: '#e5e7eb' }}
                            formatter={(value) => `${value}%`}
                            labelFormatter={(label, payload) => {
                              const p = payload?.[0]?.payload as { sessionType?: string; roundNumber?: number };
                              return `${label} (${p?.sessionType || ''} R${p?.roundNumber || '-'})`;
                            }}
                          />
                          <Line type="monotone" dataKey="pct" name="정답률" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1' }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </Card>

                <Card title="최근 세션" icon={Calendar}>
                  {data.sessions.length === 0 ? (
                    <div className="py-6 text-center text-gray-400 text-sm">채점된 세션이 없습니다.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-400 text-xs uppercase tracking-wider text-left">
                            <th className="py-2 pr-3">시험지</th>
                            <th className="py-2 pr-3">유형</th>
                            <th className="py-2 pr-3">일자</th>
                            <th className="py-2 pr-3 text-right">정답률</th>
                            <th className="py-2 text-center">리포트</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.sessions.map((s) => (
                            <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                              <td className="py-2 pr-3 text-zinc-700 truncate max-w-xs">{s.exam_title || '(제목 없음)'}</td>
                              <td className="py-2 pr-3 text-zinc-500">{SESSION_TYPE_LABEL[s.session_type] || s.session_type} · R{s.round_number}</td>
                              <td className="py-2 pr-3 text-zinc-500">{fmtDate(s.issued_at)}</td>
                              <td className="py-2 pr-3 text-right text-zinc-700">
                                {s.pct != null ? <span className="font-bold text-indigo-600">{s.pct}%</span> : '-'}
                                <span className="text-gray-400 ml-1">({s.correct}/{s.total})</span>
                              </td>
                              <td className="py-2 text-center">
                                {s.exam_id ? (
                                  <Link href={`/dashboard/exam-analysis/${s.exam_id}/students/${s.report_student_id || studentId}`} target="_blank" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                                    <ExternalLink size={12} /> 리포트
                                  </Link>
                                ) : (
                                  <Link href={`/grade/${s.id}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600">채점</Link>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* ── 진단 (오답 원인 + 대단원 히트맵 + 함정) ── */}
            {tab === 'diagnostics' && (
              <div className="space-y-4">
                <Card title="오답 원인 분포" icon={Brain}>
                  <div className="h-[240px]">
                    {errorCauseChart.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                        오답 원인이 태깅된 채점이 없습니다.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={errorCauseChart} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                          <XAxis type="number" stroke="#6b7280" />
                          <YAxis dataKey="cause" type="category" stroke="#374151" width={60} />
                          <Tooltip cursor={{ fill: '#00000010' }} contentStyle={{ backgroundColor: 'white', borderColor: '#e5e7eb' }} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={26}>
                            {errorCauseChart.map((d) => (
                              <Cell key={d.cause} fill={ERROR_CAUSE_COLORS[d.cause] || '#8b5cf6'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card title="수학비서 대단원 정답률" icon={BarChart3}>
                    {data.mathsecrHeatmap.length === 0 ? (
                      <div className="py-8 text-center text-gray-400 text-sm">
                        diagnostics.items 가 누적되면 대단원별 α·β·γ 가 표시됩니다.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 uppercase tracking-wider text-left">
                              <th className="py-2 pr-3">과목</th>
                              <th className="py-2 pr-3">대단원</th>
                              <th className="py-2 pr-3 text-right">정답률</th>
                              <th className="py-2 text-center">상태</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.mathsecrHeatmap.slice(0, 20).map((row, i) => {
                              const r = row as Record<string, unknown>;
                              const rate = Number(r.correct_rate ?? r.correctRate ?? r.pct ?? 0);
                              const state = rate >= 80 ? 'α' : rate >= 60 ? 'β' : 'γ';
                              const stateColor = rate >= 80 ? 'text-emerald-600' : rate >= 60 ? 'text-amber-600' : 'text-rose-600';
                              return (
                                <tr key={i} className="border-t border-gray-100">
                                  <td className="py-2 pr-3 text-zinc-600">{String(r.subject ?? '')}</td>
                                  <td className="py-2 pr-3 text-zinc-700">{String(r.level1 ?? r.major_unit ?? '')}</td>
                                  <td className="py-2 pr-3 text-right text-zinc-700">{rate ? `${rate}%` : '-'}</td>
                                  <td className={`py-2 text-center font-bold ${stateColor}`}>{state}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>

                  <Card title="반복 함정 Top 10" icon={AlertTriangle}>
                    {data.pitfalls.length === 0 ? (
                      <div className="py-8 text-center text-gray-400 text-sm">
                        오답 시 자동 누적되는 함정 기록이 없습니다.
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {data.pitfalls.map((p) => (
                          <li key={p.pitfall_code} className="flex items-center justify-between text-sm py-2 px-3 rounded-lg bg-gray-50 border border-gray-100">
                            <div className="font-mono text-xs text-zinc-700">{p.pitfall_code}</div>
                            <span className="text-rose-600 font-bold text-xs">{p.hitCount}회</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>
              </div>
            )}

            {/* ── 관리 (학생 정보 + 수정 링크) ── */}
            {tab === 'manage' && (
              <Card title="학생 정보" icon={Settings}>
                {manageLoading ? (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    <Loader2 className="animate-spin inline mr-2" size={16} /> 불러오는 중…
                  </div>
                ) : (
                  <div className="space-y-1">
                    <InfoRow label="이름" value={manageStudent?.name || studentName} />
                    <InfoRow label="학년" value={gradeLabel || '-'} />
                    <InfoRow label="학교" value={manageStudent?.school || '-'} />
                    <InfoRow label="반" value={manageStudent?.className || '-'} />
                    <InfoRow
                      label="연락처"
                      value={manageStudent?.email?.replace(/@local\.suzag\.com$/i, '') || manageStudent?.phone || '-'}
                    />
                    <InfoRow
                      label="상태"
                      value={manageStudent?.source === 'roster'
                        ? '채점명단 (정식 등록 전)'
                        : (manageStudent?.status === 'ACCEPTED' ? '활성' : manageStudent?.status === 'PENDING' ? '대기중' : '-')}
                    />
                    <div className="pt-4">
                      <Link href="/tutor/students" className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                        <Settings size={14} /> 학생 관리에서 정보 수정
                      </Link>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
