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
  Play,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import AnalyzeProblemEditModal from '@/components/workflow/AnalyzeProblemEditModal';
import type { AnalyzedProblemData } from '@/components/workflow/AnalyzeProblemEditModal';
import { analyzePageBlocksSplit, getMultiBlocks, type CropRect } from '@/lib/pdf/auto-crop';

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
  status: 'pending' | 'analyzing' | 'completed' | 'error' | 'edited';
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
  aiDetectProgress,
}: {
  pages: PageData[];
  currentPage: number;
  totalPdfPages: number;
  pdfUrl?: string;
  onPageSelect: (page: number) => void;
  aiDetectProgress?: Map<number, 'loading' | 'done' | 'error'>;
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
              <div className={`relative w-14 h-20 rounded border overflow-hidden flex-shrink-0 bg-white ${
                isActive ? 'border-cyan-400' : 'border-zinc-600'
              }`}>
                <PdfPageCanvas
                  pdfUrl={pdfUrl}
                  pageNumber={pageNum}
                  width={56}
                  height={80}
                />
                {/* AI 감지 상태 표시 */}
                {aiDetectProgress?.get(i) === 'loading' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                  </div>
                )}
                {aiDetectProgress?.get(i) === 'error' && (
                  <div className="absolute bottom-0.5 right-0.5">
                    <AlertCircle className="h-3 w-3 text-amber-400" />
                  </div>
                )}
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
  const isPending = problem.status === 'pending';

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
            : isPending
            ? 'border-2 border-dashed border-cyan-400/50 bg-cyan-400/5 cursor-pointer'
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

      {/* 체크마크 / 분석 중 / 대기 중 아이콘 */}
      <div className={`absolute -top-1 -right-1 flex items-center justify-center w-6 h-6 rounded-full shadow-md pointer-events-none ${
        isComplete
          ? 'bg-rose-500'
          : isProcessing
          ? 'bg-amber-500'
          : isPending
          ? 'bg-cyan-600'
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
  onDeleteProblem,
  isAnalyzing,
  canvasRef: externalCanvasRef,
  onManualCropDetected,
}: {
  pdfUrl?: string;
  pageNumber: number;
  problems: AnalyzedProblem[];
  selectedProblemId: string | null;
  onSelectProblem: (id: string) => void;
  onEditProblem?: (problem: AnalyzedProblem) => void;
  onBboxUpdate?: (problemId: string, bbox: { x: number; y: number; w: number; h: number }) => void;
  onDeleteProblem?: (problemId: string) => void;
  isAnalyzing: boolean;
  canvasRef?: React.RefObject<HTMLCanvasElement>;
  onManualCropDetected?: (pageNumber: number, blocks: CropRect[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = externalCanvasRef || internalCanvasRef;
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isRendering, setIsRendering] = useState(true);
  const [pdfError, setPdfError] = useState(false);

  // ── 수동 드래그-크롭 상태 ──
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // ── Delete/Backspace 키로 선택된 블록 삭제 ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedProblemId && onDeleteProblem) {
        // input/textarea 내부에서는 무시
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        onDeleteProblem(selectedProblemId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedProblemId, onDeleteProblem]);

  // ── 수동 드래그-크롭 핸들러 ──
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // DraggableBbox 위에서는 시작 안함 (bbox는 stopPropagation 호출)
    const target = e.target as HTMLElement;
    if (target.tagName !== 'CANVAS' && target !== e.currentTarget) return;

    const containerRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;

    setIsDragSelecting(true);
    setDragStart({ x, y });
    setDragRect({ x, y, w: 0, h: 0 });
  }, []);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragSelecting || !dragStart) return;

    const containerRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const currentX = e.clientX - containerRect.left;
    const currentY = e.clientY - containerRect.top;

    const x = Math.min(dragStart.x, currentX);
    const y = Math.min(dragStart.y, currentY);
    const w = Math.abs(currentX - dragStart.x);
    const h = Math.abs(currentY - dragStart.y);

    setDragRect({ x, y, w, h });
  }, [isDragSelecting, dragStart]);

  const handleCanvasMouseUp = useCallback(() => {
    if (!isDragSelecting || !dragRect) {
      setIsDragSelecting(false);
      setDragStart(null);
      setDragRect(null);
      return;
    }

    setIsDragSelecting(false);
    setDragStart(null);

    // 최소 크기 체크 (20x20px)
    if (dragRect.w < 20 || dragRect.h < 20) {
      setDragRect(null);
      return;
    }

    // DOM 픽셀 → ratio(0~1) 변환
    const selectionCropRect: CropRect = {
      x: dragRect.x / canvasSize.width,
      y: dragRect.y / canvasSize.height,
      w: dragRect.w / canvasSize.width,
      h: dragRect.h / canvasSize.height,
    };

    // 선택 영역 내에서 auto-crop 실행 (판서 프로젝트 getMultiBlocks 방식)
    const canvas = canvasRef.current;
    if (canvas && onManualCropDetected) {
      try {
        // 판서 프로젝트 기본값=30 — 문제 간 큰 갭만 감지, 내부 갭 무시
        const detectedBlocks = getMultiBlocks(canvas, selectionCropRect, 30);

        console.log(`[ManualCrop] 선택 영역에서 ${detectedBlocks.length}개 블록 감지`);

        if (detectedBlocks.length > 0) {
          onManualCropDetected(pageNumber, detectedBlocks);
        }
      } catch (err) {
        console.error('[ManualCrop] Auto-crop 오류:', err);
        // 실패 시 선택 영역 자체를 1개 블록으로 사용
        onManualCropDetected(pageNumber, [selectionCropRect]);
      }
    }

    setDragRect(null);
  }, [isDragSelecting, dragRect, canvasSize, canvasRef, pageNumber, onManualCropDetected]);

  const handleCanvasMouseLeave = useCallback(() => {
    if (isDragSelecting) {
      setIsDragSelecting(false);
      setDragStart(null);
      setDragRect(null);
    }
  }, [isDragSelecting]);

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

  // 바운딩 박스가 있는 문제들 (AutoCrop bbox는 preloadAllPages에서 이미 할당됨)
  const problemsWithBoxes = useMemo(() => {
    const withBbox = problems.filter(p => p.bbox && p.bbox.w > 0 && p.bbox.h > 0);
    const withoutBbox = problems.filter(p => !p.bbox || p.bbox.w <= 0 || p.bbox.h <= 0);

    if (withoutBbox.length > 0) {
      // bbox 없는 문제는 fallback 추정
      return estimateBoundingBoxes(problems, pageNumber - 1);
    }
    return withBbox;
  }, [problems, pageNumber]);

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
      <div
        className="relative inline-block"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseLeave}
      >
        {/* PDF 캔버스 */}
        <canvas
          ref={canvasRef as React.RefObject<HTMLCanvasElement>}
          className="block shadow-2xl shadow-black/50"
          style={{ background: 'white', cursor: 'crosshair' }}
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

        {/* 수동 드래그 선택 사각형 */}
        {dragRect && dragRect.w > 5 && dragRect.h > 5 && (
          <div
            className="absolute border-2 border-dashed border-cyan-400 bg-cyan-400/10 pointer-events-none z-30"
            style={{
              left: `${dragRect.x}px`,
              top: `${dragRect.y}px`,
              width: `${dragRect.w}px`,
              height: `${dragRect.h}px`,
            }}
          >
            <span className="absolute bottom-1 right-2 text-[10px] text-cyan-300 bg-black/60 px-1.5 py-0.5 rounded">
              영역 선택 중...
            </span>
          </div>
        )}

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
  const [aspectRatio, setAspectRatio] = useState(0.5); // h/w ratio for dynamic sizing
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
        // 문제 크기에 맞게 동적 비율 계산
        setAspectRatio(sh / Math.max(1, sw));
      } else {
        canvas.width = fullCanvas.width;
        canvas.height = fullCanvas.height;
        ctx.drawImage(fullCanvas, 0, 0);
        setAspectRatio(fullCanvas.height / Math.max(1, fullCanvas.width));
      }
    }, 50);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [bbox, pageIndex, isLoading]);

  if (!pdfUrl) return null;

  // 동적 높이: 비율이 낮으면(가로로 넓은 문제) 낮게, 높으면(세로로 긴 문제) 높게
  // 최소 80px, 최대 500px — 문제 크기에 맞게 자동 조절
  const dynamicMaxHeight = Math.max(80, Math.min(500, Math.round(aspectRatio * 400)));

  return (
    <div className="relative bg-white rounded-lg border border-zinc-700 overflow-hidden"
      style={{ maxHeight: `${dynamicMaxHeight}px` }}>
      <canvas
        ref={canvasRef}
        className="block w-full h-auto"
        style={{ maxHeight: `${dynamicMaxHeight}px`, objectFit: 'contain' }}
      />
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
      {/* ===== 헤더: "문항 내용" + ID ===== */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <span className="text-sm font-bold text-zinc-200">문항 내용</span>
        {problem.problemId && (
          <span className="text-[10px] text-zinc-600 font-mono">
            ID: {problem.problemId.slice(0, 20)}...
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
        {/* ===== 원본 크롭 이미지 (크게) ===== */}
        <div className="px-4 pt-4 pb-3">
          <div className="rounded-xl border border-zinc-700/40 bg-white overflow-hidden">
            <ProblemCropPreview
              pdfUrl={pdfUrl}
              pageIndex={problem.pageIndex}
              bbox={problem.bbox}
            />
          </div>
        </div>

        {/* ===== 액션 버튼 바 (참조사이트 스타일 — 텍스트 라벨) ===== */}
        <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => { if (isEditing) { onSave({ content: editContent }); setIsEditing(false); } else { onSave({}); } }}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50">
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            저장
          </button>
          <button type="button" onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
            삭제
          </button>
          <button type="button" onClick={onReanalyze} disabled={isReanalyzing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${isReanalyzing ? 'animate-spin' : ''}`} />
            다시 분석
          </button>
          <button type="button" onClick={() => setShowAdvancedModal(true)} disabled={isReanalyzing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 transition-colors disabled:opacity-50">
            <Sparkles className="h-3.5 w-3.5" />
            고급 분석
          </button>
          <button type="button" onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors shadow-lg shadow-cyan-500/10">
            <Pencil className="h-3.5 w-3.5" />
            문제 수정
          </button>
        </div>

        {/* ===== 문제 번호 (편집 가능) ===== */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                const newNum = prompt('문제 번호를 입력하세요', String(problem.number));
                if (newNum) onSave({ number: parseInt(newNum, 10) });
              }}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-cyan-600 text-white font-bold text-sm flex-shrink-0 cursor-pointer hover:bg-cyan-500 transition-colors"
            >
              {problem.number || '?'}
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <Pencil className="h-3 w-3 text-cyan-400" />
                <span className="text-xs text-cyan-400">문제 번호</span>
              </div>
              <span className="text-[10px] text-zinc-500">클릭해서 번호를 수정하세요</span>
            </div>
          </div>
        </div>

        {/* ===== 분석 상태 배너 ===== */}
        {problem.status === 'pending' && !isReanalyzing && (
          <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-3 py-2.5">
            <Eye className="h-4 w-4 text-cyan-400 flex-shrink-0" />
            <div>
              <span className="text-xs text-cyan-300 font-bold">문제 영역 감지됨</span>
              <p className="text-[10px] text-cyan-400/60 mt-0.5">&quot;분석 시작&quot; 버튼을 눌러 OCR + AI 분석을 실행하세요</p>
            </div>
          </div>
        )}
        {(problem.status === 'analyzing' || isReanalyzing) && (
          <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            <span className="text-xs text-amber-300 font-bold">분석 중...</span>
          </div>
        )}
        {problem.status === 'error' && (
          <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <span className="text-xs text-red-300 font-bold">분석 실패 — &quot;다시 분석&quot;을 시도하세요</span>
          </div>
        )}

        {/* ===== 인식된 문제 내용 (수학 문제처럼 렌더링) ===== */}
        {problem.content && (
          <div className="px-4 pb-3">
            <div className="rounded-xl border border-zinc-700/40 bg-zinc-900/50 p-5">
              <MixedContentRenderer
                content={problem.content}
                className="text-[14px] text-zinc-100 leading-[2] tracking-wide"
              />
            </div>
          </div>
        )}

        {/* ===== 선택지 (참조사이트 스타일 — 그리드) ===== */}
        {problem.choices.length > 0 && (
          <div className="px-4 pb-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {problem.choices.map((choice, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] ${
                    (typeof problem.answer === 'number' && problem.answer === i + 1)
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                      : 'text-zinc-300'
                  }`}
                >
                  <span className="font-bold flex-shrink-0 text-base text-zinc-400">{circledNumbers[i + 1]}</span>
                  <MixedContentRenderer content={choice.replace(/^[①②③④⑤]\s*/, '')} className="text-[13px]" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== 유형 분류 ===== */}
        {problem.typeCode && (
          <div className="px-4 pb-3">
            <div className="text-[10px] text-zinc-500 mb-1.5 font-medium">유형 분류</div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {problem.typeCode}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                {problem.typeName}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded border ${diffCfg.color}`}>
                난이도: {diffCfg.label}
              </span>
            </div>
          </div>
        )}

        {/* ===== 풀이 ===== */}
        {problem.solution && (
          <div className="px-4 pb-4">
            <div className="text-[10px] text-zinc-500 mb-1.5 font-medium">풀이</div>
            <div className="rounded-xl border border-zinc-700/40 bg-zinc-900/50 p-4">
              <MixedContentRenderer
                content={problem.solution}
                className="text-[13px] text-zinc-300 leading-[1.8]"
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
  const [totalPdfPages, setTotalPdfPages] = useState(1);

  // ★ AutoCrop 주도 파이프라인 상태
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [autoCropProblems, setAutoCropProblems] = useState<Map<number, AnalyzedProblem[]>>(new Map());
  const [useAutoCropMode, setUseAutoCropMode] = useState(true); // AutoCrop 모드 on/off
  const [detectionMode, setDetectionMode] = useState<'ai' | 'pixel'>('ai'); // AI 감지 or 픽셀 감지
  const [aiDetectProgress, setAiDetectProgress] = useState<Map<number, 'loading' | 'done' | 'error'>>(new Map());
  const [columnMode, setColumnMode] = useState<1 | 2>(2); // 1단/2단 모드 (기본 2단)
  const [cropSensitivity, setCropSensitivity] = useState<number>(30); // 감도 (5~40, 수동 드래그와 동일)
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const blocksDetectedRef = useRef<Set<number>>(new Set()); // 이미 블록 감지된 페이지 추적
  const isPreloadingRef = useRef(false); // 동시 실행 차단

  // detectionMode, columnMode, cropSensitivity 변경 시 기존 감지 결과 초기화 → 재감지 트리거
  useEffect(() => {
    blocksDetectedRef.current.clear();
    isPreloadingRef.current = false;
    setAutoCropProblems(new Map());
    setAiDetectProgress(new Map());
    setSelectedProblemId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectionMode, columnMode, cropSensitivity]);

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

  // 모든 페이지 자동 프리로드 — PDF 로드 후 모든 페이지의 문제를 미리 감지
  // AutoCrop 감지는 여기서만 실행 (PdfViewerWithBoxes에서는 렌더링만 담당)
  useEffect(() => {
    if (!jobData?.pdfUrl || !useAutoCropMode || totalPdfPages < 1) return;

    let cancelled = false;

    const preloadAllPages = async () => {
      // 동시 실행 차단 — 이미 실행 중이면 스킵
      if (isPreloadingRef.current) return;
      isPreloadingRef.current = true;

      try {
        const { loadPdfDocument } = await import('@/lib/pdf-viewer');
        const pdf = await loadPdfDocument(jobData.pdfUrl!);

        // 현재 보고 있는 페이지를 먼저 처리 → 나머지 순차 처리
        const pageOrder: number[] = [currentPage];
        for (let p = 1; p <= totalPdfPages; p++) {
          if (p !== currentPage) pageOrder.push(p);
        }

        for (const pageNum of pageOrder) {
          if (cancelled) break;
          // 이미 감지된 페이지는 스킵
          if (blocksDetectedRef.current.has(pageNum - 1)) continue;

          try {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 }); // 고정 2.0x

            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = viewport.width;
            offscreenCanvas.height = viewport.height;
            const ctx = offscreenCanvas.getContext('2d');
            if (!ctx) continue;

            await page.render({ canvasContext: ctx, viewport }).promise;
            if (cancelled) break;

            let blocks: { x: number; y: number; w: number; h: number }[];

            if (detectionMode === 'ai') {
              // ★ AI Vision 감지 — GPT-4o에 페이지 이미지 전송
              setAiDetectProgress(prev => new Map(prev).set(pageNum - 1, 'loading'));
              try {
                const imageBase64 = offscreenCanvas.toDataURL('image/jpeg', 0.85);
                const res = await fetch('/api/workflow/detect-problems', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ imageBase64 }),
                });
                if (res.ok) {
                  const data = await res.json();
                  blocks = data.problems || [];
                  setAiDetectProgress(prev => new Map(prev).set(pageNum - 1, 'done'));
                  console.log(`[AI Detect] 페이지 ${pageNum}: ${blocks.length}개 문제 감지`);
                } else {
                  console.warn(`[AI Detect] 페이지 ${pageNum} API 실패 (${res.status}), 픽셀 감지로 폴백`);
                  blocks = analyzePageBlocksSplit(offscreenCanvas, columnMode, cropSensitivity);
                  setAiDetectProgress(prev => new Map(prev).set(pageNum - 1, 'error'));
                }
              } catch (aiErr) {
                console.error(`[AI Detect] 페이지 ${pageNum} 오류:`, aiErr);
                blocks = analyzePageBlocksSplit(offscreenCanvas, columnMode, cropSensitivity);
                setAiDetectProgress(prev => new Map(prev).set(pageNum - 1, 'error'));
              }
            } else {
              // 픽셀 기반 감지 (기존 방식)
              blocks = analyzePageBlocksSplit(offscreenCanvas, columnMode, cropSensitivity);
              console.log(`[AutoCrop Preload] 페이지 ${pageNum}: ${blocks.length}개 블록 감지 (${columnMode}단, 감도=${cropSensitivity})`);
            }

            // handleBlocksDetected와 동일한 로직으로 문제 생성
            if (blocks.length > 0) {
              const pageIndex = pageNum - 1;
              blocksDetectedRef.current.add(pageIndex);

              const newProblems: AnalyzedProblem[] = blocks.map((block, idx) => ({
                id: `autocrop-p${pageIndex}-${idx}`,
                number: idx + 1,
                content: '',
                choices: [],
                answer: '',
                solution: '',
                difficulty: 3 as const,
                typeCode: '',
                typeName: '',
                confidence: 0,
                status: 'pending' as const,
                pageIndex,
                bbox: block,
              }));

              setAutoCropProblems(prev => {
                const next = new Map(prev);
                next.set(pageIndex, newProblems);
                return next;
              });

              // 첫 번째 감지된 문제 자동 선택 (아직 선택된 문제가 없을 때)
              if (newProblems.length > 0 && pageNum === currentPage) {
                setSelectedProblemId(prev => prev || newProblems[0].id);
              }
            }
          } catch (pageErr) {
            console.error(`[AutoCrop Preload] 페이지 ${pageNum} 실패:`, pageErr);
          }
        }
      } catch (err) {
        console.error('[AutoCrop Preload] PDF 로드 실패:', err);
      } finally {
        isPreloadingRef.current = false;
      }
    };

    // 약간의 딜레이 후 실행 (현재 페이지 렌더링 우선)
    const timer = setTimeout(preloadAllPages, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      isPreloadingRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobData?.pdfUrl, totalPdfPages, useAutoCropMode, detectionMode, columnMode, cropSensitivity]);

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
          choices: result.choices || result.answer_json?.choices || [],
          answer: result.solution?.finalAnswer || result.answer_json?.correct_answer || '',
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
        const { job, results, pdfUrl, savedToDb } = data;

        if (cancelled) return;

        // 서버에서 이미 자산화 완료된 경우 (자동 자산화)
        if (savedToDb) {
          setIsSaved(true);
        }

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
  const [savedProblemCount, setSavedProblemCount] = useState(0);
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
        setSavedProblemCount(data.problemCount || 0);
        // 이미 자동 자산화된 경우에도 성공으로 처리
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

  // ★ AutoCrop 모드: 전체 문제 목록 (모든 페이지의 autoCropProblems 합산)
  const autoCropAllProblems = useMemo(() => {
    const all: AnalyzedProblem[] = [];
    const sortedKeys = [...autoCropProblems.keys()].sort((a, b) => a - b);
    let globalNumber = 1;
    for (const pageIdx of sortedKeys) {
      const pageProblems = autoCropProblems.get(pageIdx) || [];
      for (const p of pageProblems) {
        all.push({ ...p, number: globalNumber++ });
      }
    }
    return all;
  }, [autoCropProblems]);

  // ★ AutoCrop 모드: 페이지별 문제 데이터 (JobData 형태)
  const autoCropJobData = useMemo((): JobData | null => {
    if (!jobData) return null;

    const pages: PageData[] = [];
    const sortedKeys = [...autoCropProblems.keys()].sort((a, b) => a - b);
    let globalNumber = 1;

    for (const pageIdx of sortedKeys) {
      const pageProblems = (autoCropProblems.get(pageIdx) || []).map(p => ({
        ...p,
        number: globalNumber++,
      }));
      pages.push({
        pageNumber: pageIdx + 1,
        problems: pageProblems,
      });
    }

    // AutoCrop 미감지 페이지도 빈 페이지로 추가
    for (let i = 0; i < totalPdfPages; i++) {
      if (!autoCropProblems.has(i)) {
        pages.push({ pageNumber: i + 1, problems: [] });
      }
    }
    pages.sort((a, b) => a.pageNumber - b.pageNumber);

    return {
      id: jobData.id,
      fileName: jobData.fileName,
      status: jobData.status,
      progress: jobData.progress,
      currentStep: jobData.currentStep,
      totalProblems: autoCropAllProblems.length,
      pages,
      pdfUrl: jobData.pdfUrl,
    };
  }, [jobData, autoCropProblems, autoCropAllProblems, totalPdfPages]);

  // ★ 현재 활성 데이터 소스 (AutoCrop 모드 vs 서버 모드)
  const activeJobData = useMemo(() => {
    if (useAutoCropMode && autoCropAllProblems.length > 0) {
      return autoCropJobData;
    }
    return jobData;
  }, [useAutoCropMode, autoCropAllProblems, autoCropJobData, jobData]);

  // 현재 페이지 데이터
  const currentPageData = useMemo(() => {
    if (!activeJobData) return null;
    return activeJobData.pages.find(p => p.pageNumber === currentPage) || activeJobData.pages[0];
  }, [activeJobData, currentPage]);

  const allProblems = useMemo(() => {
    if (useAutoCropMode && autoCropAllProblems.length > 0) {
      return autoCropAllProblems;
    }
    if (!jobData) return [];
    return jobData.pages.flatMap(p => p.problems);
  }, [useAutoCropMode, autoCropAllProblems, jobData]);

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

        // 정답/선택지 변경 시 answer_json으로 통합 저장
        if (updated.answer !== undefined || updated.choices !== undefined) {
          const finalAnswer = updated.answer ?? selectedProblem.answer;
          const circledNumbers = ['①', '②', '③', '④', '⑤'];
          const currentChoices = updated.choices ?? selectedProblem.choices ?? [];
          const formattedChoices = currentChoices.map((c: string, i: number) => {
            const stripped = c.replace(/^[①②③④⑤]\s*/, '');
            return stripped ? `${circledNumbers[i]} ${stripped}` : '';
          }).filter(Boolean);
          body.answer_json = {
            correct_answer: finalAnswer,
            finalAnswer: finalAnswer,
            choices: formattedChoices,
            type: formattedChoices.length > 0 ? 'multiple_choice' : 'short_answer',
          };
        }

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

  // 문제 삭제 (로컬 + DB)
  const handleDeleteProblem = useCallback(async () => {
    if (!selectedProblemId || !confirm('이 문제를 삭제하시겠습니까?')) return;

    // DB에 저장된 문제인 경우 API로 삭제
    const problem = allProblems.find(p => p.id === selectedProblemId);
    if (problem?.problemId) {
      try {
        const res = await fetch(`/api/problems/${problem.problemId}`, { method: 'DELETE' });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error('[Delete] DB 삭제 실패:', errData);
          alert('문제 삭제에 실패했습니다. 다시 시도해주세요.');
          return;
        }
        console.log(`[Delete] DB에서 문제 삭제 완료: ${problem.problemId}`);
      } catch (err) {
        console.error('[Delete] API 호출 실패:', err);
        alert('문제 삭제에 실패했습니다.');
        return;
      }
    }

    // 로컬 state 업데이트
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
  }, [selectedProblemId, allProblems]);

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

  // ★ AutoCrop 블록 감지 → 해당 페이지의 pending 문제 목록 생성
  const handleBlocksDetected = useCallback((pageNumber: number, blocks: CropRect[]) => {
    if (!useAutoCropMode) return;

    const pageIndex = pageNumber - 1;

    // 이미 이 페이지에 대한 블록이 감지되었으면 스킵 (중복 방지)
    if (blocksDetectedRef.current.has(pageIndex)) return;
    blocksDetectedRef.current.add(pageIndex);

    console.log(`[AutoCrop] 페이지 ${pageNumber}: ${blocks.length}개 문제 블록 감지`);

    if (blocks.length === 0) return;

    // AutoCrop 블록을 pending 문제로 변환
    const newProblems: AnalyzedProblem[] = blocks.map((block, idx) => ({
      id: `autocrop-p${pageIndex}-${idx}`,
      number: idx + 1, // 임시 번호 (나중에 전체 순번으로 갱신)
      content: '',
      choices: [],
      answer: '',
      solution: '',
      difficulty: 3 as const,
      typeCode: '',
      typeName: '',
      confidence: 0,
      status: 'pending' as const,
      pageIndex,
      bbox: block,
    }));

    // autoCropProblems 상태에 저장
    setAutoCropProblems(prev => {
      const next = new Map(prev);
      next.set(pageIndex, newProblems);
      return next;
    });

    // 첫 문제 자동 선택
    if (newProblems.length > 0 && !selectedProblemId) {
      setSelectedProblemId(newProblems[0].id);
    }
  }, [useAutoCropMode, selectedProblemId]);

  // ★ 수동 드래그-크롭: 선택 영역 내 감지된 블록을 새 문제로 추가
  const handleManualCropDetected = useCallback((pageNumber: number, blocks: CropRect[]) => {
    const pageIndex = pageNumber - 1;

    // 작은 블록 필터링
    const validBlocks = blocks.filter(b => b.w > 0.02 && b.h > 0.02);
    if (validBlocks.length === 0) return;

    const existing = autoCropProblems.get(pageIndex) || [];
    const timestamp = Date.now();

    const newProblems: AnalyzedProblem[] = validBlocks.map((block, idx) => ({
      id: `manual-p${pageIndex}-${timestamp}-${idx}`,
      number: existing.length + idx + 1,
      content: '',
      choices: [],
      answer: '',
      solution: '',
      difficulty: 3 as const,
      typeCode: '',
      typeName: '',
      confidence: 0,
      status: 'pending' as const,
      pageIndex,
      bbox: block,
    }));

    console.log(`[ManualCrop] 페이지 ${pageNumber}: ${newProblems.length}개 수동 문제 추가`);

    // 기존 문제에 병합 (덮어쓰기 아닌 추가!)
    setAutoCropProblems(prev => {
      const next = new Map(prev);
      next.set(pageIndex, [...(next.get(pageIndex) || []), ...newProblems]);
      return next;
    });

    // 첫 번째 새 문제 자동 선택
    if (newProblems.length > 0) {
      setSelectedProblemId(newProblems[0].id);
    }
  }, [autoCropProblems]);

  // ★ "분석 시작" — 모든 pending 문제의 크롭 이미지를 순차적으로 서버에 보내 분석
  const handleBatchAnalyze = useCallback(async () => {
    const pendingProblems = autoCropAllProblems.filter(p => p.status === 'pending');
    if (pendingProblems.length === 0) return;

    setIsBatchAnalyzing(true);
    setBatchProgress({ current: 0, total: pendingProblems.length });

    for (let i = 0; i < pendingProblems.length; i++) {
      const problem = pendingProblems[i];
      setBatchProgress({ current: i + 1, total: pendingProblems.length });

      // 해당 문제를 analyzing 상태로 변경
      setAutoCropProblems(prev => {
        const next = new Map(prev);
        const pageProbs = [...(next.get(problem.pageIndex) || [])];
        const idx = pageProbs.findIndex(p => p.id === problem.id);
        if (idx >= 0) {
          pageProbs[idx] = { ...pageProbs[idx], status: 'analyzing' };
          next.set(problem.pageIndex, pageProbs);
        }
        return next;
      });

      try {
        // 1. bbox 크롭 이미지 추출
        const imageBase64 = await getCropImageBase64(problem);
        if (!imageBase64) {
          console.warn(`[BatchAnalyze] 문제 ${problem.number}: 크롭 이미지 생성 실패`);
          // error 상태로 변경
          setAutoCropProblems(prev => {
            const next = new Map(prev);
            const pageProbs = [...(next.get(problem.pageIndex) || [])];
            const idx = pageProbs.findIndex(p => p.id === problem.id);
            if (idx >= 0) {
              pageProbs[idx] = { ...pageProbs[idx], status: 'error', content: '크롭 이미지 생성 실패' };
              next.set(problem.pageIndex, pageProbs);
            }
            return next;
          });
          continue;
        }

        // 2. Mathpix OCR + GPT-4o 통합 분석 API 호출
        const res = await fetch('/api/workflow/reanalyze-crop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64,
            fullAnalysis: true,
            problemNumber: problem.number,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          console.log(`[BatchAnalyze] 문제 ${problem.number}: OCR ${data.ocrText?.length || 0}자, 분류: ${data.classification?.classification?.typeName || '없음'}`);

          // 분석 결과로 문제 업데이트
          setAutoCropProblems(prev => {
            const next = new Map(prev);
            const pageProbs = [...(next.get(problem.pageIndex) || [])];
            const idx = pageProbs.findIndex(p => p.id === problem.id);
            if (idx >= 0) {
              const classification = data.classification;
              const rawContent = data.ocrText || '';
              const cleanedContent = extractProblemContent(rawContent, classification?.classification?.typeName);

              pageProbs[idx] = {
                ...pageProbs[idx],
                content: cleanedContent,
                choices: data.choices || [],
                confidence: data.confidence || 0.5,
                status: 'completed',
                // GPT 분류 결과 반영
                ...(classification ? {
                  problemId: classification.problemId,
                  typeCode: classification.classification?.typeCode || '',
                  typeName: classification.classification?.typeName || '',
                  difficulty: classification.classification?.difficulty || 3,
                  answer: classification.solution?.finalAnswer || '',
                  solution: classification.solution?.steps?.map((s: any) => s.description || s.latex || '').join('\n') || '',
                } : {}),
              };
              next.set(problem.pageIndex, pageProbs);
            }
            return next;
          });
        } else {
          const errData = await res.json().catch(() => ({}));
          console.error(`[BatchAnalyze] 문제 ${problem.number}: API 에러`, errData);
          setAutoCropProblems(prev => {
            const next = new Map(prev);
            const pageProbs = [...(next.get(problem.pageIndex) || [])];
            const idx = pageProbs.findIndex(p => p.id === problem.id);
            if (idx >= 0) {
              pageProbs[idx] = { ...pageProbs[idx], status: 'error', content: errData.error || 'API 에러' };
              next.set(problem.pageIndex, pageProbs);
            }
            return next;
          });
        }
      } catch (err) {
        console.error(`[BatchAnalyze] 문제 ${problem.number}: 오류`, err);
        setAutoCropProblems(prev => {
          const next = new Map(prev);
          const pageProbs = [...(next.get(problem.pageIndex) || [])];
          const idx = pageProbs.findIndex(p => p.id === problem.id);
          if (idx >= 0) {
            pageProbs[idx] = { ...pageProbs[idx], status: 'error', content: '분석 오류' };
            next.set(problem.pageIndex, pageProbs);
          }
          return next;
        });
      }
    }

    setIsBatchAnalyzing(false);
  }, [autoCropAllProblems, getCropImageBase64]);

  // ★ 단일 문제 다시 분석 (AutoCrop 모드)
  const handleReanalyzeSingle = useCallback(async (problemId: string) => {
    const problem = autoCropAllProblems.find(p => p.id === problemId);
    if (!problem) return;

    setIsReanalyzing(true);

    // analyzing 상태로 변경
    setAutoCropProblems(prev => {
      const next = new Map(prev);
      const pageProbs = [...(next.get(problem.pageIndex) || [])];
      const idx = pageProbs.findIndex(p => p.id === problem.id);
      if (idx >= 0) {
        pageProbs[idx] = { ...pageProbs[idx], status: 'analyzing' };
        next.set(problem.pageIndex, pageProbs);
      }
      return next;
    });

    try {
      const imageBase64 = await getCropImageBase64(problem);
      if (!imageBase64) {
        console.warn('[ReanalyzeSingle] 크롭 이미지 생성 실패');
        setIsReanalyzing(false);
        return;
      }

      const res = await fetch('/api/workflow/reanalyze-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          fullAnalysis: true,
          problemNumber: problem.number,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAutoCropProblems(prev => {
          const next = new Map(prev);
          const pageProbs = [...(next.get(problem.pageIndex) || [])];
          const idx = pageProbs.findIndex(p => p.id === problem.id);
          if (idx >= 0) {
            const classification = data.classification;
            const rawContent = data.ocrText || '';
            const cleanedContent = extractProblemContent(rawContent, classification?.classification?.typeName);

            pageProbs[idx] = {
              ...pageProbs[idx],
              content: cleanedContent,
              choices: data.choices || [],
              confidence: data.confidence || 0.5,
              status: 'completed',
              ...(classification ? {
                problemId: classification.problemId,
                typeCode: classification.classification?.typeCode || '',
                typeName: classification.classification?.typeName || '',
                difficulty: classification.classification?.difficulty || 3,
                answer: classification.solution?.finalAnswer || '',
                solution: classification.solution?.steps?.map((s: any) => s.description || s.latex || '').join('\n') || '',
              } : {}),
            };
            next.set(problem.pageIndex, pageProbs);
          }
          return next;
        });
      }
    } catch (err) {
      console.error('[ReanalyzeSingle] 오류:', err);
    } finally {
      setIsReanalyzing(false);
    }
  }, [autoCropAllProblems, getCropImageBase64]);

  // ★ AutoCrop 모드: 문제 삭제
  const handleDeleteAutoCropProblem = useCallback(async (problemId: string, skipConfirm = false) => {
    if (!skipConfirm && !confirm('이 문제를 삭제하시겠습니까?')) return;

    // DB에 저장된 문제 확인
    let dbProblemId: string | undefined;
    for (const [, problems] of autoCropProblems.entries()) {
      const found = problems.find(p => p.id === problemId);
      if (found?.problemId) {
        dbProblemId = found.problemId;
        break;
      }
    }

    // DB 삭제
    if (dbProblemId) {
      try {
        const res = await fetch(`/api/problems/${dbProblemId}`, { method: 'DELETE' });
        if (!res.ok) {
          console.error('[Delete] AutoCrop 문제 DB 삭제 실패');
        } else {
          console.log(`[Delete] AutoCrop 문제 DB 삭제 완료: ${dbProblemId}`);
        }
      } catch (err) {
        console.error('[Delete] API 호출 실패:', err);
      }
    }

    setAutoCropProblems(prev => {
      const next = new Map(prev);
      for (const [pageIdx, problems] of next.entries()) {
        const filtered = problems.filter(p => p.id !== problemId);
        if (filtered.length !== problems.length) {
          next.set(pageIdx, filtered);
          break;
        }
      }
      return next;
    });
    if (selectedProblemId === problemId) {
      setSelectedProblemId(null);
    }
  }, [selectedProblemId, autoCropProblems]);

  // ★ AutoCrop 모드: bbox 업데이트
  const handleAutoCropBboxUpdate = useCallback((problemId: string, newBbox: { x: number; y: number; w: number; h: number }) => {
    setAutoCropProblems(prev => {
      const next = new Map(prev);
      for (const [pageIdx, problems] of next.entries()) {
        const idx = problems.findIndex(p => p.id === problemId);
        if (idx >= 0) {
          const updated = [...problems];
          updated[idx] = { ...updated[idx], bbox: newBbox };
          next.set(pageIdx, updated);
          break;
        }
      }
      return next;
    });
  }, []);

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
  const isAutoCropActive = useAutoCropMode && autoCropAllProblems.length > 0;
  const pendingCount = autoCropAllProblems.filter(p => p.status === 'pending').length;
  const completedCount = autoCropAllProblems.filter(p => p.status === 'completed' || p.status === 'edited').length;

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
          {/* 배치 분석 진행률 */}
          {isBatchAnalyzing && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              <span className="text-xs text-amber-300 font-bold">
                분석 중... {batchProgress.current}/{batchProgress.total}
              </span>
              <div className="w-28 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* 서버 분석 진행률 (레거시 모드) */}
          {!isAutoCropActive && isProcessing && (
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

          {/* AI 감지 / 자동 감지 토글 + 픽셀 모드 세부 설정 */}
          {isAutoCropActive && (
            <div className="flex items-center gap-2">
              {/* AI / 픽셀 모드 토글 */}
              <div className="flex items-center gap-0.5 rounded-lg border border-zinc-700 bg-zinc-900 p-0.5">
                <button
                  type="button"
                  onClick={() => setDetectionMode('ai')}
                  className={`flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${
                    detectionMode === 'ai'
                      ? 'bg-indigo-600 text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Sparkles className="h-3 w-3" />
                  AI 감지
                </button>
                <button
                  type="button"
                  onClick={() => setDetectionMode('pixel')}
                  className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${
                    detectionMode === 'pixel'
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  자동 감지
                </button>
              </div>

              {/* 픽셀 모드에서만: 1단/2단 + 감도 슬라이더 */}
              {detectionMode === 'pixel' && (
                <>
                  <div className="flex items-center gap-0.5 rounded-lg border border-zinc-700 bg-zinc-900 p-0.5">
                    <button
                      type="button"
                      onClick={() => setColumnMode(1)}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                        columnMode === 1
                          ? 'bg-zinc-700 text-white'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      1단
                    </button>
                    <button
                      type="button"
                      onClick={() => setColumnMode(2)}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                        columnMode === 2
                          ? 'bg-zinc-700 text-white'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      2단
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-zinc-500">세밀</span>
                    <input
                      type="range"
                      min={5}
                      max={40}
                      step={1}
                      value={cropSensitivity}
                      onChange={(e) => setCropSensitivity(Number(e.target.value))}
                      className="w-16 h-1 accent-cyan-500 cursor-pointer"
                      title={`감도: ${cropSensitivity} (낮을수록 세밀하게 분리)`}
                    />
                    <span className="text-[10px] text-zinc-500">넓게</span>
                    <span className="text-[10px] text-cyan-400 font-mono w-4 text-center">{cropSensitivity}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 문항 수 */}
          <span className="text-xs text-zinc-400">
            {isAutoCropActive ? (
              <>
                감지 <span className="text-cyan-400 font-bold">{autoCropAllProblems.length}</span>문항
                {completedCount > 0 && (
                  <span className="text-emerald-400"> · {completedCount}완료</span>
                )}
                {pendingCount > 0 && (
                  <span className="text-zinc-500"> · {pendingCount}대기</span>
                )}
              </>
            ) : (
              <>
                총 <span className="text-cyan-400 font-bold">{jobData.totalProblems}</span>문항
              </>
            )}
          </span>

          {/* ★ 분석 시작 버튼 (AutoCrop 모드) */}
          {isAutoCropActive && pendingCount > 0 && !isBatchAnalyzing && (
            <button
              type="button"
              onClick={handleBatchAnalyze}
              className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition-all bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20 animate-pulse"
            >
              <Play className="h-3.5 w-3.5" />
              분석 시작 ({pendingCount}문항)
            </button>
          )}

          {/* 자산화 버튼 / 클라우드 이동 버튼 */}
          {((!isProcessing && jobData.totalProblems > 0) || (isAutoCropActive && completedCount > 0)) && (
            isSaved ? (
              <button
                type="button"
                onClick={() => router.push('/dashboard/cloud')}
                className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition-all bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                클라우드에서 확인하기 →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={isSavingAll}
                className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition-all bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 disabled:opacity-60"
              >
                {isSavingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                자산화
              </button>
            )
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
        {isAutoCropActive && (
          <span className={`text-[10px] rounded px-1.5 py-0.5 ${
            detectionMode === 'ai'
              ? 'text-indigo-400/70 bg-indigo-500/5 border border-indigo-500/20'
              : 'text-cyan-400/70 bg-cyan-500/5 border border-cyan-500/20'
          }`}>
            {detectionMode === 'ai' ? 'AI 감지 모드' : 'AutoCrop 모드'}
          </span>
        )}
      </div>

      {/* ======== Main 3-Panel Layout ======== */}
      <div className="flex flex-1 overflow-hidden">
        {/* --- 좌측: 페이지 썸네일 --- */}
        <div className="w-52 flex-shrink-0 border-r border-zinc-800/50">
          <PageThumbnailList
            pages={activeJobData?.pages || jobData.pages}
            currentPage={currentPage}
            totalPdfPages={totalPdfPages}
            pdfUrl={jobData.pdfUrl}
            onPageSelect={setCurrentPage}
            aiDetectProgress={detectionMode === 'ai' ? aiDetectProgress : undefined}
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
          onBboxUpdate={isAutoCropActive ? handleAutoCropBboxUpdate : handleBboxUpdate}
          onDeleteProblem={isAutoCropActive ? (id) => handleDeleteAutoCropProblem(id, true) : undefined}
          isAnalyzing={isProcessing && !isAutoCropActive}
          canvasRef={pdfCanvasRef}
          onManualCropDetected={handleManualCropDetected}
        />

        {/* --- 우측: 문제 상세 패널 --- */}
        <div className="w-[420px] flex-shrink-0 border-l border-zinc-800/50">
          <ProblemDetailPanel
            problem={selectedProblem}
            pdfUrl={jobData.pdfUrl}
            onSave={isAutoCropActive ? (updated) => {
              // AutoCrop 모드: autoCropProblems에서 업데이트
              if (!selectedProblemId) return;
              setAutoCropProblems(prev => {
                const next = new Map(prev);
                for (const [pageIdx, problems] of next.entries()) {
                  const idx = problems.findIndex(p => p.id === selectedProblemId);
                  if (idx >= 0) {
                    const updatedProblems = [...problems];
                    updatedProblems[idx] = { ...updatedProblems[idx], ...updated, status: 'edited' };
                    next.set(pageIdx, updatedProblems);
                    break;
                  }
                }
                return next;
              });
            } : handleSaveProblem}
            onDelete={isAutoCropActive ? () => handleDeleteAutoCropProblem(selectedProblemId || '') : handleDeleteProblem}
            onReanalyze={isAutoCropActive ? () => handleReanalyzeSingle(selectedProblemId || '') : handleReanalyze}
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
          onSave={async (updated) => {
            // 1) DB에 저장된 문제인 경우 API PATCH 호출
            if (editingProblem.problemId) {
              try {
                const body: Record<string, unknown> = {};
                if (updated.content !== undefined) body.content_latex = updated.content;
                if (updated.solution !== undefined) body.solution_latex = updated.solution;

                // 정답/선택지를 answer_json으로 변환
                if (updated.answer !== undefined || updated.choices !== undefined) {
                  const finalAnswer = updated.answer ?? editingProblem.answer;
                  const circledNumbers = ['①', '②', '③', '④', '⑤'];
                  const currentChoices = updated.choices ?? editingProblem.choices ?? [];
                  const formattedChoices = currentChoices.map((c: string, i: number) => {
                    const stripped = c.replace(/^[①②③④⑤]\s*/, '');
                    return stripped ? `${circledNumbers[i]} ${stripped}` : '';
                  }).filter(Boolean);
                  body.answer_json = {
                    correct_answer: finalAnswer,
                    finalAnswer: finalAnswer,
                    choices: formattedChoices,
                    type: formattedChoices.length > 0 ? 'multiple_choice' : 'short_answer',
                  };
                }

                if (Object.keys(body).length > 0) {
                  const res = await fetch(`/api/problems/${editingProblem.problemId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                  });
                  if (!res.ok) {
                    console.error('[Modal Save] API 저장 실패');
                    alert('저장에 실패했습니다.');
                    return;
                  }
                }
              } catch (err) {
                console.error('[Modal Save] API 호출 실패:', err);
                alert('저장에 실패했습니다.');
                return;
              }
            }

            // 2) 로컬 상태 업데이트
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
          onDelete={async () => {
            // DB에 저장된 문제인 경우 API로 삭제
            if (editingProblem.problemId) {
              try {
                const res = await fetch(`/api/problems/${editingProblem.problemId}`, { method: 'DELETE' });
                if (!res.ok) {
                  alert('문제 삭제에 실패했습니다.');
                  return;
                }
                console.log(`[Delete] 모달에서 DB 삭제 완료: ${editingProblem.problemId}`);
              } catch (err) {
                console.error('[Delete] 모달 삭제 API 실패:', err);
                alert('문제 삭제에 실패했습니다.');
                return;
              }
            }
            // 로컬 state 업데이트
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
