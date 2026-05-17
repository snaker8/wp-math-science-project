// ============================================================================
// GET /api/admin/objective-answer-broken
// 객관식인데 정답이 0 / 빈값 / null 로 박힌 문제 리스트.
// solution_latex 에서 "정답: ①~⑤" 패턴 추출해 suggestedAnswer 도 같이 반환.
//
// 사용처: /admin/answer-fix 페이지 — 261개 박힌 데이터 일괄 회복 도구.
// 메모리: feedback_objective_answer_safety.md
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/guard';
import { applyInstituteFilter } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CIRCLED = ['①', '②', '③', '④', '⑤'] as const;

/**
 * solution_latex 에서 정답 ① ~ ⑤ 추출 시도.
 * 우선순위:
 *  1) "정답[^①②③④⑤]{0,10}①~⑤" 패턴 (가장 신뢰)
 *  2) "답[\s:：=][^①②③④⑤]{0,10}①~⑤" (보조)
 * 추출 실패 시 null. 임의 ① ~ ⑤ 가져오기는 위험하므로 안 함.
 */
function extractSuggestedAnswer(solution: string | null): string | null {
  if (!solution) return null;
  const patterns = [
    /정답[^①②③④⑤]{0,15}([①②③④⑤])/,
    /답[\s:：=][^①②③④⑤]{0,15}([①②③④⑤])/,
  ];
  for (const re of patterns) {
    const m = solution.match(re);
    if (m && CIRCLED.includes(m[1] as any)) return m[1];
  }
  return null;
}

export async function GET(request: NextRequest) {
  // ★ super_admin only (2026-05-17) — 박힌 객관식 조회는 플랫폼 관리자 전용
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { scope } = guard.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  // 박힌 객관식 문제 조회 — type='multiple_choice' AND correct_answer in ('0', '', null)
  // exam 정보는 exam_problems 조인 (한 문제가 여러 시험에 속할 수 있어 첫 번째만)
  // ★ 1000행 제한 회피 — pagination 명시 (메모리: feedback_supabase_select_limit.md)
  // 격리: 자기 institute + 공통 풀 (institute_id IS NULL)
  const baseQuery = supabaseAdmin
    .from('problems')
    .select('id, content_latex, solution_latex, answer_json, source_number, source_name')
    .is('deleted_at', null)
    .eq('answer_json->>type', 'multiple_choice')
    .or('answer_json->>correct_answer.eq.0,answer_json->>correct_answer.eq.,answer_json->>correct_answer.is.null')
    .order('id')
    .range(offset, offset + limit - 1);
  const { data: problems, error } = await applyInstituteFilter(baseQuery, scope, { allowCommonPool: true });

  if (error) {
    console.error('[admin/objective-answer-broken]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 시험명 조회 — exam_problems 조인
  const problemIds = (problems || []).map(p => p.id);
  const { data: examLinks } = await supabaseAdmin
    .from('exam_problems')
    .select('problem_id, exam_id, sequence_number, exams(id, title)')
    .in('problem_id', problemIds);

  const examLinkMap = new Map<string, { examId: string; examTitle: string; sequenceNumber: number }>();
  (examLinks || []).forEach((link: any) => {
    if (!examLinkMap.has(link.problem_id)) {
      examLinkMap.set(link.problem_id, {
        examId: link.exam_id,
        examTitle: link.exams?.title || '(이름 없음)',
        sequenceNumber: link.sequence_number,
      });
    }
  });

  // 전체 카운트 (페이지네이션용) — 동일 격리 적용
  const countBase = supabaseAdmin
    .from('problems')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('answer_json->>type', 'multiple_choice')
    .or('answer_json->>correct_answer.eq.0,answer_json->>correct_answer.eq.,answer_json->>correct_answer.is.null');
  const { count: total } = await applyInstituteFilter(countBase, scope, { allowCommonPool: true });

  const items = (problems || []).map((p: any) => {
    const aj = p.answer_json || {};
    const exam = examLinkMap.get(p.id);
    const choices: string[] = Array.isArray(aj.choices) ? aj.choices : [];
    const suggested = extractSuggestedAnswer(p.solution_latex);
    return {
      problemId: p.id,
      examId: exam?.examId || null,
      examTitle: exam?.examTitle || '(시험 미연결)',
      sequenceNumber: exam?.sequenceNumber || p.source_number || 0,
      sourceNumber: p.source_number,
      sourceName: p.source_name,
      contentLatex: (p.content_latex || '').slice(0, 300),
      choices: choices.slice(0, 5),
      currentAnswer: aj.correct_answer === '' || aj.correct_answer === null ? null : String(aj.correct_answer),
      suggestedAnswer: suggested,
      hasSolution: typeof p.solution_latex === 'string' && p.solution_latex.length > 0,
    };
  });

  return NextResponse.json({
    total: total || 0,
    limit,
    offset,
    items,
  });
}
