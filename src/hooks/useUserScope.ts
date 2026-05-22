// ============================================================================
// useUserScope — 현재 사용자의 organization·institute 정보 (TopNav·라벨 표시용)
//
// 사용 예:
//   const { organizationName, instituteName, loading } = useUserScope();
//   <span>{organizationName ?? '과사람'}클라우드</span>
//
// 캐시: sessionStorage (탭 단위). 로그아웃·새로고침 마다 다시 fetch.
//   (localStorage 는 학원 변경 시 즉시 반영 안 됨 — 보수적으로 session)
// ============================================================================

'use client';

import { useEffect, useState } from 'react';

export interface UserScope {
  organizationId: string | null;
  organizationName: string | null;
  instituteId: string | null;
  instituteName: string | null;
  role: string | null;
  isSuperAdmin: boolean;
}

const CACHE_KEY = 'user-scope-cache-v1';

function readCache(): UserScope | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserScope;
  } catch {
    return null;
  }
}

function writeCache(scope: UserScope) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(scope));
  } catch {
    // 무시 (저장소 가득 등)
  }
}

export function useUserScope(): { scope: UserScope | null; loading: boolean } {
  const [scope, setScope] = useState<UserScope | null>(() => readCache());
  const [loading, setLoading] = useState(scope === null);

  useEffect(() => {
    let cancelled = false;
    const fetchScope = async () => {
      try {
        const res = await fetch('/api/me/scope', { cache: 'no-store' });
        if (!res.ok) {
          // 비로그인 등 — 캐시 비우고 종료
          if (!cancelled) {
            setScope(null);
            setLoading(false);
            if (typeof window !== 'undefined') sessionStorage.removeItem(CACHE_KEY);
          }
          return;
        }
        const data = (await res.json()) as UserScope;
        if (cancelled) return;
        setScope(data);
        writeCache(data);
      } catch {
        // 네트워크 오류 — 캐시 유지 (있으면)
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchScope();
    return () => {
      cancelled = true;
    };
  }, []);

  return { scope, loading };
}

/**
 * organization name 만 빠르게 — 클라우드 라벨 등에서 사용.
 * 로딩 중 / 비로그인 / 미지정 시 fallback 반환 (기본 '과사람').
 *
 * @example
 *   const orgName = useOrganizationName('과사람');
 *   <span>{orgName}클라우드</span>
 */
export function useOrganizationName(fallback = '과사람'): string {
  const { scope } = useUserScope();
  return scope?.organizationName ?? fallback;
}
