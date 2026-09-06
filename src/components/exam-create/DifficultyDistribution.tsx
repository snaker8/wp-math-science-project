'use client';

// ============================================================================
// 난이도 분포 카운터 — 출제 화면의 심장 (docs/PLAN_EXAM_LINE_DESIGN.md S1)
// ----------------------------------------------------------------------------
// 매쓰홀릭 출제 화면 실측(benchmark/02): 개념 14 · 기본 14 · 실력 22 · 심화 18 · 고난도 0.
// 유형을 고르는 즉시 구성이 보이고, 편중되면 바로 조정한다 — 「탁탁 자유롭게」의 실체.
//
// ★ 밴드는 판(유형분석)과 같은 체계를 쓴다 — lib/class/mastery-bands 의 5단.
//   출제 화면만 다른 말을 쓰면 「실력이 모자라다」가 두 화면에서 다른 뜻이 된다.
// ★ 미분류(난이도 없는 문제)를 숨기지 않는다. 지금 분류가 진행 중이라 섞여 들어온다 —
//   숨기면 분포가 사실보다 고르게 보인다.
// ============================================================================

import React, { useMemo } from 'react';
import { BAND_SCHEMES, bandOf } from '@/lib/class/mastery-bands';

interface DifficultyDistributionProps {
  /** 고른 문제들의 난이도 (1~10, 없으면 null/0) */
  difficulties: Array<number | null | undefined>;
  compact?: boolean;
}

const BANDS = BAND_SCHEMES[5];
const BAR: Record<string, string> = {
  A: 'bg-sky-500/70',
  B: 'bg-emerald-500/70',
  C: 'bg-amber-500/70',
  D: 'bg-orange-500/70',
  E: 'bg-rose-500/70',
};
const LEVEL_RANGE: Record<string, string> = {
  A: '1~3', B: '4~5', C: '6~7', D: '8~9', E: '10',
};

export function DifficultyDistribution({ difficulties, compact = false }: DifficultyDistributionProps) {
  const { counts, known, unknown, max } = useMemo(() => {
    const c: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    let none = 0;
    for (const d of difficulties) {
      const band = bandOf(d ?? null, 5);
      if (band) c[band] += 1;
      else none += 1;
    }
    const total = difficulties.length - none;
    return { counts: c, known: total, unknown: none, max: Math.max(...Object.values(c)) };
  }, [difficulties]);

  if (difficulties.length === 0) return null;

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <div className="flex items-baseline justify-between text-[10px] text-zinc-500">
        <span>난이도 분포</span>
        <span className="tabular-nums">
          {known}문항
          {unknown > 0 && <span className="ml-1 text-amber-400/80">· 미분류 {unknown}</span>}
        </span>
      </div>

      <div className="space-y-0.5">
        {BANDS.map((b) => {
          const cnt = counts[b.key] ?? 0;
          const pct = known > 0 ? Math.round((cnt * 100) / known) : 0;
          const width = max > 0 ? (cnt / max) * 100 : 0;
          return (
            <div key={b.key} className="flex items-center gap-1.5" title={`${b.label} (난이도 ${LEVEL_RANGE[b.key]}) ${cnt}문항${known > 0 ? ` · ${pct}%` : ''}`}>
              <span className={`w-8 shrink-0 text-[10px] ${cnt > 0 ? 'text-zinc-300' : 'text-zinc-600'}`}>{b.label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-sm bg-zinc-800">
                <span
                  className={`block h-full rounded-sm transition-all ${BAR[b.key]} ${cnt === 0 ? 'opacity-0' : ''}`}
                  style={{ width: `${Math.max(width, cnt > 0 ? 6 : 0)}%` }}
                />
              </span>
              <span className={`w-5 shrink-0 text-right text-[10px] tabular-nums ${cnt > 0 ? 'text-zinc-200' : 'text-zinc-600'}`}>{cnt}</span>
              {!compact && (
                <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-zinc-500">{cnt > 0 ? `${pct}%` : ''}</span>
              )}
            </div>
          );
        })}
      </div>

      {unknown > 0 && !compact && (
        <p className="text-[10px] leading-relaxed text-zinc-600">
          미분류 {unknown}문항은 난이도가 아직 안 붙어 분포에서 빠집니다. 분류가 끝나면 자동으로 잡힙니다.
        </p>
      )}
    </div>
  );
}
