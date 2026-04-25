// ============================================================================
// POST /api/session-results
//   세션 문항 채점 결과 저장 (bulk upsert).
//   같은 (session_id, sequence_number) 가 이미 있으면 덮어씀.
//
// body:
//   {
//     session_id: string (uuid),
//     results: [
//       {
//         sequence_number: number,
//         problem_id?: string (uuid, 없으면 session_problems 에서 조회),
//         is_correct: boolean,
//         error_cause?: '개념'|'유형'|'계산'|'문장제'|'시간',
//         teacher_note?: string
//       },
//       ...
//     ]
//   }
//
// 반환:
//   { saved: number, errors: string[] }
//
// ★ 트리거 sync_print_session_progress 가 started_at/completed_at 자동 갱신.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const VALID_ERROR_CAUSES = new Set(['개념', '유형', '계산', '문장제', '시간']);

interface ResultEntry {
  sequence_number?: number;
  problem_id?: string;
  is_correct?: boolean;
  error_cause?: string | null;
  teacher_note?: string | null;
}

interface SaveBody {
  session_id?: string;
  results?: ResultEntry[];
}

export async function POST(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const sessionId = body.session_id;
  const rawResults = Array.isArray(body.results) ? body.results : [];

  if (!sessionId) return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  if (rawResults.length === 0) return NextResponse.json({ error: 'results 배열 필요' }, { status: 400 });

  // 세션 존재 확인
  const { data: session, error: sErr } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id')
    .eq('id', sessionId)
    .single();
  if (sErr || !session) {
    return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
  }

  // session_problems 로부터 sequence_number → problem_id 매핑 (problem_id 미지정 시 보조)
  const { data: sp } = await sb
    .schema('diagnostics' as never)
    .from('session_problems')
    .select('sequence_number, problem_id')
    .eq('session_id', sessionId);
  const seqToProblem = new Map<number, string>();
  for (const r of (sp || []) as any[]) {
    seqToProblem.set(r.sequence_number as number, r.problem_id as string);
  }

  // 검증 + 정규화
  const errors: string[] = [];
  const rows: Array<Record<string, unknown>> = [];
  for (const r of rawResults) {
    const seq = Number(r.sequence_number);
    if (!Number.isInteger(seq) || seq <= 0) {
      errors.push(`잘못된 sequence_number: ${r.sequence_number}`);
      continue;
    }
    if (typeof r.is_correct !== 'boolean') {
      errors.push(`seq=${seq}: is_correct 누락 또는 타입 오류`);
      continue;
    }
    const problemId = r.problem_id || seqToProblem.get(seq);
    if (!problemId) {
      errors.push(`seq=${seq}: problem_id 를 찾을 수 없음 (session_problems 누락?)`);
      continue;
    }
    let errorCause: string | null = null;
    if (r.error_cause != null && r.error_cause !== '') {
      if (!VALID_ERROR_CAUSES.has(r.error_cause as string)) {
        errors.push(`seq=${seq}: 잘못된 error_cause="${r.error_cause}"`);
        continue;
      }
      errorCause = r.error_cause as string;
    }

    rows.push({
      session_id: sessionId,
      problem_id: problemId,
      sequence_number: seq,
      is_correct: r.is_correct,
      error_cause: errorCause,
      teacher_note: r.teacher_note ?? null,
      graded_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ saved: 0, errors }, { status: errors.length > 0 ? 400 : 200 });
  }

  // upsert — (session_id, sequence_number) UNIQUE 에 onConflict
  const { error: upErr, count } = await sb
    .schema('diagnostics' as never)
    .from('session_results')
    .upsert(rows, { onConflict: 'session_id,sequence_number', count: 'exact' });

  if (upErr) {
    console.error('[session-results] upsert error:', upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ saved: count ?? rows.length, errors });
}
