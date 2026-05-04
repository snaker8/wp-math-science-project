// ============================================================================
// /api/admin/tenancy/users/[userId]
// PATCH — 사용자 institute / organization / role 배정 (super_admin 만)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

const VALID_ROLES = ['ADMIN', 'TEACHER', 'TUTOR', 'STUDENT', 'PARENT', 'ORG_ADMIN'] as const;
type Role = (typeof VALID_ROLES)[number];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;
  if (!scope.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden — super_admin only' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { userId } = await params;

  let body: { role?: string; institute_id?: string | null; organization_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role as Role)) {
      return NextResponse.json({ error: `role 은 ${VALID_ROLES.join('|')} 중 하나` }, { status: 400 });
    }
    updates.role = body.role;
  }

  if (body.institute_id !== undefined) {
    if (body.institute_id !== null) {
      // 검증: institute 존재
      const { data: inst } = await supabaseAdmin
        .from('institutes')
        .select('id, organization_id')
        .eq('id', body.institute_id)
        .maybeSingle();
      if (!inst) {
        return NextResponse.json({ error: 'institute 를 찾을 수 없습니다' }, { status: 400 });
      }
      updates.institute_id = body.institute_id;
    } else {
      updates.institute_id = null;
    }
  }

  if (body.organization_id !== undefined) {
    if (body.organization_id !== null) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('id', body.organization_id)
        .maybeSingle();
      if (!org) {
        return NextResponse.json({ error: 'organization 을 찾을 수 없습니다' }, { status: 400 });
      }
      updates.organization_id = body.organization_id;
    } else {
      updates.organization_id = null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '변경할 필드 없음' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select('id, email, full_name, role, institute_id, organization_id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}
