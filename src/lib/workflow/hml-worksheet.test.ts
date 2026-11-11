import { describe, it, expect } from 'vitest';
import { parseWorksheetParagraphs, parseChapterPara, stripWorksheetHeader, sourceLineOf } from './hml-worksheet';
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

describe('stripWorksheetHeader — 출제본을 일반 파서로 읽을 때 본문 앞 유형 표·출처 줄 걷기', () => {
  const head = `${chapterTab}\n2010년(2011학년도) 교육청 고3 이과 03월 > 2 [2점]\n`;
  it('유형 표 + 출처 줄 제거', () => {
    expect(stripWorksheetHeader(head + '$\log _{5} 3$의 값은?')).toBe('$\log _{5} 3$의 값은?');
  });
  it('출처 줄만 있어도 제거', () => {
    expect(stripWorksheetHeader('EBS 수능특강 수학2 > 15\n본문')).toBe('본문');
  });
  it('본문 자료표는 그대로', () => {
    const data = '\begin{tabular}{|c|c|}\hline $x$ & 1 \\ \hline\end{tabular}\n표를 보고 답하시오.';
    expect(stripWorksheetHeader(data)).toBe(data);
  });
  it('머리 없는 본문은 그대로', () => {
    expect(stripWorksheetHeader('$a>3$일 때 값은?')).toBe('$a>3$일 때 값은?');
  });
  it('출처 줄에서 원래 번호·배점', () => {
    expect(sourceLineOf(head + '본문')).toEqual({ title: '2010년(2011학년도) 교육청 고3 이과 03월', number: 2, points: 2 });
  });
});

describe('stripWorksheetHeader — 다음 문항 머리가 끝에 붙은 경우(시중교재 묶음)', () => {
  it('끝의 유형 표 + 출처 줄 제거', () => {
    const c = `본문 $f(a^2)$의 값을 구하시오.\n${chapterTab}\n2025년(2026학년도) 교육청 고2 공통 03월 > 19 [4점]`;
    expect(stripWorksheetHeader(c)).toBe('본문 $f(a^2)$의 값을 구하시오.');
  });
  it('끝의 유형 표만(출처 줄 없음)', () => {
    expect(stripWorksheetHeader(`본문\n${chapterTab}`)).toBe('본문');
  });
});

describe('stripWorksheetHeader — 번호 없는 문항의 출처 줄(교재명 > 꼬리표)', () => {
  it('교재명을 주면 그 이름으로 시작하는 출처 줄을 지운다', () => {
    const c = '본문 $x>y$ 일 때 값을 구하시오.\n2025년 봉샘스쿨 올미 공통수학1 > 수행평가 > 변형1';
    expect(stripWorksheetHeader(c, ['2025년 봉샘스쿨 올미 공통수학1'])).toBe('본문 $x>y$ 일 때 값을 구하시오.');
  });
  it('교재명이 없어도 수식 없는 `A > B` 줄은 출처 줄로 지운다(공유 문항은 다른 교재명이 찍힌다)', () => {
    const c = '본문\n2026년 씨에스엠 기출리버스 수학1 변형편 > 숫자변형 > 2019년 시행 6월 수능 21번 변형';
    expect(stripWorksheetHeader(c)).toBe('본문');
  });
  it('수식 안의 부등호 줄은 그대로', () => {
    expect(stripWorksheetHeader('조건\n$a > b > 0$ 일 때')).toBe('조건\n$a > b > 0$ 일 때');
  });
});
