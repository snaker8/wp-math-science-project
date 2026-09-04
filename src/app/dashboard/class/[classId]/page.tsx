'use client';

// ============================================================================
// /dashboard/class/[classId] — 반 허브
// ----------------------------------------------------------------------------
// docs/PLAN_CLASS_HUB_REBUILD.md 단계 2.
//
// 왜 반인가: 학원은 반 단위로 굴러간다. "3학년 A반 오늘 뭐 하지" 가 실제 질문이고,
// "김OO 의 확률 숙달도" 는 그 다음 질문이다. 지금까지 우리 화면은 순서가 거꾸로여서,
// 학생 하나를 보려면 메뉴 여섯 곳을 돌아야 했다.
//
// 탭은 여섯: 학생 · 과제 · 채점 · 유형분석 · 유형이력 · 설정 (이름은 매쓰홀릭과 같게 — 대표 2026-09-04) — 2026-09-04 전부 채움 (단계 2~8).
// 설정 탭의 수업 일정·담당 변경·출제 방식은 아직 (docs/PLAN_CLASS_HUB_REBUILD.md 단계 8).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Users, ClipboardList, CheckSquare, Grid3x3, LineChart, Settings2,
  Loader2, ArrowLeft, RefreshCw, ExternalLink, Sun, CloudSun, Cloud,
} from 'lucide-react';
import { AssignmentsTab } from '@/components/class/AssignmentsTab';
import { MasteryMatrix } from '@/components/class/MasteryMatrix';
import { SettingsTab } from '@/components/class/SettingsTab';
import { HistoryTab } from '@/components/class/HistoryTab';
import { GradingTab } from '@/components/class/GradingTab';
import { weatherOf, WEATHER_LABEL, type LearningGoals } from '@/lib/class/learning-goals';

interface HubStudent {
  id: string;
  name: string;
  grade: string;
  refIds: string[];
  sessionCount: number;
  gradedCount: number;
  correctCount: number;
  correctPct: number | null;
  lastActivityAt: string | null;
  alpha: number;
  beta: number;
  gamma: number;
  assignedCount: number;
  submittedCount: number;
  weekGraded: number;
  weekCorrect: number;
  weekPct: number | null;
  activeWeeks: number;
  avgWeeklyGraded: number | null;
  weekAmountAch: number | null;
  weekAccuracyAch: number | null;
  avgAmountAch: number | null;
  avgAccuracyAch: number | null;
}

/**
 * 목표 대비 달성률 칸 — 매쓰홀릭 학생 탭의 「☀ 172% 달성 86점/50점」.
 * 목표가 없으면 달성률·날씨 없이 값만 보여준다 (목표 없이 "0% 달성"은 거짓).
 */
function AchCell({ ach, value, goal, unit }: { ach: number | null; value: number | null; goal: number | null; unit: string }) {
  const w = weatherOf(ach);
  const Icon = w === 'sunny' ? Sun : w === 'partly' ? CloudSun : Cloud;
  const tone = w === 'sunny' ? 'text-emerald-400' : w === 'partly' ? 'text-content-primary' : 'text-content-tertiary';
  if (goal == null) {
    return (
      <span className="tabular-nums text-content-secondary">{value == null ? '—' : `${value}${unit}`}</span>
    );
  }
  return (
    <span className="inline-flex items-center justify-end gap-1.5" title={w ? `${WEATHER_LABEL[w]} · 목표 ${goal}${unit}` : `목표 ${goal}${unit}`}>
      {w && <Icon className={`h-3.5 w-3.5 ${tone}`} />}
      <span className={`font-medium tabular-nums ${tone}`}>{ach == null ? '—' : `${ach}%`}</span>
      <span className="text-[11px] tabular-nums text-content-muted">
        {value == null ? '—' : value}{unit}/{goal}{unit}
      </span>
    </span>
  );
}

interface ClassInfo {
  id: string;
  name: string;
  description: string | null;
}

