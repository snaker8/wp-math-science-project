// ============================================================================
// POST /api/clinic/weak-types — 취약 탐색 (매쓰홀릭 "취약과제 만들기" ❶단계 대응)
// ----------------------------------------------------------------------------
// 학생 + 기간만 받아 **약한 유형을 찾아내고 문제까지 뽑아** 돌려준다.
// 교사는 화면에서 빼기만 한다. (조사: docs/benchmark/matholic/08-type-analysis.md §10-1)
//
// ★ AI 안 쓴다. 이미 채점된 결과(diagnostics.student_node_status)만 본다. 비용 0.
//   "안 풀어본 유형"은 예측하지 않고 **모름으로 둔다** — 근거 없는 추정을 상담에 못 쓴다.
//   (대표 지시 2026-09-02: "AI예측까지는 지금 원하지 않는다")
//
// 요청  { studentIds: string[], from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', perType?: 1|2|3 }
// 응답  { groups: WeakGroup[], studentsWithData, totalTypes, totalProblems }
//
// ★ status 는 DB 에 영문 'alpha'/'beta'/'gamma' 로 저장된다.
//   그리스문자로 비교하면 항상 미스매치 → 결과 0개 (2026-06-29 실사고).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter, applyTrackFilter } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

/**
 * 약할수록 쉬운 문제부터. recommended-problems 와 같은 기준.
 *
 * ★ `classifications.difficulty` 는 **정수가 아니라 enum(`difficulty_level`)** 이고
 *   라벨이 문자열 `'1'`~`'10'` 이다. `.gte/.lte` 로 비교하면
 *   `operator does not exist: difficulty_level >= integer` 로 죽는다.
 *   그래서 범위가 아니라 **값 목록(`.in`)** 으로 넘긴다.
 */
const STATUS_DIFFICULTIES: Record<string, string[]> = {
  gamma: ['1', '2', '3', '4'], // 약점 → 기초 보강
  beta: ['3', '4', '5', '6'],  // 불안정 → 정공법
};

/** 약한 순서 — gamma 가 먼저 */
const STATUS_RANK: Record<string, number> = { gamma: 0, beta: 1 };

interface WeakProblem {
  id: string;
  content: string;
  answer: unknown;
  source: string;
  year: string | number;
  typeCode: string;
  typeName: string;
  difficulty: number;
  cognitiveDomain: string;
}

interface WeakGroup {
  code: string;           // mathsecr 유형 코드
  name: string;           // full_path (없으면 코드)
  status: 'gamma' | 'beta';
  studentNames: string[]; // 이 유형이 약한 학생들
  lastScore: number | null;
  problems: WeakProblem[];
}

/**
 * ★ 한 학생이 id 두 개를 갖는다 — 진단 데이터는 승격 전 roster id 에 남아 있다.
 *   이 병합을 빼면 승격된 학생은 약점이 하나도 안 잡힌다 (2026-09-02 실사고, PR #516).
 */
async function expandStudentIds(
  sb: NonNullable<typeof supabaseAdmin>,
  ids: string[],
): Promise<{ all: string[]; nameById: Map<string, string> }> {
  const all = new Set<string>(ids);
  const nameById = new Map<string, string>();

  // 이 user 로 승격된 roster (데이터가 거기 남아 있다)
  const { data: byPromoted } = await sb
    .from('roster_students')
    .select('id, full_name, promoted_user_id')
    .in('promoted_user_id', ids);
  for (const r of (byPromoted || []) as Array<{ id: string; full_name: string; promoted_user_id: string }>) {
    all.add(r.id);
    nameById.set(r.id, r.full_name);
    nameById.set(r.promoted_user_id, r.full_name);
  }

  // 넘어온 id 자체가 roster 인 경우 → 승격된 user id 도 포함
  const { data: selfRosters } = await sb
    .from('roster_students')
    .select('id, full_name, promoted_user_id')
    .in('id', ids);
  for (const r of (selfRosters || []) as Array<{ id: string; full_name: string; promoted_user_id: string | null }>) {
    nameById.set(r.id, r.full_name);
    if (r.promoted_user_id) { all.add(r.promoted_user_id); nameById.set(r.promoted_user_id, r.full_name); }
  }

  // users 쪽 이름 (roster 에 없던 것만 채움)
  const { data: users } = await sb
    .from('users')
    .select('id, full_name')
    .in('id', ids);
  for (const u of (users || []) as Array<{ id: string; full_name: string | null }>) {
    if (u.full_name && !nameById.has(u.id)) nameById.set(u.id, u.full_name);
  }

  return { all: Array.from(all), nameById };
}

