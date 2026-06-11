'use client';

// ============================================================================
// /dashboard/assignments — 출제 관리
//   학생별로 "무엇이 출제됐고, 완료했는지, 몇 점인지"를 한눈에 보는 관리 화면.
//   (채점하기 페이지는 세션 평면 목록 — 여기는 학생/시험지 기준 그룹 현황)
//
// 데이터: GET /api/sessions (print_sessions + 집계, 활성 센터 핀) — 기존 API 재사용
//        GET /api/users/students — 출제 0건 학생도 표시 (누락 발견용)
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ListChecks, Search, Users, FileText, Loader2, ExternalLink,
  Printer, CheckCircle2, Circle, RefreshCw,
} from 'lucide-react';

interface SessionRow {
  id: string;
  student_id: string;
  student_name: string | null;
  exam_id: string | null;
  exam_title: string | null;
  round_number: number | null;
  session_type: string | null;
  issued_at: string | null;
  completed_at: string | null;
  problems_total: number;
  problems_graded: number;
  correct_cnt: number;
  score_pct: number | null;
}

interface Student { id: string; full_name: string | null; grade: number | null }

type ViewMode = 'student' | 'exam';
type StatusFilter = 'all' | 'pending' | 'done';

const TYPE_COLOR: Record<string, string> = {
  BS: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  DD: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  PT: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  SC: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  WS: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  EX: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
  } catch { return iso; }
}