const TABS = [
  { key: 'students', label: '학생', icon: Users },
  { key: 'assignments', label: '과제', icon: ClipboardList },
  { key: 'grading', label: '채점', icon: CheckSquare },
  { key: 'mastery', label: '유형분석', icon: Grid3x3 },
  { key: 'history', label: '유형이력', icon: LineChart },
  { key: 'settings', label: '설정', icon: Settings2 },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** 며칠 전인지 — 날짜만 보면 "언제였더라" 를 또 계산해야 한다 */
function sinceLabel(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 14) return `${days}일 전`;
  if (days < 60) return `${Math.floor(days / 7)}주 전`;
  return `${Math.floor(days / 30)}개월 전`;
}

/**
 * 정답률 색 — 크롬에는 채도색을 안 쓴다(디자인 가드). 정상/위험만 시맨틱으로 찍고
 * 중간대는 무채로 둔다. 색을 세 단계로 벌리면 표가 알록달록해져 오히려 안 읽힌다.
 */
function pctTone(pct: number | null): string {
  if (pct == null) return 'text-content-tertiary';
  if (pct >= 80) return 'text-emerald-400';
  if (pct < 60) return 'text-red-400';
  return 'text-content-primary';
}

export default function ClassHubPage() {
  const params = useParams<{ classId: string }>();
  const classId = params?.classId;

  const [tab, setTab] = useState<TabKey>('students');
  const [info, setInfo] = useState<ClassInfo | null>(null);
  const [students, setStudents] = useState<HubStudent[]>([]);
  const [goals, setGoals] = useState<LearningGoals>({ weeklyProblems: null, accuracy: null });
  /** 이력 탭에서 「이 시점의 판 보기」로 넘어올 때의 기준일 */
  const [masteryTo, setMasteryTo] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/hub`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setInfo(data.class as ClassInfo);
      setStudents((data.students || []) as HubStudent[]);
      setGoals((data.goals as LearningGoals) ?? { weeklyProblems: null, accuracy: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);

  // 반 전체 요약 — 학생 줄을 훑기 전에 "이 반이 지금 어떤가" 가 먼저 보여야 한다
  const summary = useMemo(() => {
    const graded = students.reduce((s, x) => s + x.gradedCount, 0);
    const correct = students.reduce((s, x) => s + x.correctCount, 0);
    const active = students.filter((x) => x.gradedCount > 0).length;
    const weak = students.reduce((s, x) => s + x.gamma, 0);
    return {
      total: students.length,
      active,
      pct: graded > 0 ? Math.round((correct * 100) / graded) : null,
      graded,
      weak,
    };
  }, [students]);

  return (
    <div className="min-h-screen bg-surface-base text-content-primary">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* 머리 */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href="/tutor/classes"
              className="inline-flex items-center gap-1.5 text-sm text-content-tertiary transition-colors hover:text-content-secondary"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              반 목록
            </Link>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">
              {info?.name || (loading ? '불러오는 중' : '반')}
            </h1>
            {info?.description && (
              <p className="mt-1 text-sm text-content-tertiary">{info.description}</p>
            )}
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-content-secondary transition-colors hover:border-white/20 hover:text-content-primary disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {/* 반 요약 */}
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-4">
          {[
            { label: '학생', value: `${summary.total}명` },
            { label: '학습 기록 있음', value: `${summary.active}명` },
            { label: '반 정답률', value: summary.pct == null ? '—' : `${summary.pct}%` },
            { label: '취약 유형', value: `${summary.weak}개` },
          ].map((s) => (
            <div key={s.label} className="bg-surface-card px-4 py-3">
              <div className="text-xs text-content-tertiary">{s.label}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>

        {/* 탭 */}
        <div className="mt-6 flex gap-1 border-b border-white/10">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); if (t.key === 'mastery') setMasteryTo(undefined); }}
                className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
                  on
                    ? 'border-content-primary text-content-primary'
                    : 'border-transparent text-content-tertiary hover:text-content-secondary'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* 본문 */}
        <div className="mt-5">
          {error && (
            <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {tab === 'students' && !error && (
            loading ? (
              <div className="flex items-center gap-2 py-16 text-sm text-content-tertiary">
                <Loader2 className="h-4 w-4 animate-spin" />
                불러오는 중
              </div>
            ) : students.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 px-6 py-14 text-center">
                <p className="text-sm text-content-secondary">이 반에 등록된 학생이 없습니다.</p>
                <p className="mt-1 text-xs text-content-muted">
                  반 설정에서 학생을 등록하면 여기에 학습 상태가 모입니다.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-content-tertiary">
                      <th className="px-4 py-2.5 text-left font-medium">학생</th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium" title="제출한 과제 / 배정된 과제">진행도</th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium" title="이번 주(월~) 채점 문항 · 목표 대비">금주 학습량</th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium" title="이번 주 정답률 · 목표 대비">금주 정답률</th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium" title="학습한 주당 평균 문항 · 목표 대비">평균 학습량</th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium" title="전체 정답률 · 목표 대비">평균 정답률</th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium">숙달 / 취약</th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium">최근 학습</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/5"
                      >
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-content-primary">{s.name}</span>
                          {s.grade && (
                            <span className="ml-2 text-xs text-content-tertiary">{s.grade}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums" title={`회차 ${s.sessionCount} · 채점 ${s.gradedCount}문항`}>
                          {s.assignedCount === 0 ? (
                            <span className="text-content-muted">—</span>
                          ) : (
                            <>
                              <span className={`font-medium ${pctTone(Math.round((s.submittedCount * 100) / s.assignedCount))}`}>
                                {Math.round((s.submittedCount * 100) / s.assignedCount)}%
                              </span>
                              <span className="ml-1 text-[11px] text-content-muted">{s.submittedCount}/{s.assignedCount}</span>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <AchCell ach={s.weekAmountAch} value={s.weekGraded} goal={goals.weeklyProblems} unit="개" />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <AchCell ach={s.weekAccuracyAch} value={s.weekPct} goal={goals.accuracy} unit="점" />
                        </td>
                        <td className="px-4 py-2.5 text-right" title={s.activeWeeks > 0 ? `학습한 주 ${s.activeWeeks}주` : undefined}>
                          <AchCell ach={s.avgAmountAch} value={s.avgWeeklyGraded} goal={goals.weeklyProblems} unit="개" />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <AchCell ach={s.avgAccuracyAch} value={s.correctPct} goal={goals.accuracy} unit="점" />
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-content-secondary">
                          {s.alpha + s.beta + s.gamma === 0 ? (
                            '—'
                          ) : (
                            <>
                              <span className="text-emerald-400">{s.alpha}</span>
                              <span className="mx-1 text-content-muted">/</span>
                              <span className="text-red-400">{s.gamma}</span>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-content-tertiary">
                          {sinceLabel(s.lastActivityAt)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Link
                            href={`/dashboard/prescription?student=${s.id}`}
                            className="inline-flex items-center gap-1 text-xs text-content-tertiary transition-colors hover:text-content-primary"
                          >
                            자세히
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === 'assignments' && !error && classId && (
            <AssignmentsTab classId={classId} studentIds={students.map((s) => s.id)} />
          )}

          {tab === 'mastery' && !error && classId && (
            <MasteryMatrix
              key={masteryTo ?? 'live'}
              classId={classId}
              className={info?.name ?? ''}
              students={students.map((s) => ({ id: s.id, name: s.name }))}
              initialTo={masteryTo}
            />
          )}

          {tab === 'grading' && !error && classId && (
            <GradingTab
              classId={classId}
              className={info?.name ?? ''}
              students={students.map((s) => ({ id: s.id, name: s.name, grade: s.grade }))}
              onOpenMastery={() => { setMasteryTo(undefined); setTab('mastery'); }}
            />
          )}

          {tab === 'history' && !error && classId && (
            <HistoryTab
              classId={classId}
              students={students.map((s) => ({ id: s.id, name: s.name }))}
              goals={goals}
              onOpenMastery={(d) => { setMasteryTo(d); setTab('mastery'); }}
            />
          )}

          {tab === 'settings' && !error && classId && (
            <SettingsTab classId={classId} goals={goals} onChanged={() => void load()} />
          )}

        </div>
      </div>
    </div>
  );
}
