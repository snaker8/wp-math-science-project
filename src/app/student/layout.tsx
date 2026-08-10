'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ClipboardList, User } from 'lucide-react';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // 실제 동작하는 기능만 탭에 노출 (목업 페이지 링크 제거 — P0)
  const navItems = [
    { id: 'home', label: '홈', icon: Home, href: '/student/dashboard' },
    { id: 'exams', label: '시험', icon: ClipboardList, href: '/student/exams' },
    { id: 'profile', label: '내 정보', icon: User, href: '/student/profile' },
  ];

  // Check if we are in a "Solving" page which might need Zen mode (no nav)
  const isSolving = pathname?.includes('/solve/');

  return (
    <div className="min-h-screen bg-gray-50 text-zinc-900 font-sans pb-20 md:pb-0">
      {/* Mobile Header (Optional, mostly for branding) */}
      <header className="bg-white border-b border-gray-100 p-4 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-base font-bold tracking-tight text-indigo-600">Math×Sci Bank</h1>
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
          <User size={18} />
        </div>
      </header>

      <main className="max-w-md mx-auto md:max-w-4xl md:p-6 min-h-[calc(100vh-60px)]">
        {children}
      </main>

      {/* Bottom Navigation (Mobile Only) */}
      {!isSolving && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-gray-200 px-6 py-3 flex justify-around items-center z-50 md:hidden">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex flex-col items-center gap-1 transition-colors ${isActive ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
                  }`}
              >
                <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
