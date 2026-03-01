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

  // expanded_math_types는 3,000+행 → Supabase 서버 max_rows=1000 제한 우회
  // level_code별 분할 쿼리 (각 레벨 < 1000행)로 전체 데이터 가져오기
  const LEVEL_CODES = ['ES12', 'ES34', 'ES56', 'MS', 'HS0', 'HS1', 'HS2', 'CAL', 'PRB', 'GEO'];
  const targetLevels = level ? [level] : LEVEL_CODES;

  const db = supabaseAdmin; // null 체크 위에서 완료
  const queries = targetLevels.map((lc) => {
    let q = db
      .from('expanded_math_types')
      .select('*')
      .eq('is_active', true)
      .eq('level_code', lc)
      .order('type_code');
    if (school) q = q.eq('school_level', school);
    return q;
  });

  const results = await Promise.all(queries);

  // 에러 체크
  const firstError = results.find((r) => r.error);
  if (firstError?.error) {
    return NextResponse.json({ error: firstError.error.message }, { status: 500 });
  }

  const allData = results.flatMap((r) => (r.data || []) as ExpandedMathTypeRow[]);
  const types = allData.map((row: ExpandedMathTypeRow) => toExpandedMathType(row));
  const tree = buildTypeTree(types);

  return NextResponse.json({
    tree,
    totalTypes: types.length,
    totalStandards: new Set(types.map(t => t.standardCode)).size,
  });
}
