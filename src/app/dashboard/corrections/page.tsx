'use client';

// ============================================================================
// 분류 보정 이력 dashboard (Phase C-2c-4)
// /dashboard/corrections
//
// 카파시 self-compiling 가시화 — 강사 보정이 누적될수록 시스템이 똑똑해진다.
// 학원장에게 "이번 주 N건 보정 → 비슷한 케이스 자동 정확 분류" 임팩트.
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  TrendingUp,
  ArrowRight,
  Loader2,
  History,
  Layers,
  Target,
} from 'lucide-react';

interface SummaryResponse {
  total: number;
  recent7: number;
  recent30: number;
  topTransitions: Array<{ transition: string; count: number; afterTypeName: string | null }>;
  topAreas: Array<{ prefix: string; count: number }>;
  daily: Array<{ date: string; count: number }>;
  recent: Array<{
    beforeCode: string | null;
    afterCode: string;
    afterTypeName: string | null;
    examSubject: string | null;
    reason: string | null;
    correctedAt: string;
  }>;
}

const SUBJECT_NAME: Record<string, string> = {
  '01': '중1-1', '02': '중1-2', '03': '중2-1', '04': '중2-2',
  '05': '중3-1', '06': '중3-2',
  '07': '공통수학1', '08': '공통수학2',
  '09': '대수', '10': '미적분1', '11': '확률과 통계',
  '12': '미적분2', '13': '기하',
};

function prefixToName(prefix: string): string {
  // MS09-02 → "대수 (MS09-02)" — subject_code만 매핑
  const m = prefix.match(/^MS(\d{2})/);
  if (!m) return prefix;
  const subj = SUBJECT_NAME[m[1]] || `과목${m[1]}`;
  return `${subj} (${prefix})`;
}

export default function CorrectionsDashboardPage() {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/corrections/summary', { cache: 'no-store' })
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
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-black text-zinc-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        <span className="text-sm">로딩 중...</span>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-black text-zinc-400">
        <span className="text-sm">{err || '데이터 없음'}</span>
      </div>
    );
  }

  const maxDaily = Math.max(1, ...data.daily.map((d) => d.count));

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black text-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-800/50 bg-gradient-to-r from-cyan-900/30 via-indigo-900/20 to-zinc-900/30 px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10">
            <Sparkles className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">분류 보정 이력</h1>
            <p className="mt-0.5 text-xs text-zinc-400">
              강사가 보정할수록 시스템이 똑똑해집니다 — Self-Compiling Knowledge System
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* 통계 4 카드 */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="총 보정 수" value={data.total} unit="건" icon={<History className="h-4 w-4" />} />
          <StatCard label="최근 30일" value={data.recent30} unit="건" icon={<TrendingUp className="h-4 w-4" />} accent="cyan" />
          <StatCard label="최근 7일" value={data.recent7} unit="건" icon={<Sparkles className="h-4 w-4" />} accent="amber" />
          <StatCard
            label="평균 일일"
            value={data.recent30 > 0 ? Math.round((data.recent30 / 30) * 10) / 10 : 0}
            unit="건"
            icon={<Target className="h-4 w-4" />}
          />
        </div>

        {/* 일별 추이 */}
        <Panel title="최근 30일 추이" icon={<TrendingUp className="h-4 w-4" />}>
          <div className="flex h-32 items-end gap-1 px-2">
            {data.daily.map((d) => {
              const pct = (d.count / maxDaily) * 100;
              return (
                <div
                  key={d.date}
                  className="group relative flex-1 cursor-default"
                  title={`${d.date} · ${d.count}건`}
                >
                  <div
                    className="rounded-t bg-gradient-to-t from-cyan-500/40 to-cyan-500"
                    style={{ height: d.count === 0 ? '2px' : `${Math.max(4, pct)}%` }}
                  />
                  {d.count > 0 && (
                    <div className="absolute -top-5 left-1/2 hidden -translate-x-1/2 rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-cyan-300 group-hover:block">
                      {d.count}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-zinc-500">
            <span>{data.daily[0]?.date}</span>
            <span>{data.daily[data.daily.length - 1]?.date}</span>
          </div>
        </Panel>

        {/* Row: 자주 보정되는 변환 + 영역별 누적 */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="자주 보정되는 변환 TOP10" icon={<ArrowRight className="h-4 w-4" />}>
            {data.topTransitions.length === 0 ? (
              <Empty>보정 데이터가 없습니다</Empty>
            ) : (
              <ul className="space-y-2">
                {data.topTransitions.map((t, i) => (
                  <li key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <code className="truncate text-amber-300">{t.transition}</code>
                      <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">
                        {t.count}회
                      </span>
                    </div>
                    {t.afterTypeName && (
                      <div className="mt-1 truncate text-[10px] text-zinc-400">
                        → {t.afterTypeName}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="영역별 보정 누적 TOP10" icon={<Layers className="h-4 w-4" />}>
            {data.topAreas.length === 0 ? (
              <Empty>영역 데이터가 없습니다</Empty>
            ) : (
              <ul className="space-y-2">
                {data.topAreas.map((a, i) => {
                  const pct = (a.count / data.topAreas[0].count) * 100;
                  return (
                    <li key={i} className="grid grid-cols-[1fr_60px] items-center gap-3">
                      <div>
                        <div className="text-xs text-zinc-300">{prefixToName(a.prefix)}</div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right text-[10px] text-zinc-400">{a.count}건</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        {/* 최근 보정 이력 */}
        <Panel title="최근 보정 이력 (TOP 20)" icon={<History className="h-4 w-4" />}>
          {data.recent.length === 0 ? (
            <Empty>보정 이력이 없습니다</Empty>
          ) : (
            <div className="overflow-hidden rounded-lg border border-zinc-800">
              <table className="w-full text-xs">
                <thead className="bg-zinc-900/60 text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 text-left">시각</th>
                    <th className="px-3 py-2 text-left">변환</th>
                    <th className="px-3 py-2 text-left">단원</th>
                    <th className="px-3 py-2 text-left">과목</th>
                    <th className="px-3 py-2 text-left">이유</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((r, i) => (
                    <tr key={i} className="border-t border-zinc-800/60 hover:bg-zinc-900/40">
                      <td className="px-3 py-2 text-zinc-400">
                        {new Date(r.correctedAt).toLocaleString('ko-KR', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <code className="text-amber-300">
                          {(r.beforeCode || '(없음)').slice(0, 20)}
                        </code>
                        <ArrowRight className="mx-1 inline h-3 w-3 text-zinc-600" />
                        <code className="text-cyan-300">{r.afterCode}</code>
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        <span className="line-clamp-1">{r.afterTypeName || '-'}</span>
                      </td>
                      <td className="px-3 py-2 text-zinc-400">{r.examSubject || '-'}</td>
                      <td className="px-3 py-2 text-zinc-500">
                        <span className="line-clamp-1">{r.reason || '-'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  icon,
  accent,
}: {
  label: string;
  value: number;
  unit: string;
  icon: React.ReactNode;
  accent?: 'cyan' | 'amber';
}) {
  const valueColor = accent === 'cyan' ? 'text-cyan-400' : accent === 'amber' ? 'text-amber-400' : 'text-white';
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
        {icon}
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${valueColor}`}>
        {value}
        <span className="ml-1 text-xs font-medium text-zinc-500">{unit}</span>
      </div>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-xs text-zinc-500">{children}</div>;
}
