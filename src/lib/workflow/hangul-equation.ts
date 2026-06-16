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
  'overline', 'underline', 'vec', 'hat', 'dot', 'tilde', // 'bar' 는 \overline 으로 별도 처리
  // 그리스
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta',
  'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi',
  'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
];

// 스타일 토큰 — LaTeX 에선 불필요하므로 제거
const DROP_TOKENS = ['rm', 'it', 'bold', 'roman'];

/** `{..}` 닫는 위치(end, exclusive)에서 역방향으로 균형 잡힌 여는 `{` 찾기 */
function grabBraceBackward(s: string, end: number): { start: number; inner: string } | null {
  let depth = 0;
  for (let i = end - 1; i >= 0; i--) {
    if (s[i] === '}') depth++;
    else if (s[i] === '{') {
      depth--;
      if (depth === 0) return { start: i, inner: s.slice(i + 1, end - 1) };
    }
  }
  return null;
}

/** 여는 `{`(start) 에서 정방향으로 균형 잡힌 닫는 `}` 찾기 */
function grabBraceForward(s: string, start: number): { end: number; inner: string } | null {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return { end: i + 1, inner: s.slice(start + 1, i) };
    }
  }
  return null;
}

/**
 * `{분자} over {분모}` / `분자 over 분모` → `\dfrac{..}{..}`
 *   ★ 중첩 브레이스(분자/분모에 `\sqrt{B}`·`x^{2}` 등)도 균형 파싱으로 처리.
 *     기존 정규식 `\{([^{}]*)\}` 은 중첩을 못 잡아 `\over` 폴백 → 인라인 textstyle(작게) 사고.
 *   ★ `\dfrac` 사용 — 인라인에서도 분수를 display 크기로(작게 렌더 해소).
 *   파싱 실패한 `over` 는 그대로 둠 → 이후 BACKSLASH_CMDS 가 `\over` 로 폴백.
 */
function convertOver(s: string): string {
  let guard = 0;
  // 단어 경계 over (overline 등 합성어는 \bover\b 가 매칭 안 됨)
  const overRe = /(?<![\\A-Za-z])over(?![A-Za-z])/;
  while (guard++ < 200) {
    const m = s.match(overRe);
    if (!m || m.index == null) break;
    const idx = m.index;

    // ── 좌측 피연산자 ──
    let li = idx - 1;
    while (li >= 0 && s[li] === ' ') li--;
    let lStart: number, lInner: string;
    if (li >= 0 && s[li] === '}') {
      const g = grabBraceBackward(s, li + 1);
      if (!g) break;
      lStart = g.start; lInner = g.inner;
    } else {
      let j = li;
      while (j >= 0 && /[A-Za-z0-9.]/.test(s[j])) j--;
      lStart = j + 1; lInner = s.slice(lStart, li + 1);
    }

    // ── 우측 피연산자 ──
    let ri = idx + 4; // 'over'.length
    while (ri < s.length && s[ri] === ' ') ri++;
    let rEnd: number, rInner: string;
    if (s[ri] === '{') {
      const g = grabBraceForward(s, ri);
      if (!g) break;
      rEnd = g.end; rInner = g.inner;
    } else {
      let j = ri;
      while (j < s.length && /[A-Za-z0-9.]/.test(s[j])) j++;
      rEnd = j; rInner = s.slice(ri, j);
    }

    // 양쪽 모두 비면(피연산자 없음) 무한루프 방지 — 폴백에 맡김
    if (lStart >= idx || rEnd <= idx + 4 || (!lInner.trim() && !rInner.trim())) break;

    s = s.slice(0, lStart) + `\\dfrac{${lInner.trim()}}{${rInner.trim()}}` + s.slice(rEnd);
  }
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

  // 1.5) ASCII 연산자 → LaTeX (한글수식이 ±, ≤ 등을 `+-`, `<=` 리터럴로 내보냄)
  //   ★ `+-`/`-+` 를 안 바꾸면 KaTeX 가 "+−" 두 글자로 노출(해운대중 #3·#4 실사고).
  s = s
    .replace(/\+-/g, '\\pm ')
    .replace(/-\+/g, '\\mp ')
    .replace(/<=/g, '\\leq ')
    .replace(/>=/g, '\\geq ')
    .replace(/!=/g, '\\neq ');

  // 2) 분수 (over) — 백슬래시 붙이기 전에 처리
  s = convertOver(s);

  // 2.5) bar → \overline (선분 표기). KaTeX \bar 는 멀티문자(AB)에 짧은 막대라 선분이 어색.
  //   \overline 은 양 글자 위 전체 막대 — 선분 AB·평균 x̄ 모두 자연스러움.
  s = s.replace(/(?<![\\A-Za-z])bar(?![A-Za-z])/g, '\\overline');

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
