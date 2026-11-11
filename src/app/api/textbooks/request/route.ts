// ============================================================================
// POST /api/textbooks/request — 선생님이 수학교재 권한을 요청 (관리자 화면에 「요청」으로 뜸)
// ============================================================================
//
// 권한(can_*)은 건드리지 않는다. 요청 시각·학교급만 남긴다. 관리자가 권한을 저장하면 요청은 지워진다.

import { NextResponse } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isTextbookManager, validateRequestLevels } from '@/lib/textbooks/access';

export const dynamic = 'force-dynamic';

const STAFF_ROLES = ['ORG_ADMIN', 'TEACHER', 'TUTOR'];

export async function POST(req: Request) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const { user, scope } = authed.data;

  if (isTextbookManager(user.role, scope.isSuperAdmin)) {
    return NextResponse.json({ error: 'Bad request', message: '관리자는 요청 없이 모두 받을 수 있습니다.' }, { status: 400 });
  }
  if (!user.role || !STAFF_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden', message: '선생님 계정만 요청할 수 있습니다.' }, { status: 403 });
  }
  const parsed = validateRequestLevels(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: 'Bad request', message: parsed.message }, { status: 400 });

  const now = new Date().toISOString();
  const { data: existing } = await supabaseAdmin.from('textbook_access')
    .select('user_id').eq('user_id', user.id).maybeSingle();
  const { error } = existing
    ? await supabaseAdmin.from('textbook_access')
      .update({ requested_at: now, requested_levels: parsed.levels }).eq('user_id', user.id)
    : await supabaseAdmin.from('textbook_access')
      .insert({ user_id: user.id, can_middle: false, can_high: false, requested_at: now, requested_levels: parsed.levels });
  if (error) return NextResponse.json({ error: 'DB error', message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, request: { at: now, levels: parsed.levels } });
}
