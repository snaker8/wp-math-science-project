// ============================================================================
// GET /api/exams/available-counts — 난이도별 가용 문항수 조회
// classifications 에서 type_code 매칭 → 접근 가능(자기 institute + 공통 풀) 문제만
// 난이도별 카운트 반환.
//   ★ 2026-06-10: 과거 무필터 + 1000행 cap 으로 출제 가능 수와 표시 수가 어긋나던 사고 수정.
//     - 페이지네이션(range)으로 1000행 cap 회피
//     - generate 와 동일한 institute 접근성 필터 적용 (표시 수 = 실제 출제 가능 수)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

const EMPTY = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };

export async function GET(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = supabaseAdmin;

  try {
    const { searchParams } = new URL(request.url);
    const typeCodesParam = searchParams.get('typeCodes');
    if (!typeCodesParam) return NextResponse.json({ ...EMPTY });

    const typeCodes = typeCodesParam.split(',').filter(Boolean);
    if (typeCodes.length === 0) return NextResponse.json({ ...EMPTY });

    const orFilters = typeCodes.map(tc => `type_code.like.${tc}%`).join(',');

    // 1) type_code 매칭 classifications 전체 (1000행 cap 회피 — range 루프)
    type Row = { problem_id: string; difficulty: unknown };
    const rows: Row[] = [];
    const PAGE = 1000;
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
      rows.push(...(page as Row[]));
      if (page.length < PAGE) break;
    }
    if (rows.length === 0) return NextResponse.json({ ...EMPTY });

    // 2) 접근 가능(자기 institute + 공통 풀) 문제만 — chunk .in() + institute 필터
    const candidateIds = [...new Set(rows.map(r => r.problem_id))];
    const accessible = new Set<string>();
    const ID_CHUNK = 300;
    for (let i = 0; i < candidateIds.length; i += ID_CHUNK) {
      const slice = candidateIds.slice(i, i + ID_CHUNK);
      const base = sb.from('problems').select('id').is('deleted_at', null).in('id', slice);
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
      const d = String(row.difficulty || '3');
      if (counts[d] !== undefined) counts[d]++;
    }

    return NextResponse.json(counts);
  } catch (err) {
    console.error('[available-counts] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
