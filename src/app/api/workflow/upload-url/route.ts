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

    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
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
