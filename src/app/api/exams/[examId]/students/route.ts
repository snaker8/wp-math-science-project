// ============================================================================
// GET /api/exams/[examId]/students
//
// 이 시험에 채점된 학생 리스트 (점수 + 최근 갱신 시각).
// /dashboard/exam-analysis/[examId] 의 학생 탭에서 사용.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import { resolveActiveInstitute } from '@/lib/security/active-institute';

export const runtime = 'nodejs';

interface StudentSummary {
  rosterId: string;
  sessionId: string;
  fullName: string;
  grade: number | null;
  classLabel: string | null;
  isPromoted: boolean;          // promoted_user_id 채워졌으면 true
  totalEarned: number;
  totalPossible: number;
  correctCount: number;
  totalGraded: number;
  scorePct: number;             // 0~100
  conductedAt: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { examId: string } }
) {
  const examId = params.examId;
  if (!examId) {
    return NextResponse.json({ error: 'examId 필수' }, { status: 400 });
  }

  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin 미설정' }, { status: 500 });
  }

  // 시험 접근 검증
  const { data: exam, error: examErr } = await supabaseAdmin
    .from('exams')
    .select('id, institute_id')
    .eq('id', examId)
    .maybeSingle();
  if (examErr) return NextResponse.json({ error: examErr.message }, { status: 500 });
  if (!exam) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (exam.institute_id !== null) {
    try {
      assertInstituteAccess(scope, exam.institute_id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // 1. 이 시험의 채점 세션 모두
  //    ★ 2026-09-02 A→B 통일. 예전엔 diagnostics.sessions(A) 를 읽어 **엑셀 채점분만** 보였다.
  //      엑셀 채점을 걷어낸 지금은 QR 채점(B)이 유일한 입력이라, A 만 보면 새 채점이 안 뜬다.
  //      A 데이터는 이미 B 로 이관돼 있으므로 B 하나만 읽으면 전부 나온다.
  //    ★ session_type 을 'EX' 로 못박지 않는다 — QR 세션은 BS/DD/PT/SC/WS/EX 어느 것이든
  //      될 수 있고, 이 화면은 "이 시험지를 친 학생" 전부를 보여야 한다.
  const { data: sessions, error: sessErr } = await supabaseAdmin
    .schema('diagnostics')
    .from('print_sessions')
    .select('id, student_id, completed_at, issued_at')
    .eq('exam_id', examId);

  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  const rawSessionList = sessions ?? [];
  if (rawSessionList.length === 0) {
    return NextResponse.json({ students: [] });
  }

  // 1-2. 활성 센터 필터 — 그 institute 에 속한 학생만 노출
  //      (super_admin 도 자기 활성 센터 기준으로 보임)
  //   ★ 2026-06-04: studentId 는 roster_students.id 또는 users.id(등록 학생) 둘 다 가능.
  //      기존엔 roster_students 만 검사 → user-타입 학생(자사관 등록 등)이 institute 가
  //      맞는데도 항상 제외돼 리포트가 "사라지는" 사고. users.institute_id 도 함께 검사.
  const activeInstituteId = resolveActiveInstitute(scope);
  let sessionList = rawSessionList;
  if (activeInstituteId) {
    const studentIds = Array.from(
      new Set(rawSessionList.map((s) => s.student_id as string))
    );
    const allowedIds = new Set<string>();
    const { data: rosters } = await supabaseAdmin
      .from('roster_students')
      .select('id, institute_id')
      .in('id', studentIds)
      .eq('institute_id', activeInstituteId);
    (rosters ?? []).forEach((r) => allowedIds.add(r.id as string));
    // user-타입 학생(roster 아님)도 동일하게 활성센터 검사
    const { data: userStudents } = await supabaseAdmin
      .from('users')
      .select('id, institute_id')
      .in('id', studentIds)
      .eq('institute_id', activeInstituteId);
    (userStudents ?? []).forEach((u) => allowedIds.add(u.id as string));
    sessionList = rawSessionList.filter((s) =>
      allowedIds.has(s.student_id as string)
    );
  }

  if (sessionList.length === 0) {
    return NextResponse.json({ students: [] });
  }

  const sessionIds = sessionList.map((s) => s.id as string);

  // 2. 각 세션의 채점 결과 합산 (B라인)
  //    ★ 부분점수: A 는 note 에 `partial:3/5` 처럼 문자열로 박아 넣었는데,
  //      B 에는 awarded_points / max_points 정식 칸이 있다. 둘 다 받는다
  //      (이관된 옛 행은 note 가 없고, QR 채점분은 정식 칸을 쓴다).
  const { data: items, error: itemsErr } = await supabaseAdmin
    .schema('diagnostics')
    .from('session_results')
    .select('session_id, is_correct, awarded_points, max_points')
    .in('session_id', sessionIds);

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  // session_id → {correct, total, partial sum/full sum}
  const itemAgg = new Map<
    string,
    { correct: number; total: number; partialEarned: number; partialFull: number }
  >();

  for (const it of items ?? []) {
    const r = it as {
      session_id: string; is_correct: boolean;
      awarded_points: number | null; max_points: number | null;
    };
    const a = itemAgg.get(r.session_id) ?? {
      correct: 0,
      total: 0,
      partialEarned: 0,
      partialFull: 0,
    };
    a.total++;
    if (r.is_correct) a.correct++;
    if (r.awarded_points != null && r.max_points != null) {
      a.partialEarned += Number(r.awarded_points);
      a.partialFull += Number(r.max_points);
    }
    itemAgg.set(r.session_id, a);
  }

  // 3. roster_students 조회 (학생 정보)
  const rosterIds = Array.from(new Set(sessionList.map((s) => s.student_id as string)));
  const { data: rosters } = await supabaseAdmin
    .from('roster_students')
    .select('id, full_name, grade, class_label, promoted_user_id')
    .in('id', rosterIds);

  const rosterMap = new Map<
    string,
    {
      full_name: string;
      grade: number | null;
      class_label: string | null;
      promoted_user_id: string | null;
    }
  >();
  for (const r of rosters ?? []) {
    rosterMap.set((r as { id: string }).id, r as never);
  }

  // 3-b. ★ 2026-06-04: roster 에 없는 user-타입 학생 이름/학년은 users 에서 채움
  //      (안 그러면 user-타입 학생이 목록에서 "(미상)" 으로 표시되는 사고)
  const { data: userStudents } = await supabaseAdmin
    .from('users')
    .select('id, full_name, grade')
    .in('id', rosterIds);
  const userMap = new Map<string, { full_name: string | null; grade: number | null }>();
  for (const u of userStudents ?? []) {
    userMap.set((u as { id: string }).id, u as never);
  }

  // 4. 각 세션의 정/오/부분점수를 총점 정확 계산하려면 exam_problems.points 필요.
  //    학생 리스트 화면에서는 "정답률(%) + 정답/총문항"만 보여주면 충분 → items 기준으로 환산.
  //    더 정확한 총점은 리포트 페이지에서 계산.
  const students: StudentSummary[] = sessionList.map((s) => {
    const sid = s.id as string;
    const agg = itemAgg.get(sid);
    const r = rosterMap.get(s.student_id as string);
    const um = userMap.get(s.student_id as string);
    const correct = agg?.correct ?? 0;
    const total = agg?.total ?? 0;
    const pct = total > 0 ? Math.round((correct * 100) / total) : 0;

    return {
      rosterId: s.student_id as string,
      sessionId: sid,
      fullName: r?.full_name ?? um?.full_name ?? '(미상)',
      grade: r?.grade ?? um?.grade ?? null,
      classLabel: r?.class_label ?? null,
      isPromoted: !!r?.promoted_user_id,
      totalEarned: 0,           // 리포트 페이지에서 정확 계산
      totalPossible: 0,
      correctCount: correct,
      totalGraded: total,
      scorePct: pct,
      // B 는 완료 시각(completed_at)이 정식. 미완료면 발급 시각으로 대체.
      conductedAt: (s.completed_at as string | null) ?? (s.issued_at as string | null) ?? null,
    };
  });

  // 가나다순 정렬 (학년 → 반 → 이름)
  students.sort((a, b) => {
    const g = (a.grade ?? 99) - (b.grade ?? 99);
    if (g !== 0) return g;
    const c = (a.classLabel ?? '').localeCompare(b.classLabel ?? '');
    if (c !== 0) return c;
    return a.fullName.localeCompare(b.fullName, 'ko');
  });

  return NextResponse.json({ students });
}

// ============================================================================
// DELETE /api/exams/[examId]/students?sessionId=... — 특정 학생 세션 삭제
// ============================================================================

export async function DELETE(
  req: NextRequest,
  { params }: { params: { examId: string } }
) {
  const examId = params.examId;
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');
  if (!examId || !sessionId) {
    return NextResponse.json(
      { error: 'examId, sessionId 필수' },
      { status: 400 }
    );
  }

  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin 미설정' }, { status: 500 });
  }

  // 시험 접근 검증
  const { data: exam } = await supabaseAdmin
    .from('exams')
    .select('id, institute_id')
    .eq('id', examId)
    .maybeSingle();
  if (!exam) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (exam.institute_id !== null) {
    try {
      assertInstituteAccess(scope, exam.institute_id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // 세션이 해당 examId 의 것인지 확인 후 삭제 (CASCADE 로 채점 결과 함께 삭제)
  //   ★ 목록을 B(print_sessions)에서 읽으므로 삭제도 B 에서 해야 한다.
  //     A 를 지우면 목록에 그대로 남아 "삭제했는데 안 사라진다"가 된다.
  const { error: delErr } = await supabaseAdmin
    .schema('diagnostics')
    .from('print_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('exam_id', examId);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
