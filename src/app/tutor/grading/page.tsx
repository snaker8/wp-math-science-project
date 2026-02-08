'use client';

// ============================================================================
// Deep Grading Page - 4단계 정밀 채점 + 실시간 히트맵 연동
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckSquare,
  Users,
  ChevronDown,
  BarChart3,
  RefreshCw,
  Sparkles,
  Filter,
} from 'lucide-react';
import { DeepGradingPanel } from '@/components/workflow';
import { Heatmap } from '@/components/analytics';
import { generateMockHeatmapData } from '@/lib/analytics/heatmap';
import {
  subscribeToGradingEvents,
  emitGradingEvent,
  GRADING_WEIGHTS,
  type GradingEvent,
} from '@/lib/workflow/deep-grading';
import type { HeatmapData } from '@/types/analytics';
import type { GradingStatus, GradingRecord } from '@/types/workflow';

// Mock 데이터
const mockStudents = [
  { id: 'student-1', name: '김철수', grade: '고1' },
  { id: 'student-2', name: '이영희', grade: '고2' },
  { id: 'student-3', name: '박민수', grade: '고1' },
];

const mockExams = [
  { id: 'exam-1', title: '1학기 중간고사', date: '2024-04-15' },
  { id: 'exam-2', title: '단원평가 - 이차방정식', date: '2024-03-20' },
];

interface StudentAnswer {
  id: string;
  examId: string;
  studentId: string;
  studentName: string;
  problemId: string;
  problemNumber: number;
  problemContent: string;
  problemTypeCode: string;
  problemTypeName: string;
  answerText?: string;
  answerLatex?: string;
  answerImage?: string;
  currentStatus?: GradingStatus;
  feedback?: string;
  timeSpent?: number;
}

// Mock 답안 생성
function generateMockAnswers(studentId: string, studentName: string): StudentAnswer[] {
  const problems = [
    {
      id: 'prob-1',
      content: '<p>이차방정식 $x^2 - 5x + 6 = 0$의 두 근을 구하시오.</p>',
      typeCode: 'MA1-EQU-002',
      typeName: '이차방정식의 풀이',
    },
    {
      id: 'prob-2',
      content: '<p>$\\lim_{x \\to 0} \\frac{\\sin 3x}{x}$의 값을 구하시오.</p>',
      typeCode: 'MA2-LIM-001',
      typeName: '삼각함수의 극한',
    },
    {
      id: 'prob-3',
      content: '<p>$\\int_0^2 (x^2 + 1) dx$의 값을 구하시오.</p>',
      typeCode: 'CAL-INT-002',
      typeName: '정적분의 계산',
    },
    {
      id: 'prob-4',
      content: '<p>등차수열 $\\{a_n\\}$에서 $a_3 = 7$, $a_7 = 19$일 때, $a_{10}$의 값을 구하시오.</p>',
      typeCode: 'MA1-SEQ-001',
      typeName: '등차수열',
    },
    {
      id: 'prob-5',
      content: '<p>이차함수 $y = x^2 - 4x + 3$의 꼭짓점의 좌표를 구하시오.</p>',
      typeCode: 'MA1-FUN-003',
      typeName: '이차함수의 그래프',
    },
  ];

  return problems.map((prob, idx) => ({
    id: `answer-${studentId}-${prob.id}`,
    examId: 'exam-1',
    studentId,
    studentName,
    problemId: prob.id,
    problemNumber: idx + 1,
    problemContent: prob.content,
    problemTypeCode: prob.typeCode,
    problemTypeName: prob.typeName,
    answerText: ['x = 2, x = 3', '3', '14/3', '28', '(2, -1)'][idx],
    timeSpent: Math.floor(Math.random() * 300) + 60,
    currentStatus: idx === 2 ? 'WRONG' : undefined, // 3번 문제는 이미 오답 처리
  }));
}

