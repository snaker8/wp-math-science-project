// ============================================================================
// /api/textbooks/access — 관리자 전용: 선생님별 교재 권한 보기(GET)·바꾸기(PUT)
// ============================================================================

import { NextResponse } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isExpired, isTextbookManager, todayKst, validateAccessInput } from '@/lib/textbooks/access';

export const dynamic = 'force-dynamic';

const STAFF_ROLES = ['ADMIN', 'ORG_ADMIN', 'TEACHER', 'TUTOR'];

async function requireManager() {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed;
  const { user, scope } = authed.data;
  if (!isTextbookManager(user.role, scope.isSuperAdmin)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden', message: '교재 권한은 관리자만 정할 수 있습니다.' }, { status: 403 }),
    };
  }
  return authed;
}

export async function GET() {
  const authed = await requireManager();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const [staffRes, accessRes, instRes, dlRes] = await Promise.all([
    supabaseAdmin.from('users').select('id, full_name, email, role, institute_id')
      .in('role', STAFF_ROLES).is('deleted_at', null).order('full_name'),
    supabaseAdmin.from('textbook_access').select('user_id, can_middle, can_high, expires_at, updated_at, requested_at, requested_levels'),
    supabaseAdmin.from('institutes').select('id, name, display_name'),
    supabaseAdmin.from('textbook_downloads').select('user_id, created_at')
      .order('created_at', { ascending: false }).limit(2000),
  ]);
  const err = staffRes.error || accessRes.error || instRes.error;
  if (err) return NextResponse.json({ error: 'DB error', message: err.message }, { status: 500 });

  const access = new Map((accessRes.data ?? []).map((a) => [a.user_id as string, a]));
  const inst = new Map((instRes.data ?? []).map((i) => [i.id as string, (i.display_name as string) || (i.name as string)]));
  const lastDl = new Map<string, { at: string; count: number }>();
  for (const d of dlRes.data ?? []) {
    const k = d.user_id as string;
    const cur = lastDl.get(k);
    lastDl.set(k, { at: cur?.at ?? (d.created_at as string), count: (cur?.count ?? 0) + 1 });
  }
  const today = todayKst();

  const staff = (staffRes.data ?? []).map((u) => {
    const a = access.get(u.id as string);
    return {
      id: u.id,
      name: (u.full_name as string) || (u.email as string)?.split('@')[0] || '이름 없음',
      email: u.email,
      role: u.role,
      institute: u.institute_id ? inst.get(u.institute_id as string) ?? null : null,
      isManager: u.role === 'ADMIN',
      canMiddle: !!a?.can_middle,
      canHigh: !!a?.can_high,
      expiresAt: (a?.expires_at as string | null) ?? null,
      expired: isExpired((a?.expires_at as string | null) ?? null, today),
      requestedAt: (a?.requested_at as string | null) ?? null,
      requestedLevels: (a?.requested_levels as string[] | null) ?? [],
      lastDownloadAt: lastDl.get(u.id as string)?.at ?? null,
      downloadCount: lastDl.get(u.id as string)?.count ?? 0,
    };
  });

  return NextResponse.json({ staff, today });
}

export async function PUT(req: Request) {
  const authed = await requireManager();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const parsed = validateAccessInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: 'Bad request', message: parsed.message }, { status: 400 });
  const v = parsed.value;

  const { data: target } = await supabaseAdmin.from('users').select('id, role')
    .eq('id', v.userId).is('deleted_at', null).maybeSingle();
  if (!target || !STAFF_ROLES.includes(target.role as string)) {
    return NextResponse.json({ error: 'Not found', message: '선생님 계정을 찾을 수 없습니다.' }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from('textbook_access').upsert({
    user_id: v.userId,
    can_middle: v.canMiddle,
    can_high: v.canHigh,
    expires_at: v.expiresAt,
    granted_by: authed.data.user.id,
    requested_at: null, // 관리자가 정했으니 요청은 처리됨
    requested_levels: null,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: 'DB error', message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, ...v, expired: isExpired(v.expiresAt, todayKst()) });
}
