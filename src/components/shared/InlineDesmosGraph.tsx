'use client';

// ============================================================================
// InlineDesmosGraph — 읽기 전용 Desmos 미니 그래프 뷰어
// GPT-4o Vision이 추출한 수식을 Desmos로 렌더링
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

// Desmos calculator 인스턴스 타입
interface DesmosCalcInstance {
  setExpression: (expr: { id: string; latex?: string; color?: string; hidden?: boolean; pointStyle?: string; dragMode?: string }) => void;
  removeExpression: (expr: { id: string }) => void;
  setMathBounds: (bounds: { left: number; right: number; bottom: number; top: number }) => void;
  getExpressions: () => Array<{ id: string; latex?: string; color?: string }>;
  destroy: () => void;
  resize: () => void;
}

interface InlineDesmosGraphProps {
  expressions: string[];
  xRange?: [number, number];
  yRange?: [number, number];
  points?: { x: number; y: number; label?: string }[];
  width?: number;
  height?: number;
  className?: string;
  showExpressions?: boolean; // 수식 목록 표시 여부
  darkMode?: boolean; // 다크 테마 여부 (기본: false)
}

const COLORS = ['#2d70b3', '#388c46', '#fa7e19', '#c74440', '#6042a6', '#000000'];

/**
 * GPT가 반환한 LaTeX 수식을 Desmos가 이해할 수 있는 형태로 정리
 */
function sanitizeExpression(latex: string): string {
  let expr = latex.trim();

  // 1. 이중 백슬래시 → 단일 백슬래시 (JSON 이스케이프에서 온 경우)
  //    \\frac → \frac, \\left → \left 등
  //    단, 이미 단일 백슬래시인 경우는 건드리지 않음
  expr = expr.replace(/\\\\(frac|left|right|sqrt|sin|cos|tan|log|ln|ge|le|ne|cdot|times|div|pi|theta|alpha|beta|gamma|delta|epsilon|infty|pm|mp)/g, '\\$1');

  // 2. \text{...} 제거 (Desmos에서 지원하지 않음)
  expr = expr.replace(/\\text\{([^}]*)\}/g, '$1');

  // 3. \textbf{...} 제거
  expr = expr.replace(/\\textbf\{([^}]*)\}/g, '$1');

  // 4. \displaystyle, \textstyle 제거
  expr = expr.replace(/\\(displaystyle|textstyle)\s*/g, '');

  // 5. \rightarrow, \leftarrow 등 화살표 제거 (Desmos 미지원)
  expr = expr.replace(/\\(rightarrow|leftarrow|Rightarrow|Leftarrow|leftrightarrow|longrightarrow)/g, '');

  // 6. \, \; \! \quad 등 공백 명령 제거
  expr = expr.replace(/\\[,;!]\s*/g, '');
  expr = expr.replace(/\\(quad|qquad)\s*/g, '');

  // 7. $ 기호 제거 (LaTeX 래핑)
  expr = expr.replace(/^\$+|\$+$/g, '');

  // 8. 공백 정리
  expr = expr.replace(/\s+/g, ' ').trim();

  return expr;
}

/**
 * 수식이 Desmos에서 렌더링 가능한지 기본 검증
 */
function isValidDesmosExpression(expr: string): boolean {
  if (!expr || expr.length === 0) return false;
  if (expr.length > 200) return false; // 너무 긴 수식은 거부

  // 한글이 포함된 경우 거부 (설명 텍스트가 섞인 것)
  if (/[가-힣]/.test(expr)) return false;

  // 최소한 수학적 내용이 있어야 함 (변수, 숫자, 연산자)
  if (!/[a-zA-Z0-9=<>]/.test(expr)) return false;

  return true;
}

