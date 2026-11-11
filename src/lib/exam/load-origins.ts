// ============================================================================
// 문항별 출처 조회 (서버 전용) — GET /api/exams/[examId] · export-hwp 공용
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import { buildOrigin, type OriginInfo } from '@/lib/exam/origin-label';

/**
 * 문항별 출처(원래 시험지 제목 + 원래 번호). 출제 시험지는 exam_type 이 비어 있어 후보에서 빠지고,
 * 학교기출 시험지를 직접 열면 자기 자신이 출처다. .in() 은 1,000행 잘림이 있어 300개씩 나눈다.
 * 실패해도 빈 Map — 시험지는 그대로 열린다.
 */
export async function loadOrigins(
  sb: SupabaseClient,
  problemIds: string[],
  examId: string,
  scope: Parameters<typeof assertInstituteAccess>[0],
): Promise<Map<string, OriginInfo>> {
  const out = new Map<string, OriginInfo>();
  if (problemIds.length === 0) return out;
  try {
    const links: Array<{ problem_id: string; exam_id: string }> = [];
    const numbers = new Map<string, number | null>();
    for (let i = 0; i < problemIds.length; i += 300) {
      const chunk = problemIds.slice(i, i + 300);
      const [{ data: ep }, { data: pn }] = await Promise.all([
        sb.from('exam_problems').select('problem_id, exam_id').in('problem_id', chunk).limit(5000),
        sb.from('problems').select('id, source_number').in('id', chunk),
      ]);
      links.push(...((ep as typeof links) || []));
      ((pn as Array<{ id: string; source_number: number | null }>) || []).forEach((r) => numbers.set(r.id, r.source_number));
    }
    const examIds = Array.from(new Set(links.map((l) => l.exam_id)));
    const exams = new Map<string, { title: string | null; exam_type: string | null }>();
    for (let i = 0; i < examIds.length; i += 300) {
      const { data } = await sb
        .from('exams')
        .select('id, title, exam_type, institute_id')
        .in('id', examIds.slice(i, i + 300))
        .is('deleted_at', null);
      ((data as Array<{ id: string; title: string | null; exam_type: string | null; institute_id: string | null }>) || []).forEach((e) => {
        // 다른 학원 시험지 제목이 출처로 새지 않게 — 공통 풀(NULL)이거나 볼 수 있는 학원 것만
        if (e.institute_id !== null) {
          try { assertInstituteAccess(scope, e.institute_id); } catch { return; }
        }
        exams.set(e.id, e);
      });
    }
    // 다른 시험지(원본) 우선, 없으면 지금 시험지 자신
    const sorted = [...links].sort((a, b) => Number(a.exam_id === examId) - Number(b.exam_id === examId));
    for (const l of sorted) {
      if (out.has(l.problem_id)) continue;
      const o = buildOrigin(exams.get(l.exam_id), numbers.get(l.problem_id));
      if (o) out.set(l.problem_id, o);
    }
  } catch (e) {
    console.error('[loadOrigins] origin lookup error:', e instanceof Error ? e.message : e);
  }
  return out;
}
