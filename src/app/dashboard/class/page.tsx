'use client';

// ============================================================================
// /dashboard/class — 수업 허브 (IA Phase 2)
//   "학생 한 명 보려면 4곳" 문제 해소 — 학생 선택 한 곳에서:
//   학습 보고서(점수 추이·약점·출제목록·세트 리포트·공유링크) + 진단/성적/클리닉 빠른 이동.
//   좌측 트리·보고서 본문은 출제 관리와 공용 컴포넌트 (StudentTreePanel / StudentLearningReport).
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Users, Loader2, RefreshCw, ExternalLink, GraduationCap,
  Stethoscope, BarChart3, FileText, ListChecks, UserCog,
} from 'lucide-react';
import { StudentTreePanel, type RosterStudent } from '@/components/class/StudentTreePanel';
import { StudentLearningReport, type LearningRow } from '@/components/class/StudentLearningReport';

interface Assignment extends LearningRow {
  student_name: string;
  grade: string;
  problems_total: number;
  correct_cnt: number;
}

export default function ClassHubPage() {
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selStudent, setSelStudent] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [aRes, sRes] = await Promise.all([
        fetch('/api/assignments'),
        fetch('/api/users/students'),
      ]);
      const aData = await aRes.json();
      if (!aRes.ok) throw new Error(aData.error || `HTTP ${aRes.status}`);
      setAssignments((aData.assignments || []) as Assignment[]);
      const sData = await sRes.json().catch(() => ({}));
      if (Array.isArray(sData.students)) {
        setStudents((sData.students as Array<Record<string, unknown>>).map((s) => ({
          id: s.id as string,
          name: (s.name as string) || '(이름 없음)',
          grade: (s.grade as string) || '',
          className: (s.className as string) || '',
        })));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  // 학생별 출제 수 (트리 배지)
  const countByStudent = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of assignments) m.set(a.student_id, (m.get(a.student_id) || 0) + 1);
    return m;
  }, [assignments]);

  const selMeta = selStudent ? students.find(s => s.id === selStudent) : null;
  const selName = selMeta?.name || '학생';

  // 선택 학생 출제 행 (시간순)
  const studentRows = useMemo(() => {
    if (!selStudent) return [];
    return assignments
      .filter(a => a.student_id === selStudent)
      .sort((a, b) => (a.issued_at || '').localeCompare(b.issued_at || ''));
  }, [assignments, selStudent]);

  const quickLinks = selStudent ? [
    { href: `/tutor/analytics?studentId=${selStudent}`, icon: BarChart3, label: '학생 성적' },
    { href: '/dashboard/prescription', icon: Stethoscope, label: '학생 진단' },
    { href: `/dashboard/prescription/report?studentId=${selStudent}`, icon: GraduationCap, label: '진단 종합 리포트' },
    { href: '/tutor/clinic', icon: FileText, label: '클리닉시험지' },
    { href: '/dashboard/assignments', icon: ListChecks, label: '출제 관리' },
  ] : [];

  return (
    <div className="flex h-[calc(100vh-7rem)] rounded-2xl border border-white/10 overflow-hidden bg-surface-card text-content-primary">
      {/* ===== 좌측: 학년/반 트리 (출제 관리와 공용) ===== */}
      <StudentTreePanel
        header={<><Users size={18} className="text-sky-400" /> 수업</>}
        students={students}
        counts={countByStudent}
        selected={selStudent}
        onSelect={setSelStudent}
      />

      {/* ===== 본문 ===== */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-sky-400" />
            <h1 className="text-lg font-bold">{selStudent ? `${selName} 학생` : '수업 — 학생 종합'}</h1>
            {selMeta && (
              <span className="text-xs text-content-tertiary">
                {selMeta.grade}{selMeta.className ? ` · ${selMeta.className}` : ''}
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/tutor/classes" className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-content-secondary text-xs flex items-center gap-1.5">
              <Users size={13} /> 반 관리
            </Link>
            <Link href="/tutor/students" className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-content-secondary text-xs flex items-center gap-1.5">
              <UserCog size={13} /> 학생 관리
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-content-secondary text-xs flex items-center gap-1.5"
            >
              <RefreshCw size={13} /> 새로고침
            </button>
          </div>
        </div>

        {/* 빠른 이동 — 학생 선택 시 */}
        {selStudent && (
          <div className="px-6 py-2.5 border-b border-white/10 flex items-center gap-2 flex-wrap">
            {quickLinks.map((q) => (
              <Link
                key={q.label}
                href={q.href}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-content-secondary flex items-center gap-1.5"
              >
                <q.icon size={13} /> {q.label} <ExternalLink size={9} className="opacity-40" />
              </Link>
            ))}
          </div>
        )}

        {/* 본문 */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-content-tertiary text-sm">
            <Loader2 size={16} className="animate-spin mr-2" /> 불러오는 중...
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-rose-300 text-sm">{error}</div>
        ) : !selStudent ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-content-tertiary text-sm">
              <Users size={32} className="mx-auto mb-3 opacity-40" />
              <p className="mb-1 text-base font-semibold text-content-secondary">왼쪽에서 학생을 선택하세요</p>
              <p>학습 보고서 · 진단 세트 리포트 · 학부모 공유링크를 한 곳에서 봅니다.</p>
              <p className="mt-2 text-xs">전체 학생 {students.length}명 · 출제 {assignments.length}건</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            {studentRows.length === 0 ? (
              <div className="text-center py-24 text-content-tertiary text-sm">
                {selName} 학생의 출제 내역이 없습니다. 출제 후 채점되면 보고서가 구성됩니다.
              </div>
            ) : (
              <StudentLearningReport
                student={{
                  id: selStudent,
                  name: selName,
                  grade: selMeta?.grade,
                  className: selMeta?.className,
                }}
                rows={studentRows}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
