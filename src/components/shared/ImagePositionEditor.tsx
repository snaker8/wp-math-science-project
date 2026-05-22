'use client';

// ============================================================================
// ImagePositionEditor — 문제 내 이미지(도형) 위치를 드래그로 조정하는 컴포넌트
// 지원 모드: 라인(블록 사이), 우측 플로트, 좌측 플로트
// ============================================================================

import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  GripVertical, ChevronUp, ChevronDown, Check, X,
  Image as ImageIcon, AlignLeft, AlignRight, AlignCenter,
  Minus, Plus,
} from 'lucide-react';
import { MixedContentRenderer } from './MixedContentRenderer';
import { FigureRenderer } from './FigureRenderer';
import type { InterpretedFigure } from '@/types/ocr';

type LayoutMode = 'line' | 'float-right' | 'float-left';

interface ImagePositionEditorProps {
  content: string;
  figureData?: InterpretedFigure;
  figureSvg?: string;
  cropImageUrl?: string;
  upscaledCropUrl?: string;
  figureSource?: string;
  /** ★ 멀티 figure 지원 (2026-05-19): 2번째 이후 figure_crop URL 들 (이미 proxied).
   *   length 0 = 단일 figure (기존 동작). length ≥ 1 = 추가 figure 블록 표시 +
   *   각 figure 별 독립 위치 관리. 첫 figure 는 기존 cropImageUrl/upscaledCropUrl/figureData 사용. */
  extraFigureUrls?: string[];
  onSave: (updatedContent: string) => void;
  onCancel: () => void;
}

/** 콘텐츠를 블록 단위로 분할
 *
 * ★ 다중 figure 지원 (2026-05-19):
 *   모든 [도형…] 마커를 strip — assembleContent 가 figurePositions 배열의 각 위치에
 *   마커를 재삽입. 위치 정보는 parseAllFigureMarkers 가 별도로 수집.
 */
function splitIntoBlocks(content: string): string[] {
  // 모든 [도형…] 마커 제거 — 위치는 parseAllFigureMarkers 가 별도 추출
  const cleaned = content.replace(/\[도형(?::\w+[-\w]*)?(?::\d+%?)?\]/g, '\n\n').trim();
  const blocks = cleaned.split(/\n{2,}/).filter(b => b.trim().length > 0);
  if (blocks.length <= 1) {
    const lineBlocks = cleaned.split('\n').filter(b => b.trim().length > 0);
    return lineBlocks.length > 1 ? lineBlocks : blocks;
  }
  return blocks;
}

/** 콘텐츠에서 모든 [도형] 마커의 위치·모드·크기 파싱
 *
 * 반환: 마커 순서대로 N개 figure 메타. position = strip 후 블록 인덱스 기준.
 */
function parseAllFigureMarkers(content: string): Array<{
  position: number;
  mode: LayoutMode;
  widthPercent: number;
}> {
  const results: Array<{ position: number; mode: LayoutMode; widthPercent: number }> = [];

  // \n{2,} 로 paragraph 분할 후 각 paragraph 의 [도형] 마커를 순회.
  // [도형] 만 있는 paragraph 는 figure 블록으로 카운트, 그 외 텍스트 paragraph 만 블록 인덱스 증가.
  const paragraphs = content.split(/\n{2,}/);
  let blockIdx = 0;
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    // paragraph 내 [도형] 마커 (1개 이상)
    const markerRegex = /\[도형(?::(\w+[-\w]*))?(?::(\d+)%?)?\]/g;
    let m;
    let hadMarker = false;
    while ((m = markerRegex.exec(trimmed)) !== null) {
      hadMarker = true;
      let mode: LayoutMode = 'line';
      let widthPercent = 40;
      const modeStr = m[1];
      if (modeStr === 'right' || modeStr === 'float-right') mode = 'float-right';
      else if (modeStr === 'left' || modeStr === 'float-left') mode = 'float-left';
      if (m[2]) widthPercent = parseInt(m[2], 10);
      results.push({ position: blockIdx, mode, widthPercent });
    }
    // 마커만 있는 paragraph 면 블록 카운트 안 증가
    const textOnly = trimmed.replace(/\[도형(?::\w+[-\w]*)?(?::\d+%?)?\]/g, '').trim();
    if (textOnly.length > 0 && !hadMarker) blockIdx++;
    else if (textOnly.length > 0 && hadMarker) blockIdx++;
  }
  return results;
}

