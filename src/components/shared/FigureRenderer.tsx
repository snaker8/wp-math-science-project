'use client';

// ============================================================================
// FigureRenderer — 통합 도형 렌더링 컴포넌트
// figureData (구조화) → figureSvg (레거시) → cropImage 순서로 fallback
// ============================================================================

import React, { Suspense, lazy, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import type {
  InterpretedFigure,
  GraphRendering,
  GeometryRendering,
  TableRendering,
  DiagramRendering,
} from '@/types/ocr';
import { MathRenderer } from './MathRenderer';
import { generateGeometrySVG, generateTableSVG, generateGraphSVG } from '@/lib/vision/figure-renderer';

// Desmos는 실제 graph 타입이 있을 때만 로드 (성능 최적화)
const InlineDesmosGraph = lazy(() =>
  import('./InlineDesmosGraph').then(mod => ({ default: mod.InlineDesmosGraph }))
);

// ============================================================================
// Props
// ============================================================================

interface FigureRendererProps {
  /** 구조화된 도형 데이터 (우선) */
  figureData?: InterpretedFigure;
  /** 레거시 raw SVG (fallback) */
  figureSvg?: string;
  /** 크롭 이미지 URL (최종 fallback) */
  cropImageUrl?: string;
  /** 최대 너비 */
  maxWidth?: number;
  /** 추가 클래스 */
  className?: string;
  /** 다크 테마 (기본: true) */
  darkMode?: boolean;
}

// ============================================================================
// 메인 컴포넌트
// ============================================================================

export function FigureRenderer({
  figureData,
  figureSvg,
  cropImageUrl,
  maxWidth = 280,
  className = '',
  darkMode = true,
}: FigureRendererProps) {
  // DEBUG: figureData 상태 확인
  if (figureData && figureData.rendering) {
    const r = figureData.rendering as unknown as Record<string, unknown>;
    console.log('[FigureRenderer] figureType:', figureData.figureType,
      'hasSvg:', !!r.svg,
      'svgLen:', typeof r.svg === 'string' ? r.svg.length : 0,
      'vertices:', (r.vertices as unknown[])?.length || 0);
  }

  // 1. 구조화된 figureData가 있고 신뢰도가 충분한 경우
  if (figureData && figureData.confidence >= 0.3 && figureData.figureType !== 'photo' && figureData.rendering) {
    return (
      <div className={className} style={{ maxWidth }}>
        <TypedFigureRenderer
          figureType={figureData.figureType}
          rendering={figureData.rendering}
          darkMode={darkMode}
          maxWidth={maxWidth}
        />
      </div>
    );
  }

  // 2. 레거시 figureSvg fallback
  if (figureSvg) {
    return (
      <div
        className={`figure-svg-container ${className}`}
        style={{ maxWidth }}
        dangerouslySetInnerHTML={{ __html: figureSvg }}
      />
    );
  }

  // 3. 크롭 이미지 fallback
  if (cropImageUrl) {
    return (
      <img
        src={cropImageUrl}
        alt="문제 도형"
        className={`rounded-lg border opacity-60 ${
          darkMode ? 'border-zinc-700' : 'border-gray-300'
        } ${className}`}
        style={{ maxWidth }}
        loading="lazy"
      />
    );
  }

  // 4. 아무것도 없음
  return (
    <div className={`px-3 py-2 rounded text-xs border ${
      darkMode
        ? 'bg-zinc-800 text-zinc-500 border-zinc-700'
        : 'bg-gray-100 text-gray-400 border-gray-200'
    } ${className}`}>
      [도형 미생성]
    </div>
  );
}

// ============================================================================
// 타입별 렌더러 디스패치
// ============================================================================

function TypedFigureRenderer({
  figureType,
  rendering,
  darkMode,
  maxWidth,
}: {
  figureType: string;
  rendering: GraphRendering | GeometryRendering | TableRendering | DiagramRendering;
  darkMode: boolean;
  maxWidth: number;
}) {
  switch (rendering.type) {
    case 'graph':
      return <GraphFigure rendering={rendering as GraphRendering} darkMode={darkMode} maxWidth={maxWidth} />;
    case 'geometry':
      return <GeometryFigure rendering={rendering as GeometryRendering} darkMode={darkMode} />;
    case 'table':
      return <TableFigure rendering={rendering as TableRendering} darkMode={darkMode} />;
    case 'number_line':
    case 'diagram':
      return <DiagramFigure rendering={rendering as DiagramRendering} darkMode={darkMode} />;
    default:
      return null;
  }
}

// ============================================================================
// 그래프 → SVG 우선, Desmos fallback
// ============================================================================

function GraphFigure({
  rendering,
  darkMode,
  maxWidth,
}: {
  rendering: GraphRendering;
  darkMode: boolean;
  maxWidth: number;
}) {
  // SVG 렌더링 시도 (참조사이트 스타일)
  const svgResult = useMemo(() => {
    return generateGraphSVG(rendering);
  }, [rendering]);

  // SVG 성공 → 정적 SVG 표시
  if (svgResult) {
    return (
      <div
        className="figure-graph-container rounded-lg p-3 bg-white border border-zinc-200 shadow-sm"
        dangerouslySetInnerHTML={{ __html: svgResult }}
      />
    );
  }

  // SVG 실패 (수식 변환 불가) → Desmos fallback
  const expressions = rendering.expressions.map(e => e.latex);
  const graphWidth = Math.min(maxWidth, 350);
  const graphHeight = Math.round(graphWidth * 0.72);

  return (
    <div>
      <Suspense
        fallback={
          <div
            className={`flex items-center justify-center rounded-lg border ${
              darkMode ? 'bg-zinc-800/50 border-zinc-700' : 'bg-gray-50 border-gray-200'
            }`}
            style={{ width: graphWidth, height: graphHeight }}
          >
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            <span className={`ml-2 text-xs ${darkMode ? 'text-zinc-500' : 'text-gray-400'}`}>
              그래프 로딩...
            </span>
          </div>
        }
      >
        <InlineDesmosGraph
          expressions={expressions}
          xRange={rendering.xRange}
          yRange={rendering.yRange}
          points={rendering.points}
          width={graphWidth}
          height={graphHeight}
          darkMode={darkMode}
        />
      </Suspense>
      {rendering.annotations.length > 0 && (
        <div className={`mt-1 space-y-0.5 ${darkMode ? 'text-zinc-400' : 'text-gray-500'}`}>
          {rendering.annotations.map((a, i) => (
            <div key={i} className="text-[10px]">{a}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 기하 도형 → SVG
// ============================================================================

function GeometryFigure({
  rendering,
  darkMode,
}: {
  rendering: GeometryRendering;
  darkMode: boolean;
}) {
  const svgResult = useMemo(() => {
    // 프로그래밍 기반 SVG만 사용 (Vision SVG는 빗금/손글씨 문제로 사용하지 않음)
    // 코드가 polygon fill로 음영을 그리므로 빗금 문제 없음
    if (rendering.vertices.length >= 2) {
      const programmatic = generateGeometrySVG(rendering, false);
      if (programmatic) return programmatic;
    }
    // Legacy Vision SVG fallback (기존 데이터 호환)
    if (rendering.svg) return rendering.svg;
    return null;
  }, [rendering]);

  if (svgResult) {
    return (
      <div
        className="figure-geometry-container rounded-lg p-3 bg-white border border-zinc-200 shadow-sm"
        dangerouslySetInnerHTML={{ __html: svgResult }}
      />
    );
  }

  // SVG 생성 불가 → LaTeX fallback
  if (rendering.latex) {
    return <MathRenderer content={rendering.latex} block className={darkMode ? 'text-zinc-200' : ''} />;
  }

  return null;
}

// ============================================================================
// 표 → KaTeX 또는 HTML
// ============================================================================

function TableFigure({
  rendering,
  darkMode,
}: {
  rendering: TableRendering;
  darkMode: boolean;
}) {
  const svgResult = useMemo(() => {
    // 프로그래밍 기반 SVG만 사용 (Vision SVG는 손글씨 재현 문제로 사용하지 않음)
    if (rendering.headers.length > 0 || rendering.rows.length > 0) {
      const programmatic = generateTableSVG(rendering);
      if (programmatic) return programmatic;
    }
    // Legacy Vision SVG fallback (기존 데이터 호환)
    if (rendering.svg) return rendering.svg;
    return null;
  }, [rendering]);

  if (svgResult) {
    return (
      <div
        className="figure-table-container rounded-lg p-3 bg-white border border-zinc-200 shadow-sm"
        dangerouslySetInnerHTML={{ __html: svgResult }}
      />
    );
  }

  // 우선순위 3: LaTeX 배열
  if (rendering.latex && rendering.latex.includes('\\begin')) {
    return <MathRenderer content={rendering.latex} block className={darkMode ? 'text-zinc-200' : ''} />;
  }

  // 우선순위 4: HTML 테이블
  return (
    <table className={`text-xs border-collapse ${
      darkMode ? 'text-zinc-300' : 'text-gray-800'
    }`}>
      {rendering.headers.length > 0 && (
        <thead>
          <tr>
            {rendering.headers.map((h, i) => (
              <th
                key={i}
                className={`px-3 py-1.5 text-center font-semibold border ${
                  darkMode
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-200'
                    : 'bg-gray-100 border-gray-300 text-gray-700'
                }`}
              >
                <MathRenderer content={h} />
              </th>
            ))}
          </tr>
        </thead>
      )}
      {rendering.rows.length > 0 && (
        <tbody>
          {rendering.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-3 py-1 text-center border ${
                    darkMode ? 'border-zinc-700' : 'border-gray-300'
                  }`}
                >
                  <MathRenderer content={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      )}
    </table>
  );
}

// ============================================================================
// 다이어그램 / 수직선 → LaTeX + 설명
// ============================================================================

function DiagramFigure({
  rendering,
  darkMode,
}: {
  rendering: DiagramRendering;
  darkMode: boolean;
}) {
  if (rendering.latex) {
    return <MathRenderer content={rendering.latex} block className={darkMode ? 'text-zinc-200' : ''} />;
  }

  if (rendering.description) {
    return (
      <p className={`text-xs italic ${darkMode ? 'text-zinc-400' : 'text-gray-500'}`}>
        {rendering.description}
      </p>
    );
  }

  return null;
}

// ============================================================================
// 유틸리티: figureType → 한국어 라벨
// ============================================================================

export function figureTypeLabel(figureType: string): string {
  switch (figureType) {
    case 'graph': return '그래프';
    case 'geometry': return '도형';
    case 'table': return '표';
    case 'number_line': return '수직선';
    case 'diagram': return '다이어그램';
    default: return '도형';
  }
}
