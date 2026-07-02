'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSubjectTrack } from '@/contexts/SubjectTrackContext';
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
  Send,
  Search,
  Clock,
  Folder,
  AlertTriangle,
  Check,
  Wand2,
  ArrowRight,
  MoveVertical,
  File as FileIcon,
  Cloud,
  Minus,
  Shuffle,
  Replace,
  BarChart3,
} from 'lucide-react';
import './exam-management.css';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { FigureRenderer } from '@/components/shared/FigureRenderer';
import { ExamProblemRenderer } from '@/components/shared/ExamProblemRenderer';
import { EditableExamHeader, HEADER_THEMES, HeaderDesignGallery } from '@/components/exam/EditableExamHeader';
import DeployExamModal from '@/components/exam/DeployExamModal';
import { DEFAULT_EXAM_META, type ExamMeta } from '@/config/exam-templates';
import { downloadExamDocx } from '@/lib/export/docx-generator';
import type { DocxProblem } from '@/lib/export/docx-generator';
import { executeExamPrint } from '@/lib/print/exam-print';
// HWPX는 /api/export/hwpx API로 서버사이드 생성
import { useExamList, useExamProblems } from '@/hooks/useExamProblems';
import { useOrganizationName } from '@/hooks/useUserScope';
import type { InterpretedFigure } from '@/types/ocr';
// ★ shadcn/ui components (Phase 2 점진 도입)
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

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
  choiceHeaders?: string[];
  choiceLayout?: number;
  /** ★ 그림 객관식 — 선택지별 이미지 URL (index 0~4 = ①~⑤, null=텍스트 보기) */
  choiceImages?: (string | null)[];
  answer: number | string;
  solution: string;
  difficulty: number;
  hasFigure?: boolean;
  figureSvg?: string;
  figureData?: InterpretedFigure;
  upscaledCropUrl?: string;
  figureSource?: 'upscaled_crop' | 'ai_generated';
  images?: Array<{ url: string; type: string; label: string }>;
  points?: number;
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
          const rawGroups = data.groups || [];

          // ★ 트리 빌드: parent_id 기반으로 부모-자식 구조 생성
          const groupMap = new Map<string, ExamGroup>();
          rawGroups.forEach((g: any) => {
            groupMap.set(g.id, { id: g.id, name: g.name, children: [] });
          });
          const roots: ExamGroup[] = [];
          rawGroups.forEach((g: any) => {
            const node = groupMap.get(g.id);
            if (!node) return;
            if (g.parent_id && groupMap.has(g.parent_id)) {
              const parent = groupMap.get(g.parent_id);
              if (parent) parent.children = [...(parent.children || []), node];
            } else {
              roots.push(node);
            }
          });

          // 정렬: 부모명 기준 (고1 → 고2 → 중1 → 중2 → 중3 → 기하)
          const gradeOrder: Record<string, number> = {
            '고1': 1, '고2': 2, '고3': 3,
            '중1': 10, '중2': 11, '중3': 12, '중1 기출': 10, '중2 기출': 11, '중3 기출': 12,
            '기하 기출': 20, '기하': 20,
          };
          roots.sort((a, b) => (gradeOrder[a.name] || 99) - (gradeOrder[b.name] || 99));

          setGroups([{ id: 'all', name: '전체', children: [] }, ...roots]);
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
  // ★ $$..$$ display math 도 처리 + 단일 $..$ 도 lookbehind/lookahead 로 보호
  //   ($$안쪽을 $..$로 잘못 매칭해 KaTeX 가 raw 표시되는 회귀 방지)
  const regex = /\$\$([\s\S]+?)\$\$|(?<!\$)\$([^$\n]+)\$(?!\$)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIdx) {
      parts.push(<span key={key++}>{content.substring(lastIdx, match.index)}</span>);
    }
    // match[1] = $$..$$ display math, match[2] = $..$ inline math
    if (match[1] !== undefined) {
      parts.push(<MathRenderer key={key++} content={match[1]} block />);
    } else if (match[2] !== undefined) {
      parts.push(<MathRenderer key={key++} content={match[2]} />);
    }
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

// ★ AI가 남긴 verbose 객관식 답 패턴을 원형숫자로 보정
//   "2 (2번)" → "②" / "4 (정답 번호: 4)" → "④" / "3번" → "③"
//   애매한 케이스("10 (1)" 같은 서술형+부분번호)는 원본 유지
function normalizeObjectiveAnswerDisplay(raw: string): string {
  const str = raw.trim();
  if (!str) return str;
  const CIRCLED = ['①','②','③','④','⑤'];
  // 이미 원형숫자
  if (/^[①②③④⑤]$/.test(str)) return str;
  // "N (N번)" — 괄호 안 번호가 앞 숫자와 같음
  const sameMatch = str.match(/^\s*([1-5])\s*\(\s*([1-5])\s*번\s*\)\s*$/);
  if (sameMatch && sameMatch[1] === sameMatch[2]) {
    return CIRCLED[parseInt(sameMatch[1]) - 1];
  }
  // "N (정답 번호: N)" / "N (정답: N)"
  const verboseMatch = str.match(/^\s*([1-5])\s*\(\s*(?:정답\s*)?(?:번호\s*[:：]?\s*)?([1-5])\s*\)\s*$/);
  if (verboseMatch && verboseMatch[1] === verboseMatch[2]) {
    return CIRCLED[parseInt(verboseMatch[1]) - 1];
  }
  // "N번" 단일 (N은 1~5)
  const banMatch = str.match(/^\s*([1-5])\s*번\s*$/);
  if (banMatch) return CIRCLED[parseInt(banMatch[1]) - 1];
  // "(N번)" 또는 "(N)번"
  const parenBanMatch = str.match(/^\s*\(?\s*([1-5])\s*\)?\s*번\s*$/);
  if (parenBanMatch) return CIRCLED[parseInt(parenBanMatch[1]) - 1];
  return str;
}

