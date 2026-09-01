// GET /api/problems/search — 문제은행 검색
// ★ 2단계 쿼리: 1) classifications에서 problem_id 조회, 2) problems 조회
//   PostgREST !inner + ilike 필터 조합의 호환성 이슈를 방지
// 격리: 자기 institute + 공통 풀(institute_id IS NULL) — 매쓰플랫 모델
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter, applyTrackFilter } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  // ★ 다중 typeCode 지원: 쉼표 구분
  const typeCodeParam = searchParams.get('typeCode') || '';
  const typeCodes = typeCodeParam.split(',').filter(Boolean);
  const difficulty = searchParams.get('difficulty') || '';
  const excludeExamId = searchParams.get('excludeExamId') || '';
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  try {
    // ★ 1단계: classifications에서 조건에 맞는 problem_id 목록 먼저 조회
    let matchedProblemIds: string[] | null = null;

    if (typeCodes.length > 0 || difficulty) {
      // ★ classifications 는 문제를 소프트 삭제해도 남는다 — 여기서 안 거르면
      //   삭제된 문제가 후보 id 목록에 섞여 limit 을 잡아먹는다(2단계에서 걸러도 낭비).
      let classQuery = supabaseAdmin
        .from('classifications')
        .select('problem_id, type_code, difficulty, cognitive_domain, problems!inner(deleted_at)')
        .is('problems.deleted_at', null);

      // typeCode 필터: OR LIKE 패턴
      if (typeCodes.length > 0) {
        const orFilters = typeCodes.map(tc => `type_code.like.${tc}%`).join(',');
        classQuery = classQuery.or(orFilters);
      }

      // 난이도 필터
      if (difficulty) {
        classQuery = classQuery.eq('difficulty', parseInt(difficulty));
      }

      const { data: classRows, error: classErr } = await classQuery.limit(2000);

      if (classErr) {
        console.error('[API/problems/search] Classifications query error:', classErr.message);
        return NextResponse.json({ error: classErr.message }, { status: 500 });
      }

      matchedProblemIds = [...new Set((classRows || []).map((r: any) => r.problem_id))];

      if (matchedProblemIds.length === 0) {
        return NextResponse.json({ problems: [] });
      }
    }

    // ★ 2단계: problems 조회 (+ classifications 조인으로 메타데이터 포함)
    // 격리 — 자기 institute + 공통 풀
    let query = supabaseAdmin
      .from('problems')
      .select(`
        id, content_latex, answer_json, source_name, source_year, images, created_at, institute_id,
        classifications!inner(type_code, expanded_type_code, difficulty, cognitive_domain)
      `)
      // ★ 2026-09-01 사고 — 삭제한 문제가 출제 검색에 계속 나왔다.
      //   문제를 지웠는데 화면은 그대로라 "여전히 그런데" 라는 신고로 돌아왔고,
      //   그 상태로 담으면 **삭제한 문제가 시험지에 다시 들어간다.**
      //   available-counts 는 이 필터가 있어 트리 개수와 검색 결과도 서로 안 맞았다.
      //   ★ problems 를 조회하는 모든 경로는 반드시 deleted_at 을 걸러야 한다.
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    // problem_id 필터 (1단계 결과)
    if (matchedProblemIds) {
      query = query.in('id', matchedProblemIds.slice(0, limit * 3));
    }

    // 키워드 검색
    if (q) {
      query = query.ilike('content_latex', `%${q}%`);
    }

    // 격리 필터 적용 (공통 풀 NULL 도 포함) + 트랙 필터 (flag false 시 no-op)
    const filteredQuery = applyInstituteFilter(query, scope, { allowCommonPool: true });
    const trackFilteredQuery = applyTrackFilter(filteredQuery, scope);
    const { data: problems, error } = await trackFilteredQuery;

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

    // 6. 유형명 조회 — mathsecr_types + expanded_math_types 모두 시도
    const allTypeCodes = [...new Set(
      (problems || []).flatMap((p: any) =>
        (p.classifications || []).flatMap((c: any) =>
          [c.type_code, c.expanded_type_code].filter(Boolean)
        )
      )
    )];

    let typeNameMap = new Map<string, string>();
    if (allTypeCodes.length > 0) {
      // MS 코드 → mathsecr_types
      const msCodes = allTypeCodes.filter(c => c.startsWith('MS'));
      if (msCodes.length > 0) {
        const { data: msTypes } = await supabaseAdmin
          .from('mathsecr_types')
          .select('type_code, type_name')
          .in('type_code', msCodes);
        (msTypes || []).forEach((t: any) => typeNameMap.set(t.type_code, t.type_name));
      }

      // MA 코드 → expanded_math_types (레거시 호환)
      const maCodes = allTypeCodes.filter(c => c.startsWith('MA'));
      if (maCodes.length > 0) {
        const { data: maTypes } = await supabaseAdmin
          .from('expanded_math_types')
          .select('type_code, type_name')
          .in('type_code', maCodes);
        (maTypes || []).forEach((t: any) => typeNameMap.set(t.type_code, t.type_name));
      }
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
