// ============================================================================
// HWPX 내보내기 회귀 테스트
// ----------------------------------------------------------------------------
// 1) 수식 골든 — latexToHWPEquation 실측 기대값 (scripts/test-hwpx.mts 검증분 이관)
// 2) 라운드트립 — 내보내기(latexToHWPEquation) → 가져오기 역변환(hangulEquationToLatex)
//    으로 되돌려 구조 보존 확인. 컨테이너와 무관하게 "수식이 한글에서 깨질" 클래스를
//    프로그램으로 잡는 안전망 (HML import 라인의 검증기 재활용).
// 3) 통합 — generateHWPX 산출물(zip)을 되열어 section0.xml 검사:
//    디스플레이 수식 가운데 단락(paraPr 64) + perPage pageBreak/columnBreak 배치.
// ============================================================================

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { generateHWPX, latexToHWPEquation, parseContent, sanitizeProblemContent, scanHwpxArtifacts, HWP_EQ_VOCAB, HWP_SYMBOL_MAP } from './hwpx-generator';
import { hangulEquationToLatex } from '../workflow/hangul-equation';

describe('latexToHWPEquation 골든 (실측 기대값)', () => {
  const cases: [string, string][] = [
    ['\\frac{1}{5}', '{1} over {5}'],
    ['y = \\log_{a} x', 'y = log_{a} x'],
    ['\\left\\{ x | -4 \\le x \\le 120 \\right\\}', 'LEFT { x | -4 <= x <= 120 RIGHT }'],
    ['y = \\log_{\\frac{1}{5}} (x+5) - 2', 'y = log_{{1} over {5}} (x+5) - 2'],
    ['\\sqrt{2}', 'sqrt {2}'],
    [
      '\\left\\{\\begin{array}{cc} 3x-5 & (x \\leq 1) \\\\ 7x+c & (x \\geq 3) \\end{array}\\right.',
      'cases {3x-5 & (x <= 1) # 7x+c & (x >= 3)}',
    ],
  ];
  for (const [latex, hwp] of cases) {
    it(`${latex} → ${hwp}`, () => {
      expect(latexToHWPEquation(latex)).toBe(hwp);
    });
  }
});

