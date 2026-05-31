// ============================================================================
// Cloud Flow API - PDF 업로드 및 자동 분류 백그라운드 작업
// ============================================================================

// ★ 대용량 PDF 지원: API Route 설정
export const maxDuration = 300; // 5분 타임아웃
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import type { UploadJob, ProcessingStatus, LLMAnalysisResult } from '@/types/workflow';
import { processUploadJob, getStatusLabel, convertedPdfStore, isScienceSubject } from '@/lib/workflow/cloud-flow';
import { processScienceWithGemini } from '@/lib/workflow/science-gemini-flow';
import { convertHWPtoPDF } from '@/lib/workflow/hwp-converter';
import { detectSubjectFromTitle, detectGradeFromTitle, detectExamTypeFromTitle } from '@/lib/utils/exam-detect';
import { detectDiagnosticMetaFromTitle } from '@/lib/workflow/title-detect';
import { findAutoFolderForSubject } from '@/lib/utils/auto-folder';
import { normalizeObjectiveAnswer } from '@/lib/validation/objective-answer';
import { extractFinalAnswerFromSolution } from '@/lib/ocr/answer-parser';
import { repairOcrBrokenLatex } from '@/lib/utils/repair-ocr-latex';
import { detectAndRepairSymbols } from '@/lib/ocr/symbol-detector';
import { verifyAndRepairWithVision, persistVisionDiffsForLearning } from '@/lib/ocr/vision-verifier';
import { loadLearnedRules, applyLearnedRules, type LearnedRule } from '@/lib/workflow/apply-learned-rules';

