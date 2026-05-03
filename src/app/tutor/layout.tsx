'use client';

// ============================================================================
// /tutor/* 레이아웃 — /dashboard 와 동일한 TopNav 적용
//
// 기존: 자체 좌측 사이드바 (light → dark 톤만 맞춰놨던 prototype 잔재).
// 변경: TopNav 단일 네비게이션. /dashboard 와 톤·간격·아이콘·토큰 완전 일치.
// 페이지 URL 은 그대로 (/tutor/classes 등) — 북마크/기존 링크 보호.
// ============================================================================

import { TopNav } from '@/components/layout/TopNav';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';

export default function TutorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
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
    </div>
  );
}
