// ============================================================================
// /api/workflow/detect-from-ocr
// Mathpix OCR → groupLinesIntoQuestions → 문제별 bbox 반환
// analyze 페이지에서 GPT-4o Vision 없이 즉시 bbox 자동 감지할 때 호출
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { runOcrBboxDetection } from '@/lib/workflow/cloud-flow';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { UploadJob } from '@/types/workflow';

// upload/route.ts와 동일한 globalThis 공유 스토어 접근
const globalForJobs = globalThis as unknown as {
  __jobStore?: Map<string, UploadJob>;
  __fileBufferStore?: Map<string, { problem: ArrayBuffer; answer?: ArrayBuffer; quickAnswer?: ArrayBuffer }>;
};

export const maxDuration = 120; // Mathpix OCR 최대 2분

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json() as { jobId: string };

    if (!jobId) {
      return NextResponse.json({ error: 'jobId 필수' }, { status: 400 });
    }

    // ── job 조회 ──
    const jobStore = globalForJobs.__jobStore;
    const fileBufferStore = globalForJobs.__fileBufferStore;

    const job = jobStore?.get(jobId);
    if (!job) {
      return NextResponse.json({ error: '업로드 job을 찾을 수 없습니다 (서버 재시작 후 재업로드 필요)' }, { status: 404 });
    }

    // ── 파일 버퍼 취득 (메모리 → Supabase Storage 순) ──
    let fileBuffer: ArrayBuffer | null = fileBufferStore?.get(jobId)?.problem ?? null;

    if (!fileBuffer && job.storagePath && supabaseAdmin) {
      console.log(`[detect-from-ocr] fileBufferStore miss — Storage에서 다운로드: ${job.storagePath}`);
      const { data, error } = await supabaseAdmin.storage
        .from('source-files')
        .download(job.storagePath);

      if (error) {
        console.error('[detect-from-ocr] Storage 다운로드 실패:', error.message);
      } else if (data) {
        fileBuffer = await data.arrayBuffer();
      }
    }

    if (!fileBuffer) {
      return NextResponse.json(
        { error: '파일 버퍼를 찾을 수 없습니다. 파일을 다시 업로드해 주세요.' },
        { status: 404 }
      );
    }

    console.log(`[detect-from-ocr] OCR bbox 감지 시작 — job=${jobId}, file=${job.fileName}`);
    const questions = await runOcrBboxDetection(fileBuffer, job.fileName);

    console.log(`[detect-from-ocr] 완료 — ${questions.length}개 문제 감지`);

    return NextResponse.json({
      success: true,
      questions,
      count: questions.length,
    });
  } catch (err) {
    console.error('[detect-from-ocr] 오류:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
