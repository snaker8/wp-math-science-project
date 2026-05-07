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
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, usePathname } from 'next/navigation';

export default function TrackDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams<{ track?: string }>();
  const initialTrack = isSubjectTrack(params?.track) ? params.track : undefined;

  return (
    <SubjectTrackProvider initialActiveTrack={initialTrack}>
      <div className="min-h-screen bg-surface-base text-content-primary selection:bg-accent/30">
        <TopNav />
        <main className="min-h-[calc(100vh-3.5rem)] px-6 lg:px-8 py-6">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="mx-auto max-w-screen-2xl"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
        <BatchSolutionNotifier />
      </div>
    </SubjectTrackProvider>
  );
}
