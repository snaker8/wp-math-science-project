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

import React, { useEffect, useMemo, useState } from 'react';
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
import { SelectionTray, type PickedProblem } from '@/components/exam-create/SelectionTray';

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
    color: 'indigo',
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
    description: '교재(book_groups) → 시험지 → 문제',
    icon: Library,
    color: 'amber',
    available: true,
  },
  {
    id: 'mock',
    label: '모의고사',
    description: '연도 → 시험지 → 문제 (모의고사·수능·평가원)',
    icon: FileText,
    color: 'rose',
    available: true,
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
    // ★ PR-1 (2026-05-28) 추가 학교 기출 메타 컬럼
    school_name?: string | null;
    district?: string | null;
    semester?: number | null;
    exam_year?: number | null;
    exam_round?: string | null;
    chapter?: string | null;
  }
  const [schoolExams, setSchoolExams] = useState<SchoolExam[]>([]);
  const [schoolLoading, setSchoolLoading] = useState(false);
  const [schoolError, setSchoolError] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);
  const [selectedSchoolExamId, setSelectedSchoolExamId] = useState<string | null>(null);
  const [schoolProblems, setSchoolProblems] = useState<ProblemRow[]>([]);
  const [schoolProblemsLoading, setSchoolProblemsLoading] = useState(false);
  const [schoolQuery, setSchoolQuery] = useState('');

  // ★ PR-3 (2026-05-28) — 매쓰플랫식 4-필터 풀세트 state
  interface RegionTreeNode {
    sido: string;
    sigungus: Array<{ sigungu: string; schools: string[] }>;
  }
  const [schoolFilterOptions, setSchoolFilterOptions] = useState<{
    regionTree: RegionTreeNode[];
    otherSchools: string[];
    grades: string[];
    examRounds: string[];
  } | null>(null);
  // 4-필터 선택 상태
  const [filterSchoolLevel, setFilterSchoolLevel] = useState<'전체' | '초' | '중' | '고'>('전체');
  const [filterGradeSemester, setFilterGradeSemester] = useState<string>('');  // "중2-1" 같은 표기 (빈값=전체)
  const [filterExamRound, setFilterExamRound] = useState<string>('');  // "중간"/"기말"/"단원집" (빈값=전체)
  const [filterChapter, setFilterChapter] = useState<string>('');  // 단원명 (빈값=전체)
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const [selectedSchoolNames, setSelectedSchoolNames] = useState<Set<string>>(new Set());

  // ★ Phase 4 — 시중교재 탭 state
  interface BookGroup {
    id: string;
    name: string;
    subject?: string | null;
    publisher?: string | null;
    sort_order?: number | null;
  }
  interface TextbookExam {
    id: string;
    title: string;
    grade: string | null;
    subject: string | null;
    book_group_id: string | null;
    created_at: string;
  }
  const [bookGroups, setBookGroups] = useState<BookGroup[]>([]);
  const [textbookExams, setTextbookExams] = useState<TextbookExam[]>([]);
  const [textbookLoading, setTextbookLoading] = useState(false);
  const [textbookError, setTextbookError] = useState<string | null>(null);
  const [selectedBookGroupId, setSelectedBookGroupId] = useState<string | null>(null);
  const [selectedTextbookExamId, setSelectedTextbookExamId] = useState<string | null>(null);
  const [textbookProblems, setTextbookProblems] = useState<ProblemRow[]>([]);
  const [textbookProblemsLoading, setTextbookProblemsLoading] = useState(false);
  const [textbookQuery, setTextbookQuery] = useState('');

  // ★ Phase 5 — 모의고사 탭 state
  interface MockExam {
    id: string;
    title: string;
    grade: string | null;
    subject: string | null;
    exam_type: string | null;
    created_at: string;
    year?: number | null;  // 클라이언트에서 추출
  }
  const [mockExams, setMockExams] = useState<MockExam[]>([]);
  const [mockLoading, setMockLoading] = useState(false);
  const [mockError, setMockError] = useState<string | null>(null);
  const [selectedMockYear, setSelectedMockYear] = useState<number | null>(null);
  const [selectedMockExamId, setSelectedMockExamId] = useState<string | null>(null);
  const [mockProblems, setMockProblems] = useState<ProblemRow[]>([]);
  const [mockProblemsLoading, setMockProblemsLoading] = useState(false);
  const [mockQuery, setMockQuery] = useState('');
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pickedList, setPickedList] = useState<PickedProblem[]>([]);
  const pickedIds = useMemo(() => new Set(pickedList.map((p) => p.id)), [pickedList]);
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
          // ★ PR-1 새 컬럼이 있으면 우선, 없으면 title 정규식 추출 fallback
          school: ex.school_name || extractSchoolName(ex.title),
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

  // ★ PR-3 (2026-05-28) — 학교 필터 옵션(지역 트리/학년/회차) fetch — 탭 진입 시 1회
  useEffect(() => {
    if (activeTab !== 'school') return;
    if (schoolFilterOptions) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/exams/school-filter-options', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) {
          setSchoolFilterOptions({
            regionTree: data.regionTree || [],
            otherSchools: data.otherSchools || [],
            grades: data.grades || [],
            examRounds: data.examRounds || [],
          });
        }
      } catch (e) {
        console.warn('[exam-create] school-filter-options fetch 실패:', e);
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

  // ★ 시중교재 — 책 목록 + book_group_id 있는 exams 일괄 fetch
  useEffect(() => {
    if (activeTab !== 'textbook') return;
    if (bookGroups.length > 0) return;
    let cancelled = false;
    setTextbookLoading(true);
    setTextbookError(null);
    (async () => {
      try {
        const [bgRes, exRes] = await Promise.all([
          fetch('/api/book-groups', { cache: 'no-store' }),
          fetch('/api/exams?is_diagnostic=false', { cache: 'no-store' }),
        ]);
        const bgData = await bgRes.json().catch(() => ({}));
        if (!bgRes.ok) throw new Error(bgData.error || `book-groups HTTP ${bgRes.status}`);
        const exData = await exRes.json().catch(() => ({}));
        if (!exRes.ok) throw new Error(exData.error || `exams HTTP ${exRes.status}`);
        if (!cancelled) {
          setBookGroups((bgData.groups || []) as BookGroup[]);
          // book_group_id 있는 시험지만 시중교재로 분류
          const withGroup = ((exData.exams || []) as TextbookExam[]).filter((ex) => ex.book_group_id);
          setTextbookExams(withGroup);
        }
      } catch (e) {
        if (!cancelled) setTextbookError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setTextbookLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ★ 모의고사 시험지 목록 fetch — 탭 진입 시 1회
  useEffect(() => {
    if (activeTab !== 'mock') return;
    if (mockExams.length > 0) return;
    let cancelled = false;
    setMockLoading(true);
    setMockError(null);
    (async () => {
      try {
        const res = await fetch('/api/exams?is_diagnostic=false', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        // 모의고사 후보 필터 — exam_type 또는 title 패턴 매칭
        const MOCK_PATTERN = /모의고사|평가원|교육청|수능|학평/;
        const filtered = ((data.exams || []) as MockExam[])
          .filter((ex) => {
            if (ex.exam_type && /모의|수능|평가원|학평/.test(ex.exam_type)) return true;
            if (ex.title && MOCK_PATTERN.test(ex.title)) return true;
            return false;
          })
          .map((ex) => {
            // 연도 추출 — title 의 4자리 또는 2자리 연도 패턴
            const m4 = ex.title.match(/(20\d{2})/);
            const m2 = ex.title.match(/(?:^|\s)(\d{2})(?=\D|$)/);
            let year: number | null = null;
            if (m4) year = parseInt(m4[1], 10);
            else if (m2) {
              const n = parseInt(m2[1], 10);
              year = n >= 0 && n <= 99 ? 2000 + n : null;
            }
            return { ...ex, year };
          });
        if (!cancelled) setMockExams(filtered);
      } catch (e) {
        if (!cancelled) setMockError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setMockLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ★ 모의고사 시험지 선택 시 문제 목록 fetch
  useEffect(() => {
    if (!selectedMockExamId) {
      setMockProblems([]);
      return;
    }
    let cancelled = false;
    setMockProblemsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/exams/${selectedMockExamId}`, { cache: 'no-store' });
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
        if (!cancelled) setMockProblems(rows);
      } catch (e) {
        if (!cancelled) setMockError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setMockProblemsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedMockExamId]);

  // ★ 시중교재 시험지 선택 시 문제 목록 fetch
  useEffect(() => {
    if (!selectedTextbookExamId) {
      setTextbookProblems([]);
      return;
    }
    let cancelled = false;
    setTextbookProblemsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/exams/${selectedTextbookExamId}`, { cache: 'no-store' });
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
        if (!cancelled) setTextbookProblems(rows);
      } catch (e) {
        if (!cancelled) setTextbookError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setTextbookProblemsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedTextbookExamId]);

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

  const toPickedProblem = (p: ProblemRow): PickedProblem => {
    const cls = Array.isArray(p.classifications) ? p.classifications[0] : p.classifications;
    const diff = cls ? parseInt(String(cls.difficulty), 10) : 0;
    return {
      id: p.id,
      content_latex: p.content_latex || '',
      typeCode: cls?.type_code || '',
      difficulty: Number.isFinite(diff) ? diff : 0,
      sourceName: p.source_name,
      sourceYear: p.source_year,
    };
  };

  const togglePick = (p: ProblemRow) => {
    setPickedList((prev) => {
      if (prev.some((x) => x.id === p.id)) return prev.filter((x) => x.id !== p.id);
      return [...prev, toPickedProblem(p)];
    });
  };

  const toggleAll = (rows: ProblemRow[]) => {
    setPickedList((prev) => {
      const prevIds = new Set(prev.map((x) => x.id));
      const allIn = rows.length > 0 && rows.every((r) => prevIds.has(r.id));
      if (allIn) {
        const rowIds = new Set(rows.map((r) => r.id));
        return prev.filter((x) => !rowIds.has(x.id));
      }
      const toAdd = rows.filter((r) => !prevIds.has(r.id)).map(toPickedProblem);
      return [...prev, ...toAdd];
    });
  };

  const openCompose = () => {
    if (!examTitle && typeName) {
      const last = typeName.split(' > ').pop() || '시험지';
      setExamTitle(`${last} 연습 ${new Date().toLocaleDateString('ko-KR')}`);
    }
    setComposeOpen(true);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-surface-base text-content-primary">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/[.08] bg-white/[.03] px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[.08] bg-white/[.04]">
              <BookOpen className="h-5 w-5 text-content-tertiary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">시험지 출제</h1>
              <p className="mt-0.5 text-xs text-zinc-400">
                단원·유형·난이도로 문제은행을 검색하여 시험지에 편성
              </p>
            </div>
          </div>
          <div className="text-xs text-zinc-400">
            선택한 문항 <span className="font-bold text-content-primary tabular-nums">{pickedList.length}</span>개
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
                    ? 'text-content-primary'
                    : tab.available
                      ? 'text-zinc-400 hover:text-zinc-200'
                      : 'text-zinc-600 cursor-not-allowed'
                }`}
                title={tab.available ? tab.description : `${tab.description} (곧 출시)`}
              >
                <Icon size={15} className={isActive ? 'text-content-primary' : ''} />
                {tab.label}
                {!tab.available && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 font-normal">
                    곧 출시
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
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
              <h3 className="text-xs font-bold uppercase tracking-wider text-content-tertiary">진단평가 시험지</h3>
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
                            ? 'border-white/[.14] bg-white/[.08]'
                            : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          {ex.diagnostic_category && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/[.08] bg-white/[.04] text-content-secondary font-bold">
                              {ex.diagnostic_category}
                            </span>
                          )}
                          {ex.diagnostic_round != null && (
                            <span className="text-[10px] text-zinc-500">R{ex.diagnostic_round}</span>
                          )}
                          {ex.grade && (
                            <span className="text-[10px] text-zinc-500">· {ex.grade}</span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-content-primary truncate">{ex.title}</div>
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
                    문제 <span className="font-bold text-content-primary tabular-nums">{diagProblems.length}</span>건
                    <span className="ml-2 text-zinc-500">— 골라서 새 시험지에 편성</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      toggleAll(diagProblems);
                    }}
                    className="text-xs text-content-secondary hover:text-content-primary underline"
                  >
                    전체 선택/해제
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {diagProblems.map((p) => {
                    const cls = Array.isArray(p.classifications) ? p.classifications[0] : p.classifications;
                    const diff = cls ? parseInt(String(cls.difficulty), 10) : 0;
                    const code = cls?.type_code || '';
                    const isPicked = pickedIds.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePick(p)}
                        className={`text-left rounded-xl border p-4 transition-all ${
                          isPicked
                            ? 'border-white/[.14] bg-white/[.08]'
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
                              isPicked ? 'bg-white text-black' : 'border border-zinc-700'
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
        // ★ 학교기출 탭 — 매쓰플랫식 4-필터 풀세트 + 학교 그룹 → 시험지 → 문제 grid
        (() => {
          // ★ PR-3 매쓰플랫식 4-필터 적용
          //   각 필터는 빈값/전체면 통과. 선택된 학교들이 있으면 그 학교 exams 만.
          const filteredExams = schoolExams.filter((ex) => {
            // 1) 검색 키워드
            if (schoolQuery.trim()) {
              const q = schoolQuery.trim().toLowerCase();
              const match =
                (ex.school || '').toLowerCase().includes(q) ||
                (ex.title || '').toLowerCase().includes(q);
              if (!match) return false;
            }
            // 2) 학교급 필터 — grade 의 첫 글자 (중/고/초) 와 매칭
            if (filterSchoolLevel !== '전체') {
              const lv = classifySchoolLevel(ex.school || null);
              if (lv !== filterSchoolLevel) return false;
            }
            // 3) 학년·학기 필터 (예: "중2-1") — ex.grade + ex.semester 조합
            if (filterGradeSemester) {
              const m = filterGradeSemester.match(/^(초|중|고)?(\d)?(?:-([12]))?$/);
              if (m) {
                const lv = m[1];
                const gr = m[2];
                const sem = m[3] ? Number(m[3]) : null;
                if (lv) {
                  const exLv = classifySchoolLevel(ex.school || null);
                  if (exLv !== lv) return false;
                }
                if (gr && ex.grade && !String(ex.grade).includes(gr)) return false;
                if (sem != null && ex.semester != null && ex.semester !== sem) return false;
              }
            }
            // 4) 회차 필터 — exam_round 직접 일치
            if (filterExamRound && ex.exam_round !== filterExamRound) return false;
            // 5) 단원 필터 — chapter 부분일치 (다단원 시험지에선 fail 가능)
            if (filterChapter) {
              if (!(ex.chapter && ex.chapter.includes(filterChapter))) return false;
            }
            // 6) 지역·학교 팝업 다중선택 — selectedSchoolNames 가 있으면 그 학교만
            if (selectedSchoolNames.size > 0) {
              const n = ex.school_name || ex.school || '';
              if (!selectedSchoolNames.has(n)) return false;
            }
            return true;
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
          // ★ PR-3 4-필터 옵션
          const GRADE_SEM_OPTIONS = ['', '중1-1', '중1-2', '중2-1', '중2-2', '중3-1', '중3-2', '고1', '고2', '고3'];
          const EXAM_ROUND_OPTIONS = ['', '중간', '기말', '단원집', '수행평가'];
          const chapterOptions = Array.from(new Set(schoolExams.map((e) => e.chapter).filter((c): c is string => !!c))).sort();
          return (
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* ★ 상단: 매쓰플랫식 4-필터 바 */}
              <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/50 bg-zinc-950/60 px-4 py-2.5 text-xs">
                <span className="font-semibold text-content-tertiary">학교별 기출 필터</span>
                <select
                  value={filterSchoolLevel}
                  onChange={(e) => setFilterSchoolLevel(e.target.value as '전체' | '초' | '중' | '고')}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-content-primary focus:border-white/25 focus:outline-none"
                >
                  <option value="전체">학교급 전체</option>
                  <option value="중">중학교</option>
                  <option value="고">고등학교</option>
                  <option value="초">초등학교</option>
                </select>
                <select
                  value={filterGradeSemester}
                  onChange={(e) => setFilterGradeSemester(e.target.value)}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-content-primary focus:border-white/25 focus:outline-none"
                >
                  {GRADE_SEM_OPTIONS.map((g) => (
                    <option key={g || 'all'} value={g}>{g || '학년·학기 전체'}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setRegionPickerOpen(true)}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-content-primary hover:border-white/25 transition flex items-center gap-1.5"
                >
                  <School className="h-3 w-3" />
                  {selectedSchoolNames.size > 0
                    ? `학교 ${selectedSchoolNames.size}개 선택`
                    : '지역·학교 선택'}
                </button>
                <select
                  value={filterExamRound}
                  onChange={(e) => setFilterExamRound(e.target.value)}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-content-primary focus:border-white/25 focus:outline-none"
                >
                  {EXAM_ROUND_OPTIONS.map((r) => (
                    <option key={r || 'all'} value={r}>{r || '회차 전체'}</option>
                  ))}
                </select>
                {chapterOptions.length > 0 && (
                  <select
                    value={filterChapter}
                    onChange={(e) => setFilterChapter(e.target.value)}
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-content-primary focus:border-white/25 focus:outline-none"
                  >
                    <option value="">단원 전체</option>
                    {chapterOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}
                {(filterSchoolLevel !== '전체' || filterGradeSemester || filterExamRound || filterChapter || selectedSchoolNames.size > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterSchoolLevel('전체');
                      setFilterGradeSemester('');
                      setFilterExamRound('');
                      setFilterChapter('');
                      setSelectedSchoolNames(new Set());
                    }}
                    className="ml-auto text-zinc-400 hover:text-rose-300 underline"
                  >
                    초기화
                  </button>
                )}
                <div className="ml-auto text-[10px] text-zinc-500">
                  매칭 시험지 <span className="text-content-primary font-bold tabular-nums">{filteredExams.length}</span>건
                </div>
              </div>

              {/* 지역·학교 팝업 */}
              {regionPickerOpen && schoolFilterOptions && (
                <RegionPicker
                  regionTree={schoolFilterOptions.regionTree}
                  otherSchools={schoolFilterOptions.otherSchools}
                  selected={selectedSchoolNames}
                  onChange={setSelectedSchoolNames}
                  onClose={() => setRegionPickerOpen(false)}
                />
              )}

              <div className="flex flex-1 overflow-hidden">
              {/* 좌측: 학교 list + 검색 */}
              <aside className="w-[260px] flex-shrink-0 overflow-y-auto border-r border-zinc-800/50 bg-zinc-950/40 p-4">
                <div className="mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-content-tertiary">학교</h3>
                  <p className="mt-1 text-[10px] text-zinc-500">자산화 대부분이 학교기출</p>
                </div>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={schoolQuery}
                    onChange={(e) => setSchoolQuery(e.target.value)}
                    placeholder="학교명·시험지 검색"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 py-1 pl-7 pr-2 text-xs text-content-primary placeholder-zinc-500 focus:border-white/25 focus:outline-none"
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
                                ? 'bg-white/[.08] text-content-primary'
                                : 'text-zinc-300 hover:bg-white/5'
                            }`}
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              {level !== '미분류' && (
                                <span className="text-[10px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 font-bold">
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
                    <h4 className="mb-2 text-xs font-bold text-content-secondary">{selectedSchool} 시험지</h4>
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
                                  ? 'border-white/[.14] bg-white/[.08]'
                                  : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-0.5">
                                {ex.grade && (
                                  <span className="text-[10px] px-1 py-0.5 rounded border border-white/[.08] bg-white/[.04] text-content-secondary">
                                    {ex.grade}
                                  </span>
                                )}
                                {ex.exam_type && (
                                  <span className="text-[10px] text-zinc-500">{ex.exam_type}</span>
                                )}
                              </div>
                              <div className="text-xs font-semibold text-content-primary truncate">{ex.title}</div>
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
                        문제 <span className="font-bold text-content-primary tabular-nums">{schoolProblems.length}</span>건
                        <span className="ml-2 text-zinc-500">— 골라서 새 시험지에 편성</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          toggleAll(schoolProblems);
                        }}
                        className="text-xs text-content-secondary hover:text-content-primary underline"
                      >
                        전체 선택/해제
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {schoolProblems.map((p) => {
                        const cls = Array.isArray(p.classifications) ? p.classifications[0] : p.classifications;
                        const diff = cls ? parseInt(String(cls.difficulty), 10) : 0;
                        const code = cls?.type_code || '';
                        const isPicked = pickedIds.has(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => togglePick(p)}
                            className={`text-left rounded-xl border p-4 transition-all ${
                              isPicked
                                ? 'border-white/[.14] bg-white/[.08]'
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
                                  isPicked ? 'bg-white text-black' : 'border border-zinc-700'
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
              </div>{/* end inner 3-pane row (PR-3 학교기출 4-필터 보강) */}
            </div>
          );
        })()
      ) : activeTab === 'textbook' ? (
        // ★ 시중교재 탭 — 교재(book_groups) → 시험지 → 문제
        (() => {
          // 교재명 검색 필터
          const filteredGroups = bookGroups.filter((bg) => {
            if (!textbookQuery.trim()) return true;
            const q = textbookQuery.trim().toLowerCase();
            return (bg.name || '').toLowerCase().includes(q) || (bg.publisher || '').toLowerCase().includes(q);
          });
          const examsForSelected = selectedBookGroupId
            ? textbookExams.filter((ex) => ex.book_group_id === selectedBookGroupId)
            : [];
          // 교재별 시험지 수 카운트
          const countByGroup = new Map<string, number>();
          for (const ex of textbookExams) {
            if (ex.book_group_id) {
              countByGroup.set(ex.book_group_id, (countByGroup.get(ex.book_group_id) || 0) + 1);
            }
          }
          return (
            <div className="flex flex-1 overflow-hidden">
              {/* 좌측: 교재 list + 검색 */}
              <aside className="w-[260px] flex-shrink-0 overflow-y-auto border-r border-zinc-800/50 bg-zinc-950/40 p-4">
                <div className="mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-content-tertiary">교재</h3>
                  <p className="mt-1 text-[10px] text-zinc-500">출판사·교재명별 자료</p>
                </div>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={textbookQuery}
                    onChange={(e) => setTextbookQuery(e.target.value)}
                    placeholder="교재·출판사 검색"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 py-1 pl-7 pr-2 text-xs text-content-primary placeholder-zinc-500 focus:border-white/25 focus:outline-none"
                  />
                </div>
                {textbookLoading ? (
                  <div className="flex items-center gap-2 text-xs text-zinc-500 py-4">
                    <Loader2 className="h-3 w-3 animate-spin" /> 교재 목록 불러오는 중…
                  </div>
                ) : textbookError ? (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
                    {textbookError}
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <div className="text-xs text-zinc-500 py-4">
                    {bookGroups.length === 0
                      ? '등록된 교재가 없습니다. 자산화 시 book_group 으로 묶으면 표시됩니다.'
                      : '검색 결과가 없습니다.'}
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {filteredGroups.map((bg) => {
                      const count = countByGroup.get(bg.id) || 0;
                      const isSelected = selectedBookGroupId === bg.id;
                      return (
                        <li key={bg.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBookGroupId(bg.id);
                              setSelectedTextbookExamId(null);
                            }}
                            disabled={count === 0}
                            className={`w-full flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                              isSelected
                                ? 'bg-white/[.08] text-content-primary'
                                : count > 0
                                  ? 'text-zinc-300 hover:bg-white/5'
                                  : 'text-zinc-600 cursor-not-allowed'
                            }`}
                          >
                            <span className="flex flex-col min-w-0">
                              <span className="truncate font-semibold">{bg.name}</span>
                              {bg.publisher && (
                                <span className="text-[10px] text-zinc-500 truncate">{bg.publisher}</span>
                              )}
                            </span>
                            <span className="text-[10px] text-zinc-500 flex-shrink-0">{count}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </aside>

              {/* 중간: 교재의 시험지 list */}
              <section className="w-[280px] flex-shrink-0 overflow-y-auto border-r border-zinc-800/50 bg-zinc-950/20 p-4">
                {!selectedBookGroupId ? (
                  <div className="text-xs text-zinc-500 py-4 text-center">교재를 선택하세요</div>
                ) : examsForSelected.length === 0 ? (
                  <div className="text-xs text-zinc-500 py-4 text-center">이 교재에 시험지가 없습니다.</div>
                ) : (
                  <>
                    <h4 className="mb-2 text-xs font-bold text-content-secondary">
                      {bookGroups.find((g) => g.id === selectedBookGroupId)?.name} 시험지
                    </h4>
                    <ul className="space-y-1.5">
                      {examsForSelected.map((ex) => {
                        const isSelected = selectedTextbookExamId === ex.id;
                        return (
                          <li key={ex.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedTextbookExamId(ex.id)}
                              className={`w-full text-left rounded-lg border px-3 py-2 transition-all ${
                                isSelected
                                  ? 'border-white/[.14] bg-white/[.08]'
                                  : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-0.5">
                                {ex.grade && (
                                  <span className="text-[10px] px-1 py-0.5 rounded border border-white/[.08] bg-white/[.04] text-content-secondary">
                                    {ex.grade}
                                  </span>
                                )}
                                {ex.subject && (
                                  <span className="text-[10px] text-zinc-500">{ex.subject}</span>
                                )}
                              </div>
                              <div className="text-xs font-semibold text-content-primary truncate">{ex.title}</div>
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
                {!selectedTextbookExamId ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                    <Library className="mb-3 h-10 w-10 text-zinc-700" />
                    <p className="text-sm">
                      {selectedBookGroupId
                        ? '중간 패널에서 시험지를 선택하세요.'
                        : '좌측에서 교재를 먼저 선택하세요.'}
                    </p>
                  </div>
                ) : textbookProblemsLoading ? (
                  <div className="flex items-center justify-center py-20 text-zinc-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 문제 불러오는 중…
                  </div>
                ) : textbookProblems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                    <Layers className="mb-3 h-10 w-10 text-zinc-700" />
                    <p className="text-sm">이 시험지에 문제가 없습니다.</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-xs text-zinc-400">
                        문제 <span className="font-bold text-content-primary tabular-nums">{textbookProblems.length}</span>건
                        <span className="ml-2 text-zinc-500">— 골라서 새 시험지에 편성</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          toggleAll(textbookProblems);
                        }}
                        className="text-xs text-content-secondary hover:text-content-primary underline"
                      >
                        전체 선택/해제
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {textbookProblems.map((p) => {
                        const cls = Array.isArray(p.classifications) ? p.classifications[0] : p.classifications;
                        const diff = cls ? parseInt(String(cls.difficulty), 10) : 0;
                        const code = cls?.type_code || '';
                        const isPicked = pickedIds.has(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => togglePick(p)}
                            className={`text-left rounded-xl border p-4 transition-all ${
                              isPicked
                                ? 'border-white/[.14] bg-white/[.08]'
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
                                  isPicked ? 'bg-white text-black' : 'border border-zinc-700'
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
      ) : activeTab === 'mock' ? (
        // ★ 모의고사 탭 — 연도 → 시험지 → 문제
        (() => {
          // 검색 필터
          const filteredExams = mockExams.filter((ex) => {
            if (!mockQuery.trim()) return true;
            const q = mockQuery.trim().toLowerCase();
            return (ex.title || '').toLowerCase().includes(q);
          });
          // 연도별 그룹 (year null 은 '연도 미상')
          const byYear = new Map<string, MockExam[]>();
          for (const ex of filteredExams) {
            const key = ex.year != null ? String(ex.year) : '(연도 미상)';
            if (!byYear.has(key)) byYear.set(key, []);
            byYear.get(key)!.push(ex);
          }
          const sortedYears = Array.from(byYear.keys()).sort((a, b) => {
            // 연도 내림차순 (최신 우선), '(연도 미상)' 은 맨 뒤
            if (a === '(연도 미상)') return 1;
            if (b === '(연도 미상)') return -1;
            return b.localeCompare(a);
          });
          const selectedYearKey = selectedMockYear != null ? String(selectedMockYear) : null;
          const examsForYear = selectedYearKey ? byYear.get(selectedYearKey) || [] : [];
          return (
            <div className="flex flex-1 overflow-hidden">
              {/* 좌측: 연도 list + 검색 */}
              <aside className="w-[220px] flex-shrink-0 overflow-y-auto border-r border-zinc-800/50 bg-zinc-950/40 p-4">
                <div className="mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-content-tertiary">연도</h3>
                  <p className="mt-1 text-[10px] text-zinc-500">모의·수능·평가원·학평</p>
                </div>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={mockQuery}
                    onChange={(e) => setMockQuery(e.target.value)}
                    placeholder="제목 검색"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 py-1 pl-7 pr-2 text-xs text-content-primary placeholder-zinc-500 focus:border-white/25 focus:outline-none"
                  />
                </div>
                {mockLoading ? (
                  <div className="flex items-center gap-2 text-xs text-zinc-500 py-4">
                    <Loader2 className="h-3 w-3 animate-spin" /> 시험지 불러오는 중…
                  </div>
                ) : mockError ? (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
                    {mockError}
                  </div>
                ) : sortedYears.length === 0 ? (
                  <div className="text-xs text-zinc-500 py-4">
                    모의고사 시험지가 없습니다. exam_type 또는 제목에 &lsquo;모의고사·수능·평가원·학평&rsquo; 키워드가 있어야 분류됩니다.
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {sortedYears.map((yearKey) => {
                      const count = byYear.get(yearKey)!.length;
                      const isSelected = selectedYearKey === yearKey;
                      const isUnknown = yearKey === '(연도 미상)';
                      return (
                        <li key={yearKey}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMockYear(isUnknown ? -1 : parseInt(yearKey, 10));
                              setSelectedMockExamId(null);
                            }}
                            className={`w-full flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                              isSelected
                                ? 'bg-white/[.08] text-content-primary'
                                : 'text-zinc-300 hover:bg-white/5'
                            }`}
                          >
                            <span className="truncate font-semibold">
                              {isUnknown ? yearKey : `${yearKey}년`}
                            </span>
                            <span className="text-[10px] text-zinc-500 flex-shrink-0">{count}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </aside>

              {/* 중간: 연도의 시험지 list */}
              <section className="w-[300px] flex-shrink-0 overflow-y-auto border-r border-zinc-800/50 bg-zinc-950/20 p-4">
                {selectedMockYear == null ? (
                  <div className="text-xs text-zinc-500 py-4 text-center">연도를 선택하세요</div>
                ) : examsForYear.length === 0 ? (
                  <div className="text-xs text-zinc-500 py-4 text-center">시험지가 없습니다.</div>
                ) : (
                  <>
                    <h4 className="mb-2 text-xs font-bold text-content-secondary">
                      {selectedMockYear === -1 ? '(연도 미상)' : `${selectedMockYear}년`} 시험지
                    </h4>
                    <ul className="space-y-1.5">
                      {examsForYear.map((ex) => {
                        const isSelected = selectedMockExamId === ex.id;
                        return (
                          <li key={ex.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedMockExamId(ex.id)}
                              className={`w-full text-left rounded-lg border px-3 py-2 transition-all ${
                                isSelected
                                  ? 'border-white/[.14] bg-white/[.08]'
                                  : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-0.5">
                                {ex.exam_type && (
                                  <span className="text-[10px] px-1 py-0.5 rounded border border-white/[.08] bg-white/[.04] text-content-secondary">
                                    {ex.exam_type}
                                  </span>
                                )}
                                {ex.grade && (
                                  <span className="text-[10px] text-zinc-500">{ex.grade}</span>
                                )}
                              </div>
                              <div className="text-xs font-semibold text-content-primary truncate">{ex.title}</div>
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
                {!selectedMockExamId ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                    <FileText className="mb-3 h-10 w-10 text-zinc-700" />
                    <p className="text-sm">
                      {selectedMockYear != null
                        ? '중간 패널에서 시험지를 선택하세요.'
                        : '좌측에서 연도를 먼저 선택하세요.'}
                    </p>
                  </div>
                ) : mockProblemsLoading ? (
                  <div className="flex items-center justify-center py-20 text-zinc-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 문제 불러오는 중…
                  </div>
                ) : mockProblems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                    <Layers className="mb-3 h-10 w-10 text-zinc-700" />
                    <p className="text-sm">이 시험지에 문제가 없습니다.</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-xs text-zinc-400">
                        문제 <span className="font-bold text-content-primary tabular-nums">{mockProblems.length}</span>건
                        <span className="ml-2 text-zinc-500">— 골라서 새 시험지에 편성</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          toggleAll(mockProblems);
                        }}
                        className="text-xs text-content-secondary hover:text-content-primary underline"
                      >
                        전체 선택/해제
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {mockProblems.map((p) => {
                        const cls = Array.isArray(p.classifications) ? p.classifications[0] : p.classifications;
                        const diff = cls ? parseInt(String(cls.difficulty), 10) : 0;
                        const code = cls?.type_code || '';
                        const isPicked = pickedIds.has(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => togglePick(p)}
                            className={`text-left rounded-xl border p-4 transition-all ${
                              isPicked
                                ? 'border-white/[.14] bg-white/[.08]'
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
                                  isPicked ? 'bg-white text-black' : 'border border-zinc-700'
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
        // ★ 도달 불가 (모든 탭 활성화 완료) — 안전망 placeholder
        <div className="flex flex-1 items-center justify-center p-10">
          <div className="max-w-md text-center">
            {(() => {
              const tab = SOURCE_TABS.find((t) => t.id === activeTab)!;
              const Icon = tab.icon;
              return (
                <>
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[.08] bg-white/[.04]">
                    <Icon size={28} className="text-content-tertiary" />
                  </div>
                  <h2 className="text-xl font-bold text-content-primary mb-2">{tab.label}</h2>
                  <p className="text-sm text-zinc-400 mb-4">{tab.description}</p>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-500">
                    <Sparkles size={14} className="inline mr-1 text-content-tertiary" />
                    다음 Phase 에서 활성화됩니다. 현재는 <button
                      type="button"
                      onClick={() => setActiveTab('all')}
                      className="text-content-secondary underline hover:text-content-primary"
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
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
              단원 / 유형
            </label>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-2 text-left text-sm text-content-secondary hover:bg-white/[.06]"
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
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
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
                      ? 'bg-white/[.08] text-content-primary border border-white/[.14]'
                      : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-content-primary'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* 키워드 */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
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
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-1.5 pl-9 pr-3 text-xs text-content-primary placeholder-zinc-500 focus:border-white/25 focus:outline-none"
              />
            </div>
          </div>

          {/* 검색 버튼 */}
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading || (!typeCode && !keyword.trim() && selectedDiffs.size === 0)}
            className="w-full rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-2 text-xs font-semibold text-content-secondary hover:bg-white/[.06] hover:text-content-primary disabled:opacity-40 disabled:cursor-not-allowed"
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

          {!typeCode && !keyword.trim() && selectedDiffs.size === 0 && (
            <p className="text-[10px] text-zinc-500">
              단원/유형, 키워드, 난이도 중 하나 이상을 지정하세요. 트리에서 과목별 단원·세부유형을 고르거나 본문 키워드만으로도 검색할 수 있습니다.
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
                {typeCode || keyword.trim() || selectedDiffs.size > 0
                  ? '검색 결과가 없습니다. 필터를 조정해 보세요.'
                  : '좌측에서 단원/유형, 키워드, 난이도 중 하나 이상을 지정하고 검색하세요.'}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs text-zinc-400">
                  검색 결과 <span className="font-bold text-content-primary tabular-nums">{problems.length}</span>건
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {problems.map((p) => {
                  const cls = Array.isArray(p.classifications) ? p.classifications[0] : p.classifications;
                  const diff = cls ? parseInt(String(cls.difficulty), 10) : 0;
                  const code = cls?.type_code || '';
                  const isPicked = pickedIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePick(p)}
                      className={`text-left rounded-xl border p-4 transition-all ${
                        isPicked
                          ? 'border-white/[.14] bg-white/[.08]'
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
                            isPicked ? 'bg-white text-black' : 'border border-zinc-700'
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
          setPickedList([]); // 단원 바뀌면 선택 초기화
        }}
        onClose={() => setPickerOpen(false)}
      />

      {/* 푸터 — 시험지 편성 버튼 */}
      {pickedList.length > 0 && (
        <div className="flex-shrink-0 border-t border-white/[.08] bg-white/[.03] px-8 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-content-secondary">
              <span className="font-bold">{pickedList.length}</span>개 문항 선택됨
            </span>
            <button
              type="button"
              onClick={openCompose}
              className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-zinc-200 whitespace-nowrap"
            >
              시험지 편성 →
            </button>
          </div>
        </div>
      )}

      {/* 선택 트레이 — 출처 탭 가로지르며 picked 누적 가시화 */}
      <SelectionTray
        picked={pickedList}
        onReorder={setPickedList}
        onRemove={(id) => setPickedList((prev) => prev.filter((x) => x.id !== id))}
        onClear={() => setPickedList([])}
        onCompose={openCompose}
      />

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
              <h2 className="text-base font-bold text-content-primary">시험지 편성</h2>
              <button
                type="button"
                onClick={() => !composing && setComposeOpen(false)}
                disabled={composing}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-content-primary disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-5">
              <div className="rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-2 text-xs text-content-secondary">
                선택 문항 <span className="font-bold">{pickedList.length}</span>개 / 단원: {typeName || '미지정'}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-400">제목 *</label>
                <input
                  type="text"
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                  placeholder="예: 26 신곡중 3-1 중간고사 대비"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-content-primary placeholder-zinc-500 focus:border-white/25 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-400">학년 (선택)</label>
                  <input
                    type="text"
                    value={examGrade}
                    onChange={(e) => setExamGrade(e.target.value)}
                    placeholder="예: 고2"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-content-primary placeholder-zinc-500 focus:border-white/25 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-400">과목 (선택)</label>
                  <input
                    type="text"
                    value={examSubject}
                    onChange={(e) => setExamSubject(e.target.value)}
                    placeholder="예: 대수"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-content-primary placeholder-zinc-500 focus:border-white/25 focus:outline-none"
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
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:text-content-primary disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={composing || !examTitle.trim() || pickedList.length === 0}
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
                        problemIds: pickedList.map((p) => p.id),
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
                className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
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

// ============================================================================
// RegionPicker — PR-3 (2026-05-28) 매쓰플랫식 지역·학교 다중선택 팝업
//
// 좌측: 시도 list / 중앙: 시군구 list / 우측: 학교 체크박스 + 검색
// 매쓰플랫 캡쳐와 동일 — "선택한 학교 수 N개" + [전체 초기화] [적용하기]
// ============================================================================
interface RegionPickerProps {
  regionTree: Array<{ sido: string; sigungus: Array<{ sigungu: string; schools: string[] }> }>;
  otherSchools: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  onClose: () => void;
}

function RegionPicker({ regionTree, otherSchools, selected, onChange, onClose }: RegionPickerProps) {
  const [activeSido, setActiveSido] = React.useState<string | null>(regionTree[0]?.sido || null);
  const [activeSigungu, setActiveSigungu] = React.useState<string | null>(regionTree[0]?.sigungus[0]?.sigungu || null);
  const [draft, setDraft] = React.useState<Set<string>>(new Set(selected));
  const [search, setSearch] = React.useState('');

  const activeSidoNode = regionTree.find((n) => n.sido === activeSido);
  const activeSigunguNode = activeSidoNode?.sigungus.find((n) => n.sigungu === activeSigungu);
  const visibleSchools = (() => {
    const base = activeSigunguNode?.schools || (activeSido === null ? otherSchools : []);
    if (!search.trim()) return base;
    const q = search.trim().toLowerCase();
    return base.filter((s) => s.toLowerCase().includes(q));
  })();

  const toggleSchool = (school: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(school)) next.delete(school);
      else next.add(school);
      return next;
    });
  };

  const apply = () => {
    onChange(draft);
    onClose();
  };

  const reset = () => setDraft(new Set());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative w-[820px] max-h-[80vh] flex flex-col rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-content-primary">지역·학교 선택</h3>
            <p className="mt-0.5 text-[10px] text-zinc-500">
              자산화된 학교 중에서만 선택 가능. 폴더 import 후 데이터가 점점 추가됨.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-content-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-zinc-800">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="학교명으로 검색"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 py-1.5 pl-7 pr-2 text-xs text-content-primary placeholder-zinc-500 focus:border-white/25 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* 좌: 시도 */}
          <div className="w-[100px] flex-shrink-0 overflow-y-auto border-r border-zinc-800 p-2">
            <div className="mb-1 text-[10px] font-bold text-zinc-500 uppercase">지역</div>
            {regionTree.map((node) => (
              <button
                key={node.sido}
                type="button"
                onClick={() => {
                  setActiveSido(node.sido);
                  setActiveSigungu(node.sigungus[0]?.sigungu || null);
                }}
                className={`w-full rounded px-2 py-1 text-left text-xs transition ${
                  activeSido === node.sido
                    ? 'bg-white/[.08] text-content-primary'
                    : 'text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                {node.sido}
              </button>
            ))}
            {otherSchools.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setActiveSido(null);
                  setActiveSigungu(null);
                }}
                className={`w-full rounded px-2 py-1 text-left text-xs transition ${
                  activeSido === null
                    ? 'bg-white/[.08] text-content-primary'
                    : 'text-zinc-500 hover:bg-zinc-900'
                }`}
              >
                기타
              </button>
            )}
          </div>

          {/* 중: 시군구 */}
          <div className="w-[140px] flex-shrink-0 overflow-y-auto border-r border-zinc-800 p-2">
            <div className="mb-1 text-[10px] font-bold text-zinc-500 uppercase">시/구/군</div>
            {(activeSidoNode?.sigungus || []).map((node) => (
              <button
                key={node.sigungu}
                type="button"
                onClick={() => setActiveSigungu(node.sigungu)}
                className={`w-full rounded px-2 py-1 text-left text-xs transition ${
                  activeSigungu === node.sigungu
                    ? 'bg-white/[.08] text-content-primary'
                    : 'text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                {node.sigungu}
                <span className="ml-1 text-[10px] text-zinc-500">({node.schools.length})</span>
              </button>
            ))}
          </div>

          {/* 우: 학교 체크박스 */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="mb-1 text-[10px] font-bold text-zinc-500 uppercase">학교</div>
            {visibleSchools.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-500">학교가 없습니다.</div>
            ) : (
              <ul className="space-y-0.5">
                {visibleSchools.map((school) => (
                  <li key={school}>
                    <label className="flex items-center gap-2 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.has(school)}
                        onChange={() => toggleSchool(school)}
                        className="accent-emerald-500"
                      />
                      {school}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={reset}
            className="text-xs text-zinc-400 hover:text-rose-300 underline"
          >
            전체 초기화
          </button>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-zinc-400">
              선택한 학교 수 <span className="font-bold text-content-primary tabular-nums">{draft.size}</span>개
            </span>
            <button
              type="button"
              onClick={apply}
              className="rounded-full bg-white px-4 py-1.5 font-semibold text-black hover:bg-zinc-200 transition"
            >
              적용하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
