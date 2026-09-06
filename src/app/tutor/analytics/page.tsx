'use client';

// ============================================================================
// /tutor/analytics
//   강사용 학생 학습 분석 — 학생 선택 후 진단평가 4종 집계 실시간 표시.
//   API: GET /api/users/students (목록), GET /api/students/[id]/analytics (집계)
//
// 핵심: 강사가 본인 institute 학생을 골라 진단평가 결과를 확인.
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Users, Search, ChevronDown, Loader2, AlertTriangle,
  TrendingUp, Brain, Target, Calendar, Activity, ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';
import { gradeIntToLabel } from '@/lib/students/grade-label';
import GradeRosterTable from '@/components/grades/GradeRosterTable';
import StudentDetailModal from '@/components/students/StudentDetailModal';

interface StudentRow {
  id: string;
  name?: string | null;
  full_name?: string | null;
  grade?: number | null;
  // 데이터 소스 (2026-05-29 통합):
  //   'user'   — public.users 의 실 학생 (auth 가입)
  //   'roster' — roster_students 의 자동등록 학생 (엑셀 일괄 채점)
  source?: 'user' | 'roster';
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
  performanceTrend: Array<{
    date: string; sessionId: string; sessionType: string; roundNumber: number;
    total: number; correct: number; pct: number;
  }>;
  errorCauses: Record<string, number>;
  mathsecrHeatmap: Array<Record<string, unknown>>;
  pitfalls: Array<{ pitfall_code: string; hitCount: number; recent: string }>;
  sessions: Array<{
    id: string; exam_id: string; exam_title: string;
    round_number: number; session_type: string;
    issued_at: string; completed_at: string | null;
    total: number; correct: number; pct: number | null;
    report_student_id?: string | null;   // EX 세션이면 학생 리포트로 갈 roster id
  }>;
}

const SESSION_TYPE_LABEL: Record<string, string> = {
  BS: '광역 스캔', DD: '정밀 진단', PT: '선수 추적', SC: '스팟 체크',
  EX: '시험 분석',
};

const ERROR_CAUSE_COLORS: Record<string, string> = {
  개념: '#6366f1', 유형: '#8b5cf6', 계산: '#ec4899', 문장제: '#f59e0b', 시간: '#10b981',
};

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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
  } catch {
    return iso.slice(0, 10);
  }
}

