'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
  ChevronRight,
  ChevronDown,
  Check,
  PanelLeftClose,
  PanelRightClose,
  Save,
  ArrowRight,
  BookOpen,
  Layers,
  Filter,
  Hash,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/client';

// ============================================================================
// Types
// ============================================================================

interface ProblemTypeNode {
  id: string;
  typeCode: string;
  subject: string;
  chapter: string;
  section: string | null;
  subsection: string | null;
  typeName: string;
  totalProblems: number;
}

interface SubjectTree {
  subject: string;
  chapters: ChapterNode[];
  totalProblems: number;
}

interface ChapterNode {
  chapter: string;
  sections: SectionNode[];
  totalProblems: number;
}

interface SectionNode {
  section: string;
  typeCode: string;
  totalProblems: number;
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'processing' | 'done' | 'error';
  progress: number;
  error?: string;
}

type CreateMode = 'auto' | 'manual' | 'add';
type QuestionTypeFilter = '전체' | '교과서' | '문제집' | '기출' | '모의고사';
type DifficultyLevel = '최상' | '상' | '중' | '하' | '최하';

// ============================================================================
// Mock Subject Data (Supabase 미연결 시)
// ============================================================================

const mockSubjectTree: SubjectTree[] = [
  {
    subject: '수학(상)',
    totalProblems: 135,
    chapters: [
      {
        chapter: '다항식',
        totalProblems: 83,
        sections: [
          { section: '다항식의 연산', typeCode: 'MA-HS1-ALG-01', totalProblems: 45 },
          { section: '나머지정리와 인수분해', typeCode: 'MA-HS1-ALG-02', totalProblems: 38 },
        ],
      },
      {
        chapter: '방정식과 부등식',
        totalProblems: 52,
        sections: [
          { section: '복소수', typeCode: 'MA-HS1-EQ-01', totalProblems: 28 },
          { section: '이차방정식', typeCode: 'MA-HS1-EQ-02', totalProblems: 24 },
        ],
      },
    ],
  },
  {
    subject: '수학(하)',
    totalProblems: 77,
    chapters: [
      {
        chapter: '집합과 명제',
        totalProblems: 41,
        sections: [
          { section: '집합', typeCode: 'MA-HS1-SET-01', totalProblems: 22 },
          { section: '명제', typeCode: 'MA-HS1-SET-02', totalProblems: 19 },
        ],
      },
      {
        chapter: '함수',
        totalProblems: 36,
        sections: [
          { section: '함수의 개념', typeCode: 'MA-HS1-FN-01', totalProblems: 20 },
          { section: '합성함수와 역함수', typeCode: 'MA-HS1-FN-02', totalProblems: 16 },
        ],
      },
    ],
  },
  {
    subject: '수학I',
    totalProblems: 124,
    chapters: [
      {
        chapter: '지수함수와 로그함수',
        totalProblems: 65,
        sections: [
          { section: '지수', typeCode: 'MA-M1-EXP-01', totalProblems: 32 },
          { section: '로그', typeCode: 'MA-M1-LOG-01', totalProblems: 33 },
        ],
      },
      {
        chapter: '삼각함수',
        totalProblems: 59,
        sections: [
          { section: '삼각함수의 뜻과 그래프', typeCode: 'MA-M1-TRG-01', totalProblems: 30 },
          { section: '삼각함수의 활용', typeCode: 'MA-M1-TRG-02', totalProblems: 29 },
        ],
      },
    ],
  },
  {
    subject: '수학II',
    totalProblems: 98,
    chapters: [
      {
        chapter: '함수의 극한과 연속',
        totalProblems: 48,
        sections: [
          { section: '함수의 극한', typeCode: 'MA-M2-LIM-01', totalProblems: 25 },
          { section: '함수의 연속', typeCode: 'MA-M2-LIM-02', totalProblems: 23 },
        ],
      },
      {
        chapter: '미분',
        totalProblems: 50,
        sections: [
          { section: '미분계수와 도함수', typeCode: 'MA-M2-DIF-01', totalProblems: 26 },
          { section: '도함수의 활용', typeCode: 'MA-M2-DIF-02', totalProblems: 24 },
        ],
      },
    ],
  },
  {
    subject: '미적분',
    totalProblems: 86,
    chapters: [
      {
        chapter: '수열의 극한',
        totalProblems: 42,
        sections: [
          { section: '수열의 극한', typeCode: 'MA-CAL-SEQ-01', totalProblems: 22 },
          { section: '급수', typeCode: 'MA-CAL-SEQ-02', totalProblems: 20 },
        ],
      },
      {
        chapter: '적분법',
        totalProblems: 44,
        sections: [
          { section: '여러 가지 적분법', typeCode: 'MA-CAL-INT-01', totalProblems: 24 },
          { section: '정적분의 활용', typeCode: 'MA-CAL-INT-02', totalProblems: 20 },
        ],
      },
    ],
  },
];