export function InlineDesmosGraph({
  expressions,
  xRange = [-10, 10],
  yRange = [-10, 10],
  points = [],
  width = 350,
  height = 250,
  className = '',
  showExpressions = false,
  darkMode = false,
}: InlineDesmosGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const calculatorRef = useRef<DesmosCalcInstance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExprs, setShowExprs] = useState(showExpressions);
  const [addedExprs, setAddedExprs] = useState<string[]>([]);
  const initCalledRef = useRef(false);

  const initializeCalculator = useCallback(() => {
    if (!containerRef.current || !window.Desmos) {
      console.warn('[DesmosGraph] Container or Desmos API not available');
      return;
    }

    // 이미 초기화된 경우 스킵
    if (initCalledRef.current && calculatorRef.current) {
      return;
    }

    if (calculatorRef.current) {
      calculatorRef.current.destroy();
      calculatorRef.current = null;
    }

    try {
      const calculator = window.Desmos.GraphingCalculator(containerRef.current, {
        expressions: false,  // 수식 패널 숨기기
        settingsMenu: false,
        zoomButtons: false,
        keypad: false,
        border: false,
        lockViewport: false,  // 사용자가 줌/패닝 가능하도록
        graphpaper: true,     // 그래프 배경 유지 (false면 축까지 전부 사라짐)
        showGrid: false,      // 격자선만 숨기기 (축은 유지)
      }) as unknown as DesmosCalcInstance;

      calculatorRef.current = calculator;
      initCalledRef.current = true;

      // 수식 정리 및 추가
      const validExprs: string[] = [];
      expressions.forEach((rawLatex, i) => {
        const latex = sanitizeExpression(rawLatex);
        if (!isValidDesmosExpression(latex)) {
          console.warn(`[DesmosGraph] Skipping invalid expression[${i}]:`, rawLatex, '→', latex);
          return;
        }

        console.log(`[DesmosGraph] Adding expression[${i}]:`, latex);
        try {
          calculator.setExpression({
            id: `expr-${i}`,
            latex,
            color: COLORS[i % COLORS.length],
          });
          validExprs.push(latex);
        } catch (exprErr) {
          console.warn(`[DesmosGraph] Failed to add expression[${i}]:`, latex, exprErr);
        }
      });

      setAddedExprs(validExprs);

      // 점은 라벨만 표시 (도드라진 점 마커 없이)
      points.forEach((pt, i) => {
        try {
          const ptExpr: Record<string, unknown> = {
            id: `point-${i}`,
            latex: `(${pt.x}, ${pt.y})`,
            color: '#888888',
            pointStyle: 'OPEN',
            pointSize: 0,
            pointOpacity: 0,
            dragMode: 'NONE',
          };
          if (pt.label) {
            ptExpr.label = pt.label;
            ptExpr.showLabel = true;
            ptExpr.labelOrientation = 'ABOVE';
            ptExpr.labelSize = 'small';
          }
          calculator.setExpression(ptExpr as Parameters<DesmosCalcInstance['setExpression']>[0]);
        } catch (ptErr) {
          console.warn(`[DesmosGraph] Failed to add point[${i}]:`, pt, ptErr);
        }
      });

      // 범위 설정
      try {
        calculator.setMathBounds({
          left: xRange[0],
          right: xRange[1],
          bottom: yRange[0],
          top: yRange[1],
        });
      } catch (boundsErr) {
        console.warn('[DesmosGraph] Failed to set bounds:', boundsErr);
      }

      // 약간의 딜레이 후 resize 호출 (컨테이너 크기 안정화)
      setTimeout(() => {
        try {
          calculator.resize();
        } catch {
          // ignore resize errors
        }
      }, 100);

      if (validExprs.length === 0 && points.length === 0) {
        setError('렌더링할 수식이 없습니다');
      }

      setIsLoading(false);
    } catch (err) {
      console.error('[DesmosGraph] Initialization failed:', err);
      setError('그래프 초기화 실패');
      setIsLoading(false);
    }
  }, [expressions, xRange, yRange, points]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 초기화 상태 리셋
    initCalledRef.current = false;

    const loadDesmos = () => {
      // 이미 Desmos가 로드된 경우
      if (window.Desmos) {
        // 약간의 지연으로 DOM이 준비되도록
        requestAnimationFrame(() => {
          initializeCalculator();
        });
        return;
      }

      // Desmos 스크립트가 이미 로딩 중인지 확인
      const existingScript = document.querySelector('script[src*="desmos.com"]') as HTMLScriptElement | null;
      if (existingScript) {
        // 이미 로드 완료된 경우
        if (window.Desmos) {
          requestAnimationFrame(() => initializeCalculator());
          return;
        }
        // 아직 로딩 중인 경우 — 폴링으로 확인
        const checkInterval = setInterval(() => {
          if (window.Desmos) {
            clearInterval(checkInterval);
            initializeCalculator();
          }
        }, 100);
        // 10초 후 타임아웃
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!window.Desmos) {
            setError('Desmos API 로드 타임아웃');
            setIsLoading(false);
          }
        }, 10000);
        return;
      }

      // 새로 스크립트 추가
      const script = document.createElement('script');
      script.src = 'https://www.desmos.com/api/v1.8/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6';
      script.async = true;
      script.onload = () => {
        requestAnimationFrame(() => initializeCalculator());
      };
      script.onerror = () => {
        setError('Desmos API 로드 실패');
        setIsLoading(false);
      };
      document.body.appendChild(script);
    };

    loadDesmos();

    return () => {
      if (calculatorRef.current) {
        try {
          calculatorRef.current.destroy();
        } catch {
          // ignore destroy errors
        }
        calculatorRef.current = null;
      }
      initCalledRef.current = false;
    };
  }, [initializeCalculator]);

  if (error) {
    return (
      <div className={`${className}`} style={{ width }}>
        <div
          className={`flex flex-col items-center justify-center rounded-lg text-xs gap-1.5 ${
            darkMode
              ? 'bg-zinc-800/50 border border-zinc-700 text-zinc-400'
              : 'bg-gray-50 border border-gray-200 text-gray-500'
          }`}
          style={{ width, height: Math.min(height, 120) }}
        >
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span>{error}</span>
          {addedExprs.length > 0 && (
            <span className={`text-[10px] ${darkMode ? 'text-zinc-500' : 'text-gray-400'}`}>
              수식: {addedExprs.join(', ')}
            </span>
          )}
        </div>
        {expressions.length > 0 && (
          <div className={`mt-1.5 p-2 rounded border ${
            darkMode ? 'bg-zinc-800/50 border-zinc-700' : 'bg-gray-50 border-gray-200'
          }`}>
            <div className={`text-[10px] font-medium mb-1 ${darkMode ? 'text-zinc-500' : 'text-gray-500'}`}>원본 수식:</div>
            {expressions.map((expr, i) => (
              <div key={i} className={`text-[11px] font-mono py-0.5 ${darkMode ? 'text-zinc-400' : 'text-gray-600'}`}>
                {expr}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${className}`} style={{ width }}>
      {/* 그래프 영역 */}
      <div
        className={`relative rounded-lg overflow-hidden border ${
          darkMode ? 'border-zinc-700' : 'border-gray-200'
        }`}
        style={{ width, height }}
      >
        {isLoading && (
          <div className={`absolute inset-0 flex items-center justify-center z-10 ${
            darkMode ? 'bg-zinc-900' : 'bg-white'
          }`}>
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        )}
        <div
          ref={containerRef}
          style={{ width, height, ...(darkMode ? { filter: 'invert(1) hue-rotate(180deg)' } : {}) }}
        />
      </div>

      {/* 수식 목록 토글 */}
      {addedExprs.length > 0 && (
        <button
          onClick={() => setShowExprs(!showExprs)}
          className={`mt-1 flex items-center gap-1 text-[10px] transition-colors ${
            darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          {showExprs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          수식 {addedExprs.length}개 {showExprs ? '접기' : '보기'}
        </button>
      )}
      {showExprs && addedExprs.length > 0 && (
        <div className={`mt-1 p-2 rounded border ${
          darkMode ? 'bg-zinc-800/50 border-zinc-700' : 'bg-gray-50 border-gray-200'
        }`}>
          {addedExprs.map((expr, i) => (
            <div key={i} className="flex items-center gap-1.5 py-0.5">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className={`text-[11px] font-mono ${darkMode ? 'text-zinc-400' : 'text-gray-600'}`}>{expr}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
