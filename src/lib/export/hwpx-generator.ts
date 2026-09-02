// ============================================================================
// HWPX Generator v2 — 실제 한글(.hwpx) 구조 기반 (편집 가능, Vercel 작동)
// ----------------------------------------------------------------------------
// 검증된 실제 한글파일을 템플릿으로 사용:
//   - 정적 보일러플레이트(mimetype/version/settings/META-INF/header.xml)는
//     hwpx-template.ts 에 인라인 번들 (실제 한글 DocInfo — 폰트·스타일·ID).
//   - content.hpf(OPF 패키지) + section0.xml(본문)만 데이터로 생성.
// 본문 grammar(실측):
//   <hp:p paraPrIDRef styleIDRef><hp:run charPrIDRef><hp:t>텍스트</hp:t></hp:run>
//   수식 = <hp:run charPrIDRef="0"><hp:equation ... font="HYhwpEQ">
//            <hp:sz/><hp:pos treatAsChar="1"/><hp:outMargin/><hp:script>EQ</hp:script>
//          </hp:equation></hp:run>
//   LaTeX → HWP 수식스크립트: \frac{a}{b}→{a} over {b}, \left\{→LEFT {, log_{a} 등.
// ============================================================================

import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
import {
  MIMETYPE, VERSION_XML, SETTINGS_XML,
  CONTAINER_XML, MANIFEST_XML, CONTAINER_RDF, HEADER_XML, SECPR_XML,
} from './hwpx-template';

// ============================================================================
// Types
// ============================================================================

export interface HwpxProblem {
  number: number;
  content: string;       // LaTeX 포함 텍스트 (content_latex)
  choices: string[];     // 선택지 ①~⑤
  answer?: number | string;
  solution?: string;
  points?: number;
}

// 시험지 헤더 메타 — 화면/인쇄(EditableExamHeader StaticFormView)와 동일 필드.
//   값이 비면 빈 셀로 그려 화면·PDF·한글이 같은 폼을 유지한다.
export interface HwpxHeaderMeta {
  schoolName?: string;   // 학원/학교
  examTitle?: string;    // 시험명
  teacher?: string;      // 담당
  subject?: string;      // 과목
  semester?: string;     // 학기
  examType?: string;     // 유형
  grade?: string;        // 학년
  timeLimit?: string;    // 시간
  date?: string;         // 일시
  totalScore?: string;   // 총점
  // ★ 헤더 디자인 (2026-07-18) — 웹 디자인 갤러리의 강조색·테마를 한글 네이티브 3종으로 매핑:
  //   line→하단 accent 선 / double→하단 accent 이중선 / 그 외 그래픽 테마(wave·ribbon 등)→상단 색 띠.
  accentColor?: string;  // #rrggbb (없으면 기본 검정 에디토리얼)
  headerTheme?: string;  // 웹 테마 id (none/line/double/wave/...)
  // ★ 한글 헤더 구조 (2026-07-18) — editorial(기본)/classic(격자 표형)/boxed(제목+우측 정보칸)
  //   /mock(수능지 형식: 가운데 초대형 과목명 + 전폭 굵은선)
  //   /band(기출정복풍 "느낌" 구현: 회색 타이틀 밴드 + 좌측 컬러 포인트 블록 — 그대로 카피 X)
  headerStyle?: 'editorial' | 'classic' | 'boxed' | 'mock' | 'band';
}

export interface HwpxExamConfig {
  title: string;
  subtitle?: string;
  subject?: string;
  instituteName?: string;
  showNameField?: boolean;
  showAnswerSheet?: boolean;
  showSolutions?: boolean;
  columns?: 1 | 2;       // 인쇄 모달 단 수 (기본 2). 1 = 단일칼럼(편집 친화)
  problemGap?: number;   // 인쇄 모달 문제 간격(px, 기본 ~30) → 문제 사이 여백
  perPage?: number;      // 인쇄 모달 '4문제 배열' 프리셋(4/6/8) → 페이지당 고정 그리드
  // ★ 자동 모드 페이지 구성 (2026-07-18) — 웹 미리보기의 측정 기반 분할 결과(페이지별 문제 수).
  //   있으면 그리드 모드로 페이지 구성을 그대로 재현 (한글 자체 reflow 에 안 맡김).
  pageCounts?: number[];
  // ★ 시험지 헤더 표 — 있으면 제목/부제/이름란 대신 우리 헤더 표(학원/학교·시험명·과목·유형·학년)를 그린다.
  header?: HwpxHeaderMeta;
  // 잔재 경고 수신 콜백 (검증 루프) — 미변환 LaTeX 등 발견 시 호출 (파일 생성은 계속)
  onWarnings?: (warnings: HwpxArtifactWarning[]) => void;
  // 이미지 fetch 생략 (전수 감사용 — 네트워크 없이 텍스트·수식 변환만 검사)
  skipImages?: boolean;
}

// ============================================================================
// 검증 루프 — 잔재 스캐너 (2026-07-18)
//   지금까지의 원문 노출 사고(\boxed·\hline·\cdots·\square·\%·화살표·$ 잔재…)는 전부
//   "한글 텍스트/수식에 LaTeX 잔재가 남는" 한 클래스 → 범용 감지기로 상시 검출.
//   hml-verify(가져오기 검증 루프)의 내보내기 등가물. 비용 0 (룰베이스).
// ============================================================================
export interface HwpxArtifactWarning { kind: string; sample: string; count: number }

export function scanHwpxArtifacts(sectionXml: string): HwpxArtifactWarning[] {
  const warns: HwpxArtifactWarning[] = [];
  const texts = [...sectionXml.matchAll(/<hp:t>([^<]*)<\/hp:t>/g)].map((m) => m[1]);
  const joined = texts.join('\n');
  const add = (kind: string, re: RegExp) => {
    const ms = [...joined.matchAll(re)];
    if (ms.length) warns.push({ kind, sample: ms[0][0].slice(0, 50), count: ms.length });
  };
  add('latex-command', /\\[a-zA-Z]{2,}/g);            // \boxed \hline \le 류 미변환 명령
  add('latex-env', /\\begin\{|\\end\{/g);             // 환경 잔재
  add('dollar', /\$/g);                               // 수식 경계 $ 잔재
  add('figure-marker', /\[(?:도형|그림)\]/g);          // 웹 렌더 마커
  add('tabular-bar', /\\hline|\|\s*c\s*\|/g);         // 표 괘선/스펙 잔재
  // 수식 스크립트: 백슬래시 잔재·중괄호 불균형 (한글에서 글자 노출/깨짐)
  const scripts = [...sectionXml.matchAll(/<hp:script>([\s\S]*?)<\/hp:script>/g)].map((m) => m[1]);
  let bs = 0; let bsSample = '';
  let brace = 0; let brSample = '';
  for (const s of scripts) {
    const d = s.replace(/&[a-z]+;/g, '');
    if (/\\[a-zA-Z]/.test(d)) { bs++; if (!bsSample) bsSample = d.slice(0, 50); }
    const o = (s.match(/\{/g) || []).length;
    const c = (s.match(/\}/g) || []).length;
    if (o !== c) { brace++; if (!brSample) brSample = s.slice(0, 50); }
  }
  if (bs) warns.push({ kind: 'eq-backslash', sample: bsSample, count: bs });
  if (brace) warns.push({ kind: 'eq-brace-unbalanced', sample: brSample, count: brace });

  // ★ 미지 토큰 (2026-09-02 추가) — "한글이 모르는 낱말이 조용히 글자로 찍히는" 클래스.
  //   `\perp → perp` 오매핑이 백슬래시도 안 남기고 통과해 시험지에 "lperpn" 으로 나갔다.
  //   eq-backslash 는 백슬래시가 남은 것만 잡아서 이걸 못 봤다.
  //   판정: 수식 스크립트에서 따옴표("...", \text 원문) 밖의 **소문자 3글자 이상 낱말**이
  //   어휘(HWP_EQ_VOCAB)에 없으면 미지 토큰. 변수는 보통 1~2글자라 안 걸린다.
  const unknown = new Map<string, number>();
  for (const s of scripts) {
    const plain = s
      .replace(/&[a-z]+;/g, ' ')
      .replace(/"[^"]*"/g, ' ');       // \text/\mathrm 로 들어간 한글·영문 원문은 검사 제외
    for (const m of plain.matchAll(/(?<![A-Za-z])[a-z]{3,}(?![A-Za-z])/g)) {
      if (!HWP_EQ_VOCAB.has(m[0])) unknown.set(m[0], (unknown.get(m[0]) || 0) + 1);
    }
  }
  if (unknown.size > 0) {
    const total = [...unknown.values()].reduce((a, b) => a + b, 0);
    const top = [...unknown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([w, n]) => `${w}x${n}`).join(',');
    warns.push({ kind: 'eq-unknown-token', sample: top.slice(0, 50), count: total });
  }
  return warns;
}

// 매쓰플랫 실제 .hwpx 와 동일한 charPr/paraPr ID (header.xml 검증 템플릿 기준)
const CHAR = {
  body: 0,      // h1000 본문/수식
  // ★ 번호·제목은 검정 — 클라우드 인쇄 형식 (2026-07-17 사용자: 매쓰플랫 파랑(16=#00ABFF h1600,
  //   23=#00ABFF h2000) 말고 클라우드처럼). 21=h1200 준검정 볼드, 24=h2000 검정 볼드 (템플릿 네이티브).
  number: 21,   // h1200 Bold 검정 문제번호 (클라우드 번호 비율 ≈ 본문 1.2배)
  title: 24,    // h2000 Bold 검정 제목
  chapter: 21,  // h1200 Bold 부제
  meta: 22,     // h1100 메타(이름/날짜)
  small: 3,     // h900 배점 — 본문(h1000)보다 작게 (시중 문제지 스타일. h1100=본문보다 커서 부자연 실증)
} as const;
const PARA = {
  title: 38,    // 제목/부제
  meta: 51,     // 메타 라인
  number: 65,   // 문제번호(단독)
  body: 62,     // 본문/선택지
  figure: 36,   // 도형
  eq: 64,       // 디스플레이 수식 자기단락 (템플릿 실측 CENTER 정렬)
} as const;
const STYLE = 0;
// 2단 NEWSPAPER + 구분선 (매쓰플랫 동일)
const COLPR_CTRL = '<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="2" sameSz="1" sameGap="2000"><hp:colLine type="SOLID" width="0.2 mm" color="#CCCCCC"/></hp:colPr></hp:ctrl>';
// 1단 명시 colPr — ★ colPr 자체가 없으면 한글이 섹션 컬럼 폭 계산을 틀어 표가 우측으로
//   밀림(동래여중 그리드 v1~v3 치우침 실증 — 플로팅/인라인 무관, colPr 유무가 유일한 차이).
const COLPR_SINGLE = '<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>';

// ============================================================================
// LaTeX → HWP 수식 변환 (실측 포맷에 맞춤)
//   - \frac{a}{b} → {a} over {b}
//   - \left\{ → LEFT {  /  \right\} → RIGHT }   (제거하지 않음 — 실측은 보존)
//   - \log_{a} → log_{a}  (공백 없음)
// ============================================================================

// ============================================================================
// 한글 수식이 아는 낱말(토큰) 어휘 — 안전망의 기준표
// ----------------------------------------------------------------------------
// ★ 왜 필요한가: 한글 수식은 모르는 낱말을 만나면 **오류를 내지 않고 그냥 글자로 찍는다.**
//   그래서 `\perp → perp` 같은 오매핑이 조용히 통과해 시험지에 "lperpn" 으로 나갔다
//   (고1 도형 12번, 2026-09-02 대표 보고). 컴파일러도 테스트도 못 잡던 구멍이다.
// ★ 근거: (1) 한글이 스스로 내보낸 수식이 운영 problems 본문에 남아 있는 실측 토큰
//   (BOT 26 · SMALLINTER 314 · CIRC 269 · EMPTYSET 147 · RARROW 74 · DIVIDE 23 …),
//   (2) 가져오기 변환표 hangul-equation.ts BACKSLASH_CMDS (같은 어휘의 반대 방향).
// ★ 여기 없는 낱말이 수식 스크립트에 나타나면 scanHwpxArtifacts 가 eq-unknown-token 으로
//   경고한다. 변수(x, AB 같은 대문자 점 이름)는 소문자 3글자 미만이라 안 걸린다.
export const HWP_EQ_VOCAB = new Set<string>([
  // 구조
  'over', 'atop', 'sqrt', 'root', 'of', 'cases', 'matrix', 'pile', 'from', 'to', 'box',
  'LEFT', 'RIGHT', 'left', 'right', 'lbrace', 'rbrace', 'mid',
  // 악센트
  'overline', 'underline', 'bar', 'vec', 'hat', 'dot', 'ddot', 'tilde', 'acute', 'grave', 'check',
  // 큰 연산자·함수
  'sum', 'prod', 'int', 'oint', 'lim', 'liminf', 'limsup', 'sup', 'inf', 'max', 'min',
  'log', 'ln', 'exp', 'det', 'dim', 'ker', 'gcd', 'lcm', 'mod', 'deg', 'arg',
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh',
  'arcsin', 'arccos', 'arctan',
  // 연산자
  'times', 'div', 'divide', 'cdot', 'ast', 'star', 'bullet', 'circ', 'bigcirc',
  'oplus', 'ominus', 'otimes', 'odot', 'plusminus', 'minusplus',
  // 관계
  'approx', 'equiv', 'sim', 'simeq', 'cong', 'propto', 'parallel', 'bot',
  'll', 'gg', 'prec', 'succ',
  // 집합·논리
  'in', 'owns', 'notin', 'subset', 'supset', 'nsubset', 'subseteq', 'supseteq',
  'smallinter', 'smallunion', 'smalldifference', 'inter', 'union', 'emptyset',
  'forall', 'exists', 'neg', 'wedge', 'vee', 'setminus',
  // 기호
  'partial', 'nabla', 'angle', 'triangle', 'therefore', 'because', 'prime',
  'cdots', 'ldots', 'vdots', 'ddots', 'dots', 'aleph', 'hbar', 'imath', 'jmath',
  // 화살표
  'rarrow', 'larrow', 'lrarrow', 'Rarrow', 'Larrow', 'Lrarrow',
  'uparrow', 'downarrow', 'updownarrow', 'nearrow', 'nwarrow', 'searrow', 'swarrow',
  // 그리스 (소문자 토큰만 — 대문자 GAMMA 류는 검사 대상이 아님)
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta',
  'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi',
  'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
  // 서식
  'rm', 'it', 'bold', 'roman', 'italic',
]);

// 변환 중 "그냥 지워진" LaTeX 명령 기록 (안전망). generateHWPX 가 시작 시 비우고 끝에 읽는다.
const _droppedCommands = new Map<string, number>();
// ★ export — 경고 sample 은 상위 5개만 담아서 감사에 쓰면 과소 집계된다. 전수 감사가
//   "무엇이 몇 건 지워졌나"를 정확히 세려면 원본 맵이 필요하다 (generateHWPX 가 호출 시작 시 clear).
export function __droppedCommandsEntries(): Array<[string, number]> { return [..._droppedCommands.entries()]; }
// 구조·서식 명령이라 지워지는 게 정상인 것들 — 경고에서 뺀다.
const DROP_OK = new Set([
  'left', 'right', 'middle', 'displaystyle', 'textstyle', 'scriptstyle', 'limits', 'nolimits',
  'quad', 'qquad', 'hspace', 'vspace', 'phantom', 'vphantom', 'hphantom', 'rule', 'strut',
  'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'large', 'Large', 'small', 'tiny',
  'hline', 'cline', 'multicolumn', 'multirow', 'begin', 'end', 'label', 'nonumber',
  'mathrm', 'mathbf', 'mathit', 'mathbb', 'mathcal', 'mathsf', 'mathbin', 'mathop', 'mathrel',
  'text', 'textbf', 'textit', 'boldsymbol', 'operatorname', 'emph',
  'caption', 'captionsetup', 'includegraphics', 'textwidth', 'section', 'footnotetext',
]);

const HWP_GREEK_MAP: Record<string, string> = {
  '\\alpha': 'alpha', '\\beta': 'beta', '\\gamma': 'gamma', '\\delta': 'delta',
  '\\epsilon': 'epsilon', '\\varepsilon': 'epsilon', '\\theta': 'theta',
  '\\lambda': 'lambda', '\\mu': 'mu', '\\nu': 'nu', '\\xi': 'xi',
  '\\pi': 'pi', '\\rho': 'rho', '\\sigma': 'sigma', '\\tau': 'tau',
  '\\phi': 'phi', '\\varphi': 'phi', '\\chi': 'chi', '\\psi': 'psi', '\\omega': 'omega',
  '\\Gamma': 'GAMMA', '\\Delta': 'DELTA', '\\Theta': 'THETA', '\\Lambda': 'LAMBDA',
  '\\Sigma': 'SIGMA', '\\Pi': 'PI', '\\Phi': 'PHI', '\\Psi': 'PSI', '\\Omega': 'OMEGA',
};

// ============================================================================
// LaTeX → 한글 수식 기호 변환표 (모듈 상수 — 회귀 테스트가 값을 어휘와 대조한다)
//   ★ 값은 반드시 (a) HWP_EQ_VOCAB 에 있는 한글 수식 토큰 이거나
//     (b) 알파벳이 안 섞인 리터럴(유니코드 기호·연산자) 이어야 한다.
//   한글이 모르는 낱말을 넣으면 수식 안에 **글자 그대로** 박혀 학생에게 나간다
//   (perp → "lperpn" 실사고). 새 항목 추가 시 hwpx-generator.test.ts 가 막는다.
// ============================================================================
export const HWP_SYMBOL_MAP: Record<string, string> = {
  '\\times': 'times', '\\div': 'div', '\\pm': '+-', '\\mp': '-+', '\\cdot': 'cdot',
  '\\leq': '<=', '\\le': '<=', '\\geq': '>=', '\\ge': '>=',
  '\\neq': '!=', '\\ne': '!=', '\\approx': 'approx', '\\equiv': 'equiv',
  '\\sim': 'sim', '\\infty': 'inf',
  '\\in': 'in', '\\notin': 'notin', '\\subset': 'subset', '\\supset': 'supset',
  '\\cup': 'smallunion', '\\cap': 'smallinter', '\\emptyset': 'emptyset',
  '\\forall': 'forall', '\\exists': 'exists',
  // 화살표는 한글 정식 토큰(rarrow 계열)으로 — 에디터 축약형(->)과 렌더 동일하고,
  // 가져오기(hangul-equation)가 같은 토큰을 처리해 라운드트립 검증 가능.
  '\\rightarrow': 'rarrow', '\\to': 'rarrow', '\\leftarrow': 'larrow', '\\gets': 'larrow',
  '\\Rightarrow': 'Rarrow', '\\Leftarrow': 'Larrow', '\\leftrightarrow': 'lrarrow',
  '\\therefore': 'therefore', '\\because': 'because',
  // 점열 — 미매핑 시 잔여 명령 정리에서 삭제돼 "y=x-2 ⋯①" 의 ⋯ 소실 (거제여중 3번 실증)
  '\\cdots': 'cdots', '\\ldots': 'ldots', '\\vdots': 'vdots', '\\ddots': 'ddots', '\\dots': 'ldots',
  '\\angle': 'angle', '\\triangle': 'triangle',
  // ★ 수직 ⊥ 은 한글 어휘로 `bot` 이다. `perp` 는 한글이 모르는 낱말 → 수식 안에 글자
  //   그대로 박혀 "l perp m" 이 `lperpn` 으로 나온다 (고1 도형 12번 실사고, 2026-09-02).
  //   근거: 한글이 스스로 내보낸 수식이 운영 DB 에 26건 남아 있다 —
  //   `${\overline{ OP }} BOT {\overline{ OQ }}$` (직각삼각형 POQ). `PERP` 는 0건.
  '\\parallel': 'parallel', '\\perp': 'bot', '\\prime': "'",
  // ★ 합집합·교집합도 같은 함정 — 한글 어휘는 smallunion/smallinter 다 (∪/∩ 이항 연산자).
  //   운영 DB 실측: SMALLINTER 314건 · SMALLUNION 다수 (한글 자체 출력). CAP/CUP 은 0건.
  //   union/inter 는 큰 연산자(⋃/⋂)라 이항 자리에 쓰면 크기가 어긋난다.
  '\\setminus': 'smalldifference',
  // ★ \circ 미매핑 — 잔여 명령 정리에 삭제돼 `90^{\circ}` 가 `90^{}` 로, 도(°)가 통째로
  //   사라졌다. 운영 본문 1,755건. 한글 어휘 CIRC 실측 269건.
  '\\circ': 'circ', '\\bigcirc': 'bigcirc',
  // 아래는 전부 "미매핑 → 조용히 삭제" 였던 것들 (실측 건수는 운영 problems 본문 기준).
  //   삭제보다 나쁠 수 없으므로 안전하게 채운다.
  // 세로줄 — 조건제시법 {x | x>0}·절댓값. 미매핑 시 줄이 통째로 사라져 뜻이 깨졌다.
  '\\mid': '|', '\\vert': '|', '\\lvert': '|', '\\rvert': '|',
  '\\Vert': 'parallel', '\\lVert': 'parallel', '\\rVert': 'parallel',
  '\\varnothing': 'emptyset',                      // (15건)
  '\\ast': 'ast', '\\star': 'star', '\\bullet': 'bullet',
  '\\partial': 'partial', '\\nabla': 'nabla', '\\propto': 'propto',
  '\\subseteq': 'subseteq', '\\supseteq': 'supseteq',
  '\\uparrow': 'uparrow', '\\downarrow': 'downarrow',
  '\\longrightarrow': 'rarrow', '\\Leftrightarrow': '⇔',
  '\\lfloor': '⌊', '\\rfloor': '⌋', '\\lceil': '⌈', '\\rceil': '⌉',
  '\\langle': '〈', '\\rangle': '〉',
  '\\wedge': '∧', '\\vee': '∨', '\\neg': '¬',
  '\\oplus': '⊕', '\\ominus': '⊖', '\\otimes': '⊗',
  '\\frown': '⌢', '\\checkmark': '✓', '\\urcorner': '⌝',
  '\\geqslant': '>=', '\\leqslant': '<=', '\\nleq': '≰', '\\backsim': '∼',
  // 함수·연산자 이름 — 백슬래시만 떼면 된다 (한글도 같은 철자를 안다).
  //   미매핑 시 `\gcd(a,b)` 가 `(a,b)` 로, `\det A` 가 `A` 로 나왔다.
  '\\gcd': 'gcd', '\\det': 'det', '\\dim': 'dim', '\\ker': 'ker',
  '\\min': 'min', '\\max': 'max', '\\deg': 'deg', '\\bmod': 'mod', '\\mod': 'mod',
};

// ============================================================================
// 중괄호 균형 파서 (2026-09-02) — "인자를 정규식으로 잡던" 자리를 전부 대체
// ----------------------------------------------------------------------------
// ★ 무엇이 잘못됐나: 인자 패턴 `[^{}]*(?:\{[^{}]*\}[^{}]*)*` 는 **중첩 1단까지만** 센다.
//   2단 이상(`\sqrt{\dfrac{1}{\sqrt{2}}}`)이면 매칭이 통째로 실패하고, 실패해서 남은
//   `\sqrt` 는 아래 "남은 LaTeX 명령 정리"가 **지운다** → 근호가 조용히 사라진다.
//   `\sqrt{\dfrac{1}{\sqrt{2}}}` → `{{1} over {sqrt {2}}}` (바깥 근호 소실).
//   실측(운영 시험지 200개 .hwpx 생성, 수정 전 → 후):
//     \sqrt 1,237→0 · \overline 419→1 · \dfrac 90→0 · \lim 74→0 · \ln 11→0 · \int 5→0 · \vec 3→0
//     (eq-dropped-command 경고 1,850 → 12. 남은 12 는 전부 평문TeX `\over` 11 + 1 — 아래 주석 참고)
// ★ 왜 균형 파서인가: 중첩 괄호는 정규(regular) 언어가 아니라 정규식으로 셀 수 없다.
//   깊이를 세며 훑는 수밖에 없다. 같은 문제를 이미 균형 파싱으로 푼 선례:
//   `src/lib/workflow/hangul-equation.ts` grabBraceForward/convertOver (가져오기 방향).
// ============================================================================

/** 여는 `{`(start) 에서 정방향으로 균형 잡힌 닫는 `}` 찾기. start 가 `{` 가 아니면 null. */
function grabBraceForward(s: string, start: number): { end: number; inner: string } | null {
  if (s[start] !== '{') return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) return { end: i + 1, inner: s.slice(start + 1, i) }; }
  }
  return null; // 닫는 중괄호 누락(원문 결함) — 원문 유지 (지우지 않는다)
}

