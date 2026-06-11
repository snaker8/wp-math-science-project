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
  Users, Search, ChevronRight, ChevronDown, Loader2, RefreshCw,
  Printer, ExternalLink, ListChecks,
} from 'lucide-react';

interface Student {
  id: string; name: string; grade: string; className: string;
}
interface Assignment {
  id: string; source: 'qr' | 'manual';
  student_id: string; student_name: string; grade: string;
  title: string; tag: string; issued_at: string | null;
  completed: boolean; problems_total: number; correct_cnt: number; score_pct: number | null;
}

// 학년 정렬 순서 (초1 → 고3)
const GRADE_ORDER: Record<string, number> = {};
['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3']
  .forEach((g, i) => { GRADE_ORDER[g] = i; });
const gradeRank = (g: string) => (g in GRADE_ORDER ? GRADE_ORDER[g] : 99);

const TAG_COLOR = (tag: string): string => {
  if (tag.startsWith('시험지')) return 'text-rose-400';
  if (tag.startsWith('학습지')) return 'text-cyan-400';
  return 'text-amber-400';
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

  const [leftTab, setLeftTab] = useState<'grade' | 'class'>('grade');
  const [studentSearch, setStudentSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selStudent, setSelStudent] = useState<string | null>(null); // null = 전체
  const [titleSearch, setTitleSearch] = useState('');

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

  // 좌측 트리 그룹 (학년 또는 반)
  const groups = useMemo(() => {
    const sq = studentSearch.trim().toLowerCase();
    const visible = sq ? students.filter(s => s.name.toLowerCase().includes(sq)) : students;
    const map = new Map<string, Student[]>();
    for (const s of visible) {
      const key = leftTab === 'grade' ? (s.grade || '미지정') : (s.className || '미배정');
      (map.get(key) ?? map.set(key, []).get(key)!).push(s);
    }
    return Array.from(map.entries())
      .map(([key, list]) => ({ key, list: list.sort((a, b) => a.name.localeCompare(b.name, 'ko')) }))
      .sort((a, b) =>
        leftTab === 'grade'
          ? (gradeRank(a.key) - gradeRank(b.key)) || a.key.localeCompare(b.key, 'ko')
          : a.key.localeCompare(b.key, 'ko'),
      );
  }, [students, studentSearch, leftTab]);

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

  const toggleGroup = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const summary = useMemo(() => {
    const total = filtered.length;
    const done = filtered.filter(a => a.completed).length;
    const scored = filtered.filter(a => a.score_pct != null);
    const avg = scored.length ? Math.round(scored.reduce((s, a) => s + (a.score_pct || 0), 0) / scored.length) : null;
    return { total, done, avg };
  }, [filtered]);

  return (
    <div className="flex h-[calc(100vh-7rem)] rounded-2xl border border-white/10 overflow-hidden bg-surface-card text-content-primary">
      {/* ===== 좌측: 학년/반 트리 ===== */}
      <aside className="w-72 flex-shrink-0 border-r border-white/10 flex flex-col bg-surface-raised/30">
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 font-bold">
            <Users size={18} className="text-sky-400" /> 출제 관리
          </div>
        </div>
        {/* 학년/반 탭 */}
        <div className="flex border-b border-white/10">
          {([['grade', '학년'], ['class', '반']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setLeftTab(v)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                leftTab === v ? 'text-sky-300 border-b-2 border-sky-400' : 'text-content-tertiary hover:text-content-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* 학생 검색 */}
        <div className="p-3">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-tertiary" />
            <input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="학생 이름 검색"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>
        </div>
        {/* 전체 + 트리 */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          <button
            type="button"
            onClick={() => setSelStudent(null)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-bold mb-1 ${
              selStudent === null ? 'bg-sky-500/15 text-sky-300' : 'hover:bg-white/5 text-content-secondary'
            }`}
          >
            <span className="flex items-center gap-1.5"><Users size={14} /> 전체</span>
            <span className="text-xs text-content-tertiary">{students.length}명</span>
          </button>

          {groups.map(({ key, list }) => {
            const open = expanded.has(key) || !!studentSearch.trim();
            return (
              <div key={key} className="mb-0.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(key)}
                  className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-white/5 text-sm"
                >
                  <span className="flex items-center gap-1">
                    {open ? <ChevronDown size={14} className="text-content-tertiary" /> : <ChevronRight size={14} className="text-content-tertiary" />}
                    <span className="font-semibold">{key}</span>
                  </span>
                  <span className="text-xs text-content-tertiary">{list.length}명</span>
                </button>
                {open && (
                  <div className="ml-4 border-l border-white/10">
                    {list.map((s) => {
                      const cnt = countByStudent.get(s.id) || 0;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSelStudent(s.id)}
                          className={`w-full flex items-center justify-between pl-3 pr-2 py-1.5 text-sm rounded-r-lg ${
                            selStudent === s.id ? 'bg-sky-500/15 text-sky-300 font-medium' : 'hover:bg-white/5 text-content-secondary'
                          }`}
                        >
                          <span className="truncate">{s.name}</span>
                          {cnt > 0 && <span className="text-[10px] text-content-tertiary tabular-nums">{cnt}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {groups.length === 0 && (
            <div className="text-center text-xs text-content-tertiary py-8">학생이 없습니다.</div>
          )}
        </div>
      </aside>

      {/* ===== 본문: 학습지 목록 ===== */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ListChecks size={20} className="text-sky-400" />
            <h1 className="text-lg font-bold">
              {selStudentName ? `${selStudentName} 학생 출제 내역` : '전체 출제 내역'}
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs ml-2">
            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">출제 {summary.total}</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">완료 {summary.done}</span>
            {summary.avg != null && (
              <span className="px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-300">평균 {summary.avg}%</span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-tertiary" />
              <input
                value={titleSearch}
                onChange={(e) => setTitleSearch(e.target.value)}
                placeholder="학습지명 검색"
                className="pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm w-48 focus:border-sky-500 focus:outline-none"
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

        {error && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-red-900/20 border border-red-500/30 text-red-300 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-content-tertiary">
            <Loader2 className="animate-spin mr-2" size={18} /> 불러오는 중…
          </div>
        ) : (
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
                      {a.source === 'manual' && <span className="ml-1.5 text-amber-400/70">· 수동</span>}
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
                          href={`/api/sessions/${a.id}/pdf?variant=student`}
                          target="_blank" rel="noreferrer"
                          className="text-[11px] px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1"
                          title="학생용 인쇄"
                        >
                          <Printer size={11} />
                        </a>
                        <Link
                          href={`/grade/${a.id}`}
                          target="_blank"
                          className="text-[11px] px-2 py-1 rounded bg-indigo-600/80 text-white hover:bg-indigo-500 flex items-center gap-1"
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
        )}
      </main>
    </div>
  );
}
