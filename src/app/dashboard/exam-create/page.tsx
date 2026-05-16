'use client';

// ============================================================================
// 시험지 출제 페이지 (1차) — 필터 + 검색
// /dashboard/exam-create
//
// CLAUDE.md 다음 우선순위:
//   문제은행에서 단원·유형·난이도 필터 → 문제 선택 → 시험지 생성 → PDF 출력
//
// 1차 PR 범위:
//   - 단원(mathsecr 트리 picker) + 난이도 multi-select + 키워드 검색
//   - 검색 결과 카드 리스트 (typeName, difficulty, content preview)
// 다음 PR (2차): 문제 선택 + 시험지 편성 + 저장
// 다음 PR (3차): PDF 출력
// ============================================================================

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  BookOpen,
  Loader2,
  Layers,
  Plus,
  Check,
  X,
  ClipboardCheck,
  School,
  Library,
  FileText,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { MathsecrTreePicker } from '@/components/papers/MathsecrTreePicker';
import { extractSchoolName, classifySchoolLevel } from '@/lib/utils/school-extract';

// ============================================================================
// 출처별 카테고리 탭 (매쓰플랫 식 — 학교시험 / 유형기준 / 출처기준 식 구성)
//   사용자 요구 (2026-05-16):
//     "시험지 출제 페이지를 개선해야한다. 각 단원선택으로 되는 하나의 종류만
//     있는데 진단평가, 학교기출문제, 시중교재, 모의고사 등을 선택해서 그 안에서
//     또 트리가 나눠져야하는 형태로... 모든 문제 포함 단원 선택도 유지"
// ============================================================================
type SourceTab = 'all' | 'diagnostic' | 'school' | 'textbook' | 'mock';

const SOURCE_TABS: Array<{
  id: SourceTab;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  available: boolean;
}> = [
  {
    id: 'all',
    label: '전체 문제',
    description: '모든 출처 — 단원·유형 트리에서 직접 선택',
    icon: Layers,
    color: 'cyan',
    available: true,
  },
  {
    id: 'diagnostic',
    label: '진단평가',
    description: 'BS · DD · PT · SC — 진단 회차별 시험지',
    icon: ClipboardCheck,
    color: 'indigo',
    available: true,
  },
  {
    id: 'school',
    label: '학교기출',
    description: '학교 → 시험지 → 문제 (자산화 대부분이 학교기출)',
    icon: School,
    color: 'emerald',
    available: true,
  },
  {
    id: 'textbook',
    label: '시중교재',
    description: '출판사 → 책 → 단원 → 문제',
    icon: Library,
    color: 'amber',
    available: false,
  },
  {
    id: 'mock',
    label: '모의고사',
    description: '연도 · 회차별 모의고사 문제',
    icon: FileText,
    color: 'rose',
    available: false,
  },
];

interface ProblemRow {
  id: string;
  content_latex: string;
  source_name: string | null;
  source_year: number | null;
  classifications:
    | {
        type_code: string;
        expanded_type_code: string | null;
        difficulty: string;
        cognitive_domain: string;
      }
    | Array<{ type_code: string; difficulty: string }>;
}

interface SearchResponse {
  problems: ProblemRow[];
}

const DIFFICULTIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function ExamCreatePage() {
  const router = useRouter();
  // ★ 출처별 카테고리 탭 — 'all' + 'diagnostic' Phase 2 까지 작동.
  const [activeTab, setActiveTab] = useState<SourceTab>('all');
  const [typeCode, setTypeCode] = useState<string>('');
  const [typeName, setTypeName] = useState<string>('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedDiffs, setSelectedDiffs] = useState<Set<number>>(new Set());
  const [keyword, setKeyword] = useState('');

  // ★ Phase 2 — 진단평가 탭 state
  interface DiagnosticExam {
    id: string;
    title: string;
    grade: string | null;
    diagnostic_category?: string | null;
    diagnostic_round?: number | null;
    total_points?: number | null;
    created_at: string;
  }
  const [diagExams, setDiagExams] = useState<DiagnosticExam[]>([]);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [selectedDiagExamId, setSelectedDiagExamId] = useState<string | null>(null);
  const [diagProblems, setDiagProblems] = useState<ProblemRow[]>([]);
  const [diagProblemsLoading, setDiagProblemsLoading] = useState(false);

  // ★ Phase 3 — 학교기출 탭 state
  interface SchoolExam {
    id: string;
    title: string;
    grade: string | null;
    subject: string | null;
    exam_type: string | null;
    created_at: string;
    school?: string | null;  // 클라이언트에서 extractSchoolName 결과
  }
  const [schoolExams, setSchoolExams] = useState<SchoolExam[]>([]);
  const [schoolLoading, setSchoolLoading] = useState(false);
  const [schoolError, setSchoolError] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);
  const [selectedSchoolExamId, setSelectedSchoolExamId] = useState<string | null>(null);
  const [schoolProblems, setSchoolProblems] = useState<ProblemRow[]>([]);
  const [schoolProblemsLoading, setSchoolProblemsLoading] = useState(false);
  const [schoolQuery, setSchoolQuery] = useState('');
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // ★ 2차 PR: 시험지 편성 모달 state
  const [composeOpen, setComposeOpen] = useState(false);
  const [examTitle, setExamTitle] = useState('');
  const [examGrade, setExamGrade] = useState('');
  const [examSubject, setExamSubject] = useState('');
  const [composing, setComposing] = useState(false);
  const [composeErr, setComposeErr] = useState<string | null>(null);

  // ★ 진단평가 시험지 목록 fetch — 탭 진입 시 1회
  useEffect(() => {
    if (activeTab !== 'diagnostic') return;
    if (diagExams.length > 0) return; // 이미 로드된 경우 재호출 X
    let cancelled = false;
    setDiagLoading(true);
    setDiagError(null);
    (async () => {
      try {
        const res = await fetch('/api/exams?is_diagnostic=true', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) setDiagExams((data.exams || []) as DiagnosticExam[]);
      } catch (e) {
        if (!cancelled) setDiagError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setDiagLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ★ 학교기출 시험지 목록 fetch — 탭 진입 시 1회
  useEffect(() => {
    if (activeTab !== 'school') return;
    if (schoolExams.length > 0) return;
    let cancelled = false;
    setSchoolLoading(true);
    setSchoolError(null);
    (async () => {
      try {
        const res = await fetch('/api/exams?is_diagnostic=false', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        const rows = ((data.exams || []) as SchoolExam[]).map((ex) => ({
          ...ex,
          school: extractSchoolName(ex.title),
        }));
        if (!cancelled) setSchoolExams(rows);
      } catch (e) {
        if (!cancelled) setSchoolError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setSchoolLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ★ 학교기출 시험지 선택 시 문제 목록 fetch
  useEffect(() => {
    if (!selectedSchoolExamId) {
      setSchoolProblems([]);
      return;
    }
    let cancelled = false;
    setSchoolProblemsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/exams/${selectedSchoolExamId}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        const rows: ProblemRow[] = ((data.problems || []) as Array<Record<string, unknown>>).map((r) => {
          const p = (r.problems || r) as Record<string, unknown>;
          return {
            id: String(p.id || ''),
            content_latex: String(p.content_latex || ''),
            source_name: (p.source_name as string) || null,
            source_year: (p.source_year as number) || null,
            classifications: (p.classifications as ProblemRow['classifications']) || [],
          };
        }).filter((p) => p.id);
        if (!cancelled) setSchoolProblems(rows);
      } catch (e) {
        if (!cancelled) setSchoolError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setSchoolProblemsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSchoolExamId]);

  // ★ 진단평가 시험지 선택 시 문제 목록 fetch
  useEffect(() => {
    if (!selectedDiagExamId) {
      setDiagProblems([]);
      return;
    }
    let cancelled = false;
    setDiagProblemsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/exams/${selectedDiagExamId}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        // /api/exams/[examId] 응답의 problems 배열 → ProblemRow 형식으로 매핑
        const rows: ProblemRow[] = ((data.problems || []) as Array<Record<string, unknown>>).map((r) => {
          const p = (r.problems || r) as Record<string, unknown>;
          return {
            id: String(p.id || ''),
            content_latex: String(p.content_latex || ''),
            source_name: (p.source_name as string) || null,
            source_year: (p.source_year as number) || null,
            classifications: (p.classifications as ProblemRow['classifications']) || [],
          };
        }).filter((p) => p.id);
        if (!cancelled) setDiagProblems(rows);
      } catch (e) {
        if (!cancelled) setDiagError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setDiagProblemsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDiagExamId]);

  const handleSearch = async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (typeCode) params.set('typeCode', typeCode);
      if (selectedDiffs.size === 1) {
        params.set('difficulty', String(Array.from(selectedDiffs)[0]));
      }
      if (keyword.trim()) params.set('q', keyword.trim());
      params.set('limit', '50');

      const res = await fetch(`/api/problems/search?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as SearchResponse;
      // 다난이도 필터는 클라이언트에서
      let filtered = data.problems || [];
      if (selectedDiffs.size > 1) {
        filtered = filtered.filter((p) => {
          const cls = Array.isArray(p.classifications) ? p.classifications[0] : p.classifications;
          if (!cls) return false;
          const d = parseInt(String(cls.difficulty), 10);
          return selectedDiffs.has(d);
        });
      }
      setProblems(filtered);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '검색 실패');
    } finally {
      setLoading(false);
    }
  };

  // 단원 선택 시 자동 검색
  useEffect(() => {
    if (typeCode) handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeCode]);

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black text-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-800/50 bg-gradient-to-r from-indigo-900/30 to-zinc-900/30 px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10">
              <BookOpen className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">시험지 출제</h1>
              <p className="mt-0.5 text-xs text-zinc-400">
                단원·유형·난이도로 문제은행을 검색하여 시험지에 편성
              </p>
            </div>
          </div>
          <div className="text-[11px] text-zinc-400">
            선택한 문항 <span className="font-bold text-cyan-400">{picked.size}</span>개
          </div>
        </div>

        {/* ★ 출처별 카테고리 탭 (매쓰플랫 식) */}
        <div className="flex items-stretch gap-1 mt-4 border-b border-zinc-800/60 -mb-px overflow-x-auto">
          {SOURCE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                disabled={!tab.available}
                className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? `text-${tab.color}-300`
                    : tab.available
                      ? 'text-zinc-400 hover:text-zinc-200'
                      : 'text-zinc-600 cursor-not-allowed'
                }`}
                title={tab.available ? tab.description : `${tab.description} (곧 출시)`}
              >
                <Icon size={15} className={isActive ? `text-${tab.color}-400` : ''} />
                {tab.label}
                {!tab.available && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 font-normal">
                    곧 출시
                  </span>
                )}
                {isActive && (
                  <span className={`absolute bottom-0 left-0 right-0 h-0.5 bg-${tab.color}-400`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'diagnostic' ? (
        // ★ 진단평가 탭 — 시험지 list + 선택 → 문제 grid
        <div className="flex flex-1 overflow-hidden">
          {/* 좌측: 진단평가 시험지 목록 */}
          <aside className="w-[320px] flex-shrink-0 overflow-y-auto border-r border-zinc-800/50 bg-zinc-950/40 p-4">
            <div className="mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300">진단평가 시험지</h3>
              <p className="mt-1 text-[10px] text-zinc-500">BS · DD · PT · SC 회차별</p>
            </div>
            {diagLoading ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500 py-4">
                <Loader2 className="h-3 w-3 animate-spin" /> 시험지 목록 불러오는 중…
              </div>
            ) : diagError ? (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
                {diagError}
              </div>
            ) : diagExams.length === 0 ? (
              <div className="text-xs text-zinc-500 py-4">
                진단평가 시험지가 없습니다. 자산화 시 BS·DD·PT·SC 패턴으로 자동 태깅됩니다.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {diagExams.map((ex) => {
                  const isSelected = selectedDiagExamId === ex.id;
                  return (
                    <li key={ex.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedDiagExamId(ex.id)}
                        className={`w-full text-left rounded-lg border px-3 py-2 transition-all ${
                          isSelected
                            ? 'border-indigo-500/50 bg-indigo-500/10'
                            : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          {ex.diagnostic_category && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                              {ex.diagnostic_category}
                            </span>
                          )}
                          {ex.diagnostic_round != null && (
                            <span className="text-[9px] text-zinc-500">R{ex.diagnostic_round}</span>
                          )}
                          {ex.grade && (
                            <span className="text-[9px] text-zinc-500">· {ex.grade}</span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-white truncate">{ex.title}</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* 우측: 선택된 시험지의 문제 grid */}
          <main className="flex-1 overflow-y-auto p-6">
            {!selectedDiagExamId ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                <ClipboardCheck className="mb-3 h-10 w-10 text-zinc-700" />
                <p className="text-sm">좌측에서 진단평가 시험지를 선택하세요.</p>
              </div>
            ) : diagProblemsLoading ? (
              <div className="flex items-center justify-center py-20 text-zinc-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 문제 불러오는 중…
              </div>
            ) : diagProblems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                <Layers className="mb-3 h-10 w-10 text-zinc-700" />
                <p className="text-sm">이 시험지에 문제가 없습니다.</p>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs text-zinc-400">
                    문제 <span className="font-bold text-white">{diagProblems.length}</span>건
                    <span className="ml-2 text-zinc-500">— 골라서 새 시험지에 편성</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const all = new Set(picked);
                      const allSelected = diagProblems.every((p) => all.has(p.id));
                      if (allSelected) diagProblems.forEach((p) => all.delete(p.id));
                      else diagProblems.forEach((p) => all.add(p.id));
                      setPicked(all);
                    }}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 underline"
                  >
                    전체 선택/해제
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {diagProblems.map((p) => {
                    const cls = Array.isArray(p.classifications) ? p.classifications[0] : p.classifications;
                    const diff = cls ? parseInt(String(cls.difficulty), 10) : 0;
                    const code = cls?.type_code || '';
                    const isPicked = picked.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePick(p.id)}
                        className={`text-left rounded-xl border p-4 transition-all ${
                          isPicked
                            ? 'border-indigo-500/50 bg-indigo-500/10'
                            : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {diff > 0 && (
                              <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                                난이도 {diff}
                              </span>
                            )}
                            <code className="truncate text-[10px] text-zinc-500">{code}</code>
                          </div>
                          <div
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                              isPicked ? 'bg-indigo-500 text-white' : 'border border-zinc-700'
                            }`}
                          >
                            {isPicked ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 text-zinc-500" />}
                          </div>
                        </div>
                        <div className="line-clamp-3 text-xs text-zinc-300">
                          <MixedContentRenderer content={(p.content_latex || '').slice(0, 200)} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </main>
        </div>
      ) : activeTab === 'school' ? (
        // ★ 학교기출 탭 — 학교 그룹 → 시험지 → 문제 grid
        (() => {
          // 학교명별 그룹 + 검색 필터
          const filteredExams = schoolExams.filter((ex) => {
            if (!schoolQuery.trim()) return true;
            const q = schoolQuery.trim().toLowerCase();
            return (
              (ex.school || '').toLowerCase().includes(q) ||
              (ex.title || '').toLowerCase().includes(q)
            );
          });
          const bySchool = new Map<string, SchoolExam[]>();
          for (const ex of filteredExams) {
            const key = ex.school || '(학교 미상)';
            if (!bySchool.has(key)) bySchool.set(key, []);
            bySchool.get(key)!.push(ex);
          }
          // 학교 레벨(초·중·고) 별 정렬 — 중·고 우선
          const sortedSchools = Array.from(bySchool.keys()).sort((a, b) => {
            const order: Record<string, number> = { '중': 0, '고': 1, '초': 2, '대': 3, '미분류': 4 };
            const la = classifySchoolLevel(a === '(학교 미상)' ? null : a);
            const lb = classifySchoolLevel(b === '(학교 미상)' ? null : b);
            if (order[la] !== order[lb]) return order[la] - order[lb];
            return a.localeCompare(b, 'ko');
          });
          const examsForSelected = selectedSchool ? bySchool.get(selectedSchool) || [] : [];
          return (
            <div className="flex flex-1 overflow-hidden">
              {/* 좌측: 학교 list + 검색 */}
              <aside className="w-[260px] flex-shrink-0 overflow-y-auto border-r border-zinc-800/50 bg-zinc-950/40 p-4">
                <div className="mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300">학교</h3>
                  <p className="mt-1 text-[10px] text-zinc-500">자산화 대부분이 학교기출</p>
                </div>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={schoolQuery}
                    onChange={(e) => setSchoolQuery(e.target.value)}
                    placeholder="학교명·시험지 검색"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 py-1 pl-7 pr-2 text-[11px] text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                {schoolLoading ? (
                  <div className="flex items-center gap-2 text-xs text-zinc-500 py-4">
                    <Loader2 className="h-3 w-3 animate-spin" /> 학교 목록 불러오는 중…
                  </div>
                ) : schoolError ? (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
                    {schoolError}
                  </div>
                ) : sortedSchools.length === 0 ? (
                  <div className="text-xs text-zinc-500 py-4">검색 결과가 없습니다.</div>
                ) : (
                  <ul className="space-y-1">
                    {sortedSchools.map((sch) => {
                      const count = bySchool.get(sch)!.length;
                      const level = classifySchoolLevel(sch === '(학교 미상)' ? null : sch);
                      const isSelected = selectedSchool === sch;
                      return (
                        <li key={sch}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSchool(sch);
                              setSelectedSchoolExamId(null);
                            }}
                            className={`w-full flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                              isSelected
                                ? 'bg-emerald-500/15 text-emerald-200'
                                : 'text-zinc-300 hover:bg-white/5'
                            }`}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              {level !== '미분류' && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 font-bold">
                                  {level}
                                </span>
                              )}
                              <span className="truncate">{sch}</span>
                            </span>
                            <span className="text-[10px] text-zinc-500 flex-shrink-0">{count}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </aside>

              {/* 중간: 선택된 학교의 시험지 list */}
              <section className="w-[280px] flex-shrink-0 overflow-y-auto border-r border-zinc-800/50 bg-zinc-950/20 p-4">
                {!selectedSchool ? (
                  <div className="text-xs text-zinc-500 py-4 text-center">학교를 선택하세요</div>
                ) : (
                  <>
                    <h4 className="mb-2 text-xs font-bold text-emerald-200">{selectedSchool} 시험지</h4>
                    <ul className="space-y-1.5">
                      {examsForSelected.map((ex) => {
                        const isSelected = selectedSchoolExamId === ex.id;
                        return (
                          <li key={ex.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedSchoolExamId(ex.id)}
                              className={`w-full text-left rounded-lg border px-3 py-2 transition-all ${
                                isSelected
                                  ? 'border-emerald-500/50 bg-emerald-500/10'
                                  : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-0.5">
                                {ex.grade && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                                    {ex.grade}
                                  </span>
                                )}
                                {ex.exam_type && (
                                  <span className="text-[9px] text-zinc-500">{ex.exam_type}</span>
                                )}
                              </div>
                              <div className="text-[11px] font-semibold text-white truncate">{ex.title}</div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </section>

              {/* 우측: 시험지 문제 grid */}
              <main className="flex-1 overflow-y-auto p-6">
                {!selectedSchoolExamId ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                    <School className="mb-3 h-10 w-10 text-zinc-700" />
                    <p className="text-sm">
                      {selectedSchool
                        ? '중간 패널에서 시험지를 선택하세요.'
                        : '좌측에서 학교를 먼저 선택하세요.'}
                    </p>
                  </div>
                ) : schoolProblemsLoading ? (
                  <div className="flex items-center justify-center py-20 text-zinc-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 문제 불러오는 중…
                  </div>
                ) : schoolProblems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                    <Layers className="mb-3 h-10 w-10 text-zinc-700" />
                    <p className="text-sm">이 시험지에 문제가 없습니다.</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-xs text-zinc-400">
                        문제 <span className="font-bold text-white">{schoolProblems.length}</span>건
                        <span className="ml-2 text-zinc-500">— 골라서 새 시험지에 편성</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const all = new Set(picked);
                          const allSelected = schoolProblems.every((p) => all.has(p.id));
                          if (allSelected) schoolProblems.forEach((p) => all.delete(p.id));
                          else schoolProblems.forEach((p) => all.add(p.id));
                          setPicked(all);
                        }}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 underline"
                      >
                        전체 선택/해제
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {schoolProblems.map((p) => {
                        const cls = Array.isArray(p.classifications) ? p.classifications[0] : p.classifications;
                        const diff = cls ? parseInt(String(cls.difficulty), 10) : 0;
                        const code = cls?.type_code || '';
                        const isPicked = picked.has(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => togglePick(p.id)}
                            className={`text-left rounded-xl border p-4 transition-all ${
                              isPicked
                                ? 'border-emerald-500/50 bg-emerald-500/10'
                                : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                            }`}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {diff > 0 && (
                                  <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                                    난이도 {diff}
                                  </span>
                                )}
                                <code className="truncate text-[10px] text-zinc-500">{code}</code>
                              </div>
                              <div
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                                  isPicked ? 'bg-emerald-500 text-white' : 'border border-zinc-700'
                                }`}
                              >
                                {isPicked ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 text-zinc-500" />}
                              </div>
                            </div>
                            <div className="line-clamp-3 text-xs text-zinc-300">
                              <MixedContentRenderer content={(p.content_latex || '').slice(0, 200)} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </main>
            </div>
          );
        })()
      ) : activeTab !== 'all' ? (
        // ★ Phase 4~5 예정 카테고리 — placeholder
        <div className="flex flex-1 items-center justify-center p-10">
          <div className="max-w-md text-center">
            {(() => {
              const tab = SOURCE_TABS.find((t) => t.id === activeTab)!;
              const Icon = tab.icon;
              return (
                <>
                  <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-${tab.color}-500/30 bg-${tab.color}-500/10`}>
                    <Icon size={28} className={`text-${tab.color}-400`} />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">{tab.label}</h2>
                  <p className="text-sm text-zinc-400 mb-4">{tab.description}</p>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-500">
                    <Sparkles size={14} className="inline mr-1 text-amber-400" />
                    다음 Phase 에서 활성화됩니다. 현재는 <button
                      type="button"
                      onClick={() => setActiveTab('all')}
                      className="text-cyan-400 underline hover:text-cyan-300"
                    >전체 문제</button> 탭에서 단원·유형으로 출제 가능.
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : (
      <div className="flex flex-1 overflow-hidden">
        {/* 좌측 필터 */}
        <aside className="w-[320px] flex-shrink-0 overflow-y-auto border-r border-zinc-800/50 bg-zinc-950/40 p-5 space-y-4">
          {/* 단원 picker */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              단원 / 유형
            </label>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-left text-sm text-amber-300 hover:bg-amber-500/10"
            >
              {typeCode ? (
                <>
                  <div className="font-mono text-xs">{typeCode}</div>
                  <div className="mt-0.5 truncate text-[10px] text-zinc-400">{typeName}</div>
                </>
              ) : (
                <span className="text-zinc-500">트리에서 선택...</span>
              )}
            </button>
            {typeCode && (
              <button
                type="button"
                onClick={() => {
                  setTypeCode('');
                  setTypeName('');
                  setProblems([]);
                }}
                className="mt-1 text-[10px] text-zinc-500 hover:text-zinc-300"
              >
                선택 해제
              </button>
            )}
          </div>

          {/* 난이도 multi-select */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              난이도 (1~10, 다중 선택)
            </label>
            <div className="grid grid-cols-5 gap-1">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setSelectedDiffs((prev) => {
                      const next = new Set(prev);
                      if (next.has(d)) next.delete(d);
                      else next.add(d);
                      return next;
                    });
                  }}
                  className={`rounded-md px-2 py-1.5 text-xs font-bold transition-colors ${
                    selectedDiffs.has(d)
                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50'
                      : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-white'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* 키워드 */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              본문 키워드
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="예: 미생물, 함수"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-1.5 pl-9 pr-3 text-xs text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* 검색 버튼 */}
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading || !typeCode}
            className="w-full rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                검색 중...
              </>
            ) : (
              <>
                <Filter className="mr-1 inline h-3 w-3" />
                검색
              </>
            )}
          </button>

          {!typeCode && (
            <p className="text-[10px] text-zinc-500">
              먼저 단원/유형을 선택하세요. 트리에서 과목별로 분류된 단원·세부유형을 고를 수 있습니다.
            </p>
          )}
        </aside>

        {/* 우측 결과 */}
        <main className="flex-1 overflow-y-auto p-6">
          {err && (
            <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-2 text-xs text-rose-300">
              {err}
            </div>
          )}

          {loading && problems.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-zinc-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="text-sm">검색 중...</span>
            </div>
          ) : problems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
              <Layers className="mb-3 h-10 w-10 text-zinc-700" />
              <p className="text-sm">
                {typeCode
                  ? '검색 결과가 없습니다. 필터를 조정해 보세요.'
                  : '좌측 필터에서 단원/유형을 선택하면 결과가 표시됩니다.'}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs text-zinc-400">
                  검색 결과 <span className="font-bold text-white">{problems.length}</span>건
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {problems.map((p) => {
                  const cls = Array.isArray(p.classifications) ? p.classifications[0] : p.classifications;
                  const diff = cls ? parseInt(String(cls.difficulty), 10) : 0;
                  const code = cls?.type_code || '';
                  const isPicked = picked.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePick(p.id)}
                      className={`text-left rounded-xl border p-4 transition-all ${
                        isPicked
                          ? 'border-cyan-500/50 bg-cyan-500/10'
                          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {diff > 0 && (
                            <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                              난이도 {diff}
                            </span>
                          )}
                          <code className="truncate text-[10px] text-zinc-500">{code}</code>
                        </div>
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                            isPicked ? 'bg-cyan-500 text-white' : 'border border-zinc-700'
                          }`}
                        >
                          {isPicked ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 text-zinc-500" />}
                        </div>
                      </div>
                      <div className="line-clamp-3 text-xs text-zinc-300">
                        <MixedContentRenderer content={(p.content_latex || '').slice(0, 200)} />
                      </div>
                      {p.source_name && (
                        <div className="mt-2 truncate text-[10px] text-zinc-500">
                          {p.source_name}{p.source_year ? ` · ${p.source_year}` : ''}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </main>
      </div>
      )}

      {/* 트리 picker */}
      <MathsecrTreePicker
        open={pickerOpen}
        initialSubjectCode={(typeCode.match(/^MS(\d{2})/) || [])[1] || '09'}
        onSelect={(code, fullPath) => {
          setTypeCode(code);
          setTypeName(fullPath);
          setPicked(new Set()); // 단원 바뀌면 선택 초기화
        }}
        onClose={() => setPickerOpen(false)}
      />

      {/* 푸터 — 시험지 편성 버튼 */}
      {picked.size > 0 && (
        <div className="flex-shrink-0 border-t border-cyan-500/30 bg-cyan-500/10 px-8 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-cyan-200">
              <span className="font-bold">{picked.size}</span>개 문항 선택됨
            </span>
            <button
              type="button"
              onClick={() => {
                // 모달 기본값 — 단원명에서 추측
                if (!examTitle && typeName) {
                  const last = typeName.split(' > ').pop() || '시험지';
                  setExamTitle(`${last} 연습 ${new Date().toLocaleDateString('ko-KR')}`);
                }
                setComposeOpen(true);
              }}
              className="rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-4 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/30"
            >
              시험지 편성 →
            </button>
          </div>
        </div>
      )}

      {/* 시험지 편성 모달 */}
      {composeOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !composing) setComposeOpen(false);
          }}
        >
          <div className="w-[480px] max-w-[95vw] rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
              <h2 className="text-base font-bold text-white">시험지 편성</h2>
              <button
                type="button"
                onClick={() => !composing && setComposeOpen(false)}
                disabled={composing}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-white disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-5">
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-300">
                선택 문항 <span className="font-bold">{picked.size}</span>개 / 단원: {typeName || '미지정'}
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-400">제목 *</label>
                <input
                  type="text"
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                  placeholder="예: 26 신곡중 3-1 중간고사 대비"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-zinc-400">학년 (선택)</label>
                  <input
                    type="text"
                    value={examGrade}
                    onChange={(e) => setExamGrade(e.target.value)}
                    placeholder="예: 고2"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-zinc-400">과목 (선택)</label>
                  <input
                    type="text"
                    value={examSubject}
                    onChange={(e) => setExamSubject(e.target.value)}
                    placeholder="예: 대수"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              {composeErr && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
                  {composeErr}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-3">
              <button
                type="button"
                onClick={() => !composing && setComposeOpen(false)}
                disabled={composing}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:text-white disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={composing || !examTitle.trim() || picked.size === 0}
                onClick={async () => {
                  setComposing(true);
                  setComposeErr(null);
                  try {
                    const res = await fetch('/api/exams/create-from-problems', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        title: examTitle.trim(),
                        grade: examGrade.trim() || null,
                        subject: examSubject.trim() || null,
                        problemIds: Array.from(picked),
                      }),
                    });
                    const d = await res.json();
                    if (!res.ok && res.status !== 207) {
                      throw new Error(d.error || `HTTP ${res.status}`);
                    }
                    // 207은 부분 성공 — examId는 있음
                    if (d.examId) {
                      router.push(`/dashboard/cloud/${d.examId}`);
                    } else {
                      throw new Error('examId 없음');
                    }
                  } catch (e) {
                    setComposeErr(e instanceof Error ? e.message : '생성 실패');
                  } finally {
                    setComposing(false);
                  }
                }}
                className="rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-4 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {composing ? (
                  <>
                    <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                    생성 중...
                  </>
                ) : (
                  '시험지 생성'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
