// POST /api/images/redraw — 이미지 하나(URL)를 Gemini 로 깨끗하게 다시 그려 검증 뒤 Storage 에 저장, 새 URL 반환.
//   보기 이미지(그림 객관식) 「AI」 버튼이 쓴다. 본문 도형은 generate-figure 가 같은 lib 을 직접 쓴다.
//   한 번에 한 장. 검증 실패면 422 + 사유 (원본은 손대지 않는다).
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireAuthScope } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { redrawAndVerify, GEMINI_IMAGE_MODEL } from '@/lib/vision/image-redraw';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const BUCKET = 'source-files';

async function loadImage(url: string): Promise<{ buf: Buffer; mime: string } | null> {
  if (!supabaseAdmin) return null;
  // 우리 Storage 경로면 서비스 키로 내려받는다(비공개 버킷·프록시 URL 모두 처리)
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign(?:ed)?)\/source-files\/([^?]+)/) || url.match(/\/api\/storage\/image\?path=([^&]+)/);
  if (m) {
    const path = decodeURIComponent(m[1]);
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
    if (!error && data) return { buf: Buffer.from(await data.arrayBuffer()), mime: data.type || 'image/png' };
  }
  if (/^https?:\/\//.test(url)) {
    const r = await fetch(url);
    if (r.ok) return { buf: Buffer.from(await r.arrayBuffer()), mime: r.headers.get('content-type')?.split(';')[0] || 'image/png' };
  }
  if (url.startsWith('data:image/')) {
    const mm = url.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
    if (mm) return { buf: Buffer.from(mm[2], 'base64'), mime: mm[1] };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase admin not configured' }, { status: 500 });
  let body: { url?: string; problemId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.url) return NextResponse.json({ error: 'url 이 필요합니다' }, { status: 400 });

  const src = await loadImage(body.url);
  if (!src) return NextResponse.json({ error: '원본 이미지를 읽지 못했습니다' }, { status: 400 });
  // PNG 로 정규화(WebP/JPEG → PNG) — 모델 입력 안정
  let png: Buffer; let mime = 'image/png';
  try { png = await sharp(src.buf).png().toBuffer(); } catch { png = src.buf; mime = src.mime; }

  const r = await redrawAndVerify(png, mime);
  if (!r.ok) {
    console.warn(`[images/redraw] ${r.stage} 실패 (${r.ms}ms): ${r.error}`);
    return NextResponse.json({ error: r.stage === 'redraw' ? `재작성 실패: ${r.error}` : `검증 불일치 — 원본 유지: ${r.error}`, stage: r.stage, verify: r.verify }, { status: 422 });
  }
  const out = await sharp(r.png).png({ compressionLevel: 9 }).toBuffer();
  const path = `problem-crops/redraw/${body.problemId ? body.problemId + '-' : ''}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, out, { contentType: 'image/png', upsert: false });
  if (error) return NextResponse.json({ error: `저장 실패: ${error.message}` }, { status: 502 });
  const { data: u } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  const meta = await sharp(out).metadata().catch(() => ({ width: 0, height: 0 }));
  console.log(`[images/redraw] ok ${r.ms}ms attempts=${r.attempts} score=${r.verify.score} ${meta.width}x${meta.height} → ${path}`);
  return NextResponse.json({ url: u?.publicUrl ?? null, path, width: meta.width, height: meta.height, verify: r.verify, attempts: r.attempts, model: GEMINI_IMAGE_MODEL, ms: r.ms });
}
