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
import { rasterizeSvg } from '@/lib/vision/svg-raster';
import { createHash } from 'node:crypto';

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

// 본문의 도형 자리(![](url) · [도형…] 마커)를 화면(FigureRenderer/ExamProblemRenderer)과 **같은 순서**의 그림으로 채운다.
//   첫 도형: ai_analysis.upscaledCropUrl(교체·업스케일·재작성) > figureSvg(AI SVG → 서버 래스터 PNG) > images[figure_crop][0]
//   추가 도형: images[figure_crop][1..]
//   2026-10-08 대표: "한글로 들어갈 때 교체된 이미지가 안 들어간다" — 종전엔 figure_crop 원본을 먼저 집어 교체본이 빠졌고 SVG 는 통째로 빠졌다.
//   type 'crop'(문제 전체 스캔)은 절대 쓰지 않음 — 텍스트까지 통째로 박히는 중복 사고.
async function rasterizeSvgToUrl(svg: string, problemId: string): Promise<string | undefined> {
  if (!supabaseAdmin) return undefined;
  try {
    const png = await rasterizeSvg(svg, { width: 1000 });
    if (!png) return undefined;
    const hash = createHash('sha1').update(svg).digest('hex').slice(0, 10);
    const path = `problem-crops/hwpx-svg/${problemId}-${hash}.png`;
    const { error } = await supabaseAdmin.storage.from('source-files').upload(path, png, { contentType: 'image/png', upsert: true });
    if (error) { console.warn('[export-hwp] SVG 래스터 업로드 실패:', error.message); return undefined; }
    return supabaseAdmin.storage.from('source-files').getPublicUrl(path).data?.publicUrl || undefined;
  } catch (e) {
    console.warn('[export-hwp] SVG 래스터 실패:', e instanceof Error ? e.message : e);
    return undefined;
  }
}

/** `$` 가 홀수면 고아 하나를 걷는다 — 끝/앞의 `$` 우선, 아니면 마지막 `$`. (한글 변환 'dollar' 경고 차단, 2026-10-08) */
function fixOddDollar(s: string): string {
  if (!s) return s;
  const n = (s.match(/\$/g) || []).length;
  if (n % 2 === 0) return s;
  const t = s.trimEnd();
  if (t.endsWith('$')) return t.slice(0, -1);
  if (s.trimStart().startsWith('$')) return s.replace(/^\s*\$/, '');
  const i = s.lastIndexOf('$');
  return s.slice(0, i) + s.slice(i + 1);
}

