'use client';

// ============================================================================
// 시험지 유형 분석 페이지
// /dashboard/exam-analysis/[examId]
// ============================================================================

import React, { useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BarChart3,
  PieChart as PieIcon,
  Target,
  Layers,
  Brain,
  Printer,
  ImageDown,
  Copy,
  Download,
  AlertCircle,
  Loader2,
  TableIcon,
} from 'lucide-react';
import { useExamProblems, useExamList } from '@/hooks/useExamProblems';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import './exam-analysis.css';

const DOMAIN_LABELS: Record<string, string> = {
  CALCULATION: '계산',
  UNDERSTANDING: '이해',
  INFERENCE: '추론',
  PROBLEM_SOLVING: '문제해결',
};

const DOMAIN_ORDER = ['CALCULATION', 'UNDERSTANDING', 'INFERENCE', 'PROBLEM_SOLVING'];

// MS07-04-01-02 → "공통수학1 > 방정식과 부등식" 같은 단원명 (대단원만)
function parseTypeCodeToUnit(typeCode: string): { subjectCode: string; unitCode: string; display: string } {
  // MS07-04-01-02 또는 MS07-04 (단축)
  const m = typeCode?.match(/^MS(\d{2})-(\d{2})/);
  if (!m) return { subjectCode: '', unitCode: '', display: '미분류' };
  const subjectCode = m[1];
  const unitCode = m[2];
  return { subjectCode, unitCode, display: `${subjectCode}-${unitCode}` };
}

const SUBJECT_CODE_NAMES: Record<string, string> = {
  '01': '중1-1', '02': '중1-2', '03': '중2-1', '04': '중2-2',
  '05': '중3-1', '06': '중3-2',
  '07': '공통수학1', '08': '공통수학2', '09': '대수',
  '10': '미적분1', '11': '확률과 통계', '12': '미적분2', '13': '기하',
};

