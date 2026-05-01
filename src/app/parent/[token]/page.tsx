'use client';

// ============================================================================
// 학부모 전용 페이지 (Phase D)
// /parent/[token]
//
// 학부모가 share token으로 자녀 함정·약점·진척 종합 조회. 로그인 X.
// 카파시 차별 마케팅 본 무대 — "지식이 자라는 모습"을 학부모가 직접 본다.
// 따뜻한 톤(주황 + 파스텔) — PR #3 동부산 블로그 톤 일관.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Heart,
  Loader2,
  AlertOctagon,
  BookOpen,
} from 'lucide-react';

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

interface ParentResponse {
  student: { id: string; name: string; school: string | null; grade: string | null };
  label: string | null;
  totalOccurrences: number;
  distinctPitfalls: number;
  recentWeekTotal: number;
  summary: PitfallRow[];
  newConnections: PitfallRow[];
  intensifying: PitfallRow[];
}

const CATEGORY_LABEL: Record<string, string> = {
  computation: '계산',
  concept: '개념',
  logic: '논리',
  wording: '문장',
  time: '시간',
};

export default function ParentPage() {
  const params = useParams();
  const token = (params?.token as string) || '';
  const [data, setData] = useState<ParentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/parent/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d: ParentResponse) => {
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
  }, [token]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-orange-50">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-orange-500" />
        <span className="text-sm text-orange-600">불러오는 중...</span>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-orange-50 px-4 text-center">
        <Heart className="h-10 w-10 text-orange-300" />
        <div className="text-base font-semibold text-orange-900">{err || '링크를 찾을 수 없습니다'}</div>
        <div className="max-w-md text-xs text-orange-700">
          링크가 만료됐거나 비활성화됐을 수 있습니다. 학원에 문의해 주세요.
        </div>
      </div>
    );
  }

  const top5 = data.summary.slice(0, 5);
  const studentName = data.student.name || '자녀';
  const generatedAt = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 pb-12">
      {/* 헤더 */}
      <header className="border-b border-orange-200/60 bg-white/70 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-5 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-amber-400 shadow-md">
              <Heart className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-orange-900">{studentName} 학생 학습 리포트</h1>
              <p className="mt-0.5 text-xs text-orange-700">
                {data.student.school && `${data.student.school} · `}
                {data.student.grade || ''} · {generatedAt}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-6 space-y-5">
        {/* 인사 메시지 */}
        <div className="rounded-2xl border border-orange-200 bg-white/70 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
            <div className="text-sm leading-relaxed text-orange-900">
              안녕하세요, {studentName} 학부모님. 이번 주 자녀의 학습 활동과 자주 부딪치는
              사고 패턴을 정리했습니다. 학원이 어떤 약점을 어떻게 개선하고 있는지 함께 확인해 주세요.
            </div>
          </div>
        </div>

        {/* 이번 주 새 연결 — 카파시 영상의 본 메시지 */}
        {data.newConnections.length > 0 || data.intensifying.length > 0 ? (
          <div className="rounded-2xl border border-orange-300 bg-gradient-to-br from-orange-100 via-amber-50 to-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-orange-900">
                <TrendingUp className="h-4 w-4 text-orange-500" />
                이번 주 새 발견
              </div>
              <span className="rounded-full bg-orange-200 px-2.5 py-0.5 text-[11px] font-semibold text-orange-800">
                총 {data.recentWeekTotal}건
              </span>
            </div>

            {data.newConnections.length > 0 && (
              <div className="mb-3">
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-orange-600">
                  ✨ 새로 발견한 사고 패턴 {data.newConnections.length}개
                </div>
                <ul className="space-y-1.5">
                  {data.newConnections.slice(0, 4).map((p) => (
                    <li
                      key={p.pitfallCode}
                      className="rounded-xl border border-orange-200 bg-white px-4 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-orange-900">{p.label}</div>
                        <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                          {p.recentWeekCount}회
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-orange-700">
                        {CATEGORY_LABEL[p.category] || p.category} · {p.distinctProblemCount}문항에서 발견
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.intensifying.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-600">
                  ⚠️ 반복되는 사고 패턴 {data.intensifying.length}개
                </div>
                <ul className="space-y-1.5">
                  {data.intensifying.slice(0, 3).map((p) => (
                    <li
                      key={p.pitfallCode}
                      className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-rose-900">{p.label}</div>
                        <AlertOctagon className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                      </div>
                      <div className="mt-0.5 text-[11px] text-rose-700">
                        누적 {p.occurrenceCount}회 · 이번 주만 {p.recentWeekCount}회
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 text-center shadow-sm">
            <Sparkles className="mx-auto mb-2 h-6 w-6 text-emerald-400" />
            <div className="text-sm font-semibold text-emerald-800">이번 주는 새로 발견한 약점이 없습니다</div>
            <div className="mt-1 text-[11px] text-emerald-600">
              꾸준한 학습이 좋은 습관을 만들어가고 있어요.
            </div>
          </div>
        )}

        {/* 누적 약점 TOP 5 */}
        {top5.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              집중 보강 중인 약점 TOP {top5.length}
            </div>
            <ul className="space-y-2.5">
              {top5.map((p) => {
                const max = top5[0].occurrenceCount;
                const pct = max > 0 ? (p.occurrenceCount / max) * 100 : 0;
                return (
                  <li key={p.pitfallCode}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="truncate font-semibold text-amber-900">{p.label}</div>
                      <div className="shrink-0 text-amber-700">
                        {p.occurrenceCount}회
                        <span className="ml-1 text-[10px] text-amber-500">/{p.distinctProblemCount}문항</span>
                      </div>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-amber-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* 학원 메시지 */}
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <div className="flex items-start gap-3">
            <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
            <div className="text-xs leading-relaxed text-orange-900">
              학원에서는 자녀가 자주 부딪치는 사고 패턴을 자동으로 추적하고, 그에 맞는 보강 학습지를
              제공하고 있습니다. 자녀가 풀 때마다 시스템이 더 정확한 처방을 만들어냅니다.
              <div className="mt-2 text-[11px] text-orange-700">
                · 자료 출처: 학원 채점 데이터 자동 누적 (이번 주 {data.recentWeekTotal}건 발생)
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-[10px] text-orange-400">
          이 페이지는 학부모님 전용 비공개 링크입니다. 외부에 공유하지 마세요.
        </div>
      </main>
    </div>
  );
}