export default function GradingPage() {
  // 상태
  const [selectedExamId, setSelectedExamId] = useState<string>(mockExams[0].id);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(mockStudents[0].id);
  const [answers, setAnswers] = useState<StudentAnswer[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [gradingHistory, setGradingHistory] = useState<GradingRecord[]>([]);

  // 학생 정보
  const selectedStudent = mockStudents.find((s) => s.id === selectedStudentId);

  // 초기 데이터 로드
  useEffect(() => {
    if (selectedStudentId && selectedStudent) {
      // 답안 로드
      const studentAnswers = generateMockAnswers(selectedStudentId, selectedStudent.name);
      setAnswers(studentAnswers);

      // 히트맵 데이터 로드
      const heatmap = generateMockHeatmapData(selectedStudentId, selectedStudent.name);
      setHeatmapData(heatmap);
    }
  }, [selectedStudentId, selectedStudent]);

  // 채점 이벤트 구독 (히트맵 실시간 업데이트)
  useEffect(() => {
    const unsubscribe = subscribeToGradingEvents((event: GradingEvent) => {
      console.log('[Grading Page] Event received:', event);

      // 히트맵 데이터 갱신 - 해당 유형의 성취도 즉시 반영
      setHeatmapData((prev) => {
        if (!prev || event.studentId !== selectedStudentId) return prev;

        // 실제로는 API에서 새 데이터를 가져와야 함
        // 여기서는 간단히 lastUpdated만 갱신
        return {
          ...prev,
          lastUpdated: new Date().toISOString(),
          summary: {
            ...prev.summary,
            // 채점 결과에 따라 취약/주의/양호 카운트 업데이트
          },
        };
      });

      // 채점 기록 추가
      setGradingHistory((prev) => [event.record, ...prev.slice(0, 19)]);
    });

    return () => unsubscribe();
  }, [selectedStudentId]);

  // 채점 핸들러
  const handleGrade = useCallback(
    async (answerId: string, status: GradingStatus, feedback?: string) => {
      const answer = answers.find((a) => a.id === answerId);
      if (!answer) return;

      // API 호출 (실제 구현)
      try {
        const response = await fetch('/api/workflow/grading', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            examRecordId: `record-${answer.examId}-${answer.studentId}`,
            examProblemId: `ep-${answer.problemId}`,
            problemId: answer.problemId,
            status,
            feedback,
          }),
        });

        if (!response.ok) {
          console.error('Grading API failed');
        }
      } catch (error) {
        console.error('Grading error:', error);
      }

      // 로컬 상태 업데이트
      setAnswers((prev) =>
        prev.map((a) =>
          a.id === answerId ? { ...a, currentStatus: status, feedback } : a
        )
      );

      // 채점 이벤트 발생 → 히트맵 자동 업데이트
      emitGradingEvent({
        type: answer.currentStatus ? 'GRADE_UPDATED' : 'GRADE_ADDED',
        studentId: answer.studentId,
        record: {
          id: answerId,
          examId: answer.examId,
          studentId: answer.studentId,
          problemId: answer.problemId,
          gradedBy: 'current-tutor',
          status,
          score: GRADING_WEIGHTS[status],
          feedback,
          gradedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    },
    [answers]
  );

  // 채점 완료 핸들러
  const handleGradingComplete = useCallback(() => {
    alert('모든 답안 채점이 완료되었습니다!');
  }, []);

  // 쌍둥이 문제 생성 핸들러
  const handleGenerateTwin = useCallback((typeCode: string) => {
    const wrongAnswers = answers.filter(
      (a) => a.currentStatus === 'WRONG' || a.currentStatus === 'PARTIAL_WRONG'
    );

    if (wrongAnswers.length === 0) {
      alert('오답/부분오답 문제가 없습니다.');
      return;
    }

    // 해당 유형의 오답 문제 찾기
    const targetAnswer = wrongAnswers.find((a) => a.problemTypeCode === typeCode);

    if (targetAnswer) {
      console.log('Generate twin for:', targetAnswer.problemId);
      // 쌍둥이 문제 생성 페이지로 이동 또는 모달 표시
    }
  }, [answers]);

  // 채점 통계
  const gradingStats = useMemo(() => {
    const graded = answers.filter((a) => a.currentStatus);
    const correct = answers.filter((a) => a.currentStatus === 'CORRECT').length;
    const partialCorrect = answers.filter((a) => a.currentStatus === 'PARTIAL_CORRECT').length;
    const partialWrong = answers.filter((a) => a.currentStatus === 'PARTIAL_WRONG').length;
    const wrong = answers.filter((a) => a.currentStatus === 'WRONG').length;

    return {
      total: answers.length,
      graded: graded.length,
      correct,
      partialCorrect,
      partialWrong,
      wrong,
      progress: answers.length > 0 ? Math.round((graded.length / answers.length) * 100) : 0,
    };
  }, [answers]);

  return (
    <div className="grading-page">
      {/* 헤더 */}
      <header className="page-header">
        <div className="header-content">
          <h1>
            <CheckSquare size={28} />
            4단계 정밀 채점
          </h1>
          <p>정답 / 부분정답 / 부분오답 / 오답 으로 세분화하여 채점합니다.</p>
        </div>

        <div className="header-controls">
          {/* 시험 선택 */}
          <div className="select-wrapper">
            <Filter size={16} />
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
            >
              {mockExams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.title}
                </option>
              ))}
            </select>
            <ChevronDown size={16} />
          </div>

          {/* 학생 선택 */}
          <div className="select-wrapper">
            <Users size={16} />
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
            >
              {mockStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name} ({student.grade})
                </option>
              ))}
            </select>
            <ChevronDown size={16} />
          </div>

          {/* 히트맵 토글 */}
          <button
            className={`toggle-heatmap-btn ${showHeatmap ? 'active' : ''}`}
            onClick={() => setShowHeatmap(!showHeatmap)}
          >
            <BarChart3 size={16} />
            <span>히트맵</span>
          </button>
        </div>
      </header>

      {/* 채점 통계 */}
      <div className="stats-bar">
        <div className="stat-item">
          <span className="stat-label">진행률</span>
          <span className="stat-value">{gradingStats.progress}%</span>
          <div className="stat-bar">
            <div className="stat-fill" style={{ width: `${gradingStats.progress}%` }} />
          </div>
        </div>
        <div className="stat-item correct">
          <span className="stat-label">정답</span>
          <span className="stat-value">{gradingStats.correct}</span>
        </div>
        <div className="stat-item partial-correct">
          <span className="stat-label">부분정답</span>
          <span className="stat-value">{gradingStats.partialCorrect}</span>
        </div>
        <div className="stat-item partial-wrong">
          <span className="stat-label">부분오답</span>
          <span className="stat-value">{gradingStats.partialWrong}</span>
        </div>
        <div className="stat-item wrong">
          <span className="stat-label">오답</span>
          <span className="stat-value">{gradingStats.wrong}</span>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <main className={`main-content ${showHeatmap ? 'with-heatmap' : ''}`}>
        {/* 채점 패널 */}
        <div className="grading-panel-container">
          <DeepGradingPanel
            answers={answers}
            examTitle={mockExams.find((e) => e.id === selectedExamId)?.title}
            onGrade={handleGrade}
            onComplete={handleGradingComplete}
          />
        </div>

        {/* 히트맵 사이드바 */}
        {showHeatmap && heatmapData && (
          <aside className="heatmap-sidebar">
            <div className="sidebar-header">
              <h3>
                <BarChart3 size={18} />
                실시간 성취도 히트맵
              </h3>
              <button className="refresh-btn">
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="heatmap-container">
              <Heatmap
                data={heatmapData}
                onGenerateTwin={handleGenerateTwin}
              />
            </div>

            {/* 오답 문제 퀵 액션 */}
            {gradingStats.wrong + gradingStats.partialWrong > 0 && (
              <div className="wrong-problems-action">
                <Sparkles size={16} />
                <span>오답/부분오답 {gradingStats.wrong + gradingStats.partialWrong}개</span>
                <button className="generate-twins-btn">
                  쌍둥이 문제 생성
                </button>
              </div>
            )}
          </aside>
        )}
      </main>

      <style jsx>{`
        .grading-page {
          min-height: 100vh;
          background: #000000;
          color: #ffffff;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 32px;
          background: rgba(24, 24, 27, 0.8);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(8px);
        }

        .header-content h1 {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 0 0 8px;
          font-size: 22px;
          font-weight: 700;
          color: #ffffff;
        }

        .header-content p {
          margin: 0;
          font-size: 13px;
          color: #a1a1aa;
        }

        .header-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .select-wrapper {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: rgba(39, 39, 42, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #e4e4e7;
        }

        .select-wrapper select {
          border: none;
          background: transparent;
          font-size: 13px;
          font-weight: 500;
          color: #ffffff;
          cursor: pointer;
          appearance: none;
          padding-right: 4px;
        }

        .select-wrapper select option {
          background: #27272a;
          color: #ffffff;
        }

        .toggle-heatmap-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 500;
          color: #a1a1aa;
          background: rgba(39, 39, 42, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .toggle-heatmap-btn:hover {
          background: rgba(63, 63, 70, 0.5);
          color: #e4e4e7;
        }

        .toggle-heatmap-btn.active {
          color: #a5b4fc;
          background: rgba(79, 70, 229, 0.15);
          border-color: rgba(99, 102, 241, 0.5);
        }

        .stats-bar {
          display: flex;
          align-items: center;
          gap: 24px;
          padding: 16px 32px;
          background: rgba(24, 24, 27, 0.5);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .stat-item:first-child {
          flex: 1;
          max-width: 200px;
        }

        .stat-label {
          font-size: 12px;
          color: #a1a1aa;
        }

        .stat-value {
          font-size: 16px;
          font-weight: 700;
          color: #ffffff;
        }

        .stat-bar {
          flex: 1;
          height: 6px;
          background: rgba(63, 63, 70, 0.5);
          border-radius: 3px;
          overflow: hidden;
        }

        .stat-fill {
          height: 100%;
          background: #6366f1;
          transition: width 0.3s;
        }

        .stat-item.correct .stat-value { color: #4ade80; }
        .stat-item.partial-correct .stat-value { color: #fbbf24; }
        .stat-item.partial-wrong .stat-value { color: #fb923c; }
        .stat-item.wrong .stat-value { color: #f87171; }

        .main-content {
          display: flex;
          gap: 24px;
          padding: 24px 32px;
          max-width: 1600px;
          margin: 0 auto;
        }

        .main-content.with-heatmap {
          display: grid;
          grid-template-columns: 1fr 400px;
        }

        .grading-panel-container {
          min-height: 600px;
        }

        .heatmap-sidebar {
          background: rgba(24, 24, 27, 0.6);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden;
        }

        .sidebar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: rgba(39, 39, 42, 0.5);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .sidebar-header h3 {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: #e4e4e7;
        }

        .refresh-btn {
          padding: 6px;
          background: none;
          border: none;
          color: #71717a;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
        }

        .refresh-btn:hover {
          background: rgba(63, 63, 70, 0.5);
          color: #e4e4e7;
        }

        .heatmap-container {
          max-height: 500px;
          overflow: auto;
        }

        .wrong-problems-action {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 16px 20px;
          background: rgba(220, 38, 38, 0.15);
          border-top: 1px solid rgba(248, 113, 113, 0.2);
          color: #f87171;
          font-size: 13px;
        }

        .generate-twins-btn {
          margin-left: auto;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          color: white;
          background: #dc2626;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .generate-twins-btn:hover {
          background: #b91c1c;
        }

        @media (max-width: 1200px) {
          .main-content.with-heatmap {
            grid-template-columns: 1fr;
          }

          .heatmap-sidebar {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
