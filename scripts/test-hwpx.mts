// HWPX 생성기 구조 검증 (한글 없이): 변환기 출력 + .hwpx 생성 → 파일 저장.
//   npx tsx scripts/test-hwpx.mts
//   ※ 수식 골든·라운드트립·section0 구조는 vitest 로 이관됨 (src/lib/export/hwpx-generator.test.ts).
//     이 스크립트는 "한글에서 열어보는 육안 검증용 샘플 파일" 생성 담당.
import { writeFile } from 'node:fs/promises';
import { generateHWPX, latexToHWPEquation } from '../src/lib/export/hwpx-generator';

// 1) 수식 변환기 — 실측 기대값 대조 (빠른 스모크. 전체는 vitest)
const cases: [string, string][] = [
  ['\\frac{1}{5}', '{1} over {5}'],
  ['y = \\log_{a} x', 'y = log_{a} x'],
  ['\\left\\{ x | -4 \\le x \\le 120 \\right\\}', 'LEFT { x | -4 <= x <= 120 RIGHT }'],
  ['y = \\log_{\\frac{1}{5}} (x+5) - 2', 'y = log_{{1} over {5}} (x+5) - 2'],
  ['\\sqrt{2}', 'sqrt {2}'],
  ['\\left\\{\\begin{array}{cc} 3x-5 & (x \\leq 1) \\\\ 7x+c & (x \\geq 3) \\end{array}\\right.', 'cases {3x-5 & (x <= 1) # 7x+c & (x >= 3)}'],
];
console.log('=== 수식 변환기 ===');
let pass = 0;
for (const [inp, exp] of cases) {
  const got = latexToHWPEquation(inp);
  const ok = got === exp;
  if (ok) pass++;
  console.log(`${ok ? 'OK ' : 'XX '} "${inp}" -> "${got}"${ok ? '' : `  (기대: "${exp}")`}`);
}
console.log(`변환기: ${pass}/${cases.length} 일치\n`);

// 2) 육안 검증 샘플 문제 — 디스플레이 수식(가운데 자기단락)·cases·인라인·도형·선택지 전 유형 포함
const problems = [
  { number: 1, content: '함수 \\(y = \\log_{a} x\\) 의 그래프를 그리고, 그 성질을 설명하시오.', choices: [], answer: '풀이참조', points: 5 },
  { number: 2, content: '집합 \\(\\left\\{ x | -4 \\le x \\le 120 \\right\\}\\) 의 원소 개수를 구하시오.', choices: ['①  121', '②  122', '③  123', '④  124', '⑤  125'], answer: 1, points: 4 },
  // ★ 디스플레이 수식 — 가운데정렬 자기 단락(paraPr 64)으로 분리되어야 함
  { number: 3, content: '다음을 계산하시오. $$\\frac{1}{5} + \\frac{2}{3} \\times \\sqrt{2}$$ 풀이 과정을 함께 쓰시오.', choices: [], answer: '풀이참조', points: 4 },
  // ★ 조각함수(cases) 디스플레이 — 행 분리(#) + 가운데 단락
  { number: 4, content: '함수 $$f(x) = \\left\\{\\begin{array}{cc} 3x-5 & (x \\leq 1) \\\\ 7x+c & (x \\geq 3) \\end{array}\\right.$$ 가 연속이 되도록 하는 상수 \\(c\\) 의 값을 구하시오.', choices: [], answer: '풀이참조', points: 5 },
  { number: 5, content: '\\(\\frac{1}{5} + \\frac{2}{3}\\) 를 계산하면?', choices: ['① \\(\\frac{13}{15}\\)', '② \\(\\frac{3}{8}\\)'], answer: 1, points: 3 },
  { number: 6, content: '\\(x \\to \\infty\\) 일 때 \\(\\frac{1}{x}\\) 의 극한값을 구하시오.', choices: [], answer: '0', points: 3 },
  { number: 7, content: '다음 그래프를 보고 물음에 답하시오. ![figure](https://ppexawiiphghdrjnmvkx.supabase.co/storage/v1/object/public/source-files/problem-crops/a93e2565-ac85-48a6-816c-25bd24b73568/problem-15-figure.png) 위 그림에서 삼각형 ABC 의 넓이를 구하시오.', choices: [], answer: '풀이참조', points: 5 },
  { number: 8, content: '등식 \\[ (x+1)^2 = x^2 + 2x + 1 \\] 이 항등식임을 보이시오.', choices: [], answer: '풀이참조', points: 3 },
];

const header = {
  schoolName: '과사람수학',
  examTitle: '2026-1학기 중간대비 (육안검증 샘플)',
  teacher: '',
  subject: '공통수학1',
  semester: '1학기',
  examType: '학교기출',
  grade: '고1',
};

// (a) 기본 2단 + 헤더표 — 디스플레이 수식 가운데정렬 확인용
const outA = (await generateHWPX(problems as any, {
  title: '육안검증 A — 디스플레이 수식·헤더표',
  showAnswerSheet: true,
  showSolutions: false,
  columns: 2,
  header,
} as any)) as Buffer;
const pathA = 'c:/과사람 프로젝트/mathflat-research/gwasaram_test11_display.hwpx';
await writeFile(pathA, outA);
console.log(`=== A(디스플레이·헤더): ${outA.length} bytes -> ${pathA}`);

// (b) perPage=4 배열 — 페이지당 4문제(단당 2문제) 확정 나누기 확인용
const outB = (await generateHWPX(problems as any, {
  title: '육안검증 B — 4문제 배열(pageBreak/columnBreak)',
  showAnswerSheet: true,
  showSolutions: false,
  columns: 2,
  perPage: 4,
  header,
} as any)) as Buffer;
const pathB = 'c:/과사람 프로젝트/mathflat-research/gwasaram_test12_perpage.hwpx';
await writeFile(pathB, outB);
console.log(`=== B(perPage=4): ${outB.length} bytes -> ${pathB}`);
console.log('\n한글에서 열어 확인: A=디스플레이 수식 가운데 단락·헤더표·2단, B=페이지당 4문제(단당 2문제) 나누기');
