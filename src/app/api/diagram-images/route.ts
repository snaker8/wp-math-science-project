/**
 * GET /api/diagram-images — 도식 이미지 목록 조회
 * ★ 파이프라인 서버 없이도 작동: index.json 직접 읽기
 * query params: subject, source, diagram_type, limit, offset
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

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

  // ★ index.json 직접 읽기 (파이프라인 서버 불필요)
  let allImages = await loadIndex();

  if (allImages.length > 0) {
    // 필터링
    let filtered = allImages;
    if (subject) {
      filtered = filtered.filter((img: any) => {
        const imgSubject = img.subject || (img.tags?.science_subject) || '';
        return imgSubject.toLowerCase().includes(subject.toLowerCase());
      });
    }
    if (source) {
      filtered = filtered.filter((img: any) =>
        (img.source_name || img.source || '').includes(source)
      );
    }
    if (diagramType) {
      filtered = filtered.filter((img: any) => {
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

    return NextResponse.json({ images, total, source: 'local-index' });
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
    if (imageId) {
      const res = await fetch(`${PIPELINE_URL}/db/image/${imageId}`, { method: 'DELETE' });
      if (!res.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      // 캐시 무효화
      cachedIndex = null;
      return NextResponse.json(await res.json());
    }

    if (sourceName) {
      const res = await fetch(`${PIPELINE_URL}/db/source/${encodeURIComponent(sourceName)}`, { method: 'DELETE' });
      if (!res.ok) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
      cachedIndex = null;
      return NextResponse.json(await res.json());
    }

    return NextResponse.json({ error: 'id or source required' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Pipeline server unreachable' }, { status: 502 });
  }
}
