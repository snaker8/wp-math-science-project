'use client';

// ============================================================================
// 학부모/블로그 공유 리포트 — 클라이언트
// 인디고+크림+골드 / 친근하고 따뜻한 학원 보고서
// 클립보드: 이미지 / HTML / 링크 / PNG 다운로드 / 인쇄
// ============================================================================

import React, { useRef, useState } from 'react';
import {
  Copy,
  ImageDown,
  Printer,
  Link2,
  FileCode,
  Check,
  Loader2,
  BookOpenText,
  PieChart,
  BarChart3,
  Pin,
  Target,
  Lightbulb,
  ScrollText,
  AlertTriangle,
  ListChecks,
  PenLine,
} from 'lucide-react';
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
        subTitle?: string;
        intent: string;
        strategy: string;
      }>;
      generatedAt: string;
      modelVersion: string;
    } | null;
  };
  domainLabels: Record<string, string>;
}

// 단계별 풀이 ([1단계] [2단계] [3단계]) 강조 렌더
function StepStrategy({ text }: { text: string }) {
  // [N단계] 패턴을 찾아 굵은 색 강조 + 줄바꿈
  const parts: Array<{ kind: 'step' | 'text'; content: string }> = [];
  const regex = /(\[\d+단계\])/g;
  let last = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: 'text', content: text.slice(last, m.index) });
    parts.push({ kind: 'step', content: m[1] });
    last = m.index + m[1].length;
  }
  if (last < text.length) parts.push({ kind: 'text', content: text.slice(last) });

  if (parts.filter((p) => p.kind === 'step').length === 0) {
    return <MixedContentRenderer content={text} />;
  }

  return (
    <span>
      {parts.map((p, i) =>
        p.kind === 'step' ? (
          <span key={i} className="step">
            {' '}
            {p.content}{' '}
          </span>
        ) : (
          <MixedContentRenderer key={i} content={p.content} />
        )
      )}
    </span>
  );
}

