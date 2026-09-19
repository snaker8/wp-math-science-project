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
import { applyInstituteFilter } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

// ★ 5단 밴드(개념·기본·실력·심화·고난도)로 센다 — 판과 같은 언어.
//   예전엔 '1'~'5' 키라 난이도 6~10 문제가 어느 칸에도 안 잡혔다.
const EMPTY: Record<string, number> = Object.fromEntries(EXAM_BAND_LABELS.map((l) => [l, 0]));

// ★ GET(쿼리) 과 POST(본문) 둘 다 — 세부유형 코드가 수백 개면 GET URL 이 헤더 한도를 넘어 POST 로 보낸다(2026-09-20)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const typeCodes = (searchParams.get('typeCodes') || '').split(',').filter(Boolean);
  const answerType = searchParams.get('answerType') || '';
  return countAvailable(typeCodes, answerType);
}

export async function POST(request: NextRequest) {
  let body: { typeCodes?: unknown; answerType?: unknown } = {};
  try { body = await request.json(); } catch { /* 빈 본문 */ }
  const typeCodes = Array.isArray(body.typeCodes) ? (body.typeCodes as unknown[]).filter((c): c is string => typeof c === 'string' && /^MS\d{2}/.test(c)) : [];
  const answerType = typeof body.answerType === 'string' ? body.answerType : '';
  return countAvailable(typeCodes, answerType);
}

// ★ .or() 필터는 한 번에 150개씩 — PostgREST 도 GET 이라 like 절 수백 개는 URL 한도를 넘는다
const OR_CHUNK = 150;

async function countAvailable(typeCodes: string[], answerType: string) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = supabaseAdmin;

  try {
    if (typeCodes.length === 0) return NextResponse.json({ ...EMPTY });

    // 1) type_code 매칭 classifications 전체 (1000행 cap 회피 — range 루프, 코드는 150개씩 쪼개서)
    type Row = { problem_id: string; difficulty: unknown };
    const rows: Row[] = [];
    const seen = new Set<string>();
    const PAGE = 1000;
    for (let c = 0; c < typeCodes.length; c += OR_CHUNK) {
      const orFilters = typeCodes.slice(c, c + OR_CHUNK).map(tc => `type_code.like.${tc}%`).join(',');
      for (let from = 0; ; from += PAGE) {
        const { data: page, error } = await sb
          .from('classifications')
          .select('problem_id, difficulty')
          .not('problem_id', 'is', null)
          .or(orFilters)
          .range(from, from + PAGE - 1);
        if (error) {
          console.error('[available-counts] DB error:', error.message);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!page || page.length === 0) break;
        for (const r of page as Row[]) { if (!seen.has(r.problem_id)) { seen.add(r.problem_id); rows.push(r); } }
        if (page.length < PAGE) break;
      }
    }
    if (rows.length === 0) return NextResponse.json({ ...EMPTY });

    // 2) 접근 가능(자기 institute + 공통 풀) 문제만 — chunk .in() + institute 필터
    const candidateIds = [...new Set(rows.map(r => r.problem_id))];
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

    // 3) 접근 가능 문제만 난이도별 카운트
    const counts: Record<string, number> = { ...EMPTY };
    for (const row of rows) {
      if (!accessible.has(row.problem_id)) continue;
      const label = bandLabelOf(row.difficulty as number | string | null);
      if (label && counts[label] !== undefined) counts[label]++;
    }

    return NextResponse.json(counts);
  } catch (err) {
    console.error('[available-counts] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
