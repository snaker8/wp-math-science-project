/**
 * GET /api/diagram-images — 도식 이미지 목록 조회
 * ★ 파이프라인 서버 없이도 작동: index.json 직접 읽기
 * query params: subject, source, diagram_type, limit, offset
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { supabaseAdmin } from '@/lib/supabase/server';

const INDEX_PATH = path.join(process.cwd(), 'image-pipeline', 'dasaram_diagram_db', 'index.json');
const PIPELINE_URL = process.env.NEXT_PUBLIC_IMAGE_PIPELINE_URL || 'http://localhost:8200';

// 인덱스 캐시 (30초 — 추출 후 빠르게 반영)
let cachedIndex: { images: any[]; loadedAt: number } | null = null;
const CACHE_TTL = 30 * 1000;

async function loadIndex(): Promise<any[]> {
  // 캐시 유효하면 반환
  if (cachedIndex && Date.now() - cachedIndex.loadedAt < CACHE_TTL) {
    return cachedIndex.images;
  }

  if (!existsSync(INDEX_PATH)) return [];

  try {
    const raw = await readFile(INDEX_PATH, 'utf-8');
    const idx = JSON.parse(raw);
    const images = idx.images || [];
    cachedIndex = { images, loadedAt: Date.now() };
    return images;
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const subject = sp.get('subject');
  const source = sp.get('source');
  const diagramType = sp.get('diagram_type');
  const limit = Math.min(Number(sp.get('limit') || 50), 2000);
  const offset = Number(sp.get('offset') || 0);

  // ★ 1) index.json 로컬 파일 읽기
  let localImages = await loadIndex();

  // ★ 2) diagram_images 테이블에서 사용자 업로드 이미지 조회 (DB 검색)
  let dbImages: any[] = [];
  if (supabaseAdmin) {
    try {
      let dbQuery = supabaseAdmin
        .from('diagram_images')
        .select('id, filename, storage_path, public_url, source_name, subject, diagram_type, unit_name, unit_code, tags, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (subject) dbQuery = dbQuery.ilike('subject', `%${subject}%`);
      if (source) dbQuery = dbQuery.ilike('source_name', `%${source}%`);
      if (diagramType) dbQuery = dbQuery.ilike('diagram_type', `%${diagramType}%`);

      const { data } = await dbQuery;
      dbImages = (data || []).map((img: any) => ({
        ...img,
        storage_path: img.storage_path || '',
        public_url: img.public_url,
        source_name: img.source_name || '업로드',
        diagram_type: img.diagram_type || 'uploaded',
        _from_db: true,
      }));
    } catch (err) {
      console.warn('[diagram-images] DB 조회 실패 (무시):', err);
    }
  }

  // ★ 3) 로컬 + DB 합치기 (DB 업로드 이미지가 먼저 보이도록)
  let allImages = [...dbImages, ...localImages];

  if (allImages.length > 0) {
    // 필터링 (DB 이미지는 이미 필터링됨, 로컬만 추가 필터)
    let filtered = allImages;
    if (subject) {
      filtered = filtered.filter((img: any) => {
        if (img._from_db) return true; // DB는 이미 필터됨
        const imgSubject = img.subject || (img.tags?.science_subject) || '';
        return imgSubject.toLowerCase().includes(subject.toLowerCase());
      });
    }
    if (source) {
      filtered = filtered.filter((img: any) => {
        if (img._from_db) return true;
        return (img.source_name || img.source || '').includes(source);
      });
    }
    if (diagramType) {
      filtered = filtered.filter((img: any) => {
        if (img._from_db) return true;
        const dt = img.diagram_type || (img.tags?.diagram_type) || '';
        return dt.includes(diagramType);
      });
    }

    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);

    const images = paged.map((img: any) => {
      const rawPath = (img.storage_path || img.filepath || '') as string;
      const storagePath = rawPath.replace(/\\/g, '/');
      const tags = img.tags || {};
      return {
        ...img,
        storage_path: storagePath,
        source_name: img.source_name || img.source,
        diagram_type: img.diagram_type || tags.diagram_type,
        unit_name: img.unit_name || tags.unit_name,
        unit_code: img.unit_code || tags.unit_code,
      };
    });

    return NextResponse.json({ images, total, source: dbImages.length > 0 ? 'local+db' : 'local-index' });
  }

  // 폴백: 파이프라인 서버 시도 (index.json이 없을 때만)
  try {
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    params.set('limit', String(limit));

    const res = await fetch(`${PIPELINE_URL}/db/search?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      const rawImages = data.images || [];
      const images = rawImages.map((img: Record<string, unknown>) => {
        const rawPath = (img.storage_path || img.filepath || '') as string;
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
      return NextResponse.json({ images, total: data.count || images.length, source: 'pipeline' });
    }
  } catch {
    // 파이프라인도 불가
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
    // ★ 1) diagram_images 테이블에서 삭제 (DB 업로드 이미지)
    if (imageId && supabaseAdmin) {
      const { error: dbErr } = await supabaseAdmin
        .from('diagram_images')
        .delete()
        .eq('id', imageId);
      if (!dbErr) {
        console.log(`[diagram-images] DB 삭제 완료: ${imageId}`);
      }
    }
    if (sourceName && supabaseAdmin) {
      const { error: dbErr } = await supabaseAdmin
        .from('diagram_images')
        .delete()
        .ilike('source_name', `%${sourceName}%`);
      if (!dbErr) {
        console.log(`[diagram-images] DB 소스별 삭제 완료: ${sourceName}`);
      }
    }

    // ★ 2) 파이프라인 서버에서도 삭제 시도 (로컬 index.json)
    if (imageId) {
      try {
        const res = await fetch(`${PIPELINE_URL}/db/image/${imageId}`, { method: 'DELETE' });
        if (res.ok) console.log(`[diagram-images] 파이프라인 삭제 완료: ${imageId}`);
      } catch { /* 파이프라인 서버 안 돌아도 OK */ }
      cachedIndex = null;
      return NextResponse.json({ success: true, deleted: imageId });
    }

    if (sourceName) {
      try {
        const res = await fetch(`${PIPELINE_URL}/db/source/${encodeURIComponent(sourceName)}`, { method: 'DELETE' });
        if (res.ok) console.log(`[diagram-images] 파이프라인 소스 삭제: ${sourceName}`);
      } catch { /* 파이프라인 서버 안 돌아도 OK */ }
      cachedIndex = null;
      return NextResponse.json({ success: true, deleted: sourceName });
    }

    return NextResponse.json({ error: 'id or source required' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Pipeline server unreachable' }, { status: 502 });
  }
}
