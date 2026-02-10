// ============================================================================
// Cloud Flow API - PDF 업로드 및 자동 분류 백그라운드 작업
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import type { UploadJob, ProcessingStatus, LLMAnalysisResult } from '@/types/workflow';
import { processUploadJob, getStatusLabel } from '@/lib/workflow/cloud-flow';

// In-memory job storage (globalThis로 개발서버 hot-reload 시에도 유지)
// 실제 프로덕션에서는 Redis 또는 DB 사용 권장
const globalForJobs = globalThis as unknown as {
  __jobStore?: Map<string, UploadJob>;
  __jobResults?: Map<string, LLMAnalysisResult[]>;
  __fileBufferStore?: Map<string, { problem: ArrayBuffer; answer?: ArrayBuffer; quickAnswer?: ArrayBuffer }>;
};

const jobStore = globalForJobs.__jobStore ?? (globalForJobs.__jobStore = new Map<string, UploadJob>());
const jobResults = globalForJobs.__jobResults ?? (globalForJobs.__jobResults = new Map<string, LLMAnalysisResult[]>());
const fileBufferStore = globalForJobs.__fileBufferStore ?? (globalForJobs.__fileBufferStore = new Map<string, { problem: ArrayBuffer; answer?: ArrayBuffer; quickAnswer?: ArrayBuffer }>());

