// GET /api/problems/search — 문제은행 검색
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const typeCode = searchParams.get('typeCode') || '';
  const difficulty = searchParams.get('difficulty') || '';
  const excludeExamId = searchParams.get('excludeExamId') || '';
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  try {
    // 1. 기본 쿼리: problems + classifications 조인
    let query = supabaseAdmin
      .from('problems')
      .select(`
        id, content_latex, answer_json, source_name, source_year, images, created_at,
        classifications!inner(type_code, expanded_type_code, difficulty, cognitive_domain)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    // 2. 키워드 검색
    if (q) {
      query = query.ilike('content_latex', `%${q}%`);
    }

    // 3. 유형코드 필터
    if (typeCode) {
      query = query.ilike('classifications.type_code', `%${typeCode}%`);
    }

    // 4. 난이도 필터
    if (difficulty) {
      query = query.eq('classifications.difficulty', parseInt(difficulty));
    }

    const { data: problems, error } = await query;

    if (error) {
      console.error('[API/problems/search] Error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 5. 이미 시험지에 포함된 문제 표시
    let excludedIds = new Set<string>();
    if (excludeExamId) {
      const { data: existing } = await supabaseAdmin
        .from('exam_problems')
        .select('problem_id')
        .eq('exam_id', excludeExamId);

      excludedIds = new Set((existing || []).map((r: any) => r.problem_id));
    }

    // 6. 유형명 조회
    const typeCodes = [...new Set(
      (problems || []).flatMap((p: any) =>
        (p.classifications || []).map((c: any) => c.expanded_type_code).filter(Boolean)
      )
    )];

    let typeNameMap = new Map<string, string>();
    if (typeCodes.length > 0) {
      const { data: types } = await supabaseAdmin
        .from('expanded_math_types')
        .select('type_code, type_name')
        .in('type_code', typeCodes);

      (types || []).forEach((t: any) => typeNameMap.set(t.type_code, t.type_name));
    }

    // 7. 응답 매핑
    const mapped = (problems || []).map((p: any) => {
      const cls = p.classifications?.[0] || {};
      return {
        id: p.id,
        content: p.content_latex || '',
        answer: p.answer_json,
        source: p.source_name || '',
        year: p.source_year || '',
        typeCode: cls.type_code || '',
        typeName: typeNameMap.get(cls.expanded_type_code || '') || cls.type_code || '',
        difficulty: cls.difficulty || 0,
        cognitiveDomain: cls.cognitive_domain || '',
        alreadyInExam: excludedIds.has(p.id),
        images: p.images || [],
      };
    });

    return NextResponse.json({ problems: mapped });
  } catch (err: any) {
    console.error('[API/problems/search] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
