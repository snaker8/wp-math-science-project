// ============================================================================
// GET /api/organizations/search?q=<query>
//   가입 폼에서 사용자가 학원 이름을 자유 입력할 때 매칭 후보 반환.
//   인증 없이 접근 가능 — id, name 만 노출.
//
// 매칭 우선순위:
//   1) 정확 일치 (대소문자·앞뒤 공백 무시) — 최상위
//   2) prefix 일치 (앞에서부터 시작)
//   3) ILIKE %query% 부분 일치
//   4) trigram 유사도 fallback (extension 있을 경우)
//
// 응답:
//   {
//     query: "...",
//     exactMatch: { id, name } | null,
//     candidates: [{ id, name }, ...]  // 정확 매칭 외 후보 (최대 10개)
//   }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  const sp = request.nextUrl.searchParams;
  const rawQ = (sp.get('q') || '').trim();

  if (!rawQ) {
    // 빈 검색 — 전체 학원 목록 (최대 20개, 가입 폼 초기 노출용)
    const { data, error } = await sb
      .from('organizations')
      .select('id, name')
      .order('name', { ascending: true })
      .limit(20);

    if (error) {
      console.error('[organizations/search] empty-q error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      query: '',
      exactMatch: null,
      candidates: (data || []).map(o => ({ id: o.id, name: o.name })),
    });
  }

  const q = rawQ.toLowerCase();

  // 한 번에 후보 가져온 뒤 메모리에서 정확/prefix/부분 매칭 분류.
  // organizations 가 작은 도메인이라 100개 한도면 충분.
  const { data: rows, error } = await sb
    .from('organizations')
    .select('id, name')
    .ilike('name', `%${rawQ}%`)
    .limit(100);

  if (error) {
    console.error('[organizations/search] error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const all = (rows || []) as Array<{ id: string; name: string }>;
  const norm = (s: string) => s.trim().toLowerCase();

  let exactMatch: { id: string; name: string } | null = null;
  const prefixMatches: Array<{ id: string; name: string }> = [];
  const partialMatches: Array<{ id: string; name: string }> = [];

  for (const r of all) {
    const n = norm(r.name);
    if (n === q) {
      if (!exactMatch) exactMatch = { id: r.id, name: r.name };
    } else if (n.startsWith(q)) {
      prefixMatches.push({ id: r.id, name: r.name });
    } else {
      partialMatches.push({ id: r.id, name: r.name });
    }
  }

  // 후보: prefix + partial (정확 매칭 제외) 합쳐 최대 10개
  const candidates = [...prefixMatches, ...partialMatches].slice(0, 10);

  return NextResponse.json({
    query: rawQ,
    exactMatch,
    candidates,
  });
}
