'use client';

// ============================================================================
// 반 허브 ▸ 설정 — 반 정보 · 학습 목표 · 학생 등록
// ----------------------------------------------------------------------------
// docs/PLAN_CLASS_HUB_REBUILD.md 단계 8 · 매쓰홀릭 설정 탭 실측(10 문서 §1):
//   수업명 · 담당/부담당 · 수업 일정 · 수업 완료/복구 · 구성(과정·교재 난이도) · **학습 목표(목표 학습량·목표 정답률)** · 출제 방식.
//
// 여기서 먼저 채우는 것: 반 이름/설명 · 담당 강사(표시) · **학습 목표** · 학생 등록(목록·제거 + 추가는 기존 등록 화면).
// 학습 목표가 이 탭의 핵심이다 — 이게 있어야 학생 탭의 달성률·날씨가 생긴다 (없으면 안 그린다).
// 아직 없는 것: 수업 일정(요일) · 담당 변경 · 완료/복구 · 출제 방식(개인화/공통) — 다음 회차.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Save, Target, Users, ExternalLink, Trash2, AlertCircle, Check } from 'lucide-react';
import { GOAL_LIMITS, type LearningGoals } from '@/lib/class/learning-goals';

interface Enrollment {
  id: string;
  status: string;
  enrolled_at: string | null;
  student: { id: string; full_name: string | null; email: string | null; grade: number | null } | null;
}

interface ClassDetail {
  id: string;
  name: string;
  description: string | null;
  tutor: { id: string; full_name: string | null; email: string | null } | null;
  settings: unknown;
}

function gradeLabel(g: number | null | undefined): string {
  if (g == null || g <= 0) return '';
  if (g <= 6) return `초${g}`;
  if (g <= 9) return `중${g - 6}`;
  if (g <= 12) return `고${g - 9}`;
  return String(g);
}

const STATUS_LABEL: Record<string, string> = {
  ACCEPTED: '등록', PENDING: '초대 대기', INVITED: '초대 대기', DECLINED: '거절', LEFT: '나감',
};