/** 블록 배열과 설정으로 최종 콘텐츠 조합
 *
 * ★ 멀티 figure (2026-05-19): figurePositions 배열의 모든 위치에 [도형] 마커 삽입.
 *   같은 position 에 여러 마커도 OK (모두 그 위치에 stack).
 */
function assembleContent(
  blocks: string[],
  figurePositions: number[],
  modes: LayoutMode[],
  widthPercents: number[]
): string {
  // 각 위치별 마커 리스트 구성
  const markersByPos = new Map<number, string[]>();
  for (let i = 0; i < figurePositions.length; i++) {
    const pos = figurePositions[i];
    const mode = modes[i] ?? 'line';
    const wp = widthPercents[i] ?? 40;
    const marker = mode === 'line' ? '[도형]' : `[도형:${mode}:${wp}%]`;
    if (!markersByPos.has(pos)) markersByPos.set(pos, []);
    markersByPos.get(pos)!.push(marker);
  }

  const result: string[] = [];
  for (let i = 0; i <= blocks.length; i++) {
    if (markersByPos.has(i)) {
      result.push(...markersByPos.get(i)!);
    }
    if (i < blocks.length) {
      result.push(blocks[i]);
    }
  }
  return result.join('\n\n');
}

export function ImagePositionEditor({
  content,
  figureData,
  figureSvg,
  cropImageUrl,
  upscaledCropUrl,
  figureSource,
  extraFigureUrls,
  onSave,
  onCancel,
}: ImagePositionEditorProps) {
  const blocks = useMemo(() => splitIntoBlocks(content), [content]);

  // ★ 총 figure 개수: 1 (메인) + extraFigureUrls.length
  const extras = extraFigureUrls || [];
  const totalFigures = 1 + extras.length;
  const isMulti = totalFigures > 1;

  // 초기 위치·모드·크기 — 콘텐츠의 [도형] 마커들에서 파싱.
  // 마커 수가 figure 수보다 적으면 부족분은 blocks 끝(blocks.length)에 배치.
  // 마커 수가 figure 수보다 많으면 초과분은 무시 (figure 가 없는데 표시할 게 없음).
  const initialState = useMemo(() => {
    const parsed = parseAllFigureMarkers(content);
    const positions: number[] = [];
    const modes: LayoutMode[] = [];
    const widthPercents: number[] = [];
    for (let i = 0; i < totalFigures; i++) {
      if (i < parsed.length) {
        positions.push(parsed[i].position);
        modes.push(parsed[i].mode);
        widthPercents.push(parsed[i].widthPercent);
      } else {
        // 마커 없는 figure 는 기본적으로 마지막 위치 (blocks.length) 에 배치 —
        // 멀티 figure 면 stack 되지 않게 약간 분산 (i 만큼 뒤로).
        // 마커가 0 개고 단일 figure 면 0 (맨 위) — 모달 열자마자 보이게 (PR #205 회귀 차단).
        if (parsed.length === 0 && totalFigures === 1) {
          positions.push(0);
        } else {
          positions.push(blocks.length);
        }
        modes.push('line');
        widthPercents.push(40);
      }
    }
    return { positions, modes, widthPercents };
  }, [content, blocks.length, totalFigures]);

  const [figurePositions, setFigurePositions] = useState<number[]>(initialState.positions);
  const [layoutModes, setLayoutModes] = useState<LayoutMode[]>(initialState.modes);
  const [widthPercents, setWidthPercents] = useState<number[]>(initialState.widthPercents);
  const [selectedFigureIdx, setSelectedFigureIdx] = useState(0); // 멀티 figure 중 활성 (헤더·드래그·D-Pad 대상)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragItemRef = useRef<HTMLDivElement>(null);

  const figurePosition = figurePositions[selectedFigureIdx] ?? 0;
  const layoutMode = layoutModes[selectedFigureIdx] ?? 'line';
  const widthPercent = widthPercents[selectedFigureIdx] ?? 40;
  const setFigurePosition = useCallback((updater: number | ((prev: number) => number)) => {
    setFigurePositions(prev => {
      const next = [...prev];
      next[selectedFigureIdx] = typeof updater === 'function' ? updater(next[selectedFigureIdx] ?? 0) : updater;
      return next;
    });
  }, [selectedFigureIdx]);
  const setLayoutMode = useCallback((m: LayoutMode) => {
    setLayoutModes(prev => {
      const next = [...prev];
      next[selectedFigureIdx] = m;
      return next;
    });
  }, [selectedFigureIdx]);
  const setWidthPercent = useCallback((updater: number | ((prev: number) => number)) => {
    setWidthPercents(prev => {
      const next = [...prev];
      next[selectedFigureIdx] = typeof updater === 'function' ? updater(next[selectedFigureIdx] ?? 40) : updater;
      return next;
    });
  }, [selectedFigureIdx]);

  const moveUp = useCallback(() => {
    setFigurePosition(prev => Math.max(0, prev - 1));
  }, [setFigurePosition]);

  const moveDown = useCallback(() => {
    setFigurePosition(prev => Math.min(blocks.length, prev + 1));
  }, [blocks.length, setFigurePosition]);

  const handleSave = useCallback(() => {
    const assembled = assembleContent(blocks, figurePositions, layoutModes, widthPercents);
    onSave(assembled);
  }, [blocks, figurePositions, layoutModes, widthPercents, onSave]);

  // 드래그 핸들러 — 멀티 figure 면 어떤 figure 가 드래그 중인지 알기 위해 fromIdx 전달
  const handleDragStart = useCallback((e: React.DragEvent, fromIdx?: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `figure:${fromIdx ?? selectedFigureIdx}`);
    if (typeof fromIdx === 'number') setSelectedFigureIdx(fromIdx);
  }, [selectedFigureIdx]);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIdx(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setFigurePosition(idx);
    setDragOverIdx(null);
  }, [setFigurePosition]);

  // 각 figure 의 props 헬퍼 — idx 0 = 메인 (cropImageUrl 등), idx ≥ 1 = extras
  const figurePropsAt = useCallback((idx: number) => {
    if (idx === 0) {
      return {
        figureData,
        figureSvg,
        cropImageUrl,
        upscaledCropUrl,
        figureSource,
      };
    }
    return {
      figureData: undefined,
      figureSvg: undefined,
      cropImageUrl: undefined,
      upscaledCropUrl: extras[idx - 1],
      figureSource: undefined,
    };
  }, [figureData, figureSvg, cropImageUrl, upscaledCropUrl, figureSource, extras]);

  const hasMainFigure = figureData || figureSvg || cropImageUrl || upscaledCropUrl;
  // 멀티 figure 면 float 모드는 비활성 (텍스트 감싸기가 N>1 시 의미 깨짐)
  const isFloatMode = !isMulti && (layoutMode === 'float-right' || layoutMode === 'float-left');

  // 플로트 모드: 도형이 적용되는 블록 범위 (position부터 끝까지). 단일 figure 일 때만.
  const floatBlocks = isFloatMode
    ? blocks.slice(figurePosition)
    : [];
  const preFloatBlocks = isFloatMode
    ? blocks.slice(0, figurePosition)
    : [];

  const figureMaxWidth = isFloatMode
    ? Math.round(280 * (widthPercent / 100) * 2)
    : 260;

  return (
    <div className="flex flex-col gap-2">
      {/* 헤더: 모드 선택 + 크기 조절 + 저장/취소 */}
      <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/30 flex-wrap gap-1.5">
        <div className="flex items-center gap-1">
          {/* 레이아웃 모드 버튼 */}
          <button
            type="button"
            onClick={() => setLayoutMode('line')}
            className={`p-1 rounded transition-colors ${layoutMode === 'line' ? 'bg-violet-500/30 text-violet-300' : 'text-zinc-500 hover:text-violet-400'}`}
            title="라인 모드 (블록 사이)"
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('float-right')}
            className={`p-1 rounded transition-colors ${layoutMode === 'float-right' ? 'bg-violet-500/30 text-violet-300' : 'text-zinc-500 hover:text-violet-400'}`}
            title="우측 플로트 (텍스트 감싸기)"
          >
            <AlignRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('float-left')}
            className={`p-1 rounded transition-colors ${layoutMode === 'float-left' ? 'bg-violet-500/30 text-violet-300' : 'text-zinc-500 hover:text-violet-400'}`}
            title="좌측 플로트"
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </button>

          {/* 크기 조절 (플로트 모드) */}
          {isFloatMode && (
            <div className="flex items-center gap-1 ml-2 border-l border-violet-500/30 pl-2">
              <button
                type="button"
                onClick={() => setWidthPercent(prev => Math.max(20, prev - 5))}
                className="p-0.5 rounded text-violet-400 hover:bg-violet-500/20"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="text-[10px] text-violet-300 min-w-[28px] text-center">{widthPercent}%</span>
              <button
                type="button"
                onClick={() => setWidthPercent(prev => Math.min(60, prev + 5))}
                className="p-0.5 rounded text-violet-400 hover:bg-violet-500/20"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] text-violet-400 mr-1">
            {layoutMode === 'line' ? '라인' : layoutMode === 'float-right' ? '우측' : '좌측'}
          </span>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
          >
            <Check className="h-3 w-3" />
            저장
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700 transition-colors"
          >
            <X className="h-3 w-3" />
            취소
          </button>
        </div>
      </div>

      {/* ═══ 라인 모드 ═══ */}
      {!isFloatMode && (
        <div className="space-y-0">
          {/* 각 블록 사이마다 dropzone + 해당 위치의 figure 들 렌더 */}
          {[...Array(blocks.length + 1)].map((_, slotIdx) => {
            // 이 slot 에 위치한 figure 인덱스들
            const figuresAtSlot = figurePositions
              .map((pos, fi) => ({ pos, fi }))
              .filter((x) => x.pos === slotIdx);
            const isAnyActive = figuresAtSlot.length > 0;
            return (
              <React.Fragment key={`slot-${slotIdx}`}>
                <DropZone
                  idx={slotIdx}
                  isActive={isAnyActive}
                  isDragOver={dragOverIdx === slotIdx}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => setFigurePosition(slotIdx)}
                />
                {figuresAtSlot.map(({ fi }) => {
                  const props = figurePropsAt(fi);
                  const figHas = props.figureData || props.figureSvg || props.cropImageUrl || props.upscaledCropUrl;
                  if (!figHas) return null;
                  const isSelected = fi === selectedFigureIdx;
                  return (
                    <DraggableFigure
                      key={`fig-${fi}`}
                      ref={isSelected ? dragItemRef : undefined}
                      figureIdx={fi}
                      totalFigures={totalFigures}
                      isSelected={isSelected}
                      onSelect={() => setSelectedFigureIdx(fi)}
                      figureData={props.figureData}
                      figureSvg={props.figureSvg}
                      cropImageUrl={props.cropImageUrl}
                      upscaledCropUrl={props.upscaledCropUrl}
                      figureSource={props.figureSource}
                      maxWidth={figureMaxWidth}
                      onDragStart={(e) => handleDragStart(e, fi)}
                      onMoveUp={() => {
                        setSelectedFigureIdx(fi);
                        setFigurePositions((prev) => {
                          const next = [...prev];
                          next[fi] = Math.max(0, (next[fi] ?? 0) - 1);
                          return next;
                        });
                      }}
                      onMoveDown={() => {
                        setSelectedFigureIdx(fi);
                        setFigurePositions((prev) => {
                          const next = [...prev];
                          next[fi] = Math.min(blocks.length, (next[fi] ?? 0) + 1);
                          return next;
                        });
                      }}
                      canMoveUp={(figurePositions[fi] ?? 0) > 0}
                      canMoveDown={(figurePositions[fi] ?? 0) < blocks.length}
                    />
                  );
                })}
                {slotIdx < blocks.length && (
                  <div className="px-2 py-1 rounded hover:bg-zinc-800/30 transition-colors">
                    <MixedContentRenderer content={blocks[slotIdx]} className="text-sm text-content-secondary leading-relaxed" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* ═══ 플로트 모드 ═══ */}
      {isFloatMode && (
        <div className="space-y-1">
          {/* 플로트 전 블록들 (일반 렌더링) */}
          {preFloatBlocks.map((block, idx) => (
            <div
              key={`pre-${idx}`}
              className="px-2 py-1 rounded hover:bg-zinc-800/30 transition-colors cursor-pointer"
              onClick={() => setFigurePosition(idx)}
            >
              <MixedContentRenderer content={block} className="text-sm text-content-secondary leading-relaxed" />
            </div>
          ))}

          {/* 도형 시작 위치 표시 */}
          <div className="flex items-center gap-1 px-2">
            <button
              type="button"
              onClick={moveUp}
              disabled={figurePosition <= 0}
              className="p-0.5 rounded text-violet-400 hover:bg-violet-500/20 disabled:text-zinc-600"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <span className="text-[10px] text-violet-400">이미지 시작 위치</span>
            <button
              type="button"
              onClick={moveDown}
              disabled={figurePosition >= blocks.length}
              className="p-0.5 rounded text-violet-400 hover:bg-violet-500/20 disabled:text-zinc-600"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>

          {/* 플로트 영역: 이미지 + 텍스트 감싸기 */}
          <div className="px-2 py-1 rounded border border-violet-500/20 bg-violet-500/5">
            <div
              className={`mb-2 ${layoutMode === 'float-right' ? 'float-right ml-3' : 'float-left mr-3'}`}
              style={{ width: `${widthPercent}%`, maxWidth: '200px' }}
            >
              {hasMainFigure && (
                <div className="border-2 border-violet-500/40 rounded-lg p-1 bg-white">
                  <FigureRenderer
                    figureData={figureData}
                    figureSvg={figureSvg}
                    cropImageUrl={cropImageUrl}
                    upscaledCropUrl={upscaledCropUrl}
                    figureSource={figureSource as 'upscaled_crop' | 'ai_generated' | undefined}
                    maxWidth={180}
                    darkMode={false}
                  />
                </div>
              )}
            </div>
            {floatBlocks.map((block, idx) => (
              <div key={`float-${idx}`} className="mb-1">
                <MixedContentRenderer content={block} className="text-sm text-content-secondary leading-relaxed" />
              </div>
            ))}
            <div style={{ clear: 'both' }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DropZone
// ============================================================================

function DropZone({
  idx,
  isActive,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: {
  idx: number;
  isActive: boolean;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, idx: number) => void;
  onClick: () => void;
}) {
  if (isActive) return null;

  return (
    <div
      className={`transition-all cursor-pointer flex items-center justify-center ${
        isDragOver
          ? 'h-10 border-2 border-dashed border-violet-400 bg-violet-500/15 rounded-lg mx-2 my-1.5'
          : 'h-5 hover:h-8 border-2 border-dashed border-violet-500/40 hover:border-violet-500/70 bg-violet-500/[0.04] hover:bg-violet-500/15 rounded mx-2 my-1'
      }`}
      onDragOver={(e) => onDragOver(e, idx)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, idx)}
      onClick={onClick}
      title="여기에 도형 배치 (드래그 또는 클릭)"
    >
      {isDragOver ? (
        <span className="text-[11px] text-violet-300 font-medium">여기에 놓기</span>
      ) : (
        <span className="text-[10px] text-violet-400/70">⋮ 드래그하거나 클릭</span>
      )}
    </div>
  );
}

// ============================================================================
// DraggableFigure
// ============================================================================

const DraggableFigure = React.forwardRef<
  HTMLDivElement,
  {
    figureData?: InterpretedFigure;
    figureSvg?: string;
    cropImageUrl?: string;
    upscaledCropUrl?: string;
    figureSource?: string;
    maxWidth?: number;
    onDragStart: (e: React.DragEvent) => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
    // ★ 멀티 figure 식별 (2026-05-19): 헤더에 "도형 N/M" 표시 + 선택 상태 시각화
    figureIdx?: number;
    totalFigures?: number;
    isSelected?: boolean;
    onSelect?: () => void;
  }
>(function DraggableFigure(
  { figureData, figureSvg, cropImageUrl, upscaledCropUrl, figureSource, maxWidth = 260, onDragStart, onMoveUp, onMoveDown, canMoveUp, canMoveDown, figureIdx, totalFigures = 1, isSelected = true, onSelect },
  ref
) {
  const showIdxBadge = totalFigures > 1 && typeof figureIdx === 'number';
  return (
    <div
      ref={ref}
      draggable
      onDragStart={onDragStart}
      onClick={() => onSelect?.()}
      className={`group/figure flex items-start gap-1.5 mx-2 my-1 p-2 rounded-lg border-2 cursor-grab active:cursor-grabbing transition-all ${
        isSelected
          ? 'border-violet-500/60 bg-violet-500/10'
          : 'border-violet-500/20 bg-violet-500/[0.03] hover:border-violet-500/40'
      }`}
    >
      <div className="flex flex-col items-center gap-0.5 pt-1">
        {showIdxBadge && (
          <span className="text-[9px] font-bold text-violet-400 bg-violet-500/15 px-1 py-0.5 rounded leading-none mb-0.5">
            {(figureIdx ?? 0) + 1}/{totalFigures}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
          disabled={!canMoveUp}
          className="p-0.5 rounded hover:bg-violet-500/20 text-violet-400 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <GripVertical className="h-4 w-4 text-violet-400/60" />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
          disabled={!canMoveDown}
          className="p-0.5 rounded hover:bg-violet-500/20 text-violet-400 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <div className="flex-1 flex justify-center">
        <FigureRenderer
          figureData={figureData}
          figureSvg={figureSvg}
          cropImageUrl={cropImageUrl}
          upscaledCropUrl={upscaledCropUrl}
          figureSource={figureSource as 'upscaled_crop' | 'ai_generated' | undefined}
          maxWidth={maxWidth}
          darkMode
        />
      </div>
    </div>
  );
});