/**
 * `\cmd{..}{..}` 계열을 **중괄호 균형 파싱**으로 치환.
 *   - `cmdPattern`: 명령 이름 부분 정규식 (예: `'sqrt'`, `'(?:d|t)?frac'`, `'vec|overrightarrow'`)
 *   - `argc`: 중괄호 인자 개수. 인자를 못 채우면 **치환하지 않고 원문을 남긴다**
 *     (지우는 것보다 남기는 게 항상 안전 — 남으면 잔재 스캐너가 경고로 잡는다).
 *   - `optional`: `\sqrt[3]{x}` 같은 `[..]` 선택 인자 허용.
 * 치환할 때마다 처음부터 다시 훑는다 → `\sqrt{\sqrt{\sqrt{2}}}` 처럼 **같은 명령이 자기
 * 인자 안에 또 있는** 경우도 전부 처리된다 (한 번 훑기는 바깥만 바꾸고 안쪽을 놓친다).
 */
function replaceBalanced(
  src: string,
  cmdPattern: string,
  argc: number,
  render: (args: string[], opt: string | null) => string,
  optional = false,
): string {
  const re = new RegExp(`\\\\(?:${cmdPattern})(?![A-Za-z])`, 'g');
  let s = src;
  for (let guard = 0; guard < 400; guard++) {
    re.lastIndex = 0;
    let hit = false;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      let cur = m.index + m[0].length;
      let opt: string | null = null;
      if (optional) {
        let k = cur;
        while (s[k] === ' ') k++;
        if (s[k] === '[') {
          const close = s.indexOf(']', k);
          if (close > k) { opt = s.slice(k + 1, close); cur = close + 1; }
        }
      }
      const args: string[] = [];
      for (let a = 0; a < argc; a++) {
        // ★ 인자 **앞** 공백만 흡수한다. 마지막 인자 **뒤** 공백까지 먹으면
        //   `\overline{OP} \perp` 가 `overline {OP}bot` 으로 붙어버려 한글이 모르는
        //   낱말이 된다 (회귀 테스트가 잡음 — 토큰 엉겨붙기는 기존 사고 클래스).
        let k = cur;
        while (s[k] === ' ') k++;          // `\overline {AB}` — 명령·중괄호 사이 공백 변형 허용
        const g = grabBraceForward(s, k);
        if (!g) break;
        args.push(g.inner); cur = g.end;
      }
      if (args.length < argc) continue;    // 인자 없음/불완전 → 원문 유지, 다음 후보로
      s = s.slice(0, m.index) + render(args, opt) + s.slice(cur);
      hit = true;
      break;                                // 치환 결과 안의 중첩까지 다시 훑는다
    }
    if (!hit) break;
  }
  return s;
}

/**
 * 큰 연산자 `\sum_{..}^{..}` / `\lim_{..}` / `\int_{..}^{..}` → `sum from {..} to {..}`.
 * ★ 첨자 인자도 균형 파싱 — `\sum_{k=1}^{\frac{n}{2}}` 처럼 첨자에 분수가 들어가면
 *   기존 `\^\{([^{}]*)\}` 가 실패해 `\sum` 이 통째로 지워졌다 (\lim 74건 실측).
 * ★ 경계는 `\b` 가 아니라 `(?![A-Za-z])` — `\lim_` 은 `_` 가 word char 라 `\b` 가 **안 걸린다**.
 *   이게 \lim 삭제의 직접 원인이었다.
 */
function replaceBigOp(src: string, cmdPattern: string, hwp: string): string {
  const re = new RegExp(`\\\\(?:${cmdPattern})(?![A-Za-z])`, 'g');
  let s = src;
  for (let guard = 0; guard < 400; guard++) {
    re.lastIndex = 0;
    const m = re.exec(s);
    if (!m) break;
    let i = m.index + m[0].length;
    const grabScript = (mark: '_' | '^'): string | null => {
      if (s[i] !== mark) return null;
      const g = grabBraceForward(s, i + 1);
      if (g) { i = g.end; return g.inner; }
      if (/[A-Za-z0-9]/.test(s[i + 1] || '')) { i += 2; return s[i - 1]; } // \sum_n 처럼 홑글자
      return null;                                                         // 그 외는 원문 유지
    };
    const sub = grabScript('_');
    const sup = grabScript('^');
    let out = hwp;
    if (sub !== null) out += ` from {${sub}}`;
    if (sup !== null) out += ` to {${sup}}`;
    s = s.slice(0, m.index) + out + s.slice(i);
  }
  return s;
}

