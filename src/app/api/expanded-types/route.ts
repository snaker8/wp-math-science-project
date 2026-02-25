import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

/**
 * GET /api/expanded-types
 * 확장 세부유형 목록 조회 (필터/검색/페이지네이션)
 *
 * Query params:
 *   level     - 레벨 코드 (HS0, MS, ES56 등)
 *   domain    - 도메인 코드 (POL, EQU 등)
 *   cognitive - 인지 영역 (CALCULATION 등)
 *   school    - 학교급 (초등학교, 중학교, 고등학교)
 *   search    - 검색어 (유형명, 성취기준 내용)
 *   limit     - 페이지 크기 (기본 50)
 *   offset    - 오프셋 (기본 0)
 */
export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const level = searchParams.get('level');
  const domain = searchParams.get('domain');
  const cognitive = searchParams.get('cognitive');
  const school = searchParams.get('school');
  const search = searchParams.get('search');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 500);
  const offset = parseInt(searchParams.get('offset') || '0');

  let query = supabaseAdmin
    .from('expanded_math_types')
    .select('*', { count: 'exact' })
    .eq('is_active', true);

  if (level) query = query.eq('level_code', level);
  if (domain) query = query.eq('domain_code', domain);
  if (cognitive) query = query.eq('cognitive', cognitive);
  if (school) query = query.eq('school_level', school);
  if (search) {
    query = query.or(`type_name.ilike.%${search}%,standard_content.ilike.%${search}%,description.ilike.%${search}%`);
  }

  query = query.order('type_code').range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [], count: count || 0, limit, offset });
}
