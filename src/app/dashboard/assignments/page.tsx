'use client';

// ============================================================================
// /dashboard/assignments — 출제 관리 (매쓰플랫 "수업 > 학습지" 미러)
//   좌측: 학년/반 트리 (학년별 학생 수 → 펼치면 학생 목록, 학생 클릭=필터)
//   본문: 출제된 학습지/시험지 목록 — 학년·태그·제목·출제일·출제(학생)·채점(점수)
//   데이터: GET /api/assignments (QR + 수동/엑셀 합산) + /api/users/students (로스터)
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Users, Search, Loader2, RefreshCw,
  Printer, ExternalLink, ListChecks, History, PieChart, FileBarChart, TrendingUp,
} from 'lucide-react';
import { StudentTreePanel, gradeRank, type RosterStudent } from '@/components/class/StudentTreePanel';
import { StudentLearningReport } from '@/components/class/StudentLearningReport';

type Student = RosterStudent;
interface Assignment {
  id: string; source: 'qr' | 'manual';
  student_id: string; student_name: string; grade: string;
  exam_id: string | null;
  title: string; tag: string; issued_at: string | null;
  completed: boolean; problems_total: number; correct_cnt: number; score_pct: number | null;
}

const TAG_COLOR = (tag: string): string => {
  if (tag.startsWith('시험지')) return 'text-content-primary';
  if (tag.startsWith('학습지')) return 'text-content-secondary';
  return 'text-content-tertiary';
};

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  } catch { return iso; }
}

