import { describe, it, expect } from 'vitest';
import {
  BAND_SCHEMES, bandOf, judgeCell, isWeakLevel, subjectOf, midOf, unitOf, MIN_JUDGE, MIN_MASTER,
} from './mastery-bands';
import { inferCells } from './mastery-infer';

describe('mastery-bands · 난이도 밴드', () => {
  it('4단계: 1~10 전 구간이 빈틈없이 들어간다', () => {
    for (let d = 1; d <= 10; d += 1) expect(bandOf(d, 4)).not.toBeNull();
    expect(bandOf(3)).toBe('A');
    expect(bandOf(4)).toBe('B');
    expect(bandOf(5)).toBe('B');
    expect(bandOf(6)).toBe('C');
    expect(bandOf(8)).toBe('D');
    expect(bandOf(10)).toBe('D');
  });

  it('6단계: 실력·심화가 하/중으로 갈린다 (매쓰홀릭 6단계 토글)', () => {
    for (let d = 1; d <= 10; d += 1) expect(bandOf(d, 6)).not.toBeNull();
    expect(bandOf(6, 6)).toBe('C1');
    expect(bandOf(7, 6)).toBe('C2');
    expect(bandOf(8, 6)).toBe('D1');
    expect(bandOf(9, 6)).toBe('D2');
  });

  it('enum 문자열(classifications.difficulty)도 받는다', () => {
    expect(bandOf('2')).toBe('A');
    expect(bandOf('7')).toBe('C');
  });

  it('없거나 이상한 값은 null — 난이도 미상으로 빠진다', () => {
    expect(bandOf(null)).toBeNull();
    expect(bandOf(undefined)).toBeNull();
    expect(bandOf('')).toBeNull();
    expect(bandOf(0)).toBeNull();
    expect(bandOf(11)).toBeNull();
    expect(bandOf('x')).toBeNull();
  });

  it('두 스킴 모두 levels 합이 enum 라벨과 정확히 일치한다 (.in() 에 그대로 넘긴다)', () => {
    for (const scheme of [4, 6] as const) {
      const all = BAND_SCHEMES[scheme].flatMap((b) => b.levels).sort((a, b) => Number(a) - Number(b));
      expect(all).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    }
  });
});

describe('mastery-bands · 칸 판정', () => {
  it('문항 0 = 미학습', () => {
    expect(judgeCell(0, 0)).toEqual({ level: 'none', pct: null });
  });

  it('★ 1~2문항은 색을 주지 않는다 — 한 문제로 마스터/약점을 만들면 소음이 신호가 된다', () => {
    expect(judgeCell(1, 1)).toEqual({ level: 'thin', pct: 100 });
    expect(judgeCell(1, 0)).toEqual({ level: 'thin', pct: 0 });
    expect(judgeCell(MIN_JUDGE - 1, 1)).toMatchObject({ level: 'thin' });
  });

  it('마스터는 정답률 90 이상 + 문항 MIN_MASTER 이상', () => {
    expect(judgeCell(MIN_MASTER, MIN_MASTER).level).toBe('master');
    expect(judgeCell(3, 3).level).toBe('good');   // 3문항 다 맞아도 마스터는 아니다
  });

  it('구간 경계', () => {
    expect(judgeCell(10, 8).level).toBe('good');    // 80
    expect(judgeCell(10, 7).level).toBe('shaky');   // 70
    expect(judgeCell(10, 6).level).toBe('shaky');   // 60
    expect(judgeCell(10, 5).level).toBe('weak');    // 50
    expect(judgeCell(10, 3).level).toBe('weak');    // 30
    expect(judgeCell(10, 2).level).toBe('severe');  // 20
  });

  it('correct 가 n 을 넘어도 100 에서 막는다', () => {
    expect(judgeCell(3, 5).pct).toBe(100);
  });

  it('과제 대상은 색 붙은 것 중 80 미만', () => {
    expect(isWeakLevel('shaky')).toBe(true);
    expect(isWeakLevel('weak')).toBe(true);
    expect(isWeakLevel('severe')).toBe(true);
    expect(isWeakLevel('good')).toBe(false);
    expect(isWeakLevel('thin')).toBe(false);
    expect(isWeakLevel('none')).toBe(false);
  });
});

describe('mastery-bands · 코드 접두어', () => {
  it('과목 · 중단원 · 소단원', () => {
    expect(subjectOf('MS05-06-02-01-03')).toBe('MS05');
    expect(midOf('MS05-06-02-01-03')).toBe('MS05-06-02');
    expect(unitOf('MS05-06-02-01-03')).toBe('MS05-06-02-01');
    expect(unitOf('MS05-06-02-01')).toBe('MS05-06-02-01');
  });
  it('소단원까지 안 내려간 코드는 칸에 못 놓는다', () => {
    expect(unitOf('MS05')).toBeNull();
    expect(unitOf('MS05-06')).toBeNull();
    expect(unitOf('MS05-06-02')).toBeNull();
    expect(midOf('MS05-06')).toBeNull();
  });
});

