'use client';

// ============================================================================
// PDF 문제 분석 페이지 - 참조 사이트 스타일
// 좌: 페이지 썸네일 (PDF.js) | 중앙: PDF 이미지 + 바운딩 박스 | 우: 문제 상세
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  Trash2,
  RefreshCw,
  Sparkles,
  Loader2,
  CheckCircle,
  AlertCircle,
  Pencil,
  Eye,
  FileText,
  Settings2,
  X,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import AnalyzeProblemEditModal from '@/components/workflow/AnalyzeProblemEditModal';
import type { AnalyzedProblemData } from '@/components/workflow/AnalyzeProblemEditModal';
import { analyzePageBlocks, type CropRect } from '@/lib/pdf/auto-crop';

// ============================================================================
// Types
// ============================================================================

interface AnalyzedProblem {
  id: string;
  problemId?: string;
  number: number;
  content: string;
  choices: string[];
  answer: number | string;
  solution: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  typeCode: string;
  typeName: string;
  confidence: number;
  status: 'analyzing' | 'completed' | 'error' | 'edited';
  pageIndex: number;
  // 바운딩 박스 (비율 기반, 0~1)
  bbox?: { x: number; y: number; w: number; h: number };
}

interface PageData {
  pageNumber: number;
  problems: AnalyzedProblem[];
}

interface JobData {
  id: string;
  fileName: string;
  status: string;
  progress: number;
  currentStep: string;
  totalProblems: number;
  pages: PageData[];
  pdfUrl?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DIFFICULTY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: '최하', color: 'text-zinc-400 border-zinc-500 bg-zinc-800' },
  2: { label: '하', color: 'text-blue-400 border-blue-500 bg-blue-500/10' },
  3: { label: '중', color: 'text-amber-400 border-amber-500 bg-amber-500/10' },
  4: { label: '상', color: 'text-red-400 border-red-500 bg-red-500/10' },
  5: { label: '최상', color: 'text-red-300 border-red-700 bg-red-700/10' },
};

// 수학 시험지의 문제 위치: 픽셀 감지 블록 > 서버 bbox > 2단 배치 추정
function estimateBoundingBoxes(
  problems: AnalyzedProblem[],
  pageIndex: number,
  detectedBlocks?: CropRect[]
): AnalyzedProblem[] {
  const pageProblems = problems.filter(p => p.pageIndex === pageIndex);
  if (pageProblems.length === 0) return [];

  // 실제 bbox가 있는 문제와 없는 문제 분류
  const withBbox = pageProblems.filter(p => p.bbox && p.bbox.w > 0 && p.bbox.h > 0);
  const withoutBbox = pageProblems.filter(p => !p.bbox || p.bbox.w <= 0 || p.bbox.h <= 0);

  // 실제 bbox 있는 문제는 그대로 사용
  const results: AnalyzedProblem[] = [...withBbox];

  if (withoutBbox.length > 0 && detectedBlocks && detectedBlocks.length > 0) {
    // 픽셀 감지 블록을 y좌표 순으로 정렬 (2단이면 좌상→좌하→우상→우하 순서)
    const sortedBlocks = [...detectedBlocks].sort((a, b) => a.y - b.y);

    withoutBbox.forEach((p, idx) => {
      if (idx < sortedBlocks.length) {
        results.push({ ...p, bbox: sortedBlocks[idx] });
      } else {
        // 블록 부족 시 2단 추정 fallback
        const cols = 2;
        const headerOffset = 0.12;
        const colWidth = 0.46;
        const colGap = 0.04;
        const marginX = 0.02;
        const remaining = withoutBbox.length - sortedBlocks.length;
        const fallbackIdx = idx - sortedBlocks.length;
        const col = fallbackIdx % cols;
        const row = Math.floor(fallbackIdx / cols);
        const problemsPerCol = Math.ceil(remaining / cols);
        const rowHeight = Math.min(0.25, (1 - headerOffset - 0.05) / problemsPerCol);

        results.push({
          ...p,
          bbox: {
            x: marginX + col * (colWidth + colGap),
            y: headerOffset + row * rowHeight,
            w: colWidth,
            h: rowHeight - 0.02,
          },
        });
      }
    });
  } else if (withoutBbox.length > 0) {
    // detectedBlocks 없으면 기존 2단 배치 추정
    const cols = 2;
    const headerOffset = 0.12;
    const colWidth = 0.46;
    const colGap = 0.04;
    const marginX = 0.02;

    withoutBbox.forEach((p, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const problemsPerCol = Math.ceil(withoutBbox.length / cols);
      const rowHeight = Math.min(0.25, (1 - headerOffset - 0.05) / problemsPerCol);

      results.push({
        ...p,
        bbox: {
          x: marginX + col * (colWidth + colGap),
          y: headerOffset + row * rowHeight,
          w: colWidth,
          h: rowHeight - 0.02,
        },
      });
    });
  }

  return results;
}

// ============================================================================
// PDF Page Renderer Component (Canvas-based, with caching)
// ============================================================================