function AnswerDisplay({ answer, className = '', compact = false }: { answer: number | string; className?: string; compact?: boolean }) {
  // 1) 객관식 번호 (1~5)
  if (typeof answer === 'number' && answer >= 1 && answer <= 5) {
    return <span className={className}>{CIRCLED[answer]}</span>;
  }
  // ★ 표시 전 verbose 객관식 패턴 보정
  const str = normalizeObjectiveAnswerDisplay(String(answer));
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
  const router = useRouter();
  const orgName = useOrganizationName('과사람');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>('all');
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  // ★ 좌측 사이드바 검색어 + 폴더 펼침 상태 (펼침을 선택과 분리 — 기존엔 selectedGroupId==='all' 이라 전부 열려있던 버그)
  const [sideSearch, setSideSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroupExpand = (id: string) => setExpandedGroups((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
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
  const EXAM_TYPES = ['전체', '학교기출', '진단평가', '성취도 평가', '모의고사'] as const;
  // ★ 학년(GRADES) 필터 제거 — 과목 드롭다운이 이미 학년 포함("중2-1 수학", "공통수학1"=고1)이라
  //   중복·충돌(과목=공통수학1 + 학년=중2 → 0건)만 일으켜 시험지가 안 보이던 사고. 과목+유형 2개로.
  // PR-T10 — 활성 트랙으로 카테고리 강제. flag false 또는 Provider 없으면 '수학' fallback.
  const { activeTrack, isEnabled: trackSplitEnabled } = useSubjectTrack();
  const initialCategory: '수학' | '과학' =
    trackSplitEnabled && activeTrack === 'science' ? '과학' : '수학';
  const [subjectCategory, setSubjectCategory] = useState<'수학' | '과학'>(initialCategory);
  // 활성 트랙 변경 시 카테고리 동기화 (헤더 토글)
  useEffect(() => {
    if (!trackSplitEnabled) return;
    if (activeTrack === 'science') setSubjectCategory('과학');
    else if (activeTrack === 'math') setSubjectCategory('수학');
  }, [activeTrack, trackSplitEnabled]);
  const [subjectFilter, setSubjectFilter] = useState('전체');
  const [examTypeFilter, setExamTypeFilter] = useState('전체');
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [printSections, setPrintSections] = useState({ exam: true, answer: true, solution: false });
  // ★ 헤더 디자인(테마+색) — cloud 와 동일한 디자인 갤러리 연동
  const [headerColor, setHeaderColor] = useState<string | null>(null);
  const [headerTheme, setHeaderTheme] = useState<string>('none');
  const [showDesignGallery, setShowDesignGallery] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // ★ 시험지 헤더 편집 필드 (레거시 — EditableExamHeader로 대체 예정)
  const [editInstitute, setEditInstitute] = useState('');  // 학원명
  const [editExamTitle, setEditExamTitle] = useState('');   // 시험지명
  const [editSubject, setEditSubject] = useState('');       // 과목
  const [editExamType, setEditExamType] = useState('');     // 시험유형
  const [editGrade, setEditGrade] = useState('');           // 학년
  const [editTeacher, setEditTeacher] = useState('');       // 담당

  // ★ 시험지 템플릿 (클라우드 페이지와 동일)
  const [templateId, setTemplateId] = useState('simple');
  const [unifiedMeta, setUnifiedMeta] = useState<ExamMeta>({ ...DEFAULT_EXAM_META });

  // === 자동 간격 측정 ===
  const measureRef = useRef<HTMLDivElement>(null);
  const [problemHeights, setProblemHeights] = useState<number[]>([]);
  const [measured, setMeasured] = useState(false);
  // ★ 측정 높이 캐시 — 시험지 재선택 시 300ms 대기 없이 즉시 분할 복원 (세션 지속)
  //   - Key: problem.id + ':' + columns (컬럼 수가 문제 폭→높이에 영향)
  //   - 내용 수정 시에도 문제 id는 불변이지만 updated_at을 키에 포함해 자동 무효화 (없으면 id만)
  const heightCacheRef = useRef<Map<string, number>>(new Map());

  // A4 상수 (px 기준, 96dpi)
  const A4_H = 1123;
  // ★ 상하 여백 측정값 — 시중 시험지 표준 ~20mm(76px). 좌우는 미리보기/인쇄 CSS 15mm.
  //   CONTENT_H 가 상하 20mm 반영 → 페이지당 문항 자동 보정 → 하단 잘림 없음.
  const PAGE_PAD_Y = 76; // ~20mm (상하)
  const FOOTER_H = 36;
  const HEADER_H = 130;
  const CONTENT_H = A4_H - PAGE_PAD_Y * 2 - FOOTER_H;
  const FIRST_CONTENT_H = CONTENT_H - HEADER_H;

  const togglePrintSection = useCallback((key: 'exam' | 'answer' | 'solution') => {
    setPrintSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // 출력 모달
  const [showPrintModal, setShowPrintModal] = useState(false);
  // 출제(배포) 모달
  const [showDeployModal, setShowDeployModal] = useState(false);

  // ★ 측정 완료 전 인쇄 보류 (#2 견고화) — 폴백(블라인드 10문제) 분할 잘림 차단.
  //   실제 executePrint 는 problems/measured/pages 정의 후(아래)에 선언 — deps TDZ 방지.
  const [pendingPrint, setPendingPrint] = useState(false);

  // PDF 다운로드 (인쇄 다이얼로그 — 동일 방식)
  const handleDownloadPdf = useCallback(() => {
    setShowPrintModal(true);
  }, []);

  // DB hooks
  const { exams: dbExams, isLoading: examsLoading, refetch: refetchExams } = useExamList();
  const { problems: dbProblems, examInfo, isLoading: problemsLoading } = useExamProblems(selectedExamId);
  const { groups: bookGroups, isLoading: groupsLoading } = useBookGroups();

  // DB 문제 → ExamProblem 형식으로 변환
  const problems: ExamProblem[] = useMemo(() => {
    return dbProblems.map((p) => ({
      id: p.id,
      number: p.number,
      points: p.points,  // ★ 배점 — 시험지 출력에 [N점] 배지 표시
      content: p.content,
      choices: p.choices,
      choiceHeaders: p.choiceHeaders,
      choiceLayout: p.choiceLayout,
      choiceImages: p.choiceImages,
      answer: p.answer,
      solution: p.solution,
      difficulty: p.difficulty,
      hasFigure: p.hasFigure,
      figureSvg: p.figureSvg,
      figureData: p.figureData,
      upscaledCropUrl: p.upscaledCropUrl,
      figureSource: p.figureSource,
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
      // 유형 (진단평가는 변형 제목[진단평가A/B/C, 기말대비-진단평가 등]까지 prefix 로 포함)
      if (examTypeFilter !== '전체') {
        const et = e.examType || '학교기출';
        const typeMatch = examTypeFilter === '진단평가' ? et.includes('진단평가') : et === examTypeFilter;
        if (!typeMatch) return false;
      }
      return true;
    });
  }, [dbExams, subjectCategory, subjectFilter, examTypeFilter]);

  // 선택된 시험지 목록 (그룹 필터링 — 자식 그룹 포함)
  const groupExams = useMemo(() => {
    if (selectedGroupId === 'all' || !selectedGroupId) return examList;
    // 선택한 그룹 + 자식 그룹 ID 수집 (재귀)
    const collectIds = (nodes: ExamGroup[], targetId: string): string[] => {
      for (const n of nodes) {
        if (n.id === targetId) {
          const ids: string[] = [n.id];
          const walk = (g: ExamGroup) => {
            (g.children || []).forEach(c => { ids.push(c.id); walk(c); });
          };
          walk(n);
          return ids;
        }
        const childResult = collectIds(n.children || [], targetId);
        if (childResult.length > 0) return childResult;
      }
      return [];
    };
    const targetIds = new Set(collectIds(bookGroups, selectedGroupId));
    if (targetIds.size === 0) return [];
    return examList.filter((e: any) => {
      const gid = e.bookGroupId || e.book_group_id;
      return gid && targetIds.has(gid);
    });
  }, [selectedGroupId, examList, bookGroups]);

  // 필터 변경 시 선택 초기화
  useEffect(() => {
    setSelectedExamId(null);
  }, [subjectCategory, subjectFilter, examTypeFilter]);

  // 첫 시험지 자동 선택
  useEffect(() => {
    if (!selectedExamId && groupExams.length > 0) {
      setSelectedExamId(groupExams[0].id);
    }
  }, [groupExams, selectedExamId]);

  const selectedExam = useMemo(() => {
    return groupExams.find((e) => e.id === selectedExamId);
  }, [selectedExamId, groupExams]);

  // ★ 마지막 저장 값 추적 (불필요한 DB 호출 방지)
  const lastSavedMetaRef = useRef<{ subject: string; examType: string; grade: string } | null>(null);

  // ★ 시험지 선택 시 헤더 편집 필드 자동 기입
  useEffect(() => {
    if (selectedExam) {
      const title = selectedExam.title || '';
      const schoolMatch = title.match(/([가-힣]{1,6}(?:고|중|초|학원))\d*/);
      const institute = schoolMatch ? schoolMatch[1] : '';
      const subject = selectedExam.subject || '공통수학1';
      const examType = selectedExam.examType || '학교기출';
      const grade = selectedExam.grade || '고1';
      setEditInstitute(institute);
      setEditExamTitle(title);
      setEditSubject(subject);
      setEditExamType(examType);
      setEditGrade(grade);
      setEditTeacher('');
      setUnifiedMeta({
        ...DEFAULT_EXAM_META,
        schoolName: institute, subject, examType, grade, teacher: '',
      });
      lastSavedMetaRef.current = { subject, examType, grade };
    }
  }, [selectedExam]);

  // ★ 시험지 메타 수정 핸들러 — DB 저장만, UI는 이미 로컬 state가 반영
  // (refetchExams 제거: 전체 리스트 재조회 → 불필요한 재렌더 연쇄 방지)
  const handleExamMetaChange = useCallback(async (field: string, value: string) => {
    if (!selectedExamId) return;
    try {
      const res = await fetch(`/api/exams/${selectedExamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        console.error('[ExamMeta] Update failed:', await res.text());
      }
      // ★ refetchExams() 제거 — 로컬 state만으로 UI 반영됨
    } catch (err) {
      console.error('[ExamMeta] Error:', err);
    }
  }, [selectedExamId]);

  // ★ 과목 옵션을 useMemo로 — 매번 새 배열 생성 방지
  const unifiedSubjectOptions = useMemo(
    () => [...SUBJECT_CATEGORIES['수학'].filter(s => s !== '전체'), ...SUBJECT_CATEGORIES['과학'].filter(s => s !== '전체')],
    []
  );

  // ★ EditableExamHeader 핸들러 — memoize
  const handleTemplateChange = useCallback((id: string, meta: ExamMeta) => {
    setTemplateId(id);
    setUnifiedMeta(meta);
  }, []);

  const handleMetaChange = useCallback((meta: ExamMeta) => {
    setUnifiedMeta(meta);
  }, []);

  const handleTitleChange = useCallback((title: string) => {
    setEditExamTitle(title);
  }, []);

  // ★ 메타 변경 800ms 디바운스 DB 저장
  useEffect(() => {
    if (!selectedExamId || !unifiedMeta) return;
    const timer = setTimeout(() => {
      const last = lastSavedMetaRef.current;
      if (unifiedMeta.subject && unifiedMeta.subject !== last?.subject) handleExamMetaChange('subject', unifiedMeta.subject);
      if (unifiedMeta.examType && unifiedMeta.examType !== last?.examType) handleExamMetaChange('examType', unifiedMeta.examType);
      if (unifiedMeta.grade && unifiedMeta.grade !== last?.grade) handleExamMetaChange('grade', unifiedMeta.grade);
      lastSavedMetaRef.current = { subject: unifiedMeta.subject, examType: unifiedMeta.examType, grade: unifiedMeta.grade };
    }, 800);
    return () => clearTimeout(timer);
  }, [unifiedMeta, selectedExamId, handleExamMetaChange]);

  useEffect(() => {
    if (!selectedExamId || !editExamTitle || !selectedExam) return;
    if (editExamTitle === selectedExam.title) return;
    const timer = setTimeout(() => handleExamMetaChange('title', editExamTitle), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editExamTitle, selectedExamId]);

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

  // ★ 유사 시험지 만들기 — 각 문항을 같은 유형의 다른 문항으로 교체 (은행 기반)
  const [isCreatingSimilar, setIsCreatingSimilar] = useState(false);
  const handleCreateSimilar = useCallback(async () => {
    if (!selectedExamId || isCreatingSimilar) return;
    setIsCreatingSimilar(true);
    try {
      const res = await fetch(`/api/exams/${selectedExamId}/create-similar`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok && res.status !== 207) {
        alert(`❌ 유사 시험지 생성 실패: ${data.error || data.detail || '알 수 없는 오류'}`);
        return;
      }
      await refetchExams();
      if (data.examId) setSelectedExamId(data.examId);
      alert(
        `✅ 유사 시험지 생성 완료\n"${data.title || ''}"\n` +
        `전체 ${data.total}문항 중 ${data.replaced}문항 교체` +
        (data.keptOriginal ? ` (${data.keptOriginal}문항은 대체 문항이 없어 원본 유지)` : ''),
      );
    } catch (err) {
      console.error('[ExamManagement] create-similar error:', err);
      alert('❌ 유사 시험지 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreatingSimilar(false);
    }
  }, [selectedExamId, isCreatingSimilar, refetchExams]);

  // ★ 출제 현황 — 이 시험지를 몇 명에게 출제했고 몇 명 완료했는지
  const [deployStatus, setDeployStatus] = useState<{ total: number; done: number } | null>(null);
  const refreshDeployStatus = useCallback(async (examId: string | null) => {
    if (!examId) { setDeployStatus(null); return; }
    try {
      const res = await fetch(`/api/sessions?exam_id=${examId}&limit=200`);
      const data = await res.json();
      const sessions: Array<{ completed_at?: string | null }> = Array.isArray(data.sessions) ? data.sessions : [];
      const total = sessions.length;
      const done = sessions.filter((s) => s.completed_at).length;
      setDeployStatus(total > 0 ? { total, done } : null);
    } catch { setDeployStatus(null); }
  }, []);
  useEffect(() => { refreshDeployStatus(selectedExamId); }, [selectedExamId, refreshDeployStatus]);

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

  // HWPX 다운로드 — 순수 JS 생성기(서버, Vercel 작동). exam→problems 를 서버가 DB에서 조회.
  const [isDownloadingHwpx, setIsDownloadingHwpx] = useState(false);
  const handleDownloadHwpx = useCallback(async () => {
    if (!selectedExamId || isDownloadingHwpx) return;
    setIsDownloadingHwpx(true);
    try {
      const perPageQ = perPagePreset ? `&perPage=${perPagePreset}` : '';
      const res = await fetch(`/api/exams/${selectedExamId}/export-hwp?withAnswer=true&withSolutions=true&columns=${columns}&gap=${gap}${perPageQ}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'HWP 생성 실패');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedExam?.title || '시험지'}.hwpx`;
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
  }, [selectedExamId, selectedExam, isDownloadingHwpx, columns, gap, perPagePreset]);

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

  // === 캐시 키 — 문제 내용/레이아웃 변경 시 자동 무효화 ===
  //   id + columns + 주요 필드 길이 조합으로 수정 감지 (updated_at 없어도 충분히 견고)
  const cacheKeyFor = useCallback(
    (p: ExamProblem) => {
      const contentLen = p.content?.length ?? 0;
      const choicesLen = Array.isArray(p.choices) ? p.choices.join('').length : 0;
      const solutionLen = p.solution?.length ?? 0;
      const figLen = typeof p.figureSvg === 'string' ? p.figureSvg.length : 0;
      return `${p.id}:${columns}:${contentLen}:${choicesLen}:${solutionLen}:${figLen}`;
    },
    [columns]
  );

  // === 모든 문제가 캐시에 있으면 즉시 반환 (없으면 null → 측정 필요) ===
  const cachedHeights = useMemo<number[] | null>(() => {
    if (problems.length === 0) return null;
    const cache = heightCacheRef.current;
    const heights: number[] = [];
    for (const p of problems) {
      const h = cache.get(cacheKeyFor(p));
      if (h === undefined) return null; // 하나라도 없으면 재측정
      heights.push(h);
    }
    return heights;
  }, [problems, cacheKeyFor]);

  // === 캐시 히트: 즉시 반영. 미스: measured 리셋 → 측정 효과 발동 ===
  useEffect(() => {
    if (cachedHeights) {
      setProblemHeights(cachedHeights);
      setMeasured(true);
    } else {
      setMeasured(false);
      setProblemHeights([]);
    }
  }, [cachedHeights]);

  // === 문제 높이 측정 — document.fonts.ready + double rAF ===
  //   setTimeout(300) 대신 정확한 타이밍: 폰트 로드 완료 + 두 번의 페인트 커밋 후 측정
  useLayoutEffect(() => {
    if (!measureRef.current || measured || problems.length === 0) return;

    let cancelled = false;

    const measure = async () => {
      try {
        // C: 폰트 로드 완료 대기 (KaTeX math font 포함) — 500ms 상한
        const fontsReady = (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
        if (fontsReady) {
          await Promise.race([
            fontsReady,
            new Promise<void>((resolve) => setTimeout(resolve, 500)),
          ]);
        }
        // 두 번의 rAF — React commit + 브라우저 paint 보장
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      } catch {
        // 예외 발생 시 짧은 fallback 대기
        await new Promise<void>((resolve) => setTimeout(resolve, 150));
      }

      if (cancelled || !measureRef.current) return;

      const els = measureRef.current.querySelectorAll('[data-problem-idx]');
      const heights = Array.from(els).map((el) => (el as HTMLElement).getBoundingClientRect().height);
      if (heights.length !== problems.length) return;
      // 0 높이 감지 — KaTeX 미완성 가능성. 한 번 더 대기
      if (heights.some((h) => h === 0)) {
        await new Promise<void>((resolve) => setTimeout(resolve, 120));
        if (cancelled || !measureRef.current) return;
        const els2 = measureRef.current.querySelectorAll('[data-problem-idx]');
        const heights2 = Array.from(els2).map((el) => (el as HTMLElement).getBoundingClientRect().height);
        if (heights2.length !== problems.length) return;
        if (heights2.some((h) => h === 0)) return; // 여전히 실패 → 포기
        heights.splice(0, heights.length, ...heights2);
      }

      // A: 캐시에 저장
      const cache = heightCacheRef.current;
      problems.forEach((p, i) => cache.set(cacheKeyFor(p), heights[i]));
      // 메모리 누수 방지 — 1000개 초과 시 오래된 키 제거 (Map은 insertion order 유지)
      if (cache.size > 1000) {
        const toDelete = cache.size - 1000;
        const iter = cache.keys();
        for (let j = 0; j < toDelete; j++) {
          const { value: k, done } = iter.next();
          if (done || k === undefined) break;
          cache.delete(k);
        }
      }

      setProblemHeights(heights);
      setMeasured(true);
    };

    measure();
    return () => {
      cancelled = true;
    };
  }, [problems, measured, cacheKeyFor]);

  // 페이지당 문제 수에 따른 페이지 분할 (클라우드 페이지와 동일 로직)
  const pages = useMemo(() => {
    // 프리셋 모드: 지정된 문제 수로 강제 분할
    if (perPagePreset) {
      const result: ExamProblem[][] = [];
      for (let i = 0; i < problems.length; i += perPagePreset) {
        result.push(problems.slice(i, i + perPagePreset));
      }
      return result.length > 0 ? result : [[]];
    }

    // 자동 모드: 측정된 높이 기반 분할
    if (!measured || problemHeights.length === 0) {
      // 폴백: 대략 분할
      const perPage = columns === 2 ? 10 : 5;
      const result: ExamProblem[][] = [];
      for (let i = 0; i < problems.length; i += perPage) {
        result.push(problems.slice(i, i + perPage));
      }
      return result.length > 0 ? result : [[]];
    }

    const colMult = columns === 2 ? 2 : 1;
    const result: ExamProblem[][] = [];
    let currentPage: ExamProblem[] = [];
    let usedH = 0;

    for (let i = 0; i < problems.length; i++) {
      const h = (problemHeights[i] + gap) / colMult;
      const maxH = result.length === 0 ? FIRST_CONTENT_H : CONTENT_H;

      if (currentPage.length > 0 && usedH + h > maxH) {
        result.push(currentPage);
        currentPage = [];
        usedH = 0;
      }
      currentPage.push(problems[i]);
      usedH += h;
    }
    if (currentPage.length > 0) result.push(currentPage);
    return result.length > 0 ? result : [[]];
  }, [problems, problemHeights, measured, columns, gap, perPagePreset, FIRST_CONTENT_H, CONTENT_H]);

  const totalPages = pages.length;

  // 실제 인쇄 (가드 통과 후) — 클라우드와 동일 방식 (.preview-exam-page 복제 → window.print)
  const doExecutePrint = useCallback(() => {
    // ★ 인쇄(PDF 저장) 파일명 = 시험지명 (전역 'Math×Sci Bank' 방지).
    executeExamPrint(printSections, editExamTitle);
  }, [printSections, editExamTitle]);

  // 출력 실행 — 측정 미완료 시 보류(폴백 분할 잘림 차단), 완료/타임아웃 시 자동 재개 (#2 견고화)
  const executePrint = useCallback(() => {
    setShowPrintModal(false);
    if (problems.length > 0 && !measured) { setPendingPrint(true); return; }
    doExecutePrint();
  }, [problems.length, measured, doExecutePrint]);

  // 보류된 인쇄 재개 — 측정 완료 시 정상 분할로 인쇄
  useEffect(() => {
    if (pendingPrint && measured) { setPendingPrint(false); doExecutePrint(); }
  }, [pendingPrint, measured, doExecutePrint]);

  // 안전 타임아웃 — 측정 지연/실패해도 인쇄가 영영 막히지 않게 (최대 4s 후 인쇄). hang 차단.
  useEffect(() => {
    if (!pendingPrint) return;
    const t = setTimeout(() => { setPendingPrint(false); doExecutePrint(); }, 4000);
    return () => clearTimeout(t);
  }, [pendingPrint, doExecutePrint]);

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
      // 문제 간 간격을 균등 분배 (클라우드 페이지와 동일: 최소 8px, 상한 없음)
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
    <div className="em-shell h-full w-full overflow-hidden">
      {/* ======== LEFT SIDEBAR — 시험지 그룹 트리 + 시험지 목록 ======== */}
      <aside className="em-sidebar">
        <div className="em-side-h">
          <h2>
            <FolderOpen className="h-3.5 w-3.5" />
            시험지 저장소
            <span className="em-side-h-count">{examList.length}</span>
          </h2>
          <button className="em-new-btn" title="새 시험지">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 과목 카테고리 & 필터 */}
        <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--em-border-sub)' }}>
          <div className="flex items-center gap-1 mb-2 p-0.5 rounded-lg" style={{ background: 'var(--em-bg-raised)', border: '1px solid var(--em-border-sub)' }}>
            {/* PR-T10 — 트랙 분리 활성 시 활성 트랙 카테고리만 노출 (다른 트랙 옵션 숨김).
                flag false / Provider 없음 → 둘 다 노출 (기존 동작) */}
            {(trackSplitEnabled && activeTrack
              ? ([activeTrack === 'science' ? '과학' : '수학'] as const)
              : (['수학', '과학'] as const)
            ).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setSubjectCategory(cat);
                  setSubjectFilter(SUBJECT_CATEGORIES[cat][0]);
                }}
                className="flex-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors"
                style={{
                  background: subjectCategory === cat ? 'var(--em-bg-chrome)' : 'transparent',
                  color: subjectCategory === cat ? 'var(--em-fg-1)' : 'var(--em-fg-3)',
                  boxShadow: subjectCategory === cat ? '0 1px 2px rgba(0,0,0,.3)' : 'none',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1">
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="em-select text-[11px]"
              style={{ padding: '4px 18px 4px 6px' }}
            >
              {SUBJECT_CATEGORIES[subjectCategory].map((subj) => (
                <option key={subj} value={subj}>{subj}</option>
              ))}
            </select>
            <select
              value={examTypeFilter}
              onChange={(e) => setExamTypeFilter(e.target.value)}
              className="em-select text-[11px]"
              style={{ padding: '4px 18px 4px 6px' }}
            >
              {EXAM_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="em-side-search">
          <Search className="em-search-ic" />
          <input
            type="text"
            placeholder="시험지·유형·날짜 검색"
            value={sideSearch}
            onChange={(e) => setSideSearch(e.target.value)}
          />
          {sideSearch && (
            <button type="button" className="em-search-clear" onClick={() => setSideSearch('')} aria-label="검색어 지우기">×</button>
          )}
        </div>

        <div className="em-side-body">
          {/* ★ 로딩 스켈레톤 — 그룹/시험지 로딩 중 빈 화면 대신 (데이터 오면 자동 교체) */}
          {(examsLoading || groupsLoading) && bookGroups.filter(g => g.id !== 'all').length === 0 && (
            <div className="animate-pulse" style={{ padding: '4px 4px 0' }} aria-label="불러오는 중">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={`em-sk-${i}`}
                  style={{
                    height: i % 3 === 0 ? 30 : 26,
                    marginBottom: 6,
                    marginLeft: i % 3 === 0 ? 0 : 14,
                    borderRadius: 8,
                    background: 'var(--em-bg-raised)',
                    opacity: 0.7,
                  }}
                />
              ))}
            </div>
          )}
          {bookGroups.filter(g => g.id !== 'all').map((group) => {
            const q = sideSearch.trim().toLowerCase();
            const groupExamsList = examList.filter((e: any) => {
              const gid = e.bookGroupId || e.book_group_id;
              if (!gid) return false;
              const collectIds = (node: ExamGroup): string[] => {
                const ids = [node.id];
                (node.children || []).forEach(c => ids.push(...collectIds(c)));
                return ids;
              };
              if (!collectIds(group).includes(gid)) return false;
              // ★ 검색 필터 — 제목/과목/유형/날짜(연도)로 매칭
              if (!q) return true;
              const hay = `${e.title || ''} ${e.subject || ''} ${e.examType || ''} ${e.year || e.created_at || ''}`.toLowerCase();
              return hay.includes(q);
            });
            // 검색 중 매칭 0건 폴더는 숨김
            if (q && groupExamsList.length === 0) return null;
            // ★ 펼침 = 사용자가 펼친 폴더 OR 검색 중(매칭 자동 펼침). 선택(selectedGroupId)과 분리.
            const isOpen = expandedGroups.has(group.id) || !!q;
            return (
              <div key={group.id} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  className={`em-folder ${isOpen ? 'open' : ''}`}
                  onClick={() => { toggleGroupExpand(group.id); setSelectedGroupId(group.id); }}
                >
                  <ChevronRight className="chevron" />
                  <FolderOpen className="folder-ic" />
                  <span>{group.name}</span>
                  <span className="em-folder-count">{groupExamsList.length}</span>
                </button>
                {isOpen && groupExamsList.length > 0 && (
                  <div className="em-exam-list">
                    {groupExamsList.map((exam: any) => (
                      <button
                        key={exam.id}
                        type="button"
                        className={`em-exam-pill ${selectedExamId === exam.id ? 'selected' : ''}`}
                        onClick={() => setSelectedExamId(exam.id)}
                      >
                        <div className="em-exam-pill-title">{exam.title}</div>
                        <div className="em-exam-pill-sub">
                          <span>{exam.subject || '수학'}</span>
                          <span className="dot"></span>
                          <span>{exam.examType || '학교기출'}</span>
                          <span className="dot"></span>
                          <span>{exam.grade || ''}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="em-cloud-footer">
            <div className="head">
              <Cloud className="h-3 w-3" />
              {orgName}클라우드
            </div>
            <div className="sub">다른 캠퍼스 시험지 열람 가능</div>
          </div>
        </div>
      </aside>

      {/* ======== SUBBAR — 편집 가능한 제목 + 액션 + 페이지당 ======== */}
      <div className="em-subbar">
        <div className="em-breadcrumb">
          <Folder className="h-2.5 w-2.5" />
          <span>{selectedGroupName || '전체'}</span>
          <ChevronRight className="h-2.5 w-2.5" />
        </div>
        <div className="em-title-edit">
          {selectedExam ? (
            <>
              <input
                className="em-title-input"
                value={editExamTitle || selectedExam.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                spellCheck={false}
              />
              <div className="em-subbar-meta">
                <Clock className="h-2.5 w-2.5" />
                <span>{problems.length}문항</span>
              </div>
            </>
          ) : (
            <span style={{ color: 'var(--em-fg-4)', fontSize: 13, padding: '0 10px' }}>시험지를 선택하세요</span>
          )}
        </div>

        <div className="em-subbar-actions">
          {/* ★ 페이지당 프리셋은 우측 옵션 패널 "레이아웃" 으로 이동 (2026-06-11) —
              좁은 화면에서 SUBBAR 버튼들이 제목을 가리던 겹침 완화 */}
          {deployStatus && (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold"
              style={{ background: 'rgba(8,145,178,0.13)', color: '#22d3ee', border: '1px solid rgba(8,145,178,0.35)' }}
              title="이 시험지 출제 현황 (학생 수 · 채점 완료)"
            >
              <Send style={{ width: 12, height: 12 }} />
              출제 {deployStatus.total}명{deployStatus.done > 0 ? ` · 완료 ${deployStatus.done}` : ''}
            </span>
          )}

          <button type="button" className="em-action-btn" title="PDF 다운로드" onClick={handleDownloadPdf}>
            <Download /><span className="em-action-label">PDF</span>
          </button>
          <button type="button" className="em-action-btn" title="한글(.hwpx) 다운로드" onClick={handleDownloadHwpx} disabled={isDownloadingHwpx}>
            {isDownloadingHwpx ? <Loader2 className="animate-spin" /> : <FileDown />}<span className="em-action-label">한글</span>
          </button>
          <button type="button" className="em-action-btn" title="시험지 수정"
            onClick={() => { if (selectedExamId) router.push(`/dashboard/cloud/${selectedExamId}`); }}>
            <Pencil /><span className="em-action-label">수정</span>
          </button>
          <button type="button" className="em-action-btn" title="유형 분석"
            onClick={() => { if (selectedExamId) router.push(`/dashboard/exam-analysis/${selectedExamId}`); }}>
            <BarChart3 /><span className="em-action-label">분석</span>
          </button>
          <button type="button" className="em-action-btn" title="유사 시험지 만들기 (같은 유형 다른 문항)"
            onClick={handleCreateSimilar} disabled={!selectedExamId || isCreatingSimilar}>
            {isCreatingSimilar ? <Loader2 className="animate-spin" /> : <Copy />}<span className="em-action-label">유사</span>
          </button>
          <button type="button" className="em-action-btn primary" title="출제(학생에게 배포)"
            onClick={() => { if (selectedExamId) setShowDeployModal(true); }} disabled={!selectedExamId}>
            <Send /><span className="em-action-label">출제</span>
          </button>
          <button type="button" className="em-action-btn danger" title="시험지 삭제"
            onClick={handleDeleteExam} disabled={isDeleting}>
            <Trash2 /><span className="em-action-label">삭제</span>
          </button>

          <button
            type="button"
            className="em-subbar-print"
            onClick={() => setShowPrintModal(true)}
          >
            <Printer className="h-3.5 w-3.5" />
            인쇄
          </button>
        </div>
      </div>

      {/* ======== TABS ROW ======== */}
      <div className="em-tabs-row">
        {[
          { id: 'exam' as const, label: '시험지', icon: ScrollText, count: problems.length },
          { id: 'answer' as const, label: '빠른정답', icon: CheckSquare, count: 1 },
          { id: 'solution' as const, label: '해설지', icon: BookOpenCheck, count: problems.filter(p => p.solution).length, warn: problems.filter(p => !p.solution).length > 0 },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              className={`em-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <Icon />
              {t.label}
              <span className="em-tab-count">{t.count}</span>
              {(t as any).warn && <span className="em-tab-warning-dot" />}
            </button>
          );
        })}

        <div className="em-tabs-right">
          {isGeneratingBatch && (
            <span style={{ fontFamily: 'var(--em-font-mono)', fontSize: 11, color: 'var(--em-indigo-300)' }}>
              {batchProgress.current}/{batchProgress.total}
            </span>
          )}
        </div>

        {isGeneratingBatch && batchProgress.total > 0 && (
          <div className="em-ai-progress">
            <div
              className="em-ai-progress-bar"
              style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* ======== MAIN AREA — A4 preview ======== */}
      <main className="em-main">
        {selectedExam ? (
          <>
            {isGeneratingBatch && (
              <div className="em-ai-progress-text">
                <span className="dot-spin" />
                <span>AI 해설 생성중</span>
                <span style={{ marginLeft: 'auto', color: '#fff' }}>
                  <b>{batchProgress.current}</b>
                  <span style={{ opacity: 0.5 }}> / {batchProgress.total}</span>
                </span>
              </div>
            )}

            <div className="em-paper-wrap em-view">
              <div className="em-paper-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span>A4 · {columns}단 레이아웃</span>
                  <span>·</span>
                  <span>{problems.length}문항</span>
                  {problems.filter(p => !p.solution).length > 0 && (
                    <span className="em-issue-badge">
                      <AlertTriangle />
                      해설 미완성 {problems.filter(p => !p.solution).length}건
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setShowDesignGallery(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#0891b2', border: '1px solid rgba(8,145,178,0.35)', borderRadius: 8, padding: '4px 10px', background: 'rgba(8,145,178,0.08)', cursor: 'pointer' }}
                    title="헤더 디자인 갤러리"
                  >
                    디자인{headerTheme && headerTheme !== 'none' ? ` · ${HEADER_THEMES.find((t) => t.id === headerTheme)?.label ?? ''}` : ''}
                  </button>
                  <div className="zoom">
                    <button><Minus /></button>
                    <span>100%</span>
                    <button><Plus /></button>
                  </div>
                </div>
              </div>
              {showDesignGallery && (
                <HeaderDesignGallery
                  activeTheme={headerTheme}
                  onSelect={(theme, color, layout) => { setHeaderTheme(theme); setHeaderColor(color); handleTemplateChange(layout, unifiedMeta); }}
                  onClose={() => setShowDesignGallery(false)}
                />
              )}

              {problemsLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-2 text-content-secondary text-sm">
                    <div className="h-4 w-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                    문제를 불러오는 중...
                  </div>
                </div>
              )}

              <div className="w-full bg-white rounded-lg shadow-2xl shadow-black/50">
                <EditableExamHeader
                  templateId={templateId}
                  meta={unifiedMeta}
                  examTitle={editExamTitle || selectedExam.title}
                  editable={true}
                  onTemplateChange={handleTemplateChange}
                  onMetaChange={handleMetaChange}
                  onExamTitleChange={handleTitleChange}
                  subjectOptions={unifiedSubjectOptions}
                  accentColor={headerColor}
                  headerTheme={headerTheme}
                />

                {activeTab === 'exam' && (
                  <div ref={measureRef}>
                    {pages.map((pageProblems, pageIdx) => {
                      let globalStartIdx = 0;
                      for (let p = 0; p < pageIdx; p++) globalStartIdx += pages[p].length;

                      const renderProblem = (problem: ExamProblem, idx: number) => (
                        <div
                          key={problem.id}
                          data-problem-idx={idx}
                          className="break-inside-avoid"
                          style={{ marginBottom: `${getEffectiveGap(pageIdx)}px` }}
                        >
                          <ExamProblemRenderer problem={problem} />
                        </div>
                      );

                      const useManualColumns = columns === 2;
                      const half = Math.ceil(pageProblems.length / 2);
                      const leftProblems = useManualColumns ? pageProblems.slice(0, half) : pageProblems;
                      const rightProblems = useManualColumns ? pageProblems.slice(half) : [];

                      return (
                        <div
                          key={pageIdx}
                          className="preview-exam-page exam-page bg-white"
                          style={{
                            width: '794px',
                            minHeight: `${A4_H}px`,
                            padding: '20mm 15mm', /* 상하 20mm(시중 표준)·좌우 15mm */
                            marginBottom: pageIdx < pages.length - 1 ? '24px' : 0,
                            boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
                            borderRadius: '4px',
                            position: 'relative',
                            boxSizing: 'border-box',
                            fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif",
                          }}
                        >
                          {pageIdx > 0 && (
                            <div className="border-t-2 border-dashed border-gray-300 my-2 relative page-divider-ui">
                              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-white px-3 text-[10px] text-gray-400 font-medium">
                                {pageIdx + 1}페이지
                              </span>
                            </div>
                          )}
                          {useManualColumns ? (
                            // ★ 외부 padding:15mm(57px)만으로 A4 표준 여백 충분.
                            //   기존 px-10(40px) 중복 패딩을 제거해 본문 폭을 확보.
                            <div className="py-2 flex gap-4">
                              <div className="flex-1 min-w-0 border-r border-gray-200 pr-3">
                                {leftProblems.map((problem, probIdx) =>
                                  renderProblem(problem, globalStartIdx + probIdx)
                                )}
                              </div>
                              <div className="flex-1 min-w-0 pl-1">
                                {rightProblems.map((problem, probIdx) =>
                                  renderProblem(problem, globalStartIdx + half + probIdx)
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="py-2">
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
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center" style={{ color: 'var(--em-fg-4)', paddingTop: 80 }}>
            <FileText className="h-12 w-12 mb-3" style={{ color: 'var(--em-bg-raised)' }} />
            <p className="text-sm">시험지를 선택해주세요</p>
          </div>
        )}
      </main>

      {/* ======== RIGHT OPTIONS PANEL ======== */}
      <aside className="em-options">
        <div className="em-opts-group">
          <h4><Columns2 />레이아웃</h4>
          <div className="em-col-toggle">
            <button
              type="button"
              className={`em-col-btn ${columns === 1 ? 'active' : ''}`}
              onClick={() => setColumns(1)}
            >
              <div className="em-col-vis">
                <div className="em-col-vis-line" />
                <div className="em-col-vis-line short" />
                <div className="em-col-vis-line gap" />
                <div className="em-col-vis-line" />
                <div className="em-col-vis-line short" />
                <div className="em-col-vis-line gap" />
                <div className="em-col-vis-line" />
              </div>
              <span className="em-col-label">1단</span>
            </button>
            <button
              type="button"
              className={`em-col-btn ${columns === 2 ? 'active' : ''}`}
              onClick={() => setColumns(2)}
            >
              <div className="em-col-vis">
                <div className="em-col-vis-cols">
                  <div className="em-col-vis-col">
                    <div className="em-col-vis-line" />
                    <div className="em-col-vis-line short" />
                    <div className="em-col-vis-line" />
                    <div className="em-col-vis-line short" />
                  </div>
                  <div className="em-col-vis-col">
                    <div className="em-col-vis-line" />
                    <div className="em-col-vis-line short" />
                    <div className="em-col-vis-line" />
                    <div className="em-col-vis-line short" />
                  </div>
                </div>
              </div>
              <span className="em-col-label">2단</span>
            </button>
          </div>

          {/* 페이지당 문제 수 — SUBBAR 에서 이동 (좁은 화면 겹침 완화) */}
          <div className="em-slider-row" style={{ marginTop: 12 }}>
            <span>페이지당 문제 수</span>
          </div>
          <div className="em-ppp em-ppp-block">
            {[
              { value: null, label: '자동' },
              { value: 4, label: '4' },
              { value: 6, label: '6' },
              { value: 8, label: '8' },
            ].map(({ value, label }) => (
              <button
                key={label}
                type="button"
                onClick={() => setPerPagePreset(value)}
                className={perPagePreset === value ? 'active' : ''}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="em-opts-group">
          <h4><MoveVertical />문제 간격</h4>
          <div className="em-slider-row">
            <span>세로 여백</span>
            <span className="em-slider-val">
              {perPagePreset ? '자동' : `${gap}px`}
            </span>
          </div>
          <input
            type="range"
            className="em-slider"
            min={8} max={48} step={2}
            value={gap}
            onChange={(e) => setGap(Number(e.target.value))}
            disabled={!!perPagePreset}
          />
          <div className="em-slider-ticks">
            <span>좁게</span>
            <span>기본</span>
            <span>넓게</span>
          </div>
        </div>

        <div className="em-opts-group">
          <h4><FileIcon />용지</h4>
          <select className="em-select">
            <option value="A4">A4 (210 × 297mm)</option>
          </select>
        </div>

        <div className="em-opts-group">
          <h4><Printer />출력 옵션</h4>
          {[
            { id: 'exam' as const, label: '시험지', sub: 'A4 · 본지' },
            { id: 'answer' as const, label: '빠른정답', sub: 'Answer key' },
            { id: 'solution' as const, label: '해설지', sub: '상세 풀이' },
          ].map((item) => {
            const on = printSections[item.id];
            return (
              <div
                key={item.id}
                className={`em-check-row ${on ? 'on' : ''}`}
                onClick={() => togglePrintSection(item.id)}
              >
                <div className="em-cbox">
                  {on && <Check />}
                </div>
                <div className="em-check-row-label">
                  <span className="main">{item.label}</span>
                  <span className="sub">{item.sub}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="em-opts-group">
          <h4><Sparkles />AI 보조</h4>
          <button
            type="button"
            className="em-ai-btn"
            onClick={() => handleBatchGenerateSolutions(false)}
            disabled={isGeneratingBatch || problems.length === 0}
          >
            {isGeneratingBatch ? <Loader2 className="animate-spin" /> : <Wand2 />}
            <div className="col">
              <span>{isGeneratingBatch ? 'AI 해설 생성중' : '일괄 해설 생성'}</span>
              <span className="sub">
                {isGeneratingBatch
                  ? `${batchProgress.current}/${batchProgress.total}${batchProgress.failed > 0 ? ` · 실패 ${batchProgress.failed}` : ''}`
                  : `미완성 ${problems.filter(p => !p.solution).length}건`}
              </span>
            </div>
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
            <button
              type="button"
              className="em-preset-btn"
              onClick={() => handleBatchGenerateSolutions(true)}
              disabled={isGeneratingBatch || problems.length === 0}
            >
              <RefreshCw />
              <span>해설 전체 재생성</span>
              <span className="sub">Force</span>
            </button>
            <button type="button" className="em-preset-btn">
              <Shuffle />
              <span>문제 순서 자동 정렬</span>
              <span className="sub">난이도순</span>
            </button>
            <button type="button" className="em-preset-btn">
              <Replace />
              <span>유사 문제로 변형</span>
              <span className="sub">쌍둥이</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          className="em-print-cta"
          onClick={() => setShowPrintModal(true)}
        >
          <div className="em-print-cta-head">
            <Printer />
            <span>인쇄 준비 완료</span>
          </div>
          <div className="em-print-cta-main">
            <span>지금 인쇄하기</span>
            <ArrowRight />
          </div>
          <div className="em-print-cta-sub">
            {Object.entries(printSections).filter(([, v]) => v).map(([k], i, arr) => (
              <React.Fragment key={k}>
                <span>{k === 'exam' ? '시험지' : k === 'answer' ? '빠른정답' : '해설지'}</span>
                {i < arr.length - 1 && <span className="dot">·</span>}
              </React.Fragment>
            ))}
            <span className="dot">·</span>
            <span>A4 {columns}단</span>
          </div>
        </button>
      </aside>


      {/* ======== 인쇄 전용 영역 (화면에 숨김, handlePrint에서 DOM 복제) ======== */}
      <style dangerouslySetInnerHTML={{ __html: `
        #exam-print-root { display: none; }
        #exam-print-root .katex { font-size: 1.05em !important; }
        /* ★ display:none → off-screen: CSS columns 레이아웃 계산을 위해 렌더링 유지 */
        .print-source-sections {
          position: fixed;
          left: -9999px;
          top: 0;
          width: 794px;
          z-index: -1;
          pointer-events: none;
        }
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
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            margin: 0 !important;
            padding: 20mm 15mm !important; /* 상하 20mm(시중 표준)·좌우 15mm */
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
            padding-top: 18mm !important;
            padding-bottom: 18mm !important;
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
          {/* ★ 시험지(exam) 섹션은 executePrint()에서 .preview-exam-page를 직접 복제하므로 off-screen 렌더 제거 (성능 개선) */}

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

      {/* 출제(배포) 모달 — 매쓰플랫 미러링: 학년/반 + 학생 트리 → POST /api/sessions(type=EX) */}
      <DeployExamModal
        isOpen={showDeployModal}
        onClose={() => setShowDeployModal(false)}
        exam={selectedExam ? { id: selectedExam.id, title: selectedExam.title || '시험지' } : null}
        onDeployed={() => refreshDeployStatus(selectedExamId)}
      />
    </div>
  );
}
