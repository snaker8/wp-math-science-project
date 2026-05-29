// ============================================================================
// POST  /api/exams/[examId]/students/[studentId]/share
//   학부모 공유 토큰 발급 (없으면 생성, 있으면 기존 반환)
//
// DELETE /api/exams/[examId]/students/[studentId]/share
//   토큰 회수 (share_token = NULL)
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { requireAuthScope } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { assertInstituteAccess } from '@/lib/security/institute-guard';

export const runtime = 'nodejs';

function genToken(): string {
  return randomBytes(18).toString('base64url'); // ~24 chars, URL-safe
}

async function loadSession(examId: string, studentId: string) {
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .schema('diagnostics')
    .from('sessions')
    .select('id, share_token')
    .eq('exam_id', examId)
    .eq('student_id', studentId)
    .eq('session_type', 'EX')
    .order('conducted_at', { ascending: false })
    .limit(1);
  return data?.[0] as { id: string; share_token: string | null } | undefined;
}

async function assertExamAccess(scope: Awaited<ReturnType<typeof requireAuthScope>>, examId: string) {
  if (!scope.ok) return scope.response;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin 미설정' }, { status: 500 });
  }
  const { data: exam } = await supabaseAdmin
    .from('exams')
    .select('id, institute_id')
    .eq('id', examId)
    .maybeSingle();
  if (!exam) return NextResponse.json({ error: 'exam not found' }, { status: 404 });
  if (exam.institute_id !== null) {
    try {
      assertInstituteAccess(scope.data.scope, exam.institute_id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  return null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { examId: string; studentId: string } }
) {
  const { examId, studentId } = params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;

  const accessErr = await assertExamAccess(authed, examId);
  if (accessErr) return accessErr;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin 미설정' }, { status: 500 });
  }

  const sess = await loadSession(examId, studentId);
  if (!sess) {
    return NextResponse.json(
      { error: '이 학생의 채점 기록이 없습니다.' },
      { status: 404 }
    );
  }

  if (sess.share_token) {
    return NextResponse.json({ token: sess.share_token, created: false });
  }

  // 새 토큰 발급
  let token = genToken();
  // 충돌 시 재시도 (최대 3회)
  for (let i = 0; i < 3; i++) {
    const { error } = await supabaseAdmin
      .schema('diagnostics')
      .from('sessions')
      .update({ share_token: token })
      .eq('id', sess.id);
    if (!error) {
      return NextResponse.json({ token, created: true });
    }
    // duplicate token (희박) → 다시 시도
    if (!/duplicate|23505/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    token = genToken();
  }
  return NextResponse.json({ error: '토큰 발급 실패' }, { status: 500 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { examId: string; studentId: string } }
) {
  const { examId, studentId } = params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;

  const accessErr = await assertExamAccess(authed, examId);
  if (accessErr) return accessErr;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin 미설정' }, { status: 500 });
  }

  const sess = await loadSession(examId, studentId);
  if (!sess) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabaseAdmin
    .schema('diagnostics')
    .from('sessions')
    .update({ share_token: null })
    .eq('id', sess.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { examId: string; studentId: string } }
) {
  const { examId, studentId } = params;
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;

  const accessErr = await assertExamAccess(authed, examId);
  if (accessErr) return accessErr;

  const sess = await loadSession(examId, studentId);
  return NextResponse.json({ token: sess?.share_token ?? null });
}