describe('수식 라운드트립 (내보내기 → 가져오기 역변환, 구조 보존)', () => {
  // [입력 LaTeX, 역변환 결과에서 기대하는 구조 패턴들]
  const cases: [string, RegExp[]][] = [
    ['\\frac{1}{5}', [/\\d?frac\s*\{\s*1\s*\}\s*\{\s*5\s*\}/]],
    ['\\sqrt{2}', [/\\sqrt\s*\{\s*2\s*\}/]],
    ['\\sqrt[3]{x}', [/\\sqrt\[3\]\{\s*x\s*\}/]],
    ['x \\le 3', [/\\leq/]],
    ['a \\pm b', [/\\pm/]],
    ['\\pi r^2', [/\\pi/]],
    ['x \\to \\infty', [/\\rightarrow/, /\\infty/]],
    ['\\begin{cases} x+1 & (x<0) \\\\ 2x & (x \\ge 0) \\end{cases}', [/\\begin\{cases\}/, /\\geq/]],
    ['\\left\\{ x | x \\ge 1 \\right\\}', [/\\left\\\{/, /\\right\\\}/]],
    ['\\overline{AB}', [/\\overline\s*\{?\s*AB/]],
    ['y = \\log_{2} x', [/log_\{2\}/]],
  ];
  for (const [latex, patterns] of cases) {
    it(`${latex} 왕복 보존`, () => {
      const hwp = latexToHWPEquation(latex);
      const back = hangulEquationToLatex(hwp);
      for (const p of patterns) expect(back).toMatch(p);
      // 한글수식 원시 토큰이 역변환 후 텍스트로 남지 않아야 함 (화면에 글자로 노출되는 클래스).
      // ★ cases/matrix 는 \begin{cases} 안에 정당하게 등장하므로 제외 — bare 토큰만 검사.
      expect(back).not.toMatch(/(?<!\\)\b(?:over|of|rpile|lpile|cpile)\b/);
    });
  }
});

// ============================================================================
// 중첩 중괄호 (2026-09-02 회귀) — "명령이 통째로 사라지던" 클래스
// ----------------------------------------------------------------------------
// 인자를 정규식 `[^{}]*(?:\{[^{}]*\}[^{}]*)*` 로 잡으면 중첩 1단까지만 센다.
// 2단 이상이면 매칭이 실패하고, 남은 명령을 "잔여 LaTeX 정리"가 지워버려
// 근호·분수·윗줄이 **조용히 없어진 채** 시험지가 인쇄됐다.
// 실측(운영 시험지 200개, 수정 전→후): \sqrt 1,237→0 · \overline 419→1 · \dfrac 90→0 ·
// \lim 74→0 · \ln 11→0 · \int 5→0 · \vec 3→0 (eq-dropped-command 총 1,850→12).
// ============================================================================
describe('중첩 중괄호 — 명령이 지워지지 않는다', () => {
  const cases: [string, string][] = [
    // 2단 중첩 — 바깥 \sqrt 이 통째로 사라지던 대표 입력
    ['\\sqrt{\\dfrac{1}{\\sqrt{2}}}', 'sqrt {{1} over {sqrt {2}}}'],
    ['\\sqrt{x^{2}+\\dfrac{1}{y^{2}}}', 'sqrt {x^{2}+{1} over {y^{2}}}'],
    // 3단 중첩 — 같은 명령이 자기 인자 안에 반복
    ['\\sqrt{\\sqrt{\\sqrt{2}}}', 'sqrt {sqrt {sqrt {2}}}'],
    // 분수 안 분수
    ['\\frac{\\frac{a}{b}}{\\frac{c}{d}}', '{{a} over {b}} over {{c} over {d}}'],
    ['\\dfrac{1}{\\dfrac{1}{x}+\\dfrac{1}{y}}', '{1} over {{1} over {x}+{1} over {y}}'],
    ['\\dfrac{\\sqrt{2}}{\\sqrt{3}}', '{sqrt {2}} over {sqrt {3}}'],
    // n제곱근 + 중첩 인자
    ['\\sqrt[3]{\\dfrac{1}{8}}', 'root 3 of {{1} over {8}}'],
    // 악센트 중첩 (윗줄이 한 겹 사라지던 것)
    ['\\overline{\\overline{AB}}', 'overline {overline {AB}}'],
    ['\\overline{\\dfrac{1}{2}}', 'overline {{1} over {2}}'],
    ['\\vec{\\dfrac{a}{b}}', 'vec {{a} over {b}}'],
    // 인자 안 중첩이 있는 binom (구조가 깨지던 것)
    ['\\binom{\\frac{n}{2}}{r}', '( matrix {{n} over {2} # r} )'],
    // 중괄호 없는 근호 — 잔여 정리에 \sqrt 이 지워지던 것
    ['\\sqrt2', 'sqrt {2}'],
    ['\\sqrt x', 'sqrt {x}'],
    // 큰 연산자: `\lim_` 은 `_` 가 word char 라 `\b` 가 안 걸려 명령이 지워졌다 (실측 74건)
    ['\\lim_{n \\to \\infty} a_{n}', 'lim from {n -> inf} a_{n}'],
    ['\\sum_{k=1}^{\\frac{n}{2}} k', 'sum from {k=1} to {{n} over {2}} k'],
    ['\\int_{0}^{\\frac{1}{2}} x dx', 'int from {0} to {{1} over {2}} x dx'],
    // 함수 이름 뒤에 숫자가 붙는 경우 (`\b` 가 안 걸려 지워지던 것)
    ['\\ln2', 'ln2'],
  ];
  for (const [latex, hwp] of cases) {
    it(`${latex} → ${hwp}`, () => {
      expect(latexToHWPEquation(latex)).toBe(hwp);
    });
  }

  it('중첩이 깊어도 명령이 소실되지 않는다 (백슬래시 잔재·소실 동시 검사)', () => {
    const deep = '\\sqrt{\\dfrac{\\sqrt{a+\\dfrac{1}{b}}}{\\overline{\\mathrm{CD}}}}';
    const out = latexToHWPEquation(deep);
    expect(out).not.toMatch(/\\/);            // 미변환 백슬래시 잔재 없음
    expect((out.match(/sqrt/g) || []).length).toBe(2);
    expect((out.match(/over(?!line)/g) || []).length).toBe(2);
    expect(out).toContain('overline');
    // 중괄호 균형 (한글에서 수식이 깨지는 클래스)
    expect((out.match(/\{/g) || []).length).toBe((out.match(/\}/g) || []).length);
  });

  it('닫는 중괄호가 없는 원문은 지우지 않고 남긴다 (손실 0 원칙)', () => {
    // 인자를 못 채우면 치환하지 않는다 — 잘못 잘라내는 것보다 잔재로 남겨 경고받는 게 안전.
    expect(latexToHWPEquation('\\frac{1}')).toContain('1');
  });
});

// ============================================================================
// 평문TeX 중위 분수 `a \over b` (2026-09-02)
//   `\over` 는 인자가 앞뒤로 갈린 중위 연산자라 `\cmd{..}` 파서가 못 잡아 그냥 지워졌다
//   → `1\over3` 이 `13` 이 되는 등 **분수가 통째로 소실** (운영 200개 중 11건 / 코퍼스 27건).
//   기대값은 추측이 아니라 TeX 정의(= KaTeX 실측)를 그대로 따른다: `\over` 는 자기가 속한
//   그룹 전체를 분자/분모로 가른다. `y=` 가 분자에 들어가는 건 원문 결함이며 화면·인쇄도 동일.
// ============================================================================
describe('중위 \\over — 분수가 사라지지 않는다', () => {
  const cases: [string, string][] = [
    // 그룹이 수식 전체 — TeX 정의대로 앞부분이 통째로 분자 (KaTeX 실측 일치)
    ['y= 2x+1 \\over x+1', '{y= 2x+1} over {x+1}'],
    ['f(x)= x+1 \\over x-1', '{f(x)= x+1} over {x-1}'],
    // 공백 없이 붙은 형태 — 고치기 전엔 `13` 으로 숫자가 엉겨붙었다
    ['1\\over3', '{1} over {3}'],
    // \left…\right 가 그룹 경계 (KaTeX 실측 일치 — 괄호는 분수 밖에 남는다)
    ['\\left( a+b \\over c \\right)', '( {a+b} over {c} )'],
    // 행 구분자 `#` 가 셀 경계 — 앞 행을 분자로 삼키지 않는다
    [
      '\\begin{cases} a=1 \\\\ b= 2 \\over 3 \\end{cases}',
      'cases {a=1 # {b= 2} over {3}}',
    ],
    // 원문이 `$` 조기 종료로 잘려 중괄호 짝이 없는 형태 (실데이터 다수) — 짝 없는 중괄호만
    // 떼고 분수는 살린다. 안 그러면 분수 자체가 사라진다.
    ['{ 2} \\over { 3', '{{ 2}} over {3}'],
    ['2 \\over { rootx+1', '{2} over {rootx+1}'],
  ];
  for (const [latex, hwp] of cases) {
    it(`${latex} → ${hwp}`, () => {
      expect(latexToHWPEquation(latex)).toBe(hwp);
    });
  }

  it('분자/분모 어느 쪽이든 비면 치환하지 않는다 (인자 못 채우면 원문 유지 원칙)', () => {
    // 분자가 빈 실데이터(`...=0{\over { p s o m a t h }}`) — 분수가 아니므로 손대지 않는다.
    const out = latexToHWPEquation('x=0{\\over { psomath }}');
    expect(out).not.toMatch(/\bover\b/);   // 엉터리 분수를 만들어내지 않는다
  });

  it('\\over 를 고쳐도 중괄호 균형이 깨지지 않는다', () => {
    for (const src of ['{ 2} \\over { 3', 'a \\over b', '\\left( a+b \\over c \\right)', '{{\\beta }}} \\over {\\alpha }']) {
      const out = latexToHWPEquation(src);
      expect((out.match(/\{/g) || []).length).toBe((out.match(/\}/g) || []).length);
    }
  });
});

// ============================================================================
// 구분자 LEFT/RIGHT 짝 (2026-09-02) — eq-brace-unbalanced 270건의 실제 원인
//   조건제시법 집합 안에 한글을 넣으면 수식이 산문을 사이에 두고 둘로 쪼개진다:
//     `$A= \left\{ x | x \right.$는 $125$ 이하의 자연수$\left. \right\}$`
//   원문은 정상 LaTeX 이고 KaTeX 도 제대로 그린다. 그런데 예전 변환은 앞 조각에 `LEFT {` 만,
//   뒤 조각에 `RIGHT }` 만 남겨 한글에서 중괄호가 안 닫혔다 (실측 LEFT만 144 + RIGHT만 96).
//   ★ `RIGHT .` 는 한글 실측 근거가 0건이라 쓰지 않는다 → 짝 없는 쪽은 리터럴 lbrace/rbrace.
// ============================================================================
describe('LEFT/RIGHT 는 짝이 맞을 때만 낸다', () => {
  const cases: [string, string][] = [
    // 정상 짝 — 기존 동작 유지 (가변 중괄호)
    ['\\left\\{ x | x \\ge 1 \\right\\}', 'LEFT { x | x >= 1 RIGHT }'],
    ['\\left\\{ 1, 4, 5 \\right\\}', 'LEFT { 1, 4, 5 RIGHT }'],
    // 상대가 빈 구분자 `\right.` — LEFT 만 남으면 안 되므로 리터럴 중괄호로
    ['\\left\\{ x | x \\right.', 'lbrace x | x'],
    // 짝의 반대쪽 조각 — RIGHT 만 남으면 안 된다
    ['\\left. \\right\\}', 'rbrace'],
    // 짝 없는 `\left\{` (뒤 조각이 아예 없는 실데이터)
    ['U= \\left\\{ x | x', 'U= lbrace x | x'],
    // 중첩 — 안쪽은 짝이 맞고 바깥은 안 맞는 경우, 안쪽만 LEFT/RIGHT
    ['A= \\left\\{ 1 \\right\\} , B= \\left\\{ y | y', 'A= LEFT { 1 RIGHT } , B= lbrace y | y'],
    // 괄호·대괄호는 기존대로 리터럴만 (한글에서 LEFT ( 는 글자로 깨진다)
    ['\\left( x+1 \\right)', '( x+1 )'],
    ['\\left[ 0, 1 \\right]', '[ 0, 1 ]'],
  ];
  for (const [latex, hwp] of cases) {
    it(`${latex} → ${hwp}`, () => {
      expect(latexToHWPEquation(latex)).toBe(hwp);
    });
  }

  it('한글 산문으로 쪼개진 조건제시법 집합 — 조각마다 중괄호가 균형이다 (실데이터 284b33fc)', () => {
    const raw = '두 집합 $A= \\left\\{ x | x \\right .$는 $125$ 이하의 자연수$\\left. \\right\\}$ 에 대하여';
    for (const seg of parseContent(raw)) {
      if (seg.type !== 'equation') continue;
      expect((seg.value.match(/\{/g) || []).length).toBe((seg.value.match(/\}/g) || []).length);
      expect((seg.value.match(/LEFT/g) || []).length).toBe((seg.value.match(/RIGHT/g) || []).length);
    }
  });

  it('LEFT 를 냈으면 RIGHT 도 낸다 (짝 불변식)', () => {
    for (const src of [
      '\\left\\{ x \\right.',
      '\\left. x \\right\\}',
      '\\left\\{ \\left\\{ a \\right\\} , b \\right.',
      '\\left\\{ a \\right\\} \\cup \\left\\{ b \\right.',
    ]) {
      const out = latexToHWPEquation(src);
      expect((out.match(/LEFT/g) || []).length).toBe((out.match(/RIGHT/g) || []).length);
      expect((out.match(/\{/g) || []).length).toBe((out.match(/\}/g) || []).length);
    }
  });
});

describe('parseContent 디스플레이 수식 분리', () => {
  it('$$..$$ 는 display=true', () => {
    const segs = parseContent('다음을 계산하시오. $$\\frac{1}{2}+\\frac{1}{3}$$ 답을 쓰시오.');
    const eq = segs.find((s: { type: string }) => s.type === 'equation') as { display?: boolean };
    expect(eq).toBeTruthy();
    expect(eq.display).toBe(true);
  });
  it('\\[..\\] 는 display=true', () => {
    const segs = parseContent('식 \\[ x^2 - 1 = 0 \\] 을 풀어라.');
    const eq = segs.find((s: { type: string }) => s.type === 'equation') as { display?: boolean };
    expect(eq?.display).toBe(true);
  });
  it('$..$ 인라인은 display 아님', () => {
    const segs = parseContent('함수 $y = 2x$ 의 기울기는?');
    const eq = segs.find((s: { type: string }) => s.type === 'equation') as { display?: boolean };
    expect(eq).toBeTruthy();
    expect(eq.display).not.toBe(true);
  });
});

describe('sanitizeProblemContent (부흥중 2-1 실데이터 결함 3종)', () => {
  // 실데이터 #1: 유형태그 + 선두 zero-pad 번호 + 인라인 보기 (choices 에도 동일 보기)
  const buheung1 = '| 부등식의 뜻 |\n01 부등식으로 옳은 것은? \n① $x + 2$\n② $2x - 6 = 7$\n③ $3x + 4$\n④ $4x - 3 \\le 2$\n⑤ $5x - 1$';
  const buheung1Choices = ['① $x+2$', '② $2 x-6=7$', '③ $3 x+4$', '④ $4 x-3 \\le 2$', '⑤ $5 x-1$'];

  it('유형 태그 첫 줄 + 선두 01 + 끝 인라인 보기 모두 제거', () => {
    const out = sanitizeProblemContent(buheung1, 1, buheung1Choices);
    expect(out).not.toContain('| 부등식의 뜻 |');
    expect(out).not.toMatch(/^01\s/);
    expect(out).not.toContain('①'); // 보기는 choices 렌더가 담당 — 본문에서 제거
    expect(out).toContain('부등식으로 옳은 것은?');
  });

  it('수식 안 선두 번호 "$07\\ x=2..." 제거 (시퀀스 일치 시만)', () => {
    const c = '$07\\ x=2, y=3$ 을 해로 갖는 연립방정식인 것만을 <보기>에서 있는 대로 고른 것은? 3 점';
    expect(sanitizeProblemContent(c, 7, [])).toMatch(/^\$x=2, y=3\$/);
    // 다른 시퀀스면 보존
    expect(sanitizeProblemContent(c, 3, [])).toMatch(/^\$07/);
  });

  it('bare 비패딩 번호("1 이상의 수")는 보존 — 오삭제 방지', () => {
    const c = '1 이상의 수 중에서 가장 작은 소수를 구하시오.';
    expect(sanitizeProblemContent(c, 1, [])).toBe(c);
  });

  it('보기가 choices 와 불일치하면 본문 보존 (서술형 단계 ①②③ 보호)', () => {
    const c = '다음 풀이 과정을 완성하시오.\n① 양변을 2로 나눈다\n② 이항한다\n③ 제곱근을 구한다';
    const out = sanitizeProblemContent(c, 5, ['① 3', '② 5', '③ 7']);
    expect(out).toContain('양변을 2로 나눈다');
  });

  it('\\% 이스케이프 → 수식 스크립트에 % 리터럴', () => {
    expect(latexToHWPEquation('30\\%')).toBe('30%');
  });

  it('단일 문자 지수 경계 확정 — (2x-5)^2=a 가 ^{2}=a 로 (동래여중 5번 지수깨짐)', () => {
    expect(latexToHWPEquation('(2x-5)^2=a')).toBe('(2x-5)^{2}=a');
    expect(latexToHWPEquation('x^2+y_1')).toBe('x^{2}+y_{1}');
    // 이미 중괄호면 불변
    expect(latexToHWPEquation('x^{2}=a')).toBe('x^{2}=a');
  });

  it('\\square → □ (수식·텍스트 양쪽, 동래여중 16번 노출)', () => {
    expect(latexToHWPEquation('\\square')).toBe('□');
    const segs = parseContent('포물선의 \\square(이)라 한다.');
    const txt = segs.filter((s: { type: string }) => s.type === 'text').map((s: { value: string }) => s.value).join('');
    expect(txt).toContain('□');
    expect(txt).not.toContain('\\square');
  });

  it('\\boxed 라벨·\\quad·\\hline 처리 (유제/답 라벨·표 괘선 노출 실증)', () => {
    // 텍스트 경로: naked \boxed{\text{유제}} → 한글 수식 상자 box{"유제"} (웹 뱃지 동일 모양)
    const segs = parseContent('\\boxed{\\text{유제}} 1-7. 경우의 수를 구하시오. \\quad \\boxed{\\text{답}} 540');
    const eqs = segs.filter((s: { type: string }) => s.type === 'equation').map((s: { value: string }) => s.value);
    expect(eqs).toContain('box{"유제"}');
    expect(eqs).toContain('box{"답"}');
    const txt = segs.filter((s: { type: string }) => s.type === 'text').map((s: { value: string }) => s.value).join('');
    expect(txt).not.toContain('\\boxed');
    expect(txt).not.toContain('\\quad');
    expect(txt).toContain('경우의 수를 구하시오');
    // 공백 변형 "\boxed {\text { 유제 }}" 도 동일
    const segs2 = parseContent('\\boxed {\\text { 유 제 }} 2-1. 다음');
    expect(segs2.some((s: { type: string; value: string }) => s.type === 'equation' && s.value === 'box{"유 제"}')).toBe(true);
    // 수식 경로: \boxed → box
    expect(latexToHWPEquation('\\boxed{x+1}')).toBe('box{x+1}');
  });

  it('[도형]/[그림] 마커 제거 (동래여중 12번 노출)', () => {
    expect(sanitizeProblemContent('그래프가 아래와 같을 때, 넓이는? [도형]', 12, [])).not.toContain('[도형]');
    expect(sanitizeProblemContent('[그림] 참고', 3, [])).not.toContain('[그림]');
  });
});

// zip 을 되열어 section0.xml 텍스트 추출
async function section0Of(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const f = zip.file('Contents/section0.xml');
  expect(f).toBeTruthy();
  return f!.async('string');
}

const prob = (n: number, content: string) => ({ number: n, content, choices: [] as string[] });

describe('generateHWPX 통합 (section0.xml 구조)', () => {
  it('디스플레이 수식은 가운데 단락(paraPr 64) 으로 분리되고, 배점은 마지막 텍스트 단락에 붙는다', async () => {
    const buf = (await generateHWPX(
      [{ ...prob(1, '다음을 계산하시오. $$\\frac{1}{2}+\\frac{1}{3}$$ 과정을 쓰시오.'), points: 5 }],
      { title: 't', showNameField: false, showAnswerSheet: false },
    )) as Buffer;
    const xml = await section0Of(buf);
    // 가운데 자기 단락 — paraPr 64 단락 안에 수식
    const center = xml.match(/<hp:p[^>]*paraPrIDRef="64"[^>]*>([\s\S]*?)<\/hp:p>/);
    expect(center).toBeTruthy();
    expect(center![1]).toContain('<hp:equation');
    expect(center![1]).toContain('{1} over {2}+{1} over {3}');
    // 배점은 (가운데 단락이 아니라) 이후 텍스트 단락에
    expect(xml).toContain('[5점]');
    expect(center![1]).not.toContain('[5점]');
  });

  it('배점은 본문보다 작은 글자(charPr 3, h900) — 시중 문제지 스타일', async () => {
    const buf = (await generateHWPX(
      [{ ...prob(1, '계산하시오.'), points: 5 }],
      { title: 't', showNameField: false, showAnswerSheet: false },
    )) as Buffer;
    const xml = await section0Of(buf);
    expect(xml).toMatch(/<hp:run charPrIDRef="3"><hp:t>\s*\[5점\]<\/hp:t>/);
  });

  it('짧은 선택지는 3열 표 배열(웹 인쇄 동일), 긴 선택지는 세로', async () => {
    const shortChoices = ['① ㄱ', '② ㄱ,ㄷ', '③ ㄱ,ㄹ', '④ ㄴ,ㄹ', '⑤ ㄱ,ㄴ,ㄹ'];
    const longChoices = ['① $y=-3x+2$ 그래프', '② $y=-\\frac{2}{3}x+7$ 그래프', '③ 매우 긴 선택지 텍스트입니다', '④ 다른 긴 선택지 후보', '⑤ 마지막 긴 선택지'];
    const buf = (await generateHWPX(
      [
        { ...prob(1, '고른 것은?'), choices: shortChoices },
        { ...prob(2, '옳은 것은?'), choices: longChoices },
      ],
      { title: 't', showNameField: false, showAnswerSheet: false },
    )) as Buffer;
    const xml = await section0Of(buf);
    // 짧은 세트: 2행 3열 테두리 없는 표 안에 ①~⑤ (①②③ / ④⑤)
    const grid = xml.match(/<hp:tbl[^>]*rowCnt="2" colCnt="3"[^>]*borderFillIDRef="2"[\s\S]*?<\/hp:tbl>/);
    expect(grid).toBeTruthy();
    expect(grid![0]).toContain('①');
    expect(grid![0]).toContain('⑤');
    // 긴 세트: ① 단락과 ⑤ 단락이 분리 (⑤만 있고 ① 없는 단락 존재)
    const seperate = [...xml.matchAll(/<hp:p[^>]*>((?:(?!<\/hp:p>)[\s\S])*?)<\/hp:p>/g)]
      .filter((m) => m[1].includes('⑤') && !m[1].includes('①'));
    expect(seperate.length).toBeGreaterThan(0);
  });

  it('인라인 수식($..$)만 있으면 가운데 단락 없음 (기존 동작 보존)', async () => {
    const buf = (await generateHWPX(
      [prob(1, '함수 $y=2x$ 의 기울기를 구하시오.')],
      { title: 't', showNameField: false, showAnswerSheet: false },
    )) as Buffer;
    const xml = await section0Of(buf);
    expect(xml).not.toMatch(/<hp:p[^>]*paraPrIDRef="64"/);
    expect(xml).toContain('<hp:equation');
  });

  it('perPage=4·2단: 페이지당 2×2 그리드 표, 세로 우선 배치 (8문제 → 표 2개)', async () => {
    const problems = Array.from({ length: 8 }, (_, i) => prob(i + 1, `${i + 1}번 문제 본문`));
    const buf = (await generateHWPX(problems, {
      title: 't', columns: 2, perPage: 4, showNameField: false, showAnswerSheet: false,
    })) as Buffer;
    const xml = await section0Of(buf);
    // 그리드 표 2개 (헤더 미지정이라 헤더표 없음), 각각 2행×2열
    const tbls = [...xml.matchAll(/<hp:tbl[^>]*rowCnt="(\d+)" colCnt="(\d+)"[\s\S]*?<\/hp:tbl>/g)];
    expect(tbls.length).toBe(2);
    for (const t of tbls) { expect(t[1]).toBe('2'); expect(t[2]).toBe('2'); }
    // 세로 우선: 표1 = 1·2(왼쪽 열), 3·4(오른쪽 열). 셀(r0,c1) 에 3번.
    // 번호는 자기 단락 <hp:t>N.</hp:t> (본문은 번호 아래 줄부터 — PDF/시중지 스타일)
    expect(tbls[0][0]).toContain('<hp:t>1.</hp:t>');
    expect(tbls[0][0]).toContain('<hp:t>4.</hp:t>');
    expect(tbls[0][0]).not.toContain('<hp:t>5.</hp:t>');
    expect(tbls[1][0]).toContain('<hp:t>5.</hp:t>');
    expect(tbls[1][0]).toContain('<hp:t>8.</hp:t>');
    // 셀 주소 검증: 3번 문제 셀은 colAddr=1, rowAddr=0
    const cell3 = tbls[0][0].match(/<hp:tc[^>]*>(?:(?!<\/hp:tc>)[\s\S])*?<hp:t>3\.<\/hp:t>(?:(?!<\/hp:tc>)[\s\S])*?<\/hp:tc>/);
    expect(cell3![0]).toContain('colAddr="1" rowAddr="0"');
    // 그리드 모드 = 명시적 1단 colPr (colPr 생략 시 한글이 표를 우측으로 밀어 배치 — 치우침 실증)
    expect(xml).toContain('colCount="1"');
    expect(xml).not.toContain('colCount="2"');
    // 왼쪽 열 = 구분선 borderFill(26), 오른쪽 열 = 테두리 없음(2)
    expect(tbls[0][0]).toContain('borderFillIDRef="26"');
    expect(tbls[0][0]).toContain('borderFillIDRef="2"');
  });

  it('그리드 모드: header.xml 구분선 bf(26) 주입 + 표 전부 인라인(treatAsChar=1)', async () => {
    const buf = (await generateHWPX(
      [prob(1, '본문')],
      { title: 't', columns: 2, perPage: 4, showNameField: false, showAnswerSheet: false },
    )) as Buffer;
    const zip = await JSZip.loadAsync(buf);
    const header = await zip.file('Contents/header.xml')!.async('string');
    expect(header).toContain('<hh:borderFill id="26"');
    expect(header).toMatch(/<hh:borderFill id="26"[\s\S]*?<hh:rightBorder type="SOLID" width="0\.12 mm" color="#CCCCCC"\/>/);
    // 그리드 모드는 플로팅 표 금지 — colPr 없는 섹션의 플로팅은 한글이 우측으로 틀어 배치(치우침 실증)
    const xml = await zip.file('Contents/section0.xml')!.async('string');
    expect(xml).not.toContain('treatAsChar="0"');
  });

  it('전각 구두점 선두 번호 "1．다음" 제거 (동래여중 실증)', () => {
    expect(sanitizeProblemContent('1．다음 〈보기〉 중에서 이차방정식인 것은?', 1, [])).toMatch(/^다음/);
  });

  it('<보기＞ 라벨 단독 줄 → 테두리 박스 표(bf4)로, 본문 언급 〈보기〉는 미발동', async () => {
    const content = '다음 〈보기〉 중에서 고른 것은?\n<보기＞\nㄱ． $2x^{2}-x+4=x^{2}+1$\nㄴ． $2x(x-1)=3+2x^{2}$';
    const buf = (await generateHWPX(
      [prob(1, content)],
      { title: 't', columns: 2, showNameField: false, showAnswerSheet: false },
    )) as Buffer;
    const xml = await section0Of(buf);
    // 박스 표 존재 (테두리 bf4, 1×1, 인라인)
    const box = xml.match(/<hp:tbl[^>]*rowCnt="1" colCnt="1"[^>]*borderFillIDRef="4"[\s\S]*?<\/hp:tbl>/);
    expect(box).toBeTruthy();
    expect(box![0]).toContain('treatAsChar="1"');
    expect(box![0]).toContain('&lt;보기&gt;');   // 왼쪽 볼드 라벨
    expect(box![0]).toContain('<hp:equation');     // ㄱ/ㄴ 수식이 박스 안에
    // 질문 스템(박스 밖)에는 보기 항목 수식 없음 + 스템의 〈보기〉 언급은 유지
    expect(xml).toContain('다음 〈보기〉 중에서');
  });

  it('pageCounts(자동 배열): 미리보기 페이지 구성 그대로 — [3,2] → 표 2개 (2행/1행)', async () => {
    const problems = Array.from({ length: 5 }, (_, i) => prob(i + 1, `${i + 1}번 문제 본문`));
    const buf = (await generateHWPX(problems, {
      title: 't', columns: 2, pageCounts: [3, 2], showNameField: false, showAnswerSheet: false,
    })) as Buffer;
    const xml = await section0Of(buf);
    const tbls = [...xml.matchAll(/<hp:tbl[^>]*rowCnt="(\d+)" colCnt="(\d+)"[\s\S]*?<\/hp:tbl>/g)];
    expect(tbls.length).toBe(2);
    expect(tbls[0][1]).toBe('2'); // ceil(3/2)=2행
    expect(tbls[1][1]).toBe('1'); // ceil(2/2)=1행
    expect(tbls[0][0]).toContain('<hp:t>3.</hp:t>');
    expect(tbls[0][0]).not.toContain('<hp:t>4.</hp:t>');
    expect(tbls[1][0]).toContain('<hp:t>4.</hp:t>');
    expect(tbls[1][0]).toContain('<hp:t>5.</hp:t>');
    // 자동 그리드도 1단 colPr
    expect(xml).toContain('colCount="1"');
  });

  it('|보기| 파이프 라벨도 박스 감지 (엄궁중 실증)', async () => {
    const content = '다음 중 일차함수인 것을 |보기|에서 모두 고른 것은?\n|보기|\nㄱ. 한 변의 길이가 $2x$ 인 정사각형의 넓이 $y$';
    const buf = (await generateHWPX(
      [prob(1, content)],
      { title: 't', columns: 2, showNameField: false, showAnswerSheet: false },
    )) as Buffer;
    const xml = await section0Of(buf);
    const box = xml.match(/<hp:tbl[^>]*rowCnt="1" colCnt="1"[^>]*borderFillIDRef="4"[\s\S]*?<\/hp:tbl>/);
    expect(box).toBeTruthy();
    expect(box![0]).toContain('&lt;보기&gt;');
    expect(xml).toContain('|보기|에서 모두'); // 본문 언급은 유지
  });

  it('\\begin{tabular} 데이터 표 → 테두리 표 (원문 노출 방지, 요금표 실증)', async () => {
    const content = '구간별 요금은 다음과 같다.\n\\begin{tabular}{|c|}A \\leftrightarrow B: 1200원 \\\\ B \\leftrightarrow C: 1000원 \\\\ A \\leftrightarrow C: 1800원 \\\\ \\end{tabular}\n이 버스에 승객 40명을 태우고 출발한 후. [5점]';
    const buf = (await generateHWPX(
      [{ ...prob(1, content), points: 5 }],
      { title: 't', columns: 2, showNameField: false, showAnswerSheet: false },
    )) as Buffer;
    const xml = await section0Of(buf);
    expect(xml).not.toContain('tabular');       // 원문 노출 없음
    const tbl = xml.match(/<hp:tbl[^>]*rowCnt="3" colCnt="1"[\s\S]*?<\/hp:tbl>/);
    expect(tbl).toBeTruthy();                    // 3행 1열 표
    expect(tbl![0]).toContain('borderFillIDRef="27"'); // 1열 = 세로 막대만 ({|c|} 웹 동일)
    expect(tbl![0]).toContain('1200원');
    expect(tbl![0]).toContain('↔');              // \leftrightarrow → ↔
    expect(xml).toContain('[5점]');              // 배점은 표 뒤 텍스트 파트에 유지
    expect(xml).toContain('승객 40명');
  });

  it('헤더 강조색·테마: 색띠(bf29)+accent선(bf28) 주입, line 은 선만, 없으면 기본(10)', async () => {
    const base = { title: 't', columns: 2 as const, perPage: 4, showAnswerSheet: false };
    const header = { schoolName: 'A중', examTitle: 'T', subject: '수학', examType: '기출', grade: '중2' };
    // wave(그래픽 테마) → 색 띠 + accent 선
    const bufWave = (await generateHWPX([prob(1, '본문')], {
      ...base, header: { ...header, accentColor: '#0891B2', headerTheme: 'wave' },
    })) as Buffer;
    const zipW = await JSZip.loadAsync(bufWave);
    const hW = await zipW.file('Contents/header.xml')!.async('string');
    expect(hW).toMatch(/<hh:borderFill id="29"[\s\S]*?faceColor="#0891B2"/);
    expect(hW).toMatch(/<hh:borderFill id="28"[\s\S]*?bottomBorder type="SOLID" width="0\.4 mm" color="#0891B2"/);
    const xmlW = await zipW.file('Contents/section0.xml')!.async('string');
    expect(xmlW).toContain('borderFillIDRef="29"'); // 색 띠 행
    expect(xmlW).toContain('borderFillIDRef="28"'); // 이름줄 accent 선
    // line 테마 → 색 띠 없음, accent 선만
    const bufLine = (await generateHWPX([prob(1, '본문')], {
      ...base, header: { ...header, accentColor: '#E11D48', headerTheme: 'line' },
    })) as Buffer;
    const xmlL = await (await JSZip.loadAsync(bufLine)).file('Contents/section0.xml')!.async('string');
    expect(xmlL).not.toContain('borderFillIDRef="29"');
    expect(xmlL).toContain('borderFillIDRef="28"');
    // 색 없음 → 기본 하단선(10), 주입 없음
    const bufNone = (await generateHWPX([prob(1, '본문')], { ...base, header })) as Buffer;
    const zipN = await JSZip.loadAsync(bufNone);
    expect(await zipN.file('Contents/header.xml')!.async('string')).not.toContain('<hh:borderFill id="28"');
    expect(await zipN.file('Contents/section0.xml')!.async('string')).toContain('borderFillIDRef="10"');
    // 잘못된 색 → 무시 (미주입 bf 참조 사고 방지)
    const bufBad = (await generateHWPX([prob(1, '본문')], {
      ...base, header: { ...header, accentColor: 'red', headerTheme: 'wave' },
    })) as Buffer;
    const xmlB = await (await JSZip.loadAsync(bufBad)).file('Contents/section0.xml')!.async('string');
    expect(xmlB).not.toContain('borderFillIDRef="29"');
  });

  it('헤더 구조 4종(editorial/classic/boxed/mock) — 각 구조 시그니처 렌더', async () => {
    const base = { title: 't', columns: 2 as const, perPage: 4, showAnswerSheet: false };
    const header = { schoolName: 'A중', examTitle: '중간고사', subject: '수학', examType: '학교기출', grade: '중2', teacher: '김샘' };
    const xmlOf = async (headerStyle?: 'editorial' | 'classic' | 'boxed' | 'mock') => {
      const buf = (await generateHWPX([prob(1, '본문')], { ...base, header: { ...header, headerStyle } })) as Buffer;
      return section0Of(buf);
    };
    const ed = await xmlOf();                      // 기본 에디토리얼: 이름줄 하단선(10)
    expect(ed).toContain('이름 :');
    const cl = await xmlOf('classic');             // 클래식: 라벨 셀(bf25) + '학원/학교' 라벨
    expect(cl).toContain('학원/학교');
    expect(cl).toContain('borderFillIDRef="25"');
    const bx = await xmlOf('boxed');               // 박스형: 우측 회색 정보칸(bf25) + 테두리(bf4)
    expect(bx).toContain('borderFillIDRef="25"');
    expect(bx).toContain('점수 :');
    const mk = await xmlOf('mock');                // 모의고사형: 3열 밴드 + 하단 0.4mm(bf31) + 가운데(64) 제목
    expect(mk).toContain('borderFillIDRef="31"');
    expect(mk).toMatch(/paraPrIDRef="64"[\s\S]*?중간고사/);
  });

  it('빠른정답 표 — PDF 형식(문항|정답 4열, 회색 헤더행, 수식 렌더, LaTeX 노출 없음)', async () => {
    const buf = (await generateHWPX(
      [
        { ...prob(1, '풀어라.'), answer: '$\\dfrac{1}{5} \\le a \\le 7$' } as never,
        { ...prob(2, '구하라.'), answer: '②' } as never,
        { ...prob(3, '풀어라.'), answer: '-8' } as never,
      ],
      { title: 't', showNameField: false, showAnswerSheet: true },
    )) as Buffer;
    const xml = await section0Of(buf);
    const ansIdx = xml.indexOf('빠 른 정 답');
    expect(ansIdx).toBeGreaterThan(0);
    const tail = xml.slice(ansIdx);
    // 4열 표 + 회색 헤더행(문항/정답 bf25)
    expect(tail).toMatch(/<hp:tbl[^>]*colCnt="4"/);
    expect(tail).toContain('문항');
    expect(tail).toContain('borderFillIDRef="25"');
    // 수식 렌더 + 원문 노출 없음
    expect(tail).toContain('<hp:equation');
    expect(tail).toContain('{1} over {5}');
    expect(tail).not.toContain('\\dfrac');
    // 좌 1..2 / 우 3 배치 (half=2)
    expect(tail).toContain('②');
  });

  it('perPage 미지정: 그리드 표 없이 NEWSPAPER 2단 자연 흐름 (기존 동작 보존)', async () => {
    const problems = Array.from({ length: 8 }, (_, i) => prob(i + 1, `${i + 1}번 문제 본문`));
    const buf = (await generateHWPX(problems, {
      title: 't', columns: 2, showNameField: false, showAnswerSheet: false,
    })) as Buffer;
    const xml = await section0Of(buf);
    expect(xml).not.toContain('<hp:tbl'); // 헤더 미지정 + 흐름 모드 → 표 없음
    expect(xml).toContain('<hp:colPr');
  });
});

// ============================================================================
// 미지 토큰 회귀 (2026-09-02, 고1 도형 12번 실사고)
//   증상: 화면 "l ∥ m, l ⊥ n" 이 한글 파일에서 "l ∥ m, lperpn" 으로 나왔다.
//   원인: \perp 를 `perp` 로 매핑했는데 한글 수식 어휘엔 그런 낱말이 없다.
//         한글은 모르는 낱말을 오류 없이 **그대로 글자로 찍는다** → 조용히 학생에게 나감.
//   근거: 한글이 스스로 내보낸 수식이 운영 problems 본문에 26건 남아 있다 —
//         `${\overline{ OP }} BOT {\overline{ OQ }}$` (직각삼각형 POQ). `PERP` 는 0건.
// ============================================================================
describe('한글 수식 미지 토큰 (글자로 새는 클래스)', () => {
  const cases: [string, string][] = [
    ['l \\perp m', 'l bot m'],                       // ★ 사고 당사자
    ['l \\parallel m', 'l parallel m'],              // 정상이던 것 — 회귀 감시
    ['\\overline{OP} \\perp \\overline{OQ}', 'overline {OP} bot overline {OQ}'],
    ['A \\cap B', 'A smallinter B'],                 // cap/cup 도 한글 어휘가 아니다
    ['A \\cup B', 'A smallunion B'],
    // \circ — 미매핑이라 통째로 지워져 도(°)가 사라졌다 (운영 1,755건)
    ['90^{\\circ}', '90^{circ}'],
    ['(f \\circ g)(x)', '(f circ g)(x)'],
    // 아래는 전부 "조용히 삭제" 였던 것들
    ['\\{ x \\mid x > 0 \\}', 'lbrace x | x > 0 rbrace'],
    ['\\gcd(a,b)', 'gcd(a,b)'],
    ['\\det A', 'det A'],
    ['\\overrightarrow{AB}', 'vec {AB}'],
    ['a \\equiv b \\pmod{n}', 'a equiv b (mod n)'],
    ['\\varnothing', 'emptyset'],
    ['\\not\\subset', 'nsubset'],                    // \not 삭제로 뜻이 뒤집히던 것
    // 토큰이 엉겨 붙으면 그것도 한글이 모르는 낱말이 된다 (검증 샘플 실측 2건)
    ['x \\cdots\\cdots y', 'x cdots cdots y'],
    ['\\overline{\\mathrm{AB}} \\perp \\overline{\\mathrm{CD}}', 'overline {"AB"} bot overline {"CD"}'],
    ['\\lvert x \\rvert', '| x |'],
  ];
  for (const [latex, hwp] of cases) {
    it(`${latex} → ${hwp}`, () => {
      expect(latexToHWPEquation(latex)).toBe(hwp);
      expect(latexToHWPEquation(latex)).not.toMatch(/perp/);
    });
  }

  it('변환표 값은 전부 한글 어휘 토큰이거나 알파벳 없는 리터럴이어야 한다 (재발 차단)', () => {
    const bad: string[] = [];
    for (const [tex, hwp] of Object.entries(HWP_SYMBOL_MAP)) {
      for (const w of hwp.match(/[A-Za-z]{2,}/g) || []) {
        if (!HWP_EQ_VOCAB.has(w)) bad.push(`${tex} → ${hwp} (미지: ${w})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('scanHwpxArtifacts 가 미지 토큰을 잡는다 (안전망)', () => {
    const w = scanHwpxArtifacts('<hp:script>l perp m</hp:script>')
      .find((x) => x.kind === 'eq-unknown-token');
    expect(w).toBeTruthy();
    expect(w!.sample).toContain('perp');
    // 정상 토큰·따옴표 안 원문(\text)은 안 잡는다
    expect(scanHwpxArtifacts('<hp:script>l bot m</hp:script>')
      .find((x) => x.kind === 'eq-unknown-token')).toBeUndefined();
    expect(scanHwpxArtifacts('<hp:script>"직선이다" bot</hp:script>')
      .find((x) => x.kind === 'eq-unknown-token')).toBeUndefined();
  });
});
