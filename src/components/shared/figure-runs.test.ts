import { describe, it, expect } from 'vitest';
import { groupFigureRuns, type FigRunPart } from './figure-runs';

const T = (text: string): FigRunPart => ({ type: 'text', text });
const F = (extra: Partial<FigRunPart> = {}): FigRunPart => ({ type: 'figure', text: '', ...extra });

describe('groupFigureRuns', () => {
  it('해운대여고 #8 — 붙은 그림 2개 + 대괄호 캡션', () => {
    const g = groupFigureRuns([T('도형의 방정식은?\n'), F(), F(), T('[그림$1$][그림$2$]')]);
    expect(g).toEqual([
      { kind: 'text', text: '도형의 방정식은?\n', partIndex: 0 },
      { kind: 'run', figIdxs: [0, 1], captions: ['[그림$1$]', '[그림$2$]'], partIndex: 1 },
    ]);
  });
  it('부산외고 #15 — 캡션 없는 붙은 그림', () => {
    const g = groupFigureRuns([T('넓이는?\n'), F(), F()]);
    expect(g[1]).toEqual({ kind: 'run', figIdxs: [0, 1], captions: [], partIndex: 1 });
  });
  it('캡션 수가 안 맞거나 캡션 뒤에 글이 있으면 글은 그대로 남긴다', () => {
    const a = groupFigureRuns([F(), F(), T('[그림1] 설명')]);
    expect(a).toEqual([
      { kind: 'run', figIdxs: [0, 1], captions: [], partIndex: 0 },
      { kind: 'text', text: '[그림1] 설명', partIndex: 2 },
    ]);
    const b = groupFigureRuns([F(), F(), T('[가][나]\n이때 값은?')]);
    expect(b[0]).toMatchObject({ kind: 'run', captions: ['[가]', '[나]'] });
    expect(b[1]).toEqual({ kind: 'text', text: '이때 값은?', partIndex: 2 });
  });
  it('떨어진 그림·폭 지정 그림은 런이 아니다 (그림 번호는 순서대로)', () => {
    const g = groupFigureRuns([F(), T('그리고'), F({ widthPercent: 40 }), F(), F()]);
    expect(g.map((x) => x.kind)).toEqual(['figure', 'text', 'figure', 'run']);
    expect(g[3]).toMatchObject({ figIdxs: [2, 3] });
  });
});
