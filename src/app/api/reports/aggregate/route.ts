// ============================================================================
// 학교별 시험지 집계 분석 API
// GET /api/reports/aggregate?year=&grade=&semester=&examType=&schools=
//
// 응답: 필터 매칭 시험지의 raw aggregation (할루시네이션 0).
//   - 단원 빈도 (mathsecr level1)
//   - 학교별 평균 난이도 + 표준편차 (1~10)
//   - 함정 패턴 (problem_pitfalls + pitfall_types.label_ko)
//   - 학교별 표 + 매칭 시험지 목록
//   [Phase 2]
//   - unitSegmentation: 공통(>=80% 학교 출제) vs 차별(<=30%) 단원
//   - unitTrends: 년도별 단원 출제 추세 (year filter 풀어서)
//   - insights: 데이터 기반 rule-based 한 줄 요약
//   - aiNarratives: 매칭 시험지의 ai_analysis.summary/hardQuestions 인용 (출처 명시)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { extractSchoolName } from '@/lib/utils/school-extract';
import { extractExamYear } from '@/lib/utils/year-extract';
import { extractSemester, extractExamType } from '@/lib/utils/exam-meta-extract';
import { DIFFICULTY_BANDS, difficultyToBand } from '@/lib/utils/difficulty-label';

export const dynamic = 'force-dynamic';

interface UnitRow {
  level1Code: string;
  level1Name: string;
  problemCount: number;
  examCount: number;
  schoolCount: number;
}

interface SchoolRow {
  school: string;
  examCount: number;
  problemCount: number;
  classifiedCount: number;
  avgDifficulty: number | null;
  stdDevDifficulty: number | null;
  topUnits: Array<{ level1Name: string; problemCount: number }>;
}

interface PitfallRow {
  code: string;
  label: string;
  category: string | null;
  problemCount: number;
  examCount: number;
}

interface ExamRow {
  id: string;
  title: string;
  school: string;
  year: number | null;
  semester: 1 | 2 | null;
  examType: string | null;
  problemCount: number;
  classifiedCount: number;
  /** 이 시험지 problem difficulty 평균 (1~10) — null = 분류된 문항 0 */
  avgDifficulty: number | null;
  hasAnalysis: boolean;
  shareToken: string | null;
  createdAt: string;
}

interface UnitTrend {
  level1Code: string;
  level1Name: string;
  /** 년도별 출제 데이터 — { 2024: { problemCount, schoolCount, examCount } } */
  byYear: Record<string, { problemCount: number; schoolCount: number; examCount: number }>;
}

interface AiNarrative {
  examId: string;
  examTitle: string;
  school: string;
  year: number | null;
  /** ai_analysis.summary — 시험지 전체 요약 */
  summary: string | null;
  /** hardQuestions 의 핵심 발췌 (최대 3개) — 각 problemId 인용 */
  hardQuestions: Array<{
    problemId: string;
    number: number;
    subTitle: string;
    intent: string;
  }>;
  generatedAt: string | null;
}

