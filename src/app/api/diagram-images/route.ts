/**
 * GET /api/diagram-images — 도식 이미지 목록 조회
 * Supabase diagram_images 테이블 → 없으면 로컬 파이프라인 서버 폴백
 * query params: subject, source, limit, offset
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

const PIPELINE_URL = process.env.NEXT_PUBLIC_IMAGE_PIPELINE_URL || 'http://localhost:8200';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const subject = sp.get('subject');
  const source = sp.get('source');
  const limit = Math.min(Number(sp.get('limit') || 50), 2000);
  const offset = Number(sp.get('offset') || 0);

  // 1) Supabase 조회 시도
  if (supabaseAdmin) {
    try {
      let query = supabaseAdmin
        .from('diagram_images')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (subject) query = query.eq('subject', subject);
      if (source) query = query.eq('source_name', source);

      const { data, count, error } = await query;

      if (!error && data && data.length > 0) {
        return NextResponse.json({ images: data, total: count || 0, source: 'supabase' });
      }
    } catch {
      // Supabase 실패 → 로컬 폴백
    }
  }

  // 2) 로컬 파이프라인 서버 폴백 (서버사이드 → CORS 무관)
  try {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    params.set('limit', String(limit));

    const res = await fetch(`${PIPELINE_URL}/db/search?${params}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      const rawImages = data.images || [];
      // 파이프라인 서버 응답 필드명 → 클라이언트 인터페이스에 맞게 매핑
      const images = rawImages.map((img: Record<string, unknown>) => {
        // filepath → storage_path 매핑 (클라이언트에서 프록시 URL 생성용)
        const rawPath = (img.storage_path || img.filepath || '') as string;
        // ★ 백슬래시 → 슬래시 정규화 (Windows 경로 호환)
        const storagePath = rawPath.replace(/\\/g, '/');
        const tags = (img.tags || {}) as Record<string, unknown>;
        return {
          ...img,
          storage_path: storagePath,
          source_name: img.source_name || img.source,
          diagram_type: img.diagram_type || tags.diagram_type,
          unit_name: img.unit_name || tags.unit_name,
          unit_code: img.unit_code || tags.unit_code,
        };
      });
      return NextResponse.json({ images, total: data.count || images.length, source: 'local' });
    }
  } catch {
    // 로컬 서버도 불가
  }

  return NextResponse.json({ images: [], total: 0, source: 'none' });
}

/**
 * DELETE /api/diagram-images?id=xxx — 개별 이미지 삭제
 * DELETE /api/diagram-images?source=xxx — 소스별 일괄 삭제
 */
export async function DELETE(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const imageId = sp.get('id');
  const sourceName = sp.get('source');

  try {
    if (imageId) {
      const res = await fetch(`${PIPELINE_URL}/db/image/${imageId}`, { method: 'DELETE' });
      if (!res.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(await res.json());
    }

    if (sourceName) {
      const res = await fetch(`${PIPELINE_URL}/db/source/${encodeURIComponent(sourceName)}`, { method: 'DELETE' });
      if (!res.ok) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
      return NextResponse.json(await res.json());
    }

    return NextResponse.json({ error: 'id or source required' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Pipeline server unreachable' }, { status: 502 });
  }
}
