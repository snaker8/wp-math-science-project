// GET /share/exam/[token]/og.png — 학부모 공유 리포트 OG 썸네일 (명시 .png 경로)
//   종전 파일 규약 URL(/opengraph-image?해시)은 확장자가 없고 쿼리가 붙어 구형 메신저 크롤러(시놀로지 챗 등)가 "URL" 기본 썸네일로
//   떨어뜨렸다. 카카오는 종전에도 정상. 본체는 og-image.tsx 의 renderExamOgImage — 호출 경로만 바뀌었다.
//   ★ 스트리밍 응답은 Content-Length 가 없다(청크 전송) — 보수적 크롤러는 길이 없는 이미지를 버린다. 버퍼링해서 길이를 붙인다.
import { NextRequest } from 'next/server';
import { renderExamOgImage, OG_CACHE_HEADERS } from '../og-image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const img = await renderExamOgImage(token);
  const buf = Buffer.from(await img.arrayBuffer());
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(buf.byteLength),
      'Accept-Ranges': 'bytes',
      ...OG_CACHE_HEADERS,
    },
  });
}
