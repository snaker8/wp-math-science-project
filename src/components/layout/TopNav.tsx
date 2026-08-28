'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Settings, LogOut, HelpCircle, User, Building2 } from 'lucide-react';

// dynamic import + ssr:false — 절대 SSR 안 함 → hydration mismatch 원천 차단
const ActiveInstituteSwitcher = dynamic(
  () => import('./ActiveInstituteSwitcher'),
  { ssr: false }
);
import { BrandLogo } from '@/components/brand/Logo';
import { topNavGroups, DB_ASSETIZE_ACTION, type NavGroup, type NavItem, findActiveNavItem } from '@/config/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { TrackToggle } from '@/components/layout/TrackToggle';
import { useSubjectTrack } from '@/contexts/SubjectTrackContext';
import { useUserScope } from '@/hooks/useUserScope';
import { trackHref } from '@/lib/track/href';
import { withTrackGroups } from '@/lib/track/nav';
import { DEFAULT_SUBJECT_TRACK } from '@/lib/subject-track';

// URL 첫 세그먼트의 /math, /science 를 제거 — 활성 메뉴 비교용 정규화 path 생성.
function stripTrackPrefix(pathname: string): string {
  return pathname.replace(/^\/(math|science)(?=\/|$)/, '') || '/';
}

// ============================================================================
// 사용자 role + 표시명 (TopNav 와 UserMenu 공유)
// ============================================================================
function useCurrentUser() {
  const [role, setRole] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabaseBrowser) {
        if (!cancelled) setLoaded(true);
        return;
      }
      try {
        const { data: { user } } = await supabaseBrowser.auth.getUser();
        if (cancelled || !user) {
          if (!cancelled) setLoaded(true);
          return;
        }
        // super_admin 은 auth.users.app_metadata 에 표시됨 (institute-guard.ts:82 패턴).
        // user_metadata 는 사용자 자가 설정 가능 영역 — 보안 가드용으로 부적합.
        // 양쪽 다 검사해서 어느 쪽에 박혀있어도 정확히 잡음.
        const isSuperAdmin =
          user.app_metadata?.super_admin === true ||
          user.user_metadata?.super_admin === true;
        const { data: userRow } = await supabaseBrowser
          .from('users')
          .select('name, role')
          .eq('id', user.id)
          .maybeSingle();
        const row = userRow as { name?: string; role?: string } | null;
        const resolvedRole = isSuperAdmin
          ? 'super_admin'
          : (row?.role || 'STUDENT'); // 안전 fallback — 알 수 없으면 학생 권한
        const name =
          row?.name ||
          (user.user_metadata?.name as string | undefined) ||
          (user.user_metadata?.full_name as string | undefined) ||
          (user.email ? user.email.split('@')[0] : '') ||
          '사용자';
        if (!cancelled) {
          setRole(resolvedRole);
          setDisplayName(name);
          setLoaded(true);
        }
      } catch (err) {
        console.warn('[TopNav] 사용자 정보 fetch 실패:', err);
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { role, displayName, loaded };
}

// ============================================================================
// TopNav — 상단 가로 네비게이션 (참조사이트 스타일)
// ============================================================================

