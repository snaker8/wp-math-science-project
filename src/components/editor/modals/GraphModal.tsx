'use client';

// ============================================================================
// Desmos Graph Modal Component
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, Trash2, Download, Eye, EyeOff } from 'lucide-react';
import type { GraphExpression, GraphSettings, DesmosState } from '@/types/editor';

// Desmos API 타입 선언
declare global {
  interface Window {
    Desmos: {
      GraphingCalculator: (
        element: HTMLElement,
        options?: DesmosCalculatorOptions
      ) => DesmosCalculator;
    };
  }
}

interface DesmosCalculatorOptions {
  expressions?: boolean;
  settingsMenu?: boolean;
  zoomButtons?: boolean;
  keypad?: boolean;
  graphpaper?: boolean;
  border?: boolean;
  lockViewport?: boolean;
}

interface DesmosCalculator {
  setExpression: (expr: { id: string; latex?: string; color?: string; hidden?: boolean }) => void;
  removeExpression: (expr: { id: string }) => void;
  getState: () => DesmosState;
  setState: (state: DesmosState) => void;
  setMathBounds: (bounds: { left: number; right: number; bottom: number; top: number }) => void;
  screenshot: (opts?: { width?: number; height?: number; targetPixelRatio?: number }) => string;
  destroy: () => void;
  observeEvent: (event: string, callback: () => void) => void;
}

interface GraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (imageDataUrl: string, expressions: GraphExpression[]) => void;
  initialExpressions?: GraphExpression[];
}

const COLORS = [
  '#2d70b3', // 파랑
  '#388c46', // 초록
  '#fa7e19', // 주황
  '#c74440', // 빨강
  '#6042a6', // 보라
  '#000000', // 검정
];

const DEFAULT_EXPRESSION: GraphExpression = {
  id: '',
  latex: '',
  color: COLORS[0],
  lineStyle: 'solid',
  hidden: false,
};

