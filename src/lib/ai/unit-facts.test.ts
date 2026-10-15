import { describe, it, expect } from 'vitest';
import { buildUnitFacts, describeRange, formatUnitFactsForPrompt, reconcileUnitAnalyses, reconcileSummaryCounts, judgeOverallDifficulty } from './unit-facts';

const P = [
  { number: 1, majorUnit: '정비례와 반비례', semester: '중1-1' },
  { number: 2, majorUnit: '정비례와 반비례', semester: '중1-1' },
  { number: 3, majorUnit: '기본 도형', semester: '중1-2' },
  { number: 5, majorUnit: '정비례와 반비례', semester: '중1-1' },
  { number: 4, majorUnit: '위치 관계', semester: '중1-2' },
];

describe('buildUnitFacts / describeRange', () => {
  it('문항 번호 순으로 단원을 세고 학기를 붙인다', () => {
    const f = buildUnitFacts(P);
    expect(f.map((x) => [x.majorUnit, x.count, x.numbers.join(','), x.semester])).toEqual([
      ['정비례와 반비례', 3, '1,2,5', '중1-1'],
      ['기본 도형', 1, '3', '중1-2'],
      ['위치 관계', 1, '4', '중1-2'],
    ]);
    expect(describeRange(f)).toBe('중1-1 정비례와 반비례 + 중1-2 기본 도형·위치 관계');
    expect(formatUnitFactsForPrompt(f, 5)).toContain('두 학기에 걸쳐');
  });
});

describe('reconcileUnitAnalyses', () => {
  it('AI 가 센 번호는 버리고 표의 번호로, 지어낸 단원은 버리고, 빠진 단원은 채운다', () => {
    const f = buildUnitFacts(P);
    const ai = [
      { majorUnit: '정비례와  반비례', questionNumbers: [1, 2, 5, 9], keyPoints: 'k', strategy: 's' },
      { majorUnit: '다항식', questionNumbers: [7], keyPoints: 'x', strategy: 'y' },
      { majorUnit: '위치 관계', questionNumbers: [4], keyPoints: 'k2', strategy: 's2' },
    ];
    const { result, dropped, added } = reconcileUnitAnalyses(ai, f);
    expect(result.map((r) => [r.majorUnit, r.questionNumbers.join(','), r.keyPoints])).toEqual([
      ['정비례와 반비례', '1,2,5', 'k'],
      ['기본 도형', '3', ''],
      ['위치 관계', '4', 'k2'],
    ]);
    expect(dropped).toEqual(['다항식']);
    expect(added).toEqual(['기본 도형']);
  });
});

describe('reconcileSummaryCounts', () => {
  it('"단원(9문항)"·"단원 9문항" 을 표의 수로 고친다, 맞는 건 그대로', () => {
    const f = buildUnitFacts(P);
    const { text, fixed } = reconcileSummaryCounts('정비례와 반비례(9문항)와 위치 관계 1문항, 기본 도형(총 2문항)이 뒤를 잇습니다.', f);
    expect(text).toBe('정비례와 반비례(3문항)와 위치 관계 1문항, 기본 도형(총 1문항)이 뒤를 잇습니다.');
    expect(fixed).toBe(2);
  });
});

describe('judgeOverallDifficulty — 수학비서 1~10 척도', () => {
  it('평균 반올림 → 쉬움1~2 평이 · 3~4 보통 · 5~6 난이도 있음 · 7+ 매우', () => {
    expect(judgeOverallDifficulty([2, 2, 1, 2]).label).toBe('평이');            // 1.75→2
    expect(judgeOverallDifficulty([3, 3, 4, 4, 4]).label).toBe('보통');          // 3.6→4 (동백중 3.55 도 보통)
    expect(judgeOverallDifficulty([4, 4, 5, 4, 5]).label).toBe('보통');          // 4.4→4 (센텀여고 4.32)
    expect(judgeOverallDifficulty([4, 5, 5, 5, 5]).label).toBe('난이도 있음');   // 4.8→5
    expect(judgeOverallDifficulty([7, 7, 8, 6]).label).toBe('매우 난이도 있음'); // 7
  });
  it('7 이상이 1/4 넘으면 한 칸 올린다', () => {
    expect(judgeOverallDifficulty([3, 3, 3, 3, 7, 7]).label).toBe('난이도 있음'); // 평균 4.3 보통 → 7+ 33% → 한 칸 위
  });
});
