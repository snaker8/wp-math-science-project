'use client';

// ============================================================================
// AdvancedAnalysisModal — 고급 분석(채팅형 수정) 공유 모달
//   1차 분석 페이지(workflow/analyze)와 2차 수정 모달(papers/ProblemEditModal)에서 공용.
//   현재 본문 + 선택지를 ①②③④⑤ 로 합쳐 LLM(GPT/Claude)에 지시 → 정제 결과로 갱신.
//   `/api/workflow/reanalyze-crop` 채팅 모드(currentText + customPrompt) — 크롭 이미지 선택.
//   ★ 1차 페이지의 인라인 구현과 동작 동일(추출본). 1차는 그대로 두고 2차에 신규 적용.
// ============================================================================

import React, { useMemo, useState } from 'react';

/** 본문 + 선택지 배열을 ①②③④⑤ 마커로 합쳐 단일 편집 텍스트 생성. */
export function buildMergedContentChoices(content: string, choices: string[]): string {
  const trimmed = (content || '').trimEnd();
  if (!Array.isArray(choices) || choices.length === 0) return trimmed;
  const markers = ['①', '②', '③', '④', '⑤'];
  const lines = choices.map((c, i) => `${markers[i] ?? `(${i + 1})`} ${(c || '').trim()}`);
  return `${trimmed}\n\n${lines.join('\n')}`;
}

/** 편집 텍스트에서 ①②③④⑤(또는 (1)~(5)/1)~5)) 선택지 블록을 본문에서 분리.
 *  CLAUDE.md 가드: 서답형 소문제 보호 — (1) 패턴은 (1)~(5) 5개 모두일 때만 선택지로 간주. */
export function removeChoicesFromContent(text: string): { content: string; score?: number } {
  const lines = text.split('\n');
  let choiceStartIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^\(1\)\s/.test(trimmed)) {
      const remaining = lines.slice(i).join('\n');
      const hasFullObjectiveSet =
        /\(2\)/.test(remaining) && /\(3\)/.test(remaining) &&
        /\(4\)/.test(remaining) && /\(5\)/.test(remaining);
      if (hasFullObjectiveSet) { choiceStartIdx = i; break; }
    }
    if (/^①\s/.test(trimmed)) {
      const remaining = lines.slice(i).join('\n');
      if (/②/.test(remaining) && /③/.test(remaining)) { choiceStartIdx = i; break; }
    }
    if (/^1\)\s/.test(trimmed)) {
      const remaining = lines.slice(i).join('\n');
      const hasFullObjectiveSet =
        /2\)/.test(remaining) && /3\)/.test(remaining) &&
        /4\)/.test(remaining) && /5\)/.test(remaining);
      if (hasFullObjectiveSet) { choiceStartIdx = i; break; }
    }
  }

  if (choiceStartIdx >= 0) {
    text = lines.slice(0, choiceStartIdx).join('\n').trim();
  }

  // [배점] 추출 — 가드 #2 우선순위: [총 N점] > 다수 [Ni점] 합산 > 단일 > undefined
  let score: number | undefined;
  const totalMatch = text.match(/[\[(]\s*총\s*(\d+(?:\.\d+)?)\s*[점졈졍]\s*[\])]/);
  if (totalMatch) {
    score = parseFloat(totalMatch[1]);
  } else {
    const allMatches = Array.from(text.matchAll(/[\[(]\s*(\d+(?:\.\d+)?)\s*[점졈졍]\s*[\])]/g));
    if (allMatches.length > 1) score = allMatches.reduce((s, mm) => s + parseFloat(mm[1]), 0);
    else if (allMatches.length === 1) score = parseFloat(allMatches[0][1]);
  }
  text = text
    .replace(/[\[(]\s*총\s*\d+(?:\.\d+)?\s*[점졈졍]\s*[\])]/g, '')
    .replace(/[\[(]\s*\d+(?:\.\d+)?\s*[점졈졍]\s*[\])]/g, '')
    .trim();

  return { content: text, score };
}

