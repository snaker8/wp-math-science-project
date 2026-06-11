'use client';

// ============================================================================
// 리포트 공유 프리미티브 — 다크 zinc 디자인 언어 (Panel / StatCard / Gauge / 톤)
//   진단 세트 종합 리포트(ComprehensiveReportView)와 개별 시험 리포트
//   (StudentExamReportDark)가 동일 비주얼을 쓰도록 추출. 표시 전용.
// ============================================================================

import React from 'react';
import type { Achievement } from '@/lib/diagnostics/report-narrative';

export const LEVEL_TONE: Record<
  Achievement,
  { text: string; bar: string; bg: string; border: string; stroke: string; emoji: string }
> = {
  strong:  { text: 'text-emerald-300', bar: 'bg-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', stroke: '#10b981', emoji: '🟢' },
  caution: { text: 'text-amber-300',   bar: 'bg-amber-500',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   stroke: '#f59e0b', emoji: '🟡' },
  weak:    { text: 'text-rose-300',    bar: 'bg-rose-500',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    stroke: '#f43f5e', emoji: '🔴' },
};

export function Panel({ title, icon, hint, children, className = '' }: {
  title: string; icon?: React.ReactNode; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 ${className}`}>
      <div className="mb-4 flex items-baseline gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-white">{icon}{title}</div>
        {hint && <span className="text-[10px] text-zinc-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, icon, accent = 'text-white' }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; accent?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">{icon}{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${accent}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

export function Gauge({ pct, stroke }: { pct: number | null; stroke: string }) {
  const r = 52, c = 2 * Math.PI * r, val = Math.max(0, Math.min(100, pct ?? 0));
  const dash = (val / 100) * c;
  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28 flex-shrink-0">
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(39 39 42)" strokeWidth="10" />
      <circle cx="60" cy="60" r={r} fill="none" stroke={stroke} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`} transform="rotate(-90 60 60)" />
      <text x="60" y="60" textAnchor="middle" className="fill-white" style={{ fontSize: 24, fontWeight: 700 }}>
        {pct != null ? `${Math.round(pct)}` : '-'}
      </text>
      <text x="60" y="78" textAnchor="middle" className="fill-zinc-500" style={{ fontSize: 10 }}>정답률 %</text>
    </svg>
  );
}
