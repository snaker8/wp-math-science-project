'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import {
  dashboardNavItems,
  tutorNavItems,
  systemNavItems,
  supportNavItems,
  type NavItem,
} from '@/config/navigation';

// 상단 메뉴 (문제 은행 관련)
const mainMenuItems = dashboardNavItems;

// 중간 메뉴 (수업/채점 관련)
const tutorMenuItems = tutorNavItems;

// 하단 메뉴 (시스템)
const bottomMenuItems = [...systemNavItems, ...supportNavItems];

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={`group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isActive
          ? 'bg-surface-card text-white'
          : 'text-content-secondary hover:bg-surface-card/50 hover:text-content-primary'
        }`}
    >
      <div className="flex items-center gap-3">
        <Icon
          size={18}
          className={`transition-colors duration-200 ${isActive ? 'text-indigo-500' : 'text-content-tertiary group-hover:text-content-secondary'
            }`}
        />
        <span>{item.label}</span>
      </div>
      {isActive && (
        <motion.div
          layoutId="sidebar-active"
          className="h-1.5 w-1.5 rounded-full bg-indigo-500"
        />
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    if (supabaseBrowser) {
      await supabaseBrowser.auth.signOut();
    }
    router.push('/auth/login');
  };

  const isItemActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border bg-surface-base text-white flex flex-col">
      {/* 로고 */}
      <Link href="/dashboard" className="flex h-16 items-center px-6 border-b border-subtle hover:bg-surface-card/30 transition-colors">
        <span className="text-lg font-bold tracking-tight">과사람</span>
        <span className="ml-2 rounded bg-indigo-500/10 px-1.5 py-0.5 text-xs font-medium text-indigo-400">
          PRO
        </span>
      </Link>

      {/* 스크롤 가능한 메뉴 영역 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* 메인 메뉴 (문제 은행) */}
        <nav className="px-4 py-4">
          <div className="mb-2 px-3 text-xs font-semibold text-content-tertiary uppercase tracking-wider">
            문제 은행
          </div>
          <div className="space-y-1">
            {mainMenuItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                isActive={isItemActive(item.href)}
              />
            ))}
          </div>
        </nav>

        {/* 구분선 */}
        <div className="mx-4 border-t border-subtle" />

        {/* 튜터 메뉴 (수업/채점) */}
        <nav className="px-4 py-4">
          <div className="mb-2 px-3 text-xs font-semibold text-content-tertiary uppercase tracking-wider">
            수업 관리
          </div>
          <div className="space-y-1">
            {tutorMenuItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                isActive={isItemActive(item.href)}
              />
            ))}
          </div>
        </nav>
      </div>

      {/* 하단 고정 메뉴 */}
      <div className="border-t border-subtle p-4 space-y-1">
        {bottomMenuItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            isActive={isItemActive(item.href)}
          />
        ))}

        {/* 로그아웃 버튼 */}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-card/50 hover:text-content-primary"
        >
          <LogOut size={18} className="text-content-tertiary" />
          <span>로그아웃</span>
        </button>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </aside>
  );
}
