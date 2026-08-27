'use client';

import { TopNav } from '@/components/layout/TopNav';
import { BatchSolutionNotifier } from '@/components/BatchSolutionNotifier';

// ★ 2026-06-03: 페이지 전환마다 걸리던 framer-motion opacity 페이드(150ms 게이트) 제거.
//   매 이동 시 전체 children 서브트리에 fade in/out 을 적용해 전환을 지연시켰음.
//   children 을 즉시 렌더 → 전환 체감속도 개선 (데이터·로직 무관, 순수 연출 제거).
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-surface-base text-content-primary selection:bg-accent/30">
      {/* 배경 깊이 — 상단 중앙에서 퍼지는 아주 옅은 액센트 광원. 표면이 "층"으로 읽히게 하는 바탕광 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background:
            'radial-gradient(60% 100% at 50% 0%, rgba(99,102,241,0.07) 0%, rgba(99,102,241,0.02) 45%, transparent 100%)',
        }}
      />
      <TopNav />
      <main className="relative min-h-[calc(100vh-3.5rem)] px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-screen-2xl">{children}</div>
      </main>
      <BatchSolutionNotifier />
    </div>
  );
}
