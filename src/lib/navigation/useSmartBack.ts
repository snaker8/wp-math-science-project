'use client';

// ============================================================================
// useSmartBack — "뒤로가기" 를 직전 페이지로.
//   앱 내 이력이 있으면 router.back() (직전 페이지), 없으면(직접 진입·새 탭·
//   외부 유입) fallbackHref 로 push. 기존에 고정 경로로만 push 하던 뒤로가기를
//   대체해도 회귀 없음(이력 없을 때 동작은 종전과 동일).
//
// 사용:
//   const goBack = useSmartBack('/dashboard/cloud');
//   <button onClick={goBack}>← 뒤로</button>
// ============================================================================

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

/**
 * @param fallbackHref 이력이 없을 때 이동할 경로 (기존 고정 뒤로가기 대상)
 */
export function useSmartBack(fallbackHref: string) {
  const router = useRouter();
  return useCallback(() => {
    // 앱 내에서 넘어온 이력이 있으면 직전 페이지로. (history.length>1 + referrer 동일 출처)
    if (typeof window !== 'undefined') {
      const sameOriginRef = !!document.referrer && (() => {
        try { return new URL(document.referrer).origin === window.location.origin; }
        catch { return false; }
      })();
      // history 가 쌓여 있고(2+), 직전이 같은 사이트면 back. 그 외엔 fallback.
      if (window.history.length > 1 && (sameOriginRef || window.history.length > 2)) {
        router.back();
        return;
      }
    }
    router.push(fallbackHref);
  }, [router, fallbackHref]);
}
