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

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Sigma, FlaskConical, ArrowRight, type LucideIcon } from 'lucide-react';
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
      {/* 배경 ambient 글로우 */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full bg-indigo-500/5 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[28rem] h-[28rem] rounded-full bg-emerald-500/5 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative max-w-xl w-full"
      >
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent mb-3">
            과목 선택
          </h1>
          <p className="text-sm text-content-tertiary leading-relaxed">
            진행할 트랙을 선택하세요. 언제든 상단 토글로 다시 변경할 수 있습니다.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accessibleTracks.includes('math') && (
            <TrackCard
              track="math"
              label="수학"
              description="문제은행 · 시험지 · 진단"
              Icon={Sigma}
              isActive={activeTrack === 'math'}
              onClick={() => handleSelect('math')}
            />
          )}
          {accessibleTracks.includes('science') && (
            <TrackCard
              track="science"
              label="과학"
              description="통합과학 · 물리 · 화학 · 생명 · 지구"
              Icon={FlaskConical}
              isActive={activeTrack === 'science'}
              onClick={() => handleSelect('science')}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
}

const TRACK_PALETTE = {
  math: {
    iconBg: 'bg-indigo-500/10',
    iconColor: 'text-indigo-300',
    border: 'border-indigo-500/20',
    borderHover: 'hover:border-indigo-500/50',
    activeBorder: 'border-indigo-500/60',
    activeRing: 'ring-2 ring-indigo-500/30',
    glow: 'before:bg-indigo-500/5',
  },
  science: {
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-300',
    border: 'border-emerald-500/20',
    borderHover: 'hover:border-emerald-500/50',
    activeBorder: 'border-emerald-500/60',
    activeRing: 'ring-2 ring-emerald-500/30',
    glow: 'before:bg-emerald-500/5',
  },
} as const;

function TrackCard({
  track,
  label,
  description,
  Icon,
  isActive,
  onClick,
}: {
  track: SubjectTrack;
  label: string;
  description: string;
  Icon: LucideIcon;
  isActive: boolean;
  onClick: () => void;
}) {
  const c = TRACK_PALETTE[track];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={`
        group relative overflow-hidden text-left
        p-6 rounded-2xl border bg-surface-raised/40 backdrop-blur-sm
        transition-colors
        before:absolute before:inset-0 before:opacity-0 before:transition-opacity
        hover:before:opacity-100 ${c.glow}
        ${isActive ? `${c.activeBorder} ${c.activeRing}` : `${c.border} ${c.borderHover}`}
      `}
    >
      <div className="relative">
        {/* 아이콘 */}
        <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${c.iconBg} mb-5`}>
          <Icon className={`w-6 h-6 ${c.iconColor}`} strokeWidth={1.75} />
        </div>

        {/* 라벨 + 설명 */}
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="text-base font-semibold text-content-primary mb-1">
              {label}
            </div>
            <div className="text-xs text-content-tertiary leading-relaxed">
              {description}
            </div>
          </div>
          {/* hover 시 화살표 — 진입 의미 시각화 */}
          <div
            className={`shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${c.iconColor}`}
            aria-hidden
          >
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </motion.button>
  );
}
