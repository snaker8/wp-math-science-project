// ============================================================================
// POST /api/exams/wrong-source — 오답 소스 (설계서 S4)
// ----------------------------------------------------------------------------
// 출제 라인에서 「학생이 틀린 것」을 근거로 시험지를 만든다. 메꾸기 루프의 진입로다.
//
// body { studentIds, from?, to?, mode: 'original' | 'similar', perWrong?, limit? }
//
//   original  틀린 **그 문제** 그대로. 다시 풀려 확인한다.
//   similar   틀린 문제와 **같은 유형의 새 문제**. 답을 외운 게 아닌지 본다.
//             난이도는 가까운 것부터 — 오답 보충인데 더 어려우면 또 틀린다.
//
// ★ AI 안 쓴다. 채점 기록과 우리 분류만 본다 (비용 0). AI 변형은 설계서 S5.
// ★ similar 는 그 학생들이 **이미 풀어 본 문제는 뺀다** — 새 문제라며 본 걸 주면 안 된다.
// ★ 유형이 없는(미분류) 오답은 similar 로 못 넘어간다. 숨기지 않고 몇 개인지 알린다.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter, applyTrackFilter } from '@/lib/security/institute-guard';
import { collectWrongAnswers } from '@/lib/class/wrong-answers';
import { bandLabelOf } from '@/lib/class/mastery-bands';

export const dynamic = 'force-dynamic';

export type WrongSourceMode = 'original' | 'similar';

export interface WrongSourceRow {
  id: string;
  content: string;
  source: string | null;
  year: number | null;
  typeCode: string | null;
  typeName: string;
  difficulty: number | null;
  bandLabel: string | null;
  /** original: 이 문제를 틀린 학생 이름 / similar: 근거가 된 오답을 틀린 학생 */
  missedBy: string[];
  /** similar 일 때 — 근거가 된 오답의 난이도 */
  basedOnDifficulty?: number | null;
}

export interface WrongSourceGroup {
  code: string;
  name: string;
  problems: WrongSourceRow[];
}

interface ProbRow {
  id: string; content_latex: string | null; source_name: string | null; source_year: number | null;
}

