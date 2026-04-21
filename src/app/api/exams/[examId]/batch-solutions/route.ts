// ============================================================================
// 일괄 해설 생성 API (백그라운드) — 실제 진행 상황 추적
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const maxDuration = 300;

// ★ 서버 메모리에 진행 상태 저장 (examId별)
const jobState = new Map<string, {
  total: number;
  done: number;
  failed: number;
  startedAt: number;
  isRunning: boolean;
}>();

// ★ 메모리 누수 방지: 10분 이상 된 완료 작업은 접근 시 자동 청소
const STALE_TTL_MS = 10 * 60 * 1000;
function cleanupStaleJobs() {
  const now = Date.now();
  for (const [id, s] of jobState.entries()) {
    if (!s.isRunning && now - s.startedAt > STALE_TTL_MS) {
      jobState.delete(id);
    }
  }
}

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

    // ★ stale entries 청소
    cleanupStaleJobs();

    // ★ 메모리에 새 작업 상태 초기화 (기존 해설 여부와 무관)
    jobState.set(examId, {
      total: problemIds.length,
      done: 0,
      failed: 0,
      startedAt: Date.now(),
      isRunning: true,
    });

    // 시험 상태 IN_PROGRESS로 업데이트
    await supabaseAdmin
      .from('exams')
      .update({ status: 'IN_PROGRESS' })
      .eq('id', examId);

    const baseUrl = request.nextUrl.origin;
    // ★ Vercel 서버리스: fire-and-forget 금지 (함수 종료 시 중단됨)
    //   await로 동기 처리 — maxDuration=300초 한도 내에서 완료
    try {
      await processInBackground(examId, problemIds, baseUrl);
    } catch (err) {
      console.error('[batch-solutions] Process error:', err);
      const state = jobState.get(examId);
      if (state) state.isRunning = false;
    }

    const finalState = jobState.get(examId);
    return NextResponse.json({
      message: 'completed',
      total: problemIds.length,
      done: finalState?.done ?? 0,
      failed: finalState?.failed ?? 0,
    });

  } catch (err) {
    console.error('[batch-solutions] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ★ 진행 상황 조회 — 메모리 우선, 없으면 DB + 실제 해설 완성 카운트로 추정
//   (Next.js dev 재시작/Vercel serverless에서도 진행률 보이도록 DB 기반 fallback)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  // ★ stale 청소
  cleanupStaleJobs();

  // 1) 메모리에 작업 상태 있으면 가장 정확 — 그대로 반환
  const state = jobState.get(examId);
  if (state) {
    return NextResponse.json({
      status: state.isRunning ? 'IN_PROGRESS' : 'COMPLETED',
      total: state.total,
      done: state.done,
      failed: state.failed,
      isRunning: state.isRunning,
      source: 'memory',
    });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  // 2) DB에서 시험지 상태 + 업데이트 시각(배치 시작 추정점)
  const { data: exam } = await supabaseAdmin
    .from('exams')
    .select('status, updated_at')
    .eq('id', examId)
    .single();

  const { data: eps } = await supabaseAdmin
    .from('exam_problems')
    .select('problem_id')
    .eq('exam_id', examId);
  const problemIds = (eps || []).map((r: { problem_id: string }) => r.problem_id);
  const total = problemIds.length;

  const examStatus = exam?.status || 'unknown';
  const isRunning = examStatus === 'IN_PROGRESS';
  const batchStartedAt = exam?.updated_at as string | undefined;

  // 3) 진행률 계산
  //    - IN_PROGRESS 일 땐 "배치 시작 이후에 업데이트된 문제"만 done 으로 카운트
  //      (기존에 해설 있던 문제가 시작 시점부터 done 으로 세어지는 문제 방지)
  //    - 그 외엔 단순히 해설 보유 문제 수
  let done = 0;
  let lastProblemUpdate: string | null = null;
  if (total > 0) {
    if (isRunning && batchStartedAt) {
      const { data: rows } = await supabaseAdmin
        .from('problems')
        .select('id, updated_at, solution_latex')
        .in('id', problemIds)
        .gt('updated_at', batchStartedAt);
      for (const row of rows || []) {
        const r = row as { solution_latex: string | null; updated_at: string };
        if (r.solution_latex && r.solution_latex.trim().length > 30) done++;
        if (!lastProblemUpdate || r.updated_at > lastProblemUpdate) lastProblemUpdate = r.updated_at;
      }
    } else {
      const { data: done_rows } = await supabaseAdmin
        .from('problems')
        .select('id, solution_latex')
        .in('id', problemIds);
      for (const row of done_rows || []) {
        const sol = (row as { solution_latex: string | null }).solution_latex;
        if (sol && sol.trim().length > 30) done++;
      }
    }
  }

  // 4) 멈춘 배치 자동 복구 — IN_PROGRESS 상태인데 2분 이상 문제 업데이트 없으면 고아 작업으로 간주
  //    (dev 서버 재시작 등으로 백그라운드 루프가 죽어 status 만 고착되는 케이스)
  let finalStatus = examStatus;
  let finalRunning = isRunning;
  if (isRunning && lastProblemUpdate) {
    const sinceMs = Date.now() - new Date(lastProblemUpdate).getTime();
    if (sinceMs > 120_000) {
      await supabaseAdmin.from('exams').update({ status: 'COMPLETED' }).eq('id', examId);
      finalStatus = 'COMPLETED';
      finalRunning = false;
    }
  } else if (isRunning && !lastProblemUpdate && batchStartedAt) {
    // 배치 시작 후 한 건도 업데이트 없는데 2분 경과 — 마찬가지로 죽은 작업
    const sinceMs = Date.now() - new Date(batchStartedAt).getTime();
    if (sinceMs > 120_000) {
      await supabaseAdmin.from('exams').update({ status: 'COMPLETED' }).eq('id', examId);
      finalStatus = 'COMPLETED';
      finalRunning = false;
    }
  }

  return NextResponse.json({
    status: finalStatus,
    total,
    done,
    failed: 0,
    isRunning: finalRunning,
    source: finalRunning ? 'db-inferred' : 'db',
    batchStartedAt,
    lastProblemUpdate,
  });
}

// ============================================================================
// 백그라운드 처리
// ============================================================================

async function processInBackground(examId: string, problemIds: string[], baseUrl: string) {
  console.log(`[batch-solutions] 시작: ${problemIds.length}문제 (동시 5개)`);
  const state = jobState.get(examId);
  if (!state) return;

  // ★ 동시 실행 개수 제한 (OpenAI rate limit + Vercel 메모리 고려)
  const CONCURRENCY = 5;
  const processOne = async (problemId: string) => {
    try {
      const res = await fetch(`${baseUrl}/api/problems/${problemId}/generate-solution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        state.done++;
        console.log(`[batch-solutions] ✅ ${state.done + state.failed}/${state.total} — ${problemId.slice(0, 8)}`);
      } else {
        state.failed++;
        console.log(`[batch-solutions] ❌ ${state.done + state.failed}/${state.total} — ${problemId.slice(0, 8)}: ${res.status}`);
      }
    } catch (err) {
      state.failed++;
      console.log(`[batch-solutions] ❌ ${problemId.slice(0, 8)}: ${err}`);
    }
  };

  // 청크 단위 병렬 처리
  for (let i = 0; i < problemIds.length; i += CONCURRENCY) {
    const chunk = problemIds.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(processOne));
  }

  state.isRunning = false;

  // 시험 상태 복원
  if (supabaseAdmin) {
    await supabaseAdmin
      .from('exams')
      .update({ status: 'COMPLETED' })
      .eq('id', examId);
  }

  console.log(`[batch-solutions] 완료: ${state.done} 성공 / ${state.failed} 실패 / 총 ${state.total}`);

  // ★ 10분 후 메모리에서 제거 (다음 작업 위해)
  setTimeout(() => {
    const current = jobState.get(examId);
    if (current && !current.isRunning) jobState.delete(examId);
  }, 600000);
}
