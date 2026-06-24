// ============================================================================
// GET /api/sessions/[id]/pdf?variant=teacher|student
//   QR 채점용 인쇄 페이지 HTML 반환 (브라우저 Ctrl+P → PDF 저장).
//
// variant:
//   teacher  — QR + 학생명 + 각 문항 옆 [MS코드 | ★난이도] 라벨 + O/X 체크박스
//   student  — QR + 학생명 + 문항 내용만 (라벨·O/X 박스 제거)
//
// ★ true PDF 바이너리 생성은 puppeteer 등 헤비 런타임 필요 → 현 단계는 print-ready HTML.
//   사용자가 브라우저에서 인쇄 > PDF 저장으로 충분 (학원 일반 워크플로우).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertStudentAccess } from '@/lib/security/institute-guard';
import { buildSessionUrl, generateQRSvg } from '@/lib/qr/generator';
import katex from 'katex';

export const dynamic = 'force-dynamic';

const KATEX_CSS_CDN = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';

const SESSION_TYPE_LABEL: Record<string, string> = {
  BS: '광역 스캔',
  DD: '정밀 진단',
  PT: '선수 추적',
  SC: '스팟 체크',
  WS: '학습지',
  EX: '시험지',
};

// ----------------------------------------------------------------------------
// Utility — HTML 이스케이프
// ----------------------------------------------------------------------------
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ----------------------------------------------------------------------------
// Utility — content_latex 를 HTML 로 렌더 ($ 인라인 / $$ 디스플레이 / 텍스트)
//   MixedContentRenderer 와 유사하지만 서버측에서 katex.renderToString 사용.
// ----------------------------------------------------------------------------
function renderMixedContent(raw: string): string {
  if (!raw) return '';

  // 1) \(...\) → $...$, \[...\] → $$...$$ 표준화
  let s = raw
    .replace(/\\\[(.+?)\\\]/gs, (_m, inner: string) => `$$${inner.trim()}$$`)
    .replace(/\\\((.+?)\\\)/gs, (_m, inner: string) => `$${inner.trim()}$`);

  // 2) $$...$$ / $...$ 를 KaTeX 렌더 결과로 치환. 나머지 텍스트는 HTML 이스케이프.
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
    try {
      parts.push(
        katex.renderToString(tex, {
          displayMode: isBlock,
          throwOnError: false,
          strict: 'ignore',
          trust: true,
        }),
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

// ----------------------------------------------------------------------------
// Route
// ----------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;

  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  const { searchParams } = new URL(request.url);
  const variant = searchParams.get('variant') === 'student' ? 'student' : 'teacher';

  // 세션 조회
  const { data: session, error: sErr } = await sb
    .schema('diagnostics' as never)
    .from('print_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (sErr || !session) {
    return new NextResponse(`<p>세션을 찾을 수 없습니다.</p>`, {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // ★ 학생 격리 — 이 세션 학생이 호출자 학원 소속(또는 본인/super_admin)인지. PII·시험본문 노출 차단.
  const access = await assertStudentAccess(sb, (session as { student_id: string }).student_id, scope);
  if (!access.ok) {
    return new NextResponse(`<p>접근 권한이 없습니다.</p>`, {
      status: access.status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // 학생·시험지
  const { data: student } = await sb
    .from('users')
    .select('*')
    .eq('id', (session as any).student_id)
    .maybeSingle();
  const studentName =
    ((student as any)?.full_name as string) ||
    ((student as any)?.name as string) ||
    ((student as any)?.email as string) ||
    '(이름 없음)';

  const { data: exam } = await sb
    .from('exams')
    .select('id, title')
    .eq('id', (session as any).exam_id)
    .maybeSingle();
  const examTitle = (exam as any)?.title || '';

  // 세션 문항 + 문제 본문
  const { data: sp } = await sb
    .schema('diagnostics' as never)
    .from('session_problems')
    .select('*')
    .eq('session_id', sessionId)
    .order('sequence_number', { ascending: true });

  const problemIds = ((sp || []) as any[]).map(r => r.problem_id as string);
  const { data: problems } = problemIds.length > 0
    ? await sb
        .from('problems')
        .select('id, content_latex, answer_json')
        .in('id', problemIds)
    : { data: [] as any[] };

  const problemMap = new Map<string, any>();
  for (const p of (problems || []) as any[]) problemMap.set(p.id as string, p);

  // QR — variant 별 진입 URL 분기
  //   teacher: /grade/[id]  (강사 O/X 채점)
  //   student: /answer/[id] (학생 직접 답 입력 → 자동채점)
  const origin = request.nextUrl.origin;
  const qrUrl = buildSessionUrl(sessionId, origin, variant === 'student' ? 'answer' : 'grade');
  let qrSvg = '';
  try {
    qrSvg = await generateQRSvg(qrUrl);
    // viewBox만 남기고 width/height 제거 (CSS 로 크기 제어)
    qrSvg = qrSvg.replace(/\s(width|height)="[^"]*"/g, '');
  } catch {
    qrSvg = '';
  }

  // 문항 HTML 조립
  const items = ((sp || []) as any[]).map(row => {
    const p = problemMap.get(row.problem_id as string);
    const content = (p?.content_latex as string) || '';
    const answerJson = (p?.answer_json as Record<string, unknown>) || {};
    const choices = Array.isArray((answerJson as any).choices) ? ((answerJson as any).choices as string[]) : [];

    const contentHtml = renderMixedContent(content);
    const choicesHtml = choices.length > 0
      ? `<div class="choices">${
          choices.map((c, i) => `<span class="choice">${['①','②','③','④','⑤'][i] || ''} ${renderMixedContent(c)}</span>`).join('')
        }</div>`
      : '';

    const teacherBadge = variant === 'teacher' && (row.type_code_snapshot || row.difficulty_snapshot != null)
      ? `<span class="badge">${row.type_code_snapshot ? escapeHtml(row.type_code_snapshot as string) : ''}${row.difficulty_snapshot != null ? ` · ★${row.difficulty_snapshot}` : ''}</span>`
      : '';

    const oxBoxes = variant === 'teacher'
      ? `<span class="ox">O <span class="box"></span> &nbsp; X <span class="box"></span></span>`
      : '';

    return `
      <article class="problem">
        <div class="problem-head">
          <span class="num">${row.sequence_number}.</span>
          ${teacherBadge}
          ${oxBoxes}
        </div>
        <div class="problem-body">
          ${contentHtml}
          ${choicesHtml}
        </div>
      </article>
    `;
  }).join('');

  const headerLabel = `${SESSION_TYPE_LABEL[(session as any).session_type] || (session as any).session_type} · ${(session as any).round_number}회차`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(examTitle)} — ${escapeHtml(studentName)}</title>
<link rel="stylesheet" href="${KATEX_CSS_CDN}" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: 'Pretendard', 'Noto Sans KR', -apple-system, sans-serif; color: #111; background: #fff; }
  .page { max-width: 210mm; margin: 0 auto; padding: 14mm 12mm; }
  header.print-header {
    border-bottom: 2px solid #111;
    padding-bottom: 8px;
    margin-bottom: 14px;
    display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  }
  header.print-header .meta {
    font-size: 12px; color: #333;
  }
  header.print-header .title {
    font-size: 16px; font-weight: 700; margin-top: 2px;
  }
  header.print-header .student {
    font-size: 18px; font-weight: 800; margin-top: 6px;
  }
  header.print-header .qr {
    width: 72px; height: 72px; flex-shrink: 0;
  }
  header.print-header .qr svg { width: 100%; height: 100%; display: block; }
  .controls {
    margin-bottom: 14px; padding: 8px 10px;
    background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;
    font-size: 11px; color: #555;
    display: flex; justify-content: space-between; align-items: center;
  }
  .controls button {
    border: 1px solid #333; background: #111; color: #fff;
    padding: 4px 10px; font-size: 11px; border-radius: 3px; cursor: pointer;
  }
  .problem {
    padding: 8px 0 10px;
    border-bottom: 1px dashed #ddd;
    page-break-inside: avoid;
  }
  .problem:last-child { border-bottom: none; }
  .problem-head {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin-bottom: 4px;
  }
  .problem-head .num {
    font-size: 13px; font-weight: 800;
  }
  .problem-head .badge {
    font-size: 10px; font-family: monospace;
    padding: 1px 6px; border: 1px solid #555; border-radius: 3px;
    color: #333; background: #fafafa;
  }
  .problem-head .ox {
    margin-left: auto; font-size: 12px; font-weight: 700; letter-spacing: 1px;
  }
  .problem-head .box {
    display: inline-block; width: 14px; height: 14px; border: 1.5px solid #111;
    vertical-align: middle; margin: 0 2px;
  }
  .problem-body {
    font-size: 13px; line-height: 1.55;
  }
  .choices {
    margin-top: 6px;
    display: flex; flex-wrap: wrap; gap: 12px;
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
      <span>${variant === 'teacher' ? '강사용 (라벨·O/X)' : '학생용 (라벨 제거)'} — 브라우저 인쇄(Ctrl+P) → PDF 저장</span>
      <button type="button" onclick="window.print()">인쇄 / PDF 저장</button>
    </div>

    <header class="print-header">
      <div>
        <div class="meta">${escapeHtml(headerLabel)}</div>
        <div class="title">${escapeHtml(examTitle)}</div>
        <div class="student">${escapeHtml(studentName)}</div>
      </div>
      <div class="qr" title="${escapeHtml(qrUrl)}">${qrSvg}</div>
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