export default function TutorAnalyticsPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  const router = useRouter();
  const [modalStudentId, setModalStudentId] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  // 반 허브 학생 화면 「성적표」 링크 (?student=) — mount 때 한 번 읽는다 (useSearchParams 의 Suspense 요구 회피)
  useEffect(() => {
    try { const s = new URLSearchParams(window.location.search).get('student'); if (s) setSelectedStudent(s); } catch { /* ignore */ }
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 학생 목록 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/users/students');
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        if (!cancelled) setStudents((json.students || []) as StudentRow[]);
      } catch (e) {
        if (!cancelled) setStudentsError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setStudentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 학생 선택 시 분석 데이터 fetch
  useEffect(() => {
    if (!selectedStudent) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/students/${selectedStudent}/analytics`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        if (!cancelled) setData(json as AnalyticsData);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedStudent]);

  // 학생 필터
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.trim().toLowerCase();
    return students.filter((s) => {
      const name = (s.full_name || s.name || '').toLowerCase();
      return name.includes(q);
    });
  }, [students, searchQuery]);

  const selectedInfo = students.find((s) => s.id === selectedStudent);
  const selectedName = selectedInfo
    ? selectedInfo.full_name || selectedInfo.name || '(이름 없음)'
    : null;

  // 오답 원인 차트
  const errorCauseChart = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.errorCauses)
      .filter(([, v]) => v > 0)
      .map(([cause, value]) => ({ cause, value }));
  }, [data]);

  // 인사이트 룰 기반
  const insights = useMemo(() => {
    if (!data) return [];
    const out: Array<{ kind: 'good' | 'warn'; title: string; body: string }> = [];

    if (data.summary.avgScorePct != null) {
      if (data.summary.avgScorePct >= 80) {
        out.push({
          kind: 'good',
          title: `평균 정답률 ${data.summary.avgScorePct}% — 안정적`,
          body: `채점 ${data.summary.totalGraded}건 기준. 심화 학습 권장.`,
        });
      } else if (data.summary.avgScorePct < 60) {
        out.push({
          kind: 'warn',
          title: `평균 정답률 ${data.summary.avgScorePct}% — 보강 필요`,
          body: '오답 원인·약점 단원 분석 후 맞춤 학습지 권장.',
        });
      }
    }
    const topCause = errorCauseChart.sort((a, b) => b.value - a.value)[0];
    if (topCause) {
      out.push({
        kind: 'warn',
        title: `최다 오답 원인: ${topCause.cause} (${topCause.value}건)`,
        body: '해당 원인 유형에 맞는 보강 학습지 또는 클리닉 권장.',
      });
    }
    const topPitfall = data.pitfalls[0];
    if (topPitfall) {
      out.push({
        kind: 'warn',
        title: `반복 함정: ${topPitfall.pitfall_code} (${topPitfall.hitCount}회)`,
        body: '같은 함정을 여러 번 적중 — 개념 재확인 필요.',
      });
    }
    if (out.length === 0) {
      out.push({
        kind: 'good',
        title: '아직 분석할 데이터가 충분치 않습니다',
        body: '학생이 진단평가를 채점받으면 자동으로 인사이트가 생성됩니다.',
      });
    }
    return out;
  }, [data, errorCauseChart]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 size={26} className="text-content-tertiary" />
            학생 성적
          </h1>
          <p className="text-sm text-content-tertiary mt-1">
            학년별 성적 일람표(내신 · 모의고사 · 진단 · 시험)에서 학생을 선택하면 진단평가 상세 분석이 표시됩니다.
          </p>
        </div>
      </div>

      {/* 학년별 성적 일람표 */}
      <GradeRosterTable
        selectedStudentId={selectedStudent}
        onSelectStudent={(id) => setModalStudentId(id)}
      />

      {/* 학생 상세 팝업 — 성적 일람표·검색에서 학생 클릭 시 (밑에 인라인 대신 모달) */}
      {modalStudentId && (
        <StudentDetailModal studentId={modalStudentId} onClose={() => setModalStudentId(null)} />
      )}

      {/* 학생 선택 */}
      <Card title="학생 선택" icon={Users}>
        {studentsLoading ? (
          <div className="flex items-center gap-2 text-content-tertiary text-sm py-3">
            <Loader2 size={16} className="animate-spin" /> 학생 목록 불러오는 중…
          </div>
        ) : studentsError ? (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm">
            <AlertTriangle size={14} className="mt-0.5" /> {studentsError}
          </div>
        ) : students.length === 0 ? (
          <div className="text-sm text-content-tertiary py-3">등록된 학생이 없습니다.</div>
        ) : (
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg border border-white/10 bg-surface-card hover:border-white/[.2] text-sm"
            >
              {selectedInfo ? (
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{selectedName}</span>
                  {gradeIntToLabel(selectedInfo.grade) && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-content-secondary">
                      {gradeIntToLabel(selectedInfo.grade)}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-content-tertiary">학생을 선택하세요…</span>
              )}
              <ChevronDown size={16} className={`text-content-tertiary transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {dropdownOpen && (
              <div className="absolute z-10 mt-1 w-full bg-surface-card border border-white/10 rounded-lg shadow-lg max-h-80 overflow-hidden">
                <div className="p-2 border-b border-white/5 flex items-center gap-2 bg-white/5">
                  <Search size={14} className="text-content-tertiary" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="이름으로 검색…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
                <div className="overflow-y-auto max-h-60">
                  {filteredStudents.length === 0 ? (
                    <div className="text-center py-4 text-sm text-content-tertiary">검색 결과 없음</div>
                  ) : (
                    filteredStudents.map((s) => {
                      const name = s.full_name || s.name || '(이름 없음)';
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setDropdownOpen(false);
                            setSearchQuery('');
                            setModalStudentId(s.id);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-white/[.06] flex items-center justify-between gap-2 ${
                            selectedStudent === s.id ? 'bg-white/[.08] text-content-primary' : ''
                          }`}
                        >
                          <span className="truncate flex items-center gap-1.5">
                            {name}
                            {s.source === 'roster' && (
                              <span
                                className="text-[10px] font-semibold px-1 py-0.5 rounded border border-white/[.08] bg-white/[.04] text-content-secondary flex-shrink-0"
                                title="엑셀 일괄 채점으로 자동등록된 학생 (auth 미연동)"
                              >
                                명단
                              </span>
                            )}
                          </span>
                          {gradeIntToLabel(s.grade) && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-content-secondary flex-shrink-0">
                              {gradeIntToLabel(s.grade)}
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {!selectedStudent && (
        <div className="bg-surface-card border border-white/10 rounded-2xl p-12 text-center">
          <Users size={36} className="mx-auto text-content-tertiary mb-3" />
          <p className="text-content-secondary font-semibold">학생을 선택해주세요</p>
          <p className="text-sm text-content-tertiary mt-1">선택하면 진단평가 분석이 표시됩니다.</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-content-tertiary gap-2">
          <Loader2 size={18} className="animate-spin" /> 분석 데이터 불러오는 중…
        </div>
      )}

      {error && !loading && (
        <div className="flex items-start gap-2 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm">
          <AlertTriangle size={16} className="mt-0.5" /> {error}
        </div>
      )}

      {data && !loading && !error && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCell label="세션 수" value={data.summary.totalSessions} icon={Activity} />
            <StatCell label="채점 건수" value={data.summary.totalGraded} icon={Target} />
            <StatCell
              label="평균 정답률"
              value={data.summary.avgScorePct != null ? `${data.summary.avgScorePct}%` : '-'}
              icon={TrendingUp}
            />
            <StatCell label="최근 활동" value={fmtDate(data.summary.lastActiveAt)} icon={Calendar} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Performance Trend */}
            <Card title="세션별 정답률 추이" icon={TrendingUp} className="lg:col-span-2">
              <div className="h-[280px]">
                {data.performanceTrend.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-content-tertiary text-sm">
                    채점된 세션이 누적되면 차트가 표시됩니다.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.performanceTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff14" />
                      <XAxis
                        dataKey="date"
                        stroke="#9ca3af"
                        tickFormatter={(d) => d.slice(5)}
                      />
                      <YAxis stroke="#9ca3af" domain={[0, 100]} unit="%" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', color: '#fff' }}
                        formatter={(value) => `${value}%`}
                        labelFormatter={(label, payload) => {
                          const p = payload?.[0]?.payload as { sessionType?: string; roundNumber?: number };
                          return `${label} (${p?.sessionType || ''} R${p?.roundNumber || '-'})`;
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="pct"
                        name="정답률"
                        stroke="#6366f1"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#6366f1' }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Error Causes */}
            <Card title="오답 원인 분포" icon={Brain}>
              <div className="h-[280px]">
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
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={28}>
                        {errorCauseChart.map((d) => (
                          <Cell key={d.cause} fill={ERROR_CAUSE_COLORS[d.cause] || '#8b5cf6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 단원별 정답률 (히트맵) */}
            <Card title="매쓰싸이 뱅크 대단원 정답률" icon={Brain}>
              {data.mathsecrHeatmap.length === 0 ? (
                <div className="py-8 text-center text-content-tertiary text-sm">
                  diagnostics.items 가 누적되면 대단원별 α·β·γ 가 표시됩니다.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-content-tertiary uppercase tracking-wider">
                        <th className="text-left py-2 pr-3">과목</th>
                        <th className="text-left py-2 pr-3">대단원</th>
                        <th className="text-right py-2 pr-3">정답률</th>
                        <th className="text-center py-2">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.mathsecrHeatmap.slice(0, 20).map((row, i) => {
                        const r = row as Record<string, any>;
                        const rate = Number(r.correct_rate ?? r.correctRate ?? r.pct ?? 0);
                        const state = rate >= 80 ? 'α' : rate >= 60 ? 'β' : 'γ';
                        const stateColor = rate >= 80 ? 'text-emerald-300' : rate >= 60 ? 'text-amber-300' : 'text-rose-300';
                        return (
                          <tr key={i} className="border-t border-white/5">
                            <td className="py-2 pr-3 text-content-secondary">{String(r.subject ?? '')}</td>
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

            {/* 함정 누적 */}
            <Card title="반복 함정 Top 10" icon={AlertTriangle}>
              {data.pitfalls.length === 0 ? (
                <div className="py-8 text-center text-content-tertiary text-sm">
                  오답 시 자동 누적되는 함정 기록이 없습니다.
                </div>
              ) : (
                <ul className="space-y-2">
                  {data.pitfalls.map((p) => (
                    <li
                      key={p.pitfall_code}
                      className="flex items-center justify-between text-sm py-2 px-3 rounded-lg bg-white/[0.03] border border-white/5"
                    >
                      <div className="font-mono text-xs text-content-secondary">{p.pitfall_code}</div>
                      <span className="text-rose-300 font-bold text-xs">{p.hitCount}회</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* 최근 세션 카드 */}
          <Card title="최근 세션" icon={Calendar}>
            {data.sessions.length === 0 ? (
              <div className="py-6 text-center text-content-tertiary text-sm">
                채점된 세션이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-content-tertiary uppercase tracking-wider">
                      <th className="text-left py-2 pr-3">시험지</th>
                      <th className="text-left py-2 pr-3">유형 · 회차</th>
                      <th className="text-left py-2 pr-3">발급일</th>
                      <th className="text-right py-2 pr-3">정답률</th>
                      <th className="text-center py-2">상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sessions.map((s) => (
                      <tr key={s.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                        <td className="py-2 pr-3 text-content-secondary truncate max-w-xs">{s.exam_title || '(제목 없음)'}</td>
                        <td className="py-2 pr-3 text-content-tertiary">
                          {SESSION_TYPE_LABEL[s.session_type] || s.session_type} · R{s.round_number}
                        </td>
                        <td className="py-2 pr-3 text-content-tertiary">{fmtDate(s.issued_at)}</td>
                        <td className="py-2 pr-3 text-right text-content-secondary">
                          {s.pct != null ? <span className="font-bold text-content-primary tabular-nums">{s.pct}%</span> : '-'}
                          <span className="text-content-tertiary ml-1">({s.correct}/{s.total})</span>
                        </td>
                        <td className="py-2 text-center">
                          {s.session_type === 'EX' && s.report_student_id && s.exam_id ? (
                            <Link
                              href={`/dashboard/exam-analysis/${s.exam_id}/students/${s.report_student_id}`}
                              target="_blank"
                              className="inline-flex items-center gap-1 text-xs text-content-secondary hover:text-content-primary"
                            >
                              <ExternalLink size={12} /> 리포트
                            </Link>
                          ) : (
                            <Link
                              href={`/grade/${s.id}`}
                              target="_blank"
                              className="inline-flex items-center gap-1 text-xs text-content-secondary hover:text-content-primary"
                            >
                              <ExternalLink size={12} /> 채점
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* AI 인사이트 */}
          <Card title="AI 진단 인사이트" icon={Brain}>
            <div className="space-y-3">
              {insights.map((it, i) => (
                <div key={i} className="flex gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      it.kind === 'good' ? 'bg-white/[.08] text-content-primary' : 'bg-rose-500/15 text-rose-300'
                    }`}
                  >
                    {it.kind === 'good' ? <TrendingUp size={20} /> : <AlertTriangle size={20} />}
                  </div>
                  <div>
                    <h4 className={`font-semibold text-sm ${it.kind === 'good' ? 'text-content-primary' : 'text-rose-200'}`}>
                      {it.title}
                    </h4>
                    <p className="text-content-tertiary text-xs leading-relaxed mt-1">{it.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
