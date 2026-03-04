'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { FigureRenderer } from '@/components/shared/FigureRenderer';
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

function AnswerDisplay({ answer, className = '' }: { answer: number | string; className?: string }) {
  if (typeof answer === 'number' && answer >= 1 && answer <= 5) {
    return <span className={className}>{CIRCLED[answer]}</span>;
  }
  const str = String(answer);
  if (str.includes('$') || str.includes('\\')) {
    return <MixedContentRenderer content={str} className={className} />;
  }
  return <span className={className}>{str}</span>;
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
    <div ref={menuRef} className="absolute bottom-full right-0 mb-2 w-48 rounded-lg border border-zinc-600 bg-zinc-800 shadow-xl z-50">
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
  const [currentPage, setCurrentPage] = useState(1);
  const [subjectFilter, setSubjectFilter] = useState('공통수학1 [2022개정]');
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [printSections, setPrintSections] = useState({ exam: true, answer: true, solution: false });
  const printRef = useRef<HTMLDivElement>(null);

  const togglePrintSection = useCallback((key: 'exam' | 'answer' | 'solution') => {
    setPrintSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handlePrint = useCallback(() => {
    setShowPrintMenu(false);
    setTimeout(() => window.print(), 100);
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
    }));
  }, [dbProblems]);

  // 시험지 목록 (DB 데이터 우선, fallback mock)
  const examList = useMemo(() => {
    if (dbExams.length > 0) return dbExams;
    return [];
  }, [dbExams]);

  // 선택된 시험지 목록 (그룹 필터링)
  const groupExams = useMemo(() => {
    if (selectedGroupId === 'all' || !selectedGroupId) return examList;
    return examList.filter((e: any) => e.book_group_id === selectedGroupId);
  }, [selectedGroupId, examList]);

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

  const selectedGroupName = useMemo(() => {
    return bookGroups.find((g) => g.id === selectedGroupId)?.name || '전체';
  }, [selectedGroupId]);

  const totalPages = Math.max(1, Math.ceil(problems.length / 10));

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-surface-base text-content-primary">
      {/* ======== Header ======== */}
      <div className="flex items-center justify-between border-b border-subtle px-5 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-content-primary">시험지 관리</h1>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-content-tertiary">과목</span>
            <button
              type="button"
              className="flex items-center gap-1 rounded-lg border border bg-surface-card px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-surface-raised"
            >
              {subjectFilter}
              <ChevronDown className="h-3.5 w-3.5 text-content-tertiary" />
            </button>
          </div>
        </div>
      </div>

      {/* ======== Main 3-Panel Layout ======== */}
      <div className="flex flex-1 overflow-hidden">
        {/* --- 좌측: 시험지 그룹 트리 --- */}
        <div className="w-52 flex-shrink-0 border-r border-subtle flex flex-col">
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
        <div className="w-80 flex-shrink-0 border-r border-subtle flex flex-col">
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
        <div className="flex-1 flex flex-col overflow-hidden">
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
              <div className="flex items-center justify-between border-b border-subtle px-4 py-2 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <button type="button" className="flex items-center gap-1 rounded-lg border border bg-surface-card px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-raised transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                    시험지 수정
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowPrintMenu(!showPrintMenu)}
                      className="flex items-center gap-1 rounded-lg border border bg-surface-card px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-raised transition-colors"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      출력
                    </button>
                    <div className="absolute top-full left-0 mt-1 z-50">
                      <PrintMenu
                        show={showPrintMenu}
                        onClose={() => setShowPrintMenu(false)}
                        sections={printSections}
                        onToggle={togglePrintSection}
                        onPrint={handlePrint}
                      />
                    </div>
                  </div>
                  <button type="button" className="flex items-center gap-1 rounded-lg border border bg-surface-card px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-raised transition-colors">
                    <Share2 className="h-3.5 w-3.5" />
                    시험지 배포
                  </button>
                  <button type="button" className="flex items-center gap-1 rounded-lg border border bg-surface-card px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-raised transition-colors">
                    <Copy className="h-3.5 w-3.5" />
                    유사 시험지 만들기
                  </button>
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
                            <td className="border border-gray-400 px-3 py-2 text-sm font-bold">수학1</td>
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
                                    {problem.choices.map((choice, ci) => (
                                      <div key={ci} className="text-[13px] text-gray-700">
                                        <MixedContentRenderer content={choice} className="text-gray-700" />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {activeTab === 'answer' && (
                      <div className="p-6">
                        <div className="text-center mb-5">
                          <h2 className="text-lg font-bold text-gray-900">{selectedExam.title}</h2>
                          <p className="text-sm text-gray-500 mt-1">빠른 정답</p>
                        </div>
                        <table className="w-full max-w-2xl mx-auto border-collapse border-2 border-gray-800">
                          <thead>
                            <tr>
                              <th className="bg-gray-100 border border-gray-400 px-3 py-2.5 text-center text-xs font-bold text-gray-600 w-16">문항</th>
                              <th className="bg-gray-100 border border-gray-400 px-3 py-2.5 text-center text-xs font-bold text-gray-600">정답</th>
                              <th className="bg-gray-100 border border-gray-400 px-3 py-2.5 text-center text-xs font-bold text-gray-600 w-16">문항</th>
                              <th className="bg-gray-100 border border-gray-400 px-3 py-2.5 text-center text-xs font-bold text-gray-600">정답</th>
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
                                  <td className="border border-gray-300 px-3 py-2.5 text-center text-sm font-bold text-gray-900">{leftNum}</td>
                                  <td className="border border-gray-300 px-3 py-2.5 text-center text-lg font-bold text-blue-600">
                                    {leftP ? <AnswerDisplay answer={leftP.answer} className="text-blue-600" /> : '-'}
                                  </td>
                                  <td className="border border-gray-300 px-3 py-2.5 text-center text-sm font-bold text-gray-900">
                                    {rightNum <= problems.length ? rightNum : ''}
                                  </td>
                                  <td className="border border-gray-300 px-3 py-2.5 text-center text-lg font-bold text-blue-600">
                                    {rightP ? <AnswerDisplay answer={rightP.answer} className="text-blue-600" /> : ''}
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
                              <MixedContentRenderer content={problem.solution} className="text-gray-700" />
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-content-tertiary">gap : {gap}</span>
                    <input
                      type="range"
                      min={8}
                      max={48}
                      value={gap}
                      onChange={(e) => setGap(Number(e.target.value))}
                      className="w-32 h-1 accent-cyan-500 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPrintMenu(!showPrintMenu)}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                  >
                    <Printer className="h-4 w-4" />
                    출력
                  </button>
                  <PrintMenu
                    show={showPrintMenu}
                    onClose={() => setShowPrintMenu(false)}
                    sections={printSections}
                    onToggle={togglePrintSection}
                    onPrint={handlePrint}
                  />
                </div>
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

      {/* ======== 인쇄 전용 영역 (화면에 안 보임, @media print에서만 표시) ======== */}
      {selectedExam && problems.length > 0 && (
        <div ref={printRef} className="print-only">
          <style dangerouslySetInnerHTML={{ __html: `
            .print-only { display: none; }
            @media print {
              body > *:not(.print-only) { display: none !important; }
              .print-only { display: block !important; }
              .print-section { page-break-after: always; }
              .print-section:last-child { page-break-after: auto; }
              .print-only * { color-adjust: exact !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            }
          `}} />

          {/* 시험지 섹션 */}
          {printSections.exam && (
            <div className="print-section bg-white p-8">
              <div className="border-b-2 border-gray-800 mb-4">
                <table className="w-full border-collapse text-black">
                  <tbody>
                    <tr>
                      <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-16 bg-gray-50 text-center">과목</td>
                      <td className="border border-gray-400 px-3 py-2 text-sm font-bold">수학1</td>
                      <td className="border border-gray-400 px-3 py-2 text-sm font-bold" colSpan={3}>{selectedExam.title}</td>
                      <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-16 bg-gray-50 text-center">담당</td>
                      <td className="border border-gray-400 px-3 py-2 text-sm font-bold w-20"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ columns: 2, columnGap: '30px' }}>
                {problems.map((problem) => (
                  <div key={problem.id} style={{ breakInside: 'avoid', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#111', flexShrink: 0, paddingTop: '2px' }}>{problem.number}.</span>
                      <div style={{ flex: 1 }}>
                        <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                          <MixedContentRenderer content={problem.content} className="text-gray-800" />
                        </div>
                        {(problem.figureData || problem.figureSvg) && (
                          <div style={{ margin: '8px 0', display: 'flex', justifyContent: 'center' }}>
                            <FigureRenderer
                              figureData={problem.figureData}
                              figureSvg={problem.figureSvg}
                              maxWidth={220}
                              darkMode={false}
                            />
                          </div>
                        )}
                        {problem.choices.length > 0 && (
                          <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px' }}>
                            {problem.choices.map((choice, ci) => (
                              <div key={ci} className="text-[13px] text-gray-700">
                                <MixedContentRenderer content={choice} className="text-gray-700" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 빠른정답 섹션 */}
          {printSections.answer && (
            <div className="print-section bg-white p-8">
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111' }}>{selectedExam.title}</h2>
                <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>빠른 정답</p>
              </div>
              <table style={{ width: '100%', maxWidth: '600px', margin: '0 auto', borderCollapse: 'collapse', border: '2px solid #1f2937' }}>
                <thead>
                  <tr>
                    <th style={{ background: '#f3f4f6', border: '1px solid #9ca3af', padding: '8px 12px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#4b5563', width: '60px' }}>문항</th>
                    <th style={{ background: '#f3f4f6', border: '1px solid #9ca3af', padding: '8px 12px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#4b5563' }}>정답</th>
                    <th style={{ background: '#f3f4f6', border: '1px solid #9ca3af', padding: '8px 12px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#4b5563', width: '60px' }}>문항</th>
                    <th style={{ background: '#f3f4f6', border: '1px solid #9ca3af', padding: '8px 12px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#4b5563' }}>정답</th>
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
                        <td style={{ border: '1px solid #d1d5db', padding: '8px 12px', textAlign: 'center', fontSize: '14px', fontWeight: 700, color: '#111' }}>{leftNum}</td>
                        <td style={{ border: '1px solid #d1d5db', padding: '8px 12px', textAlign: 'center', fontSize: '18px', fontWeight: 700, color: '#2563eb' }}>
                          {leftP ? <AnswerDisplay answer={leftP.answer} className="text-blue-600" /> : '-'}
                        </td>
                        <td style={{ border: '1px solid #d1d5db', padding: '8px 12px', textAlign: 'center', fontSize: '14px', fontWeight: 700, color: '#111' }}>
                          {rightNum <= problems.length ? rightNum : ''}
                        </td>
                        <td style={{ border: '1px solid #d1d5db', padding: '8px 12px', textAlign: 'center', fontSize: '18px', fontWeight: 700, color: '#2563eb' }}>
                          {rightP ? <AnswerDisplay answer={rightP.answer} className="text-blue-600" /> : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 해설지 섹션 */}
          {printSections.solution && (
            <div className="print-section bg-white p-8">
              <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #1f2937', paddingBottom: '12px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111' }}>{selectedExam.title}</h2>
                <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>해설지</p>
              </div>
              <div style={{ columns: 2, columnGap: '30px' }}>
                {problems.map((problem) => (
                  <div key={problem.id} style={{ breakInside: 'avoid', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', background: '#1f2937', color: 'white', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
                        {problem.number}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', borderRadius: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '4px 8px', fontSize: '12px', fontWeight: 700, color: '#1d4ed8' }}>
                        정답 <AnswerDisplay answer={problem.answer} className="text-blue-700" />
                      </span>
                    </div>
                    <div style={{ marginLeft: '12px', paddingLeft: '16px', borderLeft: '2px solid #bfdbfe', fontSize: '14px', color: '#374151', lineHeight: 1.6 }} className="whitespace-pre-line">
                      <MixedContentRenderer content={problem.solution} className="text-gray-700" />
                    </div>
                    <div style={{ marginTop: '12px', borderBottom: '1px dashed #d1d5db' }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
