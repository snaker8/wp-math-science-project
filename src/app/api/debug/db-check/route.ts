// ============================================================================
// GET /api/debug/db-check - DB 상태 확인 (디버깅용)
// ============================================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({
      error: 'supabaseAdmin is null - check SUPABASE_SERVICE_ROLE_KEY',
      env: {
        hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      }
    });
  }

  try {
    // 1. exams 테이블 - 최소 컬럼만 조회
    const { data: exams, error: examsErr } = await supabaseAdmin
      .from('exams')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    // 2. exam_problems 테이블 - 전체 컬럼 조회
    const { data: examProblems, error: epErr } = await supabaseAdmin
      .from('exam_problems')
      .select('*')
      .limit(10);

    // 3. problems 테이블 카운트
    const { count: problemsCount, error: pErr } = await supabaseAdmin
      .from('problems')
      .select('id', { count: 'exact', head: true });

    // 4. classifications 테이블 카운트
    const { count: classCount, error: cErr } = await supabaseAdmin
      .from('classifications')
      .select('id', { count: 'exact', head: true });

    // 5. 첫 번째 시험이 있다면 해당 시험의 문제 조인 테스트
    // 5. 첫 번째 문제 샘플
    const { data: sampleProblem } = await supabaseAdmin
      .from('problems')
      .select('id, content_latex, source_name, status, created_at')
      .limit(1)
      .single();

    let joinTest = null;
    if (exams && exams.length > 0) {
      const firstExamId = exams[0].id;
      // exam_problems에서 해당 exam의 레코드 조회
      const { data: joinData, error: joinErr } = await supabaseAdmin
        .from('exam_problems')
        .select('*')
        .eq('exam_id', firstExamId)
        .limit(5);

      joinTest = {
        examId: firstExamId,
        examTitle: exams[0].title,
        data: joinData,
        error: joinErr?.message || null,
      };
    }

    return NextResponse.json({
      status: 'ok',
      tables: {
        exams: {
          count: exams?.length || 0,
          error: examsErr?.message || null,
          data: exams,
        },
        exam_problems: {
          count: examProblems?.length || 0,
          error: epErr?.message || null,
          data: examProblems,
        },
        problems: {
          count: problemsCount,
          error: pErr?.message || null,
        },
        classifications: {
          count: classCount,
          error: cErr?.message || null,
        },
      },
      joinTest,
      sampleProblem,
    });
  } catch (err) {
    return NextResponse.json({
      error: 'Unexpected error',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
