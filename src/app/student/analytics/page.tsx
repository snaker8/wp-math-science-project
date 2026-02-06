'use client';

// ============================================================================
// Student Analytics Dashboard Page
// 학생 학습 분석 대시보드 (히트맵 시각화)
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  RefreshCw,
  Download,
  Calendar,
  User,
} from 'lucide-react';
import { Heatmap } from '@/components/analytics';
import { generateMockHeatmapData } from '@/lib/analytics/heatmap';
import type { HeatmapData } from '@/types/analytics';

export default function StudentAnalyticsPage() {
  const router = useRouter();
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState('30days');

  // 데이터 로드
  const loadAnalyticsData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // TODO: 실제 API 호출로 대체
      // const response = await fetch(`/api/analytics/heatmap?range=${dateRange}`);
      // if (!response.ok) throw new Error('Failed to load analytics data');
      // const data = await response.json();

      // 임시: Mock 데이터 사용
      await new Promise((resolve) => setTimeout(resolve, 500)); // 로딩 시뮬레이션
      const mockData = generateMockHeatmapData('student-1', '홍길동');
      setHeatmapData(mockData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '데이터 로드 실패');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalyticsData();
  }, [dateRange]);

  // 유사 문제 생성 핸들러
  const handleGenerateTwin = (typeCode: string) => {
    console.log('Generate twin for:', typeCode);
    // TODO: 실제 유사 문제 생성 로직
    // router.push(`/student/practice/twin?type=${typeCode}`);
    alert(`유형 코드 "${typeCode}"에 대한 유사 문제를 생성합니다.\n(AI 기반 Twin Generation 기능 - 추후 구현 예정)`);
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
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
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
              학습 분석
            </h1>
            <p className="page-description">
              문제 유형별 숙달도를 분석하여 취약점을 파악합니다.
            </p>
          </div>

          <div className="header-actions">
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
          </div>
        </div>
      </header>

      {/* 학생 정보 배너 */}
      {heatmapData && (
        <div className="student-banner">
          <div className="student-info">
            <div className="student-avatar">
              <User size={24} />
            </div>
            <div className="student-details">
              <span className="student-name">{heatmapData.studentName}</span>
              <span className="student-meta">
                마지막 업데이트: {new Date(heatmapData.lastUpdated).toLocaleString('ko-KR')}
              </span>
            </div>
          </div>
          <div className="student-stats">
            <span className="stat">총 {heatmapData.summary.totalTypes}개 유형 학습</span>
          </div>
        </div>
      )}

      {/* 메인 콘텐츠 */}
      <main className="main-content">
        {isLoading && (
          <div className="loading-state">
            <RefreshCw size={32} className="spinning" />
            <p>분석 데이터를 불러오는 중...</p>
          </div>
        )}

        {error && (
          <div className="error-state">
            <p>{error}</p>
            <button onClick={loadAnalyticsData}>다시 시도</button>
          </div>
        )}

        {!isLoading && !error && heatmapData && (
          <Heatmap
            data={heatmapData}
            onGenerateTwin={handleGenerateTwin}
          />
        )}
      </main>

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

        .student-banner {
          max-width: 1400px;
          margin: 24px auto 0;
          padding: 0 32px;
        }

        .student-banner > div {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: linear-gradient(135deg, #4f46e5, #6366f1);
          border-radius: 12px;
          color: white;
        }

        .student-info {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .student-avatar {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .student-details {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .student-name {
          font-size: 16px;
          font-weight: 600;
        }

        .student-meta {
          font-size: 12px;
          opacity: 0.8;
        }

        .student-stats {
          font-size: 13px;
          opacity: 0.9;
        }

        .main-content {
          max-width: 1400px;
          margin: 0 auto;
          padding: 24px 32px;
        }

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

          .student-banner {
            padding: 0 20px;
          }

          .student-banner > div {
            flex-direction: column;
            gap: 12px;
            text-align: center;
          }

          .main-content {
            padding: 20px;
          }
        }
      `}</style>
    </div>
  );
}
