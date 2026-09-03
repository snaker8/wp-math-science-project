// ============================================================================
// GET /api/classes/[classId]/hub — 반 허브 「학생」 탭 데이터
// ----------------------------------------------------------------------------
// 반 하나를 열면 그 반 학생들의 상태가 한 화면에 나온다.
// (docs/PLAN_CLASS_HUB_REBUILD.md 단계 2 — "반이 스파인")
//
// 지금까지는 학생 한 명을 보려면 메뉴 6곳을 돌아야 했다. 반 단위가 학원의 실제
// 운영 단위인데 IA 는 학생 단위였다.
//
// 한 학생 줄에 들어가는 것:
//   · 채점 회차 · 채점된 문항 수 · 정답률
//   · 마지막 학습일
//   · 숙달 α/β/γ 개수 (student_node_status)
//
// ★ 채점은 B라인 단일 (print_sessions + session_results).
//   A(sessions/items)는 안 읽는다 — 이미 B 로 이관됐고, 둘 다 읽으면 두 번 세게 된다.
// ★ 신원 병합 필수 — 명단(roster)으로 채점한 뒤 정식 학생으로 승격하면 기록은 옛 id 에 남는다.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ classId: string }>;
}

export interface HubStudent {
  id: string;                    // users.id (반 등록 기준)
  name: string;
  grade: string;
  /** 채점 기록이 실제로 붙어 있는 id 들 (승격 전 명단 id 포함) — 리포트 링크용 */
  refIds: string[];
  sessionCount: number;
  gradedCount: number;
  correctCount: number;
  correctPct: number | null;     // 채점 문항이 없으면 null (0% 와 구분)
  lastActivityAt: string | null;
  alpha: number;                 // 숙달
  beta: number;                  // 흔들림
  gamma: number;                 // 취약
}

