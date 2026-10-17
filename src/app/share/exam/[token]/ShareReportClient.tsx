'use client';

// ============================================================================
// 학부모/블로그 공유 리포트 — 클라이언트
// 인디고+크림+골드 / 친근하고 따뜻한 학원 보고서
// 클립보드: 이미지 / HTML / 링크 / PNG 다운로드 / 인쇄
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
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
  X,
} from 'lucide-react';

const HINT_DISMISSED_KEY = 'share-report.capture-hint.dismissed';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { DEFAULT_BRAND, type ReportBrand } from '@/lib/report/report-brand';
import { ExamProblemRenderer } from '@/components/shared/ExamProblemRenderer';
import type { ExamProblemData } from '@/lib/exam/exam-problem-mapper';
import { hardQuestionLabel } from '@/lib/report/hard-label';
import { unescapeLiteralNewlines } from '@/lib/ai/text-cleanup';
import './report.css';

interface ShareReportClientProps {
  /** ★ 학원별 브랜드 (2026-10-12) — 없으면 과사람 기본 */
  brand?: ReportBrand;
  /** ★ 로그인한 선생님인가 — false 면 운영자 도구(액션 바·섹션 복사·캡처 안내)를 렌더하지 않는다 (2026-10-13) */
  isOperator?: boolean;
  data: {
    intro?: { school: string | null; metaLine: string | null; gradeShort?: string | null };
    hardProblems?: Record<string, ExamProblemData>;
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
        /** ★ false 면 공략 숨김 (검산 실패, 2026-10-12) */
        strategyVerified?: boolean;
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
// ★ 디자인별 차트 팔레트 (2026-10-13 대표 캡처: 초록 디자인인데 도넛이 주황) — 마지막 색은 6번째 이후 단원 fallback
const UNIT_PALETTES: Record<string, string[]> = {
  'cream-orange': ['#DD6B20', '#ED8936', '#F6AD55', '#FBD38D', '#FEEBC8', '#CBD5E0'],
  'navy-gold': ['#1a2744', '#2E4270', '#b89a5a', '#D4B978', '#EADFBF', '#CBD5E0'],
  forest: ['#1F4D3A', '#2F6B52', '#5E9C7E', '#9CC5A1', '#D3E6D4', '#CBD5E0'],
  slate: ['#1E293B', '#334155', '#2563EB', '#60A5FA', '#BFDBFE', '#CBD5E0'],
  mono: ['#111111', '#3F3F46', '#71717A', '#A1A1AA', '#D4D4D8', '#E4E4E7'],
};
const unitPalette = (key: string): string[] => UNIT_PALETTES[key] || UNIT_PALETTES['cream-orange'];

interface DonutSlice {
  name: string;
  count: number;
  pct: number;
}

function DonutChart({ items, total, palette }: { items: DonutSlice[]; total: number; palette: string[] }) {
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
    const color = palette[idx % palette.length];
    startAngle = endAngle;
    return { path, color };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {slices.map((s, i) => (
        <path key={i} d={s.path} fill={s.color} stroke="white" strokeWidth="2" />
      ))}
      {/* 중앙 텍스트 — 3줄 묶음을 cy 기준 시각 중앙에 위치
          (SVG <text> 기본 정렬은 alphabetic baseline 이라 그대로 두면 ~7px 아래로 처짐) */}
      <text x={cx} y={cy - 15} textAnchor="middle" fontSize="10" fill="#6B7280" fontWeight="600" letterSpacing="0.5">
        TOTAL
      </text>
      <text x={cx} y={cy + 7} textAnchor="middle" fontSize="22" fill="#1F2937" fontWeight="800">
        {total}
      </text>
      <text x={cx} y={cy + 21} textAnchor="middle" fontSize="9" fill="#9CA3AF" fontWeight="500">
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

export function ShareReportClient({ data, brand = DEFAULT_BRAND, isOperator = false }: ShareReportClientProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const sec1Ref = useRef<HTMLElement>(null); // 1. 기본 정보
  const sec2Ref = useRef<HTMLElement>(null); // 2. 종합 분석
  const sec3Ref = useRef<HTMLElement>(null); // 3. 고난도 분석
  const [busy, setBusy] = useState<null | 'link' | 'naver' | 'sec1' | 'sec2' | 'sec3'>(null);
  const [toast, setToast] = useState<string | null>(null);
  // 캡처 안내 배너 — 사용자가 X 버튼으로 닫으면 localStorage 에 저장 (다음 방문에도 안 보임)
  const [hintVisible, setHintVisible] = useState<boolean>(false);
  useEffect(() => {
    try {
      setHintVisible(localStorage.getItem(HINT_DISMISSED_KEY) !== '1');
    } catch {
      setHintVisible(true);
    }
  }, []);
  const dismissHint = () => {
    setHintVisible(false);
    try {
      localStorage.setItem(HINT_DISMISSED_KEY, '1');
    } catch {
      /* localStorage 비활성 환경은 무시 */
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  // ── 단원별 분포 (analysis 기준)
  const unitDist = (data.analysis?.unitAnalyses || []).map((u) => ({
    name: u.majorUnit,
    count: u.questionNumbers.length,
    pct: data.stats.total > 0 ? Math.round((u.questionNumbers.length / data.stats.total) * 100) : 0,
  }));

  // ── 「고난도/변별 문항」 라벨 + 정답 미입력(운영자에게만) — 뽑힌 문항의 실제 난이도로 정한다
  const hardQs = data.analysis?.hardQuestions || [];
  const hardMaxDiff = hardQs.reduce((m, q) => Math.max(m, data.hardProblems?.[q.problemId]?.difficulty ?? 0), 0);
  const hardLabel = hardQuestionLabel(hardMaxDiff);
  const hardNoAnswer = hardQs.filter((q) => { const a = data.hardProblems?.[q.problemId]?.answer; return a === undefined || a === null || String(a).trim() === ''; }).map((q) => q.number);

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
  // html-to-image 사용 (foreignObject 기반 — 브라우저 네이티브 렌더링 보존, 한국어 메트릭 정확).
  // html2canvas 의 한국어 텍스트 처짐 사고를 회피하기 위해 교체됨.
  // 데이터 속성 ignore: data-html2canvas-ignore 로 통일 (배너·복사 버튼 캡처 결과 제외).
  const copySection = async (
    el: HTMLElement | null,
    label: string,
    busyKey: 'sec1' | 'sec2' | 'sec3'
  ) => {
    if (!el) return;
    setBusy(busyKey);
    try {
      const { toBlob } = await import('html-to-image');
      // Pretendard 폰트 100% 로드 대기 — 시스템 폰트 fallback 메트릭 어긋남 차단
      try {
        await document.fonts.ready;
      } catch {
        /* 폰트 API 미지원 환경은 무시 */
      }
      const desired = Math.max(4, (window.devicePixelRatio || 1) * 3);
      const blob = await toBlob(el, {
        pixelRatio: desired,
        backgroundColor: '#ffffff',
        cacheBust: true,
        // data-html2canvas-ignore 속성이 붙은 노드는 캡처에서 제외
        filter: (node) => {
          if (node instanceof HTMLElement) {
            return node.getAttribute('data-html2canvas-ignore') !== 'true';
          }
          return true;
        },
      });
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
    <div className="report-shell" data-brand={brand.key} data-op={isOperator ? "1" : "0"}>
      {/* 액션 바 — 사용자는 OS 캡처 도구(Win+Shift+S 등)로 직접 캡처 후 붙여넣음 */}
      {isOperator && (
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
      )}

      {toast && (
        <div className="report-toast">
          <Check />
          {toast}
        </div>
      )}

      {/* 캡처 안내 — 두 가지 방법. X 로 닫으면 localStorage 저장 (OS 캡처 시 화면에서도 사라짐) */}
      {isOperator && hintVisible && (
        <div className="capture-hint no-print" data-html2canvas-ignore="true">
          <div className="capture-hint-inner">
            <span className="capture-hint-icon">💡</span>
            <span className="capture-hint-text">
              <b>캡처 두 가지 방법</b> &nbsp;·&nbsp;
              <b>① 섹션 복사 버튼</b>: 섹션 단위로 한 번에 클립보드 복사 (빠름) &nbsp;|&nbsp;
              <b>② 직접 캡처</b>: <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> (Windows) /
              <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>4</kbd> (Mac) 로 원하는 영역 자유 캡처 (가장 정확)
            </span>
            <button
              type="button"
              onClick={dismissHint}
              className="capture-hint-close"
              aria-label="안내 닫기"
              title="안내 닫기 (다시 보지 않음)"
            >
              <X />
            </button>
          </div>
        </div>
      )}

      {/* 보고서 본문 */}
      <article ref={reportRef} className="report-paper">
        {/* HEADER */}
        <header className="report-header">
          <div className="header-left">
            <div className="header-eyebrow">{brand.eyebrow}</div>
            {/* ★ 학교명을 제목으로 (2026-10-12 대표: "본문에 학교명이 나오게") — 시험지 제목은 그 아래 한 줄 */}
            <h1 className="header-title">
              <span className="accent">{data.intro?.school || data.exam.title}</span>
              {data.intro?.school ? `${data.intro.gradeShort ? ` ${data.intro.gradeShort}` : ''} 기출 분석` : ' 분석'}
            </h1>
            {data.intro?.school && (
              <div className="header-sub">
                {data.intro.metaLine ? `${data.intro.metaLine} · ` : ''}{data.exam.title}
              </div>
            )}
            <div className="header-title-bar" />
          </div>
          <div className="header-right">
            {brand.showChip && <div className="header-brand">{brand.name}</div>}
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
                    <DonutChart items={unitDist} total={data.stats.total} palette={unitPalette(brand.key)} />
                    <div className="donut-legend">
                      {unitDist.map((u, i) => (
                        <div key={i} className="donut-legend-row">
                          <span
                            className="donut-legend-dot"
                            style={{ background: unitPalette(brand.key)[i % 6] }}
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
                <MixedContentRenderer content={unescapeLiteralNewlines(data.analysis.summary)} />
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
                          <MixedContentRenderer content={unescapeLiteralNewlines(u.keyPoints)} />
                        </div>
                      </div>
                      <div className="unit-kv">
                        <div className="unit-kv-key navy">대비전략</div>
                        <div className="unit-kv-val">
                          <MixedContentRenderer content={unescapeLiteralNewlines(u.strategy)} />
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
              <h2 className="section-title">3. {hardLabel} 심층 분석</h2>
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
            {isOperator && hardNoAnswer.length > 0 && (
              <p className="no-print" style={{ margin: '0 0 12px', padding: '8px 12px', borderRadius: 8, fontSize: 12, background: 'rgba(0,0,0,.06)' }}>
                운영자 안내 — {hardNoAnswer.join('·')}번은 <b>정답이 입력돼 있지 않아</b> 공략 검산이 기준 답 없이 돌았습니다. 시험지에서 정답을 넣고 재생성하면 검산이 정답과 대조합니다. (학부모 화면엔 안 보임)
              </p>
            )}
            <div className="hard-grid">
              {data.analysis.hardQuestions.map((q, i) => (
                <div key={i} className="hard-card">
                  <span className="hard-badge">
                    <AlertTriangle />
                    {hardLabel}
                  </span>
                  <div className="hard-head">
                    <span className="hard-num">{q.number}</span>
                    <h3 className="hard-title"><MixedContentRenderer content={q.subTitle || `${q.number}번 문항`} inline /></h3>
                  </div>
                  {/* ★ 실제 문제 배치 (2026-10-12 대표: "문제 분석 때 문제를 실제 배치") — 시험지와 같은 렌더러 */}
                  {data.hardProblems?.[q.problemId] && (
                    <div className="hard-problem">
                      <ExamProblemRenderer
                        problem={{ ...data.hardProblems[q.problemId], number: q.number }}
                        textSize="13.5px"
                        maxFigureWidth={260}
                        numberOnTop
                      />
                    </div>
                  )}
                  <div className="hard-section">
                    <div className="hard-section-label">
                      <Target />
                      출제 의도
                    </div>
                    <div className="hard-section-body">
                      <MixedContentRenderer content={unescapeLiteralNewlines(q.intent)} />
                    </div>
                  </div>
                  {/* ★ 검산 실패(strategyVerified === false) 공략은 학부모에게 내보내지 않는다 (2026-10-12) */}
                  {q.strategyVerified !== false && (
                    <div className="hard-section">
                      <div className="hard-section-label">
                        <Lightbulb />
                        공략 (해결전략)
                      </div>
                      <div className="hard-strategy-box">
                        <StepStrategy text={unescapeLiteralNewlines(q.strategy)} />
                      </div>
                    </div>
                  )}
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

        {/* ★ 학원 푸터 — 브랜드에 footer 가 있을 때만 (과사람 기본은 종전처럼 없음) */}
        {brand.footer && (
          <footer className="report-footer">
            <div className="footer-row">
              <span className="footer-brand">{brand.name}</span>
              <span>{brand.footer}</span>
            </div>
          </footer>
        )}

      </article>
    </div>
  );
}
