'use client';

// ============================================================================
// RootProviders — 클라이언트 컴포넌트 boundary
//
// RootLayout (server component) 안에서 SubjectTrackProvider 등 클라이언트
// Context 를 마운트하기 위한 wrapper. 표준 Next.js App Router 패턴.
//
// 추가 Context 가 생기면 이 파일에 묶음.
// ============================================================================

import { SubjectTrackProvider } from '@/contexts/SubjectTrackContext';

export function RootProviders({ children }: { children: React.ReactNode }) {
  return <SubjectTrackProvider>{children}</SubjectTrackProvider>;
}
