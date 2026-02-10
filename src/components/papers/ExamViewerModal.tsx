'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2, BarChart3, Printer, Download, ZoomIn, ZoomOut } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ProblemCard } from './ProblemCard';
import { ExamAnalyticsSidebar } from './ExamAnalyticsSidebar';

// ============================================================================
// Types
// ============================================================================

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

interface ExamViewerModalProps {
  examId: string;
  examTitle: string;
  onClose: () => void;
}

// ============================================================================
// ExamViewerModal
// ============================================================================

export function ExamViewerModal({ examId, examTitle, onClose }: ExamViewerModalProps) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [examProblemsMeta, setExamProblemsMeta] = useState<ExamProblemMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [examInfo, setExamInfo] = useState<{
    subject?: string;
    unit?: string;
    grade?: string;
    description?: string;
  }>({});

  useEffect(() => {
    loadExamData();
  }, [examId]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const loadExamData = async () => {
    setLoading(true);

    if (!supabaseBrowser) {
      setLoading(false);
      return;
    }

    try {
      // 시험 정보 로드
      const { data: examData } = await supabaseBrowser
        .from('exams')
        .select('subject, unit, grade, description')
        .eq('id', examId)
        .single();

      if (examData) {
        setExamInfo(examData);
      }

      // exam_problems 통해 문제 로드
      const { data: examProblems, error: epError } = await supabaseBrowser
        .from('exam_problems')
        .select('problem_id, order_index, points')
        .eq('exam_id', examId)
        .order('order_index', { ascending: true });

      if (epError || !examProblems || examProblems.length === 0) {
        setLoading(false);
        return;
      }

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

      if (!error && data) {
        const orderMap = new Map(meta.map((ep) => [ep.problem_id, ep.order_index]));
        const sorted = data.sort(
          (a: any, b: any) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999)
        );
        setProblems(sorted);
      }
    } catch (err) {
      console.error('Error loading exam data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPoints = (problemId: string): number | undefined => {
    const meta = examProblemsMeta.find((ep) => ep.problem_id === problemId);
    return meta?.points;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 컨테이너 */}
      <div className="relative z-10 flex h-[90vh] w-[90vw] max-w-7xl overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* 좌측: 시험지 뷰어 */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* 시험지 헤더 - 실제 시험지 스타일 */}
          <div className="border-b border-gray-200 bg-white px-8 py-5 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                {examInfo.grade && (
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    {examInfo.grade}
                  </span>
                )}
                {examInfo.subject && (
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    {examInfo.subject}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAnalytics(!showAnalytics)}
                  className={`p-2 rounded-lg transition-colors ${
                    showAnalytics
                      ? 'bg-indigo-100 text-indigo-600'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                  title="분석 사이드바"
                >
                  <BarChart3 size={16} />
                </button>
                <button
                  className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                  title="인쇄"
                >
                  <Printer size={16} />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-500 transition-colors"
                  title="닫기"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <h2 className="text-xl font-bold text-gray-900 text-center">
              {examTitle}
            </h2>
            <div className="text-xs text-gray-500 text-center mt-1">
              {examInfo.subject && <span>{examInfo.subject}</span>}
              {examInfo.unit && <span> / {examInfo.unit}</span>}
              {problems.length > 0 && (
                <span> [{problems.length} 문항]</span>
              )}
            </div>

            {/* 학생 이름 기입란 */}
            <div className="flex items-center justify-end mt-3 text-xs text-gray-400">
              <span>학생</span>
              <span className="inline-block w-24 border-b border-gray-300 ml-2" />
            </div>
          </div>

          {/* 시험지 본문 - 2단 배치 */}
          <div className="flex-1 overflow-y-auto bg-white">
            {loading ? (
              <div className="flex items-center justify-center h-full gap-2 text-gray-400">
                <Loader2 className="animate-spin" size={20} />
                <span>문제 로딩 중...</span>
              </div>
            ) : problems.length > 0 ? (
              <div className="p-6">
                <div className="grid grid-cols-2 gap-x-6 gap-y-0">
                  {/* 좌측 컬럼 */}
                  <div className="border-r border-gray-100 pr-4">
                    {problems
                      .slice(0, Math.ceil(problems.length / 2))
                      .map((problem, idx) => (
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
                    {problems
                      .slice(Math.ceil(problems.length / 2))
                      .map((problem, idx) => (
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
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <p className="text-sm font-medium mb-1">이 시험지에 연결된 문제가 없습니다</p>
                  <p className="text-xs text-gray-300">문제를 업로드하면 자동으로 연결됩니다</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 우측: 분석 사이드바 (토글) */}
        {showAnalytics && problems.length > 0 && (
          <div className="w-80 shrink-0 border-l border-zinc-700 overflow-hidden">
            <ExamAnalyticsSidebar problems={problems} />
          </div>
        )}
      </div>
    </div>
  );
}
