'use client';

// ============================================================================
// (tracks)/[track]/dashboard/layout — PR-T8
// ----------------------------------------------------------------------------
// useParams 로 [track] 동적 세그먼트 캡처 → SubjectTrackProvider 의
// initialActiveTrack / initialAccessibleTracks 로 전달. URL 기반 즉시 활성화
// (fetch 깜빡임 방지). 원본 src/app/dashboard/layout.tsx 와 동일 셸 (TopNav 등).
// ============================================================================

import { TopNav } from '@/components/layout/TopNav';
import { BatchSolutionNotifier } from '@/components/BatchSolutionNotifier';
import { SubjectTrackProvider } from '@/contexts/SubjectTrackContext';
import { isSubjectTrack } from '@/lib/subject-track';
import { useParams } from 'next/navigation';

// ★ 2026-06-03: 전환마다 걸리던 framer-motion opacity 페이드(150ms) 제거 — dashboard/layout.tsx 와 동일.
export default function TrackDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ track?: string }>();
  const initialTrack = isSubjectTrack(params?.track) ? params.track : undefined;

  return (
    <SubjectTrackProvider initialActiveTrack={initialTrack}>
      <div className="relative min-h-screen bg-surface-base text-content-primary selection:bg-accent/30">
        {/* 배경 깊이 — 상단 중앙 옅은 액센트 광원 (dashboard/layout.tsx 와 동일) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
          style={{
            background:
              'radial-gradient(60% 100% at 50% 0%, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.015) 45%, transparent 100%)',
          }}
        />
        <TopNav />
        <main className="relative min-h-[calc(100vh-3.5rem)] px-6 lg:px-8 py-6">
          <div className="mx-auto max-w-screen-2xl">{children}</div>
        </main>
        <BatchSolutionNotifier />
      </div>
    </SubjectTrackProvider>
  );
}
