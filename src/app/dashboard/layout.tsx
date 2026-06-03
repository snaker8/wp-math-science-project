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
    <div className="min-h-screen bg-surface-base text-content-primary selection:bg-accent/30">
      <TopNav />
      <main className="min-h-[calc(100vh-3.5rem)] px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-screen-2xl">{children}</div>
      </main>
      <BatchSolutionNotifier />
    </div>
  );
}
