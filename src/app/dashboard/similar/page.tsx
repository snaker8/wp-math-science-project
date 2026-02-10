'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Search,
  AlertCircle,
  FileText,
  X,
  Check,
  Layers,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface Textbook {
  id: string;
  name: string;
  unitCount: number;
  grade: string;
  semester: string;
}

interface Unit {
  id: string;
  order: number;
  name: string;
  problemCount: number;
  badge?: number; // 소단원 수 등 뱃지
  pages: PageInfo[];
}

interface PageInfo {
  pageNum: number;
  problemCount: number;
}

interface Problem {
  id: string;
  sequence: number;
  pageNum: number;
  problemNum: number;
  typeCode: string;
  typeName: string;
  difficulty: '최상' | '상' | '중' | '하' | '최하';
  cognitiveDomain: string;
}

type DifficultyFilter = '전체' | '최상' | '상' | '중' | '하' | '최하';

// ============================================================================
// Mock Data
// ============================================================================

const grades = ['고 1학년', '고 2학년', '고 3학년', '중 1학년', '중 2학년', '중 3학년'];
const semesters = ['전체', '1학기', '2학기'];

const mockTextbooks: Textbook[] = [
  { id: 't1', name: '[공통수학1] EBS 올림포스 고난도', unitCount: 8, grade: '고 1학년', semester: '전체' },
  { id: 't2', name: '[공통수학1] 수학의 바이블 유형 ON 2권', unitCount: 12, grade: '고 1학년', semester: '전체' },
  { id: 't3', name: '[공통수학1] 수학의 바이블 유형 ON 1권', unitCount: 12, grade: '고 1학년', semester: '전체' },
  { id: 't4', name: '[공통수학1] 하이매쓰', unitCount: 13, grade: '고 1학년', semester: '전체' },
  { id: 't5', name: '[공통수학1] 수학의 바이블 유형 ON 라이트', unitCount: 12, grade: '고 1학년', semester: '전체' },
  { id: 't6', name: '[공통수학1] 1등급 만들기', unitCount: 4, grade: '고 1학년', semester: '전체' },
  { id: 't7', name: '[공통수학1] 유형반복R', unitCount: 12, grade: '고 1학년', semester: '전체' },
  { id: 't8', name: '[공통수학2] 내신 고쟁이', unitCount: 6, grade: '고 1학년', semester: '전체' },
  { id: 't9', name: '[공통수학2] 개념쎈 라이트', unitCount: 11, grade: '고 1학년', semester: '전체' },
  { id: 't10', name: '[공통수학2] 수학의 바이블 유형 ON 2권', unitCount: 10, grade: '고 1학년', semester: '전체' },
  { id: 't11', name: '[공통수학2] 수학의 바이블 유형 ON 1권', unitCount: 10, grade: '고 1학년', semester: '전체' },
  { id: 't12', name: '[공통수학1] 품산자 라이트유형', unitCount: 12, grade: '고 1학년', semester: '전체' },
  { id: 't13', name: '[공통수학1] [교과서] 미래엔', unitCount: 4, grade: '고 1학년', semester: '전체' },
  { id: 't14', name: '[공통수학2] 개념워리', unitCount: 10, grade: '고 1학년', semester: '전체' },
];

function generateMockUnits(textbookId: string): Unit[] {
  const unitNames = [
    '평면좌표', '직선의 방정식', '원의 방정식', '도형의 이동',
    '집합의 뜻', '집합의 연산', '명제', '함수',
  ];
  const badgeCounts = [2, 2, 0, 0, 0, 0, 0, 0];

  return unitNames.map((name, i) => {
    const totalProblems = 50 + Math.floor(Math.random() * 70);
    const numPages = Math.ceil(totalProblems / 5);
    const startPage = 14 + i * numPages;
    const pages: PageInfo[] = Array.from({ length: numPages }, (_, j) => ({
      pageNum: startPage + j,
      problemCount: j < numPages - 1 ? 5 : totalProblems - (numPages - 1) * 5,
    }));
    return {
      id: `${textbookId}-u${i}`,
      order: i + 1,
      name,
      problemCount: totalProblems,
      badge: badgeCounts[i] || undefined,
      pages,
    };
  });
}

