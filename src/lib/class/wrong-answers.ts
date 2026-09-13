// ============================================================================
// 오답 모으기 — 채점 기록에서 「그 학생이 아직 못 넘어간 문제」를 뽑는다
// ----------------------------------------------------------------------------
// 오답 과제(clinic)·회차 오답유사·출제 라인 오답 소스가 모두 같은 걸 본다.
// 각자 짜 두면 언젠가 한 곳만 고쳐져 「같은 학생인데 화면마다 오답 수가 다르다」가 된다
// (채점 라인이 둘로 갈렸던 사고와 같은 종류). 한 곳에서만 푼다.
//
// ★ 추정도 AI 도 없다 — 채점 기록뿐이다 (비용 0).
// ★ 마지막에 맞힌 문제는 뺀다. 이미 넘어간 걸 또 시키면 교사 신뢰를 잃는다.
// ★ 「자동채점 보류」 결과는 세지 않는다 — 사람이 확인 안 한 건 오답이라 부를 수 없다.
// ★ 승격 전 roster id 에 남은 기록도 같이 본다 (신원 병합).
// ============================================================================

import { supabaseAdmin } from '@/lib/supabase/server';

type Admin = NonNullable<typeof supabaseAdmin>;

export interface WrongAnswers {
  /** problem_id → 이 문제를 틀린 학생(users.id) */
  missedBy: Map<string, Set<string>>;
  /** problem_id → 마지막으로 틀린 시각 */
  lastAt: Map<string, string>;
  /** owner id → 표시 이름 */
  nameById: Map<string, string>;
  /** 채점 기록이 하나라도 있던 학생 수 (오답이 0이어도 "기록은 있었다"를 구분한다) */
  studentsWithSessions: number;
  /** 이 학생들이 이미 풀어 본 문제 전부 (맞힌 것 포함) — 「새 문제」를 줄 때 빼야 한다 */
  seen: Set<string>;
}

export async function collectWrongAnswers(
  sb: Admin,
  opts: { studentIds: string[]; from?: string; to?: string },
): Promise<WrongAnswers> {
  const studentIds = opts.studentIds.filter(Boolean);
  const empty: WrongAnswers = {
    missedBy: new Map(), lastAt: new Map(), nameById: new Map(), studentsWithSessions: 0, seen: new Set(),
  };
  if (studentIds.length === 0) return empty;

  // 신원 병합 — 명단으로 채점한 뒤 승격한 학생은 기록이 옛 id 에 남는다
  const refsOf = new Map<string, string[]>(studentIds.map((id) => [id, [id]]));
  {
    const { data: rs } = await sb
      .from('roster_students').select('id, promoted_user_id').in('promoted_user_id', studentIds);
    for (const r of (rs ?? []) as Array<{ id: string; promoted_user_id: string }>) {
      refsOf.get(r.promoted_user_id)?.push(r.id);
    }
  }
  const ownerByRef = new Map<string, string>();
  for (const [owner, refs] of refsOf) for (const r of refs) ownerByRef.set(r, owner);

  // 이름 (users → 없으면 roster)
  const nameById = new Map<string, string>();
  {
    const { data: us } = await sb.from('users').select('id, full_name, email').in('id', studentIds);
    for (const u of (us ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      nameById.set(u.id, u.full_name || u.email?.split('@')[0] || '(이름 없음)');
    }
    const missing = studentIds.filter((id) => !nameById.has(id));
    if (missing.length > 0) {
      const { data: rs } = await sb.from('roster_students').select('id, full_name').in('id', missing);
      for (const r of (rs ?? []) as Array<{ id: string; full_name: string | null }>) {
        nameById.set(r.id, r.full_name || '(이름 없음)');
      }
    }
  }

  // 채점 세션
  let sq = sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, student_id, completed_at')
    .in('student_id', Array.from(ownerByRef.keys()))
    .not('completed_at', 'is', null);
  if (opts.from) sq = sq.gte('completed_at', `${opts.from}T00:00:00`);
  if (opts.to) sq = sq.lte('completed_at', `${opts.to}T23:59:59`);
  const { data: psRows } = await sq;
  const sessions = (psRows ?? []) as Array<{ id: string; student_id: string; completed_at: string | null }>;
  if (sessions.length === 0) return { ...empty, nameById };
  const ownerBySession = new Map(sessions.map((s) => [s.id, ownerByRef.get(s.student_id)!]));

  // 채점 결과 — ★ 1,000행 한계. 한 반이라도 회차가 쌓이면 바로 걸린다.
  type Res = {
    session_id: string; problem_id: string | null; is_correct: boolean;
    teacher_note: string | null; graded_at: string | null;
  };
  const results: Res[] = [];
  const sessIds = sessions.map((s) => s.id);
  for (let i = 0; i < sessIds.length; i += 300) {
    const chunk = sessIds.slice(i, i + 300);
    for (let from = 0; ; from += 1000) {
      const { data } = await sb
        .schema('diagnostics' as never)
        .from('session_results')
        .select('session_id, problem_id, is_correct, teacher_note, graded_at')
        .in('session_id', chunk)
        .order('id')
        .range(from, from + 999);
      const rows = (data ?? []) as Res[];
      results.push(...rows);
      if (rows.length < 1000) break;
    }
  }

  const seen = new Set<string>();
  for (const r of results) if (r.problem_id) seen.add(r.problem_id);

  // (학생, 문제) 별 마지막 채점만 본다 — 그 뒤에 맞혔으면 오답이 아니다
  const latest = new Map<string, Res>();
  for (const r of results) {
    if (!r.problem_id) continue;
    if ((r.teacher_note ?? '').includes('자동채점 보류')) continue;
    const owner = ownerBySession.get(r.session_id);
    if (!owner) continue;
    const key = `${owner}|${r.problem_id}`;
    const prev = latest.get(key);
    if (!prev || (r.graded_at ?? '') > (prev.graded_at ?? '')) latest.set(key, r);
  }

  const missedBy = new Map<string, Set<string>>();
  const lastAt = new Map<string, string>();
  for (const [key, r] of latest) {
    if (r.is_correct) continue;
    const [owner, problemId] = key.split('|');
    const set = missedBy.get(problemId) ?? new Set<string>();
    set.add(owner);
    missedBy.set(problemId, set);
    const when = r.graded_at ?? '';
    if (when && (!lastAt.get(problemId) || when > lastAt.get(problemId)!)) lastAt.set(problemId, when);
  }

  return {
    missedBy,
    lastAt,
    nameById,
    studentsWithSessions: new Set(sessions.map((s) => ownerBySession.get(s.id))).size,
    seen,
  };
}
