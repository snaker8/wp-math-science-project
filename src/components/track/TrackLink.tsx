'use client';

// ============================================================================
// <TrackLink> — 활성 트랙 자동 prefix 적용 Link (PR-T7)
// ----------------------------------------------------------------------------
// <TrackLink href="/dashboard/repository">시험지저장소</TrackLink>
// → SubjectTrackProvider 가 active='science' 면 /science/dashboard/repository
// → Provider 없으면 useSubjectTrack 의 fallback ('math') 사용
//
// /admin, /parent, /auth 등 트랙 비대상은 trackHref 가 그대로 둠.
// ============================================================================

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { useSubjectTrack } from '@/contexts/SubjectTrackContext';
import { DEFAULT_SUBJECT_TRACK } from '@/lib/subject-track';
import { trackHref } from '@/lib/track/href';

type LinkProps = ComponentProps<typeof Link>;

interface TrackLinkProps extends Omit<LinkProps, 'href'> {
  href: string;
  children?: ReactNode;
}

export function TrackLink({ href, children, ...rest }: TrackLinkProps) {
  const { activeTrack } = useSubjectTrack();
  const finalHref = trackHref(href, activeTrack ?? DEFAULT_SUBJECT_TRACK);
  return (
    <Link href={finalHref} {...rest}>
      {children}
    </Link>
  );
}
