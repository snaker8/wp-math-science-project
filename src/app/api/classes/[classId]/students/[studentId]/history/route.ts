// ============================================================================
// /api/classes/[classId]/students/[studentId]/history — 학생 화면: 학습 이력
//   GET   날짜순 학습 기록 (채점 세션 = 라인 B) + 종류 라벨 + 교사 코멘트 + 요약(회차 진행도·정답률)
//   PATCH { sessionId, comment } — 이력에 교사 코멘트 (print_sessions.teacher_note)
// ----------------------------------------------------------------------------
// 매쓰홀릭 학생 화면(09 §5-2): 학습 이력(날짜) · 이력 코멘트 · 학생별 학습지 전부.
// 「학습」의 종류(LogTypes 44종)를 우리 재료로 옮긴 것:
//   회차 학습 · 오답유사 학습 · 과제(단원/오답/취약/유형) · 진단(BS/DD/PT) · 시험지
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import { resolveClassStudents, displayName, gradeLabel } from '@/lib/class/class-students';

export const dynamic = 'force-dynamic';

interface RouteParams { params: Promise<{ classId: string; studentId: string }> }

export type LogKind = 'course' | 'wrong_similar' | 'assignment' | 'diagnostic' | 'exam';
const LOG_KIND_LABEL: Record<LogKind, string> = {
  course: '회차 학습', wrong_similar: '오답유사 학습', assignment: '과제', diagnostic: '진단', exam: '시험지',
};

export interface HistoryItem {
  sessionId: string;
  examId: string | null;
  title: string;
  kind: LogKind;
  kindLabel: string;
  /** 과제 종류 세부 (단원·오답·취약·유형) */
  sub: string | null;
  at: string;            // 채점 완료(없으면 발급) 시각
  total: number;
  graded: number;
  correct: number;
  pct: number | null;
  comment: string | null;
}

