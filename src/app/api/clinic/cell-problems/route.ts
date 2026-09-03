// ============================================================================
// POST /api/clinic/cell-problems — 숙달 매트릭스에서 고른 칸(소단원 × 난이도) → 문제 뽑기
// ----------------------------------------------------------------------------
// 매쓰홀릭 유형분석의 「칸 클릭 → 선택된 유형 N → 과제 만들기」(08 §3, §5-1) 대응.
// 교사가 문제를 고르지 않는다. 칸당 N문제가 이미 뽑혀 오고, 교사는 빼기만 한다.
//
// 요청 { classId, studentIds?: string[], cells: [{ unit, levels: string[], label? }],
//        perCell?: 1|2|3, excludeSeen?: boolean (기본 true), preview?: boolean }
// 응답 { groups: [{ code, name, unit, problems: [{ id, content, difficulty, typeCode }], supply, excluded }],
//        totalProblems }
//
// ★ AI 안 쓴다. classifications(유형·난이도) 에서 고르고 격리·트랙 필터를 통과한 문제만 준다.
// ★ 이미 푼 문제는 뺀다 — 같은 문제를 다시 내면 숙달이 아니라 암기를 잰다. (오답 과제는 별도)
// ★ 세부유형이 여럿이면 서로 다른 세부유형에서 먼저 뽑는다 — 한 유형만 3문제 나가는 걸 막는다.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter, applyTrackFilter, assertInstituteAccess } from '@/lib/security/institute-guard';
import { resolveClassStudents } from '@/lib/class/class-students';

export const dynamic = 'force-dynamic';

interface CellReq { unit: string; levels: string[]; label?: string }

export interface CellProblem {
  id: string;
  content: string;
  difficulty: number | null;
  typeCode: string;
}

export interface CellGroup {
  code: string;
  name: string;
  unit: string;
  problems: CellProblem[];
  /** 이 칸에 격리 통과 전 후보로 잡힌 문제 수 */
  supply: number;
  /** 이미 풀어서 뺀 수 */
  excluded: number;
}

const MAX_CELLS = 60;
const ALL_LEVELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

