// ============================================================================
// POST /api/sessions
//   학생 N명 × 특정 시험지 × 회차 = N개 QR 채점 세션 일괄 생성.
//   각 학생별로 print_sessions 1행 + session_problems 문항수 행 스냅샷 기록.
//
// body:
//   {
//     exam_id: string (uuid),
//     student_ids: string[] (uuid 배열),
//     round_number?: number (기본 1),
//     session_type?: 'BS' | 'DD' | 'PT' | 'SC' (기본 'BS'),
//     teacher_note?: string
//   }
//
// 동작:
//   1. exam + exam_problems + classifications 조회 (1회)
//   2. 각 student_id 에 대해 print_sessions 행 + session_problems 문항별 스냅샷 INSERT
//   3. 이미 같은 (student, exam, round) 세션이 있으면 건너뜀 (UNIQUE 제약)
//
// 반환:
//   { created: [{ session_id, student_id, problem_count }], skipped: [{ student_id, reason }] }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertExamAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type SessionType = 'BS' | 'DD' | 'PT' | 'SC';
const VALID_TYPES: SessionType[] = ['BS', 'DD', 'PT', 'SC'];

interface CreateBody {
  exam_id?: string;
  student_ids?: string[];
  round_number?: number;
  session_type?: SessionType;
  teacher_note?: string;
  issued_by?: string;
}

export async function POST(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const examId = body.exam_id;
  const studentIds = Array.isArray(body.student_ids) ? body.student_ids.filter(s => typeof s === 'string') : [];
  const roundNumber = Number.isInteger(body.round_number) && body.round_number! > 0 ? body.round_number! : 1;
  const sessionType: SessionType = VALID_TYPES.includes((body.session_type as SessionType)) ? (body.session_type as SessionType) : 'BS';
  const teacherNote = body.teacher_note || null;
  const issuedBy = body.issued_by || null;

  if (!examId) return NextResponse.json({ error: 'exam_id required' }, { status: 400 });
  if (studentIds.length === 0) return NextResponse.json({ error: 'student_ids 배열 필요' }, { status: 400 });

  // 1) exam 격리 가드 + 확인
  const examGuard = await assertExamAccess(sb, examId, scope);
  if (!examGuard.ok) return NextResponse.json({ error: examGuard.error }, { status: examGuard.status });
  const { data: exam, error: examErr } = await sb
    .from('exams')
    .select('id, title')
    .eq('id', examId)
    .single();
  if (examErr || !exam) {
    return NextResponse.json({ error: '시험지를 찾을 수 없습니다' }, { status: 404 });
  }

  // 2) exam_problems (sequence_number 순)
  const { data: examProblems, error: epErr } = await sb
    .from('exam_problems')
    .select('problem_id, sequence_number')
    .eq('exam_id', examId)
    .order('sequence_number', { ascending: true });
  if (epErr) {
    return NextResponse.json({ error: epErr.message }, { status: 500 });
  }
  if (!examProblems || examProblems.length === 0) {
    return NextResponse.json({ error: '시험지에 문제가 없습니다' }, { status: 400 });
  }

  const problemIds = examProblems.map((ep: any) => ep.problem_id as string);

  // 3) classifications — type_code / difficulty 스냅샷용
  const { data: classData } = await sb
    .from('classifications')
    .select('problem_id, type_code, expanded_type_code, difficulty')
    .in('problem_id', problemIds);
  const classMap = new Map<string, { type_code: string; difficulty: number | null }>();
  for (const c of (classData || []) as any[]) {
    const tc = (c.type_code as string) || (c.expanded_type_code as string) || '';
    let diff: number | null = null;
    if (c.difficulty != null) {
      const n = typeof c.difficulty === 'number' ? c.difficulty : parseInt(String(c.difficulty), 10);
      if (!isNaN(n) && n >= 1 && n <= 10) diff = n;
    }
    classMap.set(c.problem_id as string, { type_code: tc, difficulty: diff });
  }

  // 4) 학생별 세션 생성
  const created: Array<{ session_id: string; student_id: string; problem_count: number }> = [];
  const skipped: Array<{ student_id: string; reason: string }> = [];

  for (const studentId of studentIds) {
    // 4-a) print_sessions INSERT (UNIQUE 제약 충돌 시 건너뜀)
    const { data: insSession, error: insErr } = await sb
      .schema('diagnostics' as never)
      .from('print_sessions')
      .insert({
        student_id: studentId,
        exam_id: examId,
        round_number: roundNumber,
        session_type: sessionType,
        teacher_note: teacherNote,
        issued_by: issuedBy,
      })
      .select('id')
      .single();

    if (insErr || !insSession) {
      // UNIQUE 위반은 "이미 존재" 로 간주
      if (insErr && /duplicate|unique/i.test(insErr.message)) {
        skipped.push({ student_id: studentId, reason: '이미 같은 (학생, 시험지, 회차) 세션 존재' });
      } else {
        skipped.push({ student_id: studentId, reason: insErr?.message || 'INSERT 실패' });
      }
      continue;
    }

    const sessionId = insSession.id as string;

    // 4-b) session_problems 벌크 INSERT
    const rows = examProblems.map((ep: any) => {
      const cls = classMap.get(ep.problem_id as string);
      return {
        session_id: sessionId,
        problem_id: ep.problem_id as string,
        sequence_number: ep.sequence_number as number,
        type_code_snapshot: cls?.type_code || null,
        difficulty_snapshot: cls?.difficulty ?? null,
      };
    });

    const { error: spErr } = await sb
      .schema('diagnostics' as never)
      .from('session_problems')
      .insert(rows);

    if (spErr) {
      console.error(`[sessions] session_problems insert error for session ${sessionId}:`, spErr.message);
      // 세션 롤백 (cascade 로 session_problems 도 정리)
      await sb.schema('diagnostics' as never).from('print_sessions').delete().eq('id', sessionId);
      skipped.push({ student_id: studentId, reason: `session_problems INSERT 실패: ${spErr.message}` });
      continue;
    }

    created.push({ session_id: sessionId, student_id: studentId, problem_count: rows.length });
  }

  return NextResponse.json({ created, skipped, exam: { id: exam.id, title: exam.title } });
}
