import { describe, it, expect } from 'vitest';
import { stripEmptyMath } from './empty-math';

describe('stripEmptyMath — 빈 수식만 지우고 디스플레이 닫는 기호는 살린다 (양운고 #20, 2026-09-21)', () => {
  it('★★ `\\end{cases}$$⏎⏎$g(x)$` 의 `$$` 와 다음 문단 여는 `$` 를 지우지 않는다', () => {
    const s = '$$f(x)=\\begin{cases} a & (x \\neq 2) \\\\[6pt] b & (x=2) \\end{cases}$$\n\n$g(x)$를 $(x-2)^{2}$으로 나눈';
    expect(stripEmptyMath(s)).toBe(s);
  });

  it('★ 두 디스플레이 블록 사이 `A$$⏎⏎$$B` 도 그대로', () => {
    const s = '$$A$$\n\n$$B$$';
    expect(stripEmptyMath(s)).toBe(s);
  });

  it('진짜 빈 인라인 `$ $` 는 지운다 (OCR 찌꺼기)', () => {
    expect(stripEmptyMath('값은 $ $ 이다')).toBe('값은  이다');
    expect(stripEmptyMath('$x$ 와 $ $ 그리고 $y$')).toBe('$x$ 와  그리고 $y$');
  });

  it('진짜 빈 디스플레이 `$$ $$` 는 지운다', () => {
    expect(stripEmptyMath('앞 $$   $$ 뒤')).toBe('앞  뒤');
    expect(stripEmptyMath('앞 $$\n\n$$ 뒤')).toBe('앞  뒤');
  });

  it('인라인 수식 닫는 `$` 뒤 공백 + 다음 수식 여는 `$` 는 빈 수식이 아니다', () => {
    const s = '$a$ $b$';
    expect(stripEmptyMath(s)).toBe(s);
  });
});
