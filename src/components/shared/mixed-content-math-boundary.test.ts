import { describe, it, expect } from 'vitest';
import katex from 'katex';
import { stripDollarAfterEnv, stripDollarBeforeEnv } from './env-dollar-cleanup';
import { wrapBareLatex } from './wrap-bare-latex';

// ============================================================================
// 회귀 — 2026-09-02 사대부고 23-1-2-M 수학하 #17 실사고
//
// 화면에 수식이 빨간 원문으로 노출됐다. DB 내용은 멀쩡했고, 원인은 렌더 전처리 두 곳:
//
//   A) `\end{tabular}` 뒤 군더더기 `$` 를 지우는 규칙의 공백이 `\s*` 였다.
//      줄바꿈을 넘어가 **다음 줄을 여는 `$` 를 지워** 수식이 통째로 본문이 됐다.
//
//   B) 본문이 된 수식을 wrapBareLatex 가 다시 감쌀 때 `\left ( 6 \right )` 의 닫는
//      `)` 를 밖에 남겨 `$\left ( 6 \right$ )` 가 됐다. KaTeX 는
//      "Expected group as argument to '\right'" 로 실패한다.
//
// ★ 이 테스트는 **실제 코드를 import** 한다. 같은 폴더의 오래된 테스트들처럼 구현을
//   복제해 두면 진짜 코드가 깨져도 통과한다 — 이번 사고가 정확히 그 경우였다.
//   (그래서 두 함수를 .ts 로 분리했다. vitest 는 .tsx 를 import 하지 못한다.)
// ============================================================================

/** 조각들이 전부 KaTeX 를 통과하는지 */
function allRender(text: string): { ok: boolean; failed: string[] } {
  const failed: string[] = [];
  for (const m of text.matchAll(/\$([^$\n]+)\$/g)) {
    const html = katex.renderToString(`\\displaystyle ${m[1]}`, {
      throwOnError: false, strict: false, trust: true,
    });
    if (html.includes('katex-error')) failed.push(m[1]);
  }
  return { ok: failed.length === 0, failed };
}

const MATH_LINE =
  '$f \\left ( 6 \\right ) + \\left ( f \\circ f \\right ) \\left ( 6 \\right )$의 값을 구하시오.';

describe('stripDollarAfterEnv — 다음 줄을 여는 $ 를 지우지 않는다', () => {
  it('\\end{tabular} 다음 줄이 $ 로 시작해도 그 $ 가 남는다', () => {
    const src = `\\begin{tabular}{|c|}\\hline 가 \\\\ \\hline\\end{tabular}\n${MATH_LINE}`;
    expect(stripDollarAfterEnv(src)).toBe(src);
  });

  it('줄바꿈이 사라지지 않는다 — 표와 본문이 붙으면 안 된다', () => {
    const src = `\\begin{tabular}{|c|}\\hline 가 \\\\ \\hline\\end{tabular}\n${MATH_LINE}`;
    expect(stripDollarAfterEnv(src)).not.toMatch(/\\end\{tabular\}f /);
  });

  // ★ 원래 의도는 살아 있어야 한다
  it('같은 줄에 바로 붙은 군더더기 $ 는 그대로 지운다', () => {
    expect(stripDollarAfterEnv('\\end{tabular}$')).toBe('\\end{tabular}');
    expect(stripDollarAfterEnv('\\end{array}  $')).toBe('\\end{array}');
    expect(stripDollarAfterEnv('\\end{array}$$')).toBe('\\end{array}');
  });

  it('cases 는 건드리지 않는다 — KaTeX 가 $ 안에서 직접 렌더한다', () => {
    expect(stripDollarAfterEnv('\\end{cases}$')).toBe('\\end{cases}$');
    expect(stripDollarBeforeEnv('$\\begin{cases}')).toBe('$\\begin{cases}');
  });

  it('여는 쪽 $\\begin{env} 는 계속 정리된다', () => {
    expect(stripDollarBeforeEnv('$\\begin{array}')).toBe('\\begin{array}');
    expect(stripDollarBeforeEnv('$$\\begin{array}')).toBe('\\begin{array}');
  });
});

describe('wrapBareLatex — \\left/\\right 의 구분자를 수식 안에 넣는다', () => {
  const bare = 'f \\left ( 6 \\right ) + \\left ( f \\circ f \\right ) \\left ( 6 \\right )의 값은?';

  it('\\right 뒤 닫는 ) 를 수식 밖으로 흘리지 않는다', () => {
    const out = wrapBareLatex(bare);
    expect(out).not.toContain('\\right$ )');
    expect(out).not.toContain('\\right$)');
  });

  it('감싼 결과가 KaTeX 를 통과한다', () => {
    const r = allRender(wrapBareLatex(bare));
    expect(r.failed).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('중괄호 구분자 \\left\\{ … \\right\\} 도 온전히 감싼다', () => {
    expect(allRender(wrapBareLatex('집합 \\left\\{ 1, 2 \\right\\} 이다')).failed).toEqual([]);
  });

  it('대괄호 구분자 \\left [ … \\right ] 도 온전히 감싼다', () => {
    expect(allRender(wrapBareLatex('구간 \\left [ 0, 1 \\right ] 에서')).failed).toEqual([]);
  });

  it('이미 $ 로 감싸진 수식은 건드리지 않는다', () => {
    expect(wrapBareLatex(MATH_LINE)).toBe(MATH_LINE);
  });
});

describe('두 결함이 겹친 원래 사고 형태', () => {
  it('표 + 수식 줄이 끝까지 정상 렌더된다', () => {
    const src =
      '\\begin{tabular}{|c|}\\hline (가) $f \\left ( 1 \\right ) =8$ \\\\ \\hline\\end{tabular}\n' +
      MATH_LINE;
    const out = wrapBareLatex(stripDollarAfterEnv(stripDollarBeforeEnv(src)));
    const r = allRender(out);
    expect(r.failed).toEqual([]);
  });
});
