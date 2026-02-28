'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { useExamList, useExamProblems } from '@/hooks/useExamProblems';

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

  const circledNumbers = ['', '①', '②', '③', '④', '⑤'];
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
                  <button type="button" className="flex items-center gap-1 rounded-lg border border bg-surface-card px-2.5 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-raised transition-colors">
                    <Printer className="h-3.5 w-3.5" />
                    출력
                  </button>
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
                      <div className="p-8">
                        <div className="text-center mb-4">
                          <h2 className="text-lg font-bold text-gray-900">빠른 정답</h2>
                        </div>
                        <div className="grid grid-cols-4 gap-0 border border-gray-400 max-w-md mx-auto">
                          <div className="bg-gray-100 border-b border-r border-gray-400 px-3 py-2 text-center text-xs font-bold text-gray-600">문항</div>
                          <div className="bg-gray-100 border-b border-r border-gray-400 px-3 py-2 text-center text-xs font-bold text-gray-600">정답</div>
                          <div className="bg-gray-100 border-b border-r border-gray-400 px-3 py-2 text-center text-xs font-bold text-gray-600">문항</div>
                          <div className="bg-gray-100 border-b border-gray-400 px-3 py-2 text-center text-xs font-bold text-gray-600">정답</div>
                          {Array.from({ length: Math.ceil(problems.length / 2) }).map((_, rowIdx) => {
                            const leftNum = rowIdx + 1;
                            const rightNum = rowIdx + 1 + Math.ceil(problems.length / 2);
                            const leftP = problems.find((p) => p.number === leftNum);
                            const rightP = problems.find((p) => p.number === rightNum);
                            return (
                              <React.Fragment key={rowIdx}>
                                <div className="border-b border-r border-gray-400 px-3 py-2.5 text-center text-sm font-bold text-gray-900">{leftNum}</div>
                                <div className="border-b border-r border-gray-400 px-3 py-2.5 text-center text-lg font-bold text-blue-600">
                                  {leftP ? (typeof leftP.answer === 'number' ? circledNumbers[leftP.answer] || leftP.answer : leftP.answer) : '-'}
                                </div>
                                <div className="border-b border-r border-gray-400 px-3 py-2.5 text-center text-sm font-bold text-gray-900">
                                  {rightNum <= problems.length ? rightNum : ''}
                                </div>
                                <div className="border-b border-gray-400 px-3 py-2.5 text-center text-lg font-bold text-blue-600">
                                  {rightP ? (typeof rightP.answer === 'number' ? circledNumbers[rightP.answer] || rightP.answer : rightP.answer) : ''}
                                </div>
                              </React.Fragment>
                            );
                          })}
                        </div>
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
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-sm font-bold text-gray-900">{problem.number}.</span>
                              <span className="inline-flex items-center rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-xs font-bold text-blue-700">
                                정답 {typeof problem.answer === 'number' ? circledNumbers[problem.answer] || problem.answer : problem.answer}
                              </span>
                            </div>
                            <div className="pl-5 text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                              <MixedContentRenderer content={problem.solution} className="text-gray-700" />
                            </div>
                            <div className="mt-2 border-b border-gray-200" />
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
                <button
                  type="button"
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
    </div>
  );
}