async function guard(classId: string, studentId: string, scope: Parameters<typeof assertInstituteAccess>[0]) {
  const sb = supabaseAdmin!;
  const { data: cls } = await sb.from('classes').select('id, name, institute_id').eq('id', classId).is('deleted_at', null).maybeSingle();
  if (!cls) return { ok: false as const, res: NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 }) };
  const c = cls as { id: string; name: string; institute_id: string | null };
  try { assertInstituteAccess(scope, c.institute_id); } catch { return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }; }
  const roster = await resolveClassStudents(sb, classId);
  if (!roster.studentIds.includes(studentId)) return { ok: false as const, res: NextResponse.json({ error: '이 반 학생이 아닙니다' }, { status: 404 }) };
  return { ok: true as const, cls: c, roster };
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { classId, studentId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;
  const g = await guard(classId, studentId, authed.data.scope);
  if (!g.ok) return g.res;
  const { roster, cls } = g;
  const refs = roster.refsByStudent.get(studentId) ?? [studentId];
  const u = roster.userById.get(studentId);
  const student = { id: studentId, name: displayName(u), grade: gradeLabel(u?.grade ?? null) };

  // 1) 세션 (라인 B)
  type Sess = { id: string; exam_id: string | null; session_type: string | null; issued_at: string | null; completed_at: string | null; teacher_note: string | null };
  const { data: sRows } = await sb
    .schema('diagnostics' as never).from('print_sessions')
    .select('id, exam_id, session_type, issued_at, completed_at, teacher_note')
    .in('student_id', refs).order('issued_at', { ascending: false }).limit(400);
  const sessions = (sRows ?? []) as Sess[];

  // 2) 결과 집계
  const score = new Map<string, { total: number; graded: number; correct: number }>();
  const ids = sessions.map((s) => s.id);
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    for (let from = 0; ; from += 1000) {
      const { data } = await sb.schema('diagnostics' as never).from('session_results')
        .select('session_id, is_correct, graded_at, teacher_note').in('session_id', chunk).order('id').range(from, from + 999);
      const rows = (data ?? []) as Array<{ session_id: string; is_correct: boolean | null; graded_at: string | null; teacher_note: string | null }>;
      for (const r of rows) {
        const s = score.get(r.session_id) ?? { total: 0, graded: 0, correct: 0 };
        s.total += 1;
        if (r.graded_at && !(r.teacher_note ?? '').includes('자동채점 보류')) { s.graded += 1; if (r.is_correct) s.correct += 1; }
        score.set(r.session_id, s);
      }
      if (rows.length < 1000) break;
    }
  }

  // 3) 시험지 제목 + 과제 종류 (exam_id 로 과제를 되짚는다)
  const examIds = Array.from(new Set(sessions.map((s) => s.exam_id).filter((x): x is string => !!x)));
  const examTitle = new Map<string, string>();
  for (let i = 0; i < examIds.length; i += 200) {
    const { data } = await sb.from('exams').select('id, title').in('id', examIds.slice(i, i + 200));
    for (const e of (data ?? []) as Array<{ id: string; title: string }>) examTitle.set(e.id, e.title);
  }
  const asgByExam = new Map<string, { kind: string; course_step_id: string | null; parent_assignment_id: string | null }>();
  for (let i = 0; i < examIds.length; i += 200) {
    const { data } = await sb.from('assignments').select('exam_id, kind, course_step_id, parent_assignment_id')
      .in('exam_id', examIds.slice(i, i + 200)).is('deleted_at', null);
    for (const a of (data ?? []) as Array<{ exam_id: string; kind: string; course_step_id: string | null; parent_assignment_id: string | null }>) {
      if (!asgByExam.has(a.exam_id)) asgByExam.set(a.exam_id, a);
    }
  }
  const SUB: Record<string, string> = { unit: '단원', wrong: '오답', weak: '취약', type: '유형' };

  const items: HistoryItem[] = sessions.map((s) => {
    const sc = score.get(s.id) ?? { total: 0, graded: 0, correct: 0 };
    const a = s.exam_id ? asgByExam.get(s.exam_id) : undefined;
    let kind: LogKind = 'exam'; let sub: string | null = null;
    if (a?.parent_assignment_id) kind = 'wrong_similar';
    else if (a?.course_step_id) kind = 'course';
    else if (a) { kind = 'assignment'; sub = SUB[a.kind] ?? null; }
    else if (['BS', 'DD', 'PT', 'SC'].includes(s.session_type ?? '')) kind = 'diagnostic';
    return {
      sessionId: s.id, examId: s.exam_id, title: s.exam_id ? examTitle.get(s.exam_id) ?? '(시험지)' : '(시험지 없음)',
      kind, kindLabel: LOG_KIND_LABEL[kind], sub,
      at: s.completed_at ?? s.issued_at ?? '',
      total: sc.total, graded: sc.graded, correct: sc.correct,
      pct: sc.graded > 0 ? Math.round((sc.correct * 100) / sc.graded) : null,
      comment: s.teacher_note,
    };
  }).filter((it) => it.total > 0 || it.kind !== 'exam');

  // 4) 요약 — 코스 진행도(이 학생) + 전체 정답률
  const { data: cRows } = await sb.from('courses').select('id, title').eq('class_id', classId).is('deleted_at', null);
  const courses = (cRows ?? []) as Array<{ id: string; title: string }>;
  let stepsTotal = 0; let stepsDone = 0;
  if (courses.length > 0) {
    const { data: st } = await sb.from('course_steps').select('id, course_id, skipped_at').in('course_id', courses.map((c) => c.id));
    const steps = ((st ?? []) as Array<{ id: string; course_id: string; skipped_at: string | null }>).filter((s) => !s.skipped_at);
    stepsTotal = steps.length;
    const stepIds = steps.map((s) => s.id);
    const doneSteps = new Set<string>();
    for (let i = 0; i < stepIds.length; i += 200) {
      const { data } = await sb.from('assignments').select('exam_id, course_step_id').in('course_step_id', stepIds.slice(i, i + 200)).is('parent_assignment_id', null).is('deleted_at', null);
      for (const a of (data ?? []) as Array<{ exam_id: string | null; course_step_id: string }>) {
        if (a.exam_id && items.some((it) => it.examId === a.exam_id && it.graded > 0)) doneSteps.add(a.course_step_id);
      }
    }
    stepsDone = doneSteps.size;
  }
  const graded = items.reduce((n, it) => n + it.graded, 0);
  const correct = items.reduce((n, it) => n + it.correct, 0);

  return NextResponse.json({
    class: { id: cls.id, name: cls.name },
    student,
    summary: { stepsDone, stepsTotal, graded, correct, pct: graded > 0 ? Math.round((correct * 100) / graded) : null, sessions: items.length, lastAt: items[0]?.at ?? null },
    items,
  });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { classId, studentId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;
  const g = await guard(classId, studentId, authed.data.scope);
  if (!g.ok) return g.res;
  let body: { sessionId?: unknown; comment?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 500) : '';
  if (!sessionId) return NextResponse.json({ error: 'sessionId 가 필요합니다' }, { status: 400 });
  const refs = g.roster.refsByStudent.get(studentId) ?? [studentId];
  const { data: s } = await sb.schema('diagnostics' as never).from('print_sessions').select('id, student_id').eq('id', sessionId).maybeSingle();
  if (!s || !refs.includes((s as { student_id: string }).student_id)) return NextResponse.json({ error: '이 학생의 기록이 아닙니다' }, { status: 404 });
  const { error } = await sb.schema('diagnostics' as never).from('print_sessions').update({ teacher_note: comment || null }).eq('id', sessionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
