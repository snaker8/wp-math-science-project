'use client';

// ============================================================================
// GradeRosterTable — "학생 성적" 일람표 (학년별 그룹)
//   GET /api/grades/roster 집계(내신·모의고사·진단·EX)를 학년별로 묶어 표로.
//   행 클릭 → onSelectStudent(id) (하단 진단 분석 뷰와 연동).
//
//   Phase 1: 읽기 전용. 내신·모의고사 인라인 입력은 Phase 2.
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle, Search, ListChecks, ChevronRight } from 'lucide-react';
import { gradeIntToLabel } from '@/lib/students/grade-label';
import { MOCK_EXAM_LABELS, isMockExamType } from '@/lib/students/mock-exam-types';

interface RosterStudent {
  id: string;
  name: string;
  grade: number | null;
  school: { score: number; grade: number; semester: number; term: string } | null;
  mock: { score: number; examType: string; examDate: string | null } | null;
  diagPct: number | null;
  exLatestPct: number | null;
}

function pctColor(p: number | null): string {
  if (p == null) return 'text-content-tertiary';
  if (p >= 80) return 'text-emerald-300';
  if (p >= 60) return 'text-amber-300';
  return 'text-rose-300';
}

function ScoreCell({ value, suffix = '점', sub }: { value: number | null; suffix?: string; sub?: string }) {
  if (value == null) return <span className="text-content-tertiary">-</span>;
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="font-bold text-content-primary">{value}{suffix}</span>
      {sub && <span className="text-[10px] text-content-tertiary">{sub}</span>}
    </span>
  );
}

export default function GradeRosterTable({
  selectedStudentId,
  onSelectStudent,
}: {
  selectedStudentId: string | null;
  onSelectStudent: (id: string) => void;
}) {
  const [rows, setRows] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/grades/roster', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '불러오기 실패');
        if (!cancelled) setRows((json.students || []) as RosterStudent[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 검색 필터
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || gradeIntToLabel(r.grade).toLowerCase().includes(q));
  }, [rows, query]);

  // 학년별 그룹 (grade desc — API 가 이미 정렬, null 은 '미배정')
  const groups = useMemo(() => {
    const map = new Map<string, RosterStudent[]>();
    for (const r of filtered) {
      const key = r.grade != null ? gradeIntToLabel(r.grade, `${r.grade}학년`) : '학년 미배정';
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="bg-surface-card border border-white/10 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <ListChecks size={18} className="text-indigo-400" />
          <h2 className="font-bold text-content-primary">학생 성적 일람표</h2>
          <span className="text-xs text-content-tertiary">학년별 · 최근 점수</span>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5">
          <Search size={14} className="text-content-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·학년 검색"
            className="bg-transparent text-sm outline-none w-40"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-content-tertiary text-sm">
          <Loader2 size={16} className="animate-spin" /> 성적 불러오는 중…
        </div>
      ) : error ? (
        <div className="m-4 flex items-start gap-2 p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm">
          <AlertTriangle size={14} className="mt-0.5" /> {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-content-tertiary text-sm">표시할 학생이 없습니다.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-content-tertiary text-xs uppercase tracking-wider bg-white/[0.03]">
                <th className="text-left py-2.5 px-4">학생</th>
                <th className="text-right py-2.5 px-3">내신 (최근)</th>
                <th className="text-right py-2.5 px-3">모의고사 (최근)</th>
                <th className="text-right py-2.5 px-3">진단 평균</th>
                <th className="text-right py-2.5 px-3">최근 시험(EX)</th>
                <th className="py-2.5 px-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {groups.map(([gradeLabel, list]) => (
                <React.Fragment key={gradeLabel}>
                  <tr className="bg-indigo-500/10">
                    <td colSpan={6} className="py-1.5 px-4 text-xs font-bold text-indigo-300">
                      {gradeLabel} <span className="text-indigo-400 font-normal">({list.length}명)</span>
                    </td>
                  </tr>
                  {list.map((r) => {
                    const mockLabel = r.mock && isMockExamType(r.mock.examType) ? MOCK_EXAM_LABELS[r.mock.examType] : r.mock?.examType;
                    const schoolSub = r.school
                      ? `${gradeIntToLabel(r.school.grade, `${r.school.grade}`)}-${r.school.semester} ${r.school.term}`
                      : undefined;
                    const selected = selectedStudentId === r.id;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => onSelectStudent(r.id)}
                        className={`border-t border-white/5 cursor-pointer hover:bg-indigo-500/10 ${selected ? 'bg-indigo-500/15' : ''}`}
                      >
                        <td className="py-2.5 px-4 font-semibold text-content-primary">{r.name}</td>
                        <td className="py-2.5 px-3 text-right"><ScoreCell value={r.school?.score ?? null} sub={schoolSub} /></td>
                        <td className="py-2.5 px-3 text-right"><ScoreCell value={r.mock?.score ?? null} sub={mockLabel} /></td>
                        <td className={`py-2.5 px-3 text-right font-bold ${pctColor(r.diagPct)}`}>{r.diagPct != null ? `${r.diagPct}%` : '-'}</td>
                        <td className={`py-2.5 px-3 text-right font-bold ${pctColor(r.exLatestPct)}`}>{r.exLatestPct != null ? `${r.exLatestPct}%` : '-'}</td>
                        <td className="py-2.5 px-3 text-content-tertiary"><ChevronRight size={14} /></td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
