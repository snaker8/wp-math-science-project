// ============================================================================
// /share/aggregate — 서버 컴포넌트 진입 + OG 메타 (카톡/SNS 미리보기)
// 본문은 ShareAggregateClient.tsx (use client) 가 렌더링.
//
// ★ 2026-11-07: 학교 상세에서 시험지를 골라 만든 링크(examIds)는 제목이 「여러 학교」로 나왔다.
//   시험지 ID 로 학교·학년·학기·구분·연도 범위를 읽어 "해운대고 고1 1학기 중간 2023~2026" 로 만든다.
// ============================================================================

import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveReportVariant } from '@/lib/report/report-brand';
import ShareAggregateClient from './ShareAggregateClient';

interface SP {
  year?: string;
  grade?: string;
  semester?: string;
  examType?: string;
  schools?: string;
  examIds?: string;
  brand?: string;
  org?: string;
}

function joinSchools(schools: string[]): string {
  if (schools.length === 0) return '여러 학교';
  if (schools.length <= 3) return schools.join('·');
  return `${schools.slice(0, 3).join('·')} 외 ${schools.length - 3}곳`;
}

/** examIds 로 공통풀 시험지의 학교·학년·학기·구분·연도를 읽어 제목 조각을 만든다. 실패하면 null. */
async function partsFromExamIds(examIds: string): Promise<{ schoolPart: string; filterPart: string } | null> {
  if (!supabaseAdmin) return null;
  const ids = Array.from(new Set(examIds.split(',').map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s)))).slice(0, 200);
  if (ids.length === 0) return null;
  try {
    const { data } = await supabaseAdmin
      .from('exams')
      .select('school_name, grade, semester, exam_round, exam_year')
      .in('id', ids)
      .is('deleted_at', null)
      .is('institute_id', null);
    const rows = (data || []) as Array<{ school_name: string | null; grade: string | null; semester: number | null; exam_round: string | null; exam_year: number | null }>;
    if (rows.length === 0) return null;
    const uniq = (arr: Array<string | number | null | undefined>) => Array.from(new Set(arr.filter((v): v is string | number => v != null && v !== '')));
    const schools = uniq(rows.map((r) => r.school_name)) as string[];
    const grades = uniq(rows.map((r) => r.grade)) as string[];
    const semesters = uniq(rows.map((r) => r.semester)) as number[];
    const rounds = uniq(rows.map((r) => r.exam_round)) as string[];
    const years = (uniq(rows.map((r) => r.exam_year)) as number[]).sort((a, b) => a - b);
    const filters: string[] = [];
    if (grades.length === 1) filters.push(grades[0]);
    if (semesters.length === 1) filters.push(`${semesters[0]}학기`);
    if (rounds.length === 1) filters.push(rounds[0]);
    if (years.length === 1) filters.push(`${years[0]}년`);
    else if (years.length > 1) filters.push(`${years[0]}~${years[years.length - 1]}`);
    return { schoolPart: joinSchools(schools), filterPart: filters.length ? ` · ${filters.join(' ')}` : '' };
  } catch {
    return null;
  }
}

async function buildTitleParts(sp: SP): Promise<{ title: string; description: string }> {
  const brand = resolveReportVariant(sp.brand, sp.org);
  let schoolPart: string;
  let filterPart: string;

  const fromIds = sp.examIds ? await partsFromExamIds(sp.examIds) : null;
  if (fromIds) {
    ({ schoolPart, filterPart } = fromIds);
  } else {
    const schools = (sp.schools || '').split(',').map((s) => s.trim()).filter(Boolean);
    const filters: string[] = [];
    if (sp.year) filters.push(`${sp.year}년`);
    if (sp.grade) filters.push(sp.grade);
    if (sp.semester) filters.push(`${sp.semester}학기`);
    if (sp.examType) filters.push(sp.examType);
    schoolPart = joinSchools(schools);
    filterPart = filters.length > 0 ? ` · ${filters.join(' ')}` : '';
  }

  const title = `${schoolPart}${filterPart} 기출 분석`;
  const description =
    schoolPart === '여러 학교'
      ? '여러 학교 시험지를 묶어 본 단원 빈도 · 난이도 · 출제 흐름 분석 리포트'
      : `${schoolPart}${filterPart.replace(/^ · /, ' ')} 시험지를 묶어 본 단원 빈도 · 난이도 · 출제 흐름 분석 리포트`;
  return { title, description: brand.showChip ? `${brand.name} · ${description}` : description };
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SP;
}): Promise<Metadata> {
  const { title, description } = await buildTitleParts(searchParams);
  const brand = resolveReportVariant(searchParams.brand, searchParams.org);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      siteName: brand.showChip ? `${brand.name} — 학교 기출 분석` : 'Math×Sci Bank — 학교 기출 분석',
    },
    twitter: { card: 'summary', title, description },
  };
}

export default function Page() {
  return <ShareAggregateClient />;
}
