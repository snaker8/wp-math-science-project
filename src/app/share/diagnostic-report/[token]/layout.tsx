// ============================================================================
// 진단평가 종합 리포트 학부모 공유 — Open Graph 메타데이터 (server component)
//
// 카톡·문자·소셜 공유 시 썸네일/제목/설명이 학생·세트·점수로 표시되도록.
// page.tsx 는 'use client' 라 metadata 직접 export 못함 → layout 에서 처리.
// (썸네일 이미지는 같은 폴더 opengraph-image.tsx 가 Next 가 자동 연결)
// ============================================================================

import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabase/server';
import { computeComprehensiveReport } from '@/lib/diagnostics/compute-report';

/** "중3-1 F 진단평가(이차방정식~이차함수)" → "이차방정식~이차함수" */
function rangeOf(setTitle: string): string {
  const m = (setTitle || '').match(/\(([^)]+)\)/);
  if (m) return m[1].trim();
  return (setTitle || '').replace(/진단평가.*$/, '').trim() || setTitle || '';
}

// ★ og:image 절대 URL 을 "프로덕션 도메인" 으로 고정.
//   미설정 시 Next 가 배포별 보호 URL(VERCEL_URL=*-xxxx.vercel.app, 401)을 써서
//   카톡 등 크롤러가 썸네일을 못 가져옴. VERCEL_PROJECT_PRODUCTION_URL = 공개 프로덕션 도메인.
const PROD_HOST = process.env.VERCEL_PROJECT_PRODUCTION_URL || 'wp-math-science-project.vercel.app';
const METADATA_BASE = new URL(`https://${PROD_HOST}`);

export async function generateMetadata(
  { params }: { params: { token: string } },
): Promise<Metadata> {
  const fallback: Metadata = {
    metadataBase: METADATA_BASE,
    title: '진단평가 종합 리포트',
    description: 'A·B·C 진단 결과를 합산한 시험대비 처방 리포트 — 과사람 수학',
    robots: { index: false, follow: false },
  };

  const token = params?.token;
  if (!token || !supabaseAdmin) return fallback;

  try {
    const { data: tokenRow } = await supabaseAdmin
      .from('parent_share_tokens')
      .select('student_id, set_key, exam_ids, report_kind, is_active')
      .eq('token', token)
      .maybeSingle();
    const t = tokenRow as { student_id: string; set_key: string | null; exam_ids: string | null; report_kind: string; is_active: boolean } | null;
    // ★ 자유 조합(exam_ids) 토큰도 메타데이터 — examIds 로 계산(set_key 는 합성값).
    const examIds = t?.exam_ids ? t.exam_ids.split(',').map((s) => s.trim()).filter(Boolean) : [];
    if (!t || !t.is_active || t.report_kind !== 'diagnostic_set' || (!t.set_key && examIds.length === 0)) return fallback;

    const result = await computeComprehensiveReport(
      supabaseAdmin, t.student_id, t.set_key || 'none::자유 조합',
      examIds.length > 0 ? examIds : undefined,
    );
    if (!result.ok) return fallback;
    const { student, set, overall } = result.payload;

    const range = rangeOf(set.setTitle);
    const title = `${student.name} · 진단평가 종합 리포트`;
    const pctStr = overall.pct != null ? `합산 정답률 ${overall.pct}%` : '채점 진행 중';
    const description = `${range} · ${pctStr} · A·B·C ${set.gradedVariantCount}/${set.variantCount} 채점 — 과사람 수학`;

    return {
      metadataBase: METADATA_BASE,
      title,
      description,
      openGraph: { title, description, type: 'website', locale: 'ko_KR' },
      twitter: { card: 'summary_large_image', title, description },
      robots: { index: false, follow: false }, // 공유 링크 검색 노출 X
    };
  } catch {
    return fallback;
  }
}

export default function ShareDiagnosticReportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
