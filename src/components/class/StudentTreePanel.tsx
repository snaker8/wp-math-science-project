'use client';

// ============================================================================
// StudentTreePanel — 좌측 학년/반 학생 트리 (공용)
//   출제 관리(/dashboard/assignments)와 수업 허브(/dashboard/class)가 공유.
//   학년/반 탭 + 이름 검색 + 전체 + 그룹 펼치기. 선택 상태는 부모가 관리.
// ============================================================================

import { useMemo, useState, type ReactNode } from 'react';
import { Users, Search, ChevronRight, ChevronDown } from 'lucide-react';

export interface RosterStudent {
  id: string;
  name: string;
  grade: string;
  className: string;
}

// 학년 정렬 순서 (초1 → 고3)
const GRADE_ORDER: Record<string, number> = {};
['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3']
  .forEach((g, i) => { GRADE_ORDER[g] = i; });
export const gradeRank = (g: string) => (g in GRADE_ORDER ? GRADE_ORDER[g] : 99);

export function StudentTreePanel({
  header,
  students,
  counts,
  selected,
  onSelect,
}: {
  /** 패널 상단 타이틀 (아이콘 포함 노드 또는 문자열) */
  header: ReactNode;
  students: RosterStudent[];
  /** 학생별 배지 숫자 (예: 출제 수). 없으면 배지 미표시 */
  counts?: Map<string, number>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [leftTab, setLeftTab] = useState<'grade' | 'class'>('grade');
  const [studentSearch, setStudentSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const sq = studentSearch.trim().toLowerCase();
    const visible = sq ? students.filter(s => s.name.toLowerCase().includes(sq)) : students;
    const map = new Map<string, RosterStudent[]>();
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

  const toggleGroup = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <aside className="w-72 flex-shrink-0 border-r border-white/10 flex flex-col bg-surface-raised/30">
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2 font-bold">{header}</div>
      </div>
      {/* 학년/반 탭 */}
      <div className="flex border-b border-white/10">
        {([['grade', '학년'], ['class', '반']] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setLeftTab(v)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              leftTab === v ? 'text-content-primary border-b-2 border-white/40' : 'text-content-tertiary hover:text-content-primary'
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
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm focus:border-white/25 focus:outline-none"
          />
        </div>
      </div>
      {/* 전체 + 트리 */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-bold mb-1 ${
            selected === null ? 'bg-white/[.08] text-content-primary' : 'hover:bg-white/5 text-content-secondary'
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
                    const cnt = counts?.get(s.id) || 0;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onSelect(s.id)}
                        className={`w-full flex items-center justify-between pl-3 pr-2 py-1.5 text-sm rounded-r-lg ${
                          selected === s.id ? 'bg-white/[.08] text-content-primary font-medium' : 'hover:bg-white/5 text-content-secondary'
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
  );
}
