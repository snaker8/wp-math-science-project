// ============================================================================
// GET /api/classes/[classId]/hub — 반 허브 「학생」 탭 데이터
// ----------------------------------------------------------------------------
// 반 하나를 열면 그 반 학생들의 상태가 한 화면에 나온다.
// (docs/PLAN_CLASS_HUB_REBUILD.md 단계 2 — "반이 스파인" · 단계 8 — 학습 목표·달성률)
//
// 매쓰홀릭 학생 탭 실측(10 문서 §0): `진행도 · 완료 학습수 · 금주 학습량 · 금주 정답률 · 평균 학습량 · 평균 정답률`,
// 달성률의 분모는 설정 탭 「학습 목표」(주간 학습량·정답률). 우리 대응:
//   · 진행도      = 제출한 과제 / 배정된 과제  (매쓰홀릭은 완료 회차/전체 회차 — 우리 회차 층은 과제)
//   · 금주 학습량  = 이번 주(KST 월요일~) 채점 문항 수   → 목표 대비 달성률
//   · 금주 정답률  = 이번 주 정답률                      → 목표 대비 달성률
//   · 평균 학습량  = 채점 문항 수 / 학습한 주 수 (문항이 1개라도 있는 주만 센다)
//   · 평균 정답률  = 전체 정답률
//   목표가 없으면 달성률·날씨를 안 만든다 — 목표 없이 "0% 달성"은 거짓이다.
//
// ★ 채점은 B라인 단일 (print_sessions + session_results). A(sessions/items)는 안 읽는다.
// ★ 신원 병합은 resolveClassStudents 한 곳 — 숙달·과제 탭과 숫자가 어긋나지 않게.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import { resolveClassStudents, displayName, gradeLabel } from '@/lib/class/class-students';
import {
  parseGoals, achievementPct, weekStartKST, weekKeyKST, type LearningGoals,
} from '@/lib/class/learning-goals';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ classId: string }>;
}

export interface HubStudent {
  id: string;                    // users.id (반 등록 기준)
  name: string;
  grade: string;
  /** 채점 기록이 실제로 붙어 있는 id 들 (승격 전 명단 id 포함) — 리포트 링크용 */
  refIds: string[];
  sessionCount: number;
  gradedCount: number;
  correctCount: number;
  correctPct: number | null;     // 채점 문항이 없으면 null (0% 와 구분)
  lastActivityAt: string | null;
  alpha: number;                 // 숙달
  beta: number;                  // 흔들림
  gamma: number;                 // 취약
  /** 진행도 — 배정된 과제 / 제출한 과제 */
  assignedCount: number;
  submittedCount: number;
  /** 이번 주 (KST 월요일부터) */
  weekGraded: number;
  weekCorrect: number;
  weekPct: number | null;
  /** 학습한 주 수 · 주당 평균 문항 */
  activeWeeks: number;
  avgWeeklyGraded: number | null;
  /** 목표 대비 달성률 (목표 없으면 null) */
  weekAmountAch: number | null;
  weekAccuracyAch: number | null;
  avgAmountAch: number | null;
  avgAccuracyAch: number | null;
}

export interface HubPayload {
  class: { id: string; name: string; description: string | null; institute_id: string | null; tutor_id: string; created_at: string };
  goals: LearningGoals;
  students: HubStudent[];
}

