// ============================================================================
// GET /api/institutes/public
//   가입 페이지에서 사용자에게 소속 학원을 선택받기 위한 공개 institute 목록.
//   인증 없이 접근 가능 — id, name 만 노출 (민감 정보 X).
// ============================================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from('institutes')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    console.error('[api/institutes/public] error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    institutes: (data || []).map(i => ({ id: i.id, name: i.name })),
  });
}
