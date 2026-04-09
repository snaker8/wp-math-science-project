// POST /api/diagram-images/upload — 도식 이미지 직접 업로드 + Supabase Storage 저장
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

    if (!file) {
      return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop() || 'png';
    const fileName = `diagram-upload-${Date.now()}-${problemNumber || 'unknown'}.${ext}`;
    const storagePath = `diagram-uploads/${fileName}`;

    // Supabase Storage에 업로드
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

    // diagram_images 테이블에도 저장 (나중에 재사용 가능)
    try {
      await supabaseAdmin.from('diagram_images').insert({
        filename: fileName,
        storage_path: storagePath,
        public_url: publicUrl,
        source_name: '직접 업로드',
        subject: 'math',
        diagram_type: 'uploaded',
      });
    } catch {
      // 테이블 없거나 에러나도 무시 — 스토리지 업로드는 성공
    }

    console.log(`[diagram-upload] 업로드 완료: ${storagePath} → ${publicUrl}`);

    return NextResponse.json({
      success: true,
      publicUrl,
      storagePath,
      fileName,
    });
  } catch (error) {
    console.error('[diagram-upload] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
