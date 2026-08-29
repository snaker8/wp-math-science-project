// ============================================================================
// 계정 보관(퇴원·퇴사) 처리 — POST 보관 / DELETE 복구
// ----------------------------------------------------------------------------
// ★ 삭제가 아니라 보관이다 (2026-08-29 사용자 지시 "퇴원이면 선생님 계정도 정리").
//   users.deleted_at 만 채운다 — 성적·채점·진단 이력은 계정 id 로 물려 있어서
//   실제 삭제하면 과거 리포트가 깨지고 재등록 시 복구가 불가능하다.
//   보관되면: 목록에서 제외 + 로그인 차단(middleware) + API 차단(institute-guard).
//
// 권한: super_admin / ADMIN / ORG_ADMIN. 자기 접근 범위(센터) 안의 계정만.
//   ※ 자기 자신은 보관 불가 — 관리자가 스스로를 잠그는 사고 차단.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

async function loadTarget(userId: string) {
  if (!supabaseAdmin) return { error: 'Database not configured' as const, row: null };
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, full_name, role, institute_id, deleted_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { error: error.message, row: null };
  if (!data) return { error: '대상 계정을 찾을 수 없습니다.', row: null };
  return { error: null, row: data as { id: string; full_name: string; role: string; institute_id: string | null; deleted_at: string | null } };
}

/** 보관/복구 공통 가드 — 권한·자기자신·센터 범위 */
async function guard(userId: string) {
  const authed = await requireAuthScope();
  if (!authed.ok) return { denied: authed.response, scope: null, target: null };
  const { scope } = authed.data;

  const isApprover = scope.isSuperAdmin || scope.role === 'ADMIN' || scope.role === 'ORG_ADMIN';
  if (!isApprover) {
    return {
      denied: NextResponse.json({ error: '계정 정리는 관리자만 가능합니다.' }, { status: 403 }),
      scope: null, target: null,
    };
  }
  if (scope.userId === userId) {
    return {
      denied: NextResponse.json({ error: '본인 계정은 보관할 수 없습니다.' }, { status: 400 }),
      scope: null, target: null,
    };
  }

  const { error, row } = await loadTarget(userId);
  if (error || !row) {
    return { denied: NextResponse.json({ error: error ?? '대상 없음' }, { status: 404 }), scope: null, target: null };
  }
  try {
    assertInstituteAccess(scope, row.institute_id);
  } catch {
    return {
      denied: NextResponse.json({ error: '다른 학원·센터의 계정은 정리할 수 없습니다.' }, { status: 403 }),
      scope: null, target: null,
    };
  }
  return { denied: null, scope, target: row };
}

/** POST — 보관 처리 (퇴원·퇴사) */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const { denied, target } = await guard(userId);
  if (denied) return denied;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  if (target!.deleted_at) {
    return NextResponse.json({ ok: true, alreadyArchived: true, name: target!.full_name });
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, name: target!.full_name, role: target!.role });
}

/** DELETE — 보관 해제 (복귀·재등록) */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const { denied, target } = await guard(userId);
  if (denied) return denied;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const { error } = await supabaseAdmin
    .from('users')
    .update({ deleted_at: null })
    .eq('id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, name: target!.full_name, restored: true });
}
