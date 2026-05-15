// ============================================================================
// /api/sessions/[id]/grading-sheet
//
// POST  — 채점표 이미지(또는 PDF) 업로드 → OCR → 정답 비교 미리보기
//         body: multipart formData (file)
//         응답: { matches: [{ seq, student_answer, correct_answer, is_correct, mode }],
//                 ocr_raw: [{ problemNumber, answer, answerType }] }
//         이 단계는 DB 변경 X — 사용자가 미리보기 확인 후 PUT 으로 확정.
//
// PUT   — 미리보기 확정 → session_results upsert
//         body: { matches: [{ sequence_number, is_correct, error_cause?, teacher_note? }] }
//
// 권한:
//   ADMIN / TEACHER / TUTOR / ORG_ADMIN / super_admin — 자기 institute 학생 세션만
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import { extractAnswersWithGemini } from '@/lib/ocr/answer-vision';
import { compareAnswer, type GradeMode } from '@/lib/grading/compare-answer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ----------------------------------------------------------------------------
// 세션 institute 가드 — 공통 헬퍼
// ----------------------------------------------------------------------------
async function loadSessionWithGuard(
  sessionId: string,
  scope: import('@/lib/security/institute-guard').InstituteAccessScope,
) {
  if (!supabaseAdmin) {
    return { ok: false as const, status: 500, error: 'Supabase not configured' };
  }
  const { data: session, error } = await supabaseAdmin
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, student_id, exam_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) return { ok: false as const, status: 500, error: error.message };
  if (!session) return { ok: false as const, status: 404, error: '세션을 찾을 수 없습니다' };

  // student 의 institute 확인
  const { data: student } = await supabaseAdmin
    .from('users')
    .select('institute_id')
    .eq('id', (session as { student_id: string }).student_id)
    .maybeSingle();
  try {
    assertInstituteAccess(scope, (student as { institute_id?: string } | null)?.institute_id ?? null);
  } catch (e) {
    return { ok: false as const, status: 403, error: (e as Error).message };
  }
  return { ok: true as const, session };
}

// ============================================================================
// POST — 채점표 이미지 OCR + 미리보기 매칭
// ============================================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  const allowedRoles = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];
  if (!user.role || !allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden — 권한 없음' }, { status: 403 });
  }

  const { id: sessionId } = await params;
  const guard = await loadSessionWithGuard(sessionId, scope);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  // 파일 추출
  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get('file');
    if (f && typeof f !== 'string') file = f as File;
  } catch {
    return NextResponse.json({ error: 'multipart formData 필요' }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
  }

  // OCR 추출
  let parsed: Awaited<ReturnType<typeof extractAnswersWithGemini>>;
  try {
    parsed = await extractAnswersWithGemini(file);
  } catch (e) {
    return NextResponse.json({
      error: `이미지 OCR 실패: ${(e as Error).message}`,
    }, { status: 500 });
  }

  if (parsed.length === 0) {
    return NextResponse.json({
      error: '이미지에서 답안을 인식하지 못했습니다. 다른 사진을 시도해주세요.',
      ocr_raw: [],
      matches: [],
    }, { status: 400 });
  }

  // session_problems 가져오기 (sequence_number → problem_id)
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const { data: spRows } = await supabaseAdmin
    .schema('diagnostics' as never)
    .from('session_problems')
    .select('sequence_number, problem_id')
    .eq('session_id', sessionId);

  const seqToProblem = new Map<number, string>();
  for (const r of (spRows || []) as Array<{ sequence_number: number; problem_id: string }>) {
    seqToProblem.set(r.sequence_number, r.problem_id);
  }

  // problems.answer_json 일괄 조회
  const problemIds = Array.from(new Set(Array.from(seqToProblem.values())));
  const { data: problems } = problemIds.length > 0
    ? await supabaseAdmin.from('problems').select('id, answer_json').in('id', problemIds)
    : { data: [] as Array<{ id: string; answer_json: Record<string, unknown> | null }> };
  const problemMap = new Map<string, Record<string, unknown> | null>();
  for (const p of (problems || []) as Array<{ id: string; answer_json: Record<string, unknown> | null }>) {
    problemMap.set(p.id, p.answer_json || null);
  }

  // OCR 결과 ↔ session_problems 매칭 + compareAnswer
  interface MatchRow {
    seq: number;
    student_answer: string;
    normalized_student: string;
    correct_answer: string;
    is_correct: boolean | null;
    mode: GradeMode;
    found_in_session: boolean;
  }
  const matches: MatchRow[] = [];
  for (const p of parsed) {
    const seq = p.problemNumber;
    const problemId = seqToProblem.get(seq);
    if (!problemId) {
      matches.push({
        seq,
        student_answer: p.answer,
        normalized_student: p.answer,
        correct_answer: '',
        is_correct: null,
        mode: 'manual',
        found_in_session: false,
      });
      continue;
    }
    const outcome = compareAnswer(p.answer, problemMap.get(problemId) || null);
    matches.push({
      seq,
      student_answer: p.answer,
      normalized_student: outcome.normalizedStudent,
      correct_answer: outcome.normalizedCorrect,
      is_correct: outcome.isCorrect,
      mode: outcome.mode,
      found_in_session: true,
    });
  }

  matches.sort((a, b) => a.seq - b.seq);

  const summary = {
    total: matches.length,
    correct: matches.filter(m => m.is_correct === true).length,
    wrong: matches.filter(m => m.is_correct === false).length,
    needs_review: matches.filter(m => m.is_correct === null).length,
    not_in_session: matches.filter(m => !m.found_in_session).length,
  };

  return NextResponse.json({ matches, summary, ocr_raw: parsed });
}

