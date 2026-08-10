import { redirect } from 'next/navigation';

// 목업 결제 페이지 — 가짜 납부 내역 노출 방지, 결제 기능 연동 전까지 비노출 (P0)
export default function ParentPaymentPage() {
  redirect('/parent');
}
