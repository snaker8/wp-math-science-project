// 시험지 → institute → organization.slug → 리포트 브랜드 (서버 전용, supabaseAdmin)
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveReportBrand, type ReportBrand } from './report-brand';

/** exams.institute_id 로 학원 브랜드를 찾는다. 공통풀(null)·조회 실패는 과사람 기본. */
export async function resolveExamBrand(instituteId: string | null | undefined): Promise<ReportBrand> {
  if (!instituteId || !supabaseAdmin) return resolveReportBrand(null);
  try {
    const { data: inst } = await supabaseAdmin
      .from('institutes')
      .select('organization_id')
      .eq('id', instituteId)
      .maybeSingle();
    const orgId = (inst as { organization_id?: string | null } | null)?.organization_id;
    if (!orgId) return resolveReportBrand(null);
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('slug')
      .eq('id', orgId)
      .maybeSingle();
    return resolveReportBrand((org as { slug?: string } | null)?.slug ?? null);
  } catch {
    return resolveReportBrand(null);
  }
}
