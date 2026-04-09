import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ★ 개발 중 로그인 비활성화
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
