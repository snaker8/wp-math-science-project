'use client';

// ============================================================================
// 학부모/블로그 공유 리포트 — 클라이언트
// 인디고+크림+골드 / 친근하고 따뜻한 학원 보고서
// 클립보드: 이미지 / HTML / 링크 / PNG 다운로드 / 인쇄
// ============================================================================

import React, { useRef, useState } from 'react';
import {
  Copy,
  Printer,
  Link2,
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

// ===== 단원별 분포용 도넛 차트 (SVG inline) =====
const UNIT_COLORS = [
  '#DD6B20', // 진한 오렌지
  '#ED8936', // 오렌지
  '#F6AD55', // 살구
  '#FBD38D', // 옅은 살구
  '#FEEBC8', // 크림 오렌지
  '#CBD5E0', // 회색 (5+ 단원 fallback)
];

interface DonutSlice {
  name: string;
  count: number;
  pct: number;
}

function DonutChart({ items, total }: { items: DonutSlice[]; total: number }) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const R = 78;
  const r = 50;

  if (items.length === 0 || total === 0) {
    return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--rp-text-4)', fontSize: 11 }}>
        데이터 없음
      </div>
    );
  }

  let startAngle = -90; // 12시 방향
  const slices = items.map((item, idx) => {
    const sweep = (item.count / total) * 360;
    const endAngle = startAngle + sweep;
    const sa = (startAngle * Math.PI) / 180;
    const ea = (endAngle * Math.PI) / 180;
    const x1 = cx + R * Math.cos(sa);
    const y1 = cy + R * Math.sin(sa);
    const x2 = cx + R * Math.cos(ea);
    const y2 = cy + R * Math.sin(ea);
    const ix2 = cx + r * Math.cos(ea);
    const iy2 = cy + r * Math.sin(ea);
    const ix1 = cx + r * Math.cos(sa);
    const iy1 = cy + r * Math.sin(sa);
    const largeArc = sweep > 180 ? 1 : 0;
    const path = [
      `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      `A ${R} ${R} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      `L ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
      `A ${r} ${r} 0 ${largeArc} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
      'Z',
    ].join(' ');
    const color = UNIT_COLORS[idx % UNIT_COLORS.length];
    startAngle = endAngle;
    return { path, color };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {slices.map((s, i) => (
        <path key={i} d={s.path} fill={s.color} stroke="white" strokeWidth="2" />
      ))}
      {/* 중앙 텍스트 */}
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize="10" fill="#6B7280" fontWeight="600" letterSpacing="0.5">
        TOTAL
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="22" fill="#1F2937" fontWeight="800">
        {total}
      </text>
      <text x={cx} y={cy + 28} textAnchor="middle" fontSize="9" fill="#9CA3AF" fontWeight="500">
        문항
      </text>
    </svg>
  );
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
  const sec1Ref = useRef<HTMLElement>(null); // 1. 기본 정보
  const sec2Ref = useRef<HTMLElement>(null); // 2. 종합 분석
  const sec3Ref = useRef<HTMLElement>(null); // 3. 고난도 분석
  const [busy, setBusy] = useState<null | 'link' | 'naver' | 'sec1' | 'sec2' | 'sec3'>(null);
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

  // ── 섹션별 이미지 클립보드 복사 — 3단락 분할 게시용
  // 해상도: DPR×4 또는 6배 중 큰 값. 단, 캔버스 16384px 한계 초과시 자동 다운스케일.
  // (캡처 대상 안의 '섹션 복사' 버튼 자체는 data-html2canvas-ignore 로 캡처 결과에서 제외)
  const copySection = async (
    el: HTMLElement | null,
    label: string,
    busyKey: 'sec1' | 'sec2' | 'sec3'
  ) => {
    if (!el) return;
    setBusy(busyKey);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const w = Math.max(el.scrollWidth, 1);
      const h = Math.max(el.scrollHeight, 1);
      const desired = Math.max(6, (window.devicePixelRatio || 1) * 4);
      const cap = Math.floor(Math.min(16384 / w, 16384 / h));
      const scale = Math.max(2, Math.min(desired, cap));
      const canvas = await html2canvas(el, {
        scale,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: el.scrollWidth,
        letterRendering: true,
        imageTimeout: 30000,
      } as Parameters<typeof html2canvas>[1]);
      canvas.toBlob(async (blob) => {
        if (!blob) {
          showToast(`${label} 이미지 생성 실패`);
          return;
        }
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          showToast(`${label} 이미지가 복사되었습니다 — 블로그/카톡에 Ctrl+V`);
        } catch {
          showToast(`${label} 이미지 복사 실패 — 브라우저가 지원하지 않습니다`);
        }
      }, 'image/png');
    } catch (err) {
      console.error('section copy:', err);
      showToast(`${label} 복사 중 오류가 발생했습니다`);
    } finally {
      setBusy(null);
    }
  };

  // ── 클립보드
  // 링크 복사 — 카톡/SNS 공유용
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

  // 네이버 블로그 글쓰기 페이지 단축 (사용자가 OS 캡처로 이미지 직접 붙여넣기)
  const handleNaverBlog = () => {
    setBusy('naver');
    try {
      window.open('https://blog.naver.com/GoBlogWrite.naver', '_blank', 'noopener');
      showToast('네이버 블로그 글쓰기 페이지가 열렸습니다');
    } finally {
      setTimeout(() => setBusy(null), 300);
    }
  };

  return (
    <div className="report-shell">
      {/* 액션 바 — 사용자는 OS 캡처 도구(Win+Shift+S 등)로 직접 캡처 후 붙여넣음 */}
      <div className="report-actions no-print">
        <div className="report-actions-inner">
          <button onClick={handleNaverBlog} disabled={busy !== null} className="action-btn primary">
            {busy === 'naver' ? <Loader2 className="spin" /> : <PenLine />}
            네이버 블로그 작성
          </button>
          <button onClick={handleCopyLink} disabled={busy !== null} className="action-btn">
            {busy === 'link' ? <Loader2 className="spin" /> : <Link2 />}
            링크 복사
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
              data-html2canvas-ignore="true"
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
              {/* 단원별 문항 분포 — 도넛 차트 + 범례 */}
              <div className="info-block">
                <div className="info-label">
                  <PieChart />
                  단원별 문항 분포
                </div>
                {unitDist.length === 0 ? (
                  <div className="empty">데이터 없음</div>
                ) : (
                  <div className="donut-row">
                    <DonutChart items={unitDist} total={data.stats.total} />
                    <div className="donut-legend">
                      {unitDist.map((u, i) => (
                        <div key={i} className="donut-legend-row">
                          <span
                            className="donut-legend-dot"
                            style={{ background: UNIT_COLORS[i % UNIT_COLORS.length] }}
                          />
                          <span className="donut-legend-name">{u.name}</span>
                          <span className="donut-legend-pct">
                            <strong>{u.pct}%</strong>
                            <span className="donut-legend-count">{u.count}문항</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                data-html2canvas-ignore="true"
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

        {/* SECTION 03 — 고난도 분석 */}
        {data.analysis && data.analysis.hardQuestions.length > 0 && (
          <section ref={sec3Ref} className="report-section">
            <div className="section-head">
              <div className="section-bar" />
              <h2 className="section-title">3. 상대적 고난도 문항 심층 분석</h2>
              <button
                className="section-copy-btn no-print"
                data-html2canvas-ignore="true"
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
