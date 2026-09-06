// ============================================================================
// /api/classes/[classId]/students/[studentId]/learning-report — 학부모 학습 리포트 링크
//   GET  발급 내역 (report_kind='learning')
//   POST { days: 1|7|30, label? } → parent_share_tokens 에 발급, /share/learning/[token]
// ----------------------------------------------------------------------------
// 매쓰홀릭 학생 화면 「일일 학습 리포트 학부모 발송」(09 §5-2: daily-learning-report/send · shortUrl) 대응.
// 우리는 문자 발송 대신 링크를 만든다 — 교사가 카카오톡·문자에 붙여 보낸다. 회수는 report-tokens DELETE(parent_token).
// set_key 에 기간을 적는다: 'days:7'. 링크를 열 때마다 그 시점 기준 최근 N일을 다시 계산한다(살아 있는 리포트).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import { resolveClassStudents } from '@/lib/class/class-students';

export const dynamic = 'force-dynamic';

interface RouteParams { params: Promise<{ classId: string; studentId: string }> }
const DAYS = [1, 7, 30];

async function guard(classId: string, studentId: string, scope: Parameters<typeof assertInstituteAccess>[0]) {
  const sb = supabaseAdmin!;
  const { data: cls } = await sb.from('classes').select('id, institute_id').eq('id', classId).is('deleted_at', null).maybeSingle();
  if (!cls) return { ok: false as const, res: NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 }) };
  const c = cls as { id: string; institute_id: string | null };
  try { assertInstituteAccess(scope, c.institute_id); } catch { return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }; }
  const roster = await resolveClassStudents(sb, classId);
  if (!roster.studentIds.includes(studentId)) return { ok: false as const, res: NextResponse.json({ error: '이 반 학생이 아닙니다' }, { status: 404 }) };
  return { ok: true as const, refs: roster.refsByStudent.get(studentId) ?? [studentId] };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { classId, studentId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const g = await guard(classId, studentId, authed.data.scope);
  if (!g.ok) return g.res;
  const { data } = await supabaseAdmin
    .from('parent_share_tokens').select('token, set_key, label, is_active, expires_at, created_at, last_viewed_at')
    .in('student_id', g.refs).eq('report_kind', 'learning').order('created_at', { ascending: false }).limit(50);
  const origin = new URL(req.url).origin;
  const items = ((data ?? []) as Array<{ token: string; set_key: string | null; label: string | null; is_active: boolean; expires_at: string | null; created_at: string; last_viewed_at: string | null }>)
    .map((r) => ({
      token: r.token, days: Number((r.set_key ?? '').replace('days:', '')) || 7, label: r.label,
      isActive: r.is_active, expiresAt: r.expires_at, createdAt: r.created_at, lastViewedAt: r.last_viewed_at,
      url: `${origin}/share/learning/${r.token}`,
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
  let body: { days?: unknown; label?: unknown; expiresAt?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const days = DAYS.includes(Number(body.days)) ? Number(body.days) : 7;
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 60) : null;
  const expiresAt = typeof body.expiresAt === 'string' && !Number.isNaN(Date.parse(body.expiresAt)) ? new Date(body.expiresAt).toISOString() : null;
  const token = randomBytes(24).toString('hex');
  const { error } = await supabaseAdmin.from('parent_share_tokens').insert({
    token, student_id: studentId, set_key: `days:${days}`, exam_ids: classId,   // exam_ids 자리에 반 id — 리포트가 반의 코스 진행도를 알아야 한다
    report_kind: 'learning', label: label || (days === 1 ? '일일 학습 리포트' : `최근 ${days}일 학습 리포트`),
    expires_at: expiresAt, is_active: true, created_by: authed.data.user.id ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const origin = new URL(req.url).origin;
  return NextResponse.json({ token, url: `${origin}/share/learning/${token}`, days }, { status: 201 });
}
