'use client';

// ============================================================================
// 문항 교체 모달 — 시험지의 한 문제를 「같은 유형의 다른 문제」로 바꾼다 (번호·배점 유지)
//
// ★ 2026-10-11 대표: "유사 문항 교체도 안 되고, 매쓰홀릭 유형별 출제 참고해라" (03-problem-edit.md: 🔄 교체 / + 추가 분리).
//   후보는 새 출제 라인의 CandidatePool(유사·기출·고난도·서술형 + AI 변형)을 그대로 쓴다 — AI 안 쓰고 우리 DB 로 찾는다.
//   교체 = PATCH /api/exams/[examId]/problems {action:'replace'} (자리 유지), 추가 = POST (맨 뒤에 붙임).
//   클라우드 펼쳐보기 카드·출제(create) 미리보기 양쪽에서 같은 모달을 연다.
// ============================================================================

import { useState } from 'react';
import { X, Repeat2, Loader2 } from 'lucide-react';
import { CandidatePool } from '@/components/exam-create/CandidatePool';
import type { CandidateProblem } from '@/app/api/problems/candidates/route';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { truncateLatexPreview } from '@/lib/utils/latex-preview';

export function ReplaceProblemModal({
  examId,
  problem,
  excludeIds,
  onClose,
  onChanged,
}: {
  examId: string;
  /** 바꿀 문제 (자리 기준) */
  problem: { id: string; number: number; content: string };
  /** 시험지에 이미 있는 문제 id — 후보에서 뺀다 */
  excludeIds: string[];
  onClose: () => void;
  /** 교체/추가가 DB 에 반영된 뒤 (호출측은 refetch) */
  onChanged: (how: 'replace' | 'add', candidate: CandidateProblem) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const replaceWith = async (c: CandidateProblem) => {
    if (busy) return;
    setBusy('replace'); setErr(null);
    try {
      const res = await fetch(`/api/exams/${examId}/problems`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'replace', fromProblemId: problem.id, toProblemId: c.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { error?: string }).error || `HTTP ${res.status}`);
      onChanged('replace', c);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };

  const addAfter = async (c: CandidateProblem) => {
    if (busy) return;
    setBusy('add'); setErr(null);
    try {
      const res = await fetch(`/api/exams/${examId}/problems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemIds: [c.id] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { error?: string }).error || `HTTP ${res.status}`);
      onChanged('add', c);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex h-[min(88vh,820px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/[.1] bg-surface-base shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-subtle px-5 py-3">
          <Repeat2 className="h-4 w-4 text-content-secondary" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-content-primary">{problem.number}번 문항 교체</div>
            <div className="truncate text-xs text-content-muted">같은 유형의 다른 문제로 바꿉니다. 번호·배점은 그대로입니다.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-content-muted hover:bg-surface-raised hover:text-content-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 기준 문제 — 무엇을 바꾸는지 보이게 */}
        <div className="border-b border-subtle bg-surface-raised/40 px-5 py-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-content-muted">지금 자리에 있는 문제</div>
          <div className="max-h-24 overflow-hidden text-[13px] text-content-secondary">
            <MixedContentRenderer content={truncateLatexPreview(problem.content || '', 220)} />
          </div>
        </div>

        {err && <div className="px-5 pt-2 text-xs text-content-primary">⚠ {err}</div>}

        <div className="relative min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {busy && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-base/70 text-sm text-content-secondary">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {busy === 'replace' ? '교체 중…' : '추가 중…'}
            </div>
          )}
          <CandidatePool
            baseId={problem.id}
            baseIndex={problem.number - 1}
            excludeIds={excludeIds}
            onReplace={replaceWith}
            onAdd={addAfter}
          />
        </div>
      </div>
    </div>
  );
}
