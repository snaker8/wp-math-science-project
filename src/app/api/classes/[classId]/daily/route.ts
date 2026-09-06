// ============================================================================
// GET /api/classes/[classId]/daily?week=YYYY-MM-DD — 일일학습 (주간 캘린더)
// ----------------------------------------------------------------------------
// 매쓰홀릭 반 허브 > 일일학습 탭 실측(07 문서): 행 = 학생, 열 = 요일(월~일), 셀 = 그날 한 학습을
// 「색 + 한 글자 + N/M」 칩으로 쌓는다. 이름 밑에 주간 달성 61/70 (87%).
// 우리 재료: 채점 세션(라인 B)의 채점 시각 + 종류(회차/오답유사/과제/진단/시험지) + 학습 목표(주당 문항).
//   · 날짜는 KST. 세션의 날짜 = completed_at(없으면 issued_at).
//   · 주간 달성 = 그 주 채점 문항 / 학습 목표(weeklyProblems). 목표가 없으면 분모 없이 문항 수만.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import { resolveClassStudents, displayName } from '@/lib/class/class-students';
import { parseGoals } from '@/lib/class/learning-goals';

export const dynamic = 'force-dynamic';

interface RouteParams { params: Promise<{ classId: string }> }

export type DailyKind = 'course' | 'wrong_similar' | 'assignment' | 'diagnostic' | 'exam';
export interface DailyChip {
  sessionId: string;
  examId: string | null;
  kind: DailyKind;
  /** 한 글자 라벨 — 회·오·과·진·시 */
  short: string;
  title: string;
  graded: number;
  total: number;
  correct: number;
  done: boolean;
}
export interface DailyRow {
  studentId: string;
  name: string;
  /** 요일별(월~일) 칩 */
  days: DailyChip[][];
  weekGraded: number;
  weekCorrect: number;
  goal: number | null;
  activeDays: number;
}

const KST = 9 * 3600 * 1000;
const SHORT: Record<DailyKind, string> = { course: '회', wrong_similar: '오', assignment: '과', diagnostic: '진', exam: '시' };

