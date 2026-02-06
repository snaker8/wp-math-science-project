'use client';

import React, { useState } from 'react';
import {
  Plus,
  ClipboardList,
  GripVertical,
  Smile,
  ChevronDown,
  PanelLeftClose,
  MoreVertical,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface PaperGroup {
  id: string;
  name: string;
  paperCount: number;
  children?: PaperGroup[];
}

interface Paper {
  id: string;
  name: string;
  problemCount: number;
}

// ============================================================================
// Mock Data
// ============================================================================

const mockPaperGroups: PaperGroup[] = [];

const mockPapers: Paper[] = [
  { id: '1', name: '중간고사 모의고사 1회', problemCount: 25 },
  { id: '2', name: '중간고사 모의고사 2회', problemCount: 30 },
  { id: '3', name: '기말고사 대비 문제집', problemCount: 40 },
];

// ============================================================================
// Sub Components
// ============================================================================

const Badge: React.FC<{ children: React.ReactNode; variant?: 'default' | 'primary' }> = ({
  children,
  variant = 'default',
}) => (
  <span
    className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold ${
      variant === 'primary'
        ? 'border-warm-border-soft bg-white/90 text-warm-text-secondary'
        : 'border-warm-border-soft bg-warm-surface px-3 py-1 text-warm-text-muted'
    }`}
  >
    {children}
  </span>
);

const Select: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}> = ({ value, onChange, options, placeholder }) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full appearance-none rounded-md border border-warm-border-soft bg-white px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-warm-border-accent"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-text-muted opacity-50" />
  </div>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex flex-1 items-center justify-center">
    <div className="w-40 h-40 flex justify-center items-center flex-col">
      <Smile className="h-12 w-12 text-warm-primary" />
      <p className="p-5 whitespace-nowrap text-warm-text-muted">{message}</p>
    </div>
  </div>
);

const ResizeHandle: React.FC = () => (
  <div className="relative flex w-px items-center justify-center bg-warm-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 cursor-col-resize hover:bg-warm-border-accent transition-colors">
    <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-warm-border">
      <GripVertical className="h-2.5 w-2.5 text-warm-text-muted" />
    </div>
  </div>
);

// ============================================================================
// Main Page Component
// ============================================================================

export default function PapersPage() {
  const [subject, setSubject] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<PaperGroup | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);

  return (
    <div className="p-0 w-full bg-warm-surface h-full px-4 py-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="w-full flex items-center justify-between gap-x-4 pb-1 flex-shrink-0">
        <div className="flex items-center gap-3 flex-shrink-0">
          <h1 className="text-lg font-semibold text-warm-text-primary pl-2">시험지 관리</h1>
          <div className="w-[160px] h-8 text-sm ml-4 flex items-center space-x-2">
            <div className="text-sm whitespace-nowrap text-warm-text-muted">과목</div>
            <Select
              value={subject}
              onChange={setSubject}
              options={[
                { value: 'math', label: '수학' },
                { value: 'math1', label: '수학1' },
                { value: 'math2', label: '수학2' },
              ]}
              placeholder="선택"
            />
          </div>
        </div>
        <div className="flex flex-1 min-w-0 items-center justify-end gap-2">
          <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-all">
            <PanelLeftClose className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content - 3 Panel Layout */}
      <div className="flex-1 min-h-0 w-full pb-2 font-pretendard text-sm overflow-auto">
        <section className="h-full w-full overflow-hidden">
          <div className="flex h-full gap-3">
            {/* Left Panel - 시험지 그룹 */}
            <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden pr-1" style={{ width: '22%' }}>
              {/* Group Header */}
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-warm-border-soft bg-white/95 px-5 py-3 flex-shrink-0">
                <Badge>시험지 그룹 {mockPaperGroups.length}개</Badge>
                <button className="group flex items-center gap-2 rounded-full border border-warm-border-soft bg-warm-surface px-4 py-2 text-sm font-semibold text-warm-text-muted transition-all hover:-translate-y-0.5 hover:border-warm-border-accent hover:bg-warm-surface-strong">
                  <span className="flex size-6 items-center justify-center rounded-full border border-warm-border-soft bg-white text-warm-text-muted transition-all group-hover:border-warm-border-accent">
                    <Plus className="size-4" />
                  </span>
                  <span className="leading-none">최상위 그룹 추가</span>
                </button>
              </div>

              {/* Group List */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-warm-border-soft bg-white/95 p-2">
                <div className="flex-1 overflow-y-auto">
                  {mockPaperGroups.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {mockPaperGroups.map((group) => (
                        <div
                          key={group.id}
                          onClick={() => setSelectedGroup(group)}
                          className={`cursor-pointer rounded-xl px-4 py-3 transition-colors ${
                            selectedGroup?.id === group.id
                              ? 'bg-warm-primary/10 border-l-2 border-warm-primary'
                              : 'hover:bg-warm-surface'
                          }`}
                        >
                          <span className="text-sm font-medium text-warm-text-primary">
                            {group.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="데이터가 없습니다." />
                  )}
                </div>
              </div>
            </div>

            <ResizeHandle />

            {/* Middle + Right Panel Container */}
            <div className="flex flex-1 h-full gap-3">
              {/* Middle Panel - 시험지 목록 */}
              <div className="flex h-full flex-col gap-3 overflow-hidden px-1" style={{ width: '25%' }}>
                {/* Paper List Header */}
                <div className="flex-shrink-0 rounded-2xl border border-warm-border-soft bg-white/95">
                  <div className="flex items-center justify-between gap-4 rounded-2xl bg-white px-5 py-3">
                    <div className="flex items-center gap-3 text-sm font-semibold text-warm-text-primary">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-warm-primary shadow-sm">
                        <ClipboardList className="h-4 w-4" />
                      </span>
                      <span className="truncate">
                        {selectedGroup?.name || '시험지 그룹을 선택해주세요.'}
                      </span>
                    </div>
                    <Badge variant="primary">{selectedGroup ? mockPapers.length : 0}개</Badge>
                  </div>
                </div>

                {/* Paper Table */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-warm-border-soft bg-white/95">
                  <div className="flex-1 min-h-0 p-2 overflow-auto">
                    <div className="overflow-auto rounded-xl border border-warm-border-soft bg-white/95">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-warm-border-soft bg-warm-surface text-[11px] uppercase tracking-[0.16em] text-warm-text-muted">
                            <th className="px-4 py-2 text-left font-semibold">시험지명</th>
                            <th className="px-4 py-2 text-center font-semibold">문항수</th>
                            <th className="px-2 py-2 text-right font-semibold">메뉴</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedGroup ? (
                            mockPapers.map((paper) => (
                              <tr
                                key={paper.id}
                                onClick={() => setSelectedPaper(paper)}
                                className={`cursor-pointer border-b border-warm-border-soft transition-colors ${
                                  selectedPaper?.id === paper.id
                                    ? 'bg-warm-primary/5'
                                    : 'hover:bg-warm-surface'
                                }`}
                              >
                                <td className="px-4 py-3 text-left text-warm-text-primary">
                                  {paper.name}
                                </td>
                                <td className="px-4 py-3 text-center text-warm-text-muted">
                                  {paper.problemCount}
                                </td>
                                <td className="px-2 py-3 text-right">
                                  <button className="p-1 rounded hover:bg-warm-surface">
                                    <MoreVertical className="h-4 w-4 text-warm-text-muted" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              <ResizeHandle />

              {/* Right Panel - 시험지 미리보기 */}
              <div className="flex-1 h-full overflow-hidden rounded-2xl border border-warm-border-soft bg-white/95">
                {selectedPaper ? (
                  <div className="h-full flex flex-col">
                    <div className="border-b border-warm-border-soft px-6 py-4">
                      <h2 className="text-lg font-semibold text-warm-text-primary">
                        {selectedPaper.name}
                      </h2>
                      <p className="text-sm text-warm-text-muted">
                        총 {selectedPaper.problemCount}문항
                      </p>
                    </div>
                    <div className="flex-1 p-6 overflow-auto">
                      <div className="space-y-4">
                        {Array.from({ length: selectedPaper.problemCount }).slice(0, 5).map((_, idx) => (
                          <div
                            key={idx}
                            className="rounded-xl border border-warm-border-soft bg-warm-surface p-4"
                          >
                            <div className="flex items-start gap-3">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-warm-text-secondary shadow-sm">
                                {idx + 1}
                              </span>
                              <div className="flex-1">
                                <p className="text-sm text-warm-text-primary">
                                  문제 {idx + 1}번 내용이 여기에 표시됩니다.
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                        {selectedPaper.problemCount > 5 && (
                          <p className="text-center text-sm text-warm-text-muted">
                            ... 외 {selectedPaper.problemCount - 5}문항
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-warm-text-secondary">
                    <span>선택된 시험지가 없습니다.</span>
                    <span className="text-xs text-warm-text-muted">왼쪽 목록에서 시험지를 선택해 주세요.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
