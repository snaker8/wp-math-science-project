// ============================================================================
// GET /api/workflow/yolo-export - YOLO 학습 데이터 내보내기
// detection_annotations 테이블에서 페이지 이미지 + bbox 라벨을 YOLO 포맷으로 변환
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// YOLO 클래스 매핑
const CLASS_MAP: Record<string, number> = {
  problem: 0,
  graph: 1,
  table: 2,
};

export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '5000');
  const classFilter = searchParams.get('class') || null; // problem, graph, table

  try {
    // detection_annotations 조회
    let query = supabaseAdmin
      .from('detection_annotations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (classFilter && CLASS_MAP[classFilter] !== undefined) {
      query = query.eq('class_label', classFilter);
    }

    const { data: annotations, error } = await query;

    if (error) {
      console.error('[YOLO Export] Query error:', error.message);
      return NextResponse.json(
        { error: 'Failed to fetch annotations', detail: error.message },
        { status: 500 }
      );
    }

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
