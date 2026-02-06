'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
    LayoutDashboard,
    UploadCloud,
    Users,
    BrainCircuit,
    Settings,
    LogOut,
    ChevronRight
} from 'lucide-react';

const MENU_ITEMS = [
    { name: '대시보드', href: '/dashboard', icon: LayoutDashboard },
    { name: '문제 업로드', href: '/dashboard/upload', icon: UploadCloud },
    { name: '반 관리', href: '/dashboard/classes', icon: Users },
    { name: 'AI 처방', href: '/dashboard/ai-prescription', icon: BrainCircuit },
    { name: '설정', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 border-r border-white/10 bg-black text-white">
            <div className="flex h-16 items-center px-6 border-b border-white/5">
                <span className="text-lg font-bold tracking-tight">과사람</span>
                <span className="ml-2 rounded bg-indigo-500/10 px-1.5 py-0.5 text-xs font-medium text-indigo-400">
                    PRO
                </span>
            </div>

            <nav className="flex-1 space-y-1 px-4 py-6">
                {MENU_ITEMS.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isActive
                                    ? 'bg-zinc-900 text-white'
                                    : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-100'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <Icon
                                    size={18}
                                    className={`transition-colors duration-200 ${isActive ? 'text-indigo-500' : 'text-zinc-500 group-hover:text-zinc-300'
                                        }`}
                                />
                                <span>{item.name}</span>
                            </div>
                            {isActive && (
                                <motion.div
                                    layoutId="sidebar-active"
                                    className="h-1.5 w-1.5 rounded-full bg-indigo-500"
                                />
                            )}
                        </Link>
                    );
                })}
            </nav>

            <div className="border-t border-white/5 p-4">
                <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-900/50 hover:text-zinc-100">
                    <LogOut size={18} />
                    <span>로그아웃</span>
                </button>
            </div>
        </aside>
    );
}
