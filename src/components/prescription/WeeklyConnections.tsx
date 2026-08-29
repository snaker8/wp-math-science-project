'use client';

// ============================================================================
// WeeklyConnections — "이번 주 새 연결" 단독 위젯 (Phase C-3 B)
//
// 카파시 영상의 본 메시지: "이번 주 [이차방정식 → 근의 분리 조건] 새 연결 형성.
// 7개 문항이 같은 패턴으로 풀렸습니다."
//
// 표시:
//  1) New Connections — 이번 주 첫 발생한 함정 (firstOccurredAt이 7일 내)
//  2) Intensifying — 이전부터 있었으나 이번 주 빈도 증가한 함정
//
// 데이터: GET /api/students/[studentId]/pitfall-summary 응답의 newConnections/intensifying
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Sparkles, TrendingUp, Loader2, Zap, AlertOctagon } from 'lucide-react';

interface PitfallRow {
  pitfallCode: string;
  label: string;
  category: string;
  occurrenceCount: number;
  distinctProblemCount: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
  recentWeekCount: number;
}

interface SummaryResponse {
  studentId: string;
  newConnections: PitfallRow[];
  intensifying: PitfallRow[];
  recentWeekTotal: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  computation: '계산',
  concept: '개념',
  logic: '논리',
  wording: '문장',
  time: '시간',
};

interface Props {
  studentId: string;
}

export function WeeklyConnections({ studentId }: Props) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(`/api/students/${encodeURIComponent(studentId)}/pitfall-summary`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: SummaryResponse) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : '로드 실패');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-6 text-xs text-content-tertiary">
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        이번 주 활동 로딩 중...
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-xs text-rose-300">
        {err}
      </div>
    );
  }

  if (!data || data.recentWeekTotal === 0) {
    return (
      <div className="rounded-xl border border-white/[.08] bg-white/[.03] px-4 py-6 text-center">
        <Sparkles className="mx-auto mb-2 h-5 w-5 text-content-tertiary" />
        <div className="text-xs font-semibold text-content-primary">이번 주 새 연결 없음</div>
        <div className="mt-1 text-[10px] text-content-tertiary">
          학생이 채점에서 오답 낼 때 자동 추적됩니다.
        </div>
      </div>
    );
  }

  const newCount = data.newConnections.length;
  const intCount = data.intensifying.length;

  return (
    <div className="rounded-xl border border-white/[.08] bg-white/[.03] p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-content-primary">
          <Zap className="h-4 w-4 text-content-tertiary" />
          이번 주 새 연결
        </div>
        <span className="whitespace-nowrap rounded-full border border-white/[.08] bg-white/[.04] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-content-secondary">
          총 {data.recentWeekTotal}건
        </span>
      </div>

      {/* New Connections — 첫 발생 */}
      {newCount > 0 ? (
        <div className="mb-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">
            <Sparkles className="h-3 w-3" />
            신규 연결 {newCount}건 — 이번 주 첫 발견
          </div>
          <ul className="space-y-1.5">
            {data.newConnections.slice(0, 5).map((p) => (
              <li
                key={p.pitfallCode}
                className="flex items-center justify-between rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-1.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-content-primary">{p.label}</div>
                  <div className="mt-0.5 text-[10px] text-content-tertiary">
                    {CATEGORY_LABEL[p.category] || p.category} · {p.distinctProblemCount}문항에서
                  </div>
                </div>
                <span className="shrink-0 rounded border border-white/[.08] bg-white/[.06] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-content-secondary">
                  +{p.recentWeekCount}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Intensifying — 기존 약점 깊어짐 */}
      {intCount > 0 ? (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            <TrendingUp className="h-3 w-3" />
            약점 깊어짐 {intCount}건 — 이번 주 빈도 증가
          </div>
          <ul className="space-y-1.5">
            {data.intensifying.slice(0, 5).map((p) => (
              <li
                key={p.pitfallCode}
                className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-amber-200">{p.label}</div>
                  <div className="mt-0.5 text-[10px] text-amber-400/70">
                    누적 {p.occurrenceCount}회 · 이번 주만 {p.recentWeekCount}회
                  </div>
                </div>
                <AlertOctagon className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
