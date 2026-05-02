// ============================================================================
// 학교별 시험지 분석 리포트 집계 API
// GET /api/reports/by-school
// 응답: 학교 카드 그리드용 집계 데이터
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { extractSchoolName, classifySchoolLevel } from '@/lib/utils/school-extract';
import { extractExamYear } from '@/lib/utils/year-extract';

export const dynamic = 'force-dynamic';

interface SchoolCard {
  school: string; // 학교명 (예: "신곡중")
  level: '초' | '중' | '고' | '대' | '미분류';
  examCount: number;
  analyzedCount: number; // ai_analysis 있는 시험지 수
  sharedCount: number; // share_token 있는 시험지 수
  totalProblems: number;
  grades: string[]; // 등장한 학년 set ("중3", "고1" 등)
  years: number[]; // 등장한 발행 년도 set (내림차순)
  latestExamAt: string | null; // 가장 최근 시험지 발행일
  earliestExamAt: string | null;
}

export async function GET(_request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  // 시험지 + 분석/공유 상태 일괄 조회
  // ★ exams.problem_count 컬럼이 prod DB 에 없음 → exam_problems(count) 조인으로 derive (useExams.ts 동일 패턴)
  const { data: exams, error } = await supabaseAdmin
    .from('exams')
    .select('id, title, grade, subject, created_at, ai_analysis, share_token, exam_problems(count)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Fetch failed', detail: error.message }, { status: 500 });
  }

  const bySchool = new Map<string, SchoolCard>();

  for (const exam of exams || []) {
    const school = extractSchoolName(exam.title);
    if (!school) continue;

    const level = classifySchoolLevel(school);
    const ai = exam.ai_analysis as Record<string, unknown> | null;
    const hasAnalysis = !!(ai && typeof ai === 'object' && 'generatedAt' in ai);
    const hasShare = !!exam.share_token;

    if (!bySchool.has(school)) {
      bySchool.set(school, {
        school,
        level,
        examCount: 0,
        analyzedCount: 0,
        sharedCount: 0,
        totalProblems: 0,
        grades: [],
        years: [],
        latestExamAt: null,
        earliestExamAt: null,
      });
    }

    const card = bySchool.get(school)!;
    card.examCount++;
    if (hasAnalysis) card.analyzedCount++;
    if (hasShare) card.sharedCount++;
    const epCount = (exam as { exam_problems?: Array<{ count: number }> }).exam_problems?.[0]?.count ?? 0;
    card.totalProblems += Number(epCount) || 0;
    if (exam.grade && !card.grades.includes(exam.grade)) {
      card.grades.push(exam.grade);
    }
    const yr = extractExamYear(exam.title, exam.created_at as string | null);
    if (yr != null && !card.years.includes(yr)) {
      card.years.push(yr);
    }
    if (exam.created_at) {
      const t = exam.created_at as string;
      if (!card.latestExamAt || t > card.latestExamAt) card.latestExamAt = t;
      if (!card.earliestExamAt || t < card.earliestExamAt) card.earliestExamAt = t;
    }
  }

  // 학년·년도 정렬 (학년 오름차순, 년도 내림차순)
  bySchool.forEach((card) => {
    card.grades.sort();
    card.years.sort((a, b) => b - a);
  });

  // 학교 정렬 — level (초→중→고→대) → 학교명
  const levelOrder: Record<string, number> = { 초: 1, 중: 2, 고: 3, 대: 4, 미분류: 9 };
  const schools = Array.from(bySchool.values()).sort((a, b) => {
    const lv = (levelOrder[a.level] || 9) - (levelOrder[b.level] || 9);
    if (lv !== 0) return lv;
    return a.school.localeCompare(b.school);
  });

  return NextResponse.json({
    schools,
    total: schools.length,
    totalExams: exams?.length || 0,
    unclassified: (exams?.length || 0) - schools.reduce((s, c) => s + c.examCount, 0),
  });
}
