import { describe, it, expect } from 'vitest';
import { detectExamTypeFromTitle } from './exam-detect';

describe('detectExamTypeFromTitle', () => {
  it('교육청·평가원·수능 제목은 모의고사', () => {
    expect(detectExamTypeFromTitle('26-09 교육청 고2')).toBe('모의고사');
    expect(detectExamTypeFromTitle('25-06 평가원 고3 공통')).toBe('모의고사');
    expect(detectExamTypeFromTitle('경기도교육청 고3 문과 학업성취도')).toBe('모의고사');
    expect(detectExamTypeFromTitle('21년 3월 고1 모의고사')).toBe('모의고사');
  });
  it('학교 시험은 학교기출', () => {
    expect(detectExamTypeFromTitle('25-2-1-F 동인고 수학1')).toBe('학교기출');
    expect(detectExamTypeFromTitle('23-2-3-F 신곡중')).toBe('학교기출');
  });
});
