'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import {
  FolderOpen,
  FileText,
  Plus,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Pencil,
  Printer,
  Share2,
  Copy,
  ScrollText,
  CheckSquare,
  BookOpenCheck,
  Columns2,
  AlignJustify,
  Trash2,
  X,
  Download,
  FileDown,
  Sparkles,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { FigureRenderer } from '@/components/shared/FigureRenderer';
import { downloadExamDocx } from '@/lib/export/docx-generator';
import type { DocxProblem } from '@/lib/export/docx-generator';
// HWPX는 /api/export/hwpx API로 서버사이드 생성
import { useExamList, useExamProblems } from '@/hooks/useExamProblems';
import type { InterpretedFigure } from '@/types/ocr';

// ============================================================================
// Types
// ============================================================================

interface ExamGroup {
  id: string;
  name: string;
  children?: ExamGroup[];
}

interface ExamProblem {
  id: string;
  number: number;
  content: string;
  choices: string[];
  answer: number | string;
  solution: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  hasFigure?: boolean;
  figureSvg?: string;
  figureData?: InterpretedFigure;
  upscaledCropUrl?: string;
  images?: Array<{ url: string; type: string; label: string }>;
}

// ============================================================================
// Book Groups Hook (DB에서 가져오기)
// ============================================================================

