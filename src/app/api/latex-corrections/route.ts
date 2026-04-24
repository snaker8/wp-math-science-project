// ============================================================================
// POST /api/latex-corrections
//   편집 모달에서 저장 시 (original, corrected) 쌍을 저장해 학습 DB로 쌓음.
//   fire-and-forget 성격 — 실패해도 편집 저장 흐름을 막으면 안 된다.
//
// GET  /api/latex-corrections?hash=<pattern_hash>&limit=3
//   특정 pattern_hash 의 과거 교정 제시용 (편집 모달 가이드 패널에서 사용).
//
// ★ 용어 분리: 기존 "자동수정(autofix)"은 유형매핑 개념이며, 이 엔드포인트는
//   KaTeX 렌더 수정 학습(renderRepair) 전용이다.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MAX_PAIR_BYTES = 20_000; // 20KB 넘는 쌍은 저장 거부 (악용 방지)

/**
 * 원본 조각 정규화 — 해시 중복 집계용.
 *  - 공백 시퀀스 → 단일 공백
 *  - 숫자 → `#`
 *  - 변수명 한 글자 알파벳 → `x`
 * 목적은 "본질적으로 같은 버그 패턴"을 같은 hash 로 묶는 것.
 */
function normalizeForHash(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/-?\d+(?:\.\d+)?/g, '#')
    .replace(/\b[a-zA-Z]\b/g, 'x')
    .trim();
}

function computePatternHash(original: string): string {
  return createHash('sha256').update(normalizeForHash(original)).digest('hex').slice(0, 32);
}

interface SaveBody {
  problem_id?: string | null;
  source?: 'content' | 'solution';
  original: string;
  corrected: string;
  user_id?: string | null;
}

export async function POST(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  let body: SaveBody;
  try {
    body = await request.json() as SaveBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const original = (body.original || '').toString();
  const corrected = (body.corrected || '').toString();
  const source = (body.source === 'solution' ? 'solution' : 'content');

  if (!original || !corrected) {
    return NextResponse.json({ error: 'original/corrected required' }, { status: 400 });
  }
  if (original === corrected) {
    return NextResponse.json({ ok: true, noop: true });
  }
  if (original.length > MAX_PAIR_BYTES || corrected.length > MAX_PAIR_BYTES) {
    return NextResponse.json({ error: 'Too large' }, { status: 413 });
  }

  const pattern_hash = computePatternHash(original);

  try {
    // 동일 hash 가 있으면 occurrences 증가, confidence 갱신
    const { data: existing, error: selErr } = await sb
      .from('latex_render_corrections')
      .select('id, occurrences')
      .eq('pattern_hash', pattern_hash)
      .limit(1)
      .maybeSingle();

    if (selErr) {
      console.error('[latex-corrections] select error:', selErr.message);
    }

    if (existing?.id) {
      const newOcc = (existing.occurrences || 1) + 1;
      const newConf = newOcc >= 10 ? 0.95 : newOcc >= 3 ? 0.7 : 0.3;
      const { error: updErr } = await sb
        .from('latex_render_corrections')
        .update({
          occurrences: newOcc,
          confidence: newConf,
          // status 승급은 명시적 관리자 액션에서만 (여기선 confidence 만 올림)
        })
        .eq('id', existing.id);
      if (updErr) console.error('[latex-corrections] update error:', updErr.message);
      return NextResponse.json({ ok: true, id: existing.id, occurrences: newOcc, confidence: newConf });
    }

    // 신규 행 삽입
    const { data: inserted, error: insErr } = await sb
      .from('latex_render_corrections')
      .insert({
        problem_id: body.problem_id || null,
        user_id: body.user_id || null,
        source,
        original_fragment: original,
        corrected_fragment: corrected,
        pattern_hash,
        occurrences: 1,
        confidence: 0.3,
        status: 'learning',
      })
      .select('id')
      .single();

    if (insErr) {
      console.error('[latex-corrections] insert error:', insErr.message);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: inserted?.id, created: true });
  } catch (e) {
    console.error('[latex-corrections] exception:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  const { searchParams } = new URL(request.url);
  const hash = searchParams.get('hash');
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '3', 10) || 3, 1), 10);

  if (hash) {
    // 특정 hash 의 과거 교정 조회 (편집 모달 가이드용)
    const { data, error } = await sb
      .from('latex_render_corrections')
      .select('id, original_fragment, corrected_fragment, occurrences, confidence, status')
      .eq('pattern_hash', hash)
      .order('occurrences', { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data || [] });
  }

  // auto_applied 인 전체 규칙 (렌더 수정 시 자동 적용 후보)
  const { data, error } = await sb
    .from('latex_render_corrections')
    .select('id, original_fragment, corrected_fragment, occurrences, confidence, status, pattern_hash')
    .in('status', ['auto_applied', 'learning'])
    .gte('confidence', 0.7)
    .order('confidence', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}
