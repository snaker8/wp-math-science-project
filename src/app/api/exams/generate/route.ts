// ============================================================================
// POST /api/exams/generate — 시험지 자동 생성
// classifications 기반 type_code 필터 + 난이도별 배분
// supabaseAdmin + institute-guard (격리)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { resolveInsertInstituteId, applyInstituteFilter } from '@/lib/security/institute-guard';
import { loadRecentlyIssuedProblemIds, parseExcludeRecentDays } from '@/lib/exam/recent-issued';
import { capPerType, pickByBand, pickRandom, pickEvenByUnit, orderForPaper, parsePerTypeCap, parseSelectionMode } from '@/lib/exam/selection';

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
    // ★ 중복출제 방지 — 최근 N일 안에 이 학원이 출제한 문항 제외 (0 = 끄기, 기본 30일). 매쓰홀릭 「중복출제 방지」 와 같은 뜻.
    const excludeRecentDays = parseExcludeRecentDays(criteria?.excludeRecentDays);
    // ★ 출제 방식(2026-10-14, 매쓰홀릭 등가): band=난이도별 맞춤(밴드 칸) · random=무작위(밴드 골고루) · even=소단원별 균등
    //   유형별 상한(perTypeCap 1~4, 0=전체) — 한 유형에서 너무 많이 뽑히는 것을 막는다 (매쓰홀릭 「유형별 문제수」)
    const selectionMode = parseSelectionMode(criteria?.selection);
    const perTypeCap = parsePerTypeCap(criteria?.perTypeCap);
    const maxQuestions = Math.max(1, Math.min(150, parseInt(String(criteria?.maxQuestions ?? 30), 10) || 30));
    // ★ 회차 출제 — 앞 회차에서 뽑힌 문항은 이번 회차에서 뺀다 (클라이언트가 누적해서 보낸다)
    const excludeProblemIds = new Set<string>(
      Array.isArray(criteria?.excludeProblemIds) ? (criteria.excludeProblemIds as unknown[]).filter((v): v is string => typeof v === 'string') : [],
    );
    const totalNeeded = selectionMode === 'band'
      ? Object.values(diffDist).reduce((s: number, v: number) => s + v, 0)
      : maxQuestions;

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

    // ---- 2.5. 중복출제 방지 — 최근 출제 문항 제외 (available-counts 와 같은 집합이라 「보이는 수 = 뽑히는 수」) ----
    let excludedRecent = 0;
    if (excludeRecentDays > 0) {
      const recent = await loadRecentlyIssuedProblemIds(supabaseAdmin, insertInstituteId, excludeRecentDays);
      for (const id of Array.from(accessibleSet)) if (recent.has(id)) { accessibleSet.delete(id); excludedRecent++; }
    }

    for (const id of excludeProblemIds) accessibleSet.delete(id);

    const classRows = allClassRows.filter(r => accessibleSet.has(r.problem_id));
    if (classRows.length === 0) {
      return NextResponse.json({
        error: excludedRecent > 0
          ? `최근 ${excludeRecentDays}일 안에 출제한 문항을 빼면 남는 문제가 없습니다. 중복출제 방지를 끄거나 기간을 줄여 주세요.`
          : '접근 가능한 문제가 없습니다.',
      }, { status: 404 });
    }

    console.log(`[Generate] candidates=${candidateIds.length} accessible=${accessibleSet.size} excludedRecent=${excludedRecent} classRows=${classRows.length}`);

    // ---- 3. 유형별 상한 → 뽑기 방식 (규칙은 src/lib/exam/selection.ts — available-counts 와 같은 상한) ----
    const pool = capPerType(classRows, perTypeCap);
    let selectedProblemIds: string[];
    if (selectionMode === 'band') {
      const r = pickByBand(pool, diffDist, typeCounts);
      selectedProblemIds = r.ids;
      r.log.forEach((l) => console.log('[Generate] ' + l));
    } else if (selectionMode === 'random') {
      selectedProblemIds = pickRandom(pool, maxQuestions);
    } else {
      selectedProblemIds = pickEvenByUnit(pool, maxQuestions);
    }
    selectedProblemIds = orderForPaper(selectedProblemIds, pool);
    console.log(`[Generate] mode=${selectionMode} cap=${perTypeCap} pool=${pool.length} picked=${selectedProblemIds.length}`);

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
      problemIds: selectedProblemIds,
      excludedRecent,
    });

  } catch (error) {
    console.error('[Generate] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
