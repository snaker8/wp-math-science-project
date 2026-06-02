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
import { requireAuthScope } from '@/lib/auth/guard';
import { assertStudentAccess } from '@/lib/security/institute-guard';

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
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

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

  // 세션 존재 확인 + Phase C-2 학생 함정 매칭용 student_id/exam_id snapshot
  const { data: session, error: sErr } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, student_id, exam_id')
    .eq('id', sessionId)
    .single();
  if (sErr || !session) {
    return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
  }
  const studentId = (session as { student_id?: string }).student_id || null;

  // ★ 학생 격리 — 다른 학원 학생 세션에 채점 결과 쓰기 차단
  if (studentId) {
    const access = await assertStudentAccess(sb, studentId, scope);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const examId = (session as { exam_id?: string }).exam_id || null;

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

  // ★ Phase C-2: 오답(is_correct=false) 문항의 problem_pitfalls 매칭 → student_pitfall_history INSERT
  //   학생별 함정 누적 → 학부모 대시보드 "이번 주 새 연결" + 약점 추적 base.
  //   본 응답 영향 X — try-catch로 격리, 실패해도 채점 결과 저장은 그대로.
  if (studentId) {
    try {
      const wrongProblemIds = rows
        .filter((r) => r.is_correct === false && r.problem_id)
        .map((r) => r.problem_id as string);

      if (wrongProblemIds.length > 0) {
        // 해당 문항들의 problem_pitfalls 일괄 조회
        const { data: pitfallRows } = await sb
          .from('problem_pitfalls')
          .select('problem_id, pitfall_code')
          .in('problem_id', wrongProblemIds);

        if (pitfallRows && pitfallRows.length > 0) {
          const historyRows = (pitfallRows as Array<{ problem_id: string; pitfall_code: string }>).map((p) => ({
            student_id: studentId,
            pitfall_code: p.pitfall_code,
            problem_id: p.problem_id,
            session_id: sessionId,
            exam_id: examId,
          }));
          const { error: histErr } = await sb
            .schema('diagnostics' as never)
            .from('student_pitfall_history')
            .insert(historyRows);
          if (histErr) {
            console.warn('[session-results] student_pitfall_history insert 실패:', histErr.message);
          } else {
            console.log(
              `[session-results] ★ 학생 함정 누적: student=${studentId.slice(0, 8)}, 오답 ${wrongProblemIds.length}건 → ${historyRows.length}개 함정 매칭`
            );
          }
        }
      }
    } catch (e) {
      console.warn('[session-results] pitfall history insert 예외:', e);
    }
  }

  return NextResponse.json({ saved: count ?? rows.length, errors });
}
