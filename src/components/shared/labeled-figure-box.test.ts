import { describe, it, expect } from 'vitest';
import { detectLabeledFigureBox, type LabeledFigurePart } from './labeled-figure-box';

const T = (text: string): LabeledFigurePart => ({ type: 'text', text });
const F = (extra: Partial<LabeledFigurePart> = {}): LabeledFigurePart => ({ type: 'figure', text: '', ...extra });

describe('detectLabeledFigureBox', () => {
  it('줄바꿈으로 나뉜 ㄱ~ㄹ 그림 보기', () => {
    const r = detectLabeledFigureBox([T('함수의 그래프인 것은?\n<보기>\nㄱ.'), F(), T('\nㄴ.'), F(), T('\nㄷ.'), F(), T('\nㄹ.'), F(), T('\n끝')]);
    expect(r).not.toBeNull();
    expect(r!.labels).toEqual(['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ']);
    expect(r!.head).toBe('함수의 그래프인 것은?');
    expect(r!.figIdxs).toEqual([1, 3, 5, 7]);
    expect(r!.tailStart).toBe(8);
  });
  it('한 줄로 붙은 <보 기>ㄱ.[도형]ㄴ.[도형]', () => {
    const r = detectLabeledFigureBox([T('고르면?\n<보 기>ㄱ.'), F(), T('ㄴ.'), F()]);
    expect(r!.labels).toEqual(['ㄱ', 'ㄴ']);
    expect(r!.head).toBe('고르면?');
  });
  it('라벨 없는 그림 나열·그림 하나·폭 지정·사이 글이 있으면 건드리지 않는다', () => {
    expect(detectLabeledFigureBox([T('그림과 같이'), F(), T('이고'), F()])).toBeNull();
    expect(detectLabeledFigureBox([T('<보기>\nㄱ.'), F()])).toBeNull();
    expect(detectLabeledFigureBox([T('ㄱ.'), F({ widthPercent: 40 }), T('ㄴ.'), F()])).toBeNull();
    expect(detectLabeledFigureBox([T('ㄱ.'), F(), T('설명 글\nㄴ.'), F()])).toBeNull();
    expect(detectLabeledFigureBox([F(), T('ㄴ.'), F()])).toBeNull();
  });
});
