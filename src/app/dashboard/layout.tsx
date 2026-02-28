'use client';

import { TopNav } from '@/components/layout/TopNav';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
