'use client';

import { SurfacePanel, RADIUS, PANEL_SURFACE, PANEL_INSET, PANEL_LIFT } from '@/components/ui/surface';
import {
  ArrowRight,
  Upload,
  Wand2,
  MessageCircle,
  BookX,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { heatmapData, classStatus, heatmapConfig } from '@/lib/mock-data';
import { useDashboardStats, useActivityLogs } from '@/hooks';
import { motion } from 'framer-motion';
import { useState, useMemo, useEffect } from 'react';
import { StudentAnalysisModal } from '@/components/dashboard/StudentAnalysisModal';

// ============================================================================
// 현황판 카드 컴포넌트
// ============================================================================

function StatusCard({
  label,
  value,
  sub,
  href,
  loading,
}: {
  label: string;
  value: string | number;
  /** 보조 한 줄 — 값만으로 판단이 안 될 때 채운다 */
  sub?: string;
  href?: string;
  loading?: boolean;
}) {
  const content = (
    <>
      <div className="text-xs font-semibold text-content-tertiary truncate">{label}</div>
      {loading ? (
        <span className="mt-2 inline-block h-8 w-16 rounded-lg bg-white/10 animate-pulse" aria-label="불러오는 중" />
      ) : (
        <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-content-primary">
          {value}
        </div>
      )}
      {sub && <div className="mt-0.5 text-[11px] text-content-muted">{sub}</div>}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`block ${RADIUS.panel} ${PANEL_INSET} ${PANEL_LIFT} p-4`}
      >
        {content}
      </Link>
    );
  }

  return <div className={`${RADIUS.panel} ${PANEL_INSET} p-4`}>{content}</div>;
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
          className="p-1 text-content-tertiary hover:text-content-primary transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-bold text-content-primary min-w-[48px] text-center">{selectedYear}</span>
        <button
          onClick={() => onYearChange(selectedYear + 1)}
          className="p-1 text-content-tertiary hover:text-content-primary transition-colors"
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
                : 'text-content-tertiary hover:text-content-secondary hover:bg-surface-raised'
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
// 공지사항 — /api/notices 실데이터 (관리: /admin/notices, super_admin)
// ============================================================================

interface Notice {
  id: string;
  title: string;
  body: string | null;
  is_urgent: boolean;
  created_at: string;
}

function formatNoticeDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

// ============================================================================
// Main Dashboard
// ============================================================================

