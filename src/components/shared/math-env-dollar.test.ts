import { describe, it, expect } from 'vitest';
import { stripDollarsInsideMathEnv } from './math-env-dollar';

// ============================================================================
// 회귀 — 2026-08-31 서여고 미적분1: 연립방정식이 날것 LaTeX 로 노출된 사고
//
// Mathpix 가 cases 두 줄 중 아랫줄만 $ 로 감싸 내보냈다. 수식 환경 안쪽에 남은 $ 가
// $$ 래핑 후에도 살아 KaTeX 가 통째로 실패했고, 화면에 \begin{cases} … 원문이 찍혔다.
// ============================================================================

/** 실제 사고 데이터 (화면에 그대로 노출됐던 문자열) */
const 실측 =
  '\\begin{cases} 3^{-x^{2}}>\\left(\\dfrac{1}{3}\\right)^{6 x} \\\\ ' +
  '$\\log _{4}(4 x)>\\log _{2}(x-3)$ \\end{cases}';

describe('stripDollarsInsideMathEnv', () => {
  it('환경 안쪽 $ 를 남김없이 걷어낸다', () => {
    expect(stripDollarsInsideMathEnv(실측)).not.toContain('$');
  });

  it('내용은 하나도 잃지 않는다 — 두 줄 모두 살아있어야 한다', () => {
    const out = stripDollarsInsideMathEnv(실측);
    expect(out).toContain('\\begin{cases}');
    expect(out).toContain('3^{-x^{2}}');
    expect(out).toContain('\\log _{4}(4 x)');
    expect(out).toContain('\\log _{2}(x-3)');
    expect(out).toContain('\\end{cases}');
    // 줄바꿈 구분자(\\)도 보존 — 사라지면 두 줄이 한 줄로 붙는다
    expect(out).toContain('\\\\');
  });

  it('$ 가 없는 정상 환경은 글자 하나 안 바꾼다', () => {
    const clean = '\\begin{cases} x+y=3 \\\\ x-y=1 \\end{cases}';
    expect(stripDollarsInsideMathEnv(clean)).toBe(clean);
  });

  it('$$ 처럼 연달아 붙은 경우도 처리한다', () => {
    expect(stripDollarsInsideMathEnv('\\begin{array}{c} $$a$$ \\end{array}'))
      .toBe('\\begin{array}{c} a \\end{array}');
  });

  it('빈 문자열을 넣어도 죽지 않는다', () => {
    expect(stripDollarsInsideMathEnv('')).toBe('');
  });
});
