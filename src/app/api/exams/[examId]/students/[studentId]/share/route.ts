// ============================================================================
// POST  /api/exams/[examId]/students/[studentId]/share
//   학부모 공유 토큰 발급 (없으면 생성, 있으면 기존 반환)
//
// DELETE /api/exams/[examId]/students/[studentId]/share
//   토큰 회수
//
// ★ 채점 라인 2개 대응 (2026-06-12):
//   라인 A — diagnostics.sessions(EX) + items   → 토큰을 sessions.share_token 에 저장 (레거시 유지)
//   라인 B — print_sessions + session_results   → 토큰을 parent_share_tokens(report_kind='exam') 에 저장
//   기존엔 라인 A 만 봐서 QR/수동 채점만 있는 학생은 발급이 404
//   ("이 학생의 채점 기록이 없습니다") 로 실패. 리포트 본문(report/route.ts)과
//   동일하게 신원 병합(user↔roster) + 두 라인 모두 확인한다.
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

// 신원 병합 — studentId(user 또는 roster id) + 연결된 반대편 id 들 (report/route.ts 와 동일 규칙)
async function resolveIdentityIds(studentId: string): Promise<string[]> {
  const ids = new Set<string>([studentId]);
  if (!supabaseAdmin) return Array.from(ids);
  const { data: rosterSelf } = await supabaseAdmin
    .from('roster_students').select('promoted_user_id').eq('id', studentId).maybeSingle();
  const pu = (rosterSelf as { promoted_user_id: string | null } | null)?.promoted_user_id;
  if (pu) ids.add(pu);
  const { data: rostersForUser } = await supabaseAdmin
    .from('roster_students').select('id').eq('promoted_user_id', studentId);
  for (const r of (rostersForUser ?? []) as Array<{ id: string }>) ids.add(r.id);
  return Array.from(ids);
}

// 라인 A — 옛 공유 토큰 조회 전용 (신원 병합 포함). 새 토큰은 여기 안 만든다.
async function loadSession(examId: string, identityIds: string[]) {
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .schema('diagnostics')
    .from('sessions')
    .select('id, share_token')
    .eq('exam_id', examId)
    .in('student_id', identityIds)
    .order('conducted_at', { ascending: false })
    .limit(1);
  return data?.[0] as { id: string; share_token: string | null } | undefined;
}

// 라인 B — 채점된(session_results 존재, 보류 제외) print_session 이 있는가
async function hasGradedPrintSession(examId: string, identityIds: string[]): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const { data: psRows } = await supabaseAdmin
    .schema('diagnostics')
    .from('print_sessions')
    .select('id')
    .eq('exam_id', examId)
    .in('student_id', identityIds);
  const psIds = ((psRows ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (psIds.length === 0) return false;
  const { data: srRows } = await supabaseAdmin
    .schema('diagnostics')
    .from('session_results')
    .select('session_id, teacher_note')
    .in('session_id', psIds)
    .limit(100);
  return ((srRows ?? []) as Array<{ teacher_note: string | null }>).some(
    (sr) => !(sr.teacher_note ?? '').includes('자동채점 보류')
  );
}

// 라인 B 토큰 — parent_share_tokens(report_kind='exam') 활성 토큰 조회
async function loadExamToken(examId: string, identityIds: string[]) {
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from('parent_share_tokens')
    .select('token, is_active, expires_at')
    .eq('report_kind', 'exam')
    .eq('exam_id', examId)
    .in('student_id', identityIds)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1);
  const row = data?.[0] as { token: string; expires_at: string | null } | undefined;
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.token;
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

  const identityIds = await resolveIdentityIds(studentId);

  // ── 라인 A: EX 세션이 있으면 기존 방식 (sessions.share_token) ──
  // ── 이미 나간 옛 링크가 있으면 그대로 돌려준다 (학부모가 들고 있는 주소를 안 바꾼다) ──
  const sess = await loadSession(examId, identityIds);
  if (sess?.share_token) {
    return NextResponse.json({ token: sess.share_token, created: false });
  }

  // ★ 2026-09-02: **새 링크는 더 이상 A(sessions.share_token)로 만들지 않는다.**
  //   옛 코드는 A 세션이 있으면 A 토큰을 새로 발급해, 채점 라인을 B 로 옮긴 뒤에도
  //   레거시 경로가 계속 늘어났다. 읽기·회수는 A 도 계속 지원한다(기존 링크 보호).
  const graded = await hasGradedPrintSession(examId, identityIds);
  if (!graded) {
    return NextResponse.json(
      { error: '이 학생의 채점 기록이 없습니다.' },
      { status: 404 }
    );
  }

  const existing = await loadExamToken(examId, identityIds);
  if (existing) {
    return NextResponse.json({ token: existing, created: false });
  }

  const token = genToken();
  const { error: insErr } = await supabaseAdmin.from('parent_share_tokens').insert({
    token,
    student_id: studentId,
    exam_id: examId,
    report_kind: 'exam',
    is_active: true,
    created_by: authed.data.user.id || null,
  });
  if (insErr) {
    console.error('[exam share] parent_share_tokens insert error:', insErr.message);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ token, created: true });
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

  const identityIds = await resolveIdentityIds(studentId);

  // 라인 A 토큰 회수
  const sess = await loadSession(examId, identityIds);
  if (sess?.share_token) {
    const revoked = sess.share_token;
    const { error } = await supabaseAdmin
      .schema('diagnostics')
      .from('sessions')
      .update({ share_token: null })
      .eq('id', sess.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // ★ 마이그레이션이 같은 토큰을 print_sessions 에도 복사해 뒀다 — 같이 지운다.
    await supabaseAdmin
      .schema('diagnostics')
      .from('print_sessions')
      .update({ share_token: null })
      .eq('share_token', revoked);
  }

  // 라인 B 토큰 회수 (있으면 — 멱등)
  await supabaseAdmin
    .from('parent_share_tokens')
    .update({ is_active: false })
    .eq('report_kind', 'exam')
    .eq('exam_id', examId)
    .in('student_id', identityIds);

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

  const identityIds = await resolveIdentityIds(studentId);
  const sess = await loadSession(examId, identityIds);
  if (sess?.share_token) {
    return NextResponse.json({ token: sess.share_token });
  }
  const examToken = await loadExamToken(examId, identityIds);
  return NextResponse.json({ token: examToken });
}
