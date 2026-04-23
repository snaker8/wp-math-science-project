/**
 * repairLatexRender 규칙 검증 스크립트.
 *
 * 실행: npx tsx scripts/test-auto-fix-latex.ts
 *
 * 기존 데이터를 건드리지 않는 pure function 테스트. DB 연결 없음.
 * ★ 용어: 기존 "자동수정(autofix)" = 유형매핑, 이 모듈 = LaTeX 렌더 수정 (별개).
 */
import { repairLatexRender } from '../src/lib/latex/renderRepair';

type Case = { name: string; input: string; expectChange: boolean; snippet?: string };

const cases: Case[] = [
  {
    name: '사용자 스크린샷 케이스 (split piecewise with array)',
    input: `함수 $f(x)=\\left\\{$\n\n$\\begin{array}{l}x^{3}+a x(x \\geq 1) \\\\ b x^{2}+4(x<1)\\end{array}$\n\n$\\right.$ 이 모든 실수 $x$에서 미분 가능하도록...`,
    expectChange: true,
    snippet: '\\begin{array}',
  },
  {
    name: 'split piecewise with bare 2-lines',
    input: `$\\left\\{$\n$x+y=3$\n$x-y=1$\n$\\right.$`,
    expectChange: true,
    snippet: '\\begin{cases}',
  },
  {
    name: '정상 단일 블록 piecewise — 건드리지 말 것',
    input: `$f(x)=\\left\\{\\begin{array}{l}x^{3}+ax(x\\geq 1)\\\\ bx^{2}+4(x<1)\\end{array}\\right.$ 이 모든 실수 $x$에서...`,
    expectChange: false,
  },
  {
    name: '단순 텍스트 — 건드리지 말 것',
    input: `다음 $x$의 값을 구하시오. (단, $x > 0$)`,
    expectChange: false,
  },
  {
    name: '선택지가 포함된 문항 — 건드리지 말 것',
    input: `다음 중 옳은 것은? ① $a > b$ ② $a < b$ ③ $a = b$`,
    expectChange: false,
  },
  {
    name: '빈 수식 블록 제거',
    input: `값은 $ \\displaystyle $ 이다.`,
    expectChange: true,
  },
  {
    name: '이미 \\begin{cases} 있는 경우 — Rule A만 발동해야 Rule B 오발동 방지',
    input: `$f(x)=\\begin{cases}x+1 & x>0 \\\\ -x & x\\leq 0\\end{cases}$`,
    expectChange: false,
  },
  {
    name: '한글이 섞인 bare 2줄 — Rule B 건너뜀 (false positive 방지)',
    input: `$\\left\\{$\n$a의 값$\n$b의 값$\n$\\right.$`,
    expectChange: false,
  },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const { fixed, changes } = repairLatexRender(c.input);
  const changed = fixed !== c.input || changes.length > 0;
  const ok = changed === c.expectChange &&
    (!c.snippet || c.snippet === '' || fixed.includes(c.snippet));
  if (ok) {
    pass++;
    console.log(`✓ ${c.name}`);
    if (changes.length > 0) console.log(`  → changes: ${changes.join(', ')}`);
  } else {
    fail++;
    console.log(`✗ ${c.name}`);
    console.log(`  expectChange=${c.expectChange} got changed=${changed}`);
    console.log(`  changes: ${changes.join(', ') || '(none)'}`);
    console.log(`  input : ${JSON.stringify(c.input).slice(0, 200)}`);
    console.log(`  output: ${JSON.stringify(fixed).slice(0, 200)}`);
    if (c.snippet) console.log(`  snippet expected: ${c.snippet}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed of ${cases.length}`);
process.exit(fail > 0 ? 1 : 0);
