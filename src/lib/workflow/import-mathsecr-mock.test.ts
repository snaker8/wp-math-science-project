import { describe, it, expect } from 'vitest';
import { classify, buildTitle, targetFolders, resolveCodes, isSplittableMock, MOCK_G3_SPLIT } from '../../../scripts/import-mathsecr';

// 2026-10-25 — 수학비서 평가원·교육청(학평) 파일 적재 규격. 파일명은 미러 폴더 실측.
describe('import-mathsecr — 모의고사(mock) 분류', () => {
  it('★ 2022학년도~ 통합형 평가원 고3 공통', () => {
    const c = classify('2026년(2027학년도) 평가원 고3 공통 06월__db-544735.hml');
    expect(c).toEqual({ kind: 'mock', year: 2026, org: '평가원', grade: 3, track: '공통', month: 6 });
    expect(buildTitle(c)).toBe('26-06 평가원 고3');
    expect(targetFolders(c, '')).toEqual(['모의고사', '평가원', '고3']);
    expect(isSplittableMock(c, 46)).toBe(true);
    expect(isSplittableMock(c, 30)).toBe(false);
    expect(MOCK_G3_SPLIT.map((s) => s.to - s.from + 1)).toEqual([22, 8, 8, 8]);
  });
  it('교육청 고1 (공백 없는 "고1공통", 한 자리 월)', () => {
    const c = classify('2025년 교육청 고1공통 9월__db-71806.hml');
    expect(c.kind).toBe('mock');
    expect(buildTitle(c)).toBe('25-09 교육청 고1');
    expect(resolveCodes(c, '')).toEqual(['07', '08']);
  });
  it('분리형 문과·이과 (2021학년도 이전)', () => {
    const a = classify('2009년(2010학년도) 평가원 고3이과 6월__db-71668.hml');
    expect(buildTitle(a)).toBe('09-06 평가원 고3 이과');
    expect(resolveCodes(a, '')).toEqual(['11', '12', '13']);
    const b = classify('2007년 교육청 고3문과 7월__db-71754.hml');
    expect(buildTitle(b)).toBe('07-07 교육청 고3 문과');
    expect(resolveCodes(b, '')).toEqual(['09', '10', '11']);
  });
  it('예시 문항 (월 없음)', () => {
    const c = classify('2004년(2005학년도) 평가원 고3문과 예시 문항__db-71560.hml');
    expect(c.kind).toBe('mock');
    expect(buildTitle(c)).toBe('04-예시 평가원 고3 문과');
  });
  it('고2 → 대수·미적분Ⅰ', () => {
    expect(resolveCodes(classify('2026년 교육청 고2공통 9월__db-704173.hml'), '')).toEqual(['09', '10']);
  });
  it('학교기출 규격은 그대로 school (회귀)', () => {
    expect(classify('내신 2025년 부산 해운대구 반여고 고3공통 1학기기말 확률과통계__db-541385.hml').kind).toBe('school');
  });
});
