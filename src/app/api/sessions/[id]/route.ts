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
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ★ 인증 가드 — 세션은 학생 사적 정보. 외부 노출 차단.
  //   - STUDENT: 본인 세션만
  //   - ADMIN/TEACHER/TUTOR/ORG_ADMIN/super_admin: institute 격리 통과
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

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

  // ★ 권한 검증
  const sessionStudentId = (session as { student_id: string }).student_id;
  if (user.role === 'STUDENT') {
    if (sessionStudentId !== user.id) {
      return NextResponse.json({ error: 'Forbidden — 다른 학생 세션' }, { status: 403 });
    }
  } else {
    // 강사·관리자 — 학생의 institute 와 격리 비교
    const { data: stuRow } = await sb
      .from('users')
      .select('institute_id')
      .eq('id', sessionStudentId)
      .maybeSingle();
    try {
      assertInstituteAccess(scope, (stuRow as { institute_id?: string } | null)?.institute_id ?? null);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }
  }

  // 학생 정보 — users.name 컬럼 없음, full_name 만 사용
  const { data: student } = await sb
    .from('users')
    .select('id, full_name, email, grade, institute_id')
    .eq('id', (session as any).student_id)
    .maybeSingle();
  const studentName =
    ((student as any)?.full_name as string) ||
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
  // ★ 인증 가드 — 학생 본인은 삭제 X, 강사·관리자만 가능
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;
  const allowedRoles = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];
  if (!user.role || (!allowedRoles.includes(user.role) && !scope.isSuperAdmin)) {
    return NextResponse.json({ error: 'Forbidden — 삭제 권한 없음' }, { status: 403 });
  }

  const { id } = await params;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  // 세션 존재 + institute 격리 확인
  const { data: session } = await supabaseAdmin
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('student_id')
    .eq('id', id)
    .maybeSingle();
  if (!session) {
    return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
  }
  const { data: stuRow } = await supabaseAdmin
    .from('users')
    .select('institute_id')
    .eq('id', (session as { student_id: string }).student_id)
    .maybeSingle();
  try {
    assertInstituteAccess(scope, (stuRow as { institute_id?: string } | null)?.institute_id ?? null);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .schema('diagnostics' as never)
    .from('print_sessions')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
