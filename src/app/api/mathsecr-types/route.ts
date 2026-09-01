import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

/**
 * GET /api/mathsecr-types?subject=09&code=MS09-01-03
 * 수학비서 유형 트리 + 문제 수 반환
 *
 * Query params:
 *   subject - 과목 코드 (01~18), 없으면 전체
 *   code    - 특정 MS 코드의 하위 트리
 */
export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const subject = searchParams.get('subject');
  const code = searchParams.get('code');

  try {
    // 1. mathsecr_types 트리 조회 — ★ Supabase .select() 1000행 제한 회피 위해
    //   range 페이지네이션. 22,785행 / 대수만 해도 수백 ~ 수천 행 → 일부 단원
    //   (수열·삼각함수 활용 등) 누락되던 사고. CLAUDE.md 가드 #6 참고.
    type MathsecrTypeRow = {
      code: string;
      full_path: string;
      depth: number;
      subject_code: string;
      subject_name: string;
    };
    const PAGE = 1000;
    const types: MathsecrTypeRow[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = supabaseAdmin
        .from('mathsecr_types')
        .select('code, full_path, depth, subject_code, subject_name')
        .order('code')
        .range(from, from + PAGE - 1);
      if (subject) q = q.eq('subject_code', subject);
      if (code) q = q.like('code', `${code}%`);

      const { data: page, error: typesErr } = await q;
      if (typesErr) throw typesErr;
      if (!page || page.length === 0) break;
      types.push(...(page as MathsecrTypeRow[]));
      if (page.length < PAGE) break;
    }

    // 2. 문제 수 집계: classifications.type_code가 MS로 시작하는 것만
    const { data: counts, error: countsErr } = await supabaseAdmin
      .rpc('count_problems_by_ms_prefix', { prefix_filter: subject ? `MS${subject}` : 'MS' });

    // RPC가 없으면 직접 쿼리 (fallback) — 같은 1000행 사고 회피 위해 페이지네이션
    let problemCounts: Record<string, number> = {};
    if (countsErr || !counts) {
      // ★ 2026-09-01 — 삭제된 문제까지 세어 트리 개수가 실제 검색 결과보다 많았다.
      //   classifications 는 문제를 소프트 삭제해도 남으므로, problems 를 조인해
      //   살아있는 것만 센다. (problems!inner + deleted_at is null)
      const clsAll: Array<{ type_code: string }> = [];
      for (let from = 0; ; from += PAGE) {
        const { data: page } = await supabaseAdmin
          .from('classifications')
          .select('type_code, problems!inner(deleted_at)')
          .like('type_code', subject ? `MS${subject}%` : 'MS%')
          .is('problems.deleted_at', null)
          .range(from, from + PAGE - 1);
        if (!page || page.length === 0) break;
        clsAll.push(...(page as Array<{ type_code: string }>));
        if (page.length < PAGE) break;
      }

      for (const row of clsAll) {
        const tc = row.type_code;
        if (!tc) continue;
        problemCounts[tc] = (problemCounts[tc] || 0) + 1;
        // 상위 코드에도 합산 (MS09-01-03-02 → MS09-01-03, MS09-01, MS09)
        const parts = tc.split('-');
        for (let i = parts.length - 1; i >= 1; i--) {
          const parent = parts.slice(0, i).join('-');
          problemCounts[parent] = (problemCounts[parent] || 0) + 1;
        }
      }
    } else {
      for (const row of counts as Array<{ type_code: string; cnt: number }>) {
        problemCounts[row.type_code] = row.cnt;
      }
    }

    // 3. 트리 구조 빌드
    const tree = buildMathsecrTree(types || [], problemCounts);

    return NextResponse.json({
      tree,
      totalTypes: (types || []).filter(t => t.depth === 4).length,
      totalWithProblems: Object.keys(problemCounts).length,
    });
  } catch (err) {
    console.error('[mathsecr-types] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

interface MathsecrNode {
  code: string;
  name: string;
  fullPath: string;
  depth: number;
  problemCount: number;
  children: MathsecrNode[];
}

function buildMathsecrTree(
  types: Array<{ code: string; full_path: string; depth: number; subject_code: string; subject_name: string }>,
  counts: Record<string, number>
): MathsecrNode[] {
  const nodeMap = new Map<string, MathsecrNode>();

  // 노드 생성
  for (const t of types) {
    const pathParts = t.full_path.split(' > ');
    const name = pathParts[pathParts.length - 1] || t.full_path;
    nodeMap.set(t.code, {
      code: t.code,
      name,
      fullPath: t.full_path,
      depth: t.depth,
      problemCount: counts[t.code] || 0,
      children: [],
    });
  }

  // 부모-자식 연결
  const roots: MathsecrNode[] = [];
  for (const [code, node] of nodeMap) {
    const parts = code.split('-');
    if (parts.length <= 1) {
      // depth 1 (MS09 등) → root
      roots.push(node);
    } else {
      const parentCode = parts.slice(0, -1).join('-');
      const parent = nodeMap.get(parentCode);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  return roots;
}
