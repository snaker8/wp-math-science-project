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

  // ── 1.5) roster_students (엑셀 일괄 채점 자동등록 명단) — diagnostics.sessions 대부분이
  //   roster id 로 박혀 있음(엑셀 EX 채점). promoted_user_id 있으면 그 user 로 귀속(canonId).
  //   ★ 이거 빠뜨려 엑셀/수동 채점이 학습지 목록에 안 잡히던 사고 (2026-06-11).
  const rosterMeta = new Map<string, { name: string; grade: string; promoted: string | null }>();
  {
    let rq = sb.from('roster_students').select('id, full_name, grade, promoted_user_id, institute_id');
    if (activeInstituteId) {
      rq = rq.eq('institute_id', activeInstituteId);
    } else if (!scope.isSuperAdmin) {
      rq = rq.in('institute_id', scope.accessibleInstituteIds ?? []);
    }
    const { data: roster } = await rq;
    for (const r of (roster || []) as Array<{ id: string; full_name?: string; grade?: number; promoted_user_id?: string | null }>) {
      rosterMeta.set(r.id, { name: r.full_name || '(이름 없음)', grade: gradeLabel(r.grade), promoted: r.promoted_user_id || null });
    }
  }

  // student_id(세션) → canonId(트리 학생 id) + 이름/학년 해석.
  //   user.id → 그대로. roster.id → promoted user 있으면 그 user, 없으면 roster.id.
  const resolveStudent = (sid: string): { canonId: string; name: string; grade: string } | null => {
    const u = userMeta.get(sid);
    if (u) return { canonId: sid, name: u.name, grade: u.grade };
    const r = rosterMeta.get(sid);
    if (r) {
      if (r.promoted && userMeta.has(r.promoted)) {
        const pu = userMeta.get(r.promoted)!;
        return { canonId: r.promoted, name: pu.name || r.name, grade: pu.grade || r.grade };
      }
      return { canonId: sid, name: r.name, grade: r.grade };
    }
    return null; // 이 센터 소속 아님 → 제외
  };

  // diagnostics.sessions .in() 필터용 — user + roster 양쪽 id
  const diagStudentIds = [...studentIds, ...rosterMeta.keys()];
  if (studentIds.length === 0 && rosterMeta.size === 0) return NextResponse.json({ assignments: [] });

  type Assignment = {
    id: string; source: 'qr' | 'manual';
    student_id: string; student_name: string; grade: string;
    exam_id: string | null; // 개별 시험지 리포트 딥링크용 (보고서 탭)
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
      diag().from('session_results').select('session_id, is_correct, awarded_points, max_points').in('session_id', ids),
    ]);
    for (const r of (sp || []) as Array<{ session_id: string }>) qrTotal.set(r.session_id, (qrTotal.get(r.session_id) || 0) + 1);
    for (const r of (sr || []) as Array<{ session_id: string; is_correct: boolean; awarded_points: number | null; max_points: number | null }>) {
      qrGraded.set(r.session_id, (qrGraded.get(r.session_id) || 0) + 1);
      // ★ 부분점수 반영 — 서술형(max_points>0)은 획득/만점 비율, 그 외는 정오(1/0).
      const frac = (r.max_points && r.max_points > 0)
        ? Math.min(1, (r.awarded_points || 0) / r.max_points)
        : (r.is_correct ? 1 : 0);
      qrCorrect.set(r.session_id, (qrCorrect.get(r.session_id) || 0) + frac);
    }
  }

  // ── 3) 수동/엑셀 — diagnostics.sessions (user + roster id 양쪽) ──
  const mRows: Array<{ id: string; student_id: string; exam_id: string | null; session_type: string | null; round_no: number | null; mathflat_sheet_name: string | null; conducted_at: string | null }> = [];
  for (const ids of chunk(diagStudentIds, 200)) {
    if (ids.length === 0) continue;
    const { data, error } = await diag()
      .from('sessions')
      .select('id, student_id, exam_id, session_type, round_no, mathflat_sheet_name, conducted_at')
      .in('student_id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of (data || []) as typeof mRows) {
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

  // ── 5) 병합 (student_id → canonId 해석. 센터 소속 아니면 제외) ──
  const assignments: Assignment[] = [];
  for (const r of qrRows) {
    const stu = resolveStudent(r.student_id);
    if (!stu) continue;
    const graded = qrGraded.get(r.id) || 0;
    const correct = qrCorrect.get(r.id) || 0;
    assignments.push({
      id: r.id, source: 'qr',
      student_id: stu.canonId, student_name: stu.name, grade: stu.grade,
      exam_id: r.exam_id,
      title: (r.exam_id ? examTitle.get(r.exam_id) : '') || '(제목 없음)',
      tag: typeTag(r.session_type) + (r.round_number ? ` R${r.round_number}` : ''),
      issued_at: r.issued_at,
      completed: !!r.completed_at,
      problems_total: qrTotal.get(r.id) || 0,
      correct_cnt: Math.round(correct * 10) / 10,
      score_pct: graded > 0 ? Math.round((correct / graded) * 1000) / 10 : null,
    });
  }
  for (const r of mRows) {
    const stu = resolveStudent(r.student_id);
    if (!stu) continue;
    const total = mTotal.get(r.id) || 0;
    const correct = mCorrect.get(r.id) || 0;
    assignments.push({
      id: r.id, source: 'manual',
      student_id: stu.canonId, student_name: stu.name, grade: stu.grade,
      exam_id: r.exam_id,
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
