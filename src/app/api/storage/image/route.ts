// ============================================================================
// GET /api/storage/image?path=problem-crops/upscaled/xxx.png
// Supabase Storage private bucket 프록시
//
// ★ 개선: 기존 서버 다운로드 + 인메모리 캐시(메모리 누수 위험) →
//         Supabase 서명 URL 발급 + 307 리다이렉트로 전환.
//   클라이언트가 Supabase CDN에서 직접 수신 → 서버 메모리/트래픽 대폭 절감.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// 허용된 경로 프리픽스 (보안 화이트리스트)
const ALLOWED_PREFIXES = ['problem-crops/', 'exam-pages/', 'diagram-uploads/'];

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path');

  if (!path) {
    return NextResponse.json({ error: 'path parameter required' }, { status: 400 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  // 경로 검증 (디렉토리 탈출 + 화이트리스트 방식)
  if (path.includes('..') || !ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
  }

  try {
    // 서명 URL 발급 (1시간 유효) — 클라이언트가 Supabase CDN에 직접 접근
    const { data, error } = await supabaseAdmin.storage
      .from('source-files')
      .createSignedUrl(path, 3600);

    if (error || !data?.signedUrl) {
      console.error(`[storage-proxy] Signed URL 생성 실패: ${path}`, error?.message);
      return NextResponse.json(
        { error: 'File not found', detail: error?.message },
        { status: 404 }
      );
    }

    // 307: 동일 메서드(GET)로 서명 URL 리다이렉트
    return NextResponse.redirect(data.signedUrl, 307);
  } catch (err) {
    console.error('[storage-proxy] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
