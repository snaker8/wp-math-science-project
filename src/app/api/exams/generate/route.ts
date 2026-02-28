// ============================================================================
// POST /api/exams/generate — 시험지 자동 생성
// classifications 기반 type_code 필터 + 난이도별 배분
// supabaseAdmin으로 RLS 바이패스
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { title, criteria } = body;

    // criteria: {
    //   subject, chapters, sections, typeCodes: string[],
    //   questionType, difficulty_distribution: Record<string, number>,
    //   mode: 'auto' | 'manual' | 'add'
    // }

    const typeCodes: string[] = criteria.typeCodes || [];
    const diffDist: Record<string, number> = criteria.difficulty_distribution || {};
    const totalNeeded = Object.values(diffDist).reduce((s: number, v: number) => s + v, 0);

    if (totalNeeded === 0) {
      return NextResponse.json({ error: '문항수를 설정해주세요.' }, { status: 400 });
    }

    // ---- 1. classifications에서 type_code 매칭 문제 후보 조회 ----
    // type_code가 선택된 standardCode로 시작하는 문제들 (LIKE 'HS0-POL-%' 등)
    // Supabase JS에서 OR LIKE 다수는 어려우므로, 전체 가져온 후 JS 필터
    let candidateQuery = supabaseAdmin
      .from('classifications')
      .select('problem_id, type_code, difficulty, cognitive_domain')
      .not('problem_id', 'is', null);

    // type_code 필터: typeCodes 배열에 정확히 매칭되는 것들 또는 prefix 매칭
    if (typeCodes.length > 0) {
      // OR 조건으로 type_code가 각 standardCode로 시작하는 것들
      const orFilters = typeCodes.map(tc => `type_code.like.${tc}%`).join(',');
      candidateQuery = candidateQuery.or(orFilters);
    }

    const { data: classRows, error: classError } = await candidateQuery.limit(5000);

    if (classError) {
      console.error('[Generate] Classifications query error:', classError.message);
      return NextResponse.json({ error: 'DB 조회 실패', detail: classError.message }, { status: 500 });
    }

    if (!classRows || classRows.length === 0) {
      return NextResponse.json(
        { error: '선택한 범위에 등록된 문제가 없습니다.' },
        { status: 404 }
      );
    }

    console.log(`[Generate] Found ${classRows.length} candidate classifications`);

    // ---- 2. 난이도별 그룹화 ----
    const diffMap: Record<string, string> = {
      '최상': '5', '상': '4', '중': '3', '하': '2', '최하': '1',
    };

    // difficulty 값 정규화 (문자열/숫자 모두 대응)
    const byDifficulty = new Map<string, typeof classRows>();
    for (const row of classRows) {
      const d = String(row.difficulty || '3');
      if (!byDifficulty.has(d)) byDifficulty.set(d, []);
      byDifficulty.get(d)!.push(row);
    }

    // ---- 3. 난이도별 랜덤 선택 ----
    const selectedProblemIds: string[] = [];
    const usedIds = new Set<string>();

    for (const [levelStr, count] of Object.entries(diffDist)) {
      if (count <= 0) continue;
      const targetDiff = diffMap[levelStr] || '3';
      const pool = byDifficulty.get(targetDiff) || [];

      // 셔플
      const shuffled = [...pool].sort(() => Math.random() - 0.5);

      let picked = 0;
      for (const row of shuffled) {
        if (picked >= count) break;
        if (usedIds.has(row.problem_id)) continue;
        selectedProblemIds.push(row.problem_id);
        usedIds.add(row.problem_id);
        picked++;
      }

      // 해당 난이도 부족 시 다른 난이도에서 채우기
      if (picked < count) {
        const remaining = classRows
          .filter(r => !usedIds.has(r.problem_id))
          .sort(() => Math.random() - 0.5);
        for (const row of remaining) {
          if (picked >= count) break;
          selectedProblemIds.push(row.problem_id);
          usedIds.add(row.problem_id);
          picked++;
        }
      }

      console.log(`[Generate] Difficulty ${levelStr}(${targetDiff}): needed=${count}, picked=${picked}, pool=${pool.length}`);
    }

    if (selectedProblemIds.length === 0) {
      return NextResponse.json(
        { error: '조건에 맞는 문제를 찾을 수 없습니다.' },
        { status: 400 }
      );
    }

    // ---- 4. 시험지 생성 ----
    const { data: exam, error: examError } = await supabaseAdmin
      .from('exams')
      .insert({
        title: title || '자동 생성 시험지',
        status: 'DRAFT',
        subject: criteria.subject || '수학',
        total_points: selectedProblemIds.length * 4,
      })
      .select('id')
      .single();

    if (examError || !exam) {
      console.error('[Generate] Exam insert error:', examError?.message);
      return NextResponse.json({ error: '시험지 생성 실패', detail: examError?.message }, { status: 500 });
    }

    // ---- 5. exam_problems 연결 ----
    const linkPayload = selectedProblemIds.map((pid, idx) => ({
      exam_id: exam.id,
      problem_id: pid,
      sequence_number: idx + 1,
      points: 4,
    }));

    const { error: linkError } = await supabaseAdmin.from('exam_problems').insert(linkPayload);
    if (linkError) {
      console.error('[Generate] exam_problems insert error:', linkError.message);
    }

    console.log(`[Generate] Created exam ${exam.id} with ${selectedProblemIds.length} problems`);

    return NextResponse.json({
      success: true,
      examId: exam.id,
      problemCount: selectedProblemIds.length,
    });

  } catch (error) {
    console.error('[Generate] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
