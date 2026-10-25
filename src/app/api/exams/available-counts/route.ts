// ============================================================================
// GET /api/exams/available-counts — 난이도별 가용 문항수 조회
// classifications 에서 type_code 매칭 → 접근 가능(자기 institute + 공통 풀) 문제만
// 난이도별 카운트 반환.
//   ★ 2026-06-10: 과거 무필터 + 1000행 cap 으로 출제 가능 수와 표시 수가 어긋나던 사고 수정.
//     - 페이지네이션(range)으로 1000행 cap 회피
//     - generate 와 동일한 institute 접근성 필터 적용 (표시 수 = 실제 출제 가능 수)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { EXAM_BAND_LABELS, bandLabelOf } from '@/lib/class/mastery-bands';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter, resolveInsertInstituteId } from '@/lib/security/institute-guard';
import { loadRecentlyIssuedProblemIds, parseExcludeRecentDays } from '@/lib/exam/recent-issued';
import { capPerType, deterministicRng, parsePerTypeCap, type PoolRow } from '@/lib/exam/selection';
import { parseSourceScope, loadSourceProblemIds, type SourceScope } from '@/lib/exam/source-scope';

export const dynamic = 'force-dynamic';

// ★ 5단 밴드(개념·기본·실력·심화·고난도)로 센다 — 판과 같은 언어.
//   예전엔 '1'~'5' 키라 난이도 6~10 문제가 어느 칸에도 안 잡혔다.
const EMPTY: Record<string, number> = Object.fromEntries(EXAM_BAND_LABELS.map((l) => [l, 0]));

// ★ GET(쿼리) 과 POST(본문) 둘 다 — 세부유형 코드가 수백 개면 GET URL 이 헤더 한도를 넘어 POST 로 보낸다(2026-09-20)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const typeCodes = (searchParams.get('typeCodes') || '').split(',').filter(Boolean);
  const answerType = searchParams.get('answerType') || '';
  const sourceScope = parseSourceScope({ source: searchParams.get('source'), schools: searchParams.get('schools') });
  return countAvailable(typeCodes, answerType, parseExcludeRecentDays(searchParams.get('excludeRecentDays')), parsePerTypeCap(searchParams.get('perTypeCap')), sourceScope);
}

export async function POST(request: NextRequest) {
  let body: { typeCodes?: unknown; answerType?: unknown; excludeRecentDays?: unknown; perTypeCap?: unknown; source?: unknown; schools?: unknown } = {};
  try { body = await request.json(); } catch { /* 빈 본문 */ }
  const typeCodes = Array.isArray(body.typeCodes) ? (body.typeCodes as unknown[]).filter((c): c is string => typeof c === 'string' && /^MS\d{2}/.test(c)) : [];
  const answerType = typeof body.answerType === 'string' ? body.answerType : '';
  // ★ 출처 범위(전체/학교기출→특정 학교/시중교재/모의고사) — generate 와 같은 함수로 같은 집합 (2026-10-25)
  const sourceScope = parseSourceScope({ source: body.source, schools: body.schools });
  return countAvailable(typeCodes, answerType, parseExcludeRecentDays(body.excludeRecentDays), parsePerTypeCap(body.perTypeCap), sourceScope);
}

// ★ .or() 필터는 한 번에 150개씩 — PostgREST 도 GET 이라 like 절 수백 개는 URL 한도를 넘는다
const OR_CHUNK = 150;