describe('mastery-infer · 추정 (매쓰홀릭 원형 칸)', () => {
  const bands = BAND_SCHEMES[4];
  const unitsByMid = new Map([['M-01-01', ['M-01-01-01', 'M-01-01-02', 'M-01-01-03', 'M-01-01-04']]]);
  const names = new Map([['M-01-01-01', '가'], ['M-01-01-02', '나'], ['M-01-01-03', '다'], ['M-01-01-04', '라']]);
  const universe = (units: string[]) => units.flatMap((u) => bands.map((b) => ({ unit: u, band: b.key })));

  it('판정이 서 있는 칸은 추정하지 않는다', () => {
    const out = inferCells(
      [{ unit: 'M-01-01-01', band: 'A', n: 5, correct: 5 }],
      universe(['M-01-01-01']), unitsByMid, bands, names,
    );
    expect(out.has('M-01-01-01|A')).toBe(false);
  });

  it('R1 어려운 밴드를 잘하면 쉬운 밴드는 잘함으로 — 근거 문장이 붙는다', () => {
    const out = inferCells(
      [{ unit: 'M-01-01-01', band: 'C', n: 6, correct: 6 }],
      universe(['M-01-01-01']), unitsByMid, bands, names,
    );
    expect(out.get('M-01-01-01|A')).toMatchObject({ level: 'good' });
    expect(out.get('M-01-01-01|B')).toMatchObject({ level: 'good' });
    expect(out.get('M-01-01-01|A')?.basis).toContain('실력 100%');
    // 위(더 어려운 D)는 근거 없음 — 올려 추정하지 않는다
    expect(out.has('M-01-01-01|D')).toBe(false);
  });

  it('R2 쉬운 밴드가 약점이면 어려운 밴드도 약점 — 불안정(shaky)은 근거로 안 쓴다', () => {
    const out = inferCells(
      [{ unit: 'M-01-01-01', band: 'A', n: 5, correct: 1 }],
      universe(['M-01-01-01']), unitsByMid, bands, names,
    );
    expect(out.get('M-01-01-01|B')).toMatchObject({ level: 'weak' });
    expect(out.get('M-01-01-01|D')).toMatchObject({ level: 'weak' });

    const shaky = inferCells(
      [{ unit: 'M-01-01-01', band: 'A', n: 5, correct: 3 }],  // 60% shaky
      universe(['M-01-01-01']), unitsByMid, bands, names,
    );
    expect(shaky.has('M-01-01-01|B')).toBe(false);
  });

  it('R3 형제 소단원 2개 이상이 판정돼야 평균으로 추정하고, 마스터는 주지 않는다', () => {
    const one = inferCells(
      [{ unit: 'M-01-01-02', band: 'A', n: 5, correct: 5 }],
      universe(['M-01-01-01', 'M-01-01-02']), unitsByMid, bands, names,
    );
    expect(one.has('M-01-01-01|A')).toBe(false);   // 형제 1개 — 부족

    const two = inferCells(
      [
        { unit: 'M-01-01-02', band: 'A', n: 5, correct: 5 },
        { unit: 'M-01-01-03', band: 'A', n: 5, correct: 5 },
      ],
      universe(['M-01-01-01', 'M-01-01-02', 'M-01-01-03']), unitsByMid, bands, names,
    );
    const c = two.get('M-01-01-01|A');
    expect(c?.level).toBe('good');           // 100% 지만 마스터 X
    expect(c?.basis).toContain('2개 소단원');
  });

  it('R3 이 칸에 1~2문항이 있으면 사전분포와 섞는다 — 1문항 오답이 곧바로 심각이 되지 않는다', () => {
    const out = inferCells(
      [
        { unit: 'M-01-01-01', band: 'A', n: 1, correct: 0 },   // 판정 보류 칸
        { unit: 'M-01-01-02', band: 'A', n: 10, correct: 9 },
        { unit: 'M-01-01-03', band: 'A', n: 10, correct: 9 },
      ],
      universe(['M-01-01-01', 'M-01-01-02', 'M-01-01-03']), unitsByMid, bands, names,
    );
    const c = out.get('M-01-01-01|A');
    expect(c).toBeDefined();
    // (0 + 0.9*2) / (1 + 2) = 60%
    expect(c?.pct).toBe(60);
    expect(c?.level).toBe('shaky');
    expect(c?.basis).toContain('이 칸 1문항 0%');
  });
});