function generateMockProblems(pages: PageInfo[], selectedPages: number[]): Problem[] {
  const typeNames = [
    'A003. 다항식의 전개식에서 계수구하기',
    'A002. 다항식의 곱셈공식',
    'A136. 선분의 길이의 제곱의 합의 최솟값',
    'A045. 나머지정리와 인수분해',
    'A012. 이차방정식의 근과 계수의 관계',
    'A078. 절댓값을 포함한 방정식',
    'A091. 함수의 그래프 해석',
    'A025. 집합의 원소의 개수',
  ];

  const difficulties: Problem['difficulty'][] = ['하', '하', '중', '중', '중', '상', '최상', '하'];
  const domains = ['계산', '계산', '계산', '계산', '계산', '이해', '이해', '계산'];

  const problems: Problem[] = [];
  let seq = 1;

  for (const page of pages) {
    if (!selectedPages.includes(page.pageNum)) continue;
    for (let i = 0; i < page.problemCount; i++) {
      const idx = (seq - 1) % typeNames.length;
      problems.push({
        id: `p${seq}`,
        sequence: seq,
        pageNum: page.pageNum,
        problemNum: i + 1,
        typeCode: typeNames[idx].split('.')[0],
        typeName: typeNames[idx],
        difficulty: difficulties[idx],
        cognitiveDomain: domains[idx],
      });
      seq++;
    }
  }

  return problems;
}

// ============================================================================
// Sub-Components
// ============================================================================

