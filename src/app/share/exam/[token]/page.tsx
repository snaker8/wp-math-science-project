// ============================================================================
// 학부모/블로그 공유용 시험지 분석 리포트 (공개)
// /share/exam/[token]
// 인증 없이 접근. 라이트 프리미엄 보고서 디자인.
// ============================================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ShareReportClient } from './ShareReportClient';
import { supabaseAdmin, createSupabaseServerClient } from '@/lib/supabase/server';
import { resolveExamBrand } from '@/lib/report/resolve-exam-brand';
import type { ReportBrand } from '@/lib/report/report-brand';
import { parseExamTitleMeta } from '@/lib/workflow/exam-title-meta';
import { resolveExamGrade } from '@/lib/workflow/exam-grade';
import { toExamProblemData, type ExamProblemData } from '@/lib/exam/exam-problem-mapper';

const OG_BASE = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || 'wp-math-science-project.vercel.app'}`;
import type { ExamAIAnalysis } from '@/types/exam-ai-analysis';

export const dynamic = 'force-dynamic';

// ─── 학교명 추출 (이전 같은 로직 사용 — 단순 정규식) ──────────────────────
// 시험지 title 예: "2026 1학기 동백중 중3 중간고사" → "동백중"
function extractSchoolFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const m = title.match(/([가-힣A-Za-z0-9]+(?:초|중|고|대))/);
  return m ? m[1] : null;
}

// ─── OG 메타데이터 — 카톡/SNS 미리보기용 ─────────────────────────────────
// 썸네일은 같은 폴더의 opengraph-image.tsx 가 자동 등록 → summary_large_image 사용.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const fallback: Metadata = {
    title: '학교 기출 분석',
    description: '내신 시험지 단원·난이도·고난도 문항 분석 리포트',
    openGraph: {
      title: '학교 기출 분석',
      description: '내신 시험지 단원·난이도·고난도 문항 분석 리포트',
      type: 'article',
      siteName: '학교 기출 분석',
      locale: 'ko_KR',
      url: `${OG_BASE}/share/exam/${token}`,
    },
    twitter: { card: 'summary_large_image' },
  };
  // ★ OG 이미지는 명시 .png 경로 (og.png/route.ts) — 구형 메신저 크롤러가 확장자 없는 동적 URL 을 못 읽던 것 대응 (2026-10-07)
  const ogImageUrl = `${OG_BASE}/share/exam/${token}/og.png`;
  const ogImages = [{ url: ogImageUrl, secureUrl: ogImageUrl, width: 1200, height: 630, type: 'image/png', alt: '시험지 분석 리포트' }];
  fallback.openGraph = { ...fallback.openGraph, images: ogImages };
  fallback.twitter = { ...fallback.twitter, images: [ogImageUrl] };
  if (!supabaseAdmin || !token || token.length < 16) return fallback;
  try {
    const { data } = await supabaseAdmin
      .from('exams')
      .select('title, grade, curriculum_codes')
      .eq('share_token', token)
      .maybeSingle();
    if (!data) return fallback;
    const school = extractSchoolFromTitle(data.title) || '학교';
    // ★ 썸네일 학년도 공용 규칙 (2026-10-17 학장중 중2-2 가 '중3' 으로) — 저장된 grade 는 코드 첫 값의 대표 학년이라 어긋날 수 있다
    const grade = resolveExamGrade(data.curriculum_codes as string[] | null, data.title) || data.grade;
    const title = `${school} 기출 분석 리포트${grade ? ` · ${grade}` : ''}`;
    const description = `${data.title} — 단원 분포 · 난이도 · 고난도 문항 출제 의도 분석`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'article',
        siteName: '학교 기출 분석',
        locale: 'ko_KR',
        url: `${OG_BASE}/share/exam/${token}`,
        images: ogImages,
      },
      twitter: { card: 'summary_large_image', title, description, images: [ogImageUrl] },
    };
  } catch {
    return fallback;
  }
}

const DOMAIN_LABELS: Record<string, string> = {
  CALCULATION: '계산',
  UNDERSTANDING: '이해',
  INFERENCE: '추론',
  PROBLEM_SOLVING: '문제해결',
};

interface PageData {
  exam: {
    id: string;
    title: string;
    grade: string | null;
    subject: string | null;
    problemCount: number;
    totalPoints: number;
    createdAt: string;
  };
  stats: {
    total: number;
    totalPoints: number;
    avgDifficulty: number;
    diffDist: Record<number, number>;
    domDist: Record<string, number>;
  };
  analysis: {
    summary: string;
    overallDifficulty: string;
    unitAnalyses: Array<{
      majorUnit: string;
      questionNumbers: number[];
      keyPoints: string;
      strategy: string;
    }>;
    hardQuestions: Array<{
      problemId: string;
      number: number;
      intent: string;
      strategy: string;
    }>;
    generatedAt: string;
    modelVersion: string;
  } | null;
  brand: ReportBrand;
  /** ★ 학교명·시험 메타 (2026-10-12 대표: "본문에 학교명이 나오게") */
  intro: { school: string | null; metaLine: string | null };
  /** ★ 고난도 문항의 실제 문제 (problemId → 렌더용 데이터) — "문제 분석 때 문제를 실제 배치" */
  hardProblems: Record<string, ExamProblemData>;
}

// Server Component에서 직접 Supabase 조회 (self-fetch 우회 — Vercel 환경 안정성 ↑)
async function fetchData(token: string): Promise<PageData | null> {
  if (!supabaseAdmin) return null;
  if (!token || token.length < 16) return null;

  // 1. 토큰으로 시험지 조회
  const { data: examRows, error: examErr } = await supabaseAdmin
    .from('exams')
    .select('id, title, grade, subject, total_points, ai_analysis, created_at, share_token, institute_id, school_name, share_report_variant, curriculum_codes')
    .eq('share_token', token);

  if (examErr || !examRows || examRows.length === 0) return null;
  const exam = examRows[0];
  // ★ 학원별 리포트 브랜드 (2026-10-12) — 엄궁차수학은 네이비·골드 변형, 공통풀·과사람은 종전 그대로
  const brand = await resolveExamBrand((exam as { institute_id?: string | null }).institute_id, (exam as { share_report_variant?: string | null }).share_report_variant);

  const ai = exam.ai_analysis as Record<string, unknown> | null;
  const hasAnalysis = !!(ai && typeof ai === 'object' && 'generatedAt' in ai);

  // 2. exam_problems + classifications 일괄 조회
  const { data: examProblems } = await supabaseAdmin
    .from('exam_problems')
    .select('points, problem_id')
    .eq('exam_id', exam.id);
  const pointsById = new Map<string, number | null>((examProblems || []).map((p) => [p.problem_id as string, p.points as number | null]));

  const problemIds = (examProblems || []).map((p) => p.problem_id).filter(Boolean) as string[];

  const { data: classifications } = await supabaseAdmin
    .from('classifications')
    .select('problem_id, type_code, expanded_type_code, difficulty, cognitive_domain')
    .in('problem_id', problemIds);

  // 3. 통계 집계
  const total = examProblems?.length || 0;
  const totalPoints =
    // ★ 부동소수 합(4.3+4.3+…=100.00000000000001) 방지 — 소수 둘째 자리에서 반올림 (2026-10-07 부흥고 기하 OG 캡처)
    Math.round((examProblems?.reduce((sum, p) => sum + (Number(p.points) || 0), 0) || exam.total_points || 0) * 100) / 100;

  const diffDist: Record<number, number> = {};
  for (let i = 1; i <= 10; i++) diffDist[i] = 0;
  const domDist: Record<string, number> = {
    CALCULATION: 0,
    UNDERSTANDING: 0,
    INFERENCE: 0,
    PROBLEM_SOLVING: 0,
  };

  (classifications || []).forEach((c) => {
    const d = Math.min(10, Math.max(1, parseInt(String(c.difficulty), 10) || 0));
    if (d > 0) diffDist[d] = (diffDist[d] || 0) + 1;
    const dom = c.cognitive_domain || 'UNDERSTANDING';
    domDist[dom] = (domDist[dom] || 0) + 1;
  });

  const avgDifficulty =
    total > 0
      ? (classifications || []).reduce(
          (sum, c) => sum + (parseInt(String(c.difficulty), 10) || 0),
          0
        ) / total
      : 0;

  // ★ 학교명 — exams.school_name > 제목 파싱(exam-title-meta) > 단순 정규식
  const titleMeta = parseExamTitleMeta(exam.title || '');
  const school = (exam as { school_name?: string | null }).school_name || titleMeta?.schoolName || extractSchoolFromTitle(exam.title) || null;
  const metaLine = titleMeta
    ? `${titleMeta.examYear}학년도 ${titleMeta.gradeNum}학년 ${titleMeta.semester}학기 ${titleMeta.examRound}고사`
    : (resolveExamGrade(exam.curriculum_codes as string[] | null, exam.title) || (exam.grade ? String(exam.grade) : null));

  // ★ 고난도 문항의 실제 문제 — 화면(useExamProblems)과 같은 매핑으로 본문·보기·그림을 가져온다
  const hardProblems: Record<string, ExamProblemData> = {};
  if (hasAnalysis) {
    const hq = ((ai as Record<string, unknown>).hardQuestions as Array<{ problemId?: string; number?: number }> | undefined) || [];
    const hardIds = hq.map((q) => q.problemId).filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (hardIds.length > 0) {
      const { data: rows } = await supabaseAdmin
        .from('problems')
        .select('id, content_latex, content_html, answer_json, images, ai_analysis, source_name, source_year, classifications(type_code, difficulty, cognitive_domain)')
        .in('id', hardIds)
        .is('deleted_at', null);
      for (const row of (rows || []) as Array<{ id: string }>) {
        const num = hq.find((q) => q.problemId === row.id)?.number;
        try {
          const mapped = toExamProblemData({ problems: row, sequence_number: num, points: pointsById.get(row.id) ?? null }, 0);
          if (typeof num === 'number') mapped.number = num;
          hardProblems[row.id] = mapped;
        } catch { /* 한 문제 매핑 실패는 리포트를 막지 않는다 */ }
      }
    }
  }

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      grade: resolveExamGrade(exam.curriculum_codes as string[] | null, exam.title) || exam.grade,
      subject: exam.subject,
      problemCount: total,
      totalPoints,
      createdAt: exam.created_at as string,
    },
    stats: {
      total,
      totalPoints,
      avgDifficulty: Math.round(avgDifficulty * 10) / 10,
      diffDist,
      domDist,
    },
    analysis: hasAnalysis ? (ai as unknown as ExamAIAnalysis) : null,
    brand,
    intro: { school, metaLine },
    hardProblems,
  } as PageData;
}

export default async function SharedExamReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await fetchData(token);

  if (!data) {
    notFound();
  }

  // ★ 운영자 도구(블로그 작성·링크 복사·인쇄·섹션 복사·캡처 안내)는 로그인한 선생님에게만 (2026-10-13 대표:
  //   "링크 받은 학부모에게 맨 위 운영자 영역이 보이면 안 된다"). 공개 링크는 비로그인이라 자동으로 숨겨진다.
  let isOperator = false;
  try {
    const supa = await createSupabaseServerClient();
    if (supa) {
      const { data: u } = await supa.auth.getUser();
      isOperator = !!u?.user;
    }
  } catch { isOperator = false; }

  return <ShareReportClient data={data} domainLabels={DOMAIN_LABELS} brand={data.brand} isOperator={isOperator} />;
}
