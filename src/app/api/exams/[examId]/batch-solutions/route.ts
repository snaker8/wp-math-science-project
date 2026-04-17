// ============================================================================
// 일괄 해설 생성 API (백그라운드)
// POST /api/exams/[examId]/batch-solutions
// - 문제 ID 목록을 받아 서버 사이드에서 순차 생성
// - 클라이언트에 즉시 응답 → 백그라운드에서 계속 처리
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const maxDuration = 300; // 5분 타임아웃

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const problemIds: string[] = body.problemIds || [];

    if (problemIds.length === 0) {
      return NextResponse.json({ error: 'No problem IDs provided' }, { status: 400 });
    }

    // 시험 상태를 IN_PROGRESS로 업데이트 (해설 생성 중)
    await supabaseAdmin
      .from('exams')
      .update({ status: 'IN_PROGRESS' })
      .eq('id', examId);

    // ★ 백그라운드에서 처리 시작 (응답은 즉시 반환)
    const baseUrl = request.nextUrl.origin;
    processInBackground(examId, problemIds, baseUrl).catch(err => {
      console.error('[batch-solutions] Background error:', err);
    });

    return NextResponse.json({
      message: 'started',
      total: problemIds.length,
    });

  } catch (err) {
    console.error('[batch-solutions] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ★ 진행 상황 조회
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { data: exam } = await supabaseAdmin
    .from('exams')
    .select('status')
    .eq('id', examId)
    .single();

  // 해설 미완성 문제 수 카운트
  const { data: problems } = await supabaseAdmin
    .from('exam_problems')
    .select('problem_id, problems!inner(solution_latex)')
    .eq('exam_id', examId);

  const total = problems?.length || 0;
  const done = problems?.filter((p: any) =>
    p.problems?.solution_latex && p.problems.solution_latex.trim().length > 30
  ).length || 0;

  return NextResponse.json({
    status: exam?.status || 'unknown',
    total,
    done,
    isRunning: exam?.status === 'IN_PROGRESS',
  });
}

// ============================================================================
// 백그라운드 처리 함수
// ============================================================================

async function processInBackground(examId: string, problemIds: string[], baseUrl: string) {
  console.log(`[batch-solutions] Starting background generation for ${problemIds.length} problems`);

  let success = 0;
  let failed = 0;

  for (const problemId of problemIds) {
    try {
      // 개별 해설 생성 API 호출
      const res = await fetch(`${baseUrl}/api/problems/${problemId}/generate-solution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        success++;
        console.log(`[batch-solutions] ✅ ${problemId} (${success + failed}/${problemIds.length})`);
      } else {
        failed++;
        console.log(`[batch-solutions] ❌ ${problemId}: ${res.status}`);
      }
    } catch (err) {
      failed++;
      console.log(`[batch-solutions] ❌ ${problemId}: ${err}`);
    }
  }

  // 완료 후 시험 상태 복원
  if (supabaseAdmin) {
    await supabaseAdmin
      .from('exams')
      .update({ status: 'COMPLETED' })
      .eq('id', examId);
  }

  console.log(`[batch-solutions] Done: ${success} success, ${failed} failed out of ${problemIds.length}`);
}
