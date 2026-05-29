// ============================================================================
// GET /api/me/scope — 사용자 organization·institute 정보 반환
//
// 클라이언트 hook (useUserScope) 가 호출해서 TopNav·클라우드 라벨 등에 표시.
// 운영 사용자(외부팀 ORG_ADMIN 포함)도 자기 organization 정보 OK — 격리는
// institute-guard 가 처리 (다른 org 데이터 노출 안 됨).
//
// 응답:
//   {
//     organizationId, organizationName,    // 학원명 — 클라우드 prefix 등 표시용
//     instituteId, instituteName,          // 센터명
//     role, isSuperAdmin
//   }
// ============================================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { apiError } from '@/lib/api/error';
import {
  readActiveInstituteCookie,
  canAccessInstitute,
} from '@/lib/security/active-institute';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  // 활성 institute_id 결정 — 쿠키(TopNav 활성 센터) 우선, 권한 검증 통과한 것만
  let effectiveInstituteId: string | null = user.instituteId;
  const cookieVal = readActiveInstituteCookie();
  if (cookieVal && canAccessInstitute(scope, cookieVal)) {
    effectiveInstituteId = cookieVal;
  }

  let organizationId: string | null = null;
  let organizationName: string | null = null;
  let instituteName: string | null = null;

  // institute → name + organization_id
  if (effectiveInstituteId) {
    const { data: inst, error: instErr } = await supabaseAdmin
      .from('institutes')
      .select('name, organization_id')
      .eq('id', effectiveInstituteId)
      .maybeSingle();
    if (instErr) {
      return apiError('/api/me/scope', instErr, 'Failed to load institute', 500);
    }
    if (inst) {
      instituteName = (inst as { name: string | null }).name;
      organizationId = (inst as { organization_id: string | null }).organization_id;
    }
  }
  // ORG_ADMIN 은 scope.organizationId 가 더 정확
  if (!organizationId && scope.organizationId) {
    organizationId = scope.organizationId;
  }

  // organization name
  if (organizationId) {
    const { data: org, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .maybeSingle();
    if (orgErr) {
      return apiError('/api/me/scope', orgErr, 'Failed to load organization', 500);
    }
    if (org) {
      organizationName = (org as { name: string | null }).name;
    }
  }

  return NextResponse.json({
    organizationId,
    organizationName,
    instituteId: effectiveInstituteId,
    instituteName,
    role: user.role,
    isSuperAdmin: scope.isSuperAdmin,
  });
}