const GraphModal: React.FC<GraphModalProps> = ({
  isOpen,
  onClose,
  onInsert,
  initialExpressions = [],
}) => {
  const [expressions, setExpressions] = useState<GraphExpression[]>(
    initialExpressions.length > 0
      ? initialExpressions
      : [{ ...DEFAULT_EXPRESSION, id: `expr-${Date.now()}` }]
  );
  const [settings, setSettings] = useState<GraphSettings>({
    xAxisRange: [-10, 10],
    yAxisRange: [-10, 10],
    showGrid: true,
    showAxes: true,
    width: 500,
    height: 400,
  });
  const [isLoading, setIsLoading] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const calculatorRef = useRef<DesmosCalculator | null>(null);

  // Desmos API 로드
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isOpen) return;

    const loadDesmos = () => {
      if (window.Desmos) {
        initializeCalculator();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://www.desmos.com/api/v1.8/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6';
      script.async = true;
      script.onload = () => initializeCalculator();
      document.body.appendChild(script);
    };

    loadDesmos();

    return () => {
      if (calculatorRef.current) {
        calculatorRef.current.destroy();
        calculatorRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // 계산기 초기화
  const initializeCalculator = useCallback(() => {
    if (!containerRef.current || !window.Desmos) return;

    // 기존 계산기 정리
    if (calculatorRef.current) {
      calculatorRef.current.destroy();
    }

    const calculator = window.Desmos.GraphingCalculator(containerRef.current, {
      expressions: false, // 커스텀 UI 사용
      settingsMenu: false,
      zoomButtons: true,
      keypad: false,
      border: false,
    });

    calculatorRef.current = calculator;
    setIsLoading(false);

    // 초기 수식 설정
    expressions.forEach((expr) => {
      if (expr.latex) {
        calculator.setExpression({
          id: expr.id,
          latex: expr.latex,
          color: expr.color,
          hidden: expr.hidden,
        });
      }
    });

    // 뷰포트 설정
    calculator.setMathBounds({
      left: settings.xAxisRange[0],
      right: settings.xAxisRange[1],
      bottom: settings.yAxisRange[0],
      top: settings.yAxisRange[1],
    });
  }, [expressions, settings]);

  // 수식 변경 시 그래프 업데이트
  useEffect(() => {
    if (!calculatorRef.current || isLoading) return;

    expressions.forEach((expr) => {
      calculatorRef.current!.setExpression({
        id: expr.id,
        latex: expr.latex || '',
        color: expr.color,
        hidden: expr.hidden,
      });
    });
  }, [expressions, isLoading]);

  // 수식 추가
  const handleAddExpression = () => {
    const newExpr: GraphExpression = {
      ...DEFAULT_EXPRESSION,
      id: `expr-${Date.now()}`,
      color: COLORS[expressions.length % COLORS.length],
    };
    setExpressions([...expressions, newExpr]);
  };

  // 수식 제거
  const handleRemoveExpression = (id: string) => {
    if (expressions.length <= 1) return;

    if (calculatorRef.current) {
      calculatorRef.current.removeExpression({ id });
    }
    setExpressions(expressions.filter((e) => e.id !== id));
  };

  // 수식 수정
  const handleUpdateExpression = (id: string, updates: Partial<GraphExpression>) => {
    setExpressions(
      expressions.map((e) => (e.id === id ? { ...e, ...updates } : e))
    );
  };

  // 숨김 토글
  const handleToggleHidden = (id: string) => {
    const expr = expressions.find((e) => e.id === id);
    if (expr) {
      handleUpdateExpression(id, { hidden: !expr.hidden });
    }
  };

  // 스크린샷 캡처 및 삽입
  const handleInsert = () => {
    if (!calculatorRef.current) return;

    const imageDataUrl = calculatorRef.current.screenshot({
      width: settings.width,
      height: settings.height,
      targetPixelRatio: 2, // 고해상도
    });

    onInsert(imageDataUrl, expressions.filter((e) => e.latex));
    onClose();
  };

  // 범위 변경
  const handleRangeChange = (axis: 'x' | 'y', index: 0 | 1, value: number) => {
    const newSettings = { ...settings };
    if (axis === 'x') {
      newSettings.xAxisRange = [...settings.xAxisRange] as [number, number];
      newSettings.xAxisRange[index] = value;
    } else {
      newSettings.yAxisRange = [...settings.yAxisRange] as [number, number];
      newSettings.yAxisRange[index] = value;
    }
    setSettings(newSettings);

    if (calculatorRef.current) {
      calculatorRef.current.setMathBounds({
        left: newSettings.xAxisRange[0],
        right: newSettings.xAxisRange[1],
        bottom: newSettings.yAxisRange[0],
        top: newSettings.yAxisRange[1],
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="graph-modal-overlay">
      <div className="graph-modal">
        {/* 헤더 */}
        <div className="graph-modal-header">
          <h2 className="graph-modal-title">그래프 도구</h2>
          <button onClick={onClose} className="graph-modal-close">
            <X size={20} />
          </button>
        </div>

        <div className="graph-modal-body">
          {/* 좌측: 수식 입력 패널 */}
          <div className="graph-expressions-panel">
            <div className="panel-header">
              <span>함수식</span>
              <button onClick={handleAddExpression} className="add-expr-btn">
                <Plus size={16} />
                추가
              </button>
            </div>

            <div className="expressions-list">
              {expressions.map((expr, index) => (
                <div key={expr.id} className="expression-item">
                  <div
                    className="expression-color"
                    style={{ backgroundColor: expr.color }}
                    onClick={() => {
                      const nextColor = COLORS[(COLORS.indexOf(expr.color!) + 1) % COLORS.length];
                      handleUpdateExpression(expr.id, { color: nextColor });
                    }}
                  />
                  <input
                    type="text"
                    value={expr.latex}
                    onChange={(e) => handleUpdateExpression(expr.id, { latex: e.target.value })}
                    placeholder={`y = x^${index + 2}`}
                    className="expression-input"
                  />
                  <button
                    onClick={() => handleToggleHidden(expr.id)}
                    className="expression-action"
                    title={expr.hidden ? '표시' : '숨기기'}
                  >
                    {expr.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button
                    onClick={() => handleRemoveExpression(expr.id)}
                    className="expression-action delete"
                    disabled={expressions.length <= 1}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            {/* 범위 설정 */}
            <div className="range-settings">
              <div className="range-group">
                <label>X축 범위</label>
                <div className="range-inputs">
                  <input
                    type="number"
                    value={settings.xAxisRange[0]}
                    onChange={(e) => handleRangeChange('x', 0, Number(e.target.value))}
                    className="range-input"
                  />
                  <span>~</span>
                  <input
                    type="number"
                    value={settings.xAxisRange[1]}
                    onChange={(e) => handleRangeChange('x', 1, Number(e.target.value))}
                    className="range-input"
                  />
                </div>
              </div>
              <div className="range-group">
                <label>Y축 범위</label>
                <div className="range-inputs">
                  <input
                    type="number"
                    value={settings.yAxisRange[0]}
                    onChange={(e) => handleRangeChange('y', 0, Number(e.target.value))}
                    className="range-input"
                  />
                  <span>~</span>
                  <input
                    type="number"
                    value={settings.yAxisRange[1]}
                    onChange={(e) => handleRangeChange('y', 1, Number(e.target.value))}
                    className="range-input"
                  />
                </div>
              </div>
            </div>

            {/* 예시 함수 */}
            <div className="example-functions">
              <span className="example-label">예시:</span>
              <div className="example-chips">
                {['y=x^2', 'y=\\sin(x)', 'y=e^x', 'x^2+y^2=25'].map((ex) => (
                  <button
                    key={ex}
                    onClick={() => {
                      const emptyExpr = expressions.find((e) => !e.latex);
                      if (emptyExpr) {
                        handleUpdateExpression(emptyExpr.id, { latex: ex });
                      } else {
                        setExpressions([
                          ...expressions,
                          { ...DEFAULT_EXPRESSION, id: `expr-${Date.now()}`, latex: ex },
                        ]);
                      }
                    }}
                    className="example-chip"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 우측: 그래프 캔버스 */}
          <div className="graph-canvas-panel">
            {isLoading && (
              <div className="graph-loading">
                <div className="loading-spinner" />
                <span>그래프 로딩 중...</span>
              </div>
            )}
            <div
              ref={containerRef}
              className="desmos-container"
              style={{
                width: settings.width,
                height: settings.height,
                opacity: isLoading ? 0 : 1,
              }}
            />
          </div>
        </div>

        {/* 푸터 */}
        <div className="graph-modal-footer">
          <button onClick={onClose} className="btn-cancel">
            취소
          </button>
          <button onClick={handleInsert} className="btn-insert">
            <Download size={16} />
            에디터에 삽입
          </button>
        </div>
      </div>

      <style jsx>{`
        .graph-modal-overlay {
          position: fixed;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .graph-modal {
          background: white;
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          width: 100%;
          max-width: 900px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .graph-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          border-bottom: 1px solid #e5e7eb;
        }

        .graph-modal-title {
          font-size: 18px;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }

        .graph-modal-close {
          padding: 8px;
          border: none;
          background: none;
          color: #6b7280;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .graph-modal-close:hover {
          background-color: #f3f4f6;
          color: #111827;
        }

        .graph-modal-body {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .graph-expressions-panel {
          width: 320px;
          border-right: 1px solid #e5e7eb;
          display: flex;
          flex-direction: column;
          background-color: #f9fafb;
        }

        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          border-bottom: 1px solid #e5e7eb;
        }

        .add-expr-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          font-size: 13px;
          color: #4f46e5;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .add-expr-btn:hover {
          background-color: #eef2ff;
          border-color: #c7d2fe;
        }

        .expressions-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .expression-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }

        .expression-color {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          cursor: pointer;
          flex-shrink: 0;
        }

        .expression-input {
          flex: 1;
          padding: 6px 8px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          outline: none;
          min-width: 0;
        }

        .expression-input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
        }

        .expression-action {
          padding: 6px;
          background: none;
          border: none;
          color: #6b7280;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .expression-action:hover {
          background-color: #f3f4f6;
          color: #111827;
        }

        .expression-action.delete:hover {
          background-color: #fef2f2;
          color: #ef4444;
        }

        .expression-action:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .range-settings {
          padding: 12px 16px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .range-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .range-group label {
          font-size: 12px;
          color: #6b7280;
        }

        .range-inputs {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .range-inputs span {
          color: #9ca3af;
        }

        .range-input {
          width: 80px;
          padding: 6px 8px;
          font-size: 13px;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          outline: none;
        }

        .range-input:focus {
          border-color: #6366f1;
        }

        .example-functions {
          padding: 12px 16px;
          border-top: 1px solid #e5e7eb;
        }

        .example-label {
          font-size: 12px;
          color: #6b7280;
        }

        .example-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }

        .example-chip {
          padding: 4px 8px;
          font-size: 12px;
          font-family: 'JetBrains Mono', monospace;
          color: #4f46e5;
          background-color: #eef2ff;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .example-chip:hover {
          background-color: #e0e7ff;
        }

        .graph-canvas-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: white;
          position: relative;
          padding: 20px;
        }

        .graph-loading {
          position: absolute;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          color: #6b7280;
        }

        .loading-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #e5e7eb;
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .desmos-container {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          overflow: hidden;
          transition: opacity 0.3s;
        }

        .graph-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 24px;
          border-top: 1px solid #e5e7eb;
          background-color: #f9fafb;
        }

        .btn-cancel {
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .btn-cancel:hover {
          background-color: #f9fafb;
          border-color: #9ca3af;
        }

        .btn-insert {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 500;
          color: white;
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .btn-insert:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }
      `}</style>
    </div>
  );
};

export default GraphModal;
