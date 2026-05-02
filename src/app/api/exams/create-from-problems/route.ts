// ============================================================================
// POST /api/exams/create-from-problems
//
// 시험지 출제 페이지(/dashboard/exam-create)에서 선택한 문항들로 시험지 생성.
// 흐름: exams INSERT + exam_problems INSERT.
// PR #32 generate-recommended-session 패턴 동일 (자산화 안전 가드 준수).
//
// body: { title, grade?, subject?, problemIds: string[] }
// 반환: { examId }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireEditor } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

interface Body {
  title?: string;
  grade?: string | null;
  subject?: string | null;
  problemIds?: string[];
}

export async function POST(request: NextRequest) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = supabaseAdmin;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const title = (body.title || '').trim();
  const problemIds = Array.isArray(body.problemIds) ? body.problemIds.filter(Boolean) : [];

  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  if (problemIds.length === 0) return NextResponse.json({ error: 'problemIds required' }, { status: 400 });
  if (problemIds.length > 100) return NextResponse.json({ error: 'problemIds 최대 100개' }, { status: 400 });

  const teacherId = guard.user?.id || null;
  if (!teacherId) return NextResponse.json({ error: '강사 인증 필요' }, { status: 401 });

  // 강사 institute_id (exam INSERT 필수)
  const { data: teacherRow } = await sb
    .from('users')
    .select('institute_id')
    .eq('id', teacherId)
    .maybeSingle();
  const instituteId = (teacherRow as { institute_id?: string })?.institute_id;
  if (!instituteId) {
    return NextResponse.json({ error: '강사 institute_id가 없습니다' }, { status: 400 });
  }

  // ★ 자산화 안전 가드: exam INSERT 실패 시 즉시 abort.
  const { data: examData, error: examErr } = await sb
    .from('exams')
    .insert({
      institute_id: instituteId,
      created_by: teacherId,
      title,
      grade: body.grade || null,
      subject: body.subject || null,
      status: 'DRAFT',
    })
    .select()
    .single();
  if (examErr || !examData) {
    console.error('[exams/create-from-problems] exam INSERT 실패:', examErr?.message);
    return NextResponse.json(
      { error: '시험지 생성 실패', detail: examErr?.message },
      { status: 500 }
    );
  }
  const examId = (examData as { id: string }).id;

  // exam_problems INSERT (sequence_number 1..N)
  const examProblemRows = problemIds.map((pid, i) => ({
    exam_id: examId,
    problem_id: pid,
    sequence_number: i + 1,
  }));
  const { error: epErr } = await sb.from('exam_problems').insert(examProblemRows);
  if (epErr) {
    console.error('[exams/create-from-problems] exam_problems insert 실패:', epErr.message);
    // exam 자체는 살려둠 — 사용자가 cloud 페이지에서 수동 보정 가능
    return NextResponse.json(
      { examId, error: '문항 연결 일부 실패', detail: epErr.message },
      { status: 207 }
    );
  }

  console.log(
    `[exams/create-from-problems] ★ 시험지 생성: examId=${examId}, problems=${problemIds.length}, by=${teacherId.slice(0, 8)}`
  );

  return NextResponse.json({
    examId,
    problemCount: problemIds.length,
  });
}
