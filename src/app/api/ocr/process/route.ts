// ============================================================================
// OCR Processing API Route
// POST /api/ocr/process
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getMathpixClient, MathpixError } from '@/lib/ocr/mathpix';
import { parseQuestions, detectQuestionType } from '@/lib/ocr/question-parser';
import { validateLatex } from '@/lib/ocr/latex-validator';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import type {
  OCRPipelineResult,
  OCRError,
  ParsedQuestion,
  FileUploadMetadata,
} from '@/types/ocr';

// 최대 파일 크기 (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// 허용 MIME 타입
const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'application/pdf',
];

/**
 * POST /api/ocr/process
 * 파일 업로드 → Mathpix OCR → 파싱 → DB 저장
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const errors: OCRError[] = [];
  const warnings: string[] = [];

  try {
    // 1. 인증 확인
    const supabase = await createSupabaseServerClient();

    if (!supabase || !supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'Database not configured', code: 'DB_NOT_CONFIGURED' },
        { status: 503 }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    // 사용자 정보 조회
    const { data: userData } = await supabase
      .from('users')
      .select('institute_id, role')
      .eq('id', user.id)
      .single();

    if (!userData?.institute_id) {
      return NextResponse.json(
        { success: false, error: 'User not associated with an institute', code: 'NO_INSTITUTE' },
        { status: 403 }
      );
    }

    // 권한 확인 (ADMIN, TEACHER만 업로드 가능)
    if (!['ADMIN', 'TEACHER'].includes(userData.role)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // 2. FormData 파싱
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const sourceName = formData.get('source_name') as string | null;
    const sourceYear = formData.get('source_year') as string | null;
    const sourceMonth = formData.get('source_month') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided', code: 'NO_FILE' },
        { status: 400 }
      );
    }

    // 3. 파일 검증
    const validationError = validateFile(file);
    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError, code: 'INVALID_FILE' },
        { status: 400 }
      );
    }

    // 4. 파일 메타데이터
    const fileMetadata: FileUploadMetadata = {
      file_name: file.name,
      file_type: getFileType(file.type),
      file_size_bytes: file.size,
      mime_type: file.type,
    };

    // 5. Supabase Storage에 파일 업로드
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `uploads/${userData.institute_id}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('source-files')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json(
        { success: false, error: 'Failed to upload file', code: 'UPLOAD_FAILED' },
        { status: 500 }
      );
    }

    // 6. source_files 테이블에 레코드 생성
    const { data: sourceFile, error: dbError } = await supabaseAdmin
      .from('source_files')
      .insert({
        institute_id: userData.institute_id,
        uploaded_by: user.id,
        file_name: fileMetadata.file_name,
        file_type: fileMetadata.file_type,
        file_size_bytes: fileMetadata.file_size_bytes,
        storage_path: storagePath,
        ocr_status: 'PROCESSING',
        metadata: { source_name: sourceName, source_year: sourceYear, source_month: sourceMonth },
      })
      .select()
      .single();

    if (dbError || !sourceFile) {
      console.error('DB insert error:', dbError);
      return NextResponse.json(
        { success: false, error: 'Failed to create file record', code: 'DB_ERROR' },
        { status: 500 }
      );
    }

    // 7. Mathpix OCR 처리
    let mathpixResponse;
    try {
      const mathpixClient = getMathpixClient();

      if (file.type === 'application/pdf') {
        // PDF 처리
        const pdfResponses = await mathpixClient.processPDF(fileBuffer);
        mathpixResponse = pdfResponses[0]; // 첫 번째 응답 사용 (멀티페이지 합성)
      } else {
        // 이미지 처리
        mathpixResponse = await mathpixClient.processImage(fileBuffer);
      }
    } catch (error) {
      if (error instanceof MathpixError) {
        errors.push({
          code: error.code,
          message: error.message,
          details: error.details,
        });
      } else {
        errors.push({
          code: 'OCR_ERROR',
          message: error instanceof Error ? error.message : 'Unknown OCR error',
        });
      }

      // OCR 실패 상태 업데이트
      await supabaseAdmin
        .from('source_files')
        .update({
          ocr_status: 'FAILED',
          ocr_result: { errors },
        })
        .eq('id', sourceFile.id);

      return NextResponse.json(
        {
          success: false,
          error: 'OCR processing failed',
          code: 'OCR_FAILED',
          errors,
        },
        { status: 500 }
      );
    }

    // 8. 문제 파싱
    const parsedQuestions = parseQuestions(mathpixResponse);

    if (parsedQuestions.length === 0) {
      warnings.push('No questions detected in the document');
    }

    // 9. 파싱된 문제를 problems 테이블에 저장 (DRAFT 상태)
    const savedProblemIds: string[] = [];
    const saveErrors: Array<{ question_number: number; error: string }> = [];

    for (const question of parsedQuestions) {
      try {
        const problemData = createProblemData(question, {
          instituteId: userData.institute_id,
          createdBy: user.id,
          sourceFileId: sourceFile.id,
          sourceName,
          sourceYear: sourceYear ? parseInt(sourceYear, 10) : null,
          sourceMonth: sourceMonth ? parseInt(sourceMonth, 10) : null,
        });

        const { data: problem, error: problemError } = await supabaseAdmin
          .from('problems')
          .insert(problemData)
          .select('id')
          .single();

        if (problemError) {
          throw problemError;
        }

        savedProblemIds.push(problem.id);
      } catch (error) {
        saveErrors.push({
          question_number: question.question_number,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // 10. source_files 상태 업데이트
    await supabaseAdmin
      .from('source_files')
      .update({
        ocr_status: 'COMPLETED',
        ocr_processed_at: new Date().toISOString(),
        ocr_result: {
          mathpix_request_id: mathpixResponse.request_id,
          confidence: mathpixResponse.confidence,
          questions_count: parsedQuestions.length,
          saved_count: savedProblemIds.length,
        },
      })
      .eq('id', sourceFile.id);

    // 11. 결과 반환
    const result: OCRPipelineResult = {
      success: true,
      source_file_id: sourceFile.id,
      questions: parsedQuestions,
      total_questions: parsedQuestions.length,
      processing_time_ms: Date.now() - startTime,
      mathpix_request_id: mathpixResponse.request_id,
      errors: saveErrors.map(e => ({
        code: 'SAVE_ERROR',
        message: e.error,
        question_number: e.question_number,
      })),
      warnings,
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error('OCR pipeline error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * 파일 검증
 */
