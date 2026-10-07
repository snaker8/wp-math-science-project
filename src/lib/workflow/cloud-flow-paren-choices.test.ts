// 함수식 보기 `(1) $y=4x-1$` 가 한 줄에 하나씩 올 때 + 첫 번호 ①이 (4) 로 오인식될 때 — 객관식으로 잡혀야 한다.
// 2026-10-07 대표: "객관식인데 주관식으로 인식해 보기를 문제 위로 올린다 — $함수식$ 으로 시작하는 보기만".
import { describe, it, expect } from 'vitest';
import { parseChoicesFromText, groupLinesIntoQuestions } from './cloud-flow';

describe('parseChoicesFromText — 괄호 번호 보기', () => {
  it('(4)(2)(3)(4)(5) 처럼 첫 번호만 틀려도 5개 보기로 복원', () => {
    const txt = '(4) $y=4x-1$\n(2) $y=4x-2$\n(3) $y=4x-3$\n(4) $y=4x+1$\n(5) $y=4x+2$';
    const c = parseChoicesFromText(txt);
    expect(c).toHaveLength(5);
    expect(c[0]).toContain('4x-1');
    expect(c[4]).toContain('4x+2');
  });
  it('정상 (1)~(5) 는 그대로 5개', () => {
    expect(parseChoicesFromText('(1) a\n(2) b\n(3) c\n(4) d\n(5) e')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('서술형 소문제 (1)(2)(3) 은 보기가 아니다', () => {
    expect(parseChoicesFromText('(1) 넓이를 구하시오\n(2) 길이를 구하시오\n(3) 값을 구하시오')).toEqual([]);
  });
  it('(4)(2)(3)(4) 처럼 4개뿐이면(5 없음) 첫 번호 보정 안 함 → 종전 규칙', () => {
    const c = parseChoicesFromText('(4) a\n(2) b\n(3) c\n(4) d');
    expect(c).toEqual([]);
  });
});

function line(text: string, y: number): any {
  return { text, text_display: text, type: 'text', region: { top_left_x: 10, top_left_y: y, width: 500, height: 20 } };
}

describe('groupLinesIntoQuestions — 한 줄 하나짜리 괄호 보기', () => {
  it('함수식 보기 5줄이 보기로 잡히고 본문에서 빠진다', () => {
    const page: any = {
      pageWidth: 1000, pageHeight: 1400,
      lineData: [
        line('5. 포물선 $y^2=-16x$ 에 접하고 직선 $4x-y+3=0$ 에 평행한 직선의 방정식은?', 100),
        line('(4) $y=4x-1$', 130), line('(2) $y=4x-2$', 160), line('(3) $y=4x-3$', 190), line('(4) $y=4x+1$', 220), line('(5) $y=4x+2$', 250),
        line('6. 다음 문제', 400),
      ],
    };
    const r = groupLinesIntoQuestions([page]);
    const q5 = r.find((q) => q.questionNumber === 5)!;
    expect(q5).toBeTruthy();
    expect(q5.choices).toHaveLength(5);
    expect(q5.choices[0]).toContain('4x-1');
    expect(q5.contentMmd).toContain('포물선');
  });
  it('서술형 소문제 (1) …구하시오 는 보기로 잡지 않는다', () => {
    const page: any = {
      pageWidth: 1000, pageHeight: 1400,
      lineData: [
        line('7. 다음 물음에 답하시오.', 100),
        line('(1) 삼각형의 넓이를 구하시오.', 130), line('(2) 둘레의 길이를 구하시오.', 160),
        line('8. 다음 문제', 400),
      ],
    };
    const r = groupLinesIntoQuestions([page]);
    const q7 = r.find((q) => q.questionNumber === 7)!;
    expect(q7.choices).toEqual([]);
    expect(q7.contentMmd).toContain('(1) 삼각형의 넓이를 구하시오.');
  });
});

describe('첫 보기 표식 (1) 이 통째로 사라진 경우', () => {
  it('"-2 / (2) -1 / (3) 0 / (4) 1 / (5) 2" → 5개 보기, 본문엔 보기 줄이 남지 않는다', () => {
    const page: any = {
      pageWidth: 1000, pageHeight: 1400,
      lineData: [
        line('1. 초점이 $F(2,0)$ 이고 점 $P(-1,4)$ 을 지나는 포물선의 준선의 방정식이 $x=k$ 일 때, 만족하는 $k$ 값의 합은?', 100),
        line('$-2$', 130), line('(2) -1', 160), line('(3) 0', 190), line('(4) 1', 220), line('(5) 2', 250),
        line('2. 다음 문제', 400),
      ],
    };
    const r = groupLinesIntoQuestions([page]);
    const q1 = r.find((q) => q.questionNumber === 1)!;
    expect(q1.choices).toHaveLength(5);
    expect(q1.choices[0]).toContain('-2');
    expect(q1.choices[4]).toBe('2');
    expect(q1.contentMmd).toContain('준선의 방정식');
    expect(q1.contentMmd).not.toMatch(/\(3\) 0/);
  });
  it('앞 줄이 물음(?)이면 보기로 끌어오지 않는다', () => {
    const page: any = {
      pageWidth: 1000, pageHeight: 1400,
      lineData: [
        line('3. 다음 중 옳은 것은?', 100),
        line('(2) b', 160), line('(3) c', 190), line('(4) d', 220), line('(5) e', 250),
        line('4. 다음', 400),
      ],
    };
    const q3 = groupLinesIntoQuestions([page]).find((q) => q.questionNumber === 3)!;
    expect(q3.choices).toEqual([]);
  });
});

describe('보기 번호 한 자리 오인식 일반화 (2026-10-07 "(1)(2)(3)(5)(5)")', () => {
  it('넷째가 (5) 로 읽혀도 5개 보기', () => {
    expect(parseChoicesFromText('(1) 64\n(2) 67\n(3) 73\n(5) 76\n(5) 80')).toEqual(['64', '67', '73', '76', '80']);
  });
  it('두 자리 이상 틀리면 손대지 않는다', () => {
    expect(parseChoicesFromText('(1) a\n(3) b\n(3) c\n(5) d\n(5) e')).toEqual([]);
  });
});