export async function POST(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = supabaseAdmin;

  let body: { studentIds?: unknown; from?: unknown; to?: unknown; perType?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문을 읽지 못했습니다' }, { status: 400 });
  }

  const studentIds = Array.isArray(body.studentIds)
    ? body.studentIds.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : [];
  if (studentIds.length === 0) {
    return NextResponse.json({ error: '학생을 1명 이상 선택해주세요' }, { status: 400 });
  }
  if (studentIds.length > 50) {
    return NextResponse.json({ error: '학생은 한 번에 50명까지' }, { status: 400 });
  }

  const perType = [1, 2, 3].includes(Number(body.perType)) ? Number(body.perType) : 1;
  const from = typeof body.from === 'string' && body.from ? body.from : null;
  const to = typeof body.to === 'string' && body.to ? body.to : null;

  // ── 1) 신원 병합 후 약한 유형 수집 ──
  const { all: allIds, nameById } = await expandStudentIds(sb, studentIds);

  let q = sb
    .schema('diagnostics' as never)
    .from('student_node_status')
    .select('student_id, mathsecr_code, status, last_score, last_tested_at')
    .in('student_id', allIds)
    .in('status', ['gamma', 'beta']);
  if (from) q = q.gte('last_tested_at', `${from}T00:00:00`);
  if (to) q = q.lte('last_tested_at', `${to}T23:59:59`);

  const { data: statusRows, error: statusErr } = await q;
  if (statusErr) {
    console.error('[clinic/weak-types] status query:', statusErr.message);
    return NextResponse.json({ error: statusErr.message }, { status: 500 });
  }

  type StatusRow = {
    student_id: string; mathsecr_code: string;
    status: string; last_score: number | null; last_tested_at: string | null;
  };
  const rows = (statusRows || []) as StatusRow[];
  if (rows.length === 0) {
    return NextResponse.json({
      groups: [], studentsWithData: 0, totalTypes: 0, totalProblems: 0,
      message: '선택한 기간에 약한 유형이 없습니다. 기간을 넓히거나 진단을 먼저 진행하세요.',
    });
  }

  // 유형별로 묶는다 — 여러 학생이 같은 유형에 약하면 한 덩어리
  const byCode = new Map<string, {
    status: string; lastScore: number | null; students: Set<string>;
  }>();
  for (const r of rows) {
    const cur = byCode.get(r.mathsecr_code);
    const name = nameById.get(r.student_id) || '';
    if (!cur) {
      byCode.set(r.mathsecr_code, {
        status: r.status, lastScore: r.last_score, students: new Set(name ? [name] : []),
      });
      continue;
    }
    if (name) cur.students.add(name);
    // 더 약한 쪽(gamma)을 대표 상태로
    if ((STATUS_RANK[r.status] ?? 9) < (STATUS_RANK[cur.status] ?? 9)) {
      cur.status = r.status;
      cur.lastScore = r.last_score;
    }
  }

  // 약한 순 → 여러 학생이 걸린 순
  const codes = Array.from(byCode.entries())
    .sort((a, b) =>
      (STATUS_RANK[a[1].status] ?? 9) - (STATUS_RANK[b[1].status] ?? 9)
      || b[1].students.size - a[1].students.size)
    .slice(0, 40);   // ★ 상한 — 유형이 수백 개면 화면도 쿼리도 못 버틴다

  // ── 2) 유형 이름 ──
  const { data: typeRows } = await sb
    .from('mathsecr_types')
    .select('code, full_path')
    .in('code', codes.map(([c]) => c));
  const pathByCode = new Map<string, string>();
  for (const t of (typeRows || []) as Array<{ code: string; full_path: string | null }>) {
    if (t.full_path) pathByCode.set(t.code, t.full_path);
  }

  // ── 3) 유형별 문제 뽑기 ──
  //   ★ 유형 코드는 접두어로 본다 — 세부유형(5segment)까지 좁히면 은행에 한 문제뿐인
  //     경우가 많다 (실측: 오답 유형 166가지 중 36가지). 하위 유형까지 후보로.
  const groups: WeakGroup[] = [];
  let totalProblems = 0;

  for (const [code, info] of codes) {
    const diffs = STATUS_DIFFICULTIES[info.status] || ['1', '2', '3', '4', '5', '6'];

    // 후보 problem_id — classifications 에서 (삭제된 문제 제외)
    const { data: cls } = await sb
      .from('classifications')
      .select('problem_id, type_code, difficulty, cognitive_domain, expanded_type_code, problems!inner(deleted_at)')
      .like('type_code', `${code}%`)
      .in('difficulty', diffs)
      .is('problems.deleted_at', null)
      .limit(perType * 8);   // 격리 필터로 걸러질 것을 감안해 넉넉히

    const clsRows = (cls || []) as Array<{
      problem_id: string; type_code: string | null; difficulty: number | null;
      cognitive_domain: string | null; expanded_type_code: string | null;
    }>;
    if (clsRows.length === 0) continue;

    const clsById = new Map(clsRows.map((c) => [c.problem_id, c]));

    // 본문 — 격리 필터 통과분만 (공통풀 허용)
    let pq = sb
      .from('problems')
      .select('id, content_latex, answer_json, source_name, source_year')
      .in('id', clsRows.map((c) => c.problem_id))
      .is('deleted_at', null);
    pq = applyInstituteFilter(pq, scope, { allowCommonPool: true });
    pq = applyTrackFilter(pq, scope);
    const { data: probs } = await pq;

    const picked = ((probs || []) as Array<{
      id: string; content_latex: string | null; answer_json: unknown;
      source_name: string | null; source_year: number | null;
    }>).slice(0, perType);
    if (picked.length === 0) continue;

    groups.push({
      code,
      name: pathByCode.get(code) || code,
      status: info.status as 'gamma' | 'beta',
      studentNames: Array.from(info.students),
      lastScore: info.lastScore,
      problems: picked.map((p) => {
        const c = clsById.get(p.id);
        return {
          id: p.id,
          content: p.content_latex || '',
          answer: p.answer_json,
          source: p.source_name || '',
          year: p.source_year || '',
          typeCode: c?.type_code || code,
          typeName: pathByCode.get(code) || c?.type_code || code,
          difficulty: c?.difficulty || 0,
          cognitiveDomain: c?.cognitive_domain || '',
        };
      }),
    });
    totalProblems += picked.length;
  }

  return NextResponse.json({
    groups,
    studentsWithData: new Set(rows.map((r) => r.student_id)).size,
    totalTypes: groups.length,
    totalProblems,
  });
}
