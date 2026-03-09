// ============================================================================
// GET /api/storage/image?path=problem-crops/upscaled/xxx.png
// Supabase Storage 이미지 프록시 (private bucket 접근)
// 서버에서 supabaseAdmin으로 다운로드 → 클라이언트에 바이너리 전달
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

/** 인메모리 캐시 (5분 TTL) */
const imageCache = new Map<string, { buffer: Uint8Array; contentType: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5분

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path');

  if (!path) {
    return NextResponse.json({ error: 'path parameter required' }, { status: 400 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  // 경로 검증 (source-files 버킷 내의 이미지만 허용)
  if (!path.startsWith('problem-crops/') && !path.startsWith('exam-pages/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
  }

  try {
    // 캐시 확인
    const cached = imageCache.get(path);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return new NextResponse(cached.buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=3600',
          'X-Cache': 'HIT',
        },
      });
    }

    // Supabase Storage에서 다운로드
    const { data: blob, error } = await supabaseAdmin.storage
      .from('source-files')
      .download(path);

    if (error || !blob) {
      console.error(`[storage-proxy] Download failed: ${path}`, error?.message);
      return NextResponse.json(
        { error: 'File not found', detail: error?.message },
        { status: 404 }
      );
    }

    const arrayBuf = await blob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuf);
    const contentType = blob.type || 'image/png';

    // 캐시 저장 (최대 100개)
    if (imageCache.size > 100) {
      // 가장 오래된 엔트리 제거
      const oldest = [...imageCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) imageCache.delete(oldest[0]);
    }
    imageCache.set(path, { buffer: uint8, contentType, timestamp: Date.now() });

    return new NextResponse(uint8 as unknown as BodyInit, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': String(uint8.length),
        'X-Cache': 'MISS',
      },
    });
  } catch (err) {
    console.error('[storage-proxy] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