export async function POST(req: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;
  const { scope } = authed.data;

  let body: { studentIds?: string[]; from?: string; to?: string; mode?: string; perWrong?: number; limit?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const studentIds = (body.studentIds ?? []).filter(Boolean);
  if (studentIds.length === 0) return NextResponse.json({ error: '학생을 1명 이상 고르세요' }, { status: 400 });
  const mode: WrongSourceMode = body.mode === 'similar' ? 'similar' : 'original';
  const perWrong = Math.min(3, Math.max(1, Number(body.perWrong) || 1));
  const limit = Math.min(120, Math.max(1, Number(body.limit) || 60));

  const { missedBy, lastAt, nameById, studentsWithSessions, seen } =
    await collectWrongAnswers(sb, { studentIds, from: body.from, to: body.to });

  if (missedBy.size === 0) {
    return NextResponse.json({
      groups: [], studentsWithData: studentsWithSessions, totalProblems: 0, unclassified: 0, mode,
      message: studentsWithSessions === 0
        ? '이 기간에 채점된 기록이 없습니다. 기간을 넓히거나 채점을 먼저 해주세요.'
        : '채점 기록은 있는데 남은 오답이 없습니다 (마지막에 맞힌 문제는 빼고 셉니다).',
    });
  }

  // 많이 틀린 것 → 최근 것 순
  const wrongIds = Array.from(missedBy.entries())
    .sort((a, b) => {
      const d = b[1].size - a[1].size;
      if (d !== 0) return d;
      return (lastAt.get(b[0]) ?? '').localeCompare(lastAt.get(a[0]) ?? '');
    })
    .slice(0, limit)
    .map(([id]) => id);

  // 오답의 분류
  const wrongCls = new Map<string, { code: string | null; diff: number | null }>();
  for (let i = 0; i < wrongIds.length; i += 200) {
    const { data } = await sb
      .from('classifications').select('problem_id, type_code, difficulty').in('problem_id', wrongIds.slice(i, i + 200));
    for (const c of (data ?? []) as Array<{ problem_id: string; type_code: string | null; difficulty: string | number | null }>) {
      const d = c.difficulty == null ? null : parseInt(String(c.difficulty), 10);
      wrongCls.set(c.problem_id, { code: c.type_code ?? null, diff: Number.isFinite(d as number) ? (d as number) : null });
    }
  }
  const unclassified = wrongIds.filter((id) => !wrongCls.get(id)?.code).length;

  // ── 결과 행 만들기 ───────────────────────────────────────────────────
  const rows: Array<{ id: string; typeCode: string | null; diff: number | null; names: string[]; basedOn?: number | null }> = [];

  if (mode === 'original') {
    for (const id of wrongIds) {
      const c = wrongCls.get(id);
      rows.push({
        id, typeCode: c?.code ?? null, diff: c?.diff ?? null,
        names: Array.from(missedBy.get(id) ?? []).map((o) => nameById.get(o) ?? '학생'),
      });
    }
  } else {
    // 유형별로 묶어 한 번에 후보를 긁는다 (오답 하나마다 쿼리하면 느리다)
    const byType = new Map<string, string[]>();   // type_code → 그 유형에서 틀린 문제들
    for (const id of wrongIds) {
      const code = wrongCls.get(id)?.code;
      if (!code) continue;
      const arr = byType.get(code) ?? [];
      arr.push(id);
      byType.set(code, arr);
    }
    const codes = Array.from(byType.keys());
    if (codes.length === 0) {
      return NextResponse.json({
        groups: [], studentsWithData: studentsWithSessions, totalProblems: 0, unclassified, mode,
        message: '틀린 문제에 유형이 아직 안 붙어 같은 유형의 새 문제를 찾을 수 없습니다 (분류 대기). 「틀린 문제 그대로」로 뽑아보세요.',
      });
    }

    const pool = new Map<string, Array<{ id: string; diff: number | null }>>();   // type_code → 후보
    for (let i = 0; i < codes.length; i += 50) {
      const { data } = await sb
        .from('classifications')
        .select('problem_id, type_code, difficulty, problems!inner(deleted_at)')
        .in('type_code', codes.slice(i, i + 50))
        .is('problems.deleted_at', null)
        .limit(3000);
      for (const c of (data ?? []) as Array<{ problem_id: string; type_code: string; difficulty: string | number | null }>) {
        if (seen.has(c.problem_id)) continue;             // 이미 풀어 본 건 새 문제가 아니다
        if (missedBy.has(c.problem_id)) continue;
        const d = c.difficulty == null ? null : parseInt(String(c.difficulty), 10);
        const arr = pool.get(c.type_code) ?? [];
        arr.push({ id: c.problem_id, diff: Number.isFinite(d as number) ? (d as number) : null });
        pool.set(c.type_code, arr);
      }
    }

    const used = new Set<string>();
    for (const [code, wrongsOfType] of byType) {
      const cands = pool.get(code) ?? [];
      for (const wid of wrongsOfType) {
        const base = wrongCls.get(wid)?.diff ?? null;
        const names = Array.from(missedBy.get(wid) ?? []).map((o) => nameById.get(o) ?? '학생');
        const chosen = cands
          .filter((c) => !used.has(c.id))
          .sort((a, b) => {
            // 난이도가 가까운 것부터 — 오답 보충인데 더 어려우면 또 틀린다
            if (base == null) return 0;
            const da = a.diff == null ? 99 : Math.abs(a.diff - base);
            const db = b.diff == null ? 99 : Math.abs(b.diff - base);
            return da - db;
          })
          .slice(0, perWrong);
        for (const c of chosen) {
          used.add(c.id);
          rows.push({ id: c.id, typeCode: code, diff: c.diff, names, basedOn: base });
        }
      }
    }
    if (rows.length === 0) {
      return NextResponse.json({
        groups: [], studentsWithData: studentsWithSessions, totalProblems: 0, unclassified, mode,
        message: '같은 유형인데 아직 안 풀어 본 문제가 없습니다. 「틀린 문제 그대로」로 뽑거나 문제를 더 채워야 합니다.',
      });
    }
  }

  // ── 본문·출처 (격리·트랙 통과분만) ──────────────────────────────────
  const ids = Array.from(new Set(rows.map((r) => r.id)));
  const byId = new Map<string, ProbRow>();
  for (let i = 0; i < ids.length; i += 200) {
    let pq = sb.from('problems')
      .select('id, content_latex, source_name, source_year')
      .in('id', ids.slice(i, i + 200))
      .is('deleted_at', null);
    pq = applyInstituteFilter(pq, scope, { allowCommonPool: true });
    pq = applyTrackFilter(pq, scope);
    const { data } = await pq;
    for (const p of (data ?? []) as ProbRow[]) byId.set(p.id, p);
  }

  // 유형 이름
  const typeCodes = Array.from(new Set(rows.map((r) => r.typeCode).filter((x): x is string => !!x)));
  const typeName = new Map<string, string>();
  for (let i = 0; i < typeCodes.length; i += 200) {
    const { data } = await sb.from('mathsecr_types').select('code, full_path').in('code', typeCodes.slice(i, i + 200));
    for (const t of (data ?? []) as Array<{ code: string; full_path: string | null }>) {
      typeName.set(t.code, t.full_path || t.code);
    }
  }

  const groups = new Map<string, WrongSourceGroup>();
  for (const r of rows) {
    const p = byId.get(r.id);
    if (!p) continue;                                    // 격리 밖 문제는 조용히 뺀다
    const code = r.typeCode ?? '미분류';
    const name = r.typeCode ? (typeName.get(r.typeCode) ?? r.typeCode) : '미분류';
    const g = groups.get(code) ?? { code, name, problems: [] };
    g.problems.push({
      id: r.id,
      content: p.content_latex ?? '',
      source: p.source_name,
      year: p.source_year,
      typeCode: r.typeCode,
      typeName: name,
      difficulty: r.diff,
      bandLabel: bandLabelOf(r.diff),
      missedBy: r.names,
      ...(mode === 'similar' ? { basedOnDifficulty: r.basedOn ?? null } : {}),
    });
    groups.set(code, g);
  }
  for (const g of groups.values()) g.problems.sort((a, b) => b.missedBy.length - a.missedBy.length);

  const out = Array.from(groups.values()).sort((a, b) => b.problems.length - a.problems.length);
  return NextResponse.json({
    groups: out,
    studentsWithData: new Set(Array.from(missedBy.values()).flatMap((s) => Array.from(s))).size,
    totalProblems: out.reduce((n, g) => n + g.problems.length, 0),
    unclassified,
    mode,
  });
}
