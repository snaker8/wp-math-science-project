'use client';

// ============================================================================
// AI Insight Tabs — 시험지 단위 AI 분석 결과 패널
// 시험 총평 / 단원별 학습전략 / 고난도 문항 심층분석 (3 tabs)
// ============================================================================

import React, { useState } from 'react';
import { Sparkles, BookOpen, Flame, Loader2 } from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import type { ExamAIAnalysis } from '@/types/exam-ai-analysis';

type TabKey = 'summary' | 'units' | 'hard';

interface AIInsightTabsProps {
  analysis: ExamAIAnalysis | null;
  isGenerating: boolean;
  onGenerate: (force?: boolean) => void;
  error?: string | null;
  /** ★ 공략 선생님 확정/숨김용 (2026-10-13) */
  examId?: string;
  onAnalysisChange?: (a: ExamAIAnalysis) => void;
}

export function AIInsightTabs({
  analysis,
  isGenerating,
  onGenerate,
  error,
  examId,
  onAnalysisChange,
}: AIInsightTabsProps) {
  const [tab, setTab] = useState<TabKey>('summary');

  // 분석 결과 없음 — 생성 버튼만
  if (!analysis) {
    return (
      <div className="ea-panel">
        <div className="ea-panel-h">
          <Sparkles />
          AI 분석
          <span className="sub">시험 총평 · 단원별 학습전략 · 고난도 문항 심층분석</span>
        </div>
        <div style={{ padding: 32, textAlign: 'center' }}>
          <button
            type="button"
            className="ea-btn primary"
            onClick={() => onGenerate(false)}
            disabled={isGenerating}
            style={{ minWidth: 220, justifyContent: 'center' }}
          >
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin" />
                분석 생성 중... (30~60초)
              </>
            ) : (
              <>
                <Sparkles />
                AI 분석 생성
              </>
            )}
          </button>
          <p style={{ fontSize: 11, color: 'var(--chrome-fg-4)', marginTop: 12 }}>
            AI가 시험지 전체를 분석하여 시험 총평·단원별 학습전략·고난도 문항 심층분석을 생성합니다.
          </p>
          {error && (
            <div style={{ marginTop: 12, color: '#fca5a5', fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ea-panel">
      <div className="ea-panel-h" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles />
          AI 분석
          <span className="sub">
            난이도 평가: <strong style={{ color: '#67e8f9' }}>{analysis.overallDifficulty}</strong>
            {' · '}
            <span style={{ fontSize: 10 }}>
              {new Date(analysis.generatedAt).toLocaleDateString('ko-KR')}
            </span>
          </span>
        </div>
        <button
          type="button"
          className="ea-btn"
          onClick={() => onGenerate(true)}
          disabled={isGenerating}
          style={{ fontSize: 11 }}
        >
          {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {isGenerating ? '재생성 중...' : '재생성'}
        </button>
      </div>

      {/* 탭 헤더 (인쇄 시 숨김) */}
      <div
        className="ai-insight-tabs-header no-print"
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--chrome-border-sub)',
          marginBottom: 16,
        }}
      >
        <TabButton active={tab === 'summary'} onClick={() => setTab('summary')} icon={<Sparkles />}>
          시험 총평
        </TabButton>
        <TabButton active={tab === 'units'} onClick={() => setTab('units')} icon={<BookOpen />}>
          단원별 학습전략 ({analysis.unitAnalyses.length})
        </TabButton>
        <TabButton active={tab === 'hard'} onClick={() => setTab('hard')} icon={<Flame />}>
          고난도·변별 문항 ({analysis.hardQuestions.length})
        </TabButton>
      </div>

      {/* 탭 내용 — 모두 항상 DOM에 두되 화면에서는 활성 탭만 표시.
          인쇄 시 모든 섹션이 차례로 보이도록 print-show 클래스로 강제. */}
      <div
        className="print-show"
        style={{ display: tab === 'summary' ? 'block' : 'none' }}
      >
        <PrintHeading screenHidden>시험 총평</PrintHeading>
        <SummaryTab analysis={analysis} />
      </div>
      <div
        className="print-show"
        style={{ display: tab === 'units' ? 'block' : 'none' }}
      >
        <PrintHeading screenHidden>단원별 학습전략</PrintHeading>
        <UnitsTab analysis={analysis} />
      </div>
      <div
        className="print-show"
        style={{ display: tab === 'hard' ? 'block' : 'none' }}
      >
        <PrintHeading screenHidden>고난도·변별 문항 심층분석</PrintHeading>
        <HardTab analysis={analysis} examId={examId} onAnalysisChange={onAnalysisChange} />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 탭 버튼
// ----------------------------------------------------------------------------
function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '10px 16px',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid #06b6d4' : '2px solid transparent',
        color: active ? '#67e8f9' : 'var(--chrome-fg-3)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        transition: 'all 0.15s',
      }}
    >
      {icon}
      {children}
    </button>
  );
}

