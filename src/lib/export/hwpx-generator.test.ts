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
import { generateHWPX, latexToHWPEquation, parseContent, sanitizeProblemContent } from './hwpx-generator';
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

  it('인라인 수식($..$)만 있으면 가운데 단락 없음 (기존 동작 보존)', async () => {
    const buf = (await generateHWPX(
      [prob(1, '함수 $y=2x$ 의 기울기를 구하시오.')],
      { title: 't', showNameField: false, showAnswerSheet: false },
    )) as Buffer;
    const xml = await section0Of(buf);
    expect(xml).not.toMatch(/<hp:p[^>]*paraPrIDRef="64"/);
    expect(xml).toContain('<hp:equation');
  });

  it('perPage=4·2단: 단당 2문제 후 columnBreak, 4문제 후 pageBreak (8문제)', async () => {
    const problems = Array.from({ length: 8 }, (_, i) => prob(i + 1, `${i + 1}번 문제 본문`));
    const buf = (await generateHWPX(problems, {
      title: 't', columns: 2, perPage: 4, showNameField: false, showAnswerSheet: false,
    })) as Buffer;
    const xml = await section0Of(buf);
    // idx4(5번 문제) 에서 pageBreak 1회, idx2(3번)·idx6(7번) 에서 columnBreak 2회
    expect((xml.match(/pageBreak="1"/g) || []).length).toBe(1);
    expect((xml.match(/columnBreak="1"/g) || []).length).toBe(2);
    // 나누기 단락이 해당 문제 번호 run 을 포함하는지 (위치 검증)
    const pageBrkPara = xml.match(/<hp:p[^>]*pageBreak="1"[^>]*>([\s\S]*?)<\/hp:p>/);
    expect(pageBrkPara![1]).toContain('5. ');
    const colBrkParas = [...xml.matchAll(/<hp:p[^>]*columnBreak="1"[^>]*>([\s\S]*?)<\/hp:p>/g)];
    expect(colBrkParas[0][1]).toContain('3. ');
    expect(colBrkParas[1][1]).toContain('7. ');
  });

  it('perPage 미지정: 나누기 없음 (기존 동작 보존)', async () => {
    const problems = Array.from({ length: 8 }, (_, i) => prob(i + 1, `${i + 1}번 문제 본문`));
    const buf = (await generateHWPX(problems, {
      title: 't', columns: 2, showNameField: false, showAnswerSheet: false,
    })) as Buffer;
    const xml = await section0Of(buf);
    expect(xml).not.toContain('pageBreak="1"');
    expect(xml).not.toContain('columnBreak="1"');
  });
});
