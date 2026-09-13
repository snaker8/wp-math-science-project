// ============================================================================
// GET /api/problems/candidates — 문항 교체·추가 후보풀 (설계서 S3 ❸)
// ----------------------------------------------------------------------------
// 시험지에 담은 문제 하나를 기준으로 「이 자리에 대신 넣을 만한 문제」를 찾는다.
//   ?problemId=…&kind=similar|past|hard|essay&exclude=id,id&limit=12
//
//   similar  같은 유형(depth5)의 다른 문제 — 난이도가 가까운 것부터
//   past     같은 유형인데 **학교기출** 시험지에서 나온 것 (exams.school_name)
//   hard     같은 유형의 더 높은 난이도 (기준보다 위)
//   essay    같은 유형의 서답형(서술형) — problems.answer_type
//
// ★ AI 안 쓴다. 전부 우리 DB 의 분류·출처로 찾는다 (AI 변형은 설계서 S5, 비용 별건).
// ★ 이미 담은 문제(exclude)는 빼고 준다 — 같은 문제를 두 번 넣는 사고 차단.
// ★ 유형이 없는 문제(미분류)는 후보를 못 찾는다 — 빈 배열 + reason 으로 알린다.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter, applyTrackFilter } from '@/lib/security/institute-guard';
import { bandLabelOf } from '@/lib/class/mastery-bands';

export const dynamic = 'force-dynamic';

export type CandidateKind = 'similar' | 'past' | 'hard' | 'essay';

export interface CandidateProblem {
  id: string;
  content: string;
  typeCode: string;
  difficulty: number | null;
  bandLabel: string | null;
  sourceName: string | null;
  sourceYear: number | null;
  /** 학교기출이면 학교명 */
  school: string | null;
}

const KINDS: CandidateKind[] = ['similar', 'past', 'hard', 'essay'];

export async function GET(req: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;
  const { scope } = authed.data;

  const sp = req.nextUrl.searchParams;
  const problemId = sp.get('problemId') ?? '';
  const kind = (sp.get('kind') ?? 'similar') as CandidateKind;
  const limit = Math.min(30, Math.max(1, Number(sp.get('limit')) || 12));
  const exclude = new Set((sp.get('exclude') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  if (!problemId) return NextResponse.json({ error: 'problemId 가 필요합니다' }, { status: 400 });
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'kind 가 올바르지 않습니다' }, { status: 400 });

  // 기준 문제의 유형·난이도
  const { data: baseRow } = await sb
    .from('classifications').select('type_code, difficulty').eq('problem_id', problemId).maybeSingle();
  const base = baseRow as { type_code: string | null; difficulty: string | number | null } | null;
  if (!base?.type_code) {
    return NextResponse.json({ items: [], reason: '이 문제에 유형이 없어 후보를 찾을 수 없습니다 (분류 대기)' });
  }
  const baseDiff = base.difficulty == null ? null : parseInt(String(base.difficulty), 10);

  // 같은 유형의 후보 (자기 자신 제외)
  let cq = sb
    .from('classifications')
    .select('problem_id, type_code, difficulty, problems!inner(deleted_at)')
    .eq('type_code', base.type_code)
    .neq('problem_id', problemId)
    .is('problems.deleted_at', null)
    .limit(400);
  if (kind === 'hard' && baseDiff != null && Number.isFinite(baseDiff)) {
    const above = Array.from({ length: 10 - baseDiff }, (_, i) => String(baseDiff + 1 + i));
    if (above.length === 0) return NextResponse.json({ items: [], reason: '이미 가장 높은 난이도입니다' });
    cq = cq.in('difficulty', above);
  }
  const { data: clsRows } = await cq;
  const cands = ((clsRows ?? []) as Array<{ problem_id: string; type_code: string; difficulty: string | number | null }>)
    .filter((c) => !exclude.has(c.problem_id));
  if (cands.length === 0) return NextResponse.json({ items: [], reason: '같은 유형의 다른 문제가 아직 없습니다' });

  // 본문 + 출처 (격리·트랙 통과분만)
  let pq = sb
    .from('problems')
    .select('id, content_latex, source_name, source_year, answer_type')
    .in('id', cands.map((c) => c.problem_id))
    .is('deleted_at', null);
  if (kind === 'essay') pq = pq.eq('answer_type', 'short_answer');
  pq = applyInstituteFilter(pq, scope, { allowCommonPool: true });
  pq = applyTrackFilter(pq, scope);
  const { data: probs } = await pq;
  const byId = new Map(
    ((probs ?? []) as Array<{ id: string; content_latex: string | null; source_name: string | null; source_year: number | null }>)
      .map((p) => [p.id, p]),
  );

  // 학교기출 여부 — exam_problems → exams.school_name
  const school = new Map<string, string>();
  const ids = Array.from(byId.keys());
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb
      .from('exam_problems')
      .select('problem_id, exams!inner(school_name, deleted_at)')
      .in('problem_id', ids.slice(i, i + 200))
      .not('exams.school_name', 'is', null)
      .is('exams.deleted_at', null);
    for (const r of (data ?? []) as Array<{ problem_id: string; exams: { school_name: string | null } | Array<{ school_name: string | null }> }>) {
      const e = Array.isArray(r.exams) ? r.exams[0] : r.exams;
      if (e?.school_name && !school.has(r.problem_id)) school.set(r.problem_id, e.school_name);
    }
  }

  let usable = cands.filter((c) => byId.has(c.problem_id));
  if (kind === 'past') usable = usable.filter((c) => school.has(c.problem_id));
  if (usable.length === 0) {
    const why = kind === 'past' ? '같은 유형의 학교기출 문제가 아직 없습니다'
      : kind === 'essay' ? '같은 유형의 서답형 문제가 아직 없습니다'
      : '고를 수 있는 문제가 없습니다';
    return NextResponse.json({ items: [], reason: why });
  }

  // similar 는 난이도가 가까운 것부터 (교체는 자리를 대신하는 것이라 난이도가 튀면 안 된다)
  if (kind === 'similar' && baseDiff != null) {
    usable.sort((a, b) =>
      Math.abs(Number(a.difficulty) - baseDiff) - Math.abs(Number(b.difficulty) - baseDiff));
  }

  const items: CandidateProblem[] = usable.slice(0, limit).map((c) => {
    const p = byId.get(c.problem_id)!;
    const d = c.difficulty == null ? null : parseInt(String(c.difficulty), 10);
    return {
      id: c.problem_id,
      content: p.content_latex ?? '',
      typeCode: c.type_code,
      difficulty: d != null && Number.isFinite(d) ? d : null,
      bandLabel: bandLabelOf(d),
      sourceName: p.source_name,
      sourceYear: p.source_year,
      school: school.get(c.problem_id) ?? null,
    };
  });
  return NextResponse.json({ items, baseTypeCode: base.type_code, baseDifficulty: baseDiff });
}
