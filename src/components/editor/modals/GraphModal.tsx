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
  fontSize?: number;
}

interface DesmosCalculator {
  setExpression: (expr: { id: string; latex?: string; color?: string; hidden?: boolean; dragMode?: number | string; pointSize?: number; pointStyle?: string; style?: unknown; lineWidth?: number; parametricDomain?: { min: string; max: string }; label?: string; showLabel?: boolean; labelSize?: string; labelOrientation?: string }) => void;
  removeExpression: (expr: { id: string }) => void;
  getState: () => { expressions: { list: Array<{ id: string; latex?: string; color?: string; label?: string; type?: string }> } };
  updateSettings: (settings: { fontSize?: number }) => void;
  setState: (state: unknown) => void;
  setMathBounds: (bounds: { left: number; right: number; bottom: number; top: number }) => void;
  graphpaperBounds: { left: number; right: number; bottom: number; top: number };
  pixelsToMath: (pixel: { x: number; y: number }) => { x: number; y: number };
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
  segments?: Array<[string, string]>;
  shadedRegions?: Array<{ vertices: string[]; color?: string }>;
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
  // ★ Desmos 라벨/텍스트 크기 (기본 16, 12~32 범위)
  //   저장된 그래프가 fontSize를 갖고 있으면 초기값으로 사용 (재오픈 시 유지)
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = (initialGraphData as { fontSize?: number } | undefined)?.fontSize;
    return typeof saved === 'number' && saved >= 12 && saved <= 32 ? saved : 16;
  });
  // ★ 초기화 이후 사용자가 실제로 변경했는지 추적 — mount 시 덮어쓰기 방지
  const userChangedFontSizeRef = useRef(false);
  const [drawMode, setDrawMode] = useState<'none' | 'segment' | 'fill'>('none');
  const [clickedCoords, setClickedCoords] = useState<{ x: number; y: number }[]>([]);
  const [pointStyle, setPointStyle] = useState<'both' | 'label' | 'dot'>('both');
  const containerRef = useRef<HTMLDivElement>(null);
  const calculatorRef = useRef<DesmosCalculator | null>(null);
  const pointCountRef = useRef(0);
  const segCountRef = useRef(0);
  const regionCountRef = useRef(0);

  // ★ 그래프 클릭 핸들러 — Desmos pixelsToMath API 사용
  const handleGraphClick = useCallback((e: React.MouseEvent) => {
    if (drawMode === 'none' || !containerRef.current || !calculatorRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;

    let coord: { x: number; y: number };
    try {
      // Desmos 네이티브 좌표 변환
      const mathCoord = calculatorRef.current.pixelsToMath({ x: pixelX, y: pixelY });
      coord = { x: Math.round(mathCoord.x * 100) / 100, y: Math.round(mathCoord.y * 100) / 100 };
    } catch {
      // fallback: 수동 변환
      const bounds = calculatorRef.current.graphpaperBounds;
      if (!bounds) return;
      const relX = pixelX / rect.width;
      const relY = pixelY / rect.height;
      coord = {
        x: Math.round((bounds.left + relX * (bounds.right - bounds.left)) * 100) / 100,
        y: Math.round((bounds.top - relY * (bounds.top - bounds.bottom)) * 100) / 100,
      };
    }

    console.log(`[GraphModal] 클릭 좌표: (${coord.x}, ${coord.y})`);

    setClickedCoords(prev => {
      const next = [...prev, coord];

      if (drawMode === 'segment' && next.length === 2) {
        segCountRef.current++;
        calculatorRef.current?.setExpression({
          id: `user-seg-${segCountRef.current}`,
          latex: `\\operatorname{polygon}\\left((${next[0].x},${next[0].y}),(${next[1].x},${next[1].y})\\right)`,
          color: '#555555',
        });
        return []; // 리셋, 연속 그리기 가능
      }

      return next;
    });
  }, [drawMode]);

  // ★ 채우기 완료
  const finishFill = useCallback(() => {
    if (clickedCoords.length >= 3 && calculatorRef.current) {
      regionCountRef.current++;
      const polyLatex = clickedCoords.map(c => `(${c.x},${c.y})`).join(',');
      calculatorRef.current.setExpression({
        id: `user-region-${regionCountRef.current}`,
        latex: `\\operatorname{polygon}\\left(${polyLatex}\\right)`,
        color: '#fbbf24',
      });
    }
    setClickedCoords([]);
  }, [clickedCoords]);

  // ★ 점 표시 모드 변경
  const cyclePointStyle = useCallback(() => {
    const next = pointStyle === 'both' ? 'label' : pointStyle === 'label' ? 'dot' : 'both';
    setPointStyle(next);
    if (!calculatorRef.current) return;
    const count = pointCountRef.current;
    for (let i = 0; i < count; i++) {
      try {
        calculatorRef.current.setExpression({
          id: `point-${i}`,
          pointSize: next === 'label' ? 0 : 10,
          pointOpacity: next === 'label' ? 0 : 1,
          showLabel: next !== 'dot',
        } as any);
      } catch { /* ignore */ }
    }
  }, [pointStyle]);

  // ★ 점 목록 추출 (라벨 기반 — 기존 데이터 호환용)
  const getPointsFromDesmos = useCallback((): Array<{ label: string; x: number; y: number }> => {
    if (!calculatorRef.current) return [];
    const state = calculatorRef.current.getState();
    const pts: Array<{ label: string; x: number; y: number }> = [];
    const varValues = new Map<string, number>();
    for (const e of (state.expressions?.list || [])) {
      const match = (e as { latex?: string }).latex?.match(/^([xy]_\{?\d+\}?)\s*=\s*(-?[\d.]+)$/);
      if (match) varValues.set(match[1], parseFloat(match[2]));
    }
    for (const e of (state.expressions?.list || [])) {
      const latex = (e as { latex?: string }).latex || '';
      const ptMatch = latex.match(/^([A-Z])\s*=\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)$/);
      if (ptMatch) {
        let x = parseFloat(ptMatch[2]);
        let y = parseFloat(ptMatch[3]);
        if (isNaN(x)) x = varValues.get(ptMatch[2]) ?? 0;
        if (isNaN(y)) y = varValues.get(ptMatch[3]) ?? 0;
        pts.push({ label: ptMatch[1], x, y });
      }
    }
    return pts;
  }, []);

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
      fontSize,            // ★ 라벨/텍스트 기본 크기
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
            pointSize: 10,
            showLabel: true,
            label: label,
            labelOrientation: 'above',
            labelSize: 'medium',
          } as any);

          // x축으로 수직 점선 (점 → x축)
          calculator.setExpression({
            id: `dashV-${i}`,
            latex: `(${xVar}, t)`,
            parametricDomain: { min: '0', max: yVar },
            color: '#888888',
            style: (window.Desmos as unknown as { Styles?: { DASHED?: string } })?.Styles?.DASHED ?? undefined,
            lineWidth: 1.5,
            hidden: !showProjections,
          });

          // y축으로 수평 점선 (점 → y축)
          calculator.setExpression({
            id: `dashH-${i}`,
            latex: `(t, ${yVar})`,
            parametricDomain: { min: '0', max: xVar },
            color: '#888888',
            style: (window.Desmos as unknown as { Styles?: { DASHED?: string } })?.Styles?.DASHED ?? undefined,
            lineWidth: 1.5,
            hidden: !showProjections,
          });
        });
      }
    }

    // ★ segments → polygon 선분
    if (initialGraphData?.segments && initialGraphData.points) {
      const ptMap = new Map<string, { x: number; y: number }>();
      initialGraphData.points.forEach(p => { if (p.label) ptMap.set(p.label, { x: p.x, y: p.y }); });
      initialGraphData.segments.forEach((seg, i) => {
        const p1 = ptMap.get(seg[0]);
        const p2 = ptMap.get(seg[1]);
        if (p1 && p2) {
          calculator.setExpression({
            id: `seg-${i}`,
            latex: `\\operatorname{polygon}\\left((${p1.x},${p1.y}),(${p2.x},${p2.y})\\right)`,
            color: '#555555',
          });
        }
      });
    }

    // ★ shadedRegions → polygon 채움
    if (initialGraphData?.shadedRegions && initialGraphData.points) {
      const ptMap = new Map<string, { x: number; y: number }>();
      initialGraphData.points.forEach(p => { if (p.label) ptMap.set(p.label, { x: p.x, y: p.y }); });
      initialGraphData.shadedRegions.forEach((region, i) => {
        const coords = region.vertices.map(v => ptMap.get(v)).filter(Boolean) as { x: number; y: number }[];
        if (coords.length >= 3) {
          const polyLatex = coords.map(c => `(${c.x},${c.y})`).join(',');
          calculator.setExpression({
            id: `region-${i}`,
            latex: `\\operatorname{polygon}\\left(${polyLatex}\\right)`,
            color: region.color || '#cccccc',
          });
        }
      });
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

  // ★ fontSize 변경 시 Desmos에 즉시 반영 (사용자가 +/- 누른 경우만)
  useEffect(() => {
    const calc = calculatorRef.current;
    if (!calc) return;
    // mount 시 또는 저장된 값으로 초기화할 때는 setState/생성자가 이미 처리 → 스킵
    if (!userChangedFontSizeRef.current) return;
    try {
      calc.updateSettings({ fontSize });
    } catch (err) {
      console.warn('[GraphModal] fontSize 업데이트 실패:', err);
    }
  }, [fontSize]);

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
  const handleSave = async () => {
    if (!calculatorRef.current) return;

    // ★ Desmos screenshot + 점 라벨 합성
    const baseImage = calculatorRef.current.screenshot({ width: 600, height: 480, targetPixelRatio: 2 });
    let imageDataUrl = baseImage;

    // 점 라벨(A, B, C, D 등)을 스크린샷 위에 그리기
    const graphOuter = containerRef.current?.querySelector('.dcg-graph-outer') as HTMLElement;
    const labelEls = containerRef.current?.querySelectorAll('.dcg-label') as NodeListOf<HTMLElement> | undefined;
    if (labelEls && labelEls.length > 0 && graphOuter) {
      try {
        const graphRect = graphOuter.getBoundingClientRect();
        const img = new Image();
        await new Promise<void>(r => { img.onload = () => r(); img.src = baseImage; });
        const cvs = document.createElement('canvas');
        cvs.width = img.width; cvs.height = img.height;
        const ctx = cvs.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const sx = cvs.width / graphRect.width;
        const sy = cvs.height / graphRect.height;
        ctx.font = 'bold 22px "Times New Roman", serif';
        ctx.fillStyle = '#222222';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        labelEls.forEach(el => {
          const r = el.getBoundingClientRect();
          const x = (r.left + r.width / 2 - graphRect.left) * sx;
          const y = (r.top + r.height / 2 - graphRect.top) * sy;
          const text = el.textContent?.trim() || '';
          if (text) ctx.fillText(text, x, y);
        });
        imageDataUrl = cvs.toDataURL('image/png');
      } catch { /* fallback: 라벨 없는 스크린샷 사용 */ }
    }

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

    // ★ 포인트 라벨 추출 (A, B, C, D 등 — 좌표 기반 오버레이용)
    const pointLabels: Array<{ label: string; x: number; y: number }> = [];
    for (const e of allExprs) {
      if (e.label && e.latex) {
        // A=(x_2, y_2) 형식에서 실제 좌표 추출
        const coordMatch = e.latex.match(/=\s*\(\s*([^,]+),\s*([^)]+)\)/);
        if (coordMatch) {
          // 변수 참조가 아닌 실제 숫자인지 확인
          const xVal = parseFloat(coordMatch[1]);
          const yVal = parseFloat(coordMatch[2]);
          if (!isNaN(xVal) && !isNaN(yVal)) {
            pointLabels.push({ label: e.label, x: xVal, y: yVal });
          }
        }
      }
    }
    // 변수 참조 포인트: desmosState에서 변수값 해석
    if (pointLabels.length === 0) {
      const varValues: Record<string, number> = {};
      for (const e of allExprs) {
        const varMatch = (e.latex || '').match(/^([a-z]_?\{?\d*\}?)\s*=\s*(-?[\d.]+)$/);
        if (varMatch) varValues[varMatch[1]] = parseFloat(varMatch[2]);
      }
      for (const e of allExprs) {
        if (e.label && e.latex) {
          const coordMatch = e.latex.match(/=\s*\(\s*([^,]+),\s*([^)]+)\)/);
          if (coordMatch) {
            const resolveVar = (v: string) => {
              const trimmed = v.trim();
              const num = parseFloat(trimmed);
              if (!isNaN(num)) return num;
              return varValues[trimmed] ?? NaN;
            };
            const xVal = resolveVar(coordMatch[1]);
            const yVal = resolveVar(coordMatch[2]);
            if (!isNaN(xVal) && !isNaN(yVal)) {
              pointLabels.push({ label: e.label, x: xVal, y: yVal });
            }
          }
        }
      }
    }
    console.log('[GraphModal] 포인트 라벨:', pointLabels);
    console.log('[GraphModal] 저장할 수식:', validExprs.map(e => e.latex));

    onInsert(imageDataUrl, validExprs);

    if (onSaveGraphData) {
      onSaveGraphData({
        expressions: validExprs,
        xRange: [bounds.left, bounds.right],
        yRange: [bounds.bottom, bounds.top],
        imageDataUrl,
        desmosState: state,
        pointLabels, // ★ 포인트 라벨 좌표 저장
        fontSize,    // ★ 현재 글자 크기 저장 (재오픈 시 복원)
      } as any);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* ★ 선분 연결 — 그래프에서 두 점 클릭 */}
            <button
              onClick={() => { setDrawMode(drawMode === 'segment' ? 'none' : 'segment'); setClickedCoords([]); }}
              className={`btn-reset ${drawMode === 'segment' ? 'btn-active' : ''}`}
              title="그래프에서 두 점을 클릭하여 선분 연결"
              style={{ fontSize: '12px', padding: '4px 10px', whiteSpace: 'nowrap' }}
            >
              선분 연결
            </button>
            {/* ★ 도형 채우기 — 그래프에서 점 여러개 클릭 후 채우기 */}
            <button
              onClick={() => { setDrawMode(drawMode === 'fill' ? 'none' : 'fill'); setClickedCoords([]); }}
              className={`btn-reset ${drawMode === 'fill' ? 'btn-active' : ''}`}
              title="그래프에서 꼭짓점을 클릭하여 도형 채우기"
              style={{ fontSize: '12px', padding: '4px 10px', whiteSpace: 'nowrap' }}
            >
              도형 채우기
            </button>
            {/* ★ 글자 크기 조절 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
              <span style={{ fontSize: '11px', color: '#6b7280' }}>글자</span>
              <button
                onClick={() => { userChangedFontSizeRef.current = true; setFontSize(s => Math.max(12, s - 2)); }}
                style={{ fontSize: '14px', padding: '0 6px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#374151' }}
                title="글자 크기 줄이기"
              >−</button>
              <span style={{ fontSize: '12px', color: '#111827', minWidth: '22px', textAlign: 'center' }}>{fontSize}</span>
              <button
                onClick={() => { userChangedFontSizeRef.current = true; setFontSize(s => Math.min(32, s + 2)); }}
                style={{ fontSize: '14px', padding: '0 6px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#374151' }}
                title="글자 크기 키우기"
              >+</button>
            </div>
            {/* ★ 라벨 추가 — 그래프에 텍스트 라벨 배치 */}
            <button
              onClick={() => {
                const text = prompt('라벨 텍스트 입력 (예: y=2^{x+2}-3)');
                if (!text || !calculatorRef.current) return;
                const bounds = calculatorRef.current.graphpaperBounds || { left: -10, right: 10, bottom: -10, top: 10 };
                const cx = (bounds.left + bounds.right) / 2;
                const cy = (bounds.top + bounds.bottom * 0.3 + bounds.top * 0.7);
                const id = `label-${Date.now()}`;
                calculatorRef.current.setExpression({
                  id,
                  latex: `(${cx.toFixed(2)}, ${cy.toFixed(2)})`,
                  color: '#333333',
                  pointSize: 0,
                  label: text,
                  showLabel: true,
                  labelSize: '2',
                  dragMode: 'xy' as any,
                });
              }}
              className="btn-reset"
              title="그래프에 텍스트 라벨 추가 (드래그로 위치 조정)"
              style={{ fontSize: '12px', padding: '4px 10px', whiteSpace: 'nowrap' }}
            >
              라벨 추가
            </button>
            {/* ★ 상태 표시 */}
            {drawMode !== 'none' && (
              <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 500 }}>
                {drawMode === 'segment'
                  ? `그래프 클릭 (${clickedCoords.length}/2)`
                  : `꼭짓점 클릭 (${clickedCoords.length}개)`}
              </span>
            )}
            {drawMode === 'fill' && clickedCoords.length >= 3 && (
              <button
                onClick={finishFill}
                style={{ fontSize: '12px', padding: '4px 10px', background: '#22c55e', color: 'white', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
              >
                채우기 완료
              </button>
            )}
            {drawMode !== 'none' && (
              <button
                onClick={() => { setDrawMode('none'); setClickedCoords([]); }}
                className="btn-reset"
                style={{ fontSize: '11px', padding: '2px 8px', color: '#ef4444' }}
              >
                취소
              </button>
            )}
            {drawMode === 'none' && pointCountRef.current > 0 && (
              <>
                <button
                  onClick={cyclePointStyle}
                  className="btn-reset"
                  title="점 표시 모드 전환: 점+라벨 / 라벨만 / 점만"
                  style={{ fontSize: '12px', padding: '4px 10px', whiteSpace: 'nowrap' }}
                >
                  {pointStyle === 'both' ? '점+라벨' : pointStyle === 'label' ? '라벨만' : '점만'}
                </button>
                <button
                  onClick={toggleProjections}
                  className={`btn-reset ${showProjections ? 'btn-active' : ''}`}
                  title="축 투영선 ON/OFF"
                  style={{ fontSize: '12px', padding: '4px 10px', whiteSpace: 'nowrap' }}
                >
                  투영선 {showProjections ? 'ON' : 'OFF'}
                </button>
              </>
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
        <div className="graph-modal-body" style={{ position: 'relative' }}>
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
          {/* ★ 선분/채우기 모드: 클릭 캡처 오버레이 */}
          {drawMode !== 'none' && (
            <div
              onClick={handleGraphClick}
              style={{
                position: 'absolute',
                inset: 0,
                cursor: 'crosshair',
                zIndex: 10,
                background: 'rgba(0,0,0,0.01)', // 투명하지만 클릭 가능
              }}
            />
          )}
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
