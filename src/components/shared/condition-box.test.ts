import { describe, it, expect } from 'vitest';
// 실제 배포 함수 직접 import (복제 금지 원칙)
import { convertChoiceTabularBox, extractConditionBoxes } from './box-conversion';

// 동인고 #13 실제 parseHml content
const C13 = '실수 $a$, $b$에 대하여 이차함수 $f \\left(x \\right)= \\left(x-a \\right)^{2}+b$가 다음 조건을 만족시킨다.\n\\begin{tabular}{|c|}\\hline (가) $2 \\le x \\le 10$에서 함수 $f \\left(x \\right)$의 최솟값은 $0$이다. \\\\ \\hline (나) $2 \\le x \\le 6$에서 함수 $f \\left(x \\right)$의 최댓값과 $6 \\le x \\le 10$에서 함수 $f \\left(x \\right)$의 최솟값은 같다. \\\\ \\hline\\end{tabular}\n$f \\left(-1 \\right)$의 최댓값과 최솟값의 합을 구하시오. (단, $0 \\le a$)';

function pipeline(content: string) {
  const protectedBody = content.replace(/\\begin\{(?:tabular|array)\}[\s\S]*?\\end\{(?:tabular|array)\}/g, (m) => convertChoiceTabularBox(m));
  return extractConditionBoxes(protectedBody);
}

describe('extractConditionBoxes — 「(가)는 …」 지칭 문장은 박스 아님 (온천중 25-1-2-F #11)', () => {
  const C11 = '(가)는 한 변의 길이가 $6 { {cm} }$인 정사각형을 밑면으로 하는 사각뿔의 전개도이다. (나)는 사각기둥이다. (가)와 (나)의 겉넓이가 같을 때, $x$의 값은? (단, (가)의 옆면은 모두 합동이다.)\n[도형][도형]';
  it('★ 본문이 통째로 조건 박스가 되지 않는다', () => {
    const { conditionBoxes, mainContent } = pipeline(C11);
    expect(conditionBoxes).toHaveLength(0);
    expect(mainContent).toContain('(가)는 한 변의');
  });
  it('조건 항목 「(가) 모든 …」 은 여전히 박스', () => {
    const { conditionBoxes } = pipeline('다음 조건을 만족시킨다.\n(가) 모든 실수 $x$에 대하여 $f(x)>0$\n(나) $f(1)=2$\n$f(3)$의 값을 구하시오.');
    expect(conditionBoxes).toHaveLength(1);
  });
  it('「(가) 는 …」 처럼 띄어 쓴 지칭도 박스 아님', () => {
    expect(pipeline('(가) 는 정사각형이다. (나)의 넓이는?').conditionBoxes).toHaveLength(0);
  });
});

describe('extractConditionBoxes (실제 함수) — 동인고 #13 문제문장이 박스로 안 딸려감', () => {
  it('★★ "구하시오" 문제문장은 박스 밖(mainContent), 박스엔 (가)(나)만', () => {
    const { mainContent, conditionBoxes } = pipeline(C13);
    const boxText = conditionBoxes.join('\n');
    expect(boxText).toContain('(가)');
    expect(boxText).toContain('(나)');
    expect(boxText).not.toContain('구하시오');     // ★ 문제문장이 박스 안에 들어가면 안 됨
    expect(mainContent).toContain('구하시오');       // ★ 문제문장은 본문에
  });

  it('★ 빈 줄이 collapse 돼도(구분자 없어도) "구하시오"가 블록 종료', () => {
    // 박스와 문제문장 사이 개행을 없앤 최악 케이스
    const collapsed = C13.replace(/\\end\{tabular\}\n/, '\\end{tabular}');
    const { mainContent, conditionBoxes } = pipeline(collapsed);
    expect(conditionBoxes.join('\n')).not.toContain('구하시오');
    expect(mainContent).toContain('구하시오');
  });
});
