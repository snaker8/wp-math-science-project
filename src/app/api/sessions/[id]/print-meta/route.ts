// ============================================================================
// GET /api/sessions/[id]/print-meta?variant=student|teacher
//   세션 인쇄 페이지(/print/session/[id])용 메타 — exam_id·시험명·학생명·QR.
//   문제 본문은 클라이언트가 useExamProblems(exam_id) 로 별도 로드(정식 2단 템플릿
//   렌더에 그대로 사용). 본 API 는 헤더 정보 + QR 만 제공.
//
// variant:
//   student — QR 이 /answer/[id] (학생 직접 답 입력)
//   teacher — QR 이 /grade/[id]  (강사 O/X 채점)
//
// ★ 학생 격리(assertStudentAccess) — 타 학원 세션 인쇄 차단.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertStudentAccess } from '@/lib/security/institute-guard';
import { buildSessionUrl, generateQRSvg } from '@/lib/qr/generator';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;

  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  const { data: session, error: sErr } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, student_id, exam_id, session_type, round_number')
    .eq('id', sessionId)
    .single();
  if (sErr || !session) {
    return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
  }

  // 학생 격리 가드 — 호출자 학원 소속(또는 본인/super_admin)만
  const access = await assertStudentAccess(sb, (session as { student_id: string }).student_id, scope);
  if (!access.ok) {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: access.status });
  }

  const { data: student } = await sb
    .from('users')
    .select('full_name, email, school')
    .eq('id', (session as { student_id: string }).student_id)
    .maybeSingle();
  const studentName =
    ((student as { full_name?: string })?.full_name) ||
    ((student as { email?: string })?.email) ||
    '(이름 없음)';

  const { data: exam } = await sb
    .from('exams')
    .select('title')
    .eq('id', (session as { exam_id: string }).exam_id)
    .maybeSingle();

  const variant = new URL(request.url).searchParams.get('variant') === 'teacher' ? 'teacher' : 'student';
  const origin = request.nextUrl.origin;
  const qrUrl = buildSessionUrl(sessionId, origin, variant === 'student' ? 'answer' : 'grade');
  let qrSvg = '';
  try {
    qrSvg = (await generateQRSvg(qrUrl)).replace(/\s(width|height)="[^"]*"/g, '');
  } catch {
    qrSvg = '';
  }

  return NextResponse.json({
    examId: (session as { exam_id: string }).exam_id,
    examTitle: ((exam as { title?: string })?.title) || '시험지',
    studentName,
    studentSchool: ((student as { school?: string | null })?.school) || '',
    sessionType: (session as { session_type: string }).session_type,
    roundNumber: (session as { round_number: number }).round_number,
    variant,
    qrSvg,
    qrUrl,
  });
}