function latexToHWPEquation(latex: string): string {
  let eq = latex.trim();

  // 수식 래퍼 제거
  eq = eq.replace(/^\\\(|\\\)$/g, '');
  eq = eq.replace(/^\\\[|\\\]$/g, '');
  eq = eq.replace(/^\$\$?|\$\$?$/g, '');
  eq = eq.trim();

  // LaTeX 공백 명령(\, \; \! \ )은 HWP 수식에선 공백으로.
  // ★ (?<!\\) 필수 — `\\ `(행 구분자+공백)의 두 번째 백슬래시를 `\ ` 공백명령으로
  //   오인해 삼키면 cases/array 행 분리(\\ split, 아래서 실행)가 통째로 깨진다 (회귀 테스트가 발견).
  eq = eq.replace(/(?<!\\)\\[,;!:]/g, ' ').replace(/(?<!\\)\\ /g, ' ');

  // 이스케이프 리터럴(\% \$ \# \& \_) → 문자 그대로. 미처리 시 한글 수식에 "\%" 노출 (부흥중 "30\%" 실증)
  eq = eq.replace(/\\([%$#&_])/g, '$1');

  // \frac{a}{b} → {a} over {b}  (중첩 무제한 — 균형 파싱)
  eq = replaceBalanced(eq, '(?:d|t)?frac', 2, ([a, b]) => `{${a}} over {${b}}`);

  // \sqrt[n]{x} → root n of {x} / \sqrt{x} → sqrt {x}
  eq = replaceBalanced(eq, 'sqrt', 1, ([x], opt) => (opt !== null ? `root ${opt} of {${x}}` : `sqrt {${x}}`), true);
  // 중괄호 없는 \sqrt2 · \sqrt x — 미처리 시 아래 잔여 정리가 \sqrt 를 지워 근호가 사라진다.
  eq = eq.replace(/\\sqrt(?![A-Za-z])\s*([A-Za-z0-9])/g, 'sqrt {$1}');

  // \log_{b} → log_{b} (공백 없음, 실측 일치)
  // ★ \log 다음이 '_'(word char)라 \b 가 안 걸림 → '_' 먼저 직접 치환
  eq = eq.replace(/\\log_(\w)(?![\w{])/g, 'log_{$1}'); // \log_a → log_{a}
  eq = eq.replace(/\\log_/g, 'log_');                  // \log_{...} → log_{...}
  eq = eq.replace(/\\log/g, 'log');                    // 남은 \log → log
  // ★ `\b` 대신 `(?![A-Za-z])` — `\ln2` 처럼 뒤에 숫자가 붙으면 `\b` 가 안 걸려 명령이
  //   통째로 지워졌다 (\ln 11건 실측). 함수 이름 뒤 경계는 "알파벳이 아니면" 이 맞다.
  eq = eq.replace(/\\ln(?![A-Za-z])/g, 'ln');

  // 삼각함수
  for (const fn of ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan']) {
    eq = eq.replace(new RegExp(`\\\\${fn}(?![A-Za-z])`, 'g'), fn);
  }

  // \lim / \sum / \prod / \int  (from..to)
  //   ★ `\lim_{x \to 0}` 는 한글 관례대로 화살표 형태를 유지 (아래 일반 규칙보다 먼저).
  eq = eq.replace(/\\lim_\{([^{}]*?)\\to\s*([^{}]*?)\}/g, 'lim from {$1 -> $2}');
  //   나머지는 균형 파싱 — 첨자에 분수·근호가 들어가도 명령이 살아남는다.
  eq = replaceBigOp(eq, 'lim', 'lim');
  eq = replaceBigOp(eq, 'sum', 'sum');
  eq = replaceBigOp(eq, 'prod', 'prod');
  eq = replaceBigOp(eq, 'int', 'int');

  // overline / bar / vec
  // ★ 인자를 못 잡으면 **윗줄이 조용히 사라진다** — 실데이터에 압도적으로 흔한
  //   `\overline{\mathrm{AB}}` 를 놓쳤던 사고(검증 샘플 24문제에서 overline 17건·
  //   overrightarrow 11건 소실)로 한 번 넓혔고(중첩 1단 허용 정규식), 그것도 부족해
  //   2026-09-02 균형 파싱으로 교체했다 — `\overline{\overline{AB}}`·`\vec{\dfrac{a}{b}}`
  //   같은 2단 중첩에서 여전히 매칭이 실패해 악센트가 지워지고 있었다 (운영 200개 419건 실측).
  const accent = (cmds: string, hwp: string) => {
    eq = replaceBalanced(eq, cmds, 1, ([x]) => `${hwp} {${x}}`);
  };
  accent('overline', 'overline');
  accent('bar', 'bar');
  // ★ \overrightarrow 는 미매핑이라 잔여 명령 정리에서 화살표만 사라지고 `AB` 만 남았다
  //   (운영 62건) — 벡터 표기가 통째로 소실. vec 은 한글이 아는 토큰이라 안전.
  accent('vec|overrightarrow', 'vec');
  // \hat / \dot / \tilde — 미매핑 시 악센트만 조용히 소실
  accent('hat', 'hat');
  accent('dot', 'dot');
  accent('tilde', 'tilde');
  // \binom{n}{r} — 미매핑 시 `n{r}` 로 깨졌다(16건). 괄호 안 2행 쌓기가 원래 모양.
  eq = replaceBalanced(eq, 'binom', 2, ([n, r]) => `( matrix {${n} # ${r}} )`);
  // \pmod{n} → (mod n) — 미매핑 시 "mod" 가 사라져 `a equiv b n` 이 됐다(44건).
  eq = replaceBalanced(eq, 'pmod', 1, ([n]) => `(mod ${n})`);

  // 조각함수: \left\{ \begin{array|aligned|...} ... \right.  → cases { ... }
  //   (aligned 미포함 시 "LEFT { aligned ..." 중괄호 불균형 잔재 — hwpx-audit 발견)
  eq = eq.replace(/\\left\s*\\?\{\s*\\begin\{(?:array|aligned|align\*?|gathered|cases)\}(?:\{[^}]*\})?([\s\S]*?)\\end\{(?:array|aligned|align\*?|gathered|cases)\}\s*\\right\s*\.?/g, (_, c: string) => {
    const rows = c.split('\\\\').map((r) => r.trim()).filter(Boolean); // & 는 HWP 열 구분자라 보존
    return `cases {${rows.join(' # ')}}`;
  });
  // 행렬 / cases / array / aligned
  eq = eq.replace(/\\begin\{(?:pmatrix|bmatrix|matrix|array|aligned|align\*?|gathered)\}(?:\{[^}]*\})?([\s\S]*?)\\end\{(?:pmatrix|bmatrix|matrix|array|aligned|align\*?|gathered)\}/g, (_, c: string) => {
    const rows = c.split('\\\\').map((r) => r.trim()).filter(Boolean); // & 는 HWP 열 구분자라 보존
    return `matrix {${rows.join(' # ')}}`;
  });
  eq = eq.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_, c: string) => {
    const rows = c.split('\\\\').map((r) => r.trim()).filter(Boolean); // & 는 HWP 열 구분자라 보존
    return `cases {${rows.join(' # ')}}`;
  });

  // 명령 → 한글 토큰 치환 공통부.
  // ★ 낱말 토큰이 이웃 글자와 **붙지 않게** 한다 — `\cdots\cdots` 가 `cdotscdots` 로 엉겨
  //   붙으면 한글이 모르는 낱말이 되어 글자 그대로 찍힌다 (검증 샘플 실측 2건).
  //   붙을 때만 공백을 넣는다 — `x^\circ` 의 `^` 처럼 이웃이 글자가 아니면 그대로 둬야
  //   지수 묶음(`^{circ}`)이 유지된다.
  const applyMap = (map: Record<string, string>) => {
    for (const [tex, hwp] of Object.entries(map)) {
      const re = new RegExp(tex.replace(/\\/g, '\\\\') + '(?![a-zA-Z])', 'g');
      eq = eq.replace(re, (_m, offset: number, whole: string) => {
        const before = whole[offset - 1] || '';
        const after = whole[offset + _m.length] || '';
        const lead = /^[A-Za-z]/.test(hwp) && /[A-Za-z0-9]/.test(before) ? ' ' : '';
        const tail = /[A-Za-z]$/.test(hwp) && /[A-Za-z0-9]/.test(after) ? ' ' : '';
        return lead + hwp + tail;
      });
    }
  };

  // 그리스 문자
  applyMap(HWP_GREEK_MAP);

  // ★ \not\subset(⊄)·\not\in(∉) — \not 이 미매핑이라 조용히 삭제돼 ⊂/∈ 로 **뜻이 뒤집혔다**(9건).
  eq = eq.replace(/\\not\s*\\subset(?![a-zA-Z])/g, 'nsubset');
  eq = eq.replace(/\\not\s*\\in(?![a-zA-Z])/g, 'notin');
  eq = eq.replace(/\\not\s*=/g, '!=');

  // 수학 기호 ( \le → <= 등, 실측 일치) — 표는 모듈 상수 HWP_SYMBOL_MAP
  applyMap(HWP_SYMBOL_MAP);

  // 구분자: \left\{ \right\} 만 LEFT { RIGHT }(가변 중괄호, 실측에서 렌더됨).
  //   괄호·대괄호·바(( [ |)는 HWP 에서 LEFT ( 가 글자로 깨짐 → \left/\right 만 제거하고 리터럴 구분자 유지.
  eq = eq.replace(/\\left\s*\\\{/g, 'LEFT { ');
  eq = eq.replace(/\\right\s*\\\}/g, ' RIGHT } ');
  eq = eq.replace(/\\left\s*\./g, ' ').replace(/\\right\s*\./g, ' '); // 빈 구분자 \left. \right.
  eq = eq.replace(/\\left\s*/g, '').replace(/\\right\s*/g, '');        // \left( [ | → 구분자만
  // 남은 naked \{ \} (집합 등) → 리터럴 중괄호
  eq = eq.replace(/\\\{/g, ' lbrace ').replace(/\\\}/g, ' rbrace ');

  // \mathrm,\text,\textbf → "..." (\s* — 명령·중괄호 사이 공백 변형 허용)
  eq = eq.replace(/\\(?:mathrm|text|textbf|mathbf|boldsymbol|operatorname)\s*\{([^{}]*)\}/g, '"$1"');

  // 빈칸 네모(\square) — 시험지 빈칸 채우기 기호. 미매핑 시 "\square" 글자 노출(동래여중 16번 실증)
  eq = eq.replace(/\\square(?![a-zA-Z])/g, '□');
  // \boxed{..} → 한글 box{..} (네모 상자 — 가져오기 역변환 box→\boxed 과 왕복 짝)
  eq = eq.replace(/\\boxed(?![a-zA-Z])/g, 'box');

  // 남은 LaTeX 명령 정리
  // ★ 여기서 지워지는 명령은 **기호가 통째로 사라진다** — 조용해서 제일 위험하다.
  //   실제로 \circ(1,755건)가 지워져 `90^{\circ}` 가 `90^{}` 로, 도(°)가 없어져 있었다.
  //   지운 명령을 기록해 generateHWPX 가 eq-dropped-command 경고로 올린다.
  // ★ 남아 있는 삭제 (2026-09-02 실측, 운영 200개 중 11건): 평문TeX 중위 표기 `a \over b`.
  //   `\over` 는 인자가 앞뒤로 갈린 중위 연산자라 `\cmd{..}` 파서로는 못 잡는다 → 지금은
  //   지워져 **분수가 통째로 사라진다**. 고치려면 hangul-equation.ts convertOver 처럼
  //   좌우 균형 역/정방향 grab 이 필요. 별건이라 미착수 (보고만).
  eq = eq.replace(/\\([a-zA-Z]+)\{([^{}]*)\}/g, (_m, cmd: string, inner: string) => {
    _droppedCommands.set(cmd, (_droppedCommands.get(cmd) || 0) + 1);
    return inner;
  });
  eq = eq.replace(/\\([a-zA-Z]+)/g, (_m, cmd: string) => {
    _droppedCommands.set(cmd, (_droppedCommands.get(cmd) || 0) + 1);
    return '';
  });

  // ★ 단일 문자 지수/첨자 중괄호 확정 — `x^2=a` 를 한글이 `^{2=a}` 로 묶어 "2=a 전체가
  //   지수로 올라가는" 사고 (동래여중 5번 (2x-5)^2=a 실증). `^{2}=a` 로 경계 명시.
  eq = eq.replace(/([_^])([A-Za-z0-9])(?![\w{])/g, '$1{$2}');

  eq = eq.replace(/\s+/g, ' ').trim();

  return eq;
}

// ============================================================================
// 컨텐츠 파싱: HTML/LaTeX → 텍스트 + 수식 세그먼트
// ============================================================================

interface ContentSegment {
  type: 'text' | 'equation' | 'image';
  value: string;
  // 디스플레이 수식($$..$$, \[..\]) — 가운데정렬 자기 단락(paraPr 64)으로 분리 렌더.
  display?: boolean;
}

const IMG_MD = /!\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g;            // ![alt](url)
const IMG_HTML = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi; // <img src="url">

// math 밖 텍스트에 섞인 naked LaTeX 정리 (집합 \{ \}, 흔한 기호 → 유니코드)
const TEXT_SYM: Record<string, string> = {
  '\\geq': '≥', '\\leq': '≤', '\\ge': '≥', '\\le': '≤', '\\neq': '≠', '\\ne': '≠',
  '\\times': '×', '\\div': '÷', '\\cdot': '·', '\\pm': '±', '\\mp': '∓',
  '\\cup': '∪', '\\cap': '∩', '\\in': '∈', '\\notin': '∉', '\\subset': '⊂', '\\supset': '⊃',
  '\\infty': '∞', '\\to': '→', '\\rightarrow': '→', '\\Rightarrow': '⇒', '\\leftarrow': '←',
  '\\cdots': '⋯', '\\ldots': '…', '\\dots': '…', '\\circ': '∘', '\\angle': '∠',
  '\\square': '□', '\\Box': '□', '\\leftrightarrow': '↔', '\\Leftrightarrow': '⇔',
  '\\therefore': '∴', '\\because': '∵',
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\theta': 'θ',
  '\\lambda': 'λ', '\\mu': 'μ', '\\pi': 'π', '\\sigma': 'σ', '\\omega': 'ω',
};
function cleanTextLatex(s: string): string {
  let t = s;
  // (?![a-zA-Z]) 필수 — 없으면 \leftrightarrow 의 "\left" 를 삼켜 "rightarrow" 글자 노출 (요금표 실증)
  t = t.replace(/\\left(?![a-zA-Z])\s*/g, '').replace(/\\right(?![a-zA-Z])\s*/g, '');
  // \boxed{\text{유제}} 류 라벨 (2026-07-18 실증) — 텍스트 근사 [유제]. \text 는 내용만, \quad 는 공백.
  // ★ \s* 필수 — "\text { 개를 }" 처럼 명령·중괄호 사이 공백 변형이 흔함 (유제 라벨 비일관 실증)
  t = t.replace(/\\boxed\s*\{\s*\\text\s*\{([^{}]*)\}\s*\}/g, (_m, x: string) => `[${x.trim()}]`);
  t = t.replace(/\\boxed\s*\{([^{}]*)\}/g, (_m, x: string) => `[${x.trim()}]`);
  t = t.replace(/\\text(?:bf|it|rm)?\s*\{([^{}]*)\}/g, '$1');
  // 감사(hwpx-audit) 발견 클래스: \mathbf/\underline/\overline 등 스타일 명령 — 내용만
  t = t.replace(/\\(?:mathbf|mathrm|mathit|underline|overline|emph)\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\multicolumn\{\d+\}\{[^{}]*\}\{([^{}]*)\}/g, '$1');
  t = t.replace(/\\q?quad(?![a-zA-Z])/g, ' ');
  t = t.replace(/\\([{}%$#&_])/g, '$1');      // \{ → {, \% → % 등 이스케이프 리터럴
  t = t.replace(/\\[,;!:]/g, ' ').replace(/\\ /g, ' ');
  for (const [k, v] of Object.entries(TEXT_SYM)) {
    t = t.replace(new RegExp(k.replace(/\\/g, '\\\\') + '(?![a-zA-Z])', 'g'), v);
  }
  return t;
}

// 텍스트(이미지 제외) → text/equation 세그먼트
function parseTextMath(text: string): ContentSegment[] {
  // ※ "벌거벗은 환경을 $로 감싸기" 시도는 금지 — 이미 $..$ 안에 있는 환경까지 이중 감싸
  //   $ 짝을 대량 파괴 (전수 감사 67→115개 악화 실증, 2026-07-18 롤백). 원본 결함은 경고로만.
  const segs: ContentSegment[] = [];
  // 텍스트 조각 push — $ 밖이 보장되는 지점. naked \boxed{..} 라벨(유제/답)은 텍스트 근사([유제])
  // 대신 한글 수식 상자(box{"유제"})로 → 웹의 네모 뱃지와 동일한 모양 (2026-07-18 사용자 요구).
  const pushText = (t: string) => {
    const boxedRe = /\\boxed\s*\{\s*(?:\\text\s*\{([^{}]*)\}|([^{}]*))\s*\}/g;
    let tLast = 0;
    let bm: RegExpExecArray | null;
    while ((bm = boxedRe.exec(t)) !== null) {
      if (bm.index > tLast) {
        const pre = t.slice(tLast, bm.index);
        if (pre.trim()) segs.push({ type: 'text', value: cleanTextLatex(pre) });
      }
      const label = (bm[1] ?? bm[2] ?? '').trim();
      if (label) segs.push({ type: 'equation', value: `box{"${label}"}` });
      tLast = bm.index + bm[0].length;
    }
    const rest = t.slice(tLast);
    if (rest.trim()) segs.push({ type: 'text', value: cleanTextLatex(rest) });
  };
  // 디스플레이 수식(\[ \], $$ $$)은 여러 줄 가능 → [\s\S]. 인라인($, \()은 줄 안.
  const mathPattern = /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = mathPattern.exec(text)) !== null) {
    if (m.index > last) { const t = text.slice(last, m.index); if (t.trim()) pushText(t); }
    const hwpEq = latexToHWPEquation(m[1] || m[2] || m[3] || m[4]);
    // m[1]=\[..\], m[3]=$$..$$ → 디스플레이 수식 (m[2]=\(..\), m[4]=$..$ 는 인라인)
    if (hwpEq) segs.push({ type: 'equation', value: hwpEq, display: !!(m[1] || m[3]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) { const t = text.slice(last); if (t.trim()) pushText(t); }
  return segs;
}

function parseContent(content: string): ContentSegment[] {
  if (!content) return [];
  // 1) 이미지(마크다운/HTML) 먼저 추출 → 마커로 치환 (HTML strip 전에)
  const imgs: string[] = [];
  let s = content
    .replace(IMG_MD, (_m, url) => { imgs.push(url); return ` IMG${imgs.length - 1} `; })
    .replace(IMG_HTML, (_m, url) => { imgs.push(url); return ` IMG${imgs.length - 1} `; });
  // 2) 나머지 HTML 정리 + 웹 렌더용 도형 마커 제거 (본문·해설·선택지 공통 진입점 — 감사 발견)
  s = s.replace(/\[(?:도형|그림)\]/g, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:p|div|span|strong|em|b|i|u|sup|sub|small|font|a|ul|ol|li|table|thead|tbody|tr|td|th)\b[^>]*>/gi, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  // 3) 이미지 마커로 분할 → 텍스트부는 math 분리
  const segments: ContentSegment[] = [];
  const parts = s.split(/ IMG(\d+) /);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) { if (parts[i]) segments.push(...parseTextMath(parts[i])); }
    else { const u = imgs[parseInt(parts[i], 10)]; if (u) segments.push({ type: 'image', value: u }); }
  }
  if (segments.length === 0 && s.trim()) segments.push({ type: 'text', value: s.trim() });
  return segments;
}

// content/choices/solution 전체에서 이미지 URL 수집 (중복 제거, 순서 보존)
function collectImageUrls(problems: HwpxProblem[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const scan = (txt: string | undefined) => {
    if (!txt) return;
    for (const seg of parseContent(txt)) {
      if (seg.type === 'image' && !seen.has(seg.value)) { seen.add(seg.value); urls.push(seg.value); }
    }
  };
  for (const p of problems) {
    scan(p.content);
    (p.choices || []).forEach(scan);
    scan(p.solution);
  }
  return urls;
}

// ============================================================================
// XML 빌더 (실측 grammar)
// ============================================================================

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

let _shapeId = 2000000000;
function nextId(): number { return ++_shapeId; }

function textRun(text: string, charPrId: number): string {
  return `<hp:run charPrIDRef="${charPrId}"><hp:t>${escXml(text)}</hp:t></hp:run>`;
}

function equationRun(script: string): string {
  // 실제 한글(.hwpx) 수식 요소와 정확히 일치 (baseUnit 1100, baseLine 0, shapeComment 포함)
  const id = nextId();
  return `<hp:run charPrIDRef="${CHAR.body}">`
    + `<hp:equation id="${id}" zOrder="0" numberingType="EQUATION" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" version="Equation Version 60" baseLine="0" textColor="#000000" baseUnit="1100" lineMode="CHAR" font="HYhwpEQ">`
    + `<hp:sz width="0" widthRelTo="ABSOLUTE" height="0" heightRelTo="ABSOLUTE" protect="0"/>`
    + `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    + `<hp:outMargin left="56" right="56" top="0" bottom="0"/>`
    + `<hp:shapeComment>수식입니다.</hp:shapeComment>`
    + `<hp:script>${escXml(script)}</hp:script>`
    + `</hp:equation></hp:run>`;
}

// 선택지 앞에 이미 붙은 동그라미/번호(①~⑩, (1), 1.) 제거 — 우리가 다시 붙이므로 중복 방지
function stripChoicePrefix(s: string): string {
  return (s || '').replace(/^\s*(?:[①②③④⑤⑥⑦⑧⑨⑩]|\(?\s*\d{1,2}\s*\)|\d{1,2}\s*[.)])\s*/, '').trim();
}

// ----------------------------------------------------------------------------
// 내보내기 전 본문 정리 — 실데이터(부흥중 2-1 기말, 2026-07) 실증 결함 3종.
// 가드 #9 원칙: "확신할 때만 제거"(번호 일치·보기 정규화 과반 일치), 애매하면 보존 → 손실 0.
// ----------------------------------------------------------------------------

// 본문 끝 인라인 보기(①~⑤) 제거 — useExamProblems.stripTrailingInlineChoices 이식.
//   content 와 answer_json.choices 양쪽에 보기가 있으면 한글에서 보기가 2번 노출.
//   끝 블록이 dbChoices 와 정규화 과반(60%) 일치할 때만 제거 (그림 라벨·서술형 단계 ①②③ 보존).
function stripInlineChoicesForExport(text: string, dbChoices: string[]): string {
  const n = dbChoices.length;
  if (n < 2 || n > 5) return text;
  const markers = ['①', '②', '③', '④', '⑤'];
  const pos = new Array<number>(n);
  pos[n - 1] = text.lastIndexOf(markers[n - 1]);
  if (pos[n - 1] === -1) return text;
  for (let k = n - 2; k >= 0; k--) {
    pos[k] = text.lastIndexOf(markers[k], pos[k + 1] - 1);
    if (pos[k] === -1) return text; // 순서대로 못 찾음 → 끝 보기 런 아님
  }
  const start = pos[0];
  const head = text.slice(0, start).trim();
  if (head.length < 5) return text; // 질문이 사실상 없음 → 위험, 패스

  const norm = (s: string) =>
    s
      .replace(/[①②③④⑤]/g, '')
      .replace(/\\[a-zA-Z]+/g, '')
      .replace(/[\s${}().,]/g, '')
      .toLowerCase();

  let matches = 0;
  for (let k = 0; k < n; k++) {
    const segEnd = k + 1 < n ? pos[k + 1] : text.length;
    const segN = norm(text.slice(pos[k], segEnd));
    const dbN = norm(dbChoices[k] || '');
    if (segN && dbN && segN === dbN) matches++;
  }
  if (matches >= Math.ceil(n * 0.6)) return head;
  return text;
}

// 문제 본문 전처리: ①유형 태그 첫 줄 제거 ②선두 중복 번호 제거 ③끝 인라인 보기 제거.
function sanitizeProblemContent(content: string, num: number, dbChoices: string[]): string {
  let s = content || '';
  // ① 첫 줄 `| 유형명 |` 태그 — 자산화 시 박힌 분류 라벨. 시험지에 노출되면 학생에게 유형 힌트.
  s = s.replace(/^\s*\|[^|\n]{1,60}\|\s*\n/, '');
  // ①-b 웹 렌더용 도형 위치 마커 — 한글에선 도형이 별도 단락으로 붙으므로 마커 텍스트 제거
  //    (동래여중 12번 "[도형]" 노출 실증)
  s = s.replace(/\[(?:도형|그림)\]/g, ' ');
  // ② 선두 중복 번호 — 우리가 "N. " 을 다시 붙이므로. 시퀀스 번호와 일치할 때만(보수적):
  //    "01 "(zero-pad+공백) / "1."·"1)"(구두점, 전각 ．） 포함 — 동래여중 "1．다음" 실증).
  //    ★ bare "1 "(비패딩+공백)은 "1 이상의 수" 오삭제 위험 → 보존.
  const zeroPad = String(num).padStart(2, '0');
  s = s.replace(new RegExp(`^\\s*(?:${zeroPad}\\s+|${num}\\s*[.)．）]\\s*)`), '');
  //    수식 선두 케이스: "$07\\ x=2..." — 번호가 수식 안에 박힘 (부흥중 #7 실증). zero-pad 만.
  s = s.replace(new RegExp(`^(\\s*\\$)${zeroPad}(?:\\\\)?\\s+`), '$1');
  // ③ 끝 인라인 보기 — dbChoices 와 과반 일치 시만
  return stripInlineChoicesForExport(s, dbChoices);
}

// ----------------------------------------------------------------------------
// 도형(이미지) — hp:pic + BinData 임베드
// ----------------------------------------------------------------------------
type ImageMap = Map<string, { id: string; w: number; h: number; ext: string; mime: string }>; // url → 임베드 정보

// PNG/JPEG 헤더에서 픽셀 크기 파싱 (라이브러리 없이)
function imageSize(buf: Uint8Array): { w: number; h: number } {
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) { // PNG
    const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
    const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
    if (w > 0 && h > 0) return { w, h };
  }
  if (buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8) { // JPEG
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        const h = (buf[i + 5] << 8) | buf[i + 6];
        const w = (buf[i + 7] << 8) | buf[i + 8];
        if (w > 0 && h > 0) return { w, h };
      }
      i += 2 + ((buf[i + 2] << 8) | buf[i + 3]);
    }
  }
  return { w: 400, h: 300 }; // 폴백
}

// 인라인 그림 run (실제 .hwpx hp:pic 구조). px → HWPUNIT(×75, 96dpi).
function picRun(binId: string, pxW: number, pxH: number): string {
  const orgW = Math.max(1, Math.round(pxW * 75));
  const orgH = Math.max(1, Math.round(pxH * 75));
  const maxW = 22000; // 2단 컬럼 폭에 맞춤
  const scale = Math.min(1, maxW / orgW);
  const w = Math.max(1, Math.round(orgW * scale));
  const h = Math.max(1, Math.round(orgH * scale));
  const sc = scale.toFixed(6);
  const id = nextId();
  return `<hp:run charPrIDRef="${CHAR.body}">`
    + `<hp:pic id="${id}" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${id}" reverse="0">`
    + `<hp:offset x="0" y="0"/>`
    + `<hp:orgSz width="${orgW}" height="${orgH}"/><hp:curSz width="${w}" height="${h}"/>`
    + `<hp:flip horizontal="0" vertical="0"/>`
    + `<hp:rotationInfo angle="0" centerX="${Math.round(w / 2)}" centerY="${Math.round(h / 2)}" rotateimage="1"/>`
    + `<hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="${sc}" e2="0" e3="0" e4="0" e5="${sc}" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>`
    + `<hc:img binaryItemIDRef="${binId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>`
    + `<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${orgW}" y="0"/><hc:pt2 x="${orgW}" y="${orgH}"/><hc:pt3 x="0" y="${orgH}"/></hp:imgRect>`
    + `<hp:imgClip left="0" right="${orgW}" top="0" bottom="${orgH}"/>`
    + `<hp:inMargin left="0" right="0" top="0" bottom="0"/>`
    + `<hp:imgDim dimwidth="${orgW}" dimheight="${orgH}"/><hp:effects/>`
    + `<hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/>`
    + `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    + `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment/>`
    + `</hp:pic></hp:run>`;
}

// URL 목록을 fetch → 임베드 정보(map) + 바이트(map)
async function fetchImages(urls: string[]): Promise<{ info: ImageMap; bytes: Map<string, Uint8Array> }> {
  const info: ImageMap = new Map();
  const bytes = new Map<string, Uint8Array>();
  let n = 0;
  await Promise.all(urls.map(async (url) => {
    try {
      const r = await fetch(url);
      if (!r.ok) return;
      const buf = new Uint8Array(await r.arrayBuffer());
      const { w, h } = imageSize(buf);
      const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
      const ext = isJpeg ? 'jpg' : 'png';
      const mime = isJpeg ? 'image/jpeg' : 'image/png';
      const id = `image${++n}`;
      info.set(url, { id, w, h, ext, mime });
      bytes.set(url, buf);
    } catch { /* 네트워크 실패 시 해당 도형 생략 */ }
  }));
  return { info, bytes };
}

// 단락 줄 레이아웃(linesegarray) — 한글 네이티브 파일과 동일하게 단락마다 1줄 시드.
//   한글이 열 때 실제 줄바꿈으로 재계산하지만, 네이티브 구조를 맞춰 편집을 자연스럽게.
let _colWidth = 53860; // 본문 가로폭(HWPUNIT) — buildSection0 에서 단 수에 따라 설정
const LINE_H: Record<number, number> = {
  [PARA.title]: 2600, [PARA.meta]: 1500, [PARA.number]: 1900, [PARA.body]: 1400, [PARA.figure]: 1400,
};
function lineSeg(_paraPrId: number): string {
  // ★ linesegarray 비활성 — 플레이스홀더 줄정보가 한글 2단 레이아웃을 잘못 계산(문제가 오른쪽 단부터 시작)
  //   매쓰플랫도 linesegarray 없이 잘 되고, 한글이 열 때 정확히 재계산하므로 넣지 않음.
  return '';
}

function paragraph(runsXml: string, paraPrId: number = PARA.body): string {
  return `<hp:p id="${nextId()}" paraPrIDRef="${paraPrId}" styleIDRef="${STYLE}" pageBreak="0" columnBreak="0" merged="0">${runsXml || textRun('', CHAR.body)}${lineSeg(paraPrId)}</hp:p>`;
}

function segmentsToRuns(segments: ContentSegment[], charPrId: number, imageMap: ImageMap): string {
  return segments.map((seg) => {
    if (seg.type === 'equation') return equationRun(seg.value);
    if (seg.type === 'image') {
      const info = imageMap.get(seg.value);
      return info ? picRun(info.id, info.w, info.h) : '';
    }
    return textRun(seg.value, charPrId);
  }).join('');
}

// 세그먼트 → 단락 목록. 디스플레이 수식($$..$$/\[..\])은 가운데정렬(paraPr 64) 자기 단락으로 분리.
//   leadRun(문제번호)은 첫 단락 맨 앞, tailRun(배점)은 마지막 텍스트 단락 끝에 붙는다.
//   inlineImages=false: 이미지 세그먼트 건너뜀(호출측이 도형을 자기 단락으로 처리 — 문제 본문).
//   inlineImages=true: 텍스트 흐름에 인라인(해설 — 기존 동작 유지).
function bodyParagraphs(
  segs: ContentSegment[],
  opts: {
    imageMap: ImageMap;
    leadRun?: string;
    tailRun?: string;
    firstParaPr?: number;
    inlineImages?: boolean;
  },
): string[] {
  const out: string[] = [];
  let buf = opts.leadRun || '';
  let first = true;
  const flush = () => {
    if (!buf) return;
    out.push(paragraph(buf, first ? (opts.firstParaPr ?? PARA.body) : PARA.body));
    first = false;
    buf = '';
  };
  for (const seg of segs) {
    if (seg.type === 'image') {
      if (opts.inlineImages) {
        const info = opts.imageMap.get(seg.value);
        if (info) buf += picRun(info.id, info.w, info.h);
      }
      continue;
    }
    if (seg.type === 'equation' && seg.display) {
      flush();
      out.push(paragraph(equationRun(seg.value), PARA.eq));
      first = false;
      continue;
    }
    buf += seg.type === 'equation' ? equationRun(seg.value) : textRun(seg.value, CHAR.body);
  }
  if (opts.tailRun) buf += opts.tailRun;
  flush();
  return out;
}

const CIRCLE = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

// ----------------------------------------------------------------------------
// [구] 시험지 헤더 표 (EditableExamHeader StaticFormView 와 동일 구조)
//   ★ 2026-07-17 에디토리얼 헤더(buildEditorialHeader)로 대체되어 현재 미사용.
//   인쇄 헤더가 에디토리얼+디자인 갤러리로 재편(PR #432~438)되어 한글도 동일 디자인 채택.
//   추후 "디자인 갤러리 → 한글" 확장 시 프리셋 중 하나로 재활용 가능해 보존.
//   매쓰플랫 실측 구조: 전체폭(53839) 플로팅 표(treatAsChar=0, TOP_AND_BOTTOM)를
//   secPr+colPr 뒤 첫 단락에 두면 → 표는 전체폭으로 위에 얹히고 문제는 그 아래 2단으로 흐른다.
//   8열 고정 그리드. 라벨셀=borderFill 25(회색+테두리, CENTER) / 값셀=borderFill 4(흰색+테두리, LEFT Bold).
const HDR_COLS = [5600, 9000, 5000, 7500, 4800, 7500, 4800, 9639]; // 합 53839 (본문 전체폭)
const HDR_ROW_H = 2800;
function hdrColW(col: number, span: number): number {
  let w = 0; for (let i = 0; i < span; i++) w += HDR_COLS[col + i] || 0; return w;
}
function hdrCell(text: string, col: number, row: number, opts: { span?: number; label?: boolean } = {}): string {
  const span = opts.span || 1;
  const bf = opts.label ? 25 : 4;                       // 라벨=회색+테두리 / 값=흰색+테두리
  const para = opts.label ? PARA.figure : PARA.body;    // figure(36)=CENTER 라벨 / body(62)=LEFT 값
  const ch = opts.label ? CHAR.meta : CHAR.chapter;     // 값=h1200 Bold 강조
  return `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">`
    + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">`
    + `<hp:p id="0" paraPrIDRef="${para}" styleIDRef="${STYLE}" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="${ch}"><hp:t>${escXml(text || '')}</hp:t></hp:run></hp:p>`
    + `</hp:subList>`
    + `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="${span}" rowSpan="1"/>`
    + `<hp:cellSz width="${hdrColW(col, span)}" height="${HDR_ROW_H}"/>`
    + `<hp:cellMargin left="510" right="510" top="141" bottom="141"/>`
    + `</hp:tc>`;
}
function buildHeaderTable(h: HwpxHeaderMeta, inline = false): string {
  const rows: string[] = [];
  // 1행: 학원/학교 | 시험명(span3) | 담당
  rows.push('<hp:tr>'
    + hdrCell('학원/학교', 0, 0, { label: true }) + hdrCell(h.schoolName || '', 1, 0)
    + hdrCell('시험명', 2, 0, { label: true }) + hdrCell(h.examTitle || '', 3, 0, { span: 3 })
    + hdrCell('담당', 6, 0, { label: true }) + hdrCell(h.teacher || '', 7, 0)
    + '</hp:tr>');
  // 2행: 과목 | 학기 | 유형 | 학년
  rows.push('<hp:tr>'
    + hdrCell('과목', 0, 1, { label: true }) + hdrCell(h.subject || '', 1, 1)
    + hdrCell('학기', 2, 1, { label: true }) + hdrCell(h.semester || '', 3, 1)
    + hdrCell('유형', 4, 1, { label: true }) + hdrCell(h.examType || '', 5, 1)
    + hdrCell('학년', 6, 1, { label: true }) + hdrCell(h.grade || '', 7, 1)
    + '</hp:tr>');
  // 3행: 시간 | 일시 | 총점(span3) — 값 있을 때만 (StaticFormView 인쇄 로직과 동일)
  const showRow3 = !!(h.timeLimit || h.date || (h.totalScore && h.totalScore !== '100'));
  if (showRow3) {
    rows.push('<hp:tr>'
      + hdrCell('시간', 0, 2, { label: true }) + hdrCell(h.timeLimit || '', 1, 2)
      + hdrCell('일시', 2, 2, { label: true }) + hdrCell(h.date || '', 3, 2)
      + hdrCell('총점', 4, 2, { label: true }) + hdrCell(h.totalScore || '', 5, 2, { span: 3 })
      + '</hp:tr>');
  }
  const rowCnt = showRow3 ? 3 : 2;
  const id = nextId();
  return `<hp:tbl id="${id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rowCnt}" colCnt="8" cellSpacing="0" borderFillIDRef="4" noAdjust="0">`
    + `<hp:sz width="53839" widthRelTo="ABSOLUTE" height="${rowCnt * HDR_ROW_H}" heightRelTo="ABSOLUTE" protect="0"/>`
    + `<hp:pos treatAsChar="${inline ? 1 : 0}" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="${inline ? 'PARA' : 'COLUMN'}" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    + `<hp:outMargin left="0" right="0" top="0" bottom="500"/>`
    + `<hp:inMargin left="510" right="510" top="141" bottom="141"/>`
    + rows.join('')
    + `</hp:tbl>`;
}
// 클래식 표형 높이 — 라벨 h1100×1.6=1760 < 행 2800 이라 성장 없음 (실측 안전)
function classicHeaderHeight(h: HwpxHeaderMeta): number {
  const showRow3 = !!(h.timeLimit || h.date || (h.totalScore && h.totalScore !== '100'));
  return (showRow3 ? 3 : 2) * HDR_ROW_H + 500;
}

// ----------------------------------------------------------------------------
// 에디토리얼 헤더 — PDF 인쇄 헤더(디자인 갤러리 기본형)와 동일 구조 (2026-07-17 사용자 요구):
//   메타(과목·유형 좌 / 학교명 우) → 큰 제목 → 학년 → 이름·점수 줄(아래 가는 구분선).
//   테두리 없는 2열 표로 좌/우 배치. 구 테두리 표 헤더(buildHeaderTable)를 대체.
// ----------------------------------------------------------------------------
const TABLE_W = 52800;                    // 본문 폭(53860)보다 좁게 — 우측 넘침 방지 안전마진
const HALF_W = Math.floor(TABLE_W / 2);
// ★ 행 높이는 "글자 h × 줄간격 160% + 여유" 로 정직하게 — 선언보다 실렌더가 크면(셀 성장)
//   그리드1 이 첫 페이지 계산에 안 맞아 헤더 단독 페이지 발생 (거제여중 실증, 2026-07-18).
const ED_ROW_H = { meta: 1900, title: 3400, grade: 1900, name: 2000, band: 550 } as const;

// 헤더 장식 결정 — 한글 네이티브 3종 (라인/더블/색 띠). 색 없으면 장식 없음(기본 검정).
function headerDeco(h: HwpxHeaderMeta): { band: boolean; lineBf: number } {
  if (!h.accentColor) return { band: false, lineBf: 10 }; // 기본: 가는 검정 하단선
  const t = h.headerTheme || 'line';
  if (t === 'none' || t === 'line') return { band: false, lineBf: BF_ACCENT_LINE };
  if (t === 'double') return { band: false, lineBf: BF_ACCENT_DOUBLE };
  return { band: true, lineBf: BF_ACCENT_LINE }; // 그래픽 테마 → 상단 색 띠 + accent 선
}

function edCell(
  runsXml: string,
  col: number,
  row: number,
  opts: { span?: number; w: number; h: number; align?: 'left' | 'right'; line?: boolean; lineBf?: number; bf?: number },
): string {
  const bf = opts.bf ?? (opts.line ? (opts.lineBf ?? 10) : BF_NONE); // 기본 하단선=10, accent 는 28/30
  const para = opts.align === 'right' ? PARA_RIGHT : PARA.body;
  return `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">`
    + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">`
    + `<hp:p id="0" paraPrIDRef="${para}" styleIDRef="${STYLE}" pageBreak="0" columnBreak="0" merged="0">${runsXml}</hp:p>`
    + `</hp:subList>`
    + `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="${opts.span || 1}" rowSpan="1"/>`
    + `<hp:cellSz width="${opts.w}" height="${opts.h}"/>`
    + `<hp:cellMargin left="0" right="0" top="0" bottom="0"/>`
    + `</hp:tc>`;
}

// ★ 가드: 헤더 디자인(행 추가·테마 등)을 바꾸면 이 함수가 "실제 렌더 높이"를 반환하도록
//   반드시 함께 갱신할 것 — 그리드 첫 페이지가 이 값으로 문제 행 높이를 배분하므로,
//   선언 < 실렌더가 되는 순간 표가 밀려 빈 1페이지가 재발한다 (거제여중 반복 실증).
function editorialHeaderHeight(h: HwpxHeaderMeta, showNameField: boolean): number {
  return (headerDeco(h).band ? ED_ROW_H.band : 0)
    + ED_ROW_H.meta + ED_ROW_H.title + (h.grade ? ED_ROW_H.grade : 0)
    + (showNameField ? ED_ROW_H.name : 0) + 500; // + outMargin bottom
}

// inline=true(그리드 모드): treatAsChar=1 로 텍스트 흐름에 박음 — 플로팅 위치계산 배제(치우침 원천 차단).
// inline=false(흐름 모드): 2단 colPr 위 전체폭 플로팅 (매쓰플랫 실측, 부흥중 검증).
function buildEditorialHeader(h: HwpxHeaderMeta, showNameField: boolean, inline: boolean): string {
  const meta = [h.subject, h.examType].filter(Boolean).join(' · ');
  const deco = headerDeco(h);
  const rows: string[] = [];
  let r = 0;
  if (deco.band) {
    // 상단 색 띠 — 그래픽 테마(wave/ribbon 등) 근사, accent 배경 (한글 네이티브 디자인)
    rows.push('<hp:tr>' + edCell(textRun('', CHAR.small), 0, r, { span: 2, w: TABLE_W, h: ED_ROW_H.band, bf: BF_ACCENT_BAND }) + '</hp:tr>');
    r++;
  }
  rows.push('<hp:tr>'
    + edCell(textRun(meta, CHAR.meta), 0, r, { w: HALF_W, h: ED_ROW_H.meta })
    + edCell(textRun(h.schoolName || '', CHAR.meta), 1, r, { w: TABLE_W - HALF_W, h: ED_ROW_H.meta, align: 'right' })
    + '</hp:tr>');
  r++;
  rows.push('<hp:tr>' + edCell(textRun(h.examTitle || '', CHAR.title), 0, r, { span: 2, w: TABLE_W, h: ED_ROW_H.title }) + '</hp:tr>');
  r++;
  if (h.grade) {
    rows.push('<hp:tr>' + edCell(textRun(h.grade, CHAR.meta), 0, r, { span: 2, w: TABLE_W, h: ED_ROW_H.grade }) + '</hp:tr>');
    r++;
  }
  if (showNameField) {
    rows.push('<hp:tr>'
      + edCell(textRun('이름 :                              ', CHAR.meta), 0, r, { w: HALF_W, h: ED_ROW_H.name, line: true, lineBf: deco.lineBf })
      + edCell(textRun(`점수 :          / ${h.totalScore || '100'}`, CHAR.meta), 1, r, { w: TABLE_W - HALF_W, h: ED_ROW_H.name, line: true, lineBf: deco.lineBf, align: 'right' })
      + '</hp:tr>');
    r++;
  }
  const totalH = editorialHeaderHeight(h, showNameField) - 500;
  return `<hp:tbl id="${nextId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${r}" colCnt="2" cellSpacing="0" borderFillIDRef="${BF_NONE}" noAdjust="0">`
    + `<hp:sz width="${TABLE_W}" widthRelTo="ABSOLUTE" height="${totalH}" heightRelTo="ABSOLUTE" protect="0"/>`
    + `<hp:pos treatAsChar="${inline ? 1 : 0}" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    + `<hp:outMargin left="0" right="0" top="0" bottom="500"/>`
    + `<hp:inMargin left="0" right="0" top="0" bottom="0"/>`
    + rows.join('')
    + `</hp:tbl>`;
}

// \begin{tabular}{..}..\end{tabular} — 데이터 표(요금표 등). 웹은 renderTableToTabular 로
//   박스 표 렌더하는데 한글 내보내기에 처리 루트가 없어 원문 노출 (엄궁중류 18번 실증, 2026-07-18).
//   행 = \\ 구분, 열 = & 구분 → 테두리 표로.
const TABULAR_RE = /\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/;

type ContentPart = { type: 'text'; v: string } | { type: 'tabular'; rows: string[][] };

function splitTabularParts(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  let rest = content || '';
  for (let guard = 0; guard < 20; guard++) {
    const m = rest.match(TABULAR_RE);
    if (!m || m.index === undefined) break;
    if (m.index > 0) parts.push({ type: 'text', v: rest.slice(0, m.index) });
    const rows = m[1]
      .replace(/\\hline/g, '') // 표 괘선 명령 — 미제거 시 셀에 "\hline" 글자 노출 (2026-07-18 실증)
      .split(/\\\\/)
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => r.split('&').map((c) => c.trim()));
    if (rows.length > 0) parts.push({ type: 'tabular', rows });
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest.trim() || parts.length === 0) parts.push({ type: 'text', v: rest });
  return parts;
}

// ----------------------------------------------------------------------------
// 박스형 헤더 — 좌: 메타/큰 제목/학년 스택, 우: 회색 정보 칸(학교명·이름·점수).
//   매쓰플랫 실측 헤더(좌 넓은 제목 + 우 좁은 정보) 구조 기반의 한글 네이티브 디자인.
// ----------------------------------------------------------------------------
const BOXED_ROW_H = 7400;
const BOXED_INFO_W = 16500;
function boxedHeaderHeight(): number { return BOXED_ROW_H + 500; }

function buildBoxedHeader(h: HwpxHeaderMeta, showNameField: boolean, inline: boolean): string {
  const meta = [h.subject, h.examType].filter(Boolean).join(' · ');
  const leftParas = [
    paragraph(textRun(meta, CHAR.meta), PARA.body),
    paragraph(textRun(h.examTitle || '', CHAR.title), PARA.body),
    ...(h.grade ? [paragraph(textRun(h.grade, CHAR.meta), PARA.body)] : []),
  ].join('');
  const rightParas = [
    paragraph(textRun(h.schoolName || '', CHAR.chapter), PARA.eq), // 가운데 볼드
    ...(showNameField
      ? [
        paragraph(textRun('이름 :             ', CHAR.meta), PARA.eq),
        paragraph(textRun(`점수 :      / ${h.totalScore || '100'}`, CHAR.meta), PARA.eq),
      ]
      : []),
  ].join('');
  const cell = (inner: string, col: number, w: number, bf: number, pad: number) =>
    `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">`
    + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">`
    + inner
    + `</hp:subList>`
    + `<hp:cellAddr colAddr="${col}" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/>`
    + `<hp:cellSz width="${w}" height="${BOXED_ROW_H}"/>`
    + `<hp:cellMargin left="${pad}" right="${pad}" top="200" bottom="200"/>`
    + `</hp:tc>`;
  return `<hp:tbl id="${nextId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="1" colCnt="2" cellSpacing="0" borderFillIDRef="4" noAdjust="0">`
    + `<hp:sz width="${TABLE_W}" widthRelTo="ABSOLUTE" height="${BOXED_ROW_H}" heightRelTo="ABSOLUTE" protect="0"/>`
    + `<hp:pos treatAsChar="${inline ? 1 : 0}" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    + `<hp:outMargin left="0" right="0" top="0" bottom="500"/>`
    + `<hp:inMargin left="0" right="0" top="0" bottom="0"/>`
    + `<hp:tr>${cell(leftParas, 0, TABLE_W - BOXED_INFO_W, 4, 600)}${cell(rightParas, 1, BOXED_INFO_W, 25, 300)}</hp:tr>`
    + `</hp:tbl>`;
}

// ----------------------------------------------------------------------------
// 모의고사형 헤더 — 수능 스타일: 가운데 정렬 스택 + 상/하 구분선 (수학비서 '모의고사 타입' 대응)
// ----------------------------------------------------------------------------
// 모의고사형 — 수능지 형식 (사용자 제공 코어블랙 캡처 기준, '제N교시' 타원 제외):
//   상단 가운데 부제(시험명) → 가운데 초대형 과목명("수학영역" 자리) → 가운데 정보줄
//   → 전체 폭 0.4mm 굵은선 → 이름·점수 보조 줄.
const MOCK_ROWS = { sub: 1900, main: 3600, info: 1900, name: 2200 } as const;
function mockHeaderHeight(): number {
  return MOCK_ROWS.sub + MOCK_ROWS.main + MOCK_ROWS.info + MOCK_ROWS.name + 500;
}

function buildMockHeader(h: HwpxHeaderMeta, showNameField: boolean, inline: boolean): string {
  const cell = (inner: string, col: number, r: number, w: number, hh: number, bf: number, span = 1) =>
    `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">`
    + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">`
    + inner
    + `</hp:subList>`
    + `<hp:cellAddr colAddr="${col}" rowAddr="${r}"/><hp:cellSpan colSpan="${span}" rowSpan="1"/>`
    + `<hp:cellSz width="${w}" height="${hh}"/>`
    + `<hp:cellMargin left="200" right="200" top="80" bottom="80"/>`
    + `</hp:tc>`;
  const full = (inner: string, r: number, hh: number, bf: number) => `<hp:tr>${cell(inner, 0, r, TABLE_W, hh, bf, 2)}</hp:tr>`;
  // 수능지: 부제(시험명 작게) / 과목명 초대형 / 정보줄(학교·학년·학기·유형) / ━0.4mm / 이름·점수
  const info = [h.schoolName, h.grade, h.semester, h.examType].filter(Boolean).join(' · ');
  const rows = [
    full(paragraph(textRun(h.examTitle || '', CHAR.meta), PARA.eq), 0, MOCK_ROWS.sub, BF_NONE),
    full(paragraph(textRun(h.subject || h.examTitle || '', CHAR.title), PARA.eq), 1, MOCK_ROWS.main, BF_NONE),
    full(paragraph(textRun(info, CHAR.meta), PARA.eq), 2, MOCK_ROWS.info, BF_RULE_THICK), // 이 행 하단 = 전폭 0.4mm
    '<hp:tr>'
    + cell(paragraph(textRun('', CHAR.meta), PARA.body), 0, 3, Math.floor(TABLE_W / 2), MOCK_ROWS.name, BF_NONE)
    + cell(
      paragraph(
        showNameField ? textRun(`이름 :               점수 :       / ${h.totalScore || '100'}`, CHAR.meta) : textRun('', CHAR.meta),
        PARA_RIGHT,
      ),
      1, 3, TABLE_W - Math.floor(TABLE_W / 2), MOCK_ROWS.name, BF_NONE)
    + '</hp:tr>',
  ].join('');
  return `<hp:tbl id="${nextId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="4" colCnt="2" cellSpacing="0" borderFillIDRef="${BF_NONE}" noAdjust="0">`
    + `<hp:sz width="${TABLE_W}" widthRelTo="ABSOLUTE" height="${mockHeaderHeight() - 500}" heightRelTo="ABSOLUTE" protect="0"/>`
    + `<hp:pos treatAsChar="${inline ? 1 : 0}" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    + `<hp:outMargin left="0" right="0" top="0" bottom="500"/>`
    + `<hp:inMargin left="0" right="0" top="0" bottom="0"/>`
    + rows
    + `</hp:tbl>`;
}

// ----------------------------------------------------------------------------
// 밴드형 헤더 — 기출정복 캡처의 "느낌" 구현 (동일 카피 아님):
//   회색 배경 타이틀 밴드(제목 가운데 크게) + 좌측 accent 컬러 포인트 블록 + 아래 정보줄.
// ----------------------------------------------------------------------------
const BAND_ROWS = { band: 5200, info: 2000 } as const;
function bandHeaderHeight(): number { return BAND_ROWS.band + BAND_ROWS.info + 500; }

function buildBandHeader(h: HwpxHeaderMeta, showNameField: boolean, inline: boolean): string {
  const POINT_W = 2600; // 좌측 컬러 칩 블록
  const cell = (inner: string, col: number, r: number, w: number, hh: number, bf: number, span = 1) =>
    `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">`
    + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">`
    + inner
    + `</hp:subList>`
    + `<hp:cellAddr colAddr="${col}" rowAddr="${r}"/><hp:cellSpan colSpan="${span}" rowSpan="1"/>`
    + `<hp:cellSz width="${w}" height="${hh}"/>`
    + `<hp:cellMargin left="250" right="250" top="100" bottom="100"/>`
    + `</hp:tc>`;
  // 1행: [accent 칩][회색 밴드: 제목 가운데][회색 밴드: 학교명 우측]
  const SCHOOL_W = 12000;
  const band = '<hp:tr>'
    + cell(paragraph(textRun('', CHAR.small), PARA.body), 0, 0, POINT_W, BAND_ROWS.band, BF_ACCENT_BAND)
    + cell(paragraph(textRun(h.examTitle || '', CHAR.title), PARA.eq), 1, 0, TABLE_W - POINT_W - SCHOOL_W, BAND_ROWS.band, 25)
    + cell(paragraph(textRun(h.schoolName || '', CHAR.meta), PARA_RIGHT), 2, 0, SCHOOL_W, BAND_ROWS.band, 25)
    + '</hp:tr>';
  // 2행: [좌: 과목·학년·학기·유형] [우: 일시 또는 이름/점수]
  const info = [h.subject, h.grade, h.semester, h.examType].filter(Boolean).join(' · ');
  const right = showNameField
    ? `이름 :               점수 :       / ${h.totalScore || '100'}`
    : (h.date || '');
  const row2 = '<hp:tr>'
    + cell(paragraph(textRun(info, CHAR.meta), PARA.body), 0, 1, Math.floor(TABLE_W / 2), BAND_ROWS.info, BF_NONE, 2)
    + cell(paragraph(textRun(right, CHAR.meta), PARA_RIGHT), 2, 1, TABLE_W - Math.floor(TABLE_W / 2), BAND_ROWS.info, BF_NONE)
    + '</hp:tr>';
  return `<hp:tbl id="${nextId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="2" colCnt="3" cellSpacing="0" borderFillIDRef="${BF_NONE}" noAdjust="0">`
    + `<hp:sz width="${TABLE_W}" widthRelTo="ABSOLUTE" height="${bandHeaderHeight() - 500}" heightRelTo="ABSOLUTE" protect="0"/>`
    + `<hp:pos treatAsChar="${inline ? 1 : 0}" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    + `<hp:outMargin left="0" right="0" top="0" bottom="500"/>`
    + `<hp:inMargin left="0" right="0" top="0" bottom="0"/>`
    + band + row2
    + `</hp:tbl>`;
}

// ── 헤더 구조 디스패처 — 그리드 배분(headerHeightOf)과 렌더(buildHeaderByStyle)는 반드시 짝 ──
function buildHeaderByStyle(h: HwpxHeaderMeta, showNameField: boolean, inline: boolean): string {
  if (h.headerStyle === 'classic') return buildHeaderTable(h, inline);
  if (h.headerStyle === 'boxed') return buildBoxedHeader(h, showNameField, inline);
  if (h.headerStyle === 'mock') return buildMockHeader(h, showNameField, inline);
  if (h.headerStyle === 'band') return buildBandHeader(h, showNameField, inline);
  return buildEditorialHeader(h, showNameField, inline);
}
function headerHeightOf(h: HwpxHeaderMeta, showNameField: boolean): number {
  if (h.headerStyle === 'classic') return classicHeaderHeight(h);
  if (h.headerStyle === 'boxed') return boxedHeaderHeight();
  if (h.headerStyle === 'mock') return mockHeaderHeight();
  if (h.headerStyle === 'band') return bandHeaderHeight();
  return editorialHeaderHeight(h, showNameField);
}

// <보기>/<조건> 박스 — 테두리 있는 1×1 인라인 표. 라벨 줄이 단독으로 있을 때만 감지
//   (본문 속 "다음 〈보기〉 중에서" 언급은 미발동). 전각/반각 괄호 혼용 허용 (동래여중 '<보기＞' 실증).
//   |보기| 파이프 형식·"보 기" 내부 공백도 허용 (엄궁중·거제여중 8번 실증, 2026-07-18).
const BOX_LABEL_RE = /^\s*[<〈＜|]\s*(보\s*기|조\s*건)\s*[>〉＞|]\s*$/;

// 데이터 표 (tabular) — 전 셀 테두리(bf 4), 셀 내용 가운데 정렬, 내용 따라 행 성장.
function tabularTable(rows: string[][], width: number, cellRender: (cell: string) => string): string {
  const colCnt = Math.max(1, ...rows.map((r) => r.length));
  const cellW = Math.floor(width / colCnt);
  const rowH = 1100; // 최소 — 내용 따라 자동 성장
  // 1열 나열형(요금표 등) = 세로 막대만({|c|} 스타일, 웹 동일) / 다열 데이터표 = 전체 격자
  const bf = colCnt === 1 ? BF_VBAR : 4;
  const trs = rows.map((row, r) => {
    const tcs: string[] = [];
    for (let c = 0; c < colCnt; c++) {
      tcs.push(
        `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">`
        + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">`
        + cellRender(row[c] ?? '')
        + `</hp:subList>`
        + `<hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/>`
        + `<hp:cellSz width="${cellW}" height="${rowH}"/>`
        + `<hp:cellMargin left="400" right="400" top="150" bottom="150"/>`
        + `</hp:tc>`,
      );
    }
    return `<hp:tr>${tcs.join('')}</hp:tr>`;
  }).join('');
  return `<hp:tbl id="${nextId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rows.length}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="${bf}" noAdjust="0">`
    + `<hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${rows.length * rowH}" heightRelTo="ABSOLUTE" protect="0"/>`
    + `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    + `<hp:outMargin left="0" right="0" top="250" bottom="250"/>`
    + `<hp:inMargin left="0" right="0" top="0" bottom="0"/>`
    + trs
    + `</hp:tbl>`;
}

// 짧은 선택지 3열 배치 — 웹 인쇄(①②③/④⑤ 균등 3열)와 동일 정렬. 테두리 없는 표.
function choiceGridTable(cellParas: string[], width: number): string {
  const colCnt = 3;
  const rowCnt = Math.max(1, Math.ceil(cellParas.length / colCnt));
  const cellW = Math.floor(width / colCnt);
  const rowH = 1500; // 최소 — 내용 따라 성장
  let trs = '';
  for (let r = 0; r < rowCnt; r++) {
    let tcs = '';
    for (let c = 0; c < colCnt; c++) {
      const inner = cellParas[r * colCnt + c] ?? paragraph('');
      tcs += `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${BF_NONE}">`
        + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">`
        + inner
        + `</hp:subList>`
        + `<hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/>`
        + `<hp:cellSz width="${cellW}" height="${rowH}"/>`
        + `<hp:cellMargin left="150" right="150" top="100" bottom="100"/>`
        + `</hp:tc>`;
    }
    trs += `<hp:tr>${tcs}</hp:tr>`;
  }
  return `<hp:tbl id="${nextId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rowCnt}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="${BF_NONE}" noAdjust="0">`
    + `<hp:sz width="${width}" widthRelTo="ABSOLUTE" height="${rowCnt * rowH}" heightRelTo="ABSOLUTE" protect="0"/>`
    + `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    + `<hp:outMargin left="0" right="0" top="150" bottom="150"/>`
    + `<hp:inMargin left="0" right="0" top="0" bottom="0"/>`
    + trs
    + `</hp:tbl>`;
}

// ★ 배열 join 조립 (2026-07-18) — 운영 빌드에서 이 함수의 긴 문자열 연결 청크만 오염돼
//   (보간 이후 정적 구간 소실 → XML 손상 파일) 재작성으로 변환 캐시 무효화 + 형태 회피.
function boxTable(innerParas: string, width: number): string {
  const parts: string[] = [];
  parts.push('<hp:tbl id="', String(nextId()), '" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="1" colCnt="1" cellSpacing="0" borderFillIDRef="4" noAdjust="0">');
  parts.push('<hp:sz width="', String(width), '" widthRelTo="ABSOLUTE" height="1000" heightRelTo="ABSOLUTE" protect="0"/>');
  parts.push('<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>');
  parts.push('<hp:outMargin left="0" right="0" top="250" bottom="250"/>');
  parts.push('<hp:inMargin left="400" right="400" top="200" bottom="200"/>');
  parts.push('<hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="4">');
  parts.push('<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">', innerParas, '</hp:subList>');
  parts.push('<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="', String(width), '" height="1000"/><hp:cellMargin left="400" right="400" top="200" bottom="200"/>');
  parts.push('</hp:tc></hp:tr></hp:tbl>');
  return parts.join('');
}

// ----------------------------------------------------------------------------
// perPage 'N문제 배열' 그리드 — 테두리 없는 고정 셀 표, 문제=셀.
//   배치는 PDF 4문제 배열과 동일한 세로 우선 (왼쪽 열 위→아래 → 오른쪽 열):
//   셀(r,c) = 문제 idx c*rowCnt+r. 셀 크기 고정이라 한글 재계산과 무관하게 균등 배열.
// ----------------------------------------------------------------------------
const PAGE_USABLE_H = 84186 - 2834 * 2; // pagePr 실측 (A4 세로 84186 - 상하 여백 2834×2)
const BF_NONE = 2;                      // 4변 모두 NONE 인 borderFill (템플릿 실측)

function buildProblemGrid(
  pageProblems: HwpxProblem[],
  colCnt: number,
  rowCnt: number,
  rowH: number,
  renderCell: (p: HwpxProblem) => string,
  // ★ 첫 페이지 헤더를 그리드의 첫 행(전체 폭 병합 셀)으로 — 별도 단락/표로 두면 한글
  //   페이지 계산에 따라 헤더 단독 페이지가 반복 발생 (거제여중 3회 실증). 같은 표 안이면
  //   물리적으로 분리 불가.
  headerRow?: { xml: string; h: number },
): string {
  const cellW = Math.floor(TABLE_W / colCnt);
  const rows: string[] = [];
  const rowOffset = headerRow ? 1 : 0;
  if (headerRow) {
    rows.push(
      `<hp:tr><hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${BF_NONE}">`
      + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">`
      + headerRow.xml
      + `</hp:subList>`
      + `<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="${colCnt}" rowSpan="1"/>`
      + `<hp:cellSz width="${TABLE_W}" height="${headerRow.h}"/>`
      + `<hp:cellMargin left="0" right="0" top="0" bottom="300"/>`
      + `</hp:tc></hp:tr>`,
    );
  }
  for (let r = 0; r < rowCnt; r++) {
    const tcs: string[] = [];
    for (let c = 0; c < colCnt; c++) {
      const prob = pageProblems[c * rowCnt + r];
      const inner = prob ? renderCell(prob) : paragraph('');
      // 왼쪽 열 셀은 오른쪽에만 가는 회색 선(BF_DIVIDER) — 2단 colLine 재현
      const bf = colCnt === 2 && c === 0 ? BF_DIVIDER : BF_NONE;
      // ★ hasMargin="1" 필수 — 0 이면 cellMargin 이 무시되고 표 inMargin(0)을 상속해
      //   내용이 가운데 구분선에 딱 붙음 (거제여중 실증, 2026-07-18). 구분선 쪽 여백 900(≈1.25mm).
      tcs.push(
        `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">`
        + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">`
        + inner
        + `</hp:subList>`
        + `<hp:cellAddr colAddr="${c}" rowAddr="${r + rowOffset}"/><hp:cellSpan colSpan="1" rowSpan="1"/>`
        + `<hp:cellSz width="${cellW}" height="${rowH}"/>`
        + `<hp:cellMargin left="${c === 0 ? 0 : 900}" right="${c === 0 ? 900 : 0}" top="141" bottom="141"/>`
        + `</hp:tc>`,
      );
    }
    rows.push(`<hp:tr>${tcs.join('')}</hp:tr>`);
  }
  // ★ treatAsChar=1 (인라인) — 플로팅(treatAsChar=0)은 colPr 없는 섹션에서 한글이 위치를
  //   오른쪽으로 틀어 계산 (동래여중 v1·v2 치우침 실증). 인라인은 텍스트 흐름 = 왼쪽 여백 시작.
  return `<hp:tbl id="${nextId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rowCnt + rowOffset}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="${BF_NONE}" noAdjust="0">`
    + `<hp:sz width="${TABLE_W}" widthRelTo="ABSOLUTE" height="${rowCnt * rowH + (headerRow ? headerRow.h : 0)}" heightRelTo="ABSOLUTE" protect="0"/>`
    + `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    + `<hp:outMargin left="0" right="0" top="0" bottom="0"/>`
    + `<hp:inMargin left="0" right="0" top="0" bottom="0"/>`
    + rows.join('')
    + `</hp:tbl>`;
}

function buildSection0(problems: HwpxProblem[], config: HwpxExamConfig, imageMap: ImageMap): string {
  const P: string[] = [];

  // 인쇄 모달 설정 반영: 단 수 + 문제 간격
  const cols = config.columns === 1 ? 1 : 2;
  const perPage = config.perPage && config.perPage > 0 ? config.perPage : 0;
  const pageCounts = Array.isArray(config.pageCounts) && config.pageCounts.some((n) => n > 0)
    ? config.pageCounts.filter((n) => n > 0)
    : null;
  const gridMode = perPage > 0 || !!pageCounts;
  // ★ 그리드 모드: 2열 배치는 표가 담당 → 명시적 "1단" colPr (생략 금지 — 위 COLPR_SINGLE 주석).
  const colCtrl = cols === 2 && !gridMode ? COLPR_CTRL : COLPR_SINGLE;
  // 본문 가로폭(HWPUNIT): A4 59528 - 좌우여백 2834*2 = 53860. 2단이면 (그 폭 - 단간격 2000)/2.
  _colWidth = cols === 2 ? Math.round((53860 - 2000) / 2) : 53860;
  // ★ 문제 간격은 빈 단락이 아니라 '문단 위 간격(space-before)' 으로 — 한글 네이티브 방식.
  //   각 문제 첫 단락에 paraPr PARA_SPACED(90, prev=gap) 적용 → 편집해도 간격 유지, 컬럼 맨 위에선 자동 억제.
  //   (paraPr 90 은 generateHWPX 가 gap 값으로 header.xml 에 주입)

  // 헤더: config.header 가 있으면 표는 firstPara 에 그리고 부제/이름란은 생략(폼 통일).
  //   없으면(테스트 등) 기존 제목/부제/이름란 동작 유지.
  if (!config.header) {
    if (config.subtitle) P.push(paragraph(textRun(config.subtitle, CHAR.chapter), PARA.title));
    if (config.instituteName) P.push(paragraph(textRun(config.instituteName, CHAR.meta), PARA.title));
    if (config.showNameField !== false) {
      P.push(paragraph(textRun('이름 : ________________      반 : ________      날짜 : ________', CHAR.meta), PARA.meta));
    }
    P.push(paragraph(''));  // 빈 줄
  }

  // 문제 1개 → 단락 목록 (번호 단락 + 본문 + 보기박스 + 도형 + 선택지). 흐름/그리드 셀 공용.
  //   ★ 번호는 자기 단락(PARA.number=65), 본문은 그 아래 줄부터 — PDF·시중 문제지·매쓰플랫 실측 동일
  //     (2026-07-17 사용자: "문제 숫자 밑에서부터 문제 시작". 번호 인라인은 긴 문제에서 부자연).
  //   numberParaPr = 번호 단락 paraPr (흐름 모드에선 PARA_SPACED 로 문제 간 간격 담당).
  //   boxW = <보기>/<조건> 박스 표 폭 (배치 컨텍스트의 가용 폭에 맞춤).
  const problemBlockParas = (prob: HwpxProblem, numberParaPr: number, boxW: number): string[] => {
    const out: string[] = [];
    out.push(paragraph(textRun(`${prob.number}.`, CHAR.number), numberParaPr));
    // 도형(이미지)은 텍스트 흐름에서 떼어 자기 단락으로 (인라인 X — 줄바꿈 방해 방지)
    const figures = (ss: ContentSegment[]) => {
      for (const s of ss) {
        if (s.type !== 'image') continue;
        const info = imageMap.get(s.value);
        if (info) out.push(paragraph(picRun(info.id, info.w, info.h), PARA.figure));
      }
    };
    // <보기>/<조건> 라벨 단독 줄 감지 → 라벨 이후 끝까지를 테두리 박스로
    const lines = (prob.content || '').split('\n');
    const boxIdx = lines.findIndex((l) => BOX_LABEL_RE.test(l));
    const mainContent = boxIdx >= 0 ? lines.slice(0, boxIdx).join('\n') : prob.content;

    const pts = prob.points ? `   [${prob.points}점]` : '';
    const tailRun = pts ? textRun(pts, CHAR.small) : '';
    // \begin{tabular} 데이터 표 분리 — 텍스트/표 파트 순서대로 방출. 배점은 마지막 텍스트 파트 끝에.
    const parts = splitTabularParts(mainContent);
    const lastTextIdx = parts.reduce((acc, p, i) => (p.type === 'text' && p.v.trim() ? i : acc), -1);
    let tailUsed = false;
    parts.forEach((part, i) => {
      if (part.type === 'tabular') {
        const tbl = tabularTable(part.rows, boxW, (cell) =>
          bodyParagraphs(parseContent(cell), { imageMap, firstParaPr: PARA.eq }).join('') || paragraph('', PARA.eq));
        out.push(paragraph(`<hp:run charPrIDRef="0">${tbl}</hp:run>`, PARA.body));
        return;
      }
      if (!part.v.trim()) return;
      const segs2 = parseContent(part.v);
      const isTail = i === lastTextIdx;
      if (isTail) tailUsed = true;
      out.push(...bodyParagraphs(segs2, {
        imageMap,
        tailRun: isTail ? tailRun : '',
        firstParaPr: PARA.body,
      }));
      figures(segs2);
    });
    if (tailRun && !tailUsed) out.push(paragraph(tailRun, PARA.body)); // 전부 표뿐인 극단 케이스

    if (boxIdx >= 0) {
      const label = ((lines[boxIdx].match(BOX_LABEL_RE) || [])[1] || '보기').replace(/\s+/g, '');
      const boxSegs = parseContent(lines.slice(boxIdx + 1).join('\n'));
      const inner = [
        paragraph(textRun(`<${label}>`, CHAR.number), PARA.body), // 왼쪽 볼드 라벨 (웹 인쇄 동일)
        ...bodyParagraphs(boxSegs, { imageMap, firstParaPr: PARA.body }),
      ].join('');
      out.push(paragraph(`<hp:run charPrIDRef="0">${boxTable(inner, boxW)}</hp:run>`, PARA.body));
      figures(boxSegs);
    }

    if (prob.choices && prob.choices.length > 0) {
      // 시중 문제지처럼 짧은 선택지(①ㄱ ②ㄱ,ㄷ / ①121 등)는 한 줄 가로 배열 — 세로 5줄은 공간 낭비·부자연.
      // 수식·긴 텍스트 선택지는 기존대로 세로 1줄씩.
      const visLen = (c: string) =>
        stripChoicePrefix(c).replace(/\\[a-zA-Z]+/g, '').replace(/[${}\s]/g, '').length;
      const allShort = prob.choices.every((c) => visLen(c) <= 6);
      if (allShort) {
        // 웹 인쇄와 동일한 3열 정렬 (①②③ / ④⑤) — 테두리 없는 표
        const cells = prob.choices.map((c, i) => {
          const cseg = parseContent(stripChoicePrefix(c));
          const cText = cseg.filter((s) => s.type !== 'image');
          return paragraph(
            textRun(`${CIRCLE[i] || `(${i + 1})`} `, CHAR.body) + segmentsToRuns(cText, CHAR.body, imageMap),
            PARA.body,
          );
        });
        out.push(paragraph(`<hp:run charPrIDRef="0">${choiceGridTable(cells, boxW)}</hp:run>`, PARA.body));
      } else {
        for (let i = 0; i < prob.choices.length; i++) {
          const cseg = parseContent(stripChoicePrefix(prob.choices[i]));
          const cText = cseg.filter((s) => s.type !== 'image');
          out.push(paragraph(textRun(`   ${CIRCLE[i] || `(${i + 1})`} `, CHAR.body) + segmentsToRuns(cText, CHAR.body, imageMap), PARA.body));
          figures(cseg);
        }
      }
    }
    return out;
  };

  // 그리드1(첫 페이지 표) — firstPara 안에 직접 배치 (아래 grid 분기에서 채움)
  let firstGridTbl: string | null = null;

  if (gridMode) {
    // ★ 그리드 모드 = 페이지당 표 (문제=고정 셀). 두 진입로:
    //   - perPage(4/6/8 프리셋): 페이지당 N문제 균등.
    //   - pageCounts(자동 배열): 웹 미리보기의 측정 기반 분할 결과를 그대로 재현 —
    //     한글 자체 reflow(자연 흐름)에 맡기면 미리보기와 페이지 구성이 달라지는 문제 해결 (2026-07-18).
    //   v1 은 hp:p pageBreak/columnBreak 속성이었으나 한글이 흐름 재계산에서 무시/유동적
    //   + 퍼짐(스프레드) 안 됨. 표 셀은 위치·크기 고정이라 확정 배열.
    const gridCols = cols === 2 ? 2 : 1;
    const headerH = config.header
      ? headerHeightOf(config.header, config.showNameField !== false)
      : 0;
    // 그리드 모드 헤더는 firstPara(secPr 단락) 안에 인라인으로 — 별도 단락이면 keepWithNext 로
    //   그리드1과 함께 밀려 "빈 1페이지 + 헤더 단독 2페이지"가 생김 (거제여중 실증, 2026-07-18).
    // 페이지별 청크 — pageCounts 우선, 없으면 perPage 균등. 남는 문제는 마지막에 perPage 단위로.
    const chunks: HwpxProblem[][] = [];
    {
      let idx = 0;
      if (pageCounts) {
        for (const n of pageCounts) {
          if (idx >= problems.length) break;
          chunks.push(problems.slice(idx, idx + n));
          idx += n;
        }
      }
      const per = perPage > 0 ? perPage : (pageCounts ? pageCounts[pageCounts.length - 1] || 4 : 4);
      while (idx < problems.length) {
        chunks.push(problems.slice(idx, idx + per));
        idx += per;
      }
    }
    // 박스 폭 — 매쓰플랫 실측(단 폭 25930 에 박스 22676 ≈ -3200) 비율로 셀 폭에서 차감
    const gridBoxW = Math.floor(TABLE_W / gridCols) - 3200;
    chunks.forEach((pageProblems, page) => {
      const rowsPerPage = Math.max(1, Math.ceil(pageProblems.length / gridCols));
      // 첫 페이지: 헤더를 그리드 첫 행(병합 셀)으로 — 별도 단락이면 헤더 단독 페이지 반복 (실증 3회).
      const withHeader = page === 0 && !!config.header;
      const headerRow = withHeader
        ? {
          xml: `<hp:p id="${nextId()}" paraPrIDRef="${PARA.body}" styleIDRef="${STYLE}" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${buildHeaderByStyle(config.header!, config.showNameField !== false, true)}</hp:run></hp:p>`,
          h: headerH,
        }
        : undefined;
      // ★ 그리드1 은 firstPara(secPr 단락) 안에 직접 들어감 — 앞에 빈 줄이 없어 밀릴 수 없음.
      //   (별도 단락 + 여유 2000/4000 튜닝은 3회 모두 실패 — 첫 단락 빈 줄과 페이지공유 불가가 원인)
      const gridH = PAGE_USABLE_H - (page === 0 ? 1200 : 400) - (withHeader ? headerH : 0);
      const rowH = Math.floor(gridH / rowsPerPage);
      const tbl = buildProblemGrid(pageProblems, gridCols, rowsPerPage, rowH, (p) => problemBlockParas(p, PARA.number, gridBoxW).join(''), headerRow);
      if (page === 0) {
        firstGridTbl = tbl; // firstPara 조립부에서 사용
      } else {
        // 각 그리드는 자기 anchor 단락에 — 표가 페이지를 채워 다음 표는 다음 페이지로
        P.push(`<hp:p id="${nextId()}" paraPrIDRef="${PARA.body}" styleIDRef="${STYLE}" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${tbl}</hp:run><hp:run charPrIDRef="0"><hp:t></hp:t></hp:run></hp:p>`);
      }
    });
  } else {
    // 자연 흐름 (2단 NEWSPAPER) — 첫 문제는 헤더 바로 아래라 위 간격 X, 이후 PARA_SPACED 간격.
    const flowBoxW = cols === 2 ? 22676 : 50000; // 보기박스 폭 — 매쓰플랫 실측 (2단 22676)
    problems.forEach((prob, idx) => {
      P.push(...problemBlockParas(prob, idx === 0 ? PARA.number : PARA_SPACED, flowBoxW));
    });
  }

  // 빠른정답 표 — PDF 인쇄(QuickAnswerView)와 동일 형식 (2026-07-18 사용자 요구):
  //   "빠 른 정 답" 가운데 제목 + [문항|정답|문항|정답] 4열 표(회색 헤더행, 수식 렌더,
  //   좌 절반=1..half / 우 절반=half+1..n). 나열형은 LaTeX 노출·가독성 문제.
  if (config.showAnswerSheet !== false && problems.length > 0) {
    P.push(paragraph(''));
    P.push(paragraph(textRun('빠 른 정 답', CHAR.title), PARA.eq));
    P.push(paragraph(''));
    const NUM_W = 6000;
    const ANS_W = Math.floor(TABLE_W / 2) - NUM_W;
    const half = Math.ceil(problems.length / 2);
    const tc = (inner: string, col: number, r: number, w: number, bf: number, center = true) =>
      `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}">`
      + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">`
      + paragraph(inner, center ? PARA.eq : PARA.body)
      + `</hp:subList>`
      + `<hp:cellAddr colAddr="${col}" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/>`
      + `<hp:cellSz width="${w}" height="1700"/>`
      + `<hp:cellMargin left="200" right="200" top="150" bottom="150"/>`
      + `</hp:tc>`;
    const ansRuns = (p?: HwpxProblem) => {
      if (!p || p.answer === undefined || p.answer === '') return textRun('-', CHAR.body);
      const segs = parseContent(String(p.answer)).filter((s) => s.type !== 'image');
      return segmentsToRuns(segs, CHAR.body, imageMap) || textRun('-', CHAR.body);
    };
    const trs: string[] = [];
    trs.push('<hp:tr>'
      + tc(textRun('문항', CHAR.meta), 0, 0, NUM_W, 25) + tc(textRun('정답', CHAR.meta), 1, 0, ANS_W, 25)
      + tc(textRun('문항', CHAR.meta), 2, 0, NUM_W, 25) + tc(textRun('정답', CHAR.meta), 3, 0, ANS_W, 25)
      + '</hp:tr>');
    for (let r = 0; r < half; r++) {
      const left = problems[r];
      const right = problems[r + half];
      trs.push('<hp:tr>'
        + tc(textRun(String(left?.number ?? ''), CHAR.number), 0, r + 1, NUM_W, 4)
        + tc(ansRuns(left), 1, r + 1, ANS_W, 4)
        + tc(textRun(right ? String(right.number) : '', CHAR.number), 2, r + 1, NUM_W, 4)
        + tc(right ? ansRuns(right) : textRun('', CHAR.body), 3, r + 1, ANS_W, 4)
        + '</hp:tr>');
    }
    const ansTbl = `<hp:tbl id="${nextId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${half + 1}" colCnt="4" cellSpacing="0" borderFillIDRef="4" noAdjust="0">`
      + `<hp:sz width="${TABLE_W}" widthRelTo="ABSOLUTE" height="${(half + 1) * 1700}" heightRelTo="ABSOLUTE" protect="0"/>`
      + `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
      + `<hp:outMargin left="0" right="0" top="200" bottom="200"/>`
      + `<hp:inMargin left="0" right="0" top="0" bottom="0"/>`
      + trs.join('')
      + `</hp:tbl>`;
    P.push(paragraph(`<hp:run charPrIDRef="0">${ansTbl}</hp:run>`, PARA.body));
  }

  // 해설
  if (config.showSolutions) {
    P.push(paragraph(''));
    P.push(paragraph(textRun('[ 해설 ]', CHAR.number), PARA.body));
    for (const prob of problems) {
      if (prob.solution) {
        // [도형]/[그림] 마커는 해설에도 잔존 (전수 감사 발견 — sanitize 는 본문 전용이었음)
        const ss = parseContent(prob.solution.replace(/\[(?:도형|그림)\]/g, ' '));
        // 해설도 디스플레이 수식은 가운데 자기 단락. 이미지는 기존대로 인라인.
        P.push(...bodyParagraphs(ss, {
          imageMap,
          leadRun: textRun(`${prob.number}. `, CHAR.number),
          inlineImages: true,
        }));
      }
    }
  }

  const NS = 'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" '
    + 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" '
    + 'xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" '
    + 'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" '
    + 'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" '
    + 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" '
    + 'xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" '
    + 'xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" '
    + 'xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" '
    + 'xmlns:dc="http://purl.org/dc/elements/1.1/" '
    + 'xmlns:opf="http://www.idpf.org/2007/opf/" '
    + 'xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" '
    + 'xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" '
    + 'xmlns:epub="http://www.idpf.org/2007/ops" '
    + 'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';

  // 첫 단락: run0 에 secPr + colPr(2단 NEWSPAPER+구분선) — 매쓰플랫 구조 동일.
  //   흐름 모드 + header: 에디토리얼 헤더를 전체폭 플로팅으로 같은 단락에 (2단 위에 얹힘).
  //   그리드 모드 헤더는 위에서 인라인으로 이미 P 에 추가됨 → 여기선 빈 런만.
  //   header 없으면 기존 제목 텍스트.
  // 그리드 모드: 그리드1(헤더 행 내장)이 firstPara 의 본문 — 표 앞에 아무 줄도 없어
  //   페이지 밀림 원천 차단. 흐름 모드: 헤더 플로팅 (colPr 2단 위 전체폭 — 부흥중 검증).
  const headerBody = gridMode && firstGridTbl
    ? `<hp:run charPrIDRef="0">${firstGridTbl}</hp:run>`
    : (config.header
      ? `<hp:run charPrIDRef="0">${buildHeaderByStyle(config.header, config.showNameField !== false, false)}</hp:run><hp:run charPrIDRef="0"><hp:t></hp:t></hp:run>`
      : textRun(config.title, CHAR.title) + lineSeg(PARA.title));
  const firstPara = `<hp:p id="0" paraPrIDRef="${PARA.title}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">`
    + `<hp:run charPrIDRef="0">${SECPR_XML}${colCtrl}</hp:run>`
    + headerBody
    + `</hp:p>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>`
    + `<hs:sec ${NS}>`
    + firstPara
    + P.join('')
    + `</hs:sec>`;
}

function buildContentHpf(config: HwpxExamConfig, images: Array<{ id: string; ext: string; mime: string }>): string {
  const title = escXml(config.title || '시험지');
  const imageItems = images
    .map((im) => `<opf:item id="${im.id}" href="BinData/${im.id}.${im.ext}" media-type="${im.mime}" isEmbeded="1"/>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>`
    + `<opf:package xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0" version="" unique-identifier="" id="">`
    + `<opf:metadata><opf:title>${title}</opf:title><opf:language>ko</opf:language><opf:meta name="creator" content="text">gwasaram</opf:meta></opf:metadata>`
    + `<opf:manifest>`
    + `<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>`
    + imageItems
    + `<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>`
    + `<opf:item id="settings" href="settings.xml" media-type="application/xml"/>`
    + `</opf:manifest>`
    + `<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine>`
    + `</opf:package>`;
}

