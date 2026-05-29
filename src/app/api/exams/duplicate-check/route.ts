// ============================================================================
// POST /api/exams/duplicate-check
//
// 폴더 import 페이지의 사전 dry-run 미리보기용 — 자산화 시작 전, 학교 단원집
// 메타 조합으로 이미 같은 exam 이 자산화돼있는지 batch 검사.
//
// Body: { items: Array<{ school_name, grade, semester, chapter, exam_round }> }
// Response: { duplicates: { [idx]: { id, title, created_at } } }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface DuplicateCheckItem {
  school_name?: string | null;
  grade?: number | string | null;
  semester?: number | null;
  chapter?: string | null;
  exam_round?: string | null;
}

export async function POST(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  let body: { items?: DuplicateCheckItem[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ duplicates: {} });
  }

  // ★ N+1 회피: 모든 후보 school_name 을 한 번에 가져온 후 클라이언트에서 매칭.
  //   상한 100건 가정 (폴더 1개당 PDF 수). 운영상 충분.
  const schoolNames = Array.from(new Set(
    items.map((it) => it.school_name).filter((n): n is string => !!n)
  ));

  if (schoolNames.length === 0) {
    return NextResponse.json({ duplicates: {} });
  }

  let query = supabaseAdmin
    .from('exams')
    .select('id, title, created_at, school_name, grade, semester, chapter, exam_round')
    .in('school_name', schoolNames)
    .is('deleted_at', null)
    .limit(500);

  // institute-guard — exams 공통풀 포함
  query = applyInstituteFilter(query, scope, { allowCommonPool: true });

  const { data: existing, error } = await query;
  if (error) {
    console.error('[duplicate-check] query error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const duplicates: Record<number, { id: string; title: string; created_at: string }> = {};

  const norm = (v: unknown): string => String(v ?? '').trim();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.school_name) continue;
    const match = (existing || []).find((e: Record<string, unknown>) => {
      if (norm(e.school_name) !== norm(it.school_name)) return false;
      if (it.grade != null && norm(e.grade) !== norm(it.grade)) return false;
      if (it.semester != null && norm(e.semester) !== norm(it.semester)) return false;
      if (it.chapter && norm(e.chapter) !== norm(it.chapter)) return false;
      if (it.exam_round && norm(e.exam_round) !== norm(it.exam_round)) return false;
      return true;
    });
    if (match) {
      duplicates[i] = {
        id: match.id as string,
        title: match.title as string,
        created_at: match.created_at as string,
      };
    }
  }

  return NextResponse.json({ duplicates });
}