export function ShareReportClient({ data }: ShareReportClientProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const sec1Ref = useRef<HTMLElement>(null); // 기본 정보
  const sec2Ref = useRef<HTMLDivElement>(null); // 시험 총평 + 단원별
  const sec3Ref = useRef<HTMLDivElement>(null); // 고난도
  const [busy, setBusy] = useState<
    null | 'image' | 'html' | 'link' | 'download' | 'naver' | 'sec1' | 'sec2' | 'sec3'
  >(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const reportDate = data.analysis?.generatedAt
    ? new Date(data.analysis.generatedAt).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : new Date().toLocaleDateString('ko-KR');

  // ── 단원별 분포 (analysis 기준)
  const unitDist = (data.analysis?.unitAnalyses || []).map((u) => ({
    name: u.majorUnit,
    count: u.questionNumbers.length,
    pct: data.stats.total > 0 ? Math.round((u.questionNumbers.length / data.stats.total) * 100) : 0,
  }));

  // ── 난이도 그룹 — 1~2 / 3~4 / 5~6 / 7~8 / 9~10
  const diffGroups = [
    { label: '1~2단계', range: [1, 2], color: 'var(--rp-diff-low)' },
    { label: '3~4단계', range: [3, 4], color: 'var(--rp-diff-mid)' },
    { label: '5~6단계', range: [5, 6], color: 'var(--rp-diff-high)' },
    { label: '7~8단계', range: [7, 8], color: 'var(--rp-diff-extra)' },
    { label: '9~10단계', range: [9, 10], color: '#9CA3AF' },
  ].map((g) => {
    const count = g.range.reduce((s, lvl) => s + (data.stats.diffDist[lvl] || 0), 0);
    return {
      ...g,
      count,
      pct: data.stats.total > 0 ? Math.round((count / data.stats.total) * 100) : 0,
    };
  });

  // ── 클립보드
  const handleCopyImage = async () => {
    const el = reportRef.current;
    if (!el) return;
    setBusy('image');
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(el, {
        scale: Math.max(4, window.devicePixelRatio * 2.5), // 매우 고화질 (블로그 게시 시 선명)
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: el.scrollWidth,
        letterRendering: true,
        imageTimeout: 30000,
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

  // ── 섹션별 이미지 클립보드 복사 헬퍼
  const copySection = async (
    el: HTMLElement | null,
    label: string,
    busyKey: 'sec1' | 'sec2' | 'sec3'
  ) => {
    if (!el) return;
    setBusy(busyKey);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(el, {
        scale: Math.max(4, window.devicePixelRatio * 2.5), // 매우 고화질 (블로그 게시 시 선명)
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: el.scrollWidth,
        letterRendering: true,
        imageTimeout: 30000,
      } as Parameters<typeof html2canvas>[1]);
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          showToast(`${label} 이미지 복사됨 — 블로그/카톡에 Ctrl+V`);
        } catch {
          showToast(`${label} 이미지 복사 실패`);
        }
      }, 'image/png');
    } catch (err) {
      console.error('section copy:', err);
      showToast(`${label} 복사 실패`);
    } finally {
      setBusy(null);
    }
  };

  // ── 네이버 블로그 작성 (이미지 자동 복사 + 새 글쓰기 페이지 오픈)
  const handleNaverBlog = async () => {
    const el = reportRef.current;
    if (!el) return;
    setBusy('naver');
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(el, {
        scale: Math.max(4, window.devicePixelRatio * 2.5), // 매우 고화질 (블로그 게시 시 선명)
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: el.scrollWidth,
        letterRendering: true,
        imageTimeout: 30000,
      } as Parameters<typeof html2canvas>[1]);

      // 이미지 클립보드 복사
      let clipboardOk = false;
      await new Promise<void>((resolve) => {
        canvas.toBlob(async (blob) => {
          if (!blob) {
            resolve();
            return;
          }
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            clipboardOk = true;
          } catch {
            // 클립보드 실패 시에도 글쓰기 페이지는 열기
          }
          resolve();
        }, 'image/png');
      });

      // 네이버 블로그 새 글쓰기 페이지 새 탭으로 오픈
      window.open('https://blog.naver.com/GoBlogWrite.naver', '_blank', 'noopener');
      showToast(
        clipboardOk
          ? '이미지 복사됨 — 새로 열린 네이버 블로그에서 Ctrl+V'
          : '네이버 블로그 글쓰기 페이지가 열렸습니다 (이미지 복사는 다시 시도)'
      );
    } catch (err) {
      console.error('naver blog:', err);
      showToast('네이버 블로그 작성 실패');
    } finally {
      setBusy(null);
    }
  };

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
      {/* 액션 바 */}
      <div className="report-actions no-print">
        <div className="report-actions-inner">
          <button onClick={handleNaverBlog} disabled={busy !== null} className="action-btn primary">
            {busy === 'naver' ? <Loader2 className="spin" /> : <PenLine />}
            네이버 블로그 작성
          </button>
          <button onClick={handleCopyImage} disabled={busy !== null} className="action-btn">
            {busy === 'image' ? <Loader2 className="spin" /> : <Copy />}
            전체 이미지 복사
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
            PNG 저장
          </button>
          <button onClick={() => window.print()} disabled={busy !== null} className="action-btn">
            <Printer />
            인쇄
          </button>
        </div>
      </div>

      {toast && (
        <div className="report-toast">
          <Check />
          {toast}
        </div>
      )}

      {/* 보고서 본문 */}
      <article ref={reportRef} className="report-paper">
        {/* HEADER */}
        <header className="report-header">
          <div className="header-left">
            <div className="header-eyebrow">EXAM ANALYSIS REPORT</div>
            <h1 className="header-title">
              <span className="accent">{data.exam.title}</span> 분석
            </h1>
            <div className="header-title-bar" />
          </div>
          <div className="header-right">
            <div className="header-meta-label">TOTAL QUESTIONS</div>
            <div className="header-meta-pill">{data.stats.total}문항</div>
          </div>
        </header>

        {/* SECTION 01 — 기본 정보 */}
        <section ref={sec1Ref} className="report-section">
          <div className="section-head">
            <div className="section-bar" />
            <h2 className="section-title">1. 기본 정보</h2>
            <button
              className="section-copy-btn no-print"
              onClick={() => copySection(sec1Ref.current, '기본 정보', 'sec1')}
              disabled={busy !== null}
              title="이 섹션을 이미지로 복사"
            >
              {busy === 'sec1' ? <Loader2 className="spin" /> : <Copy />}
              섹션 복사
            </button>
          </div>

          <div className="info-card">
            {/* 시험 범위 */}
            <div className="info-block">
              <div className="info-label">
                <BookOpenText />
                시험 범위
              </div>
              <div className="info-chips">
                {unitDist.length > 0 ? (
                  unitDist.map((u, i) => (
                    <span key={i} className="range-chip">
                      {u.name}
                    </span>
                  ))
                ) : (
                  <span className="range-chip">분석 정보 없음</span>
                )}
              </div>
            </div>

            {/* 두 컬럼: 단원/난이도 분포 */}
            <div className="info-grid-2">
              {/* 단원별 문항 분포 */}
              <div className="info-block">
                <div className="info-label">
                  <PieChart />
                  단원별 문항 분포
                </div>
                <div className="bar-list">
                  {unitDist.length === 0 && <div className="empty">데이터 없음</div>}
                  {unitDist.map((u, i) => (
                    <div key={i} className="bar-row">
                      <div className="bar-name">
                        <span>{u.name}</span>
                        <span className="bar-pct">
                          {u.pct}%<span className="count">({u.count}문항)</span>
                        </span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill unit" style={{ width: `${Math.max(2, u.pct)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 난이도별 문항 분포 */}
              <div className="info-block">
                <div className="info-label">
                  <BarChart3 />
                  난이도별 문항 분포 (1~10단계)
                </div>
                <div className="bar-list">
                  {diffGroups.map((g, i) => (
                    <div key={i} className="bar-row">
                      <div className="bar-name">
                        <span>{g.label}</span>
                        <span className="bar-pct">
                          {g.pct}%<span className="count">({g.count}문항)</span>
                        </span>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{
                            width: `${Math.max(g.count > 0 ? 2 : 0, g.pct)}%`,
                            background: g.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 02 — 종합 분석 (시험총평 + 단원별) */}
        {data.analysis && (
          <section ref={sec2Ref} className="report-section">
            <div className="section-head">
              <div className="section-bar" />
              <h2 className="section-title">2. 종합 출제 경향 및 학습 전략</h2>
              <button
                className="section-copy-btn no-print"
                onClick={() => copySection(sec2Ref.current, '종합 분석', 'sec2')}
                disabled={busy !== null}
                title="이 섹션을 이미지로 복사"
              >
                {busy === 'sec2' ? <Loader2 className="spin" /> : <Copy />}
                섹션 복사
              </button>
            </div>

            {/* 1. 시험 총평 */}
            <div className="sub-card">
              <div className="sub-head">
                <ScrollText />
                <span className="sub-num">1.</span>
                <span className="sub-title">시험 총평</span>
                <span className="diff-pill">{data.analysis.overallDifficulty}</span>
              </div>
              <div className="sub-body">
                <MixedContentRenderer content={data.analysis.summary} />
              </div>
            </div>

            {/* 2. 단원별 핵심 포인트 및 학습 전략 */}
            {data.analysis.unitAnalyses.length > 0 && (
              <div className="sub-card">
                <div className="sub-head">
                  <Target />
                  <span className="sub-num">2.</span>
                  <span className="sub-title">단원별 핵심 포인트 및 학습 전략</span>
                </div>
                <div className="unit-grid">
                  {data.analysis.unitAnalyses.map((u, i) => (
                    <div key={i} className="unit-card">
                      <div className="unit-card-head">
                        <Pin />
                        <h3 className="unit-card-title">{u.majorUnit}</h3>
                        <span className="unit-card-meta">총 {u.questionNumbers.length}문항</span>
                      </div>
                      <div className="unit-kv">
                        <div className="unit-kv-key">출제경향</div>
                        <div className="unit-kv-val">
                          <MixedContentRenderer content={u.keyPoints} />
                        </div>
                      </div>
                      <div className="unit-kv">
                        <div className="unit-kv-key navy">대비전략</div>
                        <div className="unit-kv-val">
                          <MixedContentRenderer content={u.strategy} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* SECTION 03 — 고난도 분석 (별도 섹션 — 사이에 유사문항 끼울 수 있게) */}
        {data.analysis && data.analysis.hardQuestions.length > 0 && (
          <section ref={sec3Ref} className="report-section">
            <div className="section-head">
              <div className="section-bar" />
              <h2 className="section-title">3. 상대적 고난도 문항 심층 분석</h2>
              <button
                className="section-copy-btn no-print"
                onClick={() => copySection(sec3Ref.current, '고난도 분석', 'sec3')}
                disabled={busy !== null}
                title="이 섹션을 이미지로 복사"
              >
                {busy === 'sec3' ? <Loader2 className="spin" /> : <Copy />}
                섹션 복사
              </button>
            </div>
            <div className="hard-grid">
              {data.analysis.hardQuestions.map((q, i) => (
                <div key={i} className="hard-card">
                  <span className="hard-badge">
                    <AlertTriangle />
                    고난도 문항
                  </span>
                  <div className="hard-head">
                    <span className="hard-num">{q.number}</span>
                    <h3 className="hard-title">{q.subTitle || `${q.number}번 문항`}</h3>
                  </div>
                  <div className="hard-section">
                    <div className="hard-section-label">
                      <Target />
                      출제 의도
                    </div>
                    <div className="hard-section-body">
                      <MixedContentRenderer content={q.intent} />
                    </div>
                  </div>
                  <div className="hard-section">
                    <div className="hard-section-label">
                      <Lightbulb />
                      공략 (해결전략)
                    </div>
                    <div className="hard-strategy-box">
                      <StepStrategy text={q.strategy} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!data.analysis && (
          <section className="report-section">
            <div className="empty-analysis">
              AI 분석이 아직 생성되지 않았습니다.
            </div>
          </section>
        )}

        {/* FOOTER */}
        <footer className="report-footer">
          <div className="footer-row">
            <div>ⓒ 과사람 수학 분석 시스템</div>
            <div>발행 · {reportDate}</div>
          </div>
        </footer>
      </article>
    </div>
  );
}
