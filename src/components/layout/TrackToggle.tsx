'use client';

// ============================================================================
// TrackToggle — TopNav 안 segmented control (수학 | 과학)
//
// 노출 조건: feature flag true AND accessibleTracks.length >= 2
//   - flag false → null
//   - 단일 트랙 사용자 (대부분) → null
//   - 두 트랙 모두 가진 사용자 (예: snaker8 super_admin) → 노출
//
// 클릭 동작 (PR-T9):
//   1. setActiveTrack(track) → PATCH /api/users/me/track + 'track-chosen' 쿠키 갱신
//   2. router.push(현재 path 의 [track] 부분만 교체) → URL 즉시 변경, 새 트랙 페이지 렌더
// ============================================================================

import { usePathname, useRouter } from 'next/navigation';
import { useSubjectTrack } from '@/contexts/SubjectTrackContext';
import { trackHref } from '@/lib/track/href';
import type { SubjectTrack } from '@/types/track';

// /math/dashboard/X · /science/dashboard/X · /dashboard/X 모두 처리해
// 첫 세그먼트의 트랙 prefix 만 교체 (또는 추가) 한 path 반환.
function swapTrackInPath(pathname: string, newTrack: SubjectTrack): string {
  const stripped = pathname.replace(/^\/(math|science)(?=\/|$)/, '') || '/';
  return trackHref(stripped, newTrack);
}

export function TrackToggle() {
  const { activeTrack, accessibleTracks, setActiveTrack, isEnabled, isLoading } =
    useSubjectTrack();
  const router = useRouter();
  const pathname = usePathname();

  // 노출 조건 검사 — flag false 또는 단일 트랙이면 렌더링 0
  if (!isEnabled || accessibleTracks.length < 2 || isLoading) return null;

  const handleClick = async (track: SubjectTrack) => {
    if (track === activeTrack) return; // 이미 활성, no-op
    try {
      await setActiveTrack(track);
      // URL 의 [track] 만 교체 — 동일 페이지를 새 트랙으로 본다.
      // /dashboard 영역이 아니면 trackHref 가 path 그대로 반환 → router.push 가 no-op refresh.
      const target = swapTrackInPath(pathname, track);
      router.push(target);
    } catch (e) {
      console.error('[TrackToggle] setActiveTrack 실패:', e);
    }
  };

  return (
    <div
      role="group"
      aria-label="과목 트랙 전환"
      className="inline-flex items-center rounded-lg border border-subtle bg-surface-raised/40 p-0.5"
    >
      <TrackButton
        label="수학"
        active={activeTrack === 'math'}
        onClick={() => handleClick('math')}
      />
      <TrackButton
        label="과학"
        active={activeTrack === 'science'}
        onClick={() => handleClick('science')}
      />
    </div>
  );
}

function TrackButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
        active
          ? 'bg-accent/20 text-accent'
          : 'text-content-tertiary hover:text-content-secondary hover:bg-surface-raised'
      }`}
    >
      {label}
    </button>
  );
}