// ----------------------------------------------------------------------------
// 문제 간격 — '문단 위 간격(space-before)' paraPr 를 header.xml 에 동적 주입.
//   빈 단락보다 편집 안정적이고, 2단 컬럼 맨 위에선 한글이 자동 억제(상단 깔끔).
// ----------------------------------------------------------------------------
const PARA_SPACED = 90; // 문제 "번호" 단락용(위 간격). injectSpacingParaPr 가 정의 주입.

function injectSpacingParaPr(header: string, gapHwpUnit: number): string {
  // paraPr 65(문제번호 단독) 복제 → id=PARA_SPACED, prev(문단 위 간격)=gapHwpUnit.
  //   (2026-07-17: 번호가 자기 단락이 되면서 간격도 번호 단락이 담당 — 62(body) 클론에서 변경)
  const i = header.indexOf('<hh:paraPr id="65"');
  if (i < 0) return header;
  const j = header.indexOf('</hh:paraPr>', i);
  if (j < 0) return header;
  let clone = header.slice(i, j + '</hh:paraPr>'.length);
  clone = clone.replace('<hh:paraPr id="65"', `<hh:paraPr id="${PARA_SPACED}"`);
  // case + default 두 군데의 prev(문단 위 간격) → gapHwpUnit (next/left 등은 그대로)
  clone = clone.replace(/<hc:prev value="\d+"/g, `<hc:prev value="${Math.max(0, Math.round(gapHwpUnit))}"`);
  // paraProperties itemCnt +1
  const out = header.replace(/(<hh:paraProperties\b[^>]*\bitemCnt=")(\d+)(")/, (_m, a, n, b) => a + (parseInt(n, 10) + 1) + b);
  const k = out.indexOf('</hh:paraProperties>');
  if (k < 0) return header;
  return out.slice(0, k) + clone + out.slice(k);
}

