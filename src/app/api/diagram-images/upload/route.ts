// POST /api/diagram-images/upload — 도식 이미지 직접 업로드 + Supabase Storage 저장
// SVG 파일 업로드 시: 클라이언트에서 PNG로 렌더링된 이미지(file) + SVG 원본(svgSource) 모두 저장
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const problemNumber = formData.get('problemNumber') as string | null;
    const svgSource = formData.get('svgSource') as string | null;
    const svgFileName = formData.get('svgFileName') as string | null;

    if (!file) {
      return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop() || 'png';
    const ts = Date.now();
    const prefix = problemNumber || 'unknown';
    const fileName = `diagram-upload-${ts}-${prefix}.${ext}`;
    const storagePath = `diagram-uploads/${fileName}`;

    // ── 1) 메인 이미지 (PNG/JPG) 업로드 ──
    const { error: uploadError } = await supabaseAdmin.storage
      .from('source-files')
      .upload(storagePath, buffer, {
        contentType: file.type || 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('[diagram-upload] Storage error:', uploadError.message);
      return NextResponse.json({ error: '스토리지 업로드 실패', detail: uploadError.message }, { status: 500 });
    }

    // Public URL 가져오기
    const { data: urlData } = supabaseAdmin.storage
      .from('source-files')
      .getPublicUrl(storagePath);

    const publicUrl = urlData?.publicUrl || '';

    // ── 2) SVG 원본 저장 (선택) ──
    let svgStoragePath: string | null = null;
    let svgPublicUrl: string | null = null;
    if (svgSource) {
      const svgName = svgFileName
        ? `diagram-upload-${ts}-${prefix}-${svgFileName}`
        : `diagram-upload-${ts}-${prefix}.svg`;
      svgStoragePath = `diagram-uploads/svg-source/${svgName}`;
      const svgBuffer = Buffer.from(svgSource, 'utf-8');

      const { error: svgErr } = await supabaseAdmin.storage
        .from('source-files')
        .upload(svgStoragePath, svgBuffer, {
          contentType: 'image/svg+xml',
          upsert: true,
        });

      if (svgErr) {
        console.warn('[diagram-upload] SVG 원본 저장 실패 (무시):', svgErr.message);
        svgStoragePath = null;
      } else {
        const { data: svgUrlData } = supabaseAdmin.storage
          .from('source-files')
          .getPublicUrl(svgStoragePath);
        svgPublicUrl = svgUrlData?.publicUrl || null;
        console.log(`[diagram-upload] SVG 원본 저장 완료: ${svgStoragePath}`);
      }
    }

    // ── 3) diagram_images 테이블에 저장 (재사용 가능) ──
    try {
      await supabaseAdmin.from('diagram_images').insert({
        filename: fileName,
        storage_path: storagePath,
        public_url: publicUrl,
        source_name: svgSource ? 'SVG 업로드' : '직접 업로드',
        subject: 'math',
        diagram_type: svgSource ? 'svg_upload' : 'uploaded',
        tags: svgStoragePath ? { svg_source_path: svgStoragePath, svg_public_url: svgPublicUrl } : undefined,
      });
    } catch {
      // 테이블 없거나 에러나도 무시 — 스토리지 업로드는 성공
    }

    console.log(`[diagram-upload] 업로드 완료: ${storagePath} → ${publicUrl}${svgSource ? ' (+ SVG 원본)' : ''}`);

    return NextResponse.json({
      success: true,
      publicUrl,
      storagePath,
      fileName,
      ...(svgStoragePath && { svgStoragePath, svgPublicUrl }),
    });
  } catch (error) {
    console.error('[diagram-upload] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
