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

// ★ 2026-06-03 perf: in-flight 요청 dedup.
//   useUserScope 를 쓰는 컴포넌트(TopNav·페이지·useOrganizationName 등)가 동시
//   마운트되면 각자 /api/me/scope 를 fetch → 동일 요청 N개 동시 발사(2.2s ×2 사고).
//   진행 중 요청이 있으면 그 Promise 를 공유해 1개로 합침. 데이터·캐시·로딩·신선도
//   모두 불변 — 동시 중복 네트워크 호출만 제거(마운트마다 refresh 하는 기존 동작 유지).
let inflightScope: Promise<UserScope | null> | null = null;

function fetchScopeOnce(): Promise<UserScope | null> {
  if (inflightScope) return inflightScope; // 진행 중 요청에 합류
  inflightScope = (async () => {
    try {
      const res = await fetch('/api/me/scope', { cache: 'no-store' });
      if (!res.ok) {
        // 비로그인 등 — 캐시 비우고 null
        if (typeof window !== 'undefined') sessionStorage.removeItem(CACHE_KEY);
        return null;
      }
      const data = (await res.json()) as UserScope;
      writeCache(data);
      return data;
    } finally {
      inflightScope = null; // 다음 마운트는 새로 refresh (기존 동작 유지)
    }
  })();
  return inflightScope;
}

export function useUserScope(): { scope: UserScope | null; loading: boolean } {
  // ★ 2026-06-03 hydration fix: 초기 useState 에서 readCache() 호출 금지.
  //   서버 렌더는 sessionStorage 없어 null, 클라 첫 렌더는 캐시 있으면 객체 →
  //   조건부 렌더(TopNav 학원명 라벨의 lucide <svg> 등)가 서버/클라 불일치 →
  //   React #418 hydration 에러. SSR/CSR 둘 다 null 로 시작 → 일치.
  //   캐시 적용은 mount 후(=hydration 이후) effect 에서 즉시 setScope → 깜빡임 미세.
  const [scope, setScope] = useState<UserScope | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // 1) 캐시 즉시 반영 (hydration 직후, 한 프레임 내) — 라벨 깜빡임 최소화
    const cached = readCache();
    if (cached && !cancelled) {
      setScope(cached);
      setLoading(false); // 캐시로 우선 표시. 아래 fetch 가 최신값으로 덮어씀
    }

    // 2) 백그라운드 refresh (in-flight dedup 됨)
    fetchScopeOnce()
      .then((data) => {
        if (cancelled) return;
        setScope(data); // 성공 data / 비로그인 null — 기존 동작과 동일
        setLoading(false);
      })
      .catch(() => {
        // 네트워크 오류 — 캐시 유지(scope 안 건드림), 로딩만 해제
        if (!cancelled) setLoading(false);
      });
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
