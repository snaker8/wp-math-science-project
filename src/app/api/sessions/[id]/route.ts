// ============================================================================
// GET /api/sessions/[id]
//   세션 상세 조회 — 학생·시험지·문항(스냅샷)·결과 포함.
//   모바일 채점 페이지(/grade/[session_id])가 이걸 호출해 UI 렌더.
//
// DELETE /api/sessions/[id]
//   세션 삭제 (session_problems/results 는 cascade).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  // 세션 기본
  const { data: session, error: sErr } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('*')
    .eq('id', id)
    .single();

  if (sErr || !session) {
    return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
  }

  // 학생 정보
  const { data: student } = await sb
    .from('users')
    .select('id, full_name, name, email, grade, class_name, className, institute_id')
    .eq('id', (session as any).student_id)
    .maybeSingle();
  const studentName =
    ((student as any)?.full_name as string) ||
    ((student as any)?.name as string) ||
    ((student as any)?.email as string) ||
    '(이름 없음)';

  // 시험지 정보
  const { data: exam } = await sb
    .from('exams')
    .select('id, title, subject, grade, status, created_at')
    .eq('id', (session as any).exam_id)
    .maybeSingle();

  // 세션 문항 (스냅샷) + 문제 본문
  const { data: sp } = await sb
    .schema('diagnostics' as never)
    .from('session_problems')
    .select('*')
    .eq('session_id', id)
    .order('sequence_number', { ascending: true });

  const problemIds = ((sp || []) as any[]).map(r => r.problem_id as string);
  const { data: problems } = problemIds.length > 0
    ? await sb
        .from('problems')
        .select('id, content_latex, answer_json, solution_latex, images')
        .in('id', problemIds)
    : { data: [] as any[] };

  const problemMap = new Map<string, any>();
  for (const p of (problems || []) as any[]) problemMap.set(p.id as string, p);

  // 채점 결과
  const { data: results } = await sb
    .schema('diagnostics' as never)
    .from('session_results')
    .select('*')
    .eq('session_id', id)
    .order('sequence_number', { ascending: true });

  const resultMap = new Map<number, any>();
  for (const r of (results || []) as any[]) resultMap.set(r.sequence_number as number, r);

  // 문항+결과 병합
  const items = ((sp || []) as any[]).map(row => {
    const p = problemMap.get(row.problem_id as string);
    const r = resultMap.get(row.sequence_number as number);
    return {
      sequence_number: row.sequence_number,
      problem_id: row.problem_id,
      type_code: row.type_code_snapshot,
      difficulty: row.difficulty_snapshot,
      content: p?.content_latex || '',
      solution: p?.solution_latex || '',
      answer_json: p?.answer_json || null,
      images: p?.images || [],
      result: r ? {
        is_correct: r.is_correct,
        error_cause: r.error_cause,
        teacher_note: r.teacher_note,
        graded_at: r.graded_at,
      } : null,
    };
  });

  return NextResponse.json({
    session: {
      id: (session as any).id,
      student_id: (session as any).student_id,
      student_name: studentName,
      exam_id: (session as any).exam_id,
      exam_title: (exam as any)?.title || '',
      round_number: (session as any).round_number,
      session_type: (session as any).session_type,
      issued_at: (session as any).issued_at,
      started_at: (session as any).started_at,
      completed_at: (session as any).completed_at,
      teacher_note: (session as any).teacher_note,
    },
    problems_total: items.length,
    problems_graded: (results || []).length,
    items,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const { error } = await supabaseAdmin
    .schema('diagnostics' as never)
    .from('print_sessions')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
