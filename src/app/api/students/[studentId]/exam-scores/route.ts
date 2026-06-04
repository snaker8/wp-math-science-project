// ============================================================================
// /api/students/[studentId]/exam-scores
//
// GET — 학생 1명의 모의고사 4종 점수 조회 (입력 모달 초기값)
// PUT — 모의고사 점수 일괄 upsert (점수 비우면 해당 종류 삭제)
//
//   자사관 플래너 연동 후속 — /api/msb/students/{id}/exams 가 이 테이블을 읽는다.
//
// 권한:
//   GET — 자기 institute 학생만 (assertStudentAccess: 학생 본인도 조회 가능)
//   PUT — ADMIN / TEACHER / TUTOR / ORG_ADMIN + 자기 institute 학생만
//
// 멀티테넌시 (가드 #8):
//   institute_id 는 클라이언트 입력이 아니라 "학생 행의 institute_id" 를 쓴다.
//   쓰기 전 assertInstituteAccess 로 cross-tenant 차단.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess, assertStudentAccess } from '@/lib/security/institute-guard';
import { isMockExamType, MOCK_EXAM_TYPES, type MockExamType } from '@/lib/students/mock-exam-types';

export const dynamic = 'force-dynamic';

// ----------------------------------------------------------------------------
// GET — 점수 조회
//   응답: { scores: [{ examType, score, examDate, note }] }
// ----------------------------------------------------------------------------
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { studentId } = await params;

  // 직원 또는 학생 본인만 — assertStudentAccess 만으로는 같은 학원 "다른 학생" 도
  // 통과하므로 role 게이트를 먼저 둔다.
  const staffRoles = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];
  const isSelf = user.id === studentId;
  if (!isSelf && (!user.role || !staffRoles.includes(user.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const guard = await assertStudentAccess(supabaseAdmin, studentId, scope);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { data, error } = await supabaseAdmin
    .from('student_exam_scores')
    .select('exam_type, score, exam_date, note')
    .eq('student_id', studentId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const scores = (data || []).map((r) => {
    const row = r as { exam_type: string; score: number; exam_date: string | null; note: string | null };
    return {
      examType: row.exam_type,
      score: Number(row.score),
      examDate: row.exam_date || null,
      note: row.note || null,
    };
  });

  return NextResponse.json({ scores });
}

// ----------------------------------------------------------------------------
// PUT — 점수 일괄 upsert
//   body: { scores: [{ examType, score|null, examDate?, note? }] }
//     - score 가 null/'' 이면 해당 종류 행 삭제 (점수 비우기)
//     - 학생×종류 UNIQUE — onConflict upsert
// ----------------------------------------------------------------------------
interface PutScoreItem {
  examType?: unknown;
  score?: unknown;
  examDate?: unknown;
  note?: unknown;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  const allowedRoles = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];
  if (!user.role || !allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden — 점수 입력 권한 없음' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { studentId } = await params;

  // 학생 행 — institute_id 출처 (클라이언트 입력 X) + cross-tenant 차단
  const { data: student, error: stuErr } = await supabaseAdmin
    .from('users')
    .select('id, role, institute_id, deleted_at')
    .eq('id', studentId)
    .maybeSingle();
  if (stuErr) {
    return NextResponse.json({ error: stuErr.message }, { status: 500 });
  }
  if (!student || student.deleted_at) {
    return NextResponse.json({ error: '학생을 찾을 수 없습니다' }, { status: 404 });
  }
  if (student.role !== 'STUDENT') {
    return NextResponse.json({ error: '학생 계정이 아닙니다' }, { status: 400 });
  }
  try {
    assertInstituteAccess(scope, student.institute_id);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!student.institute_id) {
    // institute_id NOT NULL — 소속 없는 학생은 저장 불가 (가드 #8 우회 차단)
    return NextResponse.json({ error: '학생에 학원(센터) 소속 정보가 없습니다' }, { status: 400 });
  }

  let body: { scores?: PutScoreItem[] };
  try {
    body = (await request.json()) as { scores?: PutScoreItem[] };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.scores)) {
    return NextResponse.json({ error: 'scores 배열이 필요합니다' }, { status: 400 });
  }

  // 검증 + upsert/삭제 분류
  const upserts: Array<{
    student_id: string;
    institute_id: string;
    exam_type: MockExamType;
    score: number;
    exam_date: string | null;
    note: string | null;
    created_by: string;
  }> = [];
  const deletes: MockExamType[] = [];
  const seen = new Set<MockExamType>();

  for (const item of body.scores) {
    if (!isMockExamType(item.examType)) {
      return NextResponse.json({
        error: `examType 은 ${MOCK_EXAM_TYPES.join('/')} 중 하나여야 합니다`,
      }, { status: 400 });
    }
    if (seen.has(item.examType)) {
      return NextResponse.json({ error: `examType 중복: ${item.examType}` }, { status: 400 });
    }
    seen.add(item.examType);

    // 점수 비움 → 삭제
    const rawScore = item.score;
    if (rawScore == null || rawScore === '') {
      deletes.push(item.examType);
      continue;
    }
    const score = typeof rawScore === 'number' ? rawScore : Number(String(rawScore).trim());
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return NextResponse.json({
        error: `점수는 0~100 사이여야 합니다 (${item.examType})`,
      }, { status: 400 });
    }

    // 날짜 — YYYY-MM-DD 만 허용 (빈값은 null)
    let examDate: string | null = null;
    if (typeof item.examDate === 'string' && item.examDate.trim()) {
      const d = item.examDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return NextResponse.json({
          error: `날짜 형식은 YYYY-MM-DD 여야 합니다 (${item.examType})`,
        }, { status: 400 });
      }
      examDate = d;
    }

    const note = typeof item.note === 'string' && item.note.trim() ? item.note.trim() : null;

    upserts.push({
      student_id: studentId,
      institute_id: student.institute_id,
      exam_type: item.examType,
      score: Math.round(score * 10) / 10, // NUMERIC(5,1) 동기 — 소수 1자리
      exam_date: examDate,
      note,
      created_by: user.id,
    });
  }

  if (deletes.length > 0) {
    const { error: delErr } = await supabaseAdmin
      .from('student_exam_scores')
      .delete()
      .eq('student_id', studentId)
      .in('exam_type', deletes);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  if (upserts.length > 0) {
    const { error: upErr } = await supabaseAdmin
      .from('student_exam_scores')
      .upsert(upserts, { onConflict: 'student_id,exam_type' });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, upserted: upserts.length, deleted: deletes.length });
}
