'use client';

import React, { useState, useCallback } from 'react';
import {
  X,
  Sparkles,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  Save,
  BookOpen,
  FileText,
  Plus,
  RotateCcw,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';

// ============================================================================
// Types
// ============================================================================

interface TwinProblemModalProps {
  problem: {
    id: string;
    number: number;
    content: string;
    choices: string[];
    difficulty: number;
    cognitiveDomain: string;
    typeCode: string;
    typeName: string;
    year: string;
    source: string;
    answer?: number | string;
    solution?: string;
  };
  onClose: () => void;
}

interface GeneratedTwin {
  id: string;
  contentLatex: string;
  solutionLatex: string;
  answer: string;
  modifications: Array<{
    type: string;
    original: string;
    modified: string;
  }>;
}

// ============================================================================
// Constants
// ============================================================================

const DIFFICULTY_CONFIG: Record<number, { label: string; color: string }> = {
  1: { label: '최하', color: 'text-zinc-400' },
  2: { label: '하', color: 'text-blue-400' },
  3: { label: '중', color: 'text-amber-400' },
  4: { label: '상', color: 'text-red-400' },
  5: { label: '최상', color: 'text-red-300' },
};

type DifficultyTab = 'model' | 'basic' | 'advanced';

const TAB_CONFIG: Record<DifficultyTab, { label: string; adj: -1 | 0 | 1 }> = {
  basic: { label: '기본', adj: -1 },
  model: { label: '모델', adj: 0 },
  advanced: { label: '심화', adj: 1 },
};

// ============================================================================
// Component
// ============================================================================

export function TwinProblemModal({ problem, onClose }: TwinProblemModalProps) {
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<DifficultyTab>('model');
  const [generatedTwins, setGeneratedTwins] = useState<GeneratedTwin[]>([]);
  const [savedTwins, setSavedTwins] = useState<GeneratedTwin[]>([]);
  const [comment, setComment] = useState('');
  const [showOriginalSolution, setShowOriginalSolution] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const diffCfg = DIFFICULTY_CONFIG[problem.difficulty] || DIFFICULTY_CONFIG[3];
  const currentTwin = generatedTwins[0] || null;

  // 유사문제 생성
  const handleGenerate = useCallback(async () => {
    setGenerating(true);

    const diffAdj = TAB_CONFIG[activeTab].adj;
    let apiSucceeded = false;

    try {
      const res = await fetch('/api/workflow/twin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemIds: [problem.id],
          studentId: 'teacher-preview',
          options: {
            difficultyAdjustment: diffAdj,
            preserveStructure: true,
          },
          useLLM: true,
          problemsData: [{
            id: problem.id,
            contentLatex: problem.content,
            solutionLatex: problem.solution || '',
            typeCode: problem.typeCode || '',
            typeName: problem.typeName || '',
            answer: String(problem.answer ?? ''),
            choices: problem.choices || [],
          }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.twinProblems && data.twinProblems.length > 0) {
          setGeneratedTwins(data.twinProblems);
          apiSucceeded = true;
        }
      } else {
        console.error('Twin API error:', res.status, await res.text().catch(() => ''));
      }
    } catch (err) {
      console.error('Twin generation failed:', err);
    }

    // fallback
    if (!apiSucceeded) {
      const variedContent = problem.content
        .replace(/(-?\d+)/g, (match) => {
          const num = parseInt(match);
          if (isNaN(num) || Math.abs(num) > 100) return match;
          const delta = (Math.floor(Math.random() * 3) + 1) * (Math.random() > 0.5 ? 1 : -1);
          return String(num + delta);
        });
      setGeneratedTwins([{
        id: `twin-${Date.now()}`,
        contentLatex: variedContent,
        solutionLatex: '(AI 유사문제 생성 서버에 연결할 수 없어 숫자만 변형하였습니다.)',
        answer: '-',
        modifications: [
          { type: 'NUMBER', original: '(원본)', modified: '(변형됨)' },
        ],
      }]);
    }

    setGenerating(false);
  }, [problem, activeTab]);

  // 저장
  const handleSave = useCallback(() => {
    if (!currentTwin) return;
    // 중복 저장 방지
    if (savedTwins.some(t => t.id === currentTwin.id)) return;
    setSavedTwins(prev => [...prev, { ...currentTwin }]);
    // TODO: Supabase에 저장
  }, [currentTwin, savedTwins]);

  // 저장하고 한문제 더 만들기
  const handleSaveAndMore = useCallback(async () => {
    handleSave();
    await handleGenerate();
  }, [handleSave, handleGenerate]);

  // 초기화
  const handleReset = useCallback(() => {
    setGeneratedTwins([]);
    setComment('');
  }, []);

  // 복사
  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // ESC로 닫기
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isSaved = currentTwin ? savedTwins.some(t => t.id === currentTwin.id) : false;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-base/95 backdrop-blur-md">
      {/* ===== 상단 액션 바 ===== */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-surface-card border-b border-subtle flex-shrink-0">
        {/* 좌측: 제목 + 태그 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4.5 w-4.5 text-cyan-400" />
            <h2 className="text-sm font-bold text-content-primary">유사문제 작업</h2>
          </div>
          <div className="h-4 w-px bg-zinc-700" />
          <span className="text-[11px] text-content-tertiary">
            {problem.number}번 · {problem.typeName}
          </span>
          <span className={`text-[10px] font-semibold ${diffCfg.color}`}>
            난이도 {diffCfg.label}
          </span>
        </div>

        {/* 우측: 액션 버튼들 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={generating || generatedTwins.length === 0}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-content-secondary hover:text-content-primary hover:bg-surface-raised border border-subtle disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            초기화
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {generating ? '생성 중...' : '생성하기'}
          </button>

          <button
            type="button"
            onClick={handleSaveAndMore}
            disabled={generating || !currentTwin}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            저장하고 한문제 더
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!currentTwin || isSaved}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              isSaved
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-cyan-500 text-black hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            {isSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {isSaved ? '저장됨' : `저장${savedTwins.length > 0 ? `(${savedTwins.length})` : ''}`}
          </button>

          <div className="h-4 w-px bg-zinc-700 mx-1" />

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 rounded-lg p-1.5 text-content-tertiary hover:text-content-primary hover:bg-surface-raised transition-colors"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      {/* ===== 메인 컨텐츠 ===== */}
      <div className="flex flex-1 min-h-0">
        {/* ===== 좌측: 원문 문제 & 해설 ===== */}
        <div className="w-[38%] flex flex-col border-r border-subtle bg-surface-card/30 min-w-0">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-subtle/60 flex-shrink-0">
            <BookOpen className="h-4 w-4 text-content-tertiary" />
            <h3 className="text-[13px] font-bold text-content-primary">원문 문제 & 해설</h3>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 p-5 space-y-5">
            {/* 원본 문제 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">
                  문제
                </span>
                <span className="text-[10px] text-content-tertiary">
                  {problem.year} · {problem.source}
                </span>
              </div>

              <div className="mb-3">
                <span className="text-[15px] font-extrabold text-content-primary mr-2">
                  {problem.number}.
                </span>
                <MixedContentRenderer
                  content={problem.content}
                  className="inline text-[13px] text-content-secondary leading-[1.8]"
                />
              </div>

              {/* 선택지 */}
              {problem.choices.length > 0 && (
                <div className="grid grid-cols-1 gap-y-1 pl-4 mt-3">
                  {problem.choices.map((choice, i) => {
                    const isAnswer = problem.answer !== undefined && (
                      problem.answer === i + 1 ||
                      String(problem.answer) === String(i + 1)
                    );
                    return (
                      <div
                        key={i}
                        className={`text-[13px] py-0.5 ${
                          isAnswer
                            ? 'text-cyan-400 font-semibold'
                            : 'text-content-secondary'
                        }`}
                      >
                        <MixedContentRenderer content={choice} />
                        {isAnswer && (
                          <span className="ml-1.5 text-[10px] text-cyan-500 font-bold">← 정답</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 정답 (선택지가 없는 경우) */}
              {problem.choices.length === 0 && problem.answer && (
                <div className="mt-3 pl-4">
                  <span className="text-[12px] text-content-tertiary">정답: </span>
                  <span className="text-[13px] text-cyan-400 font-semibold">
                    {String(problem.answer)}
                  </span>
                </div>
              )}
            </div>

            {/* 유형 태그 */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {problem.typeCode}
              </span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-raised text-content-tertiary border border-subtle">
                {problem.typeName}
              </span>
            </div>

            {/* 해설 (접기/펼치기) */}
            <div className="border-t border-subtle/60 pt-4">
              <button
                type="button"
                onClick={() => setShowOriginalSolution(!showOriginalSolution)}
                className="flex items-center gap-2 text-[13px] font-bold text-content-secondary hover:text-content-primary transition-colors mb-3 w-full"
              >
                <FileText className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                  해설
                </span>
                <span className="flex-1" />
                {showOriginalSolution ? (
                  <ChevronUp className="h-3.5 w-3.5 text-content-tertiary" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-content-tertiary" />
                )}
              </button>

              {showOriginalSolution && (
                <div className="pl-1 text-[13px] text-content-secondary leading-[1.8]">
                  {problem.solution ? (
                    <MixedContentRenderer content={problem.solution} />
                  ) : (
                    <p className="text-content-tertiary italic text-xs">
                      해설이 등록되지 않았습니다.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== 우측: 유사문제 생성 결과 ===== */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 탭: 모델 / 기본 / 심화 */}
          <div className="flex items-center gap-1 px-5 py-2.5 border-b border-subtle/60 bg-surface-card/20 flex-shrink-0">
            {(Object.entries(TAB_CONFIG) as [DifficultyTab, typeof TAB_CONFIG[DifficultyTab]][]).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === key
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                    : 'text-content-tertiary hover:text-content-secondary hover:bg-surface-raised border border-transparent'
                }`}
              >
                {cfg.label}
              </button>
            ))}
            <span className="text-[10px] text-content-tertiary ml-3">
              {activeTab === 'basic' && '원본보다 쉬운 난이도'}
              {activeTab === 'model' && '원본과 동일한 난이도'}
              {activeTab === 'advanced' && '원본보다 어려운 난이도'}
            </span>
          </div>

          {/* 유사문제 결과 영역 */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
            {currentTwin ? (
              <div className="flex h-full min-h-0">
                {/* 문제 컬럼 */}
                <div className="flex-1 flex flex-col border-r border-subtle/40 min-w-0">
                  <div className="flex items-center justify-between px-5 py-2.5 border-b border-subtle/40 flex-shrink-0">
                    <span className="text-xs font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">
                      문제
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(currentTwin.contentLatex, `content-${currentTwin.id}`)}
                      className="flex items-center gap-1 text-[11px] text-content-tertiary hover:text-content-primary transition-colors"
                    >
                      {copiedId === `content-${currentTwin.id}` ? (
                        <><Check className="h-3 w-3 text-emerald-400" /> 복사됨</>
                      ) : (
                        <><Copy className="h-3 w-3" /> 복사</>
                      )}
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5">
                    <div className="mb-3">
                      <span className="text-[15px] font-extrabold text-content-primary mr-2">
                        {problem.number}.
                      </span>
                      <MixedContentRenderer
                        content={currentTwin.contentLatex}
                        className="inline text-[13px] text-content-secondary leading-[1.8]"
                      />
                    </div>

                    {/* 변형 사항 표시 */}
                    {currentTwin.modifications.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-subtle/40">
                        <div className="text-[10px] font-bold text-content-tertiary uppercase mb-2">
                          변형 사항
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {currentTwin.modifications.map((mod, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 rounded-md border border-subtle bg-surface-raised px-2 py-0.5 text-[11px]"
                            >
                              <span className="text-red-400 line-through">{mod.original}</span>
                              <span className="text-content-muted">→</span>
                              <span className="text-emerald-400">{mod.modified}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 정답 표시 */}
                    {currentTwin.answer && currentTwin.answer !== '-' && (
                      <div className="mt-4 pt-3 border-t border-subtle/40 flex items-center gap-2">
                        <span className="text-[11px] font-bold text-content-tertiary">[정답]</span>
                        <span className="text-[13px] font-bold text-cyan-400">
                          <MixedContentRenderer content={currentTwin.answer} />
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 해설 컬럼 */}
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex items-center justify-between px-5 py-2.5 border-b border-subtle/40 flex-shrink-0">
                    <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                      해설
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(currentTwin.solutionLatex, `solution-${currentTwin.id}`)}
                      className="flex items-center gap-1 text-[11px] text-content-tertiary hover:text-content-primary transition-colors"
                    >
                      {copiedId === `solution-${currentTwin.id}` ? (
                        <><Check className="h-3 w-3 text-emerald-400" /> 복사됨</>
                      ) : (
                        <><Copy className="h-3 w-3" /> 복사</>
                      )}
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5">
                    <MixedContentRenderer
                      content={currentTwin.solutionLatex}
                      className="text-[13px] text-content-secondary leading-[1.8]"
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* 빈 상태 */
              <div className="flex flex-1 flex-col items-center justify-center h-full gap-5 text-center py-20">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-surface-raised/80 border border-subtle">
                  <Sparkles className="h-10 w-10 text-cyan-500/30" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-bold text-content-secondary">
                    유사문제를 생성해보세요
                  </p>
                  <p className="text-xs text-content-tertiary leading-relaxed">
                    AI가 원본 문제의 구조를 유지하면서<br />
                    숫자와 조건을 변형한 유사문제를 만들어드립니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-2 rounded-xl bg-cyan-500 px-6 py-2.5 text-sm font-bold text-black hover:bg-cyan-400 disabled:opacity-50 transition-colors mt-2"
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      생성 중...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      유사문제 생성하기
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* ===== 하단: 코멘트 영역 ===== */}
          <div className="border-t border-subtle flex-shrink-0 bg-surface-card/30">
            <div className="flex items-start gap-3 px-5 py-3">
              <MessageSquare className="h-4 w-4 text-content-tertiary mt-1 flex-shrink-0" />
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="코멘트를 입력하세요... (학생에게 전달할 메모, 변형 지시사항 등)"
                rows={2}
                className="flex-1 resize-none rounded-lg border border-subtle bg-surface-raised px-3 py-2 text-xs text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
              />
            </div>

            {/* 저장된 문제 카운트 */}
            {savedTwins.length > 0 && (
              <div className="flex items-center gap-2 px-5 pb-3">
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                  <Check className="h-3 w-3" />
                  <span className="font-semibold">이번 세션에서 {savedTwins.length}개 문제 저장됨</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