function PdfPageCanvas({
  pdfUrl,
  pageNumber,
  width,
  height,
  className,
}: {
  pdfUrl?: string;
  pageNumber: number;
  width: number;
  height: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!pdfUrl || !canvasRef.current) {
      setIsRendering(false);
      return;
    }

    let cancelled = false;

    const renderPage = async () => {
      try {
        setIsRendering(true);
        setError(false);

        const { loadPdfDocument, renderPdfPage } = await import('@/lib/pdf-viewer');
        const pdf = await loadPdfDocument(pdfUrl);

        if (pageNumber > pdf.numPages || cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        await renderPdfPage(canvas, pdf, pageNumber, width, height);

        if (!cancelled) {
          setIsRendering(false);
        }
      } catch (err) {
        console.error('PDF thumbnail render error:', err);
        if (!cancelled) {
          setError(true);
          setIsRendering(false);
        }
      }
    };

    renderPage();

    return () => {
      cancelled = true;
    };
  }, [pdfUrl, pageNumber, width, height]);

  if (!pdfUrl) {
    return (
      <div className={`flex items-center justify-center bg-zinc-800 ${className}`} style={{ width, height }}>
        <FileText className="h-6 w-6 text-zinc-600" />
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      <canvas ref={canvasRef} className="w-full h-full object-contain" />
      {isRendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-100">
          <span className="text-xs text-zinc-400">미리보기 불가</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Page Thumbnail List (좌측)
// ============================================================================

function PageThumbnailList({
  pages,
  currentPage,
  totalPdfPages,
  pdfUrl,
  onPageSelect,
}: {
  pages: PageData[];
  currentPage: number;
  totalPdfPages: number;
  pdfUrl?: string;
  onPageSelect: (page: number) => void;
}) {
  const maxPages = Math.max(totalPdfPages, pages.length);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800/50">
        <span className="text-xs font-bold text-zinc-300">페이지</span>
        <span className="text-xs text-cyan-400 font-bold">{maxPages}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {Array.from({ length: maxPages }).map((_, i) => {
          const pageNum = i + 1;
          const pageData = pages.find(p => p.pageNumber === pageNum);
          const isActive = currentPage === pageNum;

          return (
            <button
              key={pageNum}
              type="button"
              onClick={() => onPageSelect(pageNum)}
              className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-all ${
                isActive
                  ? 'bg-cyan-500/10 border-2 border-cyan-500/40'
                  : 'border-2 border-zinc-800 hover:border-zinc-600'
              }`}
            >
              {/* 페이지 번호 */}
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 ${
                isActive
                  ? 'bg-cyan-500 text-white'
                  : 'bg-zinc-700 text-zinc-400'
              }`}>
                {pageNum}
              </div>

              {/* 썸네일 */}
              <div className={`w-14 h-20 rounded border overflow-hidden flex-shrink-0 bg-white ${
                isActive ? 'border-cyan-400' : 'border-zinc-600'
              }`}>
                <PdfPageCanvas
                  pdfUrl={pdfUrl}
                  pageNumber={pageNum}
                  width={56}
                  height={80}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className={`text-xs font-medium ${
                  isActive ? 'text-cyan-300' : 'text-zinc-400'
                }`}>
                  페이지 {pageNum}
                </div>
                {pageData && pageData.problems.length > 0 && (
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {pageData.problems.length}문항
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Draggable Bounding Box (드래그 이동 + 리사이즈)
// ============================================================================

function DraggableBbox({
  problem,
  canvasSize,
  isSelected,
  onSelect,
  onDoubleClick,
  onBboxChange,
}: {
  problem: AnalyzedProblem;
  canvasSize: { width: number; height: number };
  isSelected: boolean;
  onSelect: () => void;
  onDoubleClick: () => void;
  onBboxChange: (bbox: { x: number; y: number; w: number; h: number }) => void;
}) {
  const bbox = problem.bbox!;
  const isComplete = problem.status === 'completed' || problem.status === 'edited';
  const isProcessing = problem.status === 'analyzing';

  // 드래그 상태
  const dragRef = useRef<{
    type: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
    startX: number;
    startY: number;
    startBbox: typeof bbox;
  } | null>(null);

  const handleMouseDown = useCallback((
    e: React.MouseEvent,
    type: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();

    dragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      startBbox: { ...bbox },
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const { type, startX, startY, startBbox } = dragRef.current;
      const dx = (ev.clientX - startX) / canvasSize.width;
      const dy = (ev.clientY - startY) / canvasSize.height;

      let newBbox = { ...startBbox };

      if (type === 'move') {
        newBbox.x = Math.max(0, Math.min(1 - startBbox.w, startBbox.x + dx));
        newBbox.y = Math.max(0, Math.min(1 - startBbox.h, startBbox.y + dy));
      } else {
        // 리사이즈 핸들
        if (type.includes('w')) {
          const newX = Math.max(0, startBbox.x + dx);
          newBbox.w = startBbox.w - (newX - startBbox.x);
          newBbox.x = newX;
        }
        if (type.includes('e')) {
          newBbox.w = Math.min(1 - startBbox.x, startBbox.w + dx);
        }
        if (type.includes('n')) {
          const newY = Math.max(0, startBbox.y + dy);
          newBbox.h = startBbox.h - (newY - startBbox.y);
          newBbox.y = newY;
        }
        if (type.includes('s')) {
          newBbox.h = Math.min(1 - startBbox.y, startBbox.h + dy);
        }
        // 최소 크기 보장
        if (newBbox.w < 0.02) newBbox.w = 0.02;
        if (newBbox.h < 0.02) newBbox.h = 0.02;
      }

      onBboxChange(newBbox);
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [bbox, canvasSize, onBboxChange, onSelect]);

  // 리사이즈 핸들 (선택된 bbox만)
  const handles = isSelected ? [
    { pos: 'nw', cursor: 'nw-resize', style: { top: -4, left: -4 } },
    { pos: 'ne', cursor: 'ne-resize', style: { top: -4, right: -4 } },
    { pos: 'sw', cursor: 'sw-resize', style: { bottom: -4, left: -4 } },
    { pos: 'se', cursor: 'se-resize', style: { bottom: -4, right: -4 } },
    { pos: 'n', cursor: 'n-resize', style: { top: -4, left: '50%', transform: 'translateX(-50%)' } },
    { pos: 's', cursor: 's-resize', style: { bottom: -4, left: '50%', transform: 'translateX(-50%)' } },
    { pos: 'w', cursor: 'w-resize', style: { top: '50%', left: -4, transform: 'translateY(-50%)' } },
    { pos: 'e', cursor: 'e-resize', style: { top: '50%', right: -4, transform: 'translateY(-50%)' } },
  ] as const : [];

  return (
    <div
      className={`absolute ${isSelected ? 'z-20' : 'z-10 hover:z-20'}`}
      style={{
        left: `${bbox.x * canvasSize.width}px`,
        top: `${bbox.y * canvasSize.height}px`,
        width: `${bbox.w * canvasSize.width}px`,
        height: `${bbox.h * canvasSize.height}px`,
      }}
    >
      {/* 파란 점선 박스 (드래그 이동 영역) */}
      <div
        className={`absolute inset-0 rounded transition-colors ${
          isSelected
            ? 'border-2 border-blue-500 bg-blue-500/10 cursor-move'
            : isComplete
            ? 'border-2 border-dashed border-blue-400/60 bg-blue-400/5 cursor-pointer'
            : isProcessing
            ? 'border-2 border-dashed border-amber-400/60 bg-amber-400/5 animate-pulse cursor-pointer'
            : 'border-2 border-dashed border-blue-300/40 bg-blue-300/5 cursor-pointer'
        }`}
        onMouseDown={(e) => handleMouseDown(e, isSelected ? 'move' : 'move')}
        onClick={(e) => {
          if (!isSelected) {
            e.stopPropagation();
            onSelect();
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick();
        }}
      />

      {/* 리사이즈 핸들 (선택된 bbox만 표시) */}
      {handles.map(({ pos, cursor, style }) => (
        <div
          key={pos}
          className="absolute w-[8px] h-[8px] bg-blue-500 border border-white rounded-sm"
          style={{ ...style, cursor, zIndex: 30 } as React.CSSProperties}
          onMouseDown={(e) => handleMouseDown(e, pos as any)}
        />
      ))}

      {/* 체크마크 / 분석 중 아이콘 */}
      <div className={`absolute -top-1 -right-1 flex items-center justify-center w-6 h-6 rounded-full shadow-md pointer-events-none ${
        isComplete
          ? 'bg-rose-500'
          : isProcessing
          ? 'bg-amber-500'
          : 'bg-gray-400'
      }`}>
        {isComplete ? (
          <CheckCircle className="h-4 w-4 text-white" />
        ) : isProcessing ? (
          <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
        ) : (
          <span className="text-[10px] font-bold text-white">{problem.number}</span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PDF Viewer with Bounding Boxes (중앙)
// ============================================================================

function PdfViewerWithBoxes({
  pdfUrl,
  pageNumber,
  problems,
  selectedProblemId,
  onSelectProblem,
  onEditProblem,
  onBboxUpdate,
  isAnalyzing,
}: {
  pdfUrl?: string;
  pageNumber: number;
  problems: AnalyzedProblem[];
  selectedProblemId: string | null;
  onSelectProblem: (id: string) => void;
  onEditProblem?: (problem: AnalyzedProblem) => void;
  onBboxUpdate?: (problemId: string, bbox: { x: number; y: number; w: number; h: number }) => void;
  isAnalyzing: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isRendering, setIsRendering] = useState(true);
  const [pdfError, setPdfError] = useState(false);
  const [detectedBlocks, setDetectedBlocks] = useState<CropRect[]>([]);

  // PDF 페이지 렌더링 (캐시된 PDF 문서 사용)
  useEffect(() => {
    if (!pdfUrl || !canvasRef.current || !containerRef.current) {
      setIsRendering(false);
      return;
    }

    let cancelled = false;
    let retryTimer: NodeJS.Timeout | null = null;

    const renderPage = async () => {
      try {
        setIsRendering(true);
        setPdfError(false);

        const { loadPdfDocument } = await import('@/lib/pdf-viewer');
        const pdf = await loadPdfDocument(pdfUrl);

        if (pageNumber > pdf.numPages || cancelled) return;

        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });

        const container = containerRef.current;
        if (!container || cancelled) return;

        // 컨테이너 크기 계산 - 0인 경우 재시도
        let containerWidth = container.clientWidth - 32;
        let containerHeight = container.clientHeight - 32;

        if (containerWidth <= 0 || containerHeight <= 0) {
          // 레이아웃이 아직 계산되지 않은 경우 100ms 후 재시도
          console.log('[PDF Render] Container size 0, retrying in 100ms...');
          retryTimer = setTimeout(() => {
            if (!cancelled) renderPage();
          }, 100);
          return;
        }

        // 최소 크기 보장
        containerWidth = Math.max(containerWidth, 400);
        containerHeight = Math.max(containerHeight, 600);

        const scale = Math.min(
          containerWidth / viewport.width,
          containerHeight / viewport.height,
          2.5
        );

        const scaledViewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        setCanvasSize({
          width: scaledViewport.width,
          height: scaledViewport.height,
        });

        const context = canvas.getContext('2d');
        if (!context) return;

        await page.render({
          canvasContext: context,
          viewport: scaledViewport,
        }).promise;

        if (!cancelled) {
          setIsRendering(false);
        }
      } catch (err) {
        console.error('PDF render error:', err);
        if (!cancelled) {
          setPdfError(true);
          setIsRendering(false);
        }
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [pdfUrl, pageNumber]);

  // 렌더링 완료 후 캔버스 픽셀 분석으로 문제 블록 자동 감지
  useEffect(() => {
    if (!isRendering && canvasRef.current && canvasSize.width > 0) {
      try {
        const blocks = analyzePageBlocks(canvasRef.current);
        setDetectedBlocks(blocks);
      } catch (err) {
        console.error('[AutoCrop] 블록 감지 실패:', err);
        setDetectedBlocks([]);
      }
    }
  }, [isRendering, canvasSize]);

  // 바운딩 박스가 있는 문제들 (픽셀 감지 블록 우선)
  const problemsWithBoxes = useMemo(() => {
    return estimateBoundingBoxes(problems, pageNumber - 1, detectedBlocks);
  }, [problems, pageNumber, detectedBlocks]);

  if (!pdfUrl) {
    return (
      <div ref={containerRef} className="flex-1 flex items-center justify-center bg-zinc-950/30">
        <div className="text-center">
          {isAnalyzing ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-amber-400 mx-auto mb-4" />
              <p className="text-sm text-zinc-300 font-medium">페이지를 분석하고 있습니다.</p>
              <p className="text-xs text-zinc-500 mt-1">분석이 끝나면 바로 페이지가 열리고</p>
              <p className="text-xs text-zinc-500">문제 변환이 시작됩니다.</p>
            </>
          ) : (
            <>
              <FileText className="h-10 w-10 text-zinc-600 mx-auto mb-4" />
              <p className="text-sm text-zinc-400">PDF 미리보기를 사용할 수 없습니다</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-auto flex justify-center py-4 bg-zinc-950/30">
      <div className="relative inline-block">
        {/* PDF 캔버스 */}
        <canvas
          ref={canvasRef}
          className="block shadow-2xl shadow-black/50"
          style={{ background: 'white' }}
        />

        {/* 로딩 오버레이 */}
        {isRendering && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-[45%] h-64 bg-gray-100 rounded animate-pulse" />
              <div className="w-[45%] flex flex-col gap-3">
                <div className="h-32 bg-gray-100 rounded animate-pulse" />
                <div className="h-28 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
            <Loader2 className="h-6 w-6 animate-spin text-rose-400 mb-3" />
            <p className="text-sm text-gray-500 font-medium">페이지를 분석하고 있습니다.</p>
            <p className="text-xs text-gray-400 mt-1">분석이 끝나면 바로 페이지가 열리고</p>
            <p className="text-xs text-gray-400">문제 변환이 시작됩니다.</p>
          </div>
        )}

        {/* 바운딩 박스 오버레이 (드래그 이동 + 리사이즈 가능) */}
        {!isRendering && canvasSize.width > 0 && problemsWithBoxes.map((problem) => {
          if (!problem.bbox) return null;
          return (
            <DraggableBbox
              key={problem.id}
              problem={problem}
              canvasSize={canvasSize}
              isSelected={selectedProblemId === problem.id}
              onSelect={() => onSelectProblem(problem.id)}
              onDoubleClick={() => onEditProblem?.(problem)}
              onBboxChange={(newBbox) => onBboxUpdate?.(problem.id, newBbox)}
            />
          );
        })}

        {/* PDF 에러 */}
        {pdfError && (
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <div className="text-center">
              <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">PDF를 불러올 수 없습니다</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Problem Crop Preview (우측 상단 - PDF 문제 영역 크롭 이미지)
// ============================================================================

function ProblemCropPreview({
  pdfUrl,
  pageIndex,
  bbox,
}: {
  pdfUrl?: string;
  pageIndex: number;
  bbox?: { x: number; y: number; w: number; h: number };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fullCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cachedPageRef = useRef<number>(-1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 전체 페이지를 캐시로 렌더 (pdfUrl, pageIndex 변경 시에만)
  useEffect(() => {
    if (!pdfUrl) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const renderFullPage = async () => {
      try {
        setIsLoading(true);
        setError(false);

        const { loadPdfDocument } = await import('@/lib/pdf-viewer');
        const pdf = await loadPdfDocument(pdfUrl);

        const pageNum = pageIndex + 1;
        if (pageNum > pdf.numPages || cancelled) return;

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.5 });

        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = viewport.width;
        fullCanvas.height = viewport.height;
        const fullCtx = fullCanvas.getContext('2d');
        if (!fullCtx || cancelled) return;

        await page.render({ canvasContext: fullCtx, viewport }).promise;
        if (cancelled) return;

        fullCanvasRef.current = fullCanvas;
        cachedPageRef.current = pageIndex;
        setIsLoading(false);
      } catch (err) {
        console.error('PDF full page render error:', err);
        if (!cancelled) { setError(true); setIsLoading(false); }
      }
    };

    renderFullPage();
    return () => { cancelled = true; };
  }, [pdfUrl, pageIndex]);

  // bbox 변경 시 캐시된 fullCanvas에서 크롭만 수행 (debounce 50ms)
  useEffect(() => {
    if (!canvasRef.current || !fullCanvasRef.current) return;
    if (cachedPageRef.current !== pageIndex) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const fullCanvas = fullCanvasRef.current;
      const canvas = canvasRef.current;
      if (!fullCanvas || !canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (bbox && bbox.w > 0 && bbox.h > 0) {
        const sx = bbox.x * fullCanvas.width;
        const sy = bbox.y * fullCanvas.height;
        const sw = bbox.w * fullCanvas.width;
        const sh = bbox.h * fullCanvas.height;

        canvas.width = Math.max(1, Math.round(sw));
        canvas.height = Math.max(1, Math.round(sh));
        ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      } else {
        canvas.width = fullCanvas.width;
        canvas.height = fullCanvas.height;
        ctx.drawImage(fullCanvas, 0, 0);
      }
    }, 50);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [bbox, pageIndex, isLoading]);

  if (!pdfUrl) return null;

  return (
    <div className="relative bg-white rounded-lg border border-zinc-700 overflow-hidden"
      style={{ maxHeight: '220px' }}>
      <canvas ref={canvasRef} className="block w-full h-auto" style={{ maxHeight: '220px', objectFit: 'contain' }} />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-100">
          <span className="text-xs text-zinc-400">이미지 로드 실패</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Advanced Analysis Modal (고급 분석 요구사항 입력)
// ============================================================================

function AdvancedAnalysisModal({
  onSubmit,
  onCancel,
}: {
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
}) {
  const [customPrompt, setCustomPrompt] = useState('');

  const presets = [
    '객관식 options 의 수식을 정확히 읽어서 입력해줘',
    '객관식 options 에 있는 ㄱ, ㄴ, ㄷ, ㄹ, ㅁ 글자를 정확히 입력해줘',
    '선분을 나타내는 수식의 경우, 수식의 알파벳 위에 정확히 \\overline 태그를 넣어서',
    '객관식 options 를 <보기> 로 착각하지 말아줘.',
    '학생이 낙서한 것들은 읽지 말고 프린트된 시험지의 글자만 읽어줘.',
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[480px] rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-bold text-white">고급 분석 요구 사항</h3>
        </div>

        <div className="p-5 space-y-2.5">
          {presets.map((preset, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCustomPrompt(prev => prev ? `${prev}\n${preset}` : preset)}
              className="w-full text-left rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2.5 text-xs text-zinc-300 transition-colors"
            >
              {preset}
            </button>
          ))}

          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="w-full h-20 mt-3 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none"
            placeholder="분석에 필요한 요구 사항을 입력해주세요."
          />
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-zinc-800">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            취소
          </button>
          <button type="button"
            onClick={() => onSubmit(customPrompt)}
            disabled={!customPrompt.trim()}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white transition-colors disabled:opacity-40">
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Problem Detail Panel (우측) - 참조 사이트 구조
// 상단: OCR 크롭 이미지 | 액션 버튼 | 문제 번호
// 하단: 수식+한글 텍스트 (KaTeX 렌더링) + 선택지
// ============================================================================

function ProblemDetailPanel({
  problem,
  pdfUrl,
  onSave,
  onDelete,
  onReanalyze,
  onAdvancedAnalyze,
  onEdit,
  isSaving,
  isReanalyzing,
}: {
  problem: AnalyzedProblem | null;
  pdfUrl?: string;
  onSave: (updated: Partial<AnalyzedProblem>) => void;
  onDelete: () => void;
  onReanalyze: () => void;
  onAdvancedAnalyze: (customPrompt?: string) => void;
  onEdit: () => void;
  isSaving: boolean;
  isReanalyzing: boolean;
}) {
  const [editContent, setEditContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  const circledNumbers = ['', '①', '②', '③', '④', '⑤'];

  useEffect(() => {
    if (problem) {
      setEditContent(problem.content);
      setIsEditing(false);
    }
  }, [problem]);

  if (!problem) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500">
        <Eye className="h-10 w-10 mb-3 text-zinc-700" />
        <p className="text-sm font-medium">문제를 선택하세요</p>
        <p className="text-xs text-zinc-600 mt-1">좌측에서 문제를 클릭하면 상세 내용을 볼 수 있습니다</p>
      </div>
    );
  }

  const diffCfg = DIFFICULTY_LABELS[problem.difficulty] || DIFFICULTY_LABELS[3];

  return (
    <div className="flex flex-col h-full">
      {/* 헤더: 문항 내용 + ID */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/50">
        <span className="text-xs text-zinc-400 font-medium">문항 내용</span>
        {problem.problemId && (
          <span className="text-[10px] text-zinc-600 font-mono truncate max-w-[180px]">
            ID: {problem.problemId}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
        {/* ===== 상단: OCR 크롭 이미지 (PDF에서 문제 영역) ===== */}
        <div className="px-4 pt-4 pb-2">
          <ProblemCropPreview
            pdfUrl={pdfUrl}
            pageIndex={problem.pageIndex}
            bbox={problem.bbox}
          />
        </div>

        {/* 분석 상태 표시 */}
        {(problem.status === 'analyzing' || isReanalyzing) && (
          <div className="mx-4 mt-2 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
            <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
            <span className="text-sm text-amber-300 font-bold">분석 중...</span>
          </div>
        )}

        {/* ===== 액션 버튼 (참조 사이트 스타일) ===== */}
        <div className="flex items-center justify-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              if (isEditing) {
                onSave({ content: editContent });
                setIsEditing(false);
              } else {
                onSave({});
              }
            }}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 px-3 py-2 text-xs font-bold text-white transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            저장
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1.5 rounded-lg bg-red-600/80 hover:bg-red-500 px-3 py-2 text-xs font-bold text-white transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            삭제
          </button>
          <button
            type="button"
            onClick={onReanalyze}
            disabled={isReanalyzing}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isReanalyzing ? 'animate-spin' : ''}`} />
            다시 분석
          </button>
          <button
            type="button"
            onClick={() => setShowAdvancedModal(true)}
            disabled={isReanalyzing}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-2 text-xs font-medium text-indigo-300 transition-colors disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            고급 분석
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-2 text-xs font-medium text-cyan-300 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            편집
          </button>
        </div>

        {/* ===== 문제 번호 ===== */}
        <div className="px-4 py-2">
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full text-white font-bold text-lg ${
              problem.number > 0 ? 'bg-indigo-600' : 'bg-zinc-600'
            }`}>
              {problem.number || '?'}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 font-medium">문제 번호</span>
                <button
                  type="button"
                  onClick={() => {
                    const newNum = prompt('문제 번호를 입력하세요', String(problem.number));
                    if (newNum) {
                      onSave({ number: parseInt(newNum, 10) });
                    }
                  }}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
              <span className="text-xs text-zinc-600">클릭해서 번호를 수정하세요</span>
            </div>
          </div>
        </div>

        {/* ===== 하단: 수식+한글 텍스트 (문서화된 문제 내용) ===== */}
        <div className="px-4 pb-3 pt-2">
          <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-4">
            <MixedContentRenderer
              content={problem.content}
              className="text-sm text-zinc-200 leading-relaxed"
            />
          </div>
        </div>

        {/* 선택지 (수식 렌더링) */}
        {problem.choices.length > 0 && (
          <div className="px-4 pb-3">
            <div className="space-y-1.5">
              {problem.choices.map((choice, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                    (typeof problem.answer === 'number' && problem.answer === i + 1)
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                      : 'bg-zinc-800/50 border border-zinc-700/30 text-zinc-300'
                  }`}
                >
                  <span className="font-bold flex-shrink-0">{circledNumbers[i + 1]}</span>
                  <MixedContentRenderer content={choice.replace(/^[①②③④⑤]\s*/, '')} className="text-sm" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 유형 분류 */}
        {problem.typeCode && (
          <div className="px-4 pb-3">
            <div className="text-xs text-zinc-500 mb-2 font-medium">유형 분류</div>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {problem.typeCode}
              </span>
              <span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                {problem.typeName}
              </span>
              <span className={`text-xs px-2 py-1 rounded border ${diffCfg.color}`}>
                난이도: {diffCfg.label}
              </span>
            </div>
          </div>
        )}

        {/* 풀이 */}
        {problem.solution && (
          <div className="px-4 pb-4">
            <div className="text-xs text-zinc-500 mb-2 font-medium">풀이</div>
            <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
              <MixedContentRenderer
                content={problem.solution}
                className="text-sm text-zinc-300 leading-relaxed"
              />
            </div>
          </div>
        )}
      </div>

      {/* 고급 분석 모달 */}
      {showAdvancedModal && (
        <AdvancedAnalysisModal
          onSubmit={(prompt) => {
            setShowAdvancedModal(false);
            onAdvancedAnalyze(prompt);
          }}
          onCancel={() => setShowAdvancedModal(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// 헬퍼: OCR 텍스트에서 헤더/메타 제거 후 실제 문제 내용만 추출
// ============================================================================

// 시험지 헤더 패턴 (학교명, 과목, 날짜, "N문제", 이름 등)
const HEADER_LINE_PATTERNS = [
  /^[\s]*(?:공통|선택)?(?:수학|과학|국어|영어|사회|한국사)/,        // 과목명
  /^[\s]*(?:PAGE|page|페이지)/i,                                     // 페이지 표시
  /^\s*\d+\s*문제\s*$/,                                              // "6문제"
  /^\s*이름\s*[_\s]*$/,                                              // "이름 ___"
  /^\s*_{2,}/,                                                        // "____" 밑줄 (이름 필드)
  /^\s*\d{4}[./]\d{1,2}[./]\d{1,2}/,                                // 날짜 2026.01.26
  /^\s*고\s*\d\s+\d{2,4}\s*년\s*\d{1,2}\s*월/,                     // "고1 19년 6월"
  /^\s*~?\s*고\s*\d\s+\d{2,4}\s*년\s*\d{1,2}\s*월/,                // "~ 고1 15년 3월"
  /고\d\s+\d{2,4}\s*년\s*\d{1,2}\s*월.*~.*고\d\s+\d{2,4}\s*년/,    // "고1 19년 6월 ~ 고1 15년 3월" (범위)
  /^\s*\[.+?\](?:\s*\[.+?\])+/,                                      // "[X][Y]..." 연속 태그 (non-greedy)
  /^\s*\[.+?\]\[.+?\]/,                                               // "[TEST]" 등 태그 (non-greedy)
  /^\s*[가-힣]+(?:의대관|고등학교|중학교|학원|학교|과학고)\s*$/,    // 학교/기관명
  /^\s*[가-힣]+(?:의대관|고등학교|중학교|학원|학교|과학고)\s+\d+\s*문제/, // "동래의대관 6문제"
  /^\s*\d+학년도?\s/,                                                 // "2025학년도 1학년"
  /^\s*\d학기\s/,                                                     // "1학기 중간고사"
  /^\s*(?:중간|기말)\s*(?:고사|시험|평가)/,                          // "중간고사"
  /^\s*(?:과목코드|과목\s*코드)/,                                     // "과목코드"
  /^\s*(?:선택형|서답형)\s*\d+\s*문항/,                              // "선택형 14문항"
  /^\s*■/,                                                            // "■ 아래 물음에..."
  /^\s*(?:경\s*남|서울|부산|대구|인천|광주|대전|울산|세종|경기|충북|충남|전북|전남|경북|제주)/,  // 지역명
];

function extractProblemContent(rawContent: string, fallbackTypeName?: string): string {
  if (!rawContent || !rawContent.trim()) {
    return fallbackTypeName || '';
  }

  // 1. 줄 단위로 분리하여 헤더 라인 제거
  const lines = rawContent.split('\n');
  const cleanedLines: string[] = [];
  let foundQuestionStart = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      // 빈 줄: 문제 시작 후에만 유지
      if (foundQuestionStart) cleanedLines.push(line);
      continue;
    }

    // 아직 문제 시작점을 못 찾았으면 헤더 패턴 체크
    if (!foundQuestionStart) {
      // 1) 헤더 패턴이면 즉시 스킵 (다른 체크보다 먼저!)
      if (HEADER_LINE_PATTERNS.some(p => p.test(trimmed))) {
        continue;
      }
      // 2) 문제 번호 패턴 확인 (01 다음, 1., 1), 1번, <서답형 N번> 등)
      if (/^\s*(?:\*{1,2})?\d{1,2}(?:\*{1,2})?\s*(?:[.)번\]]|\s+(?=[가-힣]))/.test(trimmed)) {
        foundQuestionStart = true;
        cleanedLines.push(line);
        continue;
      }
      // 3) <서답형 N번> / <선택형 N번> 등
      if (/^\s*<\s*(?:서답형|선택형)\s*\d+\s*번\s*>/.test(trimmed)) {
        foundQuestionStart = true;
        cleanedLines.push(line);
        continue;
      }
      // 4) 원형 숫자 선택지 (①②③...)
      if (/[①②③④⑤]/.test(trimmed)) {
        foundQuestionStart = true;
        cleanedLines.push(line);
        continue;
      }
      // 5) 수학 수식 ($...$) 이면 문제 시작으로 간주
      if (/\$[^$]+\$/.test(trimmed)) {
        foundQuestionStart = true;
        cleanedLines.push(line);
        continue;
      }
      // 6) 문제 지시어("다음", "구하시오", "구하여라" 등) 포함하면 문제 시작
      if (/다음|구하시오|구하여라|구해라|풀이|서술하시오|설명하시오|옳은\s*것/.test(trimmed) && trimmed.length > 10) {
        foundQuestionStart = true;
        cleanedLines.push(line);
        continue;
      }
      // 7) 30자 이상 & 수학 관련 키워드 포함이면 문제 시작으로 간주
      if (trimmed.length > 30 && /함수|방정식|부등식|그래프|최[대소]|확률|미분|적분|수열|집합|벡터|행렬/.test(trimmed)) {
        foundQuestionStart = true;
        cleanedLines.push(line);
        continue;
      }
      // 짧은 비-헤더 텍스트 → 일단 스킵 (보통 헤더 일부)
      continue;
    }

    cleanedLines.push(line);
  }

  const cleaned = cleanedLines.join('\n').trim();

  // 2. 정리된 텍스트에서 문제 번호 이후 내용 추출
  if (cleaned) {
    // 문제 번호("01 다음", "02 ", "1." 등) 패턴 이후 실제 내용
    const questionMatch = cleaned.match(/^\s*\d{1,2}\s*(?:[.)번\]]|\s+(?=[가-힣]))([\s\S]*)/);
    if (questionMatch && questionMatch[1].trim()) {
      return questionMatch[1].trim();
    }
    return cleaned;
  }

  // 3. 완전 폴백
  return fallbackTypeName || rawContent.trim();
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function AnalyzeJobPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.jobId as string;

  const [jobData, setJobData] = useState<JobData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [editingProblem, setEditingProblem] = useState<AnalyzedProblem | null>(null);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [autoPageFlip, setAutoPageFlip] = useState(true);
  const [totalPdfPages, setTotalPdfPages] = useState(1);

  // PDF 페이지 수 가져오기 (캐시된 PDF 문서 사용)
  useEffect(() => {
    if (!jobData?.pdfUrl) return;

    let cancelled = false;

    const getPdfInfo = async () => {
      try {
        const { loadPdfDocument } = await import('@/lib/pdf-viewer');
        const pdf = await loadPdfDocument(jobData.pdfUrl!);
        if (!cancelled) {
          setTotalPdfPages(pdf.numPages);
        }
      } catch (err) {
        console.error('PDF info error:', err);
      }
    };

    getPdfInfo();

    return () => { cancelled = true; };
  }, [jobData?.pdfUrl]);

  const [isSaved, setIsSaved] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const prevResultCountRef = useRef(0);

  // 결과를 JobData로 변환하는 헬퍼
  const buildJobData = useCallback((job: any, results: any[], pdfUrl: string | null, prevData: JobData | null): JobData => {
    const problems: AnalyzedProblem[] = [];

    if (results && results.length > 0) {
      results.forEach((result: any, idx: number) => {
        // 이전 데이터에서 편집 상태 유지
        const prevProblem = prevData?.pages.flatMap(p => p.problems).find(p => p.id === `problem-${idx}`);

        // contentWithMath 우선 사용 (Mathpix Markdown 수식 인라인 포함)
        // 헤더/메타 텍스트(학교명, 날짜, "N문제" 등)를 제거하고 실제 문제 내용만 추출
        let contentSource = '';
        if (prevProblem?.status === 'edited') {
          contentSource = prevProblem.content;
        } else {
          const rawContent = result.contentWithMath || result.originalText || '';
          contentSource = extractProblemContent(rawContent, result.classification?.typeName);
        }

        problems.push({
          id: `problem-${idx}`,
          problemId: result.problemId,
          number: idx + 1,
          content: contentSource,
          choices: result.choices || [],
          answer: result.solution?.finalAnswer || '',
          solution: prevProblem?.status === 'edited' ? prevProblem.solution : (result.solution?.steps?.map((s: any) => s.description || s.latex || '').join('\n') || ''),
          difficulty: result.classification?.difficulty || 3,
          typeCode: result.classification?.typeCode || '',
          typeName: result.classification?.typeName || '',
          confidence: result.classification?.confidence || 0.5,
          status: prevProblem?.status === 'edited' ? 'edited' : 'completed',
          // 실제 pageIndex 사용 (bbox 기반), 없으면 0
          pageIndex: result.pageIndex ?? 0,
          // 실제 bbox 사용 (Mathpix lines.json 기반)
          bbox: result.bbox || undefined,
        });
      });
    }

    // 문제를 페이지별로 분배
    const pages: PageData[] = [];
    const hasRealPageIndex = problems.some(p => p.pageIndex > 0 || p.bbox);

    if (hasRealPageIndex) {
      // 실제 pageIndex 기반 그룹화 (bbox 데이터가 있는 경우)
      const pageMap = new Map<number, AnalyzedProblem[]>();
      problems.forEach(p => {
        const pIdx = p.pageIndex;
        if (!pageMap.has(pIdx)) pageMap.set(pIdx, []);
        pageMap.get(pIdx)!.push(p);
      });

      // 페이지 번호 순으로 정렬
      const sortedPageIndices = [...pageMap.keys()].sort((a, b) => a - b);
      for (const pIdx of sortedPageIndices) {
        pages.push({
          pageNumber: pIdx + 1, // 0-based → 1-based
          problems: pageMap.get(pIdx) || [],
        });
      }
    } else {
      // 폴백: 5문항/페이지 기준 분배
      const totalPages = Math.max(1, Math.ceil(problems.length / 5));
      for (let i = 0; i < totalPages; i++) {
        const pageProblems = problems.filter(
          (_, idx) => Math.floor(idx / 5) === i
        ).map(p => ({ ...p, pageIndex: i }));

        pages.push({
          pageNumber: i + 1,
          problems: pageProblems,
        });
      }
    }

    if (pages.length === 0) {
      pages.push({ pageNumber: 1, problems: [] });
    }

    return {
      id: job.id || '',
      fileName: job.fileName || '알 수 없음',
      status: job.status,
      progress: job.progress || 0,
      currentStep: job.currentStep || '',
      totalProblems: problems.length,
      pages,
      pdfUrl: pdfUrl || undefined,
    };
  }, []);

  // Job 데이터 로드 + 진행 중 폴링 통합
  useEffect(() => {
    let cancelled = false;
    let pollInterval: NodeJS.Timeout | null = null;

    async function fetchAndUpdate() {
      try {
        const res = await fetch(`/api/workflow/upload?jobId=${jobId}`);
        if (!res.ok) {
          if (cancelled) return;
          throw new Error('Job을 찾을 수 없습니다');
        }

        const data = await res.json();
        const { job, results, pdfUrl } = data;

        if (cancelled) return;

        setJobData(prev => {
          const newData = buildJobData(job, results || [], pdfUrl, prev);

          // 새 문제가 추가되었으면 첫 번째 미선택 시 자동 선택
          const newProblems = newData.pages.flatMap(p => p.problems);
          if (newProblems.length > 0 && newProblems.length > prevResultCountRef.current) {
            // 새로 추가된 마지막 문제를 찾아 하이라이트
            const latestNew = newProblems[newProblems.length - 1];
            if (latestNew) {
              // 첫 로드 시에만 자동 선택
              if (prevResultCountRef.current === 0) {
                setSelectedProblemId(latestNew.id);
              }
            }
          }
          prevResultCountRef.current = newProblems.length;
          return newData;
        });

        setIsLoading(false);

        // 완료/실패 시 폴링 중지
        if (job.status === 'COMPLETED' || job.status === 'FAILED') {
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '로딩 실패');
          setIsLoading(false);
        }
      }
    }

    // 첫 로드
    fetchAndUpdate();

    // 2초 간격 폴링 (분석 진행 중일 때)
    pollInterval = setInterval(() => {
      fetchAndUpdate();
    }, 2000);

    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [jobId, buildJobData]);

  // 자산화: 분석 결과를 DB에 저장
  const handleSaveAll = useCallback(async () => {
    if (!jobData || isSavingAll) return;

    setIsSavingAll(true);
    try {
      const res = await fetch('/api/workflow/upload', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });

      if (res.ok) {
        const data = await res.json();
        setIsSaved(true);
        alert(`✅ ${data.problemCount}개 문제가 성공적으로 자산화되었습니다.`);
      } else {
        const err = await res.json();
        alert(`❌ 자산화 실패: ${err.error || err.message}`);
      }
    } catch (err) {
      console.error('Save all error:', err);
      alert('❌ 자산화 중 오류가 발생했습니다.');
    } finally {
      setIsSavingAll(false);
    }
  }, [jobData, jobId, isSavingAll]);

  // 현재 페이지 데이터
  const currentPageData = useMemo(() => {
    if (!jobData) return null;
    return jobData.pages.find(p => p.pageNumber === currentPage) || jobData.pages[0];
  }, [jobData, currentPage]);

  const allProblems = useMemo(() => {
    if (!jobData) return [];
    return jobData.pages.flatMap(p => p.problems);
  }, [jobData]);

  const selectedProblem = useMemo(() => {
    return allProblems.find(p => p.id === selectedProblemId) || null;
  }, [allProblems, selectedProblemId]);

  // 문제 저장
  const handleSaveProblem = useCallback(async (updated: Partial<AnalyzedProblem>) => {
    if (!selectedProblem) return;

    setIsSaving(true);
    try {
      if (selectedProblem.problemId) {
        const body: Record<string, unknown> = {};
        if (updated.content !== undefined) body.content_latex = updated.content;
        if (updated.solution !== undefined) body.solution_latex = updated.solution;
        if (updated.number !== undefined) body.sequence_number = updated.number;

        if (Object.keys(body).length > 0) {
          await fetch(`/api/problems/${selectedProblem.problemId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
        }
      }

      setJobData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map(page => ({
            ...page,
            problems: page.problems.map(p =>
              p.id === selectedProblemId
                ? { ...p, ...updated, status: 'edited' as const }
                : p
            ),
          })),
        };
      });
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setIsSaving(false);
    }
  }, [selectedProblem, selectedProblemId]);

  // 문제 삭제
  const handleDeleteProblem = useCallback(() => {
    if (!selectedProblemId || !confirm('이 문제를 삭제하시겠습니까?')) return;

    setJobData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        totalProblems: prev.totalProblems - 1,
        pages: prev.pages.map(page => ({
          ...page,
          problems: page.problems.filter(p => p.id !== selectedProblemId),
        })),
      };
    });
    setSelectedProblemId(null);
  }, [selectedProblemId]);

  // bbox 드래그/리사이즈 시 문제의 bbox 업데이트 → 우측 크롭 이미지 실시간 연동
  const handleBboxUpdate = useCallback((problemId: string, newBbox: { x: number; y: number; w: number; h: number }) => {
    setJobData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map(page => ({
          ...page,
          problems: page.problems.map(p =>
            p.id === problemId
              ? { ...p, bbox: newBbox }
              : p
          ),
        })),
      };
    });
  }, []);

  // bbox 크롭 이미지를 base64 PNG로 추출하는 헬퍼
  const getCropImageBase64 = useCallback(async (
    problem: AnalyzedProblem,
  ): Promise<string | null> => {
    if (!jobData?.pdfUrl || !problem.bbox || problem.bbox.w <= 0 || problem.bbox.h <= 0) {
      return null;
    }

    try {
      const { loadPdfDocument } = await import('@/lib/pdf-viewer');
      const pdf = await loadPdfDocument(jobData.pdfUrl);
      const pageNum = problem.pageIndex + 1;
      if (pageNum > pdf.numPages) return null;

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.5 });

      // 전체 페이지를 오프스크린 캔버스에 렌더
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = viewport.width;
      fullCanvas.height = viewport.height;
      const fullCtx = fullCanvas.getContext('2d');
      if (!fullCtx) return null;

      await page.render({ canvasContext: fullCtx, viewport }).promise;

      // bbox 영역만 크롭
      const bbox = problem.bbox;
      const sx = bbox.x * fullCanvas.width;
      const sy = bbox.y * fullCanvas.height;
      const sw = bbox.w * fullCanvas.width;
      const sh = bbox.h * fullCanvas.height;

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = Math.max(1, Math.round(sw));
      cropCanvas.height = Math.max(1, Math.round(sh));
      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) return null;

      cropCtx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height);

      return cropCanvas.toDataURL('image/png');
    } catch (err) {
      console.error('[getCropImageBase64] Error:', err);
      return null;
    }
  }, [jobData?.pdfUrl]);

  // 크롭 OCR 결과로 문제 데이터 업데이트하는 공통 헬퍼
  const updateProblemFromCropOCR = useCallback((
    data: { ocrText: string; choices?: string[]; confidence?: number },
  ) => {
    setJobData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map(page => ({
          ...page,
          problems: page.problems.map(p =>
            p.id === selectedProblemId
              ? {
                ...p,
                content: data.ocrText || p.content,
                choices: data.choices && data.choices.length > 0 ? data.choices : p.choices,
                confidence: data.confidence ?? p.confidence,
                status: 'completed' as const,
              }
              : p
          ),
        })),
      };
    });
  }, [selectedProblemId]);

  // 다시 분석 (크롭 이미지 → Mathpix OCR → 텍스트 갱신)
  const handleReanalyze = useCallback(async () => {
    if (!selectedProblem) return;

    setIsReanalyzing(true);
    try {
      // 1. bbox 크롭 이미지 추출
      const imageBase64 = await getCropImageBase64(selectedProblem);
      if (!imageBase64) {
        console.warn('[Reanalyze] bbox 크롭 이미지 생성 실패');
        return;
      }

      // 2. 크롭 OCR API 호출
      const res = await fetch('/api/workflow/reanalyze-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`[Reanalyze] OCR 완료: ${data.ocrText?.length || 0}자, 선택지 ${data.choices?.length || 0}개`);
        updateProblemFromCropOCR(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('[Reanalyze] API 에러:', errData);
      }
    } catch (err) {
      console.error('Reanalyze error:', err);
    } finally {
      setIsReanalyzing(false);
    }
  }, [selectedProblem, getCropImageBase64, updateProblemFromCropOCR]);

  // 고급 분석 (크롭 이미지 → Mathpix OCR → GPT 정제 → 텍스트 갱신)
  const handleAdvancedAnalyze = useCallback(async (customPrompt?: string) => {
    if (!selectedProblem) return;

    setIsReanalyzing(true);
    try {
      // 1. bbox 크롭 이미지 추출
      const imageBase64 = await getCropImageBase64(selectedProblem);
      if (!imageBase64) {
        console.warn('[AdvancedAnalyze] bbox 크롭 이미지 생성 실패');
        return;
      }

      // 2. 크롭 OCR + GPT 정제 API 호출
      const res = await fetch('/api/workflow/reanalyze-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          customPrompt: customPrompt || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`[AdvancedAnalyze] OCR+GPT 완료: ${data.ocrText?.length || 0}자, 선택지 ${data.choices?.length || 0}개`);
        updateProblemFromCropOCR(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('[AdvancedAnalyze] API 에러:', errData);
      }
    } catch (err) {
      console.error('Advanced analyze error:', err);
    } finally {
      setIsReanalyzing(false);
    }
  }, [selectedProblem, getCropImageBase64, updateProblemFromCropOCR]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          <p className="text-sm text-zinc-400">분석 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !jobData) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-black text-white">
        <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
        <p className="text-sm text-zinc-400 mb-4">{error || 'Job 데이터를 찾을 수 없습니다'}</p>
        <button
          onClick={() => router.push('/dashboard/workflow')}
          className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" />
          돌아가기
        </button>
      </div>
    );
  }

  const isProcessing = jobData.status !== 'COMPLETED' && jobData.status !== 'FAILED';

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black text-white">
      {/* ======== Header ======== */}
      <div className="flex items-center justify-between border-b border-zinc-800/50 px-4 py-2.5 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => router.push('/dashboard/cloud')}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">PDF 문제 분석</div>
            <h1 className="text-sm font-bold text-white truncate max-w-[400px]">
              {jobData.fileName}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 진행률 + currentStep 실시간 표시 */}
          {isProcessing && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              <div className="flex flex-col items-end">
                <span className="text-xs text-amber-300 font-bold">
                  {jobData.currentStep || '분석 중...'} {jobData.progress}%
                </span>
              </div>
              <div className="w-28 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${jobData.progress}%` }}
                />
              </div>
            </div>
          )}

          <span className="text-xs text-zinc-400">
            총 <span className="text-cyan-400 font-bold">{jobData.totalProblems}</span>문항
            {' · '}
            <span className="text-zinc-500">이미지 포함</span>
          </span>

          {/* 자동 분석 토글 */}
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <div className={`relative w-8 h-4 rounded-full transition-colors ${
              autoAnalyze ? 'bg-cyan-600' : 'bg-zinc-700'
            }`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                autoAnalyze ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </div>
            <input type="checkbox" className="hidden" checked={autoAnalyze} onChange={(e) => setAutoAnalyze(e.target.checked)} />
            자동 분석
          </label>

          {/* 자동 페이지 넘기기 */}
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <div className={`relative w-8 h-4 rounded-full transition-colors ${
              autoPageFlip ? 'bg-cyan-600' : 'bg-zinc-700'
            }`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                autoPageFlip ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </div>
            <input type="checkbox" className="hidden" checked={autoPageFlip} onChange={(e) => setAutoPageFlip(e.target.checked)} />
            자동 페이지 넘기기
          </label>

          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            <Settings2 className="h-3.5 w-3.5" />
            기본 분석 엔진
          </button>

          {/* 자산화 버튼 */}
          {!isProcessing && jobData.totalProblems > 0 && (
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSavingAll || isSaved}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${
                isSaved
                  ? 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 cursor-default'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              } disabled:opacity-60`}
            >
              {isSavingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isSaved ? (
                <CheckCircle className="h-3.5 w-3.5" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {isSaved ? '자산화 완료' : '자산화'}
            </button>
          )}

          <button
            type="button"
            onClick={() => router.push('/dashboard/cloud')}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
          >
            닫기
          </button>
        </div>
      </div>

      {/* 페이지 탭 바 */}
      <div className="flex items-center gap-2 border-b border-zinc-800/50 px-4 py-1.5 flex-shrink-0 bg-zinc-950/50">
        <span className="text-xs text-cyan-400 font-bold bg-cyan-500/10 border border-cyan-500/30 rounded px-2 py-0.5">
          페이지 {currentPage} / {totalPdfPages}
        </span>
        <span className="text-[11px] text-zinc-500 truncate">
          {jobData.fileName}
        </span>
      </div>

      {/* ======== Main 3-Panel Layout ======== */}
      <div className="flex flex-1 overflow-hidden">
        {/* --- 좌측: 페이지 썸네일 --- */}
        <div className="w-52 flex-shrink-0 border-r border-zinc-800/50">
          <PageThumbnailList
            pages={jobData.pages}
            currentPage={currentPage}
            totalPdfPages={totalPdfPages}
            pdfUrl={jobData.pdfUrl}
            onPageSelect={setCurrentPage}
          />
        </div>

        {/* --- 중앙: PDF 이미지 + 바운딩 박스 --- */}
        <PdfViewerWithBoxes
          pdfUrl={jobData.pdfUrl}
          pageNumber={currentPage}
          problems={currentPageData?.problems || []}
          selectedProblemId={selectedProblemId}
          onSelectProblem={setSelectedProblemId}
          onEditProblem={(problem) => setEditingProblem(problem)}
          onBboxUpdate={handleBboxUpdate}
          isAnalyzing={isProcessing}
        />

        {/* --- 우측: 문제 상세 패널 --- */}
        <div className="w-[420px] flex-shrink-0 border-l border-zinc-800/50">
          <ProblemDetailPanel
            problem={selectedProblem}
            pdfUrl={jobData.pdfUrl}
            onSave={handleSaveProblem}
            onDelete={handleDeleteProblem}
            onReanalyze={handleReanalyze}
            onAdvancedAnalyze={handleAdvancedAnalyze}
            onEdit={() => selectedProblem && setEditingProblem(selectedProblem)}
            isSaving={isSaving}
            isReanalyzing={isReanalyzing}
          />
        </div>
      </div>

      {/* ======== 문제 편집 모달 ======== */}
      {editingProblem && (
        <AnalyzeProblemEditModal
          problem={editingProblem as AnalyzedProblemData}
          pdfUrl={jobData.pdfUrl}
          onSave={(updated) => {
            // 로컬 상태 업데이트
            setJobData(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                pages: prev.pages.map(page => ({
                  ...page,
                  problems: page.problems.map(p =>
                    p.id === editingProblem.id
                      ? { ...p, ...updated, status: 'edited' as const }
                      : p
                  ),
                })),
              };
            });
            setEditingProblem(null);
          }}
          onDelete={() => {
            setJobData(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                totalProblems: prev.totalProblems - 1,
                pages: prev.pages.map(page => ({
                  ...page,
                  problems: page.problems.filter(p => p.id !== editingProblem.id),
                })),
              };
            });
            setSelectedProblemId(null);
            setEditingProblem(null);
          }}
          onClose={() => setEditingProblem(null)}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}
