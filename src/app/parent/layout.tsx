'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { parentNavItems } from '@/config/navigation';

export default function ParentLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20 md:pb-0">
            {/* Mobile Header */}
            <header className="bg-white border-b border-gray-100 p-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <span className="font-serif font-bold text-xl text-slate-800">Parent<span className="text-indigo-600">Portal</span></span>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">김민수 학부모님</span>
                    <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Parents" alt="Avatar" />
                    </div>
                </div>
            </header>

            <main className="max-w-md mx-auto md:max-w-4xl min-h-[calc(100vh-60px)]">
                {children}
            </main>

            {/* Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-gray-200 px-10 py-3 flex justify-between items-center z-50 md:hidden">
                {parentNavItems.map((item) => {
                    const isActive = pathname?.startsWith(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex flex-col items-center gap-1 transition-colors ${isActive ? 'text-indigo-700' : 'text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                            <span className="text-[10px] font-medium">{item.label}</span>
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
