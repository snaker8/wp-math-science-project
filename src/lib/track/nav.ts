// ============================================================================
// 네비게이션 항목에 트랙 prefix 일괄 적용 (PR-T7)
// ----------------------------------------------------------------------------
// 기존 navigation.ts 의 NavItem[] / NavGroup[] 을 변환만 함 — navigation.ts
// 자체는 손대지 않음. 트랙 비대상 경로 (/admin, /support 등) 는 trackHref 가
// 그대로 둠.
//
// import { dashboardNavItems } from '@/config/navigation';
// const items = withTrackHref(dashboardNavItems, 'math');
// // items[0].href === '/math/dashboard'
// ============================================================================

import type { NavItem, NavGroup } from '@/config/navigation';
import type { SubjectTrack } from '@/lib/subject-track';
import { trackHref } from './href';

export function withTrackHref(items: NavItem[], track: SubjectTrack): NavItem[] {
  return items.map((item) => ({
    ...item,
    href: trackHref(item.href, track),
  }));
}

export function withTrackGroups(groups: NavGroup[], track: SubjectTrack): NavGroup[] {
  return groups.map((group) => ({
    ...group,
    href: group.href ? trackHref(group.href, track) : undefined,
    children: group.children ? withTrackHref(group.children, track) : undefined,
  }));
}