// ★ 사용자 명시 출처 카테고리 → exam INSERT 메타 결정 헬퍼
//   사용자 지시 (2026-05-16): "자산화 할때 분류해서 하게 하자".
//   - 'auto' : 자동 태깅 결과 그대로 사용 (기존 동작)
//   - 'school' / 'textbook' / 'mock' : 진단평가 아님 (is_diagnostic=false 강제)
//   - 'diagnostic' : 진단평가 강제 (제목에서 round 추출 시도, 실패 시 빈값)
function applySourceCategoryOverride(
  sourceCategory: 'auto' | 'school' | 'diagnostic' | 'achievement' | 'textbook' | 'mock',
  autoMeta: { is_diagnostic: boolean; diagnostic_category: 'BS' | 'DD' | 'PT' | 'SC' | null; diagnostic_round: string | null; diagnostic_difficulty: string | null },
  title: string,
): {
  is_diagnostic: boolean;
  diagnostic_category: 'BS' | 'DD' | 'PT' | 'SC' | null;
  diagnostic_round: string | null;
  diagnostic_difficulty: string | null;
  exam_type: string | null;  // null = 자동 감지 결과 사용
} {
  if (sourceCategory === 'auto') {
    return { ...autoMeta, exam_type: null };
  }
  if (sourceCategory === 'diagnostic') {
    return {
      is_diagnostic: true,
      diagnostic_category: autoMeta.diagnostic_category || 'BS',  // 패턴 매치 실패 시 BS 기본
      diagnostic_round: autoMeta.diagnostic_round,
      diagnostic_difficulty: autoMeta.diagnostic_difficulty,
      exam_type: '진단평가',
    };
  }
  // school / achievement / textbook / mock 모두 진단평가 X
  const examTypeMap: Record<string, string> = {
    school:      '학교기출',
    achievement: '성취도 평가',
    textbook:    '시중교재',
    mock:        '모의고사',
  };
  return {
    is_diagnostic: false,
    diagnostic_category: null,
    diagnostic_round: null,
    diagnostic_difficulty: null,
    exam_type: examTypeMap[sourceCategory] || null,
  };
}
import { isSharedLibraryMode } from '@/lib/security/institute-guard';
import type { SubjectTrack } from '@/types/track';

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
    // ★ 사용자 명시 출처 카테고리 — 자동 태깅보다 우선 (사용자 지시 2026-05-16)
    //   auto = 제목 패턴 자동 분류 (기존 동작) / school / diagnostic / textbook / mock
    const sourceCategory = (formData.get('sourceCategory') as
      | 'auto' | 'school' | 'diagnostic' | 'textbook' | 'mock'
      | null) || 'auto';
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
      sourceCategory,  // ★ 사용자 명시 출처 카테고리 — PUT 시점에 jobStore 에서 가져와 사용
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
      console.log(`[Upload PUT] 페이지 이미지 ${pageImages.length}개 처리 시작 (Promise.all 병렬)`);
      // ★ Phase 3 최적화: for-of 직렬 → Promise.all 병렬 (페이지 N개 동시 업로드)
      //   각 페이지는 의존성 없음. Map.set 은 JS 단일 스레드라 race 안전.
      //   warn/error 는 try/catch 격리되어 한 페이지 실패가 다른 페이지 영향 X.
      await Promise.all(pageImages.map(async (pageImg) => {
        try {
          // 1) 이미 Storage에 업로드된 경우 (권장 경로)
          if (pageImg.storagePath) {
            pageImagePathMap.set(pageImg.pageNumber, {
              path: pageImg.storagePath,
              width: pageImg.width || 0,
              height: pageImg.height || 0,
            });
            return;
          }
          // 2) legacy: base64 수신 → 서버 업로드
          if (!supabaseAdmin) return;
          const base64Data = (pageImg.imageBase64 || '').replace(/^data:image\/\w+;base64,/, '');
          if (!base64Data) return;
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
          }
        } catch (imgErr) {
          console.warn(`[Upload PUT] 페이지 ${pageImg.pageNumber} 이미지 처리 오류:`, imgErr);
        }
      }));
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
          sourceCategory: 'auto',  // ★ Storage 복원 경로 — formData 가 없는 케이스, auto 기본
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
      return await saveEditedProblemsDirect(jobId, job, editedProblems, acBookGroupId, pageImagePathMap, request.nextUrl.origin, job.sourceCategory || 'auto');
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
          // ★ #22 (2026-05-30): 사용자가 1차 OCR 화면에서 직접 수정한 문제 표시.
          //   매칭된 result 참조에 직접 플래그 → saveProblemsToDB 의 비전 재교정이 사용자 수정을
          //   덮어쓰는 회귀 차단. 번호 매칭 실패·인덱스 폴백과 무관하게 동작(같은 객체에 마킹).
          if (edited.isEdited) (result as { __userEdited?: boolean }).__userEdited = true;
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
        // ★ Phase 3 최적화: for-of 직렬 → concurrency 5 chunk 병렬.
        //   30개 문제 시 직렬 ~30초 → 5개 동시로 ~6초 (5x 단축).
        //   Supabase Storage rate limit 회피용 concurrency 제한 (무한 병렬 X).
        const CONCURRENCY = 5;
        const cropEntries = Array.from(cropImageMap.entries());
        for (let batchStart = 0; batchStart < cropEntries.length; batchStart += CONCURRENCY) {
          const batch = cropEntries.slice(batchStart, batchStart + CONCURRENCY);
          await Promise.all(batch.map(async ([num, base64]) => {
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
                }
              }
            } catch (imgErr) {
              console.error(`[Upload PUT] 문제 ${num}번 이미지 처리 오류:`, imgErr);
            }
          }));
        }
      } else {
        console.warn('[Upload PUT] Supabase Admin 미설정, 이미지 업로드 스킵');
      }
    }

    // DB에 저장 (bookGroupId, imageUrlMap 전달) — 클라이언트 값 우선, 폴백으로 job.bookGroupId
    const effectiveBookGroupId = bookGroupId || job.bookGroupId || null;
    console.log(`[Upload PUT] ★ DB 저장 시 bookGroupId: "${effectiveBookGroupId}"`);
    await saveProblemsToDB(jobId, results, effectiveBookGroupId, imageUrlMap, editedProblems, pageImagePathMap, job.sourceCategory || 'auto');

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
        failedJob.status = 'FAILED';
        failedJob.currentStep = `HWP→PDF 변환 실패: LibreOffice 오류. ${errMsg.includes('timeout') || errMsg.includes('SIGKILL') ? 'LibreOffice가 응답하지 않습니다. 서버를 재시작해 주세요.' : errMsg}`;
        failedJob.updatedAt = new Date().toISOString();
        jobStore.set(jobId, failedJob);
      }
      return; // 변환 실패 시 더 이상 진행하지 않음
    }
  }

  // ★ 과학 트랙 + Gemini POC 분기 — feature flag 로 안전 폴백.
  //   SCIENCE_USE_GEMINI=true 일 때만 활성. 기본 비활성 (기존 Mathpix 경로).
  //   수학 라인 영향 0.
  const useGeminiScience =
    job.subjectArea === 'science' && process.env.SCIENCE_USE_GEMINI === 'true';

  if (useGeminiScience) {
    console.log(`[Job ${jobId}] 과학 트랙 — Gemini POC 파이프라인 사용`);
    try {
      // 변환된 PDF 우선 (HWP 인 경우), 없으면 원본
      const buffer = convertedPdfStore.get(jobId) || currentBuffers.problem;
      const mimeType =
        job.fileType === 'HWP'
          ? 'application/pdf' // HWP 변환 후 PDF
          : job.fileType === 'PDF'
            ? 'application/pdf'
            : 'image/jpeg';

      const results = await processScienceWithGemini(buffer, mimeType, {
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
          jobResults.set(jobId, partialResults);
        },
      }, jobId);

      // 최종 결과 저장
      jobResults.set(jobId, results);

      // 메모리 정리
      convertedPdfStore.delete(jobId);
      fileBufferStore.delete(jobId);

      // 과학 트랙은 일단 **자동 자산화 X** (POC 단계, 사용자 검수 우선)
      console.log(`[Job ${jobId}] 과학 Gemini 완료: ${results.length}문제`);
      return;
    } catch (err) {
      console.error(`[Job ${jobId}] 과학 Gemini 실패:`, err);
      const currentJob = jobStore.get(jobId);
      if (currentJob) {
        currentJob.error = err instanceof Error ? err.message : String(err);
        currentJob.status = 'FAILED';
        currentJob.updatedAt = new Date().toISOString();
        jobStore.set(jobId, currentJob);
      }
      fileBufferStore.delete(jobId);
      return;
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
/**
 * 자산화 시 업로더 organization 의 격리 모드(isolated_assets) 여부.
 *
 * 기존엔 중첩 embed(institutes!inner(organizations!inner(...)))로 조회했는데
 * 파싱이 취약해 누락되던 사고(2026-05-31: 엄궁차수학 업로드 25건이 공통풀로 유출).
 * → 순차 admin 쿼리(users.organization_id → institute → organizations.isolated_assets)
 *   로 견고화. organization_id 우선, 없으면 institute 로 역추적.
 */
async function isOrgIsolatedAssets(createdBy: string | null): Promise<boolean> {
  if (!createdBy || !supabaseAdmin) return false;
  try {
    const { data: u } = await supabaseAdmin
      .from('users')
      .select('institute_id, organization_id')
      .eq('id', createdBy)
      .maybeSingle();
    if (!u) return false;
    let orgId = (u as { organization_id?: string | null }).organization_id ?? null;
    const instId = (u as { institute_id?: string | null }).institute_id ?? null;
    if (!orgId && instId) {
      const { data: inst } = await supabaseAdmin
        .from('institutes')
        .select('organization_id')
        .eq('id', instId)
        .maybeSingle();
      orgId = (inst as { organization_id?: string | null } | null)?.organization_id ?? null;
    }
    if (!orgId) return false;
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('isolated_assets')
      .eq('id', orgId)
      .maybeSingle();
    return (org as { isolated_assets?: boolean } | null)?.isolated_assets === true;
  } catch (e) {
    console.warn('[isolation] organization isolated_assets 조회 실패:', (e as Error).message);
    return false;
  }
}

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
    // ★ figure 학습 데이터 — insertedImages 의 좌표만 (problem 크롭 0~1 기준)
    figureBboxes?: Array<{ x: number; y: number; w: number; h: number }>;
    // ★ 사용자가 1차 OCR 화면에서 직접 수정한 문제 (2026-05-30) — true 면 비전 재교정 스킵.
    isEdited?: boolean;
  }>,
  bookGroupId: string | null,
  pageImagePathMap: Map<number, { path: string; width: number; height: number }> = new Map(),
  requestOrigin: string = '',
  // ★ 사용자 명시 출처 카테고리 — exam INSERT 시 자동 태깅 override
  sourceCategory: 'auto' | 'school' | 'diagnostic' | 'achievement' | 'textbook' | 'mock' = 'auto'
) {
  const supabase = supabaseAdmin;
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase Admin not configured' }, { status: 500 });
  }

  // ★ 학습 규칙 로드 (2026-05-19) — 한 번 로드해서 루프에서 재사용
  //   카드 편집 모달에서 누적된 (original, corrected) 패턴 중 confidence ≥ 0.7
  //   규칙만 자산화 시점에 자동 적용. 수학(Mathpix) / 과학(Gemini) OCR 모두 적용.
  const learnedRules = await loadLearnedRules(supabase);
  console.log(`[Direct Save] 학습 규칙 로드: ${learnedRules.length}개 (confidence ≥ 0.7)`);

  // ★ 크롭 이미지를 Supabase Storage에 업로드 / 이미 업로드된 path는 public URL만 생성
  // ★ Phase 3 최적화: for-of 직렬 → concurrency 5 chunk 병렬.
  //   30개 문제 시 직렬 ~30초 → 5개 동시로 ~6초. Supabase rate limit 회피.
  //   Map.set 은 race-safe (단일 스레드).
  const imageUrlMap = new Map<number, string>();
  const CONCURRENCY_UPLOAD = 5;
  for (let batchStart = 0; batchStart < editedProblems.length; batchStart += CONCURRENCY_UPLOAD) {
    const batch = editedProblems.slice(batchStart, batchStart + CONCURRENCY_UPLOAD);
    await Promise.all(batch.map(async (edited) => {
      // 1) 클라이언트에서 이미 업로드한 경우 — public URL만 생성 (네트워크 호출 X, 매우 빠름)
      if (edited.cropImagePath) {
        const { data: urlData } = supabase.storage
          .from('source-files')
          .getPublicUrl(edited.cropImagePath);
        if (urlData?.publicUrl) imageUrlMap.set(edited.number, urlData.publicUrl);
        return;
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
            }
          }
        } catch (imgErr) {
          console.error(`[Direct Save] 문제 ${edited.number}번 이미지 오류:`, imgErr);
        }
      }
    }));
  }

  // ★ created_by 우선순위 — job.userId(UUID) → 쿠키 세션의 인증 유저 → null
  //   기존엔 job.userId 가 'anonymous' 같은 비-UUID 일 때 곧바로 null → exams.created_by
  //   NOT NULL 위반으로 자산화 실패 사고 (Storage 복원 경로에서 userId hint 가 문자열로
  //   박혀들어가는 케이스). 쿠키 세션에서 한 번 더 시도.
  const isValidUUID = (str: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };
  let createdBy: string | null = isValidUUID(job.userId) ? job.userId : null;
  if (!createdBy) {
    try {
      const sessionSupa = await createSupabaseServerClient();
      if (sessionSupa) {
        const { data: { user } } = await sessionSupa.auth.getUser();
        if (user?.id && isValidUUID(user.id)) {
          createdBy = user.id;
          console.log(`[Direct Save] job.userId 무효("${job.userId}") → 쿠키 세션 유저로 폴백: ${createdBy}`);
        }
      }
    } catch (e) {
      console.warn('[Direct Save] 쿠키 세션 유저 조회 실패:', e);
    }
  }

  // ★ institute_id 결정 (saveProblemsToDB와 동일 로직)
  //   콜드스타트 정책: SHARED_LIBRARY_MODE=true 면 NULL 강제 → 본부 공통 풀.
  //   모든 가맹 학원이 검색·사용 가능. 학원별 자산 격리로 전환 시 env 만 끔.
  //
  // ★ 학원 단위 격리 우선 (organizations.isolated_assets=true)
  //   사용자 organization 이 격리 모드면 env 무시하고 institute_id 박음.
  //   예: 엄궁차수학(isolated_assets=true) → 자산화 problems 가 다른 학원에 안 보임.
  //   사용자 지시 (2026-05-16): "엄궁차수학에서 만들거나 올리는 데이터는 다른
  //   학원에서 조회 되지 않게".
  const isolatedByOrg = await isOrgIsolatedAssets(createdBy);
  if (isolatedByOrg) {
    console.log('[Direct Save] organization.isolated_assets=true → institute_id 박음 (격리 모드)');
  }

  let instituteId: string | null;
  if (isSharedLibraryMode() && !isolatedByOrg) {
    instituteId = null;
    console.log('[Direct Save] SHARED_LIBRARY_MODE=on → institute_id=NULL (본부 공통 풀)');
  } else {
    instituteId = isValidUUID(job.instituteId) ? job.instituteId : null;
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
  }

  console.log(`[Direct Save] instituteId: ${instituteId}, createdBy: ${createdBy}, bookGroupId: ${bookGroupId}`);

  // ★ Exam 레코드 생성 (클라우드 그룹핑용, 시험지관리에는 미표시)
  let examId: string | null = null;
  // ★ 진단용 — 실제 DB 에러를 응답에 담아 alert 에서 즉시 원인 파악 가능하게.
  let examInsertError: { message: string; code?: string; details?: string; hint?: string } | null = null;
  // ★ append 모드 시 기존 exam_problems 의 마지막 sequence_number — 그 다음부터 채번
  let sequenceOffset = 0;
  // 파일명에서 과목/유형/학년 자동 추출 (공통 유틸 사용)
  const fileTitle = job.fileName.replace(/\.[^/.]+$/, '');

  // ★ subject_track 결정 — 시험지 제목 기반. 시험지·모든 문제 같은 트랙으로 박힘.
  //   isScienceSubject 매치 안 되면 'math' fallback (수학 라인 보호).
  //   feature flag false 여도 컬럼은 채워둠 — 추후 활성 시 즉시 분리됨.
  const subjectTrack: SubjectTrack = isScienceSubject(fileTitle) ? 'science' : 'math';

  // ★ append 모드 — 기존 시험지에 문제 추가 (cloud "기존 시험지에 추가" 흐름)
  //   여기서 examId 결정 + sequenceOffset 설정. 새 exam INSERT 와 중복 차단 모두 스킵.
  //   기존엔 saveProblemsToDB 의 깨진 분기에서만 처리되어 autoCrop 모드(주 경로)에선 동작 X.
  if (job.appendToExamId && isValidUUID(job.appendToExamId)) {
    try {
      const { data: existingExam } = await supabase
        .from('exams')
        .select('id')
        .eq('id', job.appendToExamId)
        .is('deleted_at', null)
        .single();
      if (existingExam) {
        examId = existingExam.id;
        // 기존 exam_problems 의 max sequence_number 조회
        const { data: lastSeq } = await supabase
          .from('exam_problems')
          .select('sequence_number')
          .eq('exam_id', examId)
          .order('sequence_number', { ascending: false })
          .limit(1)
          .maybeSingle();
        sequenceOffset = lastSeq?.sequence_number || 0;
        const appendId = examId as string;  // 위에서 set 했지만 TS 가 narrow 못 함
        autoSavedExams.set(jobId, appendId);
        console.log(`[Direct Save] append 모드 — exam ${appendId.slice(0, 8)} 에 ${editedProblems.length}문제 추가, sequence ${sequenceOffset + 1} 부터`);
      } else {
        console.warn(`[Direct Save] appendToExamId(${job.appendToExamId}) 무효(존재 X 또는 삭제됨) — 새 exam 생성으로 폴백`);
      }
    } catch (e) {
      console.warn('[Direct Save] append 모드 검증 실패 — 새 exam 생성으로 폴백:', e);
    }
  }

  // ★ DB 기반 중복 차단 — autoSavedExams in-memory 캐시는 콜드스타트/재배포에 휘발됨.
  //   같은 institute_id + title + (book_group_id) 조합의 살아있는 exam 있으면 그것 재사용.
  //   동일 파일을 두 번 자산화해 빈껍데기 중복 exam 생기던 사고 (신도중 2-1) 차단.
  //   ★ append 모드일 땐 스킵 (의도적으로 기존 시험지에 추가하는 흐름)
  if (!examId) {
    try {
      let dupQuery = supabase
        .from('exams')
        .select('id, deleted_at')
        .eq('title', fileTitle)
        .is('deleted_at', null);
      if (instituteId) dupQuery = dupQuery.eq('institute_id', instituteId);
      if (bookGroupId) dupQuery = dupQuery.eq('book_group_id', bookGroupId);
      const { data: dupRows } = await dupQuery
        .order('created_at', { ascending: false })
        .limit(1);
      if (dupRows && dupRows.length > 0) {
        const dupId = dupRows[0].id as string;
        console.log(`[Direct Save] 같은 제목의 살아있는 exam 발견 → 재사용 (${dupId}) — 중복 자산화 차단`);
        autoSavedExams.set(jobId, dupId);
        return NextResponse.json({
          success: true,
          message: '같은 제목의 시험지가 이미 존재합니다. 중복 자산화를 차단했습니다.',
          examId: dupId,
          alreadySaved: true,
        });
      }
    } catch (e) {
      console.warn('[Direct Save] 중복 차단 조회 실패 (계속 진행):', e);
    }
  }

  // ★ append 모드 (examId 이미 set 됨) 면 새 exam INSERT 스킵
  if (!examId) {
    try {
      const diagnosticMeta = detectDiagnosticMetaFromTitle(fileTitle);
      // ★ 사용자 명시 sourceCategory override — 'auto' 면 자동 태깅 결과 사용
      const sourceOverride = applySourceCategoryOverride(sourceCategory, diagnosticMeta, fileTitle);
      const examInsertData: Record<string, any> = {
        title: fileTitle,
        description: `업로드 파일: ${job.fileName} (${editedProblems.length}문항)`,
        status: 'DRAFT',
        created_by: createdBy,
        institute_id: instituteId,
        total_points: editedProblems.length * 4,
        time_limit_minutes: 50,
        subject: detectSubjectFromTitle(fileTitle),
        exam_type: sourceOverride.exam_type ?? detectExamTypeFromTitle(fileTitle),
        grade: detectGradeFromTitle(fileTitle),
        // ★ 진단지 자동 태깅 (사용자 sourceCategory 가 'auto' 또는 'diagnostic' 일 때만).
        is_diagnostic: sourceOverride.is_diagnostic,
        diagnostic_category: sourceOverride.diagnostic_category,
        diagnostic_round: sourceOverride.diagnostic_round,
        diagnostic_difficulty: sourceOverride.diagnostic_difficulty,
        subject_track: subjectTrack,
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

      if (diagnosticMeta.is_diagnostic) {
        console.log(`[Direct Save] ★ 진단지 자동 태깅: ${diagnosticMeta.diagnostic_category}${diagnosticMeta.diagnostic_round ? `/${diagnosticMeta.diagnostic_round}` : ''}${diagnosticMeta.diagnostic_difficulty ? `/${diagnosticMeta.diagnostic_difficulty}` : ''}`);
      }
      console.log(`[Direct Save] Creating exam: title="${examInsertData.title}", subject=${examInsertData.subject}, bookGroup=${examInsertData.book_group_id || 'auto'}`);

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
        examInsertError = {
          message: examResult.error.message,
          code: (examResult.error as { code?: string }).code,
          details: (examResult.error as { details?: string }).details,
          hint: (examResult.error as { hint?: string }).hint,
        };
      } else {
        examId = examResult.data.id;
        console.log(`[Direct Save] Created exam: ${examId}`);
      }
    } catch (err) {
      console.error('[Direct Save] Exam create exception:', err);
      examInsertError = {
        message: err instanceof Error ? err.message : String(err),
        code: 'EXCEPTION',
      };
    }
  }

  // ★ exam INSERT 실패 시 즉시 abort — problems 만 저장돼 orphan 되는 사고 차단.
  //   이전엔 examId=null 인 채로 problems 22개를 저장하고 exam_problems 는 미생성 →
  //   클라우드 페이지에서 시험지가 통째로 안 보이던 사고 (동백중 2-1).
  if (!examId) {
    return NextResponse.json({
      success: false,
      error: 'exam 레코드 생성 실패 — 자산화 중단. (problems 미저장으로 orphan 데이터 방지)',
      problemCount: 0,
      examId: null,
      // ★ 진단용 — alert 에 실제 원인 표시
      detail: examInsertError,
      diagnostic: {
        title: fileTitle,
        instituteId,
        bookGroupId: bookGroupId || null,
        createdBy,
      },
    }, { status: 500 });
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
      // ★ 그림 객관식 (2026-05-19): 텍스트가 비어도 choiceImages[i] 가 있으면 placeholder 유지.
      //   filter(Boolean) 로 dropping 하면 index 어긋나서 ImagePositionEditor 가 깨짐.
      const editedChoiceImagesPreFormat: (string | null)[] | undefined = (edited as {
        choiceImages?: (string | null)[];
      }).choiceImages;
      const formattedChoices = choices.map((c: string, i: number) => {
        const stripped = c.replace(/^[①②③④⑤]\s*/, '');
        if (stripped) return `${circledNumbers[i]} ${stripped}`;
        // 이미지만 있는 선택지는 번호만 박음 (filter(Boolean) 사고 차단)
        if (editedChoiceImagesPreFormat && editedChoiceImagesPreFormat[i]) {
          return `${circledNumbers[i]}`;
        }
        return '';
      });
      // 뒤쪽 trailing empty 만 trim — 중간 빈 항목은 그림 객관식 placeholder 이므로 유지
      while (formattedChoices.length > 0 && !formattedChoices[formattedChoices.length - 1]) {
        formattedChoices.pop();
      }

      // ★ 크롭 이미지는 images JSONB에만 저장 (content_latex에는 삽입하지 않음)
      let contentLatex = edited.content || '(문제 내용 없음)';

      // ★ OCR 깨진 LaTeX 자산화 시점 정정 (2026-05-19, BS_H1S2_R2 1번 사고)
      //   `$(가)$` 한글 라벨 wrap, `=$(ㄴ)$\\` 등호 분리 깨짐, 라인 끝 `\\` 잔여 등
      //   광역 점검 결과 2,332건 중 8건만 영향 (0.34%) — 모두 OCR 깨진 패턴
      contentLatex = repairOcrBrokenLatex(contentLatex);

      // ★ 사전 심볼 탐지 게이트 (2026-05-27 MVP) — 원본 클론 보장:
      //   Mathpix 가 동그라미 한글 (㉠~㉩) 을 (ㄱ)~(ㅊ) 로 잘못 인식하는 사고.
      //   단순 치환은 원본이 진짜 (ㄱ) 인 시험지를 깰 위험 → 원본 크롭을 Flash 로 보고
      //   실제 ㉠ 동그라미 보일 때만 변환. 의심 패턴 없는 문제는 호출 0 (비용 절감).
      //   실패 시 (네트워크/API) 원본 그대로 — fail-safe.
      try {
        const { repairedText, repairCount } = await detectAndRepairSymbols(cropImageUrl, contentLatex);
        if (repairCount > 0) {
          console.log(`[Direct Save] 문제 ${edited.number}: 심볼 탐지 ${repairCount}건 교정 (㉠~㉩)`);
          contentLatex = repairedText;
        }
      } catch (e) {
        console.warn(`[Direct Save] 문제 ${edited.number}: 심볼 탐지 실패 (무시):`, e instanceof Error ? e.message : e);
      }

      // ★ 비전 검증 + 자동 교정 (2026-05-27 단계 3 full 루프 Phase 1) — 원본 클론 자동화:
      //   원본 크롭 vs OCR 전체 본문 대조. 명확한 OCR 오인식만 자동 교정.
      //   비용: 자산화당 모든 문제 1 Flash 호출 (~$0.001). 25문항 ~$0.025/시험지.
      //
      // ★★ 사용자 수동 수정 보호 (2026-05-30) — isEdited=true 면 비전 재교정 스킵.
      //   회귀 사고: 사용자가 1차 OCR 화면에서 ㉠·분수 등을 손으로 고쳐도, 자산화 시 이 비전
      //   교정이 "원본 크롭 이미지" 기준으로 사용자 수정을 도로 덮어써서 "고쳐도 또 깨짐" 발생
      //   (이미지엔 OCR 오인식 폰트가 그대로 보이므로). 사람이 고친 건 기계가 안 덮는다.
      //   미수정(자동) 문제는 기존대로 자동 교정 유지.
      if (edited.isEdited) {
        console.log(`[Direct Save] 문제 ${edited.number}: 사용자 수정본 → 비전 재교정 스킵 (수정본 보존)`);
      } else {
        try {
          const { isMatch, correctedText, diffs } = await verifyAndRepairWithVision(cropImageUrl, contentLatex);
          if (!isMatch && correctedText) {
            console.log(
              `[Direct Save] 문제 ${edited.number}: 비전 교정 적용 (diff ${diffs.length}개)`,
              diffs.slice(0, 3).map((d) => `${d.from}→${d.to}`).join(', ')
            );
            contentLatex = correctedText;
          }
        } catch (e) {
          console.warn(`[Direct Save] 문제 ${edited.number}: 비전 검증 실패 (무시):`, e instanceof Error ? e.message : e);
        }
      }


      // ★ 학습 규칙 자동 적용 (2026-05-19) — 카드 편집에서 누적된 정정 자동 변환
      {
        const { result, appliedCount, appliedRules } = applyLearnedRules(contentLatex, learnedRules);
        if (appliedCount > 0) {
          console.log(`[Direct Save] 문제 ${edited.number}: 학습 규칙 ${appliedCount}회 적용 — ${appliedRules.join(', ')}`);
          contentLatex = result;
        }
      }

      // ★ 본문 (3점)/[3점] 등 배점 표기 제거 — 카드 헤더 배지와 중복 방지
      //   배점은 exam_problems.points 로 별도 저장됨.
      contentLatex = contentLatex
        .replace(/[\[(]\s*\d+(?:\.\d+)?\s*점\s*[\])]/g, '')
        .replace(/[ \t]{2,}/g, ' ');

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
            }
          }
          figureIdx++;
        } catch (figErr) {
          console.error(`[Direct Save] 문제 ${edited.number}번 figure_crop 업로드 오류:`, figErr);
        }
        // regex lastIndex 리셋 (contentLatex가 변경되었으므로)
        base64ImageRegex.lastIndex = 0;
      }

      // ★ 그림 객관식 (2026-05-19): edited.choiceImages 의 base64 data URL → Storage 업로드.
      //   각 선택지 이미지를 problem-crops/{jobId}/problem-{N}-choice-{idx}.png 로 저장 후
      //   data URL → public URL 로 교체. 비어있거나 이미 URL 이면 그대로 보존.
      const rawChoiceImages: (string | null)[] | undefined = (edited as {
        choiceImages?: (string | null)[];
      }).choiceImages;
      const resolvedChoiceImages: (string | null)[] = rawChoiceImages
        ? [...rawChoiceImages]
        : [];
      if (rawChoiceImages && rawChoiceImages.length > 0) {
        for (let ci = 0; ci < rawChoiceImages.length; ci++) {
          const img = rawChoiceImages[ci];
          if (!img) {
            resolvedChoiceImages[ci] = null;
            continue;
          }
          // data URL 이 아니면 (이미 storage URL) 그대로
          const m = img.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/);
          if (!m) {
            resolvedChoiceImages[ci] = img;
            continue;
          }
          try {
            const ext = m[1] === 'jpg' ? 'jpeg' : m[1];
            const imgBuffer = Buffer.from(m[2], 'base64');
            const choicePath = `problem-crops/${jobId}/problem-${edited.number}-choice-${ci}.${ext === 'jpeg' ? 'jpg' : ext}`;
            const { data: ciData, error: ciError } = await supabase.storage
              .from('source-files')
              .upload(choicePath, imgBuffer, { contentType: `image/${ext}`, upsert: true });
            if (!ciError && ciData) {
              const { data: ciUrlData } = supabase.storage
                .from('source-files')
                .getPublicUrl(ciData.path);
              if (ciUrlData?.publicUrl) {
                resolvedChoiceImages[ci] = ciUrlData.publicUrl;
                imagesArray.push({ url: ciUrlData.publicUrl, type: 'choice_image', label: `선택지 ${ci + 1} 이미지` });
              } else {
                // URL 못 만들면 base64 유지 (자산화 깨지지 않게)
                resolvedChoiceImages[ci] = img;
              }
            } else {
              console.warn(`[Direct Save] choice ${ci} image upload 실패:`, ciError?.message);
              resolvedChoiceImages[ci] = img;
            }
          } catch (ciErr) {
            console.error(`[Direct Save] 문제 ${edited.number}번 choice ${ci} 이미지 업로드 오류:`, ciErr);
            resolvedChoiceImages[ci] = img;
          }
        }
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
          answer_json: (() => {
            // ★ 객관식 정답 박힘 차단 — 0/모호값은 빈값으로 normalize.
            //   메모리: feedback_objective_answer_safety.md (261개 박힘 사고)
            const isObj = formattedChoices.length > 0;
            let rawAns = String(edited.answer || '');
            // ★ 해설→빠른답 자동 회로 (사용자 원칙: 해설 박히면 빠른답 자동 추출)
            //   edited.answer 비고 edited.solution 있으면 해설 패턴에서 정답 추출.
            //   진단평가 BS_H1S1_R1 류 사고 차단.
            if (!rawAns.trim() && edited.solution) {
              const extracted = extractFinalAnswerFromSolution(edited.solution);
              if (extracted) {
                rawAns = extracted.answer;
                console.log(`[saveEditedProblemsDirect] 문제 ${edited.number}: 해설→답 자동 추출 "${rawAns}" (${extracted.answerType})`);
              }
            }
            const safeAns = isObj ? normalizeObjectiveAnswer(rawAns) : rawAns;
            const aj: Record<string, unknown> = {
              finalAnswer: safeAns,
              type: isObj ? 'multiple_choice' : 'short_answer',
              correct_answer: safeAns,
              choices: formattedChoices,
            };
            // ★ 그림 객관식 — 한 개라도 있으면 박음
            if (resolvedChoiceImages.some((u) => !!u)) {
              aj.choiceImages = resolvedChoiceImages;
            }
            // ★ 표 객관식 헤더 (2026-05-25 누락 복원) — 클라이언트에서 보낸 choiceHeaders 보존
            const ch = (edited as { choiceHeaders?: string[] }).choiceHeaders;
            if (ch && Array.isArray(ch) && ch.length > 0) {
              aj.choiceHeaders = ch;
            }
            // ★ 선택지 레이아웃 (1/2/3/5 컬럼) — 자산화 시점에 보존되어야 클라우드 렌더 정상
            const cl = (edited as { choiceLayout?: number }).choiceLayout;
            if (cl !== undefined && cl !== null) {
              aj.choiceLayout = cl;
            }
            return aj;
          })(),
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
          subject_track: subjectTrack,
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

      // ★ Phase C-1b: 함정 유형 자동 태깅 — edited.pitfalls가 있으면 INSERT.
      //   클라이언트(analyze 페이지)가 cloud-flow의 pitfalls를 전달해야 동작.
      //   미전달 시 빈 배열 → 스킵 (회귀 X).
      if (problem) {
        const editedPitfalls = (edited as { pitfalls?: Array<{ code: string; confidence: number; reason?: string }> }).pitfalls;
        if (Array.isArray(editedPitfalls) && editedPitfalls.length > 0) {
          try {
            const pitfallRows = editedPitfalls
              .filter((p) => p.code && /^[A-Z][A-Z0-9_]+$/.test(p.code))
              .map((p) => ({
                problem_id: problem.id,
                pitfall_code: p.code,
                ai_confidence: typeof p.confidence === 'number' ? p.confidence : 0.7,
                reason: p.reason || null,
                is_verified: false,
              }));
            if (pitfallRows.length > 0) {
              const { error: pfErr } = await supabase.from('problem_pitfalls').insert(pitfallRows);
              if (pfErr) {
                console.warn(`[Direct Save] problem_pitfalls insert 실패 (problem ${problem.id}):`, pfErr.message);
              } else {
                console.log(`[Direct Save] ★ pitfalls 태깅 (${problem.id.slice(0, 8)}): ${editedPitfalls.map((p) => p.code).join(', ')}`);
              }
            }
          } catch (e) {
            console.warn(`[Direct Save] pitfalls insert 예외:`, e);
          }
        }
      }

      savedCount++;
      if (problem?.id) savedProblemIds.push(problem.id);

      // ★ Exam-Problem 연결 — 우선순위:
      //   1) edited.score (1차 OCR/분석 페이지에서 뽑은 원 배점)
      //   2) 본문 [총 N점] (서답형 묶음 헤더) — 있으면 그것을 대문제 진짜 배점으로 신뢰
      //   3) 본문 [Ni점] / (Ni점) 모두 합산 (소문제별 점수 다수 표기된 케이스)
      //   4) null (사용자가 카드에서 수동 입력)
      //
      // 이전엔 정규식 첫 매치만 잡아서 "[총 5점] ... [2점]" 본문이 2점으로 들어가는 사고 (신도중 2-1 [서·논술형 4]).
      if (examId && problem) {
        let extractedPoints: number | null = null;
        if (typeof edited.score === 'number' && Number.isFinite(edited.score) && edited.score > 0) {
          extractedPoints = Math.min(100, Math.max(0, Math.round(edited.score * 10) / 10));
        } else {
          //   contentLatex 는 본문 (N점) 이 stripping 된 상태이므로 raw edited.content 에서 추출.
          const rawForPts = edited.content || contentLatex || '';
          const totalMatch = rawForPts.match(/[\[(]\s*총\s*(\d+(?:\.\d+)?)\s*점\s*[\])]/);
          if (totalMatch) {
            extractedPoints = Math.min(100, Math.max(0, parseFloat(totalMatch[1])));
          } else {
            // 본문 안 모든 [N점] / (N점) 수집
            const allMatches = Array.from(rawForPts.matchAll(/[\[(]\s*(\d+(?:\.\d+)?)\s*점\s*[\])]/g));
            if (allMatches.length > 1) {
              const sum = allMatches.reduce((s, mm) => s + parseFloat(mm[1]), 0);
              extractedPoints = Math.min(100, Math.max(0, sum));
            } else if (allMatches.length === 1) {
              extractedPoints = Math.min(100, Math.max(0, parseFloat(allMatches[0][1])));
            }
          }
        }
        const { error: epError } = await supabase.from('exam_problems').insert({
          exam_id: examId,
          problem_id: problem.id,
          // ★ append 모드면 기존 max 다음부터, 아니면 1부터
          sequence_number: sequenceOffset + savedCount,
          points: extractedPoints,
        });
        if (epError) {
          console.error(`[Direct Save] exam_problems 연결 실패 (문제 ${edited.number}번):`, epError.message, epError.details);
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
            // problem 클래스 (사용자 검수된 좌표)
            const annotationsToInsert: Array<Record<string, unknown>> = [{
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
            }];
            // ★ graph 클래스 학습 데이터 — figureBboxes 좌표 (problem 크롭 0~1) → 페이지 좌표 변환
            if (edited.figureBboxes && edited.figureBboxes.length > 0) {
              for (const fig of edited.figureBboxes) {
                if (fig.w <= 0 || fig.h <= 0) continue;
                annotationsToInsert.push({
                  problem_id: problem.id,
                  exam_id: examId,
                  job_id: jobId,
                  page_number: pageNum,
                  page_image_path: pageImgInfo.path,
                  page_width: pageImgInfo.width,
                  page_height: pageImgInfo.height,
                  // ★ 좌표 변환: problem.bbox + fig * problem.bbox.size = 페이지 0~1 좌표
                  bbox_x: edited.bbox.x + fig.x * edited.bbox.w,
                  bbox_y: edited.bbox.y + fig.y * edited.bbox.h,
                  bbox_w: fig.w * edited.bbox.w,
                  bbox_h: fig.h * edited.bbox.h,
                  class_label: 'graph',
                  problem_number: edited.number,
                  detection_source: 'MANUAL',
                });
              }
            }
            await supabase.from('detection_annotations').insert(annotationsToInsert);
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
  pageImagePathMap: Map<number, { path: string; width: number; height: number }> = new Map(),
  // ★ 사용자 명시 출처 카테고리 — exam INSERT 시 자동 태깅 override
  sourceCategory: 'auto' | 'school' | 'diagnostic' | 'achievement' | 'textbook' | 'mock' = 'auto'
): Promise<void> {
  // Use Admin Client to bypass RLS for background processing
  const supabase = supabaseAdmin;

  if (!supabase) {
    console.log('[DB] Supabase Admin not configured, skipping DB save');
    return;
  }

  const job = jobStore.get(jobId);
  if (!job) return;

  // ★ 학습 규칙 로드 (2026-05-19) — 한 번 로드해서 루프에서 재사용
  const learnedRules: LearnedRule[] = await loadLearnedRules(supabase);
  console.log(`[DB] 학습 규칙 로드: ${learnedRules.length}개 (confidence ≥ 0.7)`);

  // ★ TS 에러 보강 — 아래 appendToExamId 분기가 problems 저장 전에 이 변수를 참조해
  //   기존엔 ReferenceError 가능성 있던 코드 (사실상 사용자가 거의 안 만나던 dead 분기).
  //   안전하게 빈 배열로 선언만 추가 — 분기 동작은 그대로 (toAdd=[] → no-op).
  //   진짜 cloud "기존 시험지에 추가" 기능은 별도로 검증·수정 필요.
  const savedProblemIds: string[] = [];

  // UUID 유효성 검사 함수
  const isValidUUID = (str: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  // ★ created_by 우선순위 — job.userId(UUID) → 쿠키 세션의 인증 유저 → null
  //   saveEditedProblemsDirect 와 동일 폴백. Storage 복원 경로의 'anonymous' 문자열로
  //   exams.created_by NOT NULL 위반되던 사고 차단.
  let createdBy: string | null = isValidUUID(job.userId) ? job.userId : null;
  if (!createdBy) {
    try {
      const sessionSupa = await createSupabaseServerClient();
      if (sessionSupa) {
        const { data: { user } } = await sessionSupa.auth.getUser();
        if (user?.id && isValidUUID(user.id)) {
          createdBy = user.id;
          console.log(`[DB] job.userId 무효("${job.userId}") → 쿠키 세션 유저로 폴백: ${createdBy}`);
        }
      }
    } catch (e) {
      console.warn('[DB] 쿠키 세션 유저 조회 실패:', e);
    }
  }

  // 사용자의 institute_id 조회 (users 테이블에서)
  //   콜드스타트 정책: SHARED_LIBRARY_MODE=true 면 NULL 강제 → 본부 공통 풀.
  //
  // ★ 학원 단위 격리 우선 (organizations.isolated_assets=true)
  //   사용자 organization 이 격리 모드면 env 무시하고 institute_id 박음.
  //   예: 엄궁차수학(isolated_assets=true) → 자산화 problems 다른 학원 차단.
  const isolatedByOrg = await isOrgIsolatedAssets(createdBy);
  if (isolatedByOrg) {
    console.log('[DB] organization.isolated_assets=true → institute_id 박음 (격리 모드)');
  }

  let instituteId: string | null;
  if (isSharedLibraryMode() && !isolatedByOrg) {
    instituteId = null;
    console.log('[DB] SHARED_LIBRARY_MODE=on → institute_id=NULL (본부 공통 풀)');
  } else {
  instituteId = isValidUUID(job.instituteId) ? job.instituteId : null;

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
  } // close: else (SHARED_LIBRARY_MODE off branch)

  console.log(`[DB] Saving ${results.length} problems for job ${jobId}`);
  console.log(`[DB] instituteId: ${instituteId}, createdBy: ${createdBy}`);

  // ★ subject_track 결정 — saveEditedProblemsDirect 와 동일 로직 (한쪽만 패치되면 사고).
  //   시험지·모든 문제 같은 트랙. isScienceSubject 매치 안 되면 'math' fallback.
  const subjectTrack: SubjectTrack = isScienceSubject(
    job.fileName.replace(/\.[^/.]+$/, '')
  ) ? 'science' : 'math';

  // 1. Exam 레코드 생성 (클라우드 그룹핑용, 시험지관리에는 미표시)
  // 003_exams.sql 마이그레이션 스키마 기준 컬럼만 사용
  let examId: string | null = null;
  // ★ append 모드 시 기존 max sequence_number — exam_problems INSERT 시 offset 으로 사용
  let sequenceOffset = 0;

  // ★ append 모드 — 기존 시험지에 문제 추가 (새 exam INSERT 스킵)
  //   기존엔 problems 저장 전에 분기에서 savedProblemIds 사용해 ReferenceError + 미저장.
  //   수정: examId 만 재사용하고 problems 저장은 아래 루프가 처리. exam_problems
  //   sequence_number 는 sequenceOffset + savedCount 로 자동 채번.
  if (job.appendToExamId && isValidUUID(job.appendToExamId)) {
    try {
      const { data: existingExam } = await supabase
        .from('exams')
        .select('id')
        .eq('id', job.appendToExamId)
        .is('deleted_at', null)
        .single();
      if (existingExam) {
        examId = existingExam.id;
        const { data: lastSeq } = await supabase
          .from('exam_problems')
          .select('sequence_number')
          .eq('exam_id', examId)
          .order('sequence_number', { ascending: false })
          .limit(1)
          .maybeSingle();
        sequenceOffset = lastSeq?.sequence_number || 0;
        autoSavedExams.set(jobId, examId as string);
        console.log(`[DB] append 모드 — exam ${(examId as string).slice(0, 8)} 에 ${results.length}문제 추가, sequence ${sequenceOffset + 1} 부터`);
      } else {
        console.warn(`[DB] appendToExamId(${job.appendToExamId}) 무효 — 새 exam 생성으로 폴백`);
      }
    } catch (e) {
      console.warn('[DB] append 모드 검증 실패 — 새 exam 생성으로 폴백:', e);
    }
  }

  try {
    const firstResult = results[0];
    const classification = firstResult?.classification;

    // append 모드면 새 exam INSERT 스킵 (examId 이미 set)
    if (examId) {
      console.log(`[DB] append 모드 — exam ${examId.slice(0, 8)} 재사용, 새 INSERT 스킵`);
    }

    // schema.sql 기준 컬럼만 사용 (공통 유틸 사용)
    const fileTitle = job.fileName.replace(/\.[^/.]+$/, "");

    // ★ DB 기반 중복 차단 — append 모드면 스킵 (의도적 추가)
    if (!examId) {
      try {
        let dupQuery = supabase
          .from('exams')
          .select('id, deleted_at')
          .eq('title', fileTitle)
          .is('deleted_at', null);
        if (instituteId) dupQuery = dupQuery.eq('institute_id', instituteId);
        if (bookGroupId) dupQuery = dupQuery.eq('book_group_id', bookGroupId);
        const { data: dupRows } = await dupQuery
          .order('created_at', { ascending: false })
          .limit(1);
        if (dupRows && dupRows.length > 0) {
          const dupId = dupRows[0].id as string;
          console.log(`[DB] 같은 제목의 살아있는 exam 발견 → 재사용 (${dupId}) — 중복 자산화 차단`);
          autoSavedExams.set(jobId, dupId);
          return; // saveProblemsToDB 는 void — 중복은 조용히 무시
        }
      } catch (e) {
        console.warn('[DB] 중복 차단 조회 실패 (계속 진행):', e);
      }
    }

    // ★ append 모드면 새 exam INSERT 스킵 (examId 이미 set)
    if (!examId) {
      const diagnosticMeta = detectDiagnosticMetaFromTitle(fileTitle);
      // ★ 사용자 명시 sourceCategory override — saveEditedProblemsDirect 와 동일 로직.
      const sourceOverride = applySourceCategoryOverride(sourceCategory, diagnosticMeta, fileTitle);
      const examInsertData: Record<string, any> = {
        title: fileTitle,
        description: `업로드: ${job.fileName} (${results.length}문항) | 과목: ${classification?.subject || '수학'} | 단원: ${classification?.chapter || '미분류'}`,
        status: 'DRAFT',
        created_by: createdBy,
        institute_id: instituteId,
        total_points: results.length * 4,
        time_limit_minutes: 50,
        subject: detectSubjectFromTitle(fileTitle),
        exam_type: sourceOverride.exam_type ?? detectExamTypeFromTitle(fileTitle),
        grade: detectGradeFromTitle(fileTitle),
        // ★ 진단지 자동 태깅 (사용자 sourceCategory 가 'auto' 또는 'diagnostic' 일 때만).
        is_diagnostic: sourceOverride.is_diagnostic,
        diagnostic_category: sourceOverride.diagnostic_category,
        diagnostic_round: sourceOverride.diagnostic_round,
        diagnostic_difficulty: sourceOverride.diagnostic_difficulty,
        subject_track: subjectTrack,
      };
      if (diagnosticMeta.is_diagnostic) {
        console.log(`[DB] ★ 진단지 자동 태깅: ${diagnosticMeta.diagnostic_category}${diagnosticMeta.diagnostic_round ? `/${diagnosticMeta.diagnostic_round}` : ''}`);
      }

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

      console.log(`[DB] Creating exam: title="${examInsertData.title}", subject=${examInsertData.subject}, bookGroup=${examInsertData.book_group_id || 'auto'}`);

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
    }
  } catch (err) {
    console.error('[DB] Error creating exam:', err);
  }

  // ★ exam INSERT 실패 시 즉시 abort — orphan problems 사고 차단 (동백중 2-1 패턴).
  //   saveProblemsToDB 는 void 라 사용자 알림은 못 주지만, 최소한 orphan problems 는 안 만든다.
  if (!examId) {
    console.error('[DB] examId 미생성 — problems 저장 중단 (orphan 방지).');
    return;
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

      // ★ OCR 깨진 LaTeX 자산화 시점 정정 (2026-05-19, BS_H1S2_R2 1번 사고)
      //   `$(가)$` 한글 라벨 wrap, `=$(ㄴ)$\\` 등호 분리 깨짐 등
      contentWithMath = repairOcrBrokenLatex(contentWithMath);

      // ★ 사전 심볼 탐지 게이트 (2026-05-27 MVP) — saveEditedProblemsDirect 와 동일 흐름.
      //   원본 클론 보장 — Mathpix 가 (ㄱ)~(ㅊ) 로 잘못 인식하고 Flash 가 실제 ㉠~㉩ 보일 때만 교정.
      //   problemNum 변수는 아래 line 2448 에서 정의되므로 여기선 result.problemNumber 직접 사용.
      try {
        const _pNum = result.problemNumber || problemIndex;
        const tmpCropUrl = imageUrlMap.get(_pNum);
        const { repairedText, repairCount } = await detectAndRepairSymbols(tmpCropUrl, contentWithMath);
        if (repairCount > 0) {
          console.log(`[DB] 문제 ${problemIndex}: 심볼 탐지 ${repairCount}건 교정 (㉠~㉩)`);
          contentWithMath = repairedText;
        }
      } catch (e) {
        console.warn(`[DB] 문제 ${problemIndex}: 심볼 탐지 실패 (무시):`, e instanceof Error ? e.message : e);
      }

      // ★ 비전 검증 + 자동 교정 (2026-05-27 단계 3 full 루프 Phase 1) — saveEditedProblemsDirect 와 동일.
      //
      // ★★ 사용자 수동 수정 보호 (#22, 2026-05-30) — result.__userEdited 면 비전 재교정 스킵.
      //   PUT 오버라이드 루프(line ~726)에서 사용자 수정본은 result 에 __userEdited 플래그가 박힘.
      //   saveEditedProblemsDirect(autoCrop 경로)와 동일 회귀를 OCR-results 경로에서도 차단
      //   ("두 함수 동시 패치" — 한쪽만 막으면 results 채워진 경로로 사용자 수정이 또 덮어써짐).
      if ((result as { __userEdited?: boolean }).__userEdited) {
        console.log(`[DB] 문제 ${problemIndex}: 사용자 수정본 → 비전 재교정 스킵 (수정본 보존)`);
      } else {
        try {
          const _pNum = result.problemNumber || problemIndex;
          const tmpCropUrl = imageUrlMap.get(_pNum);
          const { isMatch, correctedText, diffs } = await verifyAndRepairWithVision(tmpCropUrl, contentWithMath);
          if (!isMatch && correctedText) {
            console.log(
              `[DB] 문제 ${problemIndex}: 비전 교정 적용 (diff ${diffs.length}개)`,
              diffs.slice(0, 3).map((d) => `${d.from}→${d.to}`).join(', ')
            );
            contentWithMath = correctedText;
          }
        } catch (e) {
          console.warn(`[DB] 문제 ${problemIndex}: 비전 검증 실패 (무시):`, e instanceof Error ? e.message : e);
        }
      }

      // ★ 학습 규칙 자동 적용 (2026-05-19)
      {
        const { result, appliedCount, appliedRules } = applyLearnedRules(contentWithMath, learnedRules);
        if (appliedCount > 0) {
          console.log(`[DB] 문제 ${problemIndex}: 학습 규칙 ${appliedCount}회 적용 — ${appliedRules.join(', ')}`);
          contentWithMath = result;
        }
      }

      // ★ 본문에 남은 (3점)/[3점]/(3.4점)/[3.4점] 제거 (배점은 exam_problems.points 로만 보존)
      //   카드 헤더의 노란 배점 배지와 본문 (N점) 가 중복 노출되는 사고 방지.
      contentWithMath = contentWithMath
        .replace(/[\[(]\s*\d+(?:\.\d+)?\s*점\s*[\])]/g, '')
        .replace(/[ \t]{2,}/g, ' ');

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
          answer_json: (() => {
            // ★ 객관식 정답 박힘 차단 — 0/모호값은 빈값으로 normalize.
            const isObj = !!(result.choices && result.choices.length > 0);
            let rawAns = result.solution.finalAnswer || '';
            // ★ 해설→빠른답 자동 회로 — finalAnswer 비고 해설 본문에서 추출 가능하면 보충.
            //   solution_latex 구성 (line 2146~) 완료 전이라 result.solution.steps 등으로 재구성된 본문 사용.
            if (!String(rawAns).trim()) {
              const solBody = [
                (result.solution as any).concept || '',
                ...(result.solution.steps || []).map((s: any) => `${s.description || ''} ${s.latex || ''}`),
                result.solution.finalAnswer ? `∴ 정답: ${result.solution.finalAnswer}` : '',
              ].filter(Boolean).join('\n');
              if (solBody) {
                const extracted = extractFinalAnswerFromSolution(solBody);
                if (extracted) {
                  rawAns = extracted.answer;
                  console.log(`[saveProblemsToDB] 문제 ${problemNum}: 해설→답 자동 추출 "${rawAns}" (${extracted.answerType})`);
                }
              }
            }
            const safeAns = isObj ? normalizeObjectiveAnswer(rawAns) : rawAns;
            return {
              finalAnswer: safeAns,
              type: isObj ? 'multiple_choice' : 'short_answer',
              correct_answer: safeAns,
              choices: result.choices || [],
            };
          })(),
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
          subject_track: subjectTrack,
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

        // ★ Phase C-1b: 함정 유형 자동 태깅 — cloud-flow에서 받은 pitfalls를 problem_pitfalls에 INSERT.
        //   분류 자체에 영향 X — INSERT 실패해도 try-catch로 격리.
        const pitfallsRaw = (result.classification as { pitfalls?: Array<{ code: string; confidence: number; reason?: string }> }).pitfalls;
        if (Array.isArray(pitfallsRaw) && pitfallsRaw.length > 0) {
          try {
            const pitfallRows = pitfallsRaw
              .filter((p) => p.code && /^[A-Z][A-Z0-9_]+$/.test(p.code))
              .map((p) => ({
                problem_id: problem.id,
                pitfall_code: p.code,
                ai_confidence: typeof p.confidence === 'number' ? p.confidence : 0.7,
                reason: p.reason || null,
                is_verified: false,
              }));
            if (pitfallRows.length > 0) {
              const { error: pfErr } = await supabase.from('problem_pitfalls').insert(pitfallRows);
              if (pfErr) {
                console.warn(`[DB] problem_pitfalls insert 실패 (problem ${problem.id}):`, pfErr.message);
              } else {
                console.log(`[DB] ★ pitfalls 태깅 (${problem.id.slice(0, 8)}): ${pitfallsRaw.map((p) => p.code).join(', ')}`);
              }
            }
          } catch (e) {
            console.warn(`[DB] pitfalls insert 예외:`, e);
          }
        }

        savedCount++;

        // Exam-Problem 연결 — content에서 [N점] 또는 (N점) 추출, 없으면 null (사용자가 채움)
        // ★ 정규식 대괄호/소괄호 모두 매칭. 동해중 PDF처럼 (3점)/(4점) 소괄호 표기도 흔함.
        if (examId) {
          const contentForPts = result.contentWithMath || '';
          const ptsMatch = contentForPts.match(/[\[(]\s*(?:총\s*)?(\d+(?:\.\d+)?)\s*점\s*[\])]/);
          const autoPoints: number | null = ptsMatch ? Math.min(100, Math.max(0, parseFloat(ptsMatch[1]))) : null;
          const { error: epError } = await supabase.from('exam_problems').insert({
            exam_id: examId,
            problem_id: problem.id,
            // ★ append 모드면 기존 max 다음부터, 아니면 1부터
            sequence_number: sequenceOffset + savedCount,
            points: autoPoints,
          });
          if (epError) {
            console.error(`[DB] exam_problems 연결 실패 (문제 #${savedCount}, problem ${problem.id}):`, epError.message, epError.details);
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
        // ★ TypeClassification 의 subject 직접 + 일부 응답 형태에서 nested classification.subject
        //   둘 다 처리하기 위해 any 캐스팅 (타입 안정성보다 호환성 우선)
        const clsAny = r.classification as unknown as Record<string, unknown> | undefined;
        const cls = (clsAny?.subject as string) || ((clsAny?.classification as Record<string, unknown>)?.subject as string);
        if (cls && typeof cls === 'string' && cls.length > 1) {
          subjectVotes[cls] = (subjectVotes[cls] || 0) + 1;
        }
      }
      const topSubject = Object.entries(subjectVotes).sort((a, b) => b[1] - a[1])[0];
      if (topSubject && topSubject[1] >= Math.ceil(results.length * 0.3)) {
        const detectedSubject = topSubject[0];
        // ★ 함수명 typo 수정 (detectSubjectAuto → detectSubjectFromTitle, 다른 곳에서 import 됨)
        //   fileTitle 도 try 블록 외부라 직접 인라인 계산
        const currentSubject = detectSubjectFromTitle(job.fileName.replace(/\.[^/.]+$/, ''));
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
            const upscaleResult = await tryUpscaleCrop(rawBuffer);

            if (upscaleResult) {
              const { quality, upscaled } = upscaleResult;

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
                continue; // ★ AI 생성 스킵
              } else {
                console.warn(`[Figure] 문제 ${result.problemNumber}: 업스케일 업로드 실패, AI 폴백`);
              }
            }

            // ================================================================
            // ★ Step 2: AI Vision 폴백 (업스케일 불가일 때만)
            // ================================================================
            if (!process.env.OPENAI_API_KEY) {
              continue;
            }

            const imgBase64 = rawBuffer.toString('base64');
            const imgDataUri = `data:${imgType};base64,${imgBase64}`;

            const interpreted = await interpretImage(imgDataUri, result.contentMmd?.substring(0, 500));

            if (interpreted.figureType === 'photo' || interpreted.confidence < 0.3) {
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
          } catch (figErr) {
            console.warn(`[Figure] 문제 ${result.problemNumber} 처리 실패 (무시):`, figErr);
          }
        }
        console.log(`[Figure] 도형 처리 완료: 업스케일 ${upscaledCount}개 + AI ${aiGeneratedCount}개 / 총 ${figureProblems.length}개`);
      })();
    }
  }
}