// ============================================================================
// PUT — 미리보기 확정 → session_results upsert
// ============================================================================
interface PutBody {
  matches?: Array<{
    sequence_number?: number;
    is_correct?: boolean;
    error_cause?: string | null;
    teacher_note?: string | null;
    student_answer_text?: string;
  }>;
}

const VALID_ERROR_CAUSES = new Set(['개념', '유형', '계산', '문장제', '시간']);

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  const allowedRoles = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];
  if (!user.role || !allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden — 권한 없음' }, { status: 403 });
  }

  const { id: sessionId } = await params;
  const guard = await loadSessionWithGuard(sessionId, scope);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const inputs = Array.isArray(body.matches) ? body.matches : [];
  if (inputs.length === 0) {
    return NextResponse.json({ error: 'matches 배열 필요' }, { status: 400 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  // session_problems 매핑
  const { data: spRows } = await supabaseAdmin
    .schema('diagnostics' as never)
    .from('session_problems')
    .select('sequence_number, problem_id')
    .eq('session_id', sessionId);
  const seqToProblem = new Map<number, string>();
  for (const r of (spRows || []) as Array<{ sequence_number: number; problem_id: string }>) {
    seqToProblem.set(r.sequence_number, r.problem_id);
  }

  // upsert rows
  const rows: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  for (const m of inputs) {
    const seq = Number(m.sequence_number);
    if (!Number.isInteger(seq) || seq <= 0) {
      errors.push(`잘못된 sequence_number: ${m.sequence_number}`);
      continue;
    }
    if (typeof m.is_correct !== 'boolean') {
      errors.push(`seq=${seq}: is_correct 누락`);
      continue;
    }
    const problemId = seqToProblem.get(seq);
    if (!problemId) {
      errors.push(`seq=${seq}: session_problems 에 없음`);
      continue;
    }
    let errorCause: string | null = null;
    if (m.error_cause && VALID_ERROR_CAUSES.has(m.error_cause)) {
      errorCause = m.error_cause;
    }
    // 학생 답 텍스트를 teacher_note 에 보관 (감사 trail)
    const noteParts: string[] = [];
    if (m.student_answer_text) noteParts.push(`[학생답: ${m.student_answer_text}]`);
    if (m.teacher_note) noteParts.push(m.teacher_note);
    rows.push({
      session_id: sessionId,
      problem_id: problemId,
      sequence_number: seq,
      is_correct: m.is_correct,
      error_cause: errorCause,
      teacher_note: noteParts.join(' ') || null,
      graded_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ saved: 0, errors }, { status: errors.length > 0 ? 400 : 200 });
  }

  const { error: upErr, count } = await supabaseAdmin
    .schema('diagnostics' as never)
    .from('session_results')
    .upsert(rows, { onConflict: 'session_id,sequence_number', count: 'exact' });

  if (upErr) {
    console.error('[grading-sheet PUT] upsert error:', upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ saved: count ?? rows.length, errors });
}
