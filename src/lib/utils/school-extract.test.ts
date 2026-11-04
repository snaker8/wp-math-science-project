import { describe, it, expect } from 'vitest';
import { extractSchoolName, classifySchoolLevel, resolveSchoolName } from './school-extract';
import { extractSemester, extractExamType, parseExamCode } from './exam-meta-extract';
import { extractExamYear, extractExamYearFromTitle } from './year-extract';
import { normalizeSchoolName, schoolNameVariants } from './school-normalize';

// 2026-11-04 학교별 리포트 감사 — 실제 DB 제목들
describe('extractSchoolName', () => {
  it('기본 꼴', () => {
    expect(extractSchoolName('25-1-2-F 해운대고 대수')).toBe('해운대고');
    expect(extractSchoolName('23-2-1-M 사직여중 수학')).toBe('사직여중');
    expect(extractSchoolName('21 경남여고 수2 1학기 중간')).toBe('경남여고');
  });
  it('★ 대괄호·붙여쓰기·숫자 뒤 (종전 미분류)', () => {
    expect(extractSchoolName('[22년][1-1][기말][해운대고][수학상]')).toBe('해운대고');
    expect(extractSchoolName('24-2-1-M 엄궁중수학')).toBe('엄궁중');
    expect(extractSchoolName('25학년 엄궁중2 2학기 중간')).toBe('엄궁중');
    expect(extractSchoolName('25-1-2-F 청운고[대수]')).toBe('청운고');
    expect(extractSchoolName('260710_해운대여자중 3-1 기말 2026 원본_문제지')).toBe('해운대여자중');
  });
  it('★ 가장 앞에 나온 학교를 고른다 (종전엔 여고 패턴이 무조건 우선)', () => {
    expect(extractSchoolName('해운대고 대수 (해운대여고 참고)')).toBe('해운대고');
  });
  it('일반 단어는 학교가 아니다', () => {
    expect(extractSchoolName('최고 난도 모음')).toBeNull();
    expect(extractSchoolName('진행중 자료 참고')).toBeNull();
    expect(extractSchoolName('중간고사 대비 기말고사')).toBeNull();
    expect(extractSchoolName('15-03 교육청 고2 문과')).toBeNull();
    expect(extractSchoolName('BS_M1_R1 (중1 과정)')).toBeNull();
    expect(extractSchoolName('[2022개정] 기본 수학의 정석 확률과 통계 본문[2025]')).toBeNull();
  });
  it('resolveSchoolName — 컬럼 우선 + 표기 통일', () => {
    expect(resolveSchoolName({ title: 'x', school_name: '부산중앙여고' })).toBe('중앙여고');
    expect(resolveSchoolName({ title: 'x', school_name: '해운대여자중' })).toBe('해운대여중');
    expect(resolveSchoolName({ title: 'x', school_name: '포철고' })).toBe('포항제철고');
    expect(resolveSchoolName({ title: '21-3-1-F 부산내성중 수학', school_name: null })).toBe('내성중');
    expect(resolveSchoolName({ title: '04-11 평가원 고3 문과', school_name: null })).toBeNull();
  });
  it('schoolNameVariants — 별칭·줄기 포함', () => {
    expect(schoolNameVariants('포항제철고')).toEqual(expect.arrayContaining(['포항제철고', '포철고']));
    expect(schoolNameVariants('부산국제고')).toEqual(expect.arrayContaining(['부산국제고', '국제고']));
    expect(normalizeSchoolName('경남외고')).toBe('경남외고');
  });
});

describe('classifySchoolLevel', () => {
  it('★ 초량중·초읍중은 중학교 (종전 startsWith 초 → 초등)', () => {
    expect(classifySchoolLevel('초량중')).toBe('중');
    expect(classifySchoolLevel('초읍중')).toBe('중');
    expect(classifySchoolLevel('해운대초')).toBe('초');
    expect(classifySchoolLevel('해운대여고')).toBe('고');
  });
});

describe('학기·구분·년도 — 약식 코드 우선', () => {
  it('parseExamCode', () => {
    expect(parseExamCode('25-1-2-F 해운대고 대수')).toEqual({ year: 2025, grade: 1, semester: 2, type: '기말' });
    expect(parseExamCode('[25-1-2-f] 해운대고')).toEqual({ year: 2025, grade: 1, semester: 2, type: '기말' });
    expect(parseExamCode('26-3-1-M-동백중 수학')?.type).toBe('중간');
    expect(parseExamCode('15-03 교육청 고2 문과')).toBeNull();
  });
  it('★ 코드가 본문 표기보다 우선', () => {
    expect(extractSemester('25-1-2-F 해운대고 1학기 범위 복습')).toBe(2);
    expect(extractExamType('25-1-2-F 해운대고 중간범위 포함')).toBe('기말');
    expect(extractSemester('수1 학기말')).toBeNull();
    expect(extractSemester('26 경남고 기하 1학기 중간')).toBe(1);
    expect(extractExamType('21년 3월 고1 모의고사(과학)')).toBe('모의고사');
    expect(extractExamType('15-03 교육청 고2 문과')).toBe('모의고사');
  });
  it('년도', () => {
    expect(extractExamYearFromTitle('26 신곡중 2022개정 3-1')).toBe(2026);
    expect(extractExamYearFromTitle('[22년][1-1][기말][해운대고][수학상]')).toBe(2022);
    expect(extractExamYearFromTitle('21년 3월 고1 모의고사')).toBe(2021);
    expect(extractExamYearFromTitle('2024 동백중 기말')).toBe(2024);
    expect(extractExamYearFromTitle('로그함수,방부등식')).toBeNull();
    expect(extractExamYear('로그함수,방부등식', '2026-07-09T00:00:00Z')).toBe(2026);
  });
});
