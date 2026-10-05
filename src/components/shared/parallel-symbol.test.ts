import { describe, it, expect } from 'vitest';
import { slantParallel, arcToFrown, katexKoreanSymbols, SLANT_PARALLEL } from './parallel-symbol';

describe('slantParallel — 평행 기호를 // 로 (2026-10-05)', () => {
  it('★ \\parallel → 사선 두 개', () => {
    expect(slantParallel('\\overline{AB} \\parallel \\overline{CD}')).toBe(`\\overline{AB} ${SLANT_PARALLEL} \\overline{CD}`);
  });
  it('유니코드 ∥ 도', () => {
    expect(slantParallel('l ∥ m')).toBe(`l ${SLANT_PARALLEL} m`);
  });
  it('\\nparallel · \\| (노름) 은 그대로', () => {
    expect(slantParallel('a \\nparallel b')).toBe('a \\nparallel b');
    expect(slantParallel('\\|x\\|')).toBe('\\|x\\|');
  });
});

describe('arcToFrown — 호 기호 (2026-10-05)', () => {
  it('★ 3\\overparen{AC} = \\overparen{BD} → \\overset{\\frown}', () => {
    expect(arcToFrown('3\\overparen{AC} = \\overparen{BD}')).toBe('3\\overset{\\frown}{AC} = \\overset{\\frown}{BD}');
  });
  it('\\wideparen · \\overarc 도', () => {
    expect(arcToFrown('\\wideparen{AB}')).toBe('\\overset{\\frown}{AB}');
    expect(arcToFrown('\\overarc{AB}')).toBe('\\overset{\\frown}{AB}');
  });
  it('없으면 원본 그대로(같은 참조)', () => {
    const s = 'x+1';
    expect(katexKoreanSymbols(s)).toBe(s);
  });
});
