'use client';

// ============================================================================
// Zero-Wrong Loop Component
// 오답 문제 → 쌍둥이 문제 생성 → 클리닉 시험지 PDF
// ============================================================================

import React, { useState, useCallback } from 'react';
import {
  RefreshCw,
  FileDown,
  Sparkles,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  AlertTriangle,
  Brain,
  Zap,
} from 'lucide-react';
import type { TwinProblem, ClinicExam } from '@/types/workflow';

interface WrongProblem {
  id: string;
  typeCode: string;
  typeName: string;
  contentLatex: string;
  contentHtml?: string;
  subject?: string;
  chapter?: string;
}

interface ZeroWrongLoopProps {
  studentId: string;
  studentName: string;
  wrongProblems: WrongProblem[];
  onTwinGenerated?: (twins: TwinProblem[]) => void;
  onClinicCreated?: (clinic: ClinicExam, pdfUrl: string) => void;
}

export default function ZeroWrongLoop({
  studentId,
  studentName,
  wrongProblems,
  onTwinGenerated,
  onClinicCreated,
}: ZeroWrongLoopProps) {
  const [selectedProblems, setSelectedProblems] = useState<Set<string>>(
    new Set(wrongProblems.map((p) => p.id))
  );
  const [generatedTwins, setGeneratedTwins] = useState<TwinProblem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreatingPdf, setIsCreatingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTwinId, setExpandedTwinId] = useState<string | null>(null);

  // 옵션
  const [useLLM, setUseLLM] = useState(true);
  const [difficultyAdjustment, setDifficultyAdjustment] = useState<-1 | 0 | 1>(0);
  const [includeOriginals, setIncludeOriginals] = useState(true);
  const [includeSolutions, setIncludeSolutions] = useState(false);

  // 문제 선택 토글
  const toggleProblem = (problemId: string) => {
    setSelectedProblems((prev) => {
      const next = new Set(prev);
      if (next.has(problemId)) {
        next.delete(problemId);
      } else {
        next.add(problemId);
      }
      return next;
    });
  };

  // 전체 선택/해제
  const toggleAll = () => {
    if (selectedProblems.size === wrongProblems.length) {
      setSelectedProblems(new Set());
    } else {
      setSelectedProblems(new Set(wrongProblems.map((p) => p.id)));
    }
  };

  // 쌍둥이 문제 생성
  const handleGenerateTwins = useCallback(async () => {
    if (selectedProblems.size === 0) {
      setError('생성할 문제를 선택해주세요.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/workflow/twin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemIds: Array.from(selectedProblems),
          studentId,
          studentName,
          options: {
            difficultyAdjustment,
            preserveStructure: true,
          },
          useLLM,
          generateClinic: false,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate twin problems');
      }

      const data = await response.json();
      setGeneratedTwins(data.twinProblems);

      if (onTwinGenerated) {
        onTwinGenerated(data.twinProblems);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '생성 중 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
    }
  }, [selectedProblems, studentId, studentName, difficultyAdjustment, useLLM, onTwinGenerated]);

  // 클리닉 시험지 PDF 생성
  const handleCreateClinicPdf = useCallback(async () => {
    if (generatedTwins.length === 0) {
      setError('먼저 유사 문제를 생성해주세요.');
      return;
    }

    setIsCreatingPdf(true);
    setError(null);

    try {
      const response = await fetch('/api/workflow/twin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemIds: Array.from(selectedProblems),
          studentId,
          studentName,
          options: { difficultyAdjustment },
          useLLM,
          generateClinic: true,
          clinicOptions: {
            title: `${studentName} 클리닉 시험지`,
            includeOriginals,
            includeSolutions,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create clinic exam');
      }

      const data = await response.json();

      if (data.pdfUrl) {
        // PDF 다운로드
        const link = document.createElement('a');
        link.href = data.pdfUrl;
        link.download = `clinic_${studentName}_${new Date().toISOString().split('T')[0]}.html`;
        link.click();

        if (onClinicCreated) {
          onClinicCreated(data.clinicExam, data.pdfUrl);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreatingPdf(false);
    }
  }, [
    generatedTwins,
    selectedProblems,
    studentId,
    studentName,
    difficultyAdjustment,
    useLLM,
    includeOriginals,
    includeSolutions,
    onClinicCreated,
  ]);

  return (
    <div className="zero-wrong-loop">
      {/* 헤더 */}
      <div className="section-header">
        <div className="header-icon">
          <RefreshCw size={24} />
        </div>
        <div className="header-content">
          <h3>오답 제로 루프</h3>
          <p>오답 문제를 유사 문제로 변환하여 완전학습을 달성합니다.</p>
        </div>
      </div>

      {/* 오답 문제 목록 */}
      <div className="problems-section">
        <div className="section-title">
          <span>오답 문제 ({wrongProblems.length}개)</span>
          <button className="select-all-btn" onClick={toggleAll}>
            {selectedProblems.size === wrongProblems.length ? '전체 해제' : '전체 선택'}
          </button>
        </div>

        <div className="problem-list">
          {wrongProblems.map((problem) => (
            <div
              key={problem.id}
              className={`problem-item ${selectedProblems.has(problem.id) ? 'selected' : ''}`}
              onClick={() => toggleProblem(problem.id)}
            >
              <div className="problem-checkbox">
                {selectedProblems.has(problem.id) ? (
                  <Check size={16} />
                ) : (
                  <div className="checkbox-empty" />
                )}
              </div>
              <div className="problem-info">
                <span className="type-code">{problem.typeCode}</span>
                <span className="type-name">{problem.typeName}</span>
              </div>
              <div className="problem-badge">
                <X size={12} />
                오답
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 생성 옵션 */}
      <div className="options-section">
        <div className="section-title">생성 옵션</div>

        <div className="options-grid">
          <label className="option-item">
            <input
              type="checkbox"
              checked={useLLM}
              onChange={(e) => setUseLLM(e.target.checked)}
            />
            <Brain size={16} />
            <span>GPT-4o 기반 생성</span>
          </label>

          <div className="option-item">
            <Zap size={16} />
            <span>난이도 조절</span>
            <select
              value={difficultyAdjustment}
              onChange={(e) => setDifficultyAdjustment(Number(e.target.value) as -1 | 0 | 1)}
            >
              <option value={-1}>쉽게 (-1)</option>
              <option value={0}>동일 (0)</option>
              <option value={1}>어렵게 (+1)</option>
            </select>
          </div>

          <label className="option-item">
            <input
              type="checkbox"
              checked={includeOriginals}
              onChange={(e) => setIncludeOriginals(e.target.checked)}
            />
            <FileText size={16} />
            <span>원본 문제 포함</span>
          </label>

          <label className="option-item">
            <input
              type="checkbox"
              checked={includeSolutions}
              onChange={(e) => setIncludeSolutions(e.target.checked)}
            />
            <Sparkles size={16} />
            <span>풀이 포함</span>
          </label>
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="actions-section">
        <button
          className="action-btn primary"
          onClick={handleGenerateTwins}
          disabled={isGenerating || selectedProblems.size === 0}
        >
          {isGenerating ? (
            <>
              <Loader2 size={18} className="spinning" />
              생성 중...
            </>
          ) : (
            <>
              <Sparkles size={18} />
              유사 문제 생성 ({selectedProblems.size}개)
            </>
          )}
        </button>

        <button
          className="action-btn secondary"
          onClick={handleCreateClinicPdf}
          disabled={isCreatingPdf || generatedTwins.length === 0}
        >
          {isCreatingPdf ? (
            <>
              <Loader2 size={18} className="spinning" />
              PDF 생성 중...
            </>
          ) : (
            <>
              <FileDown size={18} />
              클리닉 시험지 PDF
            </>
          )}
        </button>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="error-message">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* 생성된 쌍둥이 문제 목록 */}
      {generatedTwins.length > 0 && (
        <div className="twins-section">
          <div className="section-title">
            <span>생성된 유사 문제 ({generatedTwins.length}개)</span>
            <span className="success-badge">
              <Check size={14} />
              생성 완료
            </span>
          </div>

          <div className="twins-list">
            {generatedTwins.map((twin) => {
              const originalProblem = wrongProblems.find(
                (p) => p.id === twin.originalProblemId
              );
              const isExpanded = expandedTwinId === twin.id;

              return (
                <div key={twin.id} className="twin-item">
                  <div
                    className="twin-header"
                    onClick={() => setExpandedTwinId(isExpanded ? null : twin.id)}
                  >
                    <div className="twin-info">
                      <span className="twin-badge">🔄 유사문제</span>
                      <span className="type-code">{twin.originalTypeCode}</span>
                    </div>
                    <button className="expand-btn">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="twin-content">
                      <div className="comparison">
                        <div className="comparison-col">
                          <div className="col-header">원본 문제</div>
                          <div className="col-content">
                            {originalProblem?.contentLatex || '(원본 없음)'}
                          </div>
                        </div>
                        <div className="comparison-arrow">→</div>
                        <div className="comparison-col highlight">
                          <div className="col-header">유사 문제</div>
                          <div className="col-content">{twin.contentLatex}</div>
                        </div>
                      </div>

                      {twin.modifications.length > 0 && (
                        <div className="modifications">
                          <div className="mod-header">변경 사항</div>
                          <div className="mod-list">
                            {twin.modifications.map((mod, idx) => (
                              <span key={idx} className="mod-item">
                                <span className="mod-original">{mod.original}</span>
                                →
                                <span className="mod-new">{mod.modified}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style jsx>{`
        .zero-wrong-loop {
          background: white;
          border-radius: 16px;
          border: 1px solid #e5e7eb;
          overflow: hidden;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px 24px;
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: white;
        }

        .header-icon {
          width: 48px;
          height: 48px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .header-content h3 {
          margin: 0 0 4px;
          font-size: 18px;
          font-weight: 700;
        }

        .header-content p {
          margin: 0;
          font-size: 13px;
          opacity: 0.9;
        }

        .problems-section,
        .options-section,
        .twins-section {
          padding: 20px 24px;
          border-bottom: 1px solid #e5e7eb;
        }

        .section-title {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }

        .select-all-btn {
          padding: 4px 12px;
          font-size: 12px;
          color: #4f46e5;
          background: #eef2ff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
        }

        .problem-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 240px;
          overflow-y: auto;
        }

        .problem-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: #f9fafb;
          border: 2px solid transparent;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .problem-item:hover {
          background: #f3f4f6;
        }

        .problem-item.selected {
          background: #fef2f2;
          border-color: #ef4444;
        }

        .problem-checkbox {
          width: 20px;
          height: 20px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ef4444;
          color: white;
        }

        .checkbox-empty {
          width: 20px;
          height: 20px;
          border: 2px solid #d1d5db;
          border-radius: 4px;
        }

        .problem-info {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .type-code {
          font-size: 11px;
          font-weight: 600;
          color: #6b7280;
          background: #e5e7eb;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .type-name {
          font-size: 13px;
          color: #1f2937;
        }

        .problem-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          font-size: 11px;
          font-weight: 600;
          color: #dc2626;
          background: #fee2e2;
          border-radius: 6px;
        }

        .options-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .option-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: #f9fafb;
          border-radius: 8px;
          font-size: 13px;
          color: #374151;
          cursor: pointer;
        }

        .option-item input {
          width: 16px;
          height: 16px;
          accent-color: #4f46e5;
        }

        .option-item select {
          margin-left: auto;
          padding: 4px 8px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 12px;
        }

        .actions-section {
          display: flex;
          gap: 12px;
          padding: 20px 24px;
        }

        .action-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px 20px;
          font-size: 14px;
          font-weight: 600;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-btn.primary {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: white;
        }

        .action-btn.primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }

        .action-btn.secondary {
          background: #1f2937;
          color: white;
        }

        .action-btn.secondary:hover:not(:disabled) {
          background: #111827;
        }

        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 24px 20px;
          padding: 12px 16px;
          background: #fef2f2;
          border-radius: 8px;
          font-size: 13px;
          color: #dc2626;
        }

        .success-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          font-size: 11px;
          font-weight: 600;
          color: #16a34a;
          background: #dcfce7;
          border-radius: 6px;
        }

        .twins-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .twin-item {
          border: 1px solid #c7d2fe;
          border-radius: 10px;
          overflow: hidden;
        }

        .twin-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: #eef2ff;
          cursor: pointer;
        }

        .twin-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .twin-badge {
          font-size: 12px;
          font-weight: 600;
          color: #4f46e5;
        }

        .expand-btn {
          padding: 4px;
          background: none;
          border: none;
          color: #6b7280;
          cursor: pointer;
        }

        .twin-content {
          padding: 16px;
          background: #fafafe;
        }

        .comparison {
          display: flex;
          gap: 16px;
          align-items: stretch;
        }

        .comparison-col {
          flex: 1;
          padding: 12px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }

        .comparison-col.highlight {
          border-color: #4f46e5;
          background: #fafafe;
        }

        .col-header {
          font-size: 11px;
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 8px;
        }

        .col-content {
          font-size: 13px;
          color: #1f2937;
          font-family: 'Times New Roman', serif;
        }

        .comparison-arrow {
          display: flex;
          align-items: center;
          font-size: 18px;
          color: #4f46e5;
        }

        .modifications {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
        }

        .mod-header {
          font-size: 11px;
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 8px;
        }

        .mod-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .mod-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: #f3f4f6;
          border-radius: 6px;
          font-size: 12px;
        }

        .mod-original {
          color: #dc2626;
          text-decoration: line-through;
        }

        .mod-new {
          color: #16a34a;
          font-weight: 600;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
