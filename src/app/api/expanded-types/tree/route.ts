import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { toExpandedMathType, buildTypeTree } from '@/types/expanded-types';
import type { ExpandedMathTypeRow } from '@/types/expanded-types';

/**
 * GET /api/expanded-types/tree
 * 계층 트리 구조로 반환 (Level → Domain → Standard → Types)
 *
 * Query params:
 *   school - 학교급 필터 (초등학교, 중학교, 고등학교)
 *   level  - 레벨 코드 필터 (HS0, MS, ES56 등)
 */
export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const school = searchParams.get('school');
  const level = searchParams.get('level');

  // expanded_math_types는 3,000+행 → Supabase 기본 1000행 제한 우회
  // 페이지네이션으로 전체 데이터 가져오기
  const allData: ExpandedMathTypeRow[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabaseAdmin
      .from('expanded_math_types')
      .select('*')
      .eq('is_active', true)
      .order('type_code')
      .range(offset, offset + PAGE_SIZE - 1);

    if (school) query = query.eq('school_level', school);
    if (level) query = query.eq('level_code', level);

    const { data: pageData, error: pageError } = await query;

    if (pageError) {
      return NextResponse.json({ error: pageError.message }, { status: 500 });
    }

    if (pageData && pageData.length > 0) {
      allData.push(...pageData);
      offset += pageData.length;
      hasMore = pageData.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  const types = allData.map((row: ExpandedMathTypeRow) => toExpandedMathType(row));
  const tree = buildTypeTree(types);

  return NextResponse.json({
    tree,
    totalTypes: types.length,
    totalStandards: new Set(types.map(t => t.standardCode)).size,
  });
}
