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
  FileText,
  Database,
  Zap,
  ChevronLeft,
  ChevronRight,
  Bell,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { heatmapData, classStatus, heatmapConfig } from '@/lib/mock-data';
import { useDashboardStats, useActivityLogs } from '@/hooks';
import { motion } from 'framer-motion';
import { useState, useMemo } from 'react';
import { StudentAnalysisModal } from '@/components/dashboard/StudentAnalysisModal';

// ============================================================================
// 현황판 카드 컴포넌트
// ============================================================================

function StatusCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
    rose: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  };
  const c = colorMap[color] || colorMap.indigo;

  return (
    <div className="flex flex-col items-center justify-center p-5 rounded-xl bg-zinc-900/50 border border-white/5 hover:border-white/10 transition-all">
      <div className={`p-2 ${c.bg} rounded-lg mb-3`}>
        <Icon className={`w-5 h-5 ${c.text}`} />
      </div>
      <span className="text-[11px] text-zinc-500 font-medium mb-1">{label}</span>
      <span className="text-3xl font-bold text-white">{value}</span>
    </div>
  );
}

// ============================================================================
// 월 선택 버튼
// ============================================================================

function MonthSelector({
  selectedMonth,
  selectedYear,
  onMonthChange,
  onYearChange,
}: {
  selectedMonth: number;
  selectedYear: number;
  onMonthChange: (m: number) => void;
  onYearChange: (y: number) => void;
}) {
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onYearChange(selectedYear - 1)}
          className="p-1 text-zinc-500 hover:text-white transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-bold text-white min-w-[48px] text-center">{selectedYear}</span>
        <button
          onClick={() => onYearChange(selectedYear + 1)}
          className="p-1 text-zinc-500 hover:text-white transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="flex gap-1 overflow-x-auto scrollbar-hide">
        {months.map((m) => (
          <button
            key={m}
            onClick={() => onMonthChange(m)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
              selectedMonth === m
                ? 'bg-white text-black'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {m}월
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 공지사항 컴포넌트
// ============================================================================

const mockNotices = [
  { id: '1', title: '시스템 업데이트 안내 (v1.2.0)', date: '2026.02.10', urgent: false },
  { id: '2', title: 'AI 분석 기능 강화 안내', date: '2026.02.08', urgent: true },
  { id: '3', title: 'pdf(이미지) 파일 업로드 주의사항', date: '2026.02.05', urgent: false },
  { id: '4', title: '과사람 프로그램 베타 버전 출시', date: '2026.02.01', urgent: false },
];

// ============================================================================
// Main Dashboard
// ============================================================================

export default function DashboardPage() {
  const router = useRouter();
  const [selectedCell, setSelectedCell] = useState<{ student: string; unit: string; score: number } | null>(null);

  // 실데이터 훅 사용
  const { stats, monthlyExams, isLoading: statsLoading } = useDashboardStats();
  const { logs: activityLogs } = useActivityLogs(5);

  // 월별 결산 상태
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  // 차트 데이터 생성 (선택한 월의 일별 데이터)
  const chartData = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const data = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const found = monthlyExams.find((e) => e.date === dateStr);
      data.push({
        date: `${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        count: found?.count || 0,
      });
    }
    return data;
  }, [selectedYear, selectedMonth, monthlyExams]);

  const currentDate = new Date().toLocaleDateString('ko-KR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // AI 포인트 (mock - 추후 실데이터 연동)
  const aiPoints = {
    monthUsage: 83,
    balance: 899,
    warningThreshold: 5,
    status: 'normal' as const, // 'normal' | 'warning' | 'critical'
  };

  return (
    <div className="space-y-8 p-2">
      {/* Header Section */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-zinc-400 font-medium mb-1">{currentDate}</h2>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
            대시보드
          </h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/dashboard/settings')}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-sm font-medium rounded-lg border border-white/10 transition-colors"
          >
            설정
          </button>
          <button
            onClick={() => router.push('/dashboard/create')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg shadow-lg shadow-indigo-500/20 transition-all"
          >
            + 시험지 제작
          </button>
        </div>
      </div>

      {/* 1. 현재 등록 현황판 + 공지사항 (참조사이트 레이아웃) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 현재 등록 현황판 */}
        <GlowCard className="lg:col-span-3">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-400" />
            현재 등록 현황판
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatusCard
              label="등록 강사 수"
              value={stats.totalTeachers}
              icon={Users}
              color="indigo"
            />
            <StatusCard
              label="발행한 시험지 수"
              value={stats.totalExams}
              icon={FileText}
              color="rose"
            />
            <StatusCard
              label="등록 학생 수"
              value={stats.totalStudents}
              icon={Users}
              color="amber"
            />
            <StatusCard
              label="TOTAL DB 문제 수"
              value={stats.totalProblems}
              icon={Database}
              color="emerald"
            />
          </div>
        </GlowCard>

        {/* 공지사항 */}
        <GlowCard className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              공지사항
            </h3>
            <span className="text-[10px] text-zinc-500">최근 {mockNotices.length}건</span>
          </div>
          <div className="space-y-0 divide-y divide-white/5">
            {mockNotices.map((notice) => (
              <div
                key={notice.id}
                className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 hover:bg-white/[0.02] -mx-2 px-2 rounded cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {notice.urgent && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      긴급
                    </span>
                  )}
                  <span className="text-sm text-zinc-300 truncate">{notice.title}</span>
                </div>
                <span className="text-[10px] text-zinc-600 shrink-0">{notice.date}</span>
              </div>
            ))}
          </div>
        </GlowCard>
      </div>

      {/* 2. 월별 결산 + AI 포인트 + DB 문제 현황 */}
      <GlowCard>
        <div className="flex flex-col lg:flex-row gap-6">
          {/* 월별 결산 차트 (좌측 큰 영역) */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white mb-0.5">월별 결산</h3>
                <p className="text-[11px] text-zinc-500">선택한 연·월 기준으로 지표가 반영됩니다.</p>
              </div>
              <MonthSelector
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                onMonthChange={setSelectedMonth}
                onYearChange={setSelectedYear}
              />
            </div>

            {/* 시험지 출제 수 차트 */}
            <div>
              <div className="mb-3">
                <h4 className="text-xs font-semibold text-zinc-300">시험지 출제 수</h4>
                <p className="text-[10px] text-zinc-600">이번 달 제작 추이를 확인하세요.</p>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barSize={16}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.03)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: '#52525b' }}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
                      interval={4}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: '#52525b' }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        fontSize: '11px',
                        color: '#fff',
                      }}
                      formatter={(value: any) => [`${value}개`, '출제 수']}
                      labelFormatter={(label: any) => `${selectedYear}.${label}`}
                    />
                    <Bar
                      dataKey="count"
                      fill="#818cf8"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* 우측 사이드 섹션 */}
          <div className="w-full lg:w-64 shrink-0 space-y-5 lg:border-l lg:border-white/5 lg:pl-6">
            {/* AI 포인트 */}
            <div>
              <h4 className="text-xs font-semibold text-zinc-300 mb-3 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                AI 포인트
              </h4>
              <div className="text-center mb-3">
                <p className="text-[10px] text-zinc-500 mb-1">{selectedMonth}월 사용량</p>
                <p className="text-3xl font-bold text-rose-400">{aiPoints.monthUsage} P</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/80 border border-white/5">
                  <span className="text-xs text-zinc-400">현재 잔액</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{aiPoints.balance} P</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                      정상
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/80 border border-white/5">
                  <span className="text-xs text-zinc-400">경고 임계치</span>
                  <span className="text-sm font-bold text-zinc-500">{aiPoints.warningThreshold} P</span>
                </div>
              </div>
            </div>

            {/* DB 문제 현황 */}
            <div>
              <h4 className="text-xs font-semibold text-zinc-300 mb-3 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-indigo-400" />
                DB 문제 현황
              </h4>
              <div className="text-center mb-3">
                <p className="text-[10px] text-zinc-500 mb-1">총 등록 문제</p>
                <p className="text-2xl font-bold text-white">{stats.totalProblems}</p>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/80 border border-white/5">
                <span className="text-xs text-zinc-400">이번 주 추가</span>
                <span className="text-sm font-bold text-indigo-400">+{stats.problemsThisWeek}</span>
              </div>
            </div>
          </div>
        </div>
      </GlowCard>

      {/* 3. AI 취약 단원 히트맵 + 빠른 작업 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Heatmap (2 cols) */}
        <GlowCard className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-indigo-400" />
              <h3 className="text-sm font-semibold text-white">AI 취약 단원 분석</h3>
            </div>
          </div>

          <div className="overflow-x-auto pb-4">
            <div className="min-w-[550px]">
              <div className="relative">
                <div
                  className="absolute -left-6 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] text-zinc-500 font-medium whitespace-nowrap"
                  style={{ transformOrigin: 'center center' }}
                >
                  학생
                </div>

                <div className="ml-4">
                  {/* Unit Headers */}
                  <div className="grid grid-cols-[100px_repeat(10,1fr)] gap-[1.5px] mb-2">
                    <div />
                    {heatmapConfig.units.map((unit, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 + i * 0.03 }}
                        className="text-[10px] text-zinc-500 text-center flex items-end justify-center break-keep leading-tight pb-1"
                      >
                        {unit}
                      </motion.div>
                    ))}
                  </div>

                  {/* Data Grid */}
                  <motion.div
                    variants={{
                      hidden: { opacity: 0 },
                      show: { opacity: 1, transition: { staggerChildren: 0.05 } },
                    }}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-[100px_repeat(10,1fr)] gap-[1.5px]"
                  >
                    {heatmapConfig.students.map((student) => (
                      <div key={student} className="contents">
                        <div className="text-[10px] font-medium text-zinc-500 text-right pr-3 py-1 whitespace-nowrap flex items-center justify-end">
                          {student}
                        </div>
                        {heatmapConfig.units.map((unit) => {
                          const cell = heatmapData.find((d) => d.student === student && d.unit === unit);
                          const score = cell?.score || 0;
                          const getColor = (s: number) => {
                            if (s === 0) return '#18181b';
                            const t = s / 100;
                            const l = 20 + t * 45;
                            const sat = 45 + t * 40;
                            return `hsl(232, ${sat}%, ${l}%)`;
                          };
                          return (
                            <motion.div
                              key={`${student}-${unit}`}
                              variants={{
                                hidden: { opacity: 0, scale: 0.9 },
                                show: { opacity: 1, scale: 1 },
                              }}
                              onClick={() => setSelectedCell({ student, unit, score })}
                              className="relative group h-7 rounded-[2px] transition-all duration-200 cursor-pointer border border-transparent hover:border-white/20 hover:brightness-110 hover:z-10"
                              style={{ backgroundColor: getColor(score) }}
                            >
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-black/80 backdrop-blur-md border border-white/10 shadow-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 min-w-[120px]">
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

                  <div className="text-[10px] text-zinc-500 text-center mt-3 font-medium">단원</div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center justify-end gap-3 mt-5 pt-3 border-t border-white/5">
                <span className="text-[9px] uppercase tracking-wider text-zinc-600 font-medium">Proficiency Index</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 font-medium">Low</span>
                  <div className="flex gap-[1px] h-2">
                    {[0, 20, 40, 60, 80, 100].map((s) => {
                      const t = s / 100;
                      const l = 20 + t * 45;
                      const sat = 45 + t * 40;
                      return (
                        <div
                          key={s}
                          className="w-3 first:rounded-l-sm last:rounded-r-sm"
                          style={{ backgroundColor: `hsl(232, ${sat}%, ${l}%)` }}
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

        {/* 빠른 작업 + 수식 미리보기 */}
        <div className="space-y-6">
          <GlowCard>
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
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

          <div className="p-4 rounded-xl bg-zinc-900/30 border border-white/5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-zinc-500">수식 렌더링 미리보기</span>
            </div>
            <MathRenderer content="\int_{a}^{b} x^2 dx = [\frac{1}{3}x^3]_a^b" className="text-zinc-300 text-sm" />
          </div>
        </div>
      </div>

      {/* 4. 활동 로그 + 수업 현황 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 최근 활동 로그 */}
        <GlowCard>
          <h3 className="text-sm font-semibold text-white mb-4">최근 활동 로그</h3>
          <div className="space-y-0 divide-y divide-white/5">
            {activityLogs.map((log) => (
              <div key={log.id} className="py-4 first:pt-0 last:pb-0 flex items-start gap-3">
                <div
                  className={`mt-1 w-2 h-2 rounded-full ${
                    log.type === 'grading'
                      ? 'bg-indigo-500'
                      : log.type === 'clinic'
                      ? 'bg-rose-500'
                      : 'bg-emerald-500'
                  }`}
                />
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

        {/* 오늘의 수업 현황 */}
        <GlowCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              오늘의 수업 현황
            </h3>
            <Link
              href="/dashboard/classes"
              className="text-xs text-zinc-500 hover:text-white flex items-center gap-1 transition-colors"
            >
              전체 일정 <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {classStatus.map((cls) => (
              <div
                key={cls.id}
                className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50 border border-white/5 hover:border-white/10 transition-colors"
              >
                <div>
                  <h4 className="text-sm font-medium text-white mb-0.5">{cls.name}</h4>
                  <p className="text-xs text-zinc-500 flex items-center gap-2">
                    <span>{cls.time}</span>
                    <span className="w-1 h-1 bg-zinc-700 rounded-full" />
                    <span>{cls.students}명</span>
                  </p>
                </div>
                <span
                  className={`px-2 py-1 rounded-md text-xs font-medium ${
                    cls.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : cls.status === 'scheduled'
                      ? 'bg-zinc-800 text-zinc-400 border border-white/5'
                      : 'bg-zinc-900 text-zinc-600 border border-white/5'
                  }`}
                >
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