/**
 * POST /api/workflow/upload
 * 파일 업로드 및 백그라운드 처리 시작
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();

    // 개발 환경에서는 인증을 선택적으로 처리
    let userId = 'anonymous';
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
      }
      // 개발 환경에서는 인증 없이도 업로드 허용
      // 프로덕션에서는 아래 주석 해제
      // if (!user) {
      //   return NextResponse.json(
      //     { error: 'Unauthorized' },
      //     { status: 401 }
      //   );
      // }
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const answerFile = formData.get('answerFile') as File | null;
    const quickAnswerFile = formData.get('quickAnswerFile') as File | null;

    const instituteId = formData.get('instituteId') as string;
    const formUserId = formData.get('userId') as string;
    const documentType = (formData.get('documentType') as 'PROBLEM' | 'ANSWER' | 'QUICK_ANSWER') || 'PROBLEM';
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

    // Job 생성 (userId는 인증된 사용자 ID 우선 사용)
    const effectiveUserId = userId !== 'anonymous' ? userId : (formUserId || 'anonymous');

    const job: UploadJob = {
      id: crypto.randomUUID(),
      userId: effectiveUserId,
      instituteId: instituteId || 'default',
      fileName: file.name,
      fileSize: file.size,
      fileType,
      documentType,
      storagePath: '', // Storage에 업로드 후 설정
      status: 'PENDING',
      progress: 0,
      currentStep: '대기 중',
      autoClassify,
      generateSolutions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Job 저장
    jobStore.set(job.id, job);

    // Storage 업로드 (Supabase Storage 또는 로컬)
    const storagePath = await uploadToStorage(file, job.id, supabase);
    job.storagePath = storagePath;

    // 보조 파일 업로드 (선택사항)
    if (answerFile) {
      await uploadToStorage(answerFile, job.id, supabase, 'answer');
    }
    if (quickAnswerFile) {
      await uploadToStorage(quickAnswerFile, job.id, supabase, 'quick');
    }

    job.status = 'UPLOADING';
    job.progress = 10;
    jobStore.set(job.id, job);

    // 파일 버퍼 읽기
    const fileBuffer = await file.arrayBuffer();
    const answerBuffer = answerFile ? await answerFile.arrayBuffer() : undefined;
    const quickAnswerBuffer = quickAnswerFile ? await quickAnswerFile.arrayBuffer() : undefined;

    const buffers = {
      problem: fileBuffer,
      answer: answerBuffer,
      quickAnswer: quickAnswerBuffer
    };

    fileBufferStore.set(job.id, buffers);

    // 백그라운드 처리 시작 (non-blocking)
    if (autoClassify) {
      processJobInBackground(job.id, buffers).catch(console.error);
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
    console.warn(`[Upload API] Job not found: ${jobId}. Store has ${jobStore.size} jobs: [${Array.from(jobStore.keys()).join(', ')}]`);
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
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  suffix: string = '' // suffix for auxiliary files
): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileName = suffix ? `${jobId}_${suffix}_${safeName}` : `${jobId}_${safeName}`;
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

async function processJobInBackground(
  jobId: string,
  buffers?: { problem: ArrayBuffer; answer?: ArrayBuffer; quickAnswer?: ArrayBuffer }
): Promise<void> {
  const job = jobStore.get(jobId);
  if (!job) return;

  // 파일 버퍼가 없으면 저장된 것에서 가져오기
  const currentBuffers = buffers || fileBufferStore.get(jobId);

  if (!currentBuffers || !currentBuffers.problem) {
    console.error(`[Job ${jobId}] No file buffers found.`);
    return;
  }

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
        // 버퍼 정리
        fileBufferStore.delete(jobId);

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
        // 버퍼 정리
        fileBufferStore.delete(jobId);
      },
    }, currentBuffers); // Pass the buffers object!

    console.log(`[Job ${jobId}] Completed with ${results.length} problems`);
  } catch (error) {
    console.error(`[Job ${jobId}] Failed:`, error);
    // 버퍼 정리
    fileBufferStore.delete(jobId);
  }
}

async function saveProblemsToDB(
  jobId: string,
  results: LLMAnalysisResult[]
): Promise<void> {
  // Use Admin Client to bypass RLS for background processing
  const supabase = supabaseAdmin;

  if (!supabase) {
    console.log('[DB] Supabase Admin not configured, skipping DB save');
    return;
  }

  const job = jobStore.get(jobId);
  if (!job) return;

  // UUID 유효성 검사 함수
  const isValidUUID = (str: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  const createdBy = isValidUUID(job.userId) ? job.userId : null;

  // 사용자의 institute_id 조회 (users 테이블에서)
  let instituteId: string | null = isValidUUID(job.instituteId) ? job.instituteId : null;

  if (!instituteId && createdBy) {
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('institute_id')
        .eq('id', createdBy)
        .single();

      if (userData?.institute_id) {
        instituteId = userData.institute_id;
        console.log(`[DB] Found user's institute_id: ${instituteId}`);
      }
    } catch (e) {
      console.log('[DB] Could not fetch user institute_id:', e);
    }
  }

  // institute_id가 없으면 기본 학원 생성 또는 조회
  if (!instituteId) {
    try {
      // 기존 기본 학원 찾기
      const { data: defaultInst } = await supabase
        .from('institutes')
        .select('id')
        .eq('name', '개인 사용자')
        .limit(1)
        .single();

      if (defaultInst) {
        instituteId = defaultInst.id;
        console.log(`[DB] Using existing default institute: ${instituteId}`);
      } else {
        // 기본 학원 생성
        const { data: newInst, error: instError } = await supabase
          .from('institutes')
          .insert({
            name: '개인 사용자',
          })
          .select('id')
          .single();

        if (newInst) {
          instituteId = newInst.id;
          console.log(`[DB] Created default institute: ${instituteId}`);

          // 사용자와 학원 연결
          if (createdBy) {
            await supabase
              .from('users')
              .update({ institute_id: instituteId })
              .eq('id', createdBy);
            console.log(`[DB] Linked user ${createdBy} to institute ${instituteId}`);
          }
        } else {
          console.error('[DB] Failed to create default institute:', instError?.message);
        }
      }
    } catch (e) {
      console.log('[DB] Institute lookup/create error:', e);
    }
  }

  console.log(`[DB] Saving ${results.length} problems for job ${jobId}`);
  console.log(`[DB] instituteId: ${instituteId}, createdBy: ${createdBy}`);

  // 1. Exam 레코드 생성 (Repository 노출용)
  // 003_exams.sql 마이그레이션 스키마 기준 컬럼만 사용
  let examId: string | null = null;
  try {
    const firstResult = results[0];
    const classification = firstResult?.classification;

    const examInsertData: Record<string, any> = {
      title: job.fileName.replace(/\.[^/.]+$/, ""),
      description: `업로드된 파일: ${job.fileName} (${results.length}문항)`,
      status: 'COMPLETED',
      created_by: createdBy,
      institute_id: instituteId,
      grade: '미분류',
      subject: classification?.subject || '수학',
      unit: classification?.chapter || '미분류',
      difficulty: 'Lv.3',
      problem_count: results.length,
      total_points: results.length * 4,
      time_limit_minutes: 50,
    };

    console.log(`[DB] Inserting exam with data:`, JSON.stringify(examInsertData, null, 2));

    let examResult = await supabase
      .from('exams')
      .insert(examInsertData)
      .select('id')
      .single();

    // 컬럼 에러 시 (PostgREST 스키마 캐시 문제) 최소 컬럼만으로 재시도
    if (examResult.error && examResult.error.message.includes('column')) {
      console.warn(`[DB] Retrying exam insert with minimal columns: ${examResult.error.message}`);
      examResult = await supabase
        .from('exams')
        .insert({
          title: examInsertData.title,
          description: examInsertData.description,
          status: examInsertData.status,
          created_by: createdBy,
          institute_id: instituteId,
        })
        .select('id')
        .single();
    }

    const { data: exam, error: examError } = examResult;

    if (examError) {
      console.error('[DB] Failed to create exam record:', examError.message);
      // institute_id NOT NULL 에러 시 institute_id 없이 한번 더 시도 (003_exams.sql은 nullable)
      if (examError.message.includes('institute_id') || examError.message.includes('not-null')) {
        console.warn('[DB] Retrying without institute_id (nullable in migration)...');
        const retryResult = await supabase
          .from('exams')
          .insert({
            title: examInsertData.title,
            description: examInsertData.description,
            status: examInsertData.status,
            created_by: createdBy,
            problem_count: results.length,
          })
          .select('id')
          .single();

        if (retryResult.data) {
          examId = retryResult.data.id;
          console.log(`[DB] Created exam record (no institute): ${examId}`);
        } else {
          console.error('[DB] Final retry also failed:', retryResult.error?.message);
        }
      }
    } else {
      examId = exam.id;
      console.log(`[DB] Created exam record: ${examId}`);
    }
  } catch (err) {
    console.error('[DB] Error creating exam:', err);
  }

  let savedCount = 0;

  for (const result of results) {
    try {
      // 문제 내용: 원본 OCR 텍스트 사용 (없으면 해설 steps에서 추출)
      const problemContent = result.originalText
        || result.solution.steps.map((s) => s.description).join('\n')
        || '(자동 추출된 문제)';

      // 수식 포함 콘텐츠 구성
      const mathExprs = result.originalMathExpressions || [];
      const contentWithMath = mathExprs.length > 0
        ? `${problemContent}\n\n수식:\n${mathExprs.map(m => `$${m}$`).join('\n')}`
        : problemContent;

      // problems 테이블에 저장
      const { data: problem, error: problemError } = await supabase
        .from('problems')
        .insert({
          institute_id: instituteId,
          created_by: createdBy,
          source_file_id: null,
          content_latex: contentWithMath,
          content_html: null,
          solution_latex: result.solution.steps && result.solution.steps.length > 0
            ? result.solution.steps
                .map((s) => `${s.stepNumber}. ${s.description}\n${s.latex || ''}`)
                .join('\n\n')
            : result.solution.approach || '해설 자동 생성 실패',
          solution_html: null,
          answer_json: {
            finalAnswer: result.solution.finalAnswer || '',
            type: 'short_answer',
            correct_answer: result.solution.finalAnswer || '',
          },
          images: [],
          status: 'PENDING_REVIEW',
          ai_analysis: {
            classification: result.classification,
            solution: result.solution,
            analyzedAt: result.analyzedAt,
          },
          tags: result.keywordsTags || [],
          source_name: job.fileName,
        })
        .select()
        .single();

      if (problemError) {
        console.error('[DB] Problem insert error:', problemError.message);
        continue;
      }

      // classifications 테이블에 저장
      if (problem) {
        const difficultyStr = String(result.classification.difficulty) as '1' | '2' | '3' | '4' | '5';

        await supabase.from('classifications').insert({
          problem_id: problem.id,
          type_code: result.classification.typeCode || 'UNKNOWN',
          difficulty: difficultyStr,
          cognitive_domain: result.classification.cognitiveDomain || 'CALCULATION',
          ai_confidence: result.classification.confidence || 0.5,
          is_verified: false,
          classification_source: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          estimated_time_minutes: result.estimatedTimeMinutes || 5,
          prerequisite_types: result.classification.prerequisites || [],
        });

        savedCount++;

        // Exam-Problem 연결
        if (examId) {
          try {
            await supabase.from('exam_problems').insert({
              exam_id: examId,
              problem_id: problem.id,
              order_index: savedCount,
              points: 4
            });
          } catch (e) {
            console.log('[DB] exam_problems link failed (might not exist)', e);
          }
        }
      }
    } catch (err) {
      console.error(`[DB] Error processing result ${result.problemId}:`, err);
    }
  }

  console.log(`[DB] Successfully saved ${savedCount}/${results.length} problems from job ${jobId}`);
}
