'use client';

// ============================================================================
// 반 허브 ▸ 설정 ▸ 코스 — 매쓰홀릭 설정 탭 「구성(과정·교재) · 회차별 문제수 그래프 · 출제 방식」 대응
// ----------------------------------------------------------------------------
// docs/PLAN_COURSE_LAYER.md C5. 코스 이름 · 회차당 문항 · 출제 방식 · 회차별 문제수(난이도 적층) 그래프 ·
// 「다시 계획」(문제은행이 자란 뒤 안 낸 회차를 새 공급으로 재생성 — 낸 회차는 그대로).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Loader2, RefreshCw, Save } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { CourseRow } from '@/app/api/classes/[classId]/courses/route';

const BANDS: Array<{ key: string; label: string; color: string }> = [
  { key: 'A', label: '개념', color: '#38bdf8' },
  { key: 'B', label: '기본', color: '#34d399' },
  { key: 'C', label: '실력', color: '#fbbf24' },
  { key: 'D', label: '심화', color: '#f87171' },
];

export function CourseSettings({ classId }: { classId: string }) {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/classes/${classId}/courses`);
      const data = await res.json();
      if (res.ok) setCourses((data.courses || []) as CourseRow[]);
    } finally {
      setLoading(false);
    }
  }, [classId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <section className="rounded-xl border border-white/10 p-4 lg:col-span-2">
      <div className="mb-3 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-content-tertiary" />
        <h3 className="text-sm font-semibold text-content-primary">코스</h3>
        <span className="text-xs text-content-tertiary">회차별 문제수 · 출제 방식 · 다시 계획</span>
      </div>
      {msg && <p className="mb-3 rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-xs text-content-secondary">{msg}</p>}
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-content-tertiary"><Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중</div>
      ) : courses.length === 0 ? (
        <p className="text-sm text-content-muted">코스가 없습니다. 과제 탭에서 「코스 만들기」로 만듭니다.</p>
      ) : (
        <div className="space-y-6">
          {courses.map((c) => (
            <CourseCard key={c.id} classId={classId} course={c} onChanged={(t) => { setMsg(t); void load(); }} />
          ))}
        </div>
      )}
    </section>
  );
}

function CourseCard({ classId, course, onChanged }: { classId: string; course: CourseRow; onChanged: (msg: string) => void }) {
  const [title, setTitle] = useState(course.title);
  const [perStep, setPerStep] = useState(course.settings.perStep);
  const [issueMode, setIssueMode] = useState(course.settings.issueMode);
  const [keyFirst, setKeyFirst] = useState(course.settings.keyFirst);
  const [busy, setBusy] = useState<'save' | 'preview' | 'replan' | null>(null);
  const [preview, setPreview] = useState<{ summary: { before: { pending: number }; after: { pending: number; total: number }; problems: number; short: number } } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const dirty = title !== course.title || perStep !== course.settings.perStep || issueMode !== course.settings.issueMode || keyFirst !== course.settings.keyFirst;

  const save = async () => {
    setBusy('save'); setErr(null);
    try {
      const res = await fetch(`/api/classes/${classId}/courses/${course.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, perStep, issueMode, keyFirst }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onChanged('코스 설정을 저장했습니다. 회차당 문항은 「다시 계획」해야 안 낸 회차에 반영됩니다.');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  const replan = async (mode: 'preview' | 'replan') => {
    setBusy(mode); setErr(null);
    try {
      const res = await fetch(`/api/classes/${classId}/courses/${course.id}/replan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perStep, preview: mode === 'preview' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (mode === 'preview') setPreview(data);
      else { setPreview(null); onChanged(`다시 계획했습니다 — 안 낸 회차 ${data.summary.before.pending} → ${data.summary.after.pending}, 전체 ${data.summary.after.total}회차`); }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  // 회차별 문제수 — 난이도 적층 (매쓰홀릭 설정 탭 그래프)
  const chart = course.steps.map((s) => ({
    name: String(s.seq), unit: s.unitName, label: s.label, issued: !!s.assignmentId,
    A: s.levelPlan.A ?? 0, B: s.levelPlan.B ?? 0, C: s.levelPlan.C ?? 0, D: s.levelPlan.D ?? 0,
  }));
  const totalProblems = course.steps.reduce((n, s) => n + s.total, 0);

  return (
    <div className="rounded-lg border border-white/5 bg-white/[.02] p-3">
      <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_120px_180px_auto]">
        <div>
          <label className="mb-1 block text-xs text-content-tertiary">코스 이름 <span className="text-content-muted">· {course.subjectName}</span></label>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-1.5 text-sm text-content-primary focus:border-white/20 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-content-tertiary">회차당 문항</label>
          <input type="number" min={3} max={30} value={perStep}
            onChange={(e) => setPerStep(Math.min(30, Math.max(3, Number(e.target.value) || 10)))}
            className="w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-1.5 text-sm text-content-primary focus:border-white/20 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-content-tertiary">출제 방식</label>
          <div className="flex rounded-lg border border-white/10 p-0.5">
            {(['common', 'personal'] as const).map((m) => (
              <button key={m} onClick={() => setIssueMode(m)}
                className={`flex-1 rounded-md px-2 py-1 text-xs transition-colors ${issueMode === m ? 'bg-white/10 text-content-primary' : 'text-content-tertiary hover:text-content-primary'}`}
                title={m === 'personal' ? '학생마다 다른 문제 — 회차를 내면 학생 수만큼 시험지가 생깁니다' : '전원 같은 문제 — 회차당 시험지 한 장'}>
                {m === 'common' ? '공통 출제' : '개인화 학습'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-end gap-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5 pb-2 text-xs text-content-secondary" title="회차를 낼 때 학교기출에 자주 나온 세부유형부터 뽑습니다 (매쓰홀릭 내신빈출). 문항 수는 그대로">
            <input type="checkbox" checked={keyFirst} onChange={(e) => setKeyFirst(e.target.checked)} className="h-3.5 w-3.5 accent-white" />
            빈출 유형 우선
          </label>
          <button onClick={() => void save()} disabled={!dirty || busy != null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40">
            {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} 저장
          </button>
        </div>
      </div>

      <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-tertiary">
        <span>회차 <b className="tabular-nums text-content-secondary">{course.steps.length}</b> · 낸 회차 <b className="tabular-nums text-content-secondary">{course.issued}</b> · 문항 <b className="tabular-nums text-content-secondary">{totalProblems}</b></span>
        <span>부족 회차 <b className="tabular-nums text-content-secondary">{course.steps.filter((s) => s.short).length}</b></span>
        {course.settings.range?.l1 && course.settings.range.l1.length > 0 && <span>범위 대단원 {course.settings.range.l1.length}개</span>}
      </div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap={1}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'rgba(255,255,255,.4)' }} interval={Math.max(0, Math.ceil(chart.length / 30) - 1)} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,.4)' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,.05)' }}
              contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, fontSize: 12 }}
              labelFormatter={(_, p) => { const d = p?.[0]?.payload as typeof chart[number] | undefined; return d ? `${d.name}. ${d.unit} ${d.label}${d.issued ? ' · 냄' : ''}` : ''; }}
              formatter={(v, k) => [v, BANDS.find((b) => b.key === k)?.label ?? String(k)]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(k) => BANDS.find((b) => b.key === k)?.label ?? String(k)} />
            {BANDS.map((b) => <Bar key={b.key} dataKey={b.key} stackId="s" fill={b.color} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => void replan('preview')} disabled={busy != null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-content-secondary transition-colors hover:border-white/20 hover:text-content-primary disabled:opacity-40"
          title="문제은행이 자란 뒤 안 낸 회차를 새 공급으로 다시 잡습니다. 낸 회차는 그대로.">
          {busy === 'preview' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} 다시 계획 미리보기
        </button>
        {preview && (
          <>
            <span className="text-xs text-content-secondary">
              안 낸 회차 <b className="tabular-nums">{preview.summary.before.pending}</b> → <b className="tabular-nums">{preview.summary.after.pending}</b>
              {' · '}전체 <b className="tabular-nums">{preview.summary.after.total}</b>회차 · 문항 <b className="tabular-nums">{preview.summary.problems}</b>
              {preview.summary.short > 0 && <> · 부족 {preview.summary.short}</>}
            </span>
            <button onClick={() => { if (confirm('안 낸 회차를 지우고 다시 만듭니다. 낸 회차·과제는 그대로입니다.')) void replan('replan'); }} disabled={busy != null}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-40">
              {busy === 'replan' ? '적용 중' : '적용'}
            </button>
            <button onClick={() => setPreview(null)} className="text-xs text-content-muted hover:text-content-primary">취소</button>
          </>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
    </div>
  );
}
