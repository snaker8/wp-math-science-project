// ============================================================================
// Cloud Flow API - PDF 업로드 및 자동 분류 백그라운드 작업
// ============================================================================

// ★ 대용량 PDF 지원: API Route 설정
export const maxDuration = 300; // 5분 타임아웃
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import type { UploadJob, ProcessingStatus, LLMAnalysisResult } from '@/types/workflow';
import { processUploadJob, getStatusLabel, convertedPdfStore } from '@/lib/workflow/cloud-flow';
import { convertHWPtoPDF } from '@/lib/workflow/hwp-converter';
import { detectSubjectFromTitle, detectGradeFromTitle, detectExamTypeFromTitle } from '@/lib/utils/exam-detect';
import { findAutoFolderForSubject } from '@/lib/utils/auto-folder';

// In-memory job storage (globalThis로 개발서버 hot-reload 시에도 유지)
// 실제 프로덕션에서는 Redis 또는 DB 사용 권장
/** 이미지 파이프라인 결과 타입 */
interface ImagePipelineResult {
  status: 'running' | 'done' | 'error';
  extracted_count: number;
  enhanced_count: number;
  db_entries_added: number;
  images: Array<{ filename: string; page: number; width: number; height: number; upscaled: boolean }>;
  error?: string;
}

const globalForJobs = globalThis as unknown as {
  __jobStore?: Map<string, UploadJob>;
  __jobResults?: Map<string, LLMAnalysisResult[]>;
  __fileBufferStore?: Map<string, { problem: ArrayBuffer; answer?: ArrayBuffer; quickAnswer?: ArrayBuffer }>;
  __autoSavedExams?: Map<string, string>; // jobId → examId (자동 자산화된 시험지 ID)
  __imagePipelineResults?: Map<string, ImagePipelineResult>; // jobId → 이미지 파이프라인 결과
};

