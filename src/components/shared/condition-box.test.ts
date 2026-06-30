import { describe, it, expect } from 'vitest';
// 실제 배포 함수 직접 import (복제 금지 원칙)
import { convertChoiceTabularBox, extractConditionBoxes } from './box-conversion';

// 동인고 #13 실제 parseHml content
const C13 = '실수 $a$, $b$에 대하여 이차함수 $f \\left(x \\right)= \\left(x-a \\right)^{2}+b$가 다음 조건을 만족시킨다.\n\\begin{tabular}{|c|}\\hline (가) $2 \\le x \\le 10$에서 함수 $f \\left(x \\right)$의 최솟값은 $0$이다. \\\\ \\hline (나) $2 \\le x \\le 6$에서 함수 $f \\left(x \\right)$의 최댓값과 $6 \\le x \\le 10$에서 함수 $f \\left(x \\right)$의 최솟값은 같다. \\\\ \\hline\\end{tabular}\n$f \\left(-1 \\right)$의 최댓값과 최솟값의 합을 구하시오. (단, $0 \\le a$)';

function pipeline(content: string) {
  const protectedBody = content.replace(/\\begin\{(?:tabular|array)\}[\s\S]*?\\end\{(?:tabular|array)\}/g, (m) => convertChoiceTabularBox(m));
  return extractConditionBoxes(protectedBody);
}

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
