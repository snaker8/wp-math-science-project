// ============================================================================
// POST /api/exams/generate — 시험지 자동 생성
// classifications 기반 type_code 필터 + 난이도별 배분
// supabaseAdmin + institute-guard (격리)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { LEVELS_BY_BAND_LABEL } from '@/lib/class/mastery-bands';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { resolveInsertInstituteId, applyInstituteFilter } from '@/lib/security/institute-guard';

export async function POST(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  // INSERT 에 사용할 institute_id 결정 (자기 institute. ORG_ADMIN/super 가 명시 가능)
  let insertInstituteId: string;
  try {
    insertInstituteId = resolveInsertInstituteId(scope);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { title, criteria, problemIds, bookGroupId } = body;

    // ---- Manual mode: problemIds 직접 전달 ----
    if (Array.isArray(problemIds) && problemIds.length > 0) {
      const { data: exam, error: examError } = await supabaseAdmin
        .from('exams')
        .insert({
          title: title || '수동 출제 시험지',
          status: 'DRAFT',
          subject: criteria?.subject || '수학',
          total_points: problemIds.length * 4,
          institute_id: insertInstituteId,
          book_group_id: bookGroupId || null,
          created_by: user.id,
        })
        .select('id')
        .single();

      if (examError || !exam) {
        return NextResponse.json({ error: '시험지 생성 실패', detail: examError?.message }, { status: 500 });
      }

      const linkPayload = problemIds.map((pid: string, idx: number) => ({
        exam_id: exam.id,
        problem_id: pid,
        sequence_number: idx + 1,
        points: null,
      }));

      const { error: linkError } = await supabaseAdmin.from('exam_problems').insert(linkPayload);
      if (linkError) {
        console.error('[Generate] manual exam_problems insert error:', linkError.message);
      }

      console.log(`[Generate] Created manual exam ${exam.id} with ${problemIds.length} problems`);
      return NextResponse.json({ success: true, examId: exam.id, problemCount: problemIds.length });
    }

    // ---- Auto mode: criteria 기반 ----
    // criteria: {
    //   subject, typeCodes: string[],
    //   difficulty_distribution: Record<string, number>,
    //   mode: 'auto'
    // }

    const typeCodes: string[] = criteria?.typeCodes || [];
    const diffDist: Record<string, number> = criteria?.difficulty_distribution || {};
    // ★ 유형별 최소 문항수 { 'MS01-02-03-04-05': 2, … } — 화면의 −/+ 값. (2026-09-20 전까진 안 실렸다)
    //   규칙: 각 유형에서 먼저 그 수만큼 뽑고(난이도는 남은 배분이 큰 밴드부터), 남은 배분은 전체 범위에서 채운다.
    //   유형별 합이 총 문항수보다 크면 유형별 합이 이긴다(시험지가 그만큼 커진다).
    const typeCounts: Record<string, number> = {};
    for (const [k, v] of Object.entries((criteria?.typeCounts as Record<string, unknown>) || {})) {
      const n = Number(v);
      if (typeof k === 'string' && /^MS\d{2}/.test(k) && Number.isFinite(n) && n > 0) typeCounts[k] = Math.min(50, Math.floor(n));
    }
    const answerType: string = criteria?.answerType || '';   // '' 전체 · multiple_choice · short_answer
    const totalNeeded = Object.values(diffDist).reduce((s: number, v: number) => s + v, 0);

    if (totalNeeded === 0) {
      return NextResponse.json({ error: '문항수를 설정해주세요.' }, { status: 400 });
    }

    // ---- 1. classifications 에서 type_code 매칭 (선택적 필터 먼저 — 후보 축소) ----
    //   ★ 과거: accessible problem_id 전체(.select 1000행 cap)를 먼저 받아 .in() 했더니
    //     공통 풀이 3천 개를 넘기며 1000개만 잡혀 출제 후보가 통째로 누락되던 사고 (2026-06-10).
    //     → 순서를 뒤집어, 선택적인 type_code 필터로 후보를 먼저 좁힌 뒤(보통 수백 개)
    //       그 후보만 institute 접근성 검사. 1000행 cap·거대 IN 절 둘 다 회피.
    //   classifications 페이지네이션 — type 범위가 넓으면 1000행 초과 가능하므로 range 루프.
    type ClassRow = { problem_id: string; type_code: string; difficulty: unknown; cognitive_domain: unknown };
    const allClassRows: ClassRow[] = [];
    {
      const PAGE = 1000;
      // ★ .or() 는 150개씩 — 세부유형 코드 수백 개를 한 번에 실으면 PostgREST URL 한도를 넘는다 (2026-09-20)
      const OR_CHUNK = 150;
      const seenRow = new Set<string>();
      const chunks: (string[] | null)[] = typeCodes.length > 0
        ? Array.from({ length: Math.ceil(typeCodes.length / OR_CHUNK) }, (_, i) => typeCodes.slice(i * OR_CHUNK, (i + 1) * OR_CHUNK))
        : [null];
      for (const chunk of chunks) {
        for (let from = 0; ; from += PAGE) {
          let cq = supabaseAdmin
            .from('classifications')
            .select('problem_id, type_code, difficulty, cognitive_domain')
            .not('problem_id', 'is', null);
          if (chunk) {
            const orFilters = chunk.map(tc => `type_code.like.${tc}%`).join(',');
            cq = cq.or(orFilters);
          }
          const { data: page, error: pageErr } = await cq.range(from, from + PAGE - 1);
          if (pageErr) {
            console.error('[Generate] Classifications query error:', pageErr.message);
            return NextResponse.json({ error: 'DB 조회 실패', detail: pageErr.message }, { status: 500 });
          }
          if (!page || page.length === 0) break;
          for (const r of page as ClassRow[]) {
            const k = `${r.problem_id}|${r.type_code}`;
            if (!seenRow.has(k)) { seenRow.add(k); allClassRows.push(r); }
          }
          if (page.length < PAGE) break;
        }
      }
    }

    if (allClassRows.length === 0) {
      return NextResponse.json(
        { error: '선택한 범위에 등록된 문제가 없습니다.' },
        { status: 404 }
      );
    }

    // ---- 2. 후보 problem_id 중 접근 가능(자기 institute + 공통 풀)한 것만 남김 ----
    //   classifications 에는 institute_id 가 없으므로 problems 로 확인. 후보 ID 를 chunk 로
    //   나눠 .in() (거대 IN 절·URL 길이 한계 회피) + institute 필터.
    const candidateIds = [...new Set(allClassRows.map(r => r.problem_id))];
    const accessibleSet = new Set<string>();
    const ID_CHUNK = 300;
    for (let i = 0; i < candidateIds.length; i += ID_CHUNK) {
      const slice = candidateIds.slice(i, i + ID_CHUNK);
      let base = supabaseAdmin
        .from('problems')
        .select('id')
        .is('deleted_at', null)
        .in('id', slice);
      if (answerType) base = base.eq('answer_type', answerType);   // 답안 형태 (객관식/서답형)
      const { data: accRows, error: accErr } = await applyInstituteFilter(base, scope, { allowCommonPool: true });
      if (accErr) {
        return NextResponse.json({ error: '문제 조회 실패', detail: accErr.message }, { status: 500 });
      }
      for (const r of (accRows || []) as { id: string }[]) accessibleSet.add(r.id);
    }

    const classRows = allClassRows.filter(r => accessibleSet.has(r.problem_id));
    if (classRows.length === 0) {
      return NextResponse.json({ error: '접근 가능한 문제가 없습니다.' }, { status: 404 });
    }

    console.log(`[Generate] candidates=${candidateIds.length} accessible=${accessibleSet.size} classRows=${classRows.length}`);

    // ---- 2. 난이도별 그룹화 ----
    // ★ 밴드 라벨(개념·기본·실력·심화·고난도) → 난이도 레벨 묶음. 1~5 단일값이 아니라 범위다.
    //   예전 '최상'→'5' 매핑은 난이도 6~10 을 영영 못 뽑았다.

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

    // ★ 3-0. 유형별 최소 문항수 먼저 — 난이도는 "남은 배분이 가장 큰 밴드"부터 집어 배분을 깎는다
    const remaining: Record<string, number> = { ...diffDist };
    const bandOfLevel = new Map<string, string>();
    for (const [label, levels] of Object.entries(LEVELS_BY_BAND_LABEL)) levels.forEach((l) => bandOfLevel.set(String(l), label));
    for (const [code, need] of Object.entries(typeCounts)) {
      const pool = classRows
        .filter((r) => !usedIds.has(r.problem_id) && String(r.type_code || '').startsWith(code))
        .sort(() => Math.random() - 0.5)
        .sort((a, b) => (remaining[bandOfLevel.get(String(a.difficulty || '3')) ?? ''] ?? 0) < (remaining[bandOfLevel.get(String(b.difficulty || '3')) ?? ''] ?? 0) ? 1 : -1);
      let picked = 0;
      for (const row of pool) {
        if (picked >= need) break;
        selectedProblemIds.push(row.problem_id);
        usedIds.add(row.problem_id);
        const band = bandOfLevel.get(String(row.difficulty || '3'));
        if (band && (remaining[band] ?? 0) > 0) remaining[band] -= 1;
        picked++;
      }
      console.log(`[Generate] 유형 ${code}: needed=${need}, picked=${picked}, pool=${pool.length}`);
    }

    for (const [levelStr, count] of Object.entries(remaining)) {
      if (count <= 0) continue;
      const levels = LEVELS_BY_BAND_LABEL[levelStr] ?? [levelStr];
      const pool = levels.flatMap((l) => byDifficulty.get(l) ?? []);

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

      console.log(`[Generate] 난이도 ${levelStr}(${levels.join('·')}): needed=${count}, picked=${picked}, pool=${pool.length}`);
    }

    if (selectedProblemIds.length === 0) {
      return NextResponse.json(
        { error: '조건에 맞는 문제를 찾을 수 없습니다.' },
        { status: 400 }
      );
    }

    // ---- 4. 시험지 생성 (institute_id, created_by 포함) ----
    const { data: exam, error: examError } = await supabaseAdmin
      .from('exams')
      .insert({
        title: title || '자동 생성 시험지',
        status: 'DRAFT',
        subject: criteria.subject || '수학',
        total_points: selectedProblemIds.length * 4,
        institute_id: insertInstituteId,
        created_by: user.id,
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
      points: null,
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
