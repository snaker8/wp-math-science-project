// ============================================================================
// POST /api/parent/issue
//
// 학원장이 학생별로 학부모 공유 토큰 발급. requireEditor 가드.
// body: { student_id: string, label?: string, expires_at?: string }
// 반환: { token, url }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireEditor } from '@/lib/auth/guard';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

interface IssueBody {
  student_id?: string;
  label?: string;
  expires_at?: string | null;
}

function generateToken(): string {
  // 32바이트 hex = 64자 (학생별 1일 수만 발급해도 충돌 사실상 0)
  return randomBytes(32).toString('hex');
}

export async function POST(request: NextRequest) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  let body: IssueBody;
  try {
    body = (await request.json()) as IssueBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const studentId = body.student_id;
  if (!studentId) {
    return NextResponse.json({ error: 'student_id required' }, { status: 400 });
  }

  const token = generateToken();

  const { error } = await supabaseAdmin.from('parent_share_tokens').insert({
    token,
    student_id: studentId,
    label: body.label || null,
    expires_at: body.expires_at || null,
    is_active: true,
    created_by: guard.user?.id || null,
  });

  if (error) {
    console.error('[parent/issue] insert error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // URL 빌드 — 호스트는 request에서 추출
  const url = new URL(request.url);
  const shareUrl = `${url.protocol}//${url.host}/parent/${token}`;

  return NextResponse.json({ token, url: shareUrl });
}
