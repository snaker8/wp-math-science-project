'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Settings, LogOut, HelpCircle, User } from 'lucide-react';
import { topNavGroups, type NavGroup, type NavItem, findActiveNavItem } from '@/config/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

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
          <UserMenu />
        </div>
      </div>
    </nav>
  );
}

// ============================================================================
// UserMenu — 사용자 아이콘 클릭 시 드롭다운 (프로필 / 로그아웃)
// ============================================================================
function UserMenu() {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string>('');
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // ★ 실제 로그인 사용자 정보 fetch — 하드코딩 "임세현" 제거 사고 (사용자 보고).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabaseBrowser) return;
      try {
        const { data: { user } } = await supabaseBrowser.auth.getUser();
        if (cancelled || !user) return;
        // 1순위: users 테이블의 name. 2순위: auth metadata. 3순위: email 앞부분.
        const { data: userRow } = await supabaseBrowser
          .from('users')
          .select('name')
          .eq('id', user.id)
          .maybeSingle();
        const name =
          (userRow as { name?: string } | null)?.name ||
          (user.user_metadata?.name as string | undefined) ||
          (user.user_metadata?.full_name as string | undefined) ||
          (user.email ? user.email.split('@')[0] : '') ||
          '사용자';
        if (!cancelled) setDisplayName(name);
      } catch (err) {
        console.warn('[TopNav] 사용자 정보 fetch 실패:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  const handleLogout = async () => {
    setOpen(false);
    if (supabaseBrowser) {
      await supabaseBrowser.auth.signOut();
    }
    router.push('/auth/login');
  };

  // 이니셜 — 한글이면 첫 글자, 영문이면 대문자 첫 글자
  const initial = displayName ? displayName.charAt(0) : '?';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-raised transition-colors"
        aria-label="사용자 메뉴"
      >
        <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center">
          <span className="text-accent text-xs font-semibold">{initial}</span>
        </div>
        <span className="text-content-secondary text-sm hidden md:block">
          {displayName || '...'}
        </span>
        <ChevronDown
          size={14}
          className={`text-content-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-1 w-48 rounded-xl border bg-surface-card shadow-xl shadow-black/20 overflow-hidden z-50"
          >
            <div className="py-1.5">
              <Link
                href="/dashboard/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-content-secondary hover:text-content-primary hover:bg-surface-raised transition-colors"
              >
                <User size={16} className="text-content-tertiary" />
                <span>프로필 / 설정</span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-content-secondary hover:text-red-400 hover:bg-surface-raised transition-colors"
              >
                <LogOut size={16} className="text-content-tertiary" />
                <span>로그아웃</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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

  // ★ DB 자산화 — 특수 처리: 클라우드 페이지면 글로벌 이벤트, 다른 페이지면 router.push.
  //   Next.js Link 가 같은 URL 로는 navigation 안 일으키는 회귀 차단 (PR #47/#49 사고).
  if (group.id === 'db-assetize') {
    return <DbAssetizeTab group={group} isActive={!!isActive} pathname={pathname} />;
  }

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

// ============================================================================
// DbAssetizeTab — DB 자산화 단독 탭. Link 가 같은 URL 로 navigation 안 일으키는
// 문제 회피용. pathname 보고 분기.
//   - 클라우드 페이지: window.dispatchEvent('cloud:open-upload') → CloudListClient
//                     가 즉시 모달 오픈
//   - 다른 페이지: router.push('/dashboard/cloud?upload=1') → 마운트 시 모달
// ============================================================================
function DbAssetizeTab({
  group,
  isActive,
  pathname,
}: {
  group: NavGroup;
  isActive: boolean;
  pathname: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (pathname.startsWith('/dashboard/cloud')) {
          // 같은 페이지 — 즉시 모달
          window.dispatchEvent(new CustomEvent('cloud:open-upload'));
        } else {
          // 다른 페이지 — 이동 (?upload=1 으로 mount 시 자동 오픈)
          router.push('/dashboard/cloud?upload=1');
        }
      }}
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
    </button>
  );
}

export default TopNav;
