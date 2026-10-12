// 시험지 → institute → organization.slug → 리포트 브랜드 (서버 전용, supabaseAdmin)
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveReportVariant, type ReportBrand } from './report-brand';

/** exams.institute_id 로 학원 표기를, exams.share_report_variant 로 디자인을 정한다.
 *  공통풀(null)·조회 실패는 과사람 기본 표기(이름 노출 없음). variant 가 없으면 학원 기본 디자인. */
export async function resolveExamBrand(instituteId: string | null | undefined, variant?: string | null): Promise<ReportBrand> {
  let orgSlug: string | null = null;
  if (instituteId && supabaseAdmin) {
    try {
      const { data: inst } = await supabaseAdmin.from('institutes').select('organization_id').eq('id', instituteId).maybeSingle();
      const orgId = (inst as { organization_id?: string | null } | null)?.organization_id;
      if (orgId) {
        const { data: org } = await supabaseAdmin.from('organizations').select('slug').eq('id', orgId).maybeSingle();
        orgSlug = (org as { slug?: string } | null)?.slug ?? null;
      }
    } catch { /* 표기 없이 진행 */ }
  }
  return resolveReportVariant(variant, orgSlug);
}
