// ============================================================================
// Cloud Flow API - PDF 업로드 및 자동 분류 백그라운드 작업
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { UploadJob, ProcessingStatus, LLMAnalysisResult } from '@/types/workflow';
import { processUploadJob, getStatusLabel } from '@/lib/workflow/cloud-flow';

// In-memory job storage (실제 구현에서는 Redis 또는 DB 사용)
const jobStore = new Map<string, UploadJob>();
const jobResults = new Map<string, LLMAnalysisResult[]>();

/**
 * POST /api/workflow/upload
 * 파일 업로드 및 백그라운드 처리 시작
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    // 인증 확인
    if (supabase) {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const instituteId = formData.get('instituteId') as string;
    const userId = formData.get('userId') as string;
    const autoClassify = formData.get('autoClassify') === 'true';
    const generateSolutions = formData.get('generateSolutions') === 'true';

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      );
    }

    // 파일 유형 검증
    const fileType = getFileType(file.name);
    if (!fileType) {
      return NextResponse.json(
        { error: 'Unsupported file type. Only PDF, images, and HWP are allowed.' },
        { status: 400 }
      );
    }

    // Job 생성
    const job: UploadJob = {
      id: crypto.randomUUID(),
      userId: userId || 'anonymous',
      instituteId: instituteId || 'default',
      fileName: file.name,
      fileSize: file.size,
      fileType,
      storagePath: '', // Storage에 업로드 후 설정
      status: 'PENDING',
      progress: 0,
      currentStep: '대기 중',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Job 저장
    jobStore.set(job.id, job);

    // Storage 업로드 (Supabase Storage 또는 로컬)
    const storagePath = await uploadToStorage(file, job.id, supabase);
    job.storagePath = storagePath;
    job.status = 'UPLOADING';
    job.progress = 10;
    jobStore.set(job.id, job);

    // 백그라운드 처리 시작 (non-blocking)
    if (autoClassify) {
      processJobInBackground(job.id).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: '업로드가 시작되었습니다.',
      job: {
        id: job.id,
        fileName: job.fileName,
        status: job.status,
        progress: job.progress,
      },
    });
  } catch (error) {
    console.error('[Upload API] Error:', error);
    return NextResponse.json(
      { error: 'Upload failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workflow/upload?jobId=xxx
 * Job 상태 조회
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    // 모든 Job 목록 반환
    const jobs = Array.from(jobStore.values()).map((job) => ({
      id: job.id,
      fileName: job.fileName,
      status: job.status,
      statusLabel: getStatusLabel(job.status),
      progress: job.progress,
      currentStep: job.currentStep,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      error: job.error,
    }));

    return NextResponse.json({ jobs });
  }

  const job = jobStore.get(jobId);
  if (!job) {
    return NextResponse.json(
      { error: 'Job not found' },
      { status: 404 }
    );
  }

  const results = jobResults.get(jobId);

  return NextResponse.json({
    job: {
      ...job,
      statusLabel: getStatusLabel(job.status),
    },
    results: results || null,
    hasResults: !!results && results.length > 0,
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function getFileType(fileName: string): 'PDF' | 'IMG' | 'HWP' | null {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf':
      return 'PDF';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
      return 'IMG';
    case 'hwp':
    case 'hwpx':
      return 'HWP';
    default:
      return null;
  }
}

async function uploadToStorage(
  file: File,
  jobId: string,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<string> {
  const fileName = `${jobId}_${file.name}`;
  const storagePath = `uploads/${fileName}`;

  if (supabase) {
    // Supabase Storage에 업로드
    const { data, error } = await supabase.storage
      .from('source-files')
      .upload(storagePath, file);

    if (error) {
      console.error('Storage upload error:', error);
      // 실패해도 로컬 경로 반환
      return storagePath;
    }

    return data.path;
  }

  // Supabase 미설정 시 임시 경로 반환
  return storagePath;
}

async function processJobInBackground(jobId: string): Promise<void> {
  const job = jobStore.get(jobId);
  if (!job) return;

  try {
    const results = await processUploadJob(job, {
      onStatusChange: (status: ProcessingStatus, step: string) => {
        const currentJob = jobStore.get(jobId);
        if (currentJob) {
          currentJob.status = status;
          currentJob.currentStep = step;
          currentJob.updatedAt = new Date().toISOString();
          if (status === 'COMPLETED') {
            currentJob.completedAt = new Date().toISOString();
          }
          jobStore.set(jobId, currentJob);
        }
      },
      onProgress: (progress: number) => {
        const currentJob = jobStore.get(jobId);
        if (currentJob) {
          currentJob.progress = progress;
          currentJob.updatedAt = new Date().toISOString();
          jobStore.set(jobId, currentJob);
        }
      },
      onComplete: (analysisResults: LLMAnalysisResult[]) => {
        jobResults.set(jobId, analysisResults);

        // DB에 문제 저장 (실제 구현)
        saveProblemsToDB(jobId, analysisResults).catch(console.error);
      },
      onError: (error: string) => {
        const currentJob = jobStore.get(jobId);
        if (currentJob) {
          currentJob.error = error;
          currentJob.status = 'FAILED';
          currentJob.updatedAt = new Date().toISOString();
          jobStore.set(jobId, currentJob);
        }
      },
    });

    console.log(`[Job ${jobId}] Completed with ${results.length} problems`);
  } catch (error) {
    console.error(`[Job ${jobId}] Failed:`, error);
  }
}

async function saveProblemsToDB(
  jobId: string,
  results: LLMAnalysisResult[]
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    console.log('[DB] Supabase not configured, skipping DB save');
    return;
  }

  const job = jobStore.get(jobId);
  if (!job) return;

  for (const result of results) {
    // problems 테이블에 저장
    const { data: problem, error: problemError } = await supabase
      .from('problems')
      .insert({
        institute_id: job.instituteId,
        created_by: job.userId,
        source_file_id: job.id,
        content_latex: result.solution.steps.map((s) => s.latex).join('\n'),
        content_html: '',
        solution_latex: result.solution.steps
          .map((s) => `${s.stepNumber}. ${s.description}\n${s.latex}`)
          .join('\n\n'),
        solution_html: '',
        answer_json: { finalAnswer: result.solution.finalAnswer },
        images: [],
        status: 'PENDING_REVIEW',
        ai_analysis: {
          classification: result.classification,
          solution: result.solution,
          analyzedAt: result.analyzedAt,
        },
        tags: result.keywordsTags,
      })
      .select()
      .single();

    if (problemError) {
      console.error('Problem insert error:', problemError);
      continue;
    }

    // classifications 테이블에 저장
    if (problem) {
      await supabase.from('classifications').insert({
        problem_id: problem.id,
        type_code: result.classification.typeCode,
        difficulty: String(result.classification.difficulty) as '1' | '2' | '3' | '4' | '5',
        cognitive_domain: result.classification.cognitiveDomain,
        ai_confidence: result.classification.confidence,
        is_verified: false,
        classification_source: 'GPT-4o',
        estimated_time_minutes: result.estimatedTimeMinutes,
        prerequisite_types: result.classification.prerequisites,
      });
    }
  }

  console.log(`[DB] Saved ${results.length} problems from job ${jobId}`);
}
