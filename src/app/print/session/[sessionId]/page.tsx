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

  const [meta, setMeta] = useState<PrintMeta | null>(null);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [columns, setColumns] = useState<1 | 2>(2);
  const gap = 30; // exam-management 기본 간격
  // QR 인쇄 옵션 (매쓰플랫 qrAvailable 모델) — 표시 on/off + 대상(학생 답안/강사 채점)
  const [showQr, setShowQr] = useState(true);
  const [qrTarget, setQrTarget] = useState<'answer' | 'grade'>(variant === 'teacher' ? 'grade' : 'answer');

  // 헤더/QR 메타
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    fetch(`/api/sessions/${sessionId}/print-meta?variant=${variant}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setMetaErr(d.error);
        else setMeta(d as PrintMeta);
      })
      .catch(() => { if (!cancelled) setMetaErr('세션 정보를 불러오지 못했습니다.'); });
    return () => { cancelled = true; };
  }, [sessionId, variant]);

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

  // 페이지 분할 — ★ cloud 인쇄와 동일 "2열 그리드(행 정렬)" 방식.
  //   문제 2개씩 한 행, 행 높이 = 둘 중 큰 쪽(+gap). 행 단위로 페이지 채움 →
  //   (a) 좌우(1·2) 같은 높이에서 시작, (b) 행이 하단에 안 들어가면 통째로 다음 페이지(잘림 차단).
  //   (옛 sum/colMult 근사는 좌우 미정렬 + 페이지당 과소 적재[가로로 2개만]의 원인이었음.)
  const pages = useMemo(() => {
    if (!measured || problemHeights.length === 0) {
      const perPage = columns === 2 ? 10 : 5;
      const result: ExamRenderProblem[][] = [];
      for (let i = 0; i < problems.length; i += perPage) result.push(problems.slice(i, i + perPage));
      return result.length > 0 ? result : [[]];
    }
    const step = columns === 2 ? 2 : 1;
    const result: ExamRenderProblem[][] = [];
    let cur: ExamRenderProblem[] = [];
    let usedH = 0;
    for (let i = 0; i < problems.length; i += step) {
      const rowEnd = Math.min(i + step, problems.length);
      let rowH = 0;
      for (let j = i; j < rowEnd; j++) rowH = Math.max(rowH, problemHeights[j] + gap);
      const maxH = result.length === 0 ? FIRST_CONTENT_H : CONTENT_H;
      if (cur.length > 0 && usedH + rowH > maxH) { result.push(cur); cur = []; usedH = 0; }
      for (let j = i; j < rowEnd; j++) cur.push(problems[j]);
      usedH += rowH;
    }
    if (cur.length > 0) result.push(cur);
    return result.length > 0 ? result : [[]];
  }, [problems, problemHeights, measured, columns, gap]);

  if (metaErr) {
    return <div style={{ padding: 40, fontFamily: 'sans-serif', color: '#b91c1c' }}>{metaErr}</div>;
  }

  const headerLabel = meta
    ? `${SESSION_TYPE_LABEL[meta.sessionType] || meta.sessionType} · ${meta.roundNumber}회차`
    : '';

  const renderProblem = (problem: ExamRenderProblem, idx: number) => (
    <div key={problem.id} data-problem-idx={idx} className="break-inside-avoid" style={{ marginBottom: `${gap}px` }}>
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
        {pages.map((pageProblems, pageIdx) => {
          let globalStartIdx = 0;
          for (let p = 0; p < pageIdx; p++) globalStartIdx += pages[p].length;
          const useManualColumns = columns === 2;

          return (
            <div key={pageIdx} className="preview-exam-page exam-page">
              {pageIdx === 0 && (
                <header className="exam-meta-header">
                  <div className="hdr-left">
                    {headerLabel && <div className="hdr-meta">{headerLabel}</div>}
                    <div className="hdr-title">{meta?.examTitle || '시험지'}</div>
                    <div className="hdr-student">
                      {meta?.studentSchool ? <span className="hdr-school">{meta.studentSchool}</span> : null}
                      <span className="hdr-name">{meta?.studentName || ''}</span>
                    </div>
                  </div>
                  {showQr && meta && (() => {
                    const cur = qrTarget === 'grade' ? meta.qrGrade : meta.qrAnswer;
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
                <div className="exam-grid">
                  {pageProblems.map((problem, i) => renderProblem(problem, globalStartIdx + i))}
                </div>
              ) : (
                <div className="exam-single">
                  {pageProblems.map((problem, i) => renderProblem(problem, globalStartIdx + i))}
                </div>
              )}
            </div>
          );
        })}
        {meta && problems.length === 0 && (
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
        /* ★ 2단 = CSS Grid 2열(행 정렬): 문제 2개씩 한 행, 행 높이=둘 중 큰 쪽 → 1·2 같은 높이 시작.
           (옛 flex 2칸 + 좌우 half-slice 는 측정 왜곡으로 페이지당 2개만 → 가로 배치 사고) */
        .exam-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: ${COLUMN_GAP}px; align-items: start; padding-top: 4px; }
        .exam-grid > * { min-width: 0; }
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
