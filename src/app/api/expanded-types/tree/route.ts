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

  let query = supabaseAdmin
    .from('expanded_math_types')
    .select('*')
    .eq('is_active', true)
    .order('type_code');

  if (school) query = query.eq('school_level', school);
  if (level) query = query.eq('level_code', level);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const types = (data || []).map((row: ExpandedMathTypeRow) => toExpandedMathType(row));
  const tree = buildTypeTree(types);

  return NextResponse.json({
    tree,
    totalTypes: types.length,
    totalStandards: new Set(types.map(t => t.standardCode)).size,
  });
}
