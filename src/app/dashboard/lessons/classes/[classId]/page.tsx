'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getClass, getClassEnrollments, createEnrollment, updateEnrollment, endEnrollment,
  updateClass, listTeachers, getCurrentProfile, deactivateClass, deleteClass,
  listStudents, getStudentNameMap,
  type TeacherProfile, type StudentOption,
} from '../../lib/queries-class';
import type { ClassRoom, Enrollment } from '../../lib/types-class';
import { STAGE_LABEL, STAGE_COLOR, WEEKDAY_LABEL_KO } from '../../lib/types-class';

export default function ClassDetailPage() {
  const params = useParams<{ classId: string }>();
  const classId = params?.classId ?? '';

  const [klass, setKlass] = useState<ClassRoom | null>(null);
  const [enrolls, setEnrolls] = useState<Enrollment[]>([]);
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditClass, setShowEditClass] = useState(false);

  const reload = async () => {
    if (!classId) return;
    setLoading(true);
    setError(null);
    try {
      const [k, es, prof, ts, ss] = await Promise.all([
        getClass(classId),
        getClassEnrollments(classId),
        getCurrentProfile(),
        listTeachers(),
        listStudents(),
      ]);
      setProfile(prof);
      setTeachers(ts);
      setStudents(ss);
      setKlass(k);
      setEnrolls(es);
      setNameMap(await getStudentNameMap(es.map((e) => e.student_id)));
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [classId]);

  if (loading) return <div style={{ color: '#7A7267' }}>불러오는 중…</div>;
  if (error) return <div style={{ color: '#B44641' }}>로딩 실패: {error}</div>;
  if (!klass) {
    return (
      <div>
        <div style={{ color: '#B44641', marginBottom: '1rem' }}>해당 반을 찾을 수 없습니다.</div>
        <Link href="/dashboard/lessons/classes" style={{ color: '#C8A265' }}>← 반 운영으로</Link>
      </div>
    );
  }

  const startTime = klass.start_time?.slice(0, 5) ?? '';
  const endTime = addMin(startTime, klass.duration_min);

  // 사용 중인 슬롯 (5분 단위, [start, end))
  const usedRanges = enrolls.map((e) => ({
    from: e.coaching_start_min,
    to: e.coaching_start_min + e.coaching_duration_min,
  }));

  const enrolledIds = new Set(enrolls.map((e) => e.student_id));

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem',
      }}>
        <div>
          <h2 style={h2}>{klass.name}</h2>
          <div style={{ fontSize: '0.85rem', color: '#7A7267', marginTop: '0.25rem' }}>
            {(klass.weekdays ?? []).map((w) => WEEKDAY_LABEL_KO[w]).join('·')}
            {' · '}{startTime}~{endTime} ({klass.duration_min}분) · 정원 {klass.capacity}
            <span style={{ marginLeft: '0.75rem', color: '#C8A265' }}>
              {STAGE_LABEL[klass.stage_min]} ~ {STAGE_LABEL[klass.stage_max]}
            </span>
            {klass.homeroom_id && (
              <span style={{ marginLeft: '0.5rem' }}>
                · 담임 {teachers.find((t) => t.user_id === klass.homeroom_id)?.display_name ?? '(미지정)'}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href="/dashboard/lessons/classes" style={ghostBtn}>← 반 운영</Link>
          <Link href={`/dashboard/lessons/classes/${klass.id}/history`} style={ghostBtn}>회차 이력</Link>
          <button type="button" onClick={() => setShowEditClass((v) => !v)} style={ghostBtn}>
            {showEditClass ? '편집 취소' : '반 편집'}
          </button>
          <Link href={`/dashboard/lessons/prep/${klass.id}`} style={ghostBtn}>오늘 준비 시트 →</Link>
        </div>
      </div>

      {showEditClass && (
        <EditClassForm
          klass={klass}
          isAdmin={profile?.role === 'admin'}
          teachers={teachers}
          onSaved={async () => { setShowEditClass(false); await reload(); }}
          onDeactivated={async () => {
            setShowEditClass(false);
            // 비활성화 후 목록으로 이동
            window.location.href = '/dashboard/lessons/classes';
          }}
        />
      )}

      <section style={card}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', marginBottom: '1rem',
        }}>
          <h3 style={h3}>등록 학생 ({enrolls.length}/{klass.capacity})</h3>
          {enrolls.length < klass.capacity ? (
            <button type="button" onClick={() => setShowAddForm((v) => !v)} style={primaryBtn}>
              {showAddForm ? '취소' : '+ 학생 등록'}
            </button>
          ) : (
            <div style={{ fontSize: '0.78rem', color: '#B44641', textAlign: 'right' }}>
              정원 가득 ({klass.capacity}명).<br />
              위 <strong>"반 편집"</strong> 에서 정원을 늘리거나 기존 학생을 제거하세요.
            </div>
          )}
        </div>

        {showAddForm && (
          <NewEnrollmentForm
            classId={klass.id}
            startTime={startTime}
            durationMin={klass.duration_min}
            usedRanges={usedRanges}
            students={students.filter((s) => !enrolledIds.has(s.id))}
            onCreated={async () => { setShowAddForm(false); await reload(); }}
          />
        )}

        {enrolls.length === 0 ? (
          <div style={{ ...emptyState, marginTop: '1rem' }}>
            아직 등록된 학생이 없습니다. 위 "+ 학생 등록" 버튼으로 시작하세요.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
            <thead>
              <tr>
                <th style={th}>이름</th>
                <th style={th}>1:1 시간</th>
                <th style={th}>슬롯</th>
                <th style={th}>단계</th>
                <th style={th}>케어</th>
                <th style={th}>비고</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {enrolls.map((e) => (
                <EnrollmentRow
                  key={e.id} enrollment={e}
                  studentName={nameMap.get(e.student_id) ?? null}
                  startTime={startTime} durationMin={klass.duration_min}
                  usedRanges={usedRanges.filter((r) =>
                    !(r.from === e.coaching_start_min &&
                      r.to === e.coaching_start_min + e.coaching_duration_min))}
                  onChanged={reload}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ──────────────────────────────────────────────────
// 반 편집 폼 (이름·시간·정원·담임 변경 + 비활성화)
// ──────────────────────────────────────────────────
function EditClassForm({
  klass, isAdmin, teachers, onSaved, onDeactivated,
}: {
  klass: ClassRoom;
  isAdmin: boolean;
  teachers: TeacherProfile[];
  onSaved: () => void;
  onDeactivated: () => void;
}) {
  const [name, setName] = useState(klass.name);
  const [startTime, setStartTime] = useState((klass.start_time ?? '20:35:00').slice(0, 5));
  const [durationMin, setDurationMin] = useState<number>(klass.duration_min);
  const [capacity, setCapacity] = useState<number>(klass.capacity);
  const [stageMin, setStageMin] = useState<number>(klass.stage_min);
  const [stageMax, setStageMax] = useState<number>(klass.stage_max);
  const [weekdays, setWeekdays] = useState<number[]>(klass.weekdays ?? []);
  const [homeroomId, setHomeroomId] = useState<string>(klass.homeroom_id ?? '');
  const [campus, setCampus] = useState(klass.campus ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggleWeekday = (d: number) => {
    setWeekdays((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d].sort());
  };

  const save = async () => {
    if (!name.trim()) { setErr('반 이름을 입력하세요'); return; }
    if (weekdays.length === 0) { setErr('요일을 1개 이상 선택하세요'); return; }
    if (stageMin > stageMax) { setErr('단계 범위가 잘못됨 (min > max)'); return; }
    setSaving(true); setErr(null);
    try {
      await updateClass(klass.id, {
        name: name.trim(),
        campus,
        weekdays,
        start_time: startTime + ':00',
        duration_min: durationMin,
        capacity,
        stage_min: stageMin,
        stage_max: stageMax,
        // 담임 변경은 admin 만 (UI 에서 가려져 있어도 안전을 위해 다시 체크)
        ...(isAdmin && homeroomId ? { homeroom_id: homeroomId } : {}),
      });
      onSaved();
    } catch (e) {
      setErr(formatError(e));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!confirm(`"${klass.name}" 반을 비활성화하시겠습니까?\n(데이터는 보존되지만 목록에서 사라집니다.)`)) return;
    try {
      await deactivateClass(klass.id);
      onDeactivated();
    } catch (e) {
      alert('비활성화 실패: ' + formatError(e));
    }
  };

  const hardDelete = async () => {
    const confirm1 = confirm(
      `"${klass.name}" 반을 완전히 삭제하시겠습니까?\n\n` +
      `⚠ 이 작업은 되돌릴 수 없습니다.\n` +
      `반 + 학생 등록 + 모든 회차 + 출결 메모가 함께 삭제됩니다.\n` +
      `(학생별 수업 계획은 다른 반과 공유될 수 있어 보존됩니다)`
    );
    if (!confirm1) return;
    const confirm2 = prompt(
      `삭제 확정을 위해 반 이름을 정확히 입력하세요:\n${klass.name}`
    );
    if (confirm2 !== klass.name) {
      alert('반 이름 불일치 — 삭제 취소');
      return;
    }
    try {
      await deleteClass(klass.id);
      onDeactivated();  // 같은 동작 (목록으로)
    } catch (e) {
      alert('삭제 실패: ' + formatError(e));
    }
  };

  return (
    <div style={{
      background: '#FFF', border: '1px solid #C8A265', padding: '1.25rem 1.5rem',
      borderRadius: 2, marginBottom: '1.5rem',
    }}>
      <h3 style={{ ...h3, marginBottom: '1rem' }}>반 편집</h3>
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <FieldS label="반 이름">
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputS} />
        </FieldS>
        <FieldS label="센터">
          <input value={campus} onChange={(e) => setCampus(e.target.value)} style={inputS} />
        </FieldS>
        <FieldS label="시작 시각">
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputS} />
        </FieldS>
        <FieldS label="수업 시간(분)">
          <input type="number" value={durationMin} min={30} max={180} step={5}
            onChange={(e) => setDurationMin(Number(e.target.value))} style={inputS} />
        </FieldS>
        <FieldS label="정원">
          <input type="number" value={capacity} min={1} max={10}
            onChange={(e) => setCapacity(Number(e.target.value))} style={inputS} />
        </FieldS>
        <FieldS label="단계 범위">
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <select value={stageMin} onChange={(e) => setStageMin(Number(e.target.value))} style={{ ...inputS, flex: 1 }}>
              {[1,2,3,4,5].map(s => <option key={s} value={s}>S{s}</option>)}
            </select>
            <span>~</span>
            <select value={stageMax} onChange={(e) => setStageMax(Number(e.target.value))} style={{ ...inputS, flex: 1 }}>
              {[1,2,3,4,5].map(s => <option key={s} value={s}>S{s}</option>)}
            </select>
          </div>
        </FieldS>
        <FieldS label="담임">
          <select value={homeroomId} onChange={(e) => setHomeroomId(e.target.value)} style={inputS}>
            <option value="">(미지정)</option>
            {teachers.map((t) => (
              <option key={t.user_id} value={t.user_id}>
                {t.display_name}
              </option>
            ))}
          </select>
        </FieldS>
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <span style={{ fontSize: '0.7rem', color: '#7A7267', letterSpacing: '0.06em', textTransform: 'uppercase' }}>요일</span>
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

      <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={saving} style={primaryBtn}>
          {saving ? '저장 중…' : '저장'}
        </button>
        <button onClick={deactivate} style={{ ...primaryBtn, background: '#FFF', color: '#7A7267', border: '1px solid #D8D3CA' }}>
          비활성화 (보존)
        </button>
        <button onClick={hardDelete} style={{ ...primaryBtn, background: '#B44641', color: '#FFF' }}>
          완전 삭제
        </button>
        {err && <span style={{ color: '#B44641', fontSize: '0.85rem' }}>{err}</span>}
      </div>
    </div>
  );
}

function FieldS({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span style={{ fontSize: '0.7rem', color: '#7A7267', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  );
}

const inputS: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.7rem', border: '1px solid #D8D3CA',
  borderRadius: 2, background: '#FFF', fontSize: '0.9rem',
  fontFamily: 'inherit', color: '#2B2620', boxSizing: 'border-box',
};

// ──────────────────────────────────────────────────
// 새 학생 등록 폼 — 학생은 users(role=STUDENT) 드롭다운에서 선택 (UUID)
// ──────────────────────────────────────────────────
function NewEnrollmentForm({
  classId, startTime, durationMin, usedRanges, students, onCreated,
}: {
  classId: string;
  startTime: string;
  durationMin: number;
  usedRanges: Array<{ from: number; to: number }>;
  students: StudentOption[];
  onCreated: () => void;
}) {
  const [studentId, setStudentId] = useState('');
  const [coachingDuration, setCoachingDuration] = useState<5 | 10>(5);
  const [coachingStart, setCoachingStart] = useState<number | null>(null);
  const [stage, setStage] = useState(2);
  const [careWeight, setCareWeight] = useState(1.0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 가능한 시작 분 (5분 단위, 슬롯 길이 만큼 빈 자리)
  const validStarts: number[] = [];
  for (let m = 0; m + coachingDuration <= durationMin; m += 5) {
    const conflict = usedRanges.some((r) => m < r.to && m + coachingDuration > r.from);
    if (!conflict) validStarts.push(m);
  }

  // duration 바뀌면 현재 선택값 검증
  useEffect(() => {
    if (coachingStart !== null && !validStarts.includes(coachingStart)) {
      setCoachingStart(validStarts[0] ?? null);
    } else if (coachingStart === null && validStarts.length > 0) {
      setCoachingStart(validStarts[0]);
    }
  // eslint-disable-next-line
  }, [coachingDuration]);

  const save = async () => {
    if (!studentId) { setErr('학생을 선택하세요'); return; }
    if (coachingStart === null) { setErr('1:1 시작 시각을 선택하세요'); return; }
    setSaving(true); setErr(null);
    try {
      await createEnrollment({
        student_id: studentId,
        class_id: classId,
        coaching_start_min: coachingStart,
        coaching_duration_min: coachingDuration,
        stage,
        care_weight: careWeight,
        note: note.trim() || null,
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
      background: '#FAF7F2', border: '1px solid #C8A265', padding: '1rem',
      borderRadius: 2, marginBottom: '1rem',
    }}>
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Field label="학생">
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={input}>
            <option value="">학생 선택</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}{s.grade != null ? ` (${s.grade}학년)` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="슬롯 길이">
          <select value={coachingDuration}
            onChange={(e) => setCoachingDuration(Number(e.target.value) as 5 | 10)} style={input}>
            <option value={5}>5분</option>
            <option value={10}>10분</option>
          </select>
        </Field>
        <Field label="1:1 시작 시각">
          <select value={coachingStart ?? ''}
            onChange={(e) => setCoachingStart(Number(e.target.value))} style={input}>
            {validStarts.length === 0 && <option value="">빈 슬롯 없음</option>}
            {validStarts.map((m) => (
              <option key={m} value={m}>
                +{m}분 ({addMin(startTime, m)} ~ {addMin(startTime, m + coachingDuration)})
              </option>
            ))}
          </select>
        </Field>
        <Field label="단계">
          <select value={stage} onChange={(e) => setStage(Number(e.target.value))} style={input}>
            {[1,2,3,4,5].map(s => <option key={s} value={s}>S{s} - {STAGE_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="케어 가중치">
          <select value={careWeight} onChange={(e) => setCareWeight(Number(e.target.value))} style={input}>
            <option value={0.5}>0.5 (자기주도)</option>
            <option value={1.0}>1.0 (보통)</option>
            <option value={1.5}>1.5 (집중케어)</option>
            <option value={2.0}>2.0 (고집중케어)</option>
          </select>
        </Field>
        <Field label="비고">
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="문장제 약함 등" style={input} />
        </Field>
      </div>
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button onClick={save} disabled={saving || validStarts.length === 0} style={primaryBtn}>
          {saving ? '저장 중…' : '등록'}
        </button>
        {err && <span style={{ color: '#B44641', fontSize: '0.85rem' }}>{err}</span>}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// 학생 등록 행 (인라인 편집/삭제) — 이름은 users 조회 (읽기 전용)
// ──────────────────────────────────────────────────
function EnrollmentRow({
  enrollment, studentName, startTime, durationMin, usedRanges, onChanged,
}: {
  enrollment: Enrollment;
  studentName: string | null;
  startTime: string;
  durationMin: number;
  usedRanges: Array<{ from: number; to: number }>;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [coachingStart, setCoachingStart] = useState<number>(enrollment.coaching_start_min);
  const [coachingDuration, setCoachingDuration] = useState<number>(enrollment.coaching_duration_min);
  const [stage, setStage] = useState<number>(enrollment.stage);
  const [careWeight, setCareWeight] = useState<number>(enrollment.care_weight);
  const [note, setNote] = useState(enrollment.note ?? '');
  const [saving, setSaving] = useState(false);

  const validStarts: number[] = [];
  for (let m = 0; m + coachingDuration <= durationMin; m += 5) {
    const conflict = usedRanges.some((r) => m < r.to && m + coachingDuration > r.from);
    if (!conflict) validStarts.push(m);
  }

  const save = async () => {
    setSaving(true);
    try {
      await updateEnrollment(enrollment.id, {
        coaching_start_min: coachingStart,
        coaching_duration_min: coachingDuration as 5 | 10,
        stage: stage as 1 | 2 | 3 | 4 | 5,
        care_weight: careWeight,
        note: note.trim() || null,
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      alert('수정 실패: ' + formatError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`${studentName ?? '해당 학생'} 등록을 종료하시겠습니까?`)) return;
    try {
      await endEnrollment(enrollment.id);
      onChanged();
    } catch (e) {
      alert('종료 실패: ' + formatError(e));
    }
  };

  if (!editing) {
    return (
      <tr>
        <td style={{ ...td, fontWeight: 500 }}>
          {studentName || <span style={{ color: '#A89F92' }}>(이름 없음)</span>}
        </td>
        <td style={td}>
          {addMin(startTime, enrollment.coaching_start_min)} ~
          {addMin(startTime, enrollment.coaching_start_min + enrollment.coaching_duration_min)}
        </td>
        <td style={td}>{enrollment.coaching_duration_min}분</td>
        <td style={{ ...td, color: STAGE_COLOR[enrollment.stage] }}>S{enrollment.stage}</td>
        <td style={td}>×{enrollment.care_weight}</td>
        <td style={{ ...td, fontSize: '0.8rem', color: '#7A7267' }}>{enrollment.note ?? '-'}</td>
        <td style={{ ...td, textAlign: 'right' }}>
          <button onClick={() => setEditing(true)} style={{ ...smallBtn, marginLeft: 4 }}>편집</button>
          <button onClick={remove} style={{ ...smallBtn, color: '#B44641', marginLeft: 4 }}>제거</button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td style={{ ...td, fontWeight: 500 }}>
        {studentName || <span style={{ color: '#A89F92' }}>(이름 없음)</span>}
      </td>
      <td style={td}>
        <select value={coachingStart} onChange={(e) => setCoachingStart(Number(e.target.value))} style={inputSm}>
          {validStarts.map((m) => (
            <option key={m} value={m}>{addMin(startTime, m)}</option>
          ))}
        </select>
      </td>
      <td style={td}>
        <select value={coachingDuration} onChange={(e) => setCoachingDuration(Number(e.target.value) as 5 | 10)} style={inputSm}>
          <option value={5}>5분</option>
          <option value={10}>10분</option>
        </select>
      </td>
      <td style={td}>
        <select value={stage} onChange={(e) => setStage(Number(e.target.value))} style={inputSm}>
          {[1,2,3,4,5].map(s => <option key={s} value={s}>S{s}</option>)}
        </select>
      </td>
      <td style={td}>
        <select value={careWeight} onChange={(e) => setCareWeight(Number(e.target.value))} style={inputSm}>
          <option value={0.5}>×0.5</option>
          <option value={1.0}>×1.0</option>
          <option value={1.5}>×1.5</option>
          <option value={2.0}>×2.0</option>
        </select>
      </td>
      <td style={td}>
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputSm} />
      </td>
      <td style={{ ...td, textAlign: 'right' }}>
        <button onClick={save} disabled={saving} style={smallBtn}>{saving ? '...' : '저장'}</button>
        <button onClick={() => setEditing(false)} style={{ ...smallBtn, marginLeft: 4 }}>취소</button>
      </td>
    </tr>
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
const card: React.CSSProperties = {
  background: '#FFF', border: '1px solid #E5DDD0', padding: '1.5rem', borderRadius: 2,
};
const ghostBtn: React.CSSProperties = {
  padding: '0.5rem 1rem', background: '#FAF7F2',
  color: '#2B2620', textDecoration: 'none', fontSize: '0.8rem',
  border: '1px solid #D8D3CA', borderRadius: 2, fontFamily: 'inherit', cursor: 'pointer',
};
const primaryBtn: React.CSSProperties = {
  padding: '0.6rem 1.25rem', background: '#2B2620', color: '#FAF7F2',
  border: 'none', borderRadius: 2, fontSize: '0.85rem',
  letterSpacing: '0.04em', cursor: 'pointer', fontFamily: 'inherit',
};
const smallBtn: React.CSSProperties = {
  padding: '0.3rem 0.6rem', background: '#FFF', border: '1px solid #D8D3CA',
  borderRadius: 2, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
};
const input: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.7rem', border: '1px solid #D8D3CA',
  borderRadius: 2, background: '#FFF', fontSize: '0.9rem',
  fontFamily: 'inherit', color: '#2B2620', boxSizing: 'border-box',
};
const inputSm: React.CSSProperties = {
  width: '100%', padding: '0.3rem 0.4rem', border: '1px solid #D8D3CA',
  borderRadius: 2, background: '#FFF', fontSize: '0.8rem',
  fontFamily: 'inherit', color: '#2B2620', boxSizing: 'border-box',
};
const th: React.CSSProperties = {
  textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '1px solid #E5DDD0',
  fontSize: '0.75rem', color: '#7A7267', letterSpacing: '0.05em', fontWeight: 500,
};
const td: React.CSSProperties = {
  padding: '0.5rem 0.75rem', borderBottom: '1px solid #F0EAE0',
  fontSize: '0.85rem', verticalAlign: 'middle',
};
const emptyState: React.CSSProperties = {
  padding: '2rem', textAlign: 'center', background: '#FAF7F2',
  border: '1px dashed #D8D3CA', color: '#7A7267', fontSize: '0.9rem',
};