export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  const gradeParam = searchParams.get('grade');
  const semesterParam = searchParams.get('semester');
  const examTypeParam = searchParams.get('examType');
  const schoolsParam = searchParams.get('schools');

  const filterYear = yearParam ? parseInt(yearParam, 10) : null;
  const filterGrade = gradeParam || null;
  const filterSemester = semesterParam ? (parseInt(semesterParam, 10) as 1 | 2) : null;
  const filterExamType = examTypeParam || null;
  const filterSchools = schoolsParam ? schoolsParam.split(',').map((s) => s.trim()).filter(Boolean) : null;

  // ─────────────────────────────────────────────────────────────────────
  // 1) 시험지 + 분석/공유 + 문제 + 분류 + 함정 일괄 조회 (nested join)
  // ─────────────────────────────────────────────────────────────────────
  let query = supabaseAdmin
    .from('exams')
    .select(`
      id, title, grade, subject, ai_analysis, share_token, created_at,
      exam_problems(
        problem_id,
        problems(
          classifications(type_code, difficulty),
          problem_pitfalls(pitfall_code)
        )
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (filterGrade) query = query.eq('grade', filterGrade);

  const { data: examsRaw, error: examsErr } = await query;
  if (examsErr) {
    return NextResponse.json({ error: 'Fetch failed', detail: examsErr.message }, { status: 500 });
  }

  type ExamFetch = {
    id: string;
    title: string;
    grade: string | null;
    subject: string | null;
    ai_analysis: Record<string, unknown> | null;
    share_token: string | null;
    created_at: string | null;
    exam_problems: Array<{
      problem_id: string;
      // Supabase 관계 inference 가 array 로 반환 (FK 측 1행이라도)
      problems: Array<{
        classifications: Array<{ type_code: string | null; difficulty: string | null }> | null;
        problem_pitfalls: Array<{ pitfall_code: string | null }> | null;
      }> | null;
    }>;
  };

  const allExams = (examsRaw || []) as unknown as ExamFetch[];

  // ─────────────────────────────────────────────────────────────────────
  // 2) 클라이언트 사이드 필터링 (title 파싱 — year/semester/examType/school)
  // ─────────────────────────────────────────────────────────────────────
  const matchedExams: ExamFetch[] = allExams.filter((e) => {
    const school = extractSchoolName(e.title);
    if (!school) return false;
    if (filterSchools && !filterSchools.includes(school)) return false;
    if (filterYear != null && extractExamYear(e.title, e.created_at) !== filterYear) return false;
    if (filterSemester != null && extractSemester(e.title) !== filterSemester) return false;
    if (filterExamType != null && extractExamType(e.title) !== filterExamType) return false;
    return true;
  });

  // ─────────────────────────────────────────────────────────────────────
  // 3) mathsecr_types 한 번 조회 — level1 매핑용
  // ─────────────────────────────────────────────────────────────────────
  const { data: mathsecrRaw } = await supabaseAdmin
    .from('mathsecr_types')
    .select('code, level1_name')
    .eq('depth', 2);

  const level1NameMap = new Map<string, string>();
  ((mathsecrRaw || []) as Array<{ code: string; level1_name: string | null }>).forEach((r) => {
    if (r.code && r.level1_name) level1NameMap.set(r.code, r.level1_name);
  });

  // ─────────────────────────────────────────────────────────────────────
  // 4) pitfall_types 한 번 조회 — code → label_ko·category
  // ─────────────────────────────────────────────────────────────────────
  const { data: pitfallTypesRaw } = await supabaseAdmin
    .from('pitfall_types')
    .select('code, label_ko, category');

  const pitfallLabelMap = new Map<string, { label: string; category: string | null }>();
  ((pitfallTypesRaw || []) as Array<{ code: string; label_ko: string; category: string | null }>).forEach((r) => {
    pitfallLabelMap.set(r.code, { label: r.label_ko, category: r.category });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 5) 집계
  // ─────────────────────────────────────────────────────────────────────
  // 단원 빈도
  const unitMap = new Map<
    string,
    { level1Code: string; level1Name: string; problemCount: number; examIds: Set<string>; schools: Set<string> }
  >();
  // 학교별 통계 — 시험지 평균을 모아서 학교 평균 = 시험지 평균들의 평균 (등가중)
  const schoolMap = new Map<
    string,
    {
      examIds: Set<string>;
      problemCount: number;
      examAvgs: number[]; // 학교 소속 시험지들의 평균 난이도
      unitCounts: Map<string, number>; // level1Name → count
    }
  >();
  // 함정 빈도
  const pitfallMap = new Map<string, { code: string; problemCount: number; examIds: Set<string> }>();
  // 난이도 밴드 분포 — 시험지 단위 (각 시험지의 평균 → 밴드 → 카운트)
  const examBandCountMap = new Map<string, number>();
  DIFFICULTY_BANDS.forEach((b) => examBandCountMap.set(b.label, 0));

  let totalProblems = 0;
  let classifiedProblems = 0;
  let analyzedExamCount = 0;
  const allExamAvgs: number[] = []; // 매칭 시험지들의 평균 (그룹 전체 평균 계산용)
  const examRows: ExamRow[] = [];

  for (const e of matchedExams) {
    const school = extractSchoolName(e.title)!;
    const ai = e.ai_analysis;
    const hasAnalysis = !!(ai && typeof ai === 'object' && 'generatedAt' in ai);
    if (hasAnalysis) analyzedExamCount++;

    const eps = e.exam_problems || [];
    const examProblemCount = eps.length;
    let examClassified = 0;
    totalProblems += examProblemCount;

    if (!schoolMap.has(school)) {
      schoolMap.set(school, {
        examIds: new Set(),
        problemCount: 0,
        examAvgs: [],
        unitCounts: new Map(),
      });
    }
    const sStat = schoolMap.get(school)!;
    sStat.examIds.add(e.id);
    sStat.problemCount += examProblemCount;

    // 시험지 단위 난이도 — 이 시험지의 problem difficulty 들 모음
    const examProblemDiffs: number[] = [];

    for (const ep of eps) {
      // Supabase 관계 inference 로 array 또는 단일 row 가능 — 안전하게 둘 다 처리
      const pArr = ep.problems;
      const p = Array.isArray(pArr) ? pArr[0] : pArr;
      if (!p) continue;
      const cls = (p.classifications || [])[0];
      if (cls?.type_code) {
        examClassified++;
        classifiedProblems++;

        // 난이도 (problem 단위 — 시험지 평균 계산 재료)
        const d = cls.difficulty != null ? parseInt(String(cls.difficulty), 10) : NaN;
        if (Number.isFinite(d) && d >= 1 && d <= 10) {
          examProblemDiffs.push(d);
        }

        // 단원 (level1 = MS-prefix + first segment, 예: MS05-01)
        const segs = cls.type_code.split('-');
        if (segs.length >= 2) {
          const level1Code = `${segs[0]}-${segs[1]}`;
          const level1Name = level1NameMap.get(level1Code) || level1Code;
          if (!unitMap.has(level1Code)) {
            unitMap.set(level1Code, {
              level1Code,
              level1Name,
              problemCount: 0,
              examIds: new Set(),
              schools: new Set(),
            });
          }
          const u = unitMap.get(level1Code)!;
          u.problemCount++;
          u.examIds.add(e.id);
          u.schools.add(school);

          sStat.unitCounts.set(level1Name, (sStat.unitCounts.get(level1Name) || 0) + 1);
        }
      }

      // 함정
      for (const pf of p.problem_pitfalls || []) {
        if (!pf.pitfall_code) continue;
        if (!pitfallMap.has(pf.pitfall_code)) {
          pitfallMap.set(pf.pitfall_code, {
            code: pf.pitfall_code,
            problemCount: 0,
            examIds: new Set(),
          });
        }
        const pStat = pitfallMap.get(pf.pitfall_code)!;
        pStat.problemCount++;
        pStat.examIds.add(e.id);
      }
    }

    // 이 시험지의 평균 난이도 = 그 시험지 problem difficulty 평균
    let examAvg: number | null = null;
    if (examProblemDiffs.length > 0) {
      examAvg =
        examProblemDiffs.reduce((s, v) => s + v, 0) / examProblemDiffs.length;
      allExamAvgs.push(examAvg);
      sStat.examAvgs.push(examAvg);
      const band = difficultyToBand(examAvg);
      if (band) examBandCountMap.set(band.label, (examBandCountMap.get(band.label) || 0) + 1);
    }

    examRows.push({
      id: e.id,
      title: e.title,
      school,
      year: extractExamYear(e.title, e.created_at),
      semester: extractSemester(e.title),
      examType: extractExamType(e.title),
      problemCount: examProblemCount,
      classifiedCount: examClassified,
      avgDifficulty: examAvg,
      hasAnalysis,
      shareToken: e.share_token,
      createdAt: e.created_at || '',
    });
  }

  // 평균/표준편차 계산기
  const stat = (arr: number[]): { avg: number | null; std: number | null } => {
    if (arr.length === 0) return { avg: null, std: null };
    const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
    if (arr.length < 2) return { avg, std: null };
    const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length;
    return { avg, std: Math.sqrt(variance) };
  };

  // 단원 빈도 정렬 — problemCount 내림차순
  const unitFrequency: UnitRow[] = Array.from(unitMap.values())
    .map((u) => ({
      level1Code: u.level1Code,
      level1Name: u.level1Name,
      problemCount: u.problemCount,
      examCount: u.examIds.size,
      schoolCount: u.schools.size,
    }))
    .sort((a, b) => b.problemCount - a.problemCount);

  // 학교별 정렬 — 학교명 가나다순.
  // 학교 평균 난이도 = 그 학교 시험지들의 평균값들의 평균 (시험지 등가중)
  const schoolBreakdown: SchoolRow[] = Array.from(schoolMap.entries())
    .map(([school, s]) => {
      const { avg, std } = stat(s.examAvgs);
      const topUnits = Array.from(s.unitCounts.entries())
        .map(([level1Name, problemCount]) => ({ level1Name, problemCount }))
        .sort((a, b) => b.problemCount - a.problemCount)
        .slice(0, 3);
      return {
        school,
        examCount: s.examIds.size,
        problemCount: s.problemCount,
        classifiedCount: s.examAvgs.length, // 평균 산출에 들어간 시험지 수
        avgDifficulty: avg,
        stdDevDifficulty: std,
        topUnits,
      };
    })
    .sort((a, b) => a.school.localeCompare(b.school));

  // 함정 정렬 — problemCount 내림차순, 라벨 매핑
  const pitfalls: PitfallRow[] = Array.from(pitfallMap.values())
    .map((p) => {
      const meta = pitfallLabelMap.get(p.code);
      return {
        code: p.code,
        label: meta?.label || p.code,
        category: meta?.category ?? null,
        problemCount: p.problemCount,
        examCount: p.examIds.size,
      };
    })
    .sort((a, b) => b.problemCount - a.problemCount);

  // 매칭 학교 set
  const matchedSchools = new Set(matchedExams.map((e) => extractSchoolName(e.title)!));

  // 그룹 전체 평균 = 매칭 시험지들의 평균값들의 평균 (시험지 등가중)
  const overall = stat(allExamAvgs);

  // ─────────────────────────────────────────────────────────────────────
  // [Phase 2] 단원 공통/차별 분리 (>=80% 학교 출제 = 공통, <=30% = 차별)
  // ─────────────────────────────────────────────────────────────────────
  const totalSchools = matchedSchools.size;
  const unitCommon: UnitRow[] = [];
  const unitUnique: UnitRow[] = [];
  if (totalSchools > 0) {
    for (const u of unitFrequency) {
      const ratio = u.schoolCount / totalSchools;
      if (ratio >= 0.8) unitCommon.push(u);
      else if (ratio <= 0.3 && u.schoolCount >= 1) unitUnique.push(u);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // [Phase 2] 단원 추세 — top 5 단원의 년도별 출제 (year filter 풀어서)
  // trendBase = school+semester+examType 매칭 (year 무시)
  // ─────────────────────────────────────────────────────────────────────
  const trendBase = allExams.filter((e) => {
    const school = extractSchoolName(e.title);
    if (!school) return false;
    if (filterSchools && !filterSchools.includes(school)) return false;
    if (filterSemester != null && extractSemester(e.title) !== filterSemester) return false;
    if (filterExamType != null && extractExamType(e.title) !== filterExamType) return false;
    return true;
  });

  // 년도 set
  const trendYearSet = new Set<number>();
  // 단원 → 년도 → 통계
  const unitYearStats = new Map<
    string,
    Map<number, { problemCount: number; schoolIds: Set<string>; examIds: Set<string> }>
  >();

  for (const e of trendBase) {
    const yr = extractExamYear(e.title, e.created_at);
    if (yr == null) continue;
    trendYearSet.add(yr);
    const school = extractSchoolName(e.title)!;
    for (const ep of e.exam_problems || []) {
      const pArr = ep.problems;
      const p = Array.isArray(pArr) ? pArr[0] : pArr;
      if (!p) continue;
      const cls = (p.classifications || [])[0];
      if (!cls?.type_code) continue;
      const segs = cls.type_code.split('-');
      if (segs.length < 2) continue;
      const level1Code = `${segs[0]}-${segs[1]}`;
      if (!unitYearStats.has(level1Code)) unitYearStats.set(level1Code, new Map());
      const yearMap = unitYearStats.get(level1Code)!;
      if (!yearMap.has(yr)) {
        yearMap.set(yr, { problemCount: 0, schoolIds: new Set(), examIds: new Set() });
      }
      const stats = yearMap.get(yr)!;
      stats.problemCount++;
      stats.schoolIds.add(school);
      stats.examIds.add(e.id);
    }
  }

  const availableYears = Array.from(trendYearSet).sort((a, b) => a - b);

  const unitTrends: UnitTrend[] = unitFrequency.slice(0, 5).map((u) => {
    const yearMap = unitYearStats.get(u.level1Code) || new Map();
    const byYear: UnitTrend['byYear'] = {};
    for (const yr of availableYears) {
      const s = yearMap.get(yr);
      byYear[yr] = {
        problemCount: s?.problemCount || 0,
        schoolCount: s?.schoolIds.size || 0,
        examCount: s?.examIds.size || 0,
      };
    }
    return {
      level1Code: u.level1Code,
      level1Name: u.level1Name,
      byYear,
    };
  });

  // ─────────────────────────────────────────────────────────────────────
  // [Phase 2] AI 자연어 인용 — ai_analysis 있는 시험지만, 출처 problemId 명시
  // ─────────────────────────────────────────────────────────────────────
  const aiNarratives: AiNarrative[] = matchedExams
    .map((e) => {
      const ai = e.ai_analysis as
        | { summary?: string; generatedAt?: string; hardQuestions?: Array<{
            number: number;
            subTitle?: string;
            intent?: string;
            problemId?: string;
          }> }
        | null;
      if (!ai || !ai.generatedAt) return null;
      const hardQs = (ai.hardQuestions || []).slice(0, 3).map((h) => ({
        problemId: h.problemId || '',
        number: h.number,
        subTitle: h.subTitle || '',
        intent: (h.intent || '').slice(0, 200),
      }));
      return {
        examId: e.id,
        examTitle: e.title,
        school: extractSchoolName(e.title)!,
        year: extractExamYear(e.title, e.created_at),
        summary: ai.summary ? ai.summary.slice(0, 400) : null,
        hardQuestions: hardQs,
        generatedAt: ai.generatedAt || null,
      };
    })
    .filter((x): x is AiNarrative => x !== null);

  // ─────────────────────────────────────────────────────────────────────
  // [Phase 2] 베테랑 강사 톤 narrative — rule-based, 데이터 기반 + 해석
  // 학부모도 이해할 수 있게 풀어 설명. 모든 수치는 raw aggregation 결과.
  // ─────────────────────────────────────────────────────────────────────
  const narrative: Array<{ heading: string; paragraphs: string[] }> = [];

  // 1. 한 줄 요약 — 무엇을 분석했나
  if (matchedExams.length > 0) {
    const subjLabel = filterGrade ? ` ${filterGrade}` : '';
    const semLabel = filterSemester ? ` ${filterSemester}학기` : '';
    const typeLabel = filterExamType ? ` ${filterExamType}` : '';
    const yearLabel = filterYear ? `${filterYear}학년도` : '최근';
    narrative.push({
      heading: '이번 분석의 한 줄 요약',
      paragraphs: [
        `${yearLabel}${subjLabel}${semLabel}${typeLabel}고사를 ${totalSchools}개 학교 ${matchedExams.length}건 시험지(총 ${totalProblems}문항) 단위로 비교했습니다. ${
          classifiedProblems === totalProblems
            ? '모든 문항이 단원·난이도 분류 완료'
            : `${classifiedProblems}/${totalProblems}문항 분류 완료`
        }됐고, 아래 단원 분포·난이도 분포·학교별 비교를 함께 보시면 학교별 출제 성향이 한눈에 잡힙니다.`,
      ],
    });
  }

  // 2. 평균 난이도 해석 — 강사 톤
  if (overall.avg != null) {
    const band = difficultyToBand(overall.avg);
    let interp = '';
    if (overall.avg <= 4) {
      interp =
        '교과서 기본 개념과 정형 응용 풀이에 무게가 실려 있습니다. 기본기를 정확히 숙지한 학생이 안정적으로 점수를 확보할 수 있는 구간이며, 단원 통합 응용보다는 단일 개념 정확도가 변별 요소가 됩니다.';
    } else if (overall.avg <= 6) {
      interp =
        '내신 평균 변별이 본격적으로 작동하는 구간입니다. 두 개념을 결합하거나 조건을 정확히 분석해야 풀리는 문항이 일정 비율 포함되어, 평소 단원 통합 학습 여부가 점수를 가르는 결정적 요소가 됩니다.';
    } else {
      interp =
        '상위권 변별이 강하게 작동하는 구간입니다. 한 문제에 다단계 추론과 복합 조건이 결합돼, 풀이 시간 관리와 핵심 단계 정확도가 점수에 직결됩니다.';
    }
    narrative.push({
      heading: '평균 난이도와 해석',
      paragraphs: [
        `시험지 평균은 ${overall.avg.toFixed(2)}/10 (${band?.label ?? '-'})${
          overall.std != null ? `, 학교 간 편차는 σ ${overall.std.toFixed(2)}` : ''
        }로 집계되었습니다.`,
        interp,
      ],
    });
  }

  // 3. 공통 단원 — 모든 학교가 출제한 단원
  const universalUnits = unitFrequency.filter(
    (u) => totalSchools > 0 && u.schoolCount === totalSchools
  );
  if (universalUnits.length > 0) {
    const top = universalUnits.slice(0, 3).map((u) => u.level1Name);
    narrative.push({
      heading: `${totalSchools}/${totalSchools}곳 학교 모두 출제한 핵심 단원`,
      paragraphs: [
        `${top.join(' · ')}${
          universalUnits.length > 3 ? ` 외 ${universalUnits.length - 3}개 단원` : ''
        }은 매칭된 모든 학교가 빠짐없이 출제했습니다.`,
        '학교별로 출제 비중과 난이도만 다를 뿐 출제 자체를 건너뛰는 학교가 없으므로, 시험 대비에서 가장 먼저 마무리해야 할 1순위 영역입니다. 이 단원에서 점수를 잃으면 학교 평균 이하로 떨어질 위험이 높습니다.',
      ],
    });
  }

  // 4. 학교별 난이도 outlier
  if (overall.avg != null) {
    const harder = schoolBreakdown
      .filter((s) => s.avgDifficulty != null && s.avgDifficulty - overall.avg! >= 0.6)
      .sort((a, b) => (b.avgDifficulty || 0) - (a.avgDifficulty || 0));
    const easier = schoolBreakdown
      .filter((s) => s.avgDifficulty != null && overall.avg! - s.avgDifficulty >= 0.6)
      .sort((a, b) => (a.avgDifficulty || 0) - (b.avgDifficulty || 0));
    const ps: string[] = [];
    if (harder.length > 0) {
      const list = harder
        .slice(0, 3)
        .map((s) => `${s.school} ${(s.avgDifficulty || 0).toFixed(2)}`)
        .join(', ');
      ps.push(
        `${list} — 그룹 평균 대비 한 밴드 위에서 출제됐습니다. 상위권 변별을 강하게 두는 학교 성향이 데이터로 확인됩니다. 같은 단원을 풀더라도 한 단계 더 깊은 사고를 요구하는 문항이 섞여 있다고 보시면 됩니다.`
      );
    }
    if (easier.length > 0) {
      const list = easier
        .slice(0, 3)
        .map((s) => `${s.school} ${(s.avgDifficulty || 0).toFixed(2)}`)
        .join(', ');
      ps.push(
        `반면 ${list} 은 그룹 평균보다 낮게 출제됐습니다. 기본기 안정 평가에 무게가 실린 흐름으로, 정형 풀이와 계산 정확도를 충실히 다지면 안정적으로 점수를 확보할 수 있습니다.`
      );
    }
    if (ps.length > 0) {
      narrative.push({ heading: '학교별 난이도 성향', paragraphs: ps });
    }
  }

  // 5. 작년 대비 출제 흐름
  if (filterYear != null && availableYears.includes(filterYear)) {
    const prevYear = filterYear - 1;
    if (availableYears.includes(prevYear)) {
      const ups: string[] = [];
      const downs: string[] = [];
      const news: string[] = [];
      for (const t of unitTrends.slice(0, 5)) {
        const cur = t.byYear[String(filterYear)]?.problemCount || 0;
        const prev = t.byYear[String(prevYear)]?.problemCount || 0;
        if (prev > 0) {
          const pct = Math.round(((cur - prev) / prev) * 100);
          if (pct >= 15) ups.push(`${t.level1Name} +${pct}%`);
          else if (pct <= -15) downs.push(`${t.level1Name} ${pct}%`);
        } else if (cur > 0) {
          news.push(t.level1Name);
        }
      }
      const ps: string[] = [];
      if (ups.length > 0 || news.length > 0) {
        const upText = [...ups, ...news.map((n) => `${n} (신규)`)].join(' · ');
        ps.push(
          `${prevYear}년 대비 출제 비중이 늘어난 단원: ${upText}. 출제 가능성이 더 높아졌으므로 우선순위를 두고 대비할 영역입니다.`
        );
      }
      if (downs.length > 0) {
        ps.push(
          `반대로 줄어든 단원: ${downs.join(' · ')}. 비중은 떨어졌지만 매년 일정 수준의 문항은 유지되므로 기본 풀이까지는 익혀두는 것이 안전합니다.`
        );
      }
      if (ps.length > 0) {
        narrative.push({ heading: `${prevYear}년 대비 출제 흐름`, paragraphs: ps });
      }
    }
  }

  // 6. 함정 패턴 — 있을 때만 (사용자 요청: 데이터 0 이면 표시 X)
  if (pitfalls.length > 0) {
    const top = pitfalls
      .slice(0, 3)
      .map((p) => `${p.label}(${p.problemCount}문항)`)
      .join(' · ');
    narrative.push({
      heading: '자주 노출되는 함정 패턴',
      paragraphs: [
        `${top} 가 가장 빈번하게 매핑되었습니다.`,
        '학생이 같은 패턴으로 실수를 반복할 가능성이 큰 영역입니다. 풀이 후 채점 단계에서 이 함정에 빠진 문항이 있는지 점검하면 점수 회복이 가장 빠릅니다.',
      ],
    });
  }

  // 7. 시험지별 상세 분석 안내 — 강점 부각
  if (analyzedExamCount > 0) {
    narrative.push({
      heading: `시험지별 상세 분석 ${analyzedExamCount}건 — 깊이까지 들어가 보세요`,
      paragraphs: [
        `매칭된 ${matchedExams.length}건 중 ${analyzedExamCount}건은 학교별로 단원 분포·고난도 문항 출제 의도·단계별 풀이 전략까지 분석이 완료된 상태입니다.`,
        '이 통합 리포트는 큰 흐름을 보여드리고, 각 시험지를 클릭해 들어가시면 문항 단위 수식·풀이 과정·핵심 학습 전략까지 보실 수 있습니다 — 학교별 시험지 분석은 이 시스템의 가장 큰 강점입니다.',
      ],
    });
  }

  return NextResponse.json({
    filters: {
      year: filterYear,
      grade: filterGrade,
      semester: filterSemester,
      examType: filterExamType,
      schools: filterSchools,
    },
    matched: {
      schoolCount: matchedSchools.size,
      examCount: matchedExams.length,
      analyzedExamCount,
      problemCount: totalProblems,
      classifiedProblemCount: classifiedProblems,
    },
    unitFrequency,
    difficultyDist: {
      // 각 시험지의 평균을 밴드로 분류 → 밴드별 시험지 수
      examBandCounts: DIFFICULTY_BANDS.map((b) => ({
        band: b.label,
        hue: b.hue,
        examCount: examBandCountMap.get(b.label) || 0,
      })),
      overallAvg: overall.avg,
      overallStdDev: overall.std,
      examWithAvgCount: allExamAvgs.length,
    },
    schoolBreakdown,
    pitfalls,
    exams: examRows,
    // [Phase 2]
    unitSegmentation: { common: unitCommon, unique: unitUnique },
    unitTrends,
    availableYears,
    aiNarratives,
    narrative,
  });
}
