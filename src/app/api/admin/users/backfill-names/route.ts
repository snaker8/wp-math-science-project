// ============================================================================
// POST /api/admin/users/backfill-names
//
// public.users.full_name/name 둘 다 빈 사용자를 일괄 식별 →
// auth.users.raw_user_meta_data.full_name 에서 가져와 public.users 박음.
//
// 사용처: dashboard/grading 의 "(이름 없음)" 학생 일괄 복구 버튼.
//
// 권한: ADMIN / TUTOR / TEACHER / ORG_ADMIN / super_admin — 자기 institute 한정.
//       (super_admin 은 전체 user 처리 가능).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(_request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  const allowedRoles = ['ADMIN', 'TUTOR', 'TEACHER', 'ORG_ADMIN'];
  if (!user.role || (!allowedRoles.includes(user.role) && !scope.isSuperAdmin)) {
    return NextResponse.json({ error: 'Forbidden — 권한 없음' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  // 1) 사용자 목록 조회 — institute 격리 (super_admin 제외)
  //   ★ 이전 코드의 `.or('full_name.is.null,full_name.eq.')` 는 PostgREST 가
  //   빈 값 파싱 못 해 500 반환 (사용자 보고: "이름 복구 실패뜬다").
  //   대신 전체 조회 후 client 에서 filter — 학원당 수십~수백명 한도면 무관.
  let query = sb
    .from('users')
    .select('id, full_name, name, institute_id, email, role')
    .eq('role', 'STUDENT');

  if (!scope.isSuperAdmin) {
    const accessibleIds = scope.accessibleInstituteIds || [];
    if (accessibleIds.length === 0) {
      return NextResponse.json({
        ok: true, scanned: 0, updated: 0, skippedNoMeta: 0,
        message: 'accessible institute 없음',
      });
    }
    query = query.in('institute_id', accessibleIds);
  }

  const { data: candidates, error: qErr } = await query;
  if (qErr) {
    console.error('[backfill-names] users query error:', qErr);
    return NextResponse.json(
      { error: `사용자 조회 실패: ${qErr.message}`, details: qErr.details, hint: qErr.hint },
      { status: 500 }
    );
  }

  const targets = ((candidates || []) as Array<{
    id: string; full_name?: string | null; name?: string | null; institute_id?: string; email?: string;
  }>).filter((u) => {
    const fn = (u.full_name || '').trim();
    const nm = (u.name || '').trim();
    return !fn && !nm;
  });

  if (targets.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, updated: 0, skippedNoMeta: 0 });
  }

  // 2) 각 user 의 auth metadata 조회 + UPDATE
  let updated = 0;
  let skippedNoMeta = 0;
  const sample: Array<{ id: string; full_name: string; email?: string }> = [];

  // Promise.all 병렬 — 작업량 보통 수십~수백명 한도
  await Promise.all(
    targets.map(async (u) => {
      try {
        const { data: authUser } = await sb.auth.admin.getUserById(u.id);
        const meta = (authUser?.user?.user_metadata || {}) as Record<string, unknown>;
        const metaName = typeof meta.full_name === 'string' ? meta.full_name.trim() : '';
        if (!metaName) {
          skippedNoMeta++;
          return;
        }
        const { error: upErr } = await sb.from('users').update({ full_name: metaName }).eq('id', u.id);
        if (upErr) {
          console.warn(`[backfill-names] update 실패 ${u.id}:`, upErr.message);
          return;
        }
        updated++;
        if (sample.length < 10) sample.push({ id: u.id, full_name: metaName, email: u.email });
      } catch (e) {
        console.warn(`[backfill-names] auth.getUserById(${u.id}) 실패:`, (e as Error).message);
      }
    }),
  );

  console.log(
    `[backfill-names] scope=${scope.isSuperAdmin ? 'super' : 'institute'} ` +
    `scanned=${targets.length} updated=${updated} skippedNoMeta=${skippedNoMeta}`
  );

  return NextResponse.json({
    ok: true,
    scanned: targets.length,
    updated,
    skippedNoMeta,
    sample,
  });
}
