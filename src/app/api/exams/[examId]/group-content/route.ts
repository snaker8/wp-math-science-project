// ============================================================================
// GET /api/exams/[examId]/group-content
//   현재 시험지와 같은 book_group 에 속한 (1) 다른 시험지 목록(통째 합치기용)
//   과 (2) 그 시험지들에 든 문제 목록(개별 추가용)을 반환.
//   "문제 추가 — 같은 그룹" 모달용. institute 격리 가드 적용.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

const MAX_PROBLEMS = 800; // 그룹 문제 상한 (.in 1000 limit 안전 마진)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  // 현재 시험지 — book_group_id + institute 가드
  const { data: exam } = await supabaseAdmin
    .from('exams')
    .select('id, book_group_id, institute_id')
    .eq('id', examId)
    .maybeSingle();
  if (!exam) return NextResponse.json({ error: '시험지를 찾을 수 없습니다' }, { status: 404 });
  const examInstituteId = (exam as { institute_id: string | null }).institute_id;
  // ★ 공통풀(institute_id=NULL)은 모두 접근 가능 → assert 생략. 특정 institute 만 검증.
  if (examInstituteId !== null) {
    try {
      assertInstituteAccess(scope, examInstituteId);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const groupId = (exam as { book_group_id: string | null }).book_group_id;
  if (!groupId) {
    return NextResponse.json({ groupId: null, exams: [], problems: [] });
  }

  // 같은 그룹의 다른 살아있는 시험지 — 현재 시험지와 같은 격리(공통=NULL 포함)로 필터.
  //   ★ 그룹 시험지는 대부분 공통풀(NULL)이라, applyInstituteFilter(allowCommonPool 없음)는
  //     NULL 을 전부 제외해 빈 목록이 되던 버그. 현재 시험지의 institute_id 로 직접 매칭.
  let sibQ = supabaseAdmin
    .from('exams')
    .select('id, title, created_at')
    .eq('book_group_id', groupId)
    .is('deleted_at', null)
    .neq('id', examId);
  sibQ = examInstituteId === null ? sibQ.is('institute_id', null) : sibQ.eq('institute_id', examInstituteId);
  const { data: sibExams } = await sibQ.order('created_at', { ascending: false });
  const exams = (sibExams || []) as Array<{ id: string; title: string }>;
  if (exams.length === 0) {
    return NextResponse.json({ groupId, exams: [], problems: [] });
  }

  // 형제 시험지 ↔ 문제 매핑
  const { data: eps } = await supabaseAdmin
    .from('exam_problems')
    .select('exam_id, problem_id, sequence_number')
    .in('exam_id', exams.map((e) => e.id))
    .order('sequence_number', { ascending: true });

  const examProblemIds = new Map<string, string[]>();
  const allProblemIds: string[] = [];
  for (const r of (eps || []) as Array<{ exam_id: string; problem_id: string }>) {
    if (!examProblemIds.has(r.exam_id)) examProblemIds.set(r.exam_id, []);
    examProblemIds.get(r.exam_id)!.push(r.problem_id);
    if (!allProblemIds.includes(r.problem_id)) allProblemIds.push(r.problem_id);
  }

  // 현재 시험지에 이미 있는 문제 (alreadyInExam 표시)
  const { data: curEps } = await supabaseAdmin
    .from('exam_problems')
    .select('problem_id')
    .eq('exam_id', examId);
  const inCurrent = new Set((curEps || []).map((r: { problem_id: string }) => r.problem_id));

  // 문제 상세 (left join classifications — HML 등 미분류 문제도 포함)
  const probIdsToFetch = allProblemIds.slice(0, MAX_PROBLEMS);
  const { data: problems } = await supabaseAdmin
    .from('problems')
    .select('id, content_latex, answer_json, source_name, source_year, images, classifications(type_code, expanded_type_code, difficulty, cognitive_domain)')
    .in('id', probIdsToFetch);

  const probMap = new Map((problems || []).map((p: any) => [p.id, p]));

  // 유형명 매핑 (mathsecr / expanded)
  const allTypeCodes = [...new Set(
    (problems || []).flatMap((p: any) => (p.classifications || []).flatMap((c: any) => [c.type_code, c.expanded_type_code].filter(Boolean)))
  )] as string[];
  const typeNameMap = new Map<string, string>();
  if (allTypeCodes.length > 0) {
    const msCodes = allTypeCodes.filter((c) => c.startsWith('MS'));
    if (msCodes.length > 0) {
      const { data: t } = await supabaseAdmin.from('mathsecr_types').select('type_code, type_name').in('type_code', msCodes);
      (t || []).forEach((x: any) => typeNameMap.set(x.type_code, x.type_name));
    }
    const maCodes = allTypeCodes.filter((c) => c.startsWith('MA'));
    if (maCodes.length > 0) {
      const { data: t } = await supabaseAdmin.from('expanded_math_types').select('type_code, type_name').in('type_code', maCodes);
      (t || []).forEach((x: any) => typeNameMap.set(x.type_code, x.type_name));
    }
  }

  const mappedProblems = probIdsToFetch
    .map((id) => probMap.get(id))
    .filter(Boolean)
    .map((p: any) => {
      const cls = p.classifications?.[0] || {};
      return {
        id: p.id,
        content: p.content_latex || '',
        answer: p.answer_json,
        source: p.source_name || '',
        year: p.source_year || '',
        typeCode: cls.type_code || '',
        typeName: typeNameMap.get(cls.expanded_type_code || '') || typeNameMap.get(cls.type_code || '') || cls.type_code || '',
        difficulty: cls.difficulty || 0,
        cognitiveDomain: cls.cognitive_domain || '',
        alreadyInExam: inCurrent.has(p.id),
        images: p.images || [],
      };
    });

  const examsOut = exams.map((e) => ({
    id: e.id,
    title: e.title,
    problemIds: examProblemIds.get(e.id) || [],
    problemCount: (examProblemIds.get(e.id) || []).length,
  }));

  return NextResponse.json({ groupId, exams: examsOut, problems: mappedProblems });
}
