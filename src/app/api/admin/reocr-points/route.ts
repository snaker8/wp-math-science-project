// ============================================================================
// POST /api/admin/reocr-points
//   각 문제의 crop 이미지를 Mathpix로 재OCR해서 [N점] 원 배점을
//   exam_problems.points에 복구.
//   body: { examId: string } — 단일 시험지
//   body: { examId: 'all' }  — 전체 시험지 (bulk)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MATHPIX_APP_ID = process.env.MATHPIX_APP_ID || '';
const MATHPIX_APP_KEY = process.env.MATHPIX_APP_KEY || '';

// 점수 패턴 우선순위 (느슨순):
//   소수점 자릿수 무제한, 괄호 종류 다양화, ',' 소수점 / '·' 가운뎃점 / 공백 허용
//   닫는 괄호 누락 OCR 케이스 fallback 포함
const NUM = '(\\d{1,2}(?:[.,·]\\d{1,2})?)';
const POINT_CHAR = '[점졈졍정]';
const POINT_PATTERNS: RegExp[] = [
  // 1) [4.3점], [ 4.3 점 ]
  new RegExp(`\\[\\s*${NUM}\\s*${POINT_CHAR}\\s*\\]`),
  // 2) (4.3점)
  new RegExp(`\\(\\s*${NUM}\\s*${POINT_CHAR}\\s*\\)`),
  // 3) 〔4점〕, ［4점］ (전각 대괄호)
  new RegExp(`[〔［]\\s*${NUM}\\s*${POINT_CHAR}\\s*[〕］]`),
  // 4) 닫기 누락: [4점 (...
  new RegExp(`\\[\\s*${NUM}\\s*${POINT_CHAR}`),
  // 5) (4점 누락
  new RegExp(`\\(\\s*${NUM}\\s*${POINT_CHAR}`),
];

function extractPoints(text: string): { value: number | null; matched: string | null } {
  for (const pat of POINT_PATTERNS) {
    const m = text.match(pat);
    if (m) {
      // ',' 소수점 / '·' 가운뎃점 → '.' 정규화
      const numStr = m[1].replace(/[,·]/g, '.');
      const v = parseFloat(numStr);
      if (Number.isFinite(v) && v > 0 && v <= 50) {
        return { value: v, matched: m[0] };
      }
    }
  }
  return { value: null, matched: null };
}

// 진단용: text에서 '점' 주변 ±40자 컨텍스트 추출 (없으면 tail)
function pointContext(text: string): string {
  const idx = text.search(/[점졈졍정]/);
  if (idx < 0) return text.slice(-100).replace(/\s+/g, ' ');
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + 30);
  return text.slice(start, end).replace(/\s+/g, ' ');
}

// Mathpix /v3/text — 이미지 단건 OCR (sync, 빠름, $0.004/요청)
async function mathpixImage(buffer: Buffer, mime: string): Promise<string> {
  if (!MATHPIX_APP_ID || !MATHPIX_APP_KEY) throw new Error('Mathpix API 키 없음');
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mime }));
  form.append('options_json', JSON.stringify({
    formats: ['text'],
    math_inline_delimiters: ['$', '$'],
    math_display_delimiters: ['$$', '$$'],
  }));
  const res = await fetch('https://api.mathpix.com/v3/text', {
    method: 'POST',
    headers: { 'app_id': MATHPIX_APP_ID, 'app_key': MATHPIX_APP_KEY },
    body: form as any,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Mathpix 이미지 OCR 실패 (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.text as string) || '';
}

// problem의 images에서 첫 crop URL 찾기 (figure_crop 우선, 없으면 crop)
function findCropUrl(images: Array<{ type?: string; url?: string }>): string | null {
  if (!Array.isArray(images)) return null;
  const crop = images.find(i => i?.type === 'crop' && i.url);
  if (crop?.url) return crop.url;
  const figureCrop = images.find(i => i?.type === 'figure_crop' && i.url);
  return figureCrop?.url || null;
}

// Storage URL → bucket + path 추출
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  // https://xxx.supabase.co/storage/v1/object/public/<bucket>/<path>
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (!m) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2]) };
}

