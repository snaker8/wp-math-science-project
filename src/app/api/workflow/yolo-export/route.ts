// ============================================================================
// GET /api/workflow/yolo-export - YOLO 학습 데이터 내보내기
// detection_annotations 테이블에서 페이지 이미지 + bbox 라벨을 YOLO 포맷으로 변환
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// YOLO 클래스 매핑
//   0: problem        — 수학 문제 영역 (짧고 정형)
//   1: graph          — 그래프/좌표평면/함수 그림
//   2: table          — 표/도표
//   3: science_problem — 과학 문제 영역 (길고 가변, 별도 클래스로 분리하여 학습)
/** detection_annotations 중 export 가 실제로 쓰는 필드 */
interface AnnotationRow {
  page_image_path: string;
  class_label: string;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  detection_source?: string | null;
  page_number?: number | null;
  /** 0 또는 null 일 수 있다 — 학습에는 안 쓰이고 매니페스트 참고용 */
  page_width?: number | null;
  page_height?: number | null;
}

const CLASS_MAP: Record<string, number> = {
  problem: 0,
  graph: 1,
  table: 2,
  science_problem: 3,
};

export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '5000');
  const classFilter = searchParams.get('class') || null; // problem, graph, table

  try {
    // ★ 2026-08-30: PostgREST 는 한 요청당 1,000행에서 자른다. `.limit(5000)` 을 줘도
    //   1,000행만 온다(실측). 학습 데이터가 694건이던 시절엔 안 걸렸다가, 4,854건이 되면서
    //   조용히 80% 가 사라지는 상태가 됐다. 게다가 정렬이 created_at DESC 라 잘려나가는 쪽이
    //   **가장 오래된 = 사람이 직접 검수한 MANUAL 좌표** 였다.
    //   → range() 페이지네이션으로 전량을 가져온다. limit 은 상한으로만 쓴다.
    //   같은 클래스의 사고 이력: `.in()` + 1000행 잘림 (동백중 problemCount=0).
    const PAGE = 1000;
    const annotations: AnnotationRow[] = [];
    for (let from = 0; from < limit; from += PAGE) {
      let query = supabaseAdmin
        .from('detection_annotations')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, Math.min(from + PAGE, limit) - 1);

      if (classFilter && CLASS_MAP[classFilter] !== undefined) {
        query = query.eq('class_label', classFilter);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[YOLO Export] Query error:', error.message);
        return NextResponse.json(
          { error: 'Failed to fetch annotations', detail: error.message },
          { status: 500 }
        );
      }
      if (!data || data.length === 0) break;
      annotations.push(...(data as AnnotationRow[]));
      if (data.length < PAGE) break;
    }
    console.log(`[YOLO Export] annotation ${annotations.length}건 조회 (상한 ${limit})`);

    if (!annotations || annotations.length === 0) {
      return NextResponse.json({
        totalImages: 0,
        totalAnnotations: 0,
        classDistribution: {},
        manifest: [],
        message: 'No annotations found. Upload and 자산화 exam PDFs to collect YOLO training data.',
      });
    }

    // 페이지 이미지별로 그룹화
    const pageMap = new Map<string, typeof annotations>();
    const classCount: Record<string, number> = {};

    for (const ann of annotations) {
      const key = ann.page_image_path;
      if (!pageMap.has(key)) pageMap.set(key, []);
      pageMap.get(key)!.push(ann);

      // 클래스 분포 집계
      classCount[ann.class_label] = (classCount[ann.class_label] || 0) + 1;
    }

    // YOLO 라벨 파일 생성 (class_id cx cy w h)
    const manifest = [];
    for (const [imagePath, anns] of pageMap.entries()) {
      // Supabase Storage public URL 생성
      const { data: urlData } = supabaseAdmin.storage
        .from('source-files')
        .getPublicUrl(imagePath);

      // top-left (x, y, w, h) → center (cx, cy, w, h) 변환
      const labels = anns.map(a => {
        const classId = CLASS_MAP[a.class_label] ?? 0;
        const cx = a.bbox_x + a.bbox_w / 2;
        const cy = a.bbox_y + a.bbox_h / 2;
        return `${classId} ${cx.toFixed(6)} ${cy.toFixed(6)} ${a.bbox_w.toFixed(6)} ${a.bbox_h.toFixed(6)}`;
      }).join('\n');

      manifest.push({
        imageUrl: urlData?.publicUrl || '',
        imagePath,
        labels,
        annotationCount: anns.length,
        pageWidth: anns[0]?.page_width || 0,
        pageHeight: anns[0]?.page_height || 0,
      });
    }

    return NextResponse.json({
      totalImages: manifest.length,
      totalAnnotations: annotations.length,
      classDistribution: classCount,
      classMap: CLASS_MAP,
      manifest,
    });
  } catch (err) {
    console.error('[YOLO Export] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
