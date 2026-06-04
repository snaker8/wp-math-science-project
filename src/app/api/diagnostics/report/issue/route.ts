// ============================================================================
// POST /api/diagnostics/report/issue
//   진단평가 세트(A/B/C) 종합 리포트 학부모 공유 토큰 발급.
//   body: { studentId, setKey, label?, expiresAt? }
//   반환: { token, url }  — url = /share/diagnostic-report/{token}
//
//   parent_share_tokens 재사용 (report_kind='diagnostic_set', set_key 저장).
//   권한: ADMIN/TEACHER/TUTOR/ORG_ADMIN/super_admin + 학생 institute 격리.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

interface IssueBody { studentId?: string; setKey?: string; label?: string; expiresAt?: string | null; }

export async function POST(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  const allowedRoles = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];
  if (!user.role || (!allowedRoles.includes(user.role) && !scope.isSuperAdmin)) {
    return NextResponse.json({ error: 'Forbidden — 권한 없음' }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = supabaseAdmin;

  let body: IssueBody;
  try { body = (await request.json()) as IssueBody; } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const studentId = body.studentId;
  const setKey = body.setKey;
  if (!studentId || !setKey) return NextResponse.json({ error: 'studentId, setKey 필수' }, { status: 400 });

  // 학생 institute 격리 — users 우선, 없으면 roster_students
  let instituteId: string | null = null;
  const { data: u } = await sb.from('users').select('institute_id').eq('id', studentId).maybeSingle();
  if (u) {
    instituteId = (u as { institute_id: string | null }).institute_id;
  } else {
    const { data: r } = await sb.from('roster_students').select('institute_id').eq('id', studentId).maybeSingle();
    if (!r) return NextResponse.json({ error: '학생을 찾을 수 없습니다' }, { status: 404 });
    instituteId = (r as { institute_id: string | null }).institute_id;
  }
  try {
    assertInstituteAccess(scope, instituteId);
  } catch {
    if (!scope.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const token = randomBytes(32).toString('hex');
  const { error } = await sb.from('parent_share_tokens').insert({
    token,
    student_id: studentId,
    set_key: setKey,
    report_kind: 'diagnostic_set',
    label: body.label || null,
    expires_at: body.expiresAt || null,
    is_active: true,
    created_by: user.id || null,
  });
  if (error) {
    console.error('[diagnostics/report/issue] insert error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const url = new URL(request.url);
  const shareUrl = `${url.protocol}//${url.host}/share/diagnostic-report/${token}`;
  return NextResponse.json({ token, url: shareUrl });
}
