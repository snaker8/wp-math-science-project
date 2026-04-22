/**
 * GET /api/image-pipeline/health
 *
 * 클라이언트(브라우저)가 Railway 파이프라인을 직접 호출하면 CORS 차단됨.
 * Next.js 서버를 경유해서 호출하면 server-to-server라 CORS 무관.
 */

import { NextResponse } from 'next/server';

const PIPELINE_URL = process.env.IMAGE_PIPELINE_URL
  || process.env.NEXT_PUBLIC_IMAGE_PIPELINE_URL
  || 'http://localhost:8200';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch(`${PIPELINE_URL}/health`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { status: 'down', error: `Pipeline ${res.status}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { status: 'down', error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