// 우측정렬 paraPr — 템플릿 실측 63 (RIGHT). ★ 복제 주입(91)은 한글이 무시함(실검증, 동래여중 v2)
//   — 정렬류 paraPr 은 반드시 템플릿 네이티브 id 사용.
const PARA_RIGHT = 63;

// 세로 구분선 borderFill(26) — 그리드 왼쪽 열 셀의 "오른쪽"에만 얇은 회색 선.
//   2단 NEWSPAPER 의 colLine(0.2mm #CCCCCC) 을 그리드 모드에서 재현.
const BF_DIVIDER = 26;
function injectDividerBorderFill(header: string): string {
  const i = header.indexOf('<hh:borderFill id="2"');
  if (i < 0) return header;
  const j = header.indexOf('</hh:borderFill>', i);
  if (j < 0) return header;
  let clone = header.slice(i, j + '</hh:borderFill>'.length);
  clone = clone.replace('<hh:borderFill id="2"', `<hh:borderFill id="${BF_DIVIDER}"`);
  clone = clone.replace(
    /<hh:rightBorder type="[A-Z]+" width="[^"]*" color="[^"]*"\/>/,
    '<hh:rightBorder type="SOLID" width="0.12 mm" color="#CCCCCC"/>',
  );
  const out = header.replace(/(<hh:borderFills\b[^>]*\bitemCnt=")(\d+)(")/, (_m, a, n, b) => a + (parseInt(n, 10) + 1) + b);
  const k = out.indexOf('</hh:borderFills>');
  if (k < 0) return header;
  return out.slice(0, k) + clone + out.slice(k);
}