async function processExam(examId: string): Promise<{
  examId: string;
  title?: string;
  status: 'success' | 'skip' | 'error';
  reason?: string;
  updated?: number;
  viaContent?: number;
  viaOcr?: number;
  total?: number;
  diag?: Array<{ num: number; matched: number | null; src?: string; tail?: string }>;
}> {
  if (!supabaseAdmin) throw new Error('Supabase not configured');

  const { data: exam } = await supabaseAdmin
    .from('exams')
    .select('id, title')
    .eq('id', examId)
    .single();
  if (!exam) return { examId, status: 'error', reason: 'exam not found' };

  const { data: eps } = await supabaseAdmin
    .from('exam_problems')
    .select('problem_id, sequence_number')
    .eq('exam_id', examId)
    .order('sequence_number', { ascending: true });
  if (!eps || eps.length === 0) {
    return { examId, status: 'skip', reason: 'no problems', title: exam.title };
  }

  const pIds = (eps as any[]).map(r => r.problem_id);
  const { data: problems } = await supabaseAdmin
    .from('problems')
    .select('id, images, content_latex')
    .in('id', pIds);
  const byId = new Map((problems || []).map((p: any) => [p.id, p]));

  let updated = 0;
  let viaContent = 0;
  let viaOcr = 0;
  const diag: Array<{ num: number; matched: number | null; src?: string; tail?: string }> = [];

  for (const ep of eps as any[]) {
    const seq = ep.sequence_number;
    const problem = byId.get(ep.problem_id);
    if (!problem) { diag.push({ num: seq, matched: null, tail: '(problem not found)' }); continue; }

    // ─── 1단계: content_latex regex 먼저 (DB에 [N점] 살아있으면 즉시 매칭, OCR 비용 0) ───
    const contentLatex: string = problem.content_latex || '';
    const contentResult = extractPoints(contentLatex);
    if (contentResult.value !== null) {
      const clamped = Math.min(100, Math.max(0, Math.round(contentResult.value * 10) / 10));
      const { error: updErr } = await supabaseAdmin
        .from('exam_problems')
        .update({ points: clamped })
        .eq('exam_id', examId)
        .eq('problem_id', ep.problem_id);
      if (!updErr) { updated++; viaContent++; }
      diag.push({ num: seq, matched: contentResult.value, src: 'content', tail: `matched="${contentResult.matched}"` });
      continue;
    }

    // ─── 2단계: crop OCR fallback ───
    const cropUrl = findCropUrl(problem.images || []);
    if (!cropUrl) { diag.push({ num: seq, matched: null, src: 'none', tail: '(no crop)' }); continue; }

    const parsed = parseStorageUrl(cropUrl);
    if (!parsed) { diag.push({ num: seq, matched: null, src: 'none', tail: '(invalid url)' }); continue; }

    try {
      const { data: blob, error: dlErr } = await supabaseAdmin.storage
        .from(parsed.bucket).download(parsed.path);
      if (dlErr || !blob) { diag.push({ num: seq, matched: null, src: 'ocr', tail: `(download: ${dlErr?.message})` }); continue; }
      const buf = Buffer.from(await blob.arrayBuffer());
      const mime = blob.type || 'image/png';
      const ocr = await mathpixImage(buf, mime);
      const { value: pts, matched } = extractPoints(ocr);
      diag.push({
        num: seq,
        matched: pts,
        src: 'ocr',
        tail: matched
          ? `matched="${matched}"`
          : `no-match | context: "${pointContext(ocr)}"`,
      });
      if (pts === null) continue;
      const clamped = Math.min(100, Math.max(0, Math.round(pts * 10) / 10));
      const { error: updErr } = await supabaseAdmin
        .from('exam_problems')
        .update({ points: clamped })
        .eq('exam_id', examId)
        .eq('problem_id', ep.problem_id);
      if (!updErr) { updated++; viaOcr++; }
    } catch (err) {
      diag.push({ num: seq, matched: null, src: 'ocr', tail: `(err: ${err instanceof Error ? err.message : String(err)})` });
    }
  }

  return { examId, title: exam.title, status: 'success', updated, viaContent, viaOcr, total: eps.length, diag };
}

export async function POST(request: NextRequest) {
  const authed = await requireAuth();
  if (!authed.ok) return authed.response;
  const { user } = authed;
  const isAdmin = user.role === 'ADMIN' || user.role === 'TEACHER' || user.role === 'TUTOR';
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const examId: string = body.examId;
  if (!examId) return NextResponse.json({ error: 'examId required (UUID 또는 "all")' }, { status: 400 });

  if (examId === 'all') {
    const { data: exams } = await supabaseAdmin
      .from('exams')
      .select('id')
      .is('deleted_at', null);
    const ids = (exams || []).map((e: any) => e.id);
    const results: any[] = [];
    for (const id of ids) {
      try {
        const r = await processExam(id);
        results.push({ examId: r.examId, title: r.title, status: r.status, updated: r.updated, total: r.total, reason: r.reason });
        console.log(`[reocr-points] ${id.slice(0, 8)} ${r.title || '-'}: ${r.status} ${r.updated}/${r.total}`);
      } catch (err) {
        results.push({ examId: id, status: 'error', reason: err instanceof Error ? err.message : String(err) });
      }
    }
    const summary = {
      totalExams: results.length,
      success: results.filter(r => r.status === 'success').length,
      skip: results.filter(r => r.status === 'skip').length,
      error: results.filter(r => r.status === 'error').length,
      totalUpdated: results.reduce((s, r) => s + (r.updated || 0), 0),
    };
    return NextResponse.json({ ...summary, results });
  }

  try {
    const r = await processExam(examId);
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json({
      examId,
      status: 'error',
      reason: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
