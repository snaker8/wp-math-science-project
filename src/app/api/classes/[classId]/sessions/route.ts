// ============================================================================
// GET /api/classes/[classId]/sessions — 반 허브 「채점」 탭: 이 반의 채점 세션(회차) 전부
// ----------------------------------------------------------------------------
// docs/PLAN_CLASS_HUB_REBUILD.md 단계 7 · 매쓰홀릭 학습 탭(회차 카드: 평균점수·전원 제출/N명 제출/미제출)
// + 채점 모달(채점 끝난 자리에서 유형분석→취약 유형→과제) 실측(10 문서 §1, 09 §5-3).
//
// /api/sessions 는 학원 전체를 학생 필터로 보는 것이라, 반 안에서는 **반 학생 + 신원 병합** 기준으로 다시 모은다.
// 세션 = (학생, 시험지, 회차). 채점됨 = session_results 가 붙어 있음. 보류 문항은 세지 않는다 (hub 와 같은 규칙).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import { resolveClassStudents, displayName } from '@/lib/class/class-students';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ classId: string }>;
}

export interface ClassSession {
  id: string;
  /** users.id (병합 후) */
  studentId: string;
  studentName: string;
  examId: string | null;
  examTitle: string;
  round: number | null;
  type: string | null;
  issuedAt: string | null;
  completedAt: string | null;
  total: number;
  graded: number;
  correct: number;
  pct: number | null;
  status: 'pending' | 'done';
}

const PAGE = 1000;

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { classId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;

  const { data: cls } = await sb
    .from('classes').select('id, institute_id').eq('id', classId).is('deleted_at', null).maybeSingle();
  if (!cls) return NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 });
  try {
    assertInstituteAccess(scope, (cls as { institute_id: string | null }).institute_id);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const roster = await resolveClassStudents(sb, classId);
  if (roster.allRefs.length === 0) return NextResponse.json({ sessions: [] as ClassSession[] });

  const { data: psRows } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, student_id, exam_id, round_number, session_type, issued_at, completed_at')
    .in('student_id', roster.allRefs)
    .order('issued_at', { ascending: false });
  const sessions = (psRows ?? []) as Array<{
    id: string; student_id: string; exam_id: string | null; round_number: number | null;
    session_type: string | null; issued_at: string | null; completed_at: string | null;
  }>;
  if (sessions.length === 0) return NextResponse.json({ sessions: [] as ClassSession[] });

  const sessionIds = sessions.map((s) => s.id);
  const total = new Map<string, number>();
  const graded = new Map<string, number>();
  const correct = new Map<string, number>();
  for (let i = 0; i < sessionIds.length; i += 300) {
    const chunk = sessionIds.slice(i, i + 300);
    for (let from = 0; ; from += PAGE) {
      const { data } = await sb
        .schema('diagnostics' as never).from('session_problems')
        .select('session_id').in('session_id', chunk).order('id').range(from, from + PAGE - 1);
      const rows = (data ?? []) as Array<{ session_id: string }>;
      for (const r of rows) total.set(r.session_id, (total.get(r.session_id) ?? 0) + 1);
      if (rows.length < PAGE) break;
    }
    for (let from = 0; ; from += PAGE) {
      const { data } = await sb
        .schema('diagnostics' as never).from('session_results')
        .select('session_id, is_correct, teacher_note').in('session_id', chunk).order('id').range(from, from + PAGE - 1);
      const rows = (data ?? []) as Array<{ session_id: string; is_correct: boolean | null; teacher_note: string | null }>;
      for (const r of rows) {
        if ((r.teacher_note ?? '').includes('자동채점 보류')) continue;
        graded.set(r.session_id, (graded.get(r.session_id) ?? 0) + 1);
        if (r.is_correct) correct.set(r.session_id, (correct.get(r.session_id) ?? 0) + 1);
      }
      if (rows.length < PAGE) break;
    }
  }

  const examIds = Array.from(new Set(sessions.map((s) => s.exam_id).filter((x): x is string => !!x)));
  const examTitle = new Map<string, string>();
  for (let i = 0; i < examIds.length; i += 200) {
    const { data } = await sb.from('exams').select('id, title').in('id', examIds.slice(i, i + 200));
    for (const e of (data ?? []) as Array<{ id: string; title: string | null }>) examTitle.set(e.id, e.title || '(제목 없음)');
  }

  const out: ClassSession[] = [];
  for (const s of sessions) {
    const owner = roster.ownerByRef.get(s.student_id);
    if (!owner) continue;
    const g = graded.get(s.id) ?? 0;
    const c = correct.get(s.id) ?? 0;
    out.push({
      id: s.id,
      studentId: owner,
      studentName: displayName(roster.userById.get(owner)),
      examId: s.exam_id,
      examTitle: s.exam_id ? (examTitle.get(s.exam_id) ?? '(시험지 없음)') : '(시험지 없음)',
      round: s.round_number,
      type: s.session_type,
      issuedAt: s.issued_at,
      completedAt: s.completed_at,
      total: total.get(s.id) ?? 0,
      graded: g,
      correct: c,
      pct: g > 0 ? Math.round((c * 100) / g) : null,
      status: g > 0 ? 'done' : 'pending',
    });
  }
  return NextResponse.json({ sessions: out });
}
