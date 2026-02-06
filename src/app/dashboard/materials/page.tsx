'use client';

import React, { useState } from 'react';
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Plus,
  PanelLeftClose,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface FolderGroup {
  id: string;
  name: string;
  grade: string;
}

interface AcademyMaterial {
  id: string;
  name: string;
  paperCount: number;
  createdAt: string;
  type: 'suzag' | 'academy';
}

interface ExamPaper {
  id: string;
  name: string;
  problemCount: number;
  type: 'suzag' | 'academy';
}

// ============================================================================
// Mock Data
// ============================================================================

const mockFolderGroups: FolderGroup[] = [];

const mockAcademyMaterials: AcademyMaterial[] = [
  { id: '1', name: '중간고사 대비 세트', paperCount: 5, createdAt: '2025-02-01', type: 'academy' },
  { id: '2', name: '기말고사 대비 세트', paperCount: 8, createdAt: '2025-01-28', type: 'academy' },
  { id: '3', name: '수능특강 연습문제', paperCount: 12, createdAt: '2025-01-25', type: 'suzag' },
];

const mockExamPapers: ExamPaper[] = [
  { id: '1', name: '다항식 연산 기초', problemCount: 20, type: 'suzag' },
  { id: '2', name: '인수분해 심화', problemCount: 25, type: 'academy' },
  { id: '3', name: '복소수와 이차방정식', problemCount: 30, type: 'suzag' },
];

// ============================================================================
// Sub Components
// ============================================================================

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-3xl bg-white/85 px-6 py-8 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warm-surface-strong text-warm-text-secondary">
      <AlertCircle className="h-6 w-6" />
    </span>
    <p className="text-sm font-semibold text-warm-text-primary">{message}</p>
  </div>
);

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
      className="h-11 w-full appearance-none rounded-full border border-warm-border-soft bg-white/95 px-4 pr-10 text-sm font-medium text-warm-text-primary focus:outline-none focus:ring-2 focus:ring-warm-border-accent"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-text-muted" />
  </div>
);

const Badge: React.FC<{ children: React.ReactNode; variant: 'blue' | 'amber' }> = ({ children, variant }) => (
  <span
    className={`rounded-full px-3 py-1 text-xs font-semibold ${variant === 'blue'
        ? 'bg-[#E6EEF9] text-warm-text-muted'
        : 'bg-[#F7C16B] text-warm-text-primary'
      }`}
  >
    {children}
  </span>
);

// ============================================================================
// Main Page Component
// ============================================================================

