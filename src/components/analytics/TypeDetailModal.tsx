'use client';

// ============================================================================
// Type Detail Modal Component
// 취약 유형 상세 정보 및 유사 문제 생성 모달
// ============================================================================

import React from 'react';
import {
  X,
  AlertTriangle,
  TrendingUp,
  Clock,
  Target,
  CheckCircle,
  XCircle,
  MinusCircle,
  Sparkles,
} from 'lucide-react';
import type { HeatmapCell } from '@/types/analytics';
import { MASTERY_COLORS } from '@/types/analytics';

interface TypeDetailModalProps {
  cell: HeatmapCell;
  onClose: () => void;
  onGenerateTwin?: (typeCode: string) => void;
}

export default function TypeDetailModal({
  cell,
  onClose,
  onGenerateTwin,
}: TypeDetailModalProps) {
  const isWeakType = cell.masteryLevel === 'danger';

  // 정답률 계산
  const correctRate =
    cell.totalAttempts > 0
      ? Math.round((cell.correctCount / cell.totalAttempts) * 100)
      : 0;

  // 시간 포맷
  const formatTime = (seconds?: number) => {
    if (!seconds) return '-';
    if (seconds < 60) return `${seconds}초`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}분 ${secs}초`;
  };

  // 날짜 포맷
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div
          className="modal-header"
          style={{
            backgroundColor: MASTERY_COLORS[cell.masteryLevel].bg,
            borderColor: MASTERY_COLORS[cell.masteryLevel].border,
          }}
        >
          <div className="header-content">
            <div className="type-badge">
              <span className="type-code">{cell.typeCode}</span>
            </div>
            <h2 className="type-name">{cell.typeName}</h2>
            <p className="type-location">
              {cell.subject} &gt; {cell.chapter}
              {cell.section && ` > ${cell.section}`}
            </p>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* 숙달도 요약 */}
        <div className="mastery-summary">
          <div
            className="mastery-score"
            style={{ color: MASTERY_COLORS[cell.masteryLevel].text }}
          >
            <span className="score-value">{Math.round(cell.masteryScore)}%</span>
            <span className="score-label">숙달도</span>
          </div>
          <div className="mastery-bar">
            <div
              className="mastery-fill"
              style={{
                width: `${cell.masteryScore}%`,
                backgroundColor: MASTERY_COLORS[cell.masteryLevel].border,
              }}
            />
          </div>
          {isWeakType && (
            <div className="weak-alert">
              <AlertTriangle size={16} />
              <span>취약 유형으로 분류되었습니다. 추가 학습이 필요합니다.</span>
            </div>
          )}
        </div>

        {/* 통계 카드 */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon total">
              <Target size={18} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{cell.totalAttempts}회</span>
              <span className="stat-label">총 시도</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon correct">
              <CheckCircle size={18} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{cell.correctCount}회</span>
              <span className="stat-label">정답</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon partial">
              <MinusCircle size={18} />
            </div>
            <div className="stat-content">
              <span className="stat-value">
                {cell.partialCorrectCount + cell.partialWrongCount}회
              </span>
              <span className="stat-label">부분 정답</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon wrong">
              <XCircle size={18} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{cell.wrongCount}회</span>
              <span className="stat-label">오답</span>
            </div>
          </div>
        </div>

        {/* 상세 정보 */}
        <div className="detail-section">
          <h3 className="section-title">상세 정보</h3>
          <div className="detail-list">
            <div className="detail-item">
              <span className="detail-label">정답률</span>
              <span className="detail-value">{correctRate}%</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">평균 소요 시간</span>
              <span className="detail-value">{formatTime(cell.avgTimeSeconds)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">마지막 시도</span>
              <span className="detail-value">{formatDate(cell.lastAttemptAt)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">부분 정답 (상)</span>
              <span className="detail-value">{cell.partialCorrectCount}회</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">부분 정답 (하)</span>
              <span className="detail-value">{cell.partialWrongCount}회</span>
            </div>
          </div>
        </div>

        {/* 학습 추천 */}
        <div className="recommendation-section">
          <h3 className="section-title">
            <TrendingUp size={16} />
            학습 추천
          </h3>
          <div className="recommendation-content">
            {cell.masteryLevel === 'danger' && (
              <>
                <p>이 유형은 <strong>취약 유형</strong>으로 집중 학습이 필요합니다.</p>
                <ul>
                  <li>기본 개념을 다시 복습하세요.</li>
                  <li>유사 문제를 통해 반복 연습하세요.</li>
                  <li>오답 노트를 작성하여 실수 패턴을 분석하세요.</li>
                </ul>
              </>
            )}
            {cell.masteryLevel === 'warning' && (
              <>
                <p>이 유형은 <strong>주의 유형</strong>으로 보완 학습이 필요합니다.</p>
                <ul>
                  <li>틀린 문제를 다시 풀어보세요.</li>
                  <li>응용 문제에 도전해보세요.</li>
                </ul>
              </>
            )}
            {cell.masteryLevel === 'good' && (
              <>
                <p>이 유형은 <strong>양호</strong>합니다. 현재 수준을 유지하세요.</p>
                <ul>
                  <li>심화 문제에 도전해보세요.</li>
                  <li>다른 취약 유형에 집중하세요.</li>
                </ul>
              </>
            )}
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="action-section">
          {onGenerateTwin && (
            <button
              className={`generate-twin-button ${isWeakType ? 'active' : ''}`}
              onClick={() => onGenerateTwin(cell.typeCode)}
              disabled={!isWeakType}
            >
              <Sparkles size={18} />
              <span>유사 문제 생성 (Twin Generation)</span>
            </button>
          )}
          {!isWeakType && onGenerateTwin && (
            <p className="twin-hint">
              * 취약 유형(붉은색)에서만 유사 문제 생성이 가능합니다.
            </p>
          )}
          <button className="close-action-button" onClick={onClose}>
            닫기
          </button>
        </div>

        <style jsx>{`
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
          }

          .modal-container {
            background: white;
            border-radius: 16px;
            max-width: 520px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 20px 24px;
            border-bottom: 2px solid;
          }

          .header-content {
            flex: 1;
          }

          .type-badge {
            margin-bottom: 8px;
          }

          .type-code {
            font-size: 11px;
            font-weight: 600;
            color: #6b7280;
            background: rgba(255, 255, 255, 0.8);
            padding: 2px 8px;
            border-radius: 4px;
          }

          .type-name {
            font-size: 18px;
            font-weight: 700;
            color: #1f2937;
            margin: 0 0 4px 0;
          }

          .type-location {
            font-size: 13px;
            color: #6b7280;
            margin: 0;
          }

          .close-button {
            background: none;
            border: none;
            color: #6b7280;
            cursor: pointer;
            padding: 4px;
            border-radius: 6px;
            transition: all 0.2s;
          }

          .close-button:hover {
            background: rgba(0, 0, 0, 0.1);
            color: #1f2937;
          }

          .mastery-summary {
            padding: 20px 24px;
            text-align: center;
            border-bottom: 1px solid #e5e7eb;
          }

          .mastery-score {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-bottom: 12px;
          }

          .score-value {
            font-size: 36px;
            font-weight: 800;
          }

          .score-label {
            font-size: 13px;
            color: #6b7280;
          }

          .mastery-bar {
            height: 8px;
            background: #e5e7eb;
            border-radius: 4px;
            overflow: hidden;
          }

          .mastery-fill {
            height: 100%;
            border-radius: 4px;
            transition: width 0.5s ease;
          }

          .weak-alert {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 12px;
            padding: 8px 12px;
            background: #fef2f2;
            border-radius: 8px;
            color: #dc2626;
            font-size: 13px;
          }

          .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            padding: 20px 24px;
            border-bottom: 1px solid #e5e7eb;
          }

          .stat-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            text-align: center;
          }

          .stat-icon {
            width: 36px;
            height: 36px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .stat-icon.total {
            background: #e0e7ff;
            color: #4f46e5;
          }

          .stat-icon.correct {
            background: #dcfce7;
            color: #16a34a;
          }

          .stat-icon.partial {
            background: #fef3c7;
            color: #d97706;
          }

          .stat-icon.wrong {
            background: #fee2e2;
            color: #dc2626;
          }

          .stat-content {
            display: flex;
            flex-direction: column;
          }

          .stat-value {
            font-size: 16px;
            font-weight: 700;
            color: #1f2937;
          }

          .stat-label {
            font-size: 11px;
            color: #6b7280;
          }

          .detail-section,
          .recommendation-section {
            padding: 20px 24px;
            border-bottom: 1px solid #e5e7eb;
          }

          .section-title {
            font-size: 14px;
            font-weight: 600;
            color: #1f2937;
            margin: 0 0 12px 0;
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .detail-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .detail-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: #f9fafb;
            border-radius: 6px;
          }

          .detail-label {
            font-size: 13px;
            color: #6b7280;
          }

          .detail-value {
            font-size: 13px;
            font-weight: 600;
            color: #1f2937;
          }

          .recommendation-content {
            font-size: 13px;
            color: #4b5563;
            line-height: 1.6;
          }

          .recommendation-content p {
            margin: 0 0 12px 0;
          }

          .recommendation-content ul {
            margin: 0;
            padding-left: 20px;
          }

          .recommendation-content li {
            margin: 4px 0;
          }

          .recommendation-content strong {
            color: #1f2937;
          }

          .action-section {
            padding: 20px 24px;
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .generate-twin-button {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 14px 20px;
            font-size: 14px;
            font-weight: 600;
            color: #9ca3af;
            background: #f3f4f6;
            border: 2px dashed #d1d5db;
            border-radius: 10px;
            cursor: not-allowed;
            transition: all 0.2s;
          }

          .generate-twin-button.active {
            color: white;
            background: linear-gradient(135deg, #dc2626, #b91c1c);
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
          }

          .generate-twin-button.active:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(220, 38, 38, 0.4);
          }

          .twin-hint {
            font-size: 12px;
            color: #9ca3af;
            text-align: center;
            margin: 0;
          }

          .close-action-button {
            padding: 12px 20px;
            font-size: 14px;
            font-weight: 500;
            color: #6b7280;
            background: white;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .close-action-button:hover {
            background: #f3f4f6;
          }

          @media (max-width: 480px) {
            .stats-grid {
              grid-template-columns: repeat(2, 1fr);
            }

            .modal-container {
              max-height: 95vh;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
