'use client';

// ============================================================================
// /dashboard/grading — QR 채점 세션 관리 페이지
//
// 매일 사용하는 채점 워크플로우의 1급 진입점.
// - "QR 채점 세션 생성" 버튼 → CreateSessionsModal
// - 학생별/시험지별/상태별 필터
// - 각 세션 카드 → [강사 PDF] [학생 PDF] [답입력] [채점] 4종 진입 링크
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ClipboardCheck, Printer, QrCode, ExternalLink, Search, Plus, Loader2,
  Filter, CheckCircle2, Clock, AlertCircle, Camera, Trash2,
  type LucideIcon,
} from 'lucide-react';
import { gradeIntToLabel } from '@/lib/students/grade-label';
import CreateSessionsModal from '@/components/prescription/CreateSessionsModal';
import GradingSheetUpload from '@/components/grading/GradingSheetUpload';
// 채점 허브 통합 — 수동 입력 폼 (진단/시험지 공통, 같은 컴포넌트 재사용)
import { ManualGradingEntry } from '@/app/dashboard/prescription/entry/ManualGradingEntry';
// 채점 허브 통합 — 엑셀 일괄 채점 (시험지 선택 → 학생 답안 엑셀 업로드, 같은 컴포넌트 재사용)
import StudentsTab from '@/app/dashboard/exam-analysis/[examId]/StudentsTab';
import { useExamList } from '@/hooks/useExamProblems';

// ============================================================================
// Types
// ============================================================================
interface SessionRow {
  id: string;
  student_id: string;
  student_name: string;
  student_grade?: number | null;
  exam_id: string;
  exam_title: string;
  round_number: number;
  session_type: string;
  issued_at: string;
  started_at: string | null;
  completed_at: string | null;
  problems_total: number;
  problems_graded: number;
  correct_cnt: number;
  score_pct: number | null;
}

interface Student {
  id: string;
  name: string;
  grade: string;
  className: string;
}

const SESSION_TYPE_LABEL: Record<string, string> = {
  BS: '광역 스캔', DD: '정밀 진단', PT: '선수 추적', SC: '스팟 체크',
  WS: '학습지', EX: '시험지',
};

const SESSION_TYPE_COLOR: Record<string, string> = {
  BS: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  DD: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  PT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  SC: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  WS: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  EX: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

type StatusFilter = 'all' | 'pending' | 'done';

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
  } catch {
    return iso;
  }
}