// ----------------------------------------------------------------------------
// 인쇄 전용 섹션 헤딩 (화면에선 숨김)
// ----------------------------------------------------------------------------
function PrintHeading({
  children,
  screenHidden,
}: {
  children: React.ReactNode;
  screenHidden?: boolean;
}) {
  return (
    <h3
      className="print-only"
      style={
        screenHidden
          ? { display: 'none', fontSize: 16, fontWeight: 700, marginBottom: 8 }
          : { fontSize: 16, fontWeight: 700, marginBottom: 8 }
      }
    >
      {children}
    </h3>
  );
}

// ----------------------------------------------------------------------------
// 탭 1: 시험 총평
// ----------------------------------------------------------------------------
function SummaryTab({ analysis }: { analysis: ExamAIAnalysis }) {
  return (
    <div style={{ padding: '8px 4px' }}>
      <div
        style={{
          background: 'var(--chrome-bg-2)',
          border: '1px solid var(--chrome-border-sub)',
          borderRadius: 8,
          padding: 16,
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: 'var(--chrome-fg-4)', marginBottom: 4 }}>전반적 난이도</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#67e8f9' }}>{analysis.overallDifficulty}</div>
        </div>
        <div style={{ flex: 1, height: 1, background: 'var(--chrome-border-sub)' }} />
        <div style={{ fontSize: 11, color: 'var(--chrome-fg-4)' }}>
          단원 {analysis.unitAnalyses.length}개 · 고난도 {analysis.hardQuestions.length}개
        </div>
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.8,
          color: 'var(--chrome-fg-2)',
          whiteSpace: 'pre-wrap',
        }}
      >
        <MixedContentRenderer content={analysis.summary} />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 탭 2: 단원별 학습전략
// ----------------------------------------------------------------------------
function UnitsTab({ analysis }: { analysis: ExamAIAnalysis }) {
  if (analysis.unitAnalyses.length === 0) {
    return (
      <div style={{ padding: 16, color: 'var(--chrome-fg-4)', fontSize: 12, textAlign: 'center' }}>
        단원 분석이 없습니다
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 12, padding: '4px 0' }}>
      {analysis.unitAnalyses.map((u, i) => (
        <div
          key={i}
          style={{
            background: 'var(--chrome-bg-2)',
            border: '1px solid var(--chrome-border-sub)',
            borderRadius: 8,
            padding: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, color: '#67e8f9', margin: 0 }}>
              {u.majorUnit}
            </h4>
            <span style={{ fontSize: 11, color: 'var(--chrome-fg-4)' }}>
              {u.questionNumbers.length}문항: {u.questionNumbers.join(', ')}번
            </span>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 11,
                color: 'var(--chrome-fg-4)',
                marginBottom: 6,
                fontWeight: 600,
                letterSpacing: 0.4,
              }}
            >
              핵심 포인트
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--chrome-fg-2)' }}>
              <MixedContentRenderer content={u.keyPoints} />
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--chrome-fg-4)',
                marginBottom: 6,
                fontWeight: 600,
                letterSpacing: 0.4,
              }}
            >
              학습 전략
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--chrome-fg-2)' }}>
              <MixedContentRenderer content={u.strategy} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// 탭 3: 고난도 문항 심층분석
