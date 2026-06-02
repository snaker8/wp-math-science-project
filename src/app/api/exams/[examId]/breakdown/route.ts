// ============================================================================
// GET /api/exams/[examId]/breakdown
//
// 시험지(진단지·일반 학원자료) 의 problems 를 mathsecr 분류 코드 기반으로
// 계층 트리(대단원 → 중단원 → 소단원 → 세부유형) 로 그룹핑하여 반환.
// 학원자료 페이지 우측 패널에서 단원·주제별로 골라 새 시험지로 출제하는 데 사용.
//
// 응답:
//   {
//     examId, title,
//     totalProblems,
//     groups: [
//       { code: "MS06-01", level: 1, name: "다항식의 연산",
//         problemCount: 14, problemIds: [...],
//         difficultyDist: { 1: 3, 2: 4, 3: 2, 4: 3, 5: 2 },
//         children: [
//           { code: "MS06-01-03", level: 2, name: "곱셈공식", ... children: [...] }
//         ]
//       },
//       ...
//     ]
//   }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertExamAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

interface BreakdownGroup {
  code: string;
  level: 1 | 2 | 3 | 4;
  name: string;
  problemCount: number;
  problemIds: string[];
  difficultyDist: Record<string, number>;
  children: BreakdownGroup[];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const sb = supabaseAdmin;

  const { examId } = await params;

  // ★ exam 격리 — 다른 학원 시험지 단원/분류 트리 read 차단 (공통풀 NULL 은 통과)
  const exGuard = await assertExamAccess(sb, examId, scope);
  if (!exGuard.ok) return NextResponse.json({ error: exGuard.error }, { status: exGuard.status });

  // 1) exam 메타 (title 등)
  const { data: exam, error: examErr } = await sb
    .from('exams')
    .select('id, title, grade, subject')
    .eq('id', examId)
    .maybeSingle();
  if (examErr || !exam) {
    return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
  }

  // 2) exam_problems → problemIds + sequence
  const { data: epRows, error: epErr } = await sb
    .from('exam_problems')
    .select('problem_id, sequence_number')
    .eq('exam_id', examId)
    .order('sequence_number', { ascending: true });
  if (epErr) {
    return NextResponse.json({ error: epErr.message }, { status: 500 });
  }
  const problemIds = (epRows || []).map((r: { problem_id: string }) => r.problem_id);
  if (problemIds.length === 0) {
    return NextResponse.json({
      examId,
      title: exam.title,
      grade: exam.grade,
      subject: exam.subject,
      totalProblems: 0,
      groups: [],
    });
  }

  // 3) classifications — type_code (mathsecr) + difficulty
  //    1000+ rows pagination 필요 (메모리 feedback_supabase_select_limit.md)
  const classByProblem = new Map<string, { typeCode: string | null; difficulty: number | null }>();
  const PAGE = 1000;
  for (let from = 0; from < problemIds.length; from += PAGE) {
    const slice = problemIds.slice(from, from + PAGE);
    const { data: classRows } = await sb
      .from('classifications')
      .select('problem_id, type_code, difficulty')
      .in('problem_id', slice);
    (classRows || []).forEach((r: { problem_id: string; type_code: string | null; difficulty: number | null }) => {
      // 같은 problem_id 가 여러 행 있을 수 있음 → 마지막(최신)만 유지하는 식으로
      classByProblem.set(r.problem_id, { typeCode: r.type_code, difficulty: r.difficulty });
    });
  }

  // 4) mathsecr_types — code → full_path 룩업
  const allCodes = new Set<string>();
  for (const cls of classByProblem.values()) {
    if (cls.typeCode && cls.typeCode.startsWith('MS')) {
      // 모든 prefix 도 포함 (대단원·중단원·소단원·세부유형)
      const segments = cls.typeCode.split('-');
      for (let len = 2; len <= segments.length; len++) {
        allCodes.add(segments.slice(0, len).join('-'));
      }
    }
  }
  const codeToName = new Map<string, string>();
  if (allCodes.size > 0) {
    const codeArr = Array.from(allCodes);
    for (let from = 0; from < codeArr.length; from += PAGE) {
      const slice = codeArr.slice(from, from + PAGE);
      const { data: msRows } = await sb
        .from('mathsecr_types')
        .select('code, full_path')
        .in('code', slice);
      (msRows || []).forEach((r: { code: string; full_path: string }) => {
        codeToName.set(r.code, r.full_path || r.code);
      });
    }
  }

  // 5) 트리 빌드 — code prefix 별로 그룹화
  //    트리 노드: code (전체) → level (segment count - 1) → name (full_path 의 마지막 segment)
  type Node = BreakdownGroup;
  const rootChildren = new Map<string, Node>();

  // helper: full_path 의 *마지막 세그먼트* 만 추출 (full_path 는 ">" 구분)
  const lastSegmentName = (fullPath: string | undefined, fallbackCode: string): string => {
    if (!fullPath) return fallbackCode;
    const parts = fullPath.split('>').map((s) => s.trim()).filter(Boolean);
    return parts[parts.length - 1] || fullPath;
  };

  for (const pid of problemIds) {
    const cls = classByProblem.get(pid);
    if (!cls?.typeCode || !cls.typeCode.startsWith('MS')) continue;
    const segments = cls.typeCode.split('-');
    if (segments.length < 2) continue;
    const difficulty = cls.difficulty != null ? String(cls.difficulty) : 'unknown';

    // segments[0] = "MS07" (subject 헤더 — 트리 root 스킵), segments[1] = 대단원, ...
    let parentChildren = rootChildren;
    for (let len = 2; len <= segments.length; len++) {
      const code = segments.slice(0, len).join('-');
      const level = (len - 1) as 1 | 2 | 3 | 4;
      let node = parentChildren.get(code);
      if (!node) {
        node = {
          code,
          level,
          name: lastSegmentName(codeToName.get(code), code),
          problemCount: 0,
          problemIds: [],
          difficultyDist: {},
          children: [],
        };
        parentChildren.set(code, node);
      }
      node.problemCount += 1;
      node.problemIds.push(pid);
      node.difficultyDist[difficulty] = (node.difficultyDist[difficulty] || 0) + 1;

      // 다음 레벨 children 으로 내려가기 위해 Map 으로 변환된 children 보관
      // children 자체는 array 라 lookup 위해 별도 Map 필요
      if (!('childMap' in node)) {
        (node as Node & { childMap: Map<string, Node> }).childMap = new Map();
      }
      parentChildren = (node as Node & { childMap: Map<string, Node> }).childMap;
    }
  }

  // childMap → children array 정렬·flatten
  const finalize = (map: Map<string, Node>): Node[] => {
    const arr = Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
    for (const node of arr) {
      const cm = (node as Node & { childMap?: Map<string, Node> }).childMap;
      if (cm) {
        node.children = finalize(cm);
        delete (node as Node & { childMap?: Map<string, Node> }).childMap;
      }
    }
    return arr;
  };
  const groups = finalize(rootChildren);

  return NextResponse.json({
    examId,
    title: exam.title,
    grade: exam.grade,
    subject: exam.subject,
    totalProblems: problemIds.length,
    classifiedCount: classByProblem.size,
    groups,
  });
}
