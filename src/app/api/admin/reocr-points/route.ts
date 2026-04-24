// ============================================================================
// POST /api/admin/reocr-points
//   원본 PDF를 Mathpix로 재OCR해서 [N점] 원 배점을 exam_problems.points에 복구.
//   body: { examId: string } — 단일 시험지
//   body: { examId: 'all' }  — 전체 시험지 (bulk, 시간 오래 걸림)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MATHPIX_APP_ID = process.env.MATHPIX_APP_ID || '';
const MATHPIX_APP_KEY = process.env.MATHPIX_APP_KEY || '';

// 문제 번호 패턴: 줄 시작의 "1." "01." "1)" "01)" (최대 2자리)
const PROBLEM_HEAD = /^\s*(\d{1,2})\s*[.)]/gm;
// 점수 패턴: [N점], (N점), 'N점' (OCR 오자 졈/졍/정 포함)
const POINT_PATTERNS = [
  /\[\s*(?:총\s*)?(\d+(?:\.\d+)?)\s*[점졈졍정]\s*\]/,
  /\(\s*(\d+(?:\.\d+)?)\s*[점졈]\s*\)/,
  /(?:구하시오|구하여라|적으시오|쓰시오|답하시오|서술하시오|완성하시오|풀이\s*과정|의\s*값은|것은)[^.]{0,20}?\.?\s*[^가-힣0-9\n]?\s*(\d+(?:\.\d+)?)\s*[점졈]/,
  /(\d+(?:\.\d+)?)\s*[점졈]\s*$/,
];

async function mathpixPdf(buffer: Buffer, fileName: string): Promise<string> {
  if (!MATHPIX_APP_ID || !MATHPIX_APP_KEY) throw new Error('Mathpix API 키 없음');
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), fileName);
  form.append('options_json', JSON.stringify({
    conversion_formats: { text: true },
    math_inline_delimiters: ['$', '$'],
    math_display_delimiters: ['$$', '$$'],
  }));

  const res = await fetch('https://api.mathpix.com/v3/pdf', {
    method: 'POST',
    headers: { 'app_id': MATHPIX_APP_ID, 'app_key': MATHPIX_APP_KEY },
    body: form as any,
  });
  if (!res.ok) throw new Error(`Mathpix POST 실패: ${res.status}`);
  const data = await res.json();
  const pdfId = data.pdf_id;
  if (!pdfId) throw new Error(`Mathpix pdf_id 없음: ${JSON.stringify(data).slice(0, 200)}`);

  // 폴링 최대 110초
  for (let i = 0; i < 55; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const sr = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}`, {
      headers: { 'app_id': MATHPIX_APP_ID, 'app_key': MATHPIX_APP_KEY },
    });
    const sd = await sr.json();
    if (sd.status === 'completed') {
      const tr = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}.mmd`, {
        headers: { 'app_id': MATHPIX_APP_ID, 'app_key': MATHPIX_APP_KEY },
      });
      return await tr.text();
    }
    if (sd.status === 'error') throw new Error(`Mathpix 처리 실패: ${sd.error_info?.message || 'unknown'}`);
  }
  throw new Error('Mathpix 처리 타임아웃');
}

// OCR 텍스트를 문제 번호별 chunk로 분할
function splitByProblem(text: string): Map<number, string> {
  const chunks = new Map<number, string>();
  const matches = Array.from(text.matchAll(PROBLEM_HEAD));
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const num = parseInt(m[1], 10);
    if (!num || num < 1 || num > 50) continue;
    const start = m.index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    chunks.set(num, text.slice(start, end));
  }
  return chunks;
}

function extractPointsFromChunk(chunk: string): number | null {
  for (const pat of POINT_PATTERNS) {
    const m = chunk.match(pat);
    if (m) {
      const v = parseFloat(m[1]);
      if (Number.isFinite(v) && v > 0 && v <= 50) return v;
    }
  }
  return null;
}

// problem의 crop URL에서 jobId 추출
function extractJobIdFromCropPath(url: string): string | null {
  // e.g. ".../source-files/problem-crops/<jobId>/problem-1.png"
  const m = url.match(/problem-crops\/([0-9a-f-]{36})\//);
  return m ? m[1] : null;
}

async function processExam(examId: string): Promise<{
  examId: string;
  title?: string;
  status: 'success' | 'skip' | 'error';
  reason?: string;
  updated?: number;
  total?: number;
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
  if (!eps || eps.length === 0) return { examId, status: 'skip', reason: 'no problems', title: exam.title };

  // 첫 문제의 images에서 jobId 추출
  const firstProblemId = (eps[0] as any).problem_id;
  const { data: firstProblem } = await supabaseAdmin
    .from('problems')
    .select('images')
    .eq('id', firstProblemId)
    .single();
  const images = ((firstProblem as any)?.images || []) as Array<{ url?: string }>;
  let jobId: string | null = null;
  for (const img of images) {
    const id = extractJobIdFromCropPath(img?.url || '');
    if (id) { jobId = id; break; }
  }
  if (!jobId) return { examId, status: 'skip', reason: 'jobId 추출 실패 (crop URL 없음)', title: exam.title };

  // uploads/에서 메인 PDF 찾기
  const { data: files } = await supabaseAdmin.storage.from('source-files').list('uploads', { search: jobId });
  const mainFile = (files || []).find(f => {
    if (!f.name.startsWith(jobId + '_')) return false;
    const rest = f.name.slice(jobId!.length + 1);
    if (rest.startsWith('answer_') || rest.startsWith('quick_')) return false;
    return /\.(pdf|hwp|hwpx)$/i.test(f.name);
  });
  if (!mainFile) return { examId, status: 'skip', reason: `원본 파일 없음 (jobId=${jobId.slice(0, 8)})`, title: exam.title };
  if (!mainFile.name.toLowerCase().endsWith('.pdf')) {
    return { examId, status: 'skip', reason: 'PDF 아님 (HWP는 재OCR 불가)', title: exam.title };
  }

  // PDF 다운로드
  const { data: pdfBlob, error: dlErr } = await supabaseAdmin.storage
    .from('source-files')
    .download(`uploads/${mainFile.name}`);
  if (dlErr || !pdfBlob) return { examId, status: 'error', reason: `다운로드 실패: ${dlErr?.message}`, title: exam.title };
  const pdfBuf = Buffer.from(await pdfBlob.arrayBuffer());

  // Mathpix 재OCR
  const mmd = await mathpixPdf(pdfBuf, mainFile.name);
  const chunks = splitByProblem(mmd);

  // exam 문제 순서별로 chunk에서 [N점] 추출 → 업데이트
  let updated = 0;
  for (const ep of eps) {
    const seq = (ep as any).sequence_number;
    const chunk = chunks.get(seq);
    if (!chunk) continue;
    const pts = extractPointsFromChunk(chunk);
    if (pts === null) continue;
    const clamped = Math.min(100, Math.max(0, Math.round(pts * 10) / 10));
    const { error: updErr } = await supabaseAdmin
      .from('exam_problems')
      .update({ points: clamped })
      .eq('exam_id', examId)
      .eq('problem_id', (ep as any).problem_id);
    if (!updErr) updated++;
  }

  return { examId, title: exam.title, status: 'success', updated, total: eps.length };
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

  // Bulk 모드
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
        results.push(r);
        console.log(`[reocr-points] ${id.slice(0, 8)} ${r.title || '-'}: ${r.status} updated=${r.updated}/${r.total} ${r.reason || ''}`);
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

  // 단일 시험지
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