export interface AdvancedAnalysisModalProps {
  /** 현재 본문 (선택지 제외) */
  initialContent: string;
  /** 현재 선택지 — 본문과 합쳐서 함께 편집 */
  initialChoices: string[];
  /** 옵션: 크롭 이미지 (base64). 있으면 시각 컨텍스트로 활용. */
  imageBase64?: string;
  /** 최종 적용 시 호출 — 본문 + 선택지 분리해서 반환 */
  onApply: (finalContent: string, finalChoices: string[]) => void;
  onCancel: () => void;
}

export function AdvancedAnalysisModal({
  initialContent,
  initialChoices,
  imageBase64,
  onApply,
  onCancel,
}: AdvancedAnalysisModalProps) {
  const initialMerged = useMemo(
    () => buildMergedContentChoices(initialContent, initialChoices),
    [initialContent, initialChoices]
  );
  const [currentText, setCurrentText] = useState(initialMerged);
  const [currentChoices, setCurrentChoices] = useState<string[]>(initialChoices);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [model, setModel] = useState<'gpt-4o' | 'claude-sonnet' | 'claude-opus'>('claude-sonnet');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{
    prompt: string; before: string; after: string; model: string; durationMs: number;
  }>>([]);

  const presets = [
    '객관식 options 의 수식을 정확히 읽어줘',
    'ㄱ, ㄴ, ㄷ 자음 글자를 정확히 표기해줘',
    '선분 수식에 \\overline 태그 넣어줘',
    '학생 낙서 무시하고 인쇄된 글자만 읽어줘',
  ];

  const submitInstruction = async () => {
    const prompt = draftPrompt.trim();
    if (!prompt || isProcessing) return;
    setIsProcessing(true);
    setError(null);
    const before = currentText;
    const t0 = Date.now();
    try {
      const res = await fetch('/api/workflow/reanalyze-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imageBase64 || undefined,
          currentText: before,
          customPrompt: prompt,
          model,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const after = (data.ocrText as string) || before;
      setCurrentText(after);
      if (Array.isArray(data.choices) && data.choices.length > 0) {
        setCurrentChoices(data.choices as string[]);
      }
      setHistory((prev) => [...prev, { prompt, before, after, model, durationMs: Date.now() - t0 }]);
      setDraftPrompt('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRevert = () => {
    setCurrentText(initialMerged);
    setCurrentChoices(initialChoices);
    setHistory([]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setCurrentText(last.before);
    setHistory((prev) => prev.slice(0, -1));
  };

  const handleApply = () => {
    const { content: splitContent } = removeChoicesFromContent(currentText);
    onApply(splitContent, currentChoices);
  };

  const isModified = currentText !== initialMerged;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl h-[88vh] rounded-2xl bg-zinc-900 border border-white/[.09] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-white/[.08] flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-content-primary">고급 분석 — 채팅형 수정</h3>
            <p className="text-[11px] text-content-tertiary mt-0.5">
              현재 내용을 보면서 지시하면 즉시 반영됩니다. 여러 번 반복 가능.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-content-tertiary mr-1">모델:</span>
            {(['gpt-4o', 'claude-sonnet', 'claude-opus'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModel(m)}
                className={`px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap transition-colors border ${
                  model === m
                    ? 'bg-white/[.08] border-white/25 text-content-primary'
                    : 'border-white/[.08] bg-white/[.04] text-content-tertiary hover:text-content-primary hover:bg-white/[.06]'
                }`}
                title={
                  m === 'gpt-4o' ? '빠름 · 저렴'
                    : m === 'claude-sonnet' ? '★ 추천 — 텍스트 편집에 충분 · 합리적 비용'
                    : '최고 정확도 · 비용 ↑↑ (필요 시만)'
                }
              >
                {m === 'gpt-4o' ? 'GPT-4o' : m === 'claude-sonnet' ? 'Sonnet ★' : 'Opus ⚠'}
              </button>
            ))}
          </div>
        </div>

        {/* 현재 내용 미리보기 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-content-tertiary uppercase tracking-wider">현재 내용</span>
              {isModified && <span className="text-[10px] text-amber-400 font-semibold">● 수정됨</span>}
            </div>
            <div className="rounded-lg border border-white/[.08] bg-white/[.02] px-3 py-2 max-h-64 overflow-y-auto">
              <pre className="whitespace-pre-wrap break-words text-xs text-content-secondary font-mono leading-relaxed">
                {currentText || '(비어있음)'}
              </pre>
            </div>
          </div>

          {history.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-content-tertiary uppercase tracking-wider mb-1.5">
                수정 이력 ({history.length})
              </div>
              <div className="space-y-1.5">
                {history.map((h, i) => (
                  <div key={i} className="rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-2 text-[11px]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-content-tertiary font-semibold tabular-nums">#{i + 1}</span>
                      <span className="text-content-muted">·</span>
                      <span className="text-content-tertiary">{h.model}</span>
                      <span className="text-content-muted">·</span>
                      <span className="text-content-tertiary tabular-nums">{(h.durationMs / 1000).toFixed(1)}s</span>
                    </div>
                    <div className="text-content-secondary break-words">{h.prompt}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>
          )}
        </div>

        {/* 프리셋 + 입력 */}
        <div className="border-t border-white/[.08] p-4 space-y-2 flex-shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {presets.map((preset, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDraftPrompt((prev) => (prev ? `${prev}\n${preset}` : preset))}
                className="text-[10px] rounded-full border border-white/[.08] bg-white/[.04] hover:bg-white/[.06] px-2.5 py-1 text-content-secondary hover:text-content-primary whitespace-nowrap transition-colors"
              >
                + {preset.slice(0, 22)}{preset.length > 22 ? '…' : ''}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <textarea
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitInstruction(); }
              }}
              disabled={isProcessing}
              rows={2}
              className="flex-1 rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-2 text-sm text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-white/25 resize-none disabled:opacity-50"
              placeholder="예) 분모를 x+1로 바꿔줘 / ㄱ선택지 삭제해줘 / ⌘+Enter 로 전송"
            />
            <button
              type="button"
              onClick={submitInstruction}
              disabled={isProcessing || !draftPrompt.trim()}
              className="self-stretch px-5 rounded-lg border border-white/[.14] bg-white/[.08] hover:bg-white/[.12] text-xs font-semibold text-content-primary whitespace-nowrap transition-colors disabled:opacity-40"
            >
              {isProcessing ? '...' : '분석'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center gap-2 px-5 py-3 border-t border-white/[.08] flex-shrink-0">
          <div className="flex gap-2">
            {history.length > 0 && (
              <>
                <button type="button" onClick={handleUndo}
                  className="px-3 py-1.5 rounded-full border border-white/[.08] bg-white/[.04] text-xs text-content-secondary hover:text-content-primary hover:bg-white/[.06] whitespace-nowrap transition-colors">
                  ↶ 한 단계 되돌리기
                </button>
                <button type="button" onClick={handleRevert}
                  className="px-3 py-1.5 rounded-full border border-white/[.08] bg-white/[.04] text-xs text-content-secondary hover:text-content-primary hover:bg-white/[.06] whitespace-nowrap transition-colors">
                  원본으로
                </button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} disabled={isProcessing}
              className="px-4 py-2 rounded-full border border-white/[.08] bg-white/[.04] text-xs text-content-secondary hover:text-content-primary hover:bg-white/[.06] whitespace-nowrap transition-colors disabled:opacity-50">
              닫기
            </button>
            <button type="button" onClick={handleApply} disabled={isProcessing || !isModified}
              className="px-4 py-2 rounded-full bg-white hover:bg-zinc-200 text-xs font-semibold text-black whitespace-nowrap transition-colors disabled:opacity-40">
              최종 적용
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
