// 헤더 표 + 2단 + 수학 본문 통합 검증 → gwasaram_test10.hwpx 생성 후 구조 확인
//   npx tsx scripts/test-hwpx-header.mts
import { writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { generateHWPX } from '../src/lib/export/hwpx-generator';

const problems = [
  { number: 1, content: '다음 지수함수 또는 로그함수의 식과 그래프가 알맞게 짝지어진 것은?', choices: ['$y=3^{x}$', '$y=\\log_{2}(x-2)$', '$y=2^{-x}+1$', '$y=-\\log_{\\frac{1}{2}} x$', '$y=\\log_{2} x^{2}$'], answer: 3, points: 3.2 },
  { number: 3, content: '중심각의 크기가 $\\frac{3}{4}\\pi$ 이고 호의 길이가 $6\\pi$ 인 부채꼴의 넓이는?', choices: ['$20\\pi$', '$21\\pi$', '$22\\pi$', '$23\\pi$', '$24\\pi$'], answer: 5, points: 3.3 },
  { number: 13, content: '상수 $k(-1<k<1)$에 대하여 $x$에 대한 방정식 $\\cos x=k \\ (0 \\leq x<2\\pi)$의 두 근을 각각 $\\alpha, \\beta \\ (\\alpha<\\beta)$라 할 때, <보기>에서 옳은 것만을 있는 대로 고른 것은?\nㄴ. $0<k<1$ 이면 $\\cos \\frac{\\beta-\\alpha}{2}>0$이다.', choices: [], answer: '풀이참조', points: 4 },
];

const cfg = {
  title: '26 구덕고 대수 1학기 중간',
  showAnswerSheet: true,
  showSolutions: false,
  columns: 2 as const,
  problemGap: 40, // 40px → space-before 3000 HWPUNIT
  header: {
    schoolName: '구덕고',
    examTitle: '26 구덕고 대수 1학기 중간',
    teacher: '',
    subject: '수학I',
    semester: '',
    examType: '학교기출',
    grade: '고1',
  },
};

const out = (await generateHWPX(problems as any, cfg as any)) as Buffer;
const path = 'c:/과사람 프로젝트/mathflat-research/gwasaram_test10.hwpx';
await writeFile(path, out);
console.log(`생성: ${out.length} bytes -> ${path}`);

// 구조 검증
const zip = await JSZip.loadAsync(out);
const sec = await zip.file('Contents/section0.xml')!.async('string');
const hdr = await zip.file('Contents/header.xml')!.async('string');
const checks: [string, boolean][] = [
  ['section0 에 <hp:tbl 존재', sec.includes('<hp:tbl')],
  ['라벨셀 borderFillIDRef=25 참조', sec.includes('borderFillIDRef="25"')],
  ['값셀 borderFillIDRef=4 참조', sec.includes('borderFillIDRef="4"')],
  ['헤더 라벨 "학원/학교"', sec.includes('학원/학교')],
  ['헤더 라벨 "유형"', sec.includes('>유형<')],
  ['값 "구덕고"', sec.includes('구덕고')],
  ['값 "학교기출"', sec.includes('학교기출')],
  ['값 "수학I"', sec.includes('수학I')],
  ['이름란 미포함(헤더 표로 대체)', !sec.includes('이름 : ')],
  ['2단 colPr 존재', sec.includes('type="NEWSPAPER"')],
  ['표가 colPr 뒤', sec.indexOf('<hp:colPr') < sec.indexOf('<hp:tbl') && sec.indexOf('<hp:colPr') >= 0],
  ['header.xml 에 borderFill id=25 정의', hdr.includes('id="25"')],
  ['header.xml borderFills itemCnt=25', hdr.includes('itemCnt="25"')],
  ['13번 본문 "두 근을 각각" 보존', sec.includes('두 근을 각각')],
  ['13번 "이면" 보존(00이다 사고 없음)', sec.includes('이면')],
  ['13번 "<보기>" 보존', sec.includes('&lt;보기&gt;') || sec.includes('<보기>'.replace(/</g,'&lt;').replace(/>/g,'&gt;'))],
  ['NUL 바이트 없음', !sec.includes('\0') && !hdr.includes('\0')],
  // 간격: space-before paraPr 90 주입 + 사용
  ['header.xml 에 paraPr id=90 주입', hdr.includes('<hh:paraPr id="90"')],
  ['paraPr 90 prev(위 간격)=3000', /<hh:paraPr id="90"[\s\S]*?<hc:prev value="3000"/.test(hdr)],
  ['paraProperties itemCnt 67(66+1)', hdr.includes('itemCnt="67"')],
  ['section0 문제(2번 이상)가 paraPrIDRef=90 사용', sec.includes('paraPrIDRef="90"')],
];
let pass = 0;
for (const [name, ok] of checks) { if (ok) pass++; console.log(`${ok ? 'OK ' : 'XX '} ${name}`); }
console.log(`\n검증: ${pass}/${checks.length} 통과`);