const FilterDropdown: React.FC<{
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  width?: string;
}> = ({ label, value, options, onChange, width = '140px' }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 items-center justify-between rounded-full border border-zinc-700 bg-zinc-900 px-4 text-sm font-medium text-white"
          style={{ width }}
        >
          <span>{value || '선택'}</span>
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
        </button>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
            <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-[120px] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => { onChange(option); setIsOpen(false); }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-zinc-800 ${
                    value === option ? 'bg-zinc-800 font-medium text-indigo-400' : 'text-zinc-300'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const StepBadge: React.FC<{ number: number }> = ({ number }) => (
  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-400">
    {number}
  </span>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
      <AlertCircle className="h-6 w-6" />
    </span>
    <p className="text-sm font-semibold text-zinc-300">{message}</p>
  </div>
);

// 난이도 뱃지 색상
function getDifficultyColor(d: string) {
  switch (d) {
    case '최상': return 'text-red-400';
    case '상': return 'text-orange-400';
    case '중': return 'text-yellow-400';
    case '하': return 'text-green-400';
    case '최하': return 'text-emerald-400';
    default: return 'text-zinc-400';
  }
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function SimilarPage() {
  // --- State ---
  const [selectedGrade, setSelectedGrade] = useState(grades[0]);
  const [selectedSemester, setSelectedSemester] = useState(semesters[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTextbook, setSelectedTextbook] = useState<Textbook | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [selectedProblemIds, setSelectedProblemIds] = useState<Set<string>>(new Set());
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('전체');

  // --- Derived Data ---
  const units = useMemo(
    () => (selectedTextbook ? generateMockUnits(selectedTextbook.id) : []),
    [selectedTextbook]
  );

  const filteredTextbooks = useMemo(() => {
    return mockTextbooks.filter((book) => {
      const matchesSearch = book.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesGrade = book.grade === selectedGrade;
      const matchesSemester = selectedSemester === '전체' || book.semester === selectedSemester;
      return matchesSearch && matchesGrade && matchesSemester;
    });
  }, [searchQuery, selectedGrade, selectedSemester]);

  const problems = useMemo(() => {
    if (!selectedUnit || selectedPages.length === 0) return [];
    return generateMockProblems(selectedUnit.pages, selectedPages);
  }, [selectedUnit, selectedPages]);

  const filteredProblems = useMemo(() => {
    if (difficultyFilter === '전체') return problems;
    return problems.filter((p) => p.difficulty === difficultyFilter);
  }, [problems, difficultyFilter]);

  // 답안지명 생성
  const scopeDescription = useMemo(() => {
    if (!selectedUnit || selectedPages.length === 0) return '';
    // 페이지별로 어떤 유형이 있는지 요약
    const pageGroups: string[] = [];
    for (const page of selectedPages) {
      const pageProblems = problems.filter((p) => p.pageNum === page);
      if (pageProblems.length > 0) {
        const types = [...new Set(pageProblems.map((p) => p.typeName.split('.')[1]?.trim() || p.typeName))];
        pageGroups.push(`${types[0] || ''}`);
      }
    }
    const uniqueTypes = [...new Set(pageGroups)];
    return uniqueTypes.slice(0, 3).join(', ') + (uniqueTypes.length > 3 ? ' 외' : '');
  }, [selectedUnit, selectedPages, problems]);

  // --- Handlers ---
  const handleSelectTextbook = useCallback((book: Textbook) => {
    setSelectedTextbook(book);
    setSelectedUnit(null);
    setSelectedPages([]);
    setSelectedProblemIds(new Set());
    setDifficultyFilter('전체');
  }, []);

  const handleSelectUnit = useCallback((unit: Unit) => {
    setSelectedUnit(unit);
    setSelectedPages([]);
    setSelectedProblemIds(new Set());
    setDifficultyFilter('전체');
  }, []);

  const handleTogglePage = useCallback((pageNum: number) => {
    setSelectedPages((prev) => {
      const next = prev.includes(pageNum) ? prev.filter((p) => p !== pageNum) : [...prev, pageNum];
      return next.sort((a, b) => a - b);
    });
    setSelectedProblemIds(new Set());
  }, []);

  const handleToggleProblem = useCallback((problemId: string) => {
    setSelectedProblemIds((prev) => {
      const next = new Set(prev);
      if (next.has(problemId)) next.delete(problemId);
      else next.add(problemId);
      return next;
    });
  }, []);

  const handleToggleAllProblems = useCallback(() => {
    if (selectedProblemIds.size === filteredProblems.length) {
      setSelectedProblemIds(new Set());
    } else {
      setSelectedProblemIds(new Set(filteredProblems.map((p) => p.id)));
    }
  }, [filteredProblems, selectedProblemIds]);

  const handleRemovePageTag = useCallback((pageNum: number) => {
    setSelectedPages((prev) => prev.filter((p) => p !== pageNum));
  }, []);

  const canCreateSimilar = selectedProblemIds.size > 0;

  // --- Page Groups for Unit ---
  // 유닛의 총 페이지를 가져옴
  const unitPages = selectedUnit?.pages || [];

  return (
    <div className="h-full bg-black text-white">
      <div className="flex h-full w-full flex-col">
        {/* Header Filters */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3 border-b border-zinc-800/50">
          <div className="flex items-center gap-4">
            <FilterDropdown
              label="학년"
              value={selectedGrade}
              options={grades}
              onChange={setSelectedGrade}
              width="150px"
            />
            <FilterDropdown
              label="학기"
              value={selectedSemester}
              options={semesters}
              onChange={setSelectedSemester}
              width="120px"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!canCreateSimilar}
              className={`flex h-9 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-all ${
                canCreateSimilar
                  ? 'bg-gradient-to-r from-indigo-500 via-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-500/20 hover:-translate-y-[1px] active:translate-y-0'
                  : 'cursor-not-allowed bg-zinc-800 text-zinc-500 opacity-50 pointer-events-none'
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                <FileText className="h-3.5 w-3.5" />
              </span>
              <span className="whitespace-nowrap">유사 시험지 출제</span>
            </button>
          </div>
        </div>

        {/* Main Content - Three Column Grid */}
        <div className="flex-1 overflow-hidden px-6 py-3">
          <main className="grid h-full grid-cols-12 gap-4">
            {/* ================================================================
                Column 1: 교재 목록
            ================================================================ */}
            <section className="col-span-12 lg:col-span-3 h-full min-h-0">
              <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <StepBadge number={1} />
                    <span className="text-sm font-semibold text-white">교재 목록</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        placeholder="교재명 검색"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 w-40 rounded-md border border-zinc-700 bg-zinc-800/50 pl-8 pr-3 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <span className="text-xs font-bold text-indigo-400">{filteredTextbooks.length}권</span>
                  </div>
                </div>

                {/* Column Headers */}
                <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-800/50 px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  <span className="flex-1">교재명</span>
                  <span className="w-14 text-right">단원수</span>
                </div>

                {/* Textbook List */}
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                  <div className="divide-y divide-zinc-800/50">
                    {filteredTextbooks.map((book) => {
                      const isActive = selectedTextbook?.id === book.id;
                      return (
                        <button
                          key={book.id}
                          type="button"
                          onClick={() => handleSelectTextbook(book)}
                          className={`flex w-full items-center justify-between px-5 py-3 text-left transition-colors ${
                            isActive
                              ? 'bg-indigo-500/10 text-indigo-300 font-semibold'
                              : 'hover:bg-zinc-800/50 text-zinc-300'
                          }`}
                        >
                          <span className="flex-1 truncate text-[13px]">{book.name}</span>
                          <span className={`w-14 text-right text-xs ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`}>
                            {book.unitCount}
                          </span>
                        </button>
                      );
                    })}
                    {filteredTextbooks.length === 0 && (
                      <div className="p-8 text-center text-sm text-zinc-600">
                        검색 결과가 없습니다
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* ================================================================
                Column 2: 단원/시험지 + 페이지 선택
            ================================================================ */}
            <section className="col-span-12 lg:col-span-3 h-full min-h-0">
              <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <StepBadge number={2} />
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-white">단원/시험지</span>
                      <span className="text-[11px] text-zinc-500">단원 선택 후 페이지를 선택하세요.</span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-indigo-400">
                    {selectedTextbook ? units.length : 0}개
                  </span>
                </div>

                {/* Column Headers */}
                <div className="flex items-center border-b border-zinc-800 bg-zinc-800/50 px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  <span className="w-10 text-center">회차</span>
                  <span className="flex-1 pl-3 text-left">단원명</span>
                  <span className="w-14 text-center">문항수</span>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                  {selectedTextbook ? (
                    <div className="flex flex-col">
                      {/* Unit List */}
                      <div className="divide-y divide-zinc-800/50">
                        {units.map((unit) => {
                          const isActive = selectedUnit?.id === unit.id;
                          return (
                            <button
                              key={unit.id}
                              type="button"
                              onClick={() => handleSelectUnit(unit)}
                              className={`flex w-full items-center px-5 py-3 text-left transition-colors ${
                                isActive
                                  ? 'bg-indigo-500/10 text-indigo-300 font-semibold'
                                  : 'hover:bg-zinc-800/50 text-zinc-300'
                              }`}
                            >
                              <span className="w-10 text-center text-sm font-medium">{unit.order}</span>
                              <span className="flex-1 flex items-center gap-2 pl-3 truncate text-[13px]">
                                <span className="font-semibold">{unit.name}</span>
                                {unit.badge && (
                                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-400">
                                    {unit.badge}
                                  </span>
                                )}
                              </span>
                              <span className={`w-14 text-center text-xs ${isActive ? 'text-indigo-400 font-bold' : 'text-zinc-500'}`}>
                                {unit.problemCount}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Page Selection */}
                      <AnimatePresence>
                        {selectedUnit && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-t border-zinc-700 overflow-hidden"
                          >
                            <div className="px-5 py-3 bg-zinc-850">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-zinc-400">페이지 선택</span>
                                <span className="text-[11px] text-zinc-500">선택: {selectedPages.length}</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {unitPages.map((page) => {
                                  const isSelected = selectedPages.includes(page.pageNum);
                                  return (
                                    <button
                                      key={page.pageNum}
                                      type="button"
                                      onClick={() => handleTogglePage(page.pageNum)}
                                      className={`relative flex h-8 min-w-[40px] items-center justify-center rounded-lg px-2 text-xs font-medium transition-all ${
                                        isSelected
                                          ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
                                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                                      }`}
                                    >
                                      {isSelected && (
                                        <Check className="mr-0.5 h-3 w-3" />
                                      )}
                                      {page.pageNum}p
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <EmptyState message="교재를 선택하면 단원 목록이 표시됩니다." />
                  )}
                </div>
              </div>
            </section>

            {/* ================================================================
                Column 3: 문항 선택
            ================================================================ */}
            <section className="col-span-12 lg:col-span-6 h-full min-h-0">
              <div className="flex h-full w-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900/95">
                {selectedUnit && selectedPages.length > 0 ? (
                  <>
                    {/* Header Area */}
                    <div className="border-b border-zinc-800 px-5 py-3.5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <StepBadge number={3} />
                          <span className="text-sm font-semibold text-white">문항 선택</span>
                        </div>
                        <span className="text-xs text-zinc-400">
                          선택된 문제 <span className="font-bold text-indigo-400">{selectedProblemIds.size}</span>
                          <span className="text-zinc-600"> / {filteredProblems.length}</span>
                        </span>
                      </div>

                      {/* 답안지명 + 난이도 필터 */}
                      <div className="flex items-start justify-between gap-4">
                        {/* 답안지명 */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs font-medium text-zinc-500 whitespace-nowrap">답안지명</span>
                          <div className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-xs text-zinc-300 truncate">
                            {scopeDescription || '페이지를 선택하세요'}
                          </div>
                        </div>
                        {/* 난이도 필터 */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-zinc-500 mr-1 whitespace-nowrap">난이도</span>
                          {(['전체', '최상', '상', '중', '하', '최하'] as DifficultyFilter[]).map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setDifficultyFilter(d)}
                              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                                difficultyFilter === d
                                  ? 'bg-indigo-500 text-white'
                                  : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300'
                              }`}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 선택된 페이지 태그 */}
                      {selectedPages.length > 0 && (
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-medium text-zinc-500 border border-zinc-700 rounded px-2 py-0.5">
                            선택된 페이지
                          </span>
                          <span className="text-[11px] text-zinc-500">
                            총 {selectedPages.length}개 페이지
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedPages.map((pageNum) => {
                              // 해당 페이지의 문제를 검사하여 유형 계열을 표시
                              const pageProblems = problems.filter((p) => p.pageNum === pageNum);
                              const typeSummary = pageProblems.length > 0
                                ? pageProblems[0].typeName.split('.')[1]?.trim().slice(0, 6) || ''
                                : '';
                              return (
                                <span
                                  key={pageNum}
                                  className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-medium text-indigo-400 ring-1 ring-indigo-500/30"
                                >
                                  {typeSummary ? `${typeSummary}: ` : ''}{pageNum}p
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePageTag(pageNum)}
                                    className="ml-0.5 rounded-full p-0.5 hover:bg-indigo-500/30 transition-colors"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Problem Table */}
                    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                      {/* Table Header */}
                      <div className="sticky top-0 z-10 flex items-center border-b border-zinc-800 bg-zinc-800/80 backdrop-blur px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        <span className="w-10 text-center">
                          <input
                            type="checkbox"
                            checked={selectedProblemIds.size === filteredProblems.length && filteredProblems.length > 0}
                            onChange={handleToggleAllProblems}
                            className="h-3.5 w-3.5 accent-indigo-500 rounded cursor-pointer"
                          />
                        </span>
                        <span className="w-12 text-center">순번</span>
                        <span className="w-14 text-center">페이지</span>
                        <span className="w-12 text-center">문제</span>
                        <span className="flex-1 pl-3">유형명</span>
                        <span className="w-14 text-center">난이도</span>
                        <span className="w-16 text-center">인지영역</span>
                      </div>

                      {/* Table Body */}
                      <div className="divide-y divide-zinc-800/40">
                        {filteredProblems.map((problem) => {
                          const isChecked = selectedProblemIds.has(problem.id);
                          return (
                            <button
                              key={problem.id}
                              type="button"
                              onClick={() => handleToggleProblem(problem.id)}
                              className={`flex w-full items-center px-5 py-2.5 text-left transition-colors ${
                                isChecked
                                  ? 'bg-indigo-500/5'
                                  : 'hover:bg-zinc-800/30'
                              }`}
                            >
                              <span className="w-10 text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="h-3.5 w-3.5 accent-indigo-500 rounded pointer-events-none"
                                />
                              </span>
                              <span className="w-12 text-center text-xs text-zinc-400">{problem.sequence}</span>
                              <span className="w-14 text-center text-xs text-zinc-400">{problem.pageNum}</span>
                              <span className="w-12 text-center text-xs text-zinc-400">{problem.problemNum}</span>
                              <span className="flex-1 pl-3 truncate text-xs text-zinc-300">
                                {problem.typeName}
                              </span>
                              <span className={`w-14 text-center text-xs font-medium ${getDifficultyColor(problem.difficulty)}`}>
                                {problem.difficulty}
                              </span>
                              <span className="w-16 text-center text-xs text-zinc-500">
                                {problem.cognitiveDomain}
                              </span>
                            </button>
                          );
                        })}
                        {filteredProblems.length === 0 && (
                          <div className="p-8 text-center text-sm text-zinc-600">
                            {problems.length > 0
                              ? '해당 난이도의 문제가 없습니다'
                              : '선택된 페이지에 문제가 없습니다'}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <EmptyState message="단원을 선택하고 페이지를 선택하면 문제 목록을 확인할 수 있습니다." />
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
