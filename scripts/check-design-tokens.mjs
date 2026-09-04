// 디자인 토큰 래칫 가드 — 크롬 원색 하드코딩이 "늘어나면" 실패한다.
// 근거: insane-design/linear/design.md §18 — 크롬(네비·카드·버튼·보더)에 채도색 금지.
// 사용:
//   node scripts/check-design-tokens.mjs            # 검사 (baseline 대비 증가 시 exit 1)
//   node scripts/check-design-tokens.mjs --update   # 줄인 뒤 baseline 갱신
// 원칙: 기존 사용처를 한 번에 다 못 고쳐도 된다 — 새로 늘리는 것만 기계적으로 차단(래칫).
//   데이터 그래픽(차트·난이도바·히트맵)의 채도색은 허용 — 파일 단위 allowlist 로 제외.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');
const BASELINE_FILE = path.resolve(process.cwd(), 'scripts/design-token-baseline.json');

// 크롬 금지 대상: tailwind 원색 유틸 (indigo·violet·amber·rose 등 채도 팔레트)
// emerald/red 는 시맨틱(정상/위험) 용도가 많아 러프하게 허용 — 필요 시 조이기.
const PATTERN =
  /\b(?:bg|text|border|from|to|via|ring|shadow)-(?:indigo|violet|purple|amber|yellow|rose|pink|cyan|sky|blue|orange|fuchsia|teal|lime)-(?:[1-9]00|950)\b/g;

// 데이터 그래픽·인쇄(종이)·리포트 등 채도색이 정당한 파일은 제외
const ALLOW = [
  /components[\\/]diagnostics[\\/]/,   // 진단 리포트 (자체 디자인 언어)
  /components[\\/]exam-report[\\/]/,
  /components[\\/]class[\\/]MasteryMatrix/,  // 숙달 히트맵 — 데이터 그래픽 (칸 색 = 숙달 단계)
  /components[\\/]class[\\/]HistoryTab/,      // 숙달 이력 차트·범례 — 데이터 그래픽
  /components[\\/]class[\\/]UnitDashboard/,   // 단원분석 타일 격자 — 데이터 그래픽
  /components[\\/]class[\\/]CoursePanel/,     // 코스 회차 표 — 진행 막대·부족 표시 (데이터 그래픽)
  /exam-paper/,                        // 인쇄물 (라이트 종이)
  /print/i,
  /app[\\/]share[\\/]/,                // 외부 공유 문서 — 리포트 언어 유지
  /app[\\/]parent[\\/]/,               // 학부모 공유 리포트 — 리포트 언어 유지
];

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts|css)$/.test(e.name)) files.push(p);
  }
})(ROOT);

const counts = {};
let total = 0;
for (const f of files) {
  if (ALLOW.some((re) => re.test(f))) continue;
  const m = fs.readFileSync(f, 'utf8').match(PATTERN);
  if (m && m.length) {
    counts[path.relative(process.cwd(), f).replace(/\\/g, '/')] = m.length;
    total += m.length;
  }
}

if (process.argv.includes('--update')) {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify({ total, counts }, null, 2) + '\n');
  console.log(`baseline 갱신: 총 ${total}건`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE_FILE)
  ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))
  : { total: Infinity, counts: {} };

console.log(`크롬 원색 클래스: 현재 ${total}건 / baseline ${baseline.total}건`);

if (total > baseline.total) {
  console.error('\n❌ 크롬 원색 하드코딩이 늘었습니다. 토큰(accent/시맨틱)이나 무채 표면을 쓰세요.');
  const worse = Object.entries(counts)
    .filter(([f, c]) => c > (baseline.counts[f] || 0))
    .sort((a, b) => (b[1] - (baseline.counts[b[0]] || 0)) - (a[1] - (baseline.counts[a[0]] || 0)));
  for (const [f, c] of worse.slice(0, 10)) {
    console.error(`   ${f}: ${baseline.counts[f] || 0} → ${c}`);
  }
  console.error('\n의도적 데이터 그래픽이면 scripts/check-design-tokens.mjs 의 ALLOW 에 추가.');
  process.exit(1);
}
if (total < baseline.total) {
  console.log('✅ 줄었습니다 — `node scripts/check-design-tokens.mjs --update` 로 baseline 을 조이세요.');
}