// 세로 막대 전용 borderFill(27) — tabular {|c|} 스타일 (좌우 SOLID, 상하 NONE).
//   1열 나열형 표(요금표 등)는 웹과 동일하게 가로 구분선 없이 세로 막대만 (2026-07-18).
const BF_VBAR = 27;
function injectVbarBorderFill(header: string): string {
  const i = header.indexOf('<hh:borderFill id="4"');
  if (i < 0) return header;
  const j = header.indexOf('</hh:borderFill>', i);
  if (j < 0) return header;
  let clone = header.slice(i, j + '</hh:borderFill>'.length);
  clone = clone.replace('<hh:borderFill id="4"', `<hh:borderFill id="${BF_VBAR}"`);
  clone = clone
    .replace(/<hh:topBorder type="[A-Z]+"/, '<hh:topBorder type="NONE"')
    .replace(/<hh:bottomBorder type="[A-Z]+"/, '<hh:bottomBorder type="NONE"');
  const out = header.replace(/(<hh:borderFills\b[^>]*\bitemCnt=")(\d+)(")/, (_m, a, n, b) => a + (parseInt(n, 10) + 1) + b);
  const k = out.indexOf('</hh:borderFills>');
  if (k < 0) return header;
  return out.slice(0, k) + clone + out.slice(k);
}

