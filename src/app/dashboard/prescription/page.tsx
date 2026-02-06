'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, ChevronDown, Menu } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface Student {
  id: string;
  name: string;
  grade: string;
  class: string;
}

type TabType = 'guide' | 'calendar' | 'heatmap' | 'storage';

// ============================================================================
// Mock Data
// ============================================================================

const mockStudents: Student[] = [
  { id: '1', name: '김민준', grade: '중1', class: 'A반' },
  { id: '2', name: '이서연', grade: '중1', class: 'A반' },
  { id: '3', name: '박지호', grade: '중2', class: 'B반' },
  { id: '4', name: '최수아', grade: '중2', class: 'B반' },
  { id: '5', name: '정예준', grade: '중3', class: 'C반' },
];

const grades = ['전체', '중1', '중2', '중3', '고1', '고2', '고3'];
const classes = ['전체', 'A반', 'B반', 'C반', 'D반'];

// ============================================================================
// Components
// ============================================================================

const FilterSelect: React.FC<{
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}> = ({ value, options, onChange, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative flex-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 w-full items-center justify-between rounded-full border border-warm-border-soft bg-white px-3 text-xs font-medium text-warm-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{value || '선택'}</span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border-warm-border-soft bg-white py-1 shadow-md">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-warm-surface ${
                  value === option ? 'bg-warm-surface font-medium text-warm-primary' : 'text-warm-text-secondary'
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

const StudentCard: React.FC<{
  student: Student;
  isSelected: boolean;
  onClick: () => void;
}> = ({ student, isSelected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
      isSelected
        ? 'border-warm-primary bg-warm-primary/10'
        : 'border-warm-border-soft bg-white hover:bg-warm-surface'
    }`}
  >
    <div className="flex items-center justify-between">
      <span className={`text-sm font-medium ${isSelected ? 'text-warm-primary' : 'text-warm-text-primary'}`}>
        {student.name}
      </span>
      <span className="text-xs text-warm-text-muted">
        {student.grade} · {student.class}
      </span>
    </div>
  </button>
);

const TabLink: React.FC<{
  href: string;
  active: boolean;
  children: React.ReactNode;
}> = ({ href, active, children }) => (
  <Link
    href={href}
    className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
      active
        ? 'border-warm-primary bg-warm-primary/10 font-medium text-warm-text-primary'
        : 'border-transparent bg-white/60 text-warm-text-secondary hover:border-warm-border-soft'
    }`}
  >
    {children}
  </Link>
);

// ============================================================================
// Main Page Component
// ============================================================================

function PrescriptionContent() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get('studentId');

  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('전체');
  const [classFilter, setClassFilter] = useState('전체');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(
    studentId ? mockStudents.find((s) => s.id === studentId) || null : null
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Filter students
  const filteredStudents = mockStudents.filter((student) => {
    const matchesSearch = student.name.includes(searchQuery);
    const matchesGrade = gradeFilter === '전체' || student.grade === gradeFilter;
    const matchesClass = classFilter === '전체' || student.class === classFilter;
    return matchesSearch && matchesGrade && matchesClass;
  });

  const totalPages = Math.ceil(filteredStudents.length / 8);
  const displayedStudents = filteredStudents.slice((currentPage - 1) * 8, currentPage * 8);

  const handleReset = () => {
    setSearchQuery('');
    setGradeFilter('전체');
    setClassFilter('전체');
    setSelectedStudent(null);
  };

  return (
    <section className="flex h-full w-full overflow-hidden bg-warm-surface">
      <div className="flex h-full w-full min-w-0 gap-4 p-4 font-pretendard text-sm">
        {/* Left Sidebar - Student Selection */}
        <div className={`flex flex-shrink-0 flex-col gap-3 transition-all ${sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-72'}`}>
          <h1 className="px-1 text-xl font-semibold text-warm-text-primary">처방하기</h1>

          <div className="flex flex-1 flex-col rounded-2xl border border-warm-border-soft bg-white/95 p-4 shadow-sm">
            {/* Header */}
            <div className="flex flex-shrink-0 items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-warm-text-primary">학생 선택</h2>
                <p className="text-xs text-warm-text-secondary">전체 {mockStudents.length}명</p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="rounded-md px-3 py-1.5 text-xs text-warm-text-secondary hover:bg-warm-surface hover:text-warm-text-primary"
              >
                초기화
              </button>
            </div>

            {/* Search & Filters */}
            <div className="mt-4 flex-shrink-0 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="학생 검색"
                  className="h-9 w-full rounded-full bg-warm-surface-strong pl-9 pr-3 text-xs placeholder:text-warm-text-muted focus:outline-none focus:ring-1 focus:ring-warm-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FilterSelect value={gradeFilter} options={grades} onChange={setGradeFilter} />
                <FilterSelect
                  value={classFilter}
                  options={classes}
                  onChange={setClassFilter}
                  disabled={gradeFilter === '전체'}
                />
              </div>
            </div>

            {/* Student Count */}
            <div className="mt-4 flex-shrink-0">
              <div className="flex items-center justify-between rounded-xl bg-warm-surface px-3 py-2 text-xs text-warm-text-secondary">
                <span>학생 목록</span>
                <span>{filteredStudents.length}명 / {mockStudents.length}명</span>
              </div>
            </div>

            {/* Student List */}
            <div className="mt-2 flex-1 space-y-2 overflow-auto">
              {displayedStudents.length > 0 ? (
                displayedStudents.map((student) => (
                  <StudentCard
                    key={student.id}
                    student={student}
                    isSelected={selectedStudent?.id === student.id}
                    onClick={() => setSelectedStudent(student)}
                  />
                ))
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-warm-text-muted">
                  표시할 학생이 없습니다.
                </div>
              )}
            </div>

            {/* Pagination */}
            <div className="mt-3 flex flex-shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-warm-text-secondary">
              <div>{filteredStudents.length === 0 ? '표시할 학생이 없습니다.' : `${filteredStudents.length}명`}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className="rounded-md border border-warm-border-soft bg-white px-3 py-1 text-xs hover:bg-warm-surface disabled:cursor-not-allowed disabled:opacity-50"
                >
                  이전
                </button>
                <span className="text-[11px] text-warm-text-muted">
                  {currentPage} / {totalPages || 1}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="rounded-md border border-warm-border-soft bg-white px-3 py-1 text-xs hover:bg-warm-surface disabled:cursor-not-allowed disabled:opacity-50"
                >
                  다음
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {/* Tab Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex flex-wrap items-center gap-2">
              <TabLink href="/dashboard/prescription" active={true}>
                안내
              </TabLink>
              <TabLink href="/dashboard/prescription/calendar" active={false}>
                캘린더
              </TabLink>
              <TabLink href="/dashboard/prescription/heatmap" active={false}>
                히트맵
              </TabLink>
              <TabLink href="/dashboard/prescription/storage" active={false}>
                처방저장소
              </TabLink>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-end gap-2 whitespace-nowrap text-right">
                <span className="text-base font-semibold text-warm-text-primary">
                  {selectedStudent ? selectedStudent.name : '학생을 선택하세요'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-warm-border-soft bg-white text-warm-text-secondary hover:bg-warm-surface"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-full flex-col gap-6 rounded-2xl border border-warm-border-soft bg-white/95 p-8 text-sm text-warm-text-secondary shadow-sm">
              <div>
                <h2 className="text-2xl font-semibold text-warm-text-primary">처방하기</h2>
                <p className="mt-2 text-base">
                  왼쪽에서 학생을 선택한 뒤 상단 메뉴를 눌러 히트맵 · 캘린더 · 계통도 · 시험지 리스트 기능을 차례로 열어보세요.
                </p>
              </div>

              <div className="rounded-xl bg-warm-surface px-6 py-4">
                {selectedStudent ? (
                  <p>
                    <strong>{selectedStudent.name}</strong> 학생이 선택되었습니다. 상단 탭에서 원하는 기능을 선택하세요.
                  </p>
                ) : (
                  <p>아직 학생이 선택되지 않았습니다. 왼쪽 목록에서 학생을 선택해 주세요.</p>
                )}
              </div>

              <div className="grid gap-3 text-sm text-warm-text-muted">
                <p>각 메뉴는 다음 흐름으로 구성되어 있습니다.</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>
                    <strong>캘린더</strong> — 기간별 풀이 시험지를 선택해 처방 문제지를 만듭니다.
                  </li>
                  <li>
                    <strong>히트맵</strong> — 과목별 유형 숙련도를 확인하고 처방 후보를 선택합니다.
                  </li>
                  <li>
                    <strong>처방저장소</strong> — 누적 시험지를 확인하고 추가 처방을 수행합니다.
                  </li>
                </ol>
              </div>

              <div className="rounded-xl border border-warm-border-soft bg-warm-surface px-6 py-4 text-xs text-warm-text-muted">
                <p>
                  히트맵, 캘린더, 계통도, 시험지 리스트에서 작업한 처방 정보는 즉시 반영됩니다. 메뉴 이동 시에도 상단의
                  &quot;선택된 학생&quot; 정보가 유지되며, URL의 <code className="rounded bg-black/10 px-1 py-0.5">studentId</code>{' '}
                  쿼리 파라미터로 동일한 학생을 공유합니다.
                </p>
                <p className="mt-2">
                  바로 시작하려면{' '}
                  <Link href="/dashboard/prescription/heatmap" className="text-warm-primary underline">
                    히트맵 메뉴
                  </Link>
                  를 눌러주세요.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function PrescriptionPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center">로딩 중...</div>}>
      <PrescriptionContent />
    </Suspense>
  );
}
