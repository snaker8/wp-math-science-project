import { describe, it, expect } from 'vitest';
import { parseExamTitleMeta } from './exam-title-meta';

// ============================================================================
// 회귀 — 2026-09-02 학교기출 탭 실사고
//
// 적재한 시험지 1,741건 중 school_name 이 있는 건 40건뿐이라, 출제 화면
// 학교기출 탭이 "매칭 시험지 200건"만 보여줬다. 원인은 createExamFromHml 이
// 학교 메타 컬럼을 아예 안 채운 것. 제목에서 파생하도록 고쳤다.
//
// ★ 여기서 제일 중요한 건 "안 잡는 것" — 진단평가·모의고사·교재가 학교기출로
//   둔갑하면 탭이 오염된다. 확실할 때만 값을 만든다.
// ============================================================================

describe('parseExamTitleMeta', () => {
  it('공백 구분자 — 일괄 적재 형식', () => {
    expect(parseExamTitleMeta('25-1-2-M 신도중 수학')).toEqual({
      schoolName: '신도중', grade: '중1', semester: 2, examRound: '중간',
      examYear: 2025, gradeNum: 1,
    });
  });

  // 화면 업로드로 들어온 실적. 공백만 보면 17건을 놓친다.
  it('하이픈 구분자 — 화면 업로드 형식', () => {
    expect(parseExamTitleMeta('26-2-1-M-동백중 수학')).toEqual({
      schoolName: '동백중', grade: '중2', semester: 1, examRound: '중간',
      examYear: 2026, gradeNum: 2,
    });
  });

  it('F = 기말, 고등학교는 고N', () => {
    expect(parseExamTitleMeta('23-1-2-F 혜광고 수학(하)')).toEqual({
      schoolName: '혜광고', grade: '고1', semester: 2, examRound: '기말',
      examYear: 2023, gradeNum: 1,
    });
  });

  it('대괄호 형식', () => {
    expect(parseExamTitleMeta('[22년][1-1][기말][해운대고][수학상]')).toEqual({
      schoolName: '해운대고', grade: '고1', semester: 1, examRound: '기말',
      examYear: 2022, gradeNum: 1,
    });
  });

  // 학교명에 과목이 딸려 들어와 `청운고[대수]` 가 학교명이 될 뻔했다.
  it('학교명에 붙은 대괄호 과목을 떼어낸다', () => {
    expect(parseExamTitleMeta('25-1-2-F 청운고[대수]')?.schoolName).toBe('청운고');
  });

  // ── 잡으면 안 되는 것들 (탭 오염 방지) ──
  it.each([
    ['BS_H1S1_R1 (공통수학1)', '진단평가'],
    ['중2-1 F 진단평가A(연립일차방정식~일차함수)', '진단평가'],
    ['고1 모의고사 21년 3월', '모의고사'],
    ['[2022개정] 기본 수학의 정석 확률과 통계 본문[2025]', '교재'],
    ['경남고[수열][26년]', '단원별 — 학년·학기·회차가 없다'],
    ['수열[26년]', '단원별'],
    ['중3-2 성취도 평가 (중간고사) - 23 해강중 3-2', '성취도'],
  ])('학교기출이 아니면 null 로 둔다: %s (%s)', (title) => {
    expect(parseExamTitleMeta(title)).toBeNull();
  });

  it('학년·학기가 범위를 벗어나면 잡지 않는다', () => {
    expect(parseExamTitleMeta('25-7-2-M 신도중 수학')).toBeNull();
    expect(parseExamTitleMeta('25-1-5-M 신도중 수학')).toBeNull();
  });

  // 학교급을 모르면 grade 를 비운다 — 억지로 중/고를 찍지 않는다.
  it('학교명이 중/고로 안 끝나면 grade 는 null, 나머지는 채운다', () => {
    const r = parseExamTitleMeta('25-1-2-M 부산국제학교 수학');
    expect(r?.schoolName).toBe('부산국제학교');
    expect(r?.grade).toBeNull();
    expect(r?.semester).toBe(2);
  });

  it('빈 문자열에 죽지 않는다', () => {
    expect(parseExamTitleMeta('')).toBeNull();
  });
});
