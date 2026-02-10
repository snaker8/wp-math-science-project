'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ClipboardList,
  GripVertical,
  PanelLeftClose,
  Loader2,
  FileText,
  BookOpen,
  Search,
  RefreshCw,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ProblemCard } from '@/components/papers/ProblemCard';
import { ExamAnalyticsSidebar } from '@/components/papers/ExamAnalyticsSidebar';

// ============================================================================
// Types
// ============================================================================

interface Exam {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  unit: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  time_limit_minutes: number | null;
  problemCount?: number;
}

interface Problem {
  id: string;
  content_latex: string | null;
  solution_latex: string | null;
  answer_json: Record<string, any> | null;
  status: string;
  source_name: string | null;
  ai_analysis: Record<string, any> | null;
  tags: string[] | null;
  created_at: string;
  classifications?: {
    type_code: string;
    difficulty: string;
    cognitive_domain: string;
    ai_confidence: number;
  }[];
}

interface ExamProblemMeta {
  problem_id: string;
  order_index: number;
  points: number;
}

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
        ? 'border-zinc-800 bg-zinc-900/90 text-zinc-300'
        : 'border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-500'
    }`}
  >
    {children}
  </span>
);

const ResizeHandle: React.FC = () => (
  <div className="relative flex w-px items-center justify-center bg-zinc-700 after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 cursor-col-resize hover:bg-indigo-500 transition-colors">
    <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-zinc-600 bg-zinc-700">
      <GripVertical className="h-2.5 w-2.5 text-zinc-500" />
    </div>
  </div>
);

// ============================================================================
// Main Page Component
// ============================================================================

export default function PapersPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full bg-zinc-900 text-zinc-500">로딩 중...</div>}>
      <PapersContent />
    </Suspense>
  );
}

function PapersContent() {
  const searchParams = useSearchParams();
  const [exams, setExams] = useState<Exam[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [examProblemsMeta, setExamProblemsMeta] = useState<ExamProblemMeta[]>([]);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [loadingExams, setLoadingExams] = useState(true);
  const [loadingProblems, setLoadingProblems] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [initialExamLoaded, setInitialExamLoaded] = useState(false);

  // 시험지(exams) 목록 로드
  useEffect(() => {
    loadExams();
  }, []);

  // URL에서 examId 파라미터로 자동 선택
  useEffect(() => {
    if (initialExamLoaded || loadingExams || exams.length === 0) return;
    const examId = searchParams.get('examId');
    if (examId) {
      const found = exams.find((e) => e.id === examId);
      if (found) {
        handleSelectExam(found);
      }
    }
    setInitialExamLoaded(true);
  }, [exams, loadingExams, initialExamLoaded, searchParams]);

  const loadExams = async () => {
    setLoadingExams(true);

    if (!supabaseBrowser) {
      // Supabase 미설정 시 빈 배열
      setExams([]);
      setLoadingExams(false);
      return;
    }

    try {
      const { data: { user } } = await supabaseBrowser.auth.getUser();

      let query = supabaseBrowser
        .from('exams')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      // 로그인한 경우: 본인 시험지 + 소속 없는 시험지
      if (user) {
        query = query.or(`created_by.eq.${user.id},created_by.is.null`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Failed to load exams:', error);
        setExams([]);
        return;
      }

      setExams(data || []);
    } catch (err) {
      console.error('Error loading exams:', err);
      setExams([]);
    } finally {
      setLoadingExams(false);
    }
  };

  // 선택된 시험지의 문제 목록 로드
  const loadProblems = async (examId: string) => {
    setLoadingProblems(true);
    setProblems([]);
    setExamProblemsMeta([]);

    if (!supabaseBrowser) {
      setLoadingProblems(false);
      return;
    }

    try {
      // exam_problems 테이블을 통해 연결된 문제 조회
      const { data: examProblems, error: epError } = await supabaseBrowser
        .from('exam_problems')
        .select('problem_id, order_index, points')
        .eq('exam_id', examId)
        .order('order_index', { ascending: true });

      if (epError) {
        console.error('Failed to load exam_problems:', epError);
        await loadProblemsDirectly();
        return;
      }

      if (!examProblems || examProblems.length === 0) {
        await loadProblemsDirectly();
        return;
      }

      // exam_problems 메타데이터 보존
      const meta: ExamProblemMeta[] = examProblems.map((ep: any) => ({
        problem_id: ep.problem_id,
        order_index: ep.order_index,
        points: ep.points,
      }));
      setExamProblemsMeta(meta);

      const problemIds = meta.map((ep) => ep.problem_id);

      const { data, error } = await supabaseBrowser
        .from('problems')
        .select(`
          id, content_latex, solution_latex, answer_json, status,
          source_name, ai_analysis, tags, created_at,
          classifications (type_code, difficulty, cognitive_domain, ai_confidence)
        `)
        .in('id', problemIds)
        .is('deleted_at', null);

      if (error) {
        console.error('Failed to load problems:', error);
        setProblems([]);
      } else {
        // order_index 순서로 정렬
        const orderMap = new Map(meta.map((ep) => [ep.problem_id, ep.order_index]));
        const sorted = (data || []).sort(
          (a: any, b: any) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999)
        );
        setProblems(sorted);
      }
    } catch (err) {
      console.error('Error loading problems:', err);
      await loadProblemsDirectly();
    } finally {
      setLoadingProblems(false);
    }
  };

  // exam_problems 연결 없이 직접 모든 문제 조회 (fallback)
  const loadProblemsDirectly = async () => {
    if (!supabaseBrowser) return;

    try {
      const { data: { user } } = await supabaseBrowser.auth.getUser();

      let query = supabaseBrowser
        .from('problems')
        .select(`
          id, content_latex, solution_latex, answer_json, status,
          source_name, ai_analysis, tags, created_at,
          classifications (type_code, difficulty, cognitive_domain, ai_confidence)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200);

      if (user) {
        query = query.or(`created_by.eq.${user.id},created_by.is.null`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Fallback query failed:', error);
        setProblems([]);
      } else {
        setProblems(data || []);
      }
    } catch (err) {
      console.error('Fallback query error:', err);
      setProblems([]);
    }
  };

  // 시험지 선택 시 문제 로드
  const handleSelectExam = (exam: Exam) => {
    setSelectedExam(exam);
    loadProblems(exam.id);
  };

  // 필터된 시험지
  const filteredExams = exams.filter((exam) => {
    const matchesSearch = !searchQuery ||
      exam.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (exam.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesSubject = !subjectFilter || exam.subject === subjectFilter;
    return matchesSearch && matchesSubject;
  });

  // 문제에 대한 배점 조회
  const getPoints = (problemId: string): number | undefined => {
    const meta = examProblemsMeta.find((ep) => ep.problem_id === problemId);
    return meta?.points;
  };

  return (
    <div className="p-0 w-full bg-zinc-900 h-full px-4 py-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="w-full flex items-center justify-between gap-x-4 pb-1 flex-shrink-0">
        <div className="flex items-center gap-3 flex-shrink-0">
          <h1 className="text-lg font-semibold text-white pl-2">시험지 저장소</h1>
          <div className="relative ml-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
            <input
              type="text"
              placeholder="검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-3 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 w-48"
            />
          </div>
        </div>
        <div className="flex flex-1 min-w-0 items-center justify-end gap-2">
          <button
            onClick={loadExams}
            className="inline-flex h-8 items-center gap-1.5 px-3 rounded-md border border-zinc-700 bg-transparent text-zinc-400 hover:bg-zinc-800 text-sm transition-all"
          >
            <RefreshCw size={14} />
            새로고침
          </button>
          <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-700 bg-transparent text-zinc-400 hover:bg-zinc-800 active:bg-zinc-700 transition-all">
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content - 2 Panel Layout */}
      <div className="flex-1 min-h-0 w-full pb-2 font-pretendard text-sm overflow-auto">
        <section className="h-full w-full overflow-hidden">
          <div className="flex h-full gap-3">
            {/* Left Panel - 시험지 목록 */}
            <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden pr-1" style={{ width: '35%' }}>
              {/* Exam List Header */}
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/95 px-5 py-3 flex-shrink-0">
                <Badge>
                  {loadingExams ? '로딩...' : `시험지 ${filteredExams.length}개`}
                </Badge>
                <button
                  onClick={() => {
                    // 시험지 없이 전체 문제 보기
                    setSelectedExam(null);
                    setLoadingProblems(true);
                    loadProblemsDirectly().finally(() => setLoadingProblems(false));
                  }}
                  className="group flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-500 transition-all hover:-translate-y-0.5 hover:border-indigo-500 hover:bg-zinc-800"
                >
                  <BookOpen className="size-4" />
                  <span className="leading-none">전체 문제 보기</span>
                </button>
              </div>

              {/* Exam List */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/95 p-2">
                <div className="flex-1 overflow-y-auto">
                  {loadingExams ? (
                    <div className="flex items-center justify-center py-12 gap-2 text-zinc-500">
                      <Loader2 className="animate-spin" size={20} />
                      <span>시험지 로딩 중...</span>
                    </div>
                  ) : filteredExams.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {filteredExams.map((exam) => (
                        <div
                          key={exam.id}
                          onClick={() => handleSelectExam(exam)}
                          className={`cursor-pointer rounded-xl px-4 py-3 transition-colors ${
                            selectedExam?.id === exam.id
                              ? 'bg-indigo-500/10 border-l-2 border-indigo-500'
                              : 'hover:bg-zinc-800'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <FileText size={14} className="text-indigo-400 flex-shrink-0" />
                                <span className="text-sm font-medium text-white truncate">
                                  {exam.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-zinc-500">
                                {exam.subject && <span>{exam.subject}</span>}
                                <span>{new Date(exam.created_at).toLocaleDateString('ko-KR')}</span>
                              </div>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              exam.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
                              exam.status === 'DRAFT' ? 'bg-zinc-500/20 text-zinc-400' :
                              'bg-indigo-500/20 text-indigo-400'
                            }`}>
                              {exam.status === 'COMPLETED' ? '완료' : exam.status === 'DRAFT' ? '임시' : exam.status}
                            </span>
                          </div>
                          {exam.description && (
                            <p className="mt-1 text-xs text-zinc-600 truncate pl-6">
                              {exam.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                      <ClipboardList size={32} className="mb-3 opacity-50" />
                      <p className="text-sm font-medium mb-1">저장된 시험지가 없습니다</p>
                      <p className="text-xs text-zinc-600">문제를 업로드하면 자동으로 시험지가 생성됩니다</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <ResizeHandle />

            {/* Right Panel - 시험지 뷰어 + 분석 */}
            <div className="flex-1 h-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/95">
              {loadingProblems ? (
                <div className="flex items-center justify-center h-full gap-2 text-zinc-500">
                  <Loader2 className="animate-spin" size={20} />
                  <span>문제 로딩 중...</span>
                </div>
              ) : problems.length > 0 ? (
                <div className="h-full flex">
                  {/* 시험지 뷰어 (좌측 70%) */}
                  <div className="flex-1 h-full flex flex-col min-w-0" style={{ flex: '7' }}>
                    {/* 시험지 헤더 */}
                    <div className="border-b border-gray-200 bg-white px-6 py-4 rounded-tl-2xl shrink-0">
                      <h2 className="text-xl font-bold text-gray-900 text-center">
                        {selectedExam?.title || '전체 문제'}
                      </h2>
                      <div className="text-xs text-gray-500 text-center mt-1">
                        {selectedExam?.subject && <span>{selectedExam.subject}</span>}
                        {selectedExam?.unit && <span> / {selectedExam.unit}</span>}
                        <span> [{problems.length} 문항]</span>
                      </div>
                      <div className="flex items-center justify-end mt-2 text-xs text-gray-400">
                        <span>학생</span>
                        <span className="inline-block w-20 border-b border-gray-300 ml-2" />
                      </div>
                    </div>

                    {/* 2단 문제 그리드 */}
                    <div className="flex-1 overflow-y-auto bg-white p-6">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-0">
                        {/* 좌측 컬럼 */}
                        <div className="border-r border-gray-100 pr-4">
                          {problems.slice(0, Math.ceil(problems.length / 2)).map((problem, idx) => (
                            <ProblemCard
                              key={problem.id}
                              index={idx + 1}
                              problem={problem}
                              points={getPoints(problem.id)}
                            />
                          ))}
                        </div>
                        {/* 우측 컬럼 */}
                        <div className="pl-4">
                          {problems.slice(Math.ceil(problems.length / 2)).map((problem, idx) => (
                            <ProblemCard
                              key={problem.id}
                              index={Math.ceil(problems.length / 2) + idx + 1}
                              problem={problem}
                              points={getPoints(problem.id)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 분석 사이드바 (우측 30%) */}
                  <div className="h-full shrink-0 overflow-hidden" style={{ flex: '3' }}>
                    <ExamAnalyticsSidebar problems={problems} />
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-zinc-300">
                  <BookOpen size={40} className="text-zinc-700" />
                  <span className="font-medium">저장된 자산이 없습니다</span>
                  <span className="text-xs text-zinc-500 text-center max-w-xs">
                    {selectedExam
                      ? '이 시험지에 연결된 문제가 없습니다.'
                      : '왼쪽 목록에서 시험지를 선택하거나, "전체 문제 보기"를 클릭하세요.'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
