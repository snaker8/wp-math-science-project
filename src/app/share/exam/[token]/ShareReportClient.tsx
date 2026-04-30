'use client';

// ============================================================================
// 학부모/블로그 공유 리포트 — 클라이언트 (라이트 프리미엄 디자인)
// 클립보드: 이미지 복사 / HTML 복사 / 링크 복사 / 이미지 다운로드 / 인쇄
// ============================================================================

import React, { useRef, useState } from 'react';
import { Copy, ImageDown, Printer, Link2, FileCode, Check, Loader2 } from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import './report.css';

interface ShareReportClientProps {
  data: {
    exam: {
      id: string;
      title: string;
      grade: string | null;
      subject: string | null;
      problemCount: number;
      totalPoints: number;
      createdAt: string;
    };
    stats: {
      total: number;
      totalPoints: number;
      avgDifficulty: number;
      diffDist: Record<number, number>;
      domDist: Record<string, number>;
    };
    analysis: {
      summary: string;
      overallDifficulty: string;
      unitAnalyses: Array<{
        majorUnit: string;
        questionNumbers: number[];
        keyPoints: string;
        strategy: string;
      }>;
      hardQuestions: Array<{
        problemId: string;
        number: number;
        intent: string;
        strategy: string;
      }>;
      generatedAt: string;
      modelVersion: string;
    } | null;
  };
  domainLabels: Record<string, string>;
}

