import { describe, it, expect } from 'vitest';
import { examIdentityFromTitle, describeIdentity } from './exam-duplicate-guard';

/** 두 제목이 "같은 시험"으로 판정되는가 */
function sameExam(a: string, b: string): boolean {
  const x = examIdentityFromTitle(a);
  const y = examIdentityFromTitle(b);
  if (!x || !y) return false;
  return JSON.stringify(x) === JSON.stringify(y);
}

describe('examIdentityFromTitle', () => {
  it('교과서명만 다른 같은 시험을 잡는다 (2026-09-02 중복 사고)', () => {
    expect(sameExam('25-2-1-F 여명중 수학', '25-2-1-F 여명중 중등수학2상')).toBe(true);
  });

  it('학년·학기·중간기말이 하나라도 다르면 다른 시험', () => {
    expect(sameExam('25-2-1-F 여명중 수학', '25-3-1-F 여명중 수학')).toBe(false);
    expect(sameExam('25-2-1-F 여명중 수학', '25-2-2-F 여명중 수학')).toBe(false);
    expect(sameExam('25-2-1-F 여명중 수학', '25-2-1-M 여명중 수학')).toBe(false);
    expect(sameExam('25-2-1-F 여명중 수학', '24-2-1-F 여명중 수학')).toBe(false);
    expect(sameExam('25-2-1-F 여명중 수학', '25-2-1-F 사직중 수학')).toBe(false);
  });

  it('★ 유사본은 번호까지 봐야 한다 — 유사/유사1/유사2 는 서로 다른 시험지', () => {
    expect(sameExam('23-1-2-M 대동고 수학(하) (유사)', '23-1-2-M 대동고 수학(하) (유사1)')).toBe(false);
    expect(sameExam('23-1-2-M 대동고 수학(하) (유사1)', '23-1-2-M 대동고 수학(하) (유사2)')).toBe(false);
    // 유사본과 원본도 다른 시험지
    expect(sameExam('23-1-2-M 대동고 수학(하)', '23-1-2-M 대동고 수학(하) (유사)')).toBe(false);
  });

  it('A형/B형은 서로 다른 시험지', () => {
    expect(sameExam('25-1-1-M 부산고 공통수학1 A형', '25-1-1-M 부산고 공통수학1 B형')).toBe(false);
  });

  it('같은 과목의 옛 표기와 새 표기는 같은 시험 (공통수학1 = 수학상)', () => {
    expect(sameExam('24-1-1-M 경남고 공통수학1', '24-1-1-M 경남고 수학상')).toBe(true);
    expect(sameExam('23-1-2-F 동아고 수학(하)', '23-1-2-F 동아고 공통수학2')).toBe(true);
  });

  it('고2 과목이 갈리면 다른 시험 (대수 vs 미적분)', () => {
    expect(sameExam('25-2-1-M 부산고 대수', '25-2-1-M 부산고 미적분')).toBe(false);
  });

  it('학교기출 형식이 아니면 판정하지 않는다 (null)', () => {
    expect(examIdentityFromTitle('BS_H1S1_R1 진단평가')).toBeNull();
    expect(examIdentityFromTitle('쎈 중2 상 3단원')).toBeNull();
  });

  it('describeIdentity 는 사람이 읽는 한 줄', () => {
    expect(describeIdentity(examIdentityFromTitle('25-2-1-F 여명중 수학')!))
      .toBe('2025년 여명중 2학년 1학기 기말');
  });
});

// 실데이터에서 잡힌 오탐 — 정상 시험지를 중복으로 막으면 안 된다
describe('과목이 갈리는 실제 사례', () => {
  it('고2 수학Ⅰ / 수학Ⅱ 는 다른 시험 (경신고, 같은 학년·회차에 나란히 있다)', () => {
    expect(sameExam('23-2-1-F 경신고 수학1', '23-2-1-F 경신고 수학2')).toBe(false);
  });

  it('고급대수 / 대수 는 다른 시험 (현대청운고)', () => {
    expect(sameExam('25-1-2-F 현대청운고 고급대수', '25-1-2-F 현대청운고 대수')).toBe(false);
  });

  it('중등 교과서명은 과목으로 읽지 않는다 — 수학2상이 수학Ⅱ가 되면 안 된다', () => {
    expect(sameExam('25-2-1-F 여명중 수학', '25-2-1-F 여명중 중등수학2상')).toBe(true);
  });
});

it('서술형 분리본 — (서술형) 과 (서술형X) 는 다른 시험 (경신고)', () => {
  expect(sameExam('25-1-1-M 경신고 공통수학1(서술형)', '25-1-1-M 경신고 공통수학1(서술형X)')).toBe(false);
});

it('형 없이 끝에 붙는 A/B 도 다른 시험 (세종과학고 심화수학1A / 1B)', () => {
  expect(sameExam('23-1-2-F 세종과학고 심화수학1A', '23-1-2-F 세종과학고 심화수학1B')).toBe(false);
});
