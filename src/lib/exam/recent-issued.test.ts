import { describe, it, expect } from 'vitest';
import {
  parseExcludeRecentDays, recentCutoffIso, loadRecentlyIssuedProblemIds,
  DEFAULT_EXCLUDE_RECENT_DAYS, MAX_EXCLUDE_RECENT_DAYS,
} from './recent-issued';

describe('parseExcludeRecentDays', () => {
  it('비어 있으면 기본 30일, 0·음수·문자면 끄기(0), 365 상한', () => {
    expect(parseExcludeRecentDays(undefined)).toBe(DEFAULT_EXCLUDE_RECENT_DAYS);
    expect(parseExcludeRecentDays(null)).toBe(DEFAULT_EXCLUDE_RECENT_DAYS);
    expect(parseExcludeRecentDays('')).toBe(DEFAULT_EXCLUDE_RECENT_DAYS);
    expect(parseExcludeRecentDays(0)).toBe(0);
    expect(parseExcludeRecentDays('0')).toBe(0);
    expect(parseExcludeRecentDays(-5)).toBe(0);
    expect(parseExcludeRecentDays('abc')).toBe(0);
    expect(parseExcludeRecentDays('14')).toBe(14);
    expect(parseExcludeRecentDays(90.7)).toBe(90);
    expect(parseExcludeRecentDays(9999)).toBe(MAX_EXCLUDE_RECENT_DAYS);
  });
});

describe('recentCutoffIso', () => {
  it('now 에서 N일을 뺀 ISO', () => {
    const now = new Date('2026-10-13T00:00:00.000Z');
    expect(recentCutoffIso(30, now)).toBe('2026-09-13T00:00:00.000Z');
  });
});

// Supabase 체인 흉내 — exams 는 school_name null 조건·cutoff 를 받았는지, exam_problems 는 exam id 로 모았는지 확인
function fakeSb(exams: Array<{ id: string }>, links: Array<{ exam_id: string; problem_id: string }>) {
  const calls: Record<string, unknown[]> = { gte: [], is: [], eq: [], in: [] };
  const chain = (table: string) => {
    const state: { examIds?: string[] } = {};
    const q: Record<string, unknown> = {};
    const self = () => q;
    q.select = self;
    q.eq = (c: string, v: unknown) => { calls.eq.push([c, v]); return q; };
    q.is = (c: string, v: unknown) => { calls.is.push([c, v]); return q; };
    q.gte = (c: string, v: unknown) => { calls.gte.push([c, v]); return q; };
    q.in = (_c: string, v: string[]) => { calls.in.push(v); state.examIds = v; return q; };
    q.range = async (from: number, to: number) => {
      if (table === 'exams') return { data: exams.slice(from, to + 1), error: null };
      const rows = links.filter((l) => (state.examIds ?? []).includes(l.exam_id)).map((l) => ({ problem_id: l.problem_id }));
      return { data: rows.slice(from, to + 1), error: null };
    };
    return q;
  };
  return { sb: { from: chain } as never, calls };
}

describe('loadRecentlyIssuedProblemIds', () => {
  it('days<=0 이거나 institute 가 없으면 빈 집합 (조회 안 함)', async () => {
    const { sb, calls } = fakeSb([{ id: 'e1' }], [{ exam_id: 'e1', problem_id: 'p1' }]);
    expect((await loadRecentlyIssuedProblemIds(sb, 'inst', 0)).size).toBe(0);
    expect((await loadRecentlyIssuedProblemIds(sb, null, 30)).size).toBe(0);
    expect(calls.gte.length).toBe(0);
  });

  it('학교기출 제외(school_name null)·기간(cutoff)·institute 조건으로 시험지를 찾고 그 문항 id 를 모은다', async () => {
    const { sb, calls } = fakeSb(
      [{ id: 'e1' }, { id: 'e2' }],
      [{ exam_id: 'e1', problem_id: 'p1' }, { exam_id: 'e2', problem_id: 'p2' }, { exam_id: 'e2', problem_id: 'p1' }, { exam_id: 'e9', problem_id: 'p9' }],
    );
    const now = new Date('2026-10-13T00:00:00.000Z');
    const set = await loadRecentlyIssuedProblemIds(sb, 'inst-1', 30, now);
    expect([...set].sort()).toEqual(['p1', 'p2']);
    expect(calls.eq).toContainEqual(['institute_id', 'inst-1']);
    expect(calls.is).toContainEqual(['school_name', null]);
    expect(calls.is).toContainEqual(['deleted_at', null]);
    expect(calls.gte).toContainEqual(['created_at', '2026-09-13T00:00:00.000Z']);
  });
});
