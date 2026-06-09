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

    // ★ 원본 파일명 보존용 sidecar 메타 — 메인 업로드(suffix='')일 때만
    //   Vercel 콜드스타트로 jobStore 유실 시 Storage에서 원본 한글 파일명 복원 가능
    if (!suffix) {
      try {
        const metaPath = `uploads/${jobId}.meta.json`;
        // ★ Mac(NFD) 파일명 정규화 후 저장 — 복원 시 한글 힌트/제목 깨짐 방지 (윈도우 NFC는 무변화)
        const metaBody = JSON.stringify({ originalFilename: fileName.normalize('NFC'), createdAt: new Date().toISOString() });
        await supabaseAdmin.storage
          .from('source-files')
          .upload(metaPath, new Blob([metaBody], { type: 'application/json' }), { upsert: true });
      } catch (metaErr) {
        // 메타 저장 실패는 비치명적 — 업로드 계속 진행
        console.warn('[upload-url] meta sidecar 저장 실패:', metaErr instanceof Error ? metaErr.message : metaErr);
      }
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
