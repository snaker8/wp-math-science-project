'use client';

// ============================================================================
// 트랙 인지(track-aware) React hooks (PR-T7)
// ----------------------------------------------------------------------------
// useTrackHref()   — string path 를 활성 트랙 prefix 적용된 path 로 변환
// useTrackRouter() — next/navigation useRouter 의 push/replace/prefetch 를
//                    자동으로 trackHref 적용하는 wrapper
//
// 사용법:
//   const router = useTrackRouter();
//   router.push('/dashboard/repository');  // → /math/dashboard/repository
//
//   const href = useTrackHref();
//   <Link href={href('/dashboard/foo')}>이동</Link>
//
// 참조: 현재 SubjectTrackContext (PR-T2) 는 { activeTrack, ... } 반환.
//       활성 트랙이 항상 set 되어 있어 fallback 없이도 안전.
// ============================================================================

import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { useSubjectTrack } from '@/contexts/SubjectTrackContext';
import { DEFAULT_SUBJECT_TRACK } from '@/lib/subject-track';
import { trackHref } from './href';

export function useTrackHref(): (path: string) => string {
  const { activeTrack } = useSubjectTrack();
  const trackKey = activeTrack ?? DEFAULT_SUBJECT_TRACK;
  return useCallback((path: string) => trackHref(path, trackKey), [trackKey]);
}

interface NavigateOptions {
  scroll?: boolean;
}

export function useTrackRouter() {
  const router = useRouter();
  const href = useTrackHref();
  return useMemo(
    () => ({
      push: (path: string, options?: NavigateOptions) => router.push(href(path), options),
      replace: (path: string, options?: NavigateOptions) =>
        router.replace(href(path), options),
      prefetch: (path: string) => router.prefetch(href(path)),
      back: () => router.back(),
      forward: () => router.forward(),
      refresh: () => router.refresh(),
    }),
    [router, href]
  );
}