// ----------------------------------------------------------------------------
function HardTab({ analysis, examId, onAnalysisChange }: { analysis: ExamAIAnalysis; examId?: string; onAnalysisChange?: (a: ExamAIAnalysis) => void }) {
  // ★ 선생님 수정·확정 (2026-10-13) — 검산에서 떨어진 공략은 리포트에서 숨겨지는데, 선생님이 고쳐 확정하면 다시 나간다
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (number: number, action: 'approve' | 'hide', strategy?: string) => {
    if (!examId) return;
    setBusy(number);
    try {
      const r = await fetch(`/api/exams/${examId}/ai-analysis`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number, action, strategy }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onAnalysisChange?.(d.analysis as ExamAIAnalysis);
      setEditing(null);
      setMsg(action === 'approve' ? `${number}번 공략 확정 — 리포트에 표시됩니다` : `${number}번 공략 숨김`);
    } catch (e) {
      setMsg(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
      setTimeout(() => setMsg(null), 3000);
    }
  };
  if (analysis.hardQuestions.length === 0) {
    return (
      <div style={{ padding: 16, color: 'var(--chrome-fg-4)', fontSize: 12, textAlign: 'center' }}>
        고난도·변별 문항이 없습니다
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 12, padding: '4px 0' }}>
      {analysis.hardQuestions.map((q, i) => (
        <div
          key={i}
          style={{
            background: 'linear-gradient(135deg, rgba(251, 113, 133, 0.06), rgba(244, 114, 182, 0.04))',
            border: '1px solid rgba(244, 114, 182, 0.25)',
            borderRadius: 8,
            padding: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Flame style={{ width: 14, height: 14, color: '#fb7185' }} />
            <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#fda4af' }}>
              {q.number}번 문항
            </h4>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 11,
                color: '#fda4af',
                marginBottom: 6,
                fontWeight: 600,
                letterSpacing: 0.4,
              }}
            >
              출제 의도
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--chrome-fg-2)' }}>
              <MixedContentRenderer content={q.intent} />
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                color: '#fda4af',
                marginBottom: 6,
                fontWeight: 600,
                letterSpacing: 0.4,
              }}
            >
              공략 (해결 전략)
              {/* ★ 검산 상태 (2026-10-12) — 실패면 학부모 리포트에서 숨겨진다. 「AI 분석 생성」을 다시 돌리면 재검산 */}
              {q.strategyVerified === false && (
                <span style={{ marginLeft: 8, fontWeight: 700, color: '#fbbf24' }} title={q.strategyIssue || ''}>
                  ⚠ 검산 실패 — 리포트에서 숨김{q.strategyIssue ? `: ${q.strategyIssue.slice(0, 80)}` : ''}
                </span>
              )}
              {q.strategyVerified === true && q.strategyRevised && (
                <span style={{ marginLeft: 8, fontWeight: 600, color: 'var(--chrome-fg-3)' }}>✓ 검산 후 수정됨</span>
              )}
              {q.strategyVerified === true && !q.strategyRevised && !q.strategyManual && (
                <span style={{ marginLeft: 8, fontWeight: 600, color: 'var(--chrome-fg-3)' }}>✓ 검산 통과</span>
              )}
              {q.strategyManual && q.strategyVerified === true && (
                <span style={{ marginLeft: 8, fontWeight: 600, color: '#34d399' }}>✓ 선생님 확정</span>
              )}
              {examId && (
                <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
                  {editing === q.number ? (
                    <>
                      <button type="button" className="ea-btn" style={{ padding: '2px 8px', fontSize: 11 }} disabled={busy === q.number}
                        onClick={() => save(q.number, 'approve', draft)}>
                        {busy === q.number ? '저장 중…' : '확정 (리포트에 표시)'}
                      </button>
                      <button type="button" className="ea-btn" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setEditing(null)}>취소</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="ea-btn" style={{ padding: '2px 8px', fontSize: 11 }}
                        onClick={() => { setEditing(q.number); setDraft(q.strategy || ''); }}>
                        수정
                      </button>
                      {q.strategyVerified === false ? (
                        <button type="button" className="ea-btn" style={{ padding: '2px 8px', fontSize: 11 }} disabled={busy === q.number}
                          onClick={() => save(q.number, 'approve')}>이대로 확정</button>
                      ) : (
                        <button type="button" className="ea-btn" style={{ padding: '2px 8px', fontSize: 11 }} disabled={busy === q.number}
                          onClick={() => save(q.number, 'hide')}>리포트에서 숨김</button>
                      )}
                    </>
                  )}
                </span>
              )}
            </div>
            {editing === q.number ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={7}
                style={{ width: '100%', fontSize: 12, lineHeight: 1.6, background: '#18181b', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: 8 }}
                placeholder="[1단계] … [2단계] … [3단계] … (LaTeX 는 $…$)"
              />
            ) : (
              <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--chrome-fg-2)' }}>
                <MixedContentRenderer content={q.strategy} />
              </div>
            )}
            {msg && editing === null && busy === null && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--chrome-fg-3)' }}>{msg}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
