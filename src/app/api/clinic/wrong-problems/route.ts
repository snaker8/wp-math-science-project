// ============================================================================
// POST /api/clinic/wrong-problems — 오답 모으기 (오답 과제 ❶단계)
// ----------------------------------------------------------------------------
// 학생들이 **실제로 틀린 문제**를 그대로 모은다. 추정도 AI 도 없다 — 채점 기록뿐이다.
// (취약 과제가 "약한 유형에서 새 문제를 뽑는" 것이라면, 오답 과제는 "틀린 그 문제를 다시".)
//
// 요청 { studentIds: string[], from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', limit?: number }
// 응답 { groups: WrongGroup[], studentsWithData, totalProblems }
//
// ★ 여러 명이 틀린 문제를 앞에 둔다. 반 과제로 낼 때 제일 값싼 한 방이다.
// ★ 같은 학생이 같은 문제를 여러 번 틀렸어도 문제는 하나로 센다.
// ★ 마지막에 맞힌 문제는 뺀다 — 이미 넘어간 걸 또 시키면 교사 신뢰를 잃는다.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

interface WrongProblem {
  id: string;
  content: string;
  answer: unknown;
  typeCode: string | null;
  typeName: string;
  difficulty: number | null;
  missedBy: string[];      // 이 문제를 틀린 학생 이름
  lastMissedAt: string | null;
}

interface WrongGroup {
  code: string;            // 유형 코드 (없으면 '미분류')
  name: string;
  problems: WrongProblem[];
}

export async function POST(req: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;

  let body: { studentIds?: string[]; from?: string; to?: string; limit?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const studentIds = (body.studentIds ?? []).filter(Boolean);
  if (studentIds.length === 0) {
    return NextResponse.json({ error: 'studentIds 가 필요합니다' }, { status: 400 });
  }
  const limit = Math.min(Math.max(body.limit ?? 60, 1), 200);

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
  if (body.from) sq = sq.gte('completed_at', `${body.from}T00:00:00`);
  if (body.to) sq = sq.lte('completed_at', `${body.to}T23:59:59`);
  const { data: psRows } = await sq;
  const sessions = (psRows ?? []) as Array<{ id: string; student_id: string; completed_at: string | null }>;
  if (sessions.length === 0) {
    return NextResponse.json({ groups: [], studentsWithData: 0, totalProblems: 0 });
  }
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

  const missedBy = new Map<string, Set<string>>();   // problem_id → owner set
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

  if (missedBy.size === 0) {
    return NextResponse.json({
      groups: [], studentsWithData: new Set(sessions.map((s) => ownerBySession.get(s.id))).size, totalProblems: 0,
    });
  }

  // 여러 명이 틀린 것 → 최근 것 순
  const ranked = Array.from(missedBy.entries())
    .sort((a, b) => {
      const d = b[1].size - a[1].size;
      if (d !== 0) return d;
      return (lastAt.get(b[0]) ?? '').localeCompare(lastAt.get(a[0]) ?? '');
    })
    .slice(0, limit)
    .map(([id]) => id);

  // 문제 본문 + 분류
  const { data: probRows } = await sb
    .from('problems')
    .select('id, content_latex, answer_json, classifications(type_code, difficulty)')
    .in('id', ranked)
    .is('deleted_at', null);
  type ProbRow = {
    id: string; content_latex: string | null; answer_json: unknown;
    classifications:
      | { type_code: string | null; difficulty: number | null }
      | Array<{ type_code: string | null; difficulty: number | null }>
      | null;
  };
  const probs = (probRows ?? []) as ProbRow[];

  const typeCodes = Array.from(new Set(probs.map((p) => {
    const c = Array.isArray(p.classifications) ? p.classifications[0] : p.classifications;
    return c?.type_code ?? null;
  }).filter((x): x is string => !!x)));
  const typeName = new Map<string, string>();
  if (typeCodes.length > 0) {
    const { data: ts } = await sb
      .from('mathsecr_types').select('code, full_path').in('code', typeCodes);
    for (const t of (ts ?? []) as Array<{ code: string; full_path: string | null }>) {
      typeName.set(t.code, t.full_path || t.code);
    }
  }

  const byType = new Map<string, WrongProblem[]>();
  for (const p of probs) {
    const c = Array.isArray(p.classifications) ? p.classifications[0] : p.classifications;
    const code = c?.type_code ?? '미분류';
    const arr = byType.get(code) ?? [];
    arr.push({
      id: p.id,
      content: p.content_latex ?? '',
      answer: p.answer_json ?? null,
      typeCode: c?.type_code ?? null,
      typeName: typeName.get(code) ?? code,
      difficulty: c?.difficulty != null ? Number(c.difficulty) : null,
      missedBy: Array.from(missedBy.get(p.id) ?? []).map((o) => nameById.get(o) ?? '학생'),
      lastMissedAt: lastAt.get(p.id) ?? null,
    });
    byType.set(code, arr);
  }

  const groups: WrongGroup[] = Array.from(byType.entries())
    .map(([code, problems]) => ({
      code,
      name: typeName.get(code) ?? (code === '미분류' ? '미분류' : code),
      problems: problems.sort((a, b) => b.missedBy.length - a.missedBy.length),
    }))
    // 많이 틀린 유형이 앞
    .sort((a, b) => b.problems.length - a.problems.length);

  return NextResponse.json({
    groups,
    studentsWithData: new Set(Array.from(missedBy.values()).flatMap((s) => Array.from(s))).size,
    totalProblems: probs.length,
  });
}
