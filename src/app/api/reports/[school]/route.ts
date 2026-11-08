// ============================================================================
// 학교 상세 — 시험지 리스트 + 누적 통계
// GET /api/reports/[school]
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter } from '@/lib/security/institute-guard';
import { resolveSchoolName } from '@/lib/utils/school-extract';
import { normalizeSchoolName, schoolNameVariants } from '@/lib/utils/school-normalize';
import { extractExamYear } from '@/lib/utils/year-extract';
import { extractSemester, extractExamType } from '@/lib/utils/exam-meta-extract';
import type { ExamAIAnalysis } from '@/types/exam-ai-analysis';
import { DIFFICULTY_BANDS, difficultyToBand } from '@/lib/utils/difficulty-label';

export const dynamic = 'force-dynamic';

interface ExamRow {
  id: string;
  title: string;
  grade: string | null;
  subject: string | null;
  problemCount: number;
  totalPoints: number;
  createdAt: string | null;
  year: number | null;
  semester: 1 | 2 | null;
  examType: string | null;
  hasAnalysis: boolean;
  hasShare: boolean;
  shareToken: string | null;
  overallDifficulty: string | null;
  unitCount: number; // 분석 결과상 단원 개수
  /** ai_analysis 풀 페이로드. 분석 미생성 시 null. 검색·인라인 펼침에서 그대로 사용 */
  analysis: ExamAIAnalysis | null;
  /** 문항 분류(classifications) 기준 — 2026-11-09 */
  classifiedCount: number;
  avgDifficulty: number | null;
  /** 난이도 밴드 — 분류 평균 기준, 분류가 없으면 AI 총평 */
  difficultyLabel: string | null;
  /** 체감 난이도 한 줄 — 평균 밴드 + 몸통(최빈 구간) + 변별층(7+ 개수·최고) */
  feel: string | null;
  unitCounts: Array<{ unit: string; problemCount: number }>;
}

/**
 * 체감 난이도 — 평균이 같아도 어려운 문항이 몇 개 섞였는지에 따라 학생이 느끼는 시험은 다르다(대표, 2026-11-08).
 *   평균 4.0 이라도 7짜리 2문항이면 「평균 보통(4.0) · 몸통 보통 11/23 · 변별 7+ 2문항, 최고 7 — 소수 변별 문항이 등급을 가름」.
 *   분류가 60% 미만이면 「참고만」.
 */
function describeFeel(diffs: number[], total: number): { avg: number; band: string; label: string } | null {
  const n = diffs.length;
  if (!n) return null;
  const avg = diffs.reduce((a, b) => a + b, 0) / n;
  const band = difficultyToBand(Math.round(avg))?.label ?? '-';
  const dist = DIFFICULTY_BANDS.map((b) => diffs.filter((d) => d >= b.min && d <= b.max).length);
  const modeIdx = dist.indexOf(Math.max(...dist));
  const sorted = [...diffs].sort((a, b) => b - a);
  const top5 = sorted.slice(0, Math.min(5, n)).reduce((a, b) => a + b, 0) / Math.min(5, n);
  const hardN = diffs.filter((d) => d >= 7).length;
  const killerN = diffs.filter((d) => d >= 9).length;
  const sd = Math.sqrt(diffs.reduce((a, d) => a + (d - avg) ** 2, 0) / n);
  let tone: string;
  if (killerN >= 2 || hardN / n >= 0.4) tone = '상위권 변별 매우 강함, 시험 전체가 어렵게 느껴짐';
  else if (killerN >= 1 || hardN / n >= 0.25 || top5 >= 8) tone = '상위권 변별 강함';
  else if (hardN >= 1) tone = '소수 변별 문항이 등급을 가름';
  else if (sd >= 2) tone = '쉬운 문항과 어려운 문항 격차 큼';
  else tone = '변별 문항 없음, 실수 싸움';
  const coverage = total ? n / total : 1;
  const partial = coverage < 0.6 ? `분류 ${n}/${total} 참고만 · ` : coverage < 1 ? `분류 ${n}/${total} · ` : '';
  const label = `${partial}평균 ${band}(${avg.toFixed(1)}) · 몸통 ${DIFFICULTY_BANDS[modeIdx].label} ${dist[modeIdx]}/${n} · 변별 7+ ${hardN}문항${killerN ? `(9+ ${killerN})` : ''}${hardN ? `, 최고 ${sorted[0]}` : ''} — ${tone}`;
  return { avg, band, label };
}

type ExamRec = {
  id: string; title: string; grade: string | null; subject: string | null; total_points: number | null;
  school_name: string | null; exam_year: number | null; semester: number | null; exam_round: string | null; exam_type: string | null;
  ai_analysis: unknown; share_token: string | null; created_at: string | null; exam_problems: Array<{ count: number }> | null;
};

