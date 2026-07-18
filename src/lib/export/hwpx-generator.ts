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

  // \frac{a}{b} → {a} over {b}  (중첩 대비 반복)
  for (let i = 0; i < 6; i++) {
    eq = eq.replace(
      /\\(?:d|t)?frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
      '{$1} over {$2}'
    );
  }

  // \sqrt[n]{x} → root n of {x} / \sqrt{x} → sqrt {x}
  eq = eq.replace(/\\sqrt\[(\d+)\]\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, 'root $1 of {$2}');
  eq = eq.replace(/\\sqrt\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, 'sqrt {$1}');
  eq = eq.replace(/\\sqrt\s*(\d)/g, 'sqrt {$1}');

  // \log_{b} → log_{b} (공백 없음, 실측 일치)
  // ★ \log 다음이 '_'(word char)라 \b 가 안 걸림 → '_' 먼저 직접 치환
  eq = eq.replace(/\\log_(\w)(?![\w{])/g, 'log_{$1}'); // \log_a → log_{a}
  eq = eq.replace(/\\log_/g, 'log_');                  // \log_{...} → log_{...}
  eq = eq.replace(/\\log/g, 'log');                    // 남은 \log → log
  eq = eq.replace(/\\ln\b/g, 'ln');

  // 삼각함수
  for (const fn of ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan']) {
    eq = eq.replace(new RegExp(`\\\\${fn}\\b`, 'g'), fn);
  }

  // \lim / \sum / \prod / \int  (from..to)
  eq = eq.replace(/\\lim_\{([^{}]*?)\\to\s*([^{}]*?)\}/g, 'lim from {$1 -> $2}');
  eq = eq.replace(/\\lim\b/g, 'lim');
  eq = eq.replace(/\\sum_\{([^{}]*)\}\^\{([^{}]*)\}/g, 'sum from {$1} to {$2}');
  eq = eq.replace(/\\sum\b/g, 'sum');
  eq = eq.replace(/\\prod_\{([^{}]*)\}\^\{([^{}]*)\}/g, 'prod from {$1} to {$2}');
  eq = eq.replace(/\\prod\b/g, 'prod');
  eq = eq.replace(/\\int_\{([^{}]*)\}\^\{([^{}]*)\}/g, 'int from {$1} to {$2}');
  eq = eq.replace(/\\int\b/g, 'int');

  // overline / bar / vec
  eq = eq.replace(/\\overline\{([^{}]*)\}/g, 'overline {$1}');
  eq = eq.replace(/\\bar\{([^{}]*)\}/g, 'bar {$1}');
  eq = eq.replace(/\\vec\{([^{}]*)\}/g, 'vec {$1}');

  // 조각함수: \left\{ \begin{array}{..} ... \end{array} \right.  → cases { ... }
  eq = eq.replace(/\\left\s*\\?\{\s*\\begin\{array\}\{[^}]*\}([\s\S]*?)\\end\{array\}\s*\\right\s*\.?/g, (_, c: string) => {
    const rows = c.split('\\\\').map((r) => r.trim()).filter(Boolean); // & 는 HWP 열 구분자라 보존
    return `cases {${rows.join(' # ')}}`;
  });
  // 행렬 / cases / array
  eq = eq.replace(/\\begin\{(?:pmatrix|bmatrix|matrix|array)\}(?:\{[^}]*\})?([\s\S]*?)\\end\{(?:pmatrix|bmatrix|matrix|array)\}/g, (_, c: string) => {
    const rows = c.split('\\\\').map((r) => r.trim()).filter(Boolean); // & 는 HWP 열 구분자라 보존
    return `matrix {${rows.join(' # ')}}`;
  });
  eq = eq.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_, c: string) => {
    const rows = c.split('\\\\').map((r) => r.trim()).filter(Boolean); // & 는 HWP 열 구분자라 보존
    return `cases {${rows.join(' # ')}}`;
  });

  // 그리스 문자
  const greekMap: Record<string, string> = {
    '\\alpha': 'alpha', '\\beta': 'beta', '\\gamma': 'gamma', '\\delta': 'delta',
    '\\epsilon': 'epsilon', '\\varepsilon': 'epsilon', '\\theta': 'theta',
    '\\lambda': 'lambda', '\\mu': 'mu', '\\nu': 'nu', '\\xi': 'xi',
    '\\pi': 'pi', '\\rho': 'rho', '\\sigma': 'sigma', '\\tau': 'tau',
    '\\phi': 'phi', '\\varphi': 'phi', '\\chi': 'chi', '\\psi': 'psi', '\\omega': 'omega',
    '\\Gamma': 'GAMMA', '\\Delta': 'DELTA', '\\Theta': 'THETA', '\\Lambda': 'LAMBDA',
    '\\Sigma': 'SIGMA', '\\Pi': 'PI', '\\Phi': 'PHI', '\\Psi': 'PSI', '\\Omega': 'OMEGA',
  };
  for (const [tex, hwp] of Object.entries(greekMap)) {
    eq = eq.replace(new RegExp(tex.replace(/\\/g, '\\\\') + '(?![a-zA-Z])', 'g'), hwp);
  }

  // 수학 기호 ( \le → <= 등, 실측 일치)
  const symbolMap: Record<string, string> = {
    '\\times': 'times', '\\div': 'div', '\\pm': '+-', '\\mp': '-+', '\\cdot': 'cdot',
    '\\leq': '<=', '\\le': '<=', '\\geq': '>=', '\\ge': '>=',
    '\\neq': '!=', '\\ne': '!=', '\\approx': 'approx', '\\equiv': 'equiv',
    '\\sim': 'sim', '\\infty': 'inf',
    '\\in': 'in', '\\notin': 'notin', '\\subset': 'subset', '\\supset': 'supset',
    '\\cup': 'cup', '\\cap': 'cap', '\\emptyset': 'emptyset',
    '\\forall': 'forall', '\\exists': 'exists',
    // 화살표는 한글 정식 토큰(rarrow 계열)으로 — 에디터 축약형(->)과 렌더 동일하고,
    // 가져오기(hangul-equation)가 같은 토큰을 처리해 라운드트립 검증 가능.
    '\\rightarrow': 'rarrow', '\\to': 'rarrow', '\\leftarrow': 'larrow', '\\gets': 'larrow',
    '\\Rightarrow': 'Rarrow', '\\Leftarrow': 'Larrow', '\\leftrightarrow': 'lrarrow',
    '\\therefore': 'therefore', '\\because': 'because',
    '\\angle': 'angle', '\\triangle': 'triangle',
    '\\parallel': 'parallel', '\\perp': 'perp', '\\prime': "'",
  };
  for (const [tex, hwp] of Object.entries(symbolMap)) {
    eq = eq.replace(new RegExp(tex.replace(/\\/g, '\\\\') + '(?![a-zA-Z])', 'g'), hwp);
  }

  // 구분자: \left\{ \right\} 만 LEFT { RIGHT }(가변 중괄호, 실측에서 렌더됨).
  //   괄호·대괄호·바(( [ |)는 HWP 에서 LEFT ( 가 글자로 깨짐 → \left/\right 만 제거하고 리터럴 구분자 유지.
  eq = eq.replace(/\\left\s*\\\{/g, 'LEFT { ');
  eq = eq.replace(/\\right\s*\\\}/g, ' RIGHT } ');
  eq = eq.replace(/\\left\s*\./g, ' ').replace(/\\right\s*\./g, ' '); // 빈 구분자 \left. \right.
  eq = eq.replace(/\\left\s*/g, '').replace(/\\right\s*/g, '');        // \left( [ | → 구분자만
  // 남은 naked \{ \} (집합 등) → 리터럴 중괄호
  eq = eq.replace(/\\\{/g, ' lbrace ').replace(/\\\}/g, ' rbrace ');

  // \mathrm,\text,\textbf → "..."
  eq = eq.replace(/\\(?:mathrm|text|textbf|mathbf|boldsymbol|operatorname)\{([^{}]*)\}/g, '"$1"');

  // 빈칸 네모(\square) — 시험지 빈칸 채우기 기호. 미매핑 시 "\square" 글자 노출(동래여중 16번 실증)
  eq = eq.replace(/\\square(?![a-zA-Z])/g, '□');

  // 남은 LaTeX 명령 정리
  eq = eq.replace(/\\[a-zA-Z]+\{([^{}]*)\}/g, '$1');
  eq = eq.replace(/\\[a-zA-Z]+/g, '');

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
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\theta': 'θ',
  '\\lambda': 'λ', '\\mu': 'μ', '\\pi': 'π', '\\sigma': 'σ', '\\omega': 'ω',
};
function cleanTextLatex(s: string): string {
  let t = s;
  // (?![a-zA-Z]) 필수 — 없으면 \leftrightarrow 의 "\left" 를 삼켜 "rightarrow" 글자 노출 (요금표 실증)
  t = t.replace(/\\left(?![a-zA-Z])\s*/g, '').replace(/\\right(?![a-zA-Z])\s*/g, '');
  t = t.replace(/\\([{}%$#&_])/g, '$1');      // \{ → {, \% → % 등 이스케이프 리터럴
  t = t.replace(/\\[,;!:]/g, ' ').replace(/\\ /g, ' ');
  for (const [k, v] of Object.entries(TEXT_SYM)) {
    t = t.replace(new RegExp(k.replace(/\\/g, '\\\\') + '(?![a-zA-Z])', 'g'), v);
  }
  return t;
}

// 텍스트(이미지 제외) → text/equation 세그먼트
function parseTextMath(text: string): ContentSegment[] {
  const segs: ContentSegment[] = [];
  // 디스플레이 수식(\[ \], $$ $$)은 여러 줄 가능 → [\s\S]. 인라인($, \()은 줄 안.
  const mathPattern = /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = mathPattern.exec(text)) !== null) {
    if (m.index > last) { const t = text.slice(last, m.index); if (t.trim()) segs.push({ type: 'text', value: cleanTextLatex(t) }); }
    const hwpEq = latexToHWPEquation(m[1] || m[2] || m[3] || m[4]);
    // m[1]=\[..\], m[3]=$$..$$ → 디스플레이 수식 (m[2]=\(..\), m[4]=$..$ 는 인라인)
    if (hwpEq) segs.push({ type: 'equation', value: hwpEq, display: !!(m[1] || m[3]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) { const t = text.slice(last); if (t.trim()) segs.push({ type: 'text', value: cleanTextLatex(t) }); }
  return segs;
}

function parseContent(content: string): ContentSegment[] {
  if (!content) return [];
  // 1) 이미지(마크다운/HTML) 먼저 추출 → 마커로 치환 (HTML strip 전에)
  const imgs: string[] = [];
  let s = content
    .replace(IMG_MD, (_m, url) => { imgs.push(url); return ` IMG${imgs.length - 1} `; })
    .replace(IMG_HTML, (_m, url) => { imgs.push(url); return ` IMG${imgs.length - 1} `; });
  // 2) 나머지 HTML 정리
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
function buildHeaderTable(h: HwpxHeaderMeta): string {
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
    + `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    + `<hp:outMargin left="0" right="0" top="0" bottom="500"/>`
    + `<hp:inMargin left="510" right="510" top="141" bottom="141"/>`
    + rows.join('')
    + `</hp:tbl>`;
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
const ED_ROW_H = { meta: 1900, title: 3400, grade: 1900, name: 2000 } as const;

function edCell(
  runsXml: string,
  col: number,
  row: number,
  opts: { span?: number; w: number; h: number; align?: 'left' | 'right'; line?: boolean },
): string {
  const bf = opts.line ? 10 : BF_NONE; // 10 = bottom SOLID only (템플릿 실측) → 이름줄 아래 구분선
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

function editorialHeaderHeight(h: HwpxHeaderMeta, showNameField: boolean): number {
  return ED_ROW_H.meta + ED_ROW_H.title + (h.grade ? ED_ROW_H.grade : 0)
    + (showNameField ? ED_ROW_H.name : 0) + 500; // + outMargin bottom
}

// inline=true(그리드 모드): treatAsChar=1 로 텍스트 흐름에 박음 — 플로팅 위치계산 배제(치우침 원천 차단).
// inline=false(흐름 모드): 2단 colPr 위 전체폭 플로팅 (매쓰플랫 실측, 부흥중 검증).
function buildEditorialHeader(h: HwpxHeaderMeta, showNameField: boolean, inline: boolean): string {
  const meta = [h.subject, h.examType].filter(Boolean).join(' · ');
  const rows: string[] = [];
  let r = 0;
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
      + edCell(textRun('이름 :                              ', CHAR.meta), 0, r, { w: HALF_W, h: ED_ROW_H.name, line: true })
      + edCell(textRun(`점수 :          / ${h.totalScore || '100'}`, CHAR.meta), 1, r, { w: TABLE_W - HALF_W, h: ED_ROW_H.name, line: true, align: 'right' })
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

// <보기>/<조건> 박스 — 테두리 있는 1×1 인라인 표. 라벨 줄이 단독으로 있을 때만 감지
//   (본문 속 "다음 〈보기〉 중에서" 언급은 미발동). 전각/반각 괄호 혼용 허용 (동래여중 '<보기＞' 실증).
//   |보기| 파이프 형식도 허용 (엄궁중 유사1회 실증, 2026-07-18).
const BOX_LABEL_RE = /^\s*[<〈＜|]\s*(보기|조건)\s*[>〉＞|]\s*$/;

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

function boxTable(innerParas: string, width: number): string {
  return `<hp:tbl id="${nextId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="1" colCnt="1" cellSpacing="0" borderFillIDRef="4" noAdjust="0">`
    + `<hp:sz width="${width}" widthRelTo="ABSOLUTE" height="1000" heightRelTo="ABSOLUTE" protect="0"/>`
    + `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
    + `<hp:outMargin left="0" right="0" top="250" bottom="250"/>`
    + `<hp:inMargin left="400" right="400" top="200" bottom="200"/>`
    + `<hp:tr><hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="4">`
    + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${innerParas}</hp:subList>`
    + `<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${width}" height="1000"/><hp:cellMargin left="400" right="400" top="200" bottom="200"/>`
    + `</hp:tc></hp:tr></hp:tbl>`;
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
): string {
  const cellW = Math.floor(TABLE_W / colCnt);
  const rows: string[] = [];
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
        + `<hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/>`
        + `<hp:cellSz width="${cellW}" height="${rowH}"/>`
        + `<hp:cellMargin left="${c === 0 ? 0 : 900}" right="${c === 0 ? 900 : 0}" top="141" bottom="141"/>`
        + `</hp:tc>`,
      );
    }
    rows.push(`<hp:tr>${tcs.join('')}</hp:tr>`);
  }
  // ★ treatAsChar=1 (인라인) — 플로팅(treatAsChar=0)은 colPr 없는 섹션에서 한글이 위치를
  //   오른쪽으로 틀어 계산 (동래여중 v1·v2 치우침 실증). 인라인은 텍스트 흐름 = 왼쪽 여백 시작.
  return `<hp:tbl id="${nextId()}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${rowCnt}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="${BF_NONE}" noAdjust="0">`
    + `<hp:sz width="${TABLE_W}" widthRelTo="ABSOLUTE" height="${rowCnt * rowH}" heightRelTo="ABSOLUTE" protect="0"/>`
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
      const label = (lines[boxIdx].match(BOX_LABEL_RE) || [])[1] || '보기';
      const boxSegs = parseContent(lines.slice(boxIdx + 1).join('\n'));
      const inner = [
        paragraph(textRun(`< ${label} >`, CHAR.meta), PARA.eq), // 가운데 라벨
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
        const runs = prob.choices.map((c, i) => {
          const cseg = parseContent(stripChoicePrefix(c));
          const cText = cseg.filter((s) => s.type !== 'image');
          return textRun(`${CIRCLE[i] || `(${i + 1})`} `, CHAR.body)
            + segmentsToRuns(cText, CHAR.body, imageMap)
            + textRun('      ', CHAR.body);
        }).join('');
        out.push(paragraph(textRun('   ', CHAR.body) + runs, PARA.body));
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

  if (gridMode) {
    // ★ 그리드 모드 = 페이지당 표 (문제=고정 셀). 두 진입로:
    //   - perPage(4/6/8 프리셋): 페이지당 N문제 균등.
    //   - pageCounts(자동 배열): 웹 미리보기의 측정 기반 분할 결과를 그대로 재현 —
    //     한글 자체 reflow(자연 흐름)에 맡기면 미리보기와 페이지 구성이 달라지는 문제 해결 (2026-07-18).
    //   v1 은 hp:p pageBreak/columnBreak 속성이었으나 한글이 흐름 재계산에서 무시/유동적
    //   + 퍼짐(스프레드) 안 됨. 표 셀은 위치·크기 고정이라 확정 배열.
    const gridCols = cols === 2 ? 2 : 1;
    const headerH = config.header
      ? editorialHeaderHeight(config.header, config.showNameField !== false)
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
      // 첫 페이지 여유 2000 — firstPara 빈 런/문단 간격 오버헤드 (헤더 행높이는 ED_ROW_H 가
      //   실측 기준이라 별도 성장분 불필요). 이후 페이지는 400.
      const gridH = PAGE_USABLE_H - (page === 0 ? headerH + 2000 : 0) - 400;
      const rowH = Math.floor(gridH / rowsPerPage);
      const tbl = buildProblemGrid(pageProblems, gridCols, rowsPerPage, rowH, (p) => problemBlockParas(p, PARA.number, gridBoxW).join(''));
      // 각 그리드는 자기 anchor 단락에 — 표가 페이지를 채워 다음 표는 다음 페이지로
      P.push(`<hp:p id="${nextId()}" paraPrIDRef="${PARA.body}" styleIDRef="${STYLE}" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${tbl}</hp:run><hp:run charPrIDRef="0"><hp:t></hp:t></hp:run></hp:p>`);
    });
  } else {
    // 자연 흐름 (2단 NEWSPAPER) — 첫 문제는 헤더 바로 아래라 위 간격 X, 이후 PARA_SPACED 간격.
    const flowBoxW = cols === 2 ? 22676 : 50000; // 보기박스 폭 — 매쓰플랫 실측 (2단 22676)
    problems.forEach((prob, idx) => {
      P.push(...problemBlockParas(prob, idx === 0 ? PARA.number : PARA_SPACED, flowBoxW));
    });
  }

  // 정답표
  if (config.showAnswerSheet !== false) {
    P.push(paragraph(''));
    P.push(paragraph(textRun('[ 정답 ]', CHAR.number), PARA.body));
    const ans = problems.filter((p) => p.answer !== undefined && p.answer !== '')
      .map((p) => `${p.number}. ${p.answer}`).join('     ');
    if (ans) P.push(paragraph(textRun(ans, CHAR.body), PARA.body));
  }

  // 해설
  if (config.showSolutions) {
    P.push(paragraph(''));
    P.push(paragraph(textRun('[ 해설 ]', CHAR.number), PARA.body));
    for (const prob of problems) {
      if (prob.solution) {
        const ss = parseContent(prob.solution);
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
  // 헤더는 모드 무관 firstPara 안에 (그리드=인라인 / 흐름=플로팅). 별도 단락 금지 — keepWithNext
  //   로 그리드와 함께 밀려 빈 페이지 생김. 이중 생성 금지 (gridMode 인자만 분기).
  const headerBody = config.header
    ? `<hp:run charPrIDRef="0">${buildEditorialHeader(config.header, config.showNameField !== false, gridMode)}</hp:run><hp:run charPrIDRef="0"><hp:t></hp:t></hp:run>`
    : textRun(config.title, CHAR.title) + lineSeg(PARA.title);
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

  // 본문 전처리 — 유형태그·중복번호·인라인 보기 중복 제거 (이미지 수집 전에, 원본 불변)
  problems = problems.map((p) => ({
    ...p,
    content: sanitizeProblemContent(p.content, p.number, p.choices || []),
  }));

  // 도형 이미지: content/choices/solution 의 ![](url)·<img> 를 fetch → 임베드
  const imageUrls = collectImageUrls(problems);
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
  zip.file(
    'Contents/header.xml',
    injectVbarBorderFill(injectDividerBorderFill(injectSpacingParaPr(HEADER_XML, computeGapHwpUnit(config)))),
  );

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
  zip.file('Contents/section0.xml', buildSection0(problems, config, imageMap));
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
