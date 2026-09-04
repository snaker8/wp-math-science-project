'use client';

// ============================================================================
// 반 허브 ▸ 설정 — 반 정보 · 수업 일정 · 학습 목표 · 학생 등록(초대·직접 등록)
// ----------------------------------------------------------------------------
// docs/PLAN_CLASS_HUB_REBUILD.md 단계 8 · 매쓰홀릭 설정 탭 실측(10 문서 §1):
//   수업명 · 담당/부담당 · 수업 일정(요일) · 수업 완료/복구 · 구성(과정·교재 난이도) · **학습 목표** · 출제 방식.
//
// 학습 목표가 이 탭의 핵심이다 — 이게 있어야 학생 탭의 달성률·날씨가 생긴다 (없으면 안 그린다).
// 학생 등록은 옛 등록 화면(/tutor/classes/[id])의 두 흐름 — 기존 학생 초대 · 직접 등록(계정 발급) — 을
// **같은 API 로 탭 안에 흡수**했다. 옛 화면으로 보내지 않는다 — 새 그릇이 담아야 옛 것을 걷을 수 있다.
// 아직 없는 것: 담당 변경(강사 목록 API 없음) · 완료/복구 · 출제 방식(개인화/공통 — 학생별 다른 문제 출제가 생기면).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Save, Target, Users, Trash2, AlertCircle, Check, UserPlus, X, Search, Copy, CalendarDays,
} from 'lucide-react';
import { GOAL_LIMITS, type LearningGoals } from '@/lib/class/learning-goals';

interface Enrollment {
  id: string;
  status: string;
  enrolled_at: string | null;
  student: { id: string; full_name: string | null; email: string | null; grade: number | null } | null;
}

interface Schedule {
  days: string[];
  time: string | null;
  duration_minutes: number | null;
}

interface ClassDetail {
  id: string;
  name: string;
  description: string | null;
  tutor: { id: string; full_name: string | null; email: string | null } | null;
  schedule: Partial<Schedule> | null;
  settings: unknown;
}

const DAYS = [
  { value: 'MON', label: '월' }, { value: 'TUE', label: '화' }, { value: 'WED', label: '수' }, { value: 'THU', label: '목' },
  { value: 'FRI', label: '금' }, { value: 'SAT', label: '토' }, { value: 'SUN', label: '일' },
];

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

