'use client';

// ============================================================================
// Desmos Graph Modal Component
// ★ Desmos 네이티브 UI 사용 — 슬라이더, 드래그, 줌/패닝 모두 활성화
// 미지수가 포함된 수식을 넣으면 슬라이더로 조절 가능
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Download, RotateCcw } from 'lucide-react';
import type { GraphExpression } from '@/types/editor';

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
  showGrid?: boolean;
  border?: boolean;
  lockViewport?: boolean;
}

interface DesmosCalculator {
  setExpression: (expr: { id: string; latex?: string; color?: string; hidden?: boolean; dragMode?: number; pointSize?: number; pointStyle?: string; style?: unknown; lineWidth?: number; parametricDomain?: { min: string; max: string } }) => void;
  removeExpression: (expr: { id: string }) => void;
  getState: () => { expressions: { list: Array<{ id: string; latex?: string; color?: string }> } };
  setState: (state: unknown) => void;
  setMathBounds: (bounds: { left: number; right: number; bottom: number; top: number }) => void;
  graphpaperBounds: { left: number; right: number; bottom: number; top: number };
  screenshot: (opts?: { width?: number; height?: number; targetPixelRatio?: number }) => string;
  destroy: () => void;
  observeEvent: (event: string, callback: () => void) => void;
  resize: () => void;
}

/** AI figureData의 GraphRendering에서 초기화할 데이터 */
interface GraphEditData {
  expressions: Array<{ latex: string; color?: string; style?: string; hidden?: boolean }>;
  xRange?: [number, number];
  yRange?: [number, number];
  points?: Array<{ x: number; y: number; label?: string }>;
  /** ★ Desmos 전체 상태 (이전 편집 복원용) */
  desmosState?: unknown;
}

interface GraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (imageDataUrl: string, expressions: GraphExpression[]) => void;
  initialExpressions?: GraphExpression[];
  /** ★ AI 생성 그래프 데이터로 초기화 (편집 모드) */
  initialGraphData?: GraphEditData;
  /** ★ 편집 완료 후 구조화 데이터 저장 콜백 (DB 업데이트용) */
  onSaveGraphData?: (data: {
    expressions: GraphExpression[];
    xRange: [number, number];
    yRange: [number, number];
    imageDataUrl: string;
    desmosState?: unknown;
  }) => void;
}

const COLORS = ['#2d70b3', '#388c46', '#fa7e19', '#c74440', '#6042a6', '#000000'];

