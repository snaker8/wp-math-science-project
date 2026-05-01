'use client';

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search, Menu, Printer, Send, Sparkles, AlertCircle, ClipboardList,
  ChevronRight, Loader2, Calendar, TrendingDown, Activity, QrCode,
} from 'lucide-react';
import CreateSessionsModal from '@/components/prescription/CreateSessionsModal';
import { StudentPitfallSummary } from '@/components/prescription/StudentPitfallSummary';
import { WeeklyConnections } from '@/components/prescription/WeeklyConnections';
import { PrescriptionRecommendation } from '@/components/prescription/PrescriptionRecommendation';
import { RecommendedProblems } from '@/components/prescription/RecommendedProblems';
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip,
} from 'recharts';
import { motion } from 'framer-motion';
import {
  getStudentSessions,
  getStudentNodeStatus,
  getStudentHeatmap,
  getStudentErrorProfile,
  getMathsecrNode,
  traceWeaknessChain,
} from './lib/queries';
import type {
  DiagnosisSession, StudentNodeStatus, MathsecrHeatmapRow, ErrorCause, NodeStatus,
} from './lib/types';
import { STATUS_COLOR, STATUS_LABEL } from './lib/types';

// ============================================================================
// Student (from /api/users/students)
// ============================================================================
interface Student {
  id: string;
  name: string;
  grade: string;
  className: string;
  email?: string | null;
}

