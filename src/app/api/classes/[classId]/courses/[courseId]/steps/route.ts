// ============================================================================
// PATCH /api/classes/[classId]/courses/[courseId]/steps — 회차 순서·건너뛰기
// ----------------------------------------------------------------------------
// body { stepId, action: 'up' | 'down' | 'skip' | 'unskip' }
//   up/down  안 낸 회차끼리 자리를 바꾼다 (낸 회차는 못 움직인다 — 과제·채점이 붙어 있다)
//   skip     건너뛴다 — 진행도 분모·「다음 회차 내기」에서 빠진다. 낸 회차는 못 건너뛴다
//   unskip   되돌린다
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { loadCourse } from '@/lib/class/course-guard';

export const dynamic = 'force-dynamic';

interface RouteParams { params: Promise<{ classId: string; courseId: string }> }
type Step = { id: string; seq: number; assignment_id: string | null; issued_at: string | null; skipped_at: string | null };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { classId, courseId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;
  const g = await loadCourse(classId, courseId, authed.data.scope);
  if (!g.ok) return g.res;

  let body: { stepId?: unknown; action?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const stepId = typeof body.stepId === 'string' ? body.stepId : '';
  const action = body.action;
  if (!stepId || !['up', 'down', 'skip', 'unskip'].includes(String(action))) {
    return NextResponse.json({ error: 'stepId 와 action(up·down·skip·unskip)이 필요합니다' }, { status: 400 });
  }

  const { data: rows } = await sb
    .from('course_steps').select('id, seq, assignment_id, issued_at, skipped_at')
    .eq('course_id', courseId).order('seq');
  const steps = (rows ?? []) as Step[];
  const idx = steps.findIndex((s) => s.id === stepId);
  if (idx < 0) return NextResponse.json({ error: '회차를 찾을 수 없습니다' }, { status: 404 });
  const me = steps[idx];
  const issued = (s: Step) => !!s.assignment_id || !!s.issued_at;

  if (action === 'skip' || action === 'unskip') {
    if (action === 'skip' && issued(me)) return NextResponse.json({ error: '낸 회차는 건너뛸 수 없습니다' }, { status: 400 });
    const { error } = await sb.from('course_steps')
      .update({ skipped_at: action === 'skip' ? new Date().toISOString() : null }).eq('id', stepId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // up / down — 안 낸 회차끼리 seq 교환
  if (issued(me)) return NextResponse.json({ error: '낸 회차는 순서를 바꿀 수 없습니다' }, { status: 400 });
  const j = action === 'up' ? idx - 1 : idx + 1;
  if (j < 0 || j >= steps.length) return NextResponse.json({ error: '더 움직일 수 없습니다' }, { status: 400 });
  const other = steps[j];
  if (issued(other)) return NextResponse.json({ error: '낸 회차를 넘어서 움직일 수 없습니다' }, { status: 400 });
  // UNIQUE(course_id, seq) — 임시 음수로 피한다
  const e1 = (await sb.from('course_steps').update({ seq: -me.seq }).eq('id', me.id)).error;
  const e2 = e1 ?? (await sb.from('course_steps').update({ seq: me.seq }).eq('id', other.id)).error;
  const e3 = e2 ?? (await sb.from('course_steps').update({ seq: other.seq }).eq('id', me.id)).error;
  if (e3) return NextResponse.json({ error: `순서 변경 실패: ${e3.message}` }, { status: 500 });
  return NextResponse.json({ ok: true });
}
