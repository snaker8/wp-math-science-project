// ============================================================================
// /api/me/active-institute
//
// GET  — 현재 활성 institute + 접근 가능 institute 목록 반환
// POST — 활성 institute 변경 (쿠키 set, 권한 검증)
//
// 클라이언트는 변경 후 router.refresh() 로 서버 컴포넌트 다시 렌더.
// 쿠키 이름: active_institute_id (lib/security/active-institute.ts 참조)
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { requireAuthScope } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import {
  ACTIVE_INSTITUTE_COOKIE,
  canAccessInstitute,
  readActiveInstituteCookie,
} from '@/lib/security/active-institute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface InstituteRow {
  id: string;
  name: string;
  display_name: string | null;
  hidden: boolean;
  organization_id: string | null;
}

const COLS = 'id, name, display_name, hidden, organization_id';

async function fetchAccessibleInstitutes(
  scope: Awaited<ReturnType<typeof requireAuthScope>>
): Promise<InstituteRow[]> {
  if (!scope.ok || !supabaseAdmin) return [];
  const s = scope.data.scope;

  let rows: InstituteRow[] = [];

  if (s.isSuperAdmin) {
    // super_admin 이라도 자기 organization 산하만 기본 노출 (다른 학원 노이즈 제거)
    // organization_id 없는 시스템 관리자만 모든 institute
    if (s.organizationId) {
      const { data } = await supabaseAdmin
        .from('institutes')
        .select(COLS)
        .eq('organization_id', s.organizationId)
        .order('name', { ascending: true });
      rows = (data ?? []) as InstituteRow[];
    } else {
      const { data } = await supabaseAdmin
        .from('institutes')
        .select(COLS)
        .order('name', { ascending: true });
      rows = (data ?? []) as InstituteRow[];
    }
  } else {
    // ORG_ADMIN 또는 일반 user — accessibleInstituteIds 사용
    const ids = s.accessibleInstituteIds ?? [];
    if (ids.length === 0) return [];
    const { data } = await supabaseAdmin
      .from('institutes')
      .select(COLS)
      .in('id', ids)
      .order('name', { ascending: true });
    rows = (data ?? []) as InstituteRow[];
  }

  // hidden=true 인 institute 는 드롭다운에서 제외
  return rows.filter((r) => !r.hidden);
}

export async function GET() {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  const list = await fetchAccessibleInstitutes(authed);

  // 활성 ID 결정: 쿠키 우선 (권한 통과한 것만) → 본인 institute → 첫 항목
  const cookieVal = readActiveInstituteCookie();
  let activeId: string | null = null;
  if (cookieVal && canAccessInstitute(scope, cookieVal)) {
    activeId = cookieVal;
  } else if (scope.instituteId && list.some((i) => i.id === scope.instituteId)) {
    activeId = scope.instituteId;
  } else if (list.length > 0) {
    activeId = list[0].id;
  }

  const activeInst = list.find((i) => i.id === activeId);
  const activeName = activeInst
    ? (activeInst.display_name ?? activeInst.name)
    : null;

  return NextResponse.json({
    activeInstituteId: activeId,
    activeInstituteName: activeName,
    institutes: list.map((i) => ({
      id: i.id,
      // 표시명 우선순위: display_name → name
      name: i.display_name ?? i.name,
      organizationId: i.organization_id,
    })),
    canSwitch: list.length > 1,
  });
}

export async function POST(req: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  let body: { instituteId?: string };
  try {
    body = (await req.json()) as { instituteId?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const instituteId = (body.instituteId ?? '').trim();
  if (!instituteId) {
    return NextResponse.json(
      { error: 'instituteId 필수' },
      { status: 400 }
    );
  }
  if (!canAccessInstitute(scope, instituteId)) {
    return NextResponse.json(
      { error: '해당 학원에 접근 권한이 없습니다.' },
      { status: 403 }
    );
  }

  // 쿠키 set — httpOnly=false (클라 표시용 fallback 필요 시 읽음), 1년
  cookies().set(ACTIVE_INSTITUTE_COOKIE, instituteId, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.json({ ok: true, activeInstituteId: instituteId });
}
