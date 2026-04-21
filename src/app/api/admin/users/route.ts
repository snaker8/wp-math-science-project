import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Role = 'ADMIN' | 'TEACHER' | 'TUTOR' | 'STUDENT' | 'PARENT';

export async function GET(req: NextRequest) {
  const authed = await requireAuth();
  if (!authed.ok) return authed.response;

  const { user } = authed;
  const isPlatformAdmin = user.role === 'ADMIN';
  const isAcademyAdmin =
    user.role === 'TEACHER' || user.role === 'TUTOR';

  if (!isPlatformAdmin && !isAcademyAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase admin client unavailable' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const role = searchParams.get('role') as Role | null;
  const search = searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(Number(searchParams.get('limit') ?? 200), 500);

  let query = supabaseAdmin
    .from('users')
    .select(
      'id, email, full_name, phone, role, institute_id, preferences, last_login_at, created_at',
      { count: 'exact' }
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  // 플랫폼 ADMIN이 아니면 본인 학원으로 스코프 제한
  if (!isPlatformAdmin && user.instituteId) {
    query = query.eq('institute_id', user.instituteId);
  }

  if (role) query = query.eq('role', role);
  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = (data ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    phone: u.phone,
    role: u.role,
    instituteId: u.institute_id,
    isAcademyAdmin:
      (u.preferences as Record<string, unknown> | null)?.isAcademyAdmin ===
      true,
    lastLoginAt: u.last_login_at,
    createdAt: u.created_at,
  }));

  return NextResponse.json({ users, total: count ?? users.length });
}
