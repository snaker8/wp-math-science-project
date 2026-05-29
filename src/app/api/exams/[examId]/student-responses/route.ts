// ============================================================================
// POST /api/exams/[examId]/student-responses
//
// 학생 답안 엑셀 일괄 업로드 → 자동 채점 → diagnostics.sessions/items 적재.
//
// 흐름:
//   1. multipart/form-data 로 파일 1개 이상 수신
//   2. parseStudentSheet() 로 학생별 응답 추출 (수직형/수평형 둘 다)
//   3. 학생별로:
//      a. roster_students 에서 (institute_id, full_name) 매칭 → 없으면 생성
//      b. 시험 문제 목록 조회 (exam_problems + problems + classifications)
//      c. 응답 채점 (gradeResponse) → diagnostics.sessions 1건 + items 다건 INSERT
//   4. 결과 요약 반환
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import {
  parseStudentSheet,
  gradeResponse,
  type ParsedStudent,
  type GradeProblemSpec,
} from '@/lib/grading/parse-student-sheet';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ============================================================================
// Types
// ============================================================================

interface UploadResultRow {
  studentName: string;
  rosterId: string;
  sessionId: string | null;
  totalEarned: number;
  totalPossible: number;
  gradedCount: number;
  ungraded: number;
  isNewRoster: boolean;
  status: 'ok' | 'no_match' | 'error';
  message?: string;
}

interface ProblemRow {
  problem_id: string;
  sequence_number: number;
  source_number: number | null;
  points: number | null;
  answer_json: Record<string, unknown> | null;
  type_code: string | null;
  difficulty: number | null;
}

