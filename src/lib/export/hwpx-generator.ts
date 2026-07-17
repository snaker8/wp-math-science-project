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
  perPage?: number;      // 인쇄 모달 '4문제 배열' 프리셋(4/6/8) → 문제 밀도(간격)
  // ★ 시험지 헤더 표 — 있으면 제목/부제/이름란 대신 우리 헤더 표(학원/학교·시험명·과목·유형·학년)를 그린다.
  header?: HwpxHeaderMeta;
}

// 매쓰플랫 실제 .hwpx 와 동일한 charPr/paraPr ID (header.xml 검증 템플릿 기준)
const CHAR = {
  body: 0,      // h1000 본문/수식
  number: 16,   // h1600 Bold 문제번호
  title: 23,    // h2000 Bold 제목
  chapter: 21,  // h1200 Bold 부제
  meta: 22,     // h1100 메타(이름/날짜)
  small: 22,    // h1100 배점 (charPr 26 은 밑줄 있어서 22 사용)
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

  // 남은 LaTeX 명령 정리
  eq = eq.replace(/\\[a-zA-Z]+\{([^{}]*)\}/g, '$1');
  eq = eq.replace(/\\[a-zA-Z]+/g, '');
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
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\theta': 'θ',
  '\\lambda': 'λ', '\\mu': 'μ', '\\pi': 'π', '\\sigma': 'σ', '\\omega': 'ω',
};
function cleanTextLatex(s: string): string {
  let t = s;
  t = t.replace(/\\left\s*/g, '').replace(/\\right\s*/g, '');
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
  // ② 선두 중복 번호 — 우리가 "N. " 을 다시 붙이므로. 시퀀스 번호와 일치할 때만(보수적):
  //    "01 "(zero-pad+공백) / "1."·"1)"(구두점). ★ bare "1 "(비패딩+공백)은 "1 이상의 수" 오삭제 위험 → 보존.
  const zeroPad = String(num).padStart(2, '0');
  s = s.replace(new RegExp(`^\\s*(?:${zeroPad}\\s+|${num}\\s*[.)]\\s*)`), '');
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

function paragraph(
  runsXml: string,
  paraPrId: number = PARA.body,
  breaks?: { page?: boolean; column?: boolean },
): string {
  return `<hp:p id="${nextId()}" paraPrIDRef="${paraPrId}" styleIDRef="${STYLE}" pageBreak="${breaks?.page ? 1 : 0}" columnBreak="${breaks?.column ? 1 : 0}" merged="0">${runsXml || textRun('', CHAR.body)}${lineSeg(paraPrId)}</hp:p>`;
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
//   inlineImages=false: 이미지 세그먼트 건너뜀(호출측이 pushFigures 로 자기 단락 처리 — 문제 본문).
//   inlineImages=true: 텍스트 흐름에 인라인(해설 — 기존 동작 유지).
//   breaks 는 이 문제의 "첫" 단락에만 적용 (perPage 페이지/단 나누기).
function bodyParagraphs(
  segs: ContentSegment[],
  opts: {
    imageMap: ImageMap;
    leadRun?: string;
    tailRun?: string;
    firstParaPr?: number;
    inlineImages?: boolean;
    breaks?: { page?: boolean; column?: boolean };
  },
): string[] {
  const out: string[] = [];
  let buf = opts.leadRun || '';
  let first = true;
  const flush = () => {
    if (!buf) return;
    out.push(paragraph(buf, first ? (opts.firstParaPr ?? PARA.body) : PARA.body, first ? opts.breaks : undefined));
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
      out.push(paragraph(equationRun(seg.value), PARA.eq, first ? opts.breaks : undefined));
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
// 시험지 헤더 표 (EditableExamHeader StaticFormView 와 동일 구조)
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

function buildSection0(problems: HwpxProblem[], config: HwpxExamConfig, imageMap: ImageMap): string {
  const P: string[] = [];

  // 인쇄 모달 설정 반영: 단 수 + 문제 간격
  const cols = config.columns === 1 ? 1 : 2;
  const colCtrl = cols === 2 ? COLPR_CTRL : '';
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

  // 도형(이미지) 세그먼트는 텍스트 흐름에서 떼어 자기 단락으로 (인라인 X — 줄바꿈 방해 방지)
  const pushFigures = (segs: ContentSegment[]) => {
    for (const s of segs) {
      if (s.type !== 'image') continue;
      const info = imageMap.get(s.value);
      if (info) P.push(paragraph(picRun(info.id, info.w, info.h), PARA.figure));
    }
  };

  // ★ perPage 배열 — 간격 근사가 아니라 페이지/단 나누기로 '페이지당 N문제'를 확정 보장.
  //   2단이면 단당 N/2 문제 후 columnBreak, 페이지당 N 문제 후 pageBreak.
  //   (간격 프리셋 computeGapHwpUnit 은 단 내부 분산용으로 유지.)
  const perPage = config.perPage && config.perPage > 0 ? config.perPage : 0;
  const perCol = perPage > 0 && cols === 2 ? Math.ceil(perPage / 2) : 0;

  // 문제 (번호 인라인 + 본문, 매쓰플랫 paraPr/charPr)
  problems.forEach((prob, idx) => {
    const segs = parseContent(prob.content);
    const pts = prob.points ? `   [${prob.points}점]` : '';
    const pos = perPage > 0 ? idx % perPage : -1;
    const pageBrk = perPage > 0 && idx > 0 && pos === 0;
    const colBrk = !pageBrk && perCol > 0 && pos === perCol;
    const brk = pageBrk || colBrk;
    // 첫 문제·나누기 직후 문제는 단/페이지 맨 위라 위 간격 X. 그 외엔 PARA_SPACED 로 문제 사이 간격.
    P.push(...bodyParagraphs(segs, {
      imageMap,
      leadRun: textRun(`${prob.number}. `, CHAR.number),
      tailRun: pts ? textRun(pts, CHAR.small) : '',
      firstParaPr: idx === 0 || brk ? PARA.body : PARA_SPACED,
      breaks: brk ? { page: pageBrk, column: colBrk } : undefined,
    }));
    pushFigures(segs);  // 도형은 본문 아래 자기 단락에

    if (prob.choices && prob.choices.length > 0) {
      for (let i = 0; i < prob.choices.length; i++) {
        const cseg = parseContent(stripChoicePrefix(prob.choices[i]));
        const cText = cseg.filter((s) => s.type !== 'image');
        P.push(paragraph(textRun(`   ${CIRCLE[i] || `(${i + 1})`} `, CHAR.body) + segmentsToRuns(cText, CHAR.body, imageMap), PARA.body));
        pushFigures(cseg);  // 선택지 도형(드묾)도 자기 단락
      }
    }
  });

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
  //   header 있으면 전체폭 헤더 표(플로팅)를 같은 단락에 — 표 위, 문제는 2단으로 아래 흐름.
  //   없으면 기존 제목 텍스트.
  const headerBody = config.header
    ? `<hp:run charPrIDRef="0">${buildHeaderTable(config.header)}</hp:run><hp:run charPrIDRef="0"><hp:t></hp:t></hp:run>`
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
const PARA_SPACED = 90; // 문제 첫 단락용(위 간격). injectSpacingParaPr 가 정의 주입.

function injectSpacingParaPr(header: string, gapHwpUnit: number): string {
  // paraPr 62(body, LEFT) 복제 → id=PARA_SPACED, prev(문단 위 간격)=gapHwpUnit.
  const i = header.indexOf('<hh:paraPr id="62"');
  if (i < 0) return header;
  const j = header.indexOf('</hh:paraPr>', i);
  if (j < 0) return header;
  let clone = header.slice(i, j + '</hh:paraPr>'.length);
  clone = clone.replace('<hh:paraPr id="62"', `<hh:paraPr id="${PARA_SPACED}"`);
  // case + default 두 군데의 prev(문단 위 간격) 0 → gapHwpUnit (next/left 등은 그대로)
  clone = clone.replace(/<hc:prev value="0"/g, `<hc:prev value="${Math.max(0, Math.round(gapHwpUnit))}"`);
  // paraProperties itemCnt +1
  const out = header.replace(/(<hh:paraProperties\b[^>]*\bitemCnt=")(\d+)(")/, (_m, a, n, b) => a + (parseInt(n, 10) + 1) + b);
  const k = out.indexOf('</hh:paraProperties>');
  if (k < 0) return header;
  return out.slice(0, k) + clone + out.slice(k);
}

// gap(px) + perPage → space-before HWPUNIT (px 96dpi → ×75)
function computeGapHwpUnit(config: HwpxExamConfig): number {
  const gapPx = (config.problemGap && config.problemGap > 0) ? config.problemGap : 30;
  if (config.perPage && config.perPage > 0) {
    // N문제 배열: '페이지당 N문제'는 buildSection0 의 pageBreak/columnBreak 가 확정 보장.
    // 여기 간격은 단 내부에서 문제를 벌려주는 분산용 (적을수록 간격 ↑).
    const map: Record<number, number> = { 4: 4200, 6: 3000, 8: 2300 };
    if (map[config.perPage]) return map[config.perPage];
  }
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
  zip.file('Contents/header.xml', injectSpacingParaPr(HEADER_XML, computeGapHwpUnit(config)));

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
