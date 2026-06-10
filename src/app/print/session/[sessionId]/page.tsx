'use client';

// ============================================================================
// /print/session/[sessionId]?variant=student|teacher
//   배포(출제)된 세션을 "정식 2단 시험지 형식"으로 인쇄.
//   exam-management 의 2단 측정 템플릿(.preview-exam-page + ExamProblemRenderer)을
//   그대로 재현하고, 헤더에 시험명·학생명·QR 을 얹는다.
//   기존 /api/sessions/[id]/pdf(서버 1단 HTML)를 대체하는 학생 배포 인쇄 경로.
//
// 데이터:
//   - 헤더/QR: GET /api/sessions/[id]/print-meta  (학생 격리 가드)
//   - 문제 본문: useExamProblems(examId)          (시험지 관리와 동일 훅 → 동일 렌더)
// ============================================================================

import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useExamProblems } from '@/hooks/useExamProblems';
import { ExamProblemRenderer, type ExamRenderProblem } from '@/components/shared/ExamProblemRenderer';

const KATEX_CSS_CDN = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';

const SESSION_TYPE_LABEL: Record<string, string> = {
  BS: '광역 스캔', DD: '정밀 진단', PT: '선수 추적', SC: '스팟 체크', WS: '학습지', EX: '시험지',
};

interface QrVariant { svg: string; url: string; }
interface PrintMeta {
  examId: string;
  examTitle: string;
  studentName: string;
  studentSchool: string;
  sessionType: string;
  roundNumber: number;
  variant: 'student' | 'teacher';
  qrAnswer: QrVariant;
  qrGrade: QrVariant;
}

// ── A4 상수 (px, 96dpi) — exam-management 와 동일 ────────────────────────────
const A4_H = 1123;
const PAGE_PAD = 57; // ~15mm
const FOOTER_H = 36;
const HEADER_H = 130; // 페이지1 시험명/학생/QR 헤더 예약 높이
const CONTENT_H = A4_H - PAGE_PAD * 2 - FOOTER_H;
const FIRST_CONTENT_H = CONTENT_H - HEADER_H;
const COLUMN_GAP = 16; // 2단 컬럼 간격 (px) — 측정폭·렌더 동일 사용
const CONTENT_W = 794 - PAGE_PAD * 2; // 페이지 본문 폭

