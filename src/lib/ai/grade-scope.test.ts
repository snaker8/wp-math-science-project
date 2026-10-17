import { describe, it, expect } from 'vitest';
import { exceedsGradeScope, gradeScopeNote } from './strategy-verify';

const BS = String.fromCharCode(92);

describe('exceedsGradeScope — 학장중 중1-2 16번 (√ 공략)', () => {
  it('중1 공략에 \\sqrt 가 있으면 범위 초과', () => {
    expect(exceedsGradeScope(`대각선은 $12${BS}sqrt{2}$ 이므로`, '중1')).toMatch(/중1 범위/);
    expect(exceedsGradeScope('넓이는 36의 5/6 이므로 30', '중1')).toBeNull();
  });
  it('중2 는 √ 허용(피타고라스), 삼각비는 초과. 고1 은 가드 없음', () => {
    expect(exceedsGradeScope(`$5${BS}sqrt{2}$`, '중2')).toBeNull();
    expect(exceedsGradeScope('삼각비를 이용', '중2')).toMatch(/중2 범위/);
    expect(exceedsGradeScope('삼각비를 이용', '고1')).toBeNull();
  });
  it('학년 안내문', () => {
    expect(gradeScopeNote('중1')).toContain('제곱근');
    expect(gradeScopeNote('')).toBe('');
  });
});
