// HWPX 생성기 구조 검증 (한글 없이): 변환기 출력 + .hwpx 생성 → 파일 저장.
//   npx tsx scripts/test-hwpx.mts
import { writeFile } from 'node:fs/promises';
import { generateHWPX, latexToHWPEquation } from '../src/lib/export/hwpx-generator';

// 1) 수식 변환기 — 실측 기대값 대조
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

// 2) .hwpx 생성
const problems = [
  { number: 1, content: '함수 \\(y = \\log_{a} x\\) 의 그래프를 그리고, 그 성질을 설명하시오.', choices: [], answer: '풀이참조', points: 5 },
  { number: 2, content: '집합 \\(\\left\\{ x | -4 \\le x \\le 120 \\right\\}\\) 의 원소 개수를 구하시오.', choices: ['①  121', '②  122', '③  123', '④  124', '⑤  125'], answer: 1, points: 4 },
  { number: 3, content: '\\(\\frac{1}{5} + \\frac{2}{3}\\) 를 계산하면?', choices: ['① \\(\\frac{13}{15}\\)', '② \\(\\frac{3}{8}\\)'], answer: 1, points: 3 },
  { number: 4, content: '다음 그래프를 보고 물음에 답하시오. ![figure](https://ppexawiiphghdrjnmvkx.supabase.co/storage/v1/object/public/source-files/problem-crops/a93e2565-ac85-48a6-816c-25bd24b73568/problem-15-figure.png) 위 그림에서 삼각형 ABC 의 넓이를 구하시오.', choices: [], answer: '풀이참조', points: 5 },
];
const config = {
  title: '2026학년도 1학기 중간고사 대비',
  subtitle: '수학 (로그함수)',
  instituteName: '과사람수학',
  showNameField: true,
  showAnswerSheet: true,
  showSolutions: false,
};
const out = (await generateHWPX(problems as any, config as any)) as Buffer;
const path = 'c:/과사람 프로젝트/mathflat-research/gwasaram_test9.hwpx';
await writeFile(path, out);
console.log(`=== .hwpx 생성: ${out.length} bytes -> ${path} ===`);
