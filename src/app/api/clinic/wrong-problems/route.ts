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
import { collectWrongAnswers } from '@/lib/class/wrong-answers';

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

  // ★ 오답 판정은 한 곳에서만 — lib/class/wrong-answers
  const { missedBy, lastAt, nameById, studentsWithSessions } =
    await collectWrongAnswers(sb, { studentIds, from: body.from, to: body.to });

  if (missedBy.size === 0) {
    return NextResponse.json({ groups: [], studentsWithData: studentsWithSessions, totalProblems: 0 });
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
