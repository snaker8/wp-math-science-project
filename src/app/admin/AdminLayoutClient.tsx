'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Users,
  UserCog,
  BookOpen,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Wrench,
  Home,
  ChevronRight,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: '개요',
    items: [
      { href: '/admin/dashboard', label: '대시보드', icon: LayoutDashboard, description: '관리자 홈' },
    ],
  },
  {
    label: '운영 관리',
    items: [
      { href: '/admin/institutes', label: '학원·센터', icon: Building2, description: '학원/센터 추가·관리' },
      { href: '/admin/users', label: '사용자 배정', icon: UserCog, description: '학원/역할 배정' },
      { href: '/admin/teachers', label: '교직원 권한', icon: Users, description: '강사 권한 세팅' },
      { href: '/admin/notices', label: '공지 관리', icon: Bell, description: '시스템 공지 작성' },
    ],
  },
  {
    label: '도구',
    items: [
      { href: '/admin/answer-fix', label: '객관식 정답 회복', icon: Wrench },
      { href: '/admin/problems', label: '문제 관리', icon: BookOpen },
      { href: '/admin/analytics', label: '통계', icon: BarChart3 },
    ],
  },
  {
    label: '시스템',
    items: [
      { href: '/admin/settings', label: '설정', icon: Settings },
      { href: '/dashboard', label: '메인으로', icon: Home },
    ],
  },
];

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    if (supabaseBrowser) {
      await supabaseBrowser.auth.signOut();
    }
    // ★ 트랙 선택 쿠키 삭제 — 다음 로그인 시 /select-track 카드 다시 표시
    if (typeof document !== 'undefined') {
      document.cookie = 'track-chosen=; path=/; max-age=0';
    }
    router.push('/auth/login');
  };

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 inset-x-0 h-14 z-30 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur flex items-center px-4 gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300"
          aria-label="메뉴 열기"
        >
          <Menu size={20} />
        </button>
        <span className="text-sm font-bold">관리자 콘솔</span>
      </header>

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col
          transform transition-transform md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Header / Logo */}
        <div className="h-14 px-5 flex items-center justify-between border-b border-zinc-800 shrink-0">
          <Link href="/admin/dashboard" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg bg-white/[.06] border border-white/[.14] flex items-center justify-center group-hover:border-white/25 transition-colors">
              <LayoutDashboard size={14} className="text-content-secondary" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight">관리자 콘솔</div>
            </div>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400"
            aria-label="메뉴 닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all
                        ${isActive
                          ? 'bg-white/[.08] text-content-primary border border-white/[.14]'
                          : 'text-zinc-400 hover:bg-zinc-900 hover:text-white border border-transparent'
                        }
                      `}
                    >
                      <Icon
                        size={16}
                        className={isActive ? 'text-content-primary' : 'text-zinc-600 group-hover:text-zinc-300'}
                      />
                      <span className="flex-1 font-medium">{item.label}</span>
                      {isActive && <ChevronRight size={12} className="text-content-tertiary" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer — Logout */}
        <div className="border-t border-zinc-800 p-3">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
          >
            <LogOut size={16} />
            <span className="font-medium">로그아웃</span>
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 md:ml-64 pt-14 md:pt-0 min-h-screen">
        {children}
      </main>
    </div>
  );
}
