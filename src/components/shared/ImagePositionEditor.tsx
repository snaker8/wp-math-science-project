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
  onSave: (updatedContent: string) => void;
  onCancel: () => void;
}

/** 콘텐츠를 블록 단위로 분할 */
function splitIntoBlocks(content: string): string[] {
  const cleaned = content.replace(/\[도형(?::[\w%]+)*\]/g, '').trim();
  const blocks = cleaned.split(/\n{2,}/).filter(b => b.trim().length > 0);
  if (blocks.length <= 1) {
    const lineBlocks = cleaned.split('\n').filter(b => b.trim().length > 0);
    return lineBlocks.length > 1 ? lineBlocks : blocks;
  }
  return blocks;
}

/** 현재 [도형] 마커에서 모드와 위치, 크기 파싱 */
function parseFigureMarker(content: string): {
  position: number;
  mode: LayoutMode;
  widthPercent: number;
} {
  // [도형:right:40%] 또는 [도형:left:35%] 또는 [도형]
  const markerMatch = content.match(/\[도형(?::(\w+[-\w]*))?(?::(\d+)%?)?\]/);
  let mode: LayoutMode = 'line';
  let widthPercent = 40;

  if (markerMatch) {
    const modeStr = markerMatch[1];
    if (modeStr === 'right' || modeStr === 'float-right') mode = 'float-right';
    else if (modeStr === 'left' || modeStr === 'float-left') mode = 'float-left';
    if (markerMatch[2]) widthPercent = parseInt(markerMatch[2], 10);
  }

  const lines = content.split('\n');
  let blockIdx = 0;
  for (const line of lines) {
    if (/\[도형/.test(line.trim())) return { position: blockIdx, mode, widthPercent };
    if (line.trim().length > 0) blockIdx++;
  }
  return { position: -1, mode, widthPercent };
}

/** 블록 배열과 설정으로 최종 콘텐츠 조합 */
function assembleContent(
  blocks: string[],
  figurePosition: number,
  mode: LayoutMode,
  widthPercent: number
): string {
  const marker = mode === 'line'
    ? '[도형]'
    : `[도형:${mode}:${widthPercent}%]`;

  const result: string[] = [];
  for (let i = 0; i <= blocks.length; i++) {
    if (i === figurePosition) {
      result.push(marker);
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
  onSave,
  onCancel,
}: ImagePositionEditorProps) {
  const blocks = useMemo(() => splitIntoBlocks(content), [content]);

  const initialState = useMemo(() => {
    const parsed = parseFigureMarker(content);
    return {
      position: parsed.position >= 0 ? parsed.position : blocks.length,
      mode: parsed.mode,
      widthPercent: parsed.widthPercent,
    };
  }, [content, blocks.length]);

  const [figurePosition, setFigurePosition] = useState(initialState.position);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(initialState.mode);
  const [widthPercent, setWidthPercent] = useState(initialState.widthPercent);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragItemRef = useRef<HTMLDivElement>(null);

  const moveUp = useCallback(() => {
    setFigurePosition(prev => Math.max(0, prev - 1));
  }, []);

  const moveDown = useCallback(() => {
    setFigurePosition(prev => Math.min(blocks.length, prev + 1));
  }, [blocks.length]);

  const handleSave = useCallback(() => {
    const assembled = assembleContent(blocks, figurePosition, layoutMode, widthPercent);
    onSave(assembled);
  }, [blocks, figurePosition, layoutMode, widthPercent, onSave]);

  // 드래그 핸들러
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'figure');
  }, []);

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
  }, []);

  const hasFigure = figureData || figureSvg || cropImageUrl || upscaledCropUrl;
  const isFloatMode = layoutMode === 'float-right' || layoutMode === 'float-left';

  // 플로트 모드: 도형이 적용되는 블록 범위 (position부터 끝까지)
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
          {blocks.map((block, blockIdx) => (
            <React.Fragment key={blockIdx}>
              <DropZone
                idx={blockIdx}
                isActive={figurePosition === blockIdx}
                isDragOver={dragOverIdx === blockIdx}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => setFigurePosition(blockIdx)}
              />
              {figurePosition === blockIdx && hasFigure && (
                <DraggableFigure
                  ref={dragItemRef}
                  figureData={figureData}
                  figureSvg={figureSvg}
                  cropImageUrl={cropImageUrl}
                  upscaledCropUrl={upscaledCropUrl}
                  figureSource={figureSource}
                  maxWidth={figureMaxWidth}
                  onDragStart={handleDragStart}
                  onMoveUp={moveUp}
                  onMoveDown={moveDown}
                  canMoveUp={figurePosition > 0}
                  canMoveDown={figurePosition < blocks.length}
                />
              )}
              <div className="px-2 py-1 rounded hover:bg-zinc-800/30 transition-colors">
                <MixedContentRenderer content={block} className="text-sm text-content-secondary leading-relaxed" />
              </div>
            </React.Fragment>
          ))}
          <DropZone
            idx={blocks.length}
            isActive={figurePosition === blocks.length}
            isDragOver={dragOverIdx === blocks.length}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => setFigurePosition(blocks.length)}
          />
          {figurePosition === blocks.length && hasFigure && (
            <DraggableFigure
              ref={dragItemRef}
              figureData={figureData}
              figureSvg={figureSvg}
              cropImageUrl={cropImageUrl}
              upscaledCropUrl={upscaledCropUrl}
              figureSource={figureSource}
              maxWidth={figureMaxWidth}
              onDragStart={handleDragStart}
              onMoveUp={moveUp}
              onMoveDown={moveDown}
              canMoveUp={figurePosition > 0}
              canMoveDown={false}
            />
          )}
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
              {hasFigure && (
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
      className={`transition-all cursor-pointer ${
        isDragOver
          ? 'h-8 border-2 border-dashed border-violet-400 bg-violet-500/10 rounded-lg mx-2 my-1 flex items-center justify-center'
          : 'h-1 hover:h-6 hover:border hover:border-dashed hover:border-zinc-600 hover:bg-zinc-800/30 rounded-lg mx-2 my-0.5'
      }`}
      onDragOver={(e) => onDragOver(e, idx)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, idx)}
      onClick={onClick}
    >
      {isDragOver && (
        <span className="text-[10px] text-violet-400">여기에 놓기</span>
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
  }
>(function DraggableFigure(
  { figureData, figureSvg, cropImageUrl, upscaledCropUrl, figureSource, maxWidth = 260, onDragStart, onMoveUp, onMoveDown, canMoveUp, canMoveDown },
  ref
) {
  return (
    <div
      ref={ref}
      draggable
      onDragStart={onDragStart}
      className="group/figure flex items-start gap-1.5 mx-2 my-1 p-2 rounded-lg border-2 border-violet-500/40 bg-violet-500/5 cursor-grab active:cursor-grabbing transition-all hover:border-violet-500/60"
    >
      <div className="flex flex-col items-center gap-0.5 pt-1">
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