export default function DashboardPage() {
  const router = useRouter();
  const [selectedCell, setSelectedCell] = useState<{ student: string; unit: string; score: number } | null>(null);

  // 실데이터 훅 사용
  const { stats, monthlyExams, isLoading: statsLoading } = useDashboardStats();
  const { logs: activityLogs } = useActivityLogs(5);

  // 공지사항 (실데이터)
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(true);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/notices', { cache: 'no-store' });
        const data = await res.json();
        if (active && res.ok) setNotices(data.notices || []);
      } catch {
        /* 무시 — 빈 목록 */
      } finally {
        if (active) setNoticesLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

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
          <h2 className="mb-1 text-xs font-medium text-content-tertiary">{currentDate}</h2>
          <h1 className="text-2xl font-bold tracking-tight text-content-primary">대시보드</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/dashboard/settings')}
            className="px-4 py-2 bg-surface-card hover:bg-surface-raised text-sm font-medium rounded-lg border border-white/10 transition-colors"
          >
            설정
          </button>
          {/* ★ 주 CTA = 흰 필 — 페이지의 유일한 명도 반전 요소 (Linear white-cta-inversion) */}
          <button
            onClick={() => router.push('/dashboard/create')}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
          >
            + 시험지 제작
          </button>
        </div>
      </div>

      {/* 1. 현재 등록 현황판 + 공지사항 (참조사이트 레이아웃) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 현재 등록 현황판 */}
        <SurfacePanel title="등록 현황" className="lg:col-span-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatusCard
              label="등록 강사"
              value={stats.totalTeachers}
              sub="명"
              href="/dashboard/settings"
              loading={statsLoading}
            />
            <StatusCard
              label="발행 시험지"
              value={stats.totalExams}
              sub="장"
              href="/dashboard/exam-management"
              loading={statsLoading}
            />
            <StatusCard
              label="등록 학생"
              value={stats.totalStudents}
              sub="명"
              loading={statsLoading}
            />
            <StatusCard
              label="DB 문제"
              value={stats.totalProblems}
              sub={`이번 주 +${stats.problemsThisWeek}`}
              href="/dashboard/cloud"
              loading={statsLoading}
            />
          </div>
        </SurfacePanel>

        {/* 공지사항 — 실데이터(/api/notices) */}
        <SurfacePanel
          title="공지사항"
          right={
            !noticesLoading && notices.length > 0 ? (
              <span className="text-[10px] text-content-tertiary">최근 {notices.length}건</span>
            ) : undefined
          }
          className="lg:col-span-2"
        >
          {noticesLoading ? (
            <div className="space-y-3 animate-pulse">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="h-3.5 rounded bg-white/10" style={{ width: `${70 - i * 8}%` }} />
                  <div className="h-3 w-12 rounded bg-white/10" />
                </div>
              ))}
            </div>
          ) : notices.length === 0 ? (
            <div className="py-8 text-center text-xs text-content-tertiary">등록된 공지가 없습니다.</div>
          ) : (
            <div className="space-y-0 divide-y divide-white/5">
              {notices.map((notice) => {
                const clickable = !!notice.body;
                return (
                  <div
                    key={notice.id}
                    onClick={() => clickable && setSelectedNotice(notice)}
                    className={`py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 -mx-2 px-2 rounded transition-colors ${clickable ? 'hover:bg-white/[0.02] cursor-pointer' : ''}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {notice.is_urgent && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          긴급
                        </span>
                      )}
                      <span className="text-sm text-content-secondary truncate">{notice.title}</span>
                    </div>
                    <span className="text-[10px] text-content-muted shrink-0">{formatNoticeDate(notice.created_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </SurfacePanel>

        {/* 공지 상세 모달 (body 있는 공지 클릭 시) */}
        {selectedNotice && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setSelectedNotice(null)}
          >
            <div
              className="w-full max-w-lg rounded-2xl border border-subtle bg-surface-card shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-subtle px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {selectedNotice.is_urgent && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        긴급
                      </span>
                    )}
                    <h3 className="text-base font-bold text-content-primary">{selectedNotice.title}</h3>
                  </div>
                  <p className="text-xs text-content-tertiary mt-1">{formatNoticeDate(selectedNotice.created_at)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedNotice(null)}
                  className="text-content-tertiary hover:text-content-primary"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-5 py-4 text-sm text-content-secondary whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto">
                {selectedNotice.body}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. 월별 결산 + AI 포인트 + DB 문제 현황 */}
      <SurfacePanel>
        <div className="flex flex-col lg:flex-row gap-6">
          {/* 월별 결산 차트 (좌측 큰 영역) */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-content-primary mb-0.5">월별 결산</h3>
                <p className="text-xs text-content-tertiary">선택한 연·월 기준으로 지표가 반영됩니다.</p>
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
                <h4 className="text-xs font-semibold text-content-secondary">시험지 출제 수</h4>
                <p className="text-[10px] text-content-muted">이번 달 제작 추이를 확인하세요.</p>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
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
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid rgba(255,255,255,0.09)',
                        borderRadius: '8px',
                        fontSize: '11px',
                        color: 'var(--text-primary)',
                      }}
                      formatter={(value: any) => [`${value}개`, '출제 수']}
                      labelFormatter={(label: any) => `${selectedYear}.${label}`}
                    />
                    {/* 데이터 그래픽은 채도 허용 — Linear graphic accent (periwinkle) */}
                    <Bar
                      dataKey="count"
                      fill="#8FA4FF"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* 우측 사이드 섹션 */}
          <div className="w-full lg:w-64 shrink-0 space-y-5 lg:border-l lg:border-subtle lg:pl-6">
            {/* AI 포인트 */}
            <div>
              <h4 className="text-xs font-semibold text-content-tertiary mb-3">AI 포인트</h4>
              <div className="mb-3">
                <p className="text-[10px] text-content-muted mb-1">{selectedMonth}월 사용량</p>
                <p className="text-2xl font-bold tabular-nums tracking-tight text-content-primary">
                  {aiPoints.monthUsage} P
                </p>
              </div>
              <div className="space-y-2">
                <div className={`flex items-center justify-between p-2.5 ${RADIUS.control} ${PANEL_INSET}`}>
                  <span className="text-xs text-content-secondary">현재 잔액</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold tabular-nums text-content-primary">{aiPoints.balance} P</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
                      정상
                    </span>
                  </div>
                </div>
                <div className={`flex items-center justify-between p-2.5 ${RADIUS.control} ${PANEL_INSET}`}>
                  <span className="text-xs text-content-secondary">경고 임계치</span>
                  <span className="text-sm font-bold tabular-nums text-content-tertiary">{aiPoints.warningThreshold} P</span>
                </div>
              </div>
            </div>

            {/* DB 문제 현황 */}
            <div>
              <h4 className="text-xs font-semibold text-content-tertiary mb-3">DB 문제 현황</h4>
              <div className="mb-3">
                <p className="text-[10px] text-content-muted mb-1">총 등록 문제</p>
                {statsLoading ? (
                  <span className="my-1 inline-block h-6 w-16 rounded-lg bg-white/10 animate-pulse" aria-label="불러오는 중" />
                ) : (
                  <p className="text-2xl font-bold tabular-nums tracking-tight text-content-primary">{stats.totalProblems}</p>
                )}
              </div>
              <div className={`flex items-center justify-between p-2.5 ${RADIUS.control} ${PANEL_INSET}`}>
                <span className="text-xs text-content-secondary">이번 주 추가</span>
                <span className="text-sm font-bold tabular-nums text-accent">+{stats.problemsThisWeek}</span>
              </div>
            </div>
          </div>
        </div>
      </SurfacePanel>

      {/* 3. AI 취약 단원 히트맵 + 빠른 작업 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Heatmap (2 cols) */}
        <SurfacePanel title="AI 취약 단원 분석" className="lg:col-span-2">

          <div className="overflow-x-auto pb-4">
            <div className="min-w-[550px]">
              <div className="relative">
                <div
                  className="absolute -left-6 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] text-content-tertiary font-medium whitespace-nowrap"
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
                        className="text-[10px] text-content-tertiary text-center flex items-end justify-center break-keep leading-tight pb-1"
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
                        <div className="text-[10px] font-medium text-content-tertiary text-right pr-3 py-1 whitespace-nowrap flex items-center justify-end">
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
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-surface-base/80 backdrop-blur-md border border-white/10 shadow-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 min-w-[120px]">
                                <div className="text-[10px] text-content-tertiary tracking-wide mb-1 font-medium">{student}</div>
                                <div className="text-content-primary text-xs font-semibold mb-1.5">{unit}</div>
                                <div className="flex items-center justify-between text-xs pt-1 border-t border-white/10">
                                  <span className="text-content-secondary">Proficiency</span>
                                  <span className="text-indigo-400 font-bold font-mono">{score}%</span>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    ))}
                  </motion.div>

                  <div className="text-[10px] text-content-tertiary text-center mt-3 font-medium">단원</div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center justify-end gap-3 mt-5 pt-3 border-t border-subtle">
                <span className="text-[10px] uppercase tracking-wider text-content-muted font-medium">Proficiency Index</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-content-tertiary font-medium">Low</span>
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
                  <span className="text-[10px] text-content-tertiary font-medium">High</span>
                </div>
              </div>
            </div>
          </div>
        </SurfacePanel>

        {/* 빠른 작업 */}
        <SurfacePanel title="빠른 작업" className="self-start">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '시험지 자산화', icon: Upload, href: '/dashboard/cloud' },
              { label: '시험지 마법사', icon: Wand2, href: '/dashboard/create' },
              { label: '학생 상담', icon: MessageCircle, href: '/tutor/classes' },
              { label: '오답 노트', icon: BookX, href: '/dashboard/prescription' },
            ].map((action, i) => {
              const Icon = action.icon;
              return (
                <button
                  key={i}
                  onClick={() => router.push(action.href)}
                  className={`flex flex-col items-center justify-center gap-2 p-4 ${RADIUS.panel} ${PANEL_INSET} ${PANEL_LIFT} group`}
                >
                  <Icon size={20} className="text-content-tertiary group-hover:text-content-primary transition-colors" />
                  <span className="text-sm text-content-secondary group-hover:text-content-primary font-medium transition-colors">
                    {action.label}
                  </span>
                </button>
              );
            })}
          </div>
        </SurfacePanel>
      </div>

      {/* 4. 활동 로그 + 수업 현황 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 최근 활동 로그 */}
        <SurfacePanel title="최근 활동 로그">
          <div className="space-y-0 divide-y divide-white/5">
            {activityLogs.map((log) => (
              <div key={log.id} className="py-4 first:pt-0 last:pb-0 flex items-start gap-3">
                <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent/70" />
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h4 className="text-sm font-medium text-content-primary">{log.title}</h4>
                    <span className="text-xs text-content-tertiary">{log.time}</span>
                  </div>
                  <p className="text-xs text-content-secondary mt-1">{log.description}</p>
                </div>
              </div>
            ))}
          </div>
        </SurfacePanel>

        {/* 오늘의 수업 현황 */}
        <SurfacePanel
          title="오늘의 수업 현황"
          right={
            <Link
              href="/dashboard/classes"
              className="text-xs text-content-tertiary hover:text-content-primary flex items-center gap-1 transition-colors"
            >
              전체 일정 <ArrowRight className="w-3 h-3" />
            </Link>
          }
        >
          <div className="space-y-2">
            {classStatus.map((cls) => (
              <div
                key={cls.id}
                className={`flex items-center justify-between p-3 ${RADIUS.control} ${PANEL_INSET} transition-colors hover:border-white/[.12]`}
              >
                <div>
                  <h4 className="text-sm font-medium text-content-primary mb-0.5">{cls.name}</h4>
                  <p className="text-xs text-content-tertiary flex items-center gap-2">
                    <span>{cls.time}</span>
                    <span className="w-1 h-1 bg-zinc-700 rounded-full" />
                    <span>{cls.students}명</span>
                  </p>
                </div>
                <span
                  className={`px-2 py-1 rounded-lg text-xs font-medium ${
                    cls.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : cls.status === 'scheduled'
                      ? 'bg-surface-raised text-content-secondary border border-subtle'
                      : 'bg-surface-card text-content-muted border border-subtle'
                  }`}
                >
                  {cls.status === 'active' ? '수업 중' : cls.status === 'scheduled' ? '예정' : '종료'}
                </span>
              </div>
            ))}
          </div>
        </SurfacePanel>
      </div>

      <StudentAnalysisModal
        isOpen={!!selectedCell}
        onClose={() => setSelectedCell(null)}
        data={selectedCell}
      />
    </div>
  );
}
