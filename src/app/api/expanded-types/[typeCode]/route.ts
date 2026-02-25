import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

/**
 * GET /api/expanded-types/[typeCode]
 * 단일 유형 상세 + 연결된 문제 목록
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ typeCode: string }> }
) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { typeCode } = await params;

  // 1. 유형 상세
  const { data: typeData, error: typeError } = await supabaseAdmin
    .from('expanded_math_types')
    .select('*')
    .eq('type_code', typeCode)
    .single();

  if (typeError || !typeData) {
    return NextResponse.json({ error: 'Type not found' }, { status: 404 });
  }

  // 2. 연결된 문제 (expanded_type_code 또는 legacy type_code 매칭)
  const { data: classifications } = await supabaseAdmin
    .from('classifications')
    .select(`
      id,
      problem_id,
      difficulty,
      cognitive_domain,
      ai_confidence,
      is_verified,
      problems (
        id,
        content_latex,
        solution_latex,
        answer_json,
        source_name,
        source_year,
        source_number,
        status
      )
    `)
    .or(`expanded_type_code.eq.${typeCode},type_code.eq.${typeCode}`)
    .limit(50);

  // 3. 같은 성취기준의 다른 유형들 (관련 유형)
  const { data: relatedTypes } = await supabaseAdmin
    .from('expanded_math_types')
    .select('type_code, type_name, cognitive, difficulty_min, difficulty_max')
    .eq('standard_code', typeData.standard_code)
    .neq('type_code', typeCode)
    .eq('is_active', true)
    .order('type_code');

  return NextResponse.json({
    type: typeData,
    problems: classifications || [],
    relatedTypes: relatedTypes || [],
  });
}
