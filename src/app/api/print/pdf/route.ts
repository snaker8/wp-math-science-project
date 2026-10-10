// ============================================================================
// POST /api/print/pdf — 화면에서 복제한 인쇄 DOM(HTML 문서) → PDF 파일
//
// ★ 2026-10-10 대표: "우리도 PDF 다운 버튼 만들자. 인쇄 들어가 하지 말고 매쓰홀릭처럼."
//   body: { html: string(완성 문서), filename?: string }
//   ExamPaperView 가 doPrint 와 같은 #exam-print-root 를 만들어 serializePrintDocument 로 직렬화해 보낸다.
//   크롬 인쇄 엔진(print 미디어)으로 그리므로 브라우저 「PDF 로 저장」과 같은 결과.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { htmlToPdf, debugFonts } from '@/lib/pdf/html-to-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_HTML_BYTES = 60 * 1024 * 1024; // 60MB — 그림 data URL 포함

export async function POST(req: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;

  let body: { html?: string; filename?: string; debug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON 본문이 필요합니다' }, { status: 400 });
  }
  const html = typeof body.html === 'string' ? body.html : '';
  if (!html || !html.includes('exam-print-root')) {
    return NextResponse.json({ error: '인쇄 DOM(html) 이 비어 있습니다' }, { status: 400 });
  }
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    return NextResponse.json({ error: '인쇄 내용이 너무 큽니다 (60MB 초과)' }, { status: 413 });
  }

  const safeName = (body.filename || '시험지')
    .replace(/[\\/:*?"<>|\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\.pdf$/i, '') || '시험지';

  const started = Date.now();
  try {
    // ★ 진단 모드 — 글꼴 로드 상태·글꼴 요청·실제 글리프 폭 (2026-10-11 한글 누락 사고 추적용)
    if (body.debug === 'fonts') {
      const info = await debugFonts(html, { timeoutMs: 90_000 });
      return NextResponse.json({ ...info, ms: Date.now() - started });
    }
    const pdf = await htmlToPdf(html, { timeoutMs: 90_000 });
    console.log(`[print/pdf] ${safeName}: ${(pdf.length / 1024).toFixed(0)}KB, ${Date.now() - started}ms`);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.length),
        // 파일명은 RFC 5987 (한글) + ASCII 폴백
        'Content-Disposition': `attachment; filename="exam.pdf"; filename*=UTF-8''${encodeURIComponent(safeName)}.pdf`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[print/pdf] 실패:', msg);
    return NextResponse.json({ error: `PDF 생성 실패: ${msg}` }, { status: 500 });
  }
}