// ============================================================================
// Constants — 오답 원인 5종 전체 축
// ============================================================================
const ERROR_CAUSES: ErrorCause[] = ['개념', '유형', '계산', '문장제', '시간'];
const SESSION_TYPE_LABEL: Record<string, string> = {
  BS: '광역 스캔',
  DD: '정밀 진단',
  PT: '선수 추적',
  SC: '스팟 체크',
};
const SESSION_TYPE_COLOR: Record<string, string> = {
  BS: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  DD: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  PT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  SC: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

// ============================================================================
// UI Helpers
// ============================================================================
function ClinicCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface-card border border-white/10 rounded-2xl p-6 backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

function ActionButton({
  icon: Icon, label, primary = false, onClick, disabled,
}: {
  icon: React.ComponentType<{ size?: number | string }>;
  label: string;
  primary?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all disabled:opacity-40 ${
        primary
          ? 'bg-indigo-600 text-content-primary hover:bg-indigo-500 shadow-lg shadow-indigo-500/20'
          : 'bg-white/5 text-content-primary border border-white/10 hover:bg-white/10'
      }`}
    >
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
  } catch {
    return iso;
  }
}

// ============================================================================
// Page
// ============================================================================
function PrescriptionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const studentIdParam = searchParams.get('studentId');

  // Sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Students list
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStudentsLoading(true);
      try {
        const res = await fetch('/api/users/students');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) setStudents(data.students || []);
      } catch (e) {
        if (!cancelled) setStudentsError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setStudentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 현재 학생 (URL 쿼리 또는 목록 첫 번째)
  const student = useMemo(() => {
    if (!students.length) return null;
    if (studentIdParam) {
      const found = students.find(s => s.id === studentIdParam);
      if (found) return found;
    }
    return students[0];
  }, [students, studentIdParam]);

  // 검색 필터링된 학생 목록
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.trim().toLowerCase();
    return students.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.grade || '').toLowerCase().includes(q) ||
      (s.className || '').toLowerCase().includes(q),
    );
  }, [students, searchQuery]);

  // ──────────────────────────────────────────────
  // 학생 관련 데이터 (sessions / nodeStatus / heatmap / errorProfile)
  // ──────────────────────────────────────────────
  const [sessions, setSessions] = useState<DiagnosisSession[]>([]);
  const [nodeStatus, setNodeStatus] = useState<StudentNodeStatus[]>([]);
  const [heatmap, setHeatmap] = useState<MathsecrHeatmapRow[]>([]);
  const [errorProfile, setErrorProfile] = useState<Array<{ error_cause: ErrorCause; cnt: number; pct: number }>>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // QR 세션 생성 모달
  const [showCreateSessions, setShowCreateSessions] = useState(false);

  useEffect(() => {
    if (!student?.id) {
      setSessions([]); setNodeStatus([]); setHeatmap([]); setErrorProfile([]);
      return;
    }
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);
    (async () => {
      try {
        const [s, n, h, e] = await Promise.all([
          getStudentSessions(student.id).catch(() => []),
          getStudentNodeStatus(student.id).catch(() => []),
          getStudentHeatmap(student.id).catch(() => []),
          getStudentErrorProfile(student.id).catch(() => []),
        ]);
        if (!cancelled) {
          setSessions(s);
          setNodeStatus(n);
          setHeatmap(h);
          setErrorProfile(e);
        }
      } catch (err) {
        if (!cancelled) setDataError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [student?.id]);

  // ──────────────────────────────────────────────
  // Radar 데이터 — 오답 원인 5종 전체 축 유지, 없으면 0
  // ──────────────────────────────────────────────
  const radarData = useMemo(() => {
    const byCause = new Map(errorProfile.map(e => [e.error_cause, e.cnt]));
    return ERROR_CAUSES.map(cause => ({
      subject: cause,
      A: byCause.get(cause) || 0,
    }));
  }, [errorProfile]);
  const radarMax = useMemo(() => {
    const max = Math.max(0, ...radarData.map(d => d.A));
    return Math.max(5, Math.ceil(max * 1.2));
  }, [radarData]);

  // ──────────────────────────────────────────────
  // 히트맵 데이터 — subject × level1 그룹화
  // ──────────────────────────────────────────────
  const heatmapBySubject = useMemo(() => {
    const m = new Map<string, { subject_code: string; subject_name: string; cells: MathsecrHeatmapRow[] }>();
    for (const row of heatmap) {
      if (!row.level1_code) continue;
      const key = row.subject_code;
      if (!m.has(key)) m.set(key, { subject_code: row.subject_code, subject_name: row.subject_name, cells: [] });
      m.get(key)!.cells.push(row);
    }
    return Array.from(m.values()).sort((a, b) => a.subject_code.localeCompare(b.subject_code));
  }, [heatmap]);

  // ──────────────────────────────────────────────
  // 단원별 상태 리스트 — 최근 업데이트순 + 이름 조인
  // ──────────────────────────────────────────────
  const [nodeNameMap, setNodeNameMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const needed = nodeStatus
        .slice() // 원본 보존
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
        .slice(0, 30); // 조인 부하 제한
      if (needed.length === 0) return;
      const results = await Promise.all(
        needed.map(ns => getMathsecrNode(ns.mathsecr_code).catch(() => null)),
      );
      if (cancelled) return;
      const m = new Map<string, string>();
      for (let i = 0; i < needed.length; i++) {
        const name = results[i]?.full_path;
        if (name) m.set(needed[i].mathsecr_code, name);
      }
      setNodeNameMap(m);
    })();
    return () => { cancelled = true; };
  }, [nodeStatus]);

  const topNodeStatus = useMemo(() => {
    return nodeStatus
      .slice()
      .sort((a, b) => {
        // γ > β > α > unknown 순 + 최근 업데이트순
        const rank: Record<NodeStatus, number> = { gamma: 0, beta: 1, alpha: 2, unknown: 3 };
        const r = rank[a.status] - rank[b.status];
        if (r !== 0) return r;
        return (b.updated_at || '').localeCompare(a.updated_at || '');
      })
      .slice(0, 10);
  }, [nodeStatus]);

  // ──────────────────────────────────────────────
  // 처방 경고 카드 — γ 단원 하나 골라 표시
  // ──────────────────────────────────────────────
  const weakestNode = useMemo(() => {
    const gammas = nodeStatus.filter(n => n.status === 'gamma');
    if (gammas.length === 0) return null;
    // 가장 최근 업데이트된 γ 노드
    return gammas.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0];
  }, [nodeStatus]);
  const weakestLabel = weakestNode ? (nodeNameMap.get(weakestNode.mathsecr_code) || weakestNode.mathsecr_code) : null;

  // 선수 추적 (on-demand)
  const [tracing, setTracing] = useState(false);
  const [traceChain, setTraceChain] = useState<Awaited<ReturnType<typeof traceWeaknessChain>> | null>(null);
  const handleTrace = useCallback(async () => {
    if (!student?.id || !weakestNode) return;
    setTracing(true);
    try {
      const chain = await traceWeaknessChain(student.id, weakestNode.mathsecr_code);
      setTraceChain(chain);
    } catch (e) {
      alert('선수 추적 실패: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setTracing(false);
    }
  }, [student?.id, weakestNode]);

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  const handleSelectStudent = useCallback((id: string) => {
    router.push(`/dashboard/prescription?studentId=${id}`);
  }, [router]);

  return (
    <div className="flex h-screen bg-surface-base text-content-primary font-sans overflow-hidden">
      {/* ===== Sidebar ===== */}
      <div className={`flex-shrink-0 border-r border-white/10 bg-surface-raised transition-all ${sidebarCollapsed ? 'w-0' : 'w-72'} flex flex-col overflow-hidden`}>
        <div className="p-4 border-b border-white/10">
          <h2 className="font-bold text-lg mb-4">학생 선택</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="이름/학년 검색..."
              className="w-full bg-surface-card border border-white/10 rounded-lg py-2 pl-10 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {studentsLoading ? (
            <div className="flex items-center justify-center py-10 text-content-tertiary text-sm">
              <Loader2 className="animate-spin mr-2" size={16} /> 학생 목록 로딩 중…
            </div>
          ) : studentsError ? (
            <div className="p-3 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg">
              {studentsError}
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-6 text-center text-xs text-content-tertiary">
              {searchQuery ? '일치하는 학생 없음' : '학생이 없습니다'}
            </div>
          ) : (
            filteredStudents.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelectStudent(s.id)}
                className={`w-full text-left block p-3 rounded-xl transition-colors ${
                  s.id === student?.id
                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                    : 'hover:bg-white/5 text-gray-400 border border-transparent'
                }`}
              >
                <div className="font-bold text-sm">{s.name}</div>
                <div className="text-xs opacity-70 mt-0.5">
                  {s.grade || '-'} {s.className ? ` · ${s.className}` : ''}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ===== Main ===== */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-surface-base/50 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 hover:bg-white/10 rounded-lg"
              aria-label="사이드바 토글"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="font-bold text-xl flex items-center gap-2">
                AI Clinic
                <span className="bg-indigo-900/50 text-indigo-400 text-xs px-2 py-0.5 rounded border border-indigo-500/30">Beta</span>
              </h1>
              <p className="text-xs text-gray-500">정밀 진단 및 맞춤형 처방</p>
            </div>
          </div>
          {student && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="font-bold text-sm">{student.name}</div>
                <div className="text-xs text-gray-500">
                  {student.grade || '-'} {student.className ? `| ${student.className}` : ''}
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-lg font-bold">
                {student.name[0]}
              </div>
            </div>
          )}
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!student ? (
            <ClinicCard>
              <div className="py-10 text-center text-content-tertiary">
                {studentsLoading ? '학생 목록 로딩 중…' : '학생을 선택해 주세요.'}
              </div>
            </ClinicCard>
          ) : (
            <>
              {dataError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 text-xs">
                  데이터 로딩 중 오류: {dataError}
                </div>
              )}

              {/* ── Top Row: Radar + Actions + Warning ── */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Radar */}
                <ClinicCard className="col-span-1 lg:col-span-2">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <Sparkles size={18} className="text-indigo-400" />
                      오답 원인 분포 (5요인)
                    </h3>
                    <div className="text-xs text-content-tertiary">
                      총 {errorProfile.reduce((a, c) => a + c.cnt, 0)}건
                    </div>
                  </div>
                  <div className="h-[300px] w-full">
                    {dataLoading ? (
                      <div className="h-full flex items-center justify-center text-content-tertiary">
                        <Loader2 className="animate-spin mr-2" size={16} /> 분석 중…
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                          <PolarGrid stroke="#333" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                          <PolarRadiusAxis angle={30} domain={[0, radarMax]} tick={false} axisLine={false} />
                          <Radar
                            name="오답"
                            dataKey="A"
                            stroke="#6366f1"
                            strokeWidth={3}
                            fill="#6366f1"
                            fillOpacity={0.2}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#18181b', borderColor: '#333', color: '#fff' }}
                            itemStyle={{ color: '#fff' }}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </ClinicCard>

                {/* Actions + Warning Card 세로 스택 */}
                <div className="space-y-6">
                  <ClinicCard>
                    <h3 className="font-bold text-gray-400 text-sm mb-4 uppercase tracking-wider">Quick Actions</h3>
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => setShowCreateSessions(true)}
                        className="w-full flex items-center gap-2 px-4 py-3 rounded-xl font-medium bg-indigo-600 text-content-primary hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all"
                      >
                        <QrCode size={18} />
                        <span>QR 채점 세션 생성</span>
                      </button>
                      <Link
                        href={`/dashboard/prescription/entry${student ? `?studentId=${student.id}` : ''}`}
                        className="w-full flex items-center gap-2 px-4 py-3 rounded-xl font-medium bg-white/5 text-content-primary border border-white/10 hover:bg-white/10 transition-all"
                      >
                        <ClipboardList size={18} />
                        <span>진단 결과 수동 입력</span>
                      </Link>
                      <ActionButton icon={Printer} label="맞춤형 학습지 출력" disabled />
                      {/* ★ Phase D 후속: 학부모 link 발급 — 클릭 → token 생성 → URL 복사 */}
                      <button
                        type="button"
                        disabled={!student}
                        onClick={async () => {
                          if (!student) return;
                          const label = window.prompt(
                            '학부모 메모 (선택, 예: "어머니"):',
                            ''
                          );
                          if (label === null) return; // 취소
                          try {
                            const res = await fetch('/api/parent/issue', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                student_id: student.id,
                                label: label || undefined,
                              }),
                            });
                            const d = await res.json();
                            if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
                            // 클립보드 복사 시도 + 사용자에게 표시
                            try {
                              await navigator.clipboard.writeText(d.url);
                              window.alert(`학부모 link 발급 완료. 클립보드에 복사됨:\n\n${d.url}`);
                            } catch {
                              window.prompt('아래 URL을 복사해 학부모에게 전달하세요:', d.url);
                            }
                          } catch (e) {
                            window.alert(`발급 실패: ${e instanceof Error ? e.message : e}`);
                          }
                        }}
                        className="w-full flex items-center gap-2 px-4 py-3 rounded-xl font-medium bg-white/5 text-content-primary border border-white/10 hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send size={18} />
                        <span>학부모 link 발급</span>
                      </button>
                    </div>
                  </ClinicCard>

                  {/* ★ Phase B: 학생 맞춤 추천 문항 — 약점 + 함정 + 난이도 결합 */}
                  {student && <RecommendedProblems studentId={student.id} />}

                  {/* ★ Phase C: AI 처방 추천 — 약점 체인 + 함정 패턴 결합 */}
                  {student && (
                    <PrescriptionRecommendation
                      studentId={student.id}
                      weakestUnit={
                        weakestNode
                          ? { fullPath: weakestLabel || weakestNode.mathsecr_code, status: weakestNode.status || null }
                          : null
                      }
                    />
                  )}

                  {/* ★ Phase C-3 B: "이번 주 새 연결" 위젯 — 카파시 영상의 본 메시지 */}
                  {student && <WeeklyConnections studentId={student.id} />}

                  {/* ★ Phase C-3: 학생 함정 누적 위젯 — 카파시 self-compiling 4번째 차원 시각화 */}
                  {student && <StudentPitfallSummary studentId={student.id} />}

                  {/* Warning / Prescription Card */}
                  {weakestNode ? (
                    <ClinicCard className="bg-gradient-to-br from-red-900/20 to-amber-900/20 border-red-500/20">
                      <div className="flex items-start gap-3">
                        <div className="bg-red-500/20 p-2 rounded-lg text-red-400 flex-shrink-0">
                          <AlertCircle size={24} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-red-300 mb-1">γ 단원 처방 필요</h4>
                          <p className="text-xs text-red-200/80 leading-relaxed break-words">
                            <span className="font-semibold">{weakestLabel}</span> 불안정 상태.
                            선수 추적으로 기초 결손 확인 후 처방 추천.
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={handleTrace}
                              disabled={tracing}
                              className="text-xs font-bold text-content-primary bg-red-600 px-3 py-1.5 rounded hover:bg-red-500 disabled:opacity-60 flex items-center gap-1"
                            >
                              {tracing ? <Loader2 className="animate-spin" size={14} /> : <TrendingDown size={14} />}
                              선수 추적
                            </button>
                            <Link
                              href="/tutor/clinic"
                              className="text-xs font-bold text-red-300 border border-red-500/40 px-3 py-1.5 rounded hover:bg-red-500/10"
                            >
                              처방 생성
                            </Link>
                          </div>

                          {traceChain && traceChain.length > 0 && (
                            <div className="mt-3 p-2 rounded bg-black/30 border border-red-500/20 space-y-1">
                              <div className="text-[10px] uppercase tracking-wider text-red-200/70">약점 체인</div>
                              {traceChain.slice(0, 5).map((n, idx) => (
                                <div key={`${n.mathsecr_code}-${idx}`} className="text-[11px] text-red-100/90 break-words">
                                  {'→ '.repeat(n.depth)}{n.full_path}
                                  {n.last_score != null && (
                                    <span className="ml-1 text-red-200/60">({n.last_score}점)</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </ClinicCard>
                  ) : (
                    <ClinicCard className="bg-gradient-to-br from-emerald-900/20 to-indigo-900/20 border-emerald-500/20">
                      <div className="flex items-start gap-3">
                        <div className="bg-emerald-500/20 p-2 rounded-lg text-emerald-400 flex-shrink-0">
                          <Sparkles size={24} />
                        </div>
                        <div>
                          <h4 className="font-bold text-emerald-300 mb-1">안정</h4>
                          <p className="text-xs text-emerald-200/80 leading-relaxed">
                            γ(불안정) 단원이 없습니다. 진단 입력이 부족하면 결과가 불완전할 수 있어요.
                          </p>
                        </div>
                      </div>
                    </ClinicCard>
                  )}
                </div>
              </div>

              {/* ── Heatmap ── */}
              <ClinicCard>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Activity size={18} className="text-indigo-400" />
                    과목 × 대단원 히트맵
                  </h3>
                  <div className="text-xs text-content-tertiary flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded" style={{ background: STATUS_COLOR.alpha }} />α
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded" style={{ background: STATUS_COLOR.beta }} />β
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded" style={{ background: STATUS_COLOR.gamma }} />γ
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded" style={{ background: STATUS_COLOR.unknown }} />미측정
                    </span>
                  </div>
                </div>
                {heatmapBySubject.length === 0 ? (
                  <div className="text-center py-10 text-content-tertiary text-sm">
                    {dataLoading ? '로딩 중…' : '히트맵 데이터가 아직 없습니다.'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {heatmapBySubject.map(subj => (
                      <div key={subj.subject_code}>
                        <div className="text-xs font-semibold text-content-secondary mb-1">
                          {subj.subject_name}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                          {subj.cells.map(cell => {
                            const dominant: NodeStatus =
                              cell.gamma_count > 0 ? 'gamma' :
                              cell.beta_count > 0 ? 'beta' :
                              cell.alpha_count > 0 ? 'alpha' : 'unknown';
                            const color = STATUS_COLOR[dominant];
                            return (
                              <motion.div
                                key={cell.level1_code || Math.random()}
                                whileHover={{ scale: 1.03 }}
                                className="relative rounded-xl p-3 border"
                                style={{
                                  background: `${color}22`,
                                  borderColor: `${color}55`,
                                }}
                                title={`${cell.level1_name} — α:${cell.alpha_count} β:${cell.beta_count} γ:${cell.gamma_count} (총 ${cell.nodes_total})`}
                              >
                                <div className="text-sm font-bold truncate" style={{ color }}>
                                  {cell.level1_name || '(미분류)'}
                                </div>
                                <div className="text-[10px] text-content-tertiary mt-1">
                                  α{cell.alpha_count} β{cell.beta_count} γ{cell.gamma_count}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ClinicCard>

              {/* ── 단원별 상태 리스트 + 진단 이력 ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ClinicCard>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">단원별 상태 (γ 우선)</h3>
                    <div className="text-xs text-content-tertiary">{nodeStatus.length}개</div>
                  </div>
                  {topNodeStatus.length === 0 ? (
                    <div className="text-center py-6 text-content-tertiary text-sm">
                      {dataLoading ? '로딩 중…' : '데이터가 아직 없습니다.'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {topNodeStatus.map(ns => {
                        const color = STATUS_COLOR[ns.status];
                        const name = nodeNameMap.get(ns.mathsecr_code) || ns.mathsecr_code;
                        return (
                          <div
                            key={ns.mathsecr_code}
                            className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs"
                            style={{ borderColor: `${color}44`, background: `${color}10` }}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold truncate" style={{ color }}>
                                {STATUS_LABEL[ns.status]}
                              </div>
                              <div className="text-content-secondary break-words mt-0.5" title={name}>
                                {name}
                              </div>
                            </div>
                            <div className="text-right text-[10px] text-content-tertiary flex-shrink-0">
                              <div>{ns.items_correct}/{ns.items_total}</div>
                              {ns.last_score != null && <div>{ns.last_score}점</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ClinicCard>

                <ClinicCard>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <Calendar size={18} className="text-indigo-400" />
                      진단 이력
                    </h3>
                    <div className="text-xs text-content-tertiary">{sessions.length}건</div>
                  </div>
                  {sessions.length === 0 ? (
                    <div className="text-center py-6 text-content-tertiary text-sm">
                      {dataLoading ? '로딩 중…' : '아직 진단 이력이 없습니다.'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sessions.slice(0, 8).map(s => (
                        <div key={s.id} className="flex items-center gap-3 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs">
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold flex-shrink-0 ${SESSION_TYPE_COLOR[s.session_type] || ''}`}>
                            {SESSION_TYPE_LABEL[s.session_type] || s.session_type}
                            {s.round_no != null ? ` ${s.round_no}회차` : ''}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-content-secondary truncate">
                              {s.mathflat_sheet_name || s.note || '(세부 정보 없음)'}
                            </div>
                            <div className="text-[10px] text-content-tertiary mt-0.5">
                              {formatDate(s.conducted_at)}
                              {s.duration_min != null ? ` · ${s.duration_min}분` : ''}
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-content-tertiary flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                </ClinicCard>
              </div>
            </>
          )}
        </div>
      </main>

      {/* QR 채점 세션 일괄 생성 모달 */}
      <CreateSessionsModal
        isOpen={showCreateSessions}
        onClose={() => setShowCreateSessions(false)}
        students={students}
        defaultStudentId={student?.id || null}
        onCreated={() => {
          // 세션 생성 후 진단 이력 재조회
          if (student?.id) {
            getStudentSessions(student.id).then(setSessions).catch(() => {});
          }
        }}
      />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-surface-base text-content-primary">
          Loading Clinic...
        </div>
      }
    >
      <PrescriptionContent />
    </Suspense>
  );
}
