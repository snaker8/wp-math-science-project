// ============================================================================
// PDF Proxy API - Supabase Storage의 PDF를 서버 사이드로 프록시
// CORS 문제 없이 클라이언트(PDF.js)에서 접근 가능
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const storagePath = searchParams.get('path');

  if (!storagePath) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 500 });
  }

  try {
    // ★ HWP/HWPX 파일이면 변환된 PDF 경로로 대체
    let downloadPath = storagePath;
    const ext = storagePath.split('.').pop()?.toLowerCase();
    if (ext === 'hwp' || ext === 'hwpx') {
      downloadPath = storagePath.replace(/\.(hwp|hwpx)$/i, '_converted.pdf');
      console.log(`[PDF Proxy] HWP 파일 → 변환 PDF로 대체: ${downloadPath}`);
    }

    console.log(`[PDF Proxy] Downloading: ${downloadPath}`);

    // Supabase Storage에서 파일 다운로드
    let { data, error } = await supabaseAdmin.storage
      .from('source-files')
      .download(downloadPath);

    // 변환 PDF가 없으면 원본 경로로 폴백
    if (error && downloadPath !== storagePath) {
      console.warn(`[PDF Proxy] 변환 PDF 없음, 원본으로 폴백: ${storagePath}`);
      const fallback = await supabaseAdmin.storage
        .from('source-files')
        .download(storagePath);
      data = fallback.data;
      error = fallback.error;
    }

    if (error || !data) {
      console.error(`[PDF Proxy] Download error for path '${storagePath}':`, error?.message);
      return NextResponse.json(
        { error: 'File not found', message: error?.message, path: storagePath },
        { status: 404 }
      );
    }

    console.log(`[PDF Proxy] Downloaded ${data.size} bytes for: ${storagePath}`);

    // PDF 파일을 ArrayBuffer로 변환
    const arrayBuffer = await data.arrayBuffer();

    // PDF 바이너리를 응답으로 전송
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(arrayBuffer.byteLength),
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('[PDF Proxy] Error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch PDF' },
      { status: 500 }
    );
  }
}