// ── 헤더 디자인 갤러리(테마·강조색) 한글 반영 (2026-07-18) ─────────────────────
//   BF_ACCENT_LINE(28) = 하단 accent 실선 0.4mm (line 테마·이름줄)
//   BF_ACCENT_BAND(29) = 테두리 없이 accent 배경 (색 띠 — wave/ribbon 등 그래픽 테마 근사)
//   BF_ACCENT_DOUBLE(30) = 하단 accent 이중선 (double 테마)
//   ※ 그래픽 테마(wave/grid/dots/corner/mascot 등 SVG)는 한글 표현 불가 → 색 띠 근사.
const BF_ACCENT_LINE = 28;
const BF_ACCENT_BAND = 29;
const BF_ACCENT_DOUBLE = 30;
// 하단 0.4mm 검정 굵은선 — 수학비서 모의고사 타입 실측 (bf10 은 0.12mm 라 별도). 항상 주입.
const BF_RULE_THICK = 31;
function injectThickRule(header: string): string {
  const i = header.indexOf('<hh:borderFill id="10"');
  if (i < 0) return header;
  const j = header.indexOf('</hh:borderFill>', i);
  if (j < 0) return header;
  let clone = header.slice(i, j + '</hh:borderFill>'.length);
  clone = clone
    .replace('<hh:borderFill id="10"', `<hh:borderFill id="${BF_RULE_THICK}"`)
    .replace(/<hh:bottomBorder type="[A-Z]+" width="[^"]*" color="[^"]*"\/>/, '<hh:bottomBorder type="SOLID" width="0.4 mm" color="#000000"/>');
  const out = header.replace(/(<hh:borderFills\b[^>]*\bitemCnt=")(\d+)(")/, (_m, a, n, b) => a + (parseInt(n, 10) + 1) + b);
  const k = out.indexOf('</hh:borderFills>');
  if (k < 0) return header;
  return out.slice(0, k) + clone + out.slice(k);
}