export async function POST(req: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;

  let body: {
    classId?: unknown; studentIds?: unknown; cells?: unknown;
    perCell?: unknown; excludeSeen?: unknown; preview?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const cellsIn = Array.isArray(body.cells) ? (body.cells as unknown[]) : [];
  const cells: CellReq[] = [];
  for (const c of cellsIn) {
    if (!c || typeof c !== 'object') continue;
    const o = c as Record<string, unknown>;
    const unit = typeof o.unit === 'string' ? o.unit.trim() : '';
    if (!/^MS\d{2}(-\d{2}){1,4}$/.test(unit)) continue;
    const levels = Array.isArray(o.levels)
      ? (o.levels as unknown[]).map(String).filter((l) => ALL_LEVELS.includes(l))
      : [];
    cells.push({ unit, levels: levels.length ? levels : ALL_LEVELS, label: typeof o.label === 'string' ? o.label : undefined });
  }
  if (cells.length === 0) return NextResponse.json({ error: '칸을 하나 이상 고르세요' }, { status: 400 });
  if (cells.length > MAX_CELLS) return NextResponse.json({ error: `칸은 한 번에 ${MAX_CELLS}개까지` }, { status: 400 });

  const preview = body.preview === true;
  const perCell = preview ? 1 : ([1, 2, 3].includes(Number(body.perCell)) ? Number(body.perCell) : 2);
  const excludeSeen = !preview && body.excludeSeen !== false;

  // ── 학생 (반 기준 + 신원 병합) ──
  let refs: string[] = [];
  if (typeof body.classId === 'string' && body.classId) {
    const { data: cls } = await sb
      .from('classes').select('id, institute_id').eq('id', body.classId).is('deleted_at', null).maybeSingle();
    if (!cls) return NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 });
    try {
      assertInstituteAccess(scope, (cls as { institute_id: string | null }).institute_id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const roster = await resolveClassStudents(sb, body.classId);
    const want = Array.isArray(body.studentIds)
      ? new Set((body.studentIds as unknown[]).map(String))
      : null;
    const chosen = roster.studentIds.filter((id) => !want || want.size === 0 || want.has(id));
    refs = chosen.flatMap((id) => roster.refsByStudent.get(id) ?? [id]);
  }

  // ── 이미 푼 문제 ──
  const seen = new Set<string>();
  if (excludeSeen && refs.length > 0) {
    const { data: ps } = await sb
      .schema('diagnostics' as never)
      .from('print_sessions')
      .select('id')
      .in('student_id', refs);
    const sessionIds = ((ps ?? []) as Array<{ id: string }>).map((s) => s.id);
    for (let i = 0; i < sessionIds.length; i += 300) {
      const chunk = sessionIds.slice(i, i + 300);
      for (let from = 0; ; from += 1000) {
        const { data } = await sb
          .schema('diagnostics' as never)
          .from('session_results')
          .select('problem_id')
          .in('session_id', chunk)
          .order('id')
          .range(from, from + 999);
        const rows = (data ?? []) as Array<{ problem_id: string | null }>;
        for (const r of rows) if (r.problem_id) seen.add(r.problem_id);
        if (rows.length < 1000) break;
      }
    }
  }

  // ── 소단원 이름 ──
  const units = Array.from(new Set(cells.map((c) => c.unit)));
  const { data: nameRows } = await sb
    .from('mathsecr_types')
    .select('code, depth, level2_name, level3_name, level4_name')
    .in('code', units);
  const nameByUnit = new Map<string, string>();
  for (const r of (nameRows ?? []) as Array<{
    code: string; depth: number; level2_name: string | null; level3_name: string | null; level4_name: string | null;
  }>) {
    nameByUnit.set(r.code, (r.depth === 3 ? r.level2_name : r.depth === 4 ? r.level3_name : r.level4_name) || r.code);
  }

  // ── 칸별 문제 뽑기 ──
  const groups: CellGroup[] = [];
  let totalProblems = 0;

  for (const cell of cells) {
    const { data: clsRows } = await sb
      .from('classifications')
      .select('problem_id, type_code, difficulty, problems!inner(deleted_at)')
      .or(`type_code.eq.${cell.unit},type_code.like.${cell.unit}-%`)
      .in('difficulty', cell.levels)
      .is('problems.deleted_at', null)
      .limit(Math.max(perCell * 12, 24));
    const cands = (clsRows ?? []) as Array<{ problem_id: string; type_code: string | null; difficulty: string | number | null }>;
    const supplyCount = cands.length;
    if (cands.length === 0) {
      groups.push({
        code: `${cell.unit}|${cell.levels.join(',')}`,
        name: cell.label || nameByUnit.get(cell.unit) || cell.unit,
        unit: cell.unit, problems: [], supply: 0, excluded: 0,
      });
      continue;
    }

    const fresh = cands.filter((c) => !seen.has(c.problem_id));
    const excluded = cands.length - fresh.length;
    const pool = fresh.length > 0 ? fresh : cands;   // 다 풀었으면 어쩔 수 없이 다시 낸다 — 빈손보다 낫다

    // 격리·트랙 통과분만 본문
    let pq = sb
      .from('problems')
      .select('id, content_latex')
      .in('id', pool.map((c) => c.problem_id))
      .is('deleted_at', null);
    pq = applyInstituteFilter(pq, scope, { allowCommonPool: true });
    pq = applyTrackFilter(pq, scope);
    const { data: probs } = await pq;
    const contentById = new Map(
      ((probs ?? []) as Array<{ id: string; content_latex: string | null }>).map((p) => [p.id, p.content_latex ?? ''])
    );
    const usable = pool.filter((c) => contentById.has(c.problem_id));

    // 세부유형 분산: 서로 다른 type_code 를 먼저 한 바퀴, 그 뒤 나머지
    const byType = new Map<string, typeof usable>();
    for (const c of usable) {
      const k = c.type_code ?? '';
      if (!byType.has(k)) byType.set(k, []);
      byType.get(k)!.push(c);
    }
    const ordered: typeof usable = [];
    let progressed = true;
    while (progressed && ordered.length < usable.length) {
      progressed = false;
      for (const arr of byType.values()) {
        const next = arr.shift();
        if (next) { ordered.push(next); progressed = true; }
      }
    }
    const picked = ordered.slice(0, perCell);
    if (picked.length === 0) {
      groups.push({
        code: `${cell.unit}|${cell.levels.join(',')}`,
        name: cell.label || nameByUnit.get(cell.unit) || cell.unit,
        unit: cell.unit, problems: [], supply: supplyCount, excluded,
      });
      continue;
    }

    groups.push({
      code: `${cell.unit}|${cell.levels.join(',')}`,
      name: cell.label || nameByUnit.get(cell.unit) || cell.unit,
      unit: cell.unit,
      supply: supplyCount,
      excluded,
      problems: picked.map((c) => {
        const d = c.difficulty == null ? null : parseInt(String(c.difficulty), 10);
        return {
          id: c.problem_id,
          content: contentById.get(c.problem_id) ?? '',
          difficulty: d != null && Number.isFinite(d) ? d : null,
          typeCode: c.type_code ?? cell.unit,
        };
      }),
    });
    totalProblems += picked.length;
  }

  return NextResponse.json({ groups, totalProblems });
}