// ============================================================================
// Page
// ============================================================================
export default function GradingPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 채점 허브 탭 — QR 세션 채점 / 수동 입력 / 엑셀 채점
  const [activeTab, setActiveTab] = useState<'qr' | 'manual' | 'excel'>('qr');
  // 엑셀 채점 — 시험지 선택 (StudentsTab 은 examId 필요)
  const { exams: examList } = useExamList();
  const [excelExamId, setExcelExamId] = useState<string>('');

  // ?tab= 으로 초기 탭 진입 (네비 "수동 채점 입력" → /dashboard/grading?tab=manual)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'manual' || t === 'excel') setActiveTab(t);
  }, []);

  // 엑셀 채점 — 시험지 검색·분류 필터
  const [excelSearch, setExcelSearch] = useState('');
  const [excelSubject, setExcelSubject] = useState('전체');
  const [excelType, setExcelType] = useState('전체');
  const [excelGrade, setExcelGrade] = useState('전체');
  const distinct = (vals: (string | null)[]) =>
    ['전체', ...Array.from(new Set(vals.filter((v): v is string => !!v)))];
  const excelSubjects = useMemo(() => distinct(examList.map((e) => e.subject)), [examList]);
  const excelTypes = useMemo(() => distinct(examList.map((e) => e.examType)), [examList]);
  const excelGrades = useMemo(() => distinct(examList.map((e) => e.grade)), [examList]);
  const excelFilteredExams = useMemo(() => {
    const q = excelSearch.trim().toLowerCase();
    return examList.filter((e) =>
      (excelSubject === '전체' || e.subject === excelSubject) &&
      (excelType === '전체' || e.examType === excelType) &&
      (excelGrade === '전체' || e.grade === excelGrade) &&
      (!q || (e.title || '').toLowerCase().includes(q)),
    );
  }, [examList, excelSearch, excelSubject, excelType, excelGrade]);

  // 필터
  const [studentFilter, setStudentFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState<string>('');

  // 모달
  const [showCreate, setShowCreate] = useState(false);
  const [sheetUpload, setSheetUpload] = useState<SessionRow | null>(null);

  // 세션 삭제 — 휴지통 아이콘 클릭 시 confirm 없이 즉시 삭제.
  //   사용자 명시: "묻지말고 내가 삭제 가능하게 해라".
  //   잘못 만든 R1·R2 같은 중복 세션을 1클릭으로 정리.
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 학생 이름 일괄 복구 — "(이름 없음)" 학생들의 auth metadata.full_name → public.users.full_name
  const [backfilling, setBackfilling] = useState(false);
  const handleBackfillNames = async () => {
    if (backfilling) return;
    setBackfilling(true);
    try {
      const res = await fetch('/api/admin/users/backfill-names', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // ★ details/hint 까지 alert + console — Supabase 쿼리 실패 원인 식별용
        const detail = [data.error, data.details, data.hint].filter(Boolean).join(' | ');
        console.error('[backfill-names] 실패:', { status: res.status, data });
        throw new Error(detail || `HTTP ${res.status}`);
      }
      alert(
        `이름 복구 완료\n` +
        `검사 대상: ${data.scanned}명\n` +
        `복구됨: ${data.updated}명\n` +
        `메타에도 이름 없음: ${data.skippedNoMeta}명`,
      );
      void loadSessions();
    } catch (e) {
      alert(`이름 복구 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBackfilling(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (deletingId) return;
    setDeletingId(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // 로컬 state 즉시 제거 — refetch 없이 카드 사라짐
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (e) {
      alert(`세션 삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeletingId(null);
    }
  };

  // ──────────────────────────────────────────────
  // 데이터 로드
  // ──────────────────────────────────────────────
  const loadSessions = async (opts?: { studentId?: string; status?: StatusFilter }) => {
    const studentId = opts?.studentId ?? studentFilter;
    const status = opts?.status ?? statusFilter;
    const qs = new URLSearchParams();
    if (studentId) qs.set('student_id', studentId);
    if (status !== 'all') qs.set('status', status);
    qs.set('limit', '100');
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSessions((data.sessions || []) as SessionRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // 학생 목록 로드 (필터 드롭다운용)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/users/students');
        const data = await res.json();
        if (!cancelled && Array.isArray(data.students)) {
          setStudents(data.students);
        }
      } catch (e) {
        console.error('[grading] students load error:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 세션 목록 — 필터 변경 시 재조회
  useEffect(() => {
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentFilter, statusFilter]);

  // 검색 필터링 (클라이언트)
  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.trim().toLowerCase();
    return sessions.filter(s =>
      (s.student_name || '').toLowerCase().includes(q) ||
      (s.exam_title || '').toLowerCase().includes(q),
    );
  }, [sessions, search]);

  // 집계
  const stats = useMemo(() => {
    const total = sessions.length;
    const done = sessions.filter(s => s.completed_at).length;
    const pending = total - done;
    return { total, done, pending };
  }, [sessions]);

  // ──────────────────────────────────────────────
  // 렌더
  // ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-base text-content-primary">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardCheck size={26} className="text-emerald-400" />
              채점하기
            </h1>
            <p className="text-sm text-content-tertiary mt-1">
              QR 채점 세션을 만들고 학생 답안을 채점합니다 — 학생용 PDF 의 QR 로 학생 직접 입력, 강사용 페이지에서 O/X 확인.
            </p>
          </div>
          {activeTab === 'qr' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBackfillNames}
                disabled={backfilling}
                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-content-secondary text-xs flex items-center gap-2 disabled:opacity-50"
                title="(이름 없음) 학생들의 이름을 auth metadata 에서 일괄 복구"
              >
                {backfilling ? <Loader2 size={14} className="animate-spin" /> : <Filter size={14} />}
                이름 일괄 복구
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-semibold text-sm flex items-center gap-2 shadow-lg shadow-indigo-500/30"
              >
                <Plus size={16} /> QR 채점 세션 생성
              </button>
            </div>
          )}
        </div>

        {/* 채점 모드 탭 — QR 세션 채점 / 수동 입력 */}
        <div className="flex gap-1 border-b border-white/10 mb-6">
          {([['qr', 'QR 세션 채점'], ['manual', '수동 입력'], ['excel', '엑셀 채점']] as const).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
                activeTab === t
                  ? 'border-emerald-400 text-content-primary'
                  : 'border-transparent text-content-tertiary hover:text-content-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'qr' && (<>
        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="전체 세션" value={stats.total} icon={ClipboardCheck} color="text-content-primary" />
          <StatCard label="미채점" value={stats.pending} icon={Clock} color="text-amber-400" />
          <StatCard label="채점 완료" value={stats.done} icon={CheckCircle2} color="text-emerald-400" />
        </div>

        {/* 필터 */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-tertiary" />
            <input
              type="text"
              placeholder="학생명 / 시험지 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-card border border-white/10 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 text-xs text-content-tertiary">
            <Filter size={12} /> 학생
          </div>
          <select
            value={studentFilter}
            onChange={(e) => setStudentFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-surface-card border border-white/10 text-sm focus:border-indigo-400 focus:outline-none"
          >
            <option value="">전체</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{gradeIntToLabel(s.grade) ? ` (${gradeIntToLabel(s.grade)})` : ''}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 text-xs text-content-tertiary">상태</div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 rounded-lg bg-surface-card border border-white/10 text-sm focus:border-indigo-400 focus:outline-none"
          >
            <option value="all">전체</option>
            <option value="pending">미채점</option>
            <option value="done">완료</option>
          </select>
        </div>

        {/* 세션 리스트 */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-content-tertiary">
            <Loader2 className="animate-spin mr-2" size={18} /> 세션 로딩 중…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <div>{error}</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-content-tertiary py-20">
            세션이 없습니다. 우측 상단 [QR 채점 세션 생성] 버튼으로 시작하세요.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(s => (
              <SessionCard
                key={s.id}
                session={s}
                onSheetUpload={() => setSheetUpload(s)}
                onDelete={() => handleDeleteSession(s.id)}
                isDeleting={deletingId === s.id}
              />
            ))}
          </div>
        )}
        </>)}

        {/* 수동 입력 탭 — 진단/시험지 수동 채점 (같은 컴포넌트 재사용) */}
        {activeTab === 'manual' && (
          <div className="-mx-6 -mb-8">
            <ManualGradingEntry />
          </div>
        )}

        {/* 엑셀 채점 탭 — 시험지 검색·분류 → 선택 → 학생 답안 엑셀 일괄 업로드 (StudentsTab 재사용) */}
        {activeTab === 'excel' && (
          <div>
            {/* 검색 + 분류 필터 */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-tertiary" />
                <input
                  type="text"
                  placeholder="시험지명 검색"
                  value={excelSearch}
                  onChange={(e) => setExcelSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-card border border-white/10 text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <select value={excelSubject} onChange={(e) => setExcelSubject(e.target.value)}
                className="px-3 py-2 rounded-lg bg-surface-card border border-white/10 text-sm focus:border-indigo-400 focus:outline-none">
                {excelSubjects.map((s) => <option key={s} value={s}>{s === '전체' ? '과목 전체' : s}</option>)}
              </select>
              <select value={excelType} onChange={(e) => setExcelType(e.target.value)}
                className="px-3 py-2 rounded-lg bg-surface-card border border-white/10 text-sm focus:border-indigo-400 focus:outline-none">
                {excelTypes.map((s) => <option key={s} value={s}>{s === '전체' ? '유형 전체' : s}</option>)}
              </select>
              <select value={excelGrade} onChange={(e) => setExcelGrade(e.target.value)}
                className="px-3 py-2 rounded-lg bg-surface-card border border-white/10 text-sm focus:border-indigo-400 focus:outline-none">
                {excelGrades.map((s) => <option key={s} value={s}>{s === '전체' ? '학년 전체' : s}</option>)}
              </select>
            </div>

            {/* 시험지 리스트 (클릭 선택) */}
            <div className="max-h-72 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5 mb-5">
              {excelFilteredExams.length === 0 ? (
                <div className="text-center text-content-tertiary py-10 text-sm">조건에 맞는 시험지가 없습니다.</div>
              ) : excelFilteredExams.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => setExcelExamId(ex.id)}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-white/5 transition ${
                    excelExamId === ex.id ? 'bg-indigo-500/15' : ''
                  }`}
                >
                  <span className="text-sm text-content-primary truncate">{ex.title}</span>
                  <span className="text-[11px] text-content-tertiary flex-shrink-0">
                    {[ex.subject, ex.grade, ex.examType].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))}
            </div>

            {/* 선택된 시험지 엑셀 채점 */}
            {excelExamId ? (
              <StudentsTab examId={excelExamId} />
            ) : (
              <div className="text-center text-content-tertiary py-12">
                시험지를 선택하면 학생 답안 엑셀을 업로드해 일괄 채점할 수 있습니다.
              </div>
            )}
          </div>
        )}
      </div>

      {/* 세션 생성 모달 */}
      <CreateSessionsModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        students={students.map(st => ({
          id: st.id,
          name: st.name,
          grade: st.grade || '',
          className: st.className || '',
        }))}
        onCreated={() => {
          // 모달 닫힌 뒤 세션 재조회
          void loadSessions();
        }}
      />

      {/* 채점표 이미지 자동 채점 모달 */}
      {sheetUpload && (
        <GradingSheetUpload
          sessionId={sheetUpload.id}
          studentName={sheetUpload.student_name}
          examTitle={sheetUpload.exam_title}
          onClose={() => setSheetUpload(null)}
          onSaved={() => {
            setSheetUpload(null);
            void loadSessions();
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Components
// ============================================================================
function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
}) {
  return (
    <div className="bg-surface-card border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs text-content-tertiary mb-1">
        <Icon size={12} /> {label}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function SessionCard({
  session: s,
  onSheetUpload,
  onDelete,
  isDeleting,
}: {
  session: SessionRow;
  onSheetUpload: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const isDone = !!s.completed_at;
  const pct = s.score_pct ?? null;
  const progressPct = s.problems_total > 0
    ? Math.round((s.problems_graded / s.problems_total) * 100)
    : 0;

  return (
    <div className={`rounded-xl border bg-surface-card overflow-hidden ${isDone ? 'border-emerald-500/30' : 'border-white/10'}`}>
      <div className="p-4 flex items-center gap-4 flex-wrap">
        {/* 메타 */}
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${SESSION_TYPE_COLOR[s.session_type] || 'bg-white/5 border-white/10 text-content-tertiary'}`}>
              {SESSION_TYPE_LABEL[s.session_type] || s.session_type}
            </span>
            <span className="text-xs text-content-tertiary">R{s.round_number}</span>
            <span className="text-xs text-content-tertiary">·</span>
            <span className="text-xs text-content-tertiary">{fmtDate(s.issued_at)}</span>
            {isDone && (
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 ml-auto">
                <CheckCircle2 size={10} /> 완료
              </span>
            )}
          </div>
          <div className="font-semibold text-sm truncate flex items-center gap-2">
            <span>{s.student_name}</span>
            {gradeIntToLabel(s.student_grade) && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-content-tertiary font-normal">
                {gradeIntToLabel(s.student_grade)}
              </span>
            )}
          </div>
          <div className="text-xs text-content-tertiary truncate">{s.exam_title}</div>
        </div>

        {/* 진행률 */}
        <div className="min-w-[140px]">
          <div className="flex justify-between items-center text-[11px] text-content-tertiary mb-1">
            <span>채점 {s.problems_graded}/{s.problems_total}</span>
            {pct != null && (
              <span className="text-emerald-400 font-bold">{pct}%</span>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full transition-all ${isDone ? 'bg-emerald-500' : 'bg-indigo-500'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* 액션 버튼들 */}
        <div className="flex items-center gap-1.5">
          <a
            href={`/print/session/${s.id}?variant=teacher`}
            target="_blank"
            rel="noreferrer"
            className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1"
            title="강사용 인쇄 페이지"
          >
            <Printer size={12} /> 강사
          </a>
          <a
            href={`/print/session/${s.id}?variant=student`}
            target="_blank"
            rel="noreferrer"
            className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1"
            title="학생용 인쇄 페이지 — QR 이 /answer 로 향함"
          >
            <Printer size={12} /> 학생
          </a>
          <Link
            href={`/answer/${s.id}`}
            target="_blank"
            className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1"
            title="학생 답 입력 페이지 (미리보기)"
          >
            <QrCode size={12} /> 답입력
          </Link>
          <button
            type="button"
            onClick={onSheetUpload}
            className="text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 flex items-center gap-1"
            title="채점표 이미지 업로드 → AI 자동 채점"
          >
            <Camera size={12} /> 이미지 채점
          </button>
          <Link
            href={`/grade/${s.id}`}
            target="_blank"
            className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 flex items-center gap-1"
            title="강사 채점 페이지"
          >
            <ExternalLink size={12} /> 채점
          </Link>
          {/* ★ 세션 삭제 — 묻지말고 즉시 삭제. 잘못 만든 세션(R1·R2 중복 등) 정리용 */}
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="text-xs px-2 py-1 rounded bg-white/5 border border-rose-500/40 text-rose-300 hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-50 flex items-center gap-1"
            title="세션 삭제 (즉시)"
          >
            {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
}