const jobStore = globalForJobs.__jobStore ?? (globalForJobs.__jobStore = new Map<string, UploadJob>());
const jobResults = globalForJobs.__jobResults ?? (globalForJobs.__jobResults = new Map<string, LLMAnalysisResult[]>());
const fileBufferStore = globalForJobs.__fileBufferStore ?? (globalForJobs.__fileBufferStore = new Map<string, { problem: ArrayBuffer; answer?: ArrayBuffer; quickAnswer?: ArrayBuffer }>());
const autoSavedExams = globalForJobs.__autoSavedExams ?? (globalForJobs.__autoSavedExams = new Map<string, string>());
const imagePipelineResults = globalForJobs.__imagePipelineResults ?? (globalForJobs.__imagePipelineResults = new Map<string, ImagePipelineResult>());

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

    // 업로드 방식 판별: legacy(File bytes in body) vs direct(Storage에 미리 업로드 후 경로 전달)
    const file = formData.get('file') as File | null;
    const answerFile = formData.get('answerFile') as File | null;
    const quickAnswerFile = formData.get('quickAnswerFile') as File | null;

    const directStoragePath = formData.get('storagePath') as string | null;
    const directFileName = formData.get('fileName') as string | null;
    const directFileSize = formData.get('fileSize') as string | null;
    const directFileMime = formData.get('fileMimeType') as string | null;
    const directAnswerPath = formData.get('answerStoragePath') as string | null;
    const directAnswerName = formData.get('answerFileName') as string | null;
    const directQuickPath = formData.get('quickAnswerStoragePath') as string | null;
    const directQuickName = formData.get('quickAnswerFileName') as string | null;
    const uploadJobIdHint = formData.get('uploadJobId') as string | null;

    const instituteId = formData.get('instituteId') as string;
    const formUserId = formData.get('userId') as string;
    const documentType = (formData.get('documentType') as 'PROBLEM' | 'ANSWER' | 'QUICK_ANSWER') || 'PROBLEM';
    const autoClassify = formData.get('autoClassify') === 'true';
    const generateSolutions = formData.get('generateSolutions') === 'true';
    const bookGroupId = formData.get('bookGroupId') as string | null;
    const appendToExamId = formData.get('appendTo') as string | null; // 기존 시험지에 병합
    const subjectArea = (formData.get('subjectArea') as 'math' | 'science') || 'math';
    const scienceSubject = formData.get('scienceSubject') as string | null;
    const curriculumVersion = (formData.get('curriculumVersion') as '2015' | '2022') || '2022';
    const scienceMode = (formData.get('scienceMode') as 'diagrams_only' | 'full') || 'full';

    // ── 파일 정보 + 버퍼 확보 (direct 또는 legacy) ──
    let mainFileName: string;
    let mainFileSize: number;
    let mainFileMime: string;
    let fetchMainBuffer: () => Promise<ArrayBuffer>;

    if (directStoragePath && directFileName) {
      // direct mode: Storage에서 다운로드하여 버퍼 확보
      mainFileName = directFileName;
      mainFileSize = directFileSize ? Number(directFileSize) : 0;
      mainFileMime = directFileMime || 'application/pdf';
      fetchMainBuffer = async () => {
        if (!supabaseAdmin) throw new Error('Storage not configured (service role key missing)');
        const { data, error } = await supabaseAdmin.storage.from('source-files').download(directStoragePath);
        if (error || !data) throw new Error(`Storage 다운로드 실패: ${error?.message || 'unknown'}`);
        return await data.arrayBuffer();
      };
    } else if (file) {
      // legacy mode: FormData body에서 직접
      mainFileName = file.name;
      mainFileSize = file.size;
      mainFileMime = file.type;
      fetchMainBuffer = () => file.arrayBuffer();
    } else {
      return NextResponse.json(
        { error: 'file or storagePath required' },
        { status: 400 }
      );
    }

    // 파일 유형 검증
    const fileType = getFileType(mainFileName);
    if (!fileType) {
      return NextResponse.json(
        { error: 'Unsupported file type. Only PDF, images, and HWP are allowed.' },
        { status: 400 }
      );
    }

    // ★ 과학 도식 추출만 모드: Storage/Job 생성 없이 이미지 파이프라인만 실행
    const isDiagramsOnly = subjectArea === 'science' && scienceMode === 'diagrams_only';
    if (isDiagramsOnly) {
      const fileBuffer = await fetchMainBuffer();
      const tempJobId = uploadJobIdHint || crypto.randomUUID();

      // 파이프라인 동기 실행 (Next.js가 응답 후 백그라운드 작업을 중단하므로 await 필수)
      await runScienceImagePipeline(tempJobId, fileBuffer, mainFileName, scienceSubject);
      const pipelineResult = imagePipelineResults.get(tempJobId);

      return NextResponse.json({
        success: true,
        jobId: tempJobId,
        mode: 'diagrams_only',
        message: '도식 이미지 추출이 완료되었습니다.',
        job: {
          id: tempJobId,
          fileName: mainFileName,
          status: pipelineResult?.status === 'done' ? 'COMPLETED' : 'FAILED',
          progress: 100,
        },
        result: pipelineResult,
      });
    }

    // ── 이하: 수학 or 과학 문제 자산화 모드 ──

    // Job 생성 (userId는 인증된 사용자 ID 우선 사용)
    const effectiveUserId = userId !== 'anonymous' ? userId : (formUserId || 'anonymous');

    const job: UploadJob = {
      id: uploadJobIdHint || crypto.randomUUID(),
      userId: effectiveUserId,
      instituteId: instituteId || 'default',
      fileName: mainFileName,
      fileSize: mainFileSize,
      fileType,
      documentType,
      storagePath: directStoragePath || '', // direct 모드면 이미 알고 있음
      status: 'PENDING',
      progress: 0,
      currentStep: '대기 중',
      autoClassify,
      generateSolutions,
      bookGroupId: bookGroupId || undefined,  // ★ 클라우드 북그룹 ID 저장
      appendToExamId: appendToExamId || undefined, // ★ 기존 시험지에 병합
      subjectArea,
      scienceSubject: scienceSubject || undefined,
      curriculumVersion: subjectArea === 'science' ? curriculumVersion : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Job 저장
    jobStore.set(job.id, job);

    // 파일 버퍼 확보 (direct 모드면 Storage 다운로드, legacy면 FormData에서)
    const fileBuffer = await fetchMainBuffer();

    // 보조 파일 버퍼 (direct 또는 legacy)
    const downloadFromStorage = async (path: string): Promise<ArrayBuffer> => {
      if (!supabaseAdmin) throw new Error('Storage not configured');
      const { data, error } = await supabaseAdmin.storage.from('source-files').download(path);
      if (error || !data) throw new Error(`Storage 다운로드 실패 (${path}): ${error?.message}`);
      return await data.arrayBuffer();
    };

    let answerBuffer: ArrayBuffer | undefined;
    if (answerFile) {
      answerBuffer = await answerFile.arrayBuffer();
    } else if (directAnswerPath) {
      answerBuffer = await downloadFromStorage(directAnswerPath);
    }

    let quickAnswerBuffer: ArrayBuffer | undefined;
    if (quickAnswerFile) {
      quickAnswerBuffer = await quickAnswerFile.arrayBuffer();
    } else if (directQuickPath) {
      quickAnswerBuffer = await downloadFromStorage(directQuickPath);
    }

    // Storage 업로드 — direct mode는 이미 클라이언트가 업로드 완료, legacy만 서버 업로드
    if (directStoragePath) {
      job.storagePath = directStoragePath;
    } else {
      const storagePath = await uploadToStorage(fileBuffer, mainFileName, mainFileMime, job.id, supabase);
      job.storagePath = storagePath;
    }

    if (answerFile && answerBuffer && !directAnswerPath) {
      await uploadToStorage(answerBuffer, answerFile.name, answerFile.type, job.id, supabase, 'answer');
    }
    if (quickAnswerFile && quickAnswerBuffer && !directQuickPath) {
      await uploadToStorage(quickAnswerBuffer, quickAnswerFile.name, quickAnswerFile.type, job.id, supabase, 'quick');
    }

    job.status = 'UPLOADING';
    job.progress = 10;
    jobStore.set(job.id, job);

    const buffers = {
      problem: fileBuffer,
      answer: answerBuffer,
      quickAnswer: quickAnswerBuffer
    };

    fileBufferStore.set(job.id, buffers);

    // ★ Vercel 서버리스 대응: fire-and-forget 금지 (함수 종료 후 중단됨)
    // 모든 처리를 동기식으로 await → maxDuration=300초 한도 내 완료

    // HWP → PDF 변환 (미리보기용)
    if (fileType === 'HWP') {
      try {
        await convertHWPInBackground(job.id, buffers.problem, job);
      } catch (err) {
        console.error('[Upload] HWP 변환 실패:', err);
      }
    }

    // 자동 분류 + 해설 생성 (OCR → GPT → Supabase 저장)
    let classifyCompleted = false;
    let autoSavedExamId: string | null = null;
    if (autoClassify) {
      try {
        await processJobInBackground(job.id, buffers);
        classifyCompleted = true;
        autoSavedExamId = autoSavedExams.get(job.id) || null;
      } catch (err) {
        console.error('[Upload] 자동 분류 실패:', err);
        // 파일은 Storage에 올라가 있으므로 분석 페이지에서 수동 처리 가능
      }
    }

    // ★ 자동 분류 성공 시 해설도 자동 생성 시작 (fire-and-forget)
    if (autoSavedExamId) {
      triggerAutoSolutionGeneration(autoSavedExamId, request.nextUrl.origin);
    }

    // 과학 도식 이미지 파이프라인
    if (subjectArea === 'science') {
      try {
        await runScienceImagePipeline(job.id, fileBuffer, mainFileName, scienceSubject);
      } catch (err) {
        console.error('[Upload] 과학 이미지 파이프라인 실패:', err);
      }
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: classifyCompleted ? '업로드 및 자동 분류 완료' : '업로드 완료',
      classifyCompleted,
      autoSavedExamId,
      job: {
        id: job.id,
        fileName: job.fileName,
        status: classifyCompleted ? 'COMPLETED' : job.status,
        progress: classifyCompleted ? 100 : job.progress,
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

  let job = jobStore.get(jobId);

  // ★ Vercel 서버리스: jobStore 미발견 시 Storage에서 복원 (최소 정보)
  if (!job && supabaseAdmin) {
    console.log(`[Upload API] jobStore miss → Storage 복원 시도: ${jobId}`);
    const { data: files } = await supabaseAdmin.storage
      .from('source-files')
      .list('uploads', { search: jobId });

    const mainFile = files?.find((f) => {
      if (!f.name.startsWith(jobId + '_')) return false;
      const rest = f.name.slice(jobId.length + 1);
      return !rest.startsWith('answer_') && !rest.startsWith('quick_');
    });

    if (mainFile) {
      // ★ 한글 파일명 복원 우선순위: sidecar 메타 > decodeURIComponent > raw name
      //   (upload-url이 현재는 '_' 치환이라 decode 무의미, 메타에서 원본 복구)
      const encodedName = mainFile.name.slice(jobId.length + 1);
      let fileName = encodedName;
      try {
        const { data: metaData } = await supabaseAdmin.storage
          .from('source-files')
          .download(`uploads/${jobId}.meta.json`);
        if (metaData) {
          const meta = JSON.parse(await metaData.text());
          if (meta.originalFilename) fileName = meta.originalFilename;
        }
      } catch { /* 메타 없으면 fallback */ }
      if (fileName === encodedName) {
        try { fileName = decodeURIComponent(encodedName); } catch { /* 구버전 호환 */ }
      }
      const storagePath = `uploads/${mainFile.name}`;
      job = {
        id: jobId,
        userId: 'unknown',
        instituteId: 'default',
        fileName,
        fileSize: mainFile.metadata?.size ?? 0,
        fileType: getFileType(fileName) || 'PDF',
        documentType: 'PROBLEM',
        storagePath,
        status: 'COMPLETED' as ProcessingStatus, // Storage에 있으면 최소한 업로드는 완료
        progress: 100,
        currentStep: '파일 업로드 완료 (백그라운드 처리 결과는 별도 저장소에서 조회)',
        createdAt: mainFile.created_at || new Date().toISOString(),
        updatedAt: mainFile.updated_at || new Date().toISOString(),
      };
      // 서버리스에서는 jobStore에 넣어도 다음 요청에 유지 안 되지만, 같은 요청 내에서 활용
      jobStore.set(jobId, job);
    }
  }

  if (!job) {
    console.warn(`[Upload API] Job not found: ${jobId}. Store has ${jobStore.size} jobs.`);
    return NextResponse.json(
      { error: 'Job not found' },
      { status: 404 }
    );
  }

  const results = jobResults.get(jobId);

  // 디버그: results 내용 로그 (결과 있을 때만 — EMPTY는 처리 중 정상이므로 무시)
  if (results && results.length > 0) {
    const first = results[0];
    console.log(`[Upload API GET] jobId=${jobId}, ${results.length}개 결과, 첫 문제 solution:`,
      first.solution ? `steps=${first.solution.steps?.length || 0}` : 'NONE',
      'choices:', first.choices?.length || 0,
      'content:', first.contentWithMath?.substring(0, 50) || 'NONE'
    );
  }

  // PDF 파일 URL 생성 (서버 사이드 프록시를 통해 CORS 문제 회피)
  // ★ HWP 파일은 변환 완료 전까지 pdfUrl을 null로 반환 (PDF.js 422 에러 방지)
  let pdfUrl: string | null = null;
  if (job.storagePath && !job.storagePath.match(/\.(hwp|hwpx)$/i)) {
    // PDF 또는 변환된 PDF만 프록시 URL 생성
    pdfUrl = `/api/workflow/pdf-proxy?path=${encodeURIComponent(job.storagePath)}`;
  }

  // ★ 자동 자산화 완료 여부 확인
  const autoExamId = autoSavedExams.get(jobId);
  const savedToDb = !!autoExamId;

  // ★ 이미지 파이프라인 결과
  const imgPipeResult = imagePipelineResults.get(jobId) || null;

  return NextResponse.json({
    job: {
      ...job,
      statusLabel: getStatusLabel(job.status),
    },
    pdfUrl,
    imagePipeline: imgPipeResult,
    results: results || null,
    hasResults: !!results && results.length > 0,
    savedToDb,
    examId: autoExamId || null,
  });
}

/**
 * PUT /api/workflow/upload
 * 자산화: 분석 완료된 Job의 결과를 DB에 저장 (검수 후 수동 호출)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, bookGroupId, editedProblems, pageImages, fileName: clientFileName } = body;

    console.log(`[Upload PUT] ★ bookGroupId 수신: "${bookGroupId}" (type: ${typeof bookGroupId}), clientFileName: "${clientFileName}"`);

    // ★ YOLO 학습 데이터: 페이지 이미지
    //   - 클라이언트에서 이미 Storage에 업로드된 경우 → storagePath 사용
    //   - legacy base64 경로 → 서버에서 업로드
    const pageImagePathMap = new Map<number, { path: string; width: number; height: number }>();
    if (pageImages && Array.isArray(pageImages) && pageImages.length > 0) {
      console.log(`[Upload PUT] 페이지 이미지 ${pageImages.length}개 처리 시작`);
      for (const pageImg of pageImages) {
        try {
          // 1) 이미 Storage에 업로드된 경우 (권장 경로)
          if (pageImg.storagePath) {
            pageImagePathMap.set(pageImg.pageNumber, {
              path: pageImg.storagePath,
              width: pageImg.width || 0,
              height: pageImg.height || 0,
            });
            continue;
          }
          // 2) legacy: base64 수신 → 서버 업로드
          if (!supabaseAdmin) continue;
          const base64Data = (pageImg.imageBase64 || '').replace(/^data:image\/\w+;base64,/, '');
          if (!base64Data) continue;
          const buffer = Buffer.from(base64Data, 'base64');
          const storagePath = `page-images/${jobId}/page-${pageImg.pageNumber}.png`;

          const { data, error } = await supabaseAdmin.storage
            .from('source-files')
            .upload(storagePath, buffer, {
              contentType: 'image/png',
              upsert: true,
            });

          if (error) {
            console.warn(`[Upload PUT] 페이지 ${pageImg.pageNumber} 이미지 업로드 실패:`, error.message);
          } else {
            pageImagePathMap.set(pageImg.pageNumber, {
              path: data.path,
              width: pageImg.width || 0,
              height: pageImg.height || 0,
            });
            console.log(`[Upload PUT] 페이지 ${pageImg.pageNumber} 이미지 업로드 완료: ${data.path}`);
          }
        } catch (imgErr) {
          console.warn(`[Upload PUT] 페이지 ${pageImg.pageNumber} 이미지 처리 오류:`, imgErr);
        }
      }
      console.log(`[Upload PUT] 페이지 이미지 매핑 완료: ${pageImagePathMap.size}/${pageImages.length}개`);
    }

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    let job = jobStore.get(jobId);

    // ★ Vercel 서버리스: jobStore 미발견 시 Storage에서 복원
    if (!job && supabaseAdmin) {
      console.log(`[Upload PUT] jobStore miss → Storage 복원 시도: ${jobId}`);
      const { data: files } = await supabaseAdmin.storage
        .from('source-files')
        .list('uploads', { search: jobId });

      const mainFile = files?.find((f) => {
        if (!f.name.startsWith(jobId + '_')) return false;
        const rest = f.name.slice(jobId.length + 1);
        return !rest.startsWith('answer_') && !rest.startsWith('quick_');
      });

      if (mainFile) {
        // ★ 한글 파일명 복원 우선순위: sidecar 메타 > decodeURIComponent > raw name
        const encodedName = mainFile.name.slice(jobId.length + 1);
        let fileName = encodedName;
        try {
          const { data: metaData } = await supabaseAdmin.storage
            .from('source-files')
            .download(`uploads/${jobId}.meta.json`);
          if (metaData) {
            const meta = JSON.parse(await metaData.text());
            if (meta.originalFilename) fileName = meta.originalFilename;
          }
        } catch { /* 메타 없으면 fallback */ }
        if (fileName === encodedName) {
          try { fileName = decodeURIComponent(encodedName); } catch { /* 구버전 호환 */ }
        }
        const storagePath = `uploads/${mainFile.name}`;
        // ★ 쿠키 세션에서 실제 로그인 유저 ID 조회 (exams.created_by NOT NULL 대응)
        let sessionUserId: string | null = null;
        try {
          const supa = await createSupabaseServerClient();
          if (supa) {
            const { data: { user } } = await supa.auth.getUser();
            sessionUserId = user?.id ?? null;
          }
        } catch { /* 비로그인 허용 */ }

        const userIdHint = (body.userId as string | undefined) || sessionUserId || 'anonymous';
        const instituteIdHint = body.instituteId as string | undefined;
        const subjectAreaHint = (body.subjectArea as 'math' | 'science' | undefined) || 'math';
        job = {
          id: jobId,
          userId: userIdHint,
          instituteId: instituteIdHint || 'default',
          fileName,
          fileSize: mainFile.metadata?.size ?? 0,
          fileType: getFileType(fileName) || 'PDF',
          documentType: 'PROBLEM',
          storagePath,
          status: 'COMPLETED' as ProcessingStatus,
          progress: 100,
          currentStep: 'Storage에서 복원됨',
          autoClassify: false,
          generateSolutions: false,
          bookGroupId: bookGroupId || undefined,
          subjectArea: subjectAreaHint,
          createdAt: mainFile.created_at || new Date().toISOString(),
          updatedAt: mainFile.updated_at || new Date().toISOString(),
        };
        jobStore.set(jobId, job);
        console.log(`[Upload PUT] Storage 복원 성공: ${fileName}`);
      }
    }

    if (!job) {
      // Storage에서도 못 찾음 — 이미 자동 자산화된 examId 확인
      const autoExamId = autoSavedExams.get(jobId);
      if (autoExamId) {
        console.log(`[Upload PUT] Job not found but auto-saved exam exists: ${autoExamId}`);
        return NextResponse.json({
          success: true,
          message: '이미 자동 자산화가 완료되었습니다.',
          examId: autoExamId,
          alreadySaved: true,
        });
      }
      return NextResponse.json(
        { error: 'Job not found. 파일이 Storage에도 없습니다. 파일을 다시 업로드해주세요.' },
        { status: 404 }
      );
    }

    // ★ 클라이언트가 원본 파일명을 보냈으면 우선 적용 (Storage 복원 경로의 sanitized 이름 대체)
    if (clientFileName && typeof clientFileName === 'string' && clientFileName.trim()) {
      if (job.fileName !== clientFileName) {
        console.log(`[Upload PUT] 파일명 override: "${job.fileName}" → "${clientFileName}"`);
        job.fileName = clientFileName;
        jobStore.set(jobId, job);
      }
    }

    console.log(`[Upload PUT] job.bookGroupId: "${job.bookGroupId}" → 최종: "${bookGroupId || job.bookGroupId || null}"`);

    // ★ 이미 자동 자산화된 경우 처리 — 단, 여러 조건 검증 후 진짜 스킵
    const existingExamId = autoSavedExams.get(jobId);
    if (existingExamId) {
      let shouldSkip = true;
      if (supabaseAdmin) {
        try {
          // 1) exam이 살아있는지 먼저 확인 (soft-delete 된 좀비 examId 무시)
          const { data: examRow } = await supabaseAdmin
            .from('exams')
            .select('id, deleted_at')
            .eq('id', existingExamId)
            .maybeSingle();

          if (!examRow || examRow.deleted_at) {
            console.log(`[Upload PUT] 캐시된 exam이 삭제/없음 → 캐시 무효화 후 재저장`);
            shouldSkip = false;
            autoSavedExams.delete(jobId);
          } else if (editedProblems && Array.isArray(editedProblems) && editedProblems.length > 0) {
            // 2) exam 살아있음 → 문제 수 비교해 사용자가 더 많이 선택한 경우만 재저장
            const { count: existingCount } = await supabaseAdmin
              .from('exam_problems')
              .select('*', { count: 'exact', head: true })
              .eq('exam_id', existingExamId);
            const existing = existingCount ?? 0;
            if (editedProblems.length > existing) {
              console.log(`[Upload PUT] editedProblems(${editedProblems.length}) > existing(${existing}) → 재저장 진행`);
              shouldSkip = false;
              autoSavedExams.delete(jobId);
            }
          }
        } catch (e) {
          console.warn('[Upload PUT] existing exam 조회 실패 — 기존 로직 유지:', e);
        }
      }
      if (shouldSkip) {
        console.log(`[Upload PUT] 이미 자동 자산화 완료: examId=${existingExamId}`);
        return NextResponse.json({
          success: true,
          message: '이미 자동 자산화가 완료되었습니다.',
          examId: existingExamId,
          alreadySaved: true,
        });
      }
    }

    const results = jobResults.get(jobId);

    // ★ AutoCrop 모드: jobResults에 결과가 없지만 editedProblems에 데이터가 있는 경우
    //    editedProblems 기반으로 직접 DB에 저장
    if ((!results || results.length === 0) && editedProblems && editedProblems.length > 0) {
      const acBookGroupId = bookGroupId || job.bookGroupId || null;
      console.log(`[Upload PUT] AutoCrop 모드: ${editedProblems.length}개 문제 직접 저장, bookGroupId="${acBookGroupId}"`);
      return await saveEditedProblemsDirect(jobId, job, editedProblems, acBookGroupId, pageImagePathMap, request.nextUrl.origin);
    }

    if (job.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Job is not completed yet' }, { status: 400 });
    }

    if (!results || results.length === 0) {
      return NextResponse.json({ error: 'No analysis results found' }, { status: 400 });
    }

    // ★ 수정된 문제 데이터(난이도 등)를 results에 오버라이드
    // cropImageBase64를 번호별로 매핑 (legacy) / cropImagePath (권장)
    const cropImageMap = new Map<number, string>();
    const cropPathMap = new Map<number, string>();
    if (editedProblems && Array.isArray(editedProblems) && editedProblems.length > 0) {
      for (let i = 0; i < editedProblems.length; i++) {
        const edited = editedProblems[i];
        // ★ 1차: problemNumber로 매칭 (정상 케이스)
        let result = results.find(r => r.problemNumber === edited.number);
        let matchedBy: 'number' | 'index' | 'none' = result ? 'number' : 'none';
        // ★ 2차: 번호 매칭 실패 시 인덱스 기반 폴백 (silent drop 방지)
        if (!result && results[i]) {
          result = results[i];
          matchedBy = 'index';
          console.warn(`[Upload PUT] ⚠ 문제 ${edited.number}번 problemNumber 매칭 실패 → 인덱스 ${i} 폴백 (server=${result.problemNumber})`);
        }
        if (result) {
          if (edited.difficulty !== undefined) result.classification.difficulty = edited.difficulty as 1|2|3|4|5;
          if (edited.typeCode !== undefined) result.classification.typeCode = edited.typeCode;
          if (edited.cognitiveDomain !== undefined) result.classification.cognitiveDomain = edited.cognitiveDomain as 'CALCULATION'|'UNDERSTANDING'|'INFERENCE'|'PROBLEM_SOLVING';
          // ★ 빈 문자열 덮어쓰기 차단 — 정상 OCR 본문이 비워지는 것 방지
          if (edited.content !== undefined) {
            const trimmed = (edited.content || '').trim();
            const serverHasContent = !!(result.originalText && result.originalText.trim().length > 0);
            if (trimmed.length > 0) {
              result.originalText = edited.content;
            } else if (serverHasContent) {
              console.warn(`[Upload PUT] ⚠ 문제 ${edited.number}번 edited.content 빈값 — 서버 원본 유지(${(result.originalText || '').length}자)`);
            } else {
              // 양쪽 다 비어있으면 그대로 빈 값
              result.originalText = edited.content;
            }
          }
          if (edited.choices) result.choices = edited.choices;
          console.log(`[Upload PUT] 문제 ${edited.number}번 수정 적용 (matched by ${matchedBy}): difficulty=${edited.difficulty}, typeCode=${edited.typeCode}, contentLen=${(edited.content || '').length}`);
        } else {
          console.error(`[Upload PUT] ✖ 문제 ${edited.number}번 매칭 완전 실패 — 인덱스 폴백도 불가 (results.length=${results.length})`);
        }
        // ★ 크롭 이미지: 업로드된 path 우선
        if (edited.cropImagePath) {
          cropPathMap.set(edited.number, edited.cropImagePath);
        } else if (edited.cropImageBase64) {
          cropImageMap.set(edited.number, edited.cropImageBase64);
        }
      }
    }

    // ★ 크롭 이미지를 Supabase Storage에 업로드 (legacy base64만)
    const imageUrlMap = new Map<number, string>();
    // 이미 업로드된 path → public URL 변환
    if (cropPathMap.size > 0 && supabaseAdmin) {
      for (const [num, path] of cropPathMap.entries()) {
        const { data: urlData } = supabaseAdmin.storage.from('source-files').getPublicUrl(path);
        if (urlData?.publicUrl) imageUrlMap.set(num, urlData.publicUrl);
      }
    }
    if (cropImageMap.size > 0) {
      const storageClient = supabaseAdmin;
      if (storageClient) {
        for (const [num, base64] of cropImageMap.entries()) {
          try {
            // data:image/png;base64,... 에서 실제 base64 추출
            const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            const storagePath = `problem-crops/${jobId}/problem-${num}.png`;

            const { data, error } = await storageClient.storage
              .from('source-files')
              .upload(storagePath, buffer, {
                contentType: 'image/png',
                upsert: true,
              });

            if (error) {
              console.error(`[Upload PUT] 문제 ${num}번 이미지 업로드 실패:`, error.message);
            } else {
              // Public URL 생성
              const { data: urlData } = storageClient.storage
                .from('source-files')
                .getPublicUrl(data.path);
              if (urlData?.publicUrl) {
                imageUrlMap.set(num, urlData.publicUrl);
                console.log(`[Upload PUT] 문제 ${num}번 이미지 업로드 완료: ${urlData.publicUrl}`);
              }
            }
          } catch (imgErr) {
            console.error(`[Upload PUT] 문제 ${num}번 이미지 처리 오류:`, imgErr);
          }
        }
      } else {
        console.warn('[Upload PUT] Supabase Admin 미설정, 이미지 업로드 스킵');
      }
    }

    // DB에 저장 (bookGroupId, imageUrlMap 전달) — 클라이언트 값 우선, 폴백으로 job.bookGroupId
    const effectiveBookGroupId = bookGroupId || job.bookGroupId || null;
    console.log(`[Upload PUT] ★ DB 저장 시 bookGroupId: "${effectiveBookGroupId}"`);
    await saveProblemsToDB(jobId, results, effectiveBookGroupId, imageUrlMap, editedProblems, pageImagePathMap);

    return NextResponse.json({
      success: true,
      message: `${results.length}개 문제가 자산화되었습니다.`,
      problemCount: results.length,
    });
  } catch (error) {
    console.error('[Upload API] PUT Error:', error);
    return NextResponse.json(
      { error: 'Save failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
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
  fileBuffer: ArrayBuffer,
  fileName: string,
  fileType: string,
  jobId: string,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  suffix: string = '' // suffix for auxiliary files
): Promise<string> {
  // ★ Storage 경로: 한글 등 non-ASCII는 URL-encode로 보존 (나중에 decodeURIComponent로 원복 가능)
  //   공백·슬래시 등 경로에 민감한 문자는 자동 이스케이프됨
  const ext = fileName.match(/\.[a-zA-Z0-9]+$/)?.[0] || '';
  const base = fileName.replace(new RegExp(ext.replace('.', '\\.') + '$'), '');
  const safeName = encodeURIComponent(base).slice(0, 180) + ext;
  const storageFileName = suffix ? `${jobId}_${suffix}_${safeName}` : `${jobId}_${safeName}`;
  const storagePath = `uploads/${storageFileName}`;

  // Admin 클라이언트 우선 사용 (RLS 우회, 안정적 업로드)
  const storageClient = supabaseAdmin || supabase;

  if (storageClient) {
    const buffer = Buffer.from(fileBuffer);

    const { data, error } = await storageClient.storage
      .from('source-files')
      .upload(storagePath, buffer, {
        contentType: fileType || 'application/pdf',
        upsert: true, // 같은 이름 파일 덮어쓰기 허용
      });

    if (error) {
      console.error('Storage upload error:', error.message);
      // 실패해도 로컬 경로 반환
      return storagePath;
    }

    console.log(`[Upload] File uploaded to storage: ${data.path}`);
    return data.path;
  }

  // Supabase 미설정 시 임시 경로 반환
  return storagePath;
}

/**
 * 과학 과목 이미지 파이프라인 — 업로드 즉시 실행 (autoClassify 무관)
 * OCR/분류와 독립적으로 도식 이미지만 추출·보정·DB 저장
 */
async function runScienceImagePipeline(
  jobId: string,
  fileBuffer: ArrayBuffer,
  fileName: string,
  scienceSubject?: string | null,
): Promise<void> {
  // 시작 상태 저장
  imagePipelineResults.set(jobId, {
    status: 'running', extracted_count: 0, enhanced_count: 0, db_entries_added: 0, images: [],
  });

  try {
    const { extractDocumentImages } = await import('@/lib/image-pipeline/workflow-integration');
    console.log(`[Job ${jobId}] 과학 이미지 파이프라인 시작 (subject: ${scienceSubject || 'science'})`);
    const imageResult = await extractDocumentImages(fileBuffer, fileName, {
      subject: 'science',
      sourceName: fileName.replace(/\.[^.]+$/, ''),
      scienceSubject: scienceSubject || undefined,
      uploadToSupabase: true,
    });
    if (imageResult) {
      console.log(`[Job ${jobId}] 이미지 파이프라인 완료: ${imageResult.extracted_count}개 추출, ${imageResult.enhanced_count}개 보정`);
      imagePipelineResults.set(jobId, {
        status: 'done',
        extracted_count: imageResult.extracted_count,
        enhanced_count: imageResult.enhanced_count,
        db_entries_added: imageResult.db_entries_added,
        images: imageResult.images.map(img => ({
          filename: img.filename, page: img.page,
          width: img.width, height: img.height, upscaled: img.upscaled,
        })),
      });
    } else {
      console.log(`[Job ${jobId}] 이미지 파이프라인 서버 미실행 — 건너뜀`);
      imagePipelineResults.set(jobId, {
        status: 'error', extracted_count: 0, enhanced_count: 0, db_entries_added: 0, images: [],
        error: '이미지 파이프라인 서버 미실행 (port 8200)',
      });
    }
  } catch (err) {
    console.warn(`[Job ${jobId}] 이미지 파이프라인 실패 (무시):`, err);
    imagePipelineResults.set(jobId, {
      status: 'error', extracted_count: 0, enhanced_count: 0, db_entries_added: 0, images: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * HWP → PDF 변환만 단독 실행 (autoClassify=false일 때 미리보기용)
 * autoClassify=true일 때는 processJobInBackground 내에서 처리하므로 중복 실행하지 않음
 */
async function convertHWPInBackground(
  jobId: string,
  problemBuffer: ArrayBuffer,
  job: UploadJob,
): Promise<void> {
  try {
    const currentJob = jobStore.get(jobId);
    if (currentJob) {
      currentJob.currentStep = '한글(HWP) → PDF 변환 중...';
      currentJob.progress = 5;
      jobStore.set(jobId, currentJob);
    }

    const pdfBuffer = await convertHWPtoPDF(problemBuffer, job.fileName);
    convertedPdfStore.set(jobId, pdfBuffer);
    console.log(`[Job ${jobId}] HWP → PDF 변환 성공: ${pdfBuffer.byteLength} bytes`);

    // 변환된 PDF를 Storage에 업로드 + storagePath 갱신
    try {
      const pdfStoragePath = job.storagePath.replace(/\.(hwp|hwpx)$/i, '_converted.pdf');
      const storageClient = supabaseAdmin || (await createSupabaseServerClient());
      if (storageClient) {
        await storageClient.storage
          .from('source-files')
          .upload(pdfStoragePath, Buffer.from(pdfBuffer), {
            contentType: 'application/pdf',
            upsert: true,
          });
        console.log(`[Job ${jobId}] 변환 PDF Storage 업로드: ${pdfStoragePath}`);

        const updatedJob = jobStore.get(jobId);
        if (updatedJob) {
          updatedJob.storagePath = pdfStoragePath;
          jobStore.set(jobId, updatedJob);
        }
      }
    } catch (uploadErr) {
      console.warn(`[Job ${jobId}] 변환 PDF Storage 업로드 실패:`, uploadErr);
    }
  } catch (convErr) {
    const errMsg = convErr instanceof Error ? convErr.message : String(convErr);
    console.error(`[Job ${jobId}] HWP→PDF 사전 변환 실패:`, errMsg);
    // 사전 변환 실패는 processJobInBackground에서 재시도됨
  }
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

  // ★ HWP 파일이면 LibreOffice로 PDF 변환 (사전 처리)
  // convertHWPInBackground에서 이미 변환된 경우 스킵
  if (job.fileType === 'HWP' && !convertedPdfStore.has(jobId)) {
    try {
      const currentJob = jobStore.get(jobId);
      if (currentJob) {
        currentJob.currentStep = '한글(HWP) → PDF 변환 중...';
        currentJob.progress = 5;
        jobStore.set(jobId, currentJob);
      }

      const pdfBuffer = await convertHWPtoPDF(currentBuffers.problem, job.fileName);
      convertedPdfStore.set(jobId, pdfBuffer);
      console.log(`[Job ${jobId}] HWP → PDF 변환 성공: ${pdfBuffer.byteLength} bytes`);

      // ★ 변환된 PDF를 Storage에 업로드 (미리보기용) + storagePath 갱신
      try {
        const pdfStoragePath = job.storagePath.replace(/\.(hwp|hwpx)$/i, '_converted.pdf');
        const storageClient = supabaseAdmin || (await createSupabaseServerClient());
        if (storageClient) {
          await storageClient.storage
            .from('source-files')
            .upload(pdfStoragePath, Buffer.from(pdfBuffer), {
              contentType: 'application/pdf',
              upsert: true,
            });
          console.log(`[Job ${jobId}] 변환 PDF Storage 업로드: ${pdfStoragePath}`);

          const updatedJob = jobStore.get(jobId);
          if (updatedJob) {
            updatedJob.storagePath = pdfStoragePath;
            jobStore.set(jobId, updatedJob);
          }
        }
      } catch (uploadErr) {
        console.warn(`[Job ${jobId}] 변환 PDF Storage 업로드 실패:`, uploadErr);
      }
    } catch (convErr) {
      const errMsg = convErr instanceof Error ? convErr.message : String(convErr);
      console.error(`[Job ${jobId}] HWP→PDF 변환 실패:`, errMsg);
      // ★ 변환 실패 시 사용자에게 에러 표시 (쓰레기 데이터로 진행하지 않음)
      const failedJob = jobStore.get(jobId);
      if (failedJob) {
        failedJob.status = 'ERROR';
        failedJob.currentStep = `HWP→PDF 변환 실패: LibreOffice 오류. ${errMsg.includes('timeout') || errMsg.includes('SIGKILL') ? 'LibreOffice가 응답하지 않습니다. 서버를 재시작해 주세요.' : errMsg}`;
        failedJob.updatedAt = new Date().toISOString();
        jobStore.set(jobId, failedJob);
      }
      return; // 변환 실패 시 더 이상 진행하지 않음
    }
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
      onPartialResult: (partialResults: LLMAnalysisResult[]) => {
        // 문제 하나 분석 완료될 때마다 중간 결과 저장 (실시간 UI 업데이트)
        jobResults.set(jobId, partialResults);
      },
      onComplete: async (analysisResults: LLMAnalysisResult[]) => {
        jobResults.set(jobId, analysisResults);

        // 변환 PDF 메모리 정리
        convertedPdfStore.delete(jobId);
        // 버퍼 정리
        fileBufferStore.delete(jobId);

        // ★ 자동 자산화: 분석 완료 즉시 DB에 저장 (검수 전 초벌 저장)
        // 분석 페이지에서 수동 자산화 시 기존 exam을 업데이트함
        try {
          const currentJob = jobStore.get(jobId);
          const bookGroupId = currentJob?.bookGroupId || null;
          console.log(`[Job ${jobId}] 자동 자산화 시작: ${analysisResults.length}개 문제, bookGroupId="${bookGroupId}"`);
          await saveProblemsToDB(jobId, analysisResults, bookGroupId);
          console.log(`[Job ${jobId}] 자동 자산화 완료`);
        } catch (autoSaveErr) {
          console.error(`[Job ${jobId}] 자동 자산화 실패 (수동 자산화로 대체):`, autoSaveErr);
        }
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

/**
 * ★ 자산화 완료 후 자동 해설 생성 트리거 (fire-and-forget).
 *   batch-solutions에게 모든 문제 ID 넘겨서 Sonnet 해설 생성 시작.
 *   사용자가 "일괄 해설 생성" 버튼 안 눌러도 자동 시작됨.
 *   실패해도 자산화 자체는 성공으로 처리 (해설은 사용자가 수동 재시도 가능).
 */
async function triggerAutoSolutionGeneration(examId: string, origin: string): Promise<void> {
  try {
    if (!supabaseAdmin) return;
    const { data: eps } = await supabaseAdmin
      .from('exam_problems')
      .select('problem_id')
      .eq('exam_id', examId);
    const problemIds = (eps || []).map((r: { problem_id: string }) => r.problem_id);
    if (problemIds.length === 0) return;
    fetch(`${origin}/api/exams/${examId}/batch-solutions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problemIds }),
      keepalive: true,
    }).catch((err) => console.error('[auto-solution-trigger] fetch 실패:', err));
    // ★ Vercel 서버리스: fetch가 TCP dispatch 끝나기 전 함수 종료되면 요청 소실됨
    //   batch-solutions 내부 체인 트리거와 동일하게 100ms 대기로 dispatch 보장
    await new Promise((r) => setTimeout(r, 100));
    console.log(`[auto-solution-trigger] ${problemIds.length}개 문제 해설 자동 생성 시작: exam=${examId.slice(0, 8)}`);
  } catch (err) {
    console.error('[auto-solution-trigger] error:', err);
  }
}

/**
 * AutoCrop 모드: editedProblems 기반으로 직접 DB에 저장
 * jobResults에 결과가 없는 경우 (수동 분석 모드)
 */
async function saveEditedProblemsDirect(
  jobId: string,
  job: UploadJob,
  editedProblems: Array<{
    number: number;
    content?: string;
    choices?: string[];
    answer?: string | number;
    solution?: string;
    difficulty?: number;
    typeCode?: string;
    typeName?: string;
    cognitiveDomain?: string;
    score?: number;        // ★ 1차 OCR 추출 원 배점
    cropImageBase64?: string;
    cropImagePath?: string;
    bbox?: { x: number; y: number; w: number; h: number };
    pageIndex?: number;
  }>,
  bookGroupId: string | null,
  pageImagePathMap: Map<number, { path: string; width: number; height: number }> = new Map(),
  requestOrigin: string = ''
) {
  const supabase = supabaseAdmin;
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase Admin not configured' }, { status: 500 });
  }

  // ★ 크롭 이미지를 Supabase Storage에 업로드 / 이미 업로드된 path는 public URL만 생성
  const imageUrlMap = new Map<number, string>();
  for (const edited of editedProblems) {
    // 1) 클라이언트에서 이미 업로드한 경우 — public URL만 생성
    if (edited.cropImagePath) {
      const { data: urlData } = supabase.storage
        .from('source-files')
        .getPublicUrl(edited.cropImagePath);
      if (urlData?.publicUrl) imageUrlMap.set(edited.number, urlData.publicUrl);
      continue;
    }
    if (edited.cropImageBase64) {
      try {
        const base64Data = edited.cropImageBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const storagePath = `problem-crops/${jobId}/problem-${edited.number}.png`;

        const { data, error } = await supabase.storage
          .from('source-files')
          .upload(storagePath, buffer, {
            contentType: 'image/png',
            upsert: true,
          });

        if (!error && data) {
          const { data: urlData } = supabase.storage
            .from('source-files')
            .getPublicUrl(data.path);
          if (urlData?.publicUrl) {
            imageUrlMap.set(edited.number, urlData.publicUrl);
            console.log(`[Direct Save] 문제 ${edited.number}번 이미지 업로드 완료`);
          }
        }
      } catch (imgErr) {
        console.error(`[Direct Save] 문제 ${edited.number}번 이미지 오류:`, imgErr);
      }
    }
  }

  // ★ created_by: job.userId에서 가져옴 (supabaseAdmin.auth.getUser()는 서비스 키라 null)
  const isValidUUID = (str: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };
  const createdBy = isValidUUID(job.userId) ? job.userId : null;

  // ★ institute_id 조회 (saveProblemsToDB와 동일 로직)
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
        console.log(`[Direct Save] Found user's institute_id: ${instituteId}`);
      }
    } catch (e) {
      console.log('[Direct Save] Could not fetch user institute_id:', e);
    }
  }
  if (!instituteId) {
    try {
      const { data: defaultInst } = await supabase
        .from('institutes')
        .select('id')
        .eq('name', '개인 사용자')
        .limit(1)
        .single();
      if (defaultInst) {
        instituteId = defaultInst.id;
      } else {
        const { data: newInst } = await supabase
          .from('institutes')
          .insert({ name: '개인 사용자' })
          .select('id')
          .single();
        if (newInst) {
          instituteId = newInst.id;
          if (createdBy) {
            await supabase.from('users').update({ institute_id: instituteId }).eq('id', createdBy);
          }
        }
      }
    } catch (e) {
      console.log('[Direct Save] Institute lookup/create error:', e);
    }
  }

  console.log(`[Direct Save] instituteId: ${instituteId}, createdBy: ${createdBy}, bookGroupId: ${bookGroupId}`);

  // ★ Exam 레코드 생성 (클라우드 그룹핑용, 시험지관리에는 미표시)
  let examId: string | null = null;
  try {
    // 파일명에서 과목/유형/학년 자동 추출 (공통 유틸 사용)
    const fileTitle = job.fileName.replace(/\.[^/.]+$/, '');

    const examInsertData: Record<string, any> = {
      title: fileTitle,
      description: `업로드 파일: ${job.fileName} (${editedProblems.length}문항)`,
      status: 'DRAFT',
      created_by: createdBy,
      institute_id: instituteId,
      total_points: editedProblems.length * 4,
      time_limit_minutes: 50,
      subject: detectSubjectFromTitle(fileTitle),
      exam_type: detectExamTypeFromTitle(fileTitle),
      grade: detectGradeFromTitle(fileTitle),
    };
    if (bookGroupId) {
      examInsertData.book_group_id = bookGroupId;
    } else {
      // ★ 과목 기반 자동 폴더 배치 (fuzzy 매칭 — 폴더 rename에도 견고)
      const detectedSubject = examInsertData.subject || '';
      if (detectedSubject) {
        try {
          const folder = await findAutoFolderForSubject(supabase, detectedSubject);
          if (folder) {
            examInsertData.book_group_id = folder.id;
            console.log(`[Direct Save] 자동 폴더 배치: "${detectedSubject}" → "${folder.name}" (키워드="${folder.keyword}")`);
          }
        } catch (e) {
          console.warn('[Direct Save] 자동 폴더 매칭 실패:', e);
        }
      }
    }

    console.log(`[Direct Save] Creating exam:`, JSON.stringify(examInsertData, null, 2));

    let examResult = await supabase
      .from('exams')
      .insert(examInsertData)
      .select('id')
      .single();

    // 컬럼 에러 시 최소 컬럼만으로 재시도 (book_group_id는 유지!)
    if (examResult.error && examResult.error.message.includes('column')) {
      console.warn(`[Direct Save] Retrying exam insert: ${examResult.error.message}`);
      const retryData: Record<string, any> = {
        title: examInsertData.title,
        description: examInsertData.description,
        status: examInsertData.status,
        created_by: createdBy,
        institute_id: instituteId,
      };
      if (bookGroupId) retryData.book_group_id = bookGroupId;  // ★ book_group_id 유지
      examResult = await supabase
        .from('exams')
        .insert(retryData)
        .select('id')
        .single();
    }

    if (examResult.error) {
      console.error('[Direct Save] Exam create error:', examResult.error.message);
    } else {
      examId = examResult.data.id;
      console.log(`[Direct Save] Created exam: ${examId}`);
    }
  } catch (err) {
    console.error('[Direct Save] Exam create exception:', err);
  }

  let savedCount = 0;
  const savedProblemIds: string[] = []; // ★ 저장된 문제 ID 수집 (appendTo용)

  for (const edited of editedProblems) {
    if (!edited.content && !edited.cropImageBase64 && !edited.cropImagePath) continue; // 빈 문제 스킵

    try {
      const cropImageUrl = imageUrlMap.get(edited.number);
      const imagesArray: Array<{ url: string; type: string; label: string }> = cropImageUrl
        ? [{ url: cropImageUrl, type: 'crop', label: `문제 ${edited.number} 크롭 이미지` }]
        : [];

      const choices = edited.choices || [];
      const circledNumbers = ['①', '②', '③', '④', '⑤'];
      const formattedChoices = choices.map((c: string, i: number) => {
        const stripped = c.replace(/^[①②③④⑤]\s*/, '');
        return stripped ? `${circledNumbers[i]} ${stripped}` : '';
      }).filter(Boolean);

      // ★ 크롭 이미지는 images JSONB에만 저장 (content_latex에는 삽입하지 않음)
      let contentLatex = edited.content || '(문제 내용 없음)';

      // ★ content_latex 내 base64 이미지 → Storage 업로드 + figure_crop 타입으로 분리
      const base64ImageRegex = /!\[이미지\]\(data:image\/png;base64,([A-Za-z0-9+/=]+)\)/g;
      let figureIdx = 0;
      let base64Match;
      while ((base64Match = base64ImageRegex.exec(contentLatex)) !== null) {
        try {
          const imgBase64 = base64Match[1];
          const imgBuffer = Buffer.from(imgBase64, 'base64');
          const figurePath = `problem-crops/${jobId}/problem-${edited.number}-figure${figureIdx > 0 ? `-${figureIdx}` : ''}.png`;

          const { data: figData, error: figError } = await supabase.storage
            .from('source-files')
            .upload(figurePath, imgBuffer, { contentType: 'image/png', upsert: true });

          if (!figError && figData) {
            const { data: figUrlData } = supabase.storage
              .from('source-files')
              .getPublicUrl(figData.path);

            if (figUrlData?.publicUrl) {
              // base64를 Storage URL로 교체 (DB 용량 절감)
              contentLatex = contentLatex.replace(base64Match[0], `![이미지](${figUrlData.publicUrl})`);
              imagesArray.push({ url: figUrlData.publicUrl, type: 'figure_crop', label: `수동 삽입 도형${figureIdx > 0 ? ` ${figureIdx + 1}` : ''}` });
              console.log(`[Direct Save] 문제 ${edited.number}번 figure_crop 업로드 완료: ${figUrlData.publicUrl}`);
            }
          }
          figureIdx++;
        } catch (figErr) {
          console.error(`[Direct Save] 문제 ${edited.number}번 figure_crop 업로드 오류:`, figErr);
        }
        // regex lastIndex 리셋 (contentLatex가 변경되었으므로)
        base64ImageRegex.lastIndex = 0;
      }

      const { data: problem, error: problemError } = await supabase
        .from('problems')
        .insert({
          institute_id: instituteId,
          created_by: createdBy,
          source_file_id: null,
          content_latex: contentLatex,
          content_html: null,
          solution_latex: edited.solution || '',
          solution_html: null,
          answer_json: {
            finalAnswer: String(edited.answer || ''),
            type: formattedChoices.length > 0 ? 'multiple_choice' : 'short_answer',
            correct_answer: String(edited.answer || ''),
            choices: formattedChoices,
          },
          images: imagesArray,
          status: 'PENDING_REVIEW',
          source_number: edited.number || null,
          ai_analysis: {
            classification: {
              typeCode: edited.typeCode || '',
              typeName: edited.typeName || '',
              difficulty: edited.difficulty || 3,
              cognitiveDomain: edited.cognitiveDomain || 'CALCULATION',
            },
            // ★ figure_crop 또는 인라인 이미지가 있으면 hasFigure 자동 설정
            ...(imagesArray.some(img => img.type === 'figure_crop')
              ? { hasFigure: true }
              : {}),
          },
          tags: [],
          source_name: job.fileName,
        })
        .select()
        .single();

      if (problemError) {
        console.error(`[Direct Save] 문제 ${edited.number}번 DB 에러:`, problemError.message);
        continue;
      }

      // classifications 테이블에 저장
      if (problem && edited.typeCode) {
        await supabase.from('classifications').insert({
          problem_id: problem.id,
          type_code: edited.typeCode,
          difficulty: String(edited.difficulty || 3) as '1' | '2' | '3' | '4' | '5',
          cognitive_domain: edited.cognitiveDomain || 'CALCULATION',
          ai_confidence: 0.5,
          is_verified: false,
        }).single();
      }

      savedCount++;
      if (problem?.id) savedProblemIds.push(problem.id);
      console.log(`[Direct Save] 문제 ${edited.number}번 저장 완료 (ID: ${problem?.id})`);

      // ★ Exam-Problem 연결 — 우선순위:
      //   1) edited.score (1차 OCR/분석 페이지에서 뽑은 원 배점)
      //   2) contentLatex 안의 [N점] 정규식 재추출
      //   3) 기본 4
      if (examId && problem) {
        let extractedPoints = 4;
        if (typeof edited.score === 'number' && Number.isFinite(edited.score) && edited.score > 0) {
          extractedPoints = Math.min(100, Math.max(0, Math.round(edited.score * 10) / 10));
        } else {
          const ptsMatch = (contentLatex || '').match(/\[\s*(?:총\s*)?(\d+(?:\.\d+)?)\s*점\s*\]/);
          if (ptsMatch) extractedPoints = Math.min(100, Math.max(0, parseFloat(ptsMatch[1])));
        }
        const { error: epError } = await supabase.from('exam_problems').insert({
          exam_id: examId,
          problem_id: problem.id,
          sequence_number: savedCount,
          points: extractedPoints,
        });
        if (epError) {
          console.error(`[Direct Save] exam_problems 연결 실패 (문제 ${edited.number}번):`, epError.message, epError.details);
        } else {
          console.log(`[Direct Save] exam_problems 연결 완료 (문제 ${edited.number}번 → exam ${examId})`);
        }
      }

      // ★ YOLO 학습 데이터: detection_annotations 저장
      if (problem && edited.bbox && edited.bbox.w > 0.01 && edited.bbox.h > 0.01) {
        const pageNum = (edited.pageIndex ?? 0) + 1;
        const pageImgInfo = pageImagePathMap.get(pageNum);
        if (pageImgInfo) {
          try {
            // ★ 기존 레코드 삭제 후 insert (중복 방지)
            await supabase.from('detection_annotations').delete().eq('problem_id', problem.id);
            await supabase.from('detection_annotations').insert({
              problem_id: problem.id,
              exam_id: examId,
              job_id: jobId,
              page_number: pageNum,
              page_image_path: pageImgInfo.path,
              page_width: pageImgInfo.width,
              page_height: pageImgInfo.height,
              bbox_x: edited.bbox.x,
              bbox_y: edited.bbox.y,
              bbox_w: edited.bbox.w,
              bbox_h: edited.bbox.h,
              class_label: 'problem',
              problem_number: edited.number,
              detection_source: 'MANUAL',
            });
            console.log(`[Direct Save] 문제 ${edited.number}번 YOLO 어노테이션 저장 완료`);
          } catch (annErr) {
            console.warn(`[Direct Save] 문제 ${edited.number}번 어노테이션 저장 실패 (무시):`, annErr);
          }
        }
      }
    } catch (err) {
      console.error(`[Direct Save] 문제 ${edited.number}번 오류:`, err);
    }
  }

  // ★ 자산화 완료: examId를 기록하여 중복 저장 방지
  if (examId) {
    autoSavedExams.set(jobId, examId);
  }

  if (savedCount === 0) {
    return NextResponse.json({
      success: false,
      error: `자산화 실패: 저장된 문제가 0개입니다.${!examId ? ' (시험지 생성도 실패)' : ''}`,
      examId: examId,
    }, { status: 500 });
  }

  // ★ 자산화 완료 즉시 해설 생성 자동 시작 (fire-and-forget)
  if (examId && requestOrigin) {
    triggerAutoSolutionGeneration(examId, requestOrigin);
  }

  return NextResponse.json({
    success: true,
    message: `${savedCount}개 문제가 자산화되었습니다.`,
    problemCount: savedCount,
    examId: examId,
  });
}

/**
 * 도형의 figureBbox 위치에 따라 content 텍스트에 [도형] 마커를 삽입
 * figureBbox.y는 문제 영역 내 도형의 상대 위치 (0~1)
 */
function insertFigureMarker(
  content: string,
  figureBbox: { x: number; y: number; w: number; h: number }
): string {
  const lines = content.split('\n');
  if (lines.length === 0) return '[도형]\n' + content;

  // 도형 위치가 전체 높이 대비 어디쯤인지 (0~1)
  const figureY = figureBbox.y;

  // 빈 줄이 아닌 실제 콘텐츠 라인 인덱스 목록
  const contentLineIndices = lines
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => line.trim().length > 0);

  if (contentLineIndices.length === 0) return '[도형]\n' + content;

  // figureY에 가장 가까운 삽입 위치 계산
  // 문제 영역 내에서 도형의 y 비율로 라인 인덱스 추정
  const insertAfterContentIdx = Math.round(figureY * contentLineIndices.length);

  // 삽입할 실제 라인 인덱스
  let insertAt: number;
  if (insertAfterContentIdx >= contentLineIndices.length) {
    // 도형이 문제 끝부분 → 마지막 줄 다음에 삽입
    insertAt = lines.length;
  } else if (insertAfterContentIdx <= 0) {
    // 도형이 문제 시작부분 → 첫 줄 다음에 삽입
    insertAt = contentLineIndices.length > 0 ? contentLineIndices[0].i + 1 : 0;
  } else {
    // 중간: 해당 콘텐츠 라인 뒤에 삽입
    insertAt = contentLineIndices[insertAfterContentIdx - 1].i + 1;
  }

  lines.splice(insertAt, 0, '[도형]');
  return lines.join('\n');
}

async function saveProblemsToDB(
  jobId: string,
  results: LLMAnalysisResult[],
  bookGroupId: string | null = null,
  imageUrlMap: Map<number, string> = new Map(),
  editedProblems?: Array<{ number: number; bbox?: { x: number; y: number; w: number; h: number }; pageIndex?: number; [key: string]: any }>,
  pageImagePathMap: Map<number, { path: string; width: number; height: number }> = new Map()
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

  // 1. Exam 레코드 생성 (클라우드 그룹핑용, 시험지관리에는 미표시)
  // 003_exams.sql 마이그레이션 스키마 기준 컬럼만 사용
  let examId: string | null = null;
  try {
    const firstResult = results[0];
    const classification = firstResult?.classification;

    // ★ appendToExamId가 있으면 기존 시험지에 병합 (새 시험지 생성 건너뜀)
    if (job.appendToExamId) {
      console.log(`[DB] appendToExamId=${job.appendToExamId} — 기존 시험지에 ${savedProblemIds.length}개 문제 병합`);

      // 마지막 sequence_number 조회
      const { data: lastSeqData } = await supabase
        .from('exam_problems')
        .select('sequence_number')
        .eq('exam_id', job.appendToExamId)
        .order('sequence_number', { ascending: false })
        .limit(1)
        .single();

      const startSeq = (lastSeqData?.sequence_number || 0) + 1;

      // 이미 연결된 문제 제외
      const { data: existingEp } = await supabase
        .from('exam_problems')
        .select('problem_id')
        .eq('exam_id', job.appendToExamId)
        .in('problem_id', savedProblemIds);

      const existingSet = new Set((existingEp || []).map((r: any) => r.problem_id));
      const toAdd = savedProblemIds.filter(id => !existingSet.has(id));

      for (let i = 0; i < toAdd.length; i++) {
        await supabase.from('exam_problems').insert({
          exam_id: job.appendToExamId,
          problem_id: toAdd[i],
          sequence_number: startSeq + i,
          points: 4,
        });
      }

      autoSavedExams.set(jobId, job.appendToExamId);
      console.log(`[DB] 기존 시험지에 ${toAdd.length}개 문제 병합 완료`);
      return;
    }

    // schema.sql 기준 컬럼만 사용 (공통 유틸 사용)
    const fileTitle = job.fileName.replace(/\.[^/.]+$/, "");

    const examInsertData: Record<string, any> = {
      title: fileTitle,
      description: `업로드: ${job.fileName} (${results.length}문항) | 과목: ${classification?.subject || '수학'} | 단원: ${classification?.chapter || '미분류'}`,
      status: 'DRAFT',
      created_by: createdBy,
      institute_id: instituteId,
      total_points: results.length * 4,
      time_limit_minutes: 50,
      subject: detectSubjectFromTitle(fileTitle),
      exam_type: detectExamTypeFromTitle(fileTitle),
      grade: detectGradeFromTitle(fileTitle),
    };

    // 북그룹 ID가 있으면 설정, 없으면 과목 기반 자동 폴더 배치 (fuzzy 매칭)
    if (bookGroupId) {
      examInsertData.book_group_id = bookGroupId;
    } else {
      const detectedSubject = examInsertData.subject || '';
      if (detectedSubject) {
        try {
          const folder = await findAutoFolderForSubject(supabase, detectedSubject);
          if (folder) {
            examInsertData.book_group_id = folder.id;
            console.log(`[DB] 자동 폴더 배치: "${detectedSubject}" → "${folder.name}" (키워드="${folder.keyword}")`);
          }
        } catch (e) {
          console.warn('[DB] 자동 폴더 매칭 실패:', e);
        }
      }
    }

    console.log(`[DB] Inserting exam with data:`, JSON.stringify(examInsertData, null, 2));

    let examResult = await supabase
      .from('exams')
      .insert(examInsertData)
      .select('id')
      .single();

    // 컬럼 에러 시 (PostgREST 스키마 캐시 문제) 최소 컬럼만으로 재시도 (book_group_id는 유지!)
    if (examResult.error && examResult.error.message.includes('column')) {
      console.warn(`[DB] Retrying exam insert with minimal columns: ${examResult.error.message}`);
      const retryData: Record<string, any> = {
        title: examInsertData.title,
        description: examInsertData.description,
        status: examInsertData.status,
        created_by: createdBy,
        institute_id: instituteId,
      };
      if (bookGroupId) retryData.book_group_id = bookGroupId;  // ★ book_group_id 유지
      examResult = await supabase
        .from('exams')
        .insert(retryData)
        .select('id')
        .single();
    }

    const { data: exam, error: examError } = examResult;

    if (examError) {
      console.error('[DB] Failed to create exam record:', examError.message);
      // institute_id NOT NULL 에러 시 institute_id 없이 한번 더 시도 (003_exams.sql은 nullable)
      if (examError.message.includes('institute_id') || examError.message.includes('not-null')) {
        console.warn('[DB] Retrying without institute_id (nullable in migration)...');
        const retryInsertData: Record<string, any> = {
          title: examInsertData.title,
          description: examInsertData.description,
          status: examInsertData.status,
          created_by: createdBy,
        };
        if (bookGroupId) retryInsertData.book_group_id = bookGroupId;  // ★ book_group_id 유지
        const retryResult = await supabase
          .from('exams')
          .insert(retryInsertData)
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

  let problemIndex = 0;
  for (const result of results) {
    problemIndex++;
    try {
      // 문제 내용: 원본 OCR 텍스트 사용 (없으면 해설 steps에서 추출)
      const problemContent = result.originalText
        || result.solution.steps.map((s) => s.description).join('\n')
        || '(자동 추출된 문제)';

      // 수식 포함 콘텐츠 구성
      const mathExprs = result.originalMathExpressions || [];
      let contentWithMath = mathExprs.length > 0
        ? `${problemContent}\n\n수식:\n${mathExprs.map(m => `$${m}$`).join('\n')}`
        : problemContent;

      // ★ 크롭 이미지 URL 조회 (문제 번호 기반)
      const problemNum = result.problemNumber || problemIndex;
      const cropImageUrl = imageUrlMap.get(problemNum);
      const imagesArray = cropImageUrl
        ? [{ url: cropImageUrl, type: 'crop', label: `문제 ${problemNum} 크롭 이미지` }]
        : [];

      // ★ 도형이 있는 문제: figureBbox를 분석하여 [도형] 마커를 적절한 위치에 자동 삽입
      if (result.hasFigure && result.figureBbox && !contentWithMath.includes('[도형]')) {
        contentWithMath = insertFigureMarker(contentWithMath, result.figureBbox);
      }

      // problems 테이블에 저장
      const { data: problem, error: problemError } = await supabase
        .from('problems')
        .insert({
          institute_id: instituteId,
          created_by: createdBy,
          source_file_id: null,
          content_latex: contentWithMath,
          content_html: null,
          solution_latex: (() => {
            const parts: string[] = [];
            // 개념 정리 (신규 필드)
            if ((result.solution as any).concept) {
              parts.push(`[개념] ${(result.solution as any).concept}`);
              parts.push('');
            }
            // 풀이
            parts.push('[풀이]');
            if (result.solution.steps && result.solution.steps.length > 0) {
              for (const s of result.solution.steps) {
                const desc = s.description || '';
                const latex = s.latex ? ` $${s.latex}$` : '';
                parts.push(`${s.stepNumber}. ${desc}${latex}`);
              }
              parts.push('');
            }
            // 최종 답
            if (result.solution.finalAnswer) {
              parts.push(`∴ 정답: ${result.solution.finalAnswer}`);
            }
            // 팁
            if ((result.solution as any).tip) {
              parts.push('');
              parts.push(`💡 ${(result.solution as any).tip}`);
            }
            return parts.length > 0 ? parts.join('\n') : '해설 자동 생성 실패';
          })(),
          solution_html: null,
          answer_json: {
            finalAnswer: result.solution.finalAnswer || '',
            type: (result.choices && result.choices.length > 0) ? 'multiple_choice' : 'short_answer',
            correct_answer: result.solution.finalAnswer || '',
            choices: result.choices || [],
          },
          images: imagesArray,
          status: 'PENDING_REVIEW',
          source_number: problemNum || null,
          ai_analysis: {
            classification: result.classification,
            solution: result.solution,
            analyzedAt: result.analyzedAt,
            hasFigure: result.hasFigure || false,
            figureBbox: result.figureBbox || null,
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

        // Exam-Problem 연결 — content에서 [N점] 추출, 없으면 4
        if (examId) {
          const contentForPts = result.contentWithMath || '';
          const ptsMatch = contentForPts.match(/\[\s*(?:총\s*)?(\d+(?:\.\d+)?)\s*점\s*\]/);
          const autoPoints = ptsMatch ? Math.min(100, Math.max(0, parseFloat(ptsMatch[1]))) : 4;
          const { error: epError } = await supabase.from('exam_problems').insert({
            exam_id: examId,
            problem_id: problem.id,
            sequence_number: savedCount,
            points: autoPoints,
          });
          if (epError) {
            console.error(`[DB] exam_problems 연결 실패 (문제 #${savedCount}, problem ${problem.id}):`, epError.message, epError.details);
          } else {
            console.log(`[DB] exam_problems 연결 완료 (문제 #${savedCount} → exam ${examId})`);
          }
        }

        // ★ YOLO 학습 데이터: detection_annotations 저장
        // editedProblems에서 bbox를 찾거나, result.bbox를 사용
        const problemNum = result.problemNumber || problemIndex;
        const editedBbox = editedProblems?.find(ep => ep.number === problemNum)?.bbox;
        const editedPageIndex = editedProblems?.find(ep => ep.number === problemNum)?.pageIndex;
        const bbox = editedBbox || result.bbox;
        const pageIdx = editedPageIndex ?? result.pageIndex;

        if (bbox && bbox.w > 0.01 && bbox.h > 0.01 && pageIdx !== undefined) {
          const pageNum = pageIdx + 1;
          const pageImgInfo = pageImagePathMap.get(pageNum);
          if (pageImgInfo) {
            try {
              // ★ 기존 레코드 삭제 후 insert (중복 방지)
              await supabase.from('detection_annotations').delete().eq('problem_id', problem.id);
              await supabase.from('detection_annotations').insert({
                problem_id: problem.id,
                exam_id: examId,
                job_id: jobId,
                page_number: pageNum,
                page_image_path: pageImgInfo.path,
                page_width: pageImgInfo.width,
                page_height: pageImgInfo.height,
                bbox_x: bbox.x,
                bbox_y: bbox.y,
                bbox_w: bbox.w,
                bbox_h: bbox.h,
                class_label: 'problem',
                problem_number: problemNum,
                detection_source: editedBbox ? 'MANUAL' : 'MATHPIX',
              });
              console.log(`[DB] 문제 ${problemNum}번 YOLO 어노테이션 저장`);
            } catch (annErr) {
              console.warn(`[DB] 문제 ${problemNum}번 어노테이션 저장 실패 (무시):`, annErr);
            }
          }
        }
      }
    } catch (err) {
      console.error(`[DB] Error processing result ${result.problemId}:`, err);
    }
  }

  console.log(`[DB] Successfully saved ${savedCount}/${results.length} problems from job ${jobId}`);

  // ★ 분류 결과 기반 exam subject 자동 보정
  // GPT 분류에서 가장 많이 나온 과목으로 exam subject 업데이트
  if (examId && supabase) {
    try {
      const subjectVotes: Record<string, number> = {};
      for (const r of results) {
        const cls = r.classification?.subject || r.classification?.classification?.subject;
        if (cls && typeof cls === 'string' && cls.length > 1) {
          subjectVotes[cls] = (subjectVotes[cls] || 0) + 1;
        }
      }
      const topSubject = Object.entries(subjectVotes).sort((a, b) => b[1] - a[1])[0];
      if (topSubject && topSubject[1] >= Math.ceil(results.length * 0.3)) {
        const detectedSubject = topSubject[0];
        const currentSubject = detectSubjectAuto(fileTitle);
        // 파일명 감지와 GPT 분류가 다르면 GPT 결과로 보정
        if (detectedSubject !== currentSubject) {
          await supabase.from('exams').update({ subject: detectedSubject }).eq('id', examId);
          console.log(`[DB] exam subject 자동 보정: "${currentSubject}" → "${detectedSubject}" (GPT 분류 ${topSubject[1]}/${results.length}문제)`);
        }
      }
    } catch (subjectErr) {
      console.warn('[DB] exam subject 자동 보정 실패 (무시):', subjectErr);
    }
  }

  // ★ 자동 자산화 완료: examId를 기록하여 중복 저장 방지
  if (examId) {
    autoSavedExams.set(jobId, examId);
    console.log(`[DB] 자동 자산화 기록: job ${jobId} → exam ${examId}`);
  }

  // ★ 도형 포함 문제: 업스케일 우선 → AI Vision 폴백 (비동기, 실패해도 무시)
  // 원본 크롭이 쓸만하면 업스케일만으로 완료, 안되면 GPT-4o Vision으로 구조화된 도형 생성
  if (supabase) {
    const figureProblems = results.filter(r => r.hasFigure);
    if (figureProblems.length > 0) {
      console.log(`[Figure] ${figureProblems.length}개 도형 문제 감지, 업스케일 우선 + AI 폴백 시작...`);

      // 비동기 실행 (await하지 않아 메인 플로우를 차단하지 않음)
      (async () => {
        // 동적 import (서버사이드에서만 사용)
        const { tryUpscaleCrop } = await import('@/lib/vision/image-upscaler');
        const { interpretImage } = await import('@/lib/vision/image-interpreter');
        const { generateGeometrySVG } = await import('@/lib/vision/figure-renderer');

        let upscaledCount = 0;
        let aiGeneratedCount = 0;

        for (const result of figureProblems) {
          try {
            // DB에서 저장된 문제 ID와 crop 이미지 URL 찾기
            const { data: savedProblem } = await supabase
              .from('problems')
              .select('id, images, ai_analysis, content_latex')
              .eq('source_name', job.fileName)
              .ilike('content_latex', `%${(result.contentMmd || '').substring(0, 30).replace(/[%_]/g, '')}%`)
              .limit(1)
              .single();

            if (!savedProblem?.id) continue;

            const imgs: Array<{url: string; type: string}> = Array.isArray(savedProblem.images) ? savedProblem.images : [];
            const cropUrl = imgs.find(i => i.type === 'crop')?.url;
            if (!cropUrl) {
              console.log(`[Figure] 문제 ${result.problemNumber}: 크롭 이미지 없음, 건너뜀`);
              continue;
            }

            // 이미지 다운로드
            let imgBuf: ArrayBuffer | null = null;
            let imgType = 'image/png';

            const storageMatch = cropUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/);
            if (storageMatch && supabase) {
              const [, bucket, filePath] = storageMatch;
              const { data: blob, error: stErr } = await supabase.storage
                .from(bucket)
                .download(decodeURIComponent(filePath));
              if (!stErr && blob) {
                imgBuf = await blob.arrayBuffer();
                imgType = blob.type || 'image/png';
              }
            }

            if (!imgBuf) {
              const imgRes = await fetch(cropUrl);
              if (!imgRes.ok) {
                console.warn(`[Figure] 문제 ${result.problemNumber}: 이미지 다운로드 실패 (${imgRes.status})`);
                continue;
              }
              imgBuf = await imgRes.arrayBuffer();
              imgType = imgRes.headers.get('content-type') || 'image/png';
            }

            const rawBuffer = Buffer.from(imgBuf);
            const analysis = (savedProblem.ai_analysis as Record<string, unknown>) || {};

            // ================================================================
            // ★ Step 1: 업스케일 우선 시도
            // ================================================================
            console.log(`[Figure] 문제 ${result.problemNumber}: 업스케일 시도 중...`);
            const upscaleResult = await tryUpscaleCrop(rawBuffer);

            if (upscaleResult) {
              const { quality, upscaled } = upscaleResult;
              console.log(`[Figure] 문제 ${result.problemNumber}: ✅ 업스케일 성공 (${quality.width}x${quality.height} → ${upscaled.width}x${upscaled.height})`);

              // 업스케일 이미지 Supabase Storage에 업로드
              const upscaledPath = `problem-crops/upscaled/${savedProblem.id}.png`;
              const upscaledBuffer = Buffer.from(upscaled.base64, 'base64');

              const { error: uploadErr } = await supabase.storage
                .from('source-files')
                .upload(upscaledPath, upscaledBuffer, { contentType: 'image/png', upsert: true });

              if (!uploadErr) {
                // ★ Private 버킷이므로 프록시 URL 사용
                const proxyUrl = `/api/storage/image?path=${encodeURIComponent(upscaledPath)}`;

                await supabase
                  .from('problems')
                  .update({
                    ai_analysis: {
                      ...analysis,
                      hasFigure: true,
                      figureSource: 'upscaled_crop',
                      upscaledCropUrl: proxyUrl,
                      upscaleInfo: {
                        originalSize: { width: quality.width, height: quality.height },
                        upscaledSize: { width: upscaled.width, height: upscaled.height },
                        scale: upscaled.scale,
                        qualityScore: quality.score,
                        processedAt: new Date().toISOString(),
                      },
                      cropImageUrl: cropUrl,
                    },
                  })
                  .eq('id', savedProblem.id);

                upscaledCount++;
                console.log(`[Figure] 문제 ${result.problemNumber}: 업스케일 저장 완료 → AI 스킵`);
                continue; // ★ AI 생성 스킵
              } else {
                console.warn(`[Figure] 문제 ${result.problemNumber}: 업스케일 업로드 실패, AI 폴백`);
              }
            } else {
              console.log(`[Figure] 문제 ${result.problemNumber}: 업스케일 불가 → AI Vision 폴백`);
            }

            // ================================================================
            // ★ Step 2: AI Vision 폴백 (업스케일 불가일 때만)
            // ================================================================
            if (!process.env.OPENAI_API_KEY) {
              console.log(`[Figure] 문제 ${result.problemNumber}: OpenAI API 키 없음, AI 폴백 불가`);
              continue;
            }

            console.log(`[Figure] 문제 ${result.problemNumber} AI Vision 해석 중...`);
            const imgBase64 = rawBuffer.toString('base64');
            const imgDataUri = `data:${imgType};base64,${imgBase64}`;

            const interpreted = await interpretImage(imgDataUri, result.contentMmd?.substring(0, 500));

            if (interpreted.figureType === 'photo' || interpreted.confidence < 0.3) {
              console.log(`[Figure] 문제 ${result.problemNumber}: 도형 없음 (${interpreted.figureType})`);
              continue;
            }

            let legacySvg: string | undefined;
            if (interpreted.rendering?.type === 'geometry') {
              legacySvg = generateGeometrySVG(interpreted.rendering) || undefined;
            }

            await supabase
              .from('problems')
              .update({
                ai_analysis: {
                  ...analysis,
                  hasFigure: true,
                  figureSource: 'ai_generated',
                  figureData: interpreted,
                  figureSvg: legacySvg || analysis.figureSvg || undefined,
                  figureGeneratedAt: new Date().toISOString(),
                  figureModel: 'gpt-4o',
                },
              })
              .eq('id', savedProblem.id);

            aiGeneratedCount++;
            console.log(`[Figure] 문제 ${result.problemNumber} AI 해석 완료: ${interpreted.figureType} (confidence: ${interpreted.confidence})`);
          } catch (figErr) {
            console.warn(`[Figure] 문제 ${result.problemNumber} 처리 실패 (무시):`, figErr);
          }
        }
        console.log(`[Figure] 도형 처리 완료: 업스케일 ${upscaledCount}개 + AI ${aiGeneratedCount}개 / 총 ${figureProblems.length}개`);
      })();
    }
  }
}
