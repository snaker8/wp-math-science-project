// ============================================================================
// GET /api/classes/[classId]/teachers — 이 반의 담당으로 고를 수 있는 강사 목록
// ----------------------------------------------------------------------------
// 매쓰홀릭 설정 탭 「담당/부담당 변경」 대응. 반이 속한 센터(institute)의 강사·관리자만.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

interface RouteParams { params: Promise<{ classId: string }> }
const TEACHER_ROLES = ['TEACHER', 'ADMIN', 'ORG_ADMIN', 'TUTOR'];

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { classId } = await params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;

  const { data: cls } = await sb.from('classes').select('id, institute_id, tutor_id').eq('id', classId).is('deleted_at', null).maybeSingle();
  if (!cls) return NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 });
  const c = cls as { id: string; institute_id: string | null; tutor_id: string | null };
  try { assertInstituteAccess(authed.data.scope, c.institute_id); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  let q = sb.from('users').select('id, full_name, email, role').in('role', TEACHER_ROLES).order('full_name');
  if (c.institute_id) q = q.eq('institute_id', c.institute_id);
  const { data } = await q;
  const teachers = ((data ?? []) as Array<{ id: string; full_name: string | null; email: string | null; role: string }>)
    .map((u) => ({ id: u.id, name: u.full_name || u.email?.split('@')[0] || '(이름 없음)', role: u.role, current: u.id === c.tutor_id }));
  // 현재 담당이 목록에 없으면(다른 센터·역할) 맨 앞에 넣는다 — 화면에서 사라지면 안 된다
  if (c.tutor_id && !teachers.some((t) => t.id === c.tutor_id)) {
    const { data: t } = await sb.from('users').select('id, full_name, email, role').eq('id', c.tutor_id).maybeSingle();
    if (t) {
      const u = t as { id: string; full_name: string | null; email: string | null; role: string };
      teachers.unshift({ id: u.id, name: u.full_name || u.email?.split('@')[0] || '(이름 없음)', role: u.role, current: true });
    }
  }
  return NextResponse.json({ teachers });
}
