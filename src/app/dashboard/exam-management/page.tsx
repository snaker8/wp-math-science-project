'use client';

import React, { useState, useMemo, useEffect } from 'react';
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
// Mock Data
// ============================================================================

const MOCK_GROUPS: ExamGroup[] = [
  { id: 'all', name: '전체', children: [] },
  { id: 'g1', name: '금곡고', children: [] },
  { id: 'g2', name: '용인고', children: [] },
];

function generateMockExamProblems(): ExamProblem[] {
  return [
    {
      id: 'ep1', number: 1, difficulty: 2,
      content: '$x - y = -3$, $xy = 3$일 때, $\\frac{x^2}{y} - \\frac{y^2}{x}$ 의 값은?',
      choices: ['① $-18$', '② $-9$', '③ $-3$', '④ $3$', '⑤ $18$'],
      answer: 1,
      solution: '$\\frac{x^2}{y} - \\frac{y^2}{x} = \\frac{x^3-y^3}{xy} = \\frac{(x-y)(x^2+xy+y^2)}{xy}$\n$x-y=-3$, $(x-y)^2=9$, $x^2+y^2=9+6=15$\n$= \\frac{(-3)(15+3)}{3} = -18$',
    },
    {
      id: 'ep2', number: 2, difficulty: 3,
      content: '이차방정식 $2x^2 + kx - 3 = 0$의 두 근이 $\\alpha$, $\\beta$이고\n$(1-\\alpha)(2-2\\beta) = 6$일 때, $(1+\\alpha)(1+\\beta)$의 값은?',
      choices: ['① $-7$', '② $-6$', '③ $-5$', '④ $-4$', '⑤ $-3$'],
      answer: 4,
      solution: '근과 계수의 관계: $\\alpha+\\beta=-\\frac{k}{2}$, $\\alpha\\beta=-\\frac{3}{2}$\n$(1-\\alpha)(1-\\beta)=3$이므로 $k=7$\n$(1+\\alpha)(1+\\beta) = 1+(\\alpha+\\beta)+\\alpha\\beta = 1-\\frac{7}{2}-\\frac{3}{2} = -4$',
    },
  ];
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
            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
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
          className="ml-auto p-0.5 text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100"
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
      <span className="text-[10px] text-zinc-500 mb-1">페이지 맵</span>
      <div className="flex flex-col gap-1">
        {Array.from({ length: totalPages }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPageSelect(i + 1)}
            className={`w-8 h-8 rounded text-xs font-bold border transition-colors ${
              currentPage === i + 1
                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                : 'border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
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
  const { exams: dbExams, isLoading: examsLoading } = useExamList();
  const { problems: dbProblems, examInfo, isLoading: problemsLoading } = useExamProblems(selectedExamId);

  const mockProblems = useMemo(() => generateMockExamProblems(), []);

  // DB 문제 → ExamProblem 형식으로 변환 (mock fallback)
  const problems: ExamProblem[] = useMemo(() => {
    if (dbProblems.length > 0) {
      return dbProblems.map((p) => ({
        id: p.id,
        number: p.number,
        content: p.content,
        choices: p.choices,
        answer: p.answer,
        solution: p.solution,
        difficulty: p.difficulty,
      }));
    }
    return mockProblems;
  }, [dbProblems, mockProblems]);

  // 시험지 목록 (DB 데이터 우선, fallback mock)
  const examList = useMemo(() => {
    if (dbExams.length > 0) return dbExams;
    return [];
  }, [dbExams]);

  // 선택된 시험지 목록 (그룹 필터는 추후 구현, 현재는 전체)
  const groupExams = useMemo(() => {
    if (selectedGroupId === 'all') return examList;
    // 그룹 필터링 로직 (추후 DB에 group 컬럼 추가 시 활용)
    return examList;
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

  const selectedGroupName = useMemo(() => {
    return MOCK_GROUPS.find((g) => g.id === selectedGroupId)?.name || '전체';
  }, [selectedGroupId]);

  const circledNumbers = ['', '①', '②', '③', '④', '⑤'];
  const totalPages = Math.max(1, Math.ceil(problems.length / 10));

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black text-white">
      {/* ======== Header ======== */}
      <div className="flex items-center justify-between border-b border-zinc-800/50 px-5 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-white">시험지 관리</h1>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-zinc-500">과목</span>
            <button
              type="button"
              className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
            >
              {subjectFilter}
              <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
            </button>
          </div>
        </div>
      </div>

      {/* ======== Main 3-Panel Layout ======== */}
      <div className="flex flex-1 overflow-hidden">
        {/* --- 좌측: 시험지 그룹 트리 --- */}
        <div className="w-52 flex-shrink-0 border-r border-zinc-800/50 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800/50">
            <span className="text-xs font-bold text-zinc-300">
              시험지 그룹 <span className="text-cyan-400">{MOCK_GROUPS.length - 1}개</span>
            </span>
            <button
              type="button"
              className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-cyan-400 transition-colors"
            >
              <Plus className="h-3 w-3" />
              최상위 그룹 추가
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {MOCK_GROUPS.map((group) => (
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
        <div className="w-80 flex-shrink-0 border-r border-zinc-800/50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/50">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-bold text-zinc-200">{selectedGroupName}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-cyan-400 transition-colors"
              >
                <Plus className="h-3 w-3" />
                시험지 생성
              </button>
              <span className="text-xs text-zinc-600">{examsLoading ? '...' : `${groupExams.length}개`}</span>
            </div>
          </div>

          <div className="px-3 py-2 border-b border-zinc-800/30">
            <span className="text-[10px] text-zinc-500 uppercase">시험지명</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {groupExams.map((exam) => (
              <button
                key={exam.id}
                type="button"
                onClick={() => setSelectedExamId(exam.id)}
                className={`w-full flex items-start gap-2 px-3 py-2.5 text-left border-b border-zinc-800/30 transition-colors ${
                  selectedExamId === exam.id
                    ? 'bg-cyan-500/5 border-l-2 border-l-cyan-500'
                    : 'hover:bg-zinc-900 border-l-2 border-l-transparent'
                }`}
              >
                <FileText className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                  selectedExamId === exam.id ? 'text-cyan-400' : 'text-zinc-600'
                }`} />
                <span className={`text-sm leading-snug ${
                  selectedExamId === exam.id ? 'text-cyan-300 font-medium' : 'text-zinc-400'
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
                <div className="flex items-center justify-center py-8 border-b border-zinc-800/50">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm">
                    <div className="h-4 w-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                    문제를 불러오는 중...
                  </div>
                </div>
              )}
              {/* 액션 바 */}
              <div className="flex items-center justify-between border-b border-zinc-800/50 px-4 py-2 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <button type="button" className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                    시험지 수정
                  </button>
                  <button type="button" className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 transition-colors">
                    <Printer className="h-3.5 w-3.5" />
                    출력
                  </button>
                  <button type="button" className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 transition-colors">
                    <Share2 className="h-3.5 w-3.5" />
                    시험지 배포
                  </button>
                  <button type="button" className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 transition-colors">
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
                        : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
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
                        : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
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
                        : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    <BookOpenCheck className="h-3.5 w-3.5" />
                    해설지
                  </button>
                  <button
                    type="button"
                    className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                    title="삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* 뷰어 영역 */}
              <div className="flex flex-1 overflow-hidden">
                {/* 시험지 뷰 */}
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 flex justify-center py-4 bg-zinc-950/30">
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
                <div className="w-14 flex-shrink-0 border-l border-zinc-800/50 flex flex-col items-center py-3">
                  <PageMap
                    totalPages={totalPages}
                    currentPage={currentPage}
                    onPageSelect={setCurrentPage}
                  />
                </div>
              </div>

              {/* 하단 컨트롤 바 */}
              <div className="flex items-center justify-between border-t border-zinc-800/50 px-4 py-2 flex-shrink-0 bg-zinc-950/50">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 rounded-lg border border-zinc-700 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setColumns(1)}
                      className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                        columns === 1
                          ? 'bg-cyan-500/10 text-cyan-400'
                          : 'text-zinc-500 hover:text-zinc-300'
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
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <Columns2 className="h-3.5 w-3.5" />
                      2단
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">gap : {gap}</span>
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
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
              <FileText className="h-12 w-12 text-zinc-700 mb-3" />
              <p className="text-sm">시험지를 선택해주세요</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
