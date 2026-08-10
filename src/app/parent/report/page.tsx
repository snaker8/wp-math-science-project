import { redirect } from 'next/navigation';

// 목업 리포트 페이지 — 실데이터 리포트는 /parent/[token] 전용 링크로 제공 (P0)
export default function ParentReportPage() {
  redirect('/parent');
}