export function TopNav() {
  const pathname = usePathname();
  // 활성 메뉴 비교용 — URL [track] prefix 제거 후 기존 navigation.ts 와 비교
  const normPathname = stripTrackPrefix(pathname);
  const activeItem = findActiveNavItem(normPathname);
  const { role, displayName, loaded } = useCurrentUser();
  const { activeTrack } = useSubjectTrack();
  const track = activeTrack ?? DEFAULT_SUBJECT_TRACK;
  const { scope: userScope } = useUserScope();

  // ★ role 필터 — 그룹의 roles 미지정 시 모두 노출, 지정 시 해당 role 만
  const visibleGroups = topNavGroups.filter((g) => {
    if (!g.roles || g.roles.length === 0) return true;
    if (!role) return false; // 미로딩·미인증 시 권한 메뉴 숨김 (보수적)
    return g.roles.includes(role);
  });
  // ★ 트랙 prefix 일괄 적용 — /dashboard/X → /{track}/dashboard/X (PR-T9)
  const trackedGroups = withTrackGroups(visibleGroups, track);

  return (
    <nav className="sticky top-0 z-50 h-14 border-b border-white/[.06] bg-surface-base/75 backdrop-blur-xl">
      <div className="flex h-full items-center justify-between px-6 max-w-screen-2xl mx-auto">
        {/* ── Left: 로고 + 탭 ── */}
        <div className="flex items-center gap-1">
          {/* 로고 + 학원·센터 표시 — 트랙 prefix 적용
              ★ 학원명 / 센터명 우아하게 표시 (2026-05-17 사용자 요구):
                 로고 우측에 옅은 구분선 + 학원·센터 정보 (조밀, 세련) */}
          <Link href={trackHref('/dashboard', track)} className="flex items-center mr-4 shrink-0 group">
            <BrandLogo size="sm" />
          </Link>
          {userScope?.organizationName && (
            <div className="hidden md:flex items-center mr-6 pl-4 border-l border-zinc-700/40 shrink-0">
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] font-bold text-zinc-200 tracking-tight whitespace-nowrap">
                  {userScope.organizationName}
                </span>
                {userScope.instituteName && userScope.instituteName !== userScope.organizationName && (
                  <span className="text-[9px] text-zinc-500 mt-px whitespace-nowrap">
                    {userScope.instituteName}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 메뉴 탭 — 이미 trackHref 적용된 그룹 사용 */}
          <div className="flex h-14 items-center gap-1">
            {trackedGroups.map((group) => (
              <NavTab
                key={group.id}
                group={group}
                pathname={pathname}
                activeItem={activeItem}
                track={track}
              />
            ))}
          </div>
        </div>

        {/* ── Right: 자산화 액션 + 센터 선택 + 트랙 토글 + 설정 + 사용자 ── */}
        <div className="flex items-center gap-2">
          {/* ★ DB 자산화 — 탭이 아니라 행동. 화면 유일 흰 필 (2026-08-28 IA 재편) */}
          <DbAssetizeButton pathname={pathname} track={track} />
          <ActiveInstituteSwitcher />
          {/* 트랙 토글 — flag true + 다중 트랙일 때만 노출, 그 외엔 null */}
          <TrackToggle />
          <Link
            href="/support"
            className="p-2 rounded-lg text-content-tertiary hover:text-content-secondary hover:bg-surface-raised transition-colors"
          >
            <HelpCircle size={18} />
          </Link>
          <Link
            href={trackHref('/dashboard/settings', track)}
            className="p-2 rounded-lg text-content-tertiary hover:text-content-secondary hover:bg-surface-raised transition-colors"
          >
            <Settings size={18} />
          </Link>
          <div className="w-px h-6 bg-surface-raised mx-1" />
          <UserMenu displayName={displayName} loaded={loaded} />
        </div>
      </div>
    </nav>
  );
}

// ============================================================================
// UserMenu — 사용자 아이콘 클릭 시 드롭다운 (프로필 / 로그아웃)
// ============================================================================
function UserMenu({ displayName, loaded }: { displayName: string; loaded: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { activeTrack } = useSubjectTrack();
  const track = activeTrack ?? DEFAULT_SUBJECT_TRACK;

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
    // ★ 트랙 선택 쿠키 삭제 — 다음 로그인 시 /select-track 카드 다시 표시
    if (typeof document !== 'undefined') {
      document.cookie = 'track-chosen=; path=/; max-age=0';
    }
    router.push('/auth/login');
  };

  // 이니셜 — 한글이면 첫 글자, 영문이면 대문자 첫 글자
  const initial = displayName ? displayName.charAt(0) : (loaded ? '?' : '');

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
                href={trackHref('/dashboard/account', track)}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-content-secondary hover:text-content-primary hover:bg-surface-raised transition-colors"
              >
                <User size={16} className="text-content-tertiary" />
                <span>내 계정 / 비밀번호</span>
              </Link>
              <Link
                href={trackHref('/dashboard/settings', track)}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-content-secondary hover:text-content-primary hover:bg-surface-raised transition-colors"
              >
                <User size={16} className="text-content-tertiary" />
                <span>시스템 설정</span>
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
  track,
}: {
  group: NavGroup;
  pathname: string;
  activeItem: NavItem | undefined;
  track: 'math' | 'science';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const prefetchedRef = useRef(false);

  // ★ 2026-07-02 전환 속도감: 드롭다운 자식 링크는 {open && ...} 로 열렸을 때만
  //   DOM 에 생겨 <Link> 자동 prefetch 가 사실상 안 됨(열고 바로 클릭 → 리드타임 0).
  //   prod 대시보드는 전부 Dynamic 라우트라 미리 안 당기면 클릭 시점에 서버 왕복 전부를 침.
  //   → 트리거 hover/focus 시 자식 href 를 미리 prefetch(라우트당 1회). loading.tsx 경계
  //     덕에 동적 라우트도 이 prefetch 가 의미 있음.
  const prefetchChildren = () => {
    if (prefetchedRef.current || !group.children) return;
    prefetchedRef.current = true;
    for (const item of group.children) {
      try {
        router.prefetch(item.href);
      } catch {
        /* prefetch 실패는 무시 — UX 보조일 뿐 */
      }
    }
  };

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

  // 활성 여부 판단 — group.href / child.href 는 이미 trackHref 적용된 상태,
  // pathname 도 URL track 포함된 상태이므로 그대로 비교 OK.
  const isActive = group.href
    ? pathname === group.href
    : group.children?.some(
        (child) => pathname === child.href || pathname.startsWith(child.href + '/')
      );

  // 직접 링크 — 텍스트 탭 + 하단 액센트 라인 (아이콘은 드롭다운 안에서만)
  if (group.href && !group.children) {
    return (
      <Link
        href={group.href}
        className={`
          relative flex h-14 items-center whitespace-nowrap px-3 text-sm font-medium transition-colors
          ${isActive
            ? 'text-content-primary'
            : 'text-content-tertiary hover:text-content-primary'
          }
        `}
      >
        <span>{group.label}</span>
        {isActive && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent" />}
      </Link>
    );
  }

  // 드롭다운
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        onMouseEnter={prefetchChildren}
        onFocus={prefetchChildren}
        className={`
          relative flex h-14 items-center gap-1 whitespace-nowrap px-3 text-sm font-medium transition-colors
          ${isActive
            ? 'text-content-primary'
            : 'text-content-tertiary hover:text-content-primary'
          }
        `}
      >
        <span>{group.label}</span>
        <ChevronDown
          size={12}
          className={`text-content-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
        {isActive && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent" />}
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
function DbAssetizeButton({
  pathname,
  track,
}: {
  pathname: string;
  track: 'math' | 'science';
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        // pathname 정규화 — /math/dashboard/cloud, /science/dashboard/cloud, /dashboard/cloud 모두 매치
        const stripped = stripTrackPrefix(pathname);
        // ★ 클라우드 리스트 페이지(정확히 /dashboard/cloud)에서만 이벤트 dispatch.
        //   디테일 페이지(/dashboard/cloud/[examId])는 리스너가 없어서 클릭이 무반응이 됨 (2026-05-19 사고).
        const isCloudList = stripped === '/dashboard/cloud' || stripped === '/dashboard/cloud/';
        if (isCloudList) {
          window.dispatchEvent(new CustomEvent('cloud:open-upload'));
        } else {
          router.push(trackHref('/dashboard/cloud?upload=1', track));
        }
      }}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
    >
      <DB_ASSETIZE_ACTION.icon size={15} />
      <span>{DB_ASSETIZE_ACTION.label}</span>
    </button>
  );
}

// ActiveInstituteSwitcher 는 별도 파일 — TopNav 상단에서 next/dynamic + ssr:false 로 import

export default TopNav;
