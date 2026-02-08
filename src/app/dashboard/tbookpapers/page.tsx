'use client';

import React, { useState } from 'react';
import {
  Search,
  ChevronDown,
  AlertCircle,
  FileText,
  Layers,
  PanelLeftClose,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface Textbook {
  id: string;
  name: string;
  unitCount: number;
}

interface Unit {
  id: string;
  order: number;
  name: string;
  problemCount: number;
}

interface Problem {
  id: string;
  number: number;
  content: string;
  difficulty: number;
  type: string;
}

// ============================================================================
// Mock Data
// ============================================================================

const mockTextbooks: Textbook[] = [
  { id: '1', name: '개념원리 수학(상)', unitCount: 12 },
  { id: '2', name: '개념원리 수학(하)', unitCount: 10 },
  { id: '3', name: '쎈 수학1', unitCount: 15 },
  { id: '4', name: '쎈 수학2', unitCount: 14 },
  { id: '5', name: '수학의 정석 기본편', unitCount: 18 },
];

const mockUnits: Unit[] = [
  { id: '1', order: 1, name: '다항식의 연산', problemCount: 25 },
  { id: '2', order: 2, name: '나머지 정리', problemCount: 30 },
  { id: '3', order: 3, name: '인수분해', problemCount: 28 },
  { id: '4', order: 4, name: '복소수', problemCount: 22 },
  { id: '5', order: 5, name: '이차방정식', problemCount: 35 },
];

const mockProblems: Problem[] = [
  { id: '1', number: 1, content: '다항식 (x+1)(x+2)(x+3)을 전개하시오.', difficulty: 2, type: '계산' },
  { id: '2', number: 2, content: 'x³ + 3x² - x - 3을 인수분해하시오.', difficulty: 3, type: '인수분해' },
  { id: '3', number: 3, content: '다항식 P(x)를 x-1로 나눈 나머지가 2일 때, P(1)의 값을 구하시오.', difficulty: 3, type: '나머지정리' },
];

// ============================================================================
// Sub Components
// ============================================================================

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-3xl bg-zinc-900/50 px-6 py-8 text-center border border-dashed border-zinc-800">
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-zinc-500">
      <AlertCircle className="h-6 w-6" />
    </span>
    <p className="text-sm font-semibold text-zinc-400">{message}</p>
  </div>
);

const SectionHeader: React.FC<{
  number: number;
  title: string;
  subtitle?: string;
  count?: number;
  countLabel?: string;
  rightContent?: React.ReactNode;
}> = ({ number, title, subtitle, count, countLabel = '개', rightContent }) => (
  <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
    <div className="flex items-center gap-3">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
        {number}
      </span>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-white">{title}</span>
        {subtitle && <span className="text-xs text-zinc-500">{subtitle}</span>}
      </div>
    </div>
    <div className="flex items-center gap-2">
      {rightContent}
      {count !== undefined && (
        <span className="text-xs font-semibold text-indigo-400">
          {count}{countLabel}
        </span>
      )}
    </div>
  </div>
);

const ColumnHeader: React.FC<{ columns: { label: string; width: string; align?: 'left' | 'center' | 'right' }[] }> = ({ columns }) => (
  <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-5 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
    {columns.map((col, idx) => (
      <span
        key={idx}
        className={col.width}
        style={{ textAlign: col.align || 'left' }}
      >
        {col.label}
      </span>
    ))}
  </div>
);

// ============================================================================
// Select Component
// ============================================================================

const Select: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  width?: string;
}> = ({ value, onChange, options, placeholder, width = '140px' }) => (
  <div className="relative" style={{ width }}>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full appearance-none rounded-full border border-zinc-700 bg-zinc-900 px-4 pr-10 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
  </div>
);

// ============================================================================
// Main Page Component
// ============================================================================

