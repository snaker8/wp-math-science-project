'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  listActiveClasses, getClassEnrollments, createClass,
  listTeachers, getCurrentProfile, deleteClass, getStudentNameMap,
  type TeacherProfile,
} from '../lib/queries-class';
import type { ClassRoom, Enrollment } from '../lib/types-class';
import { STAGE_LABEL, STAGE_COLOR, WEEKDAY_LABEL_KO } from '../lib/types-class';

interface ClassWithEnrolls {
  klass: ClassRoom;
  enrolls: Enrollment[];
}

export default function ClassesPage() {
  const [rows, setRows] = useState<ClassWithEnrolls[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());

  const teacherMap = new Map(teachers.map((t) => [t.user_id, t.display_name]));

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [classes, prof, ts] = await Promise.all([
        listActiveClasses(),
        getCurrentProfile(),
        listTeachers(),
      ]);
      setProfile(prof);
      setTeachers(ts);
      const enriched = await Promise.all(
        classes.map(async (c) => ({
          klass: c,
          enrolls: await getClassEnrollments(c.id),
        })),
      );
      setRows(enriched);
      // 학생 이름 매핑 (student_id = users.id UUID)
      const allIds = enriched.flatMap((r) => r.enrolls.map((e) => e.student_id));
      setNameMap(await getStudentNameMap(allIds));
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: '2rem', flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div>
          <h2 style={h2}>반 운영</h2>
          <p style={{ color: '#7A7267', margin: '0.25rem 0 0 0' }}>
            동시 입장 · 1:1 코칭 슬롯 분배 (5~10분)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          style={primaryBtn}
        >
          {showForm ? '취소' : '+ 새 반'}
        </button>
      </div>

      {showForm && (
        <NewClassForm
          teachers={teachers}
          currentUserId={profile?.user_id ?? null}
          onCreated={async () => { setShowForm(false); await reload(); }}
        />
      )}

      {loading && <div style={muted}>불러오는 중…</div>}
      {error && (
        <div style={{ ...emptyState, color: '#B44641' }}>
          데이터 로딩 실패: {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div style={emptyState}>
          아직 등록된 반이 없습니다. 위 "+ 새 반" 버튼으로 시작하세요.
        </div>
      )}

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {rows.map(({ klass, enrolls }) => (
          <ClassRow key={klass.id} klass={klass} enrolls={enrolls}
            teacherMap={teacherMap} nameMap={nameMap} onDeleted={reload} />
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// 새 반 추가 폼
// ──────────────────────────────────────────────────
function NewClassForm({
  teachers, currentUserId, onCreated,
}: {
  teachers: TeacherProfile[];
  currentUserId: string | null;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [campus, setCampus] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]);
  const [startTime, setStartTime] = useState('20:35');
  const [durationMin, setDurationMin] = useState(80);
  const [capacity, setCapacity] = useState(7);
  const [stageMin, setStageMin] = useState(1);
  const [stageMax, setStageMax] = useState(5);
  const [homeroomId, setHomeroomId] = useState<string>(currentUserId ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggleWeekday = (d: number) => {
    setWeekdays((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d].sort());
  };

  const save = async () => {
    if (!name.trim()) { setErr('반 이름을 입력하세요'); return; }
    if (weekdays.length === 0) { setErr('요일을 1개 이상 선택하세요'); return; }
    setSaving(true); setErr(null);
    try {
      await createClass({
        name: name.trim(),
        campus: campus.trim() || undefined,
        weekdays,
        start_time: startTime,
        duration_min: durationMin,
        capacity,
        stage_min: stageMin,
        stage_max: stageMax,
        homeroom_id: homeroomId || undefined,
      });
      onCreated();
    } catch (e) {
      setErr(formatError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: '#FFF', border: '1px solid #C8A265', padding: '1.5rem',
      borderRadius: 2, marginBottom: '1.5rem',
    }}>
      <h3 style={{ ...h3, marginBottom: '1rem' }}>새 반 추가</h3>
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Field label="반 이름">
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="예: 월수금 20:35 S2-S4" style={input} />
        </Field>
        <Field label="센터 (선택)">
          <input value={campus} onChange={(e) => setCampus(e.target.value)}
            placeholder="예: 동래센터" style={input} />
        </Field>
        <Field label="시작 시각">
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={input} />
        </Field>
        <Field label="수업 시간 (분)">
          <input type="number" value={durationMin} min={30} max={180} step={5}
            onChange={(e) => setDurationMin(Number(e.target.value))} style={input} />
        </Field>
        <Field label="정원">
          <input type="number" value={capacity} min={1} max={10}
            onChange={(e) => setCapacity(Number(e.target.value))} style={input} />
        </Field>
        <Field label="단계 범위">
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <select value={stageMin} onChange={(e) => setStageMin(Number(e.target.value))} style={{ ...input, flex: 1 }}>
              {[1,2,3,4,5].map(s => <option key={s} value={s}>S{s}</option>)}
            </select>
            <span>~</span>
            <select value={stageMax} onChange={(e) => setStageMax(Number(e.target.value))} style={{ ...input, flex: 1 }}>
              {[1,2,3,4,5].map(s => <option key={s} value={s}>S{s}</option>)}
            </select>
          </div>
        </Field>
        {teachers.length > 0 && (
          <Field label="담임">
            <select value={homeroomId} onChange={(e) => setHomeroomId(e.target.value)} style={input}>
              {teachers.map((t) => (
                <option key={t.user_id} value={t.user_id}>
                  {t.display_name}
                  {t.user_id === currentUserId ? ' — 본인' : ''}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div style={{ marginTop: '1rem' }}>
        <Label>요일</Label>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {[1,2,3,4,5,6,7].map(d => (
            <button key={d} type="button"
              onClick={() => toggleWeekday(d)}
              style={{
                padding: '0.4rem 0.7rem',
                border: '1px solid ' + (weekdays.includes(d) ? '#2B2620' : '#D8D3CA'),
                background: weekdays.includes(d) ? '#2B2620' : '#FFF',
                color: weekdays.includes(d) ? '#FAF7F2' : '#2B2620',
                cursor: 'pointer', borderRadius: 2, fontFamily: 'inherit',
              }}
            >{WEEKDAY_LABEL_KO[d]}</button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button onClick={save} disabled={saving} style={primaryBtn}>
          {saving ? '저장 중…' : '반 만들기'}
        </button>
        {err && <span style={{ color: '#B44641', fontSize: '0.85rem' }}>{err}</span>}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// 반 카드
// ──────────────────────────────────────────────────
function ClassRow({ klass, enrolls, teacherMap, nameMap, onDeleted }:
  { klass: ClassRoom; enrolls: Enrollment[]; teacherMap: Map<string, string>;
    nameMap: Map<string, string>;
    onDeleted: () => void | Promise<void>; }) {
  const startTime = klass.start_time?.slice(0, 5) ?? '';
  const endTime = addMin(startTime, klass.duration_min ?? 80);
  const careSum = enrolls.reduce((s, e) => s + Number(e.care_weight ?? 1), 0);

  const slotCards: Array<Enrollment | null> = Array.from({ length: klass.capacity }, () => null);
  enrolls
    .slice()
    .sort((a, b) => a.coaching_start_min - b.coaching_start_min)
    .forEach((e, i) => { if (i < klass.capacity) slotCards[i] = e; });

  const handleDelete = async () => {
    const confirm1 = confirm(
      `"${klass.name}" 반을 완전히 삭제하시겠습니까?\n\n` +
      `⚠ 이 작업은 되돌릴 수 없습니다.\n` +
      `반 + 학생 등록 + 모든 회차 + 출결 메모가 함께 삭제됩니다.\n` +
      `(학생별 수업 계획은 다른 반과 공유될 수 있어 보존됩니다)`
    );
    if (!confirm1) return;
    const confirm2 = prompt(`삭제 확정을 위해 반 이름을 정확히 입력하세요:\n${klass.name}`);
    if (confirm2 !== klass.name) {
      alert('반 이름 불일치 — 삭제 취소');
      return;
    }
    try {
      await deleteClass(klass.id);
      await onDeleted();
    } catch (e) {
      alert('삭제 실패: ' + formatError(e));
    }
  };

  return (
    <article style={{
      background: '#FFFFFF', border: '1px solid #E5DDD0',
      borderLeft: `3px solid ${STAGE_COLOR[klass.stage_min]}`,
      padding: '1.25rem 1.5rem', borderRadius: 2,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: '1rem',
        flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div>
          <h3 style={{ ...h3, marginBottom: '0.2rem' }}>{klass.name}</h3>
          <div style={{ fontSize: '0.8rem', color: '#7A7267' }}>
            {(klass.weekdays ?? []).map((w) => WEEKDAY_LABEL_KO[w]).join('·')}
            {' · '}{startTime}~{endTime} ({klass.duration_min}분)
            {' · '}정원 {klass.capacity}
            {' · '}<span style={{ color: STAGE_COLOR[klass.stage_min] }}>
              {STAGE_LABEL[klass.stage_min]} ~ {STAGE_LABEL[klass.stage_max]}
            </span>
            {klass.homeroom_id && (
              <> · 담임 {teacherMap.get(klass.homeroom_id) ?? '(미지정)'}</>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Link href={`/dashboard/lessons/classes/${klass.id}`} style={ghostBtn}>학생 관리</Link>
          <Link href={`/dashboard/lessons/prep/${klass.id}`} style={ghostBtn}>오늘 준비 시트 →</Link>
          <button
            type="button"
            onClick={handleDelete}
            title="반 삭제 (되돌릴 수 없음)"
            aria-label={`${klass.name} 반 삭제`}
            style={dangerBtn}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#8B2E2A';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#B44641';
            }}
          >🗑 반 삭제</button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(klass.capacity, 8)}, minmax(0, 1fr))`,
        gap: '0.5rem', marginTop: '0.5rem',
      }}>
        {slotCards.map((slot, i) => {
          if (!slot) {
            return (
              <div key={i} style={{
                padding: '0.6rem 0.5rem',
                border: '1px dashed #D8D3CA', borderRadius: 2,
                textAlign: 'center', fontSize: '0.78rem', color: '#A89F92',
                minHeight: 64, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <div>슬롯 #{i + 1}</div>
                <div style={{ fontSize: '0.7rem', marginTop: 2 }}>비어있음</div>
              </div>
            );
          }
          const coachingTime = addMin(startTime, slot.coaching_start_min);
          const coachingEnd = addMin(startTime, slot.coaching_start_min + slot.coaching_duration_min);
          return (
            <div key={i} style={{
              padding: '0.6rem 0.5rem',
              background: '#FAF7F2', border: '1px solid #E5DDD0', borderRadius: 2,
              minHeight: 64,
            }}>
              <div style={{ fontSize: '0.68rem', color: '#7A7267', letterSpacing: '0.04em' }}>
                1:1 {coachingTime}~{coachingEnd}
                <span style={{ marginLeft: 4, color: '#C8A265' }}>({slot.coaching_duration_min}분)</span>
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 500, color: '#2B2620', marginTop: 2 }}>
                {nameMap.get(slot.student_id) ?? '(이름 없음)'}
              </div>
              <div style={{ fontSize: '0.68rem', color: STAGE_COLOR[slot.stage] }}>
                S{slot.stage} · ×{slot.care_weight}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: '0.75rem', fontSize: '0.78rem', color: '#7A7267',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>등록 {enrolls.length}/{klass.capacity}</span>
        <span>
          케어 합계 {careSum.toFixed(1)} / {(klass.capacity * 1.0).toFixed(1)}
          {careSum > klass.capacity * 1.0 && (
            <span style={{ color: '#B44641', marginLeft: 4 }}>● 과부하</span>
          )}
        </span>
      </div>
    </article>
  );
}

// ──────────────────────────────────────────────────
// utils + styles
// ──────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '0.7rem', color: '#7A7267', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {children}
    </div>
  );
}

function formatError(e: unknown): string {
  if (!e) return 'unknown error';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  const obj = e as Record<string, unknown>;
  const parts = [
    obj.message,
    obj.details ? `details=${obj.details}` : null,
    obj.hint    ? `hint=${obj.hint}`       : null,
    obj.code    ? `code=${obj.code}`       : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  try { return JSON.stringify(e); } catch { return String(e); }
}

function addMin(timeStr: string, addMinutes: number): string {
  if (!timeStr) return '';
  const [hh, mm] = timeStr.split(':').map(Number);
  const total = hh * 60 + mm + addMinutes;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

const h2: React.CSSProperties = {
  fontFamily: '"Cormorant Garamond", serif',
  fontSize: '1.75rem', fontWeight: 500, margin: 0,
};
const h3: React.CSSProperties = {
  fontFamily: '"Cormorant Garamond", serif',
  fontSize: '1.2rem', fontWeight: 500, margin: 0,
};
const ghostBtn: React.CSSProperties = {
  padding: '0.5rem 1rem', background: '#FAF7F2',
  color: '#2B2620', textDecoration: 'none', fontSize: '0.8rem',
  border: '1px solid #D8D3CA', borderRadius: 2, fontFamily: 'inherit', cursor: 'pointer',
};
const dangerBtn: React.CSSProperties = {
  padding: '0.55rem 1.1rem', background: '#B44641',
  color: '#FFFFFF', fontSize: '0.85rem', fontWeight: 600,
  border: 'none', borderRadius: 2,
  cursor: 'pointer', fontFamily: 'inherit',
  letterSpacing: '0.04em',
  boxShadow: '0 1px 3px rgba(180,70,65,0.3)',
  transition: 'background 0.15s',
};
const primaryBtn: React.CSSProperties = {
  padding: '0.6rem 1.25rem', background: '#2B2620', color: '#FAF7F2',
  border: 'none', borderRadius: 2, fontSize: '0.85rem',
  letterSpacing: '0.04em', cursor: 'pointer', fontFamily: 'inherit',
};
const input: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.7rem', border: '1px solid #D8D3CA',
  borderRadius: 2, background: '#FFF', fontSize: '0.9rem',
  fontFamily: 'inherit', color: '#2B2620', boxSizing: 'border-box',
};
const emptyState: React.CSSProperties = {
  padding: '3rem 2rem', textAlign: 'center',
  background: '#FFF', border: '1px dashed #D8D3CA',
  color: '#7A7267', fontSize: '0.95rem',
};
const muted: React.CSSProperties = {
  padding: '1rem', color: '#7A7267',
};
