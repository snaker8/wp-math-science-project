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
    processInBackground(examId, problemIds, baseUrl).catch(err => {
      console.error('[batch-solutions] Background error:', err);
      const state = jobState.get(examId);
      if (state) state.isRunning = false;
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

// ★ 진행 상황 조회 — 메모리 상태 우선, 없으면 DB 상태
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  const state = jobState.get(examId);
  if (state) {
    return NextResponse.json({
      status: state.isRunning ? 'IN_PROGRESS' : 'COMPLETED',
      total: state.total,
      done: state.done,
      failed: state.failed,
      isRunning: state.isRunning,
    });
  }

  // 메모리에 작업 상태 없음 — DB 상태만 반환 (이전 실행 결과)
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }
  const { data: exam } = await supabaseAdmin
    .from('exams')
    .select('status')
    .eq('id', examId)
    .single();

  return NextResponse.json({
    status: exam?.status || 'unknown',
    total: 0,
    done: 0,
    isRunning: false,
  });
}

// ============================================================================
// 백그라운드 처리
// ============================================================================

async function processInBackground(examId: string, problemIds: string[], baseUrl: string) {
  console.log(`[batch-solutions] 시작: ${problemIds.length}문제`);
  const state = jobState.get(examId);
  if (!state) return;

  for (const problemId of problemIds) {
    try {
      const res = await fetch(`${baseUrl}/api/problems/${problemId}/generate-solution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        state.done++;
        console.log(`[batch-solutions] ✅ ${state.done + state.failed}/${state.total} — ${problemId}`);
      } else {
        state.failed++;
        console.log(`[batch-solutions] ❌ ${state.done + state.failed}/${state.total} — ${problemId}: ${res.status}`);
      }
    } catch (err) {
      state.failed++;
      console.log(`[batch-solutions] ❌ ${problemId}: ${err}`);
    }
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
