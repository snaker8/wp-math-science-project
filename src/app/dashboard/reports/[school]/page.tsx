'use client';

// ============================================================================
// 학교 상세 — 시험지 리스트 + 누적 통계
// /dashboard/reports/[school]
// ============================================================================

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  School,
  FileText,
  Sparkles,
  Share2,
  ChevronRight,
  Loader2,
  BarChart3,
  Layers,
  TrendingUp,
  ExternalLink,
} from 'lucide-react';

interface ExamRow {
  id: string;
  title: string;
  grade: string | null;
  subject: string | null;
  problemCount: number;
  totalPoints: number;
  createdAt: string;
  hasAnalysis: boolean;
  hasShare: boolean;
  shareToken: string | null;
  overallDifficulty: string | null;
  unitCount: number;
}

interface SchoolDetail {
  school: string;
  summary: {
    totalExams: number;
    analyzedExams: number;
    sharedExams: number;
    totalProblems: number;
    totalPoints: number;
  };
  gradeDistribution: Array<{ grade: string; count: number }>;
  topUnits: Array<{ unit: string; problemCount: number }>;
  overallDifficultyDist: Record<string, number>;
  exams: ExamRow[];
}

const DIFF_COLOR: Record<string, string> = {
  평이: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  보통: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  '난이도 있음': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  '매우 난이도 있음': 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

export default function SchoolReportPage() {
  const params = useParams();
  const router = useRouter();
  const schoolParam = decodeURIComponent((params?.school as string) || '');

  const [data, setData] = useState<SchoolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!schoolParam) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/reports/${encodeURIComponent(schoolParam)}`, {
          cache: 'no-store',
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          if (!cancelled) setErr(d.error || `HTTP ${r.status}`);
          return;
        }
        const d = (await r.json()) as SchoolDetail;
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '로드 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolParam]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-black text-white">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        <span className="text-sm text-zinc-400">로딩 중...</span>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-black text-white">
        <School className="h-10 w-10 text-zinc-700" />
        <div className="text-sm text-zinc-400">{err || '학교를 찾을 수 없습니다'}</div>
        <button
          type="button"
          onClick={() => router.push('/dashboard/reports')}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800"
        >
          학교 목록으로
        </button>
      </div>
    );
  }

  const maxUnitCount = Math.max(1, ...data.topUnits.map((u) => u.problemCount));
  const maxGradeCount = Math.max(1, ...data.gradeDistribution.map((g) => g.count));

  // 시험지 학년·생성일 순 정렬
  const sortedExams = [...data.exams].sort((a, b) => {
    if (a.grade && b.grade && a.grade !== b.grade) return a.grade.localeCompare(b.grade);
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black text-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-800/50 px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard/reports')}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10">
              <School className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{data.school}</h1>
              <p className="mt-0.5 text-xs text-zinc-400">
                시험지 {data.summary.totalExams}건 · 총 {data.summary.totalProblems}문항
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* 통계 4 카드 */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="시험지"
            value={data.summary.totalExams}
            unit="건"
            icon={<FileText className="h-4 w-4" />}
          />
          <StatCard
            label="AI 분석 완료"
            value={data.summary.analyzedExams}
            unit={`/ ${data.summary.totalExams}`}
            icon={<Sparkles className="h-4 w-4" />}
            accent="cyan"
          />
          <StatCard
            label="학부모 공유"
            value={data.summary.sharedExams}
            unit={`/ ${data.summary.totalExams}`}
            icon={<Share2 className="h-4 w-4" />}
            accent="emerald"
          />
          <StatCard
            label="총 문항"
            value={data.summary.totalProblems}
            unit="문항"
            icon={<Layers className="h-4 w-4" />}
          />
        </div>

        {/* Row: 학년 분포 + 자주 출제 단원 */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 학년 분포 */}
          <Panel title="학년별 시험지" icon={<BarChart3 className="h-4 w-4" />}>
            {data.gradeDistribution.length === 0 ? (
              <Empty>학년 정보 없음</Empty>
            ) : (
              <div className="space-y-2">
                {data.gradeDistribution.map((g) => {
                  const pct = (g.count / maxGradeCount) * 100;
                  return (
                    <div key={g.grade} className="grid grid-cols-[80px_1fr_60px] items-center gap-3">
                      <div className="text-xs text-zinc-300">{g.grade}</div>
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-right text-xs text-zinc-400">{g.count}건</div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* 자주 출제 단원 TOP10 */}
          <Panel title="자주 출제되는 단원" icon={<TrendingUp className="h-4 w-4" />}>
            {data.topUnits.length === 0 ? (
              <Empty>분석 완료된 시험지가 없습니다</Empty>
            ) : (
              <div className="space-y-2">
                {data.topUnits.map((u, i) => {
                  const pct = (u.problemCount / maxUnitCount) * 100;
                  return (
                    <div key={i} className="grid grid-cols-[1fr_60px] items-center gap-3">
                      <div>
                        <div className="text-xs text-zinc-300">{u.unit}</div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right text-xs text-zinc-400">
                        {u.problemCount}문항
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* 난이도 분포 */}
        {Object.values(data.overallDifficultyDist).some((v) => v > 0) && (
          <Panel title="시험지 난이도 분포" icon={<Sparkles className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['평이', '보통', '난이도 있음', '매우 난이도 있음'] as const).map((d) => (
                <div
                  key={d}
                  className={`rounded-lg border px-3 py-3 ${DIFF_COLOR[d]}`}
                >
                  <div className="text-[10px] font-semibold opacity-80">{d}</div>
                  <div className="mt-1 text-2xl font-bold">
                    {data.overallDifficultyDist[d] || 0}
                    <span className="ml-1 text-[10px] font-medium opacity-70">건</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* 시험지 리스트 */}
        <Panel title={`시험지 목록 (${sortedExams.length}건)`} icon={<FileText className="h-4 w-4" />}>
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900/60 text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">제목</th>
                  <th className="px-3 py-2 text-left">학년</th>
                  <th className="px-3 py-2 text-center">문항</th>
                  <th className="px-3 py-2 text-center">분석</th>
                  <th className="px-3 py-2 text-center">난이도</th>
                  <th className="px-3 py-2 text-center">공유</th>
                  <th className="px-3 py-2 text-right">발행</th>
                  <th className="px-3 py-2 text-center w-32">액션</th>
                </tr>
              </thead>
              <tbody>
                {sortedExams.map((e) => (
                  <tr key={e.id} className="border-t border-zinc-800/60 hover:bg-zinc-900/40">
                    <td className="px-3 py-2 text-white">{e.title}</td>
                    <td className="px-3 py-2 text-zinc-400">{e.grade || '-'}</td>
                    <td className="px-3 py-2 text-center text-zinc-300">{e.problemCount}</td>
                    <td className="px-3 py-2 text-center">
                      {e.hasAnalysis ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-cyan-300">
                          <Sparkles className="h-3 w-3" />
                          완료
                        </span>
                      ) : (
                        <span className="text-zinc-600">미생성</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {e.overallDifficulty ? (
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${DIFF_COLOR[e.overallDifficulty] || ''}`}
                        >
                          {e.overallDifficulty}
                        </span>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {e.hasShare ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
                          <Share2 className="h-3 w-3" />
                          활성
                        </span>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-400">
                      {new Date(e.createdAt).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/dashboard/exam-analysis/${e.id}`}
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-cyan-400"
                          title="분석 페이지"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                        {e.shareToken && (
                          <a
                            href={`/share/exam/${e.shareToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-400"
                            title="학부모 페이지"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ============================================================================
// 작은 헬퍼 컴포넌트들
// ============================================================================

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
  accent?: 'cyan' | 'emerald';
}) {
  const accentColor =
    accent === 'cyan' ? 'text-cyan-400' : accent === 'emerald' ? 'text-emerald-400' : 'text-white';
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
        {icon}
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${accentColor}`}>
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
  return (
    <div className="py-8 text-center text-xs text-zinc-500">{children}</div>
  );
}
