// ============================================================================
// /api/admin/teachers/[teacherId] — 강사 계정 보관(소프트 삭제) / 복구 / 영향 조회
// ============================================================================
//
// ★ 왜 소프트 삭제인가 — 하드 삭제는 데이터를 연쇄로 지운다 (실측)
//     classes.tutor_id            → ON DELETE CASCADE   (그 강사의 반이 통째로 삭제)
//     class_enrollments.class_id  → 반이 지워지면 수강 정보도 함께 사라짐
//   즉 계정 하나를 지우면 반과 수강 이력이 같이 날아간다. 복구 수단도 없다.
//   반면 users.deleted_at 을 채우면
//     - 미들웨어가 로그인을 차단하고 (src/lib/supabase/middleware.ts:159)
//     - 권한 가드가 접근을 거부한다 (src/lib/security/institute-guard.ts:137)
//   반·문제·시험지는 그대로 남는다. 되돌리기도 한 번에 된다.
//   → 화면에서 "삭제" 라고 부르되 실제 동작은 **보관**이다.
//
// ★ 가드
//   - /admin 전체가 플랫폼 관리자(super_admin) 전용이므로 여기도 requireSuperAdmin
//   - 자기 자신은 못 지운다 (로그인 수단을 스스로 끊는 사고 방지)
//   - 다른 플랫폼 관리자도 못 지운다 (관리자 상호 잠금 방지)
//   - 학생(STUDENT)·학부모(PARENT)는 이 엔드포인트로 처리하지 않는다 (전용 화면이 따로 있음)

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/guard';
import { bustUserScopeCache } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

/** 대상이 지워도 되는 사람인지 확인. 통과하면 사용자 행을 돌려준다. */
async function loadDeletableTarget(teacherId: string, actorId: string) {
  if (!supabaseAdmin) {
    return { error: NextResponse.json({ error: 'Supabase not configured' }, { status: 503 }) };
  }
  if (teacherId === actorId) {
    return {
      error: NextResponse.json(
        { error: 'SelfDelete', message: '본인 계정은 보관할 수 없습니다.' },
        { status: 400 }
      ),
    };
  }

  const { data: target, error } = await supabaseAdmin
    .from('users')
    .select('id, email, full_name, role, institute_id, deleted_at, preferences')
    .eq('id', teacherId)
    .maybeSingle();

  if (error) {
    console.error('[admin/teachers] 대상 조회 실패:', error.message);
    return { error: NextResponse.json({ error: 'QueryFailed', detail: error.message }, { status: 500 }) };
  }
  if (!target) {
    return { error: NextResponse.json({ error: 'NotFound', message: '대상을 찾을 수 없습니다.' }, { status: 404 }) };
  }

  // 다른 플랫폼 관리자는 보호 — app_metadata 는 service_role 로만 읽힌다.
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(teacherId);
  if ((authUser?.user?.app_metadata as Record<string, unknown> | undefined)?.super_admin === true) {
    return {
      error: NextResponse.json(
        { error: 'ProtectedAccount', message: '플랫폼 관리자 계정은 보관할 수 없습니다.' },
        { status: 403 }
      ),
    };
  }

  return { target };
}

/** 보관 시 영향 범위 — 화면에서 확인창에 그대로 보여준다. */
async function loadImpact(teacherId: string) {
  const count = async (table: string, column: string) => {
    const { count: n } = await supabaseAdmin!
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, teacherId);
    return n ?? 0;
  };
  const [classes, exams, problems] = await Promise.all([
    count('classes', 'tutor_id'),
    count('exams', 'created_by'),
    count('problems', 'created_by'),
  ]);
  return { classes, exams, problems };
}

/** GET — 보관 전 영향 범위 조회 (확인창용). 아무것도 바꾸지 않는다. */
export async function GET(_req: NextRequest, { params }: { params: { teacherId: string } }) {
  const authed = await requireSuperAdmin();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const { target, error } = await loadDeletableTarget(params.teacherId, authed.data.user.id);
  if (error) return error;

  return NextResponse.json({
    teacher: {
      id: target!.id,
      name: target!.full_name,
      email: target!.email,
      archived: !!target!.deleted_at,
      isAcademyAdmin: ((target!.preferences as Record<string, unknown>) ?? {}).isAcademyAdmin === true,
    },
    impact: await loadImpact(params.teacherId),
  });
}

/**
 * DELETE — 보관(소프트 삭제). 반·시험지·문제는 남는다.
 *
 * body(선택): { reassignTo?: string }
 *   담당 반을 다른 강사에게 넘긴다. 퇴사자가 담당으로 남아 있으면 반 목록·수업 배정이
 *   실제 운영과 어긋나므로, 보관과 같은 요청에서 한 번에 처리한다.
 *   생략하면 반은 그대로 퇴사자에게 남는다(자료 보존 우선 — 임의로 떼지 않는다).
 */
