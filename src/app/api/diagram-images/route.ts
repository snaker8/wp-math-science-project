/**
 * GET /api/diagram-images — 도식 이미지 목록 조회
 * ★ 파이프라인 서버 없이도 작동: index.json 직접 읽기
 * query params: subject, source, diagram_type, limit, offset
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { supabaseAdmin, createSupabaseServerClient } from '@/lib/supabase/server';

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
  const limit = Math.min(Number(sp.get('limit') || 50), 20000);
  const offset = Number(sp.get('offset') || 0);

  // ★ 1) index.json 로컬 파일 읽기
  let localImages = await loadIndex();

  // ★ 2) diagram_images 테이블에서 사용자 업로드 이미지 조회 (DB 검색)
  let dbImages: any[] = [];
  // ★ soft-delete 마커 — 로컬 index.json 출처 도식의 삭제 표시
  //   (로컬 파일은 Vercel filesystem read-only 라 물리 삭제 X → 마커 테이블로 필터링)
  let hiddenIds = new Set<string>();
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

    try {
      const { data: hiddenRows } = await supabaseAdmin
        .from('diagram_images_hidden')
        .select('image_id')
        .limit(20000);
      hiddenIds = new Set((hiddenRows || []).map((r: any) => String(r.image_id)));
    } catch (err) {
      // 테이블 없으면 무시 (마이그레이션 전 상태)
      console.warn('[diagram-images] hidden 조회 실패 (무시):', err);
    }
  }

  // ★ 3) 로컬 + DB 합치기 (DB 업로드 이미지가 먼저 보이도록)
  //    hidden 마커 적용 — id 일치하는 것 제외
  const allImages = [...dbImages, ...localImages].filter((img: any) => {
    const id = img?.id != null ? String(img.id) : '';
    return id ? !hiddenIds.has(id) : true;
  });

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
 *
 * 처리 순서:
 *   1. diagram_images 테이블에서 hard delete (DB 업로드 이미지)
 *   2. diagram_images_hidden 에 image_id 기록 (로컬 index.json soft-delete 마커)
 *   3. (파이프라인 서버 가용 시) 로컬 index.json 도 정리 시도 — best-effort
 *
 * 핵심: 2번이 있어 Vercel 환경에서도 로컬 index 출처 도식이 살아나지 않음.
 */
export async function DELETE(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const imageId = sp.get('id');
  const sourceName = sp.get('source');

  // 현재 사용자 (hidden_by 기록용 — 실패해도 진행)
  let actorId: string | null = null;
  try {
    const supa = await createSupabaseServerClient();
    if (supa) {
      const { data: { user } } = await supa.auth.getUser();
      if (user?.id) actorId = user.id;
    }
  } catch { /* 인증 실패해도 삭제는 진행 (admin 권한 호출일 수 있음) */ }

  try {
    // ★ 1) diagram_images 테이블 hard delete (DB 업로드 이미지)
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

    // ★ 2) soft-delete 마커 INSERT (로컬 index.json 출처 도식 차단)
    //    같은 id 중복 INSERT 시 onConflict 무시 (이미 hidden 이면 OK)
    if (imageId && supabaseAdmin) {
      const { error: hidErr } = await supabaseAdmin
        .from('diagram_images_hidden')
        .upsert({ image_id: String(imageId), hidden_by: actorId }, { onConflict: 'image_id' });
      if (hidErr) {
        console.warn(`[diagram-images] hidden 마커 INSERT 실패: ${hidErr.message}`);
      } else {
        console.log(`[diagram-images] hidden 마킹: ${imageId}`);
      }
    }
    if (sourceName && supabaseAdmin) {
      // 소스별 일괄 삭제 — 해당 source 의 로컬 index 이미지 id 들도 hidden 마킹
      try {
        const idx = (await loadIndex()).filter((img: any) => {
          const sn = String(img?.source_name || img?.source || '');
          return sn.includes(sourceName);
        });
        const rows = idx
          .map((img: any) => (img?.id != null ? { image_id: String(img.id), hidden_by: actorId } : null))
          .filter(Boolean) as { image_id: string; hidden_by: string | null }[];
        if (rows.length > 0) {
          const { error: hidErr } = await supabaseAdmin
            .from('diagram_images_hidden')
            .upsert(rows, { onConflict: 'image_id' });
          if (!hidErr) {
            console.log(`[diagram-images] 소스별 hidden 마킹: ${sourceName} (${rows.length}건)`);
          }
        }
      } catch (e) {
        console.warn('[diagram-images] 소스별 hidden 처리 실패:', e);
      }
    }

    // ★ 3) 파이프라인 서버에서도 삭제 시도 — best-effort (로컬 dev 환경)
    if (imageId) {
      try {
        const res = await fetch(`${PIPELINE_URL}/db/image/${imageId}`, { method: 'DELETE' });
        if (res.ok) console.log(`[diagram-images] 파이프라인 삭제 완료: ${imageId}`);
      } catch { /* 파이프라인 서버 안 돌아도 OK — soft-delete 마커가 처리 */ }
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
  } catch (e) {
    console.error('[diagram-images] DELETE 예외:', e);
    return NextResponse.json({ error: 'delete failed' }, { status: 500 });
  }
}