function SessionPrintInner() {
  const params = useParams();
  const search = useSearchParams();
  const sessionId = String(params?.sessionId || '');
  const variant = search?.get('variant') === 'teacher' ? 'teacher' : 'student';

  const [metas, setMetas] = useState<PrintMeta[]>([]);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [columns, setColumns] = useState<1 | 2>(2);
  const [perPagePreset, setPerPagePreset] = useState<number | null>(null); // null=자동(밀집), 4/6/8=페이지당 고정
  const gap = 30; // exam-management 기본 간격
  // QR 인쇄 옵션 (매쓰플랫 qrAvailable 모델) — 표시 on/off + 대상(학생 답안/강사 채점)
  const [showQr, setShowQr] = useState(true);
  const [qrTarget, setQrTarget] = useState<'answer' | 'grade'>(variant === 'teacher' ? 'grade' : 'answer');

  // ★ 인쇄 대상 세션 id 목록 — ?ids=a,b,c 면 전원(묶음 인쇄), 없으면 경로의 단일 세션.
  const idList = useMemo(() => {
    const idsParam = search?.get('ids');
    const list = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
    return list.length > 0 ? list : (sessionId ? [sessionId] : []);
  }, [search, sessionId]);

  // 헤더/QR 메타 — 대상 전원 (학생마다 이름·QR 다름, 시험·문제는 동일)
  useEffect(() => {
    if (idList.length === 0) return;
    let cancelled = false;
    Promise.all(
      idList.map((id) =>
        fetch(`/api/sessions/${id}/print-meta?variant=${variant}`)
          .then((r) => r.json())
          .catch(() => ({ error: 'fetch' })),
      ),
    ).then((results) => {
      if (cancelled) return;
      const valid = results.filter((d): d is PrintMeta => d && !d.error);
      if (valid.length === 0) setMetaErr((results[0] as { error?: string })?.error || '세션 정보를 불러오지 못했습니다.');
      else setMetas(valid);
    });
    return () => { cancelled = true; };
  }, [idList, variant]);

  const meta = metas[0] || null; // 시험·문제·제목 공통 (모두 같은 시험)

  // 문제 본문 — 시험지 관리와 동일 훅 (동일 렌더 보장)
  const { problems: dbProblems } = useExamProblems(meta?.examId || null);
  const problems = useMemo(() => (dbProblems || []) as unknown as ExamRenderProblem[], [dbProblems]);

  // ── 측정 + 페이지 분할 (exam-management 로직 이식) ──────────────────────────
  const measureRef = useRef<HTMLDivElement>(null);
  const [problemHeights, setProblemHeights] = useState<number[]>([]);
  const [measured, setMeasured] = useState(false);
  const heightCacheRef = useRef<Map<string, number>>(new Map());

  const cacheKeyFor = useCallback(
    (p: ExamRenderProblem) => {
      const contentLen = p.content?.length ?? 0;
      const choicesLen = Array.isArray(p.choices) ? p.choices.join('').length : 0;
      const figLen = typeof p.figureSvg === 'string' ? p.figureSvg.length : 0;
      return `${p.id}:${columns}:${contentLen}:${choicesLen}:${figLen}`;
    },
    [columns],
  );

  const cachedHeights = useMemo<number[] | null>(() => {
    if (problems.length === 0) return null;
    const cache = heightCacheRef.current;
    const heights: number[] = [];
    for (const p of problems) {
      const h = cache.get(cacheKeyFor(p));
      if (h === undefined) return null;
      heights.push(h);
    }
    return heights;
  }, [problems, cacheKeyFor]);

  useEffect(() => {
    if (cachedHeights) { setProblemHeights(cachedHeights); setMeasured(true); }
    else { setMeasured(false); setProblemHeights([]); }
  }, [cachedHeights]);

  useLayoutEffect(() => {
    if (!measureRef.current || measured || problems.length === 0) return;
    let cancelled = false;
    const measure = async () => {
      try {
        const fontsReady = (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
        if (fontsReady) {
          await Promise.race([fontsReady, new Promise<void>((r) => setTimeout(r, 500))]);
        }
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      } catch {
        await new Promise<void>((r) => setTimeout(r, 150));
      }
      if (cancelled || !measureRef.current) return;
      const els = measureRef.current.querySelectorAll('[data-problem-idx]');
      const heights = Array.from(els).map((el) => (el as HTMLElement).getBoundingClientRect().height);
      if (heights.length !== problems.length) return;
      if (heights.some((h) => h === 0)) {
        await new Promise<void>((r) => setTimeout(r, 120));
        if (cancelled || !measureRef.current) return;
        const els2 = measureRef.current.querySelectorAll('[data-problem-idx]');
        const h2 = Array.from(els2).map((el) => (el as HTMLElement).getBoundingClientRect().height);
        if (h2.length !== problems.length || h2.some((h) => h === 0)) return;
        heights.splice(0, heights.length, ...h2);
      }
      const cache = heightCacheRef.current;
      problems.forEach((p, i) => cache.set(cacheKeyFor(p), heights[i]));
      setProblemHeights(heights);
      setMeasured(true);
    };
    measure();
    return () => { cancelled = true; };
  }, [problems, measured, cacheKeyFor]);

  // 측정폭 — 숨김 측정 패스에서 각 문제를 "컬럼 폭"으로 렌더해 자연 높이를 잰다.
  const measureWidth = columns === 2 ? (CONTENT_W - COLUMN_GAP) / 2 : CONTENT_W;

  // 페이지 분할 — ★ "열 우선(세로) 채움": 왼쪽 칸을 위→아래로 꽉 채우고(1,2,3…), 다 차면
  //   오른쪽 칸(다음 번호 계속 아래로) → 한국 시험지 표준 읽기 순서. 각 칸 높이 ≤ maxH (잘림 차단).
  //   페이지는 {left, right} 로 보관 → 렌더에서 좌/우 칼럼에 그대로.
  const pages = useMemo<{ left: ExamRenderProblem[]; right: ExamRenderProblem[] }[]>(() => {
    // ★ 프리셋 모드: 페이지당 N문제 고정 ("4/6/8문제 배열"). 측정 무관 — N개씩 묶고 좌/우 균등.
    if (perPagePreset && perPagePreset > 0) {
      const res: { left: ExamRenderProblem[]; right: ExamRenderProblem[] }[] = [];
      for (let i = 0; i < problems.length; i += perPagePreset) {
        const chunk = problems.slice(i, i + perPagePreset);
        if (columns === 2) {
          const half = Math.ceil(chunk.length / 2);
          res.push({ left: chunk.slice(0, half), right: chunk.slice(half) });
        } else {
          res.push({ left: chunk, right: [] });
        }
      }
      return res.length > 0 ? res : [{ left: [], right: [] }];
    }
    // 측정 전 폴백 — 순차 분할 후 좌/우 균등
    if (!measured || problemHeights.length === 0) {
      const perPage = columns === 2 ? 10 : 5;
      const res: { left: ExamRenderProblem[]; right: ExamRenderProblem[] }[] = [];
      for (let i = 0; i < problems.length; i += perPage) {
        const chunk = problems.slice(i, i + perPage);
        if (columns === 2) {
          const half = Math.ceil(chunk.length / 2);
          res.push({ left: chunk.slice(0, half), right: chunk.slice(half) });
        } else {
          res.push({ left: chunk, right: [] });
        }
      }
      return res.length > 0 ? res : [{ left: [], right: [] }];
    }

    const res: { left: ExamRenderProblem[]; right: ExamRenderProblem[] }[] = [];
    let left: ExamRenderProblem[] = [], right: ExamRenderProblem[] = [];
    let leftH = 0, rightH = 0, fillingRight = false;
    const flush = () => { res.push({ left, right }); left = []; right = []; leftH = 0; rightH = 0; fillingRight = false; };
    for (let i = 0; i < problems.length; i++) {
      const h = problemHeights[i] + gap;
      const maxH = res.length === 0 ? FIRST_CONTENT_H : CONTENT_H;
      if (columns === 1) {
        if (left.length > 0 && leftH + h > maxH) flush();
        left.push(problems[i]); leftH += h;
        continue;
      }
      if (!fillingRight) {
        if (left.length === 0 || leftH + h <= maxH) { left.push(problems[i]); leftH += h; }
        else { fillingRight = true; i--; } // 왼쪽 꽉 참 → 같은 문제를 오른쪽에서 재시도
      } else {
        if (right.length === 0 || rightH + h <= maxH) { right.push(problems[i]); rightH += h; }
        else { flush(); i--; } // 오른쪽도 꽉 참 → 새 페이지에서 재시도
      }
    }
    if (left.length > 0 || right.length > 0) flush();
    return res.length > 0 ? res : [{ left: [], right: [] }];
  }, [problems, problemHeights, measured, columns, gap, perPagePreset]);

  // ★ 프리셋 모드 페이지별 자동 간격 — 적게 든 페이지의 빈 공간을 문제 사이로 분배해
  //   "4문제 배열"이 위에 붙지 않고 여유 있게 퍼지도록. (자동 모드는 null → 고정 gap)
  const pageAutoGaps = useMemo<number[] | null>(() => {
    if (!perPagePreset || !measured || problemHeights.length === 0) return null;
    let gi = 0;
    return pages.map((pg, pi) => {
      const maxH = pi === 0 ? FIRST_CONTENT_H : CONTENT_H;
      const leftSum = pg.left.reduce((s, _p, k) => s + (problemHeights[gi + k] || 0), 0);
      const rightSum = pg.right.reduce((s, _p, k) => s + (problemHeights[gi + pg.left.length + k] || 0), 0);
      const colCount = Math.max(pg.left.length, pg.right.length);
      gi += pg.left.length + pg.right.length;
      const avail = maxH - Math.max(leftSum, rightSum);
      // 문제 사이 간격(=colCount-1 군데)에 분배. 8~80px 사이로 제한(너무 벌어지지 않게).
      return colCount > 1 ? Math.min(80, Math.max(8, Math.floor(avail / (colCount - 1)))) : gap;
    });
  }, [perPagePreset, measured, problemHeights, pages, FIRST_CONTENT_H, CONTENT_H, gap]);

  if (metaErr) {
    return <div style={{ padding: 40, fontFamily: 'sans-serif', color: '#b91c1c' }}>{metaErr}</div>;
  }

  const headerLabel = meta
    ? `${SESSION_TYPE_LABEL[meta.sessionType] || meta.sessionType} · ${meta.roundNumber}회차`
    : '';

  const renderProblem = (problem: ExamRenderProblem, idx: number, mb: number = gap) => (
    <div key={problem.id} data-problem-idx={idx} className="break-inside-avoid" style={{ marginBottom: `${mb}px` }}>
      <ExamProblemRenderer problem={problem} />
    </div>
  );

  return (
    <div className="session-print-wrap">
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={KATEX_CSS_CDN} />

      {/* 툴바 (인쇄 시 숨김) */}
      <div className="print-toolbar">
        <span className="toolbar-label">
          {variant === 'teacher' ? '강사용' : '학생용'} 시험지 인쇄 — Ctrl+P → PDF 저장
          {meta ? ` · ${meta.studentName}` : ''}
        </span>
        <div className="toolbar-actions">
          <label className="qr-switch" title="시험지에 QR 표시/숨김">
            <input type="checkbox" checked={showQr} onChange={(e) => setShowQr(e.target.checked)} />
            QR
          </label>
          {showQr && (
            <div className="col-toggle" title="QR을 스캔하면 갈 곳">
              {([['answer', '학생 답안'], ['grade', '강사 채점']] as const).map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setQrTarget(t)}
                  className={qrTarget === t ? 'active' : ''}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="col-toggle" title="페이지당 문제 수 (배열) — 자동은 빽빽이, 4/6/8은 여유있게">
            {([['자동', null], ['4', 4], ['6', 6], ['8', 8]] as const).map(([label, v]) => (
              <button
                key={label}
                type="button"
                onClick={() => setPerPagePreset(v as number | null)}
                className={perPagePreset === v ? 'active' : ''}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="col-toggle" title="단 수">
            {([2, 1] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColumns(c)}
                className={columns === c ? 'active' : ''}
              >
                {c}단
              </button>
            ))}
          </div>
          <button type="button" className="print-btn" onClick={() => window.print()}>인쇄 / PDF 저장</button>
        </div>
      </div>

      {/* 시험지 페이지들 */}
      {/* 숨겨진 측정 영역 — 각 문제를 컬럼 폭으로 독립 렌더해 자연 높이 측정 (cloud 인쇄와 동일).
          className="exam-page" 필수: KaTeX 스코프 보정(cases/행렬)이 측정에도 적용돼야 실제 렌더와
          높이 일치 → 페이지 분할 정확(넘침·잘림 차단). 보이는 렌더(grid 셀 stretch)를 측정하면 왜곡됨. */}
      <div
        ref={measureRef}
        aria-hidden
        className="exam-page"
        style={{ position: 'absolute', visibility: 'hidden', top: -99999, left: -99999, width: `${measureWidth}px` }}
      >
        {problems.map((problem, idx) => renderProblem(problem, idx))}
      </div>

      <div className="pages-host">
        {metas.map((studentMeta, si) =>
          pages.map((page, pageIdx) => {
            let globalStartIdx = 0;
            for (let p = 0; p < pageIdx; p++) globalStartIdx += pages[p].left.length + pages[p].right.length;
            const useManualColumns = columns === 2;
            const mb = pageAutoGaps?.[pageIdx] ?? gap; // 프리셋 모드면 자동 분배 간격

            return (
              <div
                key={`${si}-${pageIdx}`}
                className="preview-exam-page exam-page"
                style={si > 0 && pageIdx === 0 ? { breakBefore: 'page', pageBreakBefore: 'always' } : undefined}
              >
                {pageIdx === 0 && (
                  <header className="exam-meta-header">
                    <div className="hdr-left">
                      {headerLabel && <div className="hdr-meta">{headerLabel}</div>}
                      <div className="hdr-title">{studentMeta?.examTitle || '시험지'}</div>
                      <div className="hdr-student">
                        {studentMeta?.studentSchool ? <span className="hdr-school">{studentMeta.studentSchool}</span> : null}
                        <span className="hdr-name">{studentMeta?.studentName || ''}</span>
                      </div>
                    </div>
                    {showQr && studentMeta && (() => {
                      const cur = qrTarget === 'grade' ? studentMeta.qrGrade : studentMeta.qrAnswer;
                      if (!cur?.svg) return null;
                      return (
                        <div className="hdr-qr">
                          <div className="hdr-qr-img" title={cur.url} dangerouslySetInnerHTML={{ __html: cur.svg }} />
                          <div className="hdr-qr-cap">{qrTarget === 'grade' ? '강사 채점' : '학생 답안'}</div>
                        </div>
                      );
                    })()}
                  </header>
                )}

                {useManualColumns ? (
                  <div className="exam-cols">
                    <div className="col col-left">
                      {page.left.map((problem, i) => renderProblem(problem, globalStartIdx + i, mb))}
                    </div>
                    <div className="col col-right">
                      {page.right.map((problem, i) => renderProblem(problem, globalStartIdx + page.left.length + i, mb))}
                    </div>
                  </div>
                ) : (
                  <div className="exam-single">
                    {page.left.map((problem, i) => renderProblem(problem, globalStartIdx + i, mb))}
                  </div>
                )}
              </div>
            );
          }),
        )}
        {metas.length > 0 && problems.length === 0 && (
          <div style={{ padding: 40, color: '#6b7280', fontFamily: 'sans-serif' }}>문항을 불러오는 중…</div>
        )}
      </div>

      <style jsx global>{`
        .session-print-wrap { background: #52525b; min-height: 100vh; padding: 24px 0 60px; }
        .pages-host { display: flex; flex-direction: column; align-items: center; gap: 24px; }
        .preview-exam-page {
          width: 794px;
          min-height: ${A4_H}px;
          padding: 15mm;
          background: #fff;
          box-shadow: 0 4px 24px rgba(0,0,0,0.35);
          border-radius: 4px;
          box-sizing: border-box;
          font-family: 'Pretendard', 'Noto Sans KR', -apple-system, sans-serif;
          color: #111;
          position: relative;
        }
        .exam-meta-header {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
          border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px;
        }
        .exam-meta-header .hdr-meta { font-size: 12px; color: #555; }
        .exam-meta-header .hdr-title { font-size: 19px; font-weight: 800; margin-top: 3px; line-height: 1.25; }
        .exam-meta-header .hdr-student { margin-top: 8px; display: flex; align-items: baseline; gap: 10px; }
        .exam-meta-header .hdr-school { font-size: 13px; color: #555; }
        .exam-meta-header .hdr-name { font-size: 18px; font-weight: 800; }
        .exam-meta-header .hdr-qr { display: flex; flex-direction: column; align-items: center; gap: 2px; flex-shrink: 0; }
        .exam-meta-header .hdr-qr-img { width: 76px; height: 76px; }
        .exam-meta-header .hdr-qr-img svg { width: 100%; height: 100%; display: block; }
        .exam-meta-header .hdr-qr-cap { font-size: 9px; color: #555; font-weight: 700; letter-spacing: -0.2px; }
        /* ★ 2단 = 좌/우 칼럼(열 우선 세로 채움) + 가운데 구분선. 왼쪽 칸에 1,2,3… 위→아래로,
           꽉 차면 오른쪽 칸. align-items:stretch 로 구분선이 더 긴 칸 높이까지 내려감. */
        .exam-cols { display: flex; gap: ${COLUMN_GAP}px; padding-top: 4px; align-items: stretch; }
        .exam-cols .col { flex: 1; min-width: 0; }
        .exam-cols .col-left { border-right: 1px solid #cbd5e1; padding-right: ${COLUMN_GAP}px; }
        .exam-cols .col-right { padding-left: 2px; }
        .exam-single { padding-top: 4px; }
        .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }

        /* 툴바 */
        .print-toolbar {
          position: sticky; top: 0; z-index: 10;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          max-width: 794px; margin: 0 auto 20px; padding: 10px 14px;
          background: #18181b; border: 1px solid #3f3f46; border-radius: 8px;
          color: #d4d4d8; font-size: 12px; font-family: 'Pretendard', 'Noto Sans KR', sans-serif;
        }
        .print-toolbar .toolbar-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .print-toolbar .toolbar-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .print-toolbar .qr-switch { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 800; color: #d4d4d8; cursor: pointer; user-select: none; }
        .print-toolbar .qr-switch input { width: 14px; height: 14px; accent-color: #0891b2; cursor: pointer; }
        .print-toolbar .col-toggle { display: flex; background: #27272a; border-radius: 6px; padding: 2px; }
        .print-toolbar .col-toggle button {
          border: none; background: transparent; color: #a1a1aa; padding: 4px 10px;
          font-size: 12px; font-weight: 700; border-radius: 4px; cursor: pointer;
        }
        .print-toolbar .col-toggle button.active { background: #3f3f46; color: #fff; }
        .print-toolbar .print-btn {
          border: none; background: #0891b2; color: #fff; padding: 6px 14px;
          font-size: 12px; font-weight: 800; border-radius: 6px; cursor: pointer;
        }
        .print-toolbar .print-btn:hover { background: #06b6d4; }

        .katex-error { color: #c00; background: #fee; padding: 0 2px; border-radius: 2px; }

        @page { size: A4; margin: 0; }
        @media print {
          .session-print-wrap { background: #fff; padding: 0; }
          .print-toolbar { display: none !important; }
          .pages-host { gap: 0; }
          .preview-exam-page {
            box-shadow: none !important; border-radius: 0 !important; margin: 0 !important;
            page-break-after: always;
          }
          .preview-exam-page:last-child { page-break-after: auto; }
        }
      `}</style>
    </div>
  );
}

export default function SessionPrintPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, fontFamily: 'sans-serif', color: '#a1a1aa' }}>로딩 중…</div>}>
      <SessionPrintInner />
    </Suspense>
  );
}
