// 전체 반 상태 — admin 전용 비교 뷰
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getAllClassStats, getCurrentProfile, listTeachers,
  type ClassStatsRow, type TeacherProfile,
} from '../lib/queries-class';
import { STAGE_LABEL, STAGE_COLOR, WEEKDAY_LABEL_KO } from '../lib/types-class';

export default function OverviewPage() {
  const [rows, setRows] = useState<ClassStatsRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getCurrentProfile();
        const [stats, ts] = await Promise.all([getAllClassStats(), listTeachers()]);
        if (!cancelled) {
          setRows(stats);
          setTeachers(ts);
        }
      } catch (e) {
        if (!cancelled) setError(formatError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const teacherMap = new Map(teachers.map((t) => [t.user_id, t.display_name]));

  if (loading) return <div style={{ color: '#7A7267' }}>불러오는 중…</div>;
  if (error) return <div style={{ color: '#B44641' }}>로딩 실패: {error}</div>;

  const filteredRows = showInactive ? rows : rows.filter((r) => r.active);

  // 총계
  const totalEnrolled = filteredRows.reduce((s, r) => s + r.enrolled_count, 0);
  const totalCapacity = filteredRows.reduce((s, r) => s + r.capacity, 0);
  const totalMeetings = filteredRows.reduce((s, r) => s + r.total_meetings, 0);
  const totalMemos = filteredRows.reduce((s, r) => s + r.memo_count, 0);
  const avgRate = filteredRows.filter((r) => r.attendance_rate_pct !== null).length > 0
    ? Math.round(
        filteredRows.filter((r) => r.attendance_rate_pct !== null)
          .reduce((s, r) => s + (r.attendance_rate_pct ?? 0), 0)
        / filteredRows.filter((r) => r.attendance_rate_pct !== null).length
      )
    : 0;

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem',
      }}>
        <div>
          <h2 style={h2}>전체 반 상태 <span style={{ color: '#C8A265', fontSize: '0.85rem' }}>★ admin</span></h2>
          <p style={{ color: '#7A7267', margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>
            반 {filteredRows.length}개 · 학생 {totalEnrolled}/{totalCapacity} ·
            누적 회차 {totalMeetings} · 누적 메모 {totalMemos} ·
            평균 출석률 <strong style={{
              color: avgRate >= 90 ? '#4A7C59' : avgRate >= 70 ? '#C8A265' : '#B44641',
            }}>{avgRate}%</strong>
          </p>
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem', color: '#7A7267' }}>
          <input type="checkbox" checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)} />
          비활성 반 포함
        </label>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#FFF',
                        border: '1px solid #E5DDD0', minWidth: 900 }}>
          <thead>
            <tr style={{ background: '#FAF7F2' }}>
              <th style={th}>반 이름</th>
              <th style={th}>요일·시각</th>
              <th style={th}>단계</th>
              <th style={th}>담임</th>
              <th style={{ ...th, textAlign: 'right' }}>등록/정원</th>
              <th style={{ ...th, textAlign: 'right' }}>케어</th>
              <th style={{ ...th, textAlign: 'right' }}>최근 4주 회차</th>
              <th style={{ ...th, textAlign: 'right' }}>총 회차</th>
              <th style={{ ...th, textAlign: 'right' }}>출석률</th>
              <th style={{ ...th, textAlign: 'right' }}>메모</th>
              <th style={th}>마지막 회차</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={12} style={{ ...td, textAlign: 'center', padding: '2rem', color: '#A89F92' }}>
                  표시할 반이 없습니다.
                </td>
              </tr>
            )}
            {filteredRows.map((r) => {
              const teacherName = r.homeroom_id ? (teacherMap.get(r.homeroom_id) ?? '(미지정)') : '(미지정)';
              const rate = r.attendance_rate_pct;
              const rateColor =
                rate === null ? '#A89F92' :
                rate >= 90 ? '#4A7C59' :
                rate >= 70 ? '#C8A265' : '#B44641';
              const careOver = r.care_total > r.capacity * 1.0;
              return (
                <tr key={r.class_id} style={{ opacity: r.active ? 1 : 0.5 }}>
                  <td style={td}>
                    <strong>{r.class_name}</strong>
                    {!r.active && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: '#B44641' }}>비활성</span>}
                  </td>
                  <td style={{ ...td, fontSize: '0.8rem', color: '#7A7267' }}>
                    {(r.weekdays ?? []).map((w) => WEEKDAY_LABEL_KO[w]).join('·')}
                    {' '}{r.start_time?.slice(0, 5)}
                  </td>
                  <td style={{ ...td, color: STAGE_COLOR[r.stage_min], fontSize: '0.8rem' }}>
                    {STAGE_LABEL[r.stage_min]}~{STAGE_LABEL[r.stage_max]}
                  </td>
                  <td style={{ ...td, fontSize: '0.85rem' }}>{teacherName}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <strong style={{ color: r.enrolled_count === r.capacity ? '#4A7C59' : '#2B2620' }}>
                      {r.enrolled_count}
                    </strong>
                    <span style={{ color: '#A89F92' }}>/{r.capacity}</span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: careOver ? '#B44641' : '#2B2620' }}>
                    {Number(r.care_total).toFixed(1)}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: r.recent_meetings_28d === 0 ? '#B44641' : '#2B2620' }}>
                    {r.recent_meetings_28d}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.total_meetings}</td>
                  <td style={{ ...td, textAlign: 'right', color: rateColor, fontWeight: 500 }}>
                    {rate !== null ? `${rate}%` : '-'}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.memo_count}</td>
                  <td style={{ ...td, fontSize: '0.8rem', color: '#7A7267' }}>
                    {r.last_meet_date ?? '-'}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Link href={`/dashboard/lessons/classes/${r.class_id}`} style={smallBtn}>학생 →</Link>
                    {' '}<Link href={`/dashboard/lessons/classes/${r.class_id}/history`} style={smallBtn}>이력 →</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#A89F92' }}>
        💡 <strong>최근 4주 회차 = 0</strong> 인 반은 활동이 끊긴 가능성 → 확인 필요.
        <strong> 출석률</strong>: ≥90 초록 / 70~89 골드 / &lt;70 빨강.
        <strong> 케어 합계</strong>가 정원 초과면 빨강 (담임 과부하).
      </p>
    </div>
  );
}

function formatError(e: unknown): string {
  if (!e) return 'unknown';
  if (e instanceof Error) return e.message;
  const obj = e as Record<string, unknown>;
  return (obj.message as string) || JSON.stringify(e);
}

const h2: React.CSSProperties = {
  fontFamily: '"Cormorant Garamond", serif',
  fontSize: '1.75rem', fontWeight: 500, margin: 0,
};
const th: React.CSSProperties = {
  textAlign: 'left', padding: '0.55rem 0.7rem', borderBottom: '1px solid #E5DDD0',
  fontSize: '0.72rem', color: '#7A7267', letterSpacing: '0.04em', fontWeight: 500,
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '0.5rem 0.7rem', borderBottom: '1px solid #F0EAE0',
  fontSize: '0.85rem', verticalAlign: 'middle',
};
const smallBtn: React.CSSProperties = {
  padding: '0.25rem 0.5rem', background: '#FAF7F2', border: '1px solid #D8D3CA',
  borderRadius: 2, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit',
  textDecoration: 'none', color: '#2B2620',
};
