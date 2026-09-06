// ============================================================================
// /api/classes/[classId]/courses/[courseId]
//   PATCH { title?, issueMode?, perStep?, keyFirst? }  · DELETE (소프트) — 낸 회차의 과제는 그대로 남는다
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { loadCourse } from '@/lib/class/course-guard';

export const dynamic = 'force-dynamic';

interface RouteParams { params: Promise<{ classId: string; courseId: string }> }

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { classId, courseId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const g = await loadCourse(classId, courseId, authed.data.scope);
  if (!g.ok) return g.res;
  let body: { title?: unknown; issueMode?: unknown; perStep?: unknown; keyFirst?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 80);
  const settings = { ...(g.course.settings ?? {}) };
  if (body.issueMode === 'common' || body.issueMode === 'personal') settings.issueMode = body.issueMode;
  if (typeof body.keyFirst === 'boolean') settings.keyFirst = body.keyFirst;
  if (body.perStep != null) settings.perStep = Math.min(30, Math.max(3, Math.round(Number(body.perStep) || 10)));
  patch.settings = settings;
  const { error } = await supabaseAdmin.from('courses').update(patch).eq('id', courseId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { classId, courseId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const g = await loadCourse(classId, courseId, authed.data.scope);
  if (!g.ok) return g.res;
  const { error } = await supabaseAdmin.from('courses').update({ deleted_at: new Date().toISOString() }).eq('id', courseId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
