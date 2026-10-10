import { describe, it, expect } from 'vitest';
import { extractChoicesFromOCR } from './extract-choices-from-ocr';

// ★★ 장전중 25-3-1 #4 회귀 — "①~⑤에 들어갈 내용" 빈칸채우기 본문의 \boxed{①}~\boxed{⑤}
//    placeholder 를 보기로 오인해 본문을 토막내던 사고 (CLAUDE.md Gard #9).
const JANGJEON_4 = [
  '다음은 이차방정식 $ax^{2}+bx+c=0$(단, $a$, $b$, $c$는 상수)의 근을 구하는 과정이다. ①$\\sim$⑤에 들어갈 내용 중 옳지 않은 것은?',
  '',
  '$a \\ne 0$이므로 $ax^{2}+bx+c=0$의 양변을 $a$로 나눈 후 상수항을 우변으로 이항하면',
  '',
  '$$x^{2}+\\dfrac{b}{a}x= \\boxed{①}$$',
  '',
  '좌변을 완전제곱식으로 만들면',
  '',
  '$$x^{2}+\\dfrac{b}{a}x+ \\left( \\boxed{②} \\right)^{2}= \\boxed{①} + \\left( \\boxed{②} \\right)^{2}$$',
  '',
  '$$\\left(x+ \\boxed{②} \\right)^{2}=\\dfrac{\\boxed{③}}{4a^{2}}$$',
  '',
  '$$x+ \\boxed{②} =\\dfrac{\\pm \\sqrt{ \\boxed{③} }}{2a} \\quad (\\text{단, } \\boxed{④} \\ge 0)$$',
  '',
  '$$x=\\dfrac{\\boxed{⑤} \\pm \\sqrt{ \\boxed{③} }}{2a}$$',
].join('\n');

describe('extractChoicesFromOCR — 원형 ①②③④⑤ 분기 가드', () => {
  it('★★ 빈칸채우기 \\boxed{①~⑤} placeholder 본문 → [] (본문 토막 차단)', () => {
    expect(extractChoicesFromOCR(JANGJEON_4)).toEqual([]);
  });

  it('★ 정상 5지선다 (① ~ ⑤) → 5개 보기 추출 (회귀 방지)', () => {
    const text = '다음 중 옳은 것은? ① $x=1$ ② $x=2$ ③ $x=3$ ④ $x=4$ ⑤ $x=5$';
    const r = extractChoicesFromOCR(text);
    expect(r).toHaveLength(5);
    expect(r[0]).toBe('$x=1$');
    expect(r[4]).toBe('$x=5$');
  });

  it('★ 스템이 "①~⑤" 를 참조해도 진짜 보기만 추출 (스템 무시)', () => {
    const text = '다음 ①~⑤ 중 옳은 것은? ① 가 ② 나 ③ 다 ④ 라 ⑤ 마';
    const r = extractChoicesFromOCR(text);
    expect(r).toEqual(['가', '나', '다', '라', '마']);
  });

  it('★ 스템 "①을 ②에 대입" + 보기 5개 → 보기만 추출', () => {
    const text = '①을 ②에 대입하여라. 결과로 옳은 것은? ① $1$ ② $2$ ③ $3$ ④ $4$ ⑤ $5$';
    const r = extractChoicesFromOCR(text);
    expect(r).toHaveLength(5);
    expect(r[0]).toBe('$1$');
  });

  it('④까지 4개만 인식돼도(⑤가 (5)로 OCR) ①시작 증가런 길이4 → ⑤ 를 잘라 5개 (2026-10-11 변경)', () => {
    const text = '다음 중 가장 큰 값은? ① 46 ② 52 ③ 58 ④ 64 (5) 70';
    const r = extractChoicesFromOCR(text);
    expect(r).toEqual(['46', '52', '58', '64', '70']);
  });

  it('동그라미 2개뿐(스템 참조)이고 보기 아님 → [] (본문 토막 차단)', () => {
    const text = '① 과 ② 를 더하면 빈칸에 들어갈 값은? $\\boxed{①}+\\boxed{②}$';
    expect(extractChoicesFromOCR(text)).toEqual([]);
  });

  it('보기 없음 → []', () => {
    expect(extractChoicesFromOCR('이차방정식 $x^2-1=0$ 의 해를 구하시오.')).toEqual([]);
  });

  it('서답형 소문제 (1)(2)(3) → [] (5지선다 가드 — 객관식 아님)', () => {
    const text = '다음 물음에 답하시오. (1) $a$의 값을 구하시오. (2) $b$의 값을 구하시오. (3) $a+b$를 구하시오.';
    expect(extractChoicesFromOCR(text)).toEqual([]);
  });
});

