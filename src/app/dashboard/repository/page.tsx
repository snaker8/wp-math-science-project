'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, LayoutGrid, List, FileText, FilePlus } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface ExamPaper {
  id: string;
  title: string;
  grade: string;
  course: string;
  status: 'draft' | 'completed' | 'published';
  problemCount: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Filter Dropdown Component
// ============================================================================

interface FilterDropdownProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({ label, value, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-10 min-w-[140px] items-center justify-between gap-2 rounded-xl border border-warm-border-soft bg-white px-4 text-sm text-warm-text-primary transition-colors hover:border-warm-border"
      >
        <span>{value || label}</span>
        <ChevronDown className={`h-4 w-4 text-warm-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-[160px] rounded-xl border border-warm-border-soft bg-white py-1 shadow-medium">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-warm-surface ${value === option ? 'bg-warm-surface text-warm-primary font-medium' : 'text-warm-text-primary'
                  }`}
              >
                {option}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================================
// Empty State Component
// ============================================================================

const EmptyState: React.FC = () => (
  <div className="flex flex-1 items-center justify-center p-8">
    <div className="flex flex-col items-center justify-center rounded-2xl border border-warm-border-soft bg-white/80 px-12 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warm-surface">
        <FileText className="h-8 w-8 text-warm-text-muted" />
      </div>
      <h3 className="text-lg font-semibold text-warm-text-primary">시험지가 없습니다</h3>
      <p className="mt-2 text-sm text-warm-text-muted">
        Litecore에 등록된 시험지가 아직 없습니다.
      </p>
      <button className="mt-6 flex items-center gap-2 rounded-xl bg-warm-primary px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-warm-primary/90">
        새 시험지 만들기
      </button>
    </div>
  </div>
);

// ============================================================================
// Repository Page
// ============================================================================

export default function RepositoryPage() {
  const [gradeFilter, setGradeFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Mock data - empty for now to show empty state
  const examPapers: ExamPaper[] = [];

  const gradeOptions = ['전체', '초등 1학년', '초등 2학년', '초등 3학년', '초등 4학년', '초등 5학년', '초등 6학년', '중등 1학년', '중등 2학년', '중등 3학년', '고등 1학년', '고등 2학년', '고등 3학년'];
  const courseOptions = ['전체', '기초수학', '대수학', '기하학', '미적분', '확률과 통계'];
  const statusOptions = ['전체', '작성중', '완료', '발행됨'];

  return (
    <section className="flex flex-1 flex-col overflow-hidden bg-warm-surface">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-6 py-6">
        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <FilterDropdown
              label="학년"
              value={gradeFilter}
              options={gradeOptions}
              onChange={setGradeFilter}
            />
            <FilterDropdown
              label="강좌명"
              value={courseFilter}
              options={courseOptions}
              onChange={setCourseFilter}
            />
            <FilterDropdown
              label="상태"
              value={statusFilter}
              options={statusOptions}
              onChange={setStatusFilter}
            />
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/repository/editor"
              className="flex items-center gap-2 rounded-full border border-transparent bg-gradient-to-r from-warm-primary/20 via-warm-primary/10 to-warm-surface-strong px-4 py-2 text-sm font-medium text-warm-text-primary transition-all hover:-translate-y-[1px] hover:bg-warm-surface-strong"
            >
              <FilePlus className="h-4 w-4" />
              <span>새 시험지 만들기</span>
            </Link>
            <div className="flex items-center rounded-xl border border-warm-border-soft bg-white p-1">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${viewMode === 'grid'
                  ? 'bg-warm-primary text-white'
                  : 'text-warm-text-muted hover:bg-warm-surface hover:text-warm-text-primary'
                  }`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${viewMode === 'list'
                  ? 'bg-warm-primary text-white'
                  : 'text-warm-text-muted hover:bg-warm-surface hover:text-warm-text-primary'
                  }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        {examPapers.length === 0 ? (
          <EmptyState />
        ) : (
          <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
            {/* Exam paper cards would go here */}
          </div>
        )}
      </div>
    </section>
  );
}
