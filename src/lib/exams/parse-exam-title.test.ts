import { describe, it, expect } from 'vitest';
import {
  parseExamTitle,
  buildFacetOptions,
  matchesFacets,
  toggleFacet,
  hasAnyFacet,
  shortSummary,
  EMPTY_FACET_SELECTION,
} from './parse-exam-title';

describe('parseExamTitle — 운영 제목 형식', () => {
  it('표준 형식에서 여섯 축을 뽑는다', () => {
    const p = parseExamTitle('23-3-1-F 이사벨중 수학');
    expect(p).toEqual({
      year: '23', grade: '3', term: '1', kind: 'F',
      school: '이사벨중', schoolLevel: '중',
    });
  });

  it('중간고사(M)·2학기·고등도 처리', () => {
    expect(parseExamTitle('25-1-2-M 경남고 수학')).toMatchObject({
      year: '25', grade: '1', term: '2', kind: 'M', school: '경남고', schoolLevel: '고',
    });
  });

  it('소문자 f/m 도 대문자로 정규화', () => {
    expect(parseExamTitle('24-2-1-f 학장중 수학')?.kind).toBe('F');
    expect(parseExamTitle('24-2-1-m 학장중 수학')?.kind).toBe('M');
  });

  it('★ 학교명 앞 구분자가 하이픈인 표기도 처리 (운영에 두 표기 혼재, 15건)', () => {
    expect(parseExamTitle('26-2-1-M-분포중 수학')).toMatchObject({
      year: '26', grade: '2', term: '1', kind: 'M', school: '분포중', schoolLevel: '중',
    });
    expect(parseExamTitle('26-3-1-M-엄궁중 수학')?.school).toBe('엄궁중');
  });

  it('여중·여고 어미로 학교급 판정', () => {
    expect(parseExamTitle('25-3-1-F 사직여중 수학')?.schoolLevel).toBe('중');
    expect(parseExamTitle('25-2-1-F 주례여고 수학')?.schoolLevel).toBe('고');
  });

  it('★ 교재류 등 형식 밖 제목은 null — 느슨하게 잡으면 엉뚱한 축이 생긴다', () => {
    expect(parseExamTitle('쎈 중2-1')).toBeNull();
    expect(parseExamTitle('개념원리 중3 상')).toBeNull();
    expect(parseExamTitle('2025 진단평가 1회차')).toBeNull();
    expect(parseExamTitle('')).toBeNull();
    expect(parseExamTitle(null)).toBeNull();
    expect(parseExamTitle(undefined)).toBeNull();
  });

  it('학교명 없이 코드만 있으면 null (뒤 토막 필수)', () => {
    expect(parseExamTitle('23-3-1-F')).toBeNull();
  });

  it('학기는 1·2 만, 학년은 0 불가', () => {
    expect(parseExamTitle('23-3-3-F 이사벨중')).toBeNull();
    expect(parseExamTitle('23-0-1-F 이사벨중')).toBeNull();
  });

  it('shortSummary — 학교급이 있으면 붙인다', () => {
    expect(shortSummary(parseExamTitle('25-3-1-F 이사벨중 수학')!)).toBe('25 중3-1 기말');
    expect(shortSummary(parseExamTitle('25-1-2-M 경남고 수학')!)).toBe('25 고1-2 중간');
  });
});

describe('조건 필터', () => {
  const titles = [
    '25-3-1-F 이사벨중 수학',
    '23-3-1-F 이사벨중 수학',
    '25-2-1-M 학장중 수학',
    '24-2-1-F 학장중 수학',
    '25-1-2-M 경남고 수학',
    '쎈 중2-1',            // 파싱 불가
  ];
  const parsed = titles.map(parseExamTitle);

  it('조건이 없으면 전부 통과 — 기존 목록과 동일해야 한다', () => {
    expect(hasAnyFacet(EMPTY_FACET_SELECTION)).toBe(false);
    expect(parsed.every((p) => matchesFacets(p, EMPTY_FACET_SELECTION))).toBe(true);
  });

  it('학년 하나 고르면 그 학년만', () => {
    const sel = toggleFacet(EMPTY_FACET_SELECTION, 'grade', '3');
    const hits = parsed.filter((p) => matchesFacets(p, sel));
    expect(hits).toHaveLength(2);
    expect(hits.every((p) => p!.grade === '3')).toBe(true);
  });

  it('같은 축 여러 값은 OR, 다른 축끼리는 AND', () => {
    let sel = toggleFacet(EMPTY_FACET_SELECTION, 'grade', '2');
    sel = toggleFacet(sel, 'grade', '3');       // 2학년 OR 3학년
    sel = toggleFacet(sel, 'year', '25');        // AND 25년
    const hits = parsed.filter((p) => matchesFacets(p, sel));
    expect(hits.map((p) => p!.school)).toEqual(['이사벨중', '학장중']);
  });

  it('★ 조건이 걸리면 파싱 불가 항목은 빠진다 (조건이 무의미해지지 않게)', () => {
    const sel = toggleFacet(EMPTY_FACET_SELECTION, 'kind', 'F');
    const hits = parsed.filter((p) => matchesFacets(p, sel));
    expect(hits.every(Boolean)).toBe(true);
    expect(hits).toHaveLength(3);
  });

  it('토글은 두 번 누르면 해제되고 원본을 바꾸지 않는다', () => {
    const once = toggleFacet(EMPTY_FACET_SELECTION, 'term', '1');
    const twice = toggleFacet(once, 'term', '1');
    expect(once.term).toEqual(['1']);
    expect(twice.term).toEqual([]);
    expect(EMPTY_FACET_SELECTION.term).toEqual([]); // 불변
  });

  it('학교급 조건 — 학교급을 모르는 항목은 제외', () => {
    const sel = toggleFacet(EMPTY_FACET_SELECTION, 'level', '고');
    const hits = parsed.filter((p) => matchesFacets(p, sel));
    expect(hits.map((p) => p!.school)).toEqual(['경남고']);
  });
});

describe('buildFacetOptions — 존재하는 값만, 건수와 함께', () => {
  const parsed = [
    '25-3-1-F 이사벨중 수학',
    '23-3-1-F 이사벨중 수학',
    '25-2-1-M 학장중 수학',
    '쎈 중2-1',
  ].map(parseExamTitle);

  const opts = buildFacetOptions(parsed);

  it('연도는 최신순', () => {
    expect(opts.year.map((o) => o.value)).toEqual(['25', '23']);
    expect(opts.year[0].count).toBe(2);
  });

  it('학년·학기·구분 건수', () => {
    expect(opts.grade).toEqual([
      { value: '2', label: '2학년', count: 1 },
      { value: '3', label: '3학년', count: 2 },
    ]);
    expect(opts.kind.find((o) => o.value === 'F')?.count).toBe(2);
  });

  it('없는 값은 칩으로 안 나온다 (2학기 자료가 없으면 2학기 칩 없음)', () => {
    expect(opts.term.map((o) => o.value)).toEqual(['1']);
  });

  it('파싱 불가 건수를 따로 알려준다', () => {
    expect(opts.unparsed).toBe(1);
  });
});
