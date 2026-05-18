import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { tryUpscaleCrop } from '@/lib/vision/image-upscaler';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 이미지 단건 Storage 업로드 프록시.
 * - 클라이언트가 base64 이미지 1개 + path 를 전송
 * - 서버가 supabaseAdmin(service role)로 업로드 → Storage RLS 우회
 * - 메인 자산화 PUT 본문은 경로만 실어 4.5MB 제한 회피
 */
export async function POST(req: NextRequest) {
  const authed = await requireAuth();
  if (!authed.ok) return authed.response;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase admin not configured' },
      { status: 500 }
    );
  }

  let body: { base64?: string; path?: string; contentType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { base64, path, contentType } = body;
  if (!base64 || !path) {
    return NextResponse.json(
      { error: 'base64 and path are required' },
      { status: 400 }
    );
  }

  // path 화이트리스트: 허가된 prefix만 허용 (임의 경로 업로드 방지)
  const allowedPrefixes = ['problem-crops/', 'page-images/', 'uploads/'];
  if (!allowedPrefixes.some((p) => path.startsWith(p))) {
    return NextResponse.json(
      { error: `path must start with one of: ${allowedPrefixes.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const pure = base64.replace(/^data:image\/\w+;base64,/, '');
    let buffer = Buffer.from(pure, 'base64');
    let type = contentType || 'image/jpeg';

    // ★ 선택지 이미지(객관식 보기) 자동 업스케일 (2026-05-19)
    //   path 가 problem-crops/choice-images/ 면 Sharp Lanczos3 업스케일 적용.
    //   해상도 낮은 모바일 사진/클립보드 paste 도 인쇄 품질로 끌어올림.
    //   수학 figure 업스케일과 동일 파이프라인 (tryUpscaleCrop) 재사용.
    if (path.includes('choice-images/')) {
      try {
        const upscale = await tryUpscaleCrop(buffer);
        if (upscale && upscale.upscaled.base64) {
          buffer = Buffer.from(upscale.upscaled.base64, 'base64');
          type = upscale.upscaled.contentType || 'image/png';
          console.log(
            `[upload-image] 선택지 이미지 업스케일 적용 — ` +
            `${upscale.quality.width}x${upscale.quality.height} → ` +
            `${upscale.upscaled.width}x${upscale.upscaled.height} (${upscale.upscaled.scale.toFixed(2)}x)`
          );
        }
      } catch (upErr) {
        // 업스케일 실패해도 원본 업로드 계속 진행 (사용자 흐름 안 막음)
        console.warn('[upload-image] 업스케일 실패, 원본 사용:', upErr instanceof Error ? upErr.message : upErr);
      }
    }

    const { data, error } = await supabaseAdmin.storage
      .from('source-files')
      .upload(path, buffer, { contentType: type, upsert: true });

    if (error) {
      console.error('[upload-image]', path, error.message);
      return NextResponse.json(
        { error: 'Storage upload failed', message: error.message },
        { status: 502 }
      );
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('source-files')
      .getPublicUrl(data.path);

    return NextResponse.json({
      path: data.path,
      publicUrl: urlData?.publicUrl ?? null,
      size: buffer.length,
    });
  } catch (e) {
    console.error('[upload-image] exception', e);
    return NextResponse.json(
      { error: 'Upload exception', message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
