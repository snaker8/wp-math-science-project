import { describe, it, expect } from 'vitest';
import { matchesExamSearch } from './parse-exam-title';

const T = {
  su2F: '24-2-1-F 사직고 수학2',
  su2M: '24-2-2-M 덕문여고 수학2',
  su2short: '25-2-1-M 경남고 수2',
  mi1: '26-2-1-F 서여고 미적분1',
  mi: '24-2-2-F 해운대고 미적분',
  gong2: '25-1-2-F 양운고 공통수학2',
  ha: '19-1-2-F 현대고 수학하',
  su1: '24-2-1-M 사직고 수학1',
  book: '쎈 중2-1',
};
const hits = (q: string) => Object.entries(T).filter(([, t]) => matchesExamSearch(t, q)).map(([k]) => k);

describe('matchesExamSearch — 뜻으로 찾기', () => {
  it('빈 검색어는 전부 통과', () => {
    expect(hits('  ').length).toBe(Object.keys(T).length);
  });
  it('「미적분1」 = 옛 수학2 + 새 미적분1 (미적분·공통수학2 는 아님)', () => {
    expect(hits('미적분1')).toEqual(['su2F', 'su2M', 'su2short', 'mi1']);
  });
  it('「미적분1 기말」 — 기말은 제목의 F', () => {
    expect(hits('미적분1 기말')).toEqual(['su2F', 'mi1']);
  });
  it('「수2」 줄임말 — 수학2·미적분1 까지', () => {
    expect(hits('수2')).toEqual(['su2F', 'su2M', 'su2short', 'mi1']);
  });
  it('「수학2」는 글자 포함도 유지 — 예전에 걸리던 공통수학2 가 빠지지 않는다', () => {
    expect(hits('수학2')).toEqual(['su2F', 'su2M', 'su2short', 'mi1', 'gong2']);
  });
  it('「공통수학2」 = 수학하', () => {
    expect(hits('공통수학2')).toEqual(['gong2', 'ha']);
  });
  it('「대수 중간」 = 수학1 중간', () => {
    expect(hits('대수 중간')).toEqual(['su1']);
  });
  it('학교 + 과목 + 구분 조합', () => {
    expect(hits('사직고 수2 기말')).toEqual(['su2F']);
  });
  it('연도·학기·학년', () => {
    expect(hits('2024년 2학기')).toEqual(['su2M', 'mi']);
    expect(hits('고1')).toEqual(['gong2', 'ha']);
  });
  it('예전 방식(공백 지운 글자 포함)은 그대로', () => {
    expect(hits('사직고수학2')).toEqual(['su2F']);
    expect(hits('쎈 중2')).toEqual(['book']);
  });
});
