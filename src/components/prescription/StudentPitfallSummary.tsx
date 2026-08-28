'use client';

// ============================================================================
// StudentPitfallSummary — 학생 함정 누적 위젯 (Phase C-3)
//
// 카파시 self-compiling 4번째 차원의 시각화. v_student_pitfall_summary
// + 최근 7일 발생 빈도(이번 주 새 연결)를 카드로 표시.
//
// 사용:
//   <StudentPitfallSummary studentId={studentId} />
// ============================================================================

import React, { useEffect, useState } from 'react';
import { AlertTriangle, TrendingUp, Sparkles, Loader2 } from 'lucide-react';

interface SummaryRow {
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
  totalOccurrences: number;
  distinctPitfalls: number;
  recentWeekTotal: number;
  byCategory: Array<{ category: string; count: number }>;
  summary: SummaryRow[];
}

const CATEGORY_LABEL: Record<string, string> = {
  computation: '계산',
  concept: '개념',
  logic: '논리',
  wording: '문장',
  time: '시간',
};

const CATEGORY_CHIP = 'border-white/[.08] bg-white/[.04] text-content-secondary';

interface Props {
  studentId: string;
}

export function StudentPitfallSummary({ studentId }: Props) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(`/api/students/${encodeURIComponent(studentId)}/pitfall-summary`, {
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `HTTP ${r.status}`);
        }
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
      <div className="flex items-center justify-center rounded-xl border border-white/[.08] bg-surface-card px-4 py-6 text-xs text-content-tertiary">
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        함정 누적 로딩 중...
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

  if (!data || data.distinctPitfalls === 0) {
    return (
      <div className="rounded-xl border border-white/[.08] bg-surface-card px-4 py-6 text-center text-xs text-content-tertiary">
        <Sparkles className="mx-auto mb-2 h-4 w-4 text-content-muted" />
        아직 누적된 함정 데이터가 없습니다.
        <div className="mt-1 text-[10px] text-content-muted">
          학생이 채점에서 오답 낼 때마다 자동으로 누적됩니다.
        </div>
      </div>
    );
  }

  const top = data.summary.slice(0, 8);

  return (
    <div className="rounded-xl border border-white/[.08] bg-surface-card p-4">
      {/* 헤더 — 요약 통계 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-content-primary">
          <AlertTriangle className="h-4 w-4 text-content-tertiary" />
          학생 함정 누적
        </div>
        {data.recentWeekTotal > 0 && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-white/[.08] bg-white/[.04] px-2 py-0.5 text-[10px] font-semibold text-content-secondary">
            <TrendingUp className="h-3 w-3" />
            이번 주 +{data.recentWeekTotal}
          </span>
        )}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-[10px]">
        <Stat label="총 발생" value={data.totalOccurrences} unit="회" />
        <Stat label="함정 종류" value={data.distinctPitfalls} unit="종" accent="cyan" />
        <Stat label="이번 주" value={data.recentWeekTotal} unit="회" accent="amber" />
      </div>

      {/* 카테고리 분포 */}
      {data.byCategory.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {data.byCategory.map((c) => (
            <span
              key={c.category}
              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-medium ${CATEGORY_CHIP}`}
            >
              {CATEGORY_LABEL[c.category] || c.category} <span className="tabular-nums">{c.count}</span>
            </span>
          ))}
        </div>
      )}

      {/* TOP 함정 리스트 */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">
          TOP {top.length} 자주 빠지는 함정
        </div>
        {top.map((p) => {
          const maxCount = top[0].occurrenceCount;
          const pct = maxCount > 0 ? (p.occurrenceCount / maxCount) * 100 : 0;
          return (
            <div key={p.pitfallCode} className="grid grid-cols-[1fr_60px] items-center gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className="truncate text-xs text-content-secondary">{p.label}</div>
                  {p.recentWeekCount > 0 && (
                    <span className="shrink-0 whitespace-nowrap rounded border border-white/[.08] bg-white/[.04] px-1 py-0.5 text-[9px] text-content-secondary">
                      +{p.recentWeekCount} 이번 주
                    </span>
                  )}
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <div className="text-right text-[10px] tabular-nums text-content-secondary">
                {p.occurrenceCount}회
                <span className="ml-1 text-content-muted">/{p.distinctProblemCount}문항</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: number;
  unit: string;
  accent?: 'cyan' | 'amber';
}) {
  // 수치 색은 크롬 — 무채 (accent 는 강조 단계만 남김)
  const valueColor = accent ? 'text-content-secondary' : 'text-content-primary';
  return (
    <div className="rounded-lg border border-white/[.08] bg-white/[.03] p-2">
      <div className="text-[9px] uppercase tracking-wider text-content-tertiary">{label}</div>
      <div className={`mt-0.5 text-base font-bold ${valueColor}`}>
        {value}
        <span className="ml-0.5 text-[9px] font-medium text-content-tertiary">{unit}</span>
      </div>
    </div>
  );
}
