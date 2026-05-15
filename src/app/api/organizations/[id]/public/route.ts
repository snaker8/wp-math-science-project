// ============================================================================
// GET /api/organizations/[id]/public
//   학원 id 기반 공개 정보 조회. 로그인 페이지의 ?org=<id> 학원 표시용.
//   인증 없이 접근 가능 — id, name 만 노출.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[organizations/[id]/public] error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json({
    organization: { id: data.id, name: data.name },
  });
}
