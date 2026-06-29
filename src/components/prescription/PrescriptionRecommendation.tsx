'use client';

// ============================================================================
// PrescriptionRecommendation — 처방 추천 카드 (Phase C — 처방에 함정 활용)
//
// 약점 체인(가장 약한 단원·선수 관계) + 학생 자주 빠지는 함정을 결합해
// "○○ 단원의 ××(함정) 보강 추천" 같은 actionable 메시지 자동 생성.
//
// 카파시 self-compiling의 강사 효율 무대 — 데이터가 쌓일수록 처방이 정밀.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Lightbulb, Loader2, Target, AlertTriangle, ArrowRight } from 'lucide-react';

interface PitfallRow {
  pitfallCode: string;
  label: string;
  category: string;
  occurrenceCount: number;
  recentWeekCount: number;
}

interface SummaryResponse {
  studentId: string;
  distinctPitfalls: number;
  recentWeekTotal: number;
  summary: PitfallRow[];
}

interface WeakestUnit {
  fullPath: string;
  status?: string | null; // 'γ' | 'β' | 'α' 또는 null
}

const CATEGORY_LABEL: Record<string, string> = {
  computation: '계산',
  concept: '개념',
  logic: '논리',
  wording: '문장',
  time: '시간',
};

const CATEGORY_ACTION: Record<string, string> = {
  computation: '단계별 계산 연습',
  concept: '개념 정리 + 예제 풀이',
  logic: '경우 분기 명시 후 풀이',
  wording: '문제 조건 → 식 전환 연습',
  time: '제한 시간 풀이 + 검산 습관',
};

interface Props {
  studentId: string;
  weakestUnit: WeakestUnit | null;
}

export function PrescriptionRecommendation({ studentId, weakestUnit }: Props) {
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
      <div className="flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-xs text-zinc-500">
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        처방 추천 분석 중...
      </div>
    );
  }

  // 데이터 부족 — 추천 X
  if (err || !data || data.distinctPitfalls === 0) {
    if (!weakestUnit) {
      return null; // 약점 단원 + 함정 둘 다 없으면 카드 자체 숨김
    }
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          AI 처방 추천
        </div>
        <div className="text-xs text-zinc-400">
          학생의 채점 데이터가 더 누적되면 단원 + 함정 결합 추천이 활성화됩니다.
        </div>
        {weakestUnit && (
          <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
            현재 가장 약한 단원: <span className="font-semibold">{weakestUnit.fullPath}</span>
          </div>
        )}
      </div>
    );
  }

  // 추천 1: 가장 자주 빠지는 함정 TOP 3 → 보강 학습 항목
  const top3 = data.summary.slice(0, 3);

  // 추천 2: 이번 주 활동도가 높은 함정 (recentWeekCount DESC)
  const recentTop = [...data.summary]
    .filter((p) => p.recentWeekCount > 0)
    .sort((a, b) => b.recentWeekCount - a.recentWeekCount)
    .slice(0, 2);

  return (
    <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-900/20 via-zinc-900/40 to-zinc-900/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          AI 처방 추천
        </div>
        <span className="text-[10px] text-zinc-500">
          약점 체인 + 함정 패턴 결합
        </span>
      </div>

      {/* 약점 단원 컨텍스트 */}
      {weakestUnit && (
        <div className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-rose-300">
            <Target className="h-3 w-3" />
            우선 보강 단원
          </div>
          <div className="mt-1 text-xs text-rose-100">
            {weakestUnit.fullPath}
            {weakestUnit.status && (
              <span className="ml-2 inline-block rounded bg-rose-500/25 px-1.5 py-0.5 text-[9px] font-bold text-rose-200">
                {({ gamma: 'γ 불안정', beta: 'β 안정', alpha: 'α 마스터', unknown: '미진단' } as Record<string, string>)[weakestUnit.status] || weakestUnit.status}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 자주 빠지는 함정 TOP 3 → 보강 액션 */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
          <AlertTriangle className="h-3 w-3" />
          반복되는 함정 TOP {top3.length}
        </div>
        <ul className="space-y-1.5">
          {top3.map((p) => {
            const action = CATEGORY_ACTION[p.category] || '단계별 풀이 연습';
            return (
              <li
                key={p.pitfallCode}
                className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-amber-200">
                      {p.label}
                    </div>
                    <div className="mt-0.5 text-[10px] text-amber-400/70">
                      {CATEGORY_LABEL[p.category] || p.category} · 누적 {p.occurrenceCount}회
                      {p.recentWeekCount > 0 && (
                        <span className="ml-1.5 rounded bg-amber-500/25 px-1 py-0.5 text-[9px] text-amber-200">
                          이번 주 +{p.recentWeekCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-amber-400/70" />
                </div>
                <div className="mt-1.5 text-[10px] text-zinc-300">
                  → 추천: <span className="font-semibold text-emerald-300">{action}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 결합 요약 */}
      {weakestUnit && top3.length > 0 && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
          <div className="text-[10px] font-semibold text-emerald-300">처방 우선순위</div>
          <div className="mt-1 text-[11px] leading-relaxed text-emerald-100">
            <span className="font-semibold">{weakestUnit.fullPath}</span> 단원의 학습지에서
            특히 <span className="font-semibold">{top3[0].label}</span>
            {top3[1] && (
              <>
                ·<span className="font-semibold">{top3[1].label}</span>
              </>
            )}{' '}
            패턴 문항을 우선 배치하세요.
            {recentTop.length > 0 && (
              <>
                {' '}최근 활동도가 높아 즉시 보강 효과가 큽니다.
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
