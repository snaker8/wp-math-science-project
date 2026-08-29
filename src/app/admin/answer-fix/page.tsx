'use client';

// ============================================================================
// /admin/answer-fix — 객관식 정답 박힘 회복 도구
// DB 진단 결과 객관식 1144개 중 261개(23%)가 정답 0/빈값으로 박힘.
// 이 페이지에서 한 번에 보고 수정.
// ============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';

interface BrokenItem {
  problemId: string;
  examId: string | null;
  examTitle: string;
  sequenceNumber: number;
  sourceNumber: number | null;
  sourceName: string | null;
  contentLatex: string;
  choices: string[];
  currentAnswer: string | null;
  suggestedAnswer: string | null;
  hasSolution: boolean;
}

const CIRCLED = ['①', '②', '③', '④', '⑤'];

export default function AnswerFixPage() {
  const [items, setItems] = useState<BrokenItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const fetchItems = useCallback(async (offset: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/objective-answer-broken?limit=${pageSize}&offset=${offset}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    fetchItems(page * pageSize);
  }, [page, pageSize, fetchItems]);

  const handleFix = async (problemId: string, answer: string) => {
    setSavingId(problemId);
    try {
      const res = await fetch('/api/admin/objective-answer-fix', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemId, answer }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setDoneIds(prev => new Set(prev).add(problemId));
    } catch (e) {
      alert(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingId(null);
    }
  };

  const handleSkip = (problemId: string) => {
    setSkippedIds(prev => new Set(prev).add(problemId));
  };

  /**
   * 추천 답 일괄 적용 — 현재 페이지에서 suggestedAnswer 가 있고 아직 처리 안 한 카드들을
   * 클라이언트 sequential 로 PATCH (Vercel chain 신뢰 X 메모리 가드 준수).
   * 메모리: feedback_vercel_chain_unreliable.md
   */
  const handleBulkApplySuggested = async () => {
    const targets = items.filter(it =>
      it.suggestedAnswer && !doneIds.has(it.problemId) && !skippedIds.has(it.problemId)
    );
    if (targets.length === 0) {
      alert('이 페이지에 적용할 추천 답이 없습니다.');
      return;
    }
    if (!confirm(`추천 답이 있는 ${targets.length}개 문제에 일괄 적용합니다. 진행하시겠습니까?`)) {
      return;
    }
    setBulkApplying(true);
    setBulkProgress({ done: 0, total: targets.length });
    try {
      for (let i = 0; i < targets.length; i++) {
        const it = targets[i];
        try {
          const res = await fetch('/api/admin/objective-answer-fix', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ problemId: it.problemId, answer: it.suggestedAnswer }),
          });
          if (res.ok) {
            setDoneIds(prev => new Set(prev).add(it.problemId));
          } else {
            console.warn(`[bulk-apply] ${it.problemId} 실패: ${res.status}`);
          }
        } catch (e) {
          console.warn(`[bulk-apply] ${it.problemId} 예외:`, e);
        }
        setBulkProgress({ done: i + 1, total: targets.length });
        // 짧은 호흡 (Supabase 부하 방지)
        await new Promise(r => setTimeout(r, 80));
      }
    } finally {
      setBulkApplying(false);
      setTimeout(() => setBulkProgress(null), 2000);
    }
  };

  const suggestedCountThisPage = items.filter(it =>
    it.suggestedAnswer && !doneIds.has(it.problemId) && !skippedIds.has(it.problemId)
  ).length;

  const totalPages = Math.ceil(total / pageSize);
  const remaining = items.filter(it => !doneIds.has(it.problemId) && !skippedIds.has(it.problemId)).length;

  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">객관식 정답 회복 도구</h1>
        <p className="mt-1 text-sm text-gray-600">
          정답이 <code className="bg-red-50 text-red-600 px-1 rounded">0</code> / 빈값 / null 로 박힌 객관식 문제를 한 번에 보고 수정합니다.
          ① ~ ⑤ 누르면 즉시 DB 갱신.
        </p>
        <div className="mt-3 flex items-center gap-4 text-sm flex-wrap">
          <span className="text-gray-500">전체 박힘: <strong className="text-red-600">{total}</strong>개</span>
          <span className="text-gray-500">현재 페이지: <strong>{page + 1} / {totalPages || 1}</strong></span>
          <span className="text-gray-500">이번 페이지 남은 항목: <strong>{remaining}</strong></span>
          {suggestedCountThisPage > 0 && (
            <button
              type="button"
              onClick={handleBulkApplySuggested}
              disabled={bulkApplying}
              className="ml-auto px-3 py-1.5 rounded-full bg-gray-900 text-white text-xs font-bold hover:bg-gray-700 whitespace-nowrap transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {bulkApplying ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  적용 중 {bulkProgress ? `${bulkProgress.done}/${bulkProgress.total}` : ''}
                </>
              ) : (
                `추천 답 일괄 적용 (${suggestedCountThisPage}개)`
              )}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />{error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-6 py-12 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500 mb-3" />
          <p className="text-emerald-700 font-medium">박힌 객관식 정답이 없습니다 — 모두 정상입니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => {
            const isDone = doneIds.has(it.problemId);
            const isSkipped = skippedIds.has(it.problemId);
            const isSaving = savingId === it.problemId;
            return (
              <div
                key={it.problemId}
                className={`rounded-lg border bg-white p-4 transition-opacity ${
                  isDone ? 'border-emerald-300 bg-emerald-50/30 opacity-60' :
                  isSkipped ? 'border-gray-200 bg-gray-50 opacity-50' :
                  'border-gray-200'
                }`}
              >
                {/* 헤더 */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-gray-700">{it.examTitle}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-600">{it.sequenceNumber}번</span>
                    {it.examId && (
                      <a
                        href={`/dashboard/cloud/${it.examId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-1 text-gray-500 hover:text-gray-900 inline-flex items-center gap-0.5"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>시험지</span>
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">현재 답:</span>
                    <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-mono">
                      {it.currentAnswer === null ? '(빈값)' : it.currentAnswer}
                    </span>
                  </div>
                </div>

                {/* 본문 */}
                <div className="mb-2 text-sm text-gray-700 line-clamp-3">
                  <MixedContentRenderer content={it.contentLatex} className="text-gray-700" />
                </div>

                {/* 선택지 */}
                {it.choices.length > 0 && (
                  <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 pl-2">
                    {it.choices.map((c, i) => {
                      const stripped = c.replace(/^[①②③④⑤]\s*/, '').replace(/^\(\s*\d+\s*\)\s*/, '');
                      return (
                        <div key={i} className="flex gap-1.5">
                          <span className="text-gray-400 flex-shrink-0">{CIRCLED[i]}</span>
                          <span className="truncate">
                            <MixedContentRenderer content={stripped} className="text-gray-600" />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 추천 답 표시 */}
                {it.suggestedAnswer && !isDone && !isSkipped && (
                  <div className="mb-2 text-xs text-gray-700">
                    해설에서 추출된 추천 답: <strong className="text-base">{it.suggestedAnswer}</strong>
                  </div>
                )}
                {!it.hasSolution && !isDone && !isSkipped && (
                  <div className="mb-2 text-xs text-gray-400">해설 없음 — 추천 답 자동 추출 불가</div>
                )}

                {/* 액션 */}
                <div className="flex items-center gap-1.5">
                  {isDone ? (
                    <span className="text-xs text-emerald-600 inline-flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" /> 저장 완료
                    </span>
                  ) : isSkipped ? (
                    <span className="text-xs text-gray-400">건너뜀</span>
                  ) : (
                    <>
                      {CIRCLED.map((c) => {
                        const isSuggested = it.suggestedAnswer === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleFix(it.problemId, c)}
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-base font-bold transition-all ${
                              isSuggested
                                ? 'bg-white text-gray-900 border-2 border-gray-900 hover:bg-gray-100'
                                : 'bg-gray-50 text-gray-700 border border-gray-300 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title={isSuggested ? '추천 답' : `${c} 으로 저장`}
                          >
                            {c}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleSkip(it.problemId)}
                        className="ml-2 px-3 py-1 rounded-md text-xs text-gray-500 border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
                      >
                        건너뛰기
                      </button>
                      {isSaving && <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 페이지네이션 */}
      {!loading && total > pageSize && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            className="px-3 py-1.5 rounded-md border border-gray-300 inline-flex items-center gap-1 hover:bg-gray-50 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" /> 이전
          </button>
          <span className="text-gray-600">{page + 1} / {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 rounded-md border border-gray-300 inline-flex items-center gap-1 hover:bg-gray-50 disabled:opacity-30"
          >
            다음 <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
