// ============================================================================
// GET /api/classes/[classId]/mastery — 반 허브 「숙달」 탭 데이터 (유형 숙달 매트릭스)
// ----------------------------------------------------------------------------
// docs/PLAN_CLASS_HUB_REBUILD.md 단계 5 · 매쓰홀릭 조사 08-type-analysis (유형분석 /ug-score).
//
// 서버는 **집계하지 않고 재료를 그대로 준다** — 채점 문항(학생·유형코드·난이도·정오·시각),
// 수학비서 트리(대단원·중단원·소단원 이름), 문제은행 공급량(소단원 × 난이도별 문제 수).
// 접는 축(4단계/6단계)·기간·학생·추정 표시는 전부 클라이언트 토글이라 서버가 미리 접으면
// 토글마다 다시 불러야 한다. 반 하나의 문항은 수백~수천 행 — 한 번에 내려도 가볍다.
// (같은 재료로 단계 6 「이력」이 graded_at 누적으로 그려진다 — 스냅샷 테이블 없이.)
//
// ★ 채점은 B라인 단일 (print_sessions + session_results). hub 와 같은 기준.
// ★ 신원 병합은 resolveClassStudents 한 곳 — 학생 탭과 숫자가 어긋나지 않게.
// ★ 문제은행 공급은 격리(공통풀 허용)·트랙 필터를 통과한 것만 센다 — 이 학원이 실제로
//   낼 수 있는 문제가 없는 칸은 매트릭스에 존재하지 않아야 한다.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter, applyTrackFilter, assertInstituteAccess } from '@/lib/security/institute-guard';
import { resolveClassStudents, displayName, gradeLabel } from '@/lib/class/class-students';
import { subjectOf, unitOf } from '@/lib/class/mastery-bands';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ classId: string }>;
}

export interface MasteryItem {
  /** users.id (병합 후) */
  s: string;
  /** 수학비서 코드 — classifications.type_code 우선, 없으면 session_results.mathsecr_code */
  code: string;
  /** 난이도 1~10, 분류 없으면 null */
  d: number | null;
  ok: boolean;
  /** 채점 시각 ISO */
  at: string;
  pid: string;
}

export interface MasteryTreeNode {
  code: string;
  depth: 2 | 3 | 4;
  name: string;
}

export interface MasterySupply {
  unit: string;
  d: number;
  count: number;
}

export interface MasteryPayload {
  class: { id: string; name: string };
  students: Array<{ id: string; name: string; grade: string }>;
  subjects: Array<{ code: string; name: string; items: number }>;
  tree: MasteryTreeNode[];
  supply: MasterySupply[];
  items: MasteryItem[];
  /** 코드가 없어 매트릭스에 못 놓은 문항 수 (분류·유형 미기록) */
  unplaced: number;
}

