'use client';

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Pencil,
  PlusCircle,
  RotateCcw,
  Download,
  GripVertical,
  AlertCircle,
  Upload,
  Loader2,
  CheckCircle,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

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

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'processing' | 'done' | 'error';
  progress: number;
  error?: string;
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

const difficultyColors: Record<DifficultyLevel, { bg: string; text: string }> = {
  '최상': { bg: 'rgba(219, 40, 183, 0.25)', text: '#f472b6' },
  '상': { bg: 'rgba(139, 92, 246, 0.25)', text: '#a78bfa' },
  '중': { bg: 'rgba(59, 130, 246, 0.25)', text: '#60a5fa' },
  '하': { bg: 'rgba(34, 197, 94, 0.25)', text: '#4ade80' },
  '최하': { bg: 'rgba(74, 222, 128, 0.2)', text: '#86efac' },
};

// ============================================================================
// Components
// ============================================================================

const StepBadge: React.FC<{ number: number }> = ({ number }) => (
  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold text-zinc-300">
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
    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${active
      ? 'border-indigo-500 bg-indigo-500 text-white'
      : 'border-zinc-600 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'
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
  variant?: 'default' | 'primary';
}> = ({ icon, label, disabled = false, onClick, variant = 'default' }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-all ${disabled
      ? 'cursor-not-allowed opacity-40'
      : 'hover:-translate-y-[1px] active:scale-95'
      } ${variant === 'primary'
        ? 'border-indigo-500/50 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
        : 'border-zinc-600 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
      }`}
  >
    <span className={`flex h-5 w-5 items-center justify-center rounded-full ${variant === 'primary' ? 'bg-indigo-500/30' : 'bg-zinc-700'
      }`}>
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
      className="h-16 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-2 pb-6 pt-7 text-center text-xl font-bold text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
    <div className="absolute left-0 right-0 top-0">
      <div
        className="rounded-t-lg px-1 py-0.5 text-center text-xs font-bold"
        style={{
          backgroundColor: difficultyColors[level].bg,
          color: difficultyColors[level].text
        }}
      >
        {level}
      </div>
    </div>
    <div className="absolute bottom-1.5 right-2 text-[10px] text-zinc-500">max {max}</div>
  </div>
);

const EmptyState: React.FC<{ message: string; subMessage?: string }> = ({ message, subMessage }) => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 px-6 py-12 text-center">
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-zinc-500">
      <AlertCircle className="h-7 w-7" />
    </span>
    <p className="text-sm font-medium text-zinc-400">{message}</p>
    {subMessage && <p className="text-xs text-zinc-600">{subMessage}</p>}
  </div>
);

// ============================================================================
// Main Page Component
// ============================================================================

export default function PaperCreatePage() {
  const router = useRouter();

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

  // Real data state
  const [realProblemCounts, setRealProblemCounts] = useState<Record<string, number>>({});

  // Upload state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Computed values
  const totalQuestions = Object.values(difficulties).reduce((sum, val) => sum + val, 0);
  const hasSelection = selectedSubject && selectedChapters.length > 0;

  // Fetch real counts
  React.useEffect(() => {
    const fetchCounts = async () => {
      if (!supabaseBrowser) return;

      const { data, error } = await supabaseBrowser
        .from('problems')
        .select('unit');
      // .eq('is_active', true); // Removed: column does not exist

      if (data) {
        const counts: Record<string, number> = {};
        data.forEach(p => {
          const unit = p.unit || '미분류';
          counts[unit] = (counts[unit] || 0) + 1;
        });
        setRealProblemCounts(counts);
      }
    };
    fetchCounts();
  }, []);

  // Update subjects with real counts
  const subjectsWithRealCounts = subjects.map(s => ({
    ...s,
    chapters: s.chapters.map(c => ({
      ...c,
      problemCount: realProblemCounts[c.name] || 0
    }))
  }));

  const selectedSubjectData = subjectsWithRealCounts.find((s) => s.id === selectedSubject);

  // Handlers
  const handleReset = () => {
    setPaperName('');
    setSelectedSubject(null);
    setSelectedChapters([]);
    setQuestionTypeFilter('전체');
    setDifficulties({ '최상': 0, '상': 0, '중': 0, '하': 0, '최하': 0 });
    setUploadedFiles([]);
  };

  const handleChapterToggle = (chapterId: string) => {
    setSelectedChapters((prev) =>
      prev.includes(chapterId)
        ? prev.filter((id) => id !== chapterId)
        : [...prev, chapterId]
    );
  };

  const handleSaveExam = async () => {
    if (!paperName) {
      alert('시험지 이름을 입력해주세요.');
      return;
    }

    if (totalQuestions === 0) return;

    try {
      const response = await fetch('/api/exams/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: paperName,
          criteria: {
            subject: selectedSubjectData?.name,
            chapters: selectedChapters.map(id => {
              const ch = selectedSubjectData?.chapters.find(c => c.id === id);
              return ch?.name || '';
            }).filter(Boolean),
            difficulty_distribution: difficulties
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate');
      }

      alert('시험지가 생성되었습니다.');
      router.push('/dashboard/repository');
    } catch (e) {
      console.error(e);
      alert('시험지 생성 실패: ' + (e instanceof Error ? e.message : '알 수 없는 오류'));
    }
  };

  // File upload handlers
  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const uploadedFile: UploadedFile = {
        id: tempId,
        name: file.name,
        size: file.size,
        status: 'uploading',
        progress: 0,
      };

      setUploadedFiles(prev => [uploadedFile, ...prev]);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('instituteId', 'default');
        formData.append('userId', 'user');
        formData.append('autoClassify', 'true');
        formData.append('generateSolutions', 'true');

        const response = await fetch('/api/workflow/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Upload failed');
        }

        const data = await response.json();
        const jobId = data.jobId;

        setUploadedFiles(prev => prev.map(f =>
          f.id === tempId
            ? { ...f, id: jobId, status: 'processing', progress: 30 }
            : f
        ));

        const poll = async () => {
          try {
            const statusRes = await fetch(`/api/workflow/upload?jobId=${jobId}`);
            if (!statusRes.ok) return;

            const statusData = await statusRes.json();
            const job = statusData.job;

            setUploadedFiles(prev => prev.map(f => {
              if (f.id === jobId) {
                if (job.status === 'COMPLETED') {
                  const interval = pollingRefs.current.get(jobId);
                  if (interval) {
                    clearInterval(interval);
                    pollingRefs.current.delete(jobId);
                  }
                  return { ...f, status: 'done', progress: 100 };
                } else if (job.status === 'FAILED') {
                  const interval = pollingRefs.current.get(jobId);
                  if (interval) {
                    clearInterval(interval);
                    pollingRefs.current.delete(jobId);
                  }
                  return { ...f, status: 'error', progress: 0, error: job.error || '처리 실패' };
                }
                return { ...f, progress: job.progress || f.progress };
              }
              return f;
            }));
          } catch (err) {
            console.error('Polling error:', err);
          }
        };

        poll();
        const interval = setInterval(poll, 2000);
        pollingRefs.current.set(jobId, interval);

      } catch (error) {
        console.error('Upload error:', error);
        setUploadedFiles(prev => prev.map(f =>
          f.id === tempId
            ? { ...f, status: 'error', error: '업로드 실패' }
            : f
        ));
      }
    }
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleRemoveFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };


  return (
    <section className="flex h-[calc(100vh-6rem)] flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 pb-4">
        <h1 className="text-xl font-bold text-white">시험지 출제</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/80 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:-translate-y-[1px] hover:bg-zinc-700"
          >
            <RotateCcw className="h-4 w-4" />
            <span>초기화</span>
          </button>
          <button
            type="button"
            onClick={handleSaveExam}
            disabled={totalQuestions === 0}
            className="flex items-center gap-2 rounded-full border border-indigo-500/50 bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-[1px] hover:shadow-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            <Download className="h-4 w-4" />
            <span>시험지 저장</span>
          </button>
        </div>
      </div>

      {/* Main Content - Split Panel */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Left Panel */}
        <div className="flex w-[45%] flex-col gap-3 overflow-hidden">
          {/* Top Row: Range + Question Count */}
          <div className="flex gap-3">
            {/* Range & Paper Name */}
            <div className="flex-1 rounded-xl border border-zinc-700/50 bg-zinc-900/70 p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    범위
                  </span>
                  <div className="flex items-center justify-center rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-4 py-2.5 text-center text-sm">
                    {hasSelection ? (
                      <span className="font-medium text-white">
                        {selectedSubjectData?.name} <span className="text-indigo-400">({selectedChapters.length}개 단원)</span>
                      </span>
                    ) : (
                      <span className="text-zinc-500">아래에서 과목 및 단원을 선택해 주세요.</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    시험지명
                  </span>
                  <input
                    type="text"
                    value={paperName}
                    onChange={(e) => setPaperName(e.target.value)}
                    placeholder="시험지 이름 입력"
                    className="w-full rounded-lg border border-zinc-700/50 bg-zinc-800 px-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Question Count */}
            <div className="flex-1 rounded-xl border border-zinc-700/50 bg-zinc-900/70 p-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  <span>총 문항수</span>
                  <span className="text-2xl font-bold text-indigo-400">{totalQuestions}</span>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <ActionButton
                    icon={<Wand2 className="h-3.5 w-3.5" />}
                    label="자동출제"
                    disabled={!hasSelection}
                    variant="primary"
                  />
                  <ActionButton
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    label="수동출제"
                    disabled={!hasSelection}
                  />
                  <ActionButton
                    icon={<PlusCircle className="h-3.5 w-3.5" />}
                    label="문제추가"
                    disabled={!hasSelection}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Question Type Filter */}
          <div className="flex-shrink-0 rounded-xl border border-zinc-700/50 bg-zinc-900/70 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                출제 유형
              </span>
              <div className="flex flex-wrap gap-2">
                {(['전체', '교과서', '문제집', '기출', '모의고사'] as QuestionTypeFilter[]).map((type) => (
                  <FilterChip
                    key={type}
                    label={type}
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
            <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-900/70">
              <div className="flex items-center gap-3 border-b border-zinc-700/50 px-4 py-2.5">
                <StepBadge number={1} />
                <span className="text-sm font-semibold text-zinc-200">과목 선택</span>
              </div>
              <div className="flex-1 overflow-auto p-2">
                <div className="space-y-1">
                  {subjectsWithRealCounts.map((subject) => (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => {
                        setSelectedSubject(subject.id);
                        setSelectedChapters([]);
                      }}
                      className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-all ${selectedSubject === subject.id
                        ? 'bg-indigo-500/20 font-medium text-indigo-300 ring-1 ring-indigo-500/30'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                        }`}
                    >
                      {subject.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Chapter Selection */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-900/70">
              <div className="flex items-center gap-3 border-b border-zinc-700/50 px-4 py-2.5">
                <StepBadge number={2} />
                <span className="text-sm font-semibold text-zinc-200">단원 선택</span>
              </div>
              <div className="flex-1 overflow-auto p-2">
                {selectedSubjectData ? (
                  <div className="space-y-1">
                    {selectedSubjectData.chapters.map((chapter) => (
                      <button
                        key={chapter.id}
                        type="button"
                        onClick={() => handleChapterToggle(chapter.id)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-all ${selectedChapters.includes(chapter.id)
                          ? 'bg-indigo-500/20 font-medium text-indigo-300 ring-1 ring-indigo-500/30'
                          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                          }`}
                      >
                        <span>{chapter.name}</span>
                        <span className="text-xs text-zinc-600">{chapter.problemCount}문제</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center p-4">
                    <p className="text-sm text-zinc-600">먼저 과목을 선택해 주세요.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Difficulty Selection */}
          <AnimatePresence>
            {hasSelection && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex-shrink-0 rounded-xl border border-zinc-700/50 bg-zinc-900/70 px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StepBadge number={3} />
                    <span className="text-sm font-semibold text-zinc-200">문항수 선택</span>
                    <span className="text-xs text-zinc-600">(최대 50문항)</span>
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Resize Handle */}
        <div className="flex w-2 items-center justify-center">
          <div className="flex h-10 w-3 items-center justify-center rounded border border-zinc-700 bg-zinc-800">
            <GripVertical className="h-3.5 w-3.5 text-zinc-600" />
          </div>
        </div>

        {/* Right Panel - Upload & Preview */}
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          {/* Upload Zone */}
          <div
            className={`flex-shrink-0 cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${isDragging
              ? 'border-indigo-500 bg-indigo-500/10'
              : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900/70'
              }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.hwp,.hwpx"
              onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
              className="hidden"
            />
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20">
              <Upload className="h-6 w-6" />
            </div>
            <h3 className="mb-1 text-sm font-semibold text-zinc-200">
              파일을 드래그하거나 클릭하여 업로드
            </h3>
            <p className="text-xs text-zinc-500">PDF, 이미지, HWP 파일 지원</p>
          </div>

          {/* Uploaded Files List */}
          {uploadedFiles.length > 0 && (
            <div className="flex-shrink-0 rounded-xl border border-zinc-700/50 bg-zinc-900/70 p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                업로드된 파일 ({uploadedFiles.length})
              </h4>
              <div className="max-h-32 space-y-2 overflow-auto">
                <AnimatePresence>
                  {uploadedFiles.map((file) => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="flex items-center gap-3 rounded-lg bg-zinc-800/50 px-3 py-2"
                    >
                      <FileText className="h-4 w-4 flex-shrink-0 text-zinc-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-300">{file.name}</p>
                        {file.status !== 'done' && (
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-700">
                            <div
                              className="h-full rounded-full bg-indigo-500 transition-all"
                              style={{ width: `${file.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        {file.status === 'uploading' && (
                          <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                        )}
                        {file.status === 'processing' && (
                          <span className="text-xs text-amber-400">처리중...</span>
                        )}
                        {file.status === 'done' && (
                          <CheckCircle className="h-4 w-4 text-emerald-400" />
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFile(file.id);
                          }}
                          className="rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-700 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Paper Preview */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-700/50 bg-zinc-900/70">
            {totalQuestions > 0 ? (
              <div className="flex h-full flex-col p-4">
                <div className="mb-4 flex items-center justify-between border-b border-zinc-700/50 pb-3">
                  <h2 className="text-lg font-bold text-white">
                    {paperName || '새 시험지'}
                  </h2>
                  <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-sm font-semibold text-indigo-300">
                    {totalQuestions}문제
                  </span>
                </div>
                <div className="flex-1 overflow-auto rounded-xl border border-dashed border-zinc-700 bg-zinc-800/30 p-4">
                  <p className="text-center text-sm text-zinc-500">
                    문제가 출제되면 여기에 표시됩니다.
                  </p>
                </div>
              </div>
            ) : (
              <EmptyState message="문제를 출제하면 시험지를 볼 수 있습니다." />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
