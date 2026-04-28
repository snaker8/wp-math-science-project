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
// ★ Vercel 508 Loop Detected·Anthropic 529 Overloaded 누적 완화 위해 5 → 3
const CHUNK_SIZE = 3;
// ★ sweep 모드(누락 재시도) 청크 크기 — 단건 직렬 처리로 누적 부하 회피
const SWEEP_CHUNK_SIZE = 1;

// 일시적 실패(5xx, 508, 529 등) 의 대기 시간(ms). 일반 실패도 짧게 대기 후 재시도.
const RETRY_WAIT_RETRIABLE = 10000;
const RETRY_WAIT_GENERIC = 5000;
function isRetriableStatus(status: number): boolean {
  return status === 508 || status === 429 || status === 503 || status === 529;
}

// ★ 200 OK 응답이라도 실제로 solution_latex 가 저장됐는지 확인.
//   AI 가 빈 finalAnswer / JSON 파싱 실패 등으로 endpoint 가 200 을 반환했지만
//   DB 에는 빈 해설이 들어가는 케이스를 fail 로 처리해 재시도 대상에 포함.
async function hasNonEmptySolution(problemId: string): Promise<boolean> {
  if (!supabaseAdmin) return true; // DB 확인 불가하면 200 신뢰
  try {
    const { data } = await supabaseAdmin
      .from('problems')
      .select('solution_latex')
      .eq('id', problemId)
      .maybeSingle();
    const sol = (data?.solution_latex || '').toString().trim();
    return sol.length >= 50;
  } catch {
    return true;
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
    // ★ 청크 연쇄용 커서. 없으면 0 (최초 호출 = 사용자가 버튼 클릭)
    const startIndex: number = typeof body.startIndex === 'number' ? body.startIndex : 0;
    // ★ sweep 모드 — 메인 루프 종료 후 누락 problems 재시도용. 단건 sequential, retry 강화.
    //   sweepMode 일 때는 sweep 을 추가로 트리거하지 않아 무한 루프 차단.
    const sweepMode: boolean = body.sweepMode === true;
    const isFirstCall = startIndex === 0;

    if (problemIds.length === 0) {
      return NextResponse.json({ error: 'No problem IDs provided' }, { status: 400 });
    }

    // ★ stale entries 청소
    cleanupStaleJobs();

    if (isFirstCall && !sweepMode) {
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
    const chunkSize = sweepMode ? SWEEP_CHUNK_SIZE : CHUNK_SIZE;
    const endIndex = Math.min(startIndex + chunkSize, problemIds.length);
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
    //   ★ sweepMode 면 sequential — chunkSize 가 1 이라 사실상 단건.
    const tryOneProblem = async (problemId: string) => {
      const tryOnce = async (): Promise<{ ok: boolean; status: number }> => {
        try {
          const res = await fetch(`${baseUrl}/api/problems/${problemId}/generate-solution`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          if (!res.ok) return { ok: false, status: res.status };
          // ★ 200 OK 라도 실제 DB 에 solution_latex 가 채워졌는지 확인.
          //   AI 가 빈 응답을 200 으로 반환한 케이스를 fail 로 분류해 재시도/누락 추적에 포함.
          const saved = await hasNonEmptySolution(problemId);
          return saved ? { ok: true, status: 200 } : { ok: false, status: 200 };
        } catch {
          return { ok: false, status: 0 };
        }
      };

      let result = await tryOnce();
      // ★ retry 정책 강화 — 모든 fail 에 대해 1회 더 시도 (이전엔 5xx 한정).
      //   timeout(0) / 4xx / 5xx 모두 포함. wait 시간만 status 로 차등.
      //   sweepMode 면 한 번 더 추가 (총 3회) — 누락 끝까지 끌어올리기.
      const maxAttempts = sweepMode ? 3 : 2;
      let attempt = 1;
      while (!result.ok && attempt < maxAttempts) {
        const waitMs = isRetriableStatus(result.status) ? RETRY_WAIT_RETRIABLE : RETRY_WAIT_GENERIC;
        console.log(`[batch-solutions${sweepMode ? '/sweep' : ''}] ⏳ ${problemId.slice(0, 8)}: ${result.status} → ${waitMs}ms 후 재시도 (${attempt + 1}/${maxAttempts})`);
        await new Promise((r) => setTimeout(r, waitMs + Math.random() * 2000));
        result = await tryOnce();
        attempt++;
      }

      if (result.ok) {
        if (state) state.done++;
        console.log(`[batch-solutions${sweepMode ? '/sweep' : ''}] ✅ ${problemId.slice(0, 8)} (${startIndex}-${endIndex}/${problemIds.length})`);
      } else {
        if (state) state.failed++;
        console.log(`[batch-solutions${sweepMode ? '/sweep' : ''}] ❌ ${problemId.slice(0, 8)}: ${result.status} (after ${attempt} attempts)`);
      }
    };

    // ★ chain 신뢰성 강화 — 단건 처리 *전에* 다음 chain 을 미리 발사.
    //   기존엔 처리 후 chain 발사라 단건 generate-solution 이 timeout/지연되면
    //   batch-solutions 인스턴스도 함께 timeout → chain 못 띄우고 누락. 사고 반복.
    //   처리 전 발사로 timeout 격리: 자기 자신은 단건 처리 중 죽어도 다음 인스턴스는 이미 생성됨.
    const hasMore = endIndex < problemIds.length;
    if (hasMore) {
      fetch(`${baseUrl}/api/exams/${examId}/batch-solutions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemIds, startIndex: endIndex, sweepMode }),
        keepalive: true,
      }).catch((err) => console.error('[batch-solutions] chain fetch error:', err));
      // chain TCP 연결 시간 확보
      await new Promise((r) => setTimeout(r, 100));
    }

    if (sweepMode) {
      // sweep 은 sequential — 누적 부하 회피
      for (const pid of toProcess) await tryOneProblem(pid);
    } else {
      await Promise.all(toProcess.map(tryOneProblem));
    }

    // ★ 마지막 청크 + 메인 루프 → 누락 sweep 트리거 (sweep 모드면 종료)
    if (!hasMore) {
      if (!sweepMode) {
        try {
          const { data: leftover } = await supabaseAdmin
            .from('problems')
            .select('id, solution_latex, answer_json')
            .in('id', problemIds);
          // ★ 수동 업로드 해설(solution_user_edited)은 sweep 대상 제외.
          //    50자 미만이면 빈 해설로 간주 — generate-solution 이 200 만 던지고 빈 응답 박은 케이스 잡기.
          const missing = (leftover || [])
            .filter((p: any) => {
              const aj = (p.answer_json || {}) as Record<string, any>;
              if (aj.solution_user_edited === true) return false;
              const sol = (p.solution_latex || '').toString().trim();
              return sol.length < 50;
            })
            .map((p: any) => p.id as string);
          if (missing.length > 0) {
            console.log(`[batch-solutions] 메인 완료 → sweep 시작: 누락 ${missing.length}건`);
            // jobState 갱신 — sweep 도 진행률에 반영
            const cur = jobState.get(examId);
            if (cur) {
              cur.isRunning = true;
              cur.total = (cur.total || 0) + missing.length;
            }
            fetch(`${baseUrl}/api/exams/${examId}/batch-solutions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ problemIds: missing, sweepMode: true }),
              keepalive: true,
            }).catch((err) => console.error('[batch-solutions] sweep fetch error:', err));
            await new Promise((r) => setTimeout(r, 50));
            // 시험 상태는 sweep 끝난 후 COMPLETED — 여기선 IN_PROGRESS 유지
            return NextResponse.json({
              message: 'main-done-sweep-started',
              startIndex,
              endIndex,
              total: problemIds.length,
              chained: false,
              sweepCount: missing.length,
              done: state?.done ?? 0,
              failed: state?.failed ?? 0,
            });
          }
        } catch (e) {
          console.warn('[batch-solutions] sweep 조회 실패 (계속):', e);
        }
      }

      // sweep 도 끝났거나 누락 없음 → 상태 정리
      if (state) state.isRunning = false;
      await supabaseAdmin
        .from('exams')
        .update({ status: 'COMPLETED' })
        .eq('id', examId);
      console.log(`[batch-solutions${sweepMode ? '/sweep' : ''}] 전체 완료: done=${state?.done}, failed=${state?.failed}`);
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
