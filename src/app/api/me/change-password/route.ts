// ============================================================================
// POST /api/me/change-password
//   본인 비밀번호 변경. 학생/강사/관리자 공통.
//
// body:
//   { current_password: string, new_password: string }
//
// 보안:
//   1) current_password 를 별도 임시 supabase client 로 signInWithPassword 검증
//      → 세션·쿠키에 영향 없는 격리된 확인
//   2) 검증 성공 시 supabaseAdmin.auth.admin.updateUserById 로 새 비번 박음
//   3) 새 비번 최소 길이 검증
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NEW_PASSWORD_MIN = 6; // 학생들이 외우기 쉽도록 6자 허용. 강사·관리자는 자율 권장.

interface Body {
  current_password?: string;
  new_password?: string;
}

export async function POST(request: NextRequest) {
  // 현재 사용자 확인
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin not configured' }, { status: 500 });
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.email) {
    return NextResponse.json({ error: '이메일 없는 계정은 비밀번호 변경 불가' }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const currentPassword = String(body.current_password || '');
  const newPassword = String(body.new_password || '');

  if (!currentPassword) {
    return NextResponse.json({ error: '현재 비밀번호를 입력해주세요' }, { status: 400 });
  }
  if (!newPassword || newPassword.length < NEW_PASSWORD_MIN) {
    return NextResponse.json({
      error: `새 비밀번호는 ${NEW_PASSWORD_MIN}자 이상이어야 합니다`,
    }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json({
      error: '새 비밀번호가 현재 비밀번호와 동일합니다',
    }, { status: 400 });
  }

  // ── 현재 비밀번호 검증 (임시 client — 세션·쿠키 무영향)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const tmpClient = createClient(supabaseUrl, supabaseAnon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: verifyErr } = await tmpClient.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyErr) {
    return NextResponse.json({
      error: '현재 비밀번호가 올바르지 않습니다',
    }, { status: 401 });
  }

  // ── 새 비밀번호 박기 (supabaseAdmin)
  const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
