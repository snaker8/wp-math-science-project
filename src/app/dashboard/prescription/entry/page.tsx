'use client';

// src/app/dashboard/prescription/entry/page.tsx
// 진단 결과 입력 라우트 — 실제 폼은 ManualGradingEntry.tsx (채점 허브 탭과 공용).
// ★ Next.js page 파일은 임의 named export 금지(타입 에러) → 컴포넌트 분리.

import { ManualGradingEntry } from './ManualGradingEntry';

export default function EntryPage() {
  return <ManualGradingEntry />;
}
