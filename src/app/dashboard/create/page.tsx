'use client';

import React, { useState } from 'react';
import {
  FileText,
  Pencil,
  PlusCircle,
  RotateCcw,
  Download,
  GripVertical,
  AlertCircle,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface Subject {
  id: string;
  name: string;
  chapters: Chapter[];
}

interface Chapter {
  id: string;
  name: string;
  problemCount: number;
}

type QuestionTypeFilter = '전체' | '교과서' | '문제집' | '기출' | '모의고사';
type DifficultyLevel = '최상' | '상' | '중' | '하' | '최하';

// ============================================================================
// Mock Data
// ============================================================================

const subjects: Subject[] = [
  {
    id: '1',
    name: '수학 (상)',
    chapters: [
      { id: '1-1', name: '다항식의 연산', problemCount: 45 },
      { id: '1-2', name: '나머지정리와 인수분해', problemCount: 38 },
      { id: '1-3', name: '복소수', problemCount: 52 },
    ],
  },
  {
    id: '2',
    name: '수학 (하)',
    chapters: [
      { id: '2-1', name: '집합과 명제', problemCount: 41 },
      { id: '2-2', name: '함수', problemCount: 36 },
    ],
  },
];

const difficultyColors: Record<DifficultyLevel, string> = {
  '최상': 'rgba(219, 40, 183, 0.2)',
  '상': 'rgba(119, 0, 210, 0.2)',
  '중': 'rgba(71, 162, 255, 0.2)',
  '하': 'rgba(0, 199, 159, 0.2)',
  '최하': 'rgba(74, 230, 100, 0.2)',
};

// ============================================================================
// Components
// ============================================================================

const StepBadge: React.FC<{ number: number }> = ({ number }) => (
  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-warm-surface-strong text-xs font-semibold text-warm-text-muted">
    {number}
  </span>
);

const FilterChip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
      active
        ? 'border-sky-500 bg-sky-500 text-white'
        : 'border-warm-border-soft bg-white/95 text-warm-text-muted hover:bg-warm-surface'
    }`}
  >
    {label}
  </button>
);

const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}> = ({ icon, label, disabled = false, onClick }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`flex items-center gap-2 rounded-full border border-warm-border-soft bg-warm-surface px-3 py-1.5 text-sm font-semibold text-warm-text-secondary transition-colors ${
      disabled
        ? 'cursor-not-allowed opacity-50'
        : 'hover:bg-warm-surface-strong'
    }`}
  >
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-warm-surface-strong text-warm-text-secondary">
      {icon}
    </span>
    <span className="whitespace-nowrap">{label}</span>
  </button>
);

const DifficultyInput: React.FC<{
  level: DifficultyLevel;
  value: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}> = ({ level, value, max, onChange, disabled = false }) => (
  <div className="relative min-w-[64px] max-w-[64px]">
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Math.max(0, Math.min(max, parseInt(e.target.value) || 0)))}
      disabled={disabled}
      className="h-16 w-full rounded-md border border-warm-border-soft bg-white px-2 pb-7 pt-8 text-center text-xl font-semibold text-warm-text-primary focus:outline-none focus:ring-1 focus:ring-warm-primary disabled:cursor-not-allowed disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
    <div className="absolute left-0 right-0 top-0">
      <div
        className="rounded px-1 py-0.5 text-center text-sm font-medium"
        style={{ backgroundColor: difficultyColors[level] }}
      >
        {level}
      </div>
    </div>
    <div className="absolute bottom-1 right-2 text-xs text-warm-text-muted">{max}</div>
  </div>
);

const EmptyState: React.FC<{ message: string; subMessage?: string }> = ({ message, subMessage }) => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-3xl bg-white/85 px-6 py-8 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warm-surface-strong text-warm-text-secondary">
      <AlertCircle className="h-6 w-6" />
    </span>
    <p className="text-sm font-semibold text-warm-text-primary">{message}</p>
    {subMessage && <p className="text-xs text-warm-text-muted">{subMessage}</p>}
  </div>
);

// ============================================================================
// Main Page Component
// ============================================================================

export default function PaperCreatePage() {
  // State
  const [paperName, setPaperName] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [questionTypeFilter, setQuestionTypeFilter] = useState<QuestionTypeFilter>('전체');
  const [difficulties, setDifficulties] = useState<Record<DifficultyLevel, number>>({
    '최상': 0,
    '상': 0,
    '중': 0,
    '하': 0,
    '최하': 0,
  });

  // Computed values
  const totalQuestions = Object.values(difficulties).reduce((sum, val) => sum + val, 0);
  const hasSelection = selectedSubject && selectedChapters.length > 0;

  // Handlers
  const handleReset = () => {
    setPaperName('');
    setSelectedSubject(null);
    setSelectedChapters([]);
    setQuestionTypeFilter('전체');
    setDifficulties({ '최상': 0, '상': 0, '중': 0, '하': 0, '최하': 0 });
  };

  const handleChapterToggle = (chapterId: string) => {
    setSelectedChapters((prev) =>
      prev.includes(chapterId)
        ? prev.filter((id) => id !== chapterId)
        : [...prev, chapterId]
    );
  };

  const selectedSubjectData = subjects.find((s) => s.id === selectedSubject);

  return (
    <section className="flex h-full flex-col overflow-hidden bg-warm-surface">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-6 py-3">
        <h1 className="text-lg font-semibold text-warm-text-primary">시험지 출제</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 rounded-full border border-warm-border-soft bg-white/90 px-4 py-2 text-sm font-medium text-warm-text-primary transition-all hover:-translate-y-[1px] hover:bg-warm-surface-strong"
          >
            <RotateCcw className="h-4 w-4" />
            <span>초기화</span>
          </button>
          <button
            type="button"
            disabled={totalQuestions === 0}
            className="flex items-center gap-2 rounded-full border border-transparent bg-gradient-to-r from-warm-primary/20 via-warm-primary/10 to-warm-surface-strong px-4 py-2 text-sm font-medium text-warm-text-primary transition-all hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span>시험지 저장</span>
          </button>
        </div>
      </div>

      {/* Main Content - Split Panel */}
      <div className="flex flex-1 gap-2 overflow-hidden px-4 pb-4">
        {/* Left Panel */}
        <div className="flex w-[42%] flex-col gap-3 overflow-hidden">
          {/* Top Row: Range + Question Count */}
          <div className="flex gap-3">
            {/* Range & Paper Name */}
            <div className="flex-1 rounded-xl border border-warm-border-soft bg-white/90 p-3">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-warm-text-muted">
                    범위
                  </span>
                  <div className="flex items-center justify-center rounded-lg bg-white px-4 py-2 text-center text-sm">
                    {hasSelection ? (
                      <span className="font-semibold text-warm-text-primary">
                        {selectedSubjectData?.name} ({selectedChapters.length}개 단원)
                      </span>
                    ) : (
                      <span className="text-warm-text-muted">아래에서 과목 및 단원을 선택해 주세요.</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-warm-text-muted">
                    시험지명
                  </span>
                  <input
                    type="text"
                    value={paperName}
                    onChange={(e) => setPaperName(e.target.value)}
                    placeholder="시험지 이름 입력"
                    className="w-full rounded-full border border-warm-border-soft bg-white px-4 py-2 text-sm text-warm-text-primary placeholder:text-warm-text-muted focus:outline-none focus:ring-1 focus:ring-warm-primary"
                  />
                </div>
              </div>
            </div>

            {/* Question Count */}
            <div className="flex-1 rounded-xl border border-warm-border-soft bg-white/90 p-3">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-warm-text-muted">
                  <span>총 문항수</span>
                  <span className="text-lg text-warm-text-primary">{totalQuestions}</span>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  <ActionButton
                    icon={<Pencil className="h-4 w-4" />}
                    label="자동출제"
                    disabled={!hasSelection}
                  />
                  <ActionButton
                    icon={<Pencil className="h-4 w-4" />}
                    label="수동출제"
                    disabled={!hasSelection}
                  />
                  <ActionButton
                    icon={<PlusCircle className="h-4 w-4" />}
                    label="문제추가"
                    disabled={!hasSelection}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Question Type Filter */}
          <div className="flex-shrink-0 rounded-2xl border border-warm-border-soft bg-white/90 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-warm-text-muted">
                출제 유형
              </span>
              <div className="flex flex-wrap gap-2">
                {(['전체', '교과서', '문제집', '기출', '모의고사'] as QuestionTypeFilter[]).map((type) => (
                  <FilterChip
                    key={type}
                    label={type === '전체' ? type : `${type} 유형`}
                    active={questionTypeFilter === type}
                    onClick={() => setQuestionTypeFilter(type)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Subject & Chapter Selection */}
          <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
            {/* Subject Selection */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-warm-border-soft bg-white/90">
              <div className="flex items-center gap-3 bg-white/95 px-4 py-2">
                <StepBadge number={1} />
                <span className="text-sm font-semibold text-warm-text-primary">과목을 선택해 주세요</span>
              </div>
              <div className="flex-1 overflow-auto p-2">
                <div className="space-y-1">
                  {subjects.map((subject) => (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => {
                        setSelectedSubject(subject.id);
                        setSelectedChapters([]);
                      }}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        selectedSubject === subject.id
                          ? 'bg-warm-primary/10 font-medium text-warm-primary'
                          : 'text-warm-text-secondary hover:bg-warm-surface'
                      }`}
                    >
                      {subject.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Chapter Selection */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-warm-border-soft bg-white/90">
              <div className="flex items-center gap-3 bg-white/95 px-4 py-2">
                <StepBadge number={2} />
                <span className="text-sm font-semibold text-warm-text-primary">단원을 선택해 주세요</span>
              </div>
              <div className="flex-1 overflow-auto p-2">
                {selectedSubjectData ? (
                  <div className="space-y-1">
                    {selectedSubjectData.chapters.map((chapter) => (
                      <button
                        key={chapter.id}
                        type="button"
                        onClick={() => handleChapterToggle(chapter.id)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          selectedChapters.includes(chapter.id)
                            ? 'bg-warm-primary/10 font-medium text-warm-primary'
                            : 'text-warm-text-secondary hover:bg-warm-surface'
                        }`}
                      >
                        <span>{chapter.name}</span>
                        <span className="text-xs text-warm-text-muted">{chapter.problemCount}문제</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center p-4">
                    <p className="text-sm text-warm-text-muted">먼저 과목을 선택해 주세요.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Difficulty Selection */}
          {hasSelection && (
            <div className="flex-shrink-0 rounded-2xl border border-warm-border-soft bg-white/90 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StepBadge number={3} />
                  <span className="text-sm font-semibold text-warm-text-primary">문항수를 선택해 주세요</span>
                  <span className="text-xs text-warm-text-muted">(최대 50문항)</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {(['최상', '상', '중', '하', '최하'] as DifficultyLevel[]).map((level) => (
                  <DifficultyInput
                    key={level}
                    level={level}
                    value={difficulties[level]}
                    max={50 - (totalQuestions - difficulties[level])}
                    onChange={(val) => setDifficulties((prev) => ({ ...prev, [level]: val }))}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Resize Handle */}
        <div className="flex w-2 items-center justify-center">
          <div className="flex h-8 w-3 items-center justify-center rounded-sm border border-warm-border-soft bg-warm-surface">
            <GripVertical className="h-3 w-3 text-warm-text-muted" />
          </div>
        </div>

        {/* Right Panel - Paper Preview */}
        <div className="flex flex-1 overflow-hidden rounded-3xl border border-warm-border bg-white/85">
          {totalQuestions > 0 ? (
            <div className="flex h-full w-full flex-col p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-warm-text-primary">
                  {paperName || '새 시험지'}
                </h2>
                <span className="text-sm text-warm-text-muted">{totalQuestions}문제</span>
              </div>
              <div className="flex-1 rounded-xl border border-dashed border-warm-border-soft bg-warm-surface/50 p-4">
                <p className="text-center text-sm text-warm-text-muted">
                  문제가 출제되면 여기에 표시됩니다.
                </p>
              </div>
            </div>
          ) : (
            <EmptyState message="문제를 출제하면 시험지를 볼 수 있습니다." />
          )}
        </div>
      </div>
    </section>
  );
}
