// ============================================================================
// POST /api/admin/restore-all-points
//   모든 exam_problems의 points를 각 문제 content_latex의 [N점]에서 재추출
//   하드코딩된 points: 4가 적용된 과거 자산화분을 원 배점으로 복원.
// ============================================================================

import { NextResponse } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { applyInstituteFilter } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;

  const { user, scope } = authed.data;
  const isAdmin = user.role === 'ADMIN' || user.role === 'TEACHER' || user.role === 'TUTOR' || user.role === 'ORG_ADMIN';
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin not configured' }, { status: 500 });
  }

  // 배점 추출 우선순위:
  //   1) [N점] · [총N점] 브래킷 (가장 확실)
  //   2) (N점) 괄호
  //   3) content 꼬리 쪽의 독립 'N점' (마지막 200자 내, '구하시오·적으시오·쓰시오' 등 closing 키워드 근처)
  //   4) content 마지막 공백/줄바꿈 뒤의 'N점'
  const extractPoints = (raw: string): number | null => {
    const text = raw || '';
    // 1. 브래킷
    const m1 = text.match(/\[\s*(?:총\s*)?(\d+(?:\.\d+)?)\s*[점졈졍]\s*\]/);
    if (m1) return parseFloat(m1[1]);
    // 2. 괄호
    const m2 = text.match(/\(\s*(\d+(?:\.\d+)?)\s*[점졈]\s*\)/);
    if (m2) return parseFloat(m2[1]);
    // 3. 꼬리(뒤 200자) 범위 안의 숫자+점 (closing 키워드 뒤에만)
    const tail = text.slice(-200);
    const m3 = tail.match(/(?:구하시오|구하여라|적으시오|쓰시오|답하시오|서술하시오|완성하시오|풀이\s*과정)[^.]*?\.?\s*[^가-힣0-9]?\s*(\d+(?:\.\d+)?)\s*[점졈]/);
    if (m3) return parseFloat(m3[1]);
    // 4. content 끝 단독 'N점'
    const m4 = text.match(/(\d+(?:\.\d+)?)\s*[점졈]\s*$/);
    if (m4) return parseFloat(m4[1]);
    return null;
  };

  // 1. 모든 문제 content_latex 로드 (페이징 처리: 1000 단위)
  const pointsByProblem = new Map<string, number>();
  let page = 0;
  const PAGE = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const from = page * PAGE;
    // 격리: 자기 institute + 공통 풀 (institute_id IS NULL)
    const baseQuery = supabaseAdmin
      .from('problems')
      .select('id, content_latex')
      .is('deleted_at', null)
      .range(from, from + PAGE - 1);
    const { data: problems, error } = await applyInstituteFilter(baseQuery, scope, { allowCommonPool: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!problems || problems.length === 0) break;
    for (const p of problems) {
      const raw = (p as any).content_latex || '';
      const pts = extractPoints(raw);
      if (pts !== null && pts > 0) {
        pointsByProblem.set((p as any).id, Math.min(100, Math.max(0, pts)));
      }
    }
    if (problems.length < PAGE) break;
    page++;
  }

  // 2. exam_problems 일괄 업데이트 (매칭된 것만)
  let updated = 0;
  let scanned = 0;
  for (const [problemId, pts] of pointsByProblem) {
    const { error, count } = await supabaseAdmin
      .from('exam_problems')
      .update({ points: pts }, { count: 'exact' })
      .eq('problem_id', problemId);
    if (!error && count) {
      updated += count;
      scanned++;
    }
  }

  return NextResponse.json({
    success: true,
    problemsWithPoints: pointsByProblem.size,
    examProblemRowsUpdated: updated,
    uniqueProblemsScanned: scanned,
  });
}
