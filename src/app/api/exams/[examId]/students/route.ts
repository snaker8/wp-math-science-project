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

  // 1. 이 시험의 EX 세션 모두
  const { data: sessions, error: sessErr } = await supabaseAdmin
    .schema('diagnostics')
    .from('sessions')
    .select('id, student_id, conducted_at')
    .eq('exam_id', examId)
    .eq('session_type', 'EX');

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

  // 2. 각 세션의 items 합산
  const { data: items, error: itemsErr } = await supabaseAdmin
    .schema('diagnostics')
    .from('items')
    .select('session_id, is_correct, note')
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
    const sid = (it as { session_id: string }).session_id;
    const isCorrect = (it as { is_correct: boolean }).is_correct;
    const note = (it as { note: string | null }).note;
    const a = itemAgg.get(sid) ?? {
      correct: 0,
      total: 0,
      partialEarned: 0,
      partialFull: 0,
    };
    a.total++;
    if (isCorrect) a.correct++;
    if (note && note.startsWith('partial:')) {
      const m = note.match(/^partial:([0-9.]+)\/([0-9.]+)$/);
      if (m) {
        a.partialEarned += parseFloat(m[1]);
        a.partialFull += parseFloat(m[2]);
      }
    }
    itemAgg.set(sid, a);
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

  // 4. 각 세션의 정/오/부분점수를 총점 정확 계산하려면 exam_problems.points 필요.
  //    학생 리스트 화면에서는 "정답률(%) + 정답/총문항"만 보여주면 충분 → items 기준으로 환산.
  //    더 정확한 총점은 리포트 페이지에서 계산.
  const students: StudentSummary[] = sessionList.map((s) => {
    const sid = s.id as string;
    const agg = itemAgg.get(sid);
    const r = rosterMap.get(s.student_id as string);
    const correct = agg?.correct ?? 0;
    const total = agg?.total ?? 0;
    const pct = total > 0 ? Math.round((correct * 100) / total) : 0;

    return {
      rosterId: s.student_id as string,
      sessionId: sid,
      fullName: r?.full_name ?? '(미상)',
      grade: r?.grade ?? null,
      classLabel: r?.class_label ?? null,
      isPromoted: !!r?.promoted_user_id,
      totalEarned: 0,           // 리포트 페이지에서 정확 계산
      totalPossible: 0,
      correctCount: correct,
      totalGraded: total,
      scorePct: pct,
      conductedAt: (s.conducted_at as string | null) ?? null,
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

  // 세션이 해당 examId 의 것인지 확인 후 삭제 (CASCADE 로 items 함께 삭제)
  const { error: delErr } = await supabaseAdmin
    .schema('diagnostics')
    .from('sessions')
    .delete()
    .eq('id', sessionId)
    .eq('exam_id', examId);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
