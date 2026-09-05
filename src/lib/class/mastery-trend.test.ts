import { describe, it, expect } from 'vitest';
import { weeklyTrend } from './mastery-trend';

const T = ['A', 'B', 'C', 'D'];   // 판 = 유형 4개

describe('mastery-trend · 주차별 누적 판정', () => {
  it('문항이 없으면 전부 미학습이고, 주 수만큼 점이 나온다 (마지막 점 = 기준 주)', () => {
    const pts = weeklyTrend([], T, '2026-09-04T05:00:00Z', 3);
    expect(pts).toHaveLength(3);
    expect(pts.map((p) => p.week)).toEqual(['2026-08-17', '2026-08-24', '2026-08-31']);
    expect(pts[2].weekEnd).toBe('2026-09-06');
    expect(pts[2].gray).toBe(4);
    expect(pts[2].green + pts[2].red + pts[2].pending + pts[2].gray).toBe(4);
  });

  it('누적이다 — 지난주에 잘함이 된 유형은 이번 주에도 잘함', () => {
    const items = [
      ...[1, 2, 3].map((i) => ({ code: 'A', ok: true, at: `2026-08-2${i}T03:00:00Z` })),   // 08-21~23 (08-17 주) 3문항 정답 → 잘함
      { code: 'B', ok: false, at: '2026-09-01T03:00:00Z' },                                 // 09-01 (08-31 주) 1문항 → 판정 보류
    ];
    const pts = weeklyTrend(items, T, '2026-09-04T05:00:00Z', 3);
    expect(pts[0].green).toBe(1);   // 08-17 주 — A 잘함
    expect(pts[0].gray).toBe(3);
    expect(pts[1].green).toBe(1);   // 08-24 주 — 그대로
    expect(pts[2].green).toBe(1);   // 08-31 주 — A 유지 + B 보류
    expect(pts[2].pending).toBe(1);
    expect(pts[2].gray).toBe(2);
    expect(pts[2].graded).toBe(1);  // 그 주에 새로 채점한 문항
    expect(pts[0].graded).toBe(3);
  });

  it('약점이 잘함으로 바뀌면 RED 가 줄고 GREEN 이 는다 (GRAY 는 판 기준)', () => {
    const items = [
      ...['18', '19', '20'].map((d) => ({ code: 'A', ok: false, at: `2026-08-${d}T03:00:00Z` })),  // 08-18~20 (08-17 주) 0/3 → 심각
      ...Array.from({ length: 7 }, (_, i) => ({ code: 'A', ok: true, at: `2026-08-2${5 + (i % 2)}T0${i}:00:00Z` })), // 08-25/26 (08-24 주) 7정답 → 7/10=70% 불안정
      ...Array.from({ length: 20 }, (_, i) => ({ code: 'A', ok: true, at: `2026-09-0${1 + (i % 3)}T0${i % 10}:00:00Z` })), // 09-01~03 → 27/30 = 90% 마스터
    ];
    const pts = weeklyTrend(items, T, '2026-09-04T05:00:00Z', 3);
    expect(pts[0].counts.severe).toBe(1);
    expect(pts[1].counts.shaky).toBe(1);
    expect(pts[2].counts.master).toBe(1);
    expect(pts[2].red).toBe(0);
    expect(pts[2].green).toBe(1);
    expect(pts.map((p) => p.gray)).toEqual([3, 3, 3]);
  });

  it('★ 주 경계는 KST — 일요일 밤 KST 채점은 그 주에 들어간다', () => {
    const items = [{ code: 'A', ok: true, at: '2026-08-30T14:30:00Z' }];   // 08-30 23:30 KST 일요일 → 08-24 주
    const pts = weeklyTrend(items, T, '2026-09-04T05:00:00Z', 2);
    expect(pts[0].week).toBe('2026-08-24');
    expect(pts[0].graded).toBe(1);
    expect(pts[1].graded).toBe(0);
  });

  it('판 밖 코드로 채점된 것은 판정엔 들어가되 미학습 수는 판 기준', () => {
    const items = [1, 2, 3].map((i) => ({ code: 'Z', ok: true, at: `2026-09-0${i}T03:00:00Z` }));
    const pts = weeklyTrend(items, T, '2026-09-04T05:00:00Z', 1);
    expect(pts[0].green).toBe(1);
    expect(pts[0].gray).toBe(4);
  });
});
