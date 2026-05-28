'use client';

import React, { useMemo } from 'react';

interface DifficultyDistributionProps {
  difficulties: number[];
  compact?: boolean;
}

const BAR_COLOR_BY_BAND: Record<string, string> = {
  low: 'bg-emerald-500/70',
  mid: 'bg-amber-500/70',
  high: 'bg-rose-500/70',
};

function bandOf(d: number): 'low' | 'mid' | 'high' {
  if (d <= 3) return 'low';
  if (d <= 7) return 'mid';
  return 'high';
}

export function DifficultyDistribution({ difficulties, compact = false }: DifficultyDistributionProps) {
  const { counts, total, max } = useMemo(() => {
    const c = new Map<number, number>();
    for (let i = 1; i <= 10; i++) c.set(i, 0);
    let unknown = 0;
    for (const d of difficulties) {
      if (d >= 1 && d <= 10) c.set(d, (c.get(d) || 0) + 1);
      else unknown += 1;
    }
    const totalKnown = difficulties.length - unknown;
    let maxCount = 0;
    c.forEach((v) => { if (v > maxCount) maxCount = v; });
    return { counts: c, total: totalKnown, max: maxCount };
  }, [difficulties]);

  if (difficulties.length === 0) return null;

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <div className="flex items-center justify-between text-[10px] text-zinc-500">
        <span>난이도 분포</span>
        <span className="tabular-nums">전체 {total}문항</span>
      </div>
      <div className="flex h-12 items-end gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((d) => {
          const cnt = counts.get(d) || 0;
          const pct = max > 0 ? (cnt / max) * 100 : 0;
          return (
            <div key={d} className="group relative flex flex-1 flex-col items-center justify-end">
              <div
                className={`w-full rounded-sm transition-all ${BAR_COLOR_BY_BAND[bandOf(d)]} ${cnt === 0 ? 'opacity-20' : ''}`}
                style={{ height: cnt > 0 ? `${Math.max(pct, 6)}%` : '2px' }}
                title={`난이도 ${d}: ${cnt}문항`}
              />
              {cnt > 0 && (
                <span className="pointer-events-none absolute -top-3.5 text-[9px] font-bold tabular-nums text-zinc-300">
                  {cnt}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[9px] text-zinc-500 tabular-nums">
        <span>1</span>
        <span>3</span>
        <span>5</span>
        <span>7</span>
        <span>10</span>
      </div>
    </div>
  );
}
