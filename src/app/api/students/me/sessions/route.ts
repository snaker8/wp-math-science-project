// ============================================================================
// GET /api/students/me/sessions
//   인증된 학생 본인의 진단평가 세션 목록 (BS/DD/PT/SC) + 채점 결과 요약.
//   학생 대시보드·시험 목록 페이지에서 호출.
//
// 응답:
//   { sessions: [{
//       id, exam_id, exam_title, round_number, session_type,
//       issued_at, started_at, completed_at,
//       problems_total, problems_graded, correct_cnt, score_pct,
//     }] }
//
// 권한: STUDENT 본인만. 그 외 role 은 자기 세션 조회 의미 없음.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(parseInt(sp.get('limit') || '50') || 50, 1), 200);
  const status = sp.get('status') || undefined;

  // 본인 세션만
  let query = sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, student_id, exam_id, round_number, session_type, issued_at, started_at, completed_at')
    .eq('student_id', user.id)
    .order('issued_at', { ascending: false })
    .limit(limit);

  if (status === 'pending') query = query.is('completed_at', null);
  if (status === 'done') query = query.not('completed_at', 'is', null);

  const { data: psRows, error: psErr } = await query;
  if (psErr) {
    console.error('[students/me/sessions] print_sessions error:', psErr.message);
    return NextResponse.json({ error: psErr.message }, { status: 500 });
  }

  const sessionIds = ((psRows || []) as Array<{ id: string }>).map((r) => r.id);
  if (sessionIds.length === 0) {
    return NextResponse.json({ sessions: [] });
  }

  // 집계 + 시험지 제목 일괄 조회
  const [{ data: spRows }, { data: srRows }, { data: examsData }] = await Promise.all([
    sb.schema('diagnostics' as never).from('session_problems').select('session_id').in('session_id', sessionIds),
    sb.schema('diagnostics' as never).from('session_results').select('session_id, is_correct').in('session_id', sessionIds),
    sb.from('exams').select('id, title').in('id', Array.from(new Set(((psRows || []) as Array<{ exam_id: string }>).map((r) => r.exam_id)))),
  ]);

  const totalsBySession = new Map<string, number>();
  for (const r of (spRows || []) as Array<{ session_id: string }>) {
    totalsBySession.set(r.session_id, (totalsBySession.get(r.session_id) || 0) + 1);
  }
  const gradedBySession = new Map<string, number>();
  const correctBySession = new Map<string, number>();
  for (const r of (srRows || []) as Array<{ session_id: string; is_correct: boolean }>) {
    gradedBySession.set(r.session_id, (gradedBySession.get(r.session_id) || 0) + 1);
    if (r.is_correct) correctBySession.set(r.session_id, (correctBySession.get(r.session_id) || 0) + 1);
  }
  const examMap = new Map<string, string>();
  for (const e of (examsData || []) as Array<{ id: string; title?: string }>) {
    examMap.set(e.id, e.title || '');
  }

  const sessions = ((psRows || []) as Array<Record<string, unknown>>).map((r) => {
    const sid = r.id as string;
    const total = totalsBySession.get(sid) || 0;
    const graded = gradedBySession.get(sid) || 0;
    const correct = correctBySession.get(sid) || 0;
    return {
      id: sid,
      exam_id: r.exam_id as string,
      exam_title: examMap.get(r.exam_id as string) || '',
      round_number: r.round_number as number,
      session_type: r.session_type as string,
      issued_at: r.issued_at as string,
      started_at: (r.started_at as string) || null,
      completed_at: (r.completed_at as string) || null,
      problems_total: total,
      problems_graded: graded,
      correct_cnt: correct,
      score_pct: graded > 0 ? Math.round((correct / graded) * 1000) / 10 : null,
    };
  });

  return NextResponse.json({ sessions });
}
