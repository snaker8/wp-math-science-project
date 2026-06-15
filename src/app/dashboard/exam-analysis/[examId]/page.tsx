'use client';

// ============================================================================
// 시험지 유형 분석 페이지
// /dashboard/exam-analysis/[examId]
// ============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Share2,
} from 'lucide-react';
import { useExamProblems, useExamList } from '@/hooks/useExamProblems';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { useSmartBack } from '@/lib/navigation/useSmartBack';
import { AIInsightTabs } from './AIInsightTabs';
import StudentsTab from './StudentsTab';
import type { ExamAIAnalysis } from '@/types/exam-ai-analysis';
import './exam-analysis.css';

type TopTab = 'analysis' | 'students';

const DOMAIN_LABELS: Record<string, string> = {
  CALCULATION: '계산',
  UNDERSTANDING: '이해',
  INFERENCE: '추론',
  PROBLEM_SOLVING: '문제해결',
};

const DOMAIN_ORDER = ['CALCULATION', 'UNDERSTANDING', 'INFERENCE', 'PROBLEM_SOLVING'];

const SUBJECT_CODE_NAMES: Record<string, string> = {
  '01': '중1-1', '02': '중1-2', '03': '중2-1', '04': '중2-2',
  '05': '중3-1', '06': '중3-2',
  '07': '공통수학1', '08': '공통수학2', '09': '대수',
  '10': '미적분1', '11': '확률과 통계', '12': '미적분2', '13': '기하',
};

// MS07-04-01-02 → "공통수학1 > 방정식과 부등식" 같은 단원명 (대단원만)
function parseTypeCodeToUnit(typeCode: string): { subjectCode: string; unitCode: string; display: string } {
  // MS07-04-01-02 또는 MS07-04 (단축)
  const m = typeCode?.match(/^MS(\d{2})-(\d{2})/);
  if (!m) return { subjectCode: '', unitCode: '', display: '미분류' };
  const subjectCode = m[1];
  const unitCode = m[2];
  // ★ 알 수 없는 과목 코드(01~13 외)는 AI 환각으로 간주해 미분류 처리
  if (!SUBJECT_CODE_NAMES[subjectCode]) {
    return { subjectCode: '', unitCode: '', display: '미분류' };
  }
  return { subjectCode, unitCode, display: `${subjectCode}-${unitCode}` };
}

