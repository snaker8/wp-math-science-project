// ============================================================================
// /admin/staff — /admin/teachers 로 통합 redirect (2026-05-17)
//
// 배경:
//   - /admin/staff 는 mock 데이터 전용 페이지였고 메뉴에서도 누락된 고아 페이지
//   - 사용자 정책: 교직원 관리는 /admin/teachers 한 곳으로 통합 (강사 + ORG_ADMIN(비본부))
//   - 옛 북마크·딥링크 호환을 위해 단순 redirect 처리 (404 회피)
// ============================================================================

import { redirect } from 'next/navigation';

export default function StaffPage() {
  redirect('/admin/teachers');
}
