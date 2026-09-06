// ============================================================================
// 학생 학습 이력 — 채점 세션(라인 B) → 종류 라벨 + 점수 + 코멘트 + 요약
// ----------------------------------------------------------------------------
// 학생 화면(history 라우트)과 학부모 학습 리포트(share/learning)가 같은 재료를 쓴다.
// 「학습」의 종류(매쓰홀릭 LogTypes 44종)를 우리 재료로: 회차 학습 · 오답유사 학습 · 과제 · 진단 · 시험지
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type LogKind = 'course' | 'wrong_similar' | 'assignment' | 'diagnostic' | 'exam';
export const LOG_KIND_LABEL: Record<LogKind, string> = {
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

export interface HistorySummary {
  stepsDone: number;
  stepsTotal: number;
  graded: number;
  correct: number;
  pct: number | null;
  sessions: number;
  lastAt: string | null;
}

type Admin = SupabaseClient;

/**
 * @param refs   학생의 모든 id (users.id + 승격 전 roster id)
 * @param since  이 시각 이후 기록만 (리포트 기간). 없으면 전부(최근 400)
 */
export async function buildStudentHistory(
  sb: Admin, classId: string, refs: string[], opts: { since?: string | null; limit?: number } = {},
): Promise<{ items: HistoryItem[]; summary: HistorySummary }> {
  // 1) 세션
  type Sess = { id: string; exam_id: string | null; session_type: string | null; issued_at: string | null; completed_at: string | null; teacher_note: string | null };
  let q = sb.schema('diagnostics' as never).from('print_sessions')
    .select('id, exam_id, session_type, issued_at, completed_at, teacher_note')
    .in('student_id', refs.length ? refs : ['-']).order('issued_at', { ascending: false }).limit(opts.limit ?? 400);
  if (opts.since) q = q.gte('issued_at', opts.since);
  const { data: sRows } = await q;
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

  // 3) 시험지 제목 + 과제 종류
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

  // 4) 요약 — 코스 진행도(이 학생, 기간 무관) + 기간 정답률
  const { data: cRows } = await sb.from('courses').select('id').eq('class_id', classId).is('deleted_at', null);
  const courseIds = ((cRows ?? []) as Array<{ id: string }>).map((c) => c.id);
  let stepsTotal = 0; let stepsDone = 0;
  if (courseIds.length > 0) {
    const { data: st } = await sb.from('course_steps').select('id, skipped_at').in('course_id', courseIds);
    const steps = ((st ?? []) as Array<{ id: string; skipped_at: string | null }>).filter((s) => !s.skipped_at);
    stepsTotal = steps.length;
    const stepIds = steps.map((s) => s.id);
    // 완료 = 그 회차 시험지에 채점 결과가 있다 (기간 밖이어도) — 세션 전체를 다시 본다
    const { data: allS } = await sb.schema('diagnostics' as never).from('print_sessions').select('id, exam_id').in('student_id', refs.length ? refs : ['-']);
    const examsWithSession = new Set(((allS ?? []) as Array<{ exam_id: string | null }>).map((s) => s.exam_id).filter((x): x is string => !!x));
    const doneSteps = new Set<string>();
    for (let i = 0; i < stepIds.length; i += 200) {
      const { data } = await sb.from('assignments').select('exam_id, course_step_id').in('course_step_id', stepIds.slice(i, i + 200)).is('parent_assignment_id', null).is('deleted_at', null);
      for (const a of (data ?? []) as Array<{ exam_id: string | null; course_step_id: string }>) {
        if (a.exam_id && examsWithSession.has(a.exam_id)) doneSteps.add(a.course_step_id);
      }
    }
    stepsDone = doneSteps.size;
  }
  const graded = items.reduce((n, it) => n + it.graded, 0);
  const correct = items.reduce((n, it) => n + it.correct, 0);
  return {
    items,
    summary: { stepsDone, stepsTotal, graded, correct, pct: graded > 0 ? Math.round((correct * 100) / graded) : null, sessions: items.length, lastAt: items[0]?.at ?? null },
  };
}
