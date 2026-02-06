'use client';

import React, { useState } from 'react';
import {
  ChevronDown,
  Search,
  AlertCircle,
  FileText,
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

// ============================================================================
// Mock Data
// ============================================================================

const grades = ['전체', '중1', '중2', '중3', '고1', '고2', '고3'];
const semesters = ['전체', '1학기', '2학기'];

const mockTextbooks: Textbook[] = [
  { id: 't1', name: '개념원리 중학수학 1-1', unitCount: 12 },
  { id: 't2', name: '쎈 중학수학 1-1', unitCount: 15 },
  { id: 't3', name: '일품 중학수학 1-1', unitCount: 10 },
  { id: 't4', name: '개념플러스유형 1-1', unitCount: 14 },
];

const mockUnits: Unit[] = [
  { id: 'u1', order: 1, name: '자연수의 성질', problemCount: 25 },
  { id: 'u2', order: 2, name: '정수와 유리수', problemCount: 30 },
  { id: 'u3', order: 3, name: '문자의 사용과 식', problemCount: 22 },
  { id: 'u4', order: 4, name: '일차방정식', problemCount: 28 },
];

// ============================================================================
// Components
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
      <label className="text-xs font-semibold uppercase tracking-wide text-warm-text-muted">
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-11 items-center justify-between rounded-full border border-warm-border-soft bg-white/95 px-4 text-sm font-medium text-warm-text-primary shadow-none"
          style={{ width }}
        >
          <span>{value || '선택'}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </button>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
            <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-[120px] rounded-lg border border-warm-border-soft bg-white py-1 shadow-md">
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-warm-surface ${
                    value === option ? 'bg-warm-surface font-medium text-blue-600' : 'text-warm-text-secondary'
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
  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#DDEAFD] text-xs font-semibold text-[#2B6CB0]">
    {number}
  </span>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-3xl bg-white/85 px-6 py-8 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warm-surface-strong text-warm-text-secondary">
      <AlertCircle className="h-6 w-6" />
    </span>
    <p className="text-sm font-semibold text-warm-text-primary">{message}</p>
  </div>
);

// ============================================================================
// Main Page Component
// ============================================================================

export default function SimilarPage() {
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTextbook, setSelectedTextbook] = useState<Textbook | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

  const filteredTextbooks = mockTextbooks.filter((book) =>
    book.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canCreateSimilar = selectedUnit !== null;

  return (
    <div className="h-full px-6 py-2">
      <div className="flex h-full w-full flex-col px-4">
        {/* Header Filters */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-[240px]">
            <div className="flex items-center gap-2 m-0 p-0">
              <FilterDropdown
                label="학년"
                value={selectedGrade}
                options={grades}
                onChange={setSelectedGrade}
                width="140px"
              />
              <FilterDropdown
                label="학기"
                value={selectedSemester}
                options={semesters}
                onChange={setSelectedSemester}
                width="120px"
              />
            </div>
          </div>
          <div className="flex flex-1 items-center justify-between gap-2">
            <div />
            <button
              type="button"
              disabled={!canCreateSimilar}
              className={`flex h-8 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                canCreateSimilar
                  ? 'border-transparent bg-gradient-to-r from-blue-300 via-blue-400 to-blue-200 text-blue-900 hover:-translate-y-[1px] hover:from-blue-400 hover:via-blue-500 hover:to-blue-300'
                  : 'cursor-not-allowed border-transparent bg-gradient-to-r from-blue-200 via-blue-300 to-blue-100 text-blue-900 opacity-50 pointer-events-none'
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                <FileText className="h-3.5 w-3.5" />
              </span>
              <span className="whitespace-nowrap">유사 시험지 출제</span>
            </button>
          </div>
        </div>

        {/* Main Content - Three Column Grid */}
        <div className="flex-1 overflow-hidden pb-2">
          <main className="grid h-full grid-cols-12 gap-4 font-pretendard">
            {/* Column 1: Textbook List */}
            <section className="col-span-12 lg:col-span-3 h-[calc(100vh-170px)] min-h-[560px]">
              <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-warm-border-soft bg-white/90">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-warm-border-soft px-5 py-4">
                  <div className="flex items-center gap-3">
                    <StepBadge number={1} />
                    <span className="text-sm font-semibold text-warm-text-primary">교재 목록</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-text-muted" />
                      <input
                        type="text"
                        placeholder="교재명 검색"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 w-48 rounded-md border border-warm-border-soft bg-transparent pl-9 pr-3 text-sm placeholder:text-warm-text-muted focus:outline-none focus:ring-1 focus:ring-warm-ring"
                      />
                    </div>
                    <span className="text-xs font-semibold text-[#2B6CB0]">{filteredTextbooks.length}권</span>
                  </div>
                </div>

                {/* Column Headers */}
                <div className="flex items-center justify-between border-b border-warm-border-soft bg-warm-surface px-5 py-2 text-xs font-medium uppercase tracking-wide text-warm-text-muted">
                  <span className="flex-1">교재명</span>
                  <span className="w-16 text-right">단원수</span>
                </div>

                {/* Textbook List */}
                <div className="flex-1 overflow-auto bg-white">
                  <div className="divide-y divide-warm-surface-strong">
                    {filteredTextbooks.map((book) => (
                      <button
                        key={book.id}
                        type="button"
                        onClick={() => {
                          setSelectedTextbook(book);
                          setSelectedUnit(null);
                        }}
                        className={`flex w-full items-center justify-between px-5 py-3 text-left transition-colors ${
                          selectedTextbook?.id === book.id
                            ? 'bg-blue-50 text-blue-700'
                            : 'hover:bg-warm-surface'
                        }`}
                      >
                        <span className="flex-1 truncate text-sm font-medium">{book.name}</span>
                        <span className="w-16 text-right text-xs text-warm-text-muted">{book.unitCount}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Column 2: Unit List */}
            <section className="col-span-12 lg:col-span-3 h-[calc(100vh-170px)] min-h-[560px]">
              <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-warm-border-soft bg-white/90">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-warm-border-soft px-5 py-4">
                  <div className="flex items-center gap-3">
                    <StepBadge number={2} />
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-warm-text-primary">단원/시험지</span>
                      <span className="text-xs text-warm-text-muted">단원 선택 후 페이지를 선택하세요.</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-[#2B6CB0]">
                    {selectedTextbook ? mockUnits.length : 0}개
                  </span>
                </div>

                {/* Column Headers */}
                <div className="flex items-center justify-between border-b border-warm-border-soft bg-warm-surface px-5 py-2 text-xs font-medium uppercase tracking-wide text-warm-text-muted">
                  <span className="w-12 text-center">회차</span>
                  <span className="flex-1 pl-4 text-left">단원명</span>
                  <span className="w-16 text-center">문항수</span>
                </div>

                {/* Unit List */}
                <div className="flex-1 overflow-auto">
                  {selectedTextbook ? (
                    <div className="divide-y divide-warm-surface-strong">
                      {mockUnits.map((unit) => (
                        <button
                          key={unit.id}
                          type="button"
                          onClick={() => setSelectedUnit(unit)}
                          className={`flex w-full items-center justify-between px-5 py-3 text-left transition-colors ${
                            selectedUnit?.id === unit.id
                              ? 'bg-blue-50 text-blue-700'
                              : 'hover:bg-warm-surface'
                          }`}
                        >
                          <span className="w-12 text-center text-sm font-medium">{unit.order}</span>
                          <span className="flex-1 truncate pl-4 text-sm">{unit.name}</span>
                          <span className="w-16 text-center text-xs text-warm-text-muted">{unit.problemCount}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="교재를 선택하면 단원 목록이 표시됩니다." />
                  )}
                </div>
              </div>
            </section>

            {/* Column 3: Problem Viewer */}
            <section className="col-span-12 lg:col-span-6 h-[calc(100vh-170px)] min-h-[560px]">
              <div className="flex h-full w-full items-center justify-center rounded-2xl border border-warm-border-soft bg-white/95 text-center">
                {selectedUnit ? (
                  <div className="flex h-full w-full flex-col">
                    {/* Problem Header */}
                    <div className="flex items-center justify-between border-b border-warm-border-soft px-5 py-4">
                      <div className="flex items-center gap-3">
                        <StepBadge number={3} />
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-warm-text-primary">문제 목록</span>
                          <span className="text-xs text-warm-text-muted">{selectedUnit.name}</span>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-[#2B6CB0]">{selectedUnit.problemCount}문항</span>
                    </div>

                    {/* Problem Content Placeholder */}
                    <div className="flex flex-1 items-center justify-center">
                      <div className="text-center">
                        <p className="text-sm text-warm-text-muted">
                          선택된 단원의 문제가 여기에 표시됩니다.
                        </p>
                        <p className="mt-2 text-xs text-warm-text-light">
                          {selectedUnit.problemCount}개의 문제 중 유사 문제를 선택할 수 있습니다.
                        </p>
                      </div>
                    </div>
                  </div>
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
