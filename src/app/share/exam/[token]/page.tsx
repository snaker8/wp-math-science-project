// ============================================================================
// 학부모/블로그 공유용 시험지 분석 리포트 (공개)
// /share/exam/[token]
// 인증 없이 접근. 라이트 프리미엄 보고서 디자인.
// ============================================================================

import { notFound } from 'next/navigation';
import { ShareReportClient } from './ShareReportClient';

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

async function fetchData(token: string): Promise<PageData | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3099');
  try {
    const res = await fetch(`${baseUrl}/api/share/exam/${token}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as PageData;
  } catch {
    return null;
  }
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
