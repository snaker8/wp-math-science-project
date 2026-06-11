// ============================================================================
// GET /api/assignments — 출제 관리 (매쓰플랫 "수업>학습지" 미러)
//   학생에게 출제된 모든 학습지/시험지를 한 줄씩 반환. 2개 소스 합산:
//     1) QR 출제      — diagnostics.print_sessions (+session_problems/results 채점)
//     2) 수동/엑셀 채점 — diagnostics.sessions (+items 채점)
//
//   활성 센터 핀(resolveActiveInstitute) — 그 센터 학생들의 출제만.
//   각 행: { id, source, student_id, student_name, grade, title, tag,
//            issued_at, completed, problems_total, correct_cnt, score_pct }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { resolveActiveInstitute } from '@/lib/security/active-institute';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];

// users.grade(int) → 한국 학년 라벨
function gradeLabel(g: unknown): string {
  const n = typeof g === 'number' ? g : parseInt(String(g ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1 && n <= 6) return `초${n}`;
  if (n >= 7 && n <= 9) return `중${n - 6}`;
  if (n >= 10 && n <= 12) return `고${n - 9}`;
  return String(n);
}

// 세션 타입 → 표시 태그
function typeTag(t: string | null): string {
  switch (t) {
    case 'EX': return '시험지';
    case 'WS': return '학습지';
    case 'BS': return '광역진단';
    case 'DD': return '정밀진단';
    case 'PT': return '선수추적';
    case 'SC': return '스팟체크';
    default: return t || '기타';
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(_request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!scope.isSuperAdmin && !ALLOWED_ROLES.includes(scope.role || '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;
  const diag = () => sb.schema('diagnostics' as never);

  // ── 1) 활성 센터 학생 id 집합 (격리 핀) + 이름/학년 메타 ──
  const activeInstituteId = resolveActiveInstitute(scope);
  const userMeta = new Map<string, { name: string; grade: string }>();
  let q = sb.from('users').select('id, full_name, email, grade').eq('role', 'STUDENT').is('deleted_at', null);
  if (activeInstituteId) {
    q = q.eq('institute_id', activeInstituteId);
  } else if (!scope.isSuperAdmin) {
    const ids = scope.accessibleInstituteIds ?? [];
    if (ids.length === 0) return NextResponse.json({ assignments: [] });
    q = q.in('institute_id', ids);
  }
  const { data: users, error: usersErr } = await q;
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });
  const studentIds = (users || []).map((u: { id: string }) => u.id);
  for (const u of (users || []) as Array<{ id: string; full_name?: string; email?: string; grade?: number }>) {
    const name = u.full_name || (u.email ? u.email.split('@')[0] : '') || '(이름 없음)';
    userMeta.set(u.id, { name, grade: gradeLabel(u.grade) });
  }
  if (studentIds.length === 0) return NextResponse.json({ assignments: [] });
  const studentSet = new Set(studentIds);

  type Assignment = {
    id: string; source: 'qr' | 'manual';
    student_id: string; student_name: string; grade: string;
    title: string; tag: string; issued_at: string | null;
    completed: boolean; problems_total: number; correct_cnt: number; score_pct: number | null;
  };

  const examTitle = new Map<string, string>();
  const collectExamIds = new Set<string>();

  // ── 2) QR 출제 — print_sessions ──
  const qrRows: Array<{ id: string; student_id: string; exam_id: string | null; session_type: string | null; round_number: number | null; issued_at: string | null; completed_at: string | null }> = [];
  for (const ids of chunk(studentIds, 200)) {
    const { data, error } = await diag()
      .from('print_sessions')
      .select('id, student_id, exam_id, session_type, round_number, issued_at, completed_at')
      .in('student_id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of (data || []) as typeof qrRows) {
      qrRows.push(r);
      if (r.exam_id) collectExamIds.add(r.exam_id);
    }
  }
  // QR 채점 집계
  const qrIds = qrRows.map(r => r.id);
  const qrTotal = new Map<string, number>();
  const qrGraded = new Map<string, number>();
  const qrCorrect = new Map<string, number>();
  for (const ids of chunk(qrIds, 200)) {
    const [{ data: sp }, { data: sr }] = await Promise.all([
      diag().from('session_problems').select('session_id').in('session_id', ids),
      diag().from('session_results').select('session_id, is_correct').in('session_id', ids),
    ]);
    for (const r of (sp || []) as Array<{ session_id: string }>) qrTotal.set(r.session_id, (qrTotal.get(r.session_id) || 0) + 1);
    for (const r of (sr || []) as Array<{ session_id: string; is_correct: boolean }>) {
      qrGraded.set(r.session_id, (qrGraded.get(r.session_id) || 0) + 1);
      if (r.is_correct) qrCorrect.set(r.session_id, (qrCorrect.get(r.session_id) || 0) + 1);
    }
  }

  // ── 3) 수동/엑셀 — diagnostics.sessions ──
  const mRows: Array<{ id: string; student_id: string; exam_id: string | null; session_type: string | null; round_no: number | null; mathflat_sheet_name: string | null; conducted_at: string | null }> = [];
  for (const ids of chunk(studentIds, 200)) {
    const { data, error } = await diag()
      .from('sessions')
      .select('id, student_id, exam_id, session_type, round_no, mathflat_sheet_name, conducted_at')
      .in('student_id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of (data || []) as typeof mRows) {
      if (!studentSet.has(r.student_id)) continue;
      mRows.push(r);
      if (r.exam_id) collectExamIds.add(r.exam_id);
    }
  }
  const mIds = mRows.map(r => r.id);
  const mTotal = new Map<string, number>();
  const mCorrect = new Map<string, number>();
  for (const ids of chunk(mIds, 200)) {
    const { data } = await diag().from('items').select('session_id, is_correct').in('session_id', ids);
    for (const r of (data || []) as Array<{ session_id: string; is_correct: boolean }>) {
      mTotal.set(r.session_id, (mTotal.get(r.session_id) || 0) + 1);
      if (r.is_correct) mCorrect.set(r.session_id, (mCorrect.get(r.session_id) || 0) + 1);
    }
  }

  // ── 4) exam 제목 일괄 ──
  for (const ids of chunk(Array.from(collectExamIds), 200)) {
    const { data } = await sb.from('exams').select('id, title').in('id', ids);
    for (const e of (data || []) as Array<{ id: string; title: string }>) examTitle.set(e.id, e.title || '');
  }

  // ── 5) 병합 ──
  const assignments: Assignment[] = [];
  for (const r of qrRows) {
    const meta = userMeta.get(r.student_id);
    const graded = qrGraded.get(r.id) || 0;
    const correct = qrCorrect.get(r.id) || 0;
    assignments.push({
      id: r.id, source: 'qr',
      student_id: r.student_id, student_name: meta?.name || '(이름 없음)', grade: meta?.grade || '',
      title: (r.exam_id ? examTitle.get(r.exam_id) : '') || '(제목 없음)',
      tag: typeTag(r.session_type) + (r.round_number ? ` R${r.round_number}` : ''),
      issued_at: r.issued_at,
      completed: !!r.completed_at,
      problems_total: qrTotal.get(r.id) || 0,
      correct_cnt: correct,
      score_pct: graded > 0 ? Math.round((correct / graded) * 1000) / 10 : null,
    });
  }
  for (const r of mRows) {
    const meta = userMeta.get(r.student_id);
    const total = mTotal.get(r.id) || 0;
    const correct = mCorrect.get(r.id) || 0;
    assignments.push({
      id: r.id, source: 'manual',
      student_id: r.student_id, student_name: meta?.name || '(이름 없음)', grade: meta?.grade || '',
      title: r.mathflat_sheet_name || (r.exam_id ? examTitle.get(r.exam_id) : '') || '(제목 없음)',
      tag: typeTag(r.session_type) + (r.round_no ? ` R${r.round_no}` : ''),
      issued_at: r.conducted_at,
      completed: total > 0,
      problems_total: total,
      correct_cnt: correct,
      score_pct: total > 0 ? Math.round((correct / total) * 1000) / 10 : null,
    });
  }

  // 최신 출제 우선
  assignments.sort((a, b) => (b.issued_at || '').localeCompare(a.issued_at || ''));

  return NextResponse.json({ assignments });
}
