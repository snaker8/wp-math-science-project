'use client';

// ============================================================================
// 수작(Suzag) 완전학습 워크플로우 통합 페이지
// Cloud Flow → Deep Grading → Zero-Wrong Loop
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Upload,
  CheckSquare,
  RefreshCw,
  ArrowRight,
  BarChart3,
  Users,
  ChevronDown,
} from 'lucide-react';
import { CloudFlowUploader, DeepGradingPanel, ZeroWrongLoop } from '@/components/workflow';
import { Heatmap } from '@/components/analytics';
import { generateMockHeatmapData } from '@/lib/analytics/heatmap';
import { subscribeToGradingEvents, type GradingEvent } from '@/lib/workflow/deep-grading';
import type { HeatmapData, HeatmapCell } from '@/types/analytics';
import type { LLMAnalysisResult, GradingStatus } from '@/types/workflow';

type WorkflowPhase = 'upload' | 'grading' | 'analytics';

// Mock 학생 데이터
const mockStudents = [
  { id: 'student-1', name: '김철수' },
  { id: 'student-2', name: '이영희' },
  { id: 'student-3', name: '박민수' },
];

// Mock 답안 데이터
const mockAnswers = [
  {
    id: 'answer-1',
    examId: 'exam-1',
    studentId: 'student-1',
    studentName: '김철수',
    problemId: 'problem-1',
    problemNumber: 1,
    problemContent: '<p>이차방정식 $x^2 - 5x + 6 = 0$의 두 근을 구하시오.</p>',
    answerText: 'x = 2, x = 3',
    timeSpent: 180,
  },
  {
    id: 'answer-2',
    examId: 'exam-1',
    studentId: 'student-1',
    studentName: '김철수',
    problemId: 'problem-2',
    problemNumber: 2,
    problemContent: '<p>$\\lim_{x \\to 0} \\frac{\\sin x}{x}$의 값을 구하시오.</p>',
    answerText: '1',
    timeSpent: 120,
  },
  {
    id: 'answer-3',
    examId: 'exam-1',
    studentId: 'student-1',
    studentName: '김철수',
    problemId: 'problem-3',
    problemNumber: 3,
    problemContent: '<p>$\\int_0^1 2x dx$의 값을 구하시오.</p>',
    answerText: '2',
    currentStatus: 'WRONG' as GradingStatus,
    timeSpent: 90,
  },
];