export default function TbookPapersPage() {
  const [grade, setGrade] = useState('');
  const [semester, setSemester] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTextbook, setSelectedTextbook] = useState<Textbook | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);

  // Filter textbooks by search query
  const filteredTextbooks = mockTextbooks.filter((tb) =>
    tb.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Check if any problems are selected for creating similar exam
  const hasSelectedProblems = selectedUnit !== null;

  return (
    <div className="h-full px-6 py-2">
      <div className="flex h-full w-full flex-col px-4">
        {/* Header Controls */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          {/* Filters */}
          <div className="min-w-[240px]">
            <div className="flex items-center gap-2 m-0 p-0">
              <div className="flex gap-2 items-center">
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  학년
                </label>
                <Select
                  value={grade}
                  onChange={setGrade}
                  options={[
                    { value: 'high1', label: '고1' },
                    { value: 'high2', label: '고2' },
                    { value: 'high3', label: '고3' },
                  ]}
                  width="140px"
                />
              </div>
              <div className="flex gap-2 items-center">
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  학기
                </label>
                <Select
                  value={semester}
                  onChange={setSemester}
                  options={[
                    { value: '1', label: '1학기' },
                    { value: '2', label: '2학기' },
                  ]}
                  width="120px"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-1 items-center justify-between gap-2">
            <div></div>
            <button
              disabled={!hasSelectedProblems}
              className={`
                inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all
                ${hasSelectedProblems
                  ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:-translate-y-[1px] hover:shadow-indigo-500/30'
                  : 'bg-zinc-800 text-zinc-500 opacity-50 cursor-not-allowed pointer-events-none border border-zinc-700'
                }
              `}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white">
                <FileText className="h-3.5 w-3.5" />
              </span>
              <span className="whitespace-nowrap">유사 시험지 출제</span>
            </button>
          </div>

          <button
            onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 bg-transparent text-zinc-400 hover:bg-zinc-800 active:bg-zinc-700 transition-all"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>
        </div>

        {/* Main Content Grid */}
        <div className="flex-1 overflow-hidden pb-2">
          <main className="grid grid-cols-12 gap-4 font-pretendard h-full">
            {/* Column 1: 교재 목록 */}
            <section className="col-span-12 lg:col-span-3 h-[calc(100vh-220px)] min-h-[560px]">
              <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
                <SectionHeader
                  number={1}
                  title="교재 목록"
                  count={filteredTextbooks.length}
                  countLabel="권"
                  rightContent={
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        placeholder="교재명 검색"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 w-48 rounded-md border border-zinc-700 bg-zinc-800/50 pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  }
                />
                <ColumnHeader
                  columns={[
                    { label: '교재명', width: 'flex-1', align: 'left' },
                    { label: '단원수', width: 'w-16', align: 'right' },
                  ]}
                />
                <div className="flex-1 overflow-y-auto bg-zinc-900">
                  <div className="divide-y divide-zinc-800">
                    {filteredTextbooks.length > 0 ? (
                      filteredTextbooks.map((textbook) => (
                        <div
                          key={textbook.id}
                          onClick={() => {
                            setSelectedTextbook(textbook);
                            setSelectedUnit(null);
                          }}
                          className={`
                            flex cursor-pointer items-center justify-between px-5 py-3 transition-colors
                            ${selectedTextbook?.id === textbook.id
                              ? 'bg-blue-50 border-l-2 border-blue-500'
                              : 'hover:bg-warm-surface'
                            }
                          `}
                        >
                          <span className="text-sm text-white">{textbook.name}</span>
                          <span className="text-sm text-zinc-500">{textbook.unitCount}</span>
                        </div>
                      ))
                    ) : (
                      <EmptyState message="검색 결과가 없습니다." />
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Column 2: 단원/시험지 */}
            <section className="col-span-12 lg:col-span-3 h-[calc(100vh-220px)] min-h-[560px]">
              <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
                <SectionHeader
                  number={2}
                  title="단원/시험지"
                  subtitle="단원 선택 후 페이지를 선택하세요."
                  count={selectedTextbook ? mockUnits.length : 0}
                  countLabel="개"
                />
                <ColumnHeader
                  columns={[
                    { label: '회차', width: 'w-12', align: 'center' },
                    { label: '단원명', width: 'flex-1 pl-4', align: 'left' },
                    { label: '문항수', width: 'w-16', align: 'center' },
                  ]}
                />
                <div className="flex-1 overflow-y-auto min-h-0">
                  {selectedTextbook ? (
                    <div className="divide-y divide-zinc-800">
                      {mockUnits.map((unit) => (
                        <div
                          key={unit.id}
                          onClick={() => setSelectedUnit(unit)}
                          className={`
                            flex cursor-pointer items-center px-5 py-3 transition-colors
                            ${selectedUnit?.id === unit.id
                              ? 'bg-blue-50 border-l-2 border-blue-500'
                              : 'hover:bg-warm-surface'
                            }
                          `}
                        >
                          <span className="w-12 text-center text-sm text-zinc-500">
                            {unit.order}
                          </span>
                          <span className="flex-1 pl-4 text-sm text-white">
                            {unit.name}
                          </span>
                          <span className="w-16 text-center text-sm text-zinc-500">
                            {unit.problemCount}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="교재를 선택하면 단원 목록이 표시됩니다." />
                  )}
                </div>
              </div>
            </section>

            {/* Column 3: 문제 미리보기 */}
            <section className="col-span-12 lg:col-span-6 h-[calc(100vh-220px)] min-h-[560px]">
              <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
                {selectedUnit ? (
                  <>
                    <SectionHeader
                      number={3}
                      title="문제 미리보기"
                      subtitle={`${selectedTextbook?.name} > ${selectedUnit.name}`}
                      count={mockProblems.length}
                      countLabel="문항"
                    />
                    <div className="flex-1 overflow-y-auto p-5">
                      <div className="space-y-4">
                        {mockProblems.map((problem) => (
                          <div
                            key={problem.id}
                            className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-4 hover:border-indigo-500/50 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-semibold text-zinc-300">
                                {problem.number}
                              </span>
                              <div className="flex-1">
                                <p className="text-sm text-zinc-200 leading-relaxed">
                                  {problem.content}
                                </p>
                                <div className="mt-3 flex items-center gap-2">
                                  <span className="rounded-full bg-indigo-900/50 px-2.5 py-0.5 text-xs font-medium text-indigo-300">
                                    {problem.type}
                                  </span>
                                  <span className="rounded-full bg-amber-900/30 px-2.5 py-0.5 text-xs font-medium text-amber-500">
                                    난이도 {problem.difficulty}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
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
