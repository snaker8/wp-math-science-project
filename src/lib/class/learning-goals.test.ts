import { describe, it, expect } from 'vitest';
import {
  parseGoals, validateGoals, achievementPct, weatherOf, weekStartKST, weekKeyKST,
} from './learning-goals';

describe('learning-goals · 저장값', () => {
  it('settings 에 goals 가 없으면 null 두 개 — 목표 없이 0% 달성을 만들지 않는다', () => {
    expect(parseGoals(null)).toEqual({ weeklyProblems: null, accuracy: null });
    expect(parseGoals({})).toEqual({ weeklyProblems: null, accuracy: null });
    expect(parseGoals({ goals: { weeklyProblems: '70' } })).toEqual({ weeklyProblems: null, accuracy: null });
  });
  it('정상값', () => {
    expect(parseGoals({ goals: { weeklyProblems: 70, accuracy: 50 } })).toEqual({ weeklyProblems: 70, accuracy: 50 });
  });
  it('검증 — 범위 밖은 거절, 빈 값은 해제(null)', () => {
    expect(validateGoals({ weeklyProblems: 70, accuracy: 50 })).toEqual({ ok: true, goals: { weeklyProblems: 70, accuracy: 50 } });
    expect(validateGoals({ weeklyProblems: '', accuracy: '' })).toEqual({ ok: true, goals: { weeklyProblems: null, accuracy: null } });
    expect(validateGoals({ weeklyProblems: 5 }).ok).toBe(false);
    expect(validateGoals({ accuracy: 101 }).ok).toBe(false);
    expect(validateGoals({ weeklyProblems: 'abc' }).ok).toBe(false);
  });
});

describe('learning-goals · 달성률 · 날씨', () => {
  it('100 초과도 그대로 (매쓰홀릭 176%)', () => {
    expect(achievementPct(86, 50)).toBe(172);
    expect(achievementPct(0, 70)).toBe(0);
    expect(achievementPct(10, null)).toBeNull();
    expect(achievementPct(null, 70)).toBeNull();
  });
  it('날씨 경계', () => {
    expect(weatherOf(176)).toBe('sunny');
    expect(weatherOf(100)).toBe('sunny');
    expect(weatherOf(71)).toBe('partly');
    expect(weatherOf(50)).toBe('partly');
    expect(weatherOf(0)).toBe('cloudy');
    expect(weatherOf(null)).toBeNull();
  });
});

describe('learning-goals · KST 주 경계 (월요일 시작)', () => {
  it('2026-09-04(금) KST 의 주 시작은 2026-08-31(월) 00:00 KST', () => {
    const start = weekStartKST('2026-09-04T05:36:18.531+00:00');   // KST 14:36 금
    expect(new Date(start).toISOString()).toBe('2026-08-30T15:00:00.000Z');   // 08-31 00:00 KST
    expect(weekKeyKST('2026-09-04T05:36:18.531+00:00')).toBe('2026-08-31');
  });
  it('★ 일요일 밤 KST 는 아직 같은 주 — UTC 로 계산하면 다음 주로 튄다', () => {
    // 2026-09-06 23:30 KST = 09-06 14:30 UTC (일요일)
    expect(weekKeyKST('2026-09-06T14:30:00Z')).toBe('2026-08-31');
    // 2026-09-07 00:30 KST = 09-06 15:30 UTC — KST 로는 월요일
    expect(weekKeyKST('2026-09-06T15:30:00Z')).toBe('2026-09-07');
  });
  it('월요일 자정 직전/직후', () => {
    expect(weekKeyKST('2026-08-30T14:59:59Z')).toBe('2026-08-24');
    expect(weekKeyKST('2026-08-30T15:00:00Z')).toBe('2026-08-31');
  });
});