export function SettingsTab({
  classId, goals: initialGoals, onChanged,
}: {
  classId: string;
  goals: LearningGoals;
  /** 저장·등록 변경 후 허브를 다시 불러오게 */
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weekly, setWeekly] = useState(initialGoals.weeklyProblems == null ? '' : String(initialGoals.weeklyProblems));
  const [accuracy, setAccuracy] = useState(initialGoals.accuracy == null ? '' : String(initialGoals.accuracy));
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingGoals, setSavingGoals] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const c = data.class as ClassDetail;
      setDetail(c);
      setName(c.name ?? '');
      setDescription(c.description ?? '');
      setEnrollments((data.enrollments || []) as Enrollment[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [classId]);
  useEffect(() => { void load(); }, [load]);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const saveInfo = async () => {
    if (!name.trim()) { flash('err', '반 이름은 비울 수 없습니다'); return; }
    setSavingInfo(true);
    try {
      const res = await fetch(`/api/classes/${classId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      flash('ok', '반 정보를 저장했습니다');
      onChanged();
    } catch (e) {
      flash('err', e instanceof Error ? e.message : String(e));
    } finally {
      setSavingInfo(false);
    }
  };

  const saveGoals = async () => {
    setSavingGoals(true);
    try {
      const res = await fetch(`/api/classes/${classId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goals: { weeklyProblems: weekly.trim(), accuracy: accuracy.trim() } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      flash('ok', weekly.trim() || accuracy.trim() ? '학습 목표를 저장했습니다 — 학생 탭에 달성률이 보입니다' : '학습 목표를 해제했습니다');
      onChanged();
    } catch (e) {
      flash('err', e instanceof Error ? e.message : String(e));
    } finally {
      setSavingGoals(false);
    }
  };

  const removeEnrollment = async (en: Enrollment) => {
    const who = en.student?.full_name || en.student?.email || '이 학생';
    if (!confirm(`${who} 을(를) 이 반에서 뺍니다.\n채점·과제 기록은 남습니다.`)) return;
    const res = await fetch(`/api/enrollments/${en.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      flash('err', d.error || '제거 실패');
      return;
    }
    setEnrollments((prev) => prev.filter((x) => x.id !== en.id));
    onChanged();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-content-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        불러오는 중
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4" />
        {error}
      </div>
    );
  }

  const inputCls = 'w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-sm text-content-primary focus:border-white/20 focus:outline-none';
  const active = enrollments.filter((e) => e.status === 'ACCEPTED');
  const pending = enrollments.filter((e) => e.status !== 'ACCEPTED');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {msg && (
        <div className={`lg:col-span-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
          msg.kind === 'ok' ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300' : 'border-red-500/30 bg-red-500/5 text-red-300'
        }`}>
          {msg.kind === 'ok' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      {/* 학습 목표 — 이 탭의 핵심. 매쓰홀릭 설정 탭 「학습 목표」 */}
      <section className="rounded-xl border border-white/10 p-4">
        <div className="mb-1 flex items-center gap-2">
          <Target className="h-4 w-4 text-content-tertiary" />
          <h3 className="text-sm font-semibold text-content-primary">학습 목표</h3>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-content-tertiary">
          반 단위로 정합니다. 학생 탭의 <span className="text-content-secondary">금주 학습량 · 정답률 달성률</span>과 날씨가 이 목표를 기준으로 나옵니다.
          비워 두면 달성률을 표시하지 않습니다.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-content-tertiary">주간 목표 학습량 (문항)</span>
            <input
              type="number" inputMode="numeric" value={weekly} onChange={(e) => setWeekly(e.target.value)}
              min={GOAL_LIMITS.weeklyProblems.min} max={GOAL_LIMITS.weeklyProblems.max} placeholder="예: 70"
              className={inputCls}
            />
            <span className="mt-1 block text-[11px] text-content-muted">{GOAL_LIMITS.weeklyProblems.min}~{GOAL_LIMITS.weeklyProblems.max}</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-content-tertiary">목표 정답률 (%)</span>
            <input
              type="number" inputMode="numeric" value={accuracy} onChange={(e) => setAccuracy(e.target.value)}
              min={GOAL_LIMITS.accuracy.min} max={GOAL_LIMITS.accuracy.max} placeholder="예: 80"
              className={inputCls}
            />
            <span className="mt-1 block text-[11px] text-content-muted">{GOAL_LIMITS.accuracy.min}~{GOAL_LIMITS.accuracy.max}</span>
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => void saveGoals()}
            disabled={savingGoals}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {savingGoals ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            목표 저장
          </button>
        </div>
      </section>

      {/* 반 정보 */}
      <section className="rounded-xl border border-white/10 p-4">
        <h3 className="mb-3 text-sm font-semibold text-content-primary">반 정보</h3>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-content-tertiary">반 이름</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-content-tertiary">설명</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="예: 화·목 19:00 · 중3 내신" className={inputCls} />
          </label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-content-tertiary">
              담당 강사{' '}
              <span className="text-content-secondary">{detail?.tutor?.full_name || detail?.tutor?.email?.split('@')[0] || '—'}</span>
            </span>
            <button
              onClick={() => void saveInfo()}
              disabled={savingInfo}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-content-secondary transition-colors hover:border-white/20 hover:text-content-primary disabled:opacity-40"
            >
              {savingInfo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              저장
            </button>
          </div>
        </div>
      </section>

      {/* 학생 등록 */}
      <section className="rounded-xl border border-white/10 p-4 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-content-tertiary" />
            <h3 className="text-sm font-semibold text-content-primary">학생 등록</h3>
            <span className="text-xs tabular-nums text-content-tertiary">{active.length}명{pending.length > 0 && ` · 대기 ${pending.length}`}</span>
          </div>
          <Link
            href={`/tutor/classes/${classId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            학생 추가
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
        {enrollments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-content-tertiary">
            등록된 학생이 없습니다. 「학생 추가」에서 기존 학생을 초대하거나 직접 등록합니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-content-tertiary">
                  <th className="px-3 py-2 text-left font-medium">학생</th>
                  <th className="px-3 py-2 text-left font-medium">학년</th>
                  <th className="px-3 py-2 text-left font-medium">상태</th>
                  <th className="px-3 py-2 text-left font-medium">등록일</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {[...active, ...pending].map((en) => (
                  <tr key={en.id} className="border-b border-white/5 last:border-0 hover:bg-white/[.02]">
                    <td className="px-3 py-2 text-content-primary">{en.student?.full_name || en.student?.email?.split('@')[0] || '(이름 없음)'}</td>
                    <td className="px-3 py-2 text-content-tertiary">{gradeLabel(en.student?.grade)}</td>
                    <td className="px-3 py-2 text-content-tertiary">{STATUS_LABEL[en.status] ?? en.status}</td>
                    <td className="px-3 py-2 text-content-tertiary">{en.enrolled_at ? en.enrolled_at.slice(0, 10) : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => void removeEnrollment(en)}
                        className="inline-flex items-center gap-1 text-xs text-content-tertiary transition-colors hover:text-red-400"
                        title="반에서 빼기"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
