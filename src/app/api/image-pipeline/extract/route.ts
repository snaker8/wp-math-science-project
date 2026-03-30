/**
 * POST /api/image-pipeline/extract
 *
 * HWP/PDF 파일에서 도식 이미지를 추출하고 보정한다.
 * Python image-pipeline 서버 (port 8200)에 프록시한다.
 *
 * FormData:
 *   - file: File (HWP 또는 PDF)
 *   - subject: string (math | science)
 *   - sourceName: string
 *   - enhance: boolean (기본 true)
 *   - uploadToSupabase: boolean (기본 false)
 */

import { NextRequest, NextResponse } from 'next/server';

const PIPELINE_URL =
  process.env.IMAGE_PIPELINE_URL || 'http://localhost:8200';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: '파일이 필요합니다.' },
        { status: 400 }
      );
    }

    // 파일 확장자 검증
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['pdf', 'hwp'].includes(ext)) {
      return NextResponse.json(
        { error: 'PDF 또는 HWP 파일만 지원합니다.' },
        { status: 400 }
      );
    }

    // Python 서비스로 프록시
    const proxyForm = new FormData();
    proxyForm.append('file', file);
    proxyForm.append('subject', (formData.get('subject') as string) || 'math');
    proxyForm.append(
      'source_name',
      (formData.get('sourceName') as string) || file.name.replace(/\.[^.]+$/, '')
    );
    proxyForm.append(
      'enhance',
      (formData.get('enhance') as string) || 'true'
    );
    proxyForm.append(
      'upload_to_supabase',
      (formData.get('uploadToSupabase') as string) || 'false'
    );

    const res = await fetch(`${PIPELINE_URL}/extract`, {
      method: 'POST',
      body: proxyForm,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[image-pipeline] extraction failed:', errorText);
      return NextResponse.json(
        { error: `이미지 추출 실패: ${errorText}` },
        { status: res.status }
      );
    }

    const result = await res.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[image-pipeline] extract error:', error);

    // 서버 연결 실패 시 안내
    const message =
      error instanceof TypeError && error.message.includes('fetch')
        ? 'Image Pipeline 서버에 연결할 수 없습니다. (port 8200 확인)'
        : String(error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