export default function AssignmentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selStudent, setSelStudent] = useState<string | null>(null); // null = 전체
  const [titleSearch, setTitleSearch] = useState('');
  // 본문 상단 탭 (매쓰플랫 수업: 학습내역 | 학습지 | 보고서 + 유형분석 링크아웃)
  //   보고서 = 학생별 학습지 리포트(StudentLearningReport 공용 컴포넌트 — 수업 허브와 공유).
  const [tab, setTab] = useState<'history' | 'worksheet' | 'report'>('worksheet');

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

  // 본문 필터: 선택 학생 + 제목 검색
  const filtered = useMemo(() => {
    let rows = assignments;
    if (selStudent) rows = rows.filter(a => a.student_id === selStudent);
    const tq = titleSearch.trim().toLowerCase();
    if (tq) rows = rows.filter(a => a.title.toLowerCase().includes(tq));
    return rows;
  }, [assignments, selStudent, titleSearch]);

  const selStudentName = selStudent
    ? (students.find(s => s.id === selStudent)?.name || '학생')
    : null;

  const summary = useMemo(() => {
    const total = filtered.length;
    const done = filtered.filter(a => a.completed).length;
    const scored = filtered.filter(a => a.score_pct != null);
    const avg = scored.length ? Math.round(scored.reduce((s, a) => s + (a.score_pct || 0), 0) / scored.length) : null;
    return { total, done, avg };
  }, [filtered]);

  // 학습내역 — 전체: 학생별 요약(출제수·완료·평균·최근). 선택 시: 그 학생 시간순(filtered 재사용).
  const historyByStudent = useMemo(() => {
    const map = new Map<string, { id: string; name: string; grade: string; rows: Assignment[] }>();
    for (const a of assignments) {
      const cur = map.get(a.student_id) || { id: a.student_id, name: a.student_name, grade: a.grade, rows: [] };
      cur.rows.push(a);
      map.set(a.student_id, cur);
    }
    return Array.from(map.values())
      .map((s) => {
        const scored = s.rows.filter(r => r.score_pct != null);
        const avg = scored.length ? Math.round(scored.reduce((x, r) => x + (r.score_pct || 0), 0) / scored.length) : null;
        const recent = [...s.rows].sort((a, b) => (b.issued_at || '').localeCompare(a.issued_at || ''));
        return {
          id: s.id, name: s.name, grade: s.grade,
          count: s.rows.length,
          done: s.rows.filter(r => r.completed).length,
          avg,
          last: recent[0] || null,
        };
      })
      .sort((a, b) => (gradeRank(a.grade) - gradeRank(b.grade)) || a.name.localeCompare(b.name, 'ko'));
  }, [assignments]);

  // 선택 학생 시간순 (학습내역 타임라인) + 누적 평균 추이
  const studentTimeline = useMemo(() => {
    if (!selStudent) return [];
    return assignments
      .filter(a => a.student_id === selStudent)
      .sort((a, b) => (a.issued_at || '').localeCompare(b.issued_at || ''));
  }, [assignments, selStudent]);

  return (
    <div className="flex h-[calc(100vh-7rem)] rounded-2xl border border-white/10 overflow-hidden bg-surface-card text-content-primary">
      {/* ===== 좌측: 학년/반 트리 (공용 컴포넌트 — 수업 허브와 공유) ===== */}
      <StudentTreePanel
        header={<><ListChecks size={18} className="text-content-tertiary" /> 출제 관리</>}
        students={students}
        counts={countByStudent}
        selected={selStudent}
        onSelect={setSelStudent}
      />

      {/* ===== 본문: 학습지 목록 ===== */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ListChecks size={20} className="text-content-tertiary" />
            <h1 className="text-lg font-bold">
              {selStudentName ? `${selStudentName} 학생 출제 내역` : '전체 출제 내역'}
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs ml-2">
            <span className="px-2 py-0.5 rounded border border-white/[.08] bg-white/[.04] text-content-secondary tabular-nums whitespace-nowrap">출제 {summary.total}</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 tabular-nums whitespace-nowrap">완료 {summary.done}</span>
            {summary.avg != null && (
              <span className="px-2 py-0.5 rounded border border-white/[.08] bg-white/[.04] text-content-secondary tabular-nums whitespace-nowrap">평균 {summary.avg}%</span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-tertiary" />
              <input
                value={titleSearch}
                onChange={(e) => setTitleSearch(e.target.value)}
                placeholder="학습지명 검색"
                className="pl-8 pr-3 py-1.5 rounded-lg bg-white/[.04] border border-white/[.08] text-sm w-48 focus:border-white/25 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-content-secondary text-xs flex items-center gap-1.5"
            >
              <RefreshCw size={13} /> 새로고침
            </button>
          </div>
        </div>

        {/* 본문 상단 탭 — 매쓰플랫 수업 (학습내역 | 학습지 | 유형분석 | 보고서) */}
        <div className="flex items-center gap-1 px-6 border-b border-white/10">
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'history' ? 'text-content-primary border-white/50' : 'text-content-tertiary border-transparent hover:text-content-primary'
            }`}
          >
            <History size={14} /> 학습내역
          </button>
          <button
            type="button"
            onClick={() => setTab('worksheet')}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'worksheet' ? 'text-content-primary border-white/50' : 'text-content-tertiary border-transparent hover:text-content-primary'
            }`}
          >
            <ListChecks size={14} /> 학습지
          </button>
          {/* 보고서 — 학생별 학습지 리포트 (이 페이지 데이터로 구성). in-page 탭. */}
          <button
            type="button"
            onClick={() => setTab('report')}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'report' ? 'text-content-primary border-white/50' : 'text-content-tertiary border-transparent hover:text-content-primary'
            }`}
          >
            <FileBarChart size={14} /> 보고서
          </button>
          {/* 유형분석 — 기존 히트맵으로 연결(중복 구현 회피). 진단 상세는 보고서 안에서 링크. */}
          <Link
            href={selStudent ? `/tutor/analytics?studentId=${selStudent}` : '/tutor/analytics'}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-content-tertiary border-b-2 border-transparent hover:text-content-primary"
            title="학생 성적·히트맵 페이지로 이동"
          >
            <PieChart size={14} /> 유형분석 <ExternalLink size={11} className="opacity-50" />
          </Link>
        </div>

        {error && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-red-900/20 border border-red-500/30 text-red-300 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-content-tertiary">
            <Loader2 className="animate-spin mr-2" size={18} /> 불러오는 중…
          </div>
        ) : tab === 'worksheet' ? (
          <div className="flex-1 overflow-y-auto">
            {/* 테이블 헤더 */}
            <div className="sticky top-0 z-10 grid grid-cols-[60px_72px_1fr_84px_84px_100px_120px] gap-3 px-6 py-2.5 bg-surface-base/95 backdrop-blur border-b border-white/10 text-[11px] uppercase tracking-wide text-content-tertiary font-medium">
              <span>학년</span>
              <span>태그</span>
              <span>학습지명</span>
              <span className="text-center">출제일</span>
              <span className="text-center">출제</span>
              <span className="text-right">채점</span>
              <span className="text-center">관리</span>
            </div>
            <div className="divide-y divide-white/5">
              {filtered.map((a) => (
                <div key={`${a.source}-${a.id}`} className="grid grid-cols-[60px_72px_1fr_84px_84px_100px_120px] gap-3 px-6 py-3 items-center hover:bg-white/[0.02]">
                  <span className="text-xs text-content-tertiary">{a.grade || '-'}</span>
                  <span className={`text-xs font-medium ${TAG_COLOR(a.tag)}`}>{a.tag}</span>
                  <div className="min-w-0">
                    <div className="text-sm truncate" title={a.title}>{a.title}</div>
                    <div className="text-[11px] text-content-tertiary">
                      {a.problems_total > 0 ? `${a.problems_total}문제` : '문항 정보 없음'}
                      {a.source === 'manual' && <span className="ml-1.5 text-content-tertiary">· 수동</span>}
                    </div>
                  </div>
                  <span className="text-xs text-content-tertiary text-center tabular-nums">{fmtDate(a.issued_at)}</span>
                  <span className="text-xs text-center truncate" title={a.student_name}>{a.student_name}</span>
                  <span className="text-right">
                    {a.score_pct != null ? (
                      <span className={`text-sm font-bold tabular-nums ${a.score_pct >= 80 ? 'text-emerald-300' : a.score_pct >= 60 ? 'text-amber-300' : 'text-rose-300'}`}>
                        {a.score_pct}점
                      </span>
                    ) : a.completed ? (
                      <span className="text-xs text-content-tertiary">채점대기</span>
                    ) : (
                      <span className="text-xs text-amber-300/70">미응시</span>
                    )}
                  </span>
                  <span className="flex items-center justify-center gap-1.5">
                    {a.source === 'qr' ? (
                      <>
                        <a
                          href={`/print/session/${a.id}?variant=student`}
                          target="_blank" rel="noreferrer"
                          className="text-[11px] px-2 py-1 rounded border border-white/[.08] bg-white/[.04] text-content-secondary hover:bg-white/[.06] hover:text-content-primary flex items-center gap-1"
                          title="학생용 인쇄"
                        >
                          <Printer size={11} />
                        </a>
                        <Link
                          href={`/grade/${a.id}`}
                          target="_blank"
                          className="text-[11px] px-2 py-1 rounded border border-white/[.08] bg-white/[.04] text-content-secondary hover:bg-white/[.06] hover:text-content-primary flex items-center gap-1 whitespace-nowrap"
                          title="채점"
                        >
                          <ExternalLink size={11} /> 채점
                        </Link>
                      </>
                    ) : (
                      <span className="text-[11px] text-content-tertiary">수동입력</span>
                    )}
                  </span>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="text-center py-20 text-content-tertiary text-sm">
                  {selStudentName ? `${selStudentName} 학생에게 출제된 내역이 없습니다.` : '출제 내역이 없습니다. 시험지관리에서 출제하거나 채점 결과를 입력해 보세요.'}
                </div>
              )}
            </div>
          </div>
        ) : tab === 'history' ? (
          /* ===== 학습내역 탭 ===== */
          <div className="flex-1 overflow-y-auto p-6">
            {selStudent ? (
              // 선택 학생 — 시간순 타임라인 + 누적 평균
              studentTimeline.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-content-tertiary mb-3">
                    <TrendingUp size={15} className="text-content-tertiary" />
                    <span>{selStudentName} 학생 — 출제 {studentTimeline.length}건 · 시간순</span>
                  </div>
                  {studentTimeline.map((a, i) => (
                    <div key={`${a.source}-${a.id}`} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                      <span className="text-[11px] text-content-tertiary w-16 tabular-nums">{fmtDate(a.issued_at)}</span>
                      <span className={`text-xs font-medium w-16 ${TAG_COLOR(a.tag)}`}>{a.tag}</span>
                      <span className="text-sm flex-1 truncate" title={a.title}>{a.title}</span>
                      <span className="text-[11px] text-content-tertiary w-14 text-right">{a.problems_total > 0 ? `${a.problems_total}문제` : '-'}</span>
                      <span className="w-20 text-right">
                        {a.score_pct != null ? (
                          <span className={`text-sm font-bold tabular-nums ${a.score_pct >= 80 ? 'text-emerald-300' : a.score_pct >= 60 ? 'text-amber-300' : 'text-rose-300'}`}>{a.score_pct}점</span>
                        ) : (
                          <span className="text-xs text-content-tertiary">{a.completed ? '채점대기' : '미응시'}</span>
                        )}
                      </span>
                      <span className="text-[10px] text-content-tertiary w-6 text-right">#{i + 1}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20 text-content-tertiary text-sm">{selStudentName} 학생 학습내역이 없습니다.</div>
              )
            ) : (
              // 전체 — 학생별 요약표
              <div className="rounded-2xl border border-white/10 overflow-hidden">
                <div className="grid grid-cols-[1fr_60px_90px_90px_90px_1fr] gap-3 px-4 py-2.5 bg-white/[0.03] border-b border-white/10 text-[11px] uppercase tracking-wide text-content-tertiary font-medium">
                  <span>학생</span><span>학년</span><span className="text-center">출제</span><span className="text-center">완료</span><span className="text-right">평균</span><span>최근 출제</span>
                </div>
                <div className="divide-y divide-white/5">
                  {historyByStudent.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelStudent(s.id)}
                      className="w-full grid grid-cols-[1fr_60px_90px_90px_90px_1fr] gap-3 px-4 py-3 items-center hover:bg-white/[0.03] text-left"
                    >
                      <span className="text-sm font-medium truncate">{s.name}</span>
                      <span className="text-xs text-content-tertiary">{s.grade || '-'}</span>
                      <span className="text-sm text-center tabular-nums">{s.count}</span>
                      <span className="text-sm text-center tabular-nums text-emerald-300/80">{s.done}</span>
                      <span className="text-right">
                        {s.avg != null ? (
                          <span className={`text-sm font-bold tabular-nums ${s.avg >= 80 ? 'text-emerald-300' : s.avg >= 60 ? 'text-amber-300' : 'text-rose-300'}`}>{s.avg}점</span>
                        ) : <span className="text-xs text-content-tertiary">-</span>}
                      </span>
                      <span className="text-xs text-content-tertiary truncate" title={s.last?.title || ''}>
                        {s.last ? `${fmtDate(s.last.issued_at)} · ${s.last.title}` : '-'}
                      </span>
                    </button>
                  ))}
                  {historyByStudent.length === 0 && (
                    <div className="text-center py-16 text-content-tertiary text-sm">출제된 학습내역이 없습니다.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ===== 보고서 탭 — 학생별 학습지 리포트 ===== */
          <div className="flex-1 overflow-y-auto p-6">
            {!selStudent ? (
              <div className="text-center py-24 text-content-tertiary text-sm">
                <FileBarChart size={28} className="mx-auto mb-3 opacity-40" />
                왼쪽에서 학생을 선택하면 그 학생의 <b className="text-content-secondary">학습 보고서</b>가 표시됩니다.
              </div>
            ) : studentTimeline.length === 0 ? (
              <div className="text-center py-24 text-content-tertiary text-sm">{selStudentName} 학생 출제 내역이 없어 보고서를 만들 수 없습니다.</div>
            ) : (
              <StudentLearningReport
                student={{
                  id: selStudent,
                  name: selStudentName || '학생',
                  grade: students.find(s => s.id === selStudent)?.grade,
                  className: students.find(s => s.id === selStudent)?.className,
                }}
                rows={studentTimeline}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
