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
//
// ★ 2026-08-28 디자인 시스템 통일: 인디고/에메랄드 2색 카드 → 무채 표면 +
//   한글 모노그램(수/과). 선택·hover 는 밝기만. framer 입장 애니 제거(정적).
// ============================================================================

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useSubjectTrack } from '@/contexts/SubjectTrackContext';
import { trackHref } from '@/lib/track/href';
import type { SubjectTrack } from '@/types/track';

export default function SelectTrackPage() {
  const { activeTrack, accessibleTracks, setActiveTrack, isEnabled, isLoading } =
    useSubjectTrack();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams?.get('redirect') || '/dashboard';
  const autoPickTriedRef = useRef(false);

  // flag false → /dashboard 즉시 redirect (의미 없는 페이지)
  // 단일 트랙 사용자 → 그 트랙 자동 PATCH (쿠키 set) 후 /{track}/dashboard
  // 두 트랙 사용자 → 카드 표시 (아래 render)
  useEffect(() => {
    if (isLoading) return;
    if (!isEnabled) {
      router.replace(redirectTarget);
      return;
    }
    if (accessibleTracks.length < 2 && !autoPickTriedRef.current) {
      autoPickTriedRef.current = true;
      const onlyTrack = accessibleTracks[0];
      // setActiveTrack 이 PATCH 호출 → 서버가 track-chosen 쿠키 set
      // 트랙 prefix 적용된 path 로 redirect → middleware 추가 redirect 회피
      setActiveTrack(onlyTrack)
        .catch((e) => console.warn('[SelectTrack] auto-pick 실패:', e))
        .finally(() => router.replace(trackHref(redirectTarget, onlyTrack)));
    }
  }, [isEnabled, isLoading, accessibleTracks, router, redirectTarget, setActiveTrack]);

  const handleSelect = async (track: SubjectTrack) => {
    try {
      await setActiveTrack(track);
      // 트랙 prefix 적용된 path 로 push → middleware 추가 redirect 회피
      router.push(trackHref(redirectTarget, track));
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
    <div className="relative min-h-screen flex items-center justify-center bg-surface-base p-4 overflow-hidden">
      {/* 배경 깊이 — 앱과 동일한 상단 중앙 무채 광원 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background:
            'radial-gradient(60% 100% at 50% 0%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 45%, transparent 100%)',
        }}
      />

      <div className="relative w-full max-w-xl">
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-2xl font-bold tracking-tight text-content-primary">과목 선택</h1>
          <p className="text-sm leading-relaxed text-content-tertiary">
            진행할 트랙을 선택하세요. 언제든 상단 토글로 다시 변경할 수 있습니다.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {accessibleTracks.includes('math') && (
            <TrackCard
              label="수학"
              monogram="수"
              description="문제은행 · 시험지 · 진단"
              isActive={activeTrack === 'math'}
              onClick={() => handleSelect('math')}
            />
          )}
          {accessibleTracks.includes('science') && (
            <TrackCard
              label="과학"
              monogram="과"
              description="통합과학 · 물리 · 화학 · 생명 · 지구"
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
  monogram,
  description,
  isActive,
  onClick,
}: {
  label: string;
  /** 한글 모노그램 — 아이콘 라이브러리 대신 타이포 정체성 */
  monogram: string;
  description: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        group relative rounded-xl border p-6 text-left transition-[transform,box-shadow,border-color,background-color] duration-150
        shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_40px_-20px_rgba(0,0,0,0.55)]
        [background-image:linear-gradient(180deg,rgba(255,255,255,0.03),transparent_120px)]
        hover:-translate-y-px
        ${isActive
          ? 'border-white/[.18] bg-white/[.07]'
          : 'border-white/[.08] bg-surface-card/40 hover:border-white/[.14] hover:bg-white/[.04]'}
      `}
    >
      {/* 한글 모노그램 */}
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-white/[.10] bg-white/[.05] text-lg font-bold text-content-primary">
        {monogram}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 text-base font-semibold text-content-primary">{label}</div>
          <div className="text-xs leading-relaxed text-content-tertiary">{description}</div>
        </div>
        <div
          className="shrink-0 text-content-tertiary opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        >
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </button>
  );
}
