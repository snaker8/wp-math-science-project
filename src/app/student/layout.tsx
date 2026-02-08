'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, Bot, User } from 'lucide-react';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { id: 'home', label: '홈', icon: Home, href: '/student' },
    { id: 'study', label: '학습', icon: BookOpen, href: '/student/study' },
    { id: 'ai', label: 'AI 튜터', icon: Bot, href: '/student/ai-tutor' },
    { id: 'profile', label: '내 정보', icon: User, href: '/student/profile' },
  ];

  // Check if we are in a "Solving" page which might need Zen mode (no nav)
  const isSolving = pathname?.includes('/solve/');

  return (
    <div className="min-h-screen bg-gray-50 text-zinc-900 font-sans pb-20 md:pb-0">
      {/* Mobile Header (Optional, mostly for branding) */}
      <header className="bg-white border-b border-gray-100 p-4 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-lg font-bold tracking-tight text-indigo-600">With-People</h1>
        <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="Avatar" />
        </div>
      </header>

      <main className="max-w-md mx-auto md:max-w-4xl md:p-6 min-h-[calc(100vh-60px)]">
        {children}
      </main>

      {/* Bottom Navigation (Mobile Only) */}
      {!isSolving && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-gray-200 px-6 py-3 flex justify-between items-center z-50 md:hidden">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
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
