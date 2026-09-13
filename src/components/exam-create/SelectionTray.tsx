'use client';

import React, { useMemo, useState } from 'react';
import { Reorder } from 'framer-motion';
import { X, GripVertical, ChevronRight, Trash2, ChevronDown, Repeat2 } from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { DifficultyDistribution } from './DifficultyDistribution';
import { BAND_SCHEMES, bandOf } from '@/lib/class/mastery-bands';
import { CandidatePool } from './CandidatePool';
import type { CandidateProblem } from '@/app/api/problems/candidates/route';

/** 접힌 탭에 붙는 5단 미니 막대 — 트레이를 열지 않아도 편중이 보인다 (설계서 S1) */
const MINI_BAR: Record<string, string> = { A: 'bg-sky-500/80', B: 'bg-emerald-500/80', C: 'bg-amber-500/80', D: 'bg-orange-500/80', E: 'bg-rose-500/80' };

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
  /** 그 자리를 대신한다 — 번호 유지 (설계서 S3) */
  onReplace: (targetId: string, candidate: CandidateProblem) => void;
  /** 맨 뒤에 새 문항으로 붙인다 */
  onAdd: (candidate: CandidateProblem) => void;
}

export function SelectionTray({ picked, onReorder, onRemove, onClear, onCompose, onReplace, onAdd }: SelectionTrayProps) {
  const [open, setOpen] = useState(false);
  /** 후보풀을 열어 둔 문항 — 열리면 트레이가 2분할이 된다 */
  const [focusId, setFocusId] = useState<string | null>(null);

  const miniCounts = useMemo(() => {
    const c: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const p of picked) { const b = bandOf(p.difficulty, 5); if (b) c[b] += 1; }
    return c;
  }, [picked]);
  const miniKnown = Object.values(miniCounts).reduce((n: number, x: number) => n + x, 0);

  if (picked.length === 0) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 top-1/2 z-40 -translate-y-1/2 flex flex-col items-center gap-1.5 rounded-l-xl border border-white/[.14] bg-white/[.08] px-2.5 py-3 text-content-primary backdrop-blur hover:bg-white/[.12]"
          title="선택한 문항 보기"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          <span className="text-xs font-bold tabular-nums">{picked.length}</span>
          {miniKnown > 0 && (
            <span className="flex h-16 w-1.5 flex-col overflow-hidden rounded-full bg-zinc-800" title={BAND_SCHEMES[5].map((b) => `${b.label} ${miniCounts[b.key]}`).join(' · ')}>
              {BAND_SCHEMES[5].map((b) => (
                <span key={b.key} className={MINI_BAR[b.key]} style={{ height: `${(miniCounts[b.key] / miniKnown) * 100}%` }} />
              ))}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className={`fixed right-0 top-0 z-50 flex h-full border-l border-white/[.09] bg-zinc-950/95 backdrop-blur ${focusId ? 'w-[740px]' : 'w-[380px]'}`}>
          <div className="flex h-full w-[380px] shrink-0 flex-col">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-content-primary">선택한 문항</span>
              <span className="rounded-full border border-white/[.08] bg-white/[.04] px-2 py-0.5 text-[11px] font-semibold text-content-secondary tabular-nums">
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
                  whileDrag={{ scale: 1.02, borderColor: 'rgb(255 255 255 / 0.28)' }}
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
                            <span className="rounded border border-white/[.08] bg-white/[.04] px-1.5 py-0.5 font-semibold text-content-secondary tabular-nums">
                              난이도 {p.difficulty}
                            </span>
                          )}
                          {p.typeCode && (
                            <code className="truncate text-zinc-500">{p.typeCode}</code>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setFocusId(focusId === p.id ? null : p.id)}
                            className={`rounded p-0.5 transition-colors ${
                              focusId === p.id ? 'bg-white/15 text-white' : 'text-zinc-600 opacity-0 hover:text-zinc-200 group-hover:opacity-100'
                            }`}
                            title="이 자리에 넣을 후보 보기 (교체·추가)"
                          >
                            <Repeat2 className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemove(p.id)}
                            className="rounded p-0.5 text-zinc-600 opacity-0 hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"
                            title="제거"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
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
              className="w-full whitespace-nowrap rounded-lg border border-white/[.08] bg-white/[.04] px-4 py-2 text-xs font-semibold text-content-secondary hover:bg-white/[.06] hover:text-content-primary"
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

          {/* ❸ 후보풀 — 담은 문항을 고르면 그 옆에 열린다 (2분할) */}
          {focusId && (() => {
            const idx = picked.findIndex((x) => x.id === focusId);
            if (idx < 0) return null;
            return (
              <div className="h-full min-w-0 flex-1">
                <CandidatePool
                  baseId={focusId}
                  baseIndex={idx}
                  excludeIds={picked.map((x) => x.id)}
                  onReplace={(c) => { onReplace(focusId, c); setFocusId(c.id); }}
                  onAdd={(c) => onAdd(c)}
                />
              </div>
            );
          })()}
        </div>
      )}
    </>
  );
}
