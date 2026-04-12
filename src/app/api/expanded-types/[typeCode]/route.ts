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

  // 1. 유형 상세 — MS 코드면 mathsecr_types, 아니면 expanded_math_types
  let typeData: Record<string, unknown> | null = null;

  if (typeCode.startsWith('MS')) {
    const { data: msType } = await supabaseAdmin
      .from('mathsecr_types')
      .select('*')
      .eq('code', typeCode)
      .single();
    if (msType) {
      typeData = {
        type_code: msType.code,
        type_name: msType.full_path?.split(' > ').pop() || msType.full_path,
        full_path: msType.full_path,
        level_code: msType.subject_code,
        level_name: msType.subject_name,
        standard_code: msType.code.split('-').slice(0, 3).join('-'),
        is_active: true,
      };
    }
  } else {
    const { data } = await supabaseAdmin
      .from('expanded_math_types')
      .select('*')
      .eq('type_code', typeCode)
      .single();
    typeData = data;
  }

  if (!typeData) {
    return NextResponse.json({ error: 'Type not found' }, { status: 404 });
  }

  // 2. 연결된 문제 — MA 코드 또는 MS 코드 모두 매칭
  let classificationsQuery = supabaseAdmin
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
    `);

  if (typeCode.startsWith('MS')) {
    // MS 코드: type_code에서 직접 매칭
    classificationsQuery = classificationsQuery.eq('type_code', typeCode);
  } else {
    // MA 코드: expanded_type_code 또는 type_code 매칭
    classificationsQuery = classificationsQuery.or(`expanded_type_code.eq.${typeCode},type_code.eq.${typeCode}`);
  }

  const { data: classifications } = await classificationsQuery.limit(50);

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
