'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Wand2, Sparkles, Check } from 'lucide-react';
import { repairLatexRender } from '@/lib/latex/renderRepair';

interface LearnedRule {
  id: string;
  original_fragment: string;
  corrected_fragment: string;
  occurrences: number;
  confidence: number;
  status: string;
}

interface Props {
  /** 현재 편집 중인 콘텐츠 */
  value: string;
  /** 라벨 (기본: '문제') */
  label?: string;
  /** 수정 적용 — 부모가 setState 해서 반영 */
  onApply: (fixed: string) => void;
  /** 편집 대상 구분 — 학습 규칙 조회 시 source 필터 용 (미사용 시 전체 로드) */
  source?: 'content' | 'solution';
}

/**
 * LaTeX 렌더 수정 가이드 패널 (편집 모달 사이드)
 *
 * ★ 용어 분리: 기존 "자동수정(autofix)"은 유형매핑 개념. 이 패널은 KaTeX 렌더
 *   실패를 해소하는 **렌더 수정** 전용.
 *
 * 동작:
 *  - 콘텐츠 변화 시 `repairLatexRender(value)` 로 즉시 감지 (하드코딩 규칙)
 *  - 마운트 시 `/api/latex-corrections` 에서 confidence ≥ 0.7 학습 규칙 로드
 *  - 학습 규칙 중 `value.includes(original_fragment)` 인 것만 제시
 *  - 각 항목 "적용" → onApply(newContent) 호출
 *  - 감지된 이슈가 하나도 없으면 패널 자체 비표시
 */
export default function RenderRepairPanel({ value, label = '문제', onApply }: Props) {
  const [rules, setRules] = useState<LearnedRule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  // 하드코딩 규칙 감지 (renderRepair)
  const hardFix = useMemo(() => repairLatexRender(value || ''), [value]);
  const hasHardcodedIssue = hardFix.changes.length > 0 && hardFix.fixed !== value;

  // 학습 규칙 — 현재 콘텐츠에 매칭되는 것만
  const applicableLearned = useMemo(() => {
    if (!value) return [];
    return rules.filter(r =>
      r.original_fragment &&
      r.corrected_fragment &&
      r.original_fragment.length >= 8 &&
      r.original_fragment !== r.corrected_fragment &&
      value.includes(r.original_fragment),
    );
  }, [value, rules]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/latex-corrections', { method: 'GET' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.items)) {
          setRules(data.items as LearnedRule[]);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalIssues = (hasHardcodedIssue ? hardFix.changes.length : 0) + applicableLearned.length;
  if (totalIssues === 0) return null;

  const handleApplyHardcoded = () => {
    if (!hasHardcodedIssue) return;
    onApply(hardFix.fixed);
  };

  const handleApplyAll = () => {
    let next = value;
    if (hasHardcodedIssue) {
      const r = repairLatexRender(next);
      if (r.fixed !== next) next = r.fixed;
    }
    for (const rule of applicableLearned) {
      if (next.includes(rule.original_fragment)) {
        next = next.split(rule.original_fragment).join(rule.corrected_fragment);
      }
    }
    if (next !== value) onApply(next);
  };

  const handleApplyLearned = (rule: LearnedRule) => {
    if (!value.includes(rule.original_fragment)) return;
    const next = value.split(rule.original_fragment).join(rule.corrected_fragment);
    if (next !== value) {
      onApply(next);
      setAppliedIds(prev => {
        const s = new Set(prev);
        s.add(rule.id);
        return s;
      });
    }
  };

  return (
    <div className="mx-3 mb-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-500/20">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-emerald-500" />
          <span className="text-xs font-semibold text-emerald-700">
            {label} 렌더 수정 제안 ({totalIssues}건)
          </span>
        </div>
        <button
          type="button"
          onClick={handleApplyAll}
          className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20"
          title="감지된 모든 수정 제안을 한 번에 적용"
        >
          모두 적용
        </button>
      </div>

      <div className="px-3 py-2 space-y-2">
        {/* 하드코딩 규칙 */}
        {hasHardcodedIssue && (
          <div className="flex items-start justify-between gap-2 text-[11px]">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-emerald-700 font-medium mb-0.5">
                <Sparkles className="h-3 w-3" />
                <span>자동 감지</span>
              </div>
              <div className="text-content-secondary break-words">
                {hardFix.changes.join(' · ')}
              </div>
            </div>
            <button
              type="button"
              onClick={handleApplyHardcoded}
              className="flex-shrink-0 px-2 py-0.5 text-[11px] rounded-md border border-emerald-500/40 bg-white hover:bg-emerald-500/10 text-emerald-700"
            >
              적용
            </button>
          </div>
        )}

        {/* 학습 규칙 — 과거 수정 사례 */}
        {applicableLearned.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] text-content-secondary font-medium uppercase tracking-wide">
              이전 수정 사례 {loaded ? `(${applicableLearned.length})` : '…'}
            </div>
            {applicableLearned.slice(0, 5).map((rule) => {
              const applied = appliedIds.has(rule.id);
              return (
                <div
                  key={rule.id}
                  className="flex items-start justify-between gap-2 text-[11px] rounded-md bg-white/60 border border-emerald-500/15 px-2 py-1.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[10px] text-rose-600 truncate" title={rule.original_fragment}>
                      {truncate(rule.original_fragment, 60)}
                    </div>
                    <div className="font-mono text-[10px] text-emerald-700 truncate" title={rule.corrected_fragment}>
                      → {truncate(rule.corrected_fragment, 60)}
                    </div>
                    <div className="text-[9px] text-content-secondary mt-0.5">
                      {rule.occurrences}회 사용 · 신뢰도 {Math.round(rule.confidence * 100)}%
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={applied}
                    onClick={() => handleApplyLearned(rule)}
                    className={`flex-shrink-0 px-2 py-0.5 text-[11px] rounded-md border ${
                      applied
                        ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-700 cursor-default'
                        : 'border-emerald-500/40 bg-white hover:bg-emerald-500/10 text-emerald-700'
                    }`}
                  >
                    {applied ? (
                      <span className="inline-flex items-center gap-0.5"><Check className="h-3 w-3" /> 적용됨</span>
                    ) : (
                      '적용'
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}