function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`;
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`;
  }

  return null;
}

/**
 * MIME 타입에서 파일 타입 추출
 */
function getFileType(mimeType: string): 'PDF' | 'IMG' | 'HWP' {
  if (mimeType === 'application/pdf') {
    return 'PDF';
  }
  if (mimeType.startsWith('image/')) {
    return 'IMG';
  }
  return 'HWP'; // 기본값
}

/**
 * 문제 데이터 생성
 */
function createProblemData(
  question: ParsedQuestion,
  context: {
    instituteId: string;
    createdBy: string;
    sourceFileId: string;
    sourceName: string | null;
    sourceYear: number | null;
    sourceMonth: number | null;
  }
) {
  const questionType = detectQuestionType(question);

  return {
    institute_id: context.instituteId,
    created_by: context.createdBy,
    source_file_id: context.sourceFileId,
    content_latex: question.content_latex,
    content_html: null, // 클라이언트에서 렌더링
    solution_latex: null, // 추후 입력
    solution_html: null,
    answer_json: createAnswerJson(question, questionType),
    images: question.image_urls,
    status: 'DRAFT',
    source_name: context.sourceName,
    source_year: context.sourceYear,
    source_month: context.sourceMonth,
    source_number: question.question_number,
    ai_analysis: {
      detected_type: questionType,
      confidence: question.confidence,
      has_choices: question.choices.length > 0,
      choice_count: question.choices.length,
    },
    tags: [],
  };
}

/**
 * answer_json 구조 생성
 */
function createAnswerJson(question: ParsedQuestion, questionType: string) {
  const base = {
    type: questionType,
    correct_answer: null, // 추후 입력
    points: 10, // 기본 배점
  };

  if (question.choices.length > 0) {
    return {
      ...base,
      choices: question.choices.map(c => ({
        label: c.label,
        content: c.content_latex,
      })),
    };
  }

  // 주관식
  if (questionType === 'short_answer') {
    return {
      ...base,
      acceptable_answers: [],
    };
  }

  // 서술형
  if (questionType === 'essay') {
    return {
      ...base,
      rubric: [],
      partial_criteria: [],
    };
  }

  return base;
}
