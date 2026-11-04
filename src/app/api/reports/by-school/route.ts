// ============================================================================
// 학교별 시험지 분석 리포트 집계 API
// GET /api/reports/by-school
// 응답: 학교 카드 그리드용 집계 데이터
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter } from '@/lib/security/institute-guard';
import { resolveSchoolName, classifySchoolLevel } from '@/lib/utils/school-extract';
import { extractExamYear } from '@/lib/utils/year-extract';
import { extractExamType } from '@/lib/utils/exam-meta-extract';

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
  latestExamAt: string | null; // 가장 최근 자산화(업로드)일
  earliestExamAt: string | null;
}

type ExamRec = {
  id: string; title: string; grade: string | null; subject: string | null; created_at: string | null;
  school_name: string | null; exam_year: number | null; exam_type: string | null;
  ai_analysis: unknown; share_token: string | null; exam_problems: Array<{ count: number }> | null;
};

export async function GET(_request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  // 시험지 + 분석/공유 상태 일괄 조회 (★ institute 격리 — 공통풀(NULL)은 공유 라이브러리로 유지)
  // ★ exams.problem_count 컬럼이 prod DB 에 없음 → exam_problems(count) 조인으로 derive (useExams.ts 동일 패턴)
  // ★ Supabase 기본 1,000행 상한 → range 페이지네이션 (useExams 와 같은 패턴).
  //   2026-11-04: 살아있는 시험지 2,474장 중 최신 1,000장만 집계돼 해운대고가 27장 중 4장으로 보이던 사고.
  const PAGE = 500;
  const exams: ExamRec[] = [];
  for (let from = 0; ; from += PAGE) {
    const baseQ = supabaseAdmin
      .from('exams')
      .select('id, title, grade, subject, created_at, school_name, exam_year, exam_type, ai_analysis, share_token, exam_problems(count)')
      .is('deleted_at', null);
    const { data: page, error } = await applyInstituteFilter(baseQ, scope, { allowCommonPool: true })
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: 'Fetch failed', detail: error.message }, { status: 500 });
    }
    if (!page || page.length === 0) break;
    exams.push(...(page as unknown as ExamRec[]));
    if (page.length < PAGE) break;
  }

  const bySchool = new Map<string, SchoolCard>();
  let mockCount = 0;       // 평가원·교육청 모의고사 — 학교가 없는 게 정상
  let unclassified = 0;    // 학교명을 못 읽은 학교기출 등

  for (const exam of exams) {
    // ★ 2026-11-04: DB 컬럼(school_name) 우선 + 표기 통일 (부산중앙여고/중앙여고, 해운대여자중/해운대여중 가 카드 둘로 갈리던 것)
    const school = resolveSchoolName(exam);
    const isMock = exam.exam_type === '모의고사' || (!school && extractExamType(exam.title) === '모의고사');
    if (isMock) { mockCount++; continue; }
    if (!school) { unclassified++; continue; }

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
    const epCount = exam.exam_problems?.[0]?.count ?? 0;
    card.totalProblems += Number(epCount) || 0;
    if (exam.grade && !card.grades.includes(exam.grade)) {
      card.grades.push(exam.grade);
    }
    // 년도: DB 컬럼 → 제목 → 업로드일
    const yr = exam.exam_year ?? extractExamYear(exam.title, exam.created_at);
    if (yr != null && !card.years.includes(yr)) {
      card.years.push(yr);
    }
    if (exam.created_at) {
      const t = exam.created_at;
      if (!card.latestExamAt || t > card.latestExamAt) card.latestExamAt = t;
      if (!card.earliestExamAt || t < card.earliestExamAt) card.earliestExamAt = t;
    }
  }

  // 학년·년도 정렬 (학년 오름차순, 년도 내림차순)
  bySchool.forEach((card) => {
    card.grades.sort();
    card.years.sort((a, b) => b - a);
  });

  // 학교 정렬 — level (초→중→고→대) → 학교명 (화면에서 다른 기준으로 재정렬 가능)
  const levelOrder: Record<string, number> = { 초: 1, 중: 2, 고: 3, 대: 4, 미분류: 9 };
  const schools = Array.from(bySchool.values()).sort((a, b) => {
    const lv = (levelOrder[a.level] || 9) - (levelOrder[b.level] || 9);
    if (lv !== 0) return lv;
    return a.school.localeCompare(b.school, 'ko');
  });

  return NextResponse.json({
    schools,
    total: schools.length,
    totalExams: exams.length,
    schoolExams: exams.length - mockCount,
    mockCount,
    unclassified,
  });
}
