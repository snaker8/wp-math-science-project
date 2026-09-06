// ============================================================================
// /api/classes/[classId]/students/[studentId]/counsellings — 상담 기록
//   GET · POST { target, method, content, counselledAt? } · DELETE ?id=
// 매쓰홀릭 학생 화면 「상담 기록」(대상 학부모/학생 · 방법 전화/직접/기타 · 내용 · 일시) 대응.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import { resolveClassStudents } from '@/lib/class/class-students';

export const dynamic = 'force-dynamic';

interface RouteParams { params: Promise<{ classId: string; studentId: string }> }

export interface Counselling {
  id: string;
  target: 'parent' | 'student';
  method: 'phone' | 'visit' | 'other';
  content: string;
  counselledAt: string;
  createdBy: string | null;
  createdByName: string | null;
  mine: boolean;
}

async function guard(classId: string, studentId: string, scope: Parameters<typeof assertInstituteAccess>[0]) {
  const sb = supabaseAdmin!;
  const { data: cls } = await sb.from('classes').select('id, institute_id').eq('id', classId).is('deleted_at', null).maybeSingle();
  if (!cls) return { ok: false as const, res: NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 }) };
  const c = cls as { id: string; institute_id: string | null };
  try { assertInstituteAccess(scope, c.institute_id); } catch { return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }; }
  const roster = await resolveClassStudents(sb, classId);
  if (!roster.studentIds.includes(studentId)) return { ok: false as const, res: NextResponse.json({ error: '이 반 학생이 아닙니다' }, { status: 404 }) };
  return { ok: true as const, cls: c, refs: roster.refsByStudent.get(studentId) ?? [studentId] };
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { classId, studentId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const g = await guard(classId, studentId, authed.data.scope);
  if (!g.ok) return g.res;
  const { data } = await supabaseAdmin
    .from('student_counsellings').select('id, target, method, content, counselled_at, created_by')
    .in('student_id', g.refs).is('deleted_at', null).order('counselled_at', { ascending: false }).limit(200);
  const rows = (data ?? []) as Array<{ id: string; target: Counselling['target']; method: Counselling['method']; content: string; counselled_at: string; created_by: string | null }>;
  const authorIds = Array.from(new Set(rows.map((r) => r.created_by).filter((x): x is string => !!x)));
  const nameOf = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: us } = await supabaseAdmin.from('users').select('id, full_name, email').in('id', authorIds);
    for (const u of (us ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) nameOf.set(u.id, u.full_name || u.email?.split('@')[0] || '');
  }
  const items: Counselling[] = rows.map((r) => ({
    id: r.id, target: r.target, method: r.method, content: r.content, counselledAt: r.counselled_at,
    createdBy: r.created_by, createdByName: r.created_by ? nameOf.get(r.created_by) ?? null : null, mine: r.created_by === authed.data.user.id,
  }));
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { classId, studentId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const g = await guard(classId, studentId, authed.data.scope);
  if (!g.ok) return g.res;
  let body: { target?: unknown; method?: unknown; content?: unknown; counselledAt?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const target = body.target === 'student' ? 'student' : 'parent';
  const method = body.method === 'visit' ? 'visit' : body.method === 'other' ? 'other' : 'phone';
  const content = typeof body.content === 'string' ? body.content.trim().slice(0, 2000) : '';
  if (!content) return NextResponse.json({ error: '상담 내용을 적으세요' }, { status: 400 });
  const counselledAt = typeof body.counselledAt === 'string' && !Number.isNaN(Date.parse(body.counselledAt)) ? new Date(body.counselledAt).toISOString() : new Date().toISOString();
  const { data, error } = await supabaseAdmin.from('student_counsellings').insert({
    institute_id: g.cls.institute_id, class_id: classId, student_id: studentId,
    target, method, content, counselled_at: counselledAt, created_by: authed.data.user.id,
  }).select('id').single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? '저장 실패' }, { status: 500 });
  return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { classId, studentId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const g = await guard(classId, studentId, authed.data.scope);
  if (!g.ok) return g.res;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다' }, { status: 400 });
  const { error } = await supabaseAdmin.from('student_counsellings')
    .update({ deleted_at: new Date().toISOString() }).eq('id', id).in('student_id', g.refs);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