export default function ExamAnalysisPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params?.examId as string;
  const goBack = useSmartBack(`/dashboard/cloud/${examId}`);

  const { exams } = useExamList();
  const { problems, isLoading } = useExamProblems(examId);
  const [unitNameMap, setUnitNameMap] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  // AI 분석 상태
  const [aiAnalysis, setAiAnalysis] = useState<ExamAIAnalysis | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // 학부모 공유 상태
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);

  // 상단 탭 — 유형 분석 vs 학생 채점
  const [topTab, setTopTab] = useState<TopTab>('analysis');

  const exam = useMemo(() => exams.find((e) => e.id === examId), [exams, examId]);

  // 페이지 진입 시 캐시된 AI 분석 조회
  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/exams/${examId}/ai-analysis`);
        if (!r.ok) return;
        const d = (await r.json()) as { analysis: ExamAIAnalysis | null };
        if (!cancelled && d.analysis) {
          setAiAnalysis(d.analysis);
        }
      } catch (err) {
        console.error('[ExamAnalysis] AI cache fetch failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  // 학부모 공유 — 토큰 생성/조회 + 링크 복사
  const handleShareParent = async () => {
    if (!examId || isSharing) return;
    setIsSharing(true);
    try {
      // 1. 기존 토큰 확인
      let token = shareToken;
      if (!token) {
        const r = await fetch(`/api/exams/${examId}/share`);
        const d = await r.json();
        token = d.shareToken || null;
      }
      // 2. 없으면 생성
      if (!token) {
        const r2 = await fetch(`/api/exams/${examId}/share`, { method: 'POST' });
        const d2 = await r2.json();
        token = d2.shareToken || null;
      }
      if (!token) {
        setShareToast('공유 링크 생성 실패');
        return;
      }
      setShareToken(token);
      const url = `${window.location.origin}/share/exam/${token}`;
      // 새 탭에서 학부모 페이지 오픈 (링크 복사는 그 페이지 상단에서)
      window.open(url, '_blank', 'noopener');
      setShareToast('학부모 페이지가 새 탭에 열렸습니다');
    } catch (err) {
      console.error('[ExamAnalysis] share error:', err);
      setShareToast('공유 링크 생성 중 오류 발생');
    } finally {
      setIsSharing(false);
      setTimeout(() => setShareToast(null), 4000);
    }
  };

  // AI 분석 생성/재생성
  const handleGenerateAI = async (force = false) => {
    if (!examId) return;
    setIsGeneratingAI(true);
    setAiError(null);
    try {
      const r = await fetch(`/api/exams/${examId}/ai-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force, hardDifficultyThreshold: 7, hardQuestionLimit: 4 }),
      });
      const d = (await r.json()) as {
        analysis?: ExamAIAnalysis;
        error?: string;
        detail?: string;
      };
      if (!r.ok) {
        setAiError(d.error || `HTTP ${r.status}`);
        console.error('[ExamAnalysis] AI generate failed:', d);
        return;
      }
      if (d.analysis) setAiAnalysis(d.analysis);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI 분석 생성 실패';
      setAiError(msg);
      console.error('[ExamAnalysis] AI generate error:', err);
    } finally {
      setIsGeneratingAI(false);
    }
  };

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
    // 한글/CJK 글자는 2칸, ASCII는 1칸으로 계산 — 모노스페이스/비모노스페이스 모두 적당히 정렬
    const charWidth = (s: string): number =>
      [...s].reduce((w, c) => {
        const code = c.codePointAt(0) || 0;
        // CJK 범위: 한글, 한자, 일본어 + 전각 기호
        if ((code >= 0x1100 && code <= 0x115F) || (code >= 0x2E80 && code <= 0x9FFF) ||
            (code >= 0xAC00 && code <= 0xD7AF) || (code >= 0xFF00 && code <= 0xFF60)) return w + 2;
        return w + 1;
      }, 0);
    const padR = (s: string, width: number): string => s + ' '.repeat(Math.max(0, width - charWidth(s)));
    const padL = (s: string, width: number): string => ' '.repeat(Math.max(0, width - charWidth(s))) + s;

    const title = exam?.title || '시험지';
    const lines: string[] = [];
    const hr = '━'.repeat(50);
    const sep = '─'.repeat(50);

    lines.push(hr);
    lines.push('  과사람 유형 분석 리포트');
    lines.push(hr);
    lines.push(`  시험지       : ${title}`);
    lines.push(`  총 문항      : ${stats.total}문항 (${stats.totalPoints}점)`);
    lines.push(`  평균 난이도  : ${stats.avgDifficulty.toFixed(1)} (${avgDifficultyLabel})`);
    lines.push(`  고유 유형 수 : ${stats.uniqueTypeCount}개`);
    lines.push(`  과목 범위    : ${stats.subjectsInExam.map((c) => SUBJECT_CODE_NAMES[c] || c).join(' / ') || '-'}`);
    lines.push(`  미분류       : ${unclassifiedCount}문항`);
    lines.push('');

    // 난이도 분포
    lines.push('▶ 난이도 분포');
    lines.push(sep);
    Object.entries(stats.diffDist).forEach(([k, v]) => {
      const pct = stats.total > 0 ? `${((v / stats.total) * 100).toFixed(0)}%` : '0%';
      lines.push(`  난이도 ${padL(k, 2)} : ${padL(`${v}문항`, 7)}  (${padL(pct, 4)})`);
    });
    lines.push('');

    // 인지영역 분포
    lines.push('▶ 인지영역 분포');
    lines.push(sep);
    const domainLabelWidth = Math.max(...DOMAIN_ORDER.map((d) => charWidth(DOMAIN_LABELS[d])));
    DOMAIN_ORDER.forEach((d) => {
      const c = stats.domDist[d] || 0;
      const pct = stats.total > 0 ? `${((c / stats.total) * 100).toFixed(0)}%` : '0%';
      lines.push(`  ${padR(DOMAIN_LABELS[d], domainLabelWidth)} : ${padL(`${c}문항`, 7)}  (${padL(pct, 4)})`);
    });
    lines.push('');

    // 단원별 분포
    lines.push('▶ 단원별 분포 (대단원 기준)');
    lines.push(sep);
    const unitRows = unitEntries.map(([k, v]) => {
      const unitName = unitNameMap[k] || k;
      const subjCode = k.split('-')[0];
      const subjName = SUBJECT_CODE_NAMES[subjCode] || subjCode;
      const pct = stats.total > 0 ? `${((v / stats.total) * 100).toFixed(0)}%` : '0%';
      return { subjName, unitName, v, pct };
    });
    const maxSubjW = unitRows.length > 0 ? Math.max(...unitRows.map(r => charWidth(r.subjName))) : 0;
    const maxUnitW = unitRows.length > 0 ? Math.max(...unitRows.map(r => charWidth(r.unitName))) : 0;
    unitRows.forEach((r) => {
      lines.push(`  ${padR(r.subjName, maxSubjW)}  ${padR(r.unitName, maxUnitW)} : ${padL(`${r.v}문항`, 7)}  (${padL(r.pct, 4)})`);
    });
    if (unclassifiedCount > 0) {
      const pct = stats.total > 0 ? `${((unclassifiedCount / stats.total) * 100).toFixed(0)}%` : '0%';
      lines.push(`  ${padR('', maxSubjW)}  ${padR('미분류', maxUnitW)} : ${padL(`${unclassifiedCount}문항`, 7)}  (${padL(pct, 4)})`);
    }
    lines.push('');

    // 문제별 상세 — 문제 내용/해설 텍스트는 제외, 메타정보만
    lines.push('▶ 문제별 상세');
    lines.push(sep);
    const tableRows = problems.map((p) => ({
      num: String(p.number),
      code: p.typeCode || '-',
      name: (p as any).typeName || '-',
      diff: p.difficulty > 0 ? String(p.difficulty) : '-',
      dom: DOMAIN_LABELS[p.cognitiveDomain] || p.cognitiveDomain,
      ans: String(p.answer ?? '-'),
    }));
    const wNum = Math.max(2, ...tableRows.map(r => charWidth(r.num)));
    const wCode = Math.max(charWidth('유형코드'), ...tableRows.map(r => charWidth(r.code)));
    const wName = Math.max(charWidth('유형명'), ...tableRows.map(r => charWidth(r.name)));
    const wDiff = Math.max(charWidth('난이도'), ...tableRows.map(r => charWidth(r.diff)));
    const wDom = Math.max(charWidth('인지영역'), ...tableRows.map(r => charWidth(r.dom)));
    const wAns = Math.max(charWidth('정답'), ...tableRows.map(r => charWidth(r.ans)));
    // 헤더
    lines.push(`  ${padL('#', wNum)}  ${padR('유형코드', wCode)}  ${padR('유형명', wName)}  ${padR('난이도', wDiff)}  ${padR('인지영역', wDom)}  ${padL('정답', wAns)}`);
    lines.push(`  ${'-'.repeat(wNum)}  ${'-'.repeat(wCode)}  ${'-'.repeat(wName)}  ${'-'.repeat(wDiff)}  ${'-'.repeat(wDom)}  ${'-'.repeat(wAns)}`);
    tableRows.forEach((r) => {
      lines.push(`  ${padL(r.num, wNum)}  ${padR(r.code, wCode)}  ${padR(r.name, wName)}  ${padL(r.diff, wDiff)}  ${padR(r.dom, wDom)}  ${padL(r.ans, wAns)}`);
    });

    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
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
          <button type="button" onClick={goBack}>
            <ArrowLeft className="inline h-3.5 w-3.5" style={{ marginRight: 4 }} />
            시험지 편집
          </button>
          <span className="sep">/</span>
          <span className="title">{exam.title}</span>
          <div
            style={{
              display: 'inline-flex',
              marginLeft: 12,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: 2,
            }}
          >
            <button
              type="button"
              onClick={() => setTopTab('analysis')}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 6,
                background: topTab === 'analysis' ? '#4f46e5' : 'transparent',
                color: topTab === 'analysis' ? '#fff' : 'rgba(255,255,255,0.6)',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              유형 분석
            </button>
            <button
              type="button"
              onClick={() => setTopTab('students')}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 6,
                background: topTab === 'students' ? '#4f46e5' : 'transparent',
                color: topTab === 'students' ? '#fff' : 'rgba(255,255,255,0.6)',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              학생 채점
            </button>
          </div>
        </div>
        <div className="ea-subbar-actions">
          {topTab === 'analysis' && (
            <>
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
                className="ea-btn"
                onClick={handleShareParent}
                disabled={isSharing}
                title="학부모용 공개 분석 리포트 링크 생성/복사"
              >
                {isSharing ? <Loader2 className="animate-spin" /> : <Share2 />}
                {isSharing ? '생성 중...' : '학부모 공유'}
              </button>
            </>
          )}
          <button
            type="button"
            className="ea-btn primary"
            onClick={() => router.push(`/dashboard/cloud/${examId}`)}
          >
            <Download />
            시험지로 이동
          </button>
        </div>
        {shareToast && (
          <div
            style={{
              position: 'fixed',
              bottom: 32,
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#1A1A1F',
              color: '#fff',
              padding: '12px 20px',
              borderRadius: 12,
              fontSize: 13,
              zIndex: 100,
              maxWidth: '90vw',
              boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
            }}
          >
            {shareToast}
          </div>
        )}
      </div>

      {/* ═══════ BODY ═══════ */}
      <div className="ea-body">
        {topTab === 'students' && (
          <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
            <StudentsTab examId={examId} />
          </div>
        )}
        {topTab === 'analysis' && (
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

          {/* AI 분석 패널 (시험총평·단원별·고난도) */}
          <AIInsightTabs
            analysis={aiAnalysis}
            isGenerating={isGeneratingAI}
            onGenerate={handleGenerateAI}
            error={aiError}
          />

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
        )}
      </div>
    </div>
  );
}