const PAGE = 1000;

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { classId } = await params;

  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  // 1) 반 + 격리 가드
  const { data: cls } = await sb
    .from('classes')
    .select('id, name, description, institute_id, tutor_id, created_at, settings')
    .eq('id', classId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!cls) return NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 });
  try {
    assertInstituteAccess(scope, (cls as { institute_id: string | null }).institute_id);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { settings, ...classInfo } = cls as HubPayload['class'] & { settings: unknown };
  const goals = parseGoals(settings);

  // 2~3) 반 학생 + 신원 병합 — 숙달 탭(mastery)·과제와 같은 해석 (lib/class/class-students)
  const { studentIds, allRefs, ownerByRef, refsByStudent, userById } = await resolveClassStudents(sb, classId);

  if (studentIds.length === 0) {
    return NextResponse.json({ class: classInfo, goals, students: [] as HubStudent[] } satisfies HubPayload);
  }

  // 4) 채점 세션 (B라인)
  const { data: psRows } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, student_id, exam_id, completed_at, issued_at')
    .in('student_id', allRefs);
  const sessions = (psRows ?? []) as Array<{
    id: string; student_id: string; exam_id: string | null; completed_at: string | null; issued_at: string | null;
  }>;

  // 5) 채점 결과 — ★ 1,000행에서 잘린다. 반 하나라도 회차가 쌓이면 걸린다.
  const sessionIds = sessions.map((s) => s.id);
  type SR = { session_id: string; is_correct: boolean; teacher_note: string | null; graded_at: string | null };
  const results: SR[] = [];
  for (let i = 0; i < sessionIds.length; i += 300) {
    const chunk = sessionIds.slice(i, i + 300);
    for (let from = 0; ; from += PAGE) {
      const { data } = await sb
        .schema('diagnostics' as never)
        .from('session_results')
        .select('session_id, is_correct, teacher_note, graded_at')
        .in('session_id', chunk)
        .order('id')
        .range(from, from + PAGE - 1);
      const rows = (data ?? []) as SR[];
      results.push(...rows);
      if (rows.length < PAGE) break;
    }
  }

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const ownerBySession = new Map(sessions.map((s) => [s.id, ownerByRef.get(s.student_id) ?? null]));
  const weekStart = weekStartKST(Date.now());

  type Agg = { graded: number; correct: number; weekGraded: number; weekCorrect: number; weeks: Set<string> };
  const agg = new Map<string, Agg>();
  const gradedSessions = new Set<string>();
  for (const r of results) {
    if ((r.teacher_note ?? '').includes('자동채점 보류')) continue;  // 보류 문항 제외
    const owner = ownerBySession.get(r.session_id);
    if (!owner) continue;
    gradedSessions.add(r.session_id);
    const a = agg.get(owner) ?? { graded: 0, correct: 0, weekGraded: 0, weekCorrect: 0, weeks: new Set<string>() };
    a.graded += 1;
    if (r.is_correct) a.correct += 1;
    const sess = sessionById.get(r.session_id);
    const at = r.graded_at ?? sess?.completed_at ?? sess?.issued_at ?? null;
    if (at) {
      const t = Date.parse(at);
      if (Number.isFinite(t)) {
        a.weeks.add(weekKeyKST(t));
        if (t >= weekStart) { a.weekGraded += 1; if (r.is_correct) a.weekCorrect += 1; }
      }
    }
    agg.set(owner, a);
  }

  // 세션 수·마지막 학습일은 **채점된 세션만** 센다 (배포만 하고 안 친 건 학습이 아니다)
  const sessCount = new Map<string, number>();
  const lastAt = new Map<string, string>();
  const gradedExamByRef = new Set<string>();   // `${exam_id}|${ref}` — 과제 제출 판정용
  for (const s of sessions) {
    if (!gradedSessions.has(s.id)) continue;
    const owner = ownerByRef.get(s.student_id);
    if (!owner) continue;
    sessCount.set(owner, (sessCount.get(owner) ?? 0) + 1);
    const when = s.completed_at ?? s.issued_at;
    if (when && (!lastAt.get(owner) || when > lastAt.get(owner)!)) lastAt.set(owner, when);
    if (s.exam_id) gradedExamByRef.add(`${s.exam_id}|${s.student_id}`);
  }

  // 6) 과제 진행도 — 배정 / 제출. 제출 = 그 과제 시험지에 채점 세션이 붙어 있다 (assignments 탭과 같은 규칙)
  const assigned = new Map<string, number>();
  const submitted = new Map<string, number>();
  {
    const { data: aRows } = await sb
      .from('assignments')
      .select('id, exam_id')
      .eq('class_id', classId)
      .is('deleted_at', null);
    const assignments = (aRows ?? []) as Array<{ id: string; exam_id: string | null }>;
    if (assignments.length > 0) {
      const examByAssignment = new Map(assignments.map((a) => [a.id, a.exam_id]));
      const { data: asRows } = await sb
        .from('assignment_students')
        .select('assignment_id, student_id, status')
        .in('assignment_id', assignments.map((a) => a.id));
      for (const t of (asRows ?? []) as Array<{ assignment_id: string; student_id: string; status: string }>) {
        const owner = ownerByRef.get(t.student_id) ?? t.student_id;
        if (!studentIds.includes(owner)) continue;
        if (t.status === 'excused') continue;
        assigned.set(owner, (assigned.get(owner) ?? 0) + 1);
        const examId = examByAssignment.get(t.assignment_id);
        const refs = refsByStudent.get(owner) ?? [owner];
        if (examId && refs.some((r) => gradedExamByRef.has(`${examId}|${r}`))) {
          submitted.set(owner, (submitted.get(owner) ?? 0) + 1);
        }
      }
    }
  }

  // 7) 숙달 상태 (α 숙달 / β 흔들림 / γ 취약)
  const mastery = new Map<string, { alpha: number; beta: number; gamma: number }>();
  {
    const rows: Array<{ student_id: string; status: string | null }> = [];
    for (let from = 0; ; from += PAGE) {
      const { data } = await sb
        .schema('diagnostics' as never)
        .from('student_node_status')
        .select('student_id, status')
        .in('student_id', allRefs)
        .order('student_id')
        .range(from, from + PAGE - 1);
      const batch = (data ?? []) as typeof rows;
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }
    for (const r of rows) {
      const owner = ownerByRef.get(r.student_id);
      if (!owner) continue;
      const m = mastery.get(owner) ?? { alpha: 0, beta: 0, gamma: 0 };
      if (r.status === 'alpha') m.alpha += 1;
      else if (r.status === 'beta') m.beta += 1;
      else if (r.status === 'gamma') m.gamma += 1;
      mastery.set(owner, m);
    }
  }

  const students: HubStudent[] = studentIds.map((id) => {
    const u = userById.get(id);
    const a = agg.get(id) ?? { graded: 0, correct: 0, weekGraded: 0, weekCorrect: 0, weeks: new Set<string>() };
    const m = mastery.get(id) ?? { alpha: 0, beta: 0, gamma: 0 };
    const correctPct = a.graded > 0 ? Math.round((a.correct * 100) / a.graded) : null;
    const weekPct = a.weekGraded > 0 ? Math.round((a.weekCorrect * 100) / a.weekGraded) : null;
    const activeWeeks = a.weeks.size;
    const avgWeeklyGraded = activeWeeks > 0 ? Math.round(a.graded / activeWeeks) : null;
    return {
      id,
      name: displayName(u),
      grade: gradeLabel(u?.grade),
      refIds: refsByStudent.get(id) ?? [id],
      sessionCount: sessCount.get(id) ?? 0,
      gradedCount: a.graded,
      correctCount: a.correct,
      correctPct,
      lastActivityAt: lastAt.get(id) ?? null,
      ...m,
      assignedCount: assigned.get(id) ?? 0,
      submittedCount: submitted.get(id) ?? 0,
      weekGraded: a.weekGraded,
      weekCorrect: a.weekCorrect,
      weekPct,
      activeWeeks,
      avgWeeklyGraded,
      // 이번 주 학습량은 0 이어도 달성률 0% 가 맞다(목표가 있으면). 정답률은 문항이 없으면 판정 불가(null).
      weekAmountAch: achievementPct(a.weekGraded, goals.weeklyProblems),
      weekAccuracyAch: achievementPct(weekPct, goals.accuracy),
      avgAmountAch: achievementPct(avgWeeklyGraded, goals.weeklyProblems),
      avgAccuracyAch: achievementPct(correctPct, goals.accuracy),
    };
  });

  // 이름순 — 학원에서 부르는 순서
  students.sort((x, y) => x.name.localeCompare(y.name, 'ko'));

  return NextResponse.json({ class: classInfo, goals, students } satisfies HubPayload);
}
