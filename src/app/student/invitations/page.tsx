import { redirect } from 'next/navigation';

// 초대 수락/거절은 대시보드에서 실데이터로 처리됨 — 목업 초대 목록 노출 방지 (P0)
export default function StudentInvitationsPage() {
  redirect('/student/dashboard');
}