const inputCls = 'w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-sm text-content-primary focus:border-white/20 focus:outline-none';

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
  const [days, setDays] = useState<string[]>([]);
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('');
  const [weekly, setWeekly] = useState(initialGoals.weeklyProblems == null ? '' : String(initialGoals.weeklyProblems));
  const [accuracy, setAccuracy] = useState(initialGoals.accuracy == null ? '' : String(initialGoals.accuracy));
  const [saving, setSaving] = useState<'info' | 'schedule' | 'goals' | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [adding, setAdding] = useState(false);

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
      setDays(Array.isArray(c.schedule?.days) ? c.schedule!.days! : []);
      setTime(c.schedule?.time ?? '');
      setDuration(c.schedule?.duration_minutes != null ? String(c.schedule.duration_minutes) : '');
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

  const put = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/classes/${classId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  };

  const saveInfo = async () => {
    if (!name.trim()) { flash('err', '반 이름은 비울 수 없습니다'); return; }
    setSaving('info');
    try {
      await put({ name: name.trim(), description: description.trim() });
      flash('ok', '반 정보를 저장했습니다');
      onChanged();
    } catch (e) { flash('err', e instanceof Error ? e.message : String(e)); } finally { setSaving(null); }
  };

  const saveSchedule = async () => {
    setSaving('schedule');
    try {
      const schedule = days.length > 0 || time
        ? { days, time: time || null, duration_minutes: parseInt(duration, 10) || null }
        : {};
      await put({ schedule });
      flash('ok', days.length > 0 ? '수업 일정을 저장했습니다' : '수업 일정을 비웠습니다');
    } catch (e) { flash('err', e instanceof Error ? e.message : String(e)); } finally { setSaving(null); }
  };

  const saveGoals = async () => {
    setSaving('goals');
    try {
      await put({ goals: { weeklyProblems: weekly.trim(), accuracy: accuracy.trim() } });
      flash('ok', weekly.trim() || accuracy.trim() ? '학습 목표를 저장했습니다 — 학생 탭에 달성률이 보입니다' : '학습 목표를 해제했습니다');
      onChanged();
    } catch (e) { flash('err', e instanceof Error ? e.message : String(e)); } finally { setSaving(null); }
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

  const enrolledIds = useMemo(() => new Set(enrollments.map((e) => e.student?.id).filter((x): x is string => !!x)), [enrollments]);

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
            <input type="number" inputMode="numeric" value={weekly} onChange={(e) => setWeekly(e.target.value)}
              min={GOAL_LIMITS.weeklyProblems.min} max={GOAL_LIMITS.weeklyProblems.max} placeholder="예: 70" className={inputCls} />
            <span className="mt-1 block text-[11px] text-content-muted">{GOAL_LIMITS.weeklyProblems.min}~{GOAL_LIMITS.weeklyProblems.max}</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-content-tertiary">목표 정답률 (%)</span>
            <input type="number" inputMode="numeric" value={accuracy} onChange={(e) => setAccuracy(e.target.value)}
              min={GOAL_LIMITS.accuracy.min} max={GOAL_LIMITS.accuracy.max} placeholder="예: 80" className={inputCls} />
            <span className="mt-1 block text-[11px] text-content-muted">{GOAL_LIMITS.accuracy.min}~{GOAL_LIMITS.accuracy.max}</span>
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={() => void saveGoals()} disabled={saving !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40">
            {saving === 'goals' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            목표 저장
          </button>
        </div>
      </section>

      {/* 반 정보 + 수업 일정 */}
      <section className="space-y-4">
        <div className="rounded-xl border border-white/10 p-4">
          <h3 className="mb-3 text-sm font-semibold text-content-primary">반 정보</h3>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-content-tertiary">반 이름</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-content-tertiary">설명</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="예: 중3 내신 · 화·목" className={inputCls} />
            </label>
            <div className="flex items-center justify-between text-xs">
              <span className="text-content-tertiary" title="담당 변경은 강사 목록이 생기면 여기서">
                담당 강사 <span className="text-content-secondary">{detail?.tutor?.full_name || detail?.tutor?.email?.split('@')[0] || '—'}</span>
              </span>
              <button onClick={() => void saveInfo()} disabled={saving !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-content-secondary transition-colors hover:border-white/20 hover:text-content-primary disabled:opacity-40">
                {saving === 'info' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                저장
              </button>
            </div>
          </div>
        </div>

        {/* 수업 일정 — 매쓰홀릭 설정 탭 「수업 일정: 일월화수목금토」 */}
        <div className="rounded-xl border border-white/10 p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-content-tertiary" />
            <h3 className="text-sm font-semibold text-content-primary">수업 일정</h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {DAYS.map((d) => {
              const on = days.includes(d.value);
              return (
                <button key={d.value} type="button"
                  onClick={() => setDays((prev) => (prev.includes(d.value) ? prev.filter((x) => x !== d.value) : [...prev, d.value]))}
                  className={`h-8 w-8 rounded-md text-sm transition-colors ${on ? 'bg-white text-black' : 'border border-white/10 text-content-secondary hover:border-white/20 hover:text-content-primary'}`}>
                  {d.label}
                </button>
              );
            })}
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="ml-2 rounded-lg border border-white/10 bg-white/[.03] px-2 py-1.5 text-sm text-content-primary focus:border-white/20 focus:outline-none" />
            <input type="number" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="분"
              className="w-20 rounded-lg border border-white/10 bg-white/[.03] px-2 py-1.5 text-sm text-content-primary focus:border-white/20 focus:outline-none" />
            <button onClick={() => void saveSchedule()} disabled={saving !== null}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-content-secondary transition-colors hover:border-white/20 hover:text-content-primary disabled:opacity-40">
              {saving === 'schedule' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              저장
            </button>
          </div>
        </div>
      </section>

      {/* 학생 등록 — 옛 등록 화면의 두 흐름을 탭 안으로 */}
      <section className="rounded-xl border border-white/10 p-4 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-content-tertiary" />
            <h3 className="text-sm font-semibold text-content-primary">학생 등록</h3>
            <span className="text-xs tabular-nums text-content-tertiary">{active.length}명{pending.length > 0 && ` · 대기 ${pending.length}`}</span>
          </div>
          <button onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90">
            <UserPlus className="h-3.5 w-3.5" />
            학생 추가
          </button>
        </div>
        {enrollments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-content-tertiary">
            등록된 학생이 없습니다. 「학생 추가」에서 기존 학생을 넣거나 새 학생을 직접 등록합니다.
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
                      <button onClick={() => void removeEnrollment(en)} className="inline-flex items-center gap-1 text-xs text-content-tertiary transition-colors hover:text-red-400" title="반에서 빼기">
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

      {adding && (
        <AddStudentsModal
          classId={classId}
          enrolledIds={enrolledIds}
          onClose={() => setAdding(false)}
          onAdded={(text) => { setAdding(false); flash('ok', text); void load(); onChanged(); }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 학생 추가 — 기존 학생 넣기 / 새 학생 직접 등록 (옛 등록 화면과 같은 API)
// ────────────────────────────────────────────────────────────────────────────
interface Credentials { email: string; password: string; emailGenerated?: boolean; passwordGenerated?: boolean }

function AddStudentsModal({
  classId, enrolledIds, onClose, onAdded,
}: {
  classId: string;
  enrolledIds: Set<string>;
  onClose: () => void;
  onAdded: (message: string) => void;
}) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');

  // 기존 학생
  const [students, setStudents] = useState<Array<{ id: string; name: string; grade: string }>>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 직접 등록
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [grade, setGrade] = useState('');
  const [note, setNote] = useState('');
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [copied, setCopied] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/users/students', { cache: 'no-store' });
        const d = await r.json();
        if (cancelled) return;
        const list = (Array.isArray(d.students) ? d.students : [])
          .map((s: { id: string; name?: string; grade?: string }) => ({ id: s.id, name: s.name || '(이름 없음)', grade: s.grade || '' }))
          .filter((s: { id: string }) => !enrolledIds.has(s.id));
        setStudents(list);
      } catch {
        if (!cancelled) setErr('학생 목록을 불러오지 못했습니다');
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // enrolledIds 는 모달 연 시점 기준 — 의도적으로 deps 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = search.trim() ? students.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase())) : students;

  const submitExisting = async () => {
    if (selected.size === 0) return;
    setBusy(true); setErr(null);
    const failed: string[] = [];
    let ok = 0;
    for (const sid of selected) {
      try {
        const r = await fetch(`/api/classes/${classId}/enrollments`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: sid, direct: true }),
        });
        if (r.ok || r.status === 409) ok += 1;   // 이미 등록(409)은 성공 취급
        else {
          const d = await r.json().catch(() => ({}));
          failed.push(`${students.find((s) => s.id === sid)?.name ?? sid}: ${d.error || `HTTP ${r.status}`}`);
        }
      } catch {
        failed.push(`${students.find((s) => s.id === sid)?.name ?? sid}: 네트워크 오류`);
      }
    }
    setBusy(false);
    if (failed.length > 0) setErr(failed.join(' · '));
    if (ok > 0 && failed.length === 0) onAdded(`학생 ${ok}명을 반에 넣었습니다`);
  };

  const submitNew = async () => {
    if (!fullName.trim()) { setErr('이름은 필수입니다'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/classes/${classId}/students`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(), phone: phone.trim() || undefined, grade: grade.trim() || undefined, note: note.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      if (d.credentials) setCredentials(d.credentials as Credentials);   // 신규 발급 → 자격증명 보여주고 닫는다
      else onAdded(`${fullName.trim()} 학생을 반에 넣었습니다`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyAll = async () => {
    if (!credentials) return;
    const text = `${fullName.trim()} 로그인\n아이디: ${credentials.email}\n비밀번호: ${credentials.password}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt('복사할 텍스트', text); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <h2 className="text-base font-semibold text-content-primary">학생 추가</h2>
          <button onClick={onClose} className="text-content-tertiary hover:text-content-primary"><X className="h-4 w-4" /></button>
        </div>

        {credentials ? (
          <div className="px-5 py-4">
            <p className="text-sm text-content-primary">{fullName.trim()} 학생 계정을 만들고 반에 넣었습니다.</p>
            <p className="mt-1 text-xs text-content-tertiary">아래 로그인 정보를 학생에게 전해 주십시오. 이 창을 닫으면 비밀번호는 다시 볼 수 없습니다.</p>
            <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-white/[.03] p-3 text-sm">
              <div><span className="text-content-tertiary">아이디 </span><span className="font-mono text-content-primary">{credentials.email}</span></div>
              <div><span className="text-content-tertiary">비밀번호 </span><span className="font-mono text-content-primary">{credentials.password}</span></div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => void copyAll()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-content-secondary hover:border-white/20 hover:text-content-primary">
                <Copy className="h-3.5 w-3.5" />{copied ? '복사됨' : '복사'}
              </button>
              <button onClick={() => onAdded(`${fullName.trim()} 학생을 등록했습니다`)} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:opacity-90">확인</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-1 border-b border-white/10 px-5">
              {([['existing', '기존 학생 넣기'], ['new', '새 학생 직접 등록']] as const).map(([k, label]) => (
                <button key={k} onClick={() => { setMode(k); setErr(null); }}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${mode === k ? 'border-white text-content-primary' : 'border-transparent text-content-tertiary hover:text-content-secondary'}`}>
                  {label}
                </button>
              ))}
            </div>

            {mode === 'existing' ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="px-5 pt-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-tertiary" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름 검색" className={`${inputCls} pl-9`} />
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
                  {listLoading ? (
                    <div className="flex items-center gap-2 py-8 text-sm text-content-tertiary"><Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중</div>
                  ) : filtered.length === 0 ? (
                    <p className="py-8 text-center text-sm text-content-tertiary">{students.length === 0 ? '넣을 수 있는 학생이 없습니다 — 「새 학생 직접 등록」으로.' : '검색 결과 없음'}</p>
                  ) : (
                    <div className="space-y-1">
                      {filtered.map((s) => {
                        const on = selected.has(s.id);
                        return (
                          <button key={s.id} onClick={() => setSelected((prev) => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${on ? 'bg-white/10 text-content-primary' : 'text-content-secondary hover:bg-white/5'}`}>
                            <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px] ${on ? 'border-white bg-white text-black' : 'border-white/20'}`}>{on ? '✓' : ''}</span>
                            <span className="flex-1">{s.name}</span>
                            <span className="text-xs text-content-muted">{s.grade}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
                  <span className="text-xs text-content-tertiary">{err ? <span className="text-red-400">{err}</span> : `${selected.size}명 선택`}</span>
                  <button onClick={() => void submitExisting()} disabled={busy || selected.size === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-40">
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}반에 넣기
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-5 py-4">
                <div className="space-y-3">
                  <label className="block"><span className="mb-1 block text-xs text-content-tertiary">이름 *</span>
                    <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} /></label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="mb-1 block text-xs text-content-tertiary">학생 휴대폰 (아이디가 됩니다)</span>
                      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" className={inputCls} /></label>
                    <label className="block"><span className="mb-1 block text-xs text-content-tertiary">학년</span>
                      <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="중3 / 고1" className={inputCls} /></label>
                  </div>
                  <label className="block"><span className="mb-1 block text-xs text-content-tertiary">메모</span>
                    <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></label>
                  <p className="text-[11px] leading-relaxed text-content-muted">휴대폰을 넣으면 그 번호가 아이디, 비밀번호는 초기값이 됩니다. 비우면 임의 아이디·비밀번호를 만들어 보여줍니다.</p>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-red-400">{err}</span>
                  <button onClick={() => void submitNew()} disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-40">
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}등록하고 반에 넣기
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