// ============================================================================
// Handler
// ============================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: { examId: string } }
) {
  const examId = params.examId;
  if (!examId) {
    return NextResponse.json({ error: 'examId 필수' }, { status: 400 });
  }

  // 1. 인증·격리
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin 미설정' }, { status: 500 });
  }

  // 2. 시험 접근 검증 — institute_id NULL 이면 공통풀 (모두 접근), 아니면 격리 검증
  const { data: exam, error: examErr } = await supabaseAdmin
    .from('exams')
    .select('id, institute_id, title')
    .eq('id', examId)
    .maybeSingle();

  if (examErr) {
    return NextResponse.json({ error: examErr.message }, { status: 500 });
  }
  if (!exam) {
    return NextResponse.json({ error: '시험을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (exam.institute_id !== null) {
    try {
      assertInstituteAccess(scope, exam.institute_id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // 3. multipart form 파싱 (institute_id 필드 먼저 확인 필요)
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: 'multipart/form-data 파싱 실패', detail: String(err) },
      { status: 400 }
    );
  }

  // 4. 학생 등록 학원(institute) 결정
  //    - 폼에 institute_id 명시 → 권한 검증 후 사용 (super_admin / ORG_ADMIN 다중 institute 케이스)
  //    - 없으면 → 본인 institute (일반 강사)
  const requestedInstituteId = (formData.get('institute_id') as string | null) || null;
  let teacherInstituteId: string;
  if (requestedInstituteId) {
    if (scope.isSuperAdmin) {
      teacherInstituteId = requestedInstituteId;
    } else {
      const accessible = scope.accessibleInstituteIds ?? [];
      if (!accessible.includes(requestedInstituteId)) {
        return NextResponse.json(
          { error: '선택한 학원에 접근 권한이 없습니다.' },
          { status: 403 }
        );
      }
      teacherInstituteId = requestedInstituteId;
    }
  } else if (scope.instituteId) {
    teacherInstituteId = scope.instituteId;
  } else {
    return NextResponse.json(
      { error: '학원이 배정되지 않은 사용자입니다. 관리자에게 문의하세요.' },
      { status: 403 }
    );
  }

  const files = formData
    .getAll('files')
    .filter((v): v is File => v instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: '업로드된 파일이 없습니다.' }, { status: 400 });
  }

  // 5. 시험 문제 목록 1회 조회 (모든 학생 채점에 재사용)
  const problemSpecMap = await fetchExamProblemSpecs(examId);
  if (problemSpecMap.size === 0) {
    return NextResponse.json(
      { error: '시험에 연결된 문제가 없습니다. 먼저 문제를 등록하세요.' },
      { status: 400 }
    );
  }

  // 6. 파일별 파싱 + 학생별 처리
  const results: UploadResultRow[] = [];
  const allWarnings: string[] = [];

  for (const file of files) {
    let buffer: ArrayBuffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (err) {
      allWarnings.push(`[${file.name}] 파일 읽기 실패: ${String(err)}`);
      continue;
    }

    const parsed = parseStudentSheet(buffer, file.name);
    parsed.warnings.forEach((w) => allWarnings.push(`[${file.name}] ${w}`));

    if (parsed.students.length === 0) {
      results.push({
        studentName: file.name,
        rosterId: '',
        sessionId: null,
        totalEarned: 0,
        totalPossible: 0,
        gradedCount: 0,
        ungraded: 0,
        isNewRoster: false,
        status: 'no_match',
        message: '학생 응답을 찾지 못했습니다.',
      });
      continue;
    }

    for (const student of parsed.students) {
      try {
        const result = await processStudent({
          student,
          examId,
          teacherInstituteId,
          createdByUserId: user.id,
          problemSpecMap,
        });
        results.push(result);
      } catch (err) {
        results.push({
          studentName: student.name,
          rosterId: '',
          sessionId: null,
          totalEarned: 0,
          totalPossible: 0,
          gradedCount: 0,
          ungraded: 0,
          isNewRoster: false,
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    examTitle: exam.title,
    results,
    warnings: allWarnings,
  });
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * 시험에 연결된 문제들의 채점용 스펙 조회 (qNum → spec).
 * qNum 은 source_number 우선, 없으면 sequence_number.
 */
async function fetchExamProblemSpecs(
  examId: string
): Promise<
  Map<
    number,
    GradeProblemSpec & {
      problemId: string;
      typeCode: string | null;
      difficulty: number | null;
    }
  >
> {
  const map = new Map<
    number,
    GradeProblemSpec & {
      problemId: string;
      typeCode: string | null;
      difficulty: number | null;
    }
  >();

  if (!supabaseAdmin) return map;

  const { data, error } = await supabaseAdmin
    .from('exam_problems')
    .select(
      `
      problem_id,
      sequence_number,
      points,
      problems (
        source_number,
        answer_json,
        classifications (
          type_code,
          difficulty
        )
      )
    `
    )
    .eq('exam_id', examId)
    .order('sequence_number', { ascending: true });

  if (error || !data) return map;

  for (const row of data as unknown as Array<{
    problem_id: string;
    sequence_number: number;
    points: number | null;
    problems: {
      source_number: number | null;
      answer_json: Record<string, unknown> | null;
      classifications:
        | { type_code: string | null; difficulty: number | null }
        | Array<{ type_code: string | null; difficulty: number | null }>
        | null;
    } | null;
  }>) {
    const p = row.problems;
    if (!p) continue;
    const cls = Array.isArray(p.classifications)
      ? p.classifications[0]
      : p.classifications;

    const qNum =
      (typeof p.source_number === 'number' ? p.source_number : null) ??
      row.sequence_number;
    if (!qNum) continue;

    const fullScore =
      typeof row.points === 'number'
        ? Number(row.points)
        : extractPointsFromAnswerJson(p.answer_json) ?? 4;

    map.set(qNum, {
      seq: qNum,
      fullScore,
      correctAnswer: extractCorrectAnswerString(p.answer_json),
      problemId: row.problem_id,
      typeCode: cls?.type_code ?? null,
      difficulty: cls?.difficulty ?? null,
    });
  }

  return map;
}

function extractPointsFromAnswerJson(
  answerJson: Record<string, unknown> | null
): number | null {
  if (!answerJson) return null;
  const v = answerJson.points;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function extractCorrectAnswerString(
  answerJson: Record<string, unknown> | null
): string {
  if (!answerJson) return '';
  // 다양한 포맷 지원
  const keys = ['correct_answer', 'finalAnswer', 'answer', 'value'];
  for (const k of keys) {
    const v = answerJson[k];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return v.trim();
    if (Array.isArray(v) && v.length > 0) return String(v[0]).trim();
  }
  return '';
}

/**
 * 한 학생 처리 — roster 매칭/생성 → session → items.
 */
async function processStudent(args: {
  student: ParsedStudent;
  examId: string;
  teacherInstituteId: string;
  createdByUserId: string;
  problemSpecMap: Map<
    number,
    GradeProblemSpec & {
      problemId: string;
      typeCode: string | null;
      difficulty: number | null;
    }
  >;
}): Promise<UploadResultRow> {
  const { student, examId, teacherInstituteId, createdByUserId, problemSpecMap } =
    args;

  if (!supabaseAdmin) {
    throw new Error('Supabase admin 미설정');
  }

  // 1. roster 매칭
  const { rosterId, isNew } = await findOrCreateRoster({
    institute_id: teacherInstituteId,
    full_name: student.name.trim(),
    grade: student.grade,
    class_label: student.classLabel,
    created_by: createdByUserId,
  });

  // 2. 같은 (exam_id, student_id, session_type='EX') 가 있으면 재사용 (재업로드 시 덮어쓰기)
  let sessionId: string;
  {
    const { data: existing } = await supabaseAdmin
      .schema('diagnostics')
      .from('sessions')
      .select('id')
      .eq('exam_id', examId)
      .eq('student_id', rosterId)
      .eq('session_type', 'EX')
      .maybeSingle();

    if (existing?.id) {
      sessionId = existing.id;
      // 기존 items 삭제 후 재적재 (트리거가 student_node_status 자동 갱신)
      await supabaseAdmin
        .schema('diagnostics')
        .from('items')
        .delete()
        .eq('session_id', sessionId);
    } else {
      const { data: newSess, error: sessErr } = await supabaseAdmin
        .schema('diagnostics')
        .from('sessions')
        .insert({
          student_id: rosterId,
          session_type: 'EX',
          exam_id: examId,
          conducted_at: new Date().toISOString(),
          conducted_by: createdByUserId,
        })
        .select('id')
        .single();

      if (sessErr || !newSess) {
        throw new Error(
          `세션 생성 실패: ${sessErr?.message ?? 'unknown'}`
        );
      }
      sessionId = newSess.id;
    }
  }

  // 3. 채점 → items 일괄 INSERT
  let totalEarned = 0;
  let totalPossible = 0;
  let gradedCount = 0;
  let ungraded = 0;

  const itemsToInsert: Array<{
    session_id: string;
    mathsecr_code: string;
    seq: number;
    difficulty: number | null;
    is_correct: boolean;
    note: string | null;
  }> = [];

  // 모든 문제에 대해 채점 (응답 없으면 0점 X)
  for (const [qNum, spec] of problemSpecMap.entries()) {
    const response = student.responses[qNum];
    const graded = gradeResponse(response, spec);

    totalPossible += graded.fullScore;
    totalEarned += graded.earnedScore;
    if (response) gradedCount++;
    else ungraded++;

    // mathsecr_code 가 없으면 items 적재 불가 (NOT NULL) — 스킵 + warning
    if (!spec.typeCode) {
      continue;
    }

    // diagnostics.items.difficulty 는 1~5 제약 → problems 1~10 매핑 변환
    const diff = mapDifficulty10to5(spec.difficulty);

    // 부분점수(△)는 절반 정답으로 분류 (alpha/beta/gamma 계산 영향)
    // 보수적으로: 50% 이상이면 정답, 아니면 오답
    const isCorrect =
      graded.fullScore > 0 && graded.earnedScore / graded.fullScore >= 0.5;

    // CSV 의 정확한 배점·점수 보존을 위해 항상 partial:earned/full 형식으로 저장
    // (정답·오답·부분점수 모두 — report API 가 이 값을 신뢰)
    itemsToInsert.push({
      session_id: sessionId,
      mathsecr_code: spec.typeCode,
      seq: qNum,
      difficulty: diff,
      is_correct: isCorrect,
      note:
        graded.fullScore > 0
          ? `partial:${graded.earnedScore}/${graded.fullScore}`
          : null,
    });
  }

  if (itemsToInsert.length > 0) {
    const { error: itemsErr } = await supabaseAdmin
      .schema('diagnostics')
      .from('items')
      .insert(itemsToInsert);
    if (itemsErr) {
      throw new Error(`items 적재 실패: ${itemsErr.message}`);
    }
  }

  return {
    studentName: student.name,
    rosterId,
    sessionId,
    totalEarned: Math.round(totalEarned * 10) / 10,
    totalPossible: Math.round(totalPossible * 10) / 10,
    gradedCount,
    ungraded,
    isNewRoster: isNew,
    status: 'ok',
  };
}

/**
 * roster_students 에서 (institute_id, full_name) 매칭. 없으면 생성.
 *
 * 우선순위:
 *   1. (institute_id, full_name, grade, class_label) 완전 일치 — 1건이면 사용
 *   2. (institute_id, full_name) 매칭 — 1건이면 사용, 여러건이면 가장 최근
 *   3. 둘 다 0건 → 신규 생성
 */
async function findOrCreateRoster(args: {
  institute_id: string;
  full_name: string;
  grade?: number;
  class_label?: string;
  created_by: string;
}): Promise<{ rosterId: string; isNew: boolean }> {
  if (!supabaseAdmin) throw new Error('Supabase admin 미설정');

  // 1. 정확 매칭
  if (args.grade !== undefined || args.class_label !== undefined) {
    const exactQ = supabaseAdmin
      .from('roster_students')
      .select('id')
      .eq('institute_id', args.institute_id)
      .eq('full_name', args.full_name);

    if (args.grade !== undefined) exactQ.eq('grade', args.grade);
    else exactQ.is('grade', null);

    if (args.class_label !== undefined) exactQ.eq('class_label', args.class_label);
    else exactQ.is('class_label', null);

    const { data: exact } = await exactQ.maybeSingle();
    if (exact?.id) return { rosterId: exact.id, isNew: false };
  }

  // 2. 이름만으로 후보 검색 (가장 최근)
  const { data: nameMatches } = await supabaseAdmin
    .from('roster_students')
    .select('id, grade, class_label, created_at')
    .eq('institute_id', args.institute_id)
    .eq('full_name', args.full_name)
    .order('created_at', { ascending: false })
    .limit(1);

  if (nameMatches && nameMatches.length > 0) {
    return { rosterId: nameMatches[0].id, isNew: false };
  }

  // 3. 신규 생성
  const { data: created, error: insErr } = await supabaseAdmin
    .from('roster_students')
    .insert({
      institute_id: args.institute_id,
      full_name: args.full_name,
      grade: args.grade ?? null,
      class_label: args.class_label ?? null,
      created_by: args.created_by,
    })
    .select('id')
    .single();

  if (insErr || !created) {
    throw new Error(`roster 생성 실패: ${insErr?.message ?? 'unknown'}`);
  }
  return { rosterId: created.id, isNew: true };
}

/** problems.classifications.difficulty (1~10) → diagnostics.items.difficulty (1~5) */
function mapDifficulty10to5(d: number | null): number | null {
  if (d === null || d === undefined) return null;
  if (!Number.isFinite(d)) return null;
  if (d <= 2) return 1;
  if (d <= 4) return 2;
  if (d <= 6) return 3;
  if (d <= 8) return 4;
  return 5;
}
