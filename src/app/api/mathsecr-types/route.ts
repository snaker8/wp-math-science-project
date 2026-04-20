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
    // 1. mathsecr_types 트리 조회
    let query = supabaseAdmin
      .from('mathsecr_types')
      .select('code, full_path, depth, subject_code, subject_name')
      .order('code');

    if (subject) {
      query = query.eq('subject_code', subject);
    }
    if (code) {
      query = query.like('code', `${code}%`);
    }

    const { data: types, error: typesErr } = await query;
    if (typesErr) throw typesErr;

    // 2. 문제 수 집계: classifications.type_code가 MS로 시작하는 것만
    const { data: counts, error: countsErr } = await supabaseAdmin
      .rpc('count_problems_by_ms_prefix', { prefix_filter: subject ? `MS${subject}` : 'MS' });

    // RPC가 없으면 직접 쿼리 (fallback)
    let problemCounts: Record<string, number> = {};
    if (countsErr || !counts) {
      // 직접 집계
      const { data: clsData } = await supabaseAdmin
        .from('classifications')
        .select('type_code')
        .like('type_code', subject ? `MS${subject}%` : 'MS%');

      if (clsData) {
        for (const row of clsData) {
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
