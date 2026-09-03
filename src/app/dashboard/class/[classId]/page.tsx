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
// 탭은 여섯: 학생 · 과제 · 채점 · 숙달 · 이력 · 설정.
// 채운 것: 학생(단계 2) · 과제(단계 3). 나머지는 무엇이 올 자리인지만 적어 뒀다
// (빈 탭에 "준비 중" 을 띄우는 건, 없는 걸 있는 척하는 것보다 낫다).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Users, ClipboardList, CheckSquare, Grid3x3, LineChart, Settings2,
  Loader2, ArrowLeft, RefreshCw, ExternalLink,
} from 'lucide-react';
import { AssignmentsTab } from '@/components/class/AssignmentsTab';

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
  { key: 'mastery', label: '숙달', icon: Grid3x3 },
  { key: 'history', label: '이력', icon: LineChart },
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
                onClick={() => setTab(t.key)}
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
                      <th className="px-4 py-2.5 text-right font-medium">회차</th>
                      <th className="px-4 py-2.5 text-right font-medium">채점 문항</th>
                      <th className="px-4 py-2.5 text-right font-medium">정답률</th>
                      <th className="px-4 py-2.5 text-right font-medium">숙달 / 취약</th>
                      <th className="px-4 py-2.5 text-right font-medium">최근 학습</th>
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
                        <td className="px-4 py-2.5 text-right tabular-nums text-content-secondary">
                          {s.sessionCount || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-content-secondary">
                          {s.gradedCount || '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${pctTone(s.correctPct)}`}>
                          {s.correctPct == null ? '—' : `${s.correctPct}%`}
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

          {tab !== 'students' && tab !== 'assignments' && !error && (
            <div className="rounded-xl border border-dashed border-white/10 px-6 py-14 text-center">
              <p className="text-sm text-content-secondary">
                「{TABS.find((t) => t.key === tab)?.label}」 탭은 아직 만들지 않았습니다.
              </p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-content-muted">
                {tab === 'grading' && 'QR · 엑셀 · 수동 채점을 한 줄에 모읍니다.'}
                {tab === 'mastery' && '단원 × 난이도 매트릭스로 반 전체의 구멍을 한눈에 봅니다.'}
                {tab === 'history' && '주차별 숙달 추이를 쌓아 꺾은선으로 보여줍니다.'}
                {tab === 'settings' && '반 이름 · 담당 강사 · 학생 등록을 여기서 관리합니다.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
