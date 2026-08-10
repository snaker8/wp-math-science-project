import { redirect } from 'next/navigation';

// /student 랜딩은 실데이터 대시보드로 위임 — 목업 랜딩 노출 방지 (P0)
export default function StudentIndexPage() {
  redirect('/student/dashboard');
}
