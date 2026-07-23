import { describe, it, expect } from 'vitest';
import { detectSubjectFromTitle, detectGradeFromTitle } from './title-detect';

// ============================================================================
// ★ 2026-07-23 사고: "중간"(중간고사)의 '중' 을 중학교로 읽어 고1 시험지가 중1-1 로
//   분류됨. 같은 학교 [기말] 시험지는 정상이었던 것이 결정적 단서였다.
//   운영 제목 그대로 고정한다.
// ============================================================================

describe('중간고사의 "중" 을 중학교로 오인하지 않는다 (실사고 재현)', () => {
  const 사고제목 = '[23년][1-1][중간][해운대고][수학상]';
  const 정상제목 = '[22년][1-1][기말][해운대고][수학상]';

  it('★ 고교 중간고사 — 중1-1 이 아니라 고1 수학(상)', () => {
    expect(detectSubjectFromTitle(사고제목)).toBe('수학(상)');
    expect(detectSubjectFromTitle(사고제목)).not.toMatch(/^중/);
    expect(detectGradeFromTitle(사고제목)).toBe('고1');
  });

  it('같은 학교 기말도 동일하게 (중간/기말이 결과를 바꾸면 안 된다)', () => {
    expect(detectSubjectFromTitle(정상제목)).toBe(detectSubjectFromTitle(사고제목));
    expect(detectGradeFromTitle(정상제목)).toBe('고1');
  });

  it('괄호 없는 "수학상"·"수학하" 도 인정 (운영 제목이 괄호를 안 쓴다)', () => {
    expect(detectSubjectFromTitle('[24년][1-1][중간][부산고][수학하]')).toBe('수학(하)');
    expect(detectSubjectFromTitle('[24년][1-1][기말][부산고][수학(상)]')).toBe('수학(상)');
  });

  it('"수학상수" 같은 단어는 과목으로 오인하지 않는다', () => {
    expect(detectSubjectFromTitle('[26년][1-1][중간][해운대고][수학상수 단원]')).not.toBe('공통수학1');
  });
});

describe('중학교는 그대로 중등으로 (회귀 방지)', () => {
  it('학교명에 중 — 중간고사여도 중등', () => {
    expect(detectSubjectFromTitle('[26년][2-1][중간][사직중][수학]')).toBe('중2-1 수학');
    expect(detectGradeFromTitle('[26년][2-1][중간][사직중][수학]')).toBe('중2');
  });

  it('중3-1 표기', () => {
    expect(detectSubjectFromTitle('26-3-1-F 이사벨중 수학')).toBe('중3-1 수학');
    expect(detectGradeFromTitle('26-3-1-F 이사벨중 수학')).toBe('중3');
  });

  it('학교명만 있고 학년 표기가 없으면 중등 수학', () => {
    expect(detectSubjectFromTitle('사직중 수학')).toBe('중등 수학');
  });

  it('"중등" 표기 + 학년-학기 → 해당 학기', () => {
    expect(detectSubjectFromTitle('중등 수학 2-1 모의고사')).toBe('중2-1 수학');
  });

  it('"26-3-1" 의 6-3 을 학년-학기로 잡지 않는다 (기존 가드)', () => {
    expect(detectSubjectFromTitle('26-3-1-M 학장중 수학')).toBe('중3-1 수학');
  });
});

describe('고등 과목 감지 (회귀 방지)', () => {
  it.each([
    ['25-1-1-M 해운대고 [공통수학1]', '공통수학1', '고1'],
    ['26년 부산고 대수 중간', '대수', '고2'],
    ['25년 경남고 확률과통계 기말', '확률과통계', '고2'],
    ['24년 구덕고 기하 중간', '기하', '고3'],
  ])('%s → %s / %s', (title, subject, grade) => {
    expect(detectSubjectFromTitle(title)).toBe(subject);
    expect(detectGradeFromTitle(title)).toBe(grade);
  });
});

describe('2015 수학(상)/(하) — 단일 과목으로 접지 않는다', () => {
  it('수학(상)/수학상 → 라벨 보존 (공통수학1 로 접으면 도형의방정식·집합 유형표를 못 본다)', () => {
    expect(detectSubjectFromTitle('[23년][1-1][중간][해운대고][수학상]')).toBe('수학(상)');
    expect(detectSubjectFromTitle('[24년][1-1][기말][부산고][수학(상)]')).toBe('수학(상)');
  });

  it('수학(하)/수학하 → 라벨 보존', () => {
    expect(detectSubjectFromTitle('[24년][1-2][중간][경남고][수학하]')).toBe('수학(하)');
  });

  it('학년은 여전히 고1', () => {
    expect(detectGradeFromTitle('[23년][1-1][중간][해운대고][수학상]')).toBe('고1');
  });
});
