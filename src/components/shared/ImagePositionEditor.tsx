'use client';

// ============================================================================
// ImagePositionEditor — 문제 내 이미지(도형) 위치를 드래그로 조정하는 컴포넌트
// 콘텐츠를 블록(문단)으로 분할하고, 블록 사이에 도형을 드래그하여 배치
// ============================================================================

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { GripVertical, ChevronUp, ChevronDown, Check, X, Image as ImageIcon } from 'lucide-react';
import { MixedContentRenderer } from './MixedContentRenderer';
import { FigureRenderer } from './FigureRenderer';
import type { InterpretedFigure } from '@/types/ocr';

interface ImagePositionEditorProps {
  content: string;
  figureData?: InterpretedFigure;
  figureSvg?: string;
  cropImageUrl?: string;
  onSave: (updatedContent: string) => void;
  onCancel: () => void;
}

/** 콘텐츠를 블록 단위로 분할 (빈 줄 기준 또는 \n\n 기준) */
function splitIntoBlocks(content: string): string[] {
  // [도형] 마커를 제거하고 블록으로 분할
  const cleaned = content.replace(/\[도형\]/g, '').trim();
  // 빈 줄(\n\n) 또는 단일 줄바꿈으로 분할
  const blocks = cleaned.split(/\n{2,}/).filter(b => b.trim().length > 0);
  // 분할 결과가 1개면 줄단위로 재분할
  if (blocks.length <= 1) {
    const lineBlocks = cleaned.split('\n').filter(b => b.trim().length > 0);
    return lineBlocks.length > 1 ? lineBlocks : blocks;
  }
  return blocks;
}

/** 현재 콘텐츠에서 [도형] 마커의 블록 인덱스 찾기 (0 = 맨 위, blocks.length = 맨 아래) */
function findCurrentFigurePosition(content: string): number {
  const lines = content.split('\n');
  let blockIdx = 0;
  for (const line of lines) {
    if (line.trim() === '[도형]') return blockIdx;
    if (line.trim().length > 0) blockIdx++;
  }
  return -1; // [도형] 없음
}

/** 블록 배열과 도형 위치 인덱스로 최종 콘텐츠 조합 */
function assembleContent(blocks: string[], figurePosition: number): string {
  const result: string[] = [];
  for (let i = 0; i <= blocks.length; i++) {
    if (i === figurePosition) {
      result.push('[도형]');
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
  onSave,
  onCancel,
}: ImagePositionEditorProps) {
  const blocks = useMemo(() => splitIntoBlocks(content), [content]);

  // 초기 도형 위치: 기존 [도형] 마커 위치 또는 맨 아래
  const initialPos = useMemo(() => {
    const pos = findCurrentFigurePosition(content);
    return pos >= 0 ? pos : blocks.length; // 기본: 맨 아래
  }, [content, blocks.length]);

  const [figurePosition, setFigurePosition] = useState(initialPos);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragItemRef = useRef<HTMLDivElement>(null);

  const moveUp = useCallback(() => {
    setFigurePosition(prev => Math.max(0, prev - 1));
  }, []);

  const moveDown = useCallback(() => {
    setFigurePosition(prev => Math.min(blocks.length, prev + 1));
  }, [blocks.length]);

  const handleSave = useCallback(() => {
    const assembled = assembleContent(blocks, figurePosition);
    onSave(assembled);
  }, [blocks, figurePosition, onSave]);

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

  const hasFigure = figureData || figureSvg || cropImageUrl;

  return (
    <div className="flex flex-col gap-2">
      {/* 헤더: 안내 + 저장/취소 */}
      <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/30">
        <div className="flex items-center gap-1.5 text-xs text-violet-300">
          <ImageIcon className="h-3.5 w-3.5" />
          <span>이미지를 드래그하거나 화살표로 위치 조정</span>
        </div>
        <div className="flex items-center gap-1">
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

      {/* 콘텐츠 블록 + 드래그 가능한 이미지 */}
      <div className="space-y-0">
        {blocks.map((block, blockIdx) => (
          <React.Fragment key={blockIdx}>
            {/* 도형 드롭 존 (블록 앞) */}
            <DropZone
              idx={blockIdx}
              isActive={figurePosition === blockIdx}
              isDragOver={dragOverIdx === blockIdx}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => setFigurePosition(blockIdx)}
            />

            {/* 도형이 이 위치에 있을 때 표시 */}
            {figurePosition === blockIdx && hasFigure && (
              <DraggableFigure
                ref={dragItemRef}
                figureData={figureData}
                figureSvg={figureSvg}
                cropImageUrl={cropImageUrl}
                onDragStart={handleDragStart}
                onMoveUp={moveUp}
                onMoveDown={moveDown}
                canMoveUp={figurePosition > 0}
                canMoveDown={figurePosition < blocks.length}
              />
            )}

            {/* 텍스트 블록 */}
            <div className="px-2 py-1 rounded hover:bg-zinc-800/30 transition-colors">
              <MixedContentRenderer
                content={block}
                className="text-sm text-content-secondary leading-relaxed"
              />
            </div>
          </React.Fragment>
        ))}

        {/* 마지막 드롭 존 */}
        <DropZone
          idx={blocks.length}
          isActive={figurePosition === blocks.length}
          isDragOver={dragOverIdx === blocks.length}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => setFigurePosition(blocks.length)}
        />

        {/* 도형이 맨 아래에 있을 때 표시 */}
        {figurePosition === blocks.length && hasFigure && (
          <DraggableFigure
            ref={dragItemRef}
            figureData={figureData}
            figureSvg={figureSvg}
            cropImageUrl={cropImageUrl}
            onDragStart={handleDragStart}
            onMoveUp={moveUp}
            onMoveDown={moveDown}
            canMoveUp={figurePosition > 0}
            canMoveDown={false}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// DropZone — 드래그 앤 드롭 영역
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
  if (isActive) return null; // 이미 도형이 있는 위치는 드롭 존 숨김

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
// DraggableFigure — 드래그 가능한 도형/이미지 카드
// ============================================================================

const DraggableFigure = React.forwardRef<
  HTMLDivElement,
  {
    figureData?: InterpretedFigure;
    figureSvg?: string;
    cropImageUrl?: string;
    onDragStart: (e: React.DragEvent) => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
  }
>(function DraggableFigure(
  { figureData, figureSvg, cropImageUrl, onDragStart, onMoveUp, onMoveDown, canMoveUp, canMoveDown },
  ref
) {
  return (
    <div
      ref={ref}
      draggable
      onDragStart={onDragStart}
      className="group/figure flex items-start gap-1.5 mx-2 my-1 p-2 rounded-lg border-2 border-violet-500/40 bg-violet-500/5 cursor-grab active:cursor-grabbing transition-all hover:border-violet-500/60"
    >
      {/* 드래그 핸들 + 이동 버튼 */}
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

      {/* 도형/이미지 렌더링 */}
      <div className="flex-1 flex justify-center">
        <FigureRenderer
          figureData={figureData}
          figureSvg={figureSvg}
          cropImageUrl={cropImageUrl}
          maxWidth={260}
          darkMode
        />
      </div>
    </div>
  );
});
