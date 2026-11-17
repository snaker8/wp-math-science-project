import { describe, it, expect } from 'vitest';
import { detectChoiceLayoutFromLines, relaxVerticalForShortChoices, type OcrLineBox } from './choice-layout';

const box = (text: string, x: number, y: number, w = 100, h = 30): OcrLineBox => ({
  text,
  cnt: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
});

describe('detectChoiceLayoutFromLines', () => {
  it('3열 원본 — 보기마다 줄이 따로 와도 같은 높이면 한 행 (①②③ / ④⑤)', () => {
    const lines = [
      box('다음 중 옳은 것은?', 0, 0, 600),
      box('① 1', 0, 100), box('② 2', 200, 102), box('③ 3', 400, 98),
      box('④ 4', 0, 150), box('⑤ 5', 200, 151),
    ];
    expect(detectChoiceLayoutFromLines(lines)).toBe(3);
  });
  it('3열 원본 — 한 행이 한 줄로 온 경우', () => {
    expect(detectChoiceLayoutFromLines([box('① 1 ② 2 ③ 3', 0, 100, 600), box('④ 4 ⑤ 5', 0, 150, 400)])).toBe(3);
  });
  it('가로 5개', () => {
    const lines = [0, 1, 2, 3, 4].map((i) => box(`${'①②③④⑤'[i]} ${i}`, i * 120, 100));
    expect(detectChoiceLayoutFromLines(lines)).toBe(5);
  });
  it('2열 (①② / ③④ / ⑤)', () => {
    const lines = [
      box('① a', 0, 100), box('② b', 300, 100),
      box('③ c', 0, 150), box('④ d', 300, 150),
      box('⑤ e', 0, 200),
    ];
    expect(detectChoiceLayoutFromLines(lines)).toBe(2);
  });
  it('세로 — 한 행에 하나씩', () => {
    const lines = [0, 1, 2, 3, 4].map((i) => box(`${'①②③④⑤'[i]} 긴 보기 문장`, 0, 100 + i * 50, 500));
    expect(detectChoiceLayoutFromLines(lines)).toBe(1);
  });
  it('수식 모드 (1)~(5) 줄 머리', () => {
    const lines = [
      box('(1) $y=x$', 0, 100), box('(2) $y=2x$', 200, 100), box('(3) $y=3x$', 400, 100),
      box('(4) $y=4x$', 0, 150), box('(5) $y=5x$', 200, 150),
    ];
    expect(detectChoiceLayoutFromLines(lines)).toBe(3);
  });
  it('본문 중간의 ①·보기가 다 안 잡힌 경우는 확정하지 않는다', () => {
    expect(detectChoiceLayoutFromLines([box('위 ①~⑤ 중 옳은 것은?', 0, 0, 600)])).toBeUndefined();
    expect(detectChoiceLayoutFromLines([box('① 1', 0, 100), box('② 2', 200, 100)])).toBeUndefined();
    expect(detectChoiceLayoutFromLines([])).toBeUndefined();
    expect(detectChoiceLayoutFromLines([{ text: '① 1 ② 2 ③ 3 ④ 4 ⑤ 5' }])).toBeUndefined();
  });
});

describe('relaxVerticalForShortChoices', () => {
  const BS = String.fromCharCode(92);
  const deg = [45, 50, 55, 60, 65].map((n, i) => `(${i + 1}) $${n}^{${BS}circ}$`);
  it('세로 + 짧은 보기 → 3열 (학장중 #1: 보기 왼쪽 세로·그림 오른쪽)', () => {
    expect(relaxVerticalForShortChoices(1, deg)).toBe(3);
    expect(relaxVerticalForShortChoices(1, [`$${BS}frac{1}{2}$`, `$${BS}sqrt{3}$`, '$-2$', '$4$', '$10$'])).toBe(3);
  });
  it('세로 + 문장형 보기 → 원본대로 세로', () => {
    expect(relaxVerticalForShortChoices(1, ['두 직선은 서로 평행하다.', '1', '2', '3', '4'])).toBe(1);
  });
  it('세로가 아니면 그대로', () => {
    expect(relaxVerticalForShortChoices(2, deg)).toBe(2);
    expect(relaxVerticalForShortChoices(5, deg)).toBe(5);
    expect(relaxVerticalForShortChoices(undefined, deg)).toBeUndefined();
  });
});
