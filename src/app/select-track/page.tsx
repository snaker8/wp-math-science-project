'use client';

// ============================================================================
// /select-track — 트랙 선택 카드 페이지
//
// 용도:
//   - 사용자가 직접 진입했을 때 활성 트랙을 카드로 선택
//   - 토글 UI 외의 보조 진입 경로 (예: 첫 가입 시 안내 링크)
//
// 동작:
//   - feature flag false → /dashboard 로 즉시 redirect (의미 없는 페이지)
//   - 단일 트랙만 가진 사용자 → /dashboard 로 즉시 redirect
//   - 두 트랙 사용자 → 카드 표시, 클릭 시 setActiveTrack + /dashboard 이동
// ============================================================================

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSubjectTrack } from '@/contexts/SubjectTrackContext';
import type { SubjectTrack } from '@/types/track';

export default function SelectTrackPage() {
  const { activeTrack, accessibleTracks, setActiveTrack, isEnabled, isLoading } =
    useSubjectTrack();
  const router = useRouter();

  // flag false 또는 단일 트랙 → /dashboard 자동 이동
  useEffect(() => {
    if (isLoading) return;
    if (!isEnabled || accessibleTracks.length < 2) {
      router.replace('/dashboard');
    }
  }, [isEnabled, isLoading, accessibleTracks, router]);

  const handleSelect = async (track: SubjectTrack) => {
    try {
      await setActiveTrack(track);
      router.push('/dashboard');
    } catch (e) {
      console.error('[SelectTrack] setActiveTrack 실패:', e);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-base text-content-tertiary">
        불러오는 중...
      </div>
    );
  }

  // redirect 결정 동안 빈 화면 (useEffect 가 처리)
  if (!isEnabled || accessibleTracks.length < 2) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base p-4">
      <div className="max-w-md w-full">
        <h1 className="text-2xl font-bold text-content-primary mb-2 text-center">
          과목 선택
        </h1>
        <p className="text-sm text-content-tertiary text-center mb-8">
          진행할 트랙을 선택하세요. 언제든 상단 토글로 다시 변경할 수 있습니다.
        </p>
        <div className="grid grid-cols-2 gap-4">
          {accessibleTracks.includes('math') && (
            <TrackCard
              label="수학"
              description="수학비서 분류 · 시험지 · 진단"
              icon="∑"
              isActive={activeTrack === 'math'}
              onClick={() => handleSelect('math')}
            />
          )}
          {accessibleTracks.includes('science') && (
            <TrackCard
              label="과학"
              description="통합과학 · 물리 · 화학 · 생명 · 지구"
              icon="⚛"
              isActive={activeTrack === 'science'}
              onClick={() => handleSelect('science')}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TrackCard({
  label,
  description,
  icon,
  isActive,
  onClick,
}: {
  label: string;
  description: string;
  icon: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-6 rounded-xl border transition-all text-left ${
        isActive
          ? 'border-accent bg-accent/10'
          : 'border-subtle bg-surface-raised hover:border-accent/50 hover:bg-surface-raised/80'
      }`}
    >
      <div
        className={`text-3xl mb-3 ${
          isActive ? 'text-accent' : 'text-content-secondary'
        }`}
      >
        {icon}
      </div>
      <div
        className={`text-base font-semibold mb-1 ${
          isActive ? 'text-accent' : 'text-content-primary'
        }`}
      >
        {label}
      </div>
      <div className="text-xs text-content-tertiary">{description}</div>
    </button>
  );
}
