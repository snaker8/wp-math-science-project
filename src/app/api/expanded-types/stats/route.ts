import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

/**
 * GET /api/expanded-types/stats
 * 집계 통계: 레벨별, 도메인별, 인지영역별 유형 수
 */
export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from('expanded_math_types')
    .select('level_code, domain_code, cognitive, school_level')
    .eq('is_active', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];
  const total = rows.length;

  // 레벨별 집계
  const byLevel: Record<string, number> = {};
  const byDomain: Record<string, number> = {};
  const byCognitive: Record<string, number> = {};
  const bySchool: Record<string, number> = {};

  for (const row of rows) {
    byLevel[row.level_code] = (byLevel[row.level_code] || 0) + 1;
    byDomain[row.domain_code] = (byDomain[row.domain_code] || 0) + 1;
    byCognitive[row.cognitive] = (byCognitive[row.cognitive] || 0) + 1;
    bySchool[row.school_level] = (bySchool[row.school_level] || 0) + 1;
  }

  // 성취기준 수
  const standardCodes = new Set(rows.map(() => ''));
  const { data: standards } = await supabaseAdmin
    .from('expanded_math_types')
    .select('standard_code')
    .eq('is_active', true);

  const uniqueStandards = new Set((standards || []).map(s => s.standard_code)).size;

  return NextResponse.json({
    total,
    totalStandards: uniqueStandards,
    byLevel,
    byDomain,
    byCognitive,
    bySchool,
  });
}
