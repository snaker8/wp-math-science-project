import { describe, it, expect } from 'vitest';
import { parseSourceScope, hasSourceScope } from './source-scope';

describe('parseSourceScope — 출처 범위 파라미터 (2026-10-25)', () => {
  it('쿼리스트링 꼴(source=school&schools=a,b)', () => {
    expect(parseSourceScope({ source: 'school', schools: '거성중, 분포중' })).toEqual({ source: 'school', schools: ['거성중', '분포중'] });
  });
  it('JSON 본문 꼴(schools 배열)', () => {
    expect(parseSourceScope({ source: 'mock', schools: ['거성중'] })).toEqual({ source: 'mock', schools: [] }); // 학교 목록은 학교기출에서만 의미
  });
  it('학교만 주고 source 를 빠뜨리면 학교기출로', () => {
    expect(parseSourceScope({ schools: '거성중' })).toEqual({ source: 'school', schools: ['거성중'] });
  });
  it('모르는 source 는 전체', () => {
    const s = parseSourceScope({ source: 'weird' });
    expect(s).toEqual({ source: '', schools: [] });
    expect(hasSourceScope(s)).toBe(false);
  });
});
