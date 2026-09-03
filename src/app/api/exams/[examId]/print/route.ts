// ============================================================================
// GET /api/exams/[examId]/print?variant=teacher|student&withAnswer=true|false
//
// 시험지(exams) 단위 인쇄용 HTML 반환. 사용자가 브라우저 인쇄(Ctrl+P) → PDF 저장.
// /api/sessions/[id]/pdf 패턴 그대로, sessions 특정 부분(QR·학생명·O/X) 제거.
//
// variant:
//   teacher — 각 문항 옆 [MS코드 · ★난이도] 라벨 표시
//   student — 라벨 제거 (학생 배포용 깔끔)
// withAnswer:
//   true  — 본문 뒤에 빠른정답 표 + 해설지 페이지 추가 (강사 채점용)
//   false — 본문만 (기본)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertExamAccess } from '@/lib/security/institute-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import katex from 'katex';
import { balanceLatex } from '@/components/shared/latex-balance';

export const dynamic = 'force-dynamic';

const KATEX_CSS_CDN = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// 정답 추출 + 렌더 헬퍼 (cloud/[examId]/page.tsx formatAnswer 로직 서버 이식)
// ============================================================================

const CIRCLED_NUMS = ['', '①', '②', '③', '④', '⑤'];

function extractAnswerValue(answerJson: Record<string, unknown>): unknown {
  const candidates = ['correct_answer', 'finalAnswer', 'answer', 'value', 'values'];
  for (const key of candidates) {
    const v = answerJson[key];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/**
 * 복수정답("모두 고르기"형) 표시 — "③④"/"③, ④" → "③④".
 *   isMC 일 때만 "3,4" 같은 숫자+구분자도 원형숫자로 변환. 단일/주관식이면 null → 기존 단일 처리.
 */
function multiObjectiveKey(str: string, isMC: boolean): string | null {
  let nums: number[] = [];
  const circled = str.match(/[①②③④⑤]/g);
  if (circled && circled.length) {
    nums = circled.map((c) => '①②③④⑤'.indexOf(c) + 1);
  } else if (isMC && /^[1-5]\s*번?(?:[\s,，、]+[1-5]\s*번?)+$/.test(str.trim())) {
    nums = (str.match(/[1-5]/g) || []).map(Number);
  }
  const uniq = Array.from(new Set(nums)).filter((n) => n >= 1 && n <= 5).sort((a, b) => a - b);
  return uniq.length >= 2 ? uniq.map((n) => CIRCLED_NUMS[n]).join('') : null;
}

function formatAnswerToHtml(
  answerJson: Record<string, unknown>,
  choices: string[]
): string {
  const ans = extractAnswerValue(answerJson);
  if (ans === undefined) return '<span class="empty-ans">-</span>';
  const isMC = choices.length >= 2;

  if (typeof ans === 'number' && ans >= 1 && ans <= 5 && isMC) return CIRCLED_NUMS[ans];

  const str = String(ans).trim();
  if (!str || str === '-') return '<span class="empty-ans">-</span>';

  if (isMC) {
    // 복수정답("모두 고르기"형) — "③④"/"3,4" → "③④" 모두 표시
    const multi = multiObjectiveKey(str, true);
    if (multi) return multi;
    if (/^[1-5]$/.test(str)) return CIRCLED_NUMS[parseInt(str, 10)];
    if (/^[①②③④⑤]$/.test(str)) return str;
    const circledPrefix = str.match(/^([①②③④⑤])/);
    if (circledPrefix) return circledPrefix[1];
    const sameParen = str.match(/^\s*([1-5])\s*\(\s*([1-5])\s*번\s*\)\s*$/);
    if (sameParen && sameParen[1] === sameParen[2]) return CIRCLED_NUMS[parseInt(sameParen[1], 10)];
    const verboseParen = str.match(/^\s*([1-5])\s*\(\s*(?:정답\s*)?(?:번호\s*[:：]?\s*)?([1-5])\s*\)\s*$/);
    if (verboseParen && verboseParen[1] === verboseParen[2]) return CIRCLED_NUMS[parseInt(verboseParen[1], 10)];
    const banOnly = str.match(/^\s*\(?\s*([1-5])\s*\)?\s*번\s*$/);
    if (banOnly) return CIRCLED_NUMS[parseInt(banOnly[1], 10)];
  }

  // 단답·서답 — 길면 결론부 추출
  let display = str;
  // ★ 다부분 서답형((1)(2)(3))·여러 줄·연립({cases}) 답은 결론부 추출/$강제래핑이
  //   답을 망가뜨린다 (예: "...y=125$ (3) 빨래..."에서 "125$ (3)..."만 잘려 + 닫는 $ 고아).
  //   → 구조형이면 추출/래핑 모두 건너뛰고 원문 그대로 렌더.
  const isMultiPart =
    /\(\s*[1-9]\s*\)[\s\S]*\(\s*[2-9]\s*\)/.test(str) ||
    /\n/.test(str) ||
    /\\begin\{(?:cases|aligned|array)\}/.test(str);
  if (!isMultiPart) {
    const tailEq = str.match(/=\s*([^=]+?)\s*(?:이다\s*[.]?|입니다\s*[.]?|\.?)\s*$/);
    const conclusion = str.match(
      /(?:따라서|그러므로|∴|답은|정답은|최종\s*답은?)\s*([^.]+?)(?:\s*이다\s*[.]?|\s*입니다\s*[.]?|\.?)\s*$/
    );
    if (str.length > 40 && tailEq && tailEq[1].trim().length < 40) {
      display = tailEq[1].trim();
    } else if (str.length > 40 && conclusion && conclusion[1].trim().length < 40) {
      display = conclusion[1].trim();
    }

    // 수식 자동 래핑 (KaTeX 렌더링 보장)
    const hasDollar = /\$/.test(display);
    const looksLikeMath =
      /[\\^_{}]|\\frac|\\sqrt|\\dfrac|[a-zA-Z]\s*[=+\-*/]|[0-9]+\s*[+\-*/]\s*[0-9]/.test(display);
    if (!hasDollar && looksLikeMath) {
      display = `$${display}$`;
    }
  }
  return renderMixedContent(display);
}

function renderMixedContent(raw: string): string {
  if (!raw) return '';
  let s = raw
    .replace(/\\\[(.+?)\\\]/gs, (_m, inner: string) => `$$${inner.trim()}$$`)
    .replace(/\\\((.+?)\\\)/gs, (_m, inner: string) => `$${inner.trim()}$`);
  const parts: string[] = [];
  let idx = 0;
  const re = /\$\$([\s\S]+?)\$\$|\$([^\n$]+?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const before = s.substring(idx, m.index);
    if (before) parts.push(escapeHtml(before).replace(/\n/g, '<br/>'));
    const isBlock = m[1] !== undefined;
    // ★ % 는 TeX 주석 문자 — 수식 안 % 가 뒤를 통째로 주석 처리하던 사고. \% 로 이스케이프. (2026-06-20)
    const tex = (m[1] ?? m[2] ?? '').trim().replace(/(?<!\\)%/g, '\\%');
    // ★ 짝 안 맞는 \left/\right·중괄호 복구 — throwOnError:false 라 catch 가 안 타고
    //   빨간 raw 로 인쇄되던 것 차단. 짝 맞으면 no-op. (2026-09-02)
    const texSafe = balanceLatex(tex);
    try {
      parts.push(
        katex.renderToString(texSafe, {
          displayMode: isBlock,
          throwOnError: false,
          strict: 'ignore',
          trust: true,
        })
      );
    } catch {
      parts.push(`<span class="katex-error">${escapeHtml(tex)}</span>`);
    }
    idx = m.index + m[0].length;
  }
  const tail = s.substring(idx);
  if (tail) parts.push(escapeHtml(tail).replace(/\n/g, '<br/>'));
  return parts.join('');
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
  const variant = searchParams.get('variant') === 'teacher' ? 'teacher' : 'student';
  const withAnswer = searchParams.get('withAnswer') === 'true';
  // ★ 단원·주제별 부분 인쇄 — exam_problems 중 일부만 필터.
  //   학원자료 페이지에서 진단지 [+ 출제] 클릭 시 사용.
  const onlyProblemIdsParam = searchParams.get('onlyProblemIds') || '';
  const onlyProblemIds = onlyProblemIdsParam
    ? new Set(onlyProblemIdsParam.split(',').map((s) => s.trim()).filter(Boolean))
    : null;
  const subtitle = (searchParams.get('subtitle') || '').trim();

  // 시험지 조회
  const { data: exam, error: examErr } = await sb
    .from('exams')
    .select('id, title, grade, subject, total_points')
    .eq('id', examId)
    .maybeSingle();

  if (examErr || !exam) {
    return new NextResponse(`<p>시험지를 찾을 수 없습니다.</p>`, {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // exam_problems + 본문
  const { data: rawEpRows } = await sb
    .from('exam_problems')
    .select('sequence_number, points, problem_id')
    .eq('exam_id', examId)
    .order('sequence_number', { ascending: true });

  // onlyProblemIds 필터 적용 (단원·주제별 부분 인쇄)
  const epRows = onlyProblemIds
    ? ((rawEpRows || []) as Array<{ problem_id: string }>).filter((r) => onlyProblemIds.has(r.problem_id))
    : (rawEpRows || []);

  const problemIds = ((epRows || []) as Array<{ problem_id: string }>).map((r) => r.problem_id);

  const { data: problems } =
    problemIds.length > 0
      ? await sb.from('problems').select('id, content_latex, answer_json, solution_latex').in('id', problemIds)
      : { data: [] as Array<{ id: string; content_latex: string; answer_json: Record<string, unknown>; solution_latex: string | null }> };
  const problemMap = new Map<
    string,
    { content_latex: string; answer_json: Record<string, unknown>; solution_latex: string | null }
  >();
  ((problems || []) as Array<{ id: string; content_latex: string; answer_json: Record<string, unknown>; solution_latex: string | null }>).forEach(
    (p) => problemMap.set(p.id, { content_latex: p.content_latex, answer_json: p.answer_json, solution_latex: p.solution_latex })
  );

  // classifications (라벨용)
  const { data: clsRows } =
    problemIds.length > 0
      ? await sb
          .from('classifications')
          .select('problem_id, type_code, difficulty')
          .in('problem_id', problemIds)
      : { data: [] as Array<{ problem_id: string; type_code: string; difficulty: string }> };
  const clsMap = new Map<string, { type_code: string; difficulty: string }>();
  ((clsRows || []) as Array<{ problem_id: string; type_code: string; difficulty: string }>).forEach(
    (c) => clsMap.set(c.problem_id, { type_code: c.type_code, difficulty: c.difficulty })
  );

  // 문항 HTML 조립
  const items = ((epRows || []) as Array<{ sequence_number: number; problem_id: string; points: number | null }>)
    .map((row) => {
      const p = problemMap.get(row.problem_id);
      const content = p?.content_latex || '';
      const answerJson = p?.answer_json || {};
      const choices = Array.isArray((answerJson as { choices?: string[] }).choices)
        ? ((answerJson as { choices: string[] }).choices)
        : [];
      const cls = clsMap.get(row.problem_id);

      const contentHtml = renderMixedContent(content);
      const choicesHtml =
        choices.length > 0
          ? `<div class="choices">${choices
              .map(
                (c, i) =>
                  `<span class="choice">${['①', '②', '③', '④', '⑤'][i] || ''} ${renderMixedContent(c)}</span>`
              )
              .join('')}</div>`
          : '';

      const teacherBadge =
        variant === 'teacher' && cls
          ? `<span class="badge">${escapeHtml(cls.type_code || '')}${cls.difficulty ? ` · ★${escapeHtml(cls.difficulty)}` : ''}</span>`
          : '';

      const pointsLabel =
        row.points && row.points > 0
          ? `<span class="points">[${row.points}점]</span>`
          : '';

      return `
        <article class="problem">
          <div class="problem-head">
            <span class="num">${row.sequence_number}.</span>
            ${teacherBadge}
            ${pointsLabel}
          </div>
          <div class="problem-body">
            ${contentHtml}
            ${choicesHtml}
          </div>
        </article>
      `;
    })
    .join('');

  // ★ 정답표·해설지 (withAnswer=true 일 때만)
  let answerKeyHtml = '';
  let solutionSheetHtml = '';
  if (withAnswer) {
    const epRowsArr = (epRows || []) as Array<{
      sequence_number: number;
      problem_id: string;
      points: number | null;
    }>;
    const half = Math.ceil(epRowsArr.length / 2);
    const rows: string[] = [];
    for (let i = 0; i < half; i++) {
      const left = epRowsArr[i];
      const right = epRowsArr[i + half];
      const buildAnsCell = (
        row: { problem_id: string } | undefined
      ): string => {
        if (!row) return '';
        const p = problemMap.get(row.problem_id);
        const aj = (p?.answer_json || {}) as Record<string, unknown>;
        const choices = Array.isArray((aj as { choices?: string[] }).choices)
          ? ((aj as { choices: string[] }).choices)
          : [];
        const html = formatAnswerToHtml(aj, choices);
        // 서답형(객관식 아님)은 다줄 답이 들어갈 수 있어 세로 여유를 준다.
        //   답이 실제로 있을 때만 — 빈칸('-')은 콤팩트하게 둔다.
        if (choices.length < 2 && !html.includes('empty-ans')) {
          return `<div class="sa-room">${html}</div>`;
        }
        return html;
      };
      rows.push(`
        <tr>
          <td class="num-cell">${left ? left.sequence_number : ''}</td>
          <td class="ans-cell">${buildAnsCell(left)}</td>
          <td class="num-cell">${right ? right.sequence_number : ''}</td>
          <td class="ans-cell">${buildAnsCell(right)}</td>
        </tr>
      `);
    }
    answerKeyHtml = `
      <section class="answer-key">
        <h2>빠른정답</h2>
        <table class="answer-table">
          <thead>
            <tr>
              <th>문항</th><th>정답</th><th>문항</th><th>정답</th>
            </tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </section>
    `;

    const solutionItems = epRowsArr
      .map((row) => {
        const p = problemMap.get(row.problem_id);
        const sol = (p?.solution_latex || '').trim();
        if (!sol || sol.length < 30) {
          return `
            <article class="solution">
              <div class="solution-num">${row.sequence_number}.</div>
              <div class="solution-body empty">해설 미생성 — 일괄해설 실행 필요</div>
            </article>
          `;
        }
        return `
          <article class="solution">
            <div class="solution-num">${row.sequence_number}.</div>
            <div class="solution-body">${renderMixedContent(sol)}</div>
          </article>
        `;
      })
      .join('');
    solutionSheetHtml = `
      <section class="solution-sheet">
        <h2>해설</h2>
        ${solutionItems || '<p>문항이 없습니다.</p>'}
      </section>
    `;
  }

  const examTitle = (exam as { title?: string }).title || '시험지';
  const examGrade = (exam as { grade?: string }).grade || '';
  const examSubject = (exam as { subject?: string }).subject || '';
  const headerLabel = [examGrade, examSubject].filter(Boolean).join(' · ');
  const totalPts = (exam as { total_points?: number }).total_points || 0;
  const probCount = (exam as { problem_count?: number }).problem_count || problemIds.length;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(examTitle)}</title>
<link rel="stylesheet" href="${KATEX_CSS_CDN}" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: 'Pretendard', 'Noto Sans KR', -apple-system, sans-serif; color: #111; background: #fff; }
  .page { max-width: 210mm; margin: 0 auto; padding: 14mm 12mm; }
  header.print-header {
    border-bottom: 2px solid #111;
    padding-bottom: 8px;
    margin-bottom: 14px;
  }
  header.print-header .meta { font-size: 12px; color: #333; }
  header.print-header .title { font-size: 18px; font-weight: 800; margin-top: 4px; }
  header.print-header .stats { font-size: 11px; color: #666; margin-top: 4px; }
  header.print-header .name-line {
    margin-top: 12px; display: flex; gap: 18px; font-size: 12px;
  }
  header.print-header .name-line .field {
    flex: 1; border-bottom: 1px solid #999; padding-bottom: 2px;
  }
  .controls {
    margin-bottom: 14px; padding: 8px 10px;
    background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;
    font-size: 11px; color: #555;
    display: flex; justify-content: space-between; align-items: center;
  }
  .controls .links { display: flex; gap: 8px; }
  .controls a, .controls button {
    border: 1px solid #333; background: #fff; color: #111;
    padding: 4px 10px; font-size: 11px; border-radius: 3px; cursor: pointer;
    text-decoration: none;
  }
  .controls button.primary { background: #111; color: #fff; }
  .problem {
    padding: 10px 0 12px;
    border-bottom: 1px dashed #ddd;
    page-break-inside: avoid;
  }
  .problem:last-child { border-bottom: none; }
  .problem-head {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin-bottom: 6px;
  }
  .problem-head .num { font-size: 14px; font-weight: 800; }
  .problem-head .badge {
    font-size: 10px; font-family: monospace;
    padding: 1px 6px; border: 1px solid #555; border-radius: 3px;
    color: #333; background: #fafafa;
  }
  .problem-head .points {
    font-size: 11px; color: #b45309; font-weight: 700;
    margin-left: auto;
  }
  .problem-body { font-size: 13px; line-height: 1.6; }
  /* ★ 객관식 보기 — grid 레이아웃으로 각 행이 자연스럽게 자기 높이 가짐.
   *   이전 flex+nowrap 방식은 KaTeX 행렬(다중 행) 의 첫 줄이 위로 잘리던 사고.
   */
  .choices {
    margin-top: 6px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 8px 14px;
    font-size: 12px;
  }
  .choices .choice {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .choices .choice .katex { vertical-align: middle; }
  .katex-error { color: #c00; background: #fee; padding: 0 2px; border-radius: 2px; }
  section.answer-key, section.solution-sheet {
    page-break-before: always;
    padding-top: 14px;
    margin-top: 18px;
  }
  section.answer-key h2, section.solution-sheet h2 {
    font-size: 16px; font-weight: 800;
    border-bottom: 2px solid #111;
    padding-bottom: 4px; margin: 0 0 12px;
  }
  table.answer-table {
    width: 100%; border-collapse: collapse;
    table-layout: fixed; font-size: 12px;
  }
  table.answer-table th, table.answer-table td {
    border: 1px solid #555;
    padding: 6px 8px; text-align: center;
    vertical-align: middle;
  }
  table.answer-table thead th { background: #f5f5f5; font-weight: 700; }
  table.answer-table .num-cell { width: 12%; font-weight: 700; }
  table.answer-table .ans-cell { width: 38%; color: #1d4ed8; font-weight: 700; }
  table.answer-table .empty-ans { color: #999; }
  /* 서답형 답 — 다줄 답이 좁게 들어가지 않도록 세로 여유 확보 */
  table.answer-table .sa-room {
    min-height: 2.8em; line-height: 1.55;
    display: flex; align-items: center; justify-content: center;
  }
  .solution {
    padding: 8px 0 10px;
    border-bottom: 1px dashed #ddd;
    page-break-inside: avoid;
    display: flex; gap: 10px;
  }
  .solution:last-child { border-bottom: none; }
  .solution-num { font-size: 13px; font-weight: 800; min-width: 28px; }
  .solution-body { flex: 1; font-size: 12px; line-height: 1.6; }
  .solution-body.empty { color: #999; font-style: italic; }
  @media print {
    .controls { display: none !important; }
    .page { padding: 0; }
    body { background: white; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="controls">
      <span>${variant === 'teacher' ? '강사용 (분류·난이도 라벨)' : '학생 배포용 (라벨 제거)'}${withAnswer ? ' + 정답·해설' : ''} — Ctrl+P → PDF 저장</span>
      <span class="links">
        <a href="?variant=${variant === 'teacher' ? 'student' : 'teacher'}${withAnswer ? '&withAnswer=true' : ''}">${variant === 'teacher' ? '학생용으로' : '강사용으로'} 전환</a>
        <a href="?variant=${variant}${withAnswer ? '' : '&withAnswer=true'}">정답·해설 ${withAnswer ? '끄기' : '켜기'}</a>
        <button type="button" class="primary" onclick="window.print()">인쇄 / PDF 저장</button>
      </span>
    </div>

    <header class="print-header">
      ${headerLabel ? `<div class="meta">${escapeHtml(headerLabel)}</div>` : ''}
      <div class="title">${escapeHtml(examTitle)}${subtitle ? ` <span class="subtitle">— ${escapeHtml(subtitle)}</span>` : ''}</div>
      <div class="stats">총 ${probCount}문항${totalPts > 0 ? ` · ${totalPts}점` : ''}${onlyProblemIds ? ' · 단원/주제별 발췌' : ''}</div>
      ${variant === 'student'
        ? `<div class="name-line">
             <span class="field">학교 / 학년 / 반:</span>
             <span class="field">번호:</span>
             <span class="field">이름:</span>
           </div>`
        : ''}
    </header>

    <main>
      ${items || '<p>문항이 없습니다.</p>'}
      ${answerKeyHtml}
      ${solutionSheetHtml}
    </main>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