export function ShareReportClient({ data, domainLabels }: ShareReportClientProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | 'image' | 'html' | 'link' | 'download'>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  // ── 발행일 포맷
  const reportDate = data.analysis?.generatedAt
    ? new Date(data.analysis.generatedAt).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : new Date().toLocaleDateString('ko-KR');

  // ── 단원별 분포 집계 (analysis.unitAnalyses 기준)
  const unitDist = (data.analysis?.unitAnalyses || []).map((u) => ({
    name: u.majorUnit,
    count: u.questionNumbers.length,
    pct: data.stats.total > 0 ? Math.round((u.questionNumbers.length / data.stats.total) * 100) : 0,
  }));

  // ── 난이도 그룹 집계 (1-2 / 3-4 / 5-6 / 7-8 / 9-10)
  const diffGroups = [
    { label: '1-2단계', range: [1, 2], color: '#FCD34D' },
    { label: '3-4단계', range: [3, 4], color: '#86EFAC' },
    { label: '5-6단계', range: [5, 6], color: '#93C5FD' },
    { label: '7-8단계', range: [7, 8], color: '#C4B5FD' },
    { label: '9-10단계', range: [9, 10], color: '#FCA5A5' },
  ].map((g) => {
    const count = g.range.reduce((s, lvl) => s + (data.stats.diffDist[lvl] || 0), 0);
    return {
      ...g,
      count,
      pct: data.stats.total > 0 ? Math.round((count / data.stats.total) * 100) : 0,
    };
  });

  // ── 클립보드: 이미지 복사
  const handleCopyImage = async () => {
    const el = reportRef.current;
    if (!el) return;
    setBusy('image');
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: el.scrollWidth,
      } as Parameters<typeof html2canvas>[1]);
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          showToast('이미지가 클립보드에 복사되었습니다 — 블로그/카톡에 Ctrl+V');
        } catch {
          showToast('이미지 복사 실패 — 브라우저가 지원하지 않습니다');
        }
      }, 'image/png');
    } catch (err) {
      console.error('copy image:', err);
      showToast('이미지 복사 중 오류가 발생했습니다');
    } finally {
      setBusy(null);
    }
  };

  // ── 클립보드: HTML 복사 (블로그 에디터 붙여넣기용)
  const handleCopyHtml = async () => {
    const el = reportRef.current;
    if (!el) return;
    setBusy('html');
    try {
      const htmlContent = el.outerHTML;
      const textContent = el.innerText;
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([htmlContent], { type: 'text/html' }),
          'text/plain': new Blob([textContent], { type: 'text/plain' }),
        }),
      ]);
      showToast('HTML이 클립보드에 복사되었습니다 — 블로그 HTML 모드에서 Ctrl+V');
    } catch (err) {
      console.error('copy html:', err);
      showToast('HTML 복사 실패');
    } finally {
      setBusy(null);
    }
  };

  // ── 클립보드: 링크 복사
  const handleCopyLink = async () => {
    setBusy('link');
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('공유 링크가 클립보드에 복사되었습니다');
    } catch {
      showToast('링크 복사 실패');
    } finally {
      setBusy(null);
    }
  };

  // ── 이미지 다운로드 (PNG 파일로 저장)
  const handleDownload = async () => {
    const el = reportRef.current;
    if (!el) return;
    setBusy('download');
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      } as Parameters<typeof html2canvas>[1]);
      const link = document.createElement('a');
      const safeTitle = data.exam.title.replace(/[\\/:*?"<>|]/g, '_');
      link.download = `${safeTitle}_분석리포트.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('이미지를 다운로드했습니다');
    } catch (err) {
      console.error('download:', err);
      showToast('다운로드 실패');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="report-shell">
      {/* ── 액션 바 (인쇄 시 숨김) ── */}
      <div className="report-actions no-print">
        <div className="report-actions-inner">
          <button onClick={handleCopyImage} disabled={busy !== null} className="action-btn primary">
            {busy === 'image' ? <Loader2 className="spin" /> : <Copy />}
            이미지 복사
          </button>
          <button onClick={handleCopyHtml} disabled={busy !== null} className="action-btn">
            {busy === 'html' ? <Loader2 className="spin" /> : <FileCode />}
            HTML 복사
          </button>
          <button onClick={handleCopyLink} disabled={busy !== null} className="action-btn">
            {busy === 'link' ? <Loader2 className="spin" /> : <Link2 />}
            링크 복사
          </button>
          <button onClick={handleDownload} disabled={busy !== null} className="action-btn">
            {busy === 'download' ? <Loader2 className="spin" /> : <ImageDown />}
            이미지 저장
          </button>
          <button onClick={() => window.print()} disabled={busy !== null} className="action-btn">
            <Printer />
            인쇄
          </button>
        </div>
      </div>

      {/* ── 토스트 ── */}
      {toast && (
        <div className="report-toast">
          <Check />
          {toast}
        </div>
      )}

      {/* ── 보고서 본문 (캡처 대상) ── */}
      <article ref={reportRef} className="report-paper">
        {/* HEADER */}
        <header className="report-header">
          <div className="header-top">
            <div className="brand">
              <div className="brand-logo">과사람</div>
              <div className="brand-tagline">MATHEMATICS · ANALYSIS</div>
            </div>
            <div className="header-meta">
              <div className="meta-label">REPORT</div>
              <div className="meta-date">{reportDate}</div>
            </div>
          </div>
          <div className="header-divider" />
          <div className="header-title-row">
            <div className="header-eyebrow">EXAM ANALYSIS REPORT</div>
            <h1 className="header-title">{data.exam.title}</h1>
            <div className="header-meta-chips">
              {data.exam.grade && <span className="meta-chip">{data.exam.grade}</span>}
              {data.exam.subject && <span className="meta-chip">{data.exam.subject}</span>}
              <span className="meta-chip emphasis">{data.stats.total}문항</span>
              <span className="meta-chip">{data.stats.totalPoints}점</span>
            </div>
          </div>
        </header>

        {/* SECTION 01 — 기본 정보 */}
        <section className="report-section">
          <div className="section-head">
            <div className="section-num">01</div>
            <h2 className="section-title">기본 정보</h2>
          </div>

          {/* 시험 범위 */}
          <div className="info-block">
            <div className="info-label">시험 범위</div>
            <div className="info-chips">
              {unitDist.length > 0 ? (
                unitDist.map((u, i) => (
                  <span key={i} className="range-chip">
                    {u.name}
                  </span>
                ))
              ) : (
                <span className="range-chip muted">분석 정보 없음</span>
              )}
            </div>
          </div>

          {/* 단원별 문항 분포 */}
          <div className="info-block">
            <div className="info-label">단원별 문항 분포</div>
            <div className="bar-list">
              {unitDist.length === 0 && <div className="empty">데이터 없음</div>}
              {unitDist.map((u, i) => (
                <div key={i} className="bar-row">
                  <div className="bar-name">{u.name}</div>
                  <div className="bar-track">
                    <div
                      className="bar-fill unit"
                      style={{ width: `${Math.max(2, u.pct)}%` }}
                    />
                  </div>
                  <div className="bar-meta">
                    <strong>{u.pct}%</strong>
                    <span>{u.count}문항</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 난이도별 문항 분포 */}
          <div className="info-block">
            <div className="info-label">난이도별 문항 분포 (1~10단계)</div>
            <div className="bar-list">
              {diffGroups.map((g, i) => (
                <div key={i} className="bar-row">
                  <div className="bar-name">{g.label}</div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${Math.max(g.count > 0 ? 2 : 0, g.pct)}%`,
                        background: g.color,
                      }}
                    />
                  </div>
                  <div className="bar-meta">
                    <strong>{g.pct}%</strong>
                    <span>{g.count}문항</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 02 — 종합 출제 경향 및 학습 전략 */}
        {data.analysis && (
          <section className="report-section">
            <div className="section-head">
              <div className="section-num">02</div>
              <h2 className="section-title">종합 출제 경향 및 학습 전략</h2>
            </div>

            {/* 시험 총평 */}
            <div className="sub-block">
              <div className="sub-head">
                <span className="sub-num">1.</span>
                <span className="sub-title">시험 총평</span>
                <span className="diff-pill">{data.analysis.overallDifficulty}</span>
              </div>
              <div className="sub-body">
                <MixedContentRenderer content={data.analysis.summary} />
              </div>
            </div>

            {/* 단원별 핵심 포인트 및 학습 전략 */}
            <div className="sub-block">
              <div className="sub-head">
                <span className="sub-num">2.</span>
                <span className="sub-title">단원별 핵심 포인트 및 학습 전략</span>
              </div>
              <div className="unit-list">
                {data.analysis.unitAnalyses.map((u, i) => (
                  <div key={i} className="unit-card">
                    <div className="unit-card-head">
                      <h3 className="unit-card-title">{u.majorUnit}</h3>
                      <span className="unit-card-meta">
                        {u.questionNumbers.length}문항 · {u.questionNumbers.join(', ')}번
                      </span>
                    </div>
                    <div className="unit-card-body">
                      <div className="kv">
                        <div className="kv-key">핵심 포인트</div>
                        <div className="kv-val">
                          <MixedContentRenderer content={u.keyPoints} />
                        </div>
                      </div>
                      <div className="kv">
                        <div className="kv-key">학습 전략</div>
                        <div className="kv-val">
                          <MixedContentRenderer content={u.strategy} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 고난도 문항 심층 분석 */}
            {data.analysis.hardQuestions.length > 0 && (
              <div className="sub-block">
                <div className="sub-head">
                  <span className="sub-num">3.</span>
                  <span className="sub-title">고난도 문항 심층 분석</span>
                </div>
                <div className="unit-list">
                  {data.analysis.hardQuestions.map((q, i) => (
                    <div key={i} className="unit-card hard">
                      <div className="unit-card-head">
                        <h3 className="unit-card-title">{q.number}번 문항</h3>
                      </div>
                      <div className="unit-card-body">
                        <div className="kv">
                          <div className="kv-key">출제 의도</div>
                          <div className="kv-val">
                            <MixedContentRenderer content={q.intent} />
                          </div>
                        </div>
                        <div className="kv">
                          <div className="kv-key">공략</div>
                          <div className="kv-val">
                            <MixedContentRenderer content={q.strategy} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {!data.analysis && (
          <section className="report-section">
            <div className="empty-analysis">
              AI 분석이 아직 생성되지 않았습니다. 강사 페이지에서 "AI 분석 생성"을 클릭해주세요.
            </div>
          </section>
        )}

        {/* FOOTER */}
        <footer className="report-footer">
          <div className="footer-line" />
          <div className="footer-row">
            <div>ⓒ 과사람 수학 분석 시스템</div>
            <div>발행 · {reportDate}</div>
          </div>
        </footer>
      </article>
    </div>
  );
}
