'use client';

// ============================================================================
// /dashboard/prescription/analytics
//   진단평가 실데이터 기반 분석 — GET /api/diagnostics/analytics 호출.
//   4개 집계: 정답률 추이 · 오답 원인 · 수학비서 히트맵 · 함정 누적.
//
// 이전 버전 (mock) 대체: performanceData·skillData 하드코딩 → 실데이터.
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';
import {
  Brain, TrendingUp, AlertTriangle, ArrowLeft, Loader2, Users, Activity, Target,
  type LucideIcon,
} from 'lucide-react';
import { useSmartBack } from '@/lib/navigation/useSmartBack';

interface AnalyticsData {
  summary: {
    totalStudents: number;
    totalSessions: number;
    totalGraded: number;
    avgScorePct: number | null;
    recentlyActive: number;
  };
  performanceTrend: Array<{ date: string; total: number; correct: number; pct: number }>;
  errorCauses: Record<string, number>;
  mathsecrHeatmap: Array<Record<string, unknown>>;
  pitfalls: Array<{ pitfall_code: string; hitCount: number; affectedStudents: number; recent: string }>;
}

function Card({ children, title, icon: Icon, className = '' }: {
  children: React.ReactNode; title: string; icon?: LucideIcon; className?: string;
}) {
  return (
    <div className={`bg-black border border-white/10 rounded-2xl p-6 ${className}`}>
      <div className="flex items-center gap-2 mb-6 text-gray-400">
        {Icon && <Icon size={18} />}
        <h3 className="font-bold text-sm uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function StatCell({ label, value, sub, icon: Icon }: {
  label: string; value: string | number; sub?: string; icon: LucideIcon;
}) {
  return (
    <div className="bg-black border border-white/10 rounded-2xl p-4">
      <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
        <Icon size={14} />
        {label}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

const ERROR_CAUSE_COLORS: Record<string, string> = {
  개념: '#6366f1',
  유형: '#8b5cf6',
  계산: '#ec4899',
  문장제: '#f59e0b',
  시간: '#10b981',
};

export default function AnalyticsPage() {
  const goBack = useSmartBack('/dashboard/prescription');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/diagnostics/analytics');
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        if (!cancelled) setData(json as AnalyticsData);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 오답 원인 차트 데이터
  const errorCauseChart = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.errorCauses)
      .filter(([, v]) => v > 0)
      .map(([cause, value]) => ({ cause, value }));
  }, [data]);

  // 인사이트 자동 생성 (룰 기반 — GPT 호출 없이 즉시)
  const insights = useMemo(() => {
    if (!data) return [];
    const out: Array<{ kind: 'good' | 'warn'; title: string; body: string }> = [];

    if (data.summary.avgScorePct != null) {
      if (data.summary.avgScorePct >= 80) {
        out.push({
          kind: 'good',
          title: `학원 평균 정답률 ${data.summary.avgScorePct}% — 상위 권`,
          body: `채점 ${data.summary.totalGraded}건 기준. 최근 7일 활동 학생 ${data.summary.recentlyActive}명.`,
        });
      } else if (data.summary.avgScorePct < 60) {
        out.push({
          kind: 'warn',
          title: `학원 평균 정답률 ${data.summary.avgScorePct}% — 개선 여지`,
          body: '난이도 재조정 또는 약점 단원 집중 보강 권장.',
        });
      }
    }

    // 최다 오답 원인
    const topCause = errorCauseChart.sort((a, b) => b.value - a.value)[0];
    if (topCause && topCause.value > 0) {
      out.push({
        kind: 'warn',
        title: `최다 오답 원인: ${topCause.cause}`,
        body: `${topCause.value}건 누적. 해당 원인 유형 보강 학습지 권장.`,
      });
    }

    // 함정 top
    const topPitfall = data.pitfalls[0];
    if (topPitfall) {
      out.push({
        kind: 'warn',
        title: `반복되는 함정: ${topPitfall.pitfall_code}`,
        body: `${topPitfall.affectedStudents}명에게 총 ${topPitfall.hitCount}회 적중. 해당 함정 집중 분석 필요.`,
      });
    }

    if (out.length === 0) {
      out.push({
        kind: 'good',
        title: '아직 분석할 데이터가 충분치 않습니다',
        body: '진단평가 채점이 누적되면 자동으로 인사이트가 생성됩니다.',
      });
    }
    return out;
  }, [data, errorCauseChart]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 space-y-6 font-sans">
      {/* Header */}
      <div className="flex items-center gap-4 mb-2">
        <button type="button" onClick={goBack} className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Deep-Dive Analytics</h1>
          <p className="text-gray-500 text-sm">AI 기반 심층 학습 분석 리포트</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-500 gap-2">
          <Loader2 size={18} className="animate-spin" /> 데이터 로딩 중…
        </div>
      )}

      {error && !loading && (
        <div className="flex items-start gap-2 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm">
          <AlertTriangle size={16} className="mt-0.5" /> {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCell label="학생 수" value={data.summary.totalStudents} icon={Users} />
            <StatCell label="세션 수" value={data.summary.totalSessions} sub={`채점 ${data.summary.totalGraded}건`} icon={Activity} />
            <StatCell
              label="평균 정답률"
              value={data.summary.avgScorePct != null ? `${data.summary.avgScorePct}%` : '-'}
              icon={Target}
            />
            <StatCell label="최근 7일 활동" value={`${data.summary.recentlyActive}명`} icon={TrendingUp} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Performance Trend */}
            <Card title="정답률 추이 (일자별)" icon={TrendingUp} className="lg:col-span-2">
              <div className="h-[300px]">
                {data.performanceTrend.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                    채점 결과가 누적되면 차트가 표시됩니다.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.performanceTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="date" stroke="#6b7280" tickFormatter={(d) => d.slice(5)} />
                      <YAxis stroke="#6b7280" domain={[0, 100]} unit="%" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#000', borderColor: '#333' }}
                        itemStyle={{ color: '#fff' }}
                        formatter={(value) => `${value}%`}
                      />
                      <Line
                        type="monotone"
                        dataKey="pct"
                        name="정답률"
                        stroke="#6366f1"
                        strokeWidth={3}
                        dot={{ r: 3, fill: '#6366f1' }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Error Cause Distribution */}
            <Card title="오답 원인 분포" icon={Brain}>
              <div className="h-[300px]">
                {errorCauseChart.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                    오답 원인이 태깅된 채점이 없습니다.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={errorCauseChart} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                      <XAxis type="number" stroke="#6b7280" />
                      <YAxis dataKey="cause" type="category" stroke="#9ca3af" width={60} />
                      <Tooltip cursor={{ fill: '#ffffff10' }} contentStyle={{ backgroundColor: '#000', borderColor: '#333' }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={32}>
                        {errorCauseChart.map((d) => (
                          <Cell key={d.cause} fill={ERROR_CAUSE_COLORS[d.cause] || '#8b5cf6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          {/* 수학비서 히트맵 + 함정 누적 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="매쓰싸이 뱅크 대단원 히트맵" icon={Brain}>
              {data.mathsecrHeatmap.length === 0 ? (
                <div className="py-8 text-center text-gray-500 text-sm">
                  diagnostics.items 가 누적되면 대단원별 정답률(α·β·γ) 이 표시됩니다.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 uppercase tracking-wider">
                        <th className="text-left py-2 pr-3">학생</th>
                        <th className="text-left py-2 pr-3">대단원</th>
                        <th className="text-right py-2 pr-3">정답률</th>
                        <th className="text-center py-2">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.mathsecrHeatmap.slice(0, 20).map((row, i) => {
                        const r = row as Record<string, any>;
                        const rate = Number(r.correct_rate ?? r.correctRate ?? r.pct ?? 0);
                        const state = rate >= 80 ? 'α' : rate >= 60 ? 'β' : 'γ';
                        const stateColor = rate >= 80 ? 'text-emerald-400' : rate >= 60 ? 'text-amber-400' : 'text-rose-400';
                        return (
                          <tr key={i} className="border-t border-white/5">
                            <td className="py-2 pr-3 text-zinc-300">{String(r.student_name ?? r.full_name ?? '')}</td>
                            <td className="py-2 pr-3 text-zinc-400">{String(r.level1 ?? r.major_unit ?? '')}</td>
                            <td className="py-2 pr-3 text-right text-zinc-300">{rate ? `${rate}%` : '-'}</td>
                            <td className={`py-2 text-center font-bold ${stateColor}`}>{state}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="반복 함정 Top 10" icon={AlertTriangle}>
              {data.pitfalls.length === 0 ? (
                <div className="py-8 text-center text-gray-500 text-sm">
                  오답 시 student_pitfall_history 가 자동 누적되면 표시됩니다.
                </div>
              ) : (
                <ul className="space-y-2">
                  {data.pitfalls.map((p) => (
                    <li
                      key={p.pitfall_code}
                      className="flex items-center justify-between text-sm py-2 px-3 rounded-lg bg-white/[0.02] border border-white/5"
                    >
                      <div className="font-mono text-xs text-zinc-300">{p.pitfall_code}</div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-zinc-400">{p.affectedStudents}명</span>
                        <span className="text-rose-400 font-bold">{p.hitCount}회</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* AI Insights */}
          <Card title="AI 진단 인사이트" icon={Brain} className="bg-white/[.03] border-white/[.08]">
            <div className="space-y-4">
              {insights.map((it, i) => (
                <div key={i} className="flex gap-4">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                      it.kind === 'good' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
                    }`}
                  >
                    {it.kind === 'good' ? <TrendingUp size={24} /> : <AlertTriangle size={24} />}
                  </div>
                  <div>
                    <h4 className={`font-bold text-lg ${it.kind === 'good' ? 'text-emerald-200' : 'text-rose-200'}`}>
                      {it.title}
                    </h4>
                    <p className="text-gray-400 text-sm leading-relaxed mt-1">{it.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
