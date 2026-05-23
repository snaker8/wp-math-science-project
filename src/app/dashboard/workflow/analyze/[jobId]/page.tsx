'use client';

// ============================================================================
// PDF 문제 분석 페이지 - 참조 사이트 스타일
// 좌: 페이지 썸네일 (PDF.js) | 중앙: PDF 이미지 + 바운딩 박스 | 우: 문제 상세
// Chrome 디자인 시스템 적용 (Claude Design 번들 IRj4OEAcy9MBPI2CLsG2dg)
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
  ImagePlus,
  Merge,
  Keyboard,
  RotateCw,
} from 'lucide-react';
import './pdf-analyze.css';
import { supabaseBrowser } from '@/lib/supabase/client';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import AnalyzeProblemEditModal from '@/components/workflow/AnalyzeProblemEditModal';
import type { AnalyzedProblemData } from '@/components/workflow/AnalyzeProblemEditModal';
import dynamic from 'next/dynamic';
import { analyzePageBlocksSplit, getMultiBlocks, refineAiBboxes, type CropRect } from '@/lib/pdf/auto-crop';
// ★ bbox 회전 헬퍼 (PDF 자동 회전 + 사용자 토글, 2026-05-22)
//   - rotateBbox: 원본 PDF 좌표 → 회전 디스플레이 좌표 (렌더용)
//   - unrotateBbox: 디스플레이 좌표 → 원본 좌표 (DB 저장용 — 항상 원본 유지)
import { rotateBbox as rotateBboxLocal, unrotateBbox as unrotateBboxLocal } from '@/lib/pdf-viewer';
// ★ 페이지 순서 정정 — 드래그 앤 드롭 (2026-05-17)
//   PDF 스캔이 잘못된 순서(예: 1, 3, 2)로 들어왔을 때 사용자가 정정 가능
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useOrganizationName } from '@/hooks/useUserScope';

// Desmos 그래프 뷰어 (클라이언트 전용, dynamic import)
const InlineDesmosGraph = dynamic(
  () => import('@/components/shared/InlineDesmosGraph').then(mod => ({ default: mod.InlineDesmosGraph })),
  { ssr: false, loading: () => <div className="h-[200px] bg-zinc-900 rounded-lg animate-pulse" /> }
);

// ============================================================================
// Types
// ============================================================================

// 그래프/도형 분석 결과 (Gemini Vision)
interface GraphData {
  type: 'function' | 'geometry' | 'coordinate' | 'sketch' | 'none';
  expressions?: string[];
  xRange?: [number, number];
  yRange?: [number, number];
  points?: { x: number; y: number; label?: string }[];
  description?: string;
  imageBbox?: { top: number; left: number; bottom: number; right: number };
  svg?: string;  // ★ sketch 타입: 보이는 대로 생성한 SVG
}

// ★ 사용자 삽입 이미지 메타 (재분석 시 보존용)
interface InsertedImage {
  id: string;
  base64: string;
  cropRelativeRect: { x: number; y: number; w: number; h: number };
  replacedPattern?: string;       // 교체된 OCR 텍스트 패턴 (디버그용)
  insertPosition: 'replace-table' | 'append';
}

interface AnalyzedProblem {
  id: string;
  problemId?: string;
  number: number;
  content: string;
  choices: string[];
  answer: number | string;
  solution: string;
  difficulty: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10; // 수학비서 1~10 스케일
  typeCode: string;
  typeName: string;
  confidence: number;
  status: 'pending' | 'analyzing' | 'completed' | 'error' | 'edited';
  pageIndex: number;
  // 바운딩 박스 (비율 기반, 0~1)
  bbox?: { x: number; y: number; w: number; h: number };
  // 그래프/도형 분석 결과 (Vision AI)
  graphData?: GraphData;
  // 원본 크롭 이미지 base64 (분석 시 캐시)
  cropImageBase64?: string;
  // 교육과정 성취기준 코드 (505개 체계)
  achievementCode?: string;
  // 난이도 라벨 (하/중하/중/중상/상)
  difficultyLabel?: string;
  // 난이도 세부 채점 (6항목)
  difficultyScores?: {
    concept_count: number;
    step_count: number;
    calc_complexity: number;
    thinking_level: number;
    data_interpretation: number;
    trap_misconception: number;
    total: number;
  };
  // 인지 영역
  cognitiveDomain?: string;
  // 과목/영역
  subject?: string;
  chapter?: string;
  section?: string;
  // ★ 사용자 삽입 이미지 (재분석 시 보존)
  insertedImages?: InsertedImage[];
  // ★ 배점 (예: 3.4, 4 등 — OCR [3.4점] 패턴에서 추출)
  score?: number;
  // ★ Phase C-1b: 학생 함정 유형 자동 추출 (cloud-flow → 자산화 시 problem_pitfalls INSERT)
  pitfalls?: Array<{ code: string; confidence: number; reason?: string }>;
  // ★ 표 객관식 헤더 (자동 감지) — 예: ['A', 'B'] 또는 ['수1', '수2']
  //   choices 의 각 content 는 헤더 개수만큼 ' / ' 구분된 컬럼 값 ("노란색 / 자홍색")
  //   분석 카드가 헤더 행 + 컬럼 정렬 표시
  choiceHeaders?: string[];
  // ★ 선택지 레이아웃 — answer_json.choiceLayout (1=1열, 2=2열, 3=3열, 5=가로)
  //   모달에서 변경 시 onSave 핸들러가 answer_json 에 박아 DB 저장 (2026-05-17 fix)
  choiceLayout?: number;
  // ★ 그림 객관식: 선택지별 이미지 URL (data:image/png;base64,... 또는 storage URL)
  //   1차 분석 모달에서 cvFigure 후보를 선택지에 할당 시 사용. 저장 시 answer_json.choiceImages 박힘.
  choiceImages?: (string | null)[];
  // ★ 과학 자산화 — Gemini OpenCV 가 자동 크롭한 figure 후보 (data:image/png;base64,...)
  //   1차 분석 모달의 "이미지 후보" 픽커가 이 배열에서 썸네일을 보여줌.
  //   본문 또는 선택지에 클릭 한 번으로 삽입 가능. 자산화 시 base64 마커 → Storage 업로드.
  cvFigures?: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    cropBase64?: string;
  }>;
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
  bookGroupId?: string | null;  // ★ 클라우드 북그룹 ID (자산화 시 사용)
  subjectArea?: 'math' | 'science';
  scienceSubject?: string;
  curriculumVersion?: '2015' | '2022';
  imagePipeline?: {
    status: 'running' | 'done' | 'error';
    extracted_count: number;
    enhanced_count: number;
    db_entries_added: number;
    images: Array<{ filename: string; page: number; width: number; height: number; upscaled: boolean }>;
    error?: string;
  } | null;
}

// ============================================================================
// Constants
// ============================================================================

// ★ 수학비서 1~10 스케일 (편집 모달과 동일 체계)
//   1~2 쉬움 · 3~4 보통 · 5~6 응용 · 7~8 고난도 · 9~10 최상
const DIFFICULTY_LABELS: Record<number, { label: string; color: string }> = {
  1:  { label: '1 쉬움',   color: 'text-zinc-400 border-zinc-500 bg-zinc-800' },
  2:  { label: '2 쉬움',   color: 'text-zinc-400 border-zinc-500 bg-zinc-800' },
  3:  { label: '3 보통',   color: 'text-blue-400 border-blue-500 bg-blue-500/10' },
  4:  { label: '4 보통',   color: 'text-blue-400 border-blue-500 bg-blue-500/10' },
  5:  { label: '5 응용',   color: 'text-amber-400 border-amber-500 bg-amber-500/10' },
  6:  { label: '6 응용',   color: 'text-amber-400 border-amber-500 bg-amber-500/10' },
  7:  { label: '7 고난도', color: 'text-orange-400 border-orange-500 bg-orange-500/10' },
  8:  { label: '8 고난도', color: 'text-orange-400 border-orange-500 bg-orange-500/10' },
  9:  { label: '9 최상',   color: 'text-red-400 border-red-500 bg-red-500/10' },
  10: { label: '10 최상',  color: 'text-red-300 border-red-700 bg-red-700/10' },
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
  rotation = 0,
  className,
}: {
  pdfUrl?: string;
  pageNumber: number;
  width: number;
  height: number;
  rotation?: 0 | 90 | 180 | 270;
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

        await renderPdfPage(canvas, pdf, pageNumber, width, height, rotation);

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
  }, [pdfUrl, pageNumber, width, height, rotation]);

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
// Page Thumbnail List (좌측) — 드래그 앤 드롭으로 페이지 순서 정정 가능
// ============================================================================

interface PageEntry {
  /** 표시용 페이지 번호 (1부터, 드래그 후 재할당) */
  displayNumber: number;
  /** 원본 PDF 페이지 번호 (썸네일 렌더링에 사용 — 절대 변경 안 됨) */
  pdfPageNumber: number;
  /** 분석 결과 (있을 수 있음) */
  pageData?: PageData;
  /** AI 감지 상태 — 원본 PDF page index 기준 */
  aiStatus?: 'loading' | 'done' | 'error';
}

function PageThumbnailItem({
  entry,
  isActive,
  pdfUrl,
  onPageSelect,
  reorderEnabled,
  rotation = 0,
}: {
  entry: PageEntry;
  isActive: boolean;
  pdfUrl?: string;
  onPageSelect: (displayNumber: number) => void;
  reorderEnabled: boolean;
  rotation?: 0 | 90 | 180 | 270;
}) {
  const sortable = useSortable({ id: entry.pdfPageNumber, disabled: !reorderEnabled });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left transition-all ${
        isActive
          ? 'bg-cyan-500/10 border-2 border-cyan-500/40'
          : 'border-2 border-zinc-800 hover:border-zinc-600'
      } ${isDragging ? 'shadow-xl' : ''}`}
    >
      {/* 드래그 핸들 (정정 모드일 때만 표시) */}
      {reorderEnabled && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex items-center justify-center w-5 h-7 rounded text-zinc-500 hover:text-zinc-300 cursor-grab active:cursor-grabbing flex-shrink-0"
          title="드래그해서 순서 변경"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}

      <button
        type="button"
        onClick={() => onPageSelect(entry.displayNumber)}
        className="flex flex-1 items-center gap-2.5 min-w-0"
      >
        {/* 표시 페이지 번호 */}
        <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 ${
          isActive
            ? 'bg-cyan-500 text-white'
            : 'bg-zinc-700 text-zinc-400'
        }`}>
          {entry.displayNumber}
        </div>

        {/* 썸네일 — 원본 PDF 페이지 번호로 렌더링 (절대 변경 X) */}
        <div className={`relative w-14 h-20 rounded border overflow-hidden flex-shrink-0 bg-white ${
          isActive ? 'border-cyan-400' : 'border-zinc-600'
        }`}>
          <PdfPageCanvas
            pdfUrl={pdfUrl}
            pageNumber={entry.pdfPageNumber}
            width={56}
            height={80}
            rotation={rotation}
          />
          {entry.aiStatus === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
            </div>
          )}
          {entry.aiStatus === 'error' && (
            <div className="absolute bottom-0.5 right-0.5">
              <AlertCircle className="h-3 w-3 text-amber-400" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className={`text-xs font-medium ${
            isActive ? 'text-cyan-300' : 'text-zinc-400'
          }`}>
            페이지 {entry.displayNumber}
            {entry.pdfPageNumber !== entry.displayNumber && (
              <span className="ml-1 text-[9px] text-amber-400 font-normal">
                (PDF {entry.pdfPageNumber})
              </span>
            )}
          </div>
          {entry.pageData && entry.pageData.problems.length > 0 && (
            <div className="text-[10px] text-zinc-500 mt-0.5">
              {entry.pageData.problems.length}문항
            </div>
          )}
        </div>
      </button>
    </div>
  );
}

