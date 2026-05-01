// ============================================================================
// GET /api/exams/[examId]/print?variant=teacher|student
//
// 시험지(exams) 단위 인쇄용 HTML 반환. 사용자가 브라우저 인쇄(Ctrl+P) → PDF 저장.
// /api/sessions/[id]/pdf 패턴 그대로, sessions 특정 부분(QR·학생명·O/X) 제거.
//
// variant:
//   teacher — 각 문항 옆 [MS코드 · ★난이도] 라벨 표시
//   student — 라벨 제거 (학생 배포용 깔끔)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import katex from 'katex';

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
    const tex = (m[1] ?? m[2] ?? '').trim();
    try {
      parts.push(
        katex.renderToString(tex, {
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
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  const { searchParams } = new URL(request.url);
  const variant = searchParams.get('variant') === 'teacher' ? 'teacher' : 'student';

  // 시험지 조회
  const { data: exam, error: examErr } = await sb
    .from('exams')
    .select('id, title, grade, subject, total_points, problem_count')
    .eq('id', examId)
    .maybeSingle();

  if (examErr || !exam) {
    return new NextResponse(`<p>시험지를 찾을 수 없습니다.</p>`, {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // exam_problems + 본문
  const { data: epRows } = await sb
    .from('exam_problems')
    .select('sequence_number, points, problem_id')
    .eq('exam_id', examId)
    .order('sequence_number', { ascending: true });

  const problemIds = ((epRows || []) as Array<{ problem_id: string }>).map((r) => r.problem_id);

  const { data: problems } =
    problemIds.length > 0
      ? await sb.from('problems').select('id, content_latex, answer_json').in('id', problemIds)
      : { data: [] as Array<{ id: string; content_latex: string; answer_json: Record<string, unknown> }> };
  const problemMap = new Map<
    string,
    { content_latex: string; answer_json: Record<string, unknown> }
  >();
  ((problems || []) as Array<{ id: string; content_latex: string; answer_json: Record<string, unknown> }>).forEach(
    (p) => problemMap.set(p.id, { content_latex: p.content_latex, answer_json: p.answer_json })
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
  .choices {
    margin-top: 6px;
    display: flex; flex-wrap: wrap; gap: 14px;
    font-size: 12px;
  }
  .choices .choice { white-space: nowrap; }
  .katex-error { color: #c00; background: #fee; padding: 0 2px; border-radius: 2px; }
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
      <span>${variant === 'teacher' ? '강사용 (분류·난이도 라벨)' : '학생 배포용 (라벨 제거)'} — Ctrl+P → PDF 저장</span>
      <span class="links">
        <a href="?variant=${variant === 'teacher' ? 'student' : 'teacher'}">${variant === 'teacher' ? '학생용으로' : '강사용으로'} 전환</a>
        <button type="button" class="primary" onclick="window.print()">인쇄 / PDF 저장</button>
      </span>
    </div>

    <header class="print-header">
      ${headerLabel ? `<div class="meta">${escapeHtml(headerLabel)}</div>` : ''}
      <div class="title">${escapeHtml(examTitle)}</div>
      <div class="stats">총 ${probCount}문항${totalPts > 0 ? ` · ${totalPts}점` : ''}</div>
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
