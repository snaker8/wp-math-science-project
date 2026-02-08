'use client';

// ============================================================================
// Tutor Analytics Dashboard Page
// 튜터/교사용 학생 학습 분석 대시보드
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  RefreshCw,
  Download,
  Calendar,
  Users,
  ChevronDown,
  Search,
} from 'lucide-react';
import { Heatmap } from '@/components/analytics';
import { generateMockHeatmapData } from '@/lib/analytics/heatmap';
import type { HeatmapData } from '@/types/analytics';

// Mock 학생 목록 (실제 구현 시 API에서 가져옴)
const mockStudents = [
  { id: 'student-1', name: '김철수', grade: '고1' },
  { id: 'student-2', name: '이영희', grade: '고2' },
  { id: 'student-3', name: '박민수', grade: '고1' },
  { id: 'student-4', name: '정수진', grade: '고3' },
  { id: 'student-5', name: '최준혁', grade: '고2' },
];

export default function TutorAnalyticsPage() {
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState('30days');

  // 필터링된 학생 목록
  const filteredStudents = mockStudents.filter(
    (student) =>
      student.name.includes(searchQuery) ||
      student.grade.includes(searchQuery)
  );

  // 선택된 학생 정보
  const selectedStudentInfo = mockStudents.find(
    (s) => s.id === selectedStudent
  );

  // 데이터 로드
  const loadAnalyticsData = async () => {
    if (!selectedStudent) return;

    setIsLoading(true);
    setError(null);

    try {
      // TODO: 실제 API 호출로 대체
      // const response = await fetch(`/api/analytics/heatmap?studentId=${selectedStudent}&range=${dateRange}`);
      // if (!response.ok) throw new Error('Failed to load analytics data');
      // const data = await response.json();

      // 임시: Mock 데이터 사용
      await new Promise((resolve) => setTimeout(resolve, 500));
      const studentInfo = mockStudents.find((s) => s.id === selectedStudent);
      const mockData = generateMockHeatmapData(
        selectedStudent,
        studentInfo?.name || '알 수 없음'
      );
      setHeatmapData(mockData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '데이터 로드 실패');
    } finally {
      setIsLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedStudent) {
      loadAnalyticsData();
    } else {
      setHeatmapData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent, dateRange]);

  // 유사 문제 생성 핸들러
  const handleGenerateTwin = (typeCode: string) => {
    if (!selectedStudent) return;
    console.log('Generate twin for student:', selectedStudent, 'type:', typeCode);
    alert(
      `학생 "${selectedStudentInfo?.name}"의 유형 코드 "${typeCode}"에 대한 유사 문제를 생성합니다.\n(AI 기반 Twin Generation 기능 - 추후 구현 예정)`
    );
  };

  // CSV 내보내기
  const handleExportCSV = () => {
    if (!heatmapData) return;

    const rows = [
      ['과목', '단원', '유형코드', '유형명', '숙달도', '총시도', '정답', '부분정답(상)', '부분정답(하)', '오답'],
    ];

    heatmapData.rows.forEach((row) => {
      row.cells.forEach((cell) => {
        rows.push([
          cell.subject,
          cell.chapter,
          cell.typeCode,
          cell.typeName,
          String(cell.masteryScore),
          String(cell.totalAttempts),
          String(cell.correctCount),
          String(cell.partialCorrectCount),
          String(cell.partialWrongCount),
          String(cell.wrongCount),
        ]);
      });
    });

    const csvContent = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `학습분석_${heatmapData.studentName}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="analytics-page">
      {/* 페이지 헤더 */}
      <header className="page-header">
        <div className="header-content">
          <div className="header-info">
            <h1 className="page-title">
              <BarChart3 size={28} />
              학생 학습 분석
            </h1>
            <p className="page-description">
              학생별 문제 유형 숙달도를 분석하여 맞춤 학습을 지원합니다.
            </p>
          </div>

          <div className="header-actions">
            {selectedStudent && (
              <>
                <div className="date-filter">
                  <Calendar size={16} />
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                  >
                    <option value="7days">최근 7일</option>
                    <option value="30days">최근 30일</option>
                    <option value="90days">최근 90일</option>
                    <option value="all">전체 기간</option>
                  </select>
                </div>

                <button
                  className="action-button secondary"
                  onClick={handleExportCSV}
                  disabled={!heatmapData}
                >
                  <Download size={16} />
                  CSV 내보내기
                </button>

                <button
                  className="action-button primary"
                  onClick={loadAnalyticsData}
                  disabled={isLoading}
                >
                  <RefreshCw size={16} className={isLoading ? 'spinning' : ''} />
                  새로고침
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 학생 선택 섹션 */}
      <div className="student-selector-section">
        <div className="student-selector-container">
          <div className="selector-label">
            <Users size={18} />
            학생 선택
          </div>

          <div className="student-dropdown">
            <button
              className="dropdown-trigger"
              onClick={() => setIsStudentDropdownOpen(!isStudentDropdownOpen)}
            >
              {selectedStudentInfo ? (
                <span className="selected-student">
                  {selectedStudentInfo.name}
                  <span className="student-grade">{selectedStudentInfo.grade}</span>
                </span>
              ) : (
                <span className="placeholder">학생을 선택하세요</span>
              )}
              <ChevronDown size={18} />
            </button>

            {isStudentDropdownOpen && (
              <div className="dropdown-menu">
                <div className="search-box">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="이름 또는 학년으로 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="student-list">
                  {filteredStudents.map((student) => (
                    <button
                      key={student.id}
                      className={`student-item ${selectedStudent === student.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedStudent(student.id);
                        setIsStudentDropdownOpen(false);
                        setSearchQuery('');
                      }}
                    >
                      <span className="student-name">{student.name}</span>
                      <span className="student-grade">{student.grade}</span>
                    </button>
                  ))}

                  {filteredStudents.length === 0 && (
                    <div className="no-results">검색 결과가 없습니다.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <main className="main-content">
        {!selectedStudent && (
          <div className="empty-state">
            <Users size={48} />
            <h3>학생을 선택해주세요</h3>
            <p>상단에서 학생을 선택하면 학습 분석 히트맵이 표시됩니다.</p>
          </div>
        )}

        {selectedStudent && isLoading && (
          <div className="loading-state">
            <RefreshCw size={32} className="spinning" />
            <p>분석 데이터를 불러오는 중...</p>
          </div>
        )}

        {selectedStudent && error && (
          <div className="error-state">
            <p>{error}</p>
            <button onClick={loadAnalyticsData}>다시 시도</button>
          </div>
        )}

        {selectedStudent && !isLoading && !error && heatmapData && (
          <Heatmap data={heatmapData} onGenerateTwin={handleGenerateTwin} />
        )}
      </main>

      {/* 클릭 외부 영역 감지 */}
      {isStudentDropdownOpen && (
        <div
          className="dropdown-overlay"
          onClick={() => setIsStudentDropdownOpen(false)}
        />
      )}

      <style jsx>{`
        .analytics-page {
          min-height: 100vh;
          background: #f3f4f6;
        }

        .page-header {
          background: white;
          border-bottom: 1px solid #e5e7eb;
          padding: 24px 32px;
        }

        .header-content {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
        }

        .header-info {
          flex: 1;
        }

        .page-title {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 24px;
          font-weight: 700;
          color: #1f2937;
          margin: 0 0 8px 0;
        }

        .page-description {
          font-size: 14px;
          color: #6b7280;
          margin: 0;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .date-filter {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          color: #6b7280;
        }

        .date-filter select {
          border: none;
          background: transparent;
          font-size: 13px;
          color: #1f2937;
          cursor: pointer;
        }

        .action-button {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 500;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-button.primary {
          color: white;
          background: #4f46e5;
          border: none;
        }

        .action-button.primary:hover:not(:disabled) {
          background: #4338ca;
        }

        .action-button.secondary {
          color: #374151;
          background: white;
          border: 1px solid #d1d5db;
        }

        .action-button.secondary:hover:not(:disabled) {
          background: #f9fafb;
        }

        .action-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .student-selector-section {
          max-width: 1400px;
          margin: 24px auto 0;
          padding: 0 32px;
        }

        .student-selector-container {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
        }

        .selector-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }

        .student-dropdown {
          position: relative;
          flex: 1;
          max-width: 320px;
        }

        .dropdown-trigger {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 14px;
          background: #f9fafb;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .dropdown-trigger:hover {
          border-color: #9ca3af;
        }

        .selected-student {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #1f2937;
          font-weight: 500;
        }

        .placeholder {
          color: #9ca3af;
        }

        .student-grade {
          font-size: 12px;
          color: #6b7280;
          background: #e5e7eb;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .dropdown-menu {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
          z-index: 100;
          overflow: hidden;
        }

        .search-box {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid #e5e7eb;
          color: #6b7280;
        }

        .search-box input {
          flex: 1;
          border: none;
          background: transparent;
          font-size: 14px;
          outline: none;
        }

        .student-list {
          max-height: 240px;
          overflow-y: auto;
        }

        .student-item {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border: none;
          background: transparent;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .student-item:hover {
          background: #f9fafb;
        }

        .student-item.selected {
          background: #eef2ff;
        }

        .student-item .student-name {
          color: #1f2937;
        }

        .no-results {
          padding: 20px;
          text-align: center;
          color: #9ca3af;
          font-size: 13px;
        }

        .dropdown-overlay {
          position: fixed;
          inset: 0;
          z-index: 50;
        }

        .main-content {
          max-width: 1400px;
          margin: 0 auto;
          padding: 24px 32px;
        }

        .empty-state,
        .loading-state,
        .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 20px;
          background: white;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
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

        .loading-state p,
        .error-state p {
          margin: 16px 0 0;
          font-size: 14px;
        }

        .error-state button {
          margin-top: 16px;
          padding: 8px 16px;
          font-size: 13px;
          color: #4f46e5;
          background: #eef2ff;
          border: 1px solid #c7d2fe;
          border-radius: 6px;
          cursor: pointer;
        }

        .error-state button:hover {
          background: #e0e7ff;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 768px) {
          .page-header {
            padding: 20px;
          }

          .header-content {
            flex-direction: column;
          }

          .header-actions {
            width: 100%;
            flex-wrap: wrap;
          }

          .student-selector-section {
            padding: 0 20px;
          }

          .student-selector-container {
            flex-direction: column;
            align-items: flex-start;
          }

          .student-dropdown {
            width: 100%;
            max-width: none;
          }

          .main-content {
            padding: 20px;
          }
        }
      `}</style>
    </div>
  );
}
