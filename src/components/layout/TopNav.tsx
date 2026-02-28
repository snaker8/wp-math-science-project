'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Settings, LogOut, HelpCircle } from 'lucide-react';
import { topNavGroups, type NavGroup, type NavItem, findActiveNavItem } from '@/config/navigation';

// ============================================================================
// TopNav — 상단 가로 네비게이션 (참조사이트 스타일)
// ============================================================================

export function TopNav() {
  const pathname = usePathname();
  const activeItem = findActiveNavItem(pathname);

  return (
    <nav className="sticky top-0 z-50 h-14 border-b bg-surface-card/95 backdrop-blur-md">
      <div className="flex h-full items-center justify-between px-6 max-w-screen-2xl mx-auto">
        {/* ── Left: 로고 + 탭 ── */}
        <div className="flex items-center gap-1">
          {/* 로고 */}
          <Link href="/dashboard" className="flex items-center mr-6 shrink-0">
            <span className="text-content-primary font-bold text-base">
              과사람
            </span>
          </Link>

          {/* 메뉴 탭 */}
          <div className="flex items-center gap-0.5">
            {topNavGroups.map((group) => (
              <NavTab
                key={group.id}
                group={group}
                pathname={pathname}
                activeItem={activeItem}
              />
            ))}
          </div>
        </div>

        {/* ── Right: 설정 + 사용자 ── */}
        <div className="flex items-center gap-2">
          <Link
            href="/support"
            className="p-2 rounded-lg text-content-tertiary hover:text-content-secondary hover:bg-surface-raised transition-colors"
          >
            <HelpCircle size={18} />
          </Link>
          <Link
            href="/dashboard/settings"
            className="p-2 rounded-lg text-content-tertiary hover:text-content-secondary hover:bg-surface-raised transition-colors"
          >
            <Settings size={18} />
          </Link>
          <div className="w-px h-6 bg-surface-raised mx-1" />
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-raised transition-colors">
            <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center">
              <span className="text-accent text-xs font-semibold">임</span>
            </div>
            <span className="text-content-secondary text-sm hidden md:block">임세현</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

// ============================================================================
// NavTab — 개별 탭 (직접 링크 or 드롭다운)
// ============================================================================

function NavTab({
  group,
  pathname,
  activeItem,
}: {
  group: NavGroup;
  pathname: string;
  activeItem: NavItem | undefined;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  // 활성 여부 판단
  const isActive = group.href
    ? pathname === group.href
    : group.children?.some(
        (child) => pathname === child.href || pathname.startsWith(child.href + '/')
      );

  // 직접 링크
  if (group.href && !group.children) {
    return (
      <Link
        href={group.href}
        className={`
          flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
          ${isActive
            ? 'text-accent bg-accent-muted'
            : 'text-content-secondary hover:text-content-primary hover:bg-surface-raised'
          }
        `}
      >
        <group.icon size={16} />
        <span>{group.label}</span>
      </Link>
    );
  }

  // 드롭다운
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`
          flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
          ${isActive
            ? 'text-accent bg-accent-muted'
            : 'text-content-secondary hover:text-content-primary hover:bg-surface-raised'
          }
        `}
      >
        <group.icon size={16} />
        <span>{group.label}</span>
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-1 w-64 rounded-xl border bg-surface-card shadow-xl shadow-black/20 overflow-hidden z-50"
          >
            <div className="py-1.5">
              {group.children?.map((item) => {
                const isChildActive =
                  pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`
                      flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
                      ${isChildActive
                        ? 'text-accent bg-accent-muted'
                        : 'text-content-secondary hover:text-content-primary hover:bg-surface-raised'
                      }
                    `}
                  >
                    <item.icon
                      size={16}
                      className={isChildActive ? 'text-accent' : 'text-content-tertiary'}
                    />
                    <div>
                      <div className="font-medium">{item.label}</div>
                      {item.description && (
                        <div className="text-xs text-content-tertiary mt-0.5">
                          {item.description}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default TopNav;
