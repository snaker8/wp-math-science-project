// ============================================================================
// /api/students/[studentId]/school-exam-scores
//
// GET — 학생 1명의 내신(학교시험) 실점수 목록
// PUT — 내신 점수 일괄 upsert (점수 비우면 해당 (과목·학년·학기·구분) 행 삭제)
//
//   단위: 과목(기본 '수학') × 학년 × 학기(1·2) × 중간/기말.
//   모의고사(student_exam_scores) 와 별개 라인 — "학생 성적" 페이지 통합 소스.
//
// 권한 / 멀티테넌시: student_exam_scores 라우트와 동일 (가드 #8).
//   institute_id 는 클라 입력이 아니라 "학생 행의 institute_id" 사용.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess, assertStudentAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

const TERMS = ['중간', '기말'] as const;
type Term = (typeof TERMS)[number];

// ----------------------------------------------------------------------------
// GET — 점수 조회
//   응답: { scores: [{ subject, grade, semester, term, score, classRank, classSize, classAvg, examDate, note }] }
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
    .from('student_school_exam_scores')
    .select('subject, grade, semester, term, score, class_rank, class_size, class_avg, exam_date, note')
    .eq('student_id', studentId)
    .order('grade', { ascending: true })
    .order('semester', { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const scores = (data || []).map((r) => {
    const row = r as {
      subject: string; grade: number; semester: number; term: string;
      score: number; class_rank: number | null; class_size: number | null;
      class_avg: number | null; exam_date: string | null; note: string | null;
    };
    return {
      subject: row.subject,
      grade: row.grade,
      semester: row.semester,
      term: row.term,
      score: Number(row.score),
      classRank: row.class_rank,
      classSize: row.class_size,
      classAvg: row.class_avg != null ? Number(row.class_avg) : null,
      examDate: row.exam_date || null,
      note: row.note || null,
    };
  });

  return NextResponse.json({ scores });
}

// ----------------------------------------------------------------------------
// PUT — 점수 일괄 upsert
//   body: { scores: [{ subject?, grade, semester, term, score|null, classRank?, classSize?, classAvg?, examDate?, note? }] }
//     - score 가 null/'' 이면 해당 (과목·학년·학기·구분) 행 삭제
//     - UNIQUE (student_id, subject, grade, semester, term) — onConflict upsert
// ----------------------------------------------------------------------------
interface PutItem {
  subject?: unknown;
  grade?: unknown;
  semester?: unknown;
  term?: unknown;
  score?: unknown;
  classRank?: unknown;
  classSize?: unknown;
  classAvg?: unknown;
  examDate?: unknown;
  note?: unknown;
}

function toInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseInt(String(v).trim(), 10);
  return Number.isInteger(n) ? n : null;
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
    return NextResponse.json({ error: '학생에 학원(센터) 소속 정보가 없습니다' }, { status: 400 });
  }

  let body: { scores?: PutItem[] };
  try {
    body = (await request.json()) as { scores?: PutItem[] };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.scores)) {
    return NextResponse.json({ error: 'scores 배열이 필요합니다' }, { status: 400 });
  }

  const upserts: Array<{
    student_id: string;
    institute_id: string;
    subject: string;
    grade: number;
    semester: number;
    term: Term;
    score: number;
    class_rank: number | null;
    class_size: number | null;
    class_avg: number | null;
    exam_date: string | null;
    note: string | null;
    created_by: string;
  }> = [];
  // 삭제 키 — (subject, grade, semester, term) 조합. PostgREST 복합 in 이 까다로워 개별 삭제.
  const deletes: Array<{ subject: string; grade: number; semester: number; term: Term }> = [];
  const seen = new Set<string>();

  for (const item of body.scores) {
    const subject = typeof item.subject === 'string' && item.subject.trim() ? item.subject.trim() : '수학';
    const grade = toInt(item.grade);
    const semester = toInt(item.semester);
    const term = item.term;

    if (grade == null || grade < 1 || grade > 12) {
      return NextResponse.json({ error: '학년(grade)은 1~12 정수여야 합니다' }, { status: 400 });
    }
    if (semester !== 1 && semester !== 2) {
      return NextResponse.json({ error: '학기(semester)는 1 또는 2 여야 합니다' }, { status: 400 });
    }
    if (typeof term !== 'string' || !(TERMS as readonly string[]).includes(term)) {
      return NextResponse.json({ error: "구분(term)은 '중간' 또는 '기말' 이어야 합니다" }, { status: 400 });
    }
    const termV = term as Term;

    const key = `${subject}|${grade}|${semester}|${termV}`;
    if (seen.has(key)) {
      return NextResponse.json({ error: `중복 항목: ${key}` }, { status: 400 });
    }
    seen.add(key);

    // 점수 비움 → 삭제
    const rawScore = item.score;
    if (rawScore == null || rawScore === '') {
      deletes.push({ subject, grade, semester, term: termV });
      continue;
    }
    const score = typeof rawScore === 'number' ? rawScore : Number(String(rawScore).trim());
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return NextResponse.json({ error: `점수는 0~100 사이여야 합니다 (${key})` }, { status: 400 });
    }

    // 선택 입력 — 석차·인원·반평균
    const classRank = toInt(item.classRank);
    const classSize = toInt(item.classSize);
    let classAvg: number | null = null;
    if (item.classAvg != null && item.classAvg !== '') {
      const a = typeof item.classAvg === 'number' ? item.classAvg : Number(String(item.classAvg).trim());
      if (!Number.isFinite(a) || a < 0 || a > 100) {
        return NextResponse.json({ error: `반평균은 0~100 사이여야 합니다 (${key})` }, { status: 400 });
      }
      classAvg = Math.round(a * 10) / 10;
    }

    // 날짜 — YYYY-MM-DD 만 허용 (빈값은 null)
    let examDate: string | null = null;
    if (typeof item.examDate === 'string' && item.examDate.trim()) {
      const d = item.examDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return NextResponse.json({ error: `날짜 형식은 YYYY-MM-DD 여야 합니다 (${key})` }, { status: 400 });
      }
      examDate = d;
    }

    const note = typeof item.note === 'string' && item.note.trim() ? item.note.trim() : null;

    upserts.push({
      student_id: studentId,
      institute_id: student.institute_id,
      subject,
      grade,
      semester,
      term: termV,
      score: Math.round(score * 10) / 10, // NUMERIC(5,1) 동기 — 소수 1자리
      class_rank: classRank,
      class_size: classSize,
      class_avg: classAvg,
      exam_date: examDate,
      note,
      created_by: user.id,
    });
  }

  for (const d of deletes) {
    const { error: delErr } = await supabaseAdmin
      .from('student_school_exam_scores')
      .delete()
      .eq('student_id', studentId)
      .eq('subject', d.subject)
      .eq('grade', d.grade)
      .eq('semester', d.semester)
      .eq('term', d.term);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  if (upserts.length > 0) {
    const { error: upErr } = await supabaseAdmin
      .from('student_school_exam_scores')
      .upsert(upserts, { onConflict: 'student_id,subject,grade,semester,term' });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, upserted: upserts.length, deleted: deletes.length });
}
