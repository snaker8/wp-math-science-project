// ============================================================================
// POST /api/student/qr/[examId] — 인쇄물(교재 단원·학습지) QR 을 찍었을 때 갈 곳
// ----------------------------------------------------------------------------
// 2026-11-28 대표: 「QR 을 찍으면 바로 학습 화면으로」. QR 주소 = /q/[examId] (lib/qr/generator buildExamQrUrl).
//   · 학생   → 이 시험지 풀이 세션(있으면 그것, 없으면 새로) → /student/solve/[sessionId]
//   · 선생님 → 그 시험지 화면
// 시험지 접근은 assertExamAccess (공통 풀 = 모두, 격리 학원 시험지 = 그 학원만).
// TODO(다음 단계): 가입 안 한 학생 가입 창 · 공용 QR 에서 배정 학생 이름 고르기.
// ============================================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertExamAccess } from '@/lib/security/institute-guard';
import { resolveStudentIdentity } from '@/lib/diagnostics/find-session';
import { findOrCreateStudentSession } from '@/lib/sessions/create-session';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, { params }: { params: { examId: string } }) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;

  const examId = params.examId;
  if (!UUID_RE.test(examId)) return NextResponse.json({ error: 'QR 주소가 올바르지 않습니다' }, { status: 400 });

  const { data: exam } = await sb.from('exams').select('id, title, deleted_at').eq('id', examId).maybeSingle();
  if (!exam || (exam as { deleted_at: string | null }).deleted_at) {
    return NextResponse.json({ error: '이 QR 의 학습지를 찾을 수 없습니다' }, { status: 404 });
  }
  const access = await assertExamAccess(sb, examId, scope);
  if (!access.ok) return NextResponse.json({ error: '이 학습지를 열 권한이 없습니다' }, { status: access.status });

  if (user.role !== 'STUDENT') {
    return NextResponse.json({ redirect: `/dashboard/cloud/${examId}` });
  }

  const myIds = await resolveStudentIdentity(sb, user.id);
  const r = await findOrCreateStudentSession(sb, { examId, myIds, userId: user.id, teacherNote: 'QR 풀이' });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ redirect: `/student/solve/${r.sessionId}`, created: r.created });
}
