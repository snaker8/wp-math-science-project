/**
 * POST /api/image-pipeline/tag
 *
 * AI 태깅 프록시 — Python image-pipeline 서버의 태깅 엔드포인트로 프록시
 *
 * Body (JSON):
 *   - action: "batch" | "retag-all"
 *   - force?: boolean (retag-all 시 이미 태깅된 것도 재태깅)
 *   - use_batch_api?: boolean (Anthropic Batch API 사용 여부)
 */

import { NextRequest, NextResponse } from 'next/server';

const PIPELINE_URL =
  process.env.IMAGE_PIPELINE_URL || 'http://localhost:8200';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, force, use_batch_api } = body;

    let url: string;
    const form = new FormData();

    if (action === 'retag-all') {
      url = `${PIPELINE_URL}/tag/retag-all`;
      form.append('force', String(force ?? false));
    } else {
      // batch (미분류만)
      url = `${PIPELINE_URL}/tag/batch`;
      form.append('use_batch_api', String(use_batch_api ?? false));
    }

    const res = await fetch(url, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30_000), // 30초 (백그라운드 태깅이라 즉시 응답)
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[image-pipeline] tagging failed:', errorText);
      return NextResponse.json(
        { error: `태깅 실패: ${errorText}` },
        { status: res.status }
      );
    }

    const result = await res.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[image-pipeline] tag error:', error);

    const message =
      error instanceof TypeError && error.message.includes('fetch')
        ? 'Image Pipeline 서버에 연결할 수 없습니다. (port 8200 확인)'
        : String(error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
