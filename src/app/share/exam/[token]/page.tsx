// ============================================================================
// 학부모/블로그 공유용 시험지 분석 리포트 (공개)
// /share/exam/[token]
// 인증 없이 접근. 라이트 프리미엄 보고서 디자인.
// ============================================================================

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ShareReportClient } from './ShareReportClient';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { ExamAIAnalysis } from '@/types/exam-ai-analysis';

export const dynamic = 'force-dynamic';

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
}

// Server Component에서 직접 Supabase 조회 (self-fetch 우회 — Vercel 환경 안정성 ↑)
async function fetchData(token: string): Promise<PageData | null> {
  if (!supabaseAdmin) return null;
  if (!token || token.length < 16) return null;

  // 1. 토큰으로 시험지 조회
  const { data: examRows, error: examErr } = await supabaseAdmin
    .from('exams')
    .select('id, title, grade, subject, total_points, ai_analysis, created_at, share_token')
    .eq('share_token', token);

  if (examErr || !examRows || examRows.length === 0) return null;
  const exam = examRows[0];

  const ai = exam.ai_analysis as Record<string, unknown> | null;
  const hasAnalysis = !!(ai && typeof ai === 'object' && 'generatedAt' in ai);

  // 2. exam_problems + classifications 일괄 조회
  const { data: examProblems } = await supabaseAdmin
    .from('exam_problems')
    .select('points, problem_id')
    .eq('exam_id', exam.id);

  const problemIds = (examProblems || []).map((p) => p.problem_id).filter(Boolean) as string[];

  const { data: classifications } = await supabaseAdmin
    .from('classifications')
    .select('problem_id, type_code, expanded_type_code, difficulty, cognitive_domain')
    .in('problem_id', problemIds);

  // 3. 통계 집계
  const total = examProblems?.length || 0;
  const totalPoints =
    examProblems?.reduce((sum, p) => sum + (Number(p.points) || 0), 0) || exam.total_points || 0;

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

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      grade: exam.grade,
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
  } as PageData;
}

// ============================================================================
// generateMetadata — 카톡/슬랙/페북 등 외부에 공유 시 미리보기에 학교명·시험명 노출.
// title/description 은 OG·Twitter 카드에 모두 적용. 썸네일은 opengraph-image.tsx.
// ============================================================================
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await fetchData(token);
  if (!data) {
    return { title: '시험지 분석 리포트 — 과사람' };
  }
  const title = `${data.exam.title} 분석 리포트 — 과사람`;
  const desc = `총 ${data.exam.problemCount}문항 · 평균 난이도 ${data.stats.avgDifficulty}/10`;
  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      type: 'article',
      // 썸네일은 opengraph-image.tsx 가 자동 등록
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: desc,
    },
  };
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

  return <ShareReportClient data={data} domainLabels={DOMAIN_LABELS} />;
}
