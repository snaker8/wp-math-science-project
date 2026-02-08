// ============================================================================
// Zero-Wrong Loop API - 쌍둥이 문제 생성 및 클리닉 시험지 PDF
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  generateTwinProblem,
  generateTwinProblems,
  generateTwinWithLLM,
} from '@/lib/workflow/twin-generator';
import {
  createClinicExamData,
  generateClinicPdf,
  createClinicExam,
} from '@/lib/workflow/clinic-exam';
import type { TwinProblem } from '@/types/workflow';

/**
 * POST /api/workflow/twin
 * 쌍둥이 문제 생성
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      problemIds,
      studentId,
      studentName,
      options = {},
      useLLM = false,
      generateClinic = false,
      clinicOptions = {},
    } = body as {
      problemIds: string[];
      studentId: string;
      studentName?: string;
      options?: {
        difficultyAdjustment?: -1 | 0 | 1;
        preserveStructure?: boolean;
        variationCount?: number;
      };
      useLLM?: boolean;
      generateClinic?: boolean;
      clinicOptions?: {
        title?: string;
        includeOriginals?: boolean;
        includeSolutions?: boolean;
      };
    };

    if (!problemIds || problemIds.length === 0) {
      return NextResponse.json(
        { error: 'problemIds is required' },
        { status: 400 }
      );
    }

    if (!studentId) {
      return NextResponse.json(
        { error: 'studentId is required' },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    // 원본 문제 조회
    let problems: Array<{
      id: string;
      contentLatex: string;
      contentHtml?: string;
      solutionLatex?: string;
      typeCode: string;
      typeName: string;
      answer?: string;
    }> = [];

    if (supabase) {
      const { data: problemsData, error } = await supabase
        .from('problems')
        .select(`
          id,
          content_latex,
          content_html,
          solution_latex,
          answer_json,
          classifications (
            type_code,
            problem_types (
              type_name
            )
          )
        `)
        .in('id', problemIds);

      if (error) {
        console.error('Error fetching problems:', error);
      } else if (problemsData) {
        
        problems = problemsData.map((p: any) => ({
          id: p.id,
          contentLatex: p.content_latex,
          contentHtml: p.content_html,
          solutionLatex: p.solution_latex,
          typeCode: p.classifications?.[0]?.type_code || 'UNKNOWN',
          typeName: p.classifications?.[0]?.problem_types?.type_name || '알 수 없는 유형',
          answer: p.answer_json?.correct_answer,
        }));
      }
    }

    // Supabase 미설정 또는 문제 조회 실패 시 Mock 데이터 사용
    if (problems.length === 0) {
      problems = problemIds.map((id, index) => ({
        id,
        contentLatex: `이차방정식 $x^2 - ${5 + index}x + ${6 + index} = 0$의 두 근을 구하시오.`,
        solutionLatex: `인수분해하면 $(x-${2 + index})(x-${3 + index}) = 0$\n따라서 $x = ${2 + index}$ 또는 $x = ${3 + index}$`,
        typeCode: `MA1-EQU-00${index + 1}`,
        typeName: '이차방정식의 풀이',
        answer: `x = ${2 + index} 또는 x = ${3 + index}`,
      }));
    }

    // 쌍둥이 문제 생성
    let twinProblems: TwinProblem[] = [];

    if (useLLM) {
      // GPT-4o 기반 생성 (병렬 처리)
      const twinPromises = problems.map((problem) =>
        generateTwinWithLLM(problem, studentId, options)
      );
      twinProblems = await Promise.all(twinPromises);
    } else {
      // 규칙 기반 생성
      twinProblems = generateTwinProblems(problems, studentId, options);
    }

    // 클리닉 시험지 생성 (선택적)
    let clinicExam = null;
    let pdfUrl = null;

    if (generateClinic) {
      const examData = createClinicExamData(
        studentId,
        studentName || '학생',
        problems,
        twinProblems,
        clinicOptions
      );

      const { pdfUrl: generatedPdfUrl } = await generateClinicPdf(examData);
      pdfUrl = generatedPdfUrl;

      clinicExam = createClinicExam(examData, pdfUrl);

      // DB에 저장 (선택적)
      if (supabase) {
        // clinic_exams 테이블이 있다면 저장
        // await supabase.from('clinic_exams').insert(clinicExam);
      }
    }

    return NextResponse.json({
      success: true,
      twinProblems,
      twinCount: twinProblems.length,
      clinicExam,
      pdfUrl,
      message: `${twinProblems.length}개의 유사 문제가 생성되었습니다.`,
    });
  } catch (error) {
    console.error('[Twin API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate twin problems' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workflow/twin?studentId=xxx
 * 학생의 클리닉 시험지 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const studentId = searchParams.get('studentId');

    if (!studentId) {
      return NextResponse.json(
        { error: 'studentId is required' },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();

    if (!supabase) {
      // Mock 데이터 반환
      return NextResponse.json({
        clinicExams: [
          {
            id: 'mock-clinic-1',
            studentId,
            title: '클리닉 시험지 #1',
            wrongProblemIds: ['prob-1', 'prob-2'],
            twinProblemIds: ['twin-1', 'twin-2'],
            status: 'GENERATED',
            createdAt: new Date().toISOString(),
          },
        ],
      });
    }

    // clinic_exams 테이블이 있다면 조회
    // const { data, error } = await supabase
    //   .from('clinic_exams')
    //   .select('*')
    //   .eq('student_id', studentId)
    //   .order('created_at', { ascending: false });

    return NextResponse.json({
      clinicExams: [],
    });
  } catch (error) {
    console.error('[Twin API] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clinic exams' },
      { status: 500 }
    );
  }
}
