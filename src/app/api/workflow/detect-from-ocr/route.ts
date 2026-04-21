// ============================================================================
// /api/workflow/detect-from-ocr
// Mathpix OCR → groupLinesIntoQuestions → 문제별 bbox 반환
// analyze 페이지에서 GPT-4o Vision 없이 즉시 bbox 자동 감지할 때 호출
//
// ★ Vercel 서버리스 환경 대응:
// - 인메모리 jobStore가 함수 인스턴스 간 공유 안 되므로
// - jobId로 Supabase Storage에서 직접 파일 리스팅 → 다운로드 방식으로 폴백
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { runOcrBboxDetection } from '@/lib/workflow/cloud-flow';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { UploadJob } from '@/types/workflow';

// upload/route.ts와 동일한 globalThis 공유 스토어 접근 (로컬 개발용)
const globalForJobs = globalThis as unknown as {
  __jobStore?: Map<string, UploadJob>;
  __fileBufferStore?: Map<string, { problem: ArrayBuffer; answer?: ArrayBuffer; quickAnswer?: ArrayBuffer }>;
};

export const maxDuration = 120; // Mathpix OCR 최대 2분
export const dynamic = 'force-dynamic';

/**
 * Storage의 uploads/{jobId}_* 중 메인 파일(answer/quick 제외)을 찾아서 반환.
 */
async function resolveJobFromStorage(jobId: string): Promise<{ storagePath: string; fileName: string } | null> {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin.storage
    .from('source-files')
    .list('uploads', { search: jobId });

  if (error || !data || data.length === 0) {
    console.warn(`[detect-from-ocr] Storage list 실패 또는 빈 결과: ${error?.message || 'empty'}`);
    return null;
  }

  // answer/quick suffix 제외한 메인 파일 선택
  const mainFile = data.find((f) => {
    if (!f.name.startsWith(jobId + '_')) return false;
    const rest = f.name.slice(jobId.length + 1);
    return !rest.startsWith('answer_') && !rest.startsWith('quick_');
  });

  if (!mainFile) {
    console.warn(`[detect-from-ocr] jobId ${jobId} 메인 파일 없음. 후보:`, data.map((f) => f.name));
    return null;
  }

  // 파일명 복원: uploads/{jobId}_{encodedName} → decode로 한글 원복
  const encodedName = mainFile.name.slice(jobId.length + 1);
  let fileName = encodedName;
  try {
    fileName = decodeURIComponent(encodedName);
  } catch {
    // 구버전 파일 (언더스코어 치환된 것) — decoded 실패 시 그대로 사용
  }
  return {
    storagePath: `uploads/${mainFile.name}`,
    fileName,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json() as { jobId: string };

    if (!jobId) {
      return NextResponse.json({ error: 'jobId 필수' }, { status: 400 });
    }

    // ── 1. 인메모리 jobStore 조회 (로컬 개발) ──
    const jobStore = globalForJobs.__jobStore;
    const fileBufferStore = globalForJobs.__fileBufferStore;

    let storagePath: string | null = null;
    let fileName: string | null = null;
    let fileBuffer: ArrayBuffer | null = null;

    const job = jobStore?.get(jobId);
    if (job) {
      storagePath = job.storagePath;
      fileName = job.fileName;
      fileBuffer = fileBufferStore?.get(jobId)?.problem ?? null;
    }

    // ── 2. jobStore 미발견 시 Storage에서 직접 해석 (Vercel 프로덕션) ──
    if (!storagePath || !fileName) {
      console.log(`[detect-from-ocr] jobStore miss → Storage에서 jobId=${jobId} 해석 시도`);
      const resolved = await resolveJobFromStorage(jobId);
      if (resolved) {
        storagePath = resolved.storagePath;
        fileName = resolved.fileName;
      }
    }

    if (!storagePath || !fileName) {
      return NextResponse.json(
        { error: '업로드 job을 찾을 수 없습니다. 파일을 다시 업로드해 주세요.', jobId },
        { status: 404 }
      );
    }

    // ── 3. 파일 버퍼 확보 (메모리 → Storage 순) ──
    if (!fileBuffer && supabaseAdmin) {
      console.log(`[detect-from-ocr] Storage 다운로드: ${storagePath}`);
      const { data, error } = await supabaseAdmin.storage
        .from('source-files')
        .download(storagePath);

      if (error) {
        console.error('[detect-from-ocr] Storage 다운로드 실패:', error.message);
        return NextResponse.json({ error: `Storage 다운로드 실패: ${error.message}` }, { status: 500 });
      }
      if (data) {
        fileBuffer = await data.arrayBuffer();
      }
    }

    if (!fileBuffer) {
      return NextResponse.json(
        { error: '파일 버퍼를 찾을 수 없습니다. 파일을 다시 업로드해 주세요.' },
        { status: 404 }
      );
    }

    console.log(`[detect-from-ocr] OCR bbox 감지 시작 — job=${jobId}, file=${fileName}`);
    const questions = await runOcrBboxDetection(fileBuffer, fileName);
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
