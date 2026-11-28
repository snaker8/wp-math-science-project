// ============================================================================
// GET /api/student/sessions/[id] — 학생 풀이 화면용 시험지
// ----------------------------------------------------------------------------
// 문제는 선생님 화면·인쇄와 같은 매핑(toExamProblemData)으로 만들어 같은 모양으로 그린다.
// ★ 제출(완료) 전에는 정답·해설을 절대 보내지 않는다 — 입력 방식(객관식/숫자/서술)만.
//   완료 후에는 문항별 O/X · 내 답 · 정답 · 해설을 같이 보낸다.
// ============================================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { loadOwnSession } from '@/lib/student/own-session';
import { decideInputMode, displayCorrectAnswer } from '@/lib/student/answer-safe';
import { toExamProblemData } from '@/lib/exam/exam-problem-mapper';
import { BLANK_NOTE } from '@/lib/grading/save-student-answers';

export const dynamic = 'force-dynamic';

export interface StudentPaperItem {
  seq: number;
  problem: {
    id: string;
    number: number;
    points?: number;
    content: string;
    choices: string[];
    choiceHeaders?: string[];
    choiceLayout?: number;
    choiceImages?: (string | null)[];
    images?: Array<{ url: string; type: string; label: string }>;
    hasFigure?: boolean;
    figureSvg?: string;
    figureData?: unknown;
    upscaledCropUrl?: string;
    figureSource?: string;
    subQuestions?: Array<{ number: string; points: number | null }>;
  };
  input_mode: 'objective' | 'numeric' | 'manual';
  choice_count: number;
  result: null | {
    is_correct: boolean;
    held: boolean;
    blank: boolean;
    student_answer: string;
    correct_answer: string;
    solution: string;
  };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user } = authed.data;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;

  const own = await loadOwnSession(sb, user.id, params.id);
  if (!own.ok) return NextResponse.json({ error: own.error }, { status: own.status });
  const session = own.session;
  const done = !!session.completed_at;

  const [{ data: exam }, { data: sp }, { data: results }] = await Promise.all([
    sb.from('exams').select('id, title').eq('id', session.exam_id).maybeSingle(),
    sb.schema('diagnostics' as never).from('session_problems')
      .select('sequence_number, problem_id').eq('session_id', session.id).order('sequence_number'),
    sb.schema('diagnostics' as never).from('session_results')
      .select('sequence_number, is_correct, teacher_note').eq('session_id', session.id),
  ]);
  const spRows = (sp ?? []) as Array<{ sequence_number: number; problem_id: string }>;
  const problemIds = spRows.map((r) => r.problem_id);

  const [{ data: probs }, { data: pts }] = await Promise.all([
    problemIds.length
      ? sb.from('problems')
          .select('id, content_latex, content_html, answer_json, solution_latex, images, ai_analysis, source_name, source_year, classifications(type_code, difficulty, cognitive_domain)')
          .in('id', problemIds)
      : Promise.resolve({ data: [] }),
    sb.from('exam_problems').select('problem_id, points').eq('exam_id', session.exam_id),
  ]);
  const probMap = new Map(((probs ?? []) as Array<Record<string, unknown>>).map((p) => [p.id as string, p]));
  const pointsBy = new Map(((pts ?? []) as Array<{ problem_id: string; points: number | null }>).map((r) => [r.problem_id, r.points]));
  const resBy = new Map(((results ?? []) as Array<{ sequence_number: number; is_correct: boolean; teacher_note: string | null }>)
    .map((r) => [r.sequence_number, r]));

  const items: StudentPaperItem[] = [];
  for (const row of spRows) {
    const p = probMap.get(row.problem_id);
    if (!p) continue;
    const answerJson = (p.answer_json as Record<string, unknown> | null) ?? null;
    let mapped;
    try {
      mapped = toExamProblemData({ problems: p, sequence_number: row.sequence_number, points: pointsBy.get(row.problem_id) ?? null }, 0);
    } catch {
      continue;
    }
    const { mode, choiceCount } = decideInputMode(answerJson);
    const subQ = Array.isArray(answerJson?.subQuestions)
      ? (answerJson!.subQuestions as Array<Record<string, unknown>>).map((q) => ({ number: String(q.number ?? ''), points: (q.points as number | null) ?? null }))
      : undefined;

    const r = resBy.get(row.sequence_number);
    let result: StudentPaperItem['result'] = null;
    if (done && r) {
      const note = r.teacher_note ?? '';
      const m = note.match(/\[학생답:\s*([^\]]*)\]/);
      result = {
        is_correct: r.is_correct,
        held: note.includes('자동채점 보류'),
        blank: note.includes(BLANK_NOTE),
        student_answer: m ? m[1].trim() : '',
        correct_answer: displayCorrectAnswer(answerJson),
        solution: (p.solution_latex as string) || '',
      };
    }

    items.push({
      seq: row.sequence_number,
      problem: {
        id: mapped.id,
        number: row.sequence_number,
        points: mapped.points,
        content: mapped.content,
        choices: mapped.choices,
        choiceHeaders: mapped.choiceHeaders,
        choiceLayout: mapped.choiceLayout,
        choiceImages: mapped.choiceImages,
        images: mapped.images,
        hasFigure: mapped.hasFigure,
        figureSvg: mapped.figureSvg,
        figureData: mapped.figureData,
        upscaledCropUrl: mapped.upscaledCropUrl,
        figureSource: mapped.figureSource,
        subQuestions: subQ,
      },
      input_mode: mode,
      choice_count: choiceCount,
      result,
    });
  }

  return NextResponse.json({
    session: {
      id: session.id,
      exam_title: (exam as { title?: string } | null)?.title ?? '',
      started_at: session.started_at,
      completed_at: session.completed_at,
    },
    items,
  });
}