function gradeLabel(g: unknown): string {
  const n = typeof g === 'number' ? g : parseInt(String(g ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n <= 6) return `초${n}`;
  if (n <= 9) return `중${n - 6}`;
  if (n <= 12) return `고${n - 9}`;
  return String(n);
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { classId } = await params;

  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  // 1) 반 + 격리 가드
  const { data: cls } = await sb
    .from('classes')
    .select('id, name, description, institute_id, tutor_id, created_at')
    .eq('id', classId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!cls) return NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 });
  try {
    assertInstituteAccess(scope, (cls as { institute_id: string | null }).institute_id);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 2) 반 학생 (등록 확정만)
  const { data: enrolls } = await sb
    .from('class_enrollments')
    .select('student_id, enrolled_at')
    .eq('class_id', classId)
    .eq('status', 'ACCEPTED');
  const studentIds = Array.from(
    new Set(((enrolls ?? []) as Array<{ student_id: string }>).map((e) => e.student_id))
  );

  if (studentIds.length === 0) {
    return NextResponse.json({ class: cls, students: [] as HubStudent[] });
  }

  const { data: userRows } = await sb
    .from('users')
    .select('id, full_name, email, grade')
    .in('id', studentIds);
  const userById = new Map(
    ((userRows ?? []) as Array<{ id: string; full_name: string | null; email: string | null; grade: number | null }>)
      .map((u) => [u.id, u])
  );

  // 3) 신원 병합 — 이 학생들로 승격된 명단 id 를 함께 본다
  const { data: rosters } = await sb
    .from('roster_students')
    .select('id, promoted_user_id')
    .in('promoted_user_id', studentIds);
  const refsByStudent = new Map<string, string[]>(studentIds.map((id) => [id, [id]]));
  const ownerByRef = new Map<string, string>(studentIds.map((id) => [id, id]));
  for (const r of (rosters ?? []) as Array<{ id: string; promoted_user_id: string }>) {
    refsByStudent.get(r.promoted_user_id)?.push(r.id);
    ownerByRef.set(r.id, r.promoted_user_id);
  }
  const allRefs = Array.from(ownerByRef.keys());

  // 4) 채점 세션 (B라인)
  const { data: psRows } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, student_id, completed_at, issued_at')
    .in('student_id', allRefs);
  const sessions = (psRows ?? []) as Array<{
    id: string; student_id: string; completed_at: string | null; issued_at: string | null;
  }>;

  // 5) 채점 결과 — ★ 1,000행에서 잘린다. 반 하나라도 회차가 쌓이면 걸린다.
  const sessionIds = sessions.map((s) => s.id);
  const results: Array<{ session_id: string; is_correct: boolean; teacher_note: string | null }> = [];
  for (let i = 0; i < sessionIds.length; i += 300) {
    const chunk = sessionIds.slice(i, i + 300);
    for (let from = 0; ; from += 1000) {
      const { data } = await sb
        .schema('diagnostics' as never)
        .from('session_results')
        .select('session_id, is_correct, teacher_note')
        .in('session_id', chunk)
        .order('id')
        .range(from, from + 999);
      const rows = (data ?? []) as typeof results;
      results.push(...rows);
      if (rows.length < 1000) break;
    }
  }

  const ownerBySession = new Map(sessions.map((s) => [s.id, ownerByRef.get(s.student_id) ?? null]));
  const agg = new Map<string, { graded: number; correct: number }>();
  const gradedSessions = new Set<string>();
  for (const r of results) {
    if ((r.teacher_note ?? '').includes('자동채점 보류')) continue;  // 보류 문항 제외
    const owner = ownerBySession.get(r.session_id);
    if (!owner) continue;
    gradedSessions.add(r.session_id);
    const a = agg.get(owner) ?? { graded: 0, correct: 0 };
    a.graded += 1;
    if (r.is_correct) a.correct += 1;
    agg.set(owner, a);
  }

  // 세션 수·마지막 학습일은 **채점된 세션만** 센다 (배포만 하고 안 친 건 학습이 아니다)
  const sessCount = new Map<string, number>();
  const lastAt = new Map<string, string>();
  for (const s of sessions) {
    if (!gradedSessions.has(s.id)) continue;
    const owner = ownerByRef.get(s.student_id);
    if (!owner) continue;
    sessCount.set(owner, (sessCount.get(owner) ?? 0) + 1);
    const when = s.completed_at ?? s.issued_at;
    if (when && (!lastAt.get(owner) || when > lastAt.get(owner)!)) lastAt.set(owner, when);
  }

  // 6) 숙달 상태 (α 숙달 / β 흔들림 / γ 취약)
  const mastery = new Map<string, { alpha: number; beta: number; gamma: number }>();
  {
    const rows: Array<{ student_id: string; status: string | null }> = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await sb
        .schema('diagnostics' as never)
        .from('student_node_status')
        .select('student_id, status')
        .in('student_id', allRefs)
        .order('student_id')
        .range(from, from + 999);
      const batch = (data ?? []) as typeof rows;
      rows.push(...batch);
      if (batch.length < 1000) break;
    }
    for (const r of rows) {
      const owner = ownerByRef.get(r.student_id);
      if (!owner) continue;
      const m = mastery.get(owner) ?? { alpha: 0, beta: 0, gamma: 0 };
      if (r.status === 'alpha') m.alpha += 1;
      else if (r.status === 'beta') m.beta += 1;
      else if (r.status === 'gamma') m.gamma += 1;
      mastery.set(owner, m);
    }
  }

  const students: HubStudent[] = studentIds.map((id) => {
    const u = userById.get(id);
    const a = agg.get(id) ?? { graded: 0, correct: 0 };
    const m = mastery.get(id) ?? { alpha: 0, beta: 0, gamma: 0 };
    return {
      id,
      name: u?.full_name || u?.email?.split('@')[0] || '(이름 없음)',
      grade: gradeLabel(u?.grade),
      refIds: refsByStudent.get(id) ?? [id],
      sessionCount: sessCount.get(id) ?? 0,
      gradedCount: a.graded,
      correctCount: a.correct,
      correctPct: a.graded > 0 ? Math.round((a.correct * 100) / a.graded) : null,
      lastActivityAt: lastAt.get(id) ?? null,
      ...m,
    };
  });

  // 이름순 — 학원에서 부르는 순서
  students.sort((x, y) => x.name.localeCompare(y.name, 'ko'));

  return NextResponse.json({ class: cls, students });
}