const PAGE = 1000;

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
    .select('id, name, institute_id')
    .eq('id', classId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!cls) return NextResponse.json({ error: '반을 찾을 수 없습니다' }, { status: 404 });
  try {
    assertInstituteAccess(scope, (cls as { institute_id: string | null }).institute_id);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const classInfo = { id: (cls as { id: string }).id, name: (cls as { name: string }).name };

  // 2) 학생 + 신원 병합
  const roster = await resolveClassStudents(sb, classId);
  const students = roster.studentIds.map((id) => {
    const u = roster.userById.get(id);
    return { id, name: displayName(u), grade: gradeLabel(u?.grade) };
  });

  const empty: MasteryPayload = {
    class: classInfo, students, subjects: [], tree: [], supply: [], items: [], unplaced: 0,
  };
  if (roster.allRefs.length === 0) return NextResponse.json(empty);

  // 3) 채점 세션 (B라인)
  const { data: psRows } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id, student_id, completed_at, issued_at')
    .in('student_id', roster.allRefs);
  const sessions = (psRows ?? []) as Array<{
    id: string; student_id: string; completed_at: string | null; issued_at: string | null;
  }>;
  if (sessions.length === 0) return NextResponse.json(empty);
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  // 4) 채점 결과 — 1,000행 페이지네이션 (회차 쌓이면 잘린다)
  type SR = {
    session_id: string; problem_id: string | null; is_correct: boolean | null;
    mathsecr_code: string | null; teacher_note: string | null; graded_at: string | null;
  };
  const results: SR[] = [];
  const sessionIds = sessions.map((s) => s.id);
  for (let i = 0; i < sessionIds.length; i += 300) {
    const chunk = sessionIds.slice(i, i + 300);
    for (let from = 0; ; from += PAGE) {
      const { data } = await sb
        .schema('diagnostics' as never)
        .from('session_results')
        .select('session_id, problem_id, is_correct, mathsecr_code, teacher_note, graded_at')
        .in('session_id', chunk)
        .order('id')
        .range(from, from + PAGE - 1);
      const rows = (data ?? []) as SR[];
      results.push(...rows);
      if (rows.length < PAGE) break;
    }
  }

  // 5) 분류 (유형 코드 · 난이도) — problem_id 로
  const problemIds = Array.from(new Set(results.map((r) => r.problem_id).filter((x): x is string => !!x)));
  const clsById = new Map<string, { type_code: string | null; difficulty: string | number | null }>();
  for (let i = 0; i < problemIds.length; i += 200) {
    const chunk = problemIds.slice(i, i + 200);
    const { data } = await sb
      .from('classifications')
      .select('problem_id, type_code, difficulty')
      .in('problem_id', chunk);
    for (const c of (data ?? []) as Array<{ problem_id: string; type_code: string | null; difficulty: string | number | null }>) {
      clsById.set(c.problem_id, c);
    }
  }

  // 6) 문항 → 재료
  const items: MasteryItem[] = [];
  let unplaced = 0;
  const itemsBySubject = new Map<string, number>();
  for (const r of results) {
    if ((r.teacher_note ?? '').includes('자동채점 보류')) continue;
    const sess = sessionById.get(r.session_id);
    const owner = sess ? roster.ownerByRef.get(sess.student_id) : undefined;
    if (!owner || !r.problem_id) continue;
    const c = clsById.get(r.problem_id);
    const code = c?.type_code || r.mathsecr_code || null;
    if (!code || !code.startsWith('MS')) { unplaced += 1; continue; }
    const dRaw = c?.difficulty;
    const d = dRaw == null ? null : parseInt(String(dRaw), 10);
    items.push({
      s: owner,
      code,
      d: d != null && Number.isFinite(d) ? d : null,
      ok: r.is_correct === true,
      at: r.graded_at ?? sess?.completed_at ?? sess?.issued_at ?? '',
      pid: r.problem_id,
    });
    const subj = subjectOf(code);
    itemsBySubject.set(subj, (itemsBySubject.get(subj) ?? 0) + 1);
  }

  const subjectCodes = Array.from(itemsBySubject.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => code);
  if (subjectCodes.length === 0) {
    return NextResponse.json({ ...empty, items, unplaced });
  }

  // 7) 트리 이름 — 과목(depth1) + 대단원·중단원·소단원(depth 2~4)
  const { data: subjRows } = await sb
    .from('mathsecr_types')
    .select('code, subject_name')
    .in('code', subjectCodes);
  const subjName = new Map(
    ((subjRows ?? []) as Array<{ code: string; subject_name: string | null }>).map((r) => [r.code, r.subject_name ?? r.code])
  );
  const subjects = subjectCodes.map((code) => ({
    code, name: subjName.get(code) ?? code, items: itemsBySubject.get(code) ?? 0,
  }));

  const tree: MasteryTreeNode[] = [];
  for (const subj of subjectCodes) {
    for (let from = 0; ; from += PAGE) {
      const { data } = await sb
        .from('mathsecr_types')
        .select('code, depth, level1_name, level2_name, level3_name')
        .like('code', `${subj}-%`)
        .in('depth', [2, 3, 4])
        .order('code')
        .range(from, from + PAGE - 1);
      const rows = (data ?? []) as Array<{
        code: string; depth: number; level1_name: string | null; level2_name: string | null; level3_name: string | null;
      }>;
      for (const r of rows) {
        const name = r.depth === 2 ? r.level1_name : r.depth === 3 ? r.level2_name : r.level3_name;
        tree.push({ code: r.code, depth: r.depth as 2 | 3 | 4, name: name || r.code });
      }
      if (rows.length < PAGE) break;
    }
  }

  // 8) 문제은행 공급 — 이 학원이 낼 수 있는(격리·트랙 통과, 삭제 제외) 문제만
  const supplyMap = new Map<string, number>();
  for (const subj of subjectCodes) {
    for (let from = 0; ; from += PAGE) {
      let q = sb
        .from('problems')
        .select('id, classifications!inner(type_code, difficulty)')
        .like('classifications.type_code', `${subj}-%`)
        .is('deleted_at', null)
        .order('id')
        .range(from, from + PAGE - 1);
      q = applyInstituteFilter(q, scope, { allowCommonPool: true });
      q = applyTrackFilter(q, scope);
      const { data } = await q;
      const rows = (data ?? []) as Array<{
        id: string;
        classifications: Array<{ type_code: string | null; difficulty: string | number | null }>
          | { type_code: string | null; difficulty: string | number | null } | null;
      }>;
      for (const r of rows) {
        const c = Array.isArray(r.classifications) ? r.classifications[0] : r.classifications;
        if (!c?.type_code || c.difficulty == null) continue;
        const unit = unitOf(c.type_code);
        const d = parseInt(String(c.difficulty), 10);
        if (!unit || !Number.isFinite(d)) continue;
        const k = `${unit}|${d}`;
        supplyMap.set(k, (supplyMap.get(k) ?? 0) + 1);
      }
      if (rows.length < PAGE) break;
    }
  }
  const supply: MasterySupply[] = Array.from(supplyMap.entries()).map(([k, count]) => {
    const [unit, d] = k.split('|');
    return { unit, d: Number(d), count };
  });

  const payload: MasteryPayload = { class: classInfo, students, subjects, tree, supply, items, unplaced };
  return NextResponse.json(payload);
}
