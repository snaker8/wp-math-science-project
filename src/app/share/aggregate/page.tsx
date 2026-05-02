// ============================================================================
// /share/aggregate — 서버 컴포넌트 진입 + OG 메타 (카톡/SNS 미리보기)
// 본문은 ShareAggregateClient.tsx (use client) 가 렌더링.
// ============================================================================

import type { Metadata } from 'next';
import ShareAggregateClient from './ShareAggregateClient';

interface SP {
  year?: string;
  grade?: string;
  semester?: string;
  examType?: string;
  schools?: string;
}

function buildTitleParts(sp: SP): { title: string; description: string } {
  const schools = (sp.schools || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const filters: string[] = [];
  if (sp.year) filters.push(`${sp.year}년`);
  if (sp.grade) filters.push(sp.grade);
  if (sp.semester) filters.push(`${sp.semester}학기`);
  if (sp.examType) filters.push(sp.examType);

  const filterPart = filters.length > 0 ? ` · ${filters.join(' ')}` : '';
  const schoolPart =
    schools.length === 0
      ? '여러 학교'
      : schools.length <= 3
        ? schools.join('·')
        : `${schools.slice(0, 3).join('·')} 외 ${schools.length - 3}곳`;

  const title = `학교 기출 분석 — ${schoolPart}${filterPart}`;
  const description =
    schools.length > 0
      ? `${schoolPart} ${filterPart.replace(/^ · /, '')} 시험지를 묶어 본 단원 빈도 · 난이도 · 함정 패턴 분석 리포트`
      : '여러 학교 시험지를 묶어 본 단원 빈도 · 난이도 · 함정 패턴 분석 리포트';
  return { title, description };
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SP;
}): Promise<Metadata> {
  const { title, description } = buildTitleParts(searchParams);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      siteName: '과사람 학교 기출 분석',
    },
    twitter: { card: 'summary', title, description },
  };
}

export default function Page() {
  return <ShareAggregateClient />;
}
