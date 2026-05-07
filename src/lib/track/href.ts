// ============================================================================
// 트랙 prefix URL 헬퍼 (PR-T7 — URL 라우팅 분리 foundation)
// ----------------------------------------------------------------------------
// 트랙 분기 대상은 /dashboard, /student 두 영역만.
// /admin, /parent, /tutor, /auth, /select-track, 외부 URL 등은 그대로 둠.
//
// trackHref('/dashboard/repository', 'math')   → '/math/dashboard/repository'
// trackHref('/dashboard',            'science')→ '/science/dashboard'
// trackHref('/admin/staff',          'math')   → '/admin/staff' (변경 X)
// trackHref('/math/dashboard',       'math')   → '/math/dashboard' (이미 prefix)
// ============================================================================

import type { SubjectTrack } from '@/lib/subject-track';

const TRACK_SCOPED_PREFIXES = ['/dashboard', '/student'] as const;
const ALREADY_PREFIXED = ['/math', '/science'] as const;

export function trackHref(path: string, track: SubjectTrack): string {
  if (!path || typeof path !== 'string') return path;

  for (const p of ALREADY_PREFIXED) {
    if (path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`)) {
      return path;
    }
  }

  for (const p of TRACK_SCOPED_PREFIXES) {
    if (path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`)) {
      return `/${track}${path}`;
    }
  }

  return path;
}

interface RouterLike {
  push(href: string): void;
  replace?(href: string): void;
}

export function trackPush(router: RouterLike, path: string, track: SubjectTrack): void {
  router.push(trackHref(path, track));
}

export function trackReplace(router: RouterLike, path: string, track: SubjectTrack): void {
  if (router.replace) router.replace(trackHref(path, track));
  else router.push(trackHref(path, track));
}
