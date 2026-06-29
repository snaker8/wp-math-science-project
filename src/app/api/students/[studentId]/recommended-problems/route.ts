// ============================================================================
// GET /api/students/[studentId]/recommended-problems
//
// 학생 맞춤 학습지 추천 (Phase B 카파시 학습 무대):
//   - 약점 단원 (student_node_status γ/β status, 또는 v_student_mathsecr_heatmap)
//   - 자주 빠지는 함정 (v_student_pitfall_summary TOP)
//   - 적정 난이도 (status α/β/γ → 도전/정공법/기초)
// 결합 → problems JOIN classifications + problem_pitfalls 매칭 → 추천 N개
//
// 응답: weakestUnit + topPitfalls + difficultyRange + problems[]
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertStudentAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

interface RecommendedProblem {
  problemId: string;
  contentPreview: string; // 본문 앞 200자
  typeCode: string;
  typeName: string;
  difficulty: number;
  matchedPitfalls: string[]; // 매칭된 함정 코드들
  matchScore: number; // 매칭 점수 (높을수록 추천도 ↑)
  reason: string;
}

// ★ status 는 DB(student_node_status)에 영문 'alpha'/'beta'/'gamma' 로 저장됨.
//   (이전엔 그리스문자 키 γ/β/α 라 항상 미스매치 → 추천 0개 사고. 2026-06-29 수정.)
const STATUS_DIFFICULTY_RANGE: Record<string, [number, number]> = {
  gamma: [1, 3], // 불안정 → 기초 보강
  beta: [3, 6],  // 중간 → 정공법 응용
  alpha: [5, 8], // 안정 → 도전
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  const { studentId } = await params;
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = supabaseAdmin;

  // ★ 학생 격리 — 다른 학원 학생 진단/약점/추천 read 차단
  const access = await assertStudentAccess(sb, studentId, scope);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const url = new URL(request.url);
  const topN = parseInt(url.searchParams.get('topN') || '10', 10);

  // 1) 학생 약점 단원 — student_node_status에서 γ status 우선, 없으면 β
  const { data: nodeStatuses } = await sb
    .schema('diagnostics' as never)
    .from('student_node_status')
    .select('mathsecr_code, status, last_score')
    .eq('student_id', studentId)
    .order('last_score', { ascending: true });

  const statuses = (nodeStatuses || []) as Array<{
    mathsecr_code: string;
    status: string;
    last_score: number | null;
  }>;
  const gammaNodes = statuses.filter((s) => s.status === 'gamma');
  const betaNodes = statuses.filter((s) => s.status === 'beta');
  const targetNodes = gammaNodes.length > 0 ? gammaNodes : betaNodes;
  const weakestNode = targetNodes[0] || null;

  // 약점 단원 정보 (full_path)
  let weakestUnit: { code: string; fullPath: string; status: string } | null = null;
  if (weakestNode) {
    const { data: unitInfo } = await sb
      .from('mathsecr_types')
      .select('full_path')
      .eq('code', weakestNode.mathsecr_code)
      .maybeSingle();
    weakestUnit = {
      code: weakestNode.mathsecr_code,
      fullPath: (unitInfo as { full_path?: string })?.full_path || weakestNode.mathsecr_code,
      status: weakestNode.status,
    };
  }

  // 2) 자주 빠지는 함정 TOP 3
  const { data: pitfallSummary } = await sb
    .schema('diagnostics' as never)
    .from('v_student_pitfall_summary')
    .select('pitfall_code, pitfall_label, occurrence_count')
    .eq('student_id', studentId)
    .order('occurrence_count', { ascending: false })
    .limit(3);

  const topPitfalls = ((pitfallSummary as Array<{ pitfall_code: string; pitfall_label: string }>) || []).map(
    (r) => ({ code: r.pitfall_code, label: r.pitfall_label })
  );

  // 3) 적정 난이도 — status 기반
  const status = weakestNode?.status || 'beta';
  const [diffLow, diffHigh] = STATUS_DIFFICULTY_RANGE[status] || [3, 6];
  const difficultyValues = [];
  for (let d = diffLow; d <= diffHigh; d++) difficultyValues.push(String(d));

  // 4) 약점 단원 prefix(MS09-02 같은) 추출 + 같은 영역 problems 검색
  if (!weakestUnit) {
    return NextResponse.json({
      studentId,
      weakestUnit: null,
      topPitfalls,
      difficultyRange: [diffLow, diffHigh],
      problems: [],
      message: '학생 약점 단원 데이터가 부족합니다. 진단 결과 입력 후 다시 시도해주세요.',
    });
  }

  const stage1Prefix = weakestUnit.code.split('-').slice(0, 2).join('-'); // MS09-02

  // classifications에서 prefix + 난이도 매칭
  const { data: clsData } = await sb
    .from('classifications')
    .select('problem_id, type_code, difficulty')
    .like('type_code', `${stage1Prefix}%`)
    .in('difficulty', difficultyValues)
    .limit(200); // 후보 풀

  // ★ A-2a: 학생이 이미 정답 처리한 문제 제외 (오답 처리한 건 보강 차원에서 다시 권장)
  //   흐름: print_sessions에서 학생 sessionIds → session_results에서 is_correct=true 필터
  const { data: studentSessions } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('id')
    .eq('student_id', studentId);
  const sessionIds = ((studentSessions as Array<{ id: string }>) || []).map((s) => s.id);

  const correctProblemIds = new Set<string>();
  if (sessionIds.length > 0) {
    const { data: graded } = await sb
      .schema('diagnostics' as never)
      .from('session_results')
      .select('problem_id')
      .eq('is_correct', true)
      .in('session_id', sessionIds);
    ((graded as Array<{ problem_id: string }>) || []).forEach((r) => {
      correctProblemIds.add(r.problem_id);
    });
  }

  const candidateIds = ((clsData as Array<{ problem_id: string }>) || [])
    .map((c) => c.problem_id)
    .filter((id) => !correctProblemIds.has(id));

  if (candidateIds.length === 0) {
    return NextResponse.json({
      studentId,
      weakestUnit,
      topPitfalls,
      difficultyRange: [diffLow, diffHigh],
      problems: [],
      message: `${weakestUnit.fullPath} 영역의 난이도 ${diffLow}~${diffHigh} 문항이 문제은행에 부족합니다.`,
    });
  }

  // 5) problems 본문 + problem_pitfalls 일괄 fetch
  const { data: problemsData } = await sb
    .from('problems')
    .select('id, content_latex')
    .in('id', candidateIds);

  const { data: pitfallMatches } = await sb
    .from('problem_pitfalls')
    .select('problem_id, pitfall_code')
    .in('problem_id', candidateIds);

  // mathsecr_types로 typeName 보강
  const uniqueTypeCodes = Array.from(
    new Set(((clsData as Array<{ type_code: string }>) || []).map((c) => c.type_code))
  );
  const { data: typeNames } = await sb
    .from('mathsecr_types')
    .select('code, full_path')
    .in('code', uniqueTypeCodes);
  const typeNameMap = new Map<string, string>();
  ((typeNames as Array<{ code: string; full_path: string }>) || []).forEach((t) => {
    typeNameMap.set(t.code, t.full_path);
  });

  const problemContentMap = new Map<string, string>();
  ((problemsData as Array<{ id: string; content_latex: string }>) || []).forEach((p) => {
    problemContentMap.set(p.id, p.content_latex || '');
  });

  const problemPitfallMap = new Map<string, string[]>();
  ((pitfallMatches as Array<{ problem_id: string; pitfall_code: string }>) || []).forEach((pm) => {
    const cur = problemPitfallMap.get(pm.problem_id) || [];
    cur.push(pm.pitfall_code);
    problemPitfallMap.set(pm.problem_id, cur);
  });

  // 6) 매칭 점수 계산 + 정렬
  const targetPitfallCodes = topPitfalls.map((p) => p.code);
  const recommended: RecommendedProblem[] = ((clsData as Array<{ problem_id: string; type_code: string; difficulty: string }>) || [])
    .map((c) => {
      const problemId = c.problem_id;
      const allPitfalls = problemPitfallMap.get(problemId) || [];
      const matched = allPitfalls.filter((code) => targetPitfallCodes.includes(code));
      const matchScore = matched.length > 0 ? matched.length * 10 + 1 : 0;
      return {
        problemId,
        contentPreview: (problemContentMap.get(problemId) || '').slice(0, 200),
        typeCode: c.type_code,
        typeName: typeNameMap.get(c.type_code) || c.type_code,
        difficulty: parseInt(c.difficulty, 10) || 3,
        matchedPitfalls: matched,
        matchScore,
        reason:
          matched.length > 0
            ? `약점 단원 + 자주 빠지는 함정(${matched.length}개) 매칭`
            : '약점 단원 보강용',
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore || a.difficulty - b.difficulty)
    .slice(0, topN);

  return NextResponse.json({
    studentId,
    weakestUnit,
    topPitfalls,
    difficultyRange: [diffLow, diffHigh],
    candidateCount: candidateIds.length,
    problems: recommended,
  });
}
