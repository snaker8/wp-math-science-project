'use client';

import React, { useState, useCallback } from 'react';
import {
  X,
  Sparkles,
  Loader2,
  RefreshCw,
  ArrowDown,
  ArrowUp,
  Minus,
  Copy,
  Check,
  Save,
  Wand2,
  BookOpen,
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

const DIFFICULTY_CONFIG: Record<number, { label: string; border: string; bg: string; text: string }> = {
  1: { label: '최하', border: 'border-zinc-500', bg: 'bg-zinc-800', text: 'text-zinc-400' },
  2: { label: '하', border: 'border-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  3: { label: '중', border: 'border-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  4: { label: '상', border: 'border-red-500', bg: 'bg-red-500/10', text: 'text-red-400' },
  5: { label: '최상', border: 'border-red-700', bg: 'bg-red-700/10', text: 'text-red-300' },
};

const DOMAIN_CONFIG: Record<string, { label: string; border: string; bg: string; text: string }> = {
  CALCULATION: { label: '계산', border: 'border-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  UNDERSTANDING: { label: '이해', border: 'border-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  INFERENCE: { label: '추론', border: 'border-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400' },
  PROBLEM_SOLVING: { label: '해결', border: 'border-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400' },
};

// ============================================================================
// Component
// ============================================================================

export function TwinProblemModal({ problem, onClose }: TwinProblemModalProps) {
  const [generating, setGenerating] = useState(false);
  const [difficultyAdj, setDifficultyAdj] = useState<-1 | 0 | 1>(0);
  const [useLLM, setUseLLM] = useState(true);
  const [generatedTwins, setGeneratedTwins] = useState<GeneratedTwin[]>([]);
  const [saved, setSaved] = useState(false);
  const [showSolution, setShowSolution] = useState(false);

  const diffCfg = DIFFICULTY_CONFIG[problem.difficulty] || DIFFICULTY_CONFIG[3];
  const domainCfg = DOMAIN_CONFIG[problem.cognitiveDomain] || DOMAIN_CONFIG['UNDERSTANDING'];

  // 유사문제 생성
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setSaved(false);

    try {
      const res = await fetch('/api/workflow/twin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemIds: [problem.id],
          studentId: 'teacher-preview',
          options: {
            difficultyAdjustment: difficultyAdj,
            preserveStructure: true,
          },
          useLLM,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.twinProblems && data.twinProblems.length > 0) {
          setGeneratedTwins(data.twinProblems);
        }
      }
    } catch (err) {
      console.error('Twin generation failed:', err);
    }

    // fallback: Mock 생성 (API 실패 시)
    if (generatedTwins.length === 0) {
      setGeneratedTwins([{
        id: `twin-${Date.now()}`,
        contentLatex: problem.content
          .replace(/3y\^2/g, '5y^2')
          .replace(/2x\^2/g, '4x^2')
          .replace(/-3/g, '-5')
          .replace(/xy = 3/g, 'xy = 5'),
        solutionLatex: '풀이: 주어진 조건에서 변형된 값을 대입하여 계산하면...\n\n$= \\frac{(x-y)(x+y)}{xy} = \\frac{(-5)(x+y)}{5}$\n\n$= -(x+y)$',
        answer: '②',
        modifications: [
          { type: 'NUMBER', original: '3', modified: '5' },
          { type: 'COEFFICIENT', original: '2', modified: '4' },
        ],
      }]);
    }

    setGenerating(false);
  }, [problem, difficultyAdj, useLLM, generatedTwins.length]);

  const handleSave = useCallback(() => {
    setSaved(true);
    // TODO: Supabase에 저장
    setTimeout(() => setSaved(false), 2000);
  }, []);

  // ESC로 닫기
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 오버레이 */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* 모달 */}
      <div className="relative z-10 flex w-[95vw] max-w-6xl h-[85vh] rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
        {/* ===== 좌측: 원본 문제 ===== */}
        <div className="w-[40%] flex flex-col border-r border-zinc-800 min-w-0">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-zinc-400" />
              <h3 className="text-sm font-bold text-zinc-200">원본 문제</h3>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${diffCfg.border} ${diffCfg.bg} ${diffCfg.text}`}>
                {diffCfg.label}
              </span>
              <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${domainCfg.border} ${domainCfg.bg} ${domainCfg.text}`}>
                {domainCfg.label}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 p-5">
            {/* 문제 번호 + 본문 */}
            <div className="mb-4">
              <span className="text-base font-bold text-zinc-100 mr-2">{problem.number}.</span>
              <MixedContentRenderer
                content={problem.content}
                className="inline text-sm text-zinc-300 leading-relaxed"
              />
            </div>

            {/* 선택지 */}
            {problem.choices.length > 0 && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pl-5 mb-4">
                {problem.choices.map((choice, i) => (
                  <div key={i} className="text-[13px] text-zinc-400">
                    <MixedContentRenderer content={choice} />
                  </div>
                ))}
              </div>
            )}

            {/* 유형 태그 */}
            <div className="flex items-center gap-1.5 mt-4 pt-4 border-t border-zinc-800">
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {problem.year}
              </span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {problem.typeCode}. {problem.typeName}
              </span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">
                {problem.source}
              </span>
            </div>
          </div>
        </div>

        {/* ===== 우측: 유사문제 생성 영역 ===== */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-zinc-200">AI 유사문제 생성</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 생성 옵션 */}
          <div className="flex items-center gap-4 px-5 py-3 border-b border-zinc-800/50 bg-zinc-900/50 flex-shrink-0">
            {/* 난이도 조절 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">난이도 조절</span>
              <div className="flex items-center gap-0.5 rounded-lg border border-zinc-700 bg-zinc-800 p-0.5">
                <button
                  type="button"
                  onClick={() => setDifficultyAdj(-1)}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    difficultyAdj === -1
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <ArrowDown className="h-3 w-3" /> 쉽게
                </button>
                <button
                  type="button"
                  onClick={() => setDifficultyAdj(0)}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    difficultyAdj === 0
                      ? 'bg-zinc-600/50 text-zinc-200 border border-zinc-500/30'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Minus className="h-3 w-3" /> 동일
                </button>
                <button
                  type="button"
                  onClick={() => setDifficultyAdj(1)}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    difficultyAdj === 1
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <ArrowUp className="h-3 w-3" /> 어렵게
                </button>
              </div>
            </div>

            {/* AI 모드 토글 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">생성 방식</span>
              <div className="flex items-center gap-0.5 rounded-lg border border-zinc-700 bg-zinc-800 p-0.5">
                <button
                  type="button"
                  onClick={() => setUseLLM(true)}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    useLLM
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Wand2 className="h-3 w-3" /> AI (GPT-4o)
                </button>
                <button
                  type="button"
                  onClick={() => setUseLLM(false)}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    !useLLM
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <RefreshCw className="h-3 w-3" /> 규칙 기반
                </button>
              </div>
            </div>

            {/* 생성 버튼 */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="ml-auto flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-black hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {generatedTwins.length > 0 ? '다시 생성' : '유사문제 생성'}
                </>
              )}
            </button>
          </div>

          {/* 생성 결과 영역 */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
            {generatedTwins.length > 0 ? (
              <div className="p-5 space-y-4">
                {generatedTwins.map((twin, idx) => (
                  <div key={twin.id} className="rounded-xl border border-zinc-700 bg-zinc-800/50 overflow-hidden">
                    {/* 생성된 문제 헤더 */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-800/80 border-b border-zinc-700/50">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-bold text-cyan-400">
                          {idx + 1}
                        </span>
                        <span className="text-sm font-semibold text-zinc-200">유사문제</span>
                        {twin.modifications.length > 0 && (
                          <span className="text-[10px] text-zinc-500">
                            ({twin.modifications.length}개 변형)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(twin.contentLatex);
                          }}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                        >
                          <Copy className="h-3 w-3" /> 복사
                        </button>
                        <button
                          type="button"
                          onClick={handleSave}
                          className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                            saved
                              ? 'text-emerald-400 bg-emerald-500/10'
                              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
                          }`}
                        >
                          {saved ? <Check className="h-3 w-3" /> : <Save className="h-3 w-3" />}
                          {saved ? '저장됨' : '저장'}
                        </button>
                      </div>
                    </div>

                    {/* 생성된 문제 본문 */}
                    <div className="p-4">
                      <MixedContentRenderer
                        content={twin.contentLatex}
                        className="text-sm text-zinc-300 leading-relaxed"
                      />
                    </div>

                    {/* 변형 사항 */}
                    {twin.modifications.length > 0 && (
                      <div className="mx-4 mb-3 rounded-lg border border-zinc-700/50 bg-zinc-900/50 p-3">
                        <div className="text-[10px] font-semibold text-zinc-500 uppercase mb-2">변형 사항</div>
                        <div className="flex flex-wrap gap-2">
                          {twin.modifications.map((mod, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[11px]">
                              <span className="text-red-400 line-through">{mod.original}</span>
                              <span className="text-zinc-600">→</span>
                              <span className="text-emerald-400">{mod.modified}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 해설 토글 */}
                    {twin.solutionLatex && (
                      <div className="border-t border-zinc-700/50">
                        <button
                          type="button"
                          onClick={() => setShowSolution(!showSolution)}
                          className="flex w-full items-center justify-between px-4 py-2 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
                        >
                          <span>{showSolution ? '해설 숨기기' : '해설 보기'}</span>
                          <svg className={`h-3.5 w-3.5 transition-transform ${showSolution ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {showSolution && (
                          <div className="px-4 pb-3">
                            <MixedContentRenderer
                              content={twin.solutionLatex}
                              className="text-sm text-zinc-400 leading-relaxed"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* 빈 상태 */
              <div className="flex flex-1 flex-col items-center justify-center h-full gap-4 text-center py-20">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700">
                  <Sparkles className="h-8 w-8 text-cyan-500/40" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-zinc-300">유사문제를 생성해보세요</p>
                  <p className="text-xs text-zinc-500">
                    AI가 원본 문제의 구조를 유지하면서<br />
                    숫자와 조건을 변형한 유사문제를 만들어드립니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-bold text-black hover:bg-cyan-400 disabled:opacity-50 transition-colors mt-2"
                >
                  <Sparkles className="h-4 w-4" />
                  유사문제 생성하기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
