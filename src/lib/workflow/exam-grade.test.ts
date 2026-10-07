import { describe, it, expect } from 'vitest';
import { resolveExamGrade } from './exam-grade';

describe('resolveExamGrade', () => {
  it('양운고 기하(코드 13) + 제목 2-2 → 고2 (코드 대표 학년 고3 아님)', () => {
    expect(resolveExamGrade(['13'], '26-2-2-M 양운고 기하')).toBe('고2');
  });
  it('기하 + 제목 3-1 → 고3', () => {
    expect(resolveExamGrade(['13'], '25-3-1-F 양운고 기하')).toBe('고3');
  });
  it('제목에 학년이 없으면 코드 대표 학년', () => {
    expect(resolveExamGrade(['09'], '주례여고 대수 기말')).toBe('고2');
  });
  it('중등 코드는 제목보다 코드를 믿는다', () => {
    expect(resolveExamGrade(['06'], '26-3-2-M 부흥중 수학')).toBe('중3');
    expect(resolveExamGrade(['04'], '엉뚱한 제목')).toBe('중2');
  });
  it('공통수학은 코드가 고1 을 확정한다', () => {
    expect(resolveExamGrade(['07'], '26-2-1-M 양운고 수학')).toBe('고1');
  });
  it('명시값이 있으면 그대로', () => {
    expect(resolveExamGrade(['13'], '26-2-2-M 양운고 기하', '고3')).toBe('고3');
  });
  it('코드가 없으면 제목 학년, 그것도 없으면 null', () => {
    expect(resolveExamGrade(null, '26-2-2-M 센텀중 수학')).toBe('중2');
    expect(resolveExamGrade(null, '')).toBeNull();
  });
});
