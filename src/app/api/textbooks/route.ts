// ============================================================================
// GET /api/textbooks — 교재 자료실 목록 (내가 받을 수 있는 학교급만)
// ============================================================================

import { NextResponse } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { allowedLevels, isTextbookManager, type TextbookAccessRow } from '@/lib/textbooks/access';
import { buildCatalog, type TextbookFileRow } from '@/lib/textbooks/catalog';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const { user, scope } = authed.data;

  const manager = isTextbookManager(user.role, scope.isSuperAdmin);
  let access: (TextbookAccessRow & { expires_at: string | null }) | null = null;
  if (!manager) {
    const { data, error } = await supabaseAdmin
      .from('textbook_access')
      .select('can_middle, can_high, expires_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'DB error', message: error.message }, { status: 500 });
    access = data as TextbookAccessRow | null;
  }
  const levels = allowedLevels({ manager, access });

  let rows: TextbookFileRow[] = [];
  if (levels.length) {
    // 600행 남짓 — 한 번에. (PostgREST 기본 상한 1000 을 넘으면 나눠 읽는다)
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin
        .from('textbook_files')
        .select('id, level, course, book, kind, edition, file_name, size_bytes')
        .is('deleted_at', null)
        .in('level', levels)
        .range(from, from + 999);
      if (error) return NextResponse.json({ error: 'DB error', message: error.message }, { status: 500 });
      rows = rows.concat((data ?? []) as TextbookFileRow[]);
      if (!data || data.length < 1000) break;
    }
  }

  return NextResponse.json({
    levels,
    manager,
    expiresAt: access?.expires_at ?? null,
    courses: buildCatalog(rows),
  });
}