function PageThumbnailList({
  pages,
  currentPage,
  totalPdfPages,
  pdfUrl,
  onPageSelect,
  aiDetectProgress,
  pageOrder,
  onReorder,
  getRotation,
}: {
  pages: PageData[];
  currentPage: number;
  totalPdfPages: number;
  pdfUrl?: string;
  onPageSelect: (displayNumber: number) => void;
  aiDetectProgress?: Map<number, 'loading' | 'done' | 'error'>;
  /** displayNumber → pdfPageNumber 매핑 배열. index 0 = 표시 1번 페이지의 원본 PDF 번호 */
  pageOrder: number[];
  /** 새 순서로 변경 시 호출 (새 pageOrder 배열) */
  onReorder: (newOrder: number[]) => void;
  /** ★ 페이지별 회전값 조회 — 썸네일도 회전 반영 */
  getRotation?: (pdfPageNumber: number) => 0 | 90 | 180 | 270;
}) {
  const [reorderMode, setReorderMode] = useState(false);

  // 표시할 페이지 엔트리 — pageOrder 기준으로 매핑
  //   pageData 는 원본 PDF 페이지 번호로 매핑 (pages.pageNumber 가 PDF 기준이라 가정)
  const entries: PageEntry[] = pageOrder.map((pdfPageNumber, idx) => {
    const displayNumber = idx + 1;
    return {
      displayNumber,
      pdfPageNumber,
      pageData: pages.find((p) => p.pageNumber === pdfPageNumber),
      aiStatus: aiDetectProgress?.get(pdfPageNumber - 1),
    };
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = pageOrder.indexOf(active.id as number);
    const newIndex = pageOrder.indexOf(over.id as number);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(pageOrder, oldIndex, newIndex));
  };

  const isReordered = pageOrder.some((pdfNum, idx) => pdfNum !== idx + 1);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800/50">
        <span className="text-xs font-bold text-zinc-300">페이지 {pageOrder.length}</span>
        <div className="flex items-center gap-1">
          {isReordered && (
            <button
              type="button"
              onClick={() => onReorder(Array.from({ length: totalPdfPages }, (_, i) => i + 1))}
              className="text-[10px] text-amber-400 hover:text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 hover:bg-amber-500/10"
              title="원본 PDF 순서로 복원"
            >
              초기화
            </button>
          )}
          <button
            type="button"
            onClick={() => setReorderMode((v) => !v)}
            className={`text-[10px] px-1.5 py-0.5 rounded border ${
              reorderMode
                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                : 'text-zinc-400 border-zinc-700 hover:bg-zinc-800'
            }`}
            title="페이지가 잘못 스캔된 순서로 들어왔을 때 드래그로 정정"
          >
            {reorderMode ? '완료' : '순서정정'}
          </button>
        </div>
      </div>
      {reorderMode && (
        <div className="px-3 py-1.5 bg-cyan-500/5 border-b border-cyan-500/20 text-[10px] text-cyan-300">
          📌 핸들을 드래그해 페이지 순서를 정정하세요
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={pageOrder} strategy={verticalListSortingStrategy}>
            {entries.map((entry) => (
              <PageThumbnailItem
                key={entry.pdfPageNumber}
                entry={entry}
                isActive={currentPage === entry.displayNumber}
                pdfUrl={pdfUrl}
                onPageSelect={onPageSelect}
                reorderEnabled={reorderMode}
                rotation={getRotation?.(entry.pdfPageNumber) ?? 0}
              />
            ))}
          </SortableContext>
        </DndContext>
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
  rotation = 0,
}: {
  problem: AnalyzedProblem;
  canvasSize: { width: number; height: number };
  isSelected: boolean;
  onSelect: () => void;
  onDoubleClick: () => void;
  onBboxChange: (bbox: { x: number; y: number; w: number; h: number }) => void;
  rotation?: 0 | 90 | 180 | 270;
}) {
  // ★ 회전 적용 — 원본 bbox 는 PDF 좌표계, displayBbox 는 회전된 디스플레이 좌표계.
  //   드래그/리사이즈는 displayBbox 기준으로 계산하고, 저장 시 unrotateBbox 로 원본 좌표 복원.
  const originalBbox = problem.bbox!;
  const displayBbox = rotateBboxLocal(originalBbox, rotation);
  const bbox = displayBbox;
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

      // ★ DB 에는 항상 원본 PDF 좌표로 저장 — display 좌표 → 원본 좌표 역변환
      onBboxChange(rotation === 0 ? newBbox : unrotateBboxLocal(newBbox, rotation));
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [bbox, canvasSize, onBboxChange, onSelect, rotation]);

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
  rotation = 0,
  onRotate,
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
  /** ★ 페이지 회전 (0|90|180|270). 자동 감지(가로→90)+사용자 토글로 설정됨 */
  rotation?: 0 | 90 | 180 | 270;
  /** ★ 회전 버튼 클릭 시 호출 — 현재 PDF page number 전달 */
  onRotate?: (pdfPageNumber: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = externalCanvasRef || internalCanvasRef;
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isRendering, setIsRendering] = useState(true);
  const [pdfError, setPdfError] = useState(false);
  const currentRenderTaskRef = useRef<{ cancel: () => void } | null>(null);

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
  // ★ 자동 스크롤용 ref/state
  const autoScrollRef = useRef<number | null>(null);
  const lastMousePosRef = useRef<{ clientX: number; clientY: number } | null>(null);

  // ★ 자동 스크롤 루프 — 컨테이너 가장자리 근처로 드래그 시 자동 스크롤
  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current !== null) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, []);

  const startAutoScrollIfNeeded = useCallback(() => {
    const container = containerRef.current;
    const lastPos = lastMousePosRef.current;
    if (!container || !lastPos) {
      stopAutoScroll();
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const EDGE = 60;       // 가장자리 감지 영역 (px)
    const MAX_SPEED = 18;  // 최대 스크롤 속도 (px/frame)

    // 세로 스크롤 속도 계산 (위/아래 가장자리)
    let dy = 0;
    const distFromTop = lastPos.clientY - containerRect.top;
    const distFromBottom = containerRect.bottom - lastPos.clientY;
    if (distFromTop < EDGE && distFromTop >= 0) {
      dy = -Math.ceil(((EDGE - distFromTop) / EDGE) * MAX_SPEED);
    } else if (distFromBottom < EDGE && distFromBottom >= 0) {
      dy = Math.ceil(((EDGE - distFromBottom) / EDGE) * MAX_SPEED);
    }

    // 가로 스크롤도 함께 (좌/우 가장자리)
    let dx = 0;
    const distFromLeft = lastPos.clientX - containerRect.left;
    const distFromRight = containerRect.right - lastPos.clientX;
    if (distFromLeft < EDGE && distFromLeft >= 0) {
      dx = -Math.ceil(((EDGE - distFromLeft) / EDGE) * MAX_SPEED);
    } else if (distFromRight < EDGE && distFromRight >= 0) {
      dx = Math.ceil(((EDGE - distFromRight) / EDGE) * MAX_SPEED);
    }

    if (dy !== 0 || dx !== 0) {
      container.scrollBy(dx, dy);
      // ★ 스크롤 후 dragRect도 따라서 확장 (스크롤로 캔버스가 움직였으므로)
      if (isDragSelecting && dragStart) {
        const inner = container.querySelector('.relative.inline-block') as HTMLElement | null;
        if (inner) {
          const innerRect = inner.getBoundingClientRect();
          const currentX = lastPos.clientX - innerRect.left;
          const currentY = lastPos.clientY - innerRect.top;
          const x = Math.min(dragStart.x, currentX);
          const y = Math.min(dragStart.y, currentY);
          const w = Math.abs(currentX - dragStart.x);
          const h = Math.abs(currentY - dragStart.y);
          setDragRect({ x, y, w, h });
        }
      }
      autoScrollRef.current = requestAnimationFrame(startAutoScrollIfNeeded);
    } else {
      stopAutoScroll();
    }
  }, [isDragSelecting, dragStart, stopAutoScroll]);

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

    // ★ 마우스 위치 저장 + 가장자리 근처면 자동 스크롤 시작
    lastMousePosRef.current = { clientX: e.clientX, clientY: e.clientY };
    if (autoScrollRef.current === null) {
      autoScrollRef.current = requestAnimationFrame(startAutoScrollIfNeeded);
    }
  }, [isDragSelecting, dragStart, startAutoScrollIfNeeded]);

  const handleCanvasMouseUp = useCallback(() => {
    stopAutoScroll(); // ★ 자동 스크롤 중지
    lastMousePosRef.current = null;
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
    // ★ 드래그 중에는 캔버스 영역을 벗어나도 취소하지 않음 (자동 스크롤 위해)
    // 드래그 종료는 document mouseup 리스너에서 처리
  }, []);

  // ★ 드래그 중 document 레벨 mousemove/mouseup 리스너 — 캔버스 밖에서도 드래그 추적
  useEffect(() => {
    if (!isDragSelecting) return;

    const handleDocMouseMove = (e: MouseEvent) => {
      lastMousePosRef.current = { clientX: e.clientX, clientY: e.clientY };
      // dragRect 갱신
      const container = containerRef.current;
      if (!container || !dragStart) return;
      const inner = container.querySelector('.relative.inline-block') as HTMLElement | null;
      if (!inner) return;
      const innerRect = inner.getBoundingClientRect();
      const currentX = e.clientX - innerRect.left;
      const currentY = e.clientY - innerRect.top;
      const x = Math.min(dragStart.x, currentX);
      const y = Math.min(dragStart.y, currentY);
      const w = Math.abs(currentX - dragStart.x);
      const h = Math.abs(currentY - dragStart.y);
      setDragRect({ x, y, w, h });
      // 자동 스크롤 시작 (이미 시작 중이면 중복 안 됨)
      if (autoScrollRef.current === null) {
        autoScrollRef.current = requestAnimationFrame(startAutoScrollIfNeeded);
      }
    };

    const handleDocMouseUp = () => {
      handleCanvasMouseUp();
    };

    document.addEventListener('mousemove', handleDocMouseMove);
    document.addEventListener('mouseup', handleDocMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleDocMouseMove);
      document.removeEventListener('mouseup', handleDocMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragSelecting, dragStart]);

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
        // ★ 회전 적용 — viewport.width/height 가 90/270 시 자동 swap.
        const viewport = page.getViewport({ scale: 1, rotation });

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

        // 가로·세로 모두 고려하되 세로 제약을 25% 여유로 풀어 약간만 확대
        const scale = Math.min(
          containerWidth / viewport.width,
          (containerHeight * 1.25) / viewport.height,
          2.5
        );

        const scaledViewport = page.getViewport({ scale, rotation });

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

        // ★ 흰색 배경 먼저 칠하기 (PDF 투명 배경 → 검은색 방지)
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // 이전 렌더링 태스크가 있으면 취소
        if (currentRenderTaskRef.current) {
          currentRenderTaskRef.current.cancel();
          currentRenderTaskRef.current = null;
        }

        const renderTask = page.render({
          canvasContext: context,
          viewport: scaledViewport,
        });
        currentRenderTaskRef.current = renderTask;

        await renderTask.promise;
        currentRenderTaskRef.current = null;

        if (!cancelled) {
          setIsRendering(false);
        }
      } catch (err: any) {
        // RenderingCancelledException은 정상적인 취소이므로 무시
        if (err?.name === 'RenderingCancelledException') return;
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
      if (currentRenderTaskRef.current) {
        currentRenderTaskRef.current.cancel();
        currentRenderTaskRef.current = null;
      }
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [pdfUrl, pageNumber, rotation]);

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
    <div ref={containerRef} className="flex-1 overflow-auto flex justify-center py-4 bg-zinc-950/30 relative">
      {/* ★ 페이지 회전 토글 (PDF 자동 정렬 + 사용자 수동 보정) — 우측 상단 fixed */}
      {onRotate && (
        <button
          type="button"
          onClick={() => onRotate(pageNumber)}
          className="absolute top-3 right-3 z-40 px-2 py-1 rounded text-xs font-bold bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors flex items-center gap-1"
          title={`페이지 회전 (90° 시계방향). 현재 ${rotation}°`}
        >
          <RotateCw className="h-3 w-3" />
          회전 {rotation > 0 && <span className="text-cyan-300">{rotation}°</span>}
        </button>
      )}
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
          style={{
            background: 'white',
            cursor: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'32\'%3E%3Cline x1=\'16\' y1=\'0\' x2=\'16\' y2=\'32\' stroke=\'%23e11d48\' stroke-width=\'2\'/%3E%3Cline x1=\'0\' y1=\'16\' x2=\'32\' y2=\'16\' stroke=\'%23e11d48\' stroke-width=\'2\'/%3E%3Ccircle cx=\'16\' cy=\'16\' r=\'3\' fill=\'%23e11d48\'/%3E%3C/svg%3E") 16 16, crosshair',
          }}
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
              rotation={rotation}
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

        // ★ 흰색 배경 먼저 칠하기 (PDF 투명 배경 → 검은색 방지)
        fullCtx.fillStyle = '#ffffff';
        fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);

        const renderTask = page.render({ canvasContext: fullCtx, viewport });
        await renderTask.promise;
        if (cancelled) return;

        fullCanvasRef.current = fullCanvas;
        cachedPageRef.current = pageIndex;
        setIsLoading(false);
      } catch (err: any) {
        if (err?.name === 'RenderingCancelledException') return;
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

/**
 * 본문 + 선택지 배열을 ①②③④⑤ 마커로 합쳐 단일 편집 텍스트 생성.
 * 선택지가 비어있으면 본문만 반환.
 */
function buildMergedContentChoices(content: string, choices: string[]): string {
  const trimmed = (content || '').trimEnd();
  if (!Array.isArray(choices) || choices.length === 0) return trimmed;
  const markers = ['①', '②', '③', '④', '⑤'];
  const lines = choices.map((c, i) => `${markers[i] ?? `(${i + 1})`} ${(c || '').trim()}`);
  return `${trimmed}\n\n${lines.join('\n')}`;
}

function AdvancedAnalysisModal({
  initialContent,
  initialChoices,
  imageBase64,
  onApply,
  onCancel,
}: {
  /** 1차 분석 결과 본문 (선택지 제외) */
  initialContent: string;
  /** 1차 분석 결과 선택지 — 본문과 합쳐서 함께 편집 */
  initialChoices: string[];
  /** 옵션: 크롭 이미지 (base64). 있으면 시각 컨텍스트로 활용. */
  imageBase64?: string;
  /** 최종 적용 시 호출 — 본문 + 선택지 분리해서 반환 */
  onApply: (finalContent: string, finalChoices: string[]) => void;
  onCancel: () => void;
}) {
  // ★ 본문 + 선택지를 ①②③④⑤ 마커로 합쳐서 단일 편집 텍스트로 구성
  //   고급 분석 LLM이 본문과 선택지를 모두 보고 일관되게 수정할 수 있게 함
  const initialMerged = useMemo(
    () => buildMergedContentChoices(initialContent, initialChoices),
    [initialContent, initialChoices]
  );
  const [currentText, setCurrentText] = useState(initialMerged);
  const [currentChoices, setCurrentChoices] = useState<string[]>(initialChoices);
  const [draftPrompt, setDraftPrompt] = useState('');
  // ★ 기본은 Claude Sonnet 4.6 — 이 정도 텍스트 편집은 Sonnet 으로 충분하고 비용 효율적.
  //   Opus 는 정확도 약간 ↑이지만 토큰 비용이 5배 가량 높아 추천 안 함.
  const [model, setModel] = useState<'gpt-4o' | 'claude-sonnet' | 'claude-opus'>('claude-sonnet');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{
    prompt: string;
    before: string;
    after: string;
    model: string;
    durationMs: number;
  }>>([]);

  const presets = [
    '객관식 options 의 수식을 정확히 읽어줘',
    'ㄱ, ㄴ, ㄷ 자음 글자를 정확히 표기해줘',
    '선분 수식에 \\overline 태그 넣어줘',
    '학생 낙서 무시하고 인쇄된 글자만 읽어줘',
  ];

  const submitInstruction = async () => {
    const prompt = draftPrompt.trim();
    if (!prompt || isProcessing) return;
    setIsProcessing(true);
    setError(null);
    const before = currentText;
    const t0 = Date.now();
    try {
      const res = await fetch('/api/workflow/reanalyze-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imageBase64 || undefined,
          currentText: before,
          customPrompt: prompt,
          model,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const after = (data.ocrText as string) || before;
      setCurrentText(after);
      // ★ API가 편집된 텍스트에서 ①②③④⑤를 다시 추출해 반환 — 선택지도 함께 갱신
      if (Array.isArray(data.choices) && data.choices.length > 0) {
        setCurrentChoices(data.choices as string[]);
      }
      setHistory(prev => [...prev, { prompt, before, after, model, durationMs: Date.now() - t0 }]);
      setDraftPrompt('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRevert = () => {
    setCurrentText(initialMerged);
    setCurrentChoices(initialChoices);
    setHistory([]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setCurrentText(last.before);
    setHistory(prev => prev.slice(0, -1));
  };

  const handleApply = () => {
    // ★ 편집된 단일 텍스트를 본문 / 선택지로 다시 분리
    const { content: splitContent } = removeChoicesFromContent(currentText);
    onApply(splitContent, currentChoices);
  };

  const isModified = currentText !== initialMerged;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl h-[88vh] rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-sm font-bold text-white">고급 분석 — 채팅형 수정</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              현재 분석 결과를 보면서 지시하면 즉시 반영됩니다. 여러 번 반복 가능.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-500 mr-1">모델:</span>
            {(['gpt-4o', 'claude-sonnet', 'claude-opus'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setModel(m)}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors border ${
                  model === m
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                    : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
                }`}
                title={
                  m === 'gpt-4o' ? '빠름 · 저렴'
                    : m === 'claude-sonnet' ? '★ 추천 — 텍스트 편집에 충분 · 합리적 비용'
                    : '최고 정확도 · 비용 ↑↑ (필요 시만)'
                }
              >
                {m === 'gpt-4o' ? 'GPT-4o' : m === 'claude-sonnet' ? 'Sonnet ★' : 'Opus ⚠'}
              </button>
            ))}
          </div>
        </div>

        {/* 현재 분석 결과 미리보기 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                현재 분석 결과
              </span>
              {isModified && (
                <span className="text-[10px] text-amber-400 font-semibold">● 수정됨</span>
              )}
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 max-h-64 overflow-y-auto">
              <pre className="whitespace-pre-wrap break-words text-xs text-zinc-200 font-mono leading-relaxed">
                {currentText || '(비어있음)'}
              </pre>
            </div>
          </div>

          {/* 대화 이력 */}
          {history.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                수정 이력 ({history.length})
              </div>
              <div className="space-y-1.5">
                {history.map((h, i) => (
                  <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[11px]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-cyan-400 font-semibold">#{i + 1}</span>
                      <span className="text-zinc-500">·</span>
                      <span className="text-zinc-400">{h.model}</span>
                      <span className="text-zinc-500">·</span>
                      <span className="text-zinc-500">{(h.durationMs / 1000).toFixed(1)}s</span>
                    </div>
                    <div className="text-zinc-300 break-words">{h.prompt}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* 프리셋 + 입력 */}
        <div className="border-t border-zinc-800 p-4 space-y-2 flex-shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDraftPrompt(prev => prev ? `${prev}\n${preset}` : preset)}
                className="text-[10px] rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-2.5 py-1 text-zinc-400 transition-colors"
              >
                + {preset.slice(0, 22)}{preset.length > 22 ? '…' : ''}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <textarea
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  submitInstruction();
                }
              }}
              disabled={isProcessing}
              rows={2}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none disabled:opacity-50"
              placeholder="예) 분모를 x+1로 바꿔줘 / ㄱ선택지 삭제해줘 / ⌘+Enter 로 전송"
            />
            <button
              type="button"
              onClick={submitInstruction}
              disabled={isProcessing || !draftPrompt.trim()}
              className="self-stretch px-5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white transition-colors disabled:opacity-40"
            >
              {isProcessing ? '...' : '분석'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-2 px-5 py-3 border-t border-zinc-800 flex-shrink-0">
          <div className="flex gap-2">
            {history.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleUndo}
                  className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  ↶ 한 단계 되돌리기
                </button>
                <button
                  type="button"
                  onClick={handleRevert}
                  className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  원본으로
                </button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isProcessing}
              className="px-4 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={isProcessing || !isModified}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-colors disabled:opacity-40"
            >
              최종 적용
            </button>
          </div>
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
  insertImageMode,
  onToggleInsertImage,
  onCropImageDragSelect,
  onDeleteLastImage,
  mergeMode,
  mergeTargetId,
  onStartMerge,
  onMergeProblems,
  onCancelMerge,
  allProblems,
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
  insertImageMode?: boolean;
  onToggleInsertImage?: () => void;
  onCropImageDragSelect?: (rect: { x: number; y: number; w: number; h: number }) => void;
  onDeleteLastImage?: () => void;
  mergeMode?: boolean;
  mergeTargetId?: string | null;
  onStartMerge?: () => void;
  onMergeProblems?: () => void;
  onCancelMerge?: () => void;
  allProblems?: AnalyzedProblem[];
}) {
  const [editContent, setEditContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  const [isEditingNumber, setIsEditingNumber] = useState(false);
  const [editNumberValue, setEditNumberValue] = useState('');
  const numberInputRef = React.useRef<HTMLInputElement>(null);
  const [isEditingScore, setIsEditingScore] = useState(false);
  const [editScoreValue, setEditScoreValue] = useState('');
  const scoreInputRef = React.useRef<HTMLInputElement>(null);

  // ── 크롭 이미지 드래그 선택 상태 ──
  const [isCropDragging, setIsCropDragging] = useState(false);
  const [cropDragStart, setCropDragStart] = useState<{ x: number; y: number } | null>(null);
  const [cropDragRect, setCropDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
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
    <div className="flex flex-col h-full bg-white">
      {/* ===== 헤더: "문항 내용" + ID ===== */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
        <span className="text-sm font-bold text-gray-900">문항 내용</span>
        {problem.problemId && (
          <span className="text-[10px] text-gray-400 font-mono">
            ID: {problem.problemId}
          </span>
        )}
      </div>

      {/* ===== 합치기 모드 배너 ===== */}
      {mergeMode && (
        <div className="px-5 py-3 bg-purple-50 border-b border-purple-200 flex items-center justify-between">
          <span className="text-sm font-medium text-purple-700">
            {mergeTargetId
              ? `문제 ${allProblems?.find(p => p.id === mergeTargetId)?.number}번과 합치시겠습니까?`
              : '합칠 문제를 클릭하세요'}
          </span>
          <div className="flex gap-2">
            {mergeTargetId && (
              <button type="button" onClick={onMergeProblems}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors">
                합치기 실행
              </button>
            )}
            <button type="button" onClick={onCancelMerge}
              className="px-3 py-1 rounded-lg text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors">
              취소
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* ===== 크롭 이미지 (원본 확인용 + 이미지 삽입 드래그) ===== */}
        <div className="px-5 pt-4 pb-3">
          <div
            className={`relative rounded-lg border bg-white overflow-hidden shadow-sm select-none ${
              insertImageMode
                ? 'border-blue-400 ring-2 ring-blue-300/50'
                : 'border-gray-200'
            }`}
            style={insertImageMode ? { cursor: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'32\'%3E%3Cline x1=\'16\' y1=\'0\' x2=\'16\' y2=\'32\' stroke=\'%23e11d48\' stroke-width=\'2\'/%3E%3Cline x1=\'0\' y1=\'16\' x2=\'32\' y2=\'16\' stroke=\'%23e11d48\' stroke-width=\'2\'/%3E%3Ccircle cx=\'16\' cy=\'16\' r=\'3\' fill=\'%23e11d48\'/%3E%3C/svg%3E") 16 16, crosshair' } : undefined}
            onMouseDown={(e) => {
              if (!insertImageMode) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              setIsCropDragging(true);
              setCropDragStart({ x, y });
              setCropDragRect({ x, y, w: 0, h: 0 });
              e.preventDefault();
            }}
            onMouseMove={(e) => {
              if (!isCropDragging || !cropDragStart) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const curX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
              const curY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
              setCropDragRect({
                x: Math.min(cropDragStart.x, curX),
                y: Math.min(cropDragStart.y, curY),
                w: Math.abs(curX - cropDragStart.x),
                h: Math.abs(curY - cropDragStart.y),
              });
            }}
            onMouseUp={(e) => {
              if (!isCropDragging || !cropDragRect) {
                setIsCropDragging(false);
                setCropDragStart(null);
                setCropDragRect(null);
                return;
              }
              setIsCropDragging(false);
              setCropDragStart(null);

              // 최소 크기 체크
              if (cropDragRect.w < 10 || cropDragRect.h < 10) {
                setCropDragRect(null);
                return;
              }

              // 0-1 비율로 변환
              const container = e.currentTarget;
              const cw = container.clientWidth;
              const ch = container.clientHeight;
              const normalizedRect = {
                x: cropDragRect.x / cw,
                y: cropDragRect.y / ch,
                w: cropDragRect.w / cw,
                h: cropDragRect.h / ch,
              };

              console.log('[CropDrag] 선택 영역 (0-1):', normalizedRect);
              onCropImageDragSelect?.(normalizedRect);
              setCropDragRect(null);
            }}
            onMouseLeave={() => {
              if (isCropDragging) {
                setIsCropDragging(false);
                setCropDragStart(null);
                setCropDragRect(null);
              }
            }}
          >
            {problem.cropImageBase64 ? (
              <img
                src={problem.cropImageBase64}
                alt={`문제 ${problem.number}`}
                className="w-full h-auto pointer-events-none"
                draggable={false}
              />
            ) : problem.bbox ? (
              <div className="pointer-events-none">
                <ProblemCropPreview
                  pdfUrl={pdfUrl}
                  pageIndex={problem.pageIndex}
                  bbox={problem.bbox}
                />
              </div>
            ) : null}

            {/* 드래그 선택 사각형 */}
            {insertImageMode && cropDragRect && cropDragRect.w > 3 && cropDragRect.h > 3 && (
              <div
                className="absolute border-2 border-dashed border-blue-500 bg-blue-400/20 pointer-events-none z-10"
                style={{
                  left: `${cropDragRect.x}px`,
                  top: `${cropDragRect.y}px`,
                  width: `${cropDragRect.w}px`,
                  height: `${cropDragRect.h}px`,
                }}
              >
                <span className="absolute bottom-0.5 right-1 text-[9px] bg-blue-600/90 text-white px-1 py-0.5 rounded">
                  📷 이미지 선택
                </span>
              </div>
            )}

            {/* 이미지 삽입 모드 안내 */}
            {insertImageMode && !isCropDragging && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none z-10">
                <div className="bg-blue-600 text-white px-3 py-1 rounded-full text-[10px] font-medium shadow-lg animate-pulse">
                  표/그래프 영역을 드래그하세요
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== 액션 버튼 바 ===== */}
        <div className="px-5 pb-3 flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => { if (isEditing) { onSave({ content: editContent }); setIsEditing(false); } else { onSave({}); } }}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50">
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            저장
          </button>
          <button type="button" onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
            삭제
          </button>
          <button type="button" onClick={onReanalyze} disabled={isReanalyzing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${isReanalyzing ? 'animate-spin' : ''}`} />
            다시 분석
          </button>
          <button type="button" onClick={() => setShowAdvancedModal(true)} disabled={isReanalyzing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-50">
            <Sparkles className="h-3.5 w-3.5" />
            고급 분석
          </button>
          <button type="button" onClick={onToggleInsertImage}
            disabled={!problem.bbox && !problem.cropImageBase64}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              insertImageMode
                ? 'border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                : 'border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}>
            <ImagePlus className={`h-3.5 w-3.5 ${insertImageMode ? 'text-white' : 'text-blue-600'}`} />
            📷 {insertImageMode ? '삽입 취소' : '이미지 삽입'}
          </button>
          {problem.insertedImages && problem.insertedImages.length > 0 && (
            <button type="button" onClick={onDeleteLastImage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 transition-colors shadow-sm">
              <Trash2 className="h-3.5 w-3.5" />
              이미지 삭제 ({problem.insertedImages.length})
            </button>
          )}
          {onStartMerge && (
            <button type="button" onClick={onStartMerge}
              disabled={mergeMode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-50">
              <Merge className="h-3.5 w-3.5" />
              합치기
            </button>
          )}
        </div>

        {/* ===== 문제 번호 (인라인 수정) ===== */}
        <div className="px-5 pb-3">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
            {isEditingNumber ? (
              <input
                ref={numberInputRef}
                type="number"
                value={editNumberValue}
                onChange={(e) => setEditNumberValue(e.target.value)}
                onBlur={() => {
                  const num = parseInt(editNumberValue, 10);
                  if (!isNaN(num) && num > 0) onSave({ number: num });
                  setIsEditingNumber(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const num = parseInt(editNumberValue, 10);
                    if (!isNaN(num) && num > 0) onSave({ number: num });
                    setIsEditingNumber(false);
                  } else if (e.key === 'Escape') {
                    setIsEditingNumber(false);
                  }
                }}
                className="w-10 h-8 rounded-full bg-emerald-500 text-white font-bold text-sm text-center flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                min={1}
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditNumberValue(String(problem.number || 1));
                  setIsEditingNumber(true);
                  setTimeout(() => numberInputRef.current?.select(), 50);
                }}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-white font-bold text-sm flex-shrink-0 cursor-pointer hover:bg-emerald-600 transition-colors"
              >
                {problem.number || '?'}
              </button>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <Pencil className="h-3 w-3 text-emerald-500" />
                <span className="text-xs font-medium text-gray-700">문제 번호</span>
                {/* 배점 인라인 수정 */}
                {isEditingScore ? (
                  <div className="ml-2 flex items-center gap-1">
                    <input
                      ref={scoreInputRef}
                      type="number"
                      step="0.1"
                      min="0"
                      value={editScoreValue}
                      onChange={(e) => setEditScoreValue(e.target.value)}
                      onBlur={() => {
                        const val = parseFloat(editScoreValue);
                        if (!isNaN(val) && val > 0) {
                          onSave({ score: val });
                        } else if (editScoreValue === '' || editScoreValue === '0') {
                          onSave({ score: undefined });
                        }
                        setIsEditingScore(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = parseFloat(editScoreValue);
                          if (!isNaN(val) && val > 0) {
                            onSave({ score: val });
                          } else if (editScoreValue === '' || editScoreValue === '0') {
                            onSave({ score: undefined });
                          }
                          setIsEditingScore(false);
                        } else if (e.key === 'Escape') {
                          setIsEditingScore(false);
                        }
                      }}
                      className="w-14 h-5 rounded border border-blue-300 bg-white px-1.5 text-xs text-blue-700 text-center font-medium focus:outline-none focus:ring-1 focus:ring-blue-400"
                      autoFocus
                    />
                    <span className="text-xs text-blue-500">점</span>
                  </div>
                ) : problem.score != null ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditScoreValue(String(problem.score ?? ''));
                      setIsEditingScore(true);
                      setTimeout(() => scoreInputRef.current?.select(), 50);
                    }}
                    className="ml-2 text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100 transition-colors cursor-pointer"
                    title="클릭해서 배점 수정"
                  >
                    {problem.score}점
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditScoreValue('');
                      setIsEditingScore(true);
                      setTimeout(() => scoreInputRef.current?.focus(), 50);
                    }}
                    className="ml-2 text-[10px] text-gray-400 border border-dashed border-gray-300 px-1.5 py-0.5 rounded hover:border-blue-400 hover:text-blue-500 transition-colors cursor-pointer"
                    title="배점 입력"
                  >
                    + 배점
                  </button>
                )}
              </div>
              <span className="text-[10px] text-gray-400">클릭해서 번호를 수정하세요</span>
            </div>
            <button type="button" onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* ===== 분석 상태 배너 ===== */}
        {problem.status === 'pending' && !isReanalyzing && (
          <div className="mx-5 mb-3 flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5">
            <Eye className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <div>
              <span className="text-xs text-blue-700 font-bold">문제 영역 감지됨</span>
              <p className="text-[10px] text-blue-500 mt-0.5">&quot;분석 시작&quot; 버튼을 눌러 OCR + AI 분석을 실행하세요</p>
            </div>
          </div>
        )}
        {(problem.status === 'analyzing' || isReanalyzing) && (
          <div className="mx-5 mb-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
            <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
            <span className="text-xs text-amber-700 font-bold">분석 중...</span>
          </div>
        )}
        {problem.status === 'error' && (
          <div className="mx-5 mb-3 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span className="text-xs text-red-700 font-bold">분석 실패 — &quot;다시 분석&quot;을 시도하세요</span>
          </div>
        )}

        {/* ===== OCR 불완전 경고 배지 (서술형·멀티라인 깨짐 감지, 수동 확인용) ===== */}
        {problem.content && problem.status !== 'pending' && problem.status !== 'error' && (() => {
          const t = (problem.content || '').trim();
          if (!t) return null;
          const beginCount = (t.match(/\\begin\{/g) || []).length;
          const endCount = (t.match(/\\end\{/g) || []).length;
          const startsWithEnd = /^\s*\\end\{/.test(t);
          const hasOrphanEnd = endCount > beginCount;
          const hasSeosulKeyword = /서답형|서술형|구하시오|구하여라|\[\s*(?:총\s*)?\d+\s*점\s*\]/.test(t);
          const suspiciouslyShort = t.length < 80 && hasSeosulKeyword;
          const isBroken = startsWithEnd || hasOrphanEnd || suspiciouslyShort;
          if (!isBroken) return null;
          return (
            <div className="mx-5 mb-3 flex items-center justify-between gap-2 rounded-lg bg-amber-50 border border-amber-300 px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <span className="text-xs text-amber-800 font-semibold truncate">
                  OCR 불완전 가능성 — 서술형·멀티라인 수식이 잘렸을 수 있습니다
                </span>
              </div>
              <button
                type="button"
                onClick={onReanalyze}
                disabled={isReanalyzing}
                className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isReanalyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                재OCR
              </button>
            </div>
          );
        })()}

        {/* ===== 자산화된 문제: OCR 텍스트 + 원본 이미지 + 선택지 ===== */}
        {problem.content && problem.status !== 'pending' && (() => {
          // OCR 텍스트 전처리
          if (problem.content.includes('displaystyle')) {
            console.log(`[DEBUG] 문제 ${problem.number} displaystyle 포함:`, JSON.stringify(problem.content.substring(0, 300)));
          }
          let displayContent = problem.content
            .replace(/\n{3,}/g, '\n\n').trim();
          // ★ $ 밖의 \displaystyle 수식을 $$...$$ 로 감싸기 (여러 줄 지원)
          // 괄호가 모두 닫힐 때까지 수집
          displayContent = displayContent.replace(
            /(?<!\$)\\displaystyle\s*([\s\S]*?)(?=\n\s*\n|\n\s*[①②③④⑤\d]+[.)]\s|$)/g,
            (_, expr) => `$$${expr.trim()}$$`
          );
          // ★ 이미 $ 안에 있는 \displaystyle은 단순 제거
          displayContent = displayContent.replace(/\\displaystyle\s*/g, '');

          return (
              <div className="px-5 pb-3">
                {/* ★ OCR 텍스트 (자산화된 본문) */}
                <MixedContentRenderer
                  content={displayContent}
                  className="text-[14px] text-gray-800 leading-[2] tracking-wide"
                />

                {/* 선택지 또는 소문제 렌더링 */}
                {problem.choices && problem.choices.length > 0 && (() => {
                  const subProblemPatterns = /구하시오|구하여라|구해라|서술하시오|설명하시오|증명하시오|나타내시오|보이시오|판단하시오|\[\s*\d+\s*점\s*\]/;
                  const isSubProblem = problem.choices.some(c => subProblemPatterns.test(c));

                  if (isSubProblem) {
                    return (
                      <div className="mt-3 space-y-2">
                        {problem.choices.map((choice, i) => {
                          let choiceText = choice.replace(/^[①②③④⑤]\s*/, '').replace(/^[1-5]\s*\)\s*/, '').replace(/^\(\s*\d+\s*\)\s*/, '').trim();
                          choiceText = choiceText.replace(/\\\((.+?)\\\)/gs, (_, inner: string) => `$${inner.trim()}$`);
                          choiceText = choiceText.replace(/\\\((.+)$/s, (_: string, inner: string) => `$${inner.trim()}$`);
                          choiceText = choiceText.replace(/^(.+?)\\\)(\s*)$/s, (_: string, inner: string) => `$${inner.trim()}$`);
                          choiceText = choiceText.replace(/\\\[(.+?)\\\]/gs, (_, inner: string) => `$$${inner.trim()}$$`);
                          if (!choiceText) return null;
                          return (
                            <div key={i} className="flex items-start gap-2 py-0.5">
                              <span className="flex-shrink-0 text-[14px] leading-[1.8] text-gray-700 font-medium">({i + 1})</span>
                              <MixedContentRenderer content={choiceText} className="text-[14px] leading-[1.8] text-gray-800" disableConditionBox />
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  // ★ 표 객관식: choiceHeaders 있으면 헤더 행 + 컬럼 분리 표시
                  const hasTableHeaders = problem.choiceHeaders && problem.choiceHeaders.length >= 2;
                  const colCount = hasTableHeaders ? problem.choiceHeaders!.length : 1;
                  return (
                    <div className="mt-3 space-y-1.5">
                      {/* 헤더 행 (표 객관식일 때만) */}
                      {hasTableHeaders && (
                        <div className="flex items-center gap-2 py-1 px-2 border-b border-gray-200">
                          <span className="flex-shrink-0 text-[14px] w-6"></span>
                          <div className="flex-1 grid gap-3" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
                            {problem.choiceHeaders!.map((h, hi) => (
                              <div key={hi} className="text-[14px] font-bold text-gray-700 text-center">
                                {h}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {problem.choices.map((choice, i) => {
                        const isCorrect = typeof problem.answer === 'number' && problem.answer === i + 1;
                        let choiceText = choice.replace(/^[①②③④⑤]\s*/, '').replace(/^[1-5]\s*\)\s*/, '').replace(/^\(\s*\d+\s*\)\s*/, '').trim();
                        choiceText = choiceText.replace(/\\\((.+?)\\\)/gs, (_, inner: string) => `$${inner.trim()}$`);
                        choiceText = choiceText.replace(/\\\((.+)$/s, (_: string, inner: string) => `$${inner.trim()}$`);
                        choiceText = choiceText.replace(/^(.+?)\\\)(\s*)$/s, (_: string, inner: string) => `$${inner.trim()}$`);
                        choiceText = choiceText.replace(/\\\[(.+?)\\\]/gs, (_, inner: string) => `$$${inner.trim()}$$`);
                        if (!choiceText.includes('$') && /[\\^_{}]/.test(choiceText) && !/[가-힣]/.test(choiceText)) {
                          choiceText = `$${choiceText.trim()}$`;
                        }
                        if (!choiceText) return null;
                        const numberLabel = circledNumbers[i + 1] || `${i + 1}`;

                        // ★ 표 객관식: ' | ' 구분자로 분리된 content 를 컬럼별 표시
                        //   ExamProblemRenderer·cloud/[examId] 페이지와 동일 컨벤션 (메모리 reference_table_choices.md)
                        if (hasTableHeaders) {
                          const cols = choiceText.split(/\s*\|\s*|\s+\/\s+/);
                          // 컬럼 수 부족하면 빈 칸 추가
                          while (cols.length < colCount) cols.push('');
                          return (
                            <div key={i} className={`flex items-center gap-2 py-1 px-2 rounded-md ${isCorrect ? 'bg-emerald-50 border border-emerald-200' : ''}`}>
                              <span className={`flex-shrink-0 text-[15px] leading-[1.6] w-6 ${isCorrect ? 'text-emerald-600 font-bold' : 'text-gray-500'}`}>
                                {numberLabel}
                              </span>
                              <div className="flex-1 grid gap-3" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
                                {cols.slice(0, colCount).map((col, ci) => (
                                  <div key={ci} className="text-center">
                                    <MixedContentRenderer
                                      content={col}
                                      className={`text-[14px] leading-[1.6] ${isCorrect ? 'text-emerald-700 font-medium' : 'text-gray-700'}`}
                                      disableConditionBox
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }

                        // 일반 객관식 (단일 컬럼)
                        return (
                          <div key={i} className={`flex items-start gap-2 py-1 px-2 rounded-md ${isCorrect ? 'bg-emerald-50 border border-emerald-200' : ''}`}>
                            <span className={`flex-shrink-0 text-[15px] leading-[1.6] ${isCorrect ? 'text-emerald-600 font-bold' : 'text-gray-500'}`}>
                              {numberLabel}
                            </span>
                            <MixedContentRenderer
                              content={choiceText}
                              className={`text-[14px] leading-[1.6] ${isCorrect ? 'text-emerald-700 font-medium' : 'text-gray-700'}`}
                              disableConditionBox
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
          );
        })()}

        {/* ===== 유형 분류 (505개 성취기준 + 5등급 난이도) ===== */}
        {(problem.typeCode || problem.achievementCode) && (
          <div className="px-5 pb-3">
            <div className="text-[10px] text-gray-500 mb-1.5 font-medium">분류 정보</div>
            <div className="space-y-2">
              {problem.achievementCode && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 w-14 flex-shrink-0">성취기준</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-200 font-mono">
                    {problem.achievementCode}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {problem.typeCode && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {problem.typeCode}
                  </span>
                )}
                {problem.typeName && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                    {problem.typeName}
                  </span>
                )}
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                  난이도: {diffCfg.label}
                </span>
              </div>
              {(problem.subject || problem.chapter) && (
                <div className="flex flex-wrap gap-1.5">
                  {problem.subject && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {problem.subject}
                    </span>
                  )}
                  {problem.chapter && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-200">
                      {problem.chapter}
                    </span>
                  )}
                  {problem.section && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-200">
                      {problem.section}
                    </span>
                  )}
                </div>
              )}
              {problem.cognitiveDomain && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 w-14 flex-shrink-0">인지영역</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    {{ CALCULATION: '계산', UNDERSTANDING: '이해', INFERENCE: '추론', PROBLEM_SOLVING: '문제해결' }[problem.cognitiveDomain] || problem.cognitiveDomain}
                  </span>
                </div>
              )}
              {problem.difficultyScores && (
                <div className="mt-1">
                  <div className="text-[10px] text-gray-500 mb-1">난이도 세부 채점 (총 {problem.difficultyScores.total}점)</div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { label: '개념수', value: problem.difficultyScores.concept_count, max: 3 },
                      { label: '단계수', value: problem.difficultyScores.step_count, max: 3 },
                      { label: '계산', value: problem.difficultyScores.calc_complexity, max: 3 },
                      { label: '사고력', value: problem.difficultyScores.thinking_level, max: 3 },
                      { label: '자료해석', value: problem.difficultyScores.data_interpretation, max: 2 },
                      { label: '함정', value: problem.difficultyScores.trap_misconception, max: 2 },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-1 text-[9px]">
                        <span className="text-gray-500 w-10">{item.label}</span>
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${(item.value / item.max) * 100}%` }}
                          />
                        </div>
                        <span className="text-gray-500 w-5 text-right">{item.value}/{item.max}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== 풀이 ===== */}
        {problem.solution && (
          <div className="px-5 pb-4">
            <div className="text-[10px] text-gray-500 mb-1.5 font-medium">풀이</div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <MixedContentRenderer
                content={problem.solution}
                className="text-[13px] text-gray-700 leading-[1.8]"
              />
            </div>
          </div>
        )}
      </div>

      {/* 고급 분석 모달 — 채팅형 반복 수정 (본문 + 선택지 통합 편집) */}
      {showAdvancedModal && problem && (
        <AdvancedAnalysisModal
          initialContent={problem.content || ''}
          initialChoices={problem.choices || []}
          imageBase64={problem.cropImageBase64}
          onApply={(finalContent, finalChoices) => {
            onSave({ content: finalContent, choices: finalChoices });
            setShowAdvancedModal(false);
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

// ★ OCR content에서 표/그래프 패턴을 찾아 이미지 마크다운으로 교체
function replaceTablePatternWithImage(
  content: string,
  imageMarkdown: string,
  cropRelativeRect?: { x: number; y: number; w: number; h: number }
): { newContent: string; replacedPattern: string; insertPosition: 'replace-table' | 'append' } {
  // ★ 면적 기반 판단: 드래그 영역이 크롭 이미지의 50% 이상이면 전체 교체
  const area = cropRelativeRect ? cropRelativeRect.w * cropRelativeRect.h : 0;

  if (area >= 0.5) {
    // === 전체 교체 모드 ===
    // 선택지(①~⑤)는 보존, 나머지 전체를 이미지로 교체
    const choicesRegex = /(?:^|\n)\s*(?:①|②|③|④|⑤|\(\d\)|\d\))[^\n]*/;
    const choicesIdx = content.search(choicesRegex);
    let textPart = content;
    let choicesPart = '';
    if (choicesIdx > 0) {
      textPart = content.substring(0, choicesIdx).trimEnd();
      choicesPart = content.substring(choicesIdx);
    }

    return {
      newContent: imageMarkdown + (choicesPart ? '\n\n' + choicesPart : '\n'),
      replacedPattern: textPart,
      insertPosition: 'replace-table',
    };
  }

  // === 표 패턴 감지 모드 ===
  const patterns: RegExp[] = [
    /\$?\$?\\begin\{tabular\}(?:\{[^}]*\})?[\s\S]*?\\end\{tabular\}\$?\$?/gi,
    /\$?\$?\\begin\{array\}(?:\{[^}]*\})?[\s\S]*?&[\s\S]*?\\end\{array\}\$?\$?/gi,
    /(?:^\|.+\|$\n?){2,}/gm,
  ];

  const matches: { match: string; index: number; length: number }[] = [];
  for (const regex of patterns) {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      const isDup = matches.some(
        ex => m!.index >= ex.index && m!.index < ex.index + ex.length
      );
      if (!isDup) {
        matches.push({ match: m[0], index: m.index, length: m[0].length });
      }
    }
  }

  if (matches.length === 0) {
    return {
      newContent: content.trimEnd() + '\n\n' + imageMarkdown + '\n',
      replacedPattern: '',
      insertPosition: 'append',
    };
  }

  const largest = matches.reduce((a, b) => a.length > b.length ? a : b);
  let startIdx = largest.index;
  let endIdx = largest.index + largest.length;

  // ★ k 제거 범위 확대 (50자) + 단독 줄의 k/\$k\$ 패턴
  const before = content.substring(Math.max(0, startIdx - 50), startIdx);
  const kMatch = before.match(/\n?\$?k\$?\s*$/i) || before.match(/\n?k\s*$/i);
  if (kMatch) {
    startIdx -= kMatch[0].length;
  }

  const newContent =
    content.substring(0, startIdx).trimEnd() +
    '\n\n' + imageMarkdown + '\n\n' +
    content.substring(endIdx).trimStart();

  return {
    newContent,
    replacedPattern: largest.match,
    insertPosition: 'replace-table',
  };
}

// ★ figure(graph/table) bbox 가 problem bbox 안에 들어가는지 면적 비율로 판정
function figureInsideProblem(
  figure: { x: number; y: number; w: number; h: number },
  problem: { x: number; y: number; w: number; h: number },
  threshold = 0.7
): boolean {
  const ix1 = Math.max(figure.x, problem.x);
  const iy1 = Math.max(figure.y, problem.y);
  const ix2 = Math.min(figure.x + figure.w, problem.x + problem.w);
  const iy2 = Math.min(figure.y + figure.h, problem.y + problem.h);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;
  const figureArea = figure.w * figure.h;
  if (figureArea <= 0) return false;
  return intersection / figureArea >= threshold;
}

// ★ YOLO 가 검출한 figure(graph/table) 들을 매칭된 problem 의 insertedImages 로 자동 삽입
async function autoCropFiguresForProblems(
  pdf: any,
  pageNum: number,
  problems: AnalyzedProblem[],
  figures: Array<{ x: number; y: number; w: number; h: number; class?: string }>
): Promise<AnalyzedProblem[]> {
  if (!figures || figures.length === 0) return problems;

  const matchesByProblemIdx = new Map<number, typeof figures>();
  for (const fig of figures) {
    for (let i = 0; i < problems.length; i++) {
      const p = problems[i];
      if (!p.bbox) continue;
      if (figureInsideProblem(fig, p.bbox)) {
        if (!matchesByProblemIdx.has(i)) matchesByProblemIdx.set(i, []);
        matchesByProblemIdx.get(i)!.push(fig);
        break;
      }
    }
  }

  if (matchesByProblemIdx.size === 0) return problems;

  let fullCanvas: HTMLCanvasElement;
  try {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 4.0 });
    fullCanvas = document.createElement('canvas');
    fullCanvas.width = viewport.width;
    fullCanvas.height = viewport.height;
    const fullCtx = fullCanvas.getContext('2d');
    if (!fullCtx) return problems;
    fullCtx.fillStyle = '#ffffff';
    fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
    await page.render({ canvasContext: fullCtx, viewport }).promise;
  } catch (err) {
    console.warn(`[FigureAutoCrop] 페이지 ${pageNum} 4x 렌더 실패:`, err);
    return problems;
  }

  const updated = problems.map((p, idx) => {
    const matches = matchesByProblemIdx.get(idx);
    if (!matches || !p.bbox) return p;

    const newImages: InsertedImage[] = [];
    let appendedContent = p.content || '';

    for (const fig of matches) {
      const sx = fig.x * fullCanvas.width;
      const sy = fig.y * fullCanvas.height;
      const sw = fig.w * fullCanvas.width;
      const sh = fig.h * fullCanvas.height;

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = Math.max(1, Math.round(sw));
      cropCanvas.height = Math.max(1, Math.round(sh));
      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) continue;
      cropCtx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height);
      const base64 = cropCanvas.toDataURL('image/png');

      const cropRelativeRect = {
        x: (fig.x - p.bbox.x) / p.bbox.w,
        y: (fig.y - p.bbox.y) / p.bbox.h,
        w: fig.w / p.bbox.w,
        h: fig.h / p.bbox.h,
      };

      const imageMarkdown = `![이미지](${base64})`;
      appendedContent = appendedContent ? `${appendedContent}\n\n${imageMarkdown}` : imageMarkdown;

      newImages.push({
        id: `auto-fig-p${pageNum}-${idx}-${newImages.length}-${Date.now()}`,
        base64,
        cropRelativeRect,
        insertPosition: 'append',
      });
    }

    return {
      ...p,
      content: appendedContent,
      insertedImages: [...(p.insertedImages || []), ...newImages],
    };
  });

  console.log(`[FigureAutoCrop] 페이지 ${pageNum}: ${matchesByProblemIdx.size}개 문제에 figure 자동 삽입 (총 ${figures.length}개 figure 중)`);
  return updated;
}

// ★ base64 이미지를 캔버스로 디코드 (분석 후 figure 크롭용)
async function loadImageToCanvas(base64: string): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => resolve(null);
    img.src = base64;
  });
}

// ★ 분석 직후: problem 고화질 크롭(이미 reanalyze-crop 에 보낸 base64)을 YOLO 에 한 번 더 호출
//    → graph/table 검출 → figure 크롭 → InsertedImage[] 반환
//    페이지 레벨(2x)보다 problem 크롭(2.5x)이 figure 비율이 훨씬 커서 검출률 ↑
async function detectFiguresFromProblemCropAfterAnalysis(
  problemBase64: string,
  problem: AnalyzedProblem,
  pageNum: number
): Promise<InsertedImage[]> {
  try {
    const res = await fetch('/api/workflow/detect-problems-yolo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // ★ figureOnly: problem 0건이어도 GPT-4o 폴백 X.
      body: JSON.stringify({ imageBase64: problemBase64, pageNumber: pageNum, figureOnly: true }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    let figures: Array<{ x: number; y: number; w: number; h: number; class?: string }> =
      (data.others || []).filter((o: any) => o?.class === 'graph' || o?.class === 'table');

    // ★ YOLO 0건 → GPT-4o Vision 으로 figure 검출 폴백 (graph/table 학습 부족 보완)
    //   per-problem 이미지라 GPT-4o 정확도 높을 가능성. YOLO 학습 누적 시 자연스럽게 호출 ↓
    if (figures.length === 0) {
      try {
        const gptRes = await fetch('/api/workflow/detect-figures-gpt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: problemBase64 }),
        });
        if (gptRes.ok) {
          const gptData = await gptRes.json();
          const gptFigures = (gptData.figures || []) as Array<{ type?: string; x: number; y: number; w: number; h: number }>;
          // ★ 디버그 — env 토글 상태 확인용
          console.log(`[FigureAfterAnalyze] 문제 ${problem.number} GPT 응답: source=${gptData.source}, figures=${gptFigures.length}, error=${gptData.error || 'none'}`);
          // ★ GPT-4o bbox 안전망 — 외곽 5% padding 추가 (그래프 끝 잘림 방지)
          //   prompt 에서 "여유있게" 요청해도 GPT 가 타이트하게 잡는 케이스 보정.
          const PADDING = 0.05;
          figures = gptFigures.map((f) => ({
            x: Math.max(0, f.x - PADDING),
            y: Math.max(0, f.y - PADDING),
            w: Math.min(1 - Math.max(0, f.x - PADDING), f.w + PADDING * 2),
            h: Math.min(1 - Math.max(0, f.y - PADDING), f.h + PADDING * 2),
            class: f.type === 'table' ? 'table' : 'graph',
          }));
          if (figures.length > 0) {
            console.log(`[FigureAfterAnalyze] 문제 ${problem.number}: YOLO 0건 → GPT-4o ${figures.length}개 figure`);
          }
        }
      } catch (gptErr) {
        console.warn(`[FigureAfterAnalyze] GPT 폴백 실패:`, gptErr);
      }
    }

    if (figures.length === 0) {
      console.log(`[FigureAfterAnalyze] 문제 ${problem.number}: figure 0개 (yolo + gpt 모두 0)`);
      return [];
    }

    const problemCanvas = await loadImageToCanvas(problemBase64);
    if (!problemCanvas) return [];

    const newImages: InsertedImage[] = [];
    for (const fig of figures) {
      const fx = fig.x * problemCanvas.width;
      const fy = fig.y * problemCanvas.height;
      const fw = fig.w * problemCanvas.width;
      const fh = fig.h * problemCanvas.height;

      const figCanvas = document.createElement('canvas');
      figCanvas.width = Math.max(1, Math.round(fw));
      figCanvas.height = Math.max(1, Math.round(fh));
      const figCtx = figCanvas.getContext('2d');
      if (!figCtx) continue;
      figCtx.drawImage(problemCanvas, fx, fy, fw, fh, 0, 0, figCanvas.width, figCanvas.height);
      const base64 = figCanvas.toDataURL('image/png');

      newImages.push({
        id: `auto-fig-analyze-${problem.id}-${newImages.length}-${Date.now()}`,
        base64,
        cropRelativeRect: { x: fig.x, y: fig.y, w: fig.w, h: fig.h },
        insertPosition: 'append',
      });
    }

    console.log(`[FigureAfterAnalyze] 문제 ${problem.number}: ${newImages.length}개 figure 자동 삽입 (source=${data.source})`);
    return newImages;
  } catch (err) {
    console.warn(`[FigureAfterAnalyze] 문제 ${problem.number} 실패:`, err);
    return [];
  }
}

// ★ 재분석 후 새 OCR 텍스트에 기존 삽입 이미지를 다시 적용
function reapplyInsertedImages(ocrContent: string, insertedImages: InsertedImage[]): string {
  if (!insertedImages || insertedImages.length === 0) return ocrContent;

  let result = ocrContent;
  for (const img of insertedImages) {
    const imgMarkdown = `![이미지](${img.base64})`;
    // ★ cropRelativeRect 전달하여 면적 기반 교체 재적용
    const replacement = replaceTablePatternWithImage(result, imgMarkdown, img.cropRelativeRect);
    result = replacement.newContent;
  }
  return result;
}

function extractProblemContent(rawContent: string, fallbackTypeName?: string, problemNumber?: number): { content: string; score?: number } {
  if (!rawContent || !rawContent.trim()) {
    return { content: fallbackTypeName || '' };
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
      // ★ 0) [서답형/서술형/논술형 N] 또는 [서답형 N-M] 라벨은 문제 시작 — 보존 우선!
      //    헤더 패턴 #3/#4 (\[.+?\]\[.+?\]) 가 [서답형 1][8점] 같은 라인을 잘못 헤더로 분류하던 사고 차단.
      //    "[서답형1]" 본문 표시 누락 (사용자 보고: 미분계수 도함수 증명 문제) — 이 fix 로 보존.
      //
      //    지원 모든 표기 (시험지마다 다양):
      //    [서답형 N] / <서답형 N> / 《서답형 N》 / 〈서답형 N〉 / 「서답형 N」 / (서답형 N)
      //    서답형1 / 서술형 1 / 논술형 N (괄호 없는 형태도)
      //    제외: "서답형 N문항" (헤더 안내) — \d+ 뒤 부정 lookahead (?!\s*문항) 로 차단.
      if (/^\s*[\[<《〈「(]?\s*(?:서답형|서술형|논술형|서\s*·\s*논술형)\s*\d+(?:[-]\d+)?(?!\s*문항)/.test(trimmed)) {
        foundQuestionStart = true;
        cleanedLines.push(line);
        continue;
      }
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
      // 8) 이미지 마크다운 (![](url)) — Mathpix CDN 이미지 보존
      if (/!\[.*?\]\(https?:\/\//.test(trimmed)) {
        foundQuestionStart = true;
        cleanedLines.push(line);
        continue;
      }
      // 짧은 비-헤더 텍스트 → 일단 스킵 (보통 헤더 일부)
      continue;
    }

    cleanedLines.push(line);
  }

  // ★ 문제 시작점을 못 찾았으면 헤더만 제거하고 전체 내용 사용
  if (!foundQuestionStart) {
    const headerFiltered = lines.filter(line => {
      const t = line.trim();
      if (!t) return true;
      return !HEADER_LINE_PATTERNS.some(p => p.test(t));
    });
    return { content: headerFiltered.join('\n').trim() || rawContent.trim() };
  }

  const cleaned = cleanedLines.join('\n').trim();

  // 2. 정리된 텍스트에서 문제 번호 이후 내용 추출
  let result = cleaned;
  if (result) {
    // 문제 번호("01 다음", "02 ", "1." 등) 패턴 이후 실제 내용
    const questionMatch = result.match(/^\s*\d{1,2}\s*(?:[.)번\]]|\s+(?=[가-힣]))([\s\S]*)/);
    if (questionMatch && questionMatch[1].trim()) {
      result = questionMatch[1].trim();
    } else if (problemNumber) {
      // ★ 딜리미터 없이 번호가 바로 붙는 폴백 (예: 문제 11 → OCR "112(x-4)" → strip "11" → "2(x-4)")
      // 기존 정규식이 실패했을 때만 동작 (딜리미터 있는 정상 케이스는 위에서 처리됨)
      const numStr = String(problemNumber);
      if (result.startsWith(numStr)) {
        const stripped = result.slice(numStr.length).trimStart();
        if (stripped) result = stripped;
      }
    }
  } else {
    result = fallbackTypeName || rawContent.trim();
  }

  // 3. 선택지 부분 제거 + 배점 추출
  // (1) 2\n(2) 3\n... 또는 ① 2\n② 3\n... 패턴을 본문에서 제거
  // 선택지는 choices 배열로 별도 표시됨
  const { content: finalContent, score } = removeChoicesFromContent(result);

  return { content: finalContent, score };
}

/** 본문에서 선택지 패턴을 제거하고 배점을 추출 */
function removeChoicesFromContent(text: string): { content: string; score?: number } {
  // 줄 단위로 분석하여 선택지 시작점 찾기
  const lines = text.split('\n');
  let choiceStartIdx = -1;

  // ★ CLAUDE.md 가드 — 서답형 소문제 보호:
  //    한국 수학 시험지 객관식 선택지는 항상 5개. 서답형 소문제는 (1)(2)(3) 또는 (1)(2)(3)(4) 까지만.
  //    또한 server 의 normalizeChoiceParens 가 이미 진짜 (1)~(5) 객관식을 ①~⑤ 로 변환했음.
  //    따라서 여기서 (1) 또는 1) 만으로 잘라내면 서답형 소문제를 유실. 보수적으로 (1)~(5) 5개 모두 있을 때만 선택지로 간주.
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // (1) 패턴 — (1)(2)(3)(4)(5) 5개 모두 있을 때만 선택지로 처리
    if (/^\(1\)\s/.test(trimmed)) {
      const remaining = lines.slice(i).join('\n');
      const hasFullObjectiveSet =
        /\(2\)/.test(remaining) && /\(3\)/.test(remaining) &&
        /\(4\)/.test(remaining) && /\(5\)/.test(remaining);
      if (hasFullObjectiveSet) {
        choiceStartIdx = i;
        break;
      }
      // (1)(2)(3) 또는 (1)(2)(3)(4) 만 있으면 서답형 소문제 → 보존 (자르지 않음)
    }
    // ① 패턴 — 객관식 마커 (이건 명확하므로 기존대로 ②③ 만 있어도 선택지)
    if (/^①\s/.test(trimmed)) {
      const remaining = lines.slice(i).join('\n');
      if (/②/.test(remaining) && /③/.test(remaining)) {
        choiceStartIdx = i;
        break;
      }
    }
    // 1) 패턴 — 마찬가지로 5개(1)~5)) 모두 있을 때만 선택지
    if (/^1\)\s/.test(trimmed)) {
      const remaining = lines.slice(i).join('\n');
      const hasFullObjectiveSet =
        /2\)/.test(remaining) && /3\)/.test(remaining) &&
        /4\)/.test(remaining) && /5\)/.test(remaining);
      if (hasFullObjectiveSet) {
        choiceStartIdx = i;
        break;
      }
    }
  }

  if (choiceStartIdx >= 0) {
    // 선택지 시작 전까지만 유지
    text = lines.slice(0, choiceStartIdx).join('\n').trim();
  }

  // ★ [배점] 추출 — CLAUDE.md 안전 가드 #2 우선순위:
  //    [총 N점] > [Ni점] 합산 (다수일 때) > 단일 [N점] > undefined
  //   기존엔 첫 매치만 잡아서 서답형에서 [총 6점] (1)..[3점] (2)..[3점] 본문이
  //   첫 [3점] 만 잡아 3점으로 들어가던 사고. 서버 saveEditedProblemsDirect 의 우선순위와 동기화.
  //   (\[(]\s*(?:총\s*)?\d+\s*[점졈졍]\s*[\]\)] 형식 — 대괄호·소괄호 양쪽 + 점/졈/졍 OCR 오타)
  let score: number | undefined;
  const totalMatch = text.match(/[\[(]\s*총\s*(\d+(?:\.\d+)?)\s*[점졈졍]\s*[\])]/);
  if (totalMatch) {
    score = parseFloat(totalMatch[1]);
  } else {
    const allMatches = Array.from(text.matchAll(/[\[(]\s*(\d+(?:\.\d+)?)\s*[점졈졍]\s*[\])]/g));
    if (allMatches.length > 1) {
      score = allMatches.reduce((s, mm) => s + parseFloat(mm[1]), 0);
    } else if (allMatches.length === 1) {
      score = parseFloat(allMatches[0][1]);
    }
  }
  // 모든 [총 N점] / [N점] / (N점) 패턴 본문에서 제거
  text = text
    .replace(/[\[(]\s*총\s*\d+(?:\.\d+)?\s*[점졈졍]\s*[\])]/g, '')
    .replace(/[\[(]\s*\d+(?:\.\d+)?\s*[점졈졍]\s*[\])]/g, '')
    .trim();

  return { content: text, score };
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function AnalyzeJobPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const jobId = params.jobId as string;
  const orgName = useOrganizationName('과사람');
  const urlBookGroupId = searchParams.get('bookGroupId');
  const urlSubjectArea = searchParams.get('subjectArea') as 'math' | 'science' | null;
  const urlScienceSubject = searchParams.get('scienceSubject');
  const urlCurriculumVersion = searchParams.get('curriculumVersion') as '2015' | '2022' | null;

  const [jobData, setJobData] = useState<JobData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null);
  // ★ 페이지 순서 정정 (2026-05-17) — PDF 스캔이 잘못된 순서일 때 사용자가 드래그로 재배열
  //   pageOrder[displayIndex - 1] = 원본 PDF page number
  //   기본값: [1, 2, ..., totalPdfPages]
  //   localStorage 저장: 'analyze-page-order-{jobId}' (새로고침 후 유지)
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [editingProblem, setEditingProblem] = useState<AnalyzedProblem | null>(null);
  const [totalPdfPages, setTotalPdfPages] = useState(1);

  // ★ 페이지별 회전 (2026-05-22) — key: PDF page number, value: 0|90|180|270
  //   PDF 로드 시 detectPageRotation 으로 자동 감지 (가로 페이지 → 90°),
  //   사용자가 회전 버튼을 누르면 90° 시계방향으로 누적.
  //   bbox 는 DB 에 항상 원본 좌표로 저장 — 렌더 시 rotateBbox 변환, 드래그 저장 시 unrotateBbox 역변환.
  const [pageRotations, setPageRotations] = useState<Map<number, 0 | 90 | 180 | 270>>(new Map());

  // ★ AutoCrop 주도 파이프라인 상태
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [autoCropProblems, setAutoCropProblems] = useState<Map<number, AnalyzedProblem[]>>(new Map());
  const [useAutoCropMode, setUseAutoCropMode] = useState(false); // AutoCrop 모드 on/off (기본 OFF → 수동 선택 우선)
  const [detectionMode, setDetectionMode] = useState<'ai' | 'pixel'>('ai'); // AI 감지 or 픽셀 감지
  const [aiDetectProgress, setAiDetectProgress] = useState<Map<number, 'loading' | 'done' | 'error'>>(new Map());
  // ★ 픽셀 자동감지 폴백 전용 상수 (UI 제거됨, setter 미사용 — 4a1ce88 참고)
  //   값을 바꿀 일 있으면 useState 로 다시 변환하고 setter 추가.
  const [columnMode] = useState<1 | 2>(2); // 1단/2단 모드 (기본 2단)
  const [cropSensitivity] = useState<number>(30); // 감도 (5~40, 수동 드래그와 동일)
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const blocksDetectedRef = useRef<Set<number>>(new Set()); // 이미 블록 감지된 페이지 추적
  const isPreloadingRef = useRef(false); // 동시 실행 차단
  const ocrBboxDoneRef = useRef(false); // Mathpix OCR bbox 감지 완료 여부

  // ★ 이미지 삽입 모드 (표/그래프 영역을 PDF에서 크롭하여 content에 삽입)
  const [insertImageMode, setInsertImageMode] = useState(false);
  const [isOcrBboxLoading, setIsOcrBboxLoading] = useState(false);

  // ★ 메모리 누수 방지 (2026-05-23) — 페이지 unmount 시 PDF.js 캐시 해제.
  //   pdfDocCache 가 module-level Map 이라 SPA 라우팅으로 떠나도 자동 정리 안 됨 →
  //   여러 시험지 분석 페이지 왕복 시 PDFDocumentProxy 가 누적되어 100MB+ 누수 가능.
  useEffect(() => {
    return () => {
      import('@/lib/pdf-viewer').then(({ clearPdfCache }) => clearPdfCache()).catch(() => {});
    };
  }, []);

  // detectionMode, columnMode, cropSensitivity 변경 시 기존 감지 결과 초기화 → 재감지 트리거
  useEffect(() => {
    blocksDetectedRef.current.clear();
    isPreloadingRef.current = false;
    setAutoCropProblems(new Map());
    setAiDetectProgress(new Map());
    setSelectedProblemId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectionMode, columnMode, cropSensitivity]);

  // ★ Mathpix OCR → groupLinesIntoQuestions bbox 자동 감지
  // jobId가 있으면 서버에서 OCR 실행 → bbox 반환 → autoCropProblems 채움
  // ★ 자동 시작 비활성화됨 (사용자 요청: 수동 모드).
  //   "OCR 자동 감지" 버튼(아래 UI에 추가)이나 향후 수동 트리거로 실행 가능.
  const runMathpixOcrBboxDetection = useCallback(async () => {
    if (!jobId || ocrBboxDoneRef.current) return;
    ocrBboxDoneRef.current = true;

    setIsOcrBboxLoading(true);

    try {
      console.log('[OcrBbox] Mathpix OCR bbox 감지 시작 (수동 트리거)...');
      const res = await fetch('/api/workflow/detect-from-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });

      if (!res.ok) return;

      const data = await res.json() as {
        success: boolean;
        questions: Array<{
          questionNumber: number;
          pageIndex: number;
          bbox: { x: number; y: number; w: number; h: number };
          contentMmd: string;
          choices: string[];
          hasFigure: boolean;
          figureBbox: { x: number; y: number; w: number; h: number } | null;
        }>;
        count: number;
      };

      if (!data.success || !data.questions || data.questions.length === 0) {
        console.log('[OcrBbox] 감지된 문제 없음 — 수동 모드 유지');
        return;
      }

      console.log(`[OcrBbox] ${data.count}개 문제 bbox 수신 — autoCropProblems 채움`);

      const byPage = new Map<number, typeof data.questions>();
      for (const q of data.questions) {
        if (!byPage.has(q.pageIndex)) byPage.set(q.pageIndex, []);
        byPage.get(q.pageIndex)!.push(q);
      }

      const newProblems = new Map<number, AnalyzedProblem[]>();
      for (const [pageIdx, qs] of byPage.entries()) {
        const sorted = [...qs].sort((a, b) => a.questionNumber - b.questionNumber);
        newProblems.set(pageIdx, sorted.map(q => ({
          id: `ocr-p${q.pageIndex}-q${q.questionNumber}`,
          number: q.questionNumber,
          content: q.contentMmd || '',
          choices: q.choices || [],
          answer: '',
          solution: '',
          difficulty: 3 as const,
          typeCode: '',
          typeName: '',
          confidence: 0,
          status: 'pending' as const,
          pageIndex: q.pageIndex,
          bbox: q.bbox,
        })));
        blocksDetectedRef.current.add(pageIdx);
      }

      setAutoCropProblems(newProblems);
      setUseAutoCropMode(true);

      const firstPage = [...newProblems.keys()].sort((a, b) => a - b)[0];
      if (firstPage !== undefined) {
        const firstProblem = newProblems.get(firstPage)?.[0];
        if (firstProblem) setSelectedProblemId(firstProblem.id);
      }

      console.log('[OcrBbox] bbox 감지 완료 ✓');
    } catch (err) {
      console.warn('[OcrBbox] OCR bbox 감지 실패 — 수동 모드 유지:', err);
    } finally {
      setIsOcrBboxLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

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

  // ★ PDF 로드 후 페이지별 자동 회전 감지 (가로 페이지 → 90°). 사용자 토글은 보존.
  useEffect(() => {
    if (!jobData?.pdfUrl || totalPdfPages <= 0) return;

    let cancelled = false;

    const detectAll = async () => {
      try {
        const { loadPdfDocument, detectPageRotation } = await import('@/lib/pdf-viewer');
        const pdf = await loadPdfDocument(jobData.pdfUrl!);
        if (cancelled) return;

        const detected = new Map<number, 0 | 90>();
        for (let pageNum = 1; pageNum <= totalPdfPages; pageNum++) {
          if (cancelled) return;
          const rot = await detectPageRotation(pdf, pageNum);
          if (rot !== 0) detected.set(pageNum, rot);
        }

        if (cancelled || detected.size === 0) return;

        setPageRotations((prev) => {
          const next = new Map(prev);
          let changed = false;
          for (const [pageNum, rot] of detected.entries()) {
            // 이미 사용자가 설정한 회전은 덮어쓰지 않음
            if (!next.has(pageNum)) {
              next.set(pageNum, rot);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      } catch (err) {
        console.warn('[PDF Rotation] 자동 감지 실패:', err);
      }
    };

    detectAll();
    return () => { cancelled = true; };
  }, [jobData?.pdfUrl, totalPdfPages]);

  // ★ 회전 버튼 핸들러 — 90° 시계방향 누적 (0 → 90 → 180 → 270 → 0)
  const handleRotatePage = useCallback((pdfPageNumber: number) => {
    setPageRotations((prev) => {
      const next = new Map(prev);
      const current = next.get(pdfPageNumber) ?? 0;
      const newRot = ((current + 90) % 360) as 0 | 90 | 180 | 270;
      next.set(pdfPageNumber, newRot);
      return next;
    });
  }, []);

  // ★ pageOrder 초기화 + localStorage 복원 (2026-05-17)
  //   totalPdfPages 변경 시 또는 jobId 변경 시
  useEffect(() => {
    if (totalPdfPages <= 0) return;
    const defaultOrder = Array.from({ length: totalPdfPages }, (_, i) => i + 1);
    if (typeof window === 'undefined') {
      setPageOrder(defaultOrder);
      return;
    }
    try {
      const saved = localStorage.getItem(`analyze-page-order-${jobId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as number[];
        // 검증: 길이 일치 + 모든 페이지 번호가 1..totalPdfPages 범위 + 중복 없음
        if (
          Array.isArray(parsed) &&
          parsed.length === totalPdfPages &&
          parsed.every((n) => Number.isInteger(n) && n >= 1 && n <= totalPdfPages) &&
          new Set(parsed).size === totalPdfPages
        ) {
          setPageOrder(parsed);
          return;
        }
      }
    } catch {
      // 무시 — 기본 순서로 폴백
    }
    setPageOrder(defaultOrder);
  }, [totalPdfPages, jobId]);

  // pageOrder 변경 시 localStorage 저장
  const handlePageReorder = useCallback(
    (newOrder: number[]) => {
      setPageOrder(newOrder);
      if (typeof window !== 'undefined') {
        try {
          // 기본 순서면 키 제거 (저장소 정리)
          const isDefault = newOrder.every((n, idx) => n === idx + 1);
          if (isDefault) {
            localStorage.removeItem(`analyze-page-order-${jobId}`);
          } else {
            localStorage.setItem(`analyze-page-order-${jobId}`, JSON.stringify(newOrder));
          }
        } catch {
          // localStorage 가득 등 — 무시
        }
      }
    },
    [jobId]
  );

  // displayNumber ↔ pdfPageNumber 변환 헬퍼
  const displayToPdfPage = useCallback(
    (displayNum: number): number => {
      if (pageOrder.length === 0) return displayNum;
      return pageOrder[displayNum - 1] ?? displayNum;
    },
    [pageOrder]
  );
  const pdfToDisplayPage = useCallback(
    (pdfPageNum: number): number => {
      if (pageOrder.length === 0) return pdfPageNum;
      const idx = pageOrder.indexOf(pdfPageNum);
      return idx === -1 ? pdfPageNum : idx + 1;
    },
    [pageOrder]
  );

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

            // ★ 흰색 배경 먼저 칠하기 (PDF 투명 배경 → 검은색 방지)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

            const renderTask = page.render({ canvasContext: ctx, viewport });
            await renderTask.promise;
            if (cancelled) break;

            let blocks: { x: number; y: number; w: number; h: number }[];
            let figures: Array<{ x: number; y: number; w: number; h: number; class?: string }> = [];

            if (detectionMode === 'ai') {
              // ★ AI Vision 감지 — YOLO 우선 (GPT-4o 폴백 내장)
              setAiDetectProgress(prev => new Map(prev).set(pageNum - 1, 'loading'));
              try {
                const imageBase64 = offscreenCanvas.toDataURL('image/jpeg', 0.85);

                // 이전 페이지들의 감지 문제 수를 합산하여 예상 시작 번호 계산
                let expectedStartNumber: number | undefined;
                if (pageNum > 1) {
                  let totalPrev = 0;
                  for (let pp = 0; pp < pageNum - 1; pp++) {
                    const prevProblems = autoCropProblems.get(pp);
                    if (prevProblems) totalPrev += prevProblems.length;
                  }
                  if (totalPrev > 0) expectedStartNumber = totalPrev + 1;
                }

                const res = await fetch('/api/workflow/detect-problems-yolo', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ imageBase64, pageNumber: pageNum, expectedStartNumber }),
                });
                if (res.ok) {
                  const data = await res.json();
                  const rawBlocks: CropRect[] = data.problems || [];
                  // ★ YOLO 가 검출한 graph/table figure 들 (자동 크롭 대상)
                  figures = (data.others || [])
                    .filter((o: any) => o?.class === 'graph' || o?.class === 'table')
                    .map((o: any) => ({ x: o.x, y: o.y, w: o.w, h: o.h, class: o.class }));
                  console.log(`[AI Detect] 페이지 ${pageNum}: ${rawBlocks.length}개 문제 감지 (raw), ${figures.length}개 figure 감지 (source=${data.source || 'unknown'})`);

                  // ★ Hybrid: AI bbox를 픽셀 분석으로 정제
                  // AI가 문제 번호 기반으로 정확히 감지하므로 헤더 클리핑은 최소화
                  // (시험지 표 헤더 영역만 제거, 안내문은 AI가 알아서 제외)
                  if (rawBlocks.length > 0) {
                    blocks = refineAiBboxes(offscreenCanvas, rawBlocks, {
                      headerRatio: pageNum === 1 ? 0.12 : 0.04,
                    });
                    console.log(`[AI Detect] 페이지 ${pageNum}: ${rawBlocks.length}개 → ${blocks.length}개 정제 완료`);
                  } else {
                    blocks = rawBlocks;
                  }

                  setAiDetectProgress(prev => new Map(prev).set(pageNum - 1, 'done'));
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

              // ★ YOLO 가 검출한 figure 가 있으면 problem 안쪽으로 매칭 → 4x 크롭 → insertedImages 자동 삽입
              let problemsWithFigures: AnalyzedProblem[] = newProblems;
              if (figures.length > 0) {
                try {
                  problemsWithFigures = await autoCropFiguresForProblems(pdf, pageNum, newProblems, figures);
                } catch (figErr) {
                  console.warn(`[FigureAutoCrop] 페이지 ${pageNum} 자동 figure 크롭 실패 (problem 만 유지):`, figErr);
                }
              }

              setAutoCropProblems(prev => {
                const next = new Map(prev);
                next.set(pageIndex, problemsWithFigures);
                return next;
              });

              // 첫 번째 감지된 문제 자동 선택 (아직 선택된 문제가 없을 때)
              if (problemsWithFigures.length > 0 && pageNum === currentPage) {
                setSelectedProblemId(prev => prev || problemsWithFigures[0].id);
              }
            }
          } catch (pageErr: any) {
            if (pageErr?.name === 'RenderingCancelledException') continue;
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

  // ★ 자동 임시저장 (localStorage) — 분석/편집 데이터 손실 방지
  //   브라우저 닫기·재부팅 후에도 같은 jobId 로 페이지 열면 복원됨.
  //   base64 는 size 제한으로 제외 (텍스트·분류·답·점수 등 핵심 데이터만).
  //   자산화 성공 후 자동 삭제.
  const draftKey = jobId ? `draft_${jobId}` : null;
  const draftLoadedRef = useRef(false);

  // 자동 복원 — 페이지 로드 시 1회만
  useEffect(() => {
    if (!draftKey || draftLoadedRef.current) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) {
        draftLoadedRef.current = true;
        return;
      }
      const data = JSON.parse(raw) as Array<[number, AnalyzedProblem[]]>;
      if (Array.isArray(data) && data.length > 0) {
        const restored = new Map(data);
        setAutoCropProblems(restored);
        setUseAutoCropMode(true);
        const totalProblems = data.reduce((sum, [, probs]) => sum + probs.length, 0);
        console.log(`[Draft] 임시저장 복원: ${restored.size}페이지, ${totalProblems}문제`);
      }
      draftLoadedRef.current = true;
    } catch (e) {
      console.warn('[Draft] 복원 실패:', e);
      draftLoadedRef.current = true;
    }
  }, [draftKey]);

  // 자동 저장 — autoCropProblems 변경 시 debounced 2초
  useEffect(() => {
    if (!draftKey || !draftLoadedRef.current) return;
    if (autoCropProblems.size === 0) return;
    const timer = setTimeout(() => {
      try {
        // base64 제거하여 size 절감 (텍스트·메타만 유지)
        const stripped = Array.from(autoCropProblems.entries()).map(([page, problems]) => [
          page,
          problems.map(p => ({
            ...p,
            cropImageBase64: undefined, // 큰 데이터 제거
            insertedImages: (p.insertedImages || []).map(img => ({
              ...img,
              base64: '', // 비움 (복원 시 사용자 재삽입 필요)
            })),
          })),
        ]) as Array<[number, AnalyzedProblem[]]>;
        localStorage.setItem(draftKey, JSON.stringify(stripped));
      } catch (e) {
        // QuotaExceeded 등 — 조용히 실패 (분석 흐름 영향 X)
        console.warn('[Draft] 저장 실패:', e instanceof Error ? e.message : e);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [autoCropProblems, draftKey]);

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
        let extractedScore: number | undefined;
        if (prevProblem?.status === 'edited') {
          contentSource = prevProblem.content;
          extractedScore = prevProblem.score;
        } else {
          const rawContent = result.contentWithMath || result.originalText || '';
          const extracted = extractProblemContent(rawContent, result.classification?.typeName, idx + 1);
          contentSource = extracted.content;
          extractedScore = extracted.score;
          // ★ 디버그: content 변환 전후 비교
          if (rawContent.includes('array') || rawContent.includes('tabular') || rawContent.includes('hline')) {
            console.log(`[buildJobData] 표 포함 문제 #${idx}:`, {
              rawContentPreview: rawContent.substring(0, 400),
              extractedPreview: contentSource.substring(0, 400),
            });
          }
        }

        const isEdited = prevProblem?.status === 'edited';

        const serverSolution = result.solution?.steps?.map((s: any) => {
          const desc = (s.description || '').trim();
          const latex = (s.latex || '').trim();
          if (desc && latex) return `${desc}\n$$${latex}$$`;
          if (latex) return `$$${latex}$$`;
        }).filter(Boolean).join('\n') || '';


        problems.push({
          id: `problem-${idx}`,
          problemId: result.problemId,
          number: isEdited ? (prevProblem.number ?? idx + 1) : (idx + 1),
          content: isEdited ? prevProblem.content : contentSource,
          choices: isEdited ? prevProblem.choices : (result.choices || result.answer_json?.choices || []),
          answer: isEdited ? prevProblem.answer : (result.solution?.finalAnswer || result.answer_json?.correct_answer || ''),
          solution: isEdited ? prevProblem.solution : serverSolution,
          difficulty: isEdited ? (prevProblem.difficulty ?? (result.classification?.difficulty || 3)) : ((result.classification?.difficulty || 3) as 1|2|3|4|5),
          typeCode: isEdited ? (prevProblem.typeCode || result.classification?.typeCode || '') : (result.classification?.typeCode || ''),
          typeName: isEdited ? (prevProblem.typeName || result.classification?.typeName || '') : (result.classification?.typeName || ''),
          confidence: result.classification?.confidence || 0.5,
          status: isEdited ? 'edited' : 'completed',
          graphData: prevProblem?.graphData ?? undefined,
          pageIndex: result.pageIndex ?? 0,
          bbox: result.bbox || undefined,
          insertedImages: prevProblem?.insertedImages,  // ★ 삽입 이미지 보존
          score: isEdited ? (prevProblem.score ?? extractedScore) : extractedScore,  // ★ 배점 보존
          // ★ Phase C-1b: cloud-flow가 채운 pitfalls 보존 — 저장 시 saveEditedProblemsDirect로 전달
          pitfalls: isEdited ? (prevProblem.pitfalls || result.classification?.pitfalls) : result.classification?.pitfalls,
          // ★ 과학 자산화 (2026-05-19): Gemini OpenCV 자동 크롭 figure 후보 보존
          //   AnalyzeProblemEditModal "이미지 후보" 픽커가 사용. edit 후에도 보존.
          cvFigures: isEdited ? (prevProblem.cvFigures || result._scienceCvFigures) : result._scienceCvFigures,
          // ★ 그림 객관식: 선택지별 이미지 (edited 상태에서만 의미 있음 — 1차 분석 후 사용자 설정)
          choiceImages: prevProblem?.choiceImages,
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
      bookGroupId: job.bookGroupId || prevData?.bookGroupId || urlBookGroupId || null,  // ★ 북그룹 ID 보존 (URL 파라미터 폴백)
      subjectArea: job.subjectArea || prevData?.subjectArea || urlSubjectArea || 'math',
      scienceSubject: job.scienceSubject || prevData?.scienceSubject || urlScienceSubject || undefined,
      curriculumVersion: job.curriculumVersion || prevData?.curriculumVersion || urlCurriculumVersion || '2022',
      imagePipeline: job._imagePipeline || prevData?.imagePipeline || null,
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
        const { job, results, pdfUrl, savedToDb, imagePipeline, examId: autoExamId } = data;
        // 이미지 파이프라인 결과를 job 객체에 주입 (buildJobData에서 사용)
        if (imagePipeline) job._imagePipeline = imagePipeline;

        // ★ 디버그: 서버에서 받은 데이터 확인
        if (results && results.length > 0) {
          const first = results[0];
          console.log(`[Page] 서버 results[0]:`, {
            hasContent: !!first.contentWithMath,
            contentLen: first.contentWithMath?.length,
            contentPreview: first.contentWithMath?.substring(0, 500),
            hasSolution: !!first.solution,
            solutionSteps: first.solution?.steps?.length,
            solutionPreview: JSON.stringify(first.solution)?.substring(0, 300),
            hasChoices: !!first.choices,
            choicesLen: first.choices?.length,
          });
          // ★ 조립제법 표 디버그: array/tabular 블록이 있는지 확인
          if (first.contentWithMath?.includes('begin{array}') || first.contentWithMath?.includes('begin{tabular}')) {
            console.log('[Page] ★ 표 블록 발견:', first.contentWithMath);
          }
        } else {
          console.warn(`[Page] 서버에서 results 없음! results=${JSON.stringify(results)?.substring(0, 100)}`);
        }

        if (cancelled) return;

        // 서버에서 이미 자산화 완료된 경우 (자동 자산화)
        if (savedToDb) {
          setIsSaved(true);
          // ★ 자동 자산화로 만들어진 examId도 보존 (수동 자산화 경로와 동일하게 "확인하기" 시 직행)
          if (autoExamId) setSavedExamId(autoExamId);
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

    // 탭 복귀 시 즉시 폴링 (비활성 탭에서 setInterval 제한 보완)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        fetchAndUpdate();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [jobId, buildJobData]);

  // 자산화: 분석 결과를 DB에 저장
  const [savedProblemCount, setSavedProblemCount] = useState(0);
  // ★ 자산화 후 받은 examId — "클라우드에서 확인하기" 시 해당 시험지로 직행하기 위해 보관
  const [savedExamId, setSavedExamId] = useState<string | null>(null);
  const handleSaveAll = useCallback(async () => {
    if (!jobData || isSavingAll) return;

    setIsSavingAll(true);
    // 서버 프록시 경유 업로드 (service role로 RLS 우회, 본문도 한 번에 1장)
    const uploadBase64ToStorage = async (
      base64: string,
      storagePath: string,
      contentType = 'image/jpeg',
    ): Promise<string | null> => {
      try {
        const res = await fetch('/api/storage/upload-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, path: storagePath, contentType }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          console.warn('[Storage upload]', storagePath, res.status, txt.slice(0, 150));
          return null;
        }
        const data = await res.json();
        return data.path || null;
      } catch (e) {
        console.warn('[Storage upload] 예외', storagePath, e);
        return null;
      }
    };
    try {
      // ★ 수정된 문제 데이터(난이도 등) + 크롭 이미지 + bbox를 수집하여 PUT 요청에 포함
      const editedProblems: Array<{ number: number; difficulty?: number; typeCode?: string; typeName?: string; cognitiveDomain?: string; content?: string; answer?: string | number; cropImagePath?: string; cropImageBase64?: string; solution?: string; choices?: string[]; score?: number; bbox?: { x: number; y: number; w: number; h: number }; pageIndex?: number; figureBboxes?: Array<{ x: number; y: number; w: number; h: number }>; pitfalls?: Array<{ code: string; confidence: number; reason?: string }> }> = [];
      const pagesWithProblems = new Set<number>(); // YOLO 학습용 페이지 이미지 수집
      let globalProblemNumber = 0; // ★ 전역 순번 (페이지별 리셋 방지)
      for (const [pageIdx, pageProbs] of autoCropProblems.entries()) {
        for (const p of pageProbs) {
          if (p.status === 'edited' || p.status === 'completed') {
            globalProblemNumber++;
            pagesWithProblems.add(pageIdx);
            // ★ 크롭 이미지: 캐시된 base64 또는 즉석 생성
            let cropImage = p.cropImageBase64;
            if (!cropImage && p.bbox && p.bbox.w > 0 && p.bbox.h > 0) {
              try {
                cropImage = await getCropImageBase64(p) || undefined;
              } catch { /* 무시 */ }
            }
            // 크롭 이미지를 Storage로 직접 업로드 (Vercel 413 회피)
            let cropImagePath: string | undefined;
            if (cropImage) {
              const path = `problem-crops/${jobId}/problem-${globalProblemNumber}.png`;
              const uploaded = await uploadBase64ToStorage(cropImage, path, 'image/png');
              if (uploaded) cropImagePath = uploaded;
            }
            // ★ figure 학습 데이터 — insertedImages 의 좌표만 추출 (base64 X)
            //   YOLO graph/table 클래스 학습 데이터 누적용. 매 자산화마다 graph 라벨 누적 → 추후 재학습.
            const figureBboxes = (p.insertedImages || []).map(img => ({
              x: img.cropRelativeRect.x,
              y: img.cropRelativeRect.y,
              w: img.cropRelativeRect.w,
              h: img.cropRelativeRect.h,
            }));
            editedProblems.push({
              number: globalProblemNumber, // ★ 전역 순번 사용 (p.number는 페이지별로 리셋되어 크롭 파일 충돌)
              difficulty: p.difficulty,
              typeCode: p.typeCode,
              typeName: p.typeName, // ★ 카드 표시용 단원 경로
              cognitiveDomain: p.cognitiveDomain,
              content: p.content,
              answer: p.answer,
              solution: p.solution,
              choices: p.choices,
              score: p.score, // ★ 1차 OCR에서 추출한 원 배점
              // cropImagePath 업로드 성공 시 base64는 생략 (body 크기 절감)
              ...(cropImagePath
                ? { cropImagePath }
                : (cropImage ? { cropImageBase64: cropImage } : {})),
              bbox: p.bbox,       // ★ YOLO 학습 데이터용 bbox (problem 클래스)
              pageIndex: p.pageIndex, // ★ 페이지 인덱스 (0-based)
              ...(figureBboxes.length > 0 ? { figureBboxes } : {}), // ★ graph 클래스 학습 데이터
              ...(p.pitfalls && p.pitfalls.length > 0 ? { pitfalls: p.pitfalls } : {}), // ★ Phase C-1b: 함정 자동 태깅
              // ★ 그림 객관식 (2026-05-19): 선택지별 이미지 (base64 또는 URL)
              //   saveEditedProblemsDirect 가 data:image base64 → Storage 업로드 + answer_json.choiceImages 박힘.
              ...(p.choiceImages && p.choiceImages.some((img: string | null) => !!img)
                ? { choiceImages: p.choiceImages }
                : {}),
            });
          }
        }
      }

      // ★ YOLO 학습 데이터: 문제가 있는 페이지들의 이미지 캡처 + Storage 직접 업로드
      // (Vercel serverless body 4.5MB 제한 회피를 위해 base64를 PUT 본문에 싣지 않음)
      const pageImages: Array<{ pageNumber: number; storagePath?: string; imageBase64?: string; width: number; height: number }> = [];
      if (pagesWithProblems.size > 0) {
        try {
          const pdfJs = await import('pdfjs-dist');
          const pdfUrl = jobData.pdfUrl;
          if (pdfUrl) {
            const fullUrl = pdfUrl.startsWith('/') ? `${window.location.origin}${pdfUrl}` : pdfUrl;
            const loadingTask = pdfJs.getDocument(fullUrl);
            const pdf = await loadingTask.promise;
            for (const pageIdx of pagesWithProblems) {
              try {
                const pageNum = pageIdx + 1; // 1-based
                const page = await pdf.getPage(pageNum);
                // scale 2.0 → 1.5 + JPEG(0.85)로 크기 축소 (YOLO 학습에는 충분)
                const viewport = page.getViewport({ scale: 1.5 });
                const offCanvas = document.createElement('canvas');
                offCanvas.width = viewport.width;
                offCanvas.height = viewport.height;
                const ctx = offCanvas.getContext('2d');
                if (ctx) {
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);
                  await page.render({ canvasContext: ctx, viewport }).promise;
                  const dataUrl = offCanvas.toDataURL('image/jpeg', 0.85);
                  const storagePath = `page-images/${jobId}/page-${pageNum}.jpg`;
                  const uploadedPath = await uploadBase64ToStorage(dataUrl, storagePath, 'image/jpeg');
                  pageImages.push({
                    pageNumber: pageNum,
                    ...(uploadedPath ? { storagePath: uploadedPath } : { imageBase64: dataUrl }),
                    width: viewport.width,
                    height: viewport.height,
                  });
                }
              } catch (pgErr) {
                console.warn(`[자산화] 페이지 ${pageIdx + 1} 이미지 캡처 실패:`, pgErr);
              }
            }
            pdf.destroy();
          }
        } catch (pdfErr) {
          console.warn('[자산화] YOLO 학습용 페이지 이미지 캡처 실패 (무시):', pdfErr);
        }
      }
      console.log(`[자산화] YOLO 학습 데이터: ${pageImages.length}페이지 이미지, ${editedProblems.filter(p => p.bbox).length}개 bbox`);

      const effectiveBookGroupId = jobData.bookGroupId || urlBookGroupId;
      console.log(`[자산화] bookGroupId 흐름: jobData=${jobData.bookGroupId}, url=${urlBookGroupId}, final=${effectiveBookGroupId}`);

      const res = await fetch('/api/workflow/upload', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          editedProblems,
          bookGroupId: effectiveBookGroupId,
          pageImages,
          // ★ 원본 한글 파일명 전달 (Storage 복원 경로의 sanitized 이름 대체)
          fileName: jobData?.fileName,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const savedCount = data.problemCount || 0;
        const expectedCount = editedProblems.length;
        setIsSaved(true);
        setSavedProblemCount(savedCount);
        // ★ 자산화로 만든 examId 보존 → "확인하기" 시 해당 시험지로 직행
        if (data.examId) setSavedExamId(data.examId);

        // ★ 자산화 성공 (examId 있고 일부라도 저장) → 임시저장 정리
        if (data.examId && savedCount > 0 && draftKey) {
          try {
            localStorage.removeItem(draftKey);
            console.log(`[Draft] 자산화 성공 → 임시저장 삭제`);
          } catch { /* ignore */ }
        }

        // ★ 응답 명확화 — 부분 실패/누락 검증 후 사용자에게 명시.
        //   기존엔 200 OK 면 무조건 성공으로 보여서 (a) exam 미생성 (b) problems 일부만
        //   저장된 경우에도 사용자가 "성공으로 보임" → 다시 자산화 → 중복 사고로 이어짐.
        if (!data.examId) {
          alert(`⚠️ 자산화 부분 실패\n\nproblems 저장: ${savedCount}/${expectedCount}\nexam 레코드: ❌ 미생성\n\n같은 PDF 다시 업로드/자산화하면 중복 데이터가 쌓일 수 있습니다.\n관리자에게 문의하거나 클라우드 페이지에서 직접 확인하세요.`);
        } else if (savedCount < expectedCount) {
          alert(`⚠️ 자산화 부분 성공\n\n저장: ${savedCount}/${expectedCount}\n누락: ${expectedCount - savedCount}건\nexamId: ${data.examId.slice(0, 8)}…\n\n클라우드 페이지에서 누락 문제를 확인 후 개별 작업하세요.`);
        } else {
          // 정상 완료 — 별도 alert 없이 "확인하기" 버튼만 활성화 (기존 동작)
          console.log(`[자산화] 정상 완료: ${savedCount}/${expectedCount}, examId=${data.examId}`);
        }
      } else {
        // 서버가 JSON이 아닐 수도 있으므로 안전 파싱
        const raw = await res.text().catch(() => '');
        let parsed: {
          error?: string;
          message?: string;
          detail?: { message?: string; code?: string; details?: string; hint?: string } | null;
          diagnostic?: { title?: string; instituteId?: string | null; bookGroupId?: string | null; createdBy?: string };
        } = {};
        try { parsed = JSON.parse(raw); } catch { /* non-JSON body */ }
        const hint = res.status === 413
          ? '(이미지 크기 초과 — 문제 수/페이지 수 과다)'
          : res.status === 401
            ? '(로그인 세션 만료)'
            : '';
        // ★ 진단용 detail 이 있으면 alert 에 같이 표시 (DB 에러 메시지·코드)
        const detailLine = parsed.detail?.message
          ? `\n\n[DB 에러] ${parsed.detail.code || '?'} — ${parsed.detail.message}${parsed.detail.hint ? `\n[힌트] ${parsed.detail.hint}` : ''}${parsed.detail.details ? `\n[상세] ${parsed.detail.details}` : ''}`
          : '';
        const diagLine = parsed.diagnostic
          ? `\n\n[진단] title=${parsed.diagnostic.title} institute=${parsed.diagnostic.instituteId?.slice(0, 8) || '없음'} bookGroup=${parsed.diagnostic.bookGroupId?.slice(0, 8) || '없음'}`
          : '';
        alert(`❌ 자산화 실패 [${res.status}] ${hint}\n${parsed.error || parsed.message || raw.slice(0, 200) || '응답 본문 없음'}${detailLine}${diagLine}`);
      }
    } catch (err) {
      console.error('Save all error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`❌ 자산화 중 오류가 발생했습니다.\n원인: ${msg}`);
    } finally {
      setIsSavingAll(false);
    }
  }, [jobData, jobId, isSavingAll, urlBookGroupId, autoCropProblems]);

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
      fileName: jobData?.fileName,
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
    if (autoCropAllProblems.length > 0) {
      return autoCropJobData;
    }
    return jobData;
  }, [autoCropAllProblems, autoCropJobData, jobData]);

  // 현재 페이지 데이터
  const currentPageData = useMemo(() => {
    if (!activeJobData) return null;
    return activeJobData.pages.find(p => p.pageNumber === currentPage) || activeJobData.pages[0];
  }, [activeJobData, currentPage]);

  const allProblems = useMemo(() => {
    if (autoCropAllProblems.length > 0) {
      return autoCropAllProblems;
    }
    if (!jobData) return [];
    return jobData.pages.flatMap(p => p.problems);
  }, [autoCropAllProblems, jobData]);

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
        if (updated.number !== undefined) body.source_number = updated.number;

        // 정답/선택지 변경 시 answer_json으로 통합 저장
        if (updated.answer !== undefined || updated.choices !== undefined) {
          const finalAnswer = updated.answer ?? selectedProblem.answer;
          const circledNumbers = ['①', '②', '③', '④', '⑤'];
          const currentChoices = updated.choices ?? selectedProblem.choices ?? [];
          // ★ choices prefix 정규화 — ① / (1) / 1) / 1. 모두 제거 후 ① 으로 통일
          const formattedChoices = currentChoices.map((c: string, i: number) => {
            const stripped = c
              .replace(/^[①②③④⑤]\s*/, '')
              .replace(/^\(\s*[1-5]\s*\)\s*/, '')
              .replace(/^[1-5]\s*[).]\s*/, '')
              .trim();
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

      // ★ difficulty가 바뀌면 difficultyLabel을 초기화해서 DIFFICULTY_LABELS 기반으로 표시되게 함
      const localUpdate = updated.difficulty !== undefined
        ? { ...updated, difficultyLabel: '' }
        : updated;

      setJobData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map(page => ({
            ...page,
            problems: page.problems.map(p =>
              p.id === selectedProblemId
                ? { ...p, ...localUpdate, status: 'edited' as const }
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

  // ★ 문제 합치기(Merge) 핸들러
  const handleStartMerge = useCallback(() => {
    setMergeMode(true);
    setMergeTargetId(null);
  }, []);

  const handleMergeProblems = useCallback(() => {
    if (!selectedProblemId || !mergeTargetId) return;
    const p1 = allProblems.find(p => p.id === selectedProblemId);
    const p2 = allProblems.find(p => p.id === mergeTargetId);
    if (!p1 || !p2) return;

    // 번호가 작은 것이 first
    const [first, second] = p1.number <= p2.number ? [p1, p2] : [p2, p1];

    const merged: AnalyzedProblem = {
      ...first,
      content: first.content + '\n\n' + second.content,
      choices: first.choices.length > 0 ? first.choices : second.choices,
      answer: second.answer || first.answer,
      solution: [first.solution, second.solution].filter(Boolean).join('\n\n'),
      bbox: first.bbox && second.bbox ? {
        x: Math.min(first.bbox.x, second.bbox.x),
        y: Math.min(first.bbox.y, second.bbox.y),
        w: Math.max(first.bbox.x + first.bbox.w, second.bbox.x + second.bbox.w) - Math.min(first.bbox.x, second.bbox.x),
        h: Math.max(first.bbox.y + first.bbox.h, second.bbox.y + second.bbox.h) - Math.min(first.bbox.y, second.bbox.y),
      } : first.bbox || second.bbox,
      difficulty: Math.max(first.difficulty, second.difficulty) as 1 | 2 | 3 | 4 | 5,
      number: first.number,
      status: 'edited' as const,
    };

    // AutoCrop 모드 또는 레거시 모드에 따라 상태 업데이트
    if (autoCropProblems.size > 0) {
      setAutoCropProblems(prev => {
        const next = new Map(prev);
        for (const [pageIdx, problems] of next.entries()) {
          const hasFirst = problems.some(p => p.id === first.id);
          const hasSecond = problems.some(p => p.id === second.id);
          if (hasFirst || hasSecond) {
            let updated = problems.filter(p => p.id !== first.id && p.id !== second.id);
            if (hasFirst) updated.push(merged);
            else if (!hasFirst && hasSecond) updated.push(merged);
            next.set(pageIdx, updated);
          }
        }
        return next;
      });
    } else {
      setJobData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          totalProblems: prev.totalProblems - 1,
          pages: prev.pages.map(page => {
            const hasFirst = page.problems.some(p => p.id === first.id);
            const hasSecond = page.problems.some(p => p.id === second.id);
            if (!hasFirst && !hasSecond) return page;
            let updated = page.problems.filter(p => p.id !== first.id && p.id !== second.id);
            if (hasFirst) updated.push(merged);
            return { ...page, problems: updated };
          }),
        };
      });
    }

    setSelectedProblemId(merged.id);
    setMergeMode(false);
    setMergeTargetId(null);
  }, [selectedProblemId, mergeTargetId, allProblems, autoCropProblems]);

  const handleCancelMerge = useCallback(() => {
    setMergeMode(false);
    setMergeTargetId(null);
  }, []);

  // 문제 선택 핸들러 (mergeMode 분기 포함)
  const handleSelectProblem = useCallback((id: string) => {
    if (mergeMode) {
      if (id !== selectedProblemId) {
        setMergeTargetId(id);
      }
    } else {
      setSelectedProblemId(id);
    }
  }, [mergeMode, selectedProblemId]);

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

      // ★ 흰색 배경 먼저 칠하기 (PDF 투명 배경 → 검은색 방지)
      fullCtx.fillStyle = '#ffffff';
      fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);

      const renderTask = page.render({ canvasContext: fullCtx, viewport });
      await renderTask.promise;

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
    } catch (err: any) {
      if (err?.name === 'RenderingCancelledException') return null;
      console.error('[getCropImageBase64] Error:', err);
      return null;
    }
  }, [jobData?.pdfUrl]);

  // ★ 이미지 삽입: 크롭 이미지 내 드래그 영역 → PDF 좌표 변환 → 고화질(4x) 크롭 → content에 삽입
  const handleInsertImageCrop = useCallback(async (cropRelativeRect: { x: number; y: number; w: number; h: number }) => {
    if (!selectedProblem || !jobData?.pdfUrl || !selectedProblem.bbox) {
      setInsertImageMode(false);
      return;
    }

    try {
      const bbox = selectedProblem.bbox;

      // 좌표 변환: 크롭 이미지 내 비율(0-1) → PDF 전체 페이지 비율(0-1)
      const pdfRect = {
        x: bbox.x + cropRelativeRect.x * bbox.w,
        y: bbox.y + cropRelativeRect.y * bbox.h,
        w: cropRelativeRect.w * bbox.w,
        h: cropRelativeRect.h * bbox.h,
      };

      console.log('[InsertImage] 좌표 변환:', { cropRelativeRect, bbox, pdfRect });

      const { loadPdfDocument } = await import('@/lib/pdf-viewer');
      const pdf = await loadPdfDocument(jobData.pdfUrl);
      const pageNum = selectedProblem.pageIndex + 1; // 문제가 위치한 페이지
      if (pageNum > pdf.numPages) return;

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 4.0 }); // ★ 고화질 4x

      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = viewport.width;
      fullCanvas.height = viewport.height;
      const fullCtx = fullCanvas.getContext('2d');
      if (!fullCtx) return;

      fullCtx.fillStyle = '#ffffff';
      fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);

      const renderTask = page.render({ canvasContext: fullCtx, viewport });
      await renderTask.promise;

      // 선택 영역 크롭
      const sx = pdfRect.x * fullCanvas.width;
      const sy = pdfRect.y * fullCanvas.height;
      const sw = pdfRect.w * fullCanvas.width;
      const sh = pdfRect.h * fullCanvas.height;

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = Math.max(1, Math.round(sw));
      cropCanvas.height = Math.max(1, Math.round(sh));
      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) return;

      cropCtx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height);
      const base64 = cropCanvas.toDataURL('image/png');

      // ★ content에서 표 패턴을 찾아 이미지로 대체 (중복 방지)
      const imageMarkdown = `![이미지](${base64})`;
      const imageEntry: InsertedImage = {
        id: `img-${Date.now()}`,
        base64,
        cropRelativeRect: cropRelativeRect,
        insertPosition: 'append', // 아래에서 실제 값으로 업데이트
      };

      const updateProblem = (problems: AnalyzedProblem[]) =>
        problems.map(p => {
          if (p.id !== selectedProblem.id) return p;

          const { newContent, replacedPattern, insertPosition } =
            replaceTablePatternWithImage(p.content || '', imageMarkdown, cropRelativeRect);

          imageEntry.replacedPattern = replacedPattern;
          imageEntry.insertPosition = insertPosition;

          return {
            ...p,
            content: newContent,
            insertedImages: [...(p.insertedImages || []), { ...imageEntry }],
            status: 'edited' as const,
          };
        });

      // autoCropProblems 또는 jobData에서 업데이트
      const hasAutoCrop = useAutoCropMode || autoCropProblems.size > 0;
      if (hasAutoCrop) {
        setAutoCropProblems(prev => {
          const next = new Map(prev);
          for (const [pageIdx, probs] of next.entries()) {
            if (probs.some(p => p.id === selectedProblem.id)) {
              next.set(pageIdx, updateProblem(probs));
              break;
            }
          }
          return next;
        });
      } else {
        setJobData(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: prev.pages.map(pg => ({
              ...pg,
              problems: updateProblem(pg.problems),
            })),
          };
        });
      }

      console.log(`[InsertImage] 문제 ${selectedProblem.number}에 고화질(4x) 이미지 삽입 완료`);
    } catch (err) {
      console.error('[InsertImage] 크롭 오류:', err);
    } finally {
      setInsertImageMode(false);
    }
  }, [selectedProblem, jobData?.pdfUrl, useAutoCropMode, autoCropProblems]);

  // ★ 마지막 삽입 이미지 삭제
  const handleDeleteLastImage = useCallback(() => {
    if (!selectedProblem?.insertedImages?.length) return;

    const lastImage = selectedProblem.insertedImages[selectedProblem.insertedImages.length - 1];
    const imgMarkdown = `![이미지](${lastImage.base64})`;

    // content에서 이미지 마크다운 제거 + 빈줄 정리
    let newContent = (selectedProblem.content || '').replace(imgMarkdown, '');
    newContent = newContent.replace(/\n{3,}/g, '\n\n').trim();

    const newInsertedImages = selectedProblem.insertedImages.slice(0, -1);

    // handleInsertImageCrop과 동일한 state 업데이트 패턴
    const updateProblem = (problems: AnalyzedProblem[]) =>
      problems.map(p => p.id !== selectedProblem.id ? p : {
        ...p, content: newContent, insertedImages: newInsertedImages, status: 'edited' as const,
      });

    if (useAutoCropMode || autoCropProblems.size > 0) {
      setAutoCropProblems(prev => {
        const next = new Map(prev);
        for (const [pageIdx, probs] of next.entries()) {
          if (probs.some(p => p.id === selectedProblem.id)) {
            next.set(pageIdx, updateProblem(probs));
            break;
          }
        }
        return next;
      });
    } else {
      setJobData(prev => {
        if (!prev) return prev;
        return { ...prev, pages: prev.pages.map(pg => ({ ...pg, problems: updateProblem(pg.problems) })) };
      });
    }

    console.log(`[DeleteImage] 문제 ${selectedProblem.number}에서 마지막 이미지 삭제 (남은: ${newInsertedImages.length})`);
  }, [selectedProblem, useAutoCropMode, autoCropProblems]);

  // ★ 선택된 문제에 cropImageBase64가 없으면 자동 생성
  useEffect(() => {
    if (!selectedProblem) return;
    if (selectedProblem.cropImageBase64) return; // 이미 있으면 스킵
    if (!selectedProblem.bbox || selectedProblem.bbox.w <= 0 || selectedProblem.bbox.h <= 0) return;
    if (selectedProblem.status === 'pending') return; // pending 상태면 스킵

    let cancelled = false;
    getCropImageBase64(selectedProblem).then(base64 => {
      if (cancelled || !base64) return;
      // 문제에 cropImageBase64 설정
      setJobData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map(page => ({
            ...page,
            problems: page.problems.map(p =>
              p.id === selectedProblem.id ? { ...p, cropImageBase64: base64 } : p
            ),
          })),
        };
      });
      // AutoCrop 모드인 경우도 처리
      setAutoCropProblems(prev => {
        const next = new Map(prev);
        for (const [pageIdx, problems] of next.entries()) {
          const updated = problems.map(p =>
            p.id === selectedProblem.id ? { ...p, cropImageBase64: base64 } : p
          );
          next.set(pageIdx, updated);
        }
        return next;
      });
    });

    return () => { cancelled = true; };
  }, [selectedProblem?.id, selectedProblem?.cropImageBase64, selectedProblem?.status, getCropImageBase64]);

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

        // 2. Mathpix OCR + GPT-4o 통합 분석 API + YOLO figure 검출 병렬 실행
        //    둘 다 같은 imageBase64 사용 + 독립적 → Promise.all 로 max(둘) 시간만 소요
        //    이전엔 순차 await 라 30문제 × 3~8s YOLO 추가 = 90~240s 지연 사고 (느려짐 보고).
        const fetchPromise = fetch('/api/workflow/reanalyze-crop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64,
            fullAnalysis: true,
            problemNumber: problem.number,
            fileName: jobData?.fileName,
          }),
        });
        const yoloPromise = detectFiguresFromProblemCropAfterAnalysis(
          imageBase64,
          problem,
          problem.pageIndex + 1,
        );

        const res = await fetchPromise;

        if (res.ok) {
          const data = await res.json();
          console.log(`[BatchAnalyze] 문제 ${problem.number}: OCR ${data.ocrText?.length || 0}자, 분류: ${data.classification?.classification?.typeName || '없음'}`);

          // YOLO 결과 await — fetch 완료 시점에 보통 이미 끝나있어 추가 대기 거의 없음
          const yoloFigures = await yoloPromise;

          // 분석 결과로 문제 업데이트
          setAutoCropProblems(prev => {
            const next = new Map(prev);
            const pageProbs = [...(next.get(problem.pageIndex) || [])];
            const idx = pageProbs.findIndex(p => p.id === problem.id);
            if (idx >= 0) {
              const classification = data.classification;
              const rawContent = data.ocrText || '';
              const extracted = extractProblemContent(rawContent, classification?.classification?.typeName, problem.number);
              // ★ 기존 삽입 이미지 + 분석 후 YOLO 가 잡은 figure 합치기
              const existingImages = pageProbs[idx].insertedImages || [];
              const allImages = [...existingImages, ...yoloFigures];
              const finalContent = reapplyInsertedImages(extracted.content, allImages);

              const cls = classification?.classification;
              pageProbs[idx] = {
                ...pageProbs[idx],
                content: finalContent,
                insertedImages: allImages,  // ★ 보존 + YOLO figure 추가
                score: extracted.score ?? pageProbs[idx].score,  // ★ 배점 보존
                choices: data.choices || [],
                confidence: cls?.confidence || data.confidence || 0.5,
                status: 'completed',
                cropImageBase64: imageBase64 || undefined,
                // 그래프/도형 분석 결과
                ...(data.graphData ? { graphData: data.graphData } : {}),
                // GPT 분류 결과 반영 (505개 성취기준 + 5등급 난이도)
                ...(cls ? {
                  typeCode: cls.typeCode || '',
                  typeName: cls.typeName || '',
                  difficulty: cls.difficulty || 3,
                  difficultyLabel: cls.difficultyLabel || '',
                  difficultyScores: cls.difficultyScores || undefined,
                  achievementCode: cls.achievementCode || '',
                  cognitiveDomain: cls.cognitiveDomain || '',
                  subject: cls.subject || '',
                  chapter: cls.chapter || '',
                  section: cls.section || '',
                  // ★ Phase C-1b: pitfalls 보존
                  ...(Array.isArray(cls.pitfalls) ? { pitfalls: cls.pitfalls as Array<{ code: string; confidence: number; reason?: string }> } : {}),
                } : {}),
                // 풀이 결과
                ...(classification?.solution ? {
                  answer: classification.solution.finalAnswer || '',
                  solution: classification.solution.steps?.map((s: any) => {
                    const desc = (s.description || '').trim();
                    const latex = (s.latex || '').trim();
                    if (desc && latex) return `${desc}\n$$${latex}$$`;
                    if (latex) return `$$${latex}$$`;
                    return desc;
                  }).filter(Boolean).join('\n') || '',
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

      // API 429 방지: 문제 간 2초 딜레이 (마지막 문제 제외)
      if (i < pendingProblems.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
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

      // 단건 분석도 병렬: reanalyze-crop + YOLO figure 검출 동시 실행
      const fetchPromise = fetch('/api/workflow/reanalyze-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          fullAnalysis: true,
          problemNumber: problem.number,
          fileName: jobData?.fileName,
        }),
      });
      const yoloPromise = detectFiguresFromProblemCropAfterAnalysis(
        imageBase64,
        problem,
        problem.pageIndex + 1,
      );

      const res = await fetchPromise;

      if (res.ok) {
        const data = await res.json();

        // YOLO 결과 await — fetch 보다 보통 빠르므로 추가 대기 거의 없음
        const yoloFigures = await yoloPromise;

        setAutoCropProblems(prev => {
          const next = new Map(prev);
          const pageProbs = [...(next.get(problem.pageIndex) || [])];
          const idx = pageProbs.findIndex(p => p.id === problem.id);
          if (idx >= 0) {
            const classification = data.classification;
            const rawContent = data.ocrText || '';
            const extracted = extractProblemContent(rawContent, classification?.classification?.typeName, problem.number);
            // ★ 기존 삽입 이미지 + 분析 후 YOLO 가 잡은 figure 합치기
            const existingImages = pageProbs[idx].insertedImages || [];
            const allImages = [...existingImages, ...yoloFigures];
            const finalContent = reapplyInsertedImages(extracted.content, allImages);

            pageProbs[idx] = {
              ...pageProbs[idx],
              content: finalContent,
              insertedImages: allImages,  // ★ 보존 + YOLO figure 추가
              score: extracted.score ?? pageProbs[idx].score,  // ★ 배점 보존
              choices: data.choices || [],
              confidence: data.confidence || 0.5,
              status: 'completed',
              ...(classification ? {
                problemId: classification.problemId,
                typeCode: classification.classification?.typeCode || '',
                typeName: classification.classification?.typeName || '',
                difficulty: classification.classification?.difficulty || 3,
                answer: classification.solution?.finalAnswer || '',
                solution: classification.solution?.steps?.map((s: any) => {
                  const desc = (s.description || '').trim();
                  const latex = (s.latex || '').trim();
                  if (desc && latex) return `${desc}\n$$${latex}$$`;
                  if (latex) return `$$${latex}$$`;
                  return desc;
                }).filter(Boolean).join('\n') || '',
                // ★ Phase C-1b: BatchAnalyze 결과의 pitfalls 보존
                pitfalls: classification.classification?.pitfalls,
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
    data: { ocrText: string; choices?: string[]; confidence?: number; graphData?: GraphData; classification?: Record<string, unknown> },
  ) => {
    // classification에서 풀이 추출
    const cls = data.classification?.classification as Record<string, unknown> | undefined;
    const sol = data.classification?.solution as Record<string, unknown> | undefined;
    const solutionText = sol?.steps
      ? (sol.steps as Array<{ description?: string; latex?: string }>)
          .map(s => {
            const desc = (s.description || '').trim();
            const latex = (s.latex || '').trim();
            if (desc && latex) return `${desc}\n$$${latex}$$`;
            if (latex) return `$$${latex}$$`;
            return desc;
          })
          .filter(Boolean)
          .join('\n')
      : undefined;

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
                // ★ graphData 업데이트
                graphData: data.graphData ?? p.graphData,
                // ★ classification/풀이 업데이트
                ...(cls ? {
                  typeCode: (cls.typeCode as string) || p.typeCode,
                  typeName: (cls.typeName as string) || p.typeName,
                  difficulty: ((cls.difficulty as number) || p.difficulty) as 1|2|3|4|5,
                  difficultyLabel: (cls.difficultyLabel as string) || p.difficultyLabel,
                  achievementCode: (cls.achievementCode as string) || p.achievementCode,
                  cognitiveDomain: (cls.cognitiveDomain as string) || p.cognitiveDomain,
                  subject: (cls.subject as string) || p.subject,
                  chapter: (cls.chapter as string) || p.chapter,
                  section: (cls.section as string) || p.section,
                } : {}),
                ...(sol ? {
                  answer: (sol.finalAnswer as string) || p.answer,
                  solution: solutionText || p.solution,
                } : {}),
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
        console.log(`[Reanalyze] OCR 완료: ${data.ocrText?.length || 0}자, 선택지 ${data.choices?.length || 0}개, graphData:`, data.graphData);
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

      // 2. 크롭 OCR + GPT 정제 + 풀이 생성 API 호출
      const res = await fetch('/api/workflow/reanalyze-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          customPrompt: customPrompt || undefined,
          fullAnalysis: true,  // ★ 풀이/분류 포함
          problemNumber: selectedProblem.number,
          fileName: jobData?.fileName,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`[AdvancedAnalyze] OCR+GPT 완료: ${data.ocrText?.length || 0}자, 선택지 ${data.choices?.length || 0}개, graphData:`, data.graphData, 'classification:', !!data.classification);
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
  // 자동 감지 또는 수동 추가된 문제가 있으면 AutoCrop 데이터 활성화
  const isAutoCropActive = useAutoCropMode || autoCropAllProblems.length > 0;
  const pendingCount = autoCropAllProblems.filter(p => p.status === 'pending').length;
  const completedCount = autoCropAllProblems.filter(p => p.status === 'completed' || p.status === 'edited').length;

  const pipelineProgress = jobData.progress || 0;
  return (
    <div className="aze-shell">
      {/* ======== SUBBAR (Chrome 다크) ======== */}
      <div className="aze-subbar">
        <div className="aze-crumbs">
          <button
            type="button"
            className="aze-crumb-back"
            aria-label="뒤로"
            onClick={() => router.push('/dashboard/cloud')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="aze-crumb-path">
            <span>문제 분석</span>
            <span className="sep">/</span>
            <span className="aze-crumb-file" title={jobData.fileName}>
              {jobData.fileName}
            </span>
            <span className={`aze-subject-chip ${jobData.subjectArea === 'science' ? 'science' : 'math'}`}>
              {jobData.subjectArea === 'science' ? '과학' : '수학'}
            </span>
            <span className="aze-crumb-pages">
              {totalPdfPages ? `${totalPdfPages}p` : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 이미지 파이프라인 결과 배지 */}
          {jobData.imagePipeline && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
              jobData.imagePipeline.status === 'running'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                : jobData.imagePipeline.status === 'done'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-red-500/15 text-red-300 border border-red-500/30'
            }`}>
              {jobData.imagePipeline.status === 'running' ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> 도식 추출 중...</>
              ) : jobData.imagePipeline.status === 'done' ? (
                <><ImagePlus className="h-3 w-3" /> 도식 {jobData.imagePipeline.extracted_count}개 추출 · {jobData.imagePipeline.enhanced_count}개 보정</>
              ) : (
                <><AlertCircle className="h-3 w-3" /> 이미지 파이프라인 오류</>
              )}
            </div>
          )}

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

          {/* 자동 감지 시작 버튼 (AI 만 노출 — 픽셀 모드는 내부 폴백으로만 유지) */}
          {!useAutoCropMode && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setDetectionMode('ai');
                  setUseAutoCropMode(true);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                title="AI(YOLO)가 모든 페이지의 문제·도형을 자동 감지합니다"
              >
                <Sparkles className="h-3 w-3" />
                AI 자동 감지
              </button>
            </div>
          )}

          {/* 자동 감지 활성 시: 중지 · 초기화만 노출 (모드 토글·픽셀 슬라이더 제거됨, 픽셀은 내부 폴백 전용) */}
          {useAutoCropMode && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setUseAutoCropMode(false);
                  setAutoCropProblems(new Map());
                  blocksDetectedRef.current.clear();
                  isPreloadingRef.current = false;
                  setAiDetectProgress(new Map());
                  setSelectedProblemId(null);
                }}
                className="px-2 py-0.5 rounded text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors"
                title="자동 감지를 중지하고 모든 감지 결과를 초기화합니다"
              >
                중지 · 초기화
              </button>
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
                onClick={() => router.push(savedExamId ? `/dashboard/cloud/${savedExamId}` : '/dashboard/cloud')}
                className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition-all bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                title={savedExamId ? '방금 자산화한 시험지로 이동' : `${orgName}클라우드 목록으로 이동`}
              >
                <CheckCircle className="h-3.5 w-3.5" />
                {orgName}클라우드에서 확인하기 →
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
        <span className={`text-[10px] rounded px-1.5 py-0.5 ${
          useAutoCropMode
            ? detectionMode === 'ai'
              ? 'text-indigo-400/70 bg-indigo-500/5 border border-indigo-500/20'
              : 'text-cyan-400/70 bg-cyan-500/5 border border-cyan-500/20'
            : 'text-emerald-400/70 bg-emerald-500/5 border border-emerald-500/20'
        }`}>
          {useAutoCropMode
            ? detectionMode === 'ai' ? 'AI 감지 모드' : 'AutoCrop 모드'
            : '수동 선택 모드'
          }
        </span>
      </div>

      {/* ======== Main 3-Panel Layout (Chrome 디자인) ======== */}
      <div className="aze-body">
        {/* --- 좌측: 페이지 썸네일 --- */}
        <div className="aze-sidebar">
          <PageThumbnailList
            pages={activeJobData?.pages || jobData.pages}
            // ★ currentPage 자체는 PDF page number 기준 (기존 동작 유지)
            //   리스트에는 display number 로 표시하기 위해 pdfToDisplayPage 변환
            currentPage={pdfToDisplayPage(currentPage)}
            totalPdfPages={totalPdfPages}
            pdfUrl={jobData.pdfUrl}
            // 사용자가 클릭하면 display number → PDF page number 로 변환해서 setCurrentPage
            onPageSelect={(displayNum) => setCurrentPage(displayToPdfPage(displayNum))}
            aiDetectProgress={detectionMode === 'ai' ? aiDetectProgress : undefined}
            pageOrder={pageOrder.length > 0 ? pageOrder : Array.from({ length: totalPdfPages }, (_, i) => i + 1)}
            onReorder={handlePageReorder}
            getRotation={(pdfPageNum) => pageRotations.get(pdfPageNum) ?? 0}
          />
        </div>

        {/* --- 중앙: PDF 이미지 + 바운딩 박스 --- */}
        {jobData.fileName?.match(/\.hwpx?$/i) && !jobData.pdfUrl && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-blue-500/20 border border-blue-500/40 rounded-lg text-blue-300 text-xs text-center max-w-md animate-pulse">
            <Loader2 className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5 animate-spin" />
            HWP → PDF 변환 중... 완료되면 미리보기가 표시됩니다.
          </div>
        )}
        <PdfViewerWithBoxes
          pdfUrl={jobData.pdfUrl}
          pageNumber={currentPage}
          problems={currentPageData?.problems || []}
          selectedProblemId={selectedProblemId}
          onSelectProblem={handleSelectProblem}
          onEditProblem={(problem) => setEditingProblem(problem)}
          onBboxUpdate={isAutoCropActive ? handleAutoCropBboxUpdate : handleBboxUpdate}
          onDeleteProblem={(id) => handleDeleteAutoCropProblem(id, true)}
          isAnalyzing={isProcessing && !isAutoCropActive}
          canvasRef={pdfCanvasRef}
          onManualCropDetected={handleManualCropDetected}
          rotation={pageRotations.get(currentPage) ?? 0}
          onRotate={handleRotatePage}
        />

        {/* --- 우측: 문제 상세 패널 (Chrome 디자인) --- */}
        <div className="aze-inspector">
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
            insertImageMode={insertImageMode}
            onToggleInsertImage={() => setInsertImageMode(prev => !prev)}
            onCropImageDragSelect={handleInsertImageCrop}
            onDeleteLastImage={handleDeleteLastImage}
            mergeMode={mergeMode}
            mergeTargetId={mergeTargetId}
            onStartMerge={handleStartMerge}
            onMergeProblems={handleMergeProblems}
            onCancelMerge={handleCancelMerge}
            allProblems={allProblems}
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

                // ★ 난이도/유형/인지영역 변경 반영
                if (updated.difficulty !== undefined) body.difficulty = updated.difficulty;
                if (updated.typeCode !== undefined) body.type_code = updated.typeCode;
                if (updated.cognitiveDomain !== undefined) body.cognitive_domain = updated.cognitiveDomain;

                // ★ 문제 번호 변경 (2026-05-17 fix): 사용자 보고 "모달에서 번호 바꿔도 적용 안 됨"
                //   API 가 source_number 받아서 problems.source_number + exam_problems.sequence_number
                //   양쪽 업데이트 함. 클라이언트에서 박지 않으면 로컬 state 만 바뀌고 DB 미반영.
                //   메모리: feedback_modal_save_deps.md (모달 저장 회귀 패턴 3번째)
                if (updated.number !== undefined) body.source_number = updated.number;

                // 정답/선택지/헤더/레이아웃을 answer_json으로 변환
                //   ★ choiceHeaders / choiceLayout 가 별도 컬럼 없어 answer_json 에 박음 (useExamProblems 가 거기서 읽음).
                //   ★ choiceLayout 추가 (2026-05-17 fix) — 사용자 보고 "객관식 보기 1줄/2줄/3줄 변경 적용 안 됨"
                //     메모리: feedback_modal_save_deps.md (모달 저장 회귀 패턴 4번째)
                if (
                  updated.answer !== undefined ||
                  updated.choices !== undefined ||
                  (updated as { choiceHeaders?: string[] }).choiceHeaders !== undefined ||
                  (updated as { choiceLayout?: number }).choiceLayout !== undefined ||
                  (updated as { choiceImages?: (string | null)[] }).choiceImages !== undefined
                ) {
                  const finalAnswer = updated.answer ?? editingProblem.answer;
                  const circledNumbers = ['①', '②', '③', '④', '⑤'];
                  const currentChoices = updated.choices ?? editingProblem.choices ?? [];
                  // ★ filter(Boolean) 금지: 이미지만 들어간 선택지(텍스트 빈)도 인덱스 유지 위해 placeholder 보존
                  const updatedChoiceImages = (updated as { choiceImages?: (string | null)[] }).choiceImages;
                  const existingChoiceImages = (editingProblem as { choiceImages?: (string | null)[] }).choiceImages;
                  const effectiveImages = updatedChoiceImages ?? existingChoiceImages;
                  const formattedChoices = currentChoices.map((c: string, i: number) => {
                    const stripped = c.replace(/^[①②③④⑤]\s*/, '');
                    if (stripped) return `${circledNumbers[i]} ${stripped}`;
                    // 이미지만 있는 선택지는 번호 placeholder 만 박음 (filter(Boolean) 사고 차단)
                    if (effectiveImages && effectiveImages[i]) return `${circledNumbers[i]}`;
                    return '';
                  });
                  // 뒤쪽 빈 항목 trim (5번이 비어있으면 4번까지)
                  while (formattedChoices.length > 0 && !formattedChoices[formattedChoices.length - 1]) {
                    formattedChoices.pop();
                  }
                  const headers = (updated as { choiceHeaders?: string[] }).choiceHeaders
                    ?? (editingProblem as { choiceHeaders?: string[] }).choiceHeaders
                    ?? [];
                  // ★ choiceLayout — 모달 변경값 우선, 없으면 기존 값 유지
                  const updatedLayout = (updated as { choiceLayout?: number }).choiceLayout;
                  const existingLayout = (editingProblem as { choiceLayout?: number }).choiceLayout;
                  const choiceLayout = updatedLayout ?? existingLayout;
                  body.answer_json = {
                    correct_answer: finalAnswer,
                    finalAnswer: finalAnswer,
                    choices: formattedChoices,
                    type: formattedChoices.length > 0 ? 'multiple_choice' : 'short_answer',
                    // ★ 헤더 1개+ 면 박음. 0개면 명시적 빈 배열 (모드 해제 의도 보존).
                    choiceHeaders: headers,
                    // ★ 레이아웃 — undefined 가 아니면 박음 (1/2/3/5)
                    ...(choiceLayout !== undefined ? { choiceLayout } : {}),
                    // ★ 그림 객관식 (2026-05-19) — 1개라도 변경되었으면 박음.
                    //   nano-banana / Gemini 자동 크롭 이미지 → 자산화 후 PATCH 경로에서도 보존.
                    ...(effectiveImages ? { choiceImages: effectiveImages } : {}),
                  };
                }

                if (Object.keys(body).length > 0) {
                  const res = await fetch(`/api/problems/${editingProblem.problemId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                  });
                  if (!res.ok) {
                    // ★ 404 = DB에 해당 문제가 없음 (자산화 전 or stale ID)
                    //   이 경우엔 로컬 편집 상태로만 유지하고 조용히 통과
                    if (res.status === 404) {
                      console.warn(`[Modal Save] 문제가 DB에 없음 (ID: ${editingProblem.problemId?.slice(0, 8)}...). 자산화 시 저장됩니다. 로컬 상태만 갱신.`);
                    } else {
                      const errData = await res.json().catch(() => ({}));
                      console.error('[Modal Save] API 저장 실패:', res.status, errData);
                      alert(`저장에 실패했습니다. (${res.status}${errData.error ? `: ${errData.error}` : ''})`);
                      return;
                    }
                  } else {
                    console.log(`[Modal Save] 문제 ${editingProblem.number}번 저장 완료: difficulty=${updated.difficulty}, typeCode=${updated.typeCode}`);
                  }
                }
              } catch (err) {
                console.error('[Modal Save] API 호출 실패:', err);
                alert(`저장에 실패했습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
                return;
              }
            }

            // 2) 로컬 상태 업데이트 (AutoCrop + jobData 양쪽)
            // ★ difficulty가 바뀌면 difficultyLabel을 초기화해서 DIFFICULTY_LABELS 기반으로 표시되게 함
            const localUpdate = updated.difficulty !== undefined
              ? { ...updated, difficultyLabel: '' }
              : updated;

            // AutoCrop 문제인 경우 autoCropProblems도 업데이트
            setAutoCropProblems(prev => {
              const next = new Map(prev);
              for (const [pageIdx, problems] of next.entries()) {
                const idx = problems.findIndex(p => p.id === editingProblem.id);
                if (idx >= 0) {
                  const updatedProblems = [...problems];
                  updatedProblems[idx] = { ...updatedProblems[idx], ...localUpdate, status: 'edited' as const };
                  next.set(pageIdx, updatedProblems);
                  break;
                }
              }
              return next;
            });
            // jobData도 업데이트 (비-AutoCrop 문제 호환)
            setJobData(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                pages: prev.pages.map(page => ({
                  ...page,
                  problems: page.problems.map(p =>
                    p.id === editingProblem.id
                      ? { ...p, ...localUpdate, status: 'edited' as const }
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
                if (!res.ok && res.status !== 404) {
                  alert('문제 삭제에 실패했습니다.');
                  return;
                }
                // 404도 정상 처리 (이미 없으면 OK)
                console.log(`[Delete] 모달에서 DB 삭제 완료: ${editingProblem.problemId} (status: ${res.status})`);
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
