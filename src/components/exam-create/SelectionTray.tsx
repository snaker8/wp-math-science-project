'use client';

import React, { useState } from 'react';
import { Reorder } from 'framer-motion';
import { X, GripVertical, ChevronRight, Trash2, ChevronDown } from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { DifficultyDistribution } from './DifficultyDistribution';

export interface PickedProblem {
  id: string;
  content_latex: string;
  typeCode: string;
  difficulty: number;
  sourceName: string | null;
  sourceYear: number | null;
}

interface SelectionTrayProps {
  picked: PickedProblem[];
  onReorder: (next: PickedProblem[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onCompose: () => void;
}

export function SelectionTray({ picked, onReorder, onRemove, onClear, onCompose }: SelectionTrayProps) {
  const [open, setOpen] = useState(false);

  if (picked.length === 0) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 top-1/2 z-40 -translate-y-1/2 flex flex-col items-center gap-1.5 rounded-l-xl border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-3 text-cyan-300 shadow-2xl hover:bg-cyan-500/25"
          title="선택한 문항 보기"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          <span className="text-xs font-bold tabular-nums">{picked.length}</span>
        </button>
      )}

      {open && (
        <div className="fixed right-0 top-0 z-50 flex h-full w-[380px] flex-col border-l border-cyan-500/30 bg-zinc-950/95 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-cyan-300">선택한 문항</span>
              <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300 tabular-nums">
                {picked.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-900 hover:text-white"
              title="닫기"
            >
              <ChevronDown className="h-4 w-4 -rotate-90" />
            </button>
          </div>

          <div className="border-b border-zinc-800 px-4 py-3">
            <DifficultyDistribution difficulties={picked.map((p) => p.difficulty)} compact />
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            <Reorder.Group axis="y" values={picked} onReorder={onReorder} className="space-y-1.5">
              {picked.map((p, idx) => (
                <Reorder.Item
                  key={p.id}
                  value={p}
                  className="group rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5 hover:border-zinc-700"
                  whileDrag={{ scale: 1.02, borderColor: 'rgb(34 211 238 / 0.6)' }}
                >
                  <div className="flex items-start gap-2">
                    <GripVertical className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 cursor-grab text-zinc-600 group-hover:text-zinc-400 active:cursor-grabbing" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-zinc-400 tabular-nums">
                            {idx + 1}
                          </span>
                          {p.difficulty > 0 && (
                            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-bold text-amber-300">
                              난이도 {p.difficulty}
                            </span>
                          )}
                          {p.typeCode && (
                            <code className="truncate text-zinc-500">{p.typeCode}</code>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemove(p.id)}
                          className="rounded p-0.5 text-zinc-600 opacity-0 hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"
                          title="제거"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="line-clamp-2 text-[11px] text-zinc-300">
                        <MixedContentRenderer content={(p.content_latex || '').slice(0, 160)} />
                      </div>
                      {p.sourceName && (
                        <div className="mt-1 truncate text-[10px] text-zinc-500">
                          {p.sourceName}{p.sourceYear ? ` · ${p.sourceYear}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          </div>

          <div className="border-t border-zinc-800 p-3 space-y-2">
            <button
              type="button"
              onClick={onCompose}
              className="w-full rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-4 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/30"
            >
              시험지 편성 →
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`선택한 ${picked.length}개 문항을 모두 비우시겠어요?`)) onClear();
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-[11px] text-zinc-400 hover:bg-zinc-900 hover:text-rose-300"
            >
              <Trash2 className="h-3 w-3" />
              선택 비우기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
