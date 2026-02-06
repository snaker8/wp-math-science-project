'use client';

// ============================================================================
// Twin Problem Button - 오답/부분오답 옆에 표시되는 쌍둥이 문제 생성 버튼
// ============================================================================

import React, { useState } from 'react';
import { Sparkles, Loader2, Check, X } from 'lucide-react';
import type { GradingStatus, TwinProblem } from '@/types/workflow';

interface TwinProblemButtonProps {
  problemId: string;
  problemContent: string;
  typeCode: string;
  gradingStatus: GradingStatus;
  studentId: string;
  onTwinGenerated?: (twin: TwinProblem) => void;
}

export default function TwinProblemButton({
  problemId,
  problemContent,
  typeCode,
  gradingStatus,
  studentId,
  onTwinGenerated,
}: TwinProblemButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTwin, setGeneratedTwin] = useState<TwinProblem | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 오답 또는 부분오답인 경우에만 표시
  const shouldShow = gradingStatus === 'WRONG' || gradingStatus === 'PARTIAL_WRONG';

  if (!shouldShow) {
    return null;
  }

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/workflow/twin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemIds: [problemId],
          studentId,
          options: {
            difficultyAdjustment: 0,
            preserveStructure: true,
          },
          useLLM: true,
          generateClinic: false,
        }),
      });

      if (!response.ok) {
        throw new Error('생성 실패');
      }

      const data = await response.json();

      if (data.twinProblems && data.twinProblems.length > 0) {
        setGeneratedTwin(data.twinProblems[0]);
        if (onTwinGenerated) {
          onTwinGenerated(data.twinProblems[0]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="twin-button-container">
      {!generatedTwin ? (
        <button
          className={`twin-button ${gradingStatus.toLowerCase()}`}
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 size={14} className="spinning" />
              <span>생성 중...</span>
            </>
          ) : (
            <>
              <Sparkles size={14} />
              <span>쌍둥이 문제 생성</span>
            </>
          )}
        </button>
      ) : (
        <div className="twin-generated">
          <Check size={14} />
          <span>유사 문제 생성됨</span>
        </div>
      )}

      {error && (
        <div className="twin-error">
          <X size={12} />
          <span>{error}</span>
        </div>
      )}

      <style jsx>{`
        .twin-button-container {
          display: inline-flex;
          flex-direction: column;
          gap: 4px;
        }

        .twin-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .twin-button.wrong {
          color: white;
          background: linear-gradient(135deg, #dc2626, #b91c1c);
        }

        .twin-button.wrong:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);
        }

        .twin-button.partial_wrong {
          color: white;
          background: linear-gradient(135deg, #ea580c, #c2410c);
        }

        .twin-button.partial_wrong:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(234, 88, 12, 0.3);
        }

        .twin-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .twin-generated {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          color: #16a34a;
          background: #dcfce7;
          border-radius: 6px;
        }

        .twin-error {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: #dc2626;
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