export default function AssignmentsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('student');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: '200' });
      if (status !== 'all') qs.set('status', status);
      const [sessRes, stuRes] = await Promise.all([
        fetch(`/api/sessions?${qs.toString()}`),
        fetch('/api/users/students'),
      ]);
      const sessData = await sessRes.json();
      if (!sessRes.ok) throw new Error(sessData.error || `HTTP ${sessRes.status}`);
      setSessions((sessData.sessions || []) as SessionRow[]);
      const stuData = await stuRes.json().catch(() => ({}));
      if (Array.isArray(stuData.students)) setStudents(stuData.students);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // 검색 필터 (학생명/시험지명)
  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.trim().toLowerCase();
    return sessions.filter(s =>
      (s.student_name || '').toLowerCase().includes(q) ||
      (s.exam_title || '').toLowerCase().includes(q),
    );
  }, [sessions, search]);

  // 학생별 그룹 — 출제 0건 학생도 포함 (검색 중엔 매칭 학생만)
  const byStudent = useMemo(() => {
    const map = new Map<string, { name: string; rows: SessionRow[] }>();
    for (const s of filtered) {
      const key = s.student_id;
      const cur = map.get(key) || { name: s.student_name || '(이름 없음)', rows: [] };
      cur.rows.push(s);
      map.set(key, cur);
    }
    // 출제 0건 학생 표시 (상태/검색 필터가 없을 때만 — "누가 빠졌나" 확인 용도)
    if (status === 'all' && !search.trim()) {
      for (const st of students) {
        if (!map.has(st.id)) {
          map.set(st.id, { name: st.full_name || '(이름 없음)', rows: [] });
        }
      }
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => (b.rows.length - a.rows.length) || a.name.localeCompare(b.name, 'ko'));
  }, [filtered, students, status, search]);

  // 시험지별 그룹
  const byExam = useMemo(() => {
    const map = new Map<string, { title: string; rows: SessionRow[] }>();
    for (const s of filtered) {
      const key = s.exam_id || 'none';
      const cur = map.get(key) || { title: s.exam_title || '(시험지 없음)', rows: [] };
      cur.rows.push(s);
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [filtered]);

  const stats = useMemo(() => {
    const total = sessions.length;
    const done = sessions.filter(s => s.completed_at).length;
    return { total, done, pending: total - done };
  }, [sessions]);

  const avgPct = (rows: SessionRow[]) => {
    const scored = rows.filter(r => r.score_pct != null);
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((a, r) => a + (r.score_pct || 0), 0) / scored.length);
  };

  return (
    <div className="min-h-screen bg-surface-base text-content-primary">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ListChecks size={26} className="text-sky-400" />
              출제 관리
            </h1>
            <p className="text-sm text-content-tertiary mt-1">
              학생별로 어떤 시험지가 출제됐고, 완료 여부와 점수를 한눈에 확인합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-content-secondary text-xs flex items-center gap-2"
          >
            <RefreshCw size={14} /> 새로고침
          </button>
        </div>

        {/* 요약 + 필터 바 */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">출제 <b>{stats.total}</b></span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">완료 <b>{stats.done}</b></span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300">대기 <b>{stats.pending}</b></span>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-white/10 overflow-hidden ml-auto">
            {([['student', '학생별', Users], ['exam', '시험지별', FileText]] as const).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === v ? 'bg-sky-500/15 text-sky-300' : 'text-content-tertiary hover:text-content-primary'
                }`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-white/10 overflow-hidden">
            {([['all', '전체'], ['pending', '대기'], ['done', '완료']] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setStatus(v)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  status === v ? 'bg-white/10 text-content-primary' : 'text-content-tertiary hover:text-content-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-tertiary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="학생·시험지 검색"
              className="pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm w-52 focus:border-sky-500 focus:outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-900/20 border border-red-500/30 text-red-300 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24 text-content-tertiary">
            <Loader2 className="animate-spin mr-2" size={18} /> 불러오는 중…
          </div>
        ) : (
          <div className="space-y-4">
            {(view === 'student' ? byStudent : byExam).map((group) => {
              const rows = group.rows;
              const done = rows.filter(r => r.completed_at).length;
              const avg = avgPct(rows);
              const title = view === 'student' ? (group as { name: string }).name : (group as { title: string }).title;
              return (
                <div key={group.id} className="rounded-2xl border border-white/10 bg-surface-card overflow-hidden">
                  {/* 그룹 헤더 */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-white/[0.03] border-b border-white/5 flex-wrap">
                    <span className="font-bold text-[15px]">{title}</span>
                    <span className="text-xs text-content-tertiary">
                      출제 {rows.length} · 완료 {done}
                      {avg != null && <> · 평균 <b className={avg >= 80 ? 'text-emerald-300' : avg >= 60 ? 'text-amber-300' : 'text-rose-300'}>{avg}%</b></>}
                    </span>
                    {rows.length === 0 && (
                      <span className="text-xs text-content-tertiary/60 italic">출제된 시험지 없음</span>
                    )}
                  </div>

                  {/* 세션 행들 */}
                  {rows.length > 0 && (
                    <div className="divide-y divide-white/5">
                      {rows.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${TYPE_COLOR[s.session_type || ''] || 'bg-white/5 text-content-tertiary border-white/10'}`}>
                            {s.session_type || '-'}{s.round_number ? ` R${s.round_number}` : ''}
                          </span>
                          <span className="text-sm flex-1 min-w-[160px] truncate" title={view === 'student' ? (s.exam_title || '') : (s.student_name || '')}>
                            {view === 'student' ? (s.exam_title || '(시험지 없음)') : (s.student_name || '(이름 없음)')}
                          </span>
                          <span className="text-xs text-content-tertiary w-16">{fmtDate(s.issued_at)}</span>
                          {s.completed_at ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-300 w-14"><CheckCircle2 size={13} /> 완료</span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-amber-300/80 w-14"><Circle size={13} /> 대기</span>
                          )}
                          <span className="text-sm font-semibold w-28 text-right tabular-nums">
                            {s.score_pct != null ? (
                              <>
                                <span className={s.score_pct >= 80 ? 'text-emerald-300' : s.score_pct >= 60 ? 'text-amber-300' : 'text-rose-300'}>{s.score_pct}%</span>
                                <span className="text-xs text-content-tertiary font-normal"> ({s.correct_cnt}/{s.problems_total})</span>
                              </>
                            ) : (
                              <span className="text-xs text-content-tertiary font-normal">미채점</span>
                            )}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <a
                              href={`/api/sessions/${s.id}/pdf?variant=student`}
                              target="_blank" rel="noreferrer"
                              className="text-[11px] px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1"
                              title="학생용 인쇄"
                            >
                              <Printer size={11} /> 인쇄
                            </a>
                            <Link
                              href={`/grade/${s.id}`}
                              target="_blank"
                              className="text-[11px] px-2 py-1 rounded bg-indigo-600/80 text-white hover:bg-indigo-500 flex items-center gap-1"
                              title="강사 채점 페이지"
                            >
                              <ExternalLink size={11} /> 채점
                            </Link>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {(view === 'student' ? byStudent : byExam).length === 0 && (
              <div className="text-center py-24 text-content-tertiary text-sm">
                표시할 출제 내역이 없습니다. 시험지관리에서 <b>출제</b> 버튼으로 학생에게 배포해 보세요.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
