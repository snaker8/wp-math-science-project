// ============================================================================
// POST /api/students/[studentId]/generate-recommended-session
//
// 추천 문항으로 맞춤 학습지(exam) + 채점 세션(print_sessions) 자동 생성.
// 카파시 학습 무대의 actionable end — 강사가 클릭 한 번으로 학습지 발급.
//
// body: { problemIds: string[], label?: string }
// 반환: { sessionId, examId, sessionUrl }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertStudentAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

const EDITOR_ROLES = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];

interface Body {
  problemIds?: string[];
  label?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;
  if (!scope.isSuperAdmin && !EDITOR_ROLES.includes(scope.role || '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { studentId } = await params;
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = supabaseAdmin;

  // ★ 학생 격리 — 다른 학원 학생에게 세션 쓰기 차단
  const access = await assertStudentAccess(sb, studentId, scope);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const problemIds = Array.isArray(body.problemIds) ? body.problemIds.filter(Boolean) : [];
  if (problemIds.length === 0) {
    return NextResponse.json({ error: 'problemIds required' }, { status: 400 });
  }
  if (problemIds.length > 50) {
    return NextResponse.json({ error: 'problemIds 최대 50개' }, { status: 400 });
  }

  const teacherId = user?.id || null;
  if (!teacherId) {
    return NextResponse.json({ error: '강사 인증 필요' }, { status: 401 });
  }

  // 강사 institute_id 조회 (exam INSERT 필수)
  const { data: teacherRow } = await sb
    .from('users')
    .select('institute_id')
    .eq('id', teacherId)
    .maybeSingle();
  const instituteId = (teacherRow as { institute_id?: string })?.institute_id;
  if (!instituteId) {
    return NextResponse.json({ error: '강사 institute_id가 없습니다' }, { status: 400 });
  }

  // 학생 정보 (title 빌드용)
  const { data: studentRow } = await sb
    .from('users')
    .select('name, grade')
    .eq('id', studentId)
    .maybeSingle();
  const studentName = (studentRow as { name?: string })?.name || '학생';
  const studentGrade = (studentRow as { grade?: string })?.grade || null;

  const dateStr = new Date().toLocaleDateString('ko-KR', {
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
  });
  const examTitle = body.label || `[맞춤] ${studentName} - ${dateStr}`;

  // ★ 자산화 안전 가드: exam INSERT 실패 시 즉시 abort. 후속 단계 강행 X.
  const { data: examData, error: examErr } = await sb
    .from('exams')
    .insert({
      institute_id: instituteId,
      created_by: teacherId,
      title: examTitle,
      grade: studentGrade,
      status: 'DRAFT',
    })
    .select()
    .single();
  if (examErr || !examData) {
    console.error('[generate-recommended-session] exam INSERT 실패:', examErr?.message);
    return NextResponse.json(
      { error: '학습지 생성 실패', detail: examErr?.message },
      { status: 500 }
    );
  }
  const examId = (examData as { id: string }).id;

  // exam_problems INSERT
  const examProblemRows = problemIds.map((pid, i) => ({
    exam_id: examId,
    problem_id: pid,
    sequence_number: i + 1,
  }));
  const { error: epErr } = await sb.from('exam_problems').insert(examProblemRows);
  if (epErr) {
    console.error('[generate-recommended-session] exam_problems insert 실패:', epErr.message);
    // exam 자체는 살려둠 — 사용자가 수동 보정 가능
  }

  // print_sessions INSERT (이미 같은 student×exam×round 있으면 충돌 — 새 round 사용)
  const { data: sessionData, error: psErr } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .insert({
      student_id: studentId,
      exam_id: examId,
      round_number: 1,
      session_type: 'PT', // 선수 추적/맞춤 처방 — PT 활용
      issued_by: teacherId,
      teacher_note: body.label || '카파시 추천 학습지',
    })
    .select()
    .single();
  if (psErr || !sessionData) {
    console.error('[generate-recommended-session] print_sessions insert 실패:', psErr?.message);
    return NextResponse.json(
      { error: '채점 세션 생성 실패', detail: psErr?.message, examId },
      { status: 500 }
    );
  }
  const sessionId = (sessionData as { id: string }).id;

  // session_problems INSERT (snapshot — type_code/difficulty)
  const { data: clsData } = await sb
    .from('classifications')
    .select('problem_id, type_code, difficulty')
    .in('problem_id', problemIds);
  const clsMap = new Map<string, { type_code: string; difficulty: string }>();
  ((clsData as Array<{ problem_id: string; type_code: string; difficulty: string }>) || []).forEach((c) => {
    clsMap.set(c.problem_id, { type_code: c.type_code, difficulty: c.difficulty });
  });

  const sessionProblemRows = problemIds.map((pid, i) => {
    const cls = clsMap.get(pid);
    return {
      session_id: sessionId,
      problem_id: pid,
      sequence_number: i + 1,
      type_code_snapshot: cls?.type_code || null,
      difficulty_snapshot: cls?.difficulty ? parseInt(cls.difficulty, 10) : null,
    };
  });
  const { error: spErr } = await sb
    .schema('diagnostics' as never)
    .from('session_problems')
    .insert(sessionProblemRows);
  if (spErr) {
    console.error('[generate-recommended-session] session_problems insert 실패:', spErr.message);
    // session 자체는 살려둠
  }

  console.log(
    `[generate-recommended-session] ★ 학습지 생성: student=${studentId.slice(0, 8)}, exam=${examId}, session=${sessionId}, problems=${problemIds.length}`
  );

  const url = new URL(request.url);
  const sessionUrl = `${url.protocol}//${url.host}/grade/${sessionId}`;

  return NextResponse.json({
    sessionId,
    examId,
    sessionUrl,
    problemCount: problemIds.length,
  });
}