export async function DELETE(req: NextRequest, { params }: { params: { teacherId: string } }) {
  const authed = await requireSuperAdmin();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const { target, error } = await loadDeletableTarget(params.teacherId, authed.data.user.id);
  if (error) return error;
  if (target!.deleted_at) {
    return NextResponse.json({ ok: true, alreadyArchived: true, teacher: { id: target!.id } });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const reassignTo = typeof body.reassignTo === 'string' && body.reassignTo ? body.reassignTo : null;

  const impact = await loadImpact(params.teacherId);

  // ★ 담당 반 이관 — 보관보다 **먼저** 한다.
  //   순서를 뒤집으면 이관이 실패했을 때 "로그인은 막혔는데 반은 퇴사자 소유" 인
  //   어중간한 상태로 남는다. 이관이 실패하면 보관 자체를 중단하는 편이 낫다.
  let reassignedClasses = 0;
  if (reassignTo) {
    if (reassignTo === params.teacherId) {
      return NextResponse.json(
        { error: 'InvalidTarget', message: '같은 강사에게는 이관할 수 없습니다.' },
        { status: 400 }
      );
    }
    // 인수자는 살아있는 강사여야 한다 (보관된 계정·학생에게 넘기면 안 됨).
    const { data: successor } = await supabaseAdmin
      .from('users')
      .select('id, full_name, role, deleted_at')
      .eq('id', reassignTo)
      .maybeSingle();
    if (!successor || successor.deleted_at || !['TEACHER', 'ORG_ADMIN'].includes(successor.role ?? '')) {
      return NextResponse.json(
        { error: 'InvalidSuccessor', message: '이관 받을 강사를 찾을 수 없습니다(보관된 계정은 불가).' },
        { status: 400 }
      );
    }

    const { error: reErr, count } = await supabaseAdmin
      .from('classes')
      .update({ tutor_id: reassignTo }, { count: 'exact' })
      .eq('tutor_id', params.teacherId);
    if (reErr) {
      console.error('[admin/teachers] 반 이관 실패 — 보관 중단:', reErr.message, reErr.details);
      return NextResponse.json(
        { error: 'ReassignFailed', message: `담당 반 이관에 실패해 보관을 중단했습니다: ${reErr.message}` },
        { status: 500 }
      );
    }
    reassignedClasses = count ?? 0;
    console.log(`[admin/teachers] 반 ${reassignedClasses}개 이관 ${target!.email} → ${successor.full_name}`);
  }

  // ★ 퇴사 처리는 "로그인 차단" 만으로 끝나지 않는다. 관리자 권한도 같이 걷는다.
  //   안 걷으면 (1) 보관 상태에서도 권한 보유자로 남고 (2) 나중에 복구했을 때
  //   퇴사 전 권한을 그대로 되찾는다. 둘 다 사고다.
  const { data: current } = await supabaseAdmin
    .from('users')
    .select('preferences')
    .eq('id', params.teacherId)
    .maybeSingle();
  const prefs = ((current?.preferences as Record<string, unknown>) ?? {});
  const hadAdmin = prefs.isAcademyAdmin === true;

  const { error: updErr } = await supabaseAdmin
    .from('users')
    .update({
      deleted_at: new Date().toISOString(),
      preferences: { ...prefs, isAcademyAdmin: false },
    })
    .eq('id', params.teacherId);

  if (updErr) {
    console.error('[admin/teachers] 보관 실패:', updErr.message, updErr.details);
    return NextResponse.json({ error: 'UpdateFailed', detail: updErr.message }, { status: 500 });
  }

  // 권한 캐시(60초 TTL)를 즉시 비워 다음 요청부터 차단되게 한다.
  bustUserScopeCache(params.teacherId);
  console.log(
    `[admin/teachers] 보관 ${target!.email} (반 ${impact.classes} · 시험지 ${impact.exams} · 문제 ${impact.problems}` +
    `${hadAdmin ? ' · 관리자 권한 해제' : ''}` +
    `${reassignedClasses ? ` · 반 ${reassignedClasses}개 이관` : ''}) by ${authed.data.user.id}`
  );

  return NextResponse.json({
    ok: true,
    teacher: { id: target!.id, name: target!.full_name, email: target!.email },
    impact,
    adminRevoked: hadAdmin,
    reassignedClasses,
  });
}

/**
 * POST — 복구. 보관을 되돌린다.
 * ★ 관리자 권한은 되살리지 않는다 — 보관 시 해제된 상태 그대로 돌아온다.
 *   재입사자에게 예전 권한이 자동으로 붙으면 안 된다. 필요하면 화면에서 다시 부여한다.
 */
export async function POST(_req: NextRequest, { params }: { params: { teacherId: string } }) {
  const authed = await requireSuperAdmin();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const { error: updErr } = await supabaseAdmin
    .from('users')
    .update({ deleted_at: null })
    .eq('id', params.teacherId);

  if (updErr) {
    console.error('[admin/teachers] 복구 실패:', updErr.message);
    return NextResponse.json({ error: 'UpdateFailed', detail: updErr.message }, { status: 500 });
  }

  bustUserScopeCache(params.teacherId);
  console.log(`[admin/teachers] 복구 ${params.teacherId} by ${authed.data.user.id}`);
  return NextResponse.json({ ok: true, restored: true });
}
