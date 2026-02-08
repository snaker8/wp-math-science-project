'use client';

import { GlowCard } from '@/components/shared/GlowCard';
import { MathRenderer } from '@/components/shared/MathRenderer';
import {
  Users,
  BrainCircuit,
  TrendingUp,
  Activity,
  Calendar,
  ArrowRight,
  Upload,
  Wand2,
  MessageCircle,
  BookX,
  Loader2
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { heatmapData, classStatus, heatmapConfig, SparklineData } from '@/lib/mock-data';
import { useDashboardStats, useActivityLogs } from '@/hooks';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { StudentAnalysisModal } from '@/components/dashboard/StudentAnalysisModal';


// Sparkline Component
function Sparkline({ data, color }: { data: SparklineData[]; color: string }) {
  return (
    <div className="h-10 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#gradient-${color})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [selectedCell, setSelectedCell] = useState<{ student: string, unit: string, score: number } | null>(null);

  // 실데이터 훅 사용
  const { stats, isLoading: statsLoading } = useDashboardStats();
  const { logs: activityLogs, isLoading: logsLoading } = useActivityLogs(5);

  // statsData 생성 (훅 결과 기반)
  const statsData = [
    {
      title: '총 수강생',
      value: stats.totalStudents.toLocaleString(),
      trend: stats.studentsThisWeek > 0 ? `+${stats.studentsThisWeek}` : '0',
      trendUp: stats.studentsThisWeek > 0,
      data: Array.from({ length: 20 }, () => ({ value: 40 + Math.random() * 60 })),
    },
    {
      title: '활성 학습지',
      value: stats.totalProblems.toLocaleString(),
      trend: stats.problemsThisWeek > 0 ? `+${stats.problemsThisWeek}` : '0',
      trendUp: stats.problemsThisWeek > 0,
      data: Array.from({ length: 20 }, () => ({ value: 30 + Math.random() * 70 })),
    },
    {
      title: '평균 성취도',
      value: `${stats.averageAccuracy.toFixed(1)}점`,
      trend: stats.averageAccuracy >= 75 ? '+' : '-',
      trendUp: stats.averageAccuracy >= 75,
      data: Array.from({ length: 20 }, () => ({ value: 60 + Math.random() * 40 })),
    },
  ];

  const currentDate = new Date().toLocaleDateString('ko-KR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });


  return (
    <div className="space-y-8 p-2">
      {/* Header Section */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-zinc-400 font-medium mb-1">{currentDate}</h2>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
            반갑습니다, 선생님 👋
          </h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/dashboard/prescription/analytics')}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-sm font-medium rounded-lg border border-white/10 transition-colors"
          >
            기간 설정
          </button>
          <button
            onClick={() => router.push('/tutor/classes/new')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg shadow-lg shadow-indigo-500/20 transition-all"
          >
            + 수업 개설
          </button>
        </div>
      </div>

      {/* Top Section: Metrics with Sparklines */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statsData.map((stat, i) => {
          const color = i === 0 ? '#818cf8' : i === 1 ? '#fb7185' : '#fbbf24'; // indigo-400, rose-400, amber-400
          const iconBg = i === 0 ? 'bg-indigo-500/10' : i === 1 ? 'bg-rose-500/10' : 'bg-amber-500/10';
          const iconColor = i === 0 ? 'text-indigo-400' : i === 1 ? 'text-rose-400' : 'text-amber-400';
          const Icon = i === 0 ? Users : i === 1 ? BrainCircuit : TrendingUp;

          return (
            <GlowCard key={i}>
              <div className="flex items-start justify-between mb-4">
                <div className={`p-2 ${iconBg} rounded-lg`}>
                  <Icon className={`w-6 h-6 ${iconColor}`} />
                </div>
                <div className="flex items-center gap-3">
                  <Sparkline data={stat.data} color={color} />
                  <span className={`flex items-center text-xs font-medium px-2 py-1 rounded-full ${stat.trendUp ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10'}`}>
                    {stat.trend}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-zinc-400 text-sm font-medium">{stat.title}</span>
                <h3 className="text-3xl font-bold text-white">{stat.value}</h3>
              </div>
            </GlowCard>
          );
        })}
      </div>

      {/* Middle Section: AI Weakness Heatmap & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Heatmap (2 cols) - Linear Style Precision UI */}
        <GlowCard className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-semibold text-white">AI 취약 단원 분석</h3>
            </div>
          </div>

          <div className="overflow-x-auto pb-4">
            <div className="min-w-[550px]">
              {/* Heatmap Grid with Axis Labels */}
              <div className="relative">
                {/* Y-Axis Label */}
                <div
                  className="absolute -left-6 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] text-zinc-500 font-medium whitespace-nowrap"
                  style={{ transformOrigin: 'center center' }}
                >
                  학생
                </div>

                <div className="ml-4">
                  {/* Unit Headers (X-Axis) */}
                  <div className="grid grid-cols-[100px_repeat(10,1fr)] gap-[1.5px] mb-2">
                    <div className="text-[10px] font-medium text-zinc-500 text-right pr-3"></div>
                    {heatmapConfig.units.map((unit, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 + (i * 0.03) }}
                        className="text-[10px] text-zinc-500 text-center flex items-end justify-center break-keep leading-tight pb-1"
                      >
                        {unit}
                      </motion.div>
                    ))}
                  </div>

                  {/* Data Grid with Student Labels (Y-Axis) */}
                  <motion.div
                    variants={{
                      hidden: { opacity: 0 },
                      show: {
                        opacity: 1,
                        transition: {
                          staggerChildren: 0.05
                        }
                      }
                    }}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-[100px_repeat(10,1fr)] gap-[1.5px]"
                  >
                    {heatmapConfig.students.map((student, rowIdx) => (
                      <div key={student} className="contents">
                        {/* Student Name (Y-Axis Label) */}
                        <div
                          className="text-[10px] font-medium text-zinc-500 text-right pr-3 py-1 whitespace-nowrap flex items-center justify-end"
                        >
                          {student}
                        </div>

                        {/* Heatmap Cells */}
                        {heatmapConfig.units.map((unit, colIdx) => {
                          const cell = heatmapData.find(d => d.student === student && d.unit === unit);
                          const score = cell?.score || 0;

                          // Linear-style precise gradient logic
                          const getColor = (s: number) => {
                            if (s === 0) return '#18181b'; // zinc-900
                            // Map score 1-100 to opacity of indigo-500/indigo-400 mix
                            // We want a solid-ish look. Let's use HSL or specific hexes if possible, 
                            // but rgba is easiest for opacity based usage.
                            // Actually user asked for indigo-900 to indigo-400.
                            // Low score -> Darker (Indigo 900)
                            // High score -> Lighter/Brighter (Indigo 400)

                            // Simple interpolation strategy:
                            // We'll use HSL for smoothness.
                            // Indigo-900: approx hsl(230, 45%, 20%)
                            // Indigo-400: approx hsl(230, 85%, 65%)

                            const t = s / 100; // 0 to 1
                            const l = 20 + (t * 45); // Lightness from 20% to 65%
                            const sat = 45 + (t * 40); // Saturation from 45% to 85%
                            return `hsl(232, ${sat}%, ${l}%)`;

                            // Fallback to rgba if HSL feels off, but HSL is best for gradients.
                          };

                          return (
                            <motion.div
                              key={`${student}-${unit}`}
                              variants={{
                                hidden: { opacity: 0, scale: 0.9 },
                                show: { opacity: 1, scale: 1 }
                              }}
                              onClick={() => setSelectedCell({ student, unit, score })}
                              className="relative group h-7 rounded-[2px] transition-all duration-200 cursor-pointer 
                                         border border-transparent hover:border-white/20 hover:brightness-110 hover:z-10"
                              style={{ backgroundColor: getColor(score) }}
                            >
                              {/* Glassmorphism Tooltip - Positioned better */}
                              <div
                                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg 
                                           bg-black/80 backdrop-blur-md border border-white/10 shadow-2xl
                                           pointer-events-none opacity-0 group-hover:opacity-100 
                                           transition-opacity duration-200 z-50 min-w-[120px]"
                              >
                                <div className="text-[10px] text-zinc-500 tracking-wide mb-1 font-medium">{student}</div>
                                <div className="text-white text-xs font-semibold mb-1.5">{unit}</div>
                                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/10">
                                  <span className="text-zinc-400">Proficiency</span>
                                  <span className="text-indigo-400 font-bold font-mono">{score}%</span>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    ))}
                  </motion.div>

                  {/* X-Axis Label */}
                  <div className="text-[10px] text-zinc-500 text-center mt-3 font-medium">
                    단원
                  </div>
                </div>
              </div>

              {/* Color Legend - Bottom Right */}
              <div className="flex items-center justify-end gap-3 mt-5 pt-3 border-t border-white/5">
                <span className="text-[9px] uppercase tracking-wider text-zinc-600 font-medium">Internal Proficiency Index</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 font-medium">Low</span>
                  <div className="flex gap-[1px] h-2">
                    {/* Linear gradient representation blocks */}
                    {[0, 20, 40, 60, 80, 100].map((s) => {
                      // Duplicate color logic for legend
                      const getColor = (score: number) => {
                        const t = score / 100;
                        const l = 20 + (t * 45);
                        const sat = 45 + (t * 40);
                        return `hsl(232, ${sat}%, ${l}%)`;
                      };
                      return (
                        <div
                          key={s}
                          className="w-3 first:rounded-l-sm last:rounded-r-sm"
                          style={{ backgroundColor: getColor(s) }}
                        />
                      );
                    })}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-medium">High</span>
                </div>
              </div>
            </div>
          </div>
        </GlowCard>

        {/* Quick Actions & Demo */}
        <div className="space-y-6">
          <GlowCard>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-400" />
              빠른 작업
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: '문제 업로드', color: 'hover:border-indigo-500/50', icon: Upload, href: '/tutor/workflow' },
                { label: '시험지 마법사', color: 'hover:border-rose-500/50', icon: Wand2, href: '/dashboard/create' },
                { label: '학생 상담', color: 'hover:border-amber-500/50', icon: MessageCircle, href: '/tutor/classes' },
                { label: '오답 노트', color: 'hover:border-emerald-500/50', icon: BookX, href: '/dashboard/prescription' },
              ].map((action, i) => {
                const Icon = action.icon;
                return (
                  <button
                    key={i}
                    onClick={() => router.push(action.href)}
                    className={`flex flex-col items-center justify-center gap-2 p-4 bg-zinc-900/50 border border-white/5 rounded-xl transition-all hover:bg-zinc-800 ${action.color} group`}
                  >
                    <Icon size={20} className="text-zinc-500 group-hover:text-white transition-colors" />
                    <span className="text-sm text-zinc-400 group-hover:text-white font-medium transition-colors">
                      {action.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </GlowCard>

          {/* Math Demo (Mini) */}
          <div className="p-4 rounded-xl bg-zinc-900/30 border border-white/5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-zinc-500">수식 렌더링 미리보기</span>
            </div>
            <MathRenderer content="\int_{a}^{b} x^2 dx = [\frac{1}{3}x^3]_a^b" className="text-zinc-300 text-sm" />
          </div>
        </div>
      </div>

      {/* Bottom Section: Activities & Class Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <GlowCard>
          <h3 className="text-lg font-semibold text-white mb-4">최근 활동 로그</h3>
          <div className="space-y-0 divide-y divide-white/5">
            {activityLogs.map((log) => (
              <div key={log.id} className="py-4 first:pt-0 last:pb-0 flex items-start gap-3">
                <div className={`mt-1 w-2 h-2 rounded-full ${log.type === 'grading' ? 'bg-indigo-500' :
                  log.type === 'clinic' ? 'bg-rose-500' : 'bg-emerald-500'
                  }`} />
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h4 className="text-sm font-medium text-white">{log.title}</h4>
                    <span className="text-xs text-zinc-500">{log.time}</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">{log.description}</p>
                </div>
              </div>
            ))}
          </div>
        </GlowCard>

        {/* Real-time Class Status */}
        <GlowCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" />
              오늘의 수업 현황
            </h3>
            <Link href="/dashboard/classes" className="text-xs text-zinc-500 hover:text-white flex items-center gap-1 transition-colors">
              전체 일정 <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {classStatus.map((cls) => (
              <div key={cls.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50 border border-white/5 hover:border-white/10 transition-colors">
                <div>
                  <h4 className="text-sm font-medium text-white mb-0.5">{cls.name}</h4>
                  <p className="text-xs text-zinc-500 flex items-center gap-2">
                    <span>{cls.time}</span>
                    <span className="w-1 h-1 bg-zinc-700 rounded-full"></span>
                    <span>{cls.students}명</span>
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-md text-xs font-medium ${cls.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                  cls.status === 'scheduled' ? 'bg-zinc-800 text-zinc-400 border border-white/5' :
                    'bg-zinc-900 text-zinc-600 border border-white/5'
                  }`}>
                  {cls.status === 'active' ? '수업 중' : cls.status === 'scheduled' ? '예정' : '종료'}
                </span>
              </div>
            ))}
          </div>
        </GlowCard>
      </div>

      <StudentAnalysisModal
        isOpen={!!selectedCell}
        onClose={() => setSelectedCell(null)}
        data={selectedCell}
      />
    </div>
  );
}
