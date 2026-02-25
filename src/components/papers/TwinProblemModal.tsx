'use client';

import React, { useState, useCallback, useRef } from 'react';
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
  Wand2,
  BookOpen,
  Pencil,
  Eye,
  EyeOff,
  Plus,
  Database,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { LaTeXInputModal } from '@/components/editor/LaTeXInputModal';

// ============================================================================
// Types
// ============================================================================

interface TwinProblemModalProps {
  problem: {
    id: string;
    number: number;
    content: string;
    choices: string[];
    answer: number | string;
    solution: string;
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
  choices: string[];
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
  const [showSolution, setShowSolution] = useState(true);
  // ★ 자산화 상태
  const [assetizedIds, setAssetizedIds] = useState<Set<string>>(new Set());
  const [assetizingId, setAssetizingId] = useState<string | null>(null);

  // ★ 편집 모드 상태
  const [editingTwinId, setEditingTwinId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    contentLatex: string;
    solutionLatex: string;
    answer: string;
    choices: string[];
  } | null>(null);
  const [editPreview, setEditPreview] = useState(false);
  const [showLatexModal, setShowLatexModal] = useState(false);
  const [latexTarget, setLatexTarget] = useState<'content' | 'solution'>('content');
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const solutionTextareaRef = useRef<HTMLTextAreaElement>(null);

  const diffCfg = DIFFICULTY_CONFIG[problem.difficulty] || DIFFICULTY_CONFIG[3];
  const domainCfg = DOMAIN_CONFIG[problem.cognitiveDomain] || DOMAIN_CONFIG['UNDERSTANDING'];

  // 유사문제 생성
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setAssetizedIds(new Set()); // 재생성 시 자산화 상태 초기화

    let apiSucceeded = false;

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
          // ★ 프론트엔드에서 이미 로드된 문제 데이터를 직접 전달 (DB 재조회 불필요)
          problemsData: [{
            id: problem.id,
            contentLatex: problem.content,
            solutionLatex: problem.solution || '',
            typeCode: problem.typeCode,
            typeName: problem.typeName,
            answer: String(problem.answer || ''),
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

    // fallback: API 실패 시에만 실행 (apiSucceeded로 정확하게 판단)
    if (!apiSucceeded) {
      // 간단한 숫자 변형 fallback (모든 문제 유형에 적용 가능)
      const variedContent = problem.content
        .replace(/(-?\d+)/g, (match) => {
          const num = parseInt(match);
          if (isNaN(num) || Math.abs(num) > 100) return match;
          const delta = (Math.floor(Math.random() * 3) + 1) * (Math.random() > 0.5 ? 1 : -1);
          return String(num + delta);
        });
      // 선택지도 숫자 변형
      const variedChoices = problem.choices.map((c) =>
        c.replace(/(-?\d+)/g, (match) => {
          const num = parseInt(match);
          if (isNaN(num) || Math.abs(num) > 100) return match;
          const delta = (Math.floor(Math.random() * 3) + 1) * (Math.random() > 0.5 ? 1 : -1);
          return String(num + delta);
        })
      );
      setGeneratedTwins([{
        id: `twin-${Date.now()}`,
        contentLatex: variedContent,
        solutionLatex: '(AI 유사문제 생성 서버에 연결할 수 없어 숫자만 변형하였습니다.)',
        answer: '-',
        choices: variedChoices,
        modifications: [
          { type: 'NUMBER', original: '(원본)', modified: '(변형됨)' },
        ],
      }]);
    }

    setGenerating(false);
  }, [problem, difficultyAdj, useLLM]);

  // ★ 자산화: 유사문제를 문제은행(DB)에 저장
  const handleAssetize = useCallback(async (twin: GeneratedTwin) => {
    if (assetizedIds.has(twin.id) || assetizingId) return;
    setAssetizingId(twin.id);

    try {
      const res = await fetch('/api/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentLatex: twin.contentLatex,
          solutionLatex: twin.solutionLatex,
          answer: twin.answer,
          choices: twin.choices,
          originalProblemId: problem.id,
          typeCode: problem.typeCode,
          typeName: problem.typeName,
          difficulty: problem.difficulty,
          cognitiveDomain: problem.cognitiveDomain,
        }),
      });

      if (res.ok) {
        setAssetizedIds(prev => new Set([...prev, twin.id]));
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('[자산화 실패]', errData);
        alert('자산화에 실패했습니다. 다시 시도해주세요.');
      }
    } catch (err) {
      console.error('[자산화 오류]', err);
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setAssetizingId(null);
    }
  }, [assetizedIds, assetizingId, problem]);

  // ★ 편집 시작
  const handleStartEdit = useCallback((twin: GeneratedTwin) => {
    setEditingTwinId(twin.id);
    setEditForm({
      contentLatex: twin.contentLatex,
      solutionLatex: twin.solutionLatex,
      answer: twin.answer,
      choices: [...twin.choices],
    });
    setEditPreview(false);
  }, []);

  // ★ 편집 적용
  const handleApplyEdit = useCallback(() => {
    if (!editingTwinId || !editForm) return;
    setGeneratedTwins(prev => prev.map(twin =>
      twin.id === editingTwinId
        ? { ...twin, ...editForm }
        : twin
    ));
    setEditingTwinId(null);
    setEditForm(null);
  }, [editingTwinId, editForm]);

  // ★ 편집 취소
  const handleCancelEdit = useCallback(() => {
    setEditingTwinId(null);
    setEditForm(null);
  }, []);

  // ★ LaTeX 수식 삽입
  const handleInsertLatex = useCallback((latex: string, opts: { displayStyle: boolean; block: boolean }) => {
    if (!editForm) return;
    const wrapped = opts.block ? `$$${latex}$$` : `$${latex}$`;
    const textarea = latexTarget === 'content' ? contentTextareaRef.current : solutionTextareaRef.current;
    const field = latexTarget === 'content' ? 'contentLatex' : 'solutionLatex';

    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const current = editForm[field];
      const newValue = current.substring(0, start) + wrapped + current.substring(end);
      setEditForm(prev => prev ? { ...prev, [field]: newValue } : prev);
      // 커서 위치 복원
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + wrapped.length, start + wrapped.length);
      }, 50);
    } else {
      setEditForm(prev => prev ? { ...prev, [field]: prev[field] + wrapped } : prev);
    }
    setShowLatexModal(false);
  }, [editForm, latexTarget]);

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
                        {editingTwinId === twin.id ? (
                          <>
                            <button
                              type="button"
                              onClick={handleApplyEdit}
                              className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors"
                            >
                              <Check className="h-3 w-3" /> 적용
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                            >
                              <X className="h-3 w-3" /> 취소
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(twin)}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                            >
                              <Pencil className="h-3 w-3" /> 편집
                            </button>
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
                              onClick={() => handleAssetize(twin)}
                              disabled={assetizedIds.has(twin.id) || assetizingId === twin.id}
                              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                                assetizedIds.has(twin.id)
                                  ? 'text-emerald-400 bg-emerald-500/10 cursor-default'
                                  : assetizingId === twin.id
                                    ? 'text-cyan-400 bg-cyan-500/10 cursor-wait'
                                    : 'text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10'
                              }`}
                            >
                              {assetizedIds.has(twin.id) ? (
                                <><Check className="h-3 w-3" /> 자산화됨</>
                              ) : assetizingId === twin.id ? (
                                <><Loader2 className="h-3 w-3 animate-spin" /> 저장 중...</>
                              ) : (
                                <><Database className="h-3 w-3" /> 자산화</>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 생성된 문제 본문 — 편집/보기 모드 분기 */}
                    {editingTwinId === twin.id && editForm ? (
                      <div className="p-4 space-y-3">
                        {/* 프리뷰 토글 */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditPreview(!editPreview)}
                            className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
                          >
                            {editPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            {editPreview ? '편집 모드' : '미리보기'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setLatexTarget('content'); setShowLatexModal(true); }}
                            className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                          >
                            <Plus className="h-3 w-3" /> 수식 삽입
                          </button>
                        </div>

                        {/* 문제 내용 */}
                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase mb-1 block">문제 내용</label>
                          {editPreview ? (
                            <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 min-h-[80px]">
                              <MixedContentRenderer content={editForm.contentLatex} className="text-sm text-zinc-300" />
                            </div>
                          ) : (
                            <textarea
                              ref={contentTextareaRef}
                              value={editForm.contentLatex}
                              onChange={e => setEditForm(prev => prev ? { ...prev, contentLatex: e.target.value } : prev)}
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 text-sm text-zinc-300 p-3 min-h-[80px] resize-y focus:outline-none focus:border-cyan-500/50 font-mono"
                              placeholder="문제 내용 (LaTeX 가능)"
                            />
                          )}
                        </div>

                        {/* 선택지 */}
                        {editForm.choices.length > 0 && (
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase mb-1 block">선택지</label>
                            <div className="space-y-1.5">
                              {editForm.choices.map((choice, ci) => (
                                <div key={ci} className="flex items-center gap-2">
                                  <span className="text-[11px] text-zinc-500 w-4 text-center">{ci + 1}</span>
                                  {editPreview ? (
                                    <div className="flex-1 text-[13px] text-zinc-400">
                                      <MixedContentRenderer content={choice} />
                                    </div>
                                  ) : (
                                    <input
                                      value={choice}
                                      onChange={e => {
                                        const newChoices = [...editForm.choices];
                                        newChoices[ci] = e.target.value;
                                        setEditForm(prev => prev ? { ...prev, choices: newChoices } : prev);
                                      }}
                                      className="flex-1 rounded border border-zinc-700 bg-zinc-900 text-[13px] text-zinc-300 px-2 py-1 focus:outline-none focus:border-cyan-500/50 font-mono"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 정답 */}
                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase mb-1 block">정답</label>
                          <input
                            value={editForm.answer}
                            onChange={e => setEditForm(prev => prev ? { ...prev, answer: e.target.value } : prev)}
                            className="w-32 rounded border border-zinc-700 bg-zinc-900 text-sm text-emerald-300 px-2 py-1 focus:outline-none focus:border-cyan-500/50 font-mono"
                          />
                        </div>

                        {/* 해설 */}
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase">해설</label>
                            <button
                              type="button"
                              onClick={() => { setLatexTarget('solution'); setShowLatexModal(true); }}
                              className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
                            >
                              <Plus className="h-2.5 w-2.5" /> 수식
                            </button>
                          </div>
                          {editPreview ? (
                            <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 min-h-[60px]">
                              <MixedContentRenderer content={editForm.solutionLatex} className="text-sm text-zinc-400" />
                            </div>
                          ) : (
                            <textarea
                              ref={solutionTextareaRef}
                              value={editForm.solutionLatex}
                              onChange={e => setEditForm(prev => prev ? { ...prev, solutionLatex: e.target.value } : prev)}
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 text-sm text-zinc-400 p-3 min-h-[60px] resize-y focus:outline-none focus:border-cyan-500/50 font-mono"
                              placeholder="해설 (LaTeX 가능)"
                            />
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-4">
                        <MixedContentRenderer
                          content={twin.contentLatex}
                          className="text-sm text-zinc-300 leading-relaxed"
                        />
                        {/* ★ 생성된 선택지 */}
                        {twin.choices && twin.choices.length > 0 && (() => {
                          const maxLen = Math.max(...twin.choices.map(c =>
                            c.replace(/^[①②③④⑤]\s*/, '').replace(/\$[^$]*\$/g, 'XX').replace(/\\[a-z]+/gi, '').length
                          ));
                          if (maxLen <= 12) {
                            return (
                              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                                {twin.choices.map((choice, ci) => (
                                  <div key={ci} className="text-[13px] text-zinc-400">
                                    <MixedContentRenderer content={choice} />
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          if (maxLen <= 30) {
                            return (
                              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                                {twin.choices.map((choice, ci) => (
                                  <div key={ci} className="text-[13px] text-zinc-400">
                                    <MixedContentRenderer content={choice} />
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          return (
                            <div className="mt-3 space-y-1.5">
                              {twin.choices.map((choice, ci) => (
                                <div key={ci} className="text-[13px] text-zinc-400">
                                  <MixedContentRenderer content={choice} />
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}

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

                    {/* 정답 표시 */}
                    {twin.answer && twin.answer !== '-' && (
                      <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                        <span className="text-xs font-bold text-emerald-400">정답</span>
                        <span className="text-sm font-semibold text-emerald-300">
                          <MixedContentRenderer content={twin.answer} />
                        </span>
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
                            <div className="mb-2 flex items-center gap-1.5 text-[11px] text-amber-400/70">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                              </svg>
                              AI 생성 풀이 — 정확도를 확인하세요
                            </div>
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

      {/* LaTeX 수식 입력 모달 */}
      {showLatexModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowLatexModal(false)} />
          <div className="relative z-10">
            <LaTeXInputModal
              onInsert={handleInsertLatex}
              onCancel={() => setShowLatexModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
