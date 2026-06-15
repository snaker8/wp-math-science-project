// ============================================================================
// 한글(HWP/HML) 수식 마크업 → LaTeX 변환
//   한글 수식 표기는 LaTeX 와 거의 동일하나 (1) 명령 앞 백슬래시 생략
//   (left/right/sqrt/over/times…), (2) 분수는 `{a} over {b}`, (3) 백틱(`)·물결(~)을
//   공백/정렬 토큰으로 사용 — 이 차이만 보정한다.
//   완벽 변환이 아니라 시험지 수식의 대다수(다항식·분수·근호·지수·비교연산)를 커버.
//   못 잡는 고급 표기(행렬/cases 일부)는 원문 유지 → 펼쳐보기에서 수정.
// ============================================================================

// 백슬래시를 붙여야 하는 한글 수식 명령어 (LaTeX 명령과 철자 동일)
const BACKSLASH_CMDS = [
  // 구분자/구조
  'left', 'right', 'sqrt', 'frac', 'over', 'root', 'of',
  // 연산/관계
  'times', 'div', 'pm', 'mp', 'cdot', 'ast', 'star',
  'leq', 'geq', 'neq', 'ne', 'le', 'ge', 'equiv', 'approx', 'sim', 'propto',
  'subset', 'supset', 'subseteq', 'supseteq', 'in', 'notin', 'cup', 'cap',
  // 큰 연산자/극한
  'sum', 'prod', 'int', 'lim', 'inf', 'sup', 'max', 'min',
  // 함수
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'exp',
  // 기호
  'infty', 'partial', 'nabla', 'angle', 'triangle', 'square',
  'cdots', 'ldots', 'vdots', 'ddots', 'dots',
  'rightarrow', 'leftarrow', 'leftrightarrow', 'Rightarrow', 'Leftarrow', 'to',
  'overline', 'underline', 'vec', 'hat', 'bar', 'dot', 'tilde',
  // 그리스
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta',
  'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi',
  'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
];

// 스타일 토큰 — LaTeX 에선 불필요하므로 제거
const DROP_TOKENS = ['rm', 'it', 'bold', 'roman'];

/** `{분자} over {분모}` / `분자 over 분모` → `\frac{..}{..}` */
function convertOver(s: string): string {
  // {..} over {..}
  let prev: string;
  do {
    prev = s;
    s = s.replace(/\{([^{}]*)\}\s*over\s*\{([^{}]*)\}/g, '\\frac{$1}{$2}');
  } while (s !== prev);
  // 토큰 over 토큰 (브레이스 없는 단순형)
  s = s.replace(/([A-Za-z0-9.]+)\s*over\s*([A-Za-z0-9.]+)/g, '\\frac{$1}{$2}');
  return s;
}

/**
 * 한글 수식 SCRIPT → LaTeX (달러 기호 없이 본문만)
 */
export function hangulEquationToLatex(script: string): string {
  if (!script) return '';
  let s = script;

  // 1) 백틱(공백/정렬)·물결 → 공백, 정렬용 & 제거
  s = s.replace(/`/g, ' ').replace(/~/g, ' ').replace(/&/g, ' ');

  // 2) 분수 (over) — 백슬래시 붙이기 전에 처리
  s = convertOver(s);

  // 3) 스타일 토큰 제거
  for (const t of DROP_TOKENS) {
    s = s.replace(new RegExp(`(?<![\\\\A-Za-z])${t}\\b`, 'g'), ' ');
  }

  // 4) 명령어 백슬래시 보정 (이미 백슬래시 있거나 단어 일부면 제외)
  for (const cmd of BACKSLASH_CMDS) {
    s = s.replace(new RegExp(`(?<![\\\\A-Za-z])${cmd}(?![A-Za-z])`, 'g'), `\\${cmd}`);
  }

  // 5) 공백 정리
  s = s.replace(/[ \t]{2,}/g, ' ').trim();
  return s;
}

/** 본문 삽입용 — 인라인 수식으로 `$...$` 래핑. 빈 문자열이면 빈 문자열 반환. */
export function hangulEquationToInlineLatex(script: string): string {
  const latex = hangulEquationToLatex(script);
  return latex ? `$${latex}$` : '';
}