/** PostgREST .or() 필터 값 — 쉼표·괄호가 들어가면 문법이 깨지므로 제거 */
const safeLike = (s: string) => s.replace(/[,()%]/g, '');

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ school: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { school: rawSchool } = await params;
  const school = normalizeSchoolName(decodeURIComponent(rawSchool)) ?? decodeURIComponent(rawSchool);

  // ★ 2026-11-04: 학교 하나를 보는데 전체 2,474장(ai_analysis 포함)을 받던 것 → 학교명 변형들로 DB 사전 필터.
  //   정확한 판정은 아래 resolveSchoolName === school 로 다시 한다 (ilike 는 넉넉히 거르는 용도).
  const variants = schoolNameVariants(school).map(safeLike).filter(Boolean);
  const orFilter = variants.flatMap((v) => [`school_name.ilike.%${v}%`, `title.ilike.%${v}%`]).join(',');

  // ★ exams.problem_count 컬럼이 prod DB 에 없음 → exam_problems(count) 조인으로 derive
  // ★ Supabase 기본 1,000행 상한 → range 페이지네이션 (by-school 과 동일)
  const PAGE = 500;
  const exams: ExamRec[] = [];
  for (let from = 0; ; from += PAGE) {
    const baseQ = supabaseAdmin
      .from('exams')
      .select('id, title, grade, subject, total_points, school_name, exam_year, semester, exam_round, exam_type, ai_analysis, share_token, created_at, exam_problems(count)')
      .is('deleted_at', null)
      .or(orFilter);
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

  // 학교명 매칭 — by-school 과 같은 판정(컬럼 우선 + 표기 통일)
  const matched = exams.filter((e) => e.exam_type !== '모의고사' && resolveSchoolName(e) === school);

  if (matched.length === 0) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }

  // ★ 2026-11-09 — 「자주 출제되는 단원」·시험지 난이도가 AI 분석(ai_analysis)만 보고 있어, 문항 분류가
  //   전부 돼 있어도 「미분류 21문항」·「-」로 나왔다(신도고). 문항 분류(classifications)를 1차 근거로 쓰고
  //   AI 분석은 보조로 둔다. Supabase 1,000행 상한 → chunk + range 페이지네이션.
  const examIds = matched.map((e) => e.id);
  const probToExam = new Map<string, string>();
  for (let i = 0; i < examIds.length; i += 100) {
    const ids = examIds.slice(i, i + 100);
    for (let from = 0; ; from += 1000) {
      const { data } = await supabaseAdmin.from('exam_problems').select('exam_id, problem_id').in('exam_id', ids).range(from, from + 999);
      (data || []).forEach((r) => probToExam.set(r.problem_id as string, r.exam_id as string));
      if (!data || data.length < 1000) break;
    }
  }
  const probIds = Array.from(probToExam.keys());
  const clsByProblem = new Map<string, { typeCode: string; difficulty: number | null }>();
  for (let i = 0; i < probIds.length; i += 200) {
    const ids = probIds.slice(i, i + 200);
    const { data } = await supabaseAdmin.from('classifications').select('problem_id, type_code, difficulty').in('problem_id', ids).order('created_at', { ascending: false });
    (data || []).forEach((c) => {
      if (!c.type_code || clsByProblem.has(c.problem_id as string)) return;
      const d = c.difficulty != null ? parseInt(String(c.difficulty), 10) : NaN;
      clsByProblem.set(c.problem_id as string, { typeCode: c.type_code as string, difficulty: Number.isFinite(d) && d >= 1 && d <= 10 ? d : null });
    });
  }
  // 대단원 이름 — type_code 앞 두 토막(MS07-02)이 mathsecr_types 의 대단원 코드
  const level1Codes = Array.from(new Set(Array.from(clsByProblem.values()).map((c) => c.typeCode.split('-').slice(0, 2).join('-'))));
  const level1Name = new Map<string, string>();
  for (let i = 0; i < level1Codes.length; i += 200) {
    const { data } = await supabaseAdmin.from('mathsecr_types').select('code, level1_name').in('code', level1Codes.slice(i, i + 200));
    (data || []).forEach((t) => { if (t.level1_name) level1Name.set(t.code as string, t.level1_name as string); });
  }
  // 시험지별 분류 집계
  const perExam = new Map<string, { diffs: number[]; units: Map<string, number> }>();
  for (const [pid, examId] of probToExam) {
    const c = clsByProblem.get(pid); if (!c) continue;
    const s = perExam.get(examId) || { diffs: [] as number[], units: new Map<string, number>() };
    if (c.difficulty != null) s.diffs.push(c.difficulty);
    const l1 = c.typeCode.split('-').slice(0, 2).join('-');
    const name = level1Name.get(l1) || l1;
    s.units.set(name, (s.units.get(name) || 0) + 1);
    perExam.set(examId, s);
  }

  // 시험지 row 변환 — 년도·학기·구분은 DB 컬럼 → 제목 파싱 순
  const examRows: ExamRow[] = matched.map((e) => {
    const ai = e.ai_analysis as Record<string, unknown> | null;
    const hasAnalysis = !!(ai && typeof ai === 'object' && 'generatedAt' in ai);
    const analysis = hasAnalysis ? (ai as unknown as ExamAIAnalysis) : null;
    const semester = (e.semester === 1 || e.semester === 2 ? e.semester : null) ?? extractSemester(e.title);
    const examType = e.exam_round || extractExamType(e.title);
    const stat = perExam.get(e.id);
    const problemCount = Number(e.exam_problems?.[0]?.count) || 0;
    const feel = stat ? describeFeel(stat.diffs, problemCount) : null;
    return {
      classifiedCount: stat ? Array.from(stat.units.values()).reduce((a, b) => a + b, 0) : 0,
      avgDifficulty: feel?.avg ?? null,
      difficultyLabel: feel?.band ?? analysis?.overallDifficulty ?? null,
      feel: feel?.label ?? null,
      unitCounts: stat ? Array.from(stat.units.entries()).map(([unit, problemCount]) => ({ unit, problemCount })).sort((a, b) => b.problemCount - a.problemCount) : [],
      id: e.id,
      title: e.title,
      grade: e.grade,
      subject: e.subject,
      problemCount: Number(e.exam_problems?.[0]?.count) || 0,
      totalPoints: Number(e.total_points) || 0,
      createdAt: e.created_at ?? null,
      year: e.exam_year ?? extractExamYear(e.title, e.created_at),
      semester,
      examType,
      hasAnalysis,
      hasShare: !!e.share_token,
      shareToken: e.share_token || null,
      overallDifficulty: analysis?.overallDifficulty || null,
      unitCount: analysis?.unitAnalyses?.length || 0,
      analysis,
    };
  });

  // 누적 통계
  const totalExams = examRows.length;
  const analyzedExams = examRows.filter((e) => e.hasAnalysis).length;
  const sharedExams = examRows.filter((e) => e.hasShare).length;
  const totalProblems = examRows.reduce((s, e) => s + e.problemCount, 0);
  const totalPoints = examRows.reduce((s, e) => s + e.totalPoints, 0);

  // 학년 분포
  const gradeMap = new Map<string, number>();
  examRows.forEach((e) => {
    if (e.grade) gradeMap.set(e.grade, (gradeMap.get(e.grade) || 0) + 1);
  });
  const gradeDistribution = Array.from(gradeMap.entries())
    .map(([grade, count]) => ({ grade, count }))
    .sort((a, b) => a.grade.localeCompare(b.grade, 'ko'));

  // 단원·난이도 집계 — 문항 분류 기준. 분류가 하나도 없는 시험지만 AI 분석의 단원·총평으로 보완한다.
  const unitFreq = new Map<string, number>();
  const overallDifficultyDist: Record<string, number> = {
    평이: 0,
    보통: 0,
    '난이도 있음': 0,
    '매우 난이도 있음': 0,
    최고난도: 0,
  };
  let classifiedProblems = 0;
  examRows.forEach((e) => {
    if (e.difficultyLabel) overallDifficultyDist[e.difficultyLabel] = (overallDifficultyDist[e.difficultyLabel] || 0) + 1;
    if (e.classifiedCount > 0) {
      classifiedProblems += e.classifiedCount;
      e.unitCounts.forEach((u) => unitFreq.set(u.unit, (unitFreq.get(u.unit) || 0) + u.problemCount));
      return;
    }
    (e.analysis?.unitAnalyses || []).forEach((u) => {
      // AI 가 쓴 자유 문자열 — 공백 차이("이차 함수"/"이차함수")는 같은 단원으로
      const key = String(u.majorUnit || '').replace(/\s+/g, '').trim();
      if (!key) return;
      unitFreq.set(key, (unitFreq.get(key) || 0) + (u.questionNumbers?.length || 0));
    });
  });

  const topUnits = Array.from(unitFreq.entries())
    .map(([unit, problemCount]) => ({ unit, problemCount }))
    .sort((a, b) => b.problemCount - a.problemCount)
    .slice(0, 10);

  // 등장한 발행 년도 set (내림차순)
  const yearSet = new Set<number>();
  examRows.forEach((e) => {
    if (e.year != null) yearSet.add(e.year);
  });
  const availableYears = Array.from(yearSet).sort((a, b) => b - a);

  return NextResponse.json({
    school,
    summary: {
      totalExams,
      analyzedExams,
      sharedExams,
      totalProblems,
      totalPoints,
      classifiedProblems,
    },
    gradeDistribution,
    topUnits,
    overallDifficultyDist,
    availableYears,
    exams: examRows,
  });
}
