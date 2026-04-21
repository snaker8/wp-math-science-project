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

// 한 청크에서 병렬 처리할 해설 개수
const CHUNK_SIZE = 5;

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
    // ★ 청크 연쇄용 커서. 없으면 0 (최초 호출 = 사용자가 버튼 클릭)
    const startIndex: number = typeof body.startIndex === 'number' ? body.startIndex : 0;
    const isFirstCall = startIndex === 0;

    if (problemIds.length === 0) {
      return NextResponse.json({ error: 'No problem IDs provided' }, { status: 400 });
    }

    // ★ stale entries 청소
    cleanupStaleJobs();

    if (isFirstCall) {
      jobState.set(examId, {
        total: problemIds.length,
        done: 0,
        failed: 0,
        startedAt: Date.now(),
        isRunning: true,
      });
      // 시험 상태 IN_PROGRESS로 업데이트 (GET 폴링이 이걸 보고 진행률 계산)
      await supabaseAdmin
        .from('exams')
        .update({ status: 'IN_PROGRESS' })
        .eq('id', examId);
    }

    const state = jobState.get(examId);
    const endIndex = Math.min(startIndex + CHUNK_SIZE, problemIds.length);
    const chunk = problemIds.slice(startIndex, endIndex);
    const baseUrl = request.nextUrl.origin;

    // ★ 수동 업로드된 빠른답/해설만 스킵 (match-answers 모달로 PDF 올린 경우)
    //   편집 모달 수정은 플래그 안 찍으므로 재생성 대상임
    const { data: existingProblems } = await supabaseAdmin
      .from('problems')
      .select('id, answer_json')
      .in('id', chunk);
    const skipIds = new Set<string>();
    for (const p of existingProblems || []) {
      const aj = ((p as any).answer_json || {}) as Record<string, any>;
      if (aj.solution_user_edited === true) {
        skipIds.add((p as any).id);
        if (state) state.done++;
        console.log(`[batch-solutions] ⏭ skip ${(p as any).id.slice(0, 8)}: 수동 업로드 해설`);
      }
    }
    const toProcess = chunk.filter((id) => !skipIds.has(id));

    // 청크 병렬 처리 (수동 업로드 제외)
    await Promise.all(toProcess.map(async (problemId) => {
      try {
        const res = await fetch(`${baseUrl}/api/problems/${problemId}/generate-solution`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          if (state) state.done++;
          console.log(`[batch-solutions] ✅ ${problemId.slice(0, 8)} (${startIndex}-${endIndex}/${problemIds.length})`);
        } else {
          if (state) state.failed++;
          console.log(`[batch-solutions] ❌ ${problemId.slice(0, 8)}: ${res.status}`);
        }
      } catch (err) {
        if (state) state.failed++;
        console.log(`[batch-solutions] ❌ ${problemId.slice(0, 8)}: ${err}`);
      }
    }));

    // 다음 청크가 남았으면 fire-and-forget으로 자기 자신에게 POST → 독립 서버리스 호출 발사
    const hasMore = endIndex < problemIds.length;
    if (hasMore) {
      // ★ 주의: await 금지. fetch 호출만 발사하고 바로 응답 반환.
      //   Vercel edge가 이 fetch를 받아 새 서버리스 인스턴스를 띄우므로
      //   현재 함수가 종료돼도 다음 청크는 독립적으로 계속 진행됨.
      fetch(`${baseUrl}/api/exams/${examId}/batch-solutions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemIds, startIndex: endIndex }),
        // keepalive: true로 짧은 함수가 종료돼도 요청은 유지됨
        keepalive: true,
      }).catch((err) => console.error('[batch-solutions] chain fetch error:', err));

      // fetch가 TCP 연결까지 만들 시간을 살짝 줌 (50ms는 인스턴스 종료 전 request dispatch 보장)
      await new Promise((r) => setTimeout(r, 50));
    } else {
      // 마지막 청크 완료 → 상태 정리
      if (state) state.isRunning = false;
      await supabaseAdmin
        .from('exams')
        .update({ status: 'COMPLETED' })
        .eq('id', examId);
      console.log(`[batch-solutions] 전체 완료: done=${state?.done}, failed=${state?.failed}`);
    }

    return NextResponse.json({
      message: isFirstCall ? 'started' : 'chunk-done',
      startIndex,
      endIndex,
      total: problemIds.length,
      chained: hasMore,
      done: state?.done ?? 0,
      failed: state?.failed ?? 0,
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

// (이전 processInBackground는 청크 연쇄 방식으로 POST 핸들러에 인라인화되어 제거됨)