export default function MaterialsPage() {
  const [grade, setGrade] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<FolderGroup | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<AcademyMaterial | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Filter materials by search query
  const filteredMaterials = mockAcademyMaterials.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const hasSelectedItems = selectedMaterial !== null;

  return (
    <div className="px-6 py-2">
      <div className="flex h-[calc(100vh-120px)] flex-col gap-2 m-0 p-0 font-pretendard">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          <div className="flex flex-col gap-1 pl-2">
            <h1 className="text-xl font-semibold text-warm-text-primary">학원 자료</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={!hasSelectedItems}
              className={`
                inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all
                ${hasSelectedItems
                  ? 'bg-gradient-to-r from-warm-surface-strong via-warm-surface to-warm-surface-strong text-warm-text-primary hover:-translate-y-[1px]'
                  : 'bg-gradient-to-r from-warm-surface-strong via-warm-surface to-warm-surface-strong text-warm-text-primary opacity-50 cursor-not-allowed pointer-events-none'
                }
              `}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-warm-surface text-warm-text-secondary">
                <Plus className="h-3.5 w-3.5" />
              </span>
              <span className="whitespace-nowrap">강좌에 추가</span>
            </button>
            <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-all">
              <PanelLeftClose className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <main className="grid h-full grid-cols-12 gap-6">
            {/* Left Column */}
            <section className="col-span-12 lg:col-span-4 flex h-full flex-col gap-4 min-h-0">
              {/* 과사람 제공 자료 */}
              <div className="flex flex-col overflow-hidden rounded-2xl border border-warm-border-soft bg-white/90 flex-shrink-0">
                <div className="border-b border-warm-border-soft px-5 py-3 flex-shrink-0 flex justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-warm-text-primary">과사람 제공 자료</h2>
                    <p className="text-xs text-warm-text-muted">제공 폴더를 선택하여 시험지를 확인하세요.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-warm-text-muted">학년</label>
                    <Select
                      value={grade}
                      onChange={setGrade}
                      options={[
                        { value: 'high1', label: '고1' },
                        { value: 'high2', label: '고2' },
                        { value: 'high3', label: '고3' },
                      ]}
                      placeholder="학년 선택"
                      width="140px"
                    />
                  </div>
                </div>
                <div className="px-4 py-3">
                  {mockFolderGroups.length > 0 ? (
                    <div className="space-y-2">
                      {mockFolderGroups.map((folder) => (
                        <div
                          key={folder.id}
                          onClick={() => setSelectedFolder(folder)}
                          className={`
                            cursor-pointer rounded-lg px-4 py-3 transition-colors
                            ${selectedFolder?.id === folder.id
                              ? 'bg-blue-50 border-l-2 border-blue-500'
                              : 'hover:bg-warm-surface'
                            }
                          `}
                        >
                          <span className="text-sm text-warm-text-primary">{folder.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-sm p-4">제공하는 폴더 그룹이 없습니다.</div>
                  )}
                </div>
              </div>

              {/* 학원자료 목록 */}
              <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-warm-border-soft bg-white/90 min-h-0">
                <div className="border-b border-warm-border-soft px-5 py-3 flex-shrink-0 flex justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-warm-text-primary">학원자료 목록</h2>
                    <p className="text-xs text-warm-text-muted">학원자료를 선택해 시험지를 확인하세요.</p>
                  </div>
                  <div className="flex items-center gap-3 min-w-[220px]">
                    <div className="relative w-full">
                      <input
                        type="text"
                        placeholder="학원자료 검색"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-9 w-full rounded-md border border-warm-border-soft bg-transparent px-3 pr-10 text-sm placeholder:text-warm-text-muted focus:outline-none focus:ring-1 focus:ring-warm-border-accent"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center px-3">
                        <Search className="h-4 w-4 text-warm-text-muted" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* List */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <ul role="list" className="max-h-full overflow-y-auto">
                    {filteredMaterials.map((material) => (
                      <li
                        key={material.id}
                        onClick={() => setSelectedMaterial(material)}
                        className={`
                          cursor-pointer border-b border-warm-border-soft px-5 py-3 transition-colors
                          ${selectedMaterial?.id === material.id
                            ? 'bg-blue-50 border-l-2 border-blue-500'
                            : 'hover:bg-warm-surface'
                          }
                        `}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-warm-text-primary">
                              {material.name}
                            </span>
                            {material.type === 'suzag' && (
                              <Badge variant="blue">과사람</Badge>
                            )}
                          </div>
                          <span className="text-xs text-warm-text-muted">
                            {material.paperCount}장
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-warm-text-muted">{material.createdAt}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Pagination */}
                <div className="flex p-2 justify-between items-center border-t border-warm-border-soft px-4 py-3">
                  <p className="text-sm text-gray-600">총 {filteredMaterials.length}</p>
                  <div className="flex justify-center items-center">
                    <nav role="navigation" aria-label="pagination" className="mx-auto flex w-full justify-center">
                      <ul className="flex flex-row items-center gap-1">
                        <li>
                          <button
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none"
                          >
                            <ChevronLeft className="h-4 w-4" />
                            <span>Previous</span>
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => setCurrentPage((p) => p + 1)}
                            className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-md hover:bg-gray-100"
                          >
                            <span>Next</span>
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </li>
                      </ul>
                    </nav>
                  </div>
                </div>
              </div>
            </section>

            {/* Right Column - 시험지 선택 */}
            <section className="col-span-12 lg:col-span-8 flex h-full flex-col min-h-0">
              <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-warm-border-soft bg-white/95 min-h-0">
                <div className="flex items-center justify-between border-b border-warm-border-soft px-6 py-4 flex-shrink-0">
                  <div>
                    <h2 className="text-lg font-semibold text-warm-text-primary">시험지 선택</h2>
                    <p className="text-xs text-warm-text-muted">
                      리스트에서 시험지를 선택한 후 우측 상단의 버튼으로 강좌에 추가하세요.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="blue">과사람 제공 자료</Badge>
                    <Badge variant="amber">학원 자료</Badge>
                  </div>
                </div>

                <div className="flex-1 overflow-auto min-h-0">
                  {selectedMaterial ? (
                    <div className="p-6">
                      <div className="space-y-3">
                        {mockExamPapers.map((paper) => (
                          <div
                            key={paper.id}
                            className="flex items-center justify-between rounded-xl border border-warm-border-soft bg-white p-4 hover:border-warm-border-accent transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <Badge variant={paper.type === 'suzag' ? 'blue' : 'amber'}>
                                {paper.type === 'suzag' ? '과사람' : '학원'}
                              </Badge>
                              <span className="text-sm font-medium text-warm-text-primary">
                                {paper.name}
                              </span>
                            </div>
                            <span className="text-sm text-warm-text-muted">
                              {paper.problemCount}문항
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <EmptyState message="좌측에서 강좌 또는 폴더를 선택해 시험지를 확인해 주세요." />
                  )}
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
