// ============================================================================
// GET /api/exams/[examId]/export-hwp?withAnswer=true&withSolutions=false
//
// 시험지(exams) → 편집 가능한 한글(.hwpx) 다운로드. 순수 JS 생성(Vercel 작동, HWP COM 불필요).
// 데이터 조회는 /api/exams/[examId]/print 와 동일 패턴.
//   content_latex(텍스트+LaTeX) → HWP 텍스트런 + 네이티브 수식객체(<hp:equation>).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertExamAccess } from '@/lib/security/institute-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { generateHWPX, type HwpxProblem } from '@/lib/export/hwpx-generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CIRCLED = ['', '①', '②', '③', '④', '⑤'];

function extractAnswerValue(aj: Record<string, unknown>): unknown {
  for (const k of ['correct_answer', 'finalAnswer', 'answer', 'value', 'values']) {
    const v = aj[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// 본문의 ![](crop-url) 도형을 더 나은 렌더본으로 교체
//   우선순위: ai_analysis.upscaledCropUrl > images[figure_crop] > images[crop] > (원본 url)
//   ※ figureSvg/figureData(AI SVG)는 래스터화 필요 — 후속 작업
function resolveFigureContent(
  content: string,
  images: Array<{ url?: string; type?: string }> | null | undefined,
  ai: Record<string, unknown> | null | undefined,
): string {
  const imgs = Array.isArray(images) ? images : [];
  const figureCrops = imgs.filter((i) => i?.type === 'figure_crop' && i.url).map((i) => i.url as string);
  const hasFigure = !!(ai && ai.hasFigure);
  const upscaled = (ai && typeof ai.upscaledCropUrl === 'string') ? ai.upscaledCropUrl : undefined;
  // ★ 실제 "도형"만 — figure_crop 우선, 없으면 (도형 있을 때만) upscaledCropUrl.
  //   type 'crop'(문제 전체 스캔)은 절대 쓰지 않음 — 텍스트까지 통째로 박히는 중복 사고.
  const pool = figureCrops.length > 0 ? figureCrops : (hasFigure && upscaled ? [upscaled] : []);

  let k = 0;
  let hadImg = false;
  let out = (content || '').replace(/!\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g, (_m, url: string) => {
    hadImg = true;
    const best = pool[k] || url; // 인라인 이미지는 이미 도형 크롭 → 더 나은 게 있으면 업그레이드, 없으면 원본 유지
    k++;
    return `![figure](${best})`;
  });
  // 본문에 인라인 도형이 없는데 진짜 도형 소스가 있으면 끝에 추가 (crop 제외라 텍스트 중복 안 생김)
  if (!hadImg && pool.length > 0) out += ` ![figure](${pool[0]})`;
  return out;
}

// 정답 → 한글 본문용 plain 문자열 (객관식 ①~⑤, 그 외 원문)
function plainAnswer(aj: Record<string, unknown>, choices: string[]): string {
  const ans = extractAnswerValue(aj);
  if (ans === undefined) return '';
  const isMC = choices.length >= 2;
  if (typeof ans === 'number' && ans >= 1 && ans <= 5 && isMC) return CIRCLED[ans];
  const s = String(ans).trim();
  if (!s || s === '-') return '';
  if (isMC) {
    if (/^[1-5]$/.test(s)) return CIRCLED[parseInt(s, 10)];
    const m = s.match(/^([①②③④⑤])/);
    if (m) return m[1];
  }
  return s;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const guard = await assertExamAccess(supabaseAdmin, examId, authed.data.scope);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const sb = supabaseAdmin;

  const { searchParams } = new URL(request.url);
  const withAnswer = searchParams.get('withAnswer') !== 'false'; // 기본 true
  const withSolutions = searchParams.get('withSolutions') === 'true';
  // 인쇄 모달 설정 (단 수 / 문제 간격 / N문제 배열)
  const columns: 1 | 2 = searchParams.get('columns') === '1' ? 1 : 2;
  const gapRaw = parseInt(searchParams.get('gap') || '', 10);
  const problemGap = Number.isFinite(gapRaw) && gapRaw > 0 ? gapRaw : undefined;
  const perPageRaw = parseInt(searchParams.get('perPage') || '', 10);
  const perPage = Number.isFinite(perPageRaw) && perPageRaw > 0 ? perPageRaw : undefined;
  // ★ 자동 배열 — 웹 미리보기의 페이지별 문제 수 (예: "5,4,6"). 그리드로 페이지 구성 재현.
  const pageCountsRaw = (searchParams.get('pageCounts') || '')
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 50);
  const pageCounts = pageCountsRaw.length > 0 && pageCountsRaw.length <= 200 ? pageCountsRaw : undefined;

  // 시험지
  const { data: exam, error: examErr } = await sb
    .from('exams')
    .select('id, title, grade, subject, exam_type')
    .eq('id', examId)
    .maybeSingle();
  if (examErr || !exam) {
    return NextResponse.json({ error: '시험지를 찾을 수 없습니다.' }, { status: 404 });
  }

  // exam_problems (순서)
  const { data: epRows } = await sb
    .from('exam_problems')
    .select('sequence_number, points, problem_id')
    .eq('exam_id', examId)
    .order('sequence_number', { ascending: true });

  const problemIds = ((epRows || []) as Array<{ problem_id: string }>).map((r) => r.problem_id);
  if (problemIds.length === 0) {
    return NextResponse.json({ error: '시험지에 문항이 없습니다.' }, { status: 400 });
  }

  // problems 본문 + 도형 소스(images / ai_analysis)
  const { data: problems } = await sb
    .from('problems')
    .select('id, content_latex, answer_json, solution_latex, images, ai_analysis')
    .in('id', problemIds);
  type ProbRow = {
    id: string; content_latex: string; answer_json: Record<string, unknown>; solution_latex: string | null;
    images: Array<{ url?: string; type?: string }> | null; ai_analysis: Record<string, unknown> | null;
  };
  const pMap = new Map<string, ProbRow>();
  ((problems || []) as ProbRow[]).forEach((p) => pMap.set(p.id, p));

  // HwpxProblem[] 매핑
  const hwpProblems: HwpxProblem[] = ((epRows || []) as Array<{ sequence_number: number; problem_id: string; points: number | null }>)
    .map((row) => {
      const p = pMap.get(row.problem_id);
      const aj = (p?.answer_json || {}) as Record<string, unknown>;
      const choices = Array.isArray((aj as { choices?: string[] }).choices) ? (aj as { choices: string[] }).choices : [];
      return {
        number: row.sequence_number,
        content: resolveFigureContent(p?.content_latex || '', p?.images, p?.ai_analysis),
        choices,
        answer: plainAnswer(aj, choices),
        solution: withSolutions ? (p?.solution_latex || undefined) : undefined,
        points: row.points || undefined,
      };
    });

  const examTitle = (exam as { title?: string }).title || '시험지';
  const examGrade = (exam as { grade?: string }).grade || '';
  const examSubject = (exam as { subject?: string }).subject || '';
  const examType = (exam as { exam_type?: string }).exam_type || '';

  // ★ 헤더 표 메타 — exam-management(EditableExamHeader)와 동일 파생 → 화면·PDF·한글 폼 통일.
  //   schoolName 은 제목에서 학교/학원명 추출(페이지와 동일 정규식). teacher/semester/시간 등은 미저장 → 빈칸.
  const schoolMatch = examTitle.match(/([가-힣]{1,6}(?:고|중|초|학원))\d*/);
  const headerMeta = {
    schoolName: schoolMatch ? schoolMatch[1] : '',
    examTitle,
    teacher: '',
    subject: examSubject || '공통수학1',
    semester: '',
    examType: examType || '학교기출',
    grade: examGrade || '고1',
  };

  const buf = (await generateHWPX(hwpProblems, {
    title: examTitle,
    showAnswerSheet: withAnswer,
    showSolutions: withSolutions,
    columns,
    problemGap,
    perPage,
    pageCounts,
    header: headerMeta,
  })) as Buffer;

  const filename = `${examTitle}.hwpx`;
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/hwp+zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(buf.length),
      'Cache-Control': 'no-store',
    },
  });
}
