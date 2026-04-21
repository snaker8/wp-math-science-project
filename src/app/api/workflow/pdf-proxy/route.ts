// ============================================================================
// PDF Proxy API - Supabase Storage의 PDF로 307 리다이렉트
//
// ★ 구현 변경: 기존에는 Vercel 함수가 Supabase에서 다운로드→스트리밍하여
//    두 번의 네트워크 왕복이 발생 (느림). 이제 서명 URL을 발급받아
//    307 리다이렉트로 클라이언트가 Supabase CDN에서 직접 받도록 개선.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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
    // HWP/HWPX 파일이면 변환된 PDF 경로로 대체
    let downloadPath = storagePath;
    const ext = storagePath.split('.').pop()?.toLowerCase();
    if (ext === 'hwp' || ext === 'hwpx') {
      downloadPath = storagePath.replace(/\.(hwp|hwpx)$/i, '_converted.pdf');
      console.log(`[PDF Proxy] HWP 파일 → 변환 PDF로 대체: ${downloadPath}`);
    }

    // 서명 URL 발급 (1시간 유효, inline으로 브라우저 직접 렌더)
    const { data, error } = await supabaseAdmin.storage
      .from('source-files')
      .createSignedUrl(downloadPath, 3600, {
        download: false, // inline
      });

    if (error || !data?.signedUrl) {
      // HWP 변환 PDF 없음: 원본 HWP는 PDF.js로 렌더 불가
      if (downloadPath !== storagePath) {
        return NextResponse.json(
          {
            error: 'HWP_NOT_CONVERTED',
            message: 'HWP 파일의 PDF 변환본이 없습니다.',
            path: storagePath,
          },
          { status: 422 }
        );
      }
      console.error(`[PDF Proxy] Signed URL 생성 실패: ${error?.message}, path=${storagePath}`);
      return NextResponse.json(
        { error: 'File not found', message: error?.message, path: storagePath },
        { status: 404 }
      );
    }

    // 307: 브라우저가 동일한 메서드(GET)로 서명 URL로 이동
    return NextResponse.redirect(data.signedUrl, 307);
  } catch (err) {
    console.error('[PDF Proxy] Error:', err);
    return NextResponse.json(
      { error: 'Failed to create signed URL', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
