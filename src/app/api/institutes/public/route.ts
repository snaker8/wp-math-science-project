// ============================================================================
// GET /api/institutes/public?organization_id=<uuid>
//   가입 페이지에서 사용자가 학원 선택한 후 그 학원 산하 센터 목록 조회.
//   인증 없이 접근 가능 — id, name 만 노출.
//
// 쿼리:
//   ?organization_id=<uuid>  특정 학원 산하 센터만 (권장)
//   파라미터 없음            전체 institutes (역호환 용도, 가급적 지양)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { apiError } from '@/lib/api/error';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
  const sb = supabaseAdmin;

  const sp = request.nextUrl.searchParams;
  const organizationId = sp.get('organization_id') || undefined;

  let query = sb
    .from('institutes')
    .select('id, name, organization_id')
    .order('name', { ascending: true });

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data, error } = await query;

  if (error) {
    return apiError('/api/institutes/public GET', error, 'Failed to load institutes', 500);
  }

  return NextResponse.json({
    institutes: (data || []).map(i => ({
      id: i.id,
      name: i.name,
      organization_id: i.organization_id,
    })),
  });
}