export default function TutorWorkflowPage() {
  const [activePhase, setActivePhase] = useState<WorkflowPhase>('upload');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [uploadedProblems, setUploadedProblems] = useState<LLMAnalysisResult[]>([]);
  const [gradedAnswers, setGradedAnswers] = useState(mockAnswers);
  const [wrongProblems, setWrongProblems] = useState<Array<{
    id: string;
    typeCode: string;
    typeName: string;
    contentLatex: string;
  }>>([]);

  // 학생 선택 시 히트맵 데이터 로드
  useEffect(() => {
    if (selectedStudentId) {
      const student = mockStudents.find((s) => s.id === selectedStudentId);
      const data = generateMockHeatmapData(selectedStudentId, student?.name || '');
      setHeatmapData(data);

      // 오답 문제 추출
      const wrongs = data.rows.flatMap((row) =>
        row.cells
          .filter((cell) => cell.masteryLevel === 'danger')
          .map((cell) => ({
            id: `problem-${cell.typeCode}`,
            typeCode: cell.typeCode,
            typeName: cell.typeName,
            contentLatex: `${cell.typeName} 관련 문제`,
          }))
      );
      setWrongProblems(wrongs.slice(0, 5)); // 최대 5개
    }
  }, [selectedStudentId]);

  // 채점 이벤트 구독 (히트맵 실시간 업데이트)
  useEffect(() => {
    const unsubscribe = subscribeToGradingEvents((event: GradingEvent) => {
      console.log('Grading event:', event);

      // 히트맵 데이터 갱신
      if (selectedStudentId === event.studentId && heatmapData) {
        // 실제 구현에서는 API에서 새로운 데이터 fetch
        setHeatmapData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            lastUpdated: new Date().toISOString(),
          };
        });
      }

      // 채점 상태 업데이트
      setGradedAnswers((prev) =>
        prev.map((answer) =>
          answer.id === event.record.id
            ? { ...answer, currentStatus: event.record.status }
            : answer
        )
      );
    });

    return () => unsubscribe();
  }, [selectedStudentId, heatmapData]);

  // 업로드 완료 핸들러
  const handleUploadComplete = useCallback((results: LLMAnalysisResult[]) => {
    setUploadedProblems(results);
    console.log('Uploaded problems:', results);
  }, []);

  // 채점 핸들러
  const handleGrade = useCallback(
    async (answerId: string, status: GradingStatus, feedback?: string) => {
      // API 호출 (실제 구현)
      try {
        await fetch('/api/workflow/grading', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            examRecordId: 'mock-record',
            examProblemId: 'mock-problem',
            problemId: answerId,
            status,
            feedback,
          }),
        });
      } catch (error) {
        console.error('Grading API error:', error);
      }

      // 로컬 상태 업데이트
      setGradedAnswers((prev) =>
        prev.map((a) => (a.id === answerId ? { ...a, currentStatus: status, feedback } : a))
      );
    },
    []
  );

  // 유사 문제 생성 핸들러 (히트맵에서 호출)
  const handleGenerateTwin = useCallback((typeCode: string) => {
    setActivePhase('analytics');
    // 해당 유형의 문제를 wrongProblems에 추가
    const problem = {
      id: `problem-${typeCode}`,
      typeCode,
      typeName: `${typeCode} 유형`,
      contentLatex: `유형 코드 ${typeCode}에 해당하는 문제`,
    };
    setWrongProblems((prev) => {
      if (prev.some((p) => p.typeCode === typeCode)) return prev;
      return [...prev, problem];
    });
  }, []);

  const phases = [
    { id: 'upload' as WorkflowPhase, label: '업로드 & 자산화', icon: Upload },
    { id: 'grading' as WorkflowPhase, label: '4단계 채점', icon: CheckSquare },
    { id: 'analytics' as WorkflowPhase, label: '분석 & 클리닉', icon: BarChart3 },
  ];

  return (
    <div className="workflow-page">
      {/* 헤더 */}
      <header className="page-header">
        <div className="header-content">
          <h1>
            <RefreshCw size={28} />
            완전학습 워크플로우
          </h1>
          <p>업로드 → 자동분류 → 4단계 채점 → 유사문제 처방</p>
        </div>

        {/* 학생 선택 */}
        <div className="student-selector">
          <Users size={18} />
          <select
            value={selectedStudentId || ''}
            onChange={(e) => setSelectedStudentId(e.target.value || null)}
          >
            <option value="">학생 선택</option>
            {mockStudents.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
          <ChevronDown size={16} />
        </div>
      </header>

      {/* 단계 네비게이션 */}
      <nav className="phase-nav">
        {phases.map((phase, index) => (
          <React.Fragment key={phase.id}>
            <button
              className={`phase-button ${activePhase === phase.id ? 'active' : ''}`}
              onClick={() => setActivePhase(phase.id)}
            >
              <phase.icon size={20} />
              <span>{phase.label}</span>
            </button>
            {index < phases.length - 1 && (
              <div className="phase-arrow">
                <ArrowRight size={20} />
              </div>
            )}
          </React.Fragment>
        ))}
      </nav>

      {/* 메인 콘텐츠 */}
      <main className="main-content">
        {/* Phase 1: Cloud Flow (업로드 → 자산화) */}
        {activePhase === 'upload' && (
          <div className="phase-content">
            <div className="phase-header">
              <h2>1. Cloud Flow: 업로드 & 자산화</h2>
              <p>PDF/이미지를 업로드하면 OCR + GPT-4o가 자동으로 유형 분류와 해설을 생성합니다.</p>
            </div>
            <CloudFlowUploader
              instituteId="default"
              userId="tutor-1"
              onComplete={handleUploadComplete}
            />
            {uploadedProblems.length > 0 && (
              <div className="upload-summary">
                <h4>분석 완료</h4>
                <p>{uploadedProblems.length}개 문제가 자산화되었습니다.</p>
                <button
                  className="next-phase-btn"
                  onClick={() => setActivePhase('grading')}
                >
                  채점하러 가기 <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Phase 2: Deep Grading (4단계 채점) */}
        {activePhase === 'grading' && (
          <div className="phase-content">
            <div className="phase-header">
              <h2>2. Deep Grading: 4단계 정밀 채점</h2>
              <p>정답/부분정답/부분오답/오답으로 세분화하여 채점하고 즉시 히트맵에 반영합니다.</p>
            </div>
            <div className="grading-layout">
              <div className="grading-panel-wrapper">
                <DeepGradingPanel
                  answers={gradedAnswers}
                  examTitle="테스트 시험"
                  onGrade={handleGrade}
                  onComplete={() => setActivePhase('analytics')}
                />
              </div>
              {selectedStudentId && heatmapData && (
                <div className="heatmap-preview">
                  <h4>실시간 히트맵 (미리보기)</h4>
                  <div className="mini-heatmap">
                    <Heatmap
                      data={heatmapData}
                      onGenerateTwin={handleGenerateTwin}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Phase 3: Analytics & Zero-Wrong Loop */}
        {activePhase === 'analytics' && (
          <div className="phase-content">
            <div className="phase-header">
              <h2>3. 분석 & 오답 제로 루프</h2>
              <p>히트맵에서 취약점을 파악하고, 유사 문제를 생성하여 클리닉 시험지를 만듭니다.</p>
            </div>
            <div className="analytics-layout">
              {selectedStudentId && heatmapData ? (
                <>
                  <div className="heatmap-full">
                    <Heatmap
                      data={heatmapData}
                      onGenerateTwin={handleGenerateTwin}
                    />
                  </div>
                  {wrongProblems.length > 0 && (
                    <div className="zero-wrong-wrapper">
                      <ZeroWrongLoop
                        studentId={selectedStudentId}
                        studentName={
                          mockStudents.find((s) => s.id === selectedStudentId)?.name || ''
                        }
                        wrongProblems={wrongProblems}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <Users size={48} />
                  <h3>학생을 선택해주세요</h3>
                  <p>상단에서 학생을 선택하면 분석 데이터가 표시됩니다.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .workflow-page {
          min-height: 100vh;
          background: #f3f4f6;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px 32px;
          background: white;
          border-bottom: 1px solid #e5e7eb;
        }

        .header-content h1 {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 0 0 8px;
          font-size: 24px;
          font-weight: 700;
          color: #1f2937;
        }

        .header-content p {
          margin: 0;
          font-size: 14px;
          color: #6b7280;
        }

        .student-selector {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          background: #f9fafb;
          border: 1px solid #d1d5db;
          border-radius: 10px;
          color: #374151;
        }

        .student-selector select {
          border: none;
          background: transparent;
          font-size: 14px;
          font-weight: 500;
          color: #1f2937;
          cursor: pointer;
          appearance: none;
          padding-right: 20px;
        }

        .phase-nav {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 16px;
          padding: 20px 32px;
          background: white;
          border-bottom: 1px solid #e5e7eb;
        }

        .phase-button {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 24px;
          font-size: 14px;
          font-weight: 600;
          color: #6b7280;
          background: #f9fafb;
          border: 2px solid transparent;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .phase-button:hover {
          background: #f3f4f6;
        }

        .phase-button.active {
          color: #4f46e5;
          background: #eef2ff;
          border-color: #4f46e5;
        }

        .phase-arrow {
          color: #d1d5db;
        }

        .main-content {
          max-width: 1600px;
          margin: 0 auto;
          padding: 24px 32px;
        }

        .phase-content {
          background: white;
          border-radius: 16px;
          border: 1px solid #e5e7eb;
          overflow: hidden;
        }

        .phase-header {
          padding: 24px;
          border-bottom: 1px solid #e5e7eb;
        }

        .phase-header h2 {
          margin: 0 0 8px;
          font-size: 18px;
          font-weight: 700;
          color: #1f2937;
        }

        .phase-header p {
          margin: 0;
          font-size: 14px;
          color: #6b7280;
        }

        .upload-summary {
          padding: 24px;
          background: #dcfce7;
          border-top: 1px solid #bbf7d0;
          text-align: center;
        }

        .upload-summary h4 {
          margin: 0 0 8px;
          color: #16a34a;
        }

        .upload-summary p {
          margin: 0 0 16px;
          color: #15803d;
        }

        .next-phase-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 600;
          color: white;
          background: #16a34a;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }

        .grading-layout {
          display: grid;
          grid-template-columns: 1fr 400px;
          gap: 24px;
          padding: 24px;
        }

        .grading-panel-wrapper {
          min-height: 600px;
        }

        .heatmap-preview {
          background: #f9fafb;
          border-radius: 12px;
          padding: 16px;
        }

        .heatmap-preview h4 {
          margin: 0 0 12px;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }

        .mini-heatmap {
          max-height: 500px;
          overflow: auto;
        }

        .analytics-layout {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .heatmap-full {
          width: 100%;
        }

        .zero-wrong-wrapper {
          width: 100%;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 20px;
          color: #6b7280;
          text-align: center;
        }

        .empty-state h3 {
          margin: 20px 0 8px;
          font-size: 18px;
          font-weight: 600;
          color: #374151;
        }

        .empty-state p {
          margin: 0;
          font-size: 14px;
        }

        @media (max-width: 1200px) {
          .grading-layout {
            grid-template-columns: 1fr;
          }

          .heatmap-preview {
            display: none;
          }
        }

        @media (max-width: 768px) {
          .page-header {
            flex-direction: column;
            gap: 16px;
            text-align: center;
          }

          .phase-nav {
            flex-wrap: wrap;
          }

          .phase-arrow {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