describe('(n) 보기 첫 번호 오인식 허용 (2026-10-07, 함수식 보기)', () => {
  it('(4)(2)(3)(4)(5) → 5개 보기', () => {
    const c = extractChoicesFromOCR('방정식은?\n(4) $y=4x-1$\n(2) $y=4x-2$\n(3) $y=4x-3$\n(4) $y=4x+1$\n(5) $y=4x+2$');
    expect(c).toHaveLength(5);
    expect(c[0]).toContain('4x-1');
  });
});

describe('(1) 표식이 사라진 경우 (2026-10-07)', () => {
  it('"-2\\n(2) -1\\n(3) 0\\n(4) 1\\n(5) 2" → 5개', () => {
    const c = extractChoicesFromOCR('합은?\n$-2$\n(2) -1\n(3) 0\n(4) 1\n(5) 2');
    expect(c).toHaveLength(5);
    expect(c[0]).toContain('-2');
  });
  it('앞 줄이 물음이면 4개 그대로 → 세트 가드가 [] 로', () => {
    expect(extractChoicesFromOCR('옳은 것은?\n(2) b\n(3) c\n(4) d\n(5) e')).toEqual([]);
  });
});

describe('보기 번호 한 자리 오인식 일반화 (2026-10-07)', () => {
  it('(1)(2)(3)(5)(5) → 5개', () => {
    expect(extractChoicesFromOCR('값은?\n(1) 64\n(2) 67\n(3) 73\n(5) 76\n(5) 80')).toEqual(['64', '67', '73', '76', '80']);
  });
});

import { stripTrailingInlineChoices } from '@/lib/utils/strip-inline-choices';
describe('stripTrailingInlineChoices 느슨 규칙 (2026-10-08 부흥고 미적분1 #3)', () => {
  it('④가 ①로 오인식돼 순서가 깨져도 보기 내용이 과반 일치하면 자른다', () => {
    const txt = '함수 $f(x)=x^2+3x+5$ 에 대하여 … 상수 $a$ 의 값은?\n① 0\n② 1\n③ 2\n① 3\n⑤ 4 [3.7점]';
    const out = stripTrailingInlineChoices(txt, ['0', '1', '2', '3', '4']);
    expect(out).toBe('함수 $f(x)=x^2+3x+5$ 에 대하여 … 상수 $a$ 의 값은?');
  });
  it('서술형 풀이 단계 ①②③ 는 보기와 안 맞으니 그대로', () => {
    const txt = '다음 과정을 완성하시오.\n① 양변을 2로 나눈다\n② 이항한다\n③ 제곱근을 구한다';
    expect(stripTrailingInlineChoices(txt, ['3', '4', '5', '6', '7'])).toBe(txt);
  });
});

// ★ 2026-10-11 대표: "5번이 4번 보기에 붙은 현상은 계속 지적해도 개선이 안 된다" — ①②③④ 뒤 ⑤만 "(5)" 로 읽힌 Mathpix 사고.
describe('extractChoicesFromOCR — ⑤가 (5) 로 읽혀 ④에 붙은 경우', () => {
  it('① 120° ② 125° ③ 130° ④ 135°\n(5) 140° → 5개', () => {
    const text = '그림과 같이 직사각형 모양의 종이테이프를 접었다. $\angle x+\angle y$ 의 크기는?\n① $120^{\circ}$ ② $125^{\circ}$ ③ $130^{\circ}$ ④ $135^{\circ}$\n(5) $140^{\circ}$';
    expect(extractChoicesFromOCR(text)).toEqual(['$120^{\circ}$', '$125^{\circ}$', '$130^{\circ}$', '$135^{\circ}$', '$140^{\circ}$']);
  });
  it('같은 줄에 ④ 135° (5) 140° 도 분리', () => {
    const text = '값은? ① 1 ② 2 ③ 3 ④ 4 (5) 5';
    expect(extractChoicesFromOCR(text)).toEqual(['1', '2', '3', '4', '5']);
  });
  it('③ 뒤 (4) 가 붙고 ⑤ 는 원형인 경우도 번호대로', () => {
    const text = '값은? ① 1 ② 2 ③ 3 (4) 4 ⑤ 5';
    expect(extractChoicesFromOCR(text)).toEqual(['1', '2', '3', '4', '5']);
  });
  it('보기 본문 속 "(5)" 가 수식 괄호면 안 자른다 — f(5) 같은 꼴', () => {
    const text = '값은? ① $f(1)$ ② $f(2)$ ③ $f(3)$ ④ $f(5)$ ⑤ $f(6)$';
    expect(extractChoicesFromOCR(text)).toEqual(['$f(1)$', '$f(2)$', '$f(3)$', '$f(5)$', '$f(6)$']);
  });
});
