'use client';

// ============================================================================
// SubjectTrackContext — 활성 트랙 + 접근 가능 트랙 관리 (클라이언트)
//
// feature flag false 인 동안:
//   - accessibleTracks = ['math'], activeTrack = 'math' 강제
//   - /api/users/me/track 호출 안 함 → 운영 동작 영향 0
//
// feature flag true 가 되면:
//   - 마운트 시 GET /api/users/me/track → DB 값으로 hydrate
//   - setActiveTrack 호출 → PATCH 후 로컬 상태 갱신
//
// Phase 2 단계: Provider 정의만. 호출처 (RootLayout 또는 (tracks) 라우트
// 그룹) 은 PR-T3 에서 추가. 즉 이 파일이 import 안 되면 운영 동작 변경 0.
// ============================================================================

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { TRACK_SPLIT_ENABLED } from '@/lib/featureFlags';
import {
  DEFAULT_SUBJECT_TRACK,
  isSubjectTrack,
  type SubjectTrack,
} from '@/types/track';

interface SubjectTrackContextValue {
  activeTrack: SubjectTrack;
  accessibleTracks: SubjectTrack[];
  setActiveTrack: (track: SubjectTrack) => Promise<void>;
  isLoading: boolean;
  isEnabled: boolean;
}

const SubjectTrackContext = createContext<SubjectTrackContextValue | null>(null);

// ★ 2026-06-03 perf: in-flight dedup. SubjectTrackProvider 가 다중 마운트
//   (RootProviders + (tracks)/[track]/dashboard/layout) + StrictMode 이중 호출로
//   /api/users/me/track 이 화면당 4회 호출 (스샷 3s ×4). 진행 중 요청을 공유.
//   flag false 일 때는 fetch 자체를 안 함 → 영향 0 (기존 가드 유지).
interface TrackFetchResult {
  tracks: SubjectTrack[];
  active: SubjectTrack;
}
let inflightTrack: Promise<TrackFetchResult | null> | null = null;

function fetchTrackOnce(): Promise<TrackFetchResult | null> {
  if (inflightTrack) return inflightTrack;
  inflightTrack = (async () => {
    try {
      const res = await fetch('/api/users/me/track', { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      const tracks = Array.isArray(data?.subject_tracks)
        ? (data.subject_tracks as unknown[]).filter(isSubjectTrack)
        : [DEFAULT_SUBJECT_TRACK];
      const active = isSubjectTrack(data?.active_subject_track)
        ? (data.active_subject_track as SubjectTrack)
        : DEFAULT_SUBJECT_TRACK;
      return {
        tracks: tracks.length > 0 ? tracks : [DEFAULT_SUBJECT_TRACK],
        active,
      };
    } catch {
      return null; // 네트워크 에러 — 기본값 유지
    } finally {
      inflightTrack = null;
    }
  })();
  return inflightTrack;
}

interface SubjectTrackProviderProps {
  children: React.ReactNode;
  /**
   * SSR 시 미리 계산된 초기값 (선택).
   * 일반적으로 RootLayout 의 server component 가 InstituteAccessScope 에서 추출해 전달.
   */
  initialAccessibleTracks?: SubjectTrack[];
  initialActiveTrack?: SubjectTrack;
}

export function SubjectTrackProvider({
  children,
  initialAccessibleTracks,
  initialActiveTrack,
}: SubjectTrackProviderProps) {
  const [accessibleTracks, setAccessibleTracks] = useState<SubjectTrack[]>(
    initialAccessibleTracks && initialAccessibleTracks.length > 0
      ? initialAccessibleTracks
      : [DEFAULT_SUBJECT_TRACK]
  );
  const [activeTrack, setActiveTrackState] = useState<SubjectTrack>(
    initialActiveTrack && isSubjectTrack(initialActiveTrack)
      ? initialActiveTrack
      : DEFAULT_SUBJECT_TRACK
  );
  const [isLoading, setIsLoading] = useState<boolean>(TRACK_SPLIT_ENABLED && !initialActiveTrack);

  // flag false 인 동안: 호출 자체를 안 함. 운영 영향 0.
  useEffect(() => {
    if (!TRACK_SPLIT_ENABLED) return;
    if (initialActiveTrack && initialAccessibleTracks) return; // SSR 으로 hydrate 끝

    let cancelled = false;
    fetchTrackOnce()
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setAccessibleTracks(result.tracks);
          setActiveTrackState(result.active);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialAccessibleTracks, initialActiveTrack]);

  const setActiveTrack = useCallback(
    async (track: SubjectTrack) => {
      if (!TRACK_SPLIT_ENABLED) return; // no-op
      if (!accessibleTracks.includes(track)) {
        throw new Error(`Track '${track}' not in accessibleTracks`);
      }
      const res = await fetch('/api/users/me/track', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `PATCH failed: ${res.status}`);
      }
      setActiveTrackState(track);
    },
    [accessibleTracks]
  );

  const value: SubjectTrackContextValue = {
    activeTrack,
    accessibleTracks,
    setActiveTrack,
    isLoading,
    isEnabled: TRACK_SPLIT_ENABLED,
  };

  return <SubjectTrackContext.Provider value={value}>{children}</SubjectTrackContext.Provider>;
}

/**
 * 활성 트랙 hook. Provider 없으면 'math' 단일 fallback (기존 컴포넌트 호환).
 */
export function useSubjectTrack(): SubjectTrackContextValue {
  const ctx = useContext(SubjectTrackContext);
  if (ctx) return ctx;
  // Provider 없는 경로 (PR-T3 이전) → 기본값 반환. 운영 영향 0.
  return {
    activeTrack: DEFAULT_SUBJECT_TRACK,
    accessibleTracks: [DEFAULT_SUBJECT_TRACK],
    setActiveTrack: async () => {
      // no-op
    },
    isLoading: false,
    isEnabled: TRACK_SPLIT_ENABLED,
  };
}
