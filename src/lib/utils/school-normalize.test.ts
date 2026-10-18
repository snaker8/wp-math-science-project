import { describe, it, expect } from 'vitest';
import { normalizeSchoolName } from './school-normalize';

describe('normalizeSchoolName — 시도 접두어', () => {
  it('시도 이름이 학교명인 경우는 떼지 않는다 (2026-10-18 경남외고 → "외고" 사고)', () => {
    expect(normalizeSchoolName('경남외고')).toBe('경남외고');
    expect(normalizeSchoolName('경남고')).toBe('경남고');
    expect(normalizeSchoolName('경남여고')).toBe('경남여고');
    expect(normalizeSchoolName('부산고등학교')).toBe('부산고');
    expect(normalizeSchoolName('서울고')).toBe('서울고');
  });
  it('시도가 앞에 붙은 경우는 뗀다', () => {
    expect(normalizeSchoolName('부산 동래중')).toBe('동래중');
    expect(normalizeSchoolName('서울동래중')).toBe('동래중');
    expect(normalizeSchoolName('동래중학교')).toBe('동래중');
    expect(normalizeSchoolName('경남 경남외고')).toBe('경남외고');
  });
  it('학교 접미사가 없으면 null', () => {
    expect(normalizeSchoolName('부산')).toBeNull();
    expect(normalizeSchoolName('')).toBeNull();
  });
});
