'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getClassPrepBrief, listActiveClasses,
  ensureMeeting, listMeetingAttendances, upsertAttendance,
  upsertLessonPlan, getStudentLessonPlan, mondayOf, weekdayOf,
} from '../../lib/queries-class';
import type {
  ClassPrepBriefRow, ClassRoom, MeetingAttendance,
} from '../../lib/types-class';
import { STAGE_LABEL, STAGE_COLOR } from '../../lib/types-class';
import {
  listUnitScoresForMeeting, listUnitScoresForMeetingAll,
  upsertUnitScore, deleteUnitScore, getMathsecrNodes,
} from '../../lib/queries-mathsecr';
import type { UnitScore, MathsecrNode } from '../../lib/types-mathsecr';
import { UnitPicker } from '../../components/UnitPicker';

type AttendanceStatus = 'present' | 'late' | 'absent' | 'makeup';

export default function ClassPrepPage() {
  const params = useParams<{ classId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const classId = params?.classId ?? '';
  const today = searchParams?.get('date') ?? new Date().toISOString().slice(0, 10);
  const isPast = today < new Date().toISOString().slice(0, 10);
  const isFuture = today > new Date().toISOString().slice(0, 10);

  const [rows, setRows] = useState<ClassPrepBriefRow[]>([]);
  const [klass, setKlass] = useState<ClassRoom | null>(null);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [attMap, setAttMap] = useState<Record<string, MeetingAttendance>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');

  // 회차 전체 단원 점수 공유 데이터 (카드 칩 + 표 그리드 공통 소스)
  const [unitScores, setUnitScores] = useState<UnitScore[]>([]);
  const [unitNodes, setUnitNodes] = useState<Record<string, MathsecrNode>>({});
  // 점수 없이 헤더에만 표시할 단원 (사용자가 picker 로 추가)
  const [extraUnitCodes, setExtraUnitCodes] = useState<string[]>([]);

  const activeUnitCodes = useMemo(() => {
    const set = new Set<string>(extraUnitCodes);
    unitScores.forEach((s) => set.add(s.mathsecr_code));
    return Array.from(set);
  }, [unitScores, extraUnitCodes]);

  const reloadUnitScores = async (mId: string | null = meetingId) => {
    if (!mId) return;
    try {
      const list = await listUnitScoresForMeetingAll(mId);
      setUnitScores(list);
      const codes = Array.from(new Set([
        ...list.map((s) => s.mathsecr_code),
        ...extraUnitCodes,
      ]));
      if (codes.length === 0) { setUnitNodes({}); return; }
      const nodes = await getMathsecrNodes(codes);
      setUnitNodes(Object.fromEntries(nodes.map((n) => [n.code, n])));
    } catch {
      // RLS 등 — 조용히 무시 (개별 카드도 동일 패턴)
    }
  };

  const addActiveUnit = async (code: string) => {
    if (activeUnitCodes.includes(code)) return;
    setExtraUnitCodes((arr) => [...arr, code]);
    try {
      const [node] = await getMathsecrNodes([code]);
      if (node) setUnitNodes((m) => ({ ...m, [code]: node }));
    } catch { /* ignore */ }
  };

  const removeActiveUnit = (code: string) => {
    // 점수가 있는 단원은 셀 삭제 후에만 제거 가능
    if (unitScores.some((s) => s.mathsecr_code === code)) {
      alert('이 단원에 점수가 입력된 학생이 있습니다.\n셀의 "제거"로 모두 지운 뒤 다시 시도하세요.');
      return;
    }
    setExtraUnitCodes((arr) => arr.filter((c) => c !== code));
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('prep_view_mode');
    if (saved === 'card' || saved === 'table') setViewMode(saved);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('prep_view_mode', viewMode);
  }, [viewMode]);

  const reload = async () => {
    if (!classId) return;
    setLoading(true);
    setError(null);
    try {
      const [r, all, meeting] = await Promise.all([
        getClassPrepBrief(classId),
        listActiveClasses(),
        ensureMeeting(classId, today),
      ]);
      setRows(r);
      setKlass(all.find((c) => c.id === classId) ?? null);
      setMeetingId(meeting.id);
      const [attendances, scores] = await Promise.all([
        listMeetingAttendances(meeting.id),
        listUnitScoresForMeetingAll(meeting.id),
      ]);
      setAttMap(Object.fromEntries(attendances.map((a) => [a.student_id, a])));
      setUnitScores(scores);
      const codes = Array.from(new Set(scores.map((s) => s.mathsecr_code)));
      if (codes.length > 0) {
        const nodes = await getMathsecrNodes(codes);
        setUnitNodes(Object.fromEntries(nodes.map((n) => [n.code, n])));
      } else {
        setUnitNodes({});
      }
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setExtraUnitCodes([]);
    reload();
    /* eslint-disable-next-line */
  }, [classId, today]);

  if (loading) return <div style={{ color: '#7A7267' }}>불러오는 중…</div>;
  if (error)  return <div style={{ color: '#B44641' }}>로딩 실패: {error}</div>;
  if (!klass) {
    return (
      <div>
        <div style={{ color: '#B44641', marginBottom: '1rem' }}>
          해당 반을 찾을 수 없습니다 ({classId}).
        </div>
        <Link href="/dashboard/lessons/classes" style={{ color: '#C8A265' }}>← 반 운영으로</Link>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div>
        <h2 style={h2}>{klass.name}</h2>
        <p style={{ color: '#7A7267', marginTop: '1rem' }}>
          이 반에 등록된 학생이 없습니다.{' '}
          <Link href={`/dashboard/lessons/classes/${klass.id}`} style={{ color: '#C8A265' }}>
            학생 등록 →
          </Link>
        </p>
      </div>
    );
  }

  const startTime = klass.start_time?.slice(0, 5) ?? '00:00';
  const totalMin = klass.duration_min ?? 80;
  const endTime = addMin(startTime, totalMin);
  const todayWeekday = weekdayOf(today);
  const isClassDay = (klass.weekdays ?? []).includes(todayWeekday);

  return (
    <div>
      <div style={{
        marginBottom: '2rem', display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap',
      }}>
        <div>
          <h2 style={h2}>
            {klass.name}
            {isPast && (
              <span style={{
                marginLeft: '0.75rem', fontSize: '0.78rem',
                padding: '0.2rem 0.5rem', background: '#F0EAE0',
                color: '#7A7267', verticalAlign: 'middle', borderRadius: 2,
              }}>지나간 회차</span>
            )}
            {isFuture && (
              <span style={{
                marginLeft: '0.75rem', fontSize: '0.78rem',
                padding: '0.2rem 0.5rem', background: '#FFF',
                color: '#C8A265', border: '1px solid #C8A265',
                verticalAlign: 'middle', borderRadius: 2,
              }}>예정 회차</span>
            )}
          </h2>
          <div style={{ fontSize: '0.85rem', color: '#7A7267', marginTop: '0.25rem',
                        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* 날짜 셀렉터 */}
            <input
              type="date"
              value={today}
              onChange={(e) => {
                const d = e.target.value;
                if (d) router.push(`/dashboard/lessons/prep/${classId}?date=${d}`);
              }}
              style={{
                padding: '0.25rem 0.5rem', border: '1px solid #D8D3CA',
                borderRadius: 2, fontSize: '0.85rem', fontFamily: 'inherit',
                background: '#FFF', color: '#2B2620',
              }}
            />
            <button
              type="button"
              onClick={() => router.push(`/dashboard/lessons/prep/${classId}`)}
              style={{
                padding: '0.25rem 0.6rem', border: '1px solid #D8D3CA',
                background: today === new Date().toISOString().slice(0,10) ? '#2B2620' : '#FFF',
                color: today === new Date().toISOString().slice(0,10) ? '#FAF7F2' : '#2B2620',
                borderRadius: 2, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >오늘</button>
            <span>· {klass.campus} · {startTime}~{endTime}
            ({totalMin}분) · 정원 {klass.capacity} · 등록 {rows.length}</span>
            <span style={{ color: '#C8A265' }}>
              {STAGE_LABEL[klass.stage_min]} ~ {STAGE_LABEL[klass.stage_max]}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href={`/dashboard/lessons/classes/${klass.id}/history`} style={ghostBtn}>회차 이력</Link>
          <Link href={`/dashboard/lessons/classes/${klass.id}`} style={ghostBtn}>학생 관리</Link>
          <Link href="/dashboard/lessons/classes" style={ghostBtn}>← 반 운영</Link>
          <button type="button" onClick={() => window.print()} style={ghostBtn}>인쇄</button>
        </div>
      </div>

      {!isClassDay && (
        <div style={{
          marginBottom: '1.5rem', padding: '0.75rem 1rem',
          background: '#FFF8E5', border: '1px solid #C8A265',
          color: '#7A5A1F', fontSize: '0.85rem', borderRadius: 2,
        }}>
          ⚠ <strong>{today}</strong> 은(는) 이 반의 정규 수업일이 아닙니다 (
          {(klass.weekdays ?? []).map((w) => ['','월','화','수','목','금','토','일'][w]).join('·')}
          ). 보강이거나 임시 회차이면 그대로 진행, 아니면 헤더 날짜 셀렉터를 정규일로 바꾸세요.
        </div>
      )}

      <section style={{ ...card, marginBottom: '2rem' }}>
        <h3 style={h3}>1:1 코칭 분배 타임라인</h3>
        <p style={helperText}>
          모두 같은 시각 입장 후 자기 페이스. 담임은 학생별 5~10분 1:1 코칭만 분배.
        </p>
        <Timeline rows={rows} startTime={startTime} totalMin={totalMin} />
      </section>

      <section>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem',
        }}>
          <h3 style={h3}>학생별 준비 시트 + 입력</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
            <BulkPresentButton
              meetingId={meetingId}
              rows={rows}
              attMap={attMap}
              onDone={reload}
            />
          </div>
        </div>

        {viewMode === 'table' ? (
          <>
            <AttendanceTable
              rows={rows}
              meetingId={meetingId}
              attMap={attMap}
              onSaved={reload}
            />
            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={h3}>단원별 점수 그리드</h3>
              <p style={helperText}>
                상단에서 단원을 선택 → 각 셀에 점수 입력 (포커스 해제 시 자동 저장).
              </p>
              <UnitScoreGrid
                rows={rows}
                meetingId={meetingId}
                unitScores={unitScores}
                unitNodes={unitNodes}
                activeUnitCodes={activeUnitCodes}
                onAddUnit={addActiveUnit}
                onRemoveUnit={removeActiveUnit}
                onChanged={() => reloadUnitScores(meetingId)}
              />
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
            {rows.map((r) => (
              <StudentCard
                key={r.student_id} row={r} startTime={startTime}
                meetingId={meetingId}
                meetDate={today}
                attendance={attMap[r.student_id] ?? null}
                meetingUnits={activeUnitCodes
                  .map((c) => unitNodes[c])
                  .filter((n): n is MathsecrNode => Boolean(n))}
                onUnitsChanged={() => reloadUnitScores(meetingId)}
                onSaved={reload}
              />
            ))}
          </div>
        )}
      </section>

      <div style={{
        marginTop: '3rem', fontSize: '0.7rem', color: '#A89F92',
        borderTop: '1px solid #E5DDD0', paddingTop: '0.75rem',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>과사람 담임 운영 · 수업 준비 시트</span>
        <span suppressHydrationWarning>생성: {new Date().toLocaleString('ko-KR')}</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// 타임라인
// ──────────────────────────────────────────────────
function Timeline({ rows, startTime, totalMin }:
  { rows: ClassPrepBriefRow[]; startTime: string; totalMin: number }) {
  const pxPerMin = 9;
  const totalWidth = totalMin * pxPerMin;
  const tickEvery = 10;

  return (
    <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
      <div style={{ position: 'relative', width: totalWidth + 110, paddingLeft: 110 }}>
        <div style={{ position: 'relative', height: 24, marginBottom: 8 }}>
          {Array.from({ length: Math.floor(totalMin / tickEvery) + 1 }).map((_, i) => {
            const t = i * tickEvery;
            return (
              <div key={i} style={{
                position: 'absolute', left: t * pxPerMin, top: 0,
                fontSize: '0.7rem', color: '#7A7267', borderLeft: '1px solid #E5DDD0',
                height: 24, paddingLeft: 4,
              }}>
                {addMin(startTime, t)}
              </div>
            );
          })}
        </div>

        {rows.map((r, idx) => {
          const stageColor = STAGE_COLOR[r.stage] || '#C8A265';
          const coachingDur = r.coaching_duration_min || 5;
          return (
            <div key={r.student_id} style={{
              position: 'relative', height: 44, marginBottom: 4,
              borderTop: idx === 0 ? '1px solid #E5DDD0' : 'none',
              borderBottom: '1px solid #E5DDD0',
            }}>
              <div style={{
                position: 'absolute', left: -110, top: 6, width: 105,
                fontSize: '0.82rem', textAlign: 'right', paddingRight: 8,
              }}>
                <strong>{r.student_name || '(이름 없음)'}</strong>
                <div style={{ fontSize: '0.68rem', color: stageColor }}>
                  S{r.stage} · ×{r.care_weight}
                </div>
              </div>

              {/* 자기풀이 */}
              <div style={{
                position: 'absolute', top: 6, left: 0, width: totalMin * pxPerMin, height: 32,
                background: '#F5EFE3', border: '1px dashed #C8A265',
              }} />

              {/* 1:1 코칭 */}
              <div style={{
                position: 'absolute', top: 6,
                left: r.coaching_start_min * pxPerMin,
                width: coachingDur * pxPerMin, height: 32,
                background: '#C8A265', color: '#FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.7rem', letterSpacing: '0.05em', fontWeight: 500,
              }}>
                1:1 {coachingDur}분
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// 학생 카드 (인터랙티브)
// ──────────────────────────────────────────────────
function StudentCard({
  row, startTime, meetingId, meetDate, attendance,
  meetingUnits, onUnitsChanged, onSaved,
}: {
  row: ClassPrepBriefRow;
  startTime: string;
  meetingId: string | null;
  meetDate: string;
  attendance: MeetingAttendance | null;
  meetingUnits: MathsecrNode[];
  onUnitsChanged: () => void;
  onSaved: () => void;
}) {
  const stageColor = STAGE_COLOR[row.stage] || '#C8A265';
  const coachingDur = row.coaching_duration_min || 5;
  const coachingFromTime = addMin(startTime, row.coaching_start_min);
  const coachingToTime = addMin(startTime, row.coaching_start_min + coachingDur);

  // lesson_plan: 보고 있는 날짜의 주 월요일 기준 (덮어쓰기 방지)
  const weekStart = useMemo(() => mondayOf(meetDate), [meetDate]);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [targetUnits, setTargetUnits] = useState<string>('');  // 콤마 구분 텍스트
  const [planGoals, setPlanGoals] = useState('');
  const [planNotes, setPlanNotes] = useState('');
  const [planSaving, setPlanSaving] = useState(false);
  const [planMsg, setPlanMsg] = useState<string | null>(null);

  // attendance
  const [attStatus, setAttStatus] = useState<AttendanceStatus>(attendance?.attendance ?? 'present');
  const [attNote, setAttNote] = useState(attendance?.homeroom_note ?? '');
  const [attSaving, setAttSaving] = useState(false);
  const [attMsg, setAttMsg] = useState<string | null>(null);

  useEffect(() => {
    setAttStatus(attendance?.attendance ?? 'present');
    setAttNote(attendance?.homeroom_note ?? '');
  }, [attendance]);

  // 최초 lesson_plan 로드 (latest_plan 이 이번 주일 수도 있고 아닐 수도)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lp = await getStudentLessonPlan(row.student_id, weekStart);
        if (cancelled) return;
        if (lp) {
          setTargetUnits((lp.target_units ?? []).join(', '));
          setPlanGoals(lp.goals ?? '');
          setPlanNotes(lp.notes ?? '');
        } else if (row.latest_plan) {
          // fallback: 이전 주 plan 표시 (수정 시 새 row 생성됨)
          setTargetUnits((row.latest_plan.target_units ?? []).join(', '));
          setPlanGoals(row.latest_plan.goals ?? '');
          setPlanNotes(row.latest_plan.notes ?? '');
        }
        setPlanLoaded(true);
      } catch {
        setPlanLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [row.student_id, weekStart, row.latest_plan]);

  const savePlan = async () => {
    setPlanSaving(true); setPlanMsg(null);
    try {
      const units = targetUnits.split(',').map((s) => s.trim()).filter(Boolean);
      await upsertLessonPlan({
        student_id: row.student_id,
        week_start: weekStart,
        target_units: units,
        goals: planGoals || null,
        notes: planNotes || null,
      });
      setPlanMsg('저장됨 ✓');
      setTimeout(() => setPlanMsg(null), 2000);
    } catch (e) {
      setPlanMsg('실패: ' + formatError(e));
    } finally {
      setPlanSaving(false);
    }
  };

  // 출결·메모 저장 — status/note 인자 받음 (즉시 저장용)
  const saveAttendance = async (status?: AttendanceStatus, note?: string | null) => {
    if (!meetingId) return;
    setAttSaving(true); setAttMsg(null);
    try {
      await upsertAttendance({
        meeting_id: meetingId,
        student_id: row.student_id,
        attendance: status ?? attStatus,
        homeroom_note: note !== undefined ? note : (attNote || null),
      });
      setAttMsg('저장됨 ✓');
      setTimeout(() => { setAttMsg(null); onSaved(); }, 1000);
    } catch (e) {
      setAttMsg('실패: ' + formatError(e));
    } finally {
      setAttSaving(false);
    }
  };

  // 출결 버튼 클릭 = 즉시 저장
  const handleAttClick = async (s: AttendanceStatus) => {
    setAttStatus(s);
    await saveAttendance(s, undefined);
  };

  // 메모 입력 후 포커스 해제 = 자동 저장
  const handleNoteBlur = async () => {
    if (!meetingId) return;
    // 기존 값과 동일하면 저장 생략
    if ((attendance?.homeroom_note ?? '') === attNote) return;
    await saveAttendance(undefined, attNote || null);
  };

  return (
    <article style={{
      background: '#FFFFFF', border: '1px solid #E5DDD0',
      borderLeft: `3px solid ${stageColor}`,
      padding: '1.25rem 1.5rem', borderRadius: 2,
      pageBreakInside: 'avoid',
    }}>
      <header style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem',
      }}>
        <div>
          <strong style={{ fontSize: '1.1rem', letterSpacing: '0.02em', color: '#2B2620' }}>
            {row.student_name || '(이름 없음)'}
          </strong>
          <span style={{
            marginLeft: '0.75rem', fontSize: '0.78rem',
            color: stageColor, letterSpacing: '0.05em',
          }}>
            {STAGE_LABEL[row.stage]} · 케어 ×{row.care_weight}
          </span>
        </div>
        <div style={{
          fontSize: '0.78rem', color: '#7A7267',
          fontFamily: '"Cormorant Garamond", serif',
        }}>
          1:1 코칭 {coachingFromTime}~{coachingToTime}{' '}
          <span style={{ color: '#C8A265' }}>({coachingDur}분)</span>
        </div>
      </header>

      {/* lesson_plan 입력 */}
      <div style={{ marginTop: '1rem', borderTop: '1px solid #F0EAE0', paddingTop: '0.75rem' }}>
        <Label>이번 주 수업 계획 ({weekStart} 기준)</Label>
        <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.4rem' }}>
          <div>
            <span style={subLabel}>오늘 타겟 단원 (콤마로 구분)</span>
            <input
              value={targetUnits}
              onChange={(e) => setTargetUnits(e.target.value)}
              placeholder="일차함수의 그래프, 기울기와 절편"
              style={input}
              disabled={!planLoaded}
            />
          </div>
          <div>
            <span style={subLabel}>주간 목표</span>
            <input
              value={planGoals}
              onChange={(e) => setPlanGoals(e.target.value)}
              placeholder="일차함수 그래프와 기울기·절편 안정화"
              style={input}
              disabled={!planLoaded}
            />
          </div>
          <div>
            <span style={subLabel}>1:1 코칭 키 포인트 ({coachingDur}분 안에)</span>
            <textarea
              value={planNotes}
              onChange={(e) => setPlanNotes(e.target.value)}
              placeholder="기울기 = (y증가량)/(x증가량). 부호 헷갈림 주의"
              style={{ ...input, minHeight: 50, resize: 'vertical', fontFamily: 'inherit' }}
              disabled={!planLoaded}
            />
          </div>
        </div>
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={savePlan} disabled={planSaving || !planLoaded} style={smallBtn}>
            {planSaving ? '저장 중…' : '계획 저장'}
          </button>
          {planMsg && (
            <span style={{ fontSize: '0.78rem',
              color: planMsg.startsWith('저장됨') ? '#4A7C59' : '#B44641' }}>
              {planMsg}
            </span>
          )}
        </div>
      </div>

      {/* 단원별 점수 입력 (mathsecr 기반) */}
      <div style={{ marginTop: '1rem', borderTop: '1px solid #F0EAE0', paddingTop: '0.75rem' }}>
        <Label>오늘 단원별 점수</Label>
        <UnitScorePanel
          meetingId={meetingId}
          studentId={row.student_id}
          meetingUnits={meetingUnits}
          onUnitsChanged={onUnitsChanged}
        />
      </div>

      {/* 출결 + 메모 입력 */}
      <div style={{ marginTop: '1rem', borderTop: '1px solid #F0EAE0', paddingTop: '0.75rem' }}>
        <Label>오늘 출결 + 수업 후 메모</Label>
        <div style={{
          marginTop: '0.4rem',
          display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem',
        }}>
          <div>
            <span style={subLabel}>출결</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
              {(['present','late','absent','makeup'] as AttendanceStatus[]).map((s) => (
                <button key={s} type="button"
                  onClick={() => handleAttClick(s)}
                  disabled={attSaving}
                  style={{
                    padding: '0.4rem 0.6rem', fontSize: '0.78rem',
                    border: '1px solid ' + (attStatus === s ? '#2B2620' : '#D8D3CA'),
                    background: attStatus === s ? '#2B2620' : '#FFF',
                    color: attStatus === s ? '#FAF7F2' : '#2B2620',
                    cursor: 'pointer', borderRadius: 2, fontFamily: 'inherit',
                  }}
                >{
                  s === 'present' ? '출석' :
                  s === 'late'    ? '지각' :
                  s === 'absent'  ? '결석' : '보강'
                }</button>
              ))}
            </div>
          </div>
          <div>
            <span style={subLabel}>수업 후 메모 <span style={{ color: '#A89F92', fontWeight: 400 }}>(입력 후 다른 곳 클릭하면 자동 저장)</span></span>
            <textarea
              value={attNote}
              onChange={(e) => setAttNote(e.target.value)}
              onBlur={handleNoteBlur}
              placeholder="오늘 막힌 부분, 다음 회차 메모…"
              style={{ ...input, minHeight: 50, resize: 'vertical', fontFamily: 'inherit', marginTop: 4 }}
            />
          </div>
        </div>
        {attMsg && (
          <div style={{ marginTop: '0.4rem', fontSize: '0.78rem',
            color: attMsg.startsWith('저장됨') ? '#4A7C59' : '#B44641' }}>
            {attMsg}
          </div>
        )}
      </div>
    </article>
  );
}

// ──────────────────────────────────────────────────
// utils + styles
// ──────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────
// 뷰 모드 토글 (카드 / 표)
// ──────────────────────────────────────────────────────────────
function ViewModeToggle({ value, onChange }:
  { value: 'card' | 'table'; onChange: (v: 'card' | 'table') => void }) {
  const baseStyle: React.CSSProperties = {
    padding: '0.35rem 0.7rem', fontSize: '0.78rem', cursor: 'pointer',
    fontFamily: 'inherit', border: '1px solid #D8D3CA',
  };
  return (
    <div style={{ display: 'inline-flex', borderRadius: 2, overflow: 'hidden' }}>
      <button type="button" onClick={() => onChange('card')}
        style={{
          ...baseStyle,
          background: value === 'card' ? '#2B2620' : '#FFF',
          color: value === 'card' ? '#FAF7F2' : '#2B2620',
          borderRight: 'none',
        }}>카드</button>
      <button type="button" onClick={() => onChange('table')}
        style={{
          ...baseStyle,
          background: value === 'table' ? '#2B2620' : '#FFF',
          color: value === 'table' ? '#FAF7F2' : '#2B2620',
        }}>표</button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 출석 표 모드 — 전원 출결+메모를 한 화면에서 빠르게 입력
// ──────────────────────────────────────────────────────────────
function AttendanceTable({
  rows, meetingId, attMap, onSaved,
}: {
  rows: ClassPrepBriefRow[];
  meetingId: string | null;
  attMap: Record<string, MeetingAttendance>;
  onSaved: () => void;
}) {
  return (
    <div style={{
      marginTop: '1rem', background: '#FFFFFF',
      border: '1px solid #E5DDD0', borderRadius: 2,
      overflowX: 'auto',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{
            background: '#FAF7F2',
            color: '#7A7267', fontSize: '0.72rem',
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            <th style={thStyle}>학생</th>
            <th style={{ ...thStyle, width: 90 }}>단계 / 케어</th>
            <th style={{ ...thStyle, width: 270 }}>출결</th>
            <th style={thStyle}>수업 후 메모</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <AttendanceTableRow
              key={r.student_id}
              row={r}
              meetingId={meetingId}
              attendance={attMap[r.student_id] ?? null}
              onSaved={onSaved}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttendanceTableRow({
  row, meetingId, attendance, onSaved,
}: {
  row: ClassPrepBriefRow;
  meetingId: string | null;
  attendance: MeetingAttendance | null;
  onSaved: () => void;
}) {
  const stageColor = STAGE_COLOR[row.stage] || '#C8A265';
  const [attStatus, setAttStatus] = useState<AttendanceStatus>(attendance?.attendance ?? 'present');
  const [attNote, setAttNote] = useState(attendance?.homeroom_note ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // 행별 "저장 안 됨" 상태: attendance 가 아직 한 번도 저장된 적 없으면 강조
  const untouched = !attendance;

  useEffect(() => {
    setAttStatus(attendance?.attendance ?? 'present');
    setAttNote(attendance?.homeroom_note ?? '');
  }, [attendance]);

  const save = async (status?: AttendanceStatus, note?: string | null) => {
    if (!meetingId) return;
    setSaving(true); setMsg(null);
    try {
      await upsertAttendance({
        meeting_id: meetingId,
        student_id: row.student_id,
        attendance: status ?? attStatus,
        homeroom_note: note !== undefined ? note : (attNote || null),
      });
      setMsg('✓');
      setTimeout(() => { setMsg(null); onSaved(); }, 800);
    } catch (e) {
      setMsg('실패: ' + formatError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleAttClick = async (s: AttendanceStatus) => {
    setAttStatus(s);
    await save(s, undefined);
  };

  const handleNoteBlur = async () => {
    if (!meetingId) return;
    if ((attendance?.homeroom_note ?? '') === attNote) return;
    await save(undefined, attNote || null);
  };

  return (
    <tr style={{
      borderTop: '1px solid #F0EAE0',
      background: untouched ? '#FFFBF2' : '#FFF',
    }}>
      <td style={{ ...tdStyle, borderLeft: `3px solid ${stageColor}` }}>
        <span style={{ color: '#2B2620', fontWeight: 500 }}>
          {row.student_name || '(이름 없음)'}
        </span>
      </td>
      <td style={{ ...tdStyle, fontSize: '0.78rem', color: stageColor }}>
        {STAGE_LABEL[row.stage]}
        <span style={{ color: '#A89F92', marginLeft: 4 }}>×{row.care_weight}</span>
      </td>
      <td style={tdStyle}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(['present','late','absent','makeup'] as AttendanceStatus[]).map((s) => (
            <button key={s} type="button"
              onClick={() => handleAttClick(s)}
              disabled={saving}
              style={{
                padding: '0.3rem 0.55rem', fontSize: '0.78rem',
                border: '1px solid ' + (attStatus === s ? '#2B2620' : '#D8D3CA'),
                background: attStatus === s ? '#2B2620' : '#FFF',
                color: attStatus === s ? '#FAF7F2' : '#2B2620',
                cursor: 'pointer', borderRadius: 2, fontFamily: 'inherit',
                minWidth: 44,
              }}
            >{
              s === 'present' ? '출석' :
              s === 'late'    ? '지각' :
              s === 'absent'  ? '결석' : '보강'
            }</button>
          ))}
          {msg && (
            <span style={{
              fontSize: '0.78rem', alignSelf: 'center', marginLeft: 4,
              color: msg.startsWith('실패') ? '#B44641' : '#4A7C59',
            }}>{msg}</span>
          )}
        </div>
      </td>
      <td style={tdStyle}>
        <input
          value={attNote}
          onChange={(e) => setAttNote(e.target.value)}
          onBlur={handleNoteBlur}
          placeholder="오늘 막힌 부분, 다음 회차 메모…"
          style={{
            width: '100%', padding: '0.35rem 0.55rem', border: '1px solid #D8D3CA',
            borderRadius: 2, background: '#FFF', fontSize: '0.82rem',
            fontFamily: 'inherit', color: '#2B2620', boxSizing: 'border-box',
          }}
        />
      </td>
    </tr>
  );
}

const thStyle: React.CSSProperties = {
  padding: '0.55rem 0.75rem', textAlign: 'left',
  borderBottom: '1px solid #E5DDD0', fontWeight: 500,
};
const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem', verticalAlign: 'middle',
};

// ──────────────────────────────────────────────────────────────
// 단원별 점수 그리드 (표 모드)
// ──────────────────────────────────────────────────────────────
function UnitScoreGrid({
  rows, meetingId, unitScores, unitNodes, activeUnitCodes,
  onAddUnit, onRemoveUnit, onChanged,
}: {
  rows: ClassPrepBriefRow[];
  meetingId: string | null;
  unitScores: UnitScore[];
  unitNodes: Record<string, MathsecrNode>;
  activeUnitCodes: string[];
  onAddUnit: (code: string) => void;
  onRemoveUnit: (code: string) => void;
  onChanged: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const [pickedNode, setPickedNode] = useState<MathsecrNode | null>(null);

  // (studentId, code) → score
  const scoresIndex = useMemo(() => {
    const m = new Map<string, number>();
    unitScores.forEach((s) => { m.set(`${s.student_id}|${s.mathsecr_code}`, s.score); });
    return m;
  }, [unitScores]);

  const confirmAdd = () => {
    if (!pickedCode) return;
    onAddUnit(pickedCode);
    setShowPicker(false);
    setPickedCode(null); setPickedNode(null);
  };

  return (
    <div style={{
      marginTop: '0.75rem', background: '#FFFFFF',
      border: '1px solid #E5DDD0', borderRadius: 2,
    }}>
      <div style={{
        padding: '0.5rem 0.75rem', borderBottom: '1px solid #E5DDD0',
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        background: '#FAF7F2',
      }}>
        <span style={{ fontSize: '0.72rem', color: '#7A7267',
          letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          이번 회차 단원
        </span>
        {activeUnitCodes.length === 0 && (
          <span style={{ fontSize: '0.78rem', color: '#A89F92' }}>
            아직 단원이 없습니다. "+ 단원 추가"로 시작하세요.
          </span>
        )}
        {!showPicker && (
          <button type="button" onClick={() => setShowPicker(true)}
            style={{
              marginLeft: 'auto', padding: '0.3rem 0.7rem',
              background: '#FFF', border: '1px solid #C8A265', color: '#C8A265',
              borderRadius: 2, fontSize: '0.78rem', cursor: 'pointer',
              fontFamily: 'inherit',
            }}>+ 단원 추가</button>
        )}
      </div>

      {showPicker && (
        <div style={{
          padding: '0.75rem', borderBottom: '1px solid #E5DDD0',
          background: '#FAF7F2',
        }}>
          <UnitPicker
            value={pickedCode}
            onChange={(code, node) => { setPickedCode(code); setPickedNode(node); }}
            maxDepth={3}
          />
          {pickedNode && (
            <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#7A7267' }}>
              선택: <strong style={{ color: '#2B2620' }}>{pickedNode.full_path}</strong>
            </div>
          )}
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: 8 }}>
            <button type="button" onClick={confirmAdd} disabled={!pickedCode}
              style={{
                padding: '0.35rem 0.8rem', background: '#2B2620', color: '#FAF7F2',
                border: 'none', borderRadius: 2, fontSize: '0.78rem',
                cursor: 'pointer', fontFamily: 'inherit',
                opacity: pickedCode ? 1 : 0.5,
              }}>단원 추가</button>
            <button type="button"
              onClick={() => { setShowPicker(false); setPickedCode(null); setPickedNode(null); }}
              style={{
                padding: '0.35rem 0.8rem', background: '#FFF', color: '#2B2620',
                border: '1px solid #D8D3CA', borderRadius: 2, fontSize: '0.78rem',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>취소</button>
          </div>
        </div>
      )}

      {activeUnitCodes.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{
                background: '#FFF', color: '#7A7267',
                fontSize: '0.7rem', letterSpacing: '0.06em',
              }}>
                <th style={{ ...thStyle, minWidth: 130, position: 'sticky', left: 0, background: '#FFF', zIndex: 1 }}>
                  학생
                </th>
                {activeUnitCodes.map((code) => {
                  const node = unitNodes[code];
                  const label = node ? (node.level2_name || node.level1_name || node.full_path || code) : code;
                  return (
                    <th key={code} style={{ ...thStyle, minWidth: 110, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.78rem', color: '#2B2620', fontWeight: 500 }}>
                        {label}
                      </div>
                      {node?.full_path && node.full_path !== label && (
                        <div style={{ fontSize: '0.62rem', color: '#A89F92', fontWeight: 400, marginTop: 1 }}>
                          {node.full_path}
                        </div>
                      )}
                      <button type="button"
                        onClick={() => onRemoveUnit(code)}
                        title="단원 제거 (점수 입력 셀이 모두 비어있을 때만)"
                        style={{
                          marginTop: 4, border: 'none', background: 'transparent',
                          color: '#B44641', cursor: 'pointer', fontSize: '0.7rem',
                          padding: 0,
                        }}>제거</button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.student_id} style={{ borderTop: '1px solid #F0EAE0' }}>
                  <td style={{
                    ...tdStyle, position: 'sticky', left: 0, background: '#FFF',
                    borderLeft: `3px solid ${STAGE_COLOR[r.stage] || '#C8A265'}`,
                  }}>
                    <div style={{ fontWeight: 500 }}>{r.student_name || '(이름 없음)'}</div>
                  </td>
                  {activeUnitCodes.map((code) => (
                    <td key={code} style={{ ...tdStyle, textAlign: 'center' }}>
                      <ScoreCell
                        meetingId={meetingId}
                        studentId={r.student_id}
                        code={code}
                        existing={scoresIndex.get(`${r.student_id}|${code}`)}
                        onChanged={onChanged}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// 그리드 셀 — 비어있으면 점수 미입력, 숫자 입력 후 blur 시 upsert.
// 입력을 비우고 blur 하면 기존 점수가 있을 경우 삭제.
function ScoreCell({
  meetingId, studentId, code, existing, onChanged,
}: {
  meetingId: string | null;
  studentId: string;
  code: string;
  existing: number | undefined;
  onChanged: () => void;
}) {
  const [text, setText] = useState(existing == null ? '' : String(existing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setText(existing == null ? '' : String(existing));
  }, [existing]);

  const handleBlur = async () => {
    if (!meetingId) return;
    const trimmed = text.trim();
    // 비어있고 기존 점수 없음 → no-op
    if (trimmed === '' && existing == null) return;
    // 비어있고 기존 점수 있음 → 삭제
    if (trimmed === '') {
      setSaving(true); setError(false);
      try {
        await deleteUnitScore({ meeting_id: meetingId, student_id: studentId, mathsecr_code: code });
        onChanged();
      } catch {
        setError(true);
      } finally {
        setSaving(false);
      }
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setError(true);
      return;
    }
    if (existing != null && n === existing) return; // 값 동일 → 저장 생략
    setSaving(true); setError(false);
    try {
      await upsertUnitScore({
        meeting_id: meetingId, student_id: studentId,
        mathsecr_code: code, score: n,
      });
      onChanged();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.currentTarget as HTMLInputElement).blur();
    }
  };

  const n = Number(text);
  const color =
    text === '' ? '#D8D3CA' :
    error ? '#B44641' :
    n >= 80 ? '#4A7C59' :
    n >= 60 ? '#C8A265' : '#B44641';

  return (
    <input
      type="number" min={0} max={100} value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={saving}
      placeholder="-"
      style={{
        width: 56, padding: '0.25rem 0.4rem',
        border: `1px solid ${color}`, borderRadius: 2,
        fontSize: '0.85rem', textAlign: 'center',
        color: text === '' ? '#A89F92' : color,
        fontWeight: text === '' ? 400 : 500,
        fontFamily: 'inherit', background: '#FFF',
      }}
    />
  );
}

// ──────────────────────────────────────────────────────────────
// "전원 출석" 일괄 버튼 — 미입력 학생들을 present 로 일괄 처리
// ──────────────────────────────────────────────────────────────
function BulkPresentButton({
  meetingId, rows, attMap, onDone,
}: {
  meetingId: string | null;
  rows: ClassPrepBriefRow[];
  attMap: Record<string, MeetingAttendance>;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 미입력 학생 수 (출결 아직 한 번도 저장 안 된 학생)
  const pendingCount = rows.filter((r) => !attMap[r.student_id]).length;

  const handle = async () => {
    if (!meetingId) return;
    if (pendingCount === 0) {
      if (!confirm('이미 모두 출결 입력됨. 모든 학생을 출석으로 덮어쓸까요?')) return;
    }
    setBusy(true); setMsg(null);
    try {
      // 모든 학생 → present 로 upsert (메모 보존)
      await Promise.all(rows.map((r) => upsertAttendance({
        meeting_id: meetingId,
        student_id: r.student_id,
        attendance: 'present',
        homeroom_note: attMap[r.student_id]?.homeroom_note ?? null,
      })));
      setMsg('전원 출석 처리됨 ✓');
      setTimeout(() => { setMsg(null); onDone(); }, 800);
    } catch (e) {
      setMsg('실패: ' + formatError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      {msg && (
        <span style={{ fontSize: '0.78rem',
          color: msg.startsWith('전원') ? '#4A7C59' : '#B44641' }}>{msg}</span>
      )}
      <button onClick={handle} disabled={busy || !meetingId}
        style={{
          padding: '0.4rem 0.8rem', background: '#4A7C59', color: '#FFF',
          border: 'none', borderRadius: 2, fontSize: '0.78rem',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>
        {busy ? '처리 중…'
          : pendingCount > 0 ? `전원 출석 처리 (미입력 ${pendingCount}명)`
          : '전원 출석 처리'}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// 단원별 점수 입력 패널
// ──────────────────────────────────────────────────────────────
function UnitScorePanel({
  meetingId, studentId, meetingUnits, onUnitsChanged,
}: {
  meetingId: string | null;
  studentId: string;
  meetingUnits: MathsecrNode[];
  onUnitsChanged: () => void;
}) {
  const [scores, setScores] = useState<UnitScore[]>([]);
  const [unitNames, setUnitNames] = useState<Record<string, MathsecrNode>>({});
  const [showPicker, setShowPicker] = useState(false);
  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const [pickedNode, setPickedNode] = useState<MathsecrNode | null>(null);
  const [pickedScore, setPickedScore] = useState(80);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = async () => {
    if (!meetingId) return;
    try {
      const list = await listUnitScoresForMeeting(meetingId, studentId);
      setScores(list);
      const codes = list.map((s) => s.mathsecr_code);
      if (codes.length > 0) {
        const nodes = await getMathsecrNodes(codes);
        const m: Record<string, MathsecrNode> = {};
        nodes.forEach((n) => { m[n.code] = n; });
        setUnitNames(m);
      } else {
        setUnitNames({});
      }
    } catch {
      // RLS 등 에러 시 빈 상태로
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [meetingId, studentId]);

  // 이번 회차에 활성화된 단원 중, 이 학생이 아직 입력하지 않은 단원 → 칩으로 노출
  const scoredCodes = new Set(scores.map((s) => s.mathsecr_code));
  const suggestUnits = meetingUnits.filter((n) => !scoredCodes.has(n.code));

  const addFromChip = async (code: string) => {
    if (!meetingId) return;
    try {
      await upsertUnitScore({
        meeting_id: meetingId, student_id: studentId,
        mathsecr_code: code, score: 80,
      });
      await reload();
      onUnitsChanged();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setMsg('실패: ' + m);
      setTimeout(() => setMsg(null), 2000);
    }
  };

  if (!meetingId) {
    return <p style={{ fontSize: '0.78rem', color: '#A89F92', marginTop: 4 }}>회차 정보 로딩 중…</p>;
  }

  const addScore = async () => {
    if (!pickedCode) { setMsg('단원을 선택하세요'); return; }
    setSaving(true); setMsg(null);
    try {
      await upsertUnitScore({
        meeting_id: meetingId,
        student_id: studentId,
        mathsecr_code: pickedCode,
        score: pickedScore,
      });
      setShowPicker(false);
      setPickedCode(null); setPickedNode(null); setPickedScore(80);
      await reload();
      onUnitsChanged();
      setMsg('저장됨 ✓');
      setTimeout(() => setMsg(null), 1500);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      setMsg('실패: ' + m);
    } finally {
      setSaving(false);
    }
  };

  const updateScore = async (code: string, score: number) => {
    try {
      await upsertUnitScore({
        meeting_id: meetingId, student_id: studentId,
        mathsecr_code: code, score,
      });
      await reload();
      onUnitsChanged();
    } catch {
      // ignore
    }
  };

  const removeScore = async (code: string) => {
    try {
      await deleteUnitScore({ meeting_id: meetingId, student_id: studentId, mathsecr_code: code });
      await reload();
      onUnitsChanged();
    } catch {
      // ignore
    }
  };

  return (
    <div style={{ marginTop: '0.4rem' }}>
      {scores.length === 0 && !showPicker && suggestUnits.length === 0 && (
        <p style={{ fontSize: '0.78rem', color: '#A89F92', margin: 0 }}>
          (아직 점수 입력 없음)
        </p>
      )}

      {suggestUnits.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          marginBottom: scores.length > 0 ? '0.5rem' : 0,
        }}>
          <span style={{ fontSize: '0.7rem', color: '#A89F92', alignSelf: 'center' }}>
            이번 회차 단원:
          </span>
          {suggestUnits.map((n) => (
            <button key={n.code} type="button"
              onClick={() => addFromChip(n.code)}
              title={`${n.full_path || n.code} — 클릭 시 80점으로 추가`}
              style={{
                padding: '0.25rem 0.6rem', fontSize: '0.75rem',
                background: '#FAF7F2', color: '#7A5A1F',
                border: '1px solid #C8A265', borderRadius: 12,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
              + {n.level2_name || n.level1_name || n.code}
            </button>
          ))}
        </div>
      )}

      {scores.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <tbody>
            {scores.map((s) => {
              const node = unitNames[s.mathsecr_code];
              const label = node ? (node.full_path || node.level2_name || node.level1_name || s.mathsecr_code) : s.mathsecr_code;
              const color =
                s.score >= 80 ? '#4A7C59' :
                s.score >= 60 ? '#C8A265' : '#B44641';
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid #F0EAE0' }}>
                  <td style={{ padding: '0.3rem 0', color: '#2B2620' }}>{label}</td>
                  <td style={{ padding: '0.3rem 0', width: 90 }}>
                    <input
                      type="number" min={0} max={100} value={s.score}
                      onChange={(e) => updateScore(s.mathsecr_code, Number(e.target.value))}
                      style={{
                        width: 56, padding: '0.2rem 0.4rem', border: `1px solid ${color}`,
                        borderRadius: 2, fontSize: '0.85rem', color, fontWeight: 500,
                        textAlign: 'right',
                      }}
                    />
                    <span style={{ fontSize: '0.7rem', color: '#A89F92', marginLeft: 4 }}>점</span>
                  </td>
                  <td style={{ padding: '0.3rem 0', width: 40, textAlign: 'right' }}>
                    <button onClick={() => removeScore(s.mathsecr_code)}
                      style={{
                        border: 'none', background: 'transparent', color: '#B44641',
                        cursor: 'pointer', fontSize: '0.78rem',
                      }}>제거</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {showPicker ? (
        <div style={{
          marginTop: '0.5rem', padding: '0.6rem', background: '#FAF7F2',
          border: '1px dashed #C8A265', borderRadius: 2,
        }}>
          <UnitPicker
            value={pickedCode}
            onChange={(code, node) => { setPickedCode(code); setPickedNode(node); }}
            maxDepth={3}
          />
          {pickedNode && (
            <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#7A7267' }}>
              선택: <strong style={{ color: '#2B2620' }}>{pickedNode.full_path}</strong>
            </div>
          )}
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.78rem', color: '#7A7267' }}>점수</label>
            <input type="number" min={0} max={100} value={pickedScore}
              onChange={(e) => setPickedScore(Number(e.target.value))}
              style={{
                width: 64, padding: '0.3rem 0.5rem', border: '1px solid #D8D3CA',
                borderRadius: 2, fontSize: '0.85rem',
              }} />
            <button onClick={addScore} disabled={saving || !pickedCode}
              style={{
                padding: '0.4rem 0.8rem', background: '#2B2620', color: '#FAF7F2',
                border: 'none', borderRadius: 2, fontSize: '0.78rem',
                cursor: 'pointer',
              }}>
              {saving ? '저장 중…' : '추가'}
            </button>
            <button onClick={() => { setShowPicker(false); setPickedCode(null); setPickedNode(null); }}
              style={{
                padding: '0.4rem 0.8rem', background: '#FFF', color: '#2B2620',
                border: '1px solid #D8D3CA', borderRadius: 2, fontSize: '0.78rem',
                cursor: 'pointer',
              }}>
              취소
            </button>
            {msg && <span style={{ fontSize: '0.78rem',
              color: msg.startsWith('저장됨') ? '#4A7C59' : '#B44641' }}>{msg}</span>}
          </div>
        </div>
      ) : (
        <button onClick={() => setShowPicker(true)}
          style={{
            marginTop: '0.4rem', padding: '0.35rem 0.7rem',
            background: '#FFF', border: '1px solid #C8A265', color: '#C8A265',
            borderRadius: 2, fontSize: '0.78rem', cursor: 'pointer',
          }}>
          + 단원 점수 추가
        </button>
      )}
      {msg && !showPicker && (
        <span style={{ fontSize: '0.78rem', marginLeft: 8,
          color: msg.startsWith('저장됨') ? '#4A7C59' : '#B44641' }}>{msg}</span>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '0.7rem', color: '#7A7267',
      letterSpacing: '0.08em', textTransform: 'uppercase',
    }}>
      {children}
    </div>
  );
}

function addMin(timeStr: string, addMinutes: number): string {
  if (!timeStr) return '';
  const [hh, mm] = timeStr.split(':').map(Number);
  const total = hh * 60 + mm + addMinutes;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
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

const h2: React.CSSProperties = {
  fontFamily: '"Cormorant Garamond", serif',
  fontSize: '1.75rem', fontWeight: 500, margin: 0, letterSpacing: '0.02em',
};
const h3: React.CSSProperties = {
  fontFamily: '"Cormorant Garamond", serif',
  fontSize: '1.25rem', fontWeight: 500, margin: 0,
};
const card: React.CSSProperties = {
  background: '#FFFFFF', border: '1px solid #E5DDD0',
  padding: '1.5rem', borderRadius: 2,
};
const helperText: React.CSSProperties = {
  fontSize: '0.8rem', color: '#7A7267', margin: '0.25rem 0 0 0',
};
const ghostBtn: React.CSSProperties = {
  padding: '0.5rem 1rem', background: '#FAF7F2',
  color: '#2B2620', textDecoration: 'none', fontSize: '0.8rem',
  border: '1px solid #D8D3CA', borderRadius: 2, fontFamily: 'inherit', cursor: 'pointer',
};
const smallBtn: React.CSSProperties = {
  padding: '0.4rem 0.8rem', background: '#2B2620', color: '#FAF7F2',
  border: 'none', borderRadius: 2, fontSize: '0.78rem',
  cursor: 'pointer', fontFamily: 'inherit',
};
const input: React.CSSProperties = {
  width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #D8D3CA',
  borderRadius: 2, background: '#FFF', fontSize: '0.85rem',
  fontFamily: 'inherit', color: '#2B2620', boxSizing: 'border-box',
};
const subLabel: React.CSSProperties = {
  display: 'block', fontSize: '0.7rem', color: '#A89F92', marginBottom: 2,
};
