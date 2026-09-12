// ============================================================================
// GET /api/exams/source-summary — 출제 소스별 「지금 뭐가 얼마나 있나」
// ----------------------------------------------------------------------------
// docs/PLAN_EXAM_LINE_DESIGN.md S2 ❶ 소스 선택. 카드마다 실제 숫자를 띄운다.
// ★ 확실한 것만 센다. 애매한 집계를 그럴듯한 숫자로 보여주면 판단을 망친다.
// 격리 필터를 통과한 것만 — 다른 학원 자료가 숫자에 섞이면 안 된다.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

export interface SourceSummary {
  /** 학교기출 시험지 수 · 학교 수 */
  schoolExams: number;
  schools: number;
  /** 문제은행 — 전체 / 수학비서 유형이 붙은 것 */
  problems: number;
  classified: number;
  /** 시중교재 묶음 */
  bookGroups: number;
  /** 반 (취약 보충의 대상) */
  classes: number;
}

export async function GET(_req: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;
  const { scope } = authed.data;

  // 학교기출 — 제목 파서가 채운 school_name 기준 (진단 제외)
  let schoolQ = sb.from('exams').select('school_name').is('deleted_at', null).not('school_name', 'is', null);
  schoolQ = applyInstituteFilter(schoolQ, scope, { allowCommonPool: true });
  const { data: schoolRows } = await schoolQ;
  const schoolList = (schoolRows ?? []) as Array<{ school_name: string | null }>;
  const schools = new Set(schoolList.map((r) => r.school_name).filter(Boolean)).size;

  // 문제은행 — 전체 / 분류된 것
  let probQ = sb.from('problems').select('id', { count: 'exact', head: true }).is('deleted_at', null);
  probQ = applyInstituteFilter(probQ, scope, { allowCommonPool: true });
  const { count: problems } = await probQ;

  let clsQ = sb
    .from('problems')
    .select('id, classifications!inner(type_code)', { count: 'exact', head: true })
    .is('deleted_at', null)
    .like('classifications.type_code', 'MS%');
  clsQ = applyInstituteFilter(clsQ, scope, { allowCommonPool: true });
  const { count: classified } = await clsQ;

  let bookQ = sb.from('book_groups').select('id', { count: 'exact', head: true }).is('deleted_at', null);
  bookQ = applyInstituteFilter(bookQ, scope, { allowCommonPool: true });
  const { count: bookGroups } = await bookQ;

  let classQ = sb.from('classes').select('id', { count: 'exact', head: true }).is('deleted_at', null);
  classQ = applyInstituteFilter(classQ, scope);
  const { count: classes } = await classQ;

  const payload: SourceSummary = {
    schoolExams: schoolList.length,
    schools,
    problems: problems ?? 0,
    classified: classified ?? 0,
    bookGroups: bookGroups ?? 0,
    classes: classes ?? 0,
  };
  return NextResponse.json(payload);
}
