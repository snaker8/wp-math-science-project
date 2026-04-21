/**
 * POST /api/workflow/upload-url
 * 클라이언트가 Supabase Storage에 직접 업로드할 수 있는 서명 URL 발급.
 * Vercel Hobby 플랜의 4.5MB API body 제한을 우회하기 위함.
 *
 * Request:  { fileName: string, suffix?: string ('' | 'answer' | 'quick') }
 * Response: { signedUrl, token, storagePath }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Storage not configured (SUPABASE_SERVICE_ROLE_KEY missing)' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const fileName: string | undefined = body.fileName;
    const suffix: string = body.suffix || '';
    const jobIdHint: string | undefined = body.jobId;

    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json({ error: 'fileName required' }, { status: 400 });
    }

    // ★ Storage 경로는 ASCII-safe로 유지 (Supabase 서명 URL + PUT이 %-encoded path 이중 인코딩 시 400 반환)
    //   한글/공백 → _. 원본 파일명은 클라이언트가 FormData의 fileName으로 별도 전달하여 DB에 저장.
    //   확장자는 보존.
    const ext = fileName.match(/\.[a-zA-Z0-9]+$/)?.[0] || '';
    const safeName = fileName
      .replace(new RegExp(ext.replace('.', '\\.') + '$'), '')  // 확장자 제거
      .replace(/[^a-zA-Z0-9.-]/g, '_')                         // 한글/공백/특수 → _
      .slice(0, 40)                                             // 너무 긴 이름 방지
      + ext;
    const jobId = jobIdHint || crypto.randomUUID();
    const storageFileName = suffix ? `${jobId}_${suffix}_${safeName}` : `${jobId}_${safeName}`;
    const storagePath = `uploads/${storageFileName}`;

    const { data, error } = await supabaseAdmin.storage
      .from('source-files')
      .createSignedUploadUrl(storagePath);

    if (error) {
      console.error('[upload-url] signed URL error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      storagePath,
      jobId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[upload-url] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