function injectAccentFills(header: string, color: string): string {
  let out = header;
  const cloneFrom = (srcId: string, transform: (clone: string) => string): void => {
    const i = out.indexOf(`<hh:borderFill id="${srcId}"`);
    if (i < 0) return;
    const j = out.indexOf('</hh:borderFill>', i);
    if (j < 0) return;
    const clone = transform(out.slice(i, j + '</hh:borderFill>'.length));
    out = out.replace(/(<hh:borderFills\b[^>]*\bitemCnt=")(\d+)(")/, (_m, a, n, b) => a + (parseInt(n, 10) + 1) + b);
    const k = out.indexOf('</hh:borderFills>');
    if (k < 0) return;
    out = out.slice(0, k) + clone + out.slice(k);
  };
  // 28: bf10(하단선만) → accent 0.4mm
  cloneFrom('10', (c) => c
    .replace('<hh:borderFill id="10"', `<hh:borderFill id="${BF_ACCENT_LINE}"`)
    .replace(/<hh:bottomBorder type="[A-Z]+" width="[^"]*" color="[^"]*"\/>/, `<hh:bottomBorder type="SOLID" width="0.4 mm" color="${color}"/>`));
  // 29: bf25(회색 배경) → 테두리 NONE + accent 배경
  cloneFrom('25', (c) => c
    .replace('<hh:borderFill id="25"', `<hh:borderFill id="${BF_ACCENT_BAND}"`)
    .replace(/<hh:(left|right|top|bottom)Border type="[A-Z]+"/g, '<hh:$1Border type="NONE"')
    .replace(/faceColor="[^"]*"/, `faceColor="${color}"`)
    .replace(/hatchColor="[^"]*"/, `hatchColor="${color}"`));
  // 30: bf10 → 하단 accent 이중선
  cloneFrom('10', (c) => c
    .replace('<hh:borderFill id="10"', `<hh:borderFill id="${BF_ACCENT_DOUBLE}"`)
    .replace(/<hh:bottomBorder type="[A-Z]+" width="[^"]*" color="[^"]*"\/>/, `<hh:bottomBorder type="DOUBLE_SLIM" width="0.5 mm" color="${color}"/>`));
  return out;
}

// gap(px) + perPage → space-before HWPUNIT (px 96dpi → ×75)
function computeGapHwpUnit(config: HwpxExamConfig): number {
  // perPage 그리드 모드는 셀이 배치를 담당 → 간격 paraPr 미사용. 흐름 모드 슬라이더 값만.
  const gapPx = (config.problemGap && config.problemGap > 0) ? config.problemGap : 30;
  return Math.round(gapPx * 75);
}

// ============================================================================
// 메인 생성 / 다운로드
// ============================================================================

export async function generateHWPX(
  problems: HwpxProblem[],
  config: HwpxExamConfig,
): Promise<Blob | Buffer> {
  _shapeId = 2000000000;
  _droppedCommands.clear();

  // 강조색 정규화 — 유효 hex 아니면 제거 (headerDeco 가 미주입 bf 를 참조하는 사고 방지)
  if (config.header?.accentColor && !/^#[0-9a-fA-F]{6}$/.test(config.header.accentColor)) {
    config = { ...config, header: { ...config.header, accentColor: undefined } };
  }
  // 밴드형은 좌측 컬러 칩(bf29)이 필수 → 색 미지정 시 기본 남색
  if (config.header?.headerStyle === 'band' && !config.header.accentColor) {
    config = { ...config, header: { ...config.header, accentColor: '#1E3A8A' } };
  }

  // 본문 전처리 — 유형태그·중복번호·인라인 보기 중복 제거 (이미지 수집 전에, 원본 불변)
  problems = problems.map((p) => ({
    ...p,
    content: sanitizeProblemContent(p.content, p.number, p.choices || []),
  }));

  // 도형 이미지: content/choices/solution 의 ![](url)·<img> 를 fetch → 임베드
  const imageUrls = config.skipImages ? [] : collectImageUrls(problems);
  const { info: imageMap, bytes: imageBytes } = imageUrls.length > 0
    ? await fetchImages(imageUrls)
    : { info: new Map() as ImageMap, bytes: new Map<string, Uint8Array>() };

  const zip = new JSZip();

  // mimetype: 반드시 첫 번째, 비압축(STORE)
  zip.file('mimetype', MIMETYPE, { compression: 'STORE' });
  zip.file('version.xml', VERSION_XML);
  zip.file('settings.xml', SETTINGS_XML);
  zip.file('META-INF/container.xml', CONTAINER_XML);
  zip.file('META-INF/manifest.xml', MANIFEST_XML);
  zip.file('META-INF/container.rdf', CONTAINER_RDF);
  let headerXml = injectThickRule(injectVbarBorderFill(injectDividerBorderFill(injectSpacingParaPr(HEADER_XML, computeGapHwpUnit(config)))));
  // 헤더 강조색 — 유효한 hex 일 때만 주입 (28=하단선, 29=색띠, 30=이중선)
  const accent = config.header?.accentColor;
  if (accent && /^#[0-9a-fA-F]{6}$/.test(accent)) {
    headerXml = injectAccentFills(headerXml, accent);
  }
  zip.file('Contents/header.xml', headerXml);

  // BinData + manifest items
  const imageItems: Array<{ id: string; ext: string; mime: string }> = [];
  for (const [url, meta] of imageMap) {
    const b = imageBytes.get(url);
    if (b) {
      zip.file(`BinData/${meta.id}.${meta.ext}`, b);
      imageItems.push({ id: meta.id, ext: meta.ext, mime: meta.mime });
    }
  }

  zip.file('Contents/content.hpf', buildContentHpf(config, imageItems));
  const sectionXml = buildSection0(problems, config, imageMap);
  // ★ 생성 XML 무결성 가드 (2026-07-18) — 운영에서 빌드 산출물 오염으로 boxTable 템플릿
  //   일부가 잘려 "파일이 손상되었습니다" 파일이 조용히 배포된 사고(동해중). 손상이면
  //   파일 배포 대신 명확한 오류로 실패시킨다.
  for (const [name, xml] of [['header.xml', headerXml], ['section0.xml', sectionXml]] as const) {
    const v = XMLValidator.validate(xml);
    if (v !== true) {
      const err = (v as { err?: { msg?: string; col?: number } }).err;
      throw new Error(`HWPX 생성 XML 손상 감지 (${name}): ${err?.msg || 'unknown'} @${err?.col ?? '?'}`);
    }
  }
  zip.file('Contents/section0.xml', sectionXml);
  // ★ 검증 루프 — 잔재 스캔 (파일 생성은 계속, 경고만 전달)
  if (config.onWarnings) {
    const warns = scanHwpxArtifacts(sectionXml);
    // ★ 수식 변환 중 조용히 지워진 LaTeX 명령 (기호 소실) — 구조·서식 명령은 제외.
    const dropped = [...__droppedCommandsEntries()].filter(([c]) => !DROP_OK.has(c));
    if (dropped.length > 0) {
      const total = dropped.reduce((a, [, n]) => a + n, 0);
      const top = dropped.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, n]) => `\\${c}x${n}`).join(',');
      warns.push({ kind: 'eq-dropped-command', sample: top.slice(0, 50), count: total });
    }
    if (warns.length > 0) config.onWarnings(warns);
  }
  const prv = problems.map((p) => `${p.number}. ${(p.content || '').replace(/<[^>]*>/g, '').replace(/\\[a-zA-Z]+/g, '').slice(0, 60)}`).join('\r\n');
  zip.file('Preview/PrvText.txt', prv);

  // 서버(Node)에서는 Buffer, 브라우저에서는 Blob
  const isNode = typeof window === 'undefined';
  return zip.generateAsync({
    type: isNode ? 'nodebuffer' : 'blob',
    mimeType: 'application/hwp+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  }) as Promise<Blob | Buffer>;
}

export async function downloadHWPX(
  problems: HwpxProblem[],
  config: HwpxExamConfig,
  filename?: string,
): Promise<void> {
  const blob = (await generateHWPX(problems, config)) as Blob;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `${config.title || 'exam'}.hwpx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// 테스트용 export
export { latexToHWPEquation, parseContent, sanitizeProblemContent };
