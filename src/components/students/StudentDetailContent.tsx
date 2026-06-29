'use client';

// ============================================================================
// /tutor/students/[studentId] — 학생 통합 상세 허브 (2026-06-08)
//   흩어진 학생 화면(성적·진단·개별 리포트·관리)을 한 학생당 한 페이지 탭으로 통합.
//   데이터는 기존 analytics API(/api/students/[id]/analytics) 재사용 — 새 백엔드 0, 가산.
//   1단계: 라우트 + 탭 골격 + 개요. 2단계: 개별 리포트 탭(시험지별 리포트 카드).
//   성적·진단·관리 탭은 후속 단계에서 기존 페이지 로직 이식 (지금은 진입 링크).
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, X, FileText, BarChart3, Brain, Settings, LayoutDashboard,
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
    <div className="bg-surface-card border border-white/10 rounded-2xl p-4">
      <div className="flex items-center gap-2 text-content-tertiary text-xs mb-2">
        <Icon size={14} /> {label}
      </div>
      <div className="text-2xl font-bold text-content-primary">{value}</div>
      {sub && <div className="text-xs text-content-tertiary mt-1">{sub}</div>}
    </div>
  );
}

function Card({ children, title, icon: Icon, className = '' }: {
  children: React.ReactNode; title: string; icon?: LucideIcon; className?: string;
}) {
  return (
    <div className={`bg-surface-card border border-white/10 rounded-2xl p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-4 text-content-tertiary">
        {Icon && <Icon size={16} />}
        <h3 className="font-bold text-xs uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 py-2 border-b border-white/5 last:border-0">
      <div className="w-20 text-xs font-semibold text-content-tertiary shrink-0">{label}</div>
      <div className="text-sm text-content-secondary">{value}</div>
    </div>
  );
}

interface ManageStudent {
  name?: string; school?: string | null; className?: string | null;
  email?: string | null; phone?: string | null; status?: string; source?: string;
}

export default function StudentDetailContent({ studentId, onClose }: { studentId: string; onClose?: () => void }) {
  const router = useRouter();

  const [tab, setTab] = useState('overview');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manageStudent, setManageStudent] = useState<ManageStudent | null>(null);
  const [manageLoading, setManageLoading] = useState(false);
  // 세트 리포트(진단평가 종합) — 학생이 속한 세트
  const [diagSets, setDiagSets] = useState<Array<{
    setKey: string; setTitle: string; bookGroupName: string | null; studentIdInSet: string; variants: number;
  }> | null>(null);
  const [diagSetsLoading, setDiagSetsLoading] = useState(false);

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

  // 세트 리포트 — 학생이 속한 진단평가 세트 지연 로드 (exam-sets API 재사용)
  useEffect(() => {
    if (tab !== 'reports' || diagSets !== null || !studentId) return;
    let cancelled = false;
    setDiagSetsLoading(true);
    // 신원 후보 — 본인 id + 세션의 report_student_id(roster id) 까지 매칭(promoted 대응)
    const candidateIds = new Set<string>([studentId]);
    (data?.sessions || []).forEach((s) => { if (s.report_student_id) candidateIds.add(s.report_student_id); });
    fetch('/api/diagnostics/exam-sets')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const out: Array<{ setKey: string; setTitle: string; bookGroupName: string | null; studentIdInSet: string; variants: number }> = [];
        for (const set of (j.sets || []) as Array<{ setKey: string; setTitle: string; bookGroupName: string | null; students?: Array<{ id: string; variantsTaken?: unknown[] }> }>) {
          const stu = (set.students || []).find((s) => candidateIds.has(s.id));
          if (stu) {
            out.push({
              setKey: set.setKey, setTitle: set.setTitle, bookGroupName: set.bookGroupName,
              studentIdInSet: stu.id, variants: (stu.variantsTaken || []).length,
            });
          }
        }
        setDiagSets(out);
      })
      .catch(() => { if (!cancelled) setDiagSets([]); })
      .finally(() => { if (!cancelled) setDiagSetsLoading(false); });
    return () => { cancelled = true; };
  }, [tab, diagSets, studentId, data]);

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
    <div className="text-content-primary font-sans">
      <div className="p-6 md:p-8">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={onClose ?? (() => router.push('/tutor/students'))}
            className="p-2 rounded-lg border border-white/10 bg-surface-card text-content-tertiary hover:text-content-primary hover:bg-white/10"
            title={onClose ? '닫기' : '학생 목록'}
          >
            {onClose ? <X size={18} /> : <ArrowLeft size={18} />}
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold truncate">{studentName}</h1>
              {gradeLabel && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  {gradeLabel}
                </span>
              )}
              {data?.source && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-content-tertiary border border-white/10">
                  {data.source === 'roster' ? '채점명단' : '정식'}
                </span>
              )}
            </div>
            <p className="text-xs text-content-tertiary mt-0.5">학생 통합 상세 — 성적·진단·개별 리포트·관리</p>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex items-center gap-1 border-b border-white/10 mb-5 overflow-x-auto">
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
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-content-tertiary hover:text-content-secondary'
                }`}
              >
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* 본문 */}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-content-tertiary">
            <Loader2 className="animate-spin mr-2" size={18} /> 불러오는 중…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm">
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
                  <button onClick={() => setTab('diagnostics')} className="text-sm font-semibold px-4 py-2 rounded-lg border border-white/10 bg-surface-card text-content-secondary hover:bg-white/10">
                    진단 보기
                  </button>
                </div>
              </div>
            )}

            {/* ── 리포트 (세트 리포트 + 개별 리포트 분리) ── */}
            {tab === 'reports' && (
              <div className="space-y-6">
                {/* 세트 리포트 (진단평가 종합) */}
                <div>
                  <h3 className="text-sm font-bold text-content-secondary mb-2.5 flex items-center gap-1.5">
                    <FileText size={15} className="text-violet-500" /> 세트 리포트 <span className="text-xs font-normal text-content-tertiary">진단평가 종합</span>
                  </h3>
                  {diagSetsLoading ? (
                    <div className="py-4 text-content-tertiary text-sm"><Loader2 className="animate-spin inline mr-2" size={14} />불러오는 중…</div>
                  ) : !diagSets || diagSets.length === 0 ? (
                    <div className="text-xs text-content-tertiary py-3 px-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02]">
                      이 학생이 속한 진단평가 세트가 없습니다.
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {diagSets.map((sr) => (
                        <div key={sr.setKey} className="flex items-center justify-between gap-3 p-4 rounded-xl border border-violet-500/30 bg-violet-500/10 hover:border-violet-500/50 hover:shadow-sm transition-all">
                          <div className="min-w-0">
                            <div className="font-bold text-content-secondary truncate">{sr.setTitle}</div>
                            <div className="text-xs text-content-tertiary mt-0.5">{sr.bookGroupName || ''}{sr.bookGroupName ? ' · ' : ''}응시 {sr.variants}회</div>
                          </div>
                          <Link
                            href={`/dashboard/prescription/report?setKey=${encodeURIComponent(sr.setKey)}&studentId=${encodeURIComponent(sr.studentIdInSet)}`}
                            target="_blank"
                            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700"
                          >
                            <FileText size={14} /> 세트 리포트 보기
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 개별 리포트 (시험지별) */}
                <div className="border-t border-white/10 pt-5">
                  <h3 className="text-sm font-bold text-content-secondary mb-2.5 flex items-center gap-1.5">
                    <FileText size={15} className="text-indigo-500" /> 개별 리포트 <span className="text-xs font-normal text-content-tertiary">시험지별</span>
                  </h3>
                  {reportSessions.length === 0 ? (
                    <div className="py-8 text-center text-content-tertiary text-sm">채점된 시험지가 없습니다.</div>
                  ) : (
                    <div className="grid gap-3">
                      {reportSessions.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-3 p-4 rounded-xl border border-white/10 bg-surface-card hover:border-indigo-500/40 hover:shadow-sm transition-all">
                          <div className="min-w-0">
                            <div className="font-bold text-content-secondary truncate">{s.exam_title || '(제목 없음)'}</div>
                            <div className="text-xs text-content-tertiary mt-0.5 flex flex-wrap items-center gap-x-2">
                              <span>{SESSION_TYPE_LABEL[s.session_type] || s.session_type} · R{s.round_number}</span>
                              <span>· {fmtDate(s.issued_at)}</span>
                              <span>·{' '}
                                {s.pct != null ? (
                                  <span className="font-bold text-indigo-400">{s.pct}%</span>
                                ) : '-'}
                                <span className="text-content-tertiary"> ({s.correct}/{s.total})</span>
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
              </div>
            )}

            {/* ── 성적 (정답률 추이 + 최근 세션) ── */}
            {tab === 'grades' && (
              <div className="space-y-4">
                <Card title="세션별 정답률 추이" icon={TrendingUp}>
                  <div className="h-[280px]">
                    {data.performanceTrend.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-content-tertiary text-sm">
                        채점된 세션이 누적되면 차트가 표시됩니다.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.performanceTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff14" />
                          <XAxis dataKey="date" stroke="#9ca3af" tickFormatter={(d) => String(d).slice(5)} />
                          <YAxis stroke="#9ca3af" domain={[0, 100]} unit="%" />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', color: '#fff' }}
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
                    <div className="py-6 text-center text-content-tertiary text-sm">채점된 세션이 없습니다.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-content-tertiary text-xs uppercase tracking-wider text-left">
                            <th className="py-2 pr-3">시험지</th>
                            <th className="py-2 pr-3">유형</th>
                            <th className="py-2 pr-3">일자</th>
                            <th className="py-2 pr-3 text-right">정답률</th>
                            <th className="py-2 text-center">리포트</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.sessions.map((s) => (
                            <tr key={s.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                              <td className="py-2 pr-3 text-content-secondary truncate max-w-xs">{s.exam_title || '(제목 없음)'}</td>
                              <td className="py-2 pr-3 text-content-tertiary">{SESSION_TYPE_LABEL[s.session_type] || s.session_type} · R{s.round_number}</td>
                              <td className="py-2 pr-3 text-content-tertiary">{fmtDate(s.issued_at)}</td>
                              <td className="py-2 pr-3 text-right text-content-secondary">
                                {s.pct != null ? <span className="font-bold text-indigo-400">{s.pct}%</span> : '-'}
                                <span className="text-content-tertiary ml-1">({s.correct}/{s.total})</span>
                              </td>
                              <td className="py-2 text-center">
                                {s.exam_id ? (
                                  <Link href={`/dashboard/exam-analysis/${s.exam_id}/students/${s.report_student_id || studentId}`} target="_blank" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300">
                                    <ExternalLink size={12} /> 리포트
                                  </Link>
                                ) : (
                                  <Link href={`/grade/${s.id}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-content-tertiary hover:text-content-secondary">채점</Link>
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
                      <div className="h-full flex items-center justify-center text-content-tertiary text-sm">
                        오답 원인이 태깅된 채점이 없습니다.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={errorCauseChart} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff14" horizontal={false} />
                          <XAxis type="number" stroke="#9ca3af" />
                          <YAxis dataKey="cause" type="category" stroke="#9ca3af" width={60} />
                          <Tooltip cursor={{ fill: '#ffffff10' }} contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', color: '#fff' }} />
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
                  <Card title="매쓰싸이 뱅크 대단원 정답률" icon={BarChart3}>
                    {data.mathsecrHeatmap.length === 0 ? (
                      <div className="py-8 text-center text-content-tertiary text-sm">
                        diagnostics.items 가 누적되면 대단원별 α·β·γ 가 표시됩니다.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-content-tertiary uppercase tracking-wider text-left">
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
                              const stateColor = rate >= 80 ? 'text-emerald-300' : rate >= 60 ? 'text-amber-300' : 'text-rose-300';
                              return (
                                <tr key={i} className="border-t border-white/5">
                                  <td className="py-2 pr-3 text-content-tertiary">{String(r.subject ?? '')}</td>
                                  <td className="py-2 pr-3 text-content-secondary">{String(r.level1 ?? r.major_unit ?? '')}</td>
                                  <td className="py-2 pr-3 text-right text-content-secondary">{rate ? `${rate}%` : '-'}</td>
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
                      <div className="py-8 text-center text-content-tertiary text-sm">
                        오답 시 자동 누적되는 함정 기록이 없습니다.
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {data.pitfalls.map((p) => (
                          <li key={p.pitfall_code} className="flex items-center justify-between text-sm py-2 px-3 rounded-lg bg-white/5 border border-white/5">
                            <div className="font-mono text-xs text-content-secondary">{p.pitfall_code}</div>
                            <span className="text-rose-300 font-bold text-xs">{p.hitCount}회</span>
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
                  <div className="py-8 text-center text-content-tertiary text-sm">
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
                      <Link href="/tutor/students" className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-400 hover:text-indigo-300">
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
