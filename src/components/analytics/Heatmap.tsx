'use client';

// ============================================================================
// Student Analytics Heatmap Component
// 학생 채점 데이터 기반 숙달도 히트맵
// ============================================================================

import React, { useState, useMemo } from 'react';
import { AlertTriangle, TrendingUp, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import type { HeatmapData, HeatmapCell, HeatmapRow, MasteryLevel } from '@/types/analytics';
import { MASTERY_COLORS, COGNITIVE_DOMAIN_LABELS } from '@/types/analytics';
import TypeDetailModal from './TypeDetailModal';

interface HeatmapProps {
  data: HeatmapData;
  onGenerateTwin?: (typeCode: string) => void;
}

export default function Heatmap({ data, onGenerateTwin }: HeatmapProps) {
  const [selectedCell, setSelectedCell] = useState<HeatmapCell | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [filterSubject, setFilterSubject] = useState<string>('all');

  // 과목 목록 추출
  const subjects = useMemo(() => {
    const subjectSet = new Set(data.rows.map((row) => row.subject));
    return Array.from(subjectSet).sort();
  }, [data.rows]);

  // 필터링된 행
  const filteredRows = useMemo(() => {
    if (filterSubject === 'all') return data.rows;
    return data.rows.filter((row) => row.subject === filterSubject);
  }, [data.rows, filterSubject]);

  // 챕터 확장/축소 토글
  const toggleChapter = (chapterKey: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterKey)) {
        next.delete(chapterKey);
      } else {
        next.add(chapterKey);
      }
      return next;
    });
  };

  // 모든 챕터 확장
  const expandAll = () => {
    const allKeys = filteredRows.map((row) => `${row.subject}::${row.chapter}`);
    setExpandedChapters(new Set(allKeys));
  };

  // 모든 챕터 축소
  const collapseAll = () => {
    setExpandedChapters(new Set());
  };

  // 셀 색상 가져오기
  const getCellStyle = (level: MasteryLevel) => ({
    backgroundColor: MASTERY_COLORS[level].bg,
    borderColor: MASTERY_COLORS[level].border,
    color: MASTERY_COLORS[level].text,
  });

  return (
    <div className="heatmap-container">
      {/* 요약 카드 */}
      <div className="summary-section">
        <h3 className="section-title">학습 현황 요약</h3>
        <div className="summary-cards">
          <div className="summary-card overall">
            <div className="card-icon">
              <TrendingUp size={20} />
            </div>
            <div className="card-content">
              <span className="card-value">{data.summary.overallMastery}%</span>
              <span className="card-label">전체 숙달도</span>
            </div>
          </div>

          <div className="summary-card danger">
            <div className="card-icon">
              <AlertTriangle size={20} />
            </div>
            <div className="card-content">
              <span className="card-value">{data.summary.dangerCount}</span>
              <span className="card-label">취약 유형</span>
            </div>
          </div>

          <div className="summary-card warning">
            <div className="card-icon">
              <Clock size={20} />
            </div>
            <div className="card-content">
              <span className="card-value">{data.summary.warningCount}</span>
              <span className="card-label">주의 유형</span>
            </div>
          </div>

          <div className="summary-card good">
            <div className="card-icon">
              <TrendingUp size={20} />
            </div>
            <div className="card-content">
              <span className="card-value">{data.summary.goodCount}</span>
              <span className="card-label">양호 유형</span>
            </div>
          </div>
        </div>
      </div>

      {/* 필터 및 컨트롤 */}
      <div className="controls-section">
        <div className="filter-group">
          <label>과목 필터:</label>
          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
          >
            <option value="all">전체</option>
            {subjects.map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
        </div>

        <div className="expand-controls">
          <button onClick={expandAll}>모두 펼치기</button>
          <button onClick={collapseAll}>모두 접기</button>
        </div>
      </div>

      {/* 범례 */}
      <div className="legend">
        <span className="legend-label">숙달도:</span>
        <div className="legend-item">
          <span className="legend-color danger" />
          <span>0~30% (취약)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color warning" />
          <span>31~70% (주의)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color good" />
          <span>71~100% (양호)</span>
        </div>
      </div>

      {/* 히트맵 그리드 */}
      <div className="heatmap-grid">
        {filteredRows.map((row) => {
          const chapterKey = `${row.subject}::${row.chapter}`;
          const isExpanded = expandedChapters.has(chapterKey);

          return (
            <div key={chapterKey} className="chapter-section">
              {/* 챕터 헤더 */}
              <div
                className="chapter-header"
                onClick={() => toggleChapter(chapterKey)}
              >
                <div className="chapter-toggle">
                  {isExpanded ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                </div>
                <div className="chapter-info">
                  <span className="chapter-subject">{row.subject}</span>
                  <span className="chapter-name">{row.chapter}</span>
                </div>
                <div className="chapter-stats">
                  <span className="chapter-mastery">
                    평균 {row.avgMastery}%
                  </span>
                  <span className="chapter-count">
                    {row.cells.length}개 유형
                  </span>
                </div>
              </div>

              {/* 셀 그리드 */}
              {isExpanded && (
                <div className="cells-grid">
                  {row.cells.map((cell) => (
                    <button
                      key={cell.id}
                      className={`heatmap-cell ${cell.masteryLevel}`}
                      style={getCellStyle(cell.masteryLevel)}
                      onClick={() => setSelectedCell(cell)}
                      title={`${cell.typeName}: ${cell.masteryScore}%`}
                    >
                      <span className="cell-name">{cell.typeName}</span>
                      <span className="cell-score">{Math.round(cell.masteryScore)}%</span>
                      <span className="cell-attempts">{cell.totalAttempts}회</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 상세 모달 */}
      {selectedCell && (
        <TypeDetailModal
          cell={selectedCell}
          onClose={() => setSelectedCell(null)}
          onGenerateTwin={onGenerateTwin}
        />
      )}

      <style jsx>{`
        .heatmap-container {
          background: white;
          border-radius: 12px;
          padding: 24px;
          border: 1px solid #e5e7eb;
        }

        .section-title {
          font-size: 16px;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 16px;
        }

        .summary-section {
          margin-bottom: 24px;
        }

        .summary-cards {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .summary-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          border-radius: 10px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
        }

        .summary-card.overall {
          background: #eef2ff;
          border-color: #c7d2fe;
        }

        .summary-card.overall .card-icon {
          color: #4f46e5;
        }

        .summary-card.danger {
          background: #fef2f2;
          border-color: #fecaca;
        }

        .summary-card.danger .card-icon {
          color: #dc2626;
        }

        .summary-card.warning {
          background: #fffbeb;
          border-color: #fde68a;
        }

        .summary-card.warning .card-icon {
          color: #d97706;
        }

        .summary-card.good {
          background: #ecfdf5;
          border-color: #a7f3d0;
        }

        .summary-card.good .card-icon {
          color: #059669;
        }

        .card-content {
          display: flex;
          flex-direction: column;
        }

        .card-value {
          font-size: 24px;
          font-weight: 700;
          color: #1f2937;
        }

        .card-label {
          font-size: 12px;
          color: #6b7280;
        }

        .controls-section {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .filter-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .filter-group label {
          font-size: 13px;
          color: #6b7280;
        }

        .filter-group select {
          padding: 6px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 13px;
        }

        .expand-controls {
          display: flex;
          gap: 8px;
        }

        .expand-controls button {
          padding: 6px 12px;
          font-size: 12px;
          color: #6b7280;
          background: #f3f4f6;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          cursor: pointer;
        }

        .expand-controls button:hover {
          background: #e5e7eb;
        }

        .legend {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 12px 16px;
          background: #f9fafb;
          border-radius: 8px;
          margin-bottom: 20px;
          font-size: 13px;
        }

        .legend-label {
          color: #6b7280;
          font-weight: 500;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #4b5563;
        }

        .legend-color {
          width: 16px;
          height: 16px;
          border-radius: 4px;
        }

        .legend-color.danger {
          background: #fee2e2;
          border: 1px solid #fecaca;
        }

        .legend-color.warning {
          background: #fef3c7;
          border: 1px solid #fde68a;
        }

        .legend-color.good {
          background: #d1fae5;
          border: 1px solid #a7f3d0;
        }

        .heatmap-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .chapter-section {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          overflow: hidden;
        }

        .chapter-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: #f9fafb;
          cursor: pointer;
          transition: background 0.2s;
        }

        .chapter-header:hover {
          background: #f3f4f6;
        }

        .chapter-toggle {
          color: #6b7280;
        }

        .chapter-info {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .chapter-subject {
          font-size: 12px;
          color: #6b7280;
          background: #e5e7eb;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .chapter-name {
          font-size: 14px;
          font-weight: 600;
          color: #1f2937;
        }

        .chapter-stats {
          display: flex;
          align-items: center;
          gap: 16px;
          font-size: 13px;
        }

        .chapter-mastery {
          color: #4f46e5;
          font-weight: 500;
        }

        .chapter-count {
          color: #9ca3af;
        }

        .cells-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 10px;
          padding: 16px;
          background: white;
        }

        .heatmap-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 12px;
          border: 2px solid;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
          min-height: 80px;
        }

        .heatmap-cell:hover {
          transform: scale(1.03);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .heatmap-cell.danger:hover {
          box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2);
        }

        .cell-name {
          font-size: 12px;
          font-weight: 500;
          margin-bottom: 4px;
          line-height: 1.3;
        }

        .cell-score {
          font-size: 18px;
          font-weight: 700;
        }

        .cell-attempts {
          font-size: 11px;
          opacity: 0.8;
          margin-top: 2px;
        }

        @media (max-width: 1024px) {
          .summary-cards {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 640px) {
          .summary-cards {
            grid-template-columns: 1fr;
          }

          .controls-section {
            flex-direction: column;
            gap: 12px;
            align-items: flex-start;
          }

          .legend {
            flex-wrap: wrap;
          }

          .cells-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}