// ★ 중복출제 방지 — 최근 N일 안에 이 학원이 출제한 문항은 「있는 문제 수」에서도 뺀다 (generate 와 같은 집합).
// ★ 유형별 상한(perTypeCap) 도 같은 규칙으로 걸어 「선택 N」(= 상한 적용 후 후보 수) 을 돌려준다.
async function countAvailable(typeCodes: string[], answerType: string, excludeRecentDays: number, perTypeCap: number, sourceScope: SourceScope) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = supabaseAdmin;

  try {
    if (typeCodes.length === 0) return NextResponse.json({ ...EMPTY, excludedRecent: 0, selected: 0 });

    // 1) type_code 매칭 classifications 전체 (1000행 cap 회피 — range 루프, 코드는 150개씩 쪼개서)
    type Row = PoolRow;
    const rows: Row[] = [];
    const seen = new Set<string>();
    const PAGE = 1000;
    for (let c = 0; c < typeCodes.length; c += OR_CHUNK) {
      const orFilters = typeCodes.slice(c, c + OR_CHUNK).map(tc => `type_code.like.${tc}%`).join(',');
      for (let from = 0; ; from += PAGE) {
        const { data: page, error } = await sb
          .from('classifications')
          .select('problem_id, type_code, difficulty')
          .not('problem_id', 'is', null)
          .or(orFilters)
          .range(from, from + PAGE - 1);
        if (error) {
          console.error('[available-counts] DB error:', error.message);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!page || page.length === 0) break;
        // 같은 문제가 여러 유형에 걸리면 유형별 상한 계산을 위해 (problem, type) 쌍으로 둔다 — 카운트는 problem 기준으로 다시 걷는다
        for (const r of page as Row[]) { const k = `${r.problem_id}|${r.type_code}`; if (!seen.has(k)) { seen.add(k); rows.push(r); } }
        if (page.length < PAGE) break;
      }
    }
    if (rows.length === 0) return NextResponse.json({ ...EMPTY, excludedRecent: 0, selected: 0 });

    // 1.5) 출처 범위 — 범위 밖 문제는 후보에서 뺀다 (메모리 교집합, 집합이 수만 개라 .in() 에 안 싣는다)
    const sourceIds = await loadSourceProblemIds(sb, sourceScope);
    const scopedRows = sourceIds ? rows.filter((r) => sourceIds.has(r.problem_id)) : rows;
    if (scopedRows.length === 0) return NextResponse.json({ ...EMPTY, excludedRecent: 0, selected: 0 });

    // 2) 접근 가능(자기 institute + 공통 풀) 문제만 — chunk .in() + institute 필터
    const candidateIds = [...new Set(scopedRows.map(r => r.problem_id))];
    const accessible = new Set<string>();
    const ID_CHUNK = 300;
    for (let i = 0; i < candidateIds.length; i += ID_CHUNK) {
      const slice = candidateIds.slice(i, i + ID_CHUNK);
      let base = sb.from('problems').select('id').is('deleted_at', null).in('id', slice);
      // ★ 답안 형태를 고르면 카운트도 그 형태만 센다 — 화면 숫자와 실제로 뽑히는 문제가 어긋나면 안 된다
      if (answerType) base = base.eq('answer_type', answerType);
      const { data: accRows, error } = await applyInstituteFilter(base, scope, { allowCommonPool: true });
      if (error) {
        console.error('[available-counts] access error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      for (const r of (accRows || []) as { id: string }[]) accessible.add(r.id);
    }

    // 2.5) 중복출제 방지 — 최근 출제 문항 제외 (몇 개 빠졌는지도 돌려줘 화면에 「최근 출제 N개 제외」로 보인다)
    let excludedRecent = 0;
    if (excludeRecentDays > 0) {
      let instituteId: string | null = null;
      try { instituteId = resolveInsertInstituteId(scope); } catch { instituteId = null; }
      const recent = await loadRecentlyIssuedProblemIds(sb, instituteId, excludeRecentDays);
      for (const id of Array.from(accessible)) if (recent.has(id)) { accessible.delete(id); excludedRecent++; }
    }

    // 3) 접근 가능 문제만 → 유형별 상한(표시용 결정적 순서) → 난이도별 카운트. selected = 상한 적용 후 후보 수
    const pool = capPerType(scopedRows.filter((r) => accessible.has(r.problem_id)), perTypeCap, deterministicRng);
    const counts: Record<string, number> = { ...EMPTY };
    for (const row of pool) {
      const label = bandLabelOf(row.difficulty as number | string | null);
      if (label && counts[label] !== undefined) counts[label]++;
    }

    return NextResponse.json({ ...counts, excludedRecent, selected: pool.length });
  } catch (err) {
    console.error('[available-counts] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