async function resolveFigureContent(
  content: string,
  images: Array<{ url?: string; type?: string }> | null | undefined,
  ai: Record<string, unknown> | null | undefined,
  problemId: string,
): Promise<string> {
  const imgs = Array.isArray(images) ? images : [];
  const figureCrops = imgs.filter((i) => i?.type === 'figure_crop' && i.url).map((i) => i.url as string);
  const hasFigure = !!(ai && ai.hasFigure);
  const upscaled = (ai && typeof ai.upscaledCropUrl === 'string' && ai.upscaledCropUrl) ? (ai.upscaledCropUrl as string) : undefined;
  const svg = (ai && typeof ai.figureSvg === 'string' && (ai.figureSvg as string).includes('<svg')) ? (ai.figureSvg as string) : undefined;

  // ★ 화면용 프록시 경로(/api/storage/image?path=…)는 서버가 못 받는다 → 공개 Storage 주소로 (업스케일·재작성 이미지가 이 꼴)
  const toPublic = (u: string): string => {
    const m = u.match(/^\/api\/storage\/image\?path=([^&]+)/);
    if (!m || !supabaseAdmin) return u;
    return supabaseAdmin.storage.from('source-files').getPublicUrl(decodeURIComponent(m[1])).data?.publicUrl || u;
  };
  let first: string | undefined = upscaled ? toPublic(upscaled) : undefined;
  if (!first && svg && hasFigure) first = await rasterizeSvgToUrl(svg, problemId);
  if (!first) first = figureCrops[0];
  const pool: string[] = [];
  if (first) pool.push(first);
  for (const u of figureCrops.slice(1).map(toPublic)) if (!pool.includes(u)) pool.push(u);

  let k = 0;
  let hadMarker = false;
  // 1) 인라인 ![…](url) — 그 자리의 도형을 pool 순서로 업그레이드(없으면 원본 유지)
  let out = (content || '').replace(/!\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g, (_m, url: string) => {
    hadMarker = true;
    const best = pool[k] || url; k++;
    return `![figure](${best})`;
  });
  // 2) [도형] / [도형:left:40%] 마커 — pool 순서로 그림, 남는 마커는 제거
  out = out.replace(/\[도형(?::\w+[-\w]*)?(?::\d+%?)?\]/g, () => {
    hadMarker = true;
    const u = pool[k]; k++;
    return u ? ` ![figure](${u}) ` : ' ';
  });
  // 3) 자리가 하나도 없는데 그림이 있으면 끝에 추가
  if (!hadMarker && pool.length > 0) out += ' ' + pool.map((u) => `![figure](${u})`).join(' ');
  return fixOddDollar(out);
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
  // 헤더 디자인 — 갤러리 강조색·테마 (한글 네이티브 3종으로 매핑: line/double/색띠)
  const headerColorRaw = searchParams.get('headerColor') || '';
  const accentColor = /^#[0-9a-fA-F]{6}$/.test(headerColorRaw) ? headerColorRaw : undefined;
  const headerThemeRaw = (searchParams.get('headerTheme') || '').slice(0, 20);
  const headerTheme = /^[a-z]{1,20}$/.test(headerThemeRaw) ? headerThemeRaw : undefined;
  // 한글 헤더 구조 선택 (에디토리얼/클래식/박스형/모의고사형/밴드형)
  const styleRaw = searchParams.get('headerStyle') || '';
  const headerStyle = (['editorial', 'classic', 'boxed', 'mock', 'band'] as const).find((s) => s === styleRaw);

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
  const hwpProblems: HwpxProblem[] = await Promise.all(((epRows || []) as Array<{ sequence_number: number; problem_id: string; points: number | null }>)
    .map(async (row) => {
      const p = pMap.get(row.problem_id);
      const aj = (p?.answer_json || {}) as Record<string, unknown>;
      const choices = (Array.isArray((aj as { choices?: string[] }).choices) ? (aj as { choices: string[] }).choices : []).map(fixOddDollar);
      return {
        number: row.sequence_number,
        content: await resolveFigureContent(p?.content_latex || '', p?.images, p?.ai_analysis, row.problem_id),
        choices,
        answer: plainAnswer(aj, choices),
        solution: withSolutions ? (p?.solution_latex ? fixOddDollar(p.solution_latex) : undefined) : undefined,
        points: row.points || undefined,
      };
    }));
  // ★ debug=1 — 파일 대신 문제 매핑(JSON) 반환: 어떤 그림 URL 이 들어가는지 확인용 (인증 필요)
  if (request.nextUrl.searchParams.get('debug') === '1') {
    return NextResponse.json({ problems: hwpProblems.map((h) => ({ number: h.number, figures: [...h.content.matchAll(/!\[figure\]\(([^)]+)\)/g)].map((m) => m[1]), dollarOdd: ((h.content.match(/\$/g) || []).length % 2) === 1 })) });
  }

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
    accentColor,
    headerTheme,
    headerStyle,
  };

  // ★ 검증 루프 — 잔재 경고 수집 (파일은 생성, 경고는 헤더+서버 로그로)
  let artifactWarnings: Array<{ kind: string; sample: string; count: number }> = [];
  const buf = (await generateHWPX(hwpProblems, {
    title: examTitle,
    showAnswerSheet: withAnswer,
    showSolutions: withSolutions,
    columns,
    problemGap,
    perPage,
    pageCounts,
    header: headerMeta,
    onWarnings: (w) => { artifactWarnings = w; },
  })) as Buffer;
  if (artifactWarnings.length > 0) {
    console.warn(`[export-hwp] 잔재 경고 (${examTitle}):`, JSON.stringify(artifactWarnings));
  }

  const filename = `${examTitle}.hwpx`;
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/hwp+zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(buf.length),
      'Cache-Control': 'no-store',
      // 검증 루프 — 잔재 경고 요약 (클라이언트가 읽어 표시). ASCII 안전 형태로.
      ...(artifactWarnings.length > 0
        ? { 'X-Hwpx-Warnings': encodeURIComponent(artifactWarnings.map((w) => `${w.kind}x${w.count}`).join(',')) }
        : {}),
    },
  });
}
