'use client';

// ============================================================================
// RecommendedProblems — 학생 맞춤 추천 문항 (Phase B 카파시 학습 무대)
//
// 약점 단원 + 자주 빠지는 함정 + 적정 난이도 결합으로 학생별 추천 문항 표시.
// 데이터: GET /api/students/[studentId]/recommended-problems
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Loader2,
  Target,
  AlertTriangle,
  Sparkles,
  ListPlus,
} from 'lucide-react';

interface RecommendedProblem {
  problemId: string;
  contentPreview: string;
  typeCode: string;
  typeName: string;
  difficulty: number;
  matchedPitfalls: string[];
  matchScore: number;
  reason: string;
}

interface Response {
  studentId: string;
  weakestUnit: { code: string; fullPath: string; status: string } | null;
  topPitfalls: Array<{ code: string; label: string }>;
  difficultyRange: [number, number];
  candidateCount?: number;
  problems: RecommendedProblem[];
  message?: string;
}

interface Props {
  studentId: string;
  /** 드릴다운에서 콕 집은 약점 소단원/유형 코드 — 있으면 전역 최약점 대신 이 단원으로 추천 */
  focusCode?: string | null;
}

export function RecommendedProblems({ studentId, focusCode }: Props) {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<{ sessionUrl: string; problemCount: number } | null>(null);
  const [genErr, setGenErr] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setGenerated(null); // 단원 바뀌면 이전 생성 결과 초기화
    const codeParam = focusCode ? `&code=${encodeURIComponent(focusCode)}` : '';
    fetch(`/api/students/${encodeURIComponent(studentId)}/recommended-problems?topN=10${codeParam}`, {
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d: Response) => {
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
  }, [studentId, focusCode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-xs text-zinc-500">
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        추천 문항 분석 중...
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

  if (!data) return null;

  // 데이터 부족 케이스
  if (data.problems.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
          <BookOpen className="h-4 w-4 text-emerald-400" />
          맞춤 추천 문항
        </div>
        <div className="text-xs text-zinc-400">
          {data.message || '학생 데이터가 더 누적되면 추천이 활성화됩니다.'}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-900/20 via-zinc-900/40 to-zinc-900/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <BookOpen className="h-4 w-4 text-emerald-400" />
          맞춤 추천 문항
        </div>
        <span className="text-[10px] text-zinc-500">
          후보 {data.candidateCount || 0} / 추천 {data.problems.length}
        </span>
      </div>

      {/* 추천 컨텍스트 — 약점·함정·난이도 */}
      <div className="mb-3 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
        {data.weakestUnit && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-2.5 py-1.5">
            <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-rose-300">
              <Target className="h-3 w-3" />
              약점 단원
            </div>
            <div className="mt-0.5 truncate text-rose-100">
              {data.weakestUnit.fullPath}
              <span className="ml-1 inline-block rounded bg-rose-500/25 px-1 py-0.5 text-[8px] font-bold text-rose-200">
                {data.weakestUnit.status}
              </span>
            </div>
          </div>
        )}
        {data.topPitfalls.length > 0 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5">
            <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
              <AlertTriangle className="h-3 w-3" />
              주력 함정 TOP {data.topPitfalls.length}
            </div>
            <div className="mt-0.5 truncate text-amber-100">
              {data.topPitfalls.map((p) => p.label).join(', ')}
            </div>
          </div>
        )}
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-1.5">
          <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-cyan-300">
            <Sparkles className="h-3 w-3" />
            적정 난이도
          </div>
          <div className="mt-0.5 text-cyan-100">
            {data.difficultyRange[0]} ~ {data.difficultyRange[1]} 단계
          </div>
        </div>
      </div>

      {/* 추천 문항 리스트 */}
      <div className="space-y-1.5">
        {data.problems.map((p, i) => (
          <div
            key={p.problemId}
            className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                #{i + 1}
              </span>
              <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
                난이도 {p.difficulty}
              </span>
              {p.matchedPitfalls.length > 0 && (
                <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                  함정 {p.matchedPitfalls.length}
                </span>
              )}
              <span className="ml-auto truncate text-[10px] text-zinc-500">
                {p.typeName}
              </span>
            </div>
            <div className="mt-1 line-clamp-2 text-[11px] text-zinc-300">
              {p.contentPreview || '(본문 없음)'}
            </div>
            <div className="mt-1 text-[10px] text-emerald-300/80">→ {p.reason}</div>
          </div>
        ))}
      </div>

      {/* 학습지 자동 생성 — 추천 문항을 즉시 sessions로 발급 */}
      {generated ? (
        <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs">
          <div className="font-semibold text-emerald-200">
            ✓ 학습지 생성 완료 — 문항 {generated.problemCount}개
          </div>
          <a
            href={generated.sessionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block break-all text-[11px] text-emerald-300 underline hover:text-emerald-200"
          >
            {generated.sessionUrl}
          </a>
        </div>
      ) : (
        <button
          type="button"
          disabled={generating || data.problems.length === 0}
          onClick={async () => {
            setGenerating(true);
            setGenErr(null);
            try {
              const res = await fetch(
                `/api/students/${encodeURIComponent(studentId)}/generate-recommended-session`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    problemIds: data.problems.map((p) => p.problemId),
                    label: data.weakestUnit
                      ? `[맞춤] ${data.weakestUnit.fullPath.split(' > ').pop()} 보강`
                      : undefined,
                  }),
                }
              );
              const d = await res.json();
              if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
              setGenerated({ sessionUrl: d.sessionUrl, problemCount: d.problemCount });
            } catch (e) {
              setGenErr(e instanceof Error ? e.message : '학습지 생성 실패');
            } finally {
              setGenerating(false);
            }
          }}
          className="mt-3 w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {generating ? (
            <>
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
              생성 중...
            </>
          ) : (
            <>
              <ListPlus className="mr-1 inline h-3 w-3" />
              학습지 생성 ({data.problems.length}개 문항)
            </>
          )}
        </button>
      )}
      {genErr && (
        <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-1.5 text-[11px] text-rose-300">
          {genErr}
        </div>
      )}
    </div>
  );
}