const difficultyConfig: Record<DifficultyLevel, { bg: string; text: string; label: string }> = {
  '최상': { bg: 'bg-rose-500/20', text: 'text-rose-400', label: '최상' },
  '상': { bg: 'bg-violet-500/20', text: 'text-violet-400', label: '상' },
  '중': { bg: 'bg-blue-500/20', text: 'text-blue-400', label: '중' },
  '하': { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: '하' },
  '최하': { bg: 'bg-teal-500/20', text: 'text-teal-400', label: '최하' },
};

// ============================================================================
// Sub Components
// ============================================================================

function StepBadge({ number, active }: { number: number; active?: boolean }) {
  return (
    <span className={`
      flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors
      ${active ? 'bg-indigo-500 text-white' : 'bg-zinc-700 text-zinc-400'}
    `}>
      {number}
    </span>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
        active
          ? 'border-indigo-500 bg-indigo-500 text-white shadow-sm shadow-indigo-500/20'
          : 'border-zinc-700 bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  );
}

function ModeButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-all ${
        disabled
          ? 'cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-600 opacity-50'
          : active
          ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300 shadow-sm shadow-indigo-500/10'
          : 'border-zinc-700 bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function DifficultyCounter({
  level,
  value,
  max,
  onChange,
  disabled,
}: {
  level: DifficultyLevel;
  value: number;
  max: number;
  onChange: (val: number) => void;
  disabled?: boolean;
}) {
  const config = difficultyConfig[level];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${config.bg} ${config.text}`}>
        {config.label}
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, parseInt(e.target.value) || 0)))}
        disabled={disabled}
        className="h-10 w-14 rounded-lg border border-zinc-700 bg-zinc-800 text-center text-lg font-bold text-white
          focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500
          disabled:cursor-not-allowed disabled:opacity-40
          [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="text-[9px] text-zinc-600">{max}문제</span>
    </div>
  );
}

// Subject Tree Component
function SubjectTreeView({
  tree,
  selectedSubject,
  selectedChapters,
  selectedSections,
  onSelectSubject,
  onToggleChapter,
  onToggleSection,
}: {
  tree: SubjectTree[];
  selectedSubject: string | null;
  selectedChapters: string[];
  selectedSections: string[];
  onSelectSubject: (subject: string) => void;
  onToggleChapter: (chapter: string) => void;
  onToggleSection: (section: string, typeCode: string) => void;
}) {
  const [expandedSubjects, setExpandedSubjects] = useState<string[]>([]);
  const [expandedChapters, setExpandedChapters] = useState<string[]>([]);

  const toggleExpandSubject = (subject: string) => {
    setExpandedSubjects((prev) =>
      prev.includes(subject) ? prev.filter((s) => s !== subject) : [...prev, subject]
    );
  };

  const toggleExpandChapter = (chapter: string) => {
    setExpandedChapters((prev) =>
      prev.includes(chapter) ? prev.filter((c) => c !== chapter) : [...prev, chapter]
    );
  };

  return (
    <div className="space-y-0.5">
      {tree.map((subj) => {
        const isExpanded = expandedSubjects.includes(subj.subject);
        const isSelected = selectedSubject === subj.subject;

        return (
          <div key={subj.subject}>
            {/* Subject Level */}
            <button
              type="button"
              onClick={() => {
                toggleExpandSubject(subj.subject);
                onSelectSubject(subj.subject);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all ${
                isSelected
                  ? 'bg-indigo-500/15 text-indigo-300'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {isExpanded ? (
                <ChevronDown size={14} className="text-zinc-500 shrink-0" />
              ) : (
                <ChevronRight size={14} className="text-zinc-500 shrink-0" />
              )}
              <BookOpen size={14} className={isSelected ? 'text-indigo-400' : 'text-zinc-500'} />
              <span className="flex-1 text-left font-medium">{subj.subject}</span>
              <span className="text-[10px] text-zinc-600">{subj.totalProblems}</span>
            </button>

            {/* Chapters */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="ml-4 space-y-0.5 border-l border-zinc-800 pl-2">
                    {subj.chapters.map((ch) => {
                      const isChExpanded = expandedChapters.includes(ch.chapter);
                      const isChSelected = selectedChapters.includes(ch.chapter);

                      return (
                        <div key={ch.chapter}>
                          <button
                            type="button"
                            onClick={() => {
                              toggleExpandChapter(ch.chapter);
                              onToggleChapter(ch.chapter);
                            }}
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-all ${
                              isChSelected
                                ? 'bg-indigo-500/10 text-indigo-300'
                                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                            }`}
                          >
                            {isChExpanded ? (
                              <ChevronDown size={12} className="text-zinc-600 shrink-0" />
                            ) : (
                              <ChevronRight size={12} className="text-zinc-600 shrink-0" />
                            )}
                            <Layers size={12} className={isChSelected ? 'text-indigo-400' : 'text-zinc-600'} />
                            <span className="flex-1 text-left">{ch.chapter}</span>
                            <span className="text-[10px] text-zinc-600">{ch.totalProblems}</span>
                          </button>

                          {/* Sections */}
                          <AnimatePresence>
                            {isChExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.12 }}
                                className="overflow-hidden"
                              >
                                <div className="ml-5 space-y-0.5 border-l border-zinc-800/50 pl-2">
                                  {ch.sections.map((sec) => {
                                    const isSecSelected = selectedSections.includes(sec.section);

                                    return (
                                      <button
                                        key={sec.section}
                                        type="button"
                                        onClick={() => onToggleSection(sec.section, sec.typeCode)}
                                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-all ${
                                          isSecSelected
                                            ? 'bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/20'
                                            : 'text-zinc-500 hover:bg-zinc-800/30 hover:text-zinc-300'
                                        }`}
                                      >
                                        <div className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${
                                          isSecSelected
                                            ? 'border-indigo-500 bg-indigo-500'
                                            : 'border-zinc-600'
                                        }`}>
                                          {isSecSelected && <Check size={8} className="text-white" />}
                                        </div>
                                        <span className="flex-1 text-left">{sec.section}</span>
                                        <span className="text-[10px] text-zinc-600">{sec.totalProblems}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function PaperCreatePage() {
  const router = useRouter();

  // ---- State ----
  const [paperName, setPaperName] = useState('');
  const [createMode, setCreateMode] = useState<CreateMode>('auto');
  const [questionTypeFilter, setQuestionTypeFilter] = useState<QuestionTypeFilter>('전체');

  // Subject/Chapter/Section selections
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [selectedTypeCodes, setSelectedTypeCodes] = useState<string[]>([]);

  // Difficulty
  const [difficulties, setDifficulties] = useState<Record<DifficultyLevel, number>>({
    '최상': 0, '상': 0, '중': 0, '하': 0, '최하': 0,
  });

  // Subject tree data
  const [subjectTree, setSubjectTree] = useState<SubjectTree[]>(mockSubjectTree);

  // Panel visibility
  const [showLeftPanel, setShowLeftPanel] = useState(true);

  // Resizable panel
  const [leftWidthPercent, setLeftWidthPercent] = useState(42);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Upload
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);

  // ---- Computed ----
  const totalQuestions = Object.values(difficulties).reduce((sum, val) => sum + val, 0);
  const hasSelection = selectedSections.length > 0;

  // Summary text
  const scopeText = useMemo(() => {
    if (!selectedSubject) return '과목 및 단원을 선택해 주세요';
    const parts = [selectedSubject];
    if (selectedChapters.length > 0) {
      parts.push(`${selectedChapters.length}개 대단원`);
    }
    if (selectedSections.length > 0) {
      parts.push(`${selectedSections.length}개 단원`);
    }
    return parts.join(' > ');
  }, [selectedSubject, selectedChapters, selectedSections]);

  // ---- Fetch real problem_types from DB ----
  useEffect(() => {
    async function fetchProblemTypes() {
      if (!isSupabaseConfigured || !supabaseBrowser) {
        console.log('[Create] Supabase not configured, using mock tree');
        return;
      }

      try {
        const { data, error } = await supabaseBrowser
          .from('problem_types')
          .select('id, type_code, subject, chapter, section, subsection, type_name, total_problems')
          .eq('is_active', true)
          .order('subject')
          .order('chapter')
          .order('section');

        if (error) {
          console.error('[Create] Failed to fetch problem_types:', error.message);
          return;
        }

        if (!data || data.length === 0) {
          console.log('[Create] No problem_types found, using mock tree');
          return;
        }

        // Build tree structure
        const treeMap = new Map<string, SubjectTree>();

        data.forEach((row: any) => {
          const subject = row.subject || '미분류';
          const chapter = row.chapter || '미분류';
          const section = row.section || row.type_name || '기타';

          if (!treeMap.has(subject)) {
            treeMap.set(subject, {
              subject,
              chapters: [],
              totalProblems: 0,
            });
          }

          const subjNode = treeMap.get(subject)!;
          let chapterNode = subjNode.chapters.find((c) => c.chapter === chapter);

          if (!chapterNode) {
            chapterNode = { chapter, sections: [], totalProblems: 0 };
            subjNode.chapters.push(chapterNode);
          }

          const problemCount = row.total_problems || 0;
          chapterNode.sections.push({
            section,
            typeCode: row.type_code,
            totalProblems: problemCount,
          });

          chapterNode.totalProblems += problemCount;
          subjNode.totalProblems += problemCount;
        });

        const tree = Array.from(treeMap.values());
        if (tree.length > 0) {
          setSubjectTree(tree);
        }
      } catch (err) {
        console.error('[Create] Error building tree:', err);
      }
    }

    fetchProblemTypes();
  }, []);

  // ---- Handlers ----
  const handleReset = () => {
    setPaperName('');
    setSelectedSubject(null);
    setSelectedChapters([]);
    setSelectedSections([]);
    setSelectedTypeCodes([]);
    setQuestionTypeFilter('전체');
    setCreateMode('auto');
    setDifficulties({ '최상': 0, '상': 0, '중': 0, '하': 0, '최하': 0 });
    setUploadedFiles([]);
  };

  const handleSelectSubject = (subject: string) => {
    setSelectedSubject(subject);
  };

  const handleToggleChapter = (chapter: string) => {
    setSelectedChapters((prev) =>
      prev.includes(chapter) ? prev.filter((c) => c !== chapter) : [...prev, chapter]
    );
  };

  const handleToggleSection = (section: string, typeCode: string) => {
    setSelectedSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );
    setSelectedTypeCodes((prev) =>
      prev.includes(typeCode) ? prev.filter((t) => t !== typeCode) : [...prev, typeCode]
    );
  };

  // Resize handler
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newPercent = ((ev.clientX - containerRect.left) / containerRect.width) * 100;
      setLeftWidthPercent(Math.max(25, Math.min(65, newPercent)));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // Save exam
  const handleSaveExam = async () => {
    if (!paperName.trim()) {
      alert('시험지 이름을 입력해주세요.');
      return;
    }
    if (totalQuestions === 0) {
      alert('문항수를 설정해주세요.');
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch('/api/exams/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: paperName,
          criteria: {
            subject: selectedSubject,
            chapters: selectedChapters,
            sections: selectedSections,
            typeCodes: selectedTypeCodes,
            questionType: questionTypeFilter,
            difficulty_distribution: difficulties,
            mode: createMode,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate');
      }

      router.push('/dashboard/repository');
    } catch (e) {
      console.error(e);
      alert('시험지 생성 실패: ' + (e instanceof Error ? e.message : '알 수 없는 오류'));
    } finally {
      setIsGenerating(false);
    }
  };

  // File upload
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

      setUploadedFiles((prev) => [uploadedFile, ...prev]);

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

        if (!response.ok) throw new Error('Upload failed');

        const data = await response.json();
        const jobId = data.jobId;

        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === tempId ? { ...f, id: jobId, status: 'processing', progress: 30 } : f
          )
        );

        const poll = async () => {
          try {
            const statusRes = await fetch(`/api/workflow/upload?jobId=${jobId}`);
            if (!statusRes.ok) return;
            const statusData = await statusRes.json();
            const job = statusData.job;

            setUploadedFiles((prev) =>
              prev.map((f) => {
                if (f.id !== jobId) return f;
                if (job.status === 'COMPLETED') {
                  const interval = pollingRefs.current.get(jobId);
                  if (interval) { clearInterval(interval); pollingRefs.current.delete(jobId); }
                  return { ...f, status: 'done', progress: 100 };
                } else if (job.status === 'FAILED') {
                  const interval = pollingRefs.current.get(jobId);
                  if (interval) { clearInterval(interval); pollingRefs.current.delete(jobId); }
                  return { ...f, status: 'error', progress: 0, error: job.error || '처리 실패' };
                }
                return { ...f, progress: job.progress || f.progress };
              })
            );
          } catch (err) {
            console.error('Polling error:', err);
          }
        };

        poll();
        const interval = setInterval(poll, 2000);
        pollingRefs.current.set(jobId, interval);
      } catch (error) {
        console.error('Upload error:', error);
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === tempId ? { ...f, status: 'error', error: '업로드 실패' } : f
          )
        );
      }
    }
  }, []);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files);
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <section className="flex h-[calc(100vh-6rem)] flex-col overflow-hidden">
      {/* ================================================================ */}
      {/* Header */}
      {/* ================================================================ */}
      <div className="flex items-center justify-between gap-4 pb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">시험지 출제</h1>
          {hasSelection && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20">
              <Hash size={12} className="text-indigo-400" />
              <span className="text-xs font-medium text-indigo-300">
                {totalQuestions}문항
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLeftPanel(!showLeftPanel)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-xs font-medium text-zinc-400 transition-all hover:bg-zinc-700 hover:text-zinc-200"
            title={showLeftPanel ? '패널 접기' : '패널 펼치기'}
          >
            {showLeftPanel ? <PanelLeftClose size={14} /> : <PanelRightClose size={14} />}
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-xs font-medium text-zinc-300 transition-all hover:bg-zinc-700"
          >
            <RotateCcw size={14} />
            <span>초기화</span>
          </button>

          <button
            type="button"
            onClick={handleSaveExam}
            disabled={totalQuestions === 0 || !paperName.trim() || isGenerating}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-500/50 bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:shadow-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {isGenerating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>생성 중...</span>
              </>
            ) : (
              <>
                <ArrowRight size={14} />
                <span>다음 단계로</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* Main Content - Split Panel */}
      {/* ================================================================ */}
      <div ref={containerRef} className="flex flex-1 gap-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        {/* ============================================================ */}
        {/* Left Panel - 범위 설정 */}
        {/* ============================================================ */}
        <AnimatePresence>
          {showLeftPanel && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: `${leftWidthPercent}%`, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col overflow-hidden border-r border-zinc-800"
            >
              {/* Left panel content wrapper */}
              <div className="flex flex-col h-full overflow-hidden">
                {/* ---- Top Area: 범위 + 시험지명 + 총문항수 ---- */}
                <div className="flex-shrink-0 border-b border-zinc-800">
                  {/* 범위 표시 */}
                  <div className="px-4 py-3 border-b border-zinc-800/50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">범위 설정</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2">
                      <Filter size={12} className="text-zinc-600 shrink-0" />
                      <span className={`text-xs ${hasSelection ? 'text-indigo-300 font-medium' : 'text-zinc-600'}`}>
                        {scopeText}
                      </span>
                    </div>
                  </div>

                  {/* 시험지명 + 총문항수 */}
                  <div className="px-4 py-3 flex gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5 block">
                        시험지명
                      </label>
                      <input
                        type="text"
                        value={paperName}
                        onChange={(e) => setPaperName(e.target.value)}
                        placeholder="시험지 이름을 입력하세요"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-600
                          focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="w-24 text-center">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5 block">
                        총 문항수
                      </label>
                      <div className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2">
                        <span className="text-xl font-bold text-indigo-400">{totalQuestions}</span>
                      </div>
                    </div>
                  </div>

                  {/* 출제 모드 */}
                  <div className="px-4 py-2 border-t border-zinc-800/50">
                    <div className="flex items-center gap-2">
                      <ModeButton
                        icon={<Wand2 size={14} />}
                        label="자동출제"
                        active={createMode === 'auto'}
                        disabled={!hasSelection}
                        onClick={() => setCreateMode('auto')}
                      />
                      <ModeButton
                        icon={<Pencil size={14} />}
                        label="수동출제"
                        active={createMode === 'manual'}
                        disabled={!hasSelection}
                        onClick={() => setCreateMode('manual')}
                      />
                      <ModeButton
                        icon={<PlusCircle size={14} />}
                        label="문제추가"
                        active={createMode === 'add'}
                        disabled={!hasSelection}
                        onClick={() => setCreateMode('add')}
                      />
                    </div>
                  </div>

                  {/* 출제 유형 필터 */}
                  <div className="px-4 py-2 border-t border-zinc-800/50">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 shrink-0">출제유형</span>
                      <div className="flex flex-wrap gap-1.5">
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
                </div>

                {/* ---- Middle Area: 과목/단원 트리 ---- */}
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/50 flex-shrink-0">
                    <StepBadge number={1} active={!selectedSubject} />
                    <span className="text-sm font-semibold text-zinc-200">과목 및 단원 선택</span>
                    {selectedSections.length > 0 && (
                      <span className="ml-auto text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                        {selectedSections.length}개 선택
                      </span>
                    )}
                  </div>

                  <div className="flex-1 overflow-auto p-2 scrollbar-thin">
                    <SubjectTreeView
                      tree={subjectTree}
                      selectedSubject={selectedSubject}
                      selectedChapters={selectedChapters}
                      selectedSections={selectedSections}
                      onSelectSubject={handleSelectSubject}
                      onToggleChapter={handleToggleChapter}
                      onToggleSection={handleToggleSection}
                    />
                  </div>
                </div>

                {/* ---- Bottom Area: 난이도별 문항수 ---- */}
                <AnimatePresence>
                  {hasSelection && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="flex-shrink-0 border-t border-zinc-800 overflow-hidden"
                    >
                      <div className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-3">
                          <StepBadge number={2} active />
                          <span className="text-sm font-semibold text-zinc-200">문항수 선택</span>
                          <span className="text-[10px] text-zinc-600">(난이도별 배분)</span>
                        </div>
                        <div className="flex items-center justify-center gap-3">
                          {(['최상', '상', '중', '하', '최하'] as DifficultyLevel[]).map((level) => (
                            <DifficultyCounter
                              key={level}
                              level={level}
                              value={difficulties[level]}
                              max={50 - (totalQuestions - difficulties[level])}
                              onChange={(val) =>
                                setDifficulties((prev) => ({ ...prev, [level]: val }))
                              }
                            />
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============================================================ */}
        {/* Resize Handle */}
        {/* ============================================================ */}
        {showLeftPanel && (
          <div
            className="flex w-1.5 items-center justify-center cursor-col-resize hover:bg-indigo-500/20 active:bg-indigo-500/30 transition-colors group flex-shrink-0"
            onMouseDown={handleResizeStart}
          >
            <div className="w-0.5 h-8 rounded-full bg-zinc-700 group-hover:bg-indigo-500 transition-colors" />
          </div>
        )}

        {/* ============================================================ */}
        {/* Right Panel - Preview & Upload */}
        {/* ============================================================ */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Right panel header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-zinc-500" />
              <span className="text-sm font-semibold text-zinc-200">시험지 미리보기</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-all hover:bg-zinc-700 hover:text-zinc-200"
              >
                <Upload size={12} />
                <span>파일 업로드</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.hwp,.hwpx"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                className="hidden"
              />
            </div>
          </div>

          {/* Upload zone (drag & drop) */}
          {uploadedFiles.length > 0 && (
            <div className="flex-shrink-0 px-4 py-2 border-b border-zinc-800">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  업로드 파일 ({uploadedFiles.length})
                </span>
              </div>
              <div className="max-h-24 space-y-1.5 overflow-auto">
                {uploadedFiles.map((file) => (
                  <div key={file.id} className="flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-1.5">
                    <FileText size={12} className="text-zinc-500 shrink-0" />
                    <span className="truncate text-xs text-zinc-300 flex-1">{file.name}</span>
                    {file.status === 'uploading' && <Loader2 size={12} className="animate-spin text-indigo-400" />}
                    {file.status === 'processing' && <span className="text-[10px] text-amber-400">처리중</span>}
                    {file.status === 'done' && <CheckCircle size={12} className="text-emerald-400" />}
                    {file.status === 'error' && <AlertCircle size={12} className="text-rose-400" />}
                    <button
                      onClick={() => setUploadedFiles((prev) => prev.filter((f) => f.id !== file.id))}
                      className="p-0.5 text-zinc-600 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview area */}
          <div
            className="flex-1 min-h-0 overflow-auto"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {totalQuestions > 0 ? (
              <div className="p-6">
                {/* Paper header */}
                <div className="mb-6 pb-4 border-b border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-bold text-white">
                      {paperName || '새 시험지'}
                    </h2>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-300">
                        {totalQuestions}문항
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                    {selectedSubject && <span>{selectedSubject}</span>}
                    {selectedChapters.length > 0 && (
                      <span>| {selectedChapters.join(', ')}</span>
                    )}
                    {questionTypeFilter !== '전체' && (
                      <span>| {questionTypeFilter}</span>
                    )}
                  </div>
                </div>

                {/* Difficulty distribution summary */}
                <div className="grid grid-cols-5 gap-2 mb-6">
                  {(['최상', '상', '중', '하', '최하'] as DifficultyLevel[]).map((level) => {
                    const config = difficultyConfig[level];
                    const count = difficulties[level];
                    if (count === 0) return null;
                    return (
                      <div key={level} className={`rounded-lg px-3 py-2 ${config.bg} border border-zinc-800`}>
                        <div className={`text-[10px] font-bold ${config.text}`}>{config.label}</div>
                        <div className="text-lg font-bold text-white">{count}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Problem slots placeholder */}
                <div className="space-y-3">
                  {Array.from({ length: Math.min(totalQuestions, 10) }, (_, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-sm font-bold text-zinc-400 shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <div className="h-3 w-3/4 rounded bg-zinc-800 mb-2" />
                        <div className="h-3 w-1/2 rounded bg-zinc-800/50" />
                      </div>
                      <div className="text-[10px] text-zinc-600">
                        {createMode === 'auto' ? '자동 배정' : '수동 선택'}
                      </div>
                    </div>
                  ))}
                  {totalQuestions > 10 && (
                    <div className="text-center py-3 text-xs text-zinc-600">
                      + {totalQuestions - 10}개 문항 더보기
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Empty state with drag & drop */
              <div className={`flex h-full flex-col items-center justify-center gap-4 p-8 transition-colors ${
                isDragging ? 'bg-indigo-500/5' : ''
              }`}>
                <div className={`p-6 rounded-2xl border-2 border-dashed transition-all ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-zinc-800 bg-zinc-900/30'
                }`}>
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="p-4 rounded-xl bg-zinc-800/50">
                      <Sparkles size={32} className="text-zinc-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-400">
                      시험지를 구성해 보세요
                    </h3>
                    <p className="text-xs text-zinc-600 max-w-xs leading-relaxed">
                      왼쪽 패널에서 과목과 단원을 선택하고, 난이도별 문항수를 설정하면
                      시험지 미리보기가 여기에 표시됩니다.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-[1px] w-8 bg-zinc-800" />
                      <span className="text-[10px] text-zinc-700">또는</span>
                      <div className="h-[1px] w-8 bg-zinc-800" />
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
                    >
                      <Upload size={14} />
                      <span>파일을 드래그하거나 클릭하여 업로드</span>
                    </button>
                    <p className="text-[10px] text-zinc-700">PDF, 이미지, HWP 파일 지원</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