const GraphModal: React.FC<GraphModalProps> = ({
  isOpen,
  onClose,
  onInsert,
  initialGraphData,
  onSaveGraphData,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [showProjections, setShowProjections] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const calculatorRef = useRef<DesmosCalculator | null>(null);
  const pointCountRef = useRef(0);

  // 계산기 초기화
  const initializeCalculator = useCallback(() => {
    if (!containerRef.current || !window.Desmos) return;

    if (calculatorRef.current) {
      calculatorRef.current.destroy();
    }

    // ★ Desmos 네이티브 UI 활성화 — 수식 패널 + 슬라이더 + 드래그 포인트 모두 사용
    const calculator = window.Desmos.GraphingCalculator(containerRef.current, {
      expressions: true,   // ★ 네이티브 수식 패널 표시 (슬라이더 자동 생성)
      settingsMenu: true,  // 설정 메뉴 (격자, 축 등)
      zoomButtons: true,
      keypad: true,        // ★ 수학 키패드 활성화 (터치/마우스)
      border: false,
      lockViewport: false,  // 자유롭게 줌/패닝
    });

    calculatorRef.current = calculator;
    setIsLoading(false);

    // ★ 이전 Desmos 상태가 있으면 통째로 복원 (편집 재개)
    if (initialGraphData?.desmosState) {
      try {
        calculator.setState(initialGraphData.desmosState);
        // 뷰포트 설정
        const xRange = initialGraphData?.xRange || [-10, 10];
        const yRange = initialGraphData?.yRange || [-10, 10];
        calculator.setMathBounds({ left: xRange[0], right: xRange[1], bottom: yRange[0], top: yRange[1] });
        setTimeout(() => { try { calculator.resize(); } catch { /* ignore */ } }, 100);
        return;
      } catch (err) {
        console.warn('[GraphModal] Desmos state restore failed, falling back:', err);
      }
    }

    // AI 데이터가 있으면 초기 수식 설정
    if (initialGraphData?.expressions && initialGraphData.expressions.length > 0) {
      initialGraphData.expressions.forEach((expr, i) => {
        if (expr.latex) {
          calculator.setExpression({
            id: `expr-${i}`,
            latex: expr.latex,
            color: expr.color || COLORS[i % COLORS.length],
          });
        }
      });

      // ★ 드래그 가능한 점 + 축 투영선 — 변수 기반으로 드래그 시 투영선도 연동
      if (initialGraphData.points) {
        pointCountRef.current = initialGraphData.points.length;
        initialGraphData.points.forEach((pt, i) => {
          const xVar = `x_{${i + 1}}`;
          const yVar = `y_{${i + 1}}`;

          // 변수 정의 (드래그 시 자동 업데이트)
          calculator.setExpression({ id: `px-${i}`, latex: `${xVar}=${pt.x}` });
          calculator.setExpression({ id: `py-${i}`, latex: `${yVar}=${pt.y}` });

          // 드래그 가능한 점
          const label = pt.label || `P_{${i + 1}}`;
          calculator.setExpression({
            id: `point-${i}`,
            latex: `${label}=(${xVar}, ${yVar})`,
            color: '#c74440',
            dragMode: 2,
            pointSize: 12,
          });

          // x축으로 수직 점선 (점 → x축)
          calculator.setExpression({
            id: `dashV-${i}`,
            latex: `(${xVar}, t)`,
            parametricDomain: { min: '0', max: yVar },
            color: '#888888',
            style: (window.Desmos as Record<string, unknown>)?.Styles?.DASHED ?? undefined,
            lineWidth: 1.5,
            hidden: !showProjections,
          });

          // y축으로 수평 점선 (점 → y축)
          calculator.setExpression({
            id: `dashH-${i}`,
            latex: `(t, ${yVar})`,
            parametricDomain: { min: '0', max: xVar },
            color: '#888888',
            style: (window.Desmos as Record<string, unknown>)?.Styles?.DASHED ?? undefined,
            lineWidth: 1.5,
            hidden: !showProjections,
          });
        });
      }
    }

    // 뷰포트 설정
    const xRange = initialGraphData?.xRange || [-10, 10];
    const yRange = initialGraphData?.yRange || [-10, 10];
    calculator.setMathBounds({
      left: xRange[0],
      right: xRange[1],
      bottom: yRange[0],
      top: yRange[1],
    });

    // 컨테이너 크기에 맞게 리사이즈
    setTimeout(() => {
      try { calculator.resize(); } catch { /* ignore */ }
    }, 100);
  }, [initialGraphData]);

  // Desmos API 로드
  useEffect(() => {
    if (!isOpen) return;

    const loadDesmos = () => {
      if (window.Desmos) {
        requestAnimationFrame(() => initializeCalculator());
        return;
      }

      const existingScript = document.querySelector('script[src*="desmos.com"]') as HTMLScriptElement | null;
      if (existingScript) {
        const checkInterval = setInterval(() => {
          if (window.Desmos) {
            clearInterval(checkInterval);
            requestAnimationFrame(() => initializeCalculator());
          }
        }, 100);
        setTimeout(() => clearInterval(checkInterval), 10000);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://www.desmos.com/api/v1.8/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6';
      script.async = true;
      script.onload = () => requestAnimationFrame(() => initializeCalculator());
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

  // 초기화 리셋 (다른 문제로 모달 다시 열릴 때)
  useEffect(() => {
    if (isOpen && calculatorRef.current && initialGraphData) {
      initializeCalculator();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGraphData]);

  // 투영선 토글
  const toggleProjections = useCallback(() => {
    setShowProjections(prev => {
      const next = !prev;
      if (calculatorRef.current) {
        for (let i = 0; i < pointCountRef.current; i++) {
          calculatorRef.current.setExpression({ id: `dashV-${i}`, hidden: !next });
          calculatorRef.current.setExpression({ id: `dashH-${i}`, hidden: !next });
        }
      }
      return next;
    });
  }, []);

  // 수식 초기화 (리셋 버튼)
  const handleReset = () => {
    if (calculatorRef.current) {
      initializeCalculator();
    }
  };

  // 스크린샷 캡처 및 저장
  const handleSave = () => {
    if (!calculatorRef.current) return;

    const imageDataUrl = calculatorRef.current.screenshot({
      width: 600,
      height: 480,
      targetPixelRatio: 2,
    });

    // 현재 수식 상태 추출 — 투영선/변수/포인트 보조 표현식 제외
    const HELPER_PREFIX = ['px-', 'py-', 'dashV-', 'dashH-', 'point-'];

    const state = calculatorRef.current.getState();
    const bounds = calculatorRef.current.graphpaperBounds || { left: -10, right: 10, bottom: -10, top: 10 };

    const isHelperExpr = (id: string, latex: string): boolean => {
      // ID 기반 필터
      if (HELPER_PREFIX.some(p => id.startsWith(p))) return true;
      // 변수 대입 (x_{1}=3, y_{2}=-4 등)
      if (/^[xy]_\{?\d+\}?\s*=\s*-?[\d.]+$/.test(latex)) return true;
      // 투영선 파라메트릭 (x_{1}, t) 또는 (t, y_{1})
      if (/^\(\s*[xy]_\{?\d+\}?\s*,\s*t\s*\)$/.test(latex)) return true;
      if (/^\(\s*t\s*,\s*[xy]_\{?\d+\}?\s*\)$/.test(latex)) return true;
      // 포인트 (P_{1}=(x_{1}, y_{1}) 등)
      if (/^[A-Z](_\{?\d+\}?)?\s*=\s*\(/.test(latex)) return true;
      // 단순 슬라이더 (a=1, b=2 등) — x, y는 제외 (x=-4는 점근선/직선)
      if (/^[a-wz]\s*=\s*-?[\d.]+$/.test(latex)) return true;
      return false;
    };

    const allExprs = (state.expressions?.list || []);
    const validExprs: GraphExpression[] = allExprs
      .filter((e: { id?: string; latex?: string; type?: string }) => {
        if (!e.latex || e.latex.trim().length === 0) return false;
        if (e.type === 'folder') return false;
        return !isHelperExpr(e.id || '', e.latex.trim());
      })
      .map((e: { id: string; latex?: string; color?: string }, i: number) => ({
        id: e.id || `expr-${i}`,
        latex: e.latex || '',
        color: e.color || COLORS[i % COLORS.length],
        lineStyle: 'solid' as const,
        hidden: false,
      }));

    console.log('[GraphModal] 저장할 수식:', validExprs.map(e => e.latex));

    onInsert(imageDataUrl, validExprs);

    if (onSaveGraphData) {
      onSaveGraphData({
        expressions: validExprs,
        xRange: [bounds.left, bounds.right],
        yRange: [bounds.bottom, bounds.top],
        imageDataUrl,
        desmosState: state, // ★ Desmos 전체 상태 저장
      });
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="graph-modal-overlay">
      <div className="graph-modal">
        {/* 헤더 */}
        <div className="graph-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 className="graph-modal-title">
              {initialGraphData ? '그래프 편집' : '그래프 도구'}
            </h2>
            <span className="graph-modal-hint">
              미지수(a, b 등)를 포함한 수식 입력 → 슬라이더로 조절
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {pointCountRef.current > 0 && (
              <button
                onClick={toggleProjections}
                className={`btn-reset ${showProjections ? 'btn-active' : ''}`}
                title="축 투영선 ON/OFF"
                style={{ fontSize: '12px', padding: '4px 10px', whiteSpace: 'nowrap' }}
              >
                투영선 {showProjections ? 'ON' : 'OFF'}
              </button>
            )}
            <button onClick={handleReset} className="btn-reset" title="초기 상태로 리셋">
              <RotateCcw size={16} />
            </button>
            <button onClick={onClose} className="graph-modal-close">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Desmos 전체 영역 — 네이티브 UI가 수식 패널 + 그래프를 모두 제공 */}
        <div className="graph-modal-body">
          {isLoading && (
            <div className="graph-loading">
              <div className="loading-spinner" />
              <span>그래프 로딩 중...</span>
            </div>
          )}
          <div
            ref={containerRef}
            className="desmos-container"
            style={{ opacity: isLoading ? 0 : 1 }}
          />
        </div>

        {/* 푸터 */}
        <div className="graph-modal-footer">
          <button onClick={onClose} className="btn-cancel">취소</button>
          <button onClick={handleSave} className="btn-insert">
            <Download size={16} />
            {initialGraphData ? '수정 저장' : '에디터에 삽입'}
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
          width: 95vw;
          max-width: 1100px;
          height: 85vh;
          max-height: 800px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .graph-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          border-bottom: 1px solid #e5e7eb;
          flex-shrink: 0;
        }

        .graph-modal-title {
          font-size: 16px;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }

        .graph-modal-hint {
          font-size: 12px;
          color: #9ca3af;
        }

        .graph-modal-close {
          padding: 6px;
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

        .btn-reset {
          padding: 6px;
          border: 1px solid #e5e7eb;
          background: white;
          color: #6b7280;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .btn-reset:hover {
          background-color: #f3f4f6;
          color: #111827;
        }

        .btn-active {
          background-color: #eef2ff;
          border-color: #6366f1;
          color: #4f46e5;
        }

        .graph-modal-body {
          flex: 1;
          position: relative;
          overflow: hidden;
        }

        .desmos-container {
          width: 100%;
          height: 100%;
          transition: opacity 0.3s;
        }

        .graph-loading {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: #6b7280;
          z-index: 10;
          background: white;
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
          to { transform: rotate(360deg); }
        }

        .graph-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 12px 20px;
          border-top: 1px solid #e5e7eb;
          background-color: #f9fafb;
          flex-shrink: 0;
        }

        .btn-cancel {
          padding: 8px 20px;
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
          padding: 8px 20px;
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
