import { describe, expect, it } from 'vitest';
import { buildOrigin, formatOriginTitle } from './origin-label';

describe('formatOriginTitle', () => {
  it('학교기출 고등', () => {
    expect(formatOriginTitle('21-1-1-F 상산고 수학상', 'school')).toBe('상산고 2021 고1-1 기말 수학상');
  });
  it('학교기출 중학교', () => {
    expect(formatOriginTitle('24-2-2-M 인지중 수학', 'school')).toBe('인지중 2024 중2-2 중간 수학');
  });
  it('모의고사', () => {
    expect(formatOriginTitle('25-05 교육청 고3 확률과 통계', 'mock')).toBe('2025년 5월 교육청 고3 확률과 통계');
  });
  it('형식이 다르면 제목 그대로', () => {
    expect(formatOriginTitle('쎈 공통수학1', 'textbook')).toBe('쎈 공통수학1');
  });
});

describe('buildOrigin', () => {
  it('번호를 붙인다', () => {
    expect(buildOrigin({ title: '24-1-2-F 상산고 공통수학1', exam_type: '학교기출' }, 14)).toEqual({
      label: '상산고 2024 고1-2 기말 공통수학1 14번',
      kind: 'school',
    });
  });
  it('유사·변형 시험지는 출처가 아니다', () => {
    expect(buildOrigin({ title: '23-1-2-F 만덕고 수학(하) (유사1)', exam_type: '학교기출' }, 3)).toBeNull();
  });
  it('진단평가·출제 시험지는 출처가 아니다', () => {
    expect(buildOrigin({ title: '진단평가A', exam_type: '진단평가' }, 1)).toBeNull();
    expect(buildOrigin({ title: '공통수학1 6단계', exam_type: null }, 1)).toBeNull();
  });
});