function useBookGroups() {
  const [groups, setGroups] = useState<ExamGroup[]>([{ id: 'all', name: '전체', children: [] }]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchGroups() {
      try {
        const res = await fetch('/api/book-groups');
        if (res.ok) {
          const data = await res.json();
          const dbGroups: ExamGroup[] = (data.groups || []).map((g: any) => ({
            id: g.id,
            name: g.name,
            children: [],
          }));
          setGroups([{ id: 'all', name: '전체', children: [] }, ...dbGroups]);
        }
      } catch (err) {
        console.error('[ExamManagement] Failed to fetch book groups:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchGroups();
  }, []);

  return { groups, isLoading };
}

// ============================================================================
// Sub-Components
// ============================================================================

function GroupTreeItem({
  group,
  selectedGroupId,
  onSelect,
  depth = 0,
}: {
  group: ExamGroup;
  selectedGroupId: string | null;
  onSelect: (id: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = group.children && group.children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 rounded-lg px-2 py-2 cursor-pointer transition-colors ${
          selectedGroupId === group.id
            ? 'bg-cyan-500/10 text-cyan-400'
            : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelect(group.id)}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="p-0.5"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <FolderOpen className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm font-medium truncate">{group.name}</span>
        <button
          type="button"
          className="ml-auto p-0.5 text-content-muted hover:text-content-secondary opacity-0 group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && hasChildren && (
        <div>
          {group.children!.map((child) => (
            <GroupTreeItem
              key={child.id}
              group={child}
              selectedGroupId={selectedGroupId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Page Map Component
// ============================================================================

function PageMap({
  totalPages,
  currentPage,
  onPageSelect,
}: {
  totalPages: number;
  currentPage: number;
  onPageSelect: (page: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <span className="text-[10px] text-content-tertiary mb-1">페이지 맵</span>
      <div className="flex flex-col gap-1">
        {Array.from({ length: totalPages }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPageSelect(i + 1)}
            className={`w-8 h-8 rounded text-xs font-bold border transition-colors ${
              currentPage === i + 1
                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                : 'border bg-surface-card text-content-tertiary hover:border-zinc-500 hover:text-content-secondary'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 정답 렌더러: 객관식은 동그란 번호, 주관식은 수식 렌더링
// ============================================================================

const CIRCLED = ['', '①', '②', '③', '④', '⑤'];

/**
 * 유니코드 수학 기호를 LaTeX로 변환
 * √2 → $\sqrt{2}$, π → $\pi$, ² → $^2$ 등
 */
function unicodeMathToLatex(text: string): string {
  let result = text;
  result = result.replace(/√(\d+)/g, (_, digits) => `$\\sqrt{${digits}}$`);
  result = result.replace(/√/g, '$\\sqrt{}$');
  result = result.replace(/π/g, '$\\pi$');
  result = result.replace(/²/g, '$^2$');
  result = result.replace(/³/g, '$^3$');
  result = result.replace(/×/g, '$\\times$');
  result = result.replace(/\$\s*\$/g, ' ');
  return result;
}

/**
 * 답안 전용 간단 수식 렌더러
 * MixedContentRenderer는 stripTrailingChoiceLines에서 (1)을 선택지로 오인하여 삭제하므로
 * 답안에는 $...$ 파싱만 하는 간단한 렌더러 사용
 */
function SimpleAnswerMathRenderer({ content, className = '' }: { content: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  const regex = /\$([^$]+)\$/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIdx) {
      parts.push(<span key={key++}>{content.substring(lastIdx, match.index)}</span>);
    }
    parts.push(<MathRenderer key={key++} content={match[1]} />);
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < content.length) {
    parts.push(<span key={key++}>{content.substring(lastIdx)}</span>);
  }

  return <span className={className}>{parts}</span>;
}

/** 해설에서 [선택지 검증] 섹션 제거 */
function stripChoiceAnalysis(text: string): string {
  if (!text) return '';
  return text.replace(/\[선택지\s*검증\][\s\S]*$/m, '').trim();
}

function AnswerDisplay({ answer, className = '', compact = false }: { answer: number | string; className?: string; compact?: boolean }) {
  // 1) 객관식 번호 (1~5)
  if (typeof answer === 'number' && answer >= 1 && answer <= 5) {
    return <span className={className}>{CIRCLED[answer]}</span>;
  }
  const str = String(answer);
  if (str === '-') return <span className={className}>-</span>;
  // 2) 순수 숫자(정수)는 그대로 표시
  if (/^-?\d+$/.test(str)) {
    return <span className={className}>{str}</span>;
  }
  // 3) 유니코드 수학 기호(√, π 등) → LaTeX 변환
  const hasUnicodeMath = /[√π²³×÷]/.test(str);
  const converted = hasUnicodeMath ? unicodeMathToLatex(str) : str;

  // 4) LaTeX 수식 포함 → SimpleAnswerMathRenderer (MixedContentRenderer는 (1)을 선택지로 오인)
  const hasLatex = /\$[^$]+\$|\\[a-zA-Z]+|\^{/.test(converted);
  if (hasLatex) {
    // $...$로 감싸지 않은 LaTeX는 전체를 수식으로 처리
    const wrapped = converted.includes('$') ? converted : `$${converted}$`;
    // compact: 길이별 폰트 축소
    const fontSize = compact
      ? (wrapped.length > 100 ? 'text-[8px]' : wrapped.length > 60 ? 'text-[9px]' : wrapped.length > 40 ? 'text-[10px]' : 'text-[12px]')
      : (wrapped.length > 30 ? 'text-[11px]' : '');
    return (
      <div
        className={`inline-block ${fontSize} leading-tight`}
        style={{ wordBreak: 'break-word' as const }}
      >
        <SimpleAnswerMathRenderer content={wrapped} className={className} />
      </div>
    );
  }
  // 5) 수식 없는 일반 텍스트
  const fontSize = compact
    ? (str.length > 60 ? 'text-[9px]' : str.length > 30 ? 'text-[10px]' : '')
    : (str.length > 20 ? 'text-[11px]' : '');
  return (
    <span
      className={`${className} ${fontSize} ${str.length > 20 ? 'leading-tight' : ''}`}
      style={str.length > 20 ? { wordBreak: 'break-word' as const } : undefined}
    >
      {str}
    </span>
  );
}

// ============================================================================
// 출력 옵션 드롭다운
// ============================================================================

function PrintMenu({
  show,
  onClose,
  sections,
  onToggle,
  onPrint,
}: {
  show: boolean;
  onClose: () => void;
  sections: { exam: boolean; answer: boolean; solution: boolean };
  onToggle: (key: 'exam' | 'answer' | 'solution') => void;
  onPrint: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [show, onClose]);

  if (!show) return null;

  const items = [
    { key: 'exam' as const, label: '시험지' },
    { key: 'answer' as const, label: '빠른정답' },
    { key: 'solution' as const, label: '해설지' },
  ];
  const anySelected = sections.exam || sections.answer || sections.solution;

  return (
    <div ref={menuRef} className="w-48 rounded-lg border border-zinc-600 bg-zinc-800 shadow-xl z-50">
      <div className="px-3 py-2 border-b border-zinc-700">
        <span className="text-xs font-bold text-content-secondary">출력할 항목 선택</span>
      </div>
      <div className="p-2 space-y-1">
        {items.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-700 cursor-pointer">
            <input
              type="checkbox"
              checked={sections[key]}
              onChange={() => onToggle(key)}
              className="w-4 h-4 rounded border-zinc-500 text-cyan-500 focus:ring-cyan-500 bg-zinc-700"
            />
            <span className="text-sm text-content-secondary">{label}</span>
          </label>
        ))}
      </div>
      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={onPrint}
          disabled={!anySelected}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-600 disabled:text-zinc-400 px-3 py-2 text-sm font-bold text-white transition-colors"
        >
          <Printer className="h-4 w-4" />
          출력하기
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function ExamManagementPage() {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>('all');
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'exam' | 'answer' | 'solution'>('exam');
  const [columns, setColumns] = useState<1 | 2>(2);
  const [gap, setGap] = useState(30);
  const [perPagePreset, setPerPagePreset] = useState<number | null>(null); // null = 자동, 4/6/8
  const [currentPage, setCurrentPage] = useState(1);
  // 과목 카테고리
  const SUBJECT_CATEGORIES = {
    '수학': ['전체', '중1 수학', '중1-1 수학', '중1-2 수학', '중2 수학', '중2-1 수학', '중2-2 수학', '중3 수학', '중3-1 수학', '중3-2 수학', '공통수학1', '공통수학2', '수학1', '수학2', '미적분', '확률과통계', '기하', '중등 수학'],
    '과학': ['전체', '공통과학1', '공통과학2', '물리학1', '물리학2', '화학1', '화학2', '생명과학1', '생명과학2', '지구과학1', '지구과학2'],
  } as const;
  const EXAM_TYPES = ['전체', '모의고사', '학교기출'] as const;
  const GRADES = ['전체', '중1', '중2', '중3', '고1', '고2', '고3'] as const;
  const [subjectCategory, setSubjectCategory] = useState<'수학' | '과학'>('수학');
  const [subjectFilter, setSubjectFilter] = useState('전체');
  const [examTypeFilter, setExamTypeFilter] = useState('전체');
  const [gradeFilter, setGradeFilter] = useState('전체');
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [printSections, setPrintSections] = useState({ exam: true, answer: true, solution: false });
  const printRef = useRef<HTMLDivElement>(null);

  // === 자동 간격 측정 ===
  const measureRef = useRef<HTMLDivElement>(null);
  const [problemHeights, setProblemHeights] = useState<number[]>([]);
  const [measured, setMeasured] = useState(false);

  // A4 상수 (px 기준, 96dpi)
  const A4_H = 1123;
  const PAGE_PAD = 57; // ~15mm
  const FOOTER_H = 36;
  const HEADER_H = 130;
  const CONTENT_H = A4_H - PAGE_PAD * 2 - FOOTER_H;
  const FIRST_CONTENT_H = CONTENT_H - HEADER_H;

  const togglePrintSection = useCallback((key: 'exam' | 'answer' | 'solution') => {
    setPrintSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // 출력 모달
  const [showPrintModal, setShowPrintModal] = useState(false);

  // 출력 실행 — DOM 복제 방식 (클라우드 페이지와 동일)
  const executePrint = useCallback(() => {
    setShowPrintModal(false);
    const printRoot = document.createElement('div');
    printRoot.id = 'exam-print-root';

    // 시험지 섹션 (페이지별)
    if (printSections.exam) {
      const examPages = document.querySelectorAll('.print-section-exam-page');
      examPages.forEach((page, idx) => {
        const clone = page.cloneNode(true) as HTMLElement;
        clone.classList.add('exam-page');
        // ★ 시험지 마지막 페이지 표시 (빈 페이지 방지)
        if (idx === examPages.length - 1) {
          clone.classList.add('exam-last-page');
        }
        printRoot.appendChild(clone);
      });
    }

    // 빠른정답 섹션
    if (printSections.answer) {
      const answerSection = document.querySelector('.print-section-answer');
      if (answerSection) {
        const clone = answerSection.cloneNode(true) as HTMLElement;
        clone.classList.add('exam-page');
        clone.style.pageBreakBefore = 'always';
        printRoot.appendChild(clone);
      }
    }

    // 해설지 섹션 (여러 페이지로 자연 흐름)
    if (printSections.solution) {
      const solutionSection = document.querySelector('.print-section-solution');
      if (solutionSection) {
        const clone = solutionSection.cloneNode(true) as HTMLElement;
        clone.classList.add('exam-page', 'solution-page');
        clone.style.pageBreakBefore = 'always';
        printRoot.appendChild(clone);
      }
    }

    if (printRoot.children.length === 0) return;

    document.body.appendChild(printRoot);
    // ★ 이미지 로딩 대기 후 인쇄 (figure_crop 등)
    setTimeout(() => {
      window.print();
      document.body.removeChild(printRoot);
    }, 500);
  }, [printSections]);

  // PDF 다운로드 (인쇄 다이얼로그 — 동일 방식)
  const handleDownloadPdf = useCallback(() => {
    setShowPrintModal(true);
  }, []);

  // DB hooks
  const { exams: dbExams, isLoading: examsLoading, refetch: refetchExams } = useExamList();
  const { problems: dbProblems, examInfo, isLoading: problemsLoading } = useExamProblems(selectedExamId);
  const { groups: bookGroups } = useBookGroups();

  // DB 문제 → ExamProblem 형식으로 변환
  const problems: ExamProblem[] = useMemo(() => {
    return dbProblems.map((p) => ({
      id: p.id,
      number: p.number,
      content: p.content,
      choices: p.choices,
      answer: p.answer,
      solution: p.solution,
      difficulty: p.difficulty,
      hasFigure: p.hasFigure,
      figureSvg: p.figureSvg,
      figureData: p.figureData,
      upscaledCropUrl: p.upscaledCropUrl,
      images: p.images,
    }));
  }, [dbProblems]);

  // 시험지 목록 (과목/유형/학년 필터 적용)
  const examList = useMemo(() => {
    const categorySubjects = SUBJECT_CATEGORIES[subjectCategory].filter(s => s !== '전체');
    // 과학 과목 키워드 (대분류 판별용)
    const scienceKeywords = ['과학', '물리', '화학', '생명', '지구'];
    return dbExams.filter(e => {
      const subj = e.subject || '공통수학1';
      // 대분류: 수학/과학 판별 — 과목명이 리스트에 없어도 키워드로 분류
      const isScienceSubject = scienceKeywords.some(kw => subj.includes(kw));
      if (subjectCategory === '과학' && !isScienceSubject) return false;
      if (subjectCategory === '수학' && isScienceSubject) return false;
      // 세부과목 필터 (전체가 아닐 때만)
      if (subjectFilter !== '전체' && subj !== subjectFilter) return false;
      // 유형
      if (examTypeFilter !== '전체' && (e.examType || '학교기출') !== examTypeFilter) return false;
      // 학년
      if (gradeFilter !== '전체') {
        const examGrade = e.grade || '';
        if (examGrade !== gradeFilter) return false;
      }
      return true;
    });
  }, [dbExams, subjectCategory, subjectFilter, examTypeFilter, gradeFilter]);

  // 선택된 시험지 목록 (그룹 필터링)
  const groupExams = useMemo(() => {
    if (selectedGroupId === 'all' || !selectedGroupId) return examList;
    return examList.filter((e: any) => e.book_group_id === selectedGroupId);
  }, [selectedGroupId, examList]);

  // 필터 변경 시 선택 초기화
  useEffect(() => {
    setSelectedExamId(null);
  }, [subjectCategory, subjectFilter, examTypeFilter, gradeFilter]);

  // 첫 시험지 자동 선택
  useEffect(() => {
    if (!selectedExamId && groupExams.length > 0) {
      setSelectedExamId(groupExams[0].id);
    }
  }, [groupExams, selectedExamId]);

  const selectedExam = useMemo(() => {
    return groupExams.find((e) => e.id === selectedExamId);
  }, [selectedExamId, groupExams]);

  // ★ 시험지 삭제 핸들러
  const [isDeleting, setIsDeleting] = useState(false);
  const handleDeleteExam = useCallback(async () => {
    if (!selectedExamId || isDeleting) return;

    const examTitle = selectedExam?.title || '선택된 시험지';
    if (!confirm(`"${examTitle}"을(를) 삭제하시겠습니까?\n\n삭제된 시험지는 복구할 수 없습니다.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/exams/${selectedExamId}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedExamId(null);
        await refetchExams();
      } else {
        const data = await res.json();
        alert(`❌ 삭제 실패: ${data.error || data.detail || '알 수 없는 오류'}`);
      }
    } catch (err) {
      console.error('[ExamManagement] Delete error:', err);
      alert('❌ 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  }, [selectedExamId, selectedExam, isDeleting, refetchExams]);

  // DOCX 다운로드 (fallback)
  const handleDownloadDocx = useCallback(async () => {
    if (!selectedExam || problems.length === 0) return;
    const docxProblems: DocxProblem[] = problems.map(p => {
      let figureUrl: string | undefined;
      if (p.upscaledCropUrl) {
        figureUrl = p.upscaledCropUrl;
      } else if (p.figureData?.originalImageUrl) {
        figureUrl = p.figureData.originalImageUrl;
      } else if (p.images && p.images.length > 0) {
        const crop = p.images.find(img => img.type === 'figure_crop' || img.type === 'crop');
        if (crop) figureUrl = crop.url;
      }
      return {
        number: p.number,
        content: p.content,
        choices: p.choices,
        answer: p.answer,
        solution: p.solution,
        figureUrl: p.hasFigure ? figureUrl : undefined,
      };
    });
    await downloadExamDocx(docxProblems, {
      title: selectedExam.title,
      subject: '수학',
      columns: 2,
      showAnswerSheet: true,
      showSolutions: true,
    });
  }, [selectedExam, problems]);

  // HWPX 다운로드 (HWP COM API 경유)
  const [isDownloadingHwpx, setIsDownloadingHwpx] = useState(false);
  const handleDownloadHwpx = useCallback(async () => {
    if (!selectedExam || problems.length === 0 || isDownloadingHwpx) return;
    setIsDownloadingHwpx(true);
    try {
      const body = {
        title: selectedExam.title,
        subtitle: '',
        config: {
          showNameField: true,
          showAnswerSheet: true,
          showSolutions: true,
        },
        problems: problems.map(p => ({
          number: p.number,
          content: p.content,
          choices: p.choices || [],
          answer: p.answer,
          solution: p.solution,
          points: p.points,
        })),
      };

      const res = await fetch('/api/export/hwpx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'HWPX 생성 실패');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedExam.title}.hwpx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('HWPX download error:', error);
      alert(`HWP 생성 실패: ${error.message}`);
    } finally {
      setIsDownloadingHwpx(false);
    }
  }, [selectedExam, problems, isDownloadingHwpx]);

  // 일괄 해설 생성
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, failed: 0 });

  const handleBatchGenerateSolutions = useCallback(async (forceAll = false) => {
    // ★ 해설 없는 문제 + 해설이 너무 짧은 문제(100자 미만)도 미완성으로 간주
    const MIN_SOLUTION_LENGTH = 100;
    const unsolved = forceAll
      ? problems // 전체 재생성
      : problems.filter(p => !p.solution || p.solution.trim().length < MIN_SOLUTION_LENGTH);
    if (unsolved.length === 0) {
      alert('모든 문제에 해설이 이미 작성되어 있습니다.');
      return;
    }

    if (forceAll && !confirm(`${unsolved.length}개 문제의 해설을 전부 재생성합니다. 기존 해설이 덮어쓰기됩니다. 계속할까요?`)) {
      return;
    }

    setIsGeneratingBatch(true);
    setBatchProgress({ current: 0, total: unsolved.length, failed: 0 });

    let failed = 0;
    for (let i = 0; i < unsolved.length; i++) {
      try {
        const res = await fetch(`/api/problems/${unsolved[i].id}/generate-solution`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ choices: unsolved[i].choices || [] }),
        });
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
      setBatchProgress({ current: i + 1, total: unsolved.length, failed });
    }

    setIsGeneratingBatch(false);
    // refetch to show new solutions
    window.location.reload();
  }, [problems]);

  const selectedGroupName = useMemo(() => {
    return bookGroups.find((g) => g.id === selectedGroupId)?.name || '전체';
  }, [selectedGroupId]);

  // === 설정 변경 시 재측정 ===
  useEffect(() => {
    setMeasured(false);
    setProblemHeights([]);
  }, [problems, columns]);

  // === 문제 높이 측정 (KaTeX 렌더 후) ===
  useLayoutEffect(() => {
    if (measureRef.current && !measured && problems.length > 0) {
      const timer = setTimeout(() => {
        if (!measureRef.current) return;
        const els = measureRef.current.querySelectorAll('[data-problem-idx]');
        const heights = Array.from(els).map(el => el.getBoundingClientRect().height);
        if (heights.length === problems.length) {
          setProblemHeights(heights);
          setMeasured(true);
        }
      }, 300); // KaTeX 렌더링 대기
      return () => clearTimeout(timer);
    }
  }, [problems, measured]);

  // 페이지당 문제 수에 따른 페이지 분할
  const pages = useMemo(() => {
    if (!perPagePreset) return [problems]; // 자동: 전체를 한 그룹
    const result: ExamProblem[][] = [];
    for (let i = 0; i < problems.length; i += perPagePreset) {
      result.push(problems.slice(i, i + perPagePreset));
    }
    return result.length > 0 ? result : [[]];
  }, [problems, perPagePreset]);

  const totalPages = pages.length;

  // === 프리셋 모드: 페이지별 자동 간격 계산 ===
  const pageAutoGaps = useMemo(() => {
    if (!perPagePreset || !measured || problemHeights.length === 0) return null;

    const colMult = columns === 2 ? 2 : 1;
    let globalIdx = 0;

    return pages.map((pageProblems, pageIdx) => {
      const maxH = pageIdx === 0 ? FIRST_CONTENT_H : CONTENT_H;
      let totalH = 0;
      for (let i = 0; i < pageProblems.length; i++) {
        if (globalIdx + i < problemHeights.length) {
          totalH += problemHeights[globalIdx + i];
        }
      }
      globalIdx += pageProblems.length;

      // 사용 가능 높이 = 컬럼 수 × 페이지 높이 - 전체 문제 높이
      const availableSpace = colMult * maxH - totalH;
      const numProblems = pageProblems.length;
      // 문제 간 간격을 균등 분배 (최소 8px)
      const autoGap = numProblems > 0 ? Math.max(8, Math.floor(availableSpace / numProblems)) : 20;
      return autoGap;
    });
  }, [perPagePreset, measured, problemHeights, pages, columns, FIRST_CONTENT_H, CONTENT_H]);

  // 현재 유효 간격 (프리셋 모드면 자동, 아니면 슬라이더)
  const getEffectiveGap = useCallback((pageIdx: number) => {
    if (perPagePreset && pageAutoGaps && pageAutoGaps[pageIdx] !== undefined) {
      return pageAutoGaps[pageIdx];
    }
    return gap;
  }, [perPagePreset, pageAutoGaps, gap]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-surface-base text-content-primary">
      {/* ======== Header ======== */}
      <div className="flex items-center justify-between border-b border-subtle px-5 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-content-primary">시험지 관리</h1>
          <div className="flex items-center gap-2 text-sm">
            <div className="flex items-center rounded-lg border border overflow-hidden">
              {(['수학', '과학'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setSubjectCategory(cat);
                    setSubjectFilter(SUBJECT_CATEGORIES[cat][0]);
                  }}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    subjectCategory === cat
                      ? 'bg-cyan-500/10 text-cyan-400'
                      : 'text-content-tertiary hover:text-content-secondary'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="rounded-lg border border bg-surface-card px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-raised cursor-pointer outline-none"
            >
              {SUBJECT_CATEGORIES[subjectCategory].map((subj) => (
                <option key={subj} value={subj}>{subj}</option>
              ))}
            </select>
            <select
              value={examTypeFilter}
              onChange={(e) => setExamTypeFilter(e.target.value)}
              className="rounded-lg border border bg-surface-card px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-raised cursor-pointer outline-none"
            >
              {EXAM_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="rounded-lg border border bg-surface-card px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-raised cursor-pointer outline-none"
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ======== Main 3-Panel Layout ======== */}
      <div className="flex flex-1 overflow-hidden">
        {/* --- 좌측: 시험지 그룹 트리 --- */}
        <div className="w-40 flex-shrink-0 border-r border-subtle flex flex-col">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-subtle">
            <span className="text-xs font-bold text-content-secondary">
              시험지 그룹 <span className="text-cyan-400">{bookGroups.length - 1}개</span>
            </span>
            <button
              type="button"
              className="flex items-center gap-1 text-[10px] text-content-tertiary hover:text-cyan-400 transition-colors"
            >
              <Plus className="h-3 w-3" />
              최상위 그룹 추가
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {bookGroups.map((group) => (
              <GroupTreeItem
                key={group.id}
                group={group}
                selectedGroupId={selectedGroupId}
                onSelect={setSelectedGroupId}
              />
            ))}
          </div>
        </div>

        {/* --- 중앙: 시험지 목록 --- */}
        <div className="w-56 flex-shrink-0 border-r border-subtle flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-subtle">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-bold text-content-primary">{selectedGroupName}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-content-tertiary hover:text-cyan-400 transition-colors"
              >
                <Plus className="h-3 w-3" />
                시험지 생성
              </button>
              <span className="text-xs text-content-muted">{examsLoading ? '...' : `${groupExams.length}개`}</span>
            </div>
          </div>

          <div className="px-3 py-2 border-b border-subtle">
            <span className="text-[10px] text-content-tertiary uppercase">시험지명</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {groupExams.map((exam) => (
              <button
                key={exam.id}
                type="button"
                onClick={() => setSelectedExamId(exam.id)}
                className={`w-full flex items-start gap-2 px-3 py-2.5 text-left border-b border-subtle transition-colors ${
                  selectedExamId === exam.id
                    ? 'bg-cyan-500/5 border-l-2 border-l-cyan-500'
                    : 'hover:bg-surface-card border-l-2 border-l-transparent'
                }`}
              >
                <FileText className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                  selectedExamId === exam.id ? 'text-cyan-400' : 'text-content-muted'
                }`} />
                <span className={`text-sm leading-snug ${
                  selectedExamId === exam.id ? 'text-cyan-300 font-medium' : 'text-content-secondary'
                }`}>
                  {exam.title}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* --- 우측: 시험지 뷰어 --- */}
        <div className="flex-1 flex flex-col min-h-0">
          {selectedExam ? (
            <>
              {/* 로딩 오버레이 */}
              {problemsLoading && (
                <div className="flex items-center justify-center py-8 border-b border-subtle">
                  <div className="flex items-center gap-2 text-content-secondary text-sm">
                    <div className="h-4 w-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                    문제를 불러오는 중...
                  </div>
                </div>
              )}
              {/* 액션 바 */}
              <div className="flex items-center justify-between border-b border-subtle px-4 py-2 flex-shrink-0 overflow-visible relative z-50">
                <div className="flex items-center gap-1.5">
                  <button type="button" className="flex items-center gap-1 rounded-lg border border bg-surface-card px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-raised transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                    시험지 수정
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPrintModal(true)}
                    className="flex items-center gap-1 rounded-lg border border bg-surface-card px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-raised transition-colors"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    출력
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadHwpx}
                    disabled={isDownloadingHwpx}
                    className="flex items-center gap-1 rounded-lg border border bg-surface-card px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-raised transition-colors disabled:opacity-50"
                  >
                    {isDownloadingHwpx ? (
                      <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <FileDown className="h-3.5 w-3.5" />
                    )}
                    {isDownloadingHwpx ? 'HWP 생성 중...' : '한글 다운로드'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    className="flex items-center gap-1 rounded-lg border border bg-surface-card px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-raised transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF 다운로드
                  </button>
                  <button type="button" className="flex items-center gap-1 rounded-lg border border bg-surface-card px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-raised transition-colors">
                    <Share2 className="h-3.5 w-3.5" />
                    시험지 배포
                  </button>
                  <button type="button" className="flex items-center gap-1 rounded-lg border border bg-surface-card px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-raised transition-colors">
                    <Copy className="h-3.5 w-3.5" />
                    유사 시험지 만들기
                  </button>
                  {/* 페이지당 문제 수 프리셋 */}
                  <div className="ml-2 flex items-center gap-0.5 rounded-lg border border overflow-hidden">
                    {[
                      { value: null, label: '자동' },
                      { value: 4, label: '4문제' },
                      { value: 6, label: '6문제' },
                      { value: 8, label: '8문제' },
                    ].map(({ value, label }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setPerPagePreset(value)}
                        className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          perPagePreset === value
                            ? 'bg-cyan-500/10 text-cyan-400'
                            : 'text-content-tertiary hover:text-content-secondary'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 탭 */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('exam')}
                    className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      activeTab === 'exam'
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border bg-surface-card text-content-secondary hover:bg-surface-raised'
                    }`}
                  >
                    <ScrollText className="h-3.5 w-3.5" />
                    시험지
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('answer')}
                    className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      activeTab === 'answer'
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border bg-surface-card text-content-secondary hover:bg-surface-raised'
                    }`}
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    빠른정답
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('solution')}
                    className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      activeTab === 'solution'
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border bg-surface-card text-content-secondary hover:bg-surface-raised'
                    }`}
                  >
                    <BookOpenCheck className="h-3.5 w-3.5" />
                    해설지
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteExam}
                    disabled={isDeleting}
                    className="p-1.5 text-content-tertiary hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10 disabled:opacity-50"
                    title="삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* 뷰어 영역 */}
              <div className="flex flex-1 overflow-hidden">
                {/* 시험지 뷰 */}
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 flex justify-center py-4 bg-surface-raised/30">
                  <div className="w-full max-w-[800px] bg-white rounded-lg shadow-2xl shadow-black/50 mx-4">
                    {/* 헤더 테이블 */}
                    <div className="border-b-2 border-gray-800 p-0">
                      <table className="w-full border-collapse text-black">
                        <tbody>
                          <tr>
                            <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-16 bg-gray-50 text-center">과목</td>
                            <td className="border border-gray-400 px-3 py-2 text-sm font-bold">{subjectFilter}</td>
                            <td className="border border-gray-400 px-3 py-2 text-sm font-bold" colSpan={3}>
                              {selectedExam.title}
                            </td>
                            <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-16 bg-gray-50 text-center">담당</td>
                            <td className="border border-gray-400 px-3 py-2 text-sm font-bold w-20"></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Content based on tab */}
                    {activeTab === 'exam' && (
                      <div ref={measureRef}>
                        {pages.map((pageProblems, pageIdx) => {
                          // 현재 페이지의 첫 문제 글로벌 인덱스 계산
                          let globalStartIdx = 0;
                          for (let p = 0; p < pageIdx; p++) globalStartIdx += pages[p].length;

                          // 문제 렌더 헬퍼
                          const renderProblem = (problem: ExamProblem, idx: number) => (
                            <div
                              key={problem.id}
                              data-problem-idx={idx}
                              className="break-inside-avoid"
                              style={{ marginBottom: `${getEffectiveGap(pageIdx)}px` }}
                            >
                              <div className="flex gap-2">
                                <span className="text-sm font-bold text-gray-900 flex-shrink-0 pt-0.5">
                                  {problem.number}.
                                </span>
                                <div className="flex-1">
                                  <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                                    <MixedContentRenderer content={problem.content} className="text-gray-800" />
                                  </div>
                                  {(problem.figureData || problem.figureSvg) && (
                                    <div className="my-2 flex justify-center">
                                      <FigureRenderer
                                        figureData={problem.figureData}
                                        figureSvg={problem.figureSvg}
                                        maxWidth={240}
                                        darkMode={false}
                                      />
                                    </div>
                                  )}
                                  {problem.choices.length > 0 && (
                                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
                                      {problem.choices.map((choice, ci) => {
                                        const stripped = choice.replace(/^[①②③④⑤]\s*/, '').replace(/^\(\s*\d+\s*\)\s*/, '');
                                        const prefix = ['①', '②', '③', '④', '⑤'][ci] || '';
                                        return (
                                          <div key={ci} className="flex items-start gap-1.5 text-[13.5px] text-gray-700">
                                            <span className="flex-shrink-0 text-gray-500">{prefix}</span>
                                            <MixedContentRenderer content={stripped} className="text-gray-700" />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );

                          // 프리셋 + 2단: 수동 좌우 분할 (CSS columns overflow 방지)
                          const useManualColumns = perPagePreset && columns === 2;
                          const half = Math.ceil(pageProblems.length / 2);
                          const leftProblems = useManualColumns ? pageProblems.slice(0, half) : pageProblems;
                          const rightProblems = useManualColumns ? pageProblems.slice(half) : [];

                          return (
                          <div key={pageIdx}>
                            {pageIdx > 0 && (
                              <div className="border-t-2 border-dashed border-gray-300 my-2 relative">
                                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-white px-3 text-[10px] text-gray-400 font-medium">
                                  {pageIdx + 1}페이지
                                </span>
                              </div>
                            )}
                      {useManualColumns ? (
                        /* 프리셋 2단: flex로 좌우 분할 */
                        <div className="px-10 py-8 flex gap-7">
                          <div className="flex-1 border-r border-gray-200 pr-3.5">
                            {leftProblems.map((problem, probIdx) =>
                              renderProblem(problem, globalStartIdx + probIdx)
                            )}
                          </div>
                          <div className="flex-1">
                            {rightProblems.map((problem, probIdx) =>
                              renderProblem(problem, globalStartIdx + half + probIdx)
                            )}
                          </div>
                        </div>
                      ) : (
                        /* 자동 모드: CSS columns */
                        <div
                          className={`px-10 py-8 ${columns === 2 ? 'columns-2' : ''}`}
                          style={{
                            columnGap: columns === 2 ? '28px' : undefined,
                            columnRule: columns === 2 ? '1px solid #e5e5e5' : undefined,
                          }}
                        >
                          {pageProblems.map((problem, probIdx) =>
                            renderProblem(problem, globalStartIdx + probIdx)
                          )}
                        </div>
                      )}
                          </div>
                          );
                        })}
                      </div>
                    )}

                    {activeTab === 'answer' && (
                      <div className="px-10 py-8">
                        <div className="text-center mb-5">
                          <h2 className="text-lg font-bold text-gray-900">{selectedExam.title}</h2>
                          <p className="text-sm text-gray-500 mt-1">빠른 정답</p>
                        </div>
                        <table className="w-full max-w-2xl mx-auto border-collapse border-2 border-gray-800" style={{ tableLayout: 'fixed' }}>
                          <colgroup>
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '42%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '42%' }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th className="bg-gray-100 border border-gray-400 px-2 py-2.5 text-center text-xs font-bold text-gray-600">문항</th>
                              <th className="bg-gray-100 border border-gray-400 px-2 py-2.5 text-center text-xs font-bold text-gray-600">정답</th>
                              <th className="bg-gray-100 border border-gray-400 px-2 py-2.5 text-center text-xs font-bold text-gray-600">문항</th>
                              <th className="bg-gray-100 border border-gray-400 px-2 py-2.5 text-center text-xs font-bold text-gray-600">정답</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: Math.ceil(problems.length / 2) }).map((_, rowIdx) => {
                              const leftNum = rowIdx + 1;
                              const rightNum = rowIdx + 1 + Math.ceil(problems.length / 2);
                              const leftP = problems.find((p) => p.number === leftNum);
                              const rightP = problems.find((p) => p.number === rightNum);
                              const rowBg = rowIdx % 2 === 1 ? 'bg-blue-50/40' : '';
                              return (
                                <tr key={rowIdx} className={rowBg}>
                                  <td className="border border-gray-300 px-2 py-2 text-center text-sm font-bold text-gray-900">{leftNum}</td>
                                  <td className="border border-gray-300 px-2 py-2 text-center text-base font-bold text-blue-600 overflow-hidden">
                                    {leftP ? <AnswerDisplay answer={leftP.answer} className="text-blue-600" compact /> : '-'}
                                  </td>
                                  <td className="border border-gray-300 px-2 py-2 text-center text-sm font-bold text-gray-900">
                                    {rightNum <= problems.length ? rightNum : ''}
                                  </td>
                                  <td className="border border-gray-300 px-2 py-2 text-center text-base font-bold text-blue-600 overflow-hidden">
                                    {rightP ? <AnswerDisplay answer={rightP.answer} className="text-blue-600" compact /> : ''}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {activeTab === 'solution' && (
                      <div
                        className={`p-6 ${columns === 2 ? 'columns-2' : ''}`}
                        style={{ columnGap: columns === 2 ? `${gap}px` : undefined }}
                      >
                        {/* 일괄 해설 생성 버튼 */}
                        <div className="mb-5 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleBatchGenerateSolutions(false)}
                            disabled={isGeneratingBatch || problems.length === 0}
                            className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2 text-xs font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isGeneratingBatch ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                해설 생성 중... ({batchProgress.current}/{batchProgress.total}{batchProgress.failed > 0 ? `, 실패 ${batchProgress.failed}` : ''})
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-3.5 w-3.5" />
                                AI 해설 생성 (미완성)
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBatchGenerateSolutions(true)}
                            disabled={isGeneratingBatch || problems.length === 0}
                            className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            전체 재생성
                          </button>
                          {isGeneratingBatch && (
                            <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-cyan-500 transition-all duration-300"
                                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                              />
                            </div>
                          )}
                        </div>
                        {problems.map((problem) => (
                          <div
                            key={problem.id}
                            className="break-inside-avoid"
                            style={{ marginBottom: `${gap}px` }}
                          >
                            <div className="flex items-center gap-2.5 mb-2">
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-800 text-white text-xs font-bold flex-shrink-0">
                                {problem.number}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-2 py-1 text-xs font-bold text-blue-700">
                                정답 <AnswerDisplay answer={problem.answer} className="text-blue-700" />
                              </span>
                            </div>
                            <div className="ml-3 pl-4 border-l-2 border-blue-200 text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                              <MixedContentRenderer content={stripChoiceAnalysis(problem.solution)} className="text-gray-700" />
                            </div>
                            <div className="mt-3 border-b border-dashed border-gray-300" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 페이지 맵 (우측) */}
                <div className="w-14 flex-shrink-0 border-l border-subtle flex flex-col items-center py-3">
                  <PageMap
                    totalPages={totalPages}
                    currentPage={currentPage}
                    onPageSelect={setCurrentPage}
                  />
                </div>
              </div>

              {/* 하단 컨트롤 바 */}
              <div className="flex items-center justify-between border-t border-subtle px-4 py-2 flex-shrink-0 bg-surface-raised/50">
                <div className="flex items-center gap-3">
                  {/* 1단/2단 전환 */}
                  <div className="flex items-center gap-1 rounded-lg border border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setColumns(1)}
                      className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                        columns === 1
                          ? 'bg-cyan-500/10 text-cyan-400'
                          : 'text-content-tertiary hover:text-content-secondary'
                      }`}
                    >
                      <AlignJustify className="h-3.5 w-3.5" />
                      1단
                    </button>
                    <button
                      type="button"
                      onClick={() => setColumns(2)}
                      className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                        columns === 2
                          ? 'bg-cyan-500/10 text-cyan-400'
                          : 'text-content-tertiary hover:text-content-secondary'
                      }`}
                    >
                      <Columns2 className="h-3.5 w-3.5" />
                      2단
                    </button>
                  </div>

                  {/* 간격 슬라이더 (자동모드가 아닐 때만) */}
                  <div className="flex items-center gap-2">
                    {perPagePreset ? (
                      <span className="text-xs text-cyan-400">간격: 자동</span>
                    ) : (
                      <>
                        <span className="text-xs text-content-tertiary">gap : {gap}</span>
                        <input
                          type="range"
                          min={8}
                          max={48}
                          value={gap}
                          onChange={(e) => setGap(Number(e.target.value))}
                          className="w-32 h-1 accent-cyan-500 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                >
                  <Printer className="h-4 w-4" />
                  출력
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-content-tertiary">
              <FileText className="h-12 w-12 text-zinc-700 mb-3" />
              <p className="text-sm">시험지를 선택해주세요</p>
            </div>
          )}
        </div>
      </div>

      {/* ======== 인쇄 전용 영역 (화면에 숨김, handlePrint에서 DOM 복제) ======== */}
      <style dangerouslySetInnerHTML={{ __html: `
        #exam-print-root { display: none; }
        #exam-print-root .katex { font-size: 1.05em !important; }
        .print-source-sections { display: none; }
        @media print {
          body > *:not(#exam-print-root) { display: none !important; }
          #exam-print-root { display: block !important; }
          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }
          #exam-print-root .exam-page {
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            padding: 15mm !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            page-break-after: always;
            overflow: hidden !important;
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #exam-print-root .exam-page:last-child { page-break-after: auto; }
          #exam-print-root .exam-page.exam-last-page { page-break-after: auto; }
          /* 개별 문제 단위로 page-break 방지 */
          #exam-print-root .break-inside-avoid {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          /* 해설지: 자연스러운 페이지 흐름 + 상하 여백 확보 */
          #exam-print-root .exam-page.solution-page {
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            page-break-after: auto;
            page-break-inside: auto;
            padding-top: 12mm !important;
            padding-bottom: 12mm !important;
          }
          #exam-print-root .exam-page.solution-page .break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
        @page { size: A4 portrait; margin: 0; }
      `}} />
      {selectedExam && problems.length > 0 && (
        <div className="print-source-sections">
          {/* 시험지 섹션 — 페이지별 렌더링 (원래 방식 복원) */}
          {pages.map((pageProblems, pageIdx) => (
            <div
              key={`print-page-${pageIdx}`}
              className={`print-section-exam-page exam-page ${pageIdx === pages.length - 1 ? 'exam-last-page' : ''}`}
              style={{
                background: 'white',
                padding: '15mm',
                boxSizing: 'border-box',
                fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif",
              }}
            >
              {pageIdx === 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div className="border-b-2 border-gray-800">
                    <table className="w-full border-collapse text-black">
                      <tbody>
                        <tr>
                          <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-16 bg-gray-50 text-center">과목</td>
                          <td className="border border-gray-400 px-3 py-2 text-sm font-bold">{subjectFilter}</td>
                          <td className="border border-gray-400 px-3 py-2 text-sm font-bold" colSpan={3}>{selectedExam.title}</td>
                          <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-16 bg-gray-50 text-center">담당</td>
                          <td className="border border-gray-400 px-3 py-2 text-sm font-bold w-20"></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {(() => {
                const renderPrintProblem = (problem: ExamProblem) => {
                  // ★ 인쇄용 content: 문제번호 중복 제거 + 점수 제거
                  const printContent = problem.content
                    .replace(/^\s*\d+\.\s*/, '')
                    .replace(/\[\s*\d+(\.\d+)?\s*점\s*\]/g, '')
                    .trim();
                  const hasMarker = /\[도형/.test(printContent);
                  const figureCrops = (problem as any).images?.filter((img: any) => img.type === 'figure_crop') || [];
                  const hasFigureSource = problem.figureData || problem.figureSvg || (problem as any).upscaledCropUrl;

                  const renderFig = (figIdx: number) => {
                    if (figIdx === 0 && hasFigureSource) {
                      return <div className="my-2 flex justify-center"><FigureRenderer figureData={problem.figureData} figureSvg={problem.figureSvg} upscaledCropUrl={(problem as any).upscaledCropUrl} figureSource={(problem as any).figureSource} cropImageUrl={figureCrops[0]?.url} maxWidth={240} darkMode={false} /></div>;
                    }
                    if (figureCrops[figIdx]) {
                      // ★ Supabase private 버킷 → 프록시 URL 변환
                      let figUrl = figureCrops[figIdx].url;
                      const storageMatch = figUrl.match(/\/storage\/v1\/object\/(?:public|sign(?:ed)?)\/source-files\/(.+)/);
                      if (storageMatch) figUrl = `/api/storage/image?path=${encodeURIComponent(storageMatch[1])}`;
                      return <div className="my-2 flex justify-center"><img src={figUrl} alt={`도형 ${figIdx+1}`} className="max-h-48 object-contain" /></div>;
                    }
                    return null;
                  };

                  let parts: Array<{type:'text'|'figure';text:string}> = [];
                  if (hasMarker) {
                    const rx = /\[도형(?::[\w%-]*)*\]/g;
                    let li = 0; let mm: RegExpExecArray|null;
                    while ((mm = rx.exec(printContent)) !== null) {
                      const b = printContent.slice(li, mm.index);
                      if (b.trim()) parts.push({type:'text',text:b});
                      parts.push({type:'figure',text:''});
                      li = mm.index + mm[0].length;
                    }
                    const af = printContent.slice(li);
                    if (af.trim()) parts.push({type:'text',text:af});
                  }

                  return (
                    <div key={problem.id} className="break-inside-avoid" style={{ marginBottom: `${getEffectiveGap(pageIdx)}px` }}>
                      <div className="flex gap-2.5">
                        <span className="text-[14.5px] font-bold text-gray-900 flex-shrink-0" style={{ minWidth: '24px', lineHeight: '1.7' }}>{problem.number}.</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] text-gray-800 whitespace-pre-line" style={{ lineHeight: '1.7' }}>
                            {hasMarker && parts.length > 0 ? (() => { let fc=0; return parts.map((pt,pi) => pt.type==='text' ? <MixedContentRenderer key={pi} content={pt.text} className="text-gray-800"/> : <React.Fragment key={pi}>{renderFig(fc++)}</React.Fragment>); })() : (
                              <>
                                <MixedContentRenderer content={printContent} className="text-gray-800" />
                                {hasFigureSource && <div className="mt-2 flex justify-center"><FigureRenderer figureData={problem.figureData} figureSvg={problem.figureSvg} upscaledCropUrl={(problem as any).upscaledCropUrl} figureSource={(problem as any).figureSource} cropImageUrl={figureCrops[0]?.url} maxWidth={240} darkMode={false} /></div>}
                              </>
                            )}
                          </div>
                          {problem.choices.length > 0 && (() => {
                            const items = problem.choices.map((c,ci) => ({ prefix: ['①','②','③','④','⑤'][ci]||'', content: c.replace(/^[①②③④⑤]\s*/,'').replace(/^\(\s*\d+\s*\)\s*/,'') }));
                            const ml = Math.max(...items.map(c => c.content.replace(/\$[^$]*\$/g,'XX').replace(/\\[a-z]+/gi,'').length+2));
                            if (ml <= 12) return <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5">{items.map((it,ci) => <div key={ci} className="flex items-center gap-1 text-[13.5px] text-gray-700" style={{lineHeight:'1.65'}}><span className="flex-shrink-0 text-gray-500">{it.prefix}</span><MixedContentRenderer content={it.content} className="text-gray-700"/></div>)}</div>;
                            if (ml <= 30) return <div className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-2">{items.map((it,ci) => <div key={ci} className="flex items-start gap-1 text-[13.5px] text-gray-700" style={{lineHeight:'1.65'}}><span className="flex-shrink-0 text-gray-500">{it.prefix}</span><MixedContentRenderer content={it.content} className="text-gray-700"/></div>)}</div>;
                            return <div className="mt-2.5 space-y-1.5">{items.map((it,ci) => <div key={ci} className="flex items-start gap-1 text-[13.5px] text-gray-700" style={{lineHeight:'1.65'}}><span className="flex-shrink-0 text-gray-500">{it.prefix}</span><MixedContentRenderer content={it.content} className="text-gray-700"/></div>)}</div>;
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                };

                const usePrintManualCols = perPagePreset && columns === 2;
                const printHalf = Math.ceil(pageProblems.length / 2);
                if (usePrintManualCols) {
                  return (
                    <div style={{ display: 'flex', gap: '28px' }}>
                      <div style={{ flex: 1, borderRight: '1px solid #e5e5e5', paddingRight: '14px' }}>
                        {pageProblems.slice(0, printHalf).map(renderPrintProblem)}
                      </div>
                      <div style={{ flex: 1 }}>
                        {pageProblems.slice(printHalf).map(renderPrintProblem)}
                      </div>
                    </div>
                  );
                }
                return (
                  <div style={{ columns: columns === 2 ? 2 : 1, columnGap: '28px', columnRule: columns === 2 ? '1px solid #e5e5e5' : undefined }}>
                    {pageProblems.map(renderPrintProblem)}
                  </div>
                );
              })()}
            </div>
          ))}

          {/* 빠른정답 섹션 */}
          <div className="print-section-answer bg-white p-8">
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111' }}>{selectedExam.title}</h2>
                <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>빠른 정답</p>
              </div>
              <table style={{ width: '100%', maxWidth: '600px', margin: '0 auto', borderCollapse: 'collapse', border: '2px solid #1f2937', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '42%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '42%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ background: '#f3f4f6', border: '1px solid #9ca3af', padding: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#4b5563' }}>문항</th>
                    <th style={{ background: '#f3f4f6', border: '1px solid #9ca3af', padding: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#4b5563' }}>정답</th>
                    <th style={{ background: '#f3f4f6', border: '1px solid #9ca3af', padding: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#4b5563' }}>문항</th>
                    <th style={{ background: '#f3f4f6', border: '1px solid #9ca3af', padding: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#4b5563' }}>정답</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.ceil(problems.length / 2) }).map((_, rowIdx) => {
                    const leftNum = rowIdx + 1;
                    const rightNum = rowIdx + 1 + Math.ceil(problems.length / 2);
                    const leftP = problems.find((p) => p.number === leftNum);
                    const rightP = problems.find((p) => p.number === rightNum);
                    return (
                      <tr key={rowIdx} style={{ background: rowIdx % 2 === 1 ? '#eff6ff80' : 'white' }}>
                        <td style={{ border: '1px solid #d1d5db', padding: '6px 4px', textAlign: 'center', fontSize: '14px', fontWeight: 700, color: '#111' }}>{leftNum}</td>
                        <td style={{ border: '1px solid #d1d5db', padding: '6px 8px', textAlign: 'center', fontSize: '16px', fontWeight: 700, color: '#2563eb', overflow: 'hidden' }}>
                          {leftP ? <AnswerDisplay answer={leftP.answer} className="text-blue-600" compact /> : '-'}
                        </td>
                        <td style={{ border: '1px solid #d1d5db', padding: '6px 4px', textAlign: 'center', fontSize: '14px', fontWeight: 700, color: '#111' }}>
                          {rightNum <= problems.length ? rightNum : ''}
                        </td>
                        <td style={{ border: '1px solid #d1d5db', padding: '6px 8px', textAlign: 'center', fontSize: '16px', fontWeight: 700, color: '#2563eb', overflow: 'hidden' }}>
                          {rightP ? <AnswerDisplay answer={rightP.answer} className="text-blue-600" compact /> : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          </div>

          {/* 해설지 섹션 */}
          <div className="print-section-solution bg-white p-8">
              <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #1f2937', paddingBottom: '12px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111' }}>{selectedExam.title}</h2>
                <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>해설지</p>
              </div>
              <div style={{ columns, columnGap: columns === 2 ? `${gap}px` : undefined }}>
                {problems.map((problem) => (
                  <div key={problem.id} style={{ breakInside: 'avoid', marginBottom: `${gap}px` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: '#1f2937', color: 'white', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
                        {problem.number}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', borderRadius: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '4px 8px', fontSize: '12px', fontWeight: 700, color: '#1d4ed8' }}>
                        정답 <AnswerDisplay answer={problem.answer} className="text-blue-700" />
                      </span>
                    </div>
                    <div style={{ marginLeft: '12px', paddingLeft: '16px', borderLeft: '2px solid #bfdbfe', fontSize: '14px', color: '#374151', lineHeight: 1.6 }} className="whitespace-pre-line">
                      <MixedContentRenderer content={stripChoiceAnalysis(problem.solution)} className="text-gray-700" />
                    </div>
                    <div style={{ marginTop: '12px', borderBottom: '1px dashed #d1d5db' }} />
                  </div>
                ))}
              </div>
          </div>
        </div>
      )}

      {/* ======== 출력 모달 (fixed — overflow-hidden 우회) ======== */}
      {showPrintModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={() => setShowPrintModal(false)}>
          <div className="w-72 rounded-xl border border-zinc-600 bg-zinc-800 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-zinc-700">
              <span className="text-sm font-bold text-white">출력할 항목 선택</span>
            </div>
            <div className="p-3 space-y-1.5">
              {([
                { key: 'exam' as const, label: '시험지' },
                { key: 'answer' as const, label: '빠른정답' },
                { key: 'solution' as const, label: '해설지' },
              ]).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-700 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={printSections[key]}
                    onChange={() => togglePrintSection(key)}
                    className="w-4 h-4 rounded border-zinc-500 text-cyan-500 focus:ring-cyan-500 bg-zinc-700"
                  />
                  <span className="text-sm text-white">{label}</span>
                </label>
              ))}
            </div>
            <div className="px-3 pb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="flex-1 rounded-lg border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-700 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={executePrint}
                disabled={!printSections.exam && !printSections.answer && !printSections.solution}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-600 disabled:text-zinc-500 px-3 py-2 text-sm font-bold text-white transition-colors"
              >
                <Printer className="h-4 w-4" />
                출력하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
