// ============================================================================
// GET /api/exams/available-counts — 난이도별 가용 문항수 조회
// classifications 테이블에서 type_code 매칭 → 난이도별 카운트 반환
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const typeCodesParam = searchParams.get('typeCodes');

    if (!typeCodesParam) {
      return NextResponse.json({ '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 });
    }

    const typeCodes = typeCodesParam.split(',').filter(Boolean);
    if (typeCodes.length === 0) {
      return NextResponse.json({ '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 });
    }

    // type_code prefix 매칭으로 classifications 조회
    // 각 typeCode는 standardCode (e.g., "MA-HS0-POL-01") 또는 확장 코드
    const orFilters = typeCodes.map(tc => `type_code.like.${tc}%`).join(',');

    const { data, error } = await supabaseAdmin
      .from('classifications')
      .select('difficulty')
      .or(orFilters);

    if (error) {
      console.error('[available-counts] DB error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const counts: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    for (const row of data || []) {
      const d = String(row.difficulty || '3');
      if (counts[d] !== undefined) {
        counts[d]++;
      }
    }

    return NextResponse.json(counts);
  } catch (err) {
    console.error('[available-counts] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
