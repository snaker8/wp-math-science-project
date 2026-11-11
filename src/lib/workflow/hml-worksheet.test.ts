import { describe, it, expect } from 'vitest';
import { parseWorksheetParagraphs, parseChapterPara } from './hml-worksheet';
import { solutionFromNote, type RawPara } from './hml-parser';

const chapterTab = '\\begin{tabular}{|c|}\\hline 07 공통수학1 \\\\ \\hline 06 이차함수와 이차방정식 \\\\ \\hline 02 이차함수의 최대와 최소 \\\\ \\hline 05 이차함수의 Mm5 (케이스 분류) \\\\ \\hline\\end{tabular}';

describe('solutionFromNote', () => {
  it('[해설] 뒤만, 그림은 [해설] 뒤 [도형] 몫만', () => {
    const r = solutionFromNote({ text: '[정답] ④ [도형]\n[해설]\n풀이 [도형]\n끝', images: ['a', 'b'] });
    expect(r).toEqual({ solution: '풀이 [도형]\n끝', images: ['b'] });
  });
  it('[해설] 없으면 null', () => {
    expect(solutionFromNote({ text: '[정답] ②', images: [] })).toBeNull();
  });
});

describe('parseChapterPara', () => {
  it('표로 복원된 유형 경로', () => {
    expect(parseChapterPara(chapterTab)).toEqual(['07 공통수학1', '06 이차함수와 이차방정식', '02 이차함수의 최대와 최소', '05 이차함수의 Mm5 (케이스 분류)']);
  });
});

describe('parseWorksheetParagraphs (수학비서 내 문제지 출제본)', () => {
  const p = (text: string, notes?: { text: string; images: string[] }[]): RawPara => ({ text, images: [], answer: '', ...(notes ? { notes } : {}) });
  const paras: RawPara[] = [
    p(`_해설수집_묶음 작업공간 ${chapterTab}`),
    p('내신 2025년 부산시 해운대구 해운대고 고1 공통 1학기 기말 공통수학1 > 1 [5.4점]'),
    p('$x \\geq 1$에서 최댓값이 $3$일 때, $k$의 값은?', [{ text: '[정답] ④\n[해설]\n축의 위치에 따라\n$k=\\sqrt{2}$', images: [] }]),
    p('① $-5$② $1$'),
    p(chapterTab),
    p('[24년][1-2][기말][상산고][수학하] > 7 [4.6점]'),
    p('두 집합에 대하여 값은?', [{ text: '[정답] $22$\n[해설]\n[도형]\n따라서 $22$', images: ['img'] }]),
    p('_해설수집_묶음 (빠른 정답)'),
    p('[정답] ④'),
  ];
  const items = parseWorksheetParagraphs(paras);

  it('출처 줄마다 한 문항, 빠른 정답에서 멈춤', () => {
    expect(items.map((i) => [i.sourceTitle, i.number, i.points])).toEqual([
      ['내신 2025년 부산시 해운대구 해운대고 고1 공통 1학기 기말 공통수학1', 1, 5.4],
      ['[24년][1-2][기말][상산고][수학하]', 7, 4.6],
    ]);
  });
  it('정답·해설·그림·유형', () => {
    expect(items[0].answer).toBe('④');
    expect(items[0].solution).toBe('축의 위치에 따라\n$k=\\sqrt{2}$');
    expect(items[0].chapter[0]).toBe('07 공통수학1');
    expect(items[1].answer).toBe('$22$');
    expect(items[1].solutionImages).toEqual(['img']);
  });
  it('다음 문항의 유형 표는 앞 문항 본문에 안 붙는다', () => {
    expect(items[0].stem).not.toContain('tabular');
    expect(items[0].stem).toContain('① $-5$');
  });
});