export default function ExamAnalysisPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params?.examId as string;

  const { exams } = useExamList();
  const { problems, isLoading } = useExamProblems(examId);
  const [unitNameMap, setUnitNameMap] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  const exam = useMemo(() => exams.find((e) => e.id === examId), [exams, examId]);

  // 수학비서 트리에서 단원명 Lookup
  React.useEffect(() => {
    if (!problems.length) return;
    const subjectCodes = new Set<string>();
    problems.forEach((p) => {
      const code = parseTypeCodeToUnit(p.typeCode || '').subjectCode;
      if (code) subjectCodes.add(code);
    });
    subjectCodes.forEach(async (code) => {
      try {
        const r = await fetch(`/api/mathsecr/tree?subject=${code}`);
        const d = await r.json();
        if (d.tree && d.tree.ch) {
          const map: Record<string, string> = {};
          d.tree.ch.forEach((unit: any) => {
            map[`${code}-${unit.c}`] = unit.t;
          });
          setUnitNameMap((prev) => ({ ...prev, ...map }));
        }
      } catch (e) {
        // ignore
      }
    });
  }, [problems]);

  // ===== 통계 계산 =====
  const stats = useMemo(() => {
    const total = problems.length;
    const totalPoints = problems.reduce((sum, p) => sum + ((p as any).points || 4), 0);
    const avgDifficulty =
      total > 0
        ? problems.reduce((sum, p) => sum + (p.difficulty || 0), 0) / total
        : 0;

    // 유형 코드
    const typeCodeSet = new Set(problems.map((p) => p.typeCode || '').filter(Boolean));

    // 난이도 분포 (1~10)
    const diffDist: Record<number, number> = {};
    for (let i = 1; i <= 10; i++) diffDist[i] = 0;
    problems.forEach((p) => {
      const d = Math.min(10, Math.max(1, p.difficulty || 0));
      if (d > 0) diffDist[d] = (diffDist[d] || 0) + 1;
    });

    // 인지영역 분포
    const domDist: Record<string, number> = {};
    DOMAIN_ORDER.forEach((d) => (domDist[d] = 0));
    problems.forEach((p) => {
      const d = p.cognitiveDomain || 'UNDERSTANDING';
      domDist[d] = (domDist[d] || 0) + 1;
    });

    // 단원 분포 (대단원 기준 MS{subject}-{unit})
    const unitDist: Record<string, number> = {};
    problems.forEach((p) => {
      const parsed = parseTypeCodeToUnit(p.typeCode || '');
      const key = parsed.display;
      unitDist[key] = (unitDist[key] || 0) + 1;
    });

    // 커버리지
    const subjectsInExam = new Set<string>();
    Object.keys(unitDist).forEach((key) => {
      const subj = key.split('-')[0];
      if (subj) subjectsInExam.add(subj);
    });

    return {
      total,
      totalPoints,
      avgDifficulty,
      uniqueTypeCount: typeCodeSet.size,
      diffDist,
      domDist,
      unitDist,
      subjectsInExam: Array.from(subjectsInExam),
    };
  }, [problems]);

  const diffMax = Math.max(...Object.values(stats.diffDist), 1);
  const domMax = Math.max(...Object.values(stats.domDist), 1);
  const unitMax = Math.max(...Object.values(stats.unitDist), 1);

  const unitEntries = useMemo(() => {
    return Object.entries(stats.unitDist)
      .filter(([k]) => k !== '미분류')
      .sort((a, b) => b[1] - a[1]);
  }, [stats.unitDist]);

  const unclassifiedCount = stats.unitDist['미분류'] || 0;

  const avgDifficultyLabel = useMemo(() => {
    const d = stats.avgDifficulty;
    if (d === 0) return '—';
    if (d < 3) return '하';
    if (d < 5) return '중하';
    if (d < 7) return '중';
    if (d < 9) return '상';
    return '최상';
  }, [stats.avgDifficulty]);

  const handleCopyReportText = async () => {
    const lines = [
      `[${exam?.title || '시험지'}] 유형 분석 리포트`,
      `총 문항: ${stats.total}문항 (${stats.totalPoints}점)`,
      `평균 난이도: ${stats.avgDifficulty.toFixed(1)} (${avgDifficultyLabel})`,
      `고유 유형 수: ${stats.uniqueTypeCount}개`,
      `\n## 난이도 분포`,
      ...Object.entries(stats.diffDist)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `난이도 ${k}: ${v}문항`),
      `\n## 인지영역 분포`,
      ...DOMAIN_ORDER.map((d) => `${DOMAIN_LABELS[d]}: ${stats.domDist[d]}문항`),
      `\n## 단원별 분포`,
      ...unitEntries.map(([k, v]) => {
        const unitName = unitNameMap[k] || k;
        const subjCode = k.split('-')[0];
        const subjName = SUBJECT_CODE_NAMES[subjCode] || subjCode;
        return `${subjName} > ${unitName}: ${v}문항`;
      }),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      alert('분석 데이터가 클립보드에 복사되었습니다');
    } catch {
      alert('클립보드 복사에 실패했습니다');
    }
  };

  const handleDownloadPng = async () => {
    const el = captureRef.current;
    if (!el || isExporting) return;
    setIsExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: getComputedStyle(el).getPropertyValue('background-color') || '#ffffff',
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      } as any);
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const safeTitle = (exam?.title || 'exam').replace(/[\\/:*?"<>|]/g, '_');
      link.download = `${safeTitle}_유형분석.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('[ExamAnalysis] PNG export failed:', err);
      alert('이미지 저장에 실패했습니다');
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="ea-shell">
        <div className="ea-empty">
          <div className="ea-empty-ic">
            <Loader2 className="animate-spin" />
          </div>
          <div>문제 분석 중...</div>
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="ea-shell">
        <div className="ea-empty">
          <div className="ea-empty-ic">
            <AlertCircle />
          </div>
          <div>시험지를 찾을 수 없습니다</div>
          <button
            type="button"
            className="ea-btn"
            style={{ marginTop: 16 }}
            onClick={() => router.push('/dashboard/cloud')}
          >
            시험지 목록으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ea-shell">
      {/* ═══════ SUBBAR ═══════ */}
      <div className="ea-subbar">
        <div className="ea-crumbs">
          <button type="button" onClick={() => router.push(`/dashboard/cloud/${examId}`)}>
            <ArrowLeft className="inline h-3.5 w-3.5" style={{ marginRight: 4 }} />
            시험지 편집
          </button>
          <span className="sep">/</span>
          <span className="title">{exam.title}</span>
          <span className="page-chip">유형 분석</span>
        </div>
        <div className="ea-subbar-actions">
          <button type="button" className="ea-btn" onClick={handleCopyReportText}>
            <Copy />
            분석 데이터 복사
          </button>
          <button type="button" className="ea-btn" onClick={handleDownloadPng} disabled={isExporting}>
            {isExporting ? <Loader2 className="animate-spin" /> : <ImageDown />}
            {isExporting ? '저장 중…' : '이미지 저장'}
          </button>
          <button type="button" className="ea-btn" onClick={() => window.print()}>
            <Printer />
            인쇄
          </button>
          <button
            type="button"
            className="ea-btn primary"
            onClick={() => router.push(`/dashboard/cloud/${examId}`)}
          >
            <Download />
            시험지로 이동
          </button>
        </div>
      </div>

      {/* ═══════ BODY ═══════ */}
      <div className="ea-body">
        <div className="ea-body-inner" ref={captureRef}>
          {/* Stats Row */}
          <div className="ea-stats">
            <div className="ea-stat">
              <div className="ea-stat-label">총 문항</div>
              <div className="ea-stat-value">
                {stats.total}
                <span className="ea-stat-unit">문항</span>
              </div>
              <div className="ea-stat-sub">{stats.totalPoints}점 배점</div>
            </div>
            <div className="ea-stat">
              <div className="ea-stat-label">평균 난이도</div>
              <div className="ea-stat-value">
                {stats.avgDifficulty.toFixed(1)}
                <span className="ea-stat-unit">/ 10</span>
              </div>
              <div className="ea-stat-sub">{avgDifficultyLabel} 구간</div>
            </div>
            <div className="ea-stat">
              <div className="ea-stat-label">고유 유형</div>
              <div className="ea-stat-value">
                {stats.uniqueTypeCount}
                <span className="ea-stat-unit">개</span>
              </div>
              <div className="ea-stat-sub">
                {stats.total > 0 ? `${((stats.uniqueTypeCount / stats.total) * 100).toFixed(0)}% 고유율` : ''}
              </div>
            </div>
            <div className="ea-stat">
              <div className="ea-stat-label">단원 범위</div>
              <div className="ea-stat-value">
                {stats.subjectsInExam.length}
                <span className="ea-stat-unit">과목</span>
              </div>
              <div className="ea-stat-sub">
                {stats.subjectsInExam
                  .map((c) => SUBJECT_CODE_NAMES[c] || c)
                  .slice(0, 2)
                  .join(', ')}
                {stats.subjectsInExam.length > 2 ? ' 외' : ''}
              </div>
            </div>
            <div className="ea-stat">
              <div className="ea-stat-label">미분류</div>
              <div className="ea-stat-value" style={{ color: unclassifiedCount > 0 ? '#fda4af' : undefined }}>
                {unclassifiedCount}
                <span className="ea-stat-unit">문항</span>
              </div>
              <div className="ea-stat-sub">{unclassifiedCount > 0 ? '분류 필요' : '완료'}</div>
            </div>
          </div>

          {/* Row: 난이도 + 인지영역 */}
          <div className="ea-row-2">
            <div className="ea-panel">
              <div className="ea-panel-h">
                <BarChart3 />
                난이도 분포
                <span className="sub">1(최하) → 10(최상)</span>
              </div>
              <div className="ea-diff-row">
                {Object.entries(stats.diffDist).map(([level, count]) => {
                  const pct = (count / diffMax) * 100;
                  return (
                    <div key={level} className="ea-diff-col">
                      <div className="ea-diff-bar-wrap">
                        <div
                          className="ea-diff-bar"
                          data-level={level}
                          style={{ height: `${pct}%`, minHeight: count > 0 ? 4 : 0 }}
                        >
                          {count > 0 && <span className="count">{count}</span>}
                        </div>
                      </div>
                      <div className="ea-diff-label">{level}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="ea-panel">
              <div className="ea-panel-h">
                <Brain />
                인지영역 분포
              </div>
              <div className="ea-hbar-list">
                {DOMAIN_ORDER.map((d) => {
                  const count = stats.domDist[d] || 0;
                  const pct = (count / domMax) * 100;
                  return (
                    <div key={d} className={`ea-hbar-row ea-dom-${d}`}>
                      <div className="ea-hbar-label">{DOMAIN_LABELS[d]}</div>
                      <div className="ea-hbar-track">
                        <div className="ea-hbar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="ea-hbar-count">
                        {count} · {stats.total > 0 ? ((count / stats.total) * 100).toFixed(0) : 0}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 단원별 분포 */}
          <div className="ea-panel">
            <div className="ea-panel-h">
              <Layers />
              단원별 분포
              <span className="sub">대단원 기준</span>
            </div>
            {unitEntries.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--chrome-fg-4)', fontSize: 12 }}>
                분류된 문제가 없습니다
              </div>
            ) : (
              <div className="ea-hbar-list">
                {unitEntries.map(([key, count]) => {
                  const pct = (count / unitMax) * 100;
                  const subjCode = key.split('-')[0];
                  const subjName = SUBJECT_CODE_NAMES[subjCode] || subjCode;
                  const unitName = unitNameMap[key] || key;
                  return (
                    <div key={key} className="ea-hbar-row">
                      <div className="ea-hbar-label" title={`${subjName} > ${unitName}`}>
                        <span style={{ color: 'var(--chrome-fg-4)', fontSize: 10, marginRight: 6 }}>{subjName}</span>
                        {unitName}
                      </div>
                      <div className="ea-hbar-track">
                        <div className="ea-hbar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="ea-hbar-count">
                        {count} · {stats.total > 0 ? ((count / stats.total) * 100).toFixed(0) : 0}%
                      </div>
                    </div>
                  );
                })}
                {unclassifiedCount > 0 && (
                  <div className="ea-hbar-row" style={{ opacity: 0.6, marginTop: 8, borderTop: '1px dashed var(--chrome-border-sub)', paddingTop: 10 }}>
                    <div className="ea-hbar-label" style={{ color: '#fda4af' }}>
                      미분류
                    </div>
                    <div className="ea-hbar-track">
                      <div className="ea-hbar-fill" style={{ width: `${(unclassifiedCount / unitMax) * 100}%`, background: '#fb7185' }} />
                    </div>
                    <div className="ea-hbar-count">
                      {unclassifiedCount} · {stats.total > 0 ? ((unclassifiedCount / stats.total) * 100).toFixed(0) : 0}%
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 문제별 상세 테이블 */}
          <div className="ea-panel">
            <div className="ea-panel-h">
              <TableIcon />
              문제별 상세
              <span className="sub">{stats.total}문항</span>
            </div>
            <div className="ea-table-wrap">
              <table className="ea-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>유형 코드</th>
                    <th>유형명</th>
                    <th style={{ width: 80 }}>난이도</th>
                    <th style={{ width: 100 }}>인지영역</th>
                    <th>문제 내용</th>
                  </tr>
                </thead>
                <tbody>
                  {problems.map((p) => (
                    <tr key={p.id}>
                      <td className="num">{p.number}</td>
                      <td className="code">{p.typeCode || '—'}</td>
                      <td>{(p as any).typeName || '—'}</td>
                      <td>
                        {p.difficulty > 0 ? (
                          <span className={`ea-badge diff-${p.difficulty}`}>
                            {p.difficulty}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--chrome-fg-4)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <span className={`ea-badge dom-${p.cognitiveDomain}`}>
                          {DOMAIN_LABELS[p.cognitiveDomain] || p.cognitiveDomain}
                        </span>
                      </td>
                      <td
                        style={{
                          maxWidth: 400,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <div
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          <MixedContentRenderer content={p.content || ''} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
