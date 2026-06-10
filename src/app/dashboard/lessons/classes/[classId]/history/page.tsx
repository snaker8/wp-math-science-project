'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getClass, getClassEnrollments, getClassMeetings, deleteMeeting, getStudentNameMap,
  type ClassMeetingHistoryRow,
} from '../../../lib/queries-class';
import type { ClassRoom, Enrollment } from '../../../lib/types-class';
import { STAGE_LABEL, WEEKDAY_LABEL_KO } from '../../../lib/types-class';

export default function ClassHistoryPage() {
  const params = useParams<{ classId: string }>();
  const classId = params?.classId ?? '';

  const [klass, setKlass] = useState<ClassRoom | null>(null);
  const [enrolls, setEnrolls] = useState<Enrollment[]>([]);
  const [meetings, setMeetings] = useState<ClassMeetingHistoryRow[]>([]);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    if (!classId) return;
    setLoading(true); setError(null);
    try {
      const [k, es, ms] = await Promise.all([
        getClass(classId),
        getClassEnrollments(classId),
        getClassMeetings(classId, 60),
      ]);
      setKlass(k);
      setEnrolls(es);
      setMeetings(ms);
      // 학생 이름 매핑 — 현재 등록 + 과거 출결의 student_id 모두 (UUID → users.full_name)
      const ids = [
        ...es.map((e) => e.student_id),
        ...ms.flatMap((m) => (m.diag_meeting_attendances ?? []).map((a) => a.student_id)),
      ];
      setNameMap(await getStudentNameMap(ids));
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

  // 통계: 회차별 출석률 + 학생별 출석률
  const totalMeetings = meetings.length;
  let totalSlots = 0, presentCount = 0;
  const perStudent: Record<string, { present: number; late: number; absent: number; makeup: number }> = {};
  enrolls.forEach((e) => {
    perStudent[e.student_id] = { present: 0, late: 0, absent: 0, makeup: 0 };
  });
  meetings.forEach((m) => {
    m.diag_meeting_attendances?.forEach((a) => {
      totalSlots += 1;
      if (a.attendance === 'present') presentCount += 1;
      const bucket = perStudent[a.student_id];
      if (bucket) bucket[a.attendance] = (bucket[a.attendance] ?? 0) + 1;
    });
  });
  const overallAttRate = totalSlots > 0 ? presentCount / totalSlots : 0;

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem',
      }}>
        <div>
          <h2 style={h2}>{klass.name} <span style={{ color: '#A89F92', fontSize: '1rem' }}>· 회차 이력</span></h2>
          <div style={{ fontSize: '0.85rem', color: '#7A7267', marginTop: '0.25rem' }}>
            {(klass.weekdays ?? []).map((w) => WEEKDAY_LABEL_KO[w]).join('·')}
            {' · '}{startTime}~{endTime} · 정원 {klass.capacity}
            <span style={{ marginLeft: '0.75rem', color: '#C8A265' }}>
              {STAGE_LABEL[klass.stage_min]} ~ {STAGE_LABEL[klass.stage_max]}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href={`/dashboard/lessons/classes/${klass.id}`} style={ghostBtn}>← 학생 관리</Link>
          <Link href={`/dashboard/lessons/prep/${klass.id}`} style={ghostBtn}>오늘 준비 시트 →</Link>
        </div>
      </div>

      {/* 요약 통계 */}
      <section style={{ ...card, marginBottom: '1.5rem' }}>
        <h3 style={h3}>요약</h3>
        <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
          총 <strong>{totalMeetings}</strong> 회차 ·{' '}
          출석 슬롯 <strong>{presentCount}</strong>/{totalSlots} ·{' '}
          전체 출석률 <strong style={{ color: overallAttRate >= 0.9 ? '#4A7C59' : '#C8A265' }}>
            {Math.round(overallAttRate * 100)}%
          </strong>
        </div>
      </section>

      {/* 학생별 출결 누적 */}
      {enrolls.length > 0 && (
        <section style={{ ...card, marginBottom: '1.5rem' }}>
          <h3 style={h3}>학생별 출결 누적 (최근 {totalMeetings}회차)</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
            <thead>
              <tr>
                <th style={th}>학생</th>
                <th style={th}>출석</th>
                <th style={th}>지각</th>
                <th style={th}>결석</th>
                <th style={th}>보강</th>
                <th style={th}>출석률</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(perStudent).map(([sid, c]) => {
                const total = c.present + c.late + c.absent + c.makeup;
                const rate = total > 0 ? c.present / total : 0;
                const displayName = nameMap.get(sid) ?? '(이름 없음)';
                return (
                  <tr key={sid}>
                    <td style={{ ...td, fontWeight: 500 }}>
                      {displayName}
                    </td>
                    <td style={{ ...td, color: '#4A7C59' }}>{c.present}</td>
                    <td style={{ ...td, color: '#C8A265' }}>{c.late}</td>
                    <td style={{ ...td, color: '#B44641' }}>{c.absent}</td>
                    <td style={{ ...td, color: '#7A9B6E' }}>{c.makeup}</td>
                    <td style={{ ...td, color: rate >= 0.9 ? '#4A7C59' : '#C8A265' }}>
                      {total > 0 ? `${Math.round(rate * 100)}%` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* 회차 list */}
      <section style={card}>
        <h3 style={h3}>수업 회차 ({totalMeetings}건)</h3>
        {meetings.length === 0 ? (
          <p style={{ marginTop: '0.75rem', color: '#A89F92' }}>아직 수업 회차 기록이 없습니다.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
            {meetings.map((m) => {
              const att = m.diag_meeting_attendances ?? [];
              const present = att.filter((a) => a.attendance === 'present').length;
              const absent = att.filter((a) => a.attendance === 'absent').length;
              const late = att.filter((a) => a.attendance === 'late').length;
              const total = att.length || enrolls.length;
              const memos = att.filter((a) => a.homeroom_note);

              return (
                <div key={m.id} style={{
                  background: '#FAF7F2', border: '1px solid #E5DDD0',
                  padding: '0.75rem 1rem', borderRadius: 2,
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem',
                  }}>
                    <Link
                      href={`/dashboard/lessons/prep/${classId}?date=${m.meet_date}`}
                      style={{
                        fontFamily: '"Cormorant Garamond", serif', fontSize: '1rem',
                        color: '#2B2620', textDecoration: 'none', fontWeight: 500,
                        borderBottom: '1px dotted #C8A265',
                      }}
                    >
                      {m.meet_date} ↗
                    </Link>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '0.78rem', color: '#7A7267' }}>
                        <span style={{ color: '#4A7C59' }}>출석 {present}</span>
                        {late > 0 && <span style={{ color: '#C8A265' }}> · 지각 {late}</span>}
                        {absent > 0 && <span style={{ color: '#B44641' }}> · 결석 {absent}</span>}
                        {' / '}{total}
                        {' · '}<span style={{ color: '#A89F92' }}>{m.meet_status}</span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`${m.meet_date} 회차를 삭제하시겠습니까?\n\n` +
                            `출결 ${total}건 + 단원 점수 모두 함께 삭제됩니다 (되돌릴 수 없음).`)) return;
                          try {
                            await deleteMeeting(m.id);
                            await reload();
                          } catch (e) {
                            alert('삭제 실패: ' + formatError(e));
                          }
                        }}
                        style={{
                          fontSize: '0.7rem', color: '#B44641', background: 'transparent',
                          border: '1px solid #E5DDD0', padding: '0.2rem 0.5rem',
                          cursor: 'pointer', borderRadius: 2, fontFamily: 'inherit',
                        }}
                      >회차 삭제</button>
                    </div>
                  </div>
                  {memos.length > 0 && (
                    <div style={{ marginTop: '0.5rem', display: 'grid', gap: 4 }}>
                      {memos.map((a) => {
                        const displayName = nameMap.get(a.student_id) ?? '(이름 없음)';
                        return (
                          <div key={a.id} style={{
                            fontSize: '0.8rem', color: '#2B2620',
                            padding: '0.3rem 0.5rem', background: '#FFF',
                            border: '1px solid #F0EAE0',
                          }}>
                            <span style={{ color: '#C8A265', fontWeight: 500 }}>
                              {displayName}
                            </span>{' — '}
                            <span style={{ whiteSpace: 'pre-wrap' }}>{a.homeroom_note}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
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
  border: '1px solid #D8D3CA', borderRadius: 2, fontFamily: 'inherit',
};
const th: React.CSSProperties = {
  textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '1px solid #E5DDD0',
  fontSize: '0.75rem', color: '#7A7267', letterSpacing: '0.05em', fontWeight: 500,
};
const td: React.CSSProperties = {
  padding: '0.5rem 0.75rem', borderBottom: '1px solid #F0EAE0',
  fontSize: '0.85rem',
};
