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

  it('④까지 4개만 인식돼도(⑤가 (5)로 OCR) ①시작 증가런 길이4 → 4개 보기 (기존 동작 보존)', () => {
    const text = '다음 중 가장 큰 값은? ① 46 ② 52 ③ 58 ④ 64 (5) 70';
    const r = extractChoicesFromOCR(text);
    expect(r).toHaveLength(4);
    expect(r[0]).toBe('46');
    expect(r[3]).toContain('64');
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