/** KST 기준 그 주 월요일 00:00 (UTC ms) */
function mondayKST(d: Date): number {
  const k = new Date(d.getTime() + KST);
  const day = (k.getUTCDay() + 6) % 7;   // 월=0
  const mon = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - day);
  return mon - KST;
}
function ymdKST(ms: number): string {
  const k = new Date(ms + KST);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { classId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;

  const { data: cls } = await sb.from('classes').select('id, name, institute_id, settings').eq('id', classId).is('deleted_at', null).maybeSingle();
  if (!cls) return NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 });
  const c = cls as { id: string; name: string; institute_id: string | null; settings: unknown };
  try { assertInstituteAccess(authed.data.scope, c.institute_id); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }
  const goals = parseGoals((c.settings as { goals?: unknown } | null)?.goals);

  const weekParam = new URL(req.url).searchParams.get('week');
  const base = weekParam && !Number.isNaN(Date.parse(`${weekParam}T00:00:00+09:00`)) ? new Date(`${weekParam}T00:00:00+09:00`) : new Date();
  const start = mondayKST(base);
  const end = start + 7 * 86400000;
  const dayKeys = Array.from({ length: 7 }, (_, i) => ymdKST(start + i * 86400000));

  const roster = await resolveClassStudents(sb, classId);
  if (roster.studentIds.length === 0) return NextResponse.json({ week: dayKeys, rows: [], goal: goals.weeklyProblems });

  // 세션 — 이 주에 발급되었거나 완료된 것 (넉넉히 잡고 날짜로 거른다)
  type Sess = { id: string; student_id: string; exam_id: string | null; session_type: string | null; issued_at: string | null; completed_at: string | null };
  const { data: sRows } = await sb
    .schema('diagnostics' as never).from('print_sessions')
    .select('id, student_id, exam_id, session_type, issued_at, completed_at')
    .in('student_id', roster.allRefs.length ? roster.allRefs : ['-'])
    .gte('issued_at', new Date(start - 14 * 86400000).toISOString())
    .lt('issued_at', new Date(end).toISOString());
  const sessions = ((sRows ?? []) as Sess[]).filter((s) => {
    const at = Date.parse(s.completed_at ?? s.issued_at ?? '');
    return Number.isFinite(at) && at >= start && at < end;
  });

  // 결과 집계 (채점 시각이 이 주 안인 것만 센다 — 세션 날짜와 다를 수 있다)
  const score = new Map<string, { total: number; graded: number; correct: number; lastGraded: number }>();
  const ids = sessions.map((s) => s.id);
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    for (let from = 0; ; from += 1000) {
      const { data } = await sb.schema('diagnostics' as never).from('session_results')
        .select('session_id, is_correct, graded_at, teacher_note').in('session_id', chunk).order('id').range(from, from + 999);
      const rows = (data ?? []) as Array<{ session_id: string; is_correct: boolean | null; graded_at: string | null; teacher_note: string | null }>;
      for (const r of rows) {
        const s = score.get(r.session_id) ?? { total: 0, graded: 0, correct: 0, lastGraded: 0 };
        s.total += 1;
        if (r.graded_at && !(r.teacher_note ?? '').includes('자동채점 보류')) {
          s.graded += 1; if (r.is_correct) s.correct += 1;
          const g = Date.parse(r.graded_at); if (g > s.lastGraded) s.lastGraded = g;
        }
        score.set(r.session_id, s);
      }
      if (rows.length < 1000) break;
    }
  }

  // 종류 + 제목
  const examIds = Array.from(new Set(sessions.map((s) => s.exam_id).filter((x): x is string => !!x)));
  const examTitle = new Map<string, string>();
  const asgByExam = new Map<string, { kind: string; course_step_id: string | null; parent_assignment_id: string | null }>();
  for (let i = 0; i < examIds.length; i += 200) {
    const slice = examIds.slice(i, i + 200);
    const { data: ex } = await sb.from('exams').select('id, title').in('id', slice);
    for (const e of (ex ?? []) as Array<{ id: string; title: string }>) examTitle.set(e.id, e.title);
    const { data: as } = await sb.from('assignments').select('exam_id, kind, course_step_id, parent_assignment_id').in('exam_id', slice).is('deleted_at', null);
    for (const a of (as ?? []) as Array<{ exam_id: string; kind: string; course_step_id: string | null; parent_assignment_id: string | null }>) {
      if (!asgByExam.has(a.exam_id)) asgByExam.set(a.exam_id, a);
    }
  }

  const rowsByStudent = new Map<string, DailyRow>();
  for (const sid of roster.studentIds) {
    rowsByStudent.set(sid, {
      studentId: sid, name: displayName(roster.userById.get(sid)),
      days: Array.from({ length: 7 }, () => []), weekGraded: 0, weekCorrect: 0, goal: goals.weeklyProblems, activeDays: 0,
    });
  }
  for (const s of sessions) {
    const owner = roster.ownerByRef.get(s.student_id);
    const row = owner ? rowsByStudent.get(owner) : undefined;
    if (!row) continue;
    const sc = score.get(s.id) ?? { total: 0, graded: 0, correct: 0, lastGraded: 0 };
    if (sc.total === 0) continue;
    const at = sc.lastGraded || Date.parse(s.completed_at ?? s.issued_at ?? '');
    const dayIdx = Math.floor((at - start) / 86400000);
    if (dayIdx < 0 || dayIdx > 6) continue;
    const a = s.exam_id ? asgByExam.get(s.exam_id) : undefined;
    let kind: DailyKind = 'exam';
    if (a?.parent_assignment_id) kind = 'wrong_similar';
    else if (a?.course_step_id) kind = 'course';
    else if (a) kind = 'assignment';
    else if (['BS', 'DD', 'PT', 'SC'].includes(s.session_type ?? '')) kind = 'diagnostic';
    row.days[dayIdx].push({
      sessionId: s.id, examId: s.exam_id, kind, short: SHORT[kind],
      title: s.exam_id ? examTitle.get(s.exam_id) ?? '(시험지)' : '(시험지)',
      graded: sc.graded, total: sc.total, correct: sc.correct, done: sc.graded >= sc.total && sc.total > 0,
    });
    row.weekGraded += sc.graded; row.weekCorrect += sc.correct;
  }
  const rows = Array.from(rowsByStudent.values()).map((r) => ({ ...r, activeDays: r.days.filter((d) => d.length > 0).length }));
  return NextResponse.json({ class: { id: c.id, name: c.name }, week: dayKeys, rows, goal: goals.weeklyProblems });
}
