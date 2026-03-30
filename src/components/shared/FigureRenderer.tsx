'use client';

// ============================================================================
// FigureRenderer — 통합 도형 렌더링 컴포넌트
// figureData (구조화) → figureSvg (레거시) → cropImage 순서로 fallback
// ============================================================================

import React, { Suspense, lazy, useMemo, useState, useCallback } from 'react';
import { Loader2, Pencil } from 'lucide-react';
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

// GraphModal — 그래프 편집 모달 (lazy load)
const GraphModal = lazy(() => import('@/components/editor/modals/GraphModal'));

// ============================================================================
// Props
// ============================================================================

interface FigureRendererProps {
  /** 구조화된 도형 데이터 */
  figureData?: InterpretedFigure;
  /** 레거시 raw SVG (fallback) */
  figureSvg?: string;
  /** 크롭 이미지 URL (최종 fallback) */
  cropImageUrl?: string;
  /** ★ 업스케일된 크롭 이미지 URL (최우선) */
  upscaledCropUrl?: string;
  /** 도형 소스 타입 */
  figureSource?: 'upscaled_crop' | 'ai_generated' | 'diagram_db' | 'original_crop' | undefined;
  /** 최대 너비 */
  maxWidth?: number;
  /** 추가 클래스 */
  className?: string;
  /** 다크 테마 (기본: true) */
  darkMode?: boolean;
  /** ★ 그래프 편집 가능 여부 (편집 버튼 표시) */
  editable?: boolean;
  /** ★ 문제 ID (편집 후 DB 저장에 필요) */
  problemId?: string;
  /** ★ 그래프 편집 완료 콜백 */
  onGraphEdited?: (data: {
    expressions: Array<{ id: string; latex: string; color?: string }>;
    xRange: [number, number];
    yRange: [number, number];
    imageDataUrl: string;
  }) => void;
}

// ============================================================================
// 메인 컴포넌트
// ============================================================================

export function FigureRenderer({
  figureData,
  figureSvg,
  cropImageUrl,
  upscaledCropUrl,
  figureSource,
  maxWidth = 280,
  className = '',
  darkMode = true,
  editable = false,
  problemId,
  onGraphEdited,
}: FigureRendererProps) {
  const [graphEditOpen, setGraphEditOpen] = useState(false);

  // DEBUG: figureData 상태 확인
  if (figureData && figureData.rendering) {
    const r = figureData.rendering as unknown as Record<string, unknown>;
    console.log('[FigureRenderer] figureType:', figureData.figureType,
      'hasSvg:', !!r.svg,
      'svgLen:', typeof r.svg === 'string' ? r.svg.length : 0,
      'vertices:', (r.vertices as unknown[])?.length || 0);
  }

  // ★ 그래프 편집 핸들러 — DB 업데이트
  const handleGraphSave = useCallback(async (data: {
    expressions: Array<{ id: string; latex: string; color?: string }>;
    xRange: [number, number];
    yRange: [number, number];
    imageDataUrl: string;
    desmosState?: unknown;
  }) => {
    // 부모 콜백 호출
    if (onGraphEdited) {
      onGraphEdited(data);
    }

    // problemId가 있으면 직접 DB 업데이트
    if (problemId) {
      try {
        // ★ 원본 rendering 완전 보존 + 사용자 추가 수식만 합침
        const origRendering = figureData?.rendering as Record<string, unknown> | undefined;
        const origExpressions = (origRendering?.expressions || []) as Array<{ latex: string; color?: string; style?: string }>;

        // 사용자가 추가한 수식 추출 (원본에 없는 것, 헬퍼 제외)
        const origLatexSet = new Set(origExpressions.map(e => e.latex.trim()));
        const userAddedExprs = data.expressions
          .filter(e => {
            const latex = e.latex.trim();
            if (origLatexSet.has(latex)) return false;
            // 슬라이더/변수 대입
            // 슬라이더 변수 — x, y는 제외 (x=-4는 점근선/직선)
            if (/^[a-wz](_\{?\d+\}?)?\s*=\s*-?[\d.]+$/.test(latex)) return false;
            // 포인트
            if (/^[A-Z](_\{?\d+\}?)?\s*=\s*\(/.test(latex)) return false;
            // 투영선 파라메트릭
            if (/^\(\s*[xy]_\{?\d+\}?\s*,\s*t\s*\)$/.test(latex)) return false;
            if (/^\(\s*t\s*,\s*[xy]_\{?\d+\}?\s*\)$/.test(latex)) return false;
            return true;
          })
          .map(e => ({ latex: e.latex, color: e.color || '#888888', style: 'solid' }));

        const res = await fetch(`/api/problems/${problemId}/update-figure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            figureType: 'graph',
            rendering: {
              ...(origRendering || {}),
              type: 'graph',
              // 원본 수식 + 사용자 추가 수식 합치기
              expressions: [...origExpressions, ...userAddedExprs],
              xRange: data.xRange,
              yRange: data.yRange,
              // Desmos 전체 상태 + 스크린샷 저장
              desmosState: data.desmosState,
              editedImageDataUrl: data.imageDataUrl,
            },
          }),
        });
        if (res.ok) {
          console.log(`[FigureRenderer] ✅ 그래프 편집 저장 완료 (problem ${problemId})`);
          window.dispatchEvent(new CustomEvent('graph-edited', { detail: { problemId } }));
        }
      } catch (err) {
        console.error(`[FigureRenderer] 그래프 편집 저장 실패:`, err);
      }
    }
  }, [problemId, onGraphEdited, figureData]);

  // ★ 0. 업스케일된 크롭 이미지 (최우선 — 원본이 쓸만할 때 AI 생성 없이 사용)
  // UpscaledImage 컴포넌트로 분리하여 로드 실패 시 자동 폴백 처리
  if (upscaledCropUrl || figureSource === 'upscaled_crop') {
    const url = upscaledCropUrl || cropImageUrl;
    if (url) {
      return (
        <UpscaledImageWithFallback
          url={url}
          maxWidth={maxWidth}
          className={className}
          darkMode={darkMode}
          // 폴백 props (이미지 로드 실패 시 다음 단계로)
          figureData={figureData}
          figureSvg={figureSvg}
          cropImageUrl={cropImageUrl}
        />
      );
    }
  }

  // 1. 구조화된 figureData가 있고 신뢰도가 충분한 경우 (AI 생성)
  if (figureData && figureData.confidence >= 0.3 && figureData.figureType !== 'photo' && figureData.rendering) {
    const isGraph = figureData.rendering.type === 'graph';
    const graphRendering = isGraph ? figureData.rendering as GraphRendering : null;
    const savedDesmosState = (figureData.rendering as Record<string, unknown>)?.desmosState;

    return (
      <div className={`relative group ${className}`} style={{ maxWidth }}>
        {/* ★ 편집된 스크린샷이 있으면 이미지 표시, 없으면 기존 렌더링 */}
        {isGraph && (figureData.rendering as Record<string, unknown>)?.editedImageDataUrl ? (
          <div className={`relative rounded-lg overflow-hidden border ${darkMode ? 'border-zinc-700 bg-white' : 'border-gray-200'}`}>
            <img
              src={(figureData.rendering as Record<string, unknown>).editedImageDataUrl as string}
              alt="편집된 그래프"
              style={{ width: maxWidth, height: 'auto', display: 'block' }}
            />
            {/* ★ 원본 annotations 오버레이 (수식, 라벨) */}
            {graphRendering?.annotations && graphRendering.annotations.length > 0 && (
              <div className="absolute top-2 right-3 text-right" style={{ fontFamily: "'Times New Roman', Georgia, serif", fontStyle: 'italic', fontSize: '13px', color: '#1f2937', lineHeight: 1.5 }}>
                {graphRendering.annotations.map((anno, i) => (
                  <div key={i} dangerouslySetInnerHTML={{ __html: anno
                    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '<sup>$1</sup>&frasl;<sub>$2</sub>')
                    .replace(/\\log/g, 'log')
                    .replace(/\\[a-zA-Z]+/g, '')
                    .replace(/[{}]/g, '')
                  }} />
                ))}
              </div>
            )}
            {/* points 라벨은 스크린샷에 포함되므로 오버레이 불필요 */}
          </div>
        ) : (
          <TypedFigureRenderer
            figureType={figureData.figureType}
            rendering={figureData.rendering}
            darkMode={darkMode}
            maxWidth={maxWidth}
          />
        )}
        {/* ★ 그래프 편집 버튼 — hover 시 표시 */}
        {editable && isGraph && graphRendering && (
          <>
            <button
              onClick={() => setGraphEditOpen(true)}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity
                bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-2.5 py-1.5
                text-xs font-medium flex items-center gap-1.5 shadow-lg z-10"
              title="그래프 수정"
            >
              <Pencil size={12} />
              수정
            </button>
            {/* GraphModal */}
            {graphEditOpen && (
              <Suspense fallback={null}>
                <GraphModal
                  isOpen={graphEditOpen}
                  onClose={() => setGraphEditOpen(false)}
                  onInsert={() => {}}
                  initialGraphData={{
                    expressions: graphRendering.expressions.map(e => ({
                      latex: e.latex,
                      color: e.color,
                      style: e.style,
                      hidden: e.hidden,
                    })),
                    xRange: graphRendering.xRange,
                    yRange: graphRendering.yRange,
                    points: graphRendering.points,
                    desmosState: savedDesmosState, // ★ 이전 편집 상태 복원
                  }}
                  onSaveGraphData={handleGraphSave}
                />
              </Suspense>
            )}
          </>
        )}
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

  // 3. 크롭 이미지 fallback (원본)
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
    // ★ AI 직접 생성 SVG 우선 (호/곡선/부채꼴 등 복잡 도형 정확)
    if (rendering.svg) return rendering.svg;
    // 프로그래밍 기반 SVG 폴백 (직선/다각형만 가능)
    if (rendering.vertices.length >= 2) {
      const programmatic = generateGeometrySVG(rendering, false);
      if (programmatic) return programmatic;
    }
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
    // ★ AI 직접 생성 SVG 우선
    if (rendering.svg) return rendering.svg;
    // 프로그래밍 기반 SVG 폴백
    if (rendering.headers.length > 0 || rendering.rows.length > 0) {
      const programmatic = generateTableSVG(rendering);
      if (programmatic) return programmatic;
    }
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
// 업스케일 이미지 + 로드 실패 시 자동 폴백
// ============================================================================

function UpscaledImageWithFallback({
  url,
  maxWidth,
  className,
  darkMode,
  figureData,
  figureSvg,
  cropImageUrl,
}: {
  url: string;
  maxWidth: number;
  className: string;
  darkMode: boolean;
  figureData?: InterpretedFigure;
  figureSvg?: string;
  cropImageUrl?: string;
}) {
  const [loadFailed, setLoadFailed] = useState(false);

  // 이미지 로드 실패 → 기존 렌더링으로 폴백
  if (loadFailed) {
    // figureData 폴백
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
    // figureSvg 폴백
    if (figureSvg) {
      return (
        <div
          className={`figure-svg-container ${className}`}
          style={{ maxWidth }}
          dangerouslySetInnerHTML={{ __html: figureSvg }}
        />
      );
    }
    // cropImage 폴백
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
    return null;
  }

  return (
    <img
      src={url}
      alt="문제 도형 (업스케일)"
      className={`rounded-lg border shadow-sm ${
        darkMode ? 'border-zinc-600 bg-white' : 'border-gray-300 bg-white'
      } ${className}`}
      style={{ maxWidth }}
      loading="lazy"
      onError={() => {
        console.warn(`[FigureRenderer] 업스케일 이미지 로드 실패: ${url}`);
        setLoadFailed(true);
      }}
    />
  );
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
