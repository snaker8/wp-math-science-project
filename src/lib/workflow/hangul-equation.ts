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
  'left', 'right', 'sqrt', 'frac', 'over',
  // 연산/관계
  'times', 'div', 'pm', 'mp', 'cdot', 'ast', 'star',
  'leq', 'geq', 'neq', 'ne', 'le', 'ge', 'equiv', 'approx', 'sim', 'propto',
  'subset', 'supset', 'subseteq', 'supseteq', 'in', 'notin', 'cup', 'cap',
  // 집합·합성 (2026-09-02 추가 — 사대부고 실사고). 미변환 시 화면에 글자로 샌다:
  //   EMPTYSET → "EMPTY SET" · CIRC → "f CIRC f". 실측 emptyset 321건·circ 679건.
  //   ★ 뒤 경계 (?![A-Za-z]) 라 circle/emptysets 같은 낱말은 안 건드린다.
  //   ★ bigcirc(○)는 circ(∘)보다 먼저 와야 한다 — BACKSLASH_CMDS 는 순서대로 돌기 때문.
  'bigcirc', 'emptyset', 'circ',
  // 큰 연산자/극한. ★ 'inf' 제외 — 한글수식 inf = ∞ 기호(1.6b 에서 \infty 로).
  //   \inf(infimum)로 붙이면 화면에 "inf" 글자 노출 (고교 수학에 infimum 없음).
  'sum', 'prod', 'int', 'lim', 'sup', 'max', 'min',
  // 함수·연산자
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'exp',
  'det', 'dim', 'ker', 'gcd', // 행렬·대수 연산자 (고급대수). ★ deg/arg 제외 — DEG(도°) 오변환 방지
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

/** depth-0(중첩 {} 밖)에서만 구분자로 분리. sep='#'(행) 또는 '&'(열, 연속 && 도 1개로). */
function splitTopLevel(s: string, sep: '#' | '&'): string[] {
  const out: string[] = [];
  let depth = 0, last = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{') depth++;
    else if (ch === '}') { if (depth > 0) depth--; }
    else if (depth === 0) {
      if (sep === '#' && ch === '#') { out.push(s.slice(last, i)); last = i + 1; }
      else if (sep === '&' && ch === '&') {
        let j = i; while (j < s.length && s[j] === '&') j++; // 연속 & 묶음
        out.push(s.slice(last, i)); last = j; i = j - 1;
      }
    }
  }
  out.push(s.slice(last));
  return out;
}

// 행렬 열/행 구분 플레이스홀더 — 후속 단계(`&`→공백 등)에 지워지지 않게 보호. 마지막에 복원.
const MAT_COL = '';
const MAT_ROW = '';

/**
 * `pile/rpile/lpile/cpile/matrix{ a && b # c && d }` → `\begin{matrix} a & b \\ c & d \end{matrix}`.
 *   HWP 행렬: `&&`(또는 `&`)=열 구분, `#`=행 구분. 보통 `\left( … \right)` 안에 옴(괄호는 원문 유지).
 *   ★ 반드시 `&`→공백 치환·백틱 제거 전에 호출(원본 `&&` 가 살아있어야 열 분리 가능).
 *   ★ 열/행 구분은 플레이스홀더로 출력 → 셀 내용(cos/theta/over 등)은 이후 단계가 정상 변환,
 *     열 `&` 는 후속 `&`→공백 치환에 안 지워짐. 중첩 pile 은 guard 루프로 안쪽까지 처리.
 */
function convertMatrix(s: string): string {
  let guard = 0;
  const re = /(?<![\\A-Za-z])(?:[rlcd]?pile|matrix)\s*\{/i;
  while (guard++ < 100) {
    const m = s.match(re);
    if (!m || m.index == null) break;
    const braceStart = s.indexOf('{', m.index);
    const g = grabBraceForward(s, braceStart);
    if (!g) break; // 닫는 brace 누락(원문 결함) — 무한루프 방지로 중단(해당 pile 은 원문 유지)
    const rows = splitTopLevel(g.inner, '#').map((r) =>
      splitTopLevel(r, '&').map((c) => c.trim()).join(MAT_COL)
    );
    const body = rows.map((r) => r.trim()).join(MAT_ROW);
    s = s.slice(0, m.index) + `\\begin{matrix}${body}\\end{matrix}` + s.slice(g.end);
  }
  return s;
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
 * `cases{ 행1 # 행2 # … }` (연립방정식) → `\begin{cases} 행1 \\ 행2 \end{cases}`.
 *   ★ 중2 연립방정식 다수. `#`=행 구분. 중첩 브레이스(분수 등) 균형 파싱. 대소문자 무시.
 *   미변환 시 KaTeX 가 `cases{...}` 를 에러로 띄움(거제여중 #2·#6 실사고).
 */
function convertCases(s: string): string {
  let guard = 0;
  const re = /(?<![\\A-Za-z])cases\s*\{/i;
  while (guard++ < 50) {
    const m = s.match(re);
    if (!m || m.index == null) break;
    const braceStart = s.indexOf('{', m.index);
    const g = grabBraceForward(s, braceStart);
    let inner: string;
    let endPos: number;
    if (g) {
      inner = g.inner; endPos = g.end;
    } else {
      // 닫는 brace 누락(원문 결함) — `#` 가 있으면 cases 확신 → 남은 부분 끝까지 best-effort.
      const tail = s.slice(braceStart + 1);
      if (!tail.includes('#')) break;
      inner = tail.replace(/[}\s]+$/, ''); endPos = s.length;
    }
    const rows = inner.split('#').map((r) => r.trim()).filter(Boolean);
    const body = rows.length ? rows.join(' \\\\ ') : inner.trim();
    s = s.slice(0, m.index) + `\\begin{cases}${body}\\end{cases}` + s.slice(endPos);
  }
  return s;
}

/**
 * `root {n} of {x}` → `\sqrt[n]{x}` (n제곱근), `root {x}` (of 없음) → `\sqrt{x}` (제곱근).
 *   ★ HWP 는 근호를 root/of 로 표기. KaTeX 엔 \root/\of 가 없어 그대로 두면 미정의 명령 에러.
 *   피연산자는 `{…}`(중첩 균형) 또는 bare 토큰(영숫자/.-) 둘 다 처리. over(분수) 변환 뒤 호출.
 */
function convertRoot(s: string): string {
  let guard = 0;
  const re = /(?<![\\A-Za-z])root(?![A-Za-z])/;
  const grab = (str: string, from: number): { end: number; inner: string } => {
    let i = from;
    while (i < str.length && str[i] === ' ') i++;
    if (str[i] === '{') { const g = grabBraceForward(str, i); if (g) return { end: g.end, inner: g.inner }; }
    let j = i; while (j < str.length && /[A-Za-z0-9.\-]/.test(str[j])) j++;
    return { end: j, inner: str.slice(i, j) };
  };
  while (guard++ < 100) {
    const m = s.match(re);
    if (!m || m.index == null) break;
    const idx = m.index;
    const a = grab(s, idx + 4); // root 의 지수(또는 제곱근 피연산자)
    if (a.end <= idx + 4) { // 피연산자 없음 — 무한루프 방지
      s = s.slice(0, idx) + '\\sqrt' + s.slice(idx + 4);
      continue;
    }
    let oi = a.end; while (oi < s.length && s[oi] === ' ') oi++;
    const hasOf = /^of(?![A-Za-z])/.test(s.slice(oi));
    if (hasOf) {
      const b = grab(s, oi + 2);
      s = s.slice(0, idx) + `\\sqrt[${a.inner.trim()}]{${b.inner.trim()}}` + s.slice(b.end);
    } else {
      s = s.slice(0, idx) + `\\sqrt{${a.inner.trim()}}` + s.slice(a.end);
    }
  }
  return s;
}

// 그리스 문자는 대소문자가 다른 명령(\pi vs \Pi) — 정확 매칭 필요. 나머지는 대소문자 무시.
const GREEK_EXACT = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta',
  'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi',
  'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
]);

/**
 * 한글 수식 SCRIPT → LaTeX (달러 기호 없이 본문만)
 */
export function hangulEquationToLatex(script: string): string {
  if (!script) return '';
  let s = script;

  // 0z) 잘린 HWP 수식 끝의 `{{:` 아티팩트 제거 — `{x}{{:` 처럼 cases/piecewise 머리만 남고
  //   본문이 비어 truncated 된 원문결함. 그대로면 KaTeX 불균형 에러. 앞부분({x})은 정상 렌더.
  s = s.replace(/\{\s*\{\s*:[\s\S]*$/, '').trim();

  // 0a) 스타일토큰(it/rm/bold/roman)이 명령에 바로 붙은 경우(itpile·itright·rmsqrt 등) 제거.
  //   DROP_TOKENS 의 (?![A-Za-z]) 가드는 뒤가 글자면 안 잡으므로 명령어 앞일 때 따로 처리.
  //   (bar 는 rmbar 전용 처리(2.45)가 있어 제외)
  s = s.replace(/(?<![\\A-Za-z])(?:it|rm|bold|roman)(?=(?:right|left|[rlcd]?pile|matrix|cases|sqrt|root|of|over)(?![A-Za-z]))/gi, ' ');

  // 0) 행렬 (rpile/pile/matrix) → \begin{matrix} (★ `&`→공백 치환 전에! 원본 `&&` 열구분 필요)
  //   열/행 구분은 플레이스홀더(MAT_COL/MAT_ROW)로 보호 → 이후 단계가 안 지움. 끝에서 복원.
  s = convertMatrix(s);

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

  // 1.6) 화살표 별칭 (HWP: rarrow→→, larrow→←, Rarrow→⇒…). 대소문자로 →/⇒ 구분(대문자=이중선).
  //   백슬래시 보정(4) 전에 처리 → 이후 \rightarrow 는 재매칭 안 됨.
  s = s
    .replace(/(?<![\\A-Za-z])Rarrow(?![A-Za-z])/g, '\\Rightarrow ')
    .replace(/(?<![\\A-Za-z])Larrow(?![A-Za-z])/g, '\\Leftarrow ')
    .replace(/(?<![\\A-Za-z])lrarrow(?![A-Za-z])/gi, '\\leftrightarrow ')
    .replace(/(?<![\\A-Za-z])rarrow(?![A-Za-z])/g, '\\rightarrow ')
    .replace(/(?<![\\A-Za-z])larrow(?![A-Za-z])/g, '\\leftarrow ');

  // 1.6b) HWP 기호 토큰 — DEG=도(°), THEREFORE=∴, BECAUSE=∵. (DEG 는 대문자만 = 도 기호;
  //   소문자 deg/연산자는 안 건드림. therefore/because 는 해설 본문에 흔해 대소문자 무시.)
  s = s
    .replace(/(?<![\\A-Za-z])DEG(?![A-Za-z])/g, '^{\\circ}')
    .replace(/(?<![\\A-Za-z])therefore(?![A-Za-z])/gi, '\\therefore ')
    .replace(/(?<![\\A-Za-z])because(?![A-Za-z])/gi, '\\because ')
    // 한글수식 inf = 무한대 ∞ (BACKSLASH_CMDS 에 넣으면 \inf=infimum 으로 "inf" 글자 노출.
    //  hwpx export 라운드트립 테스트가 발견. infty 는 lookbehind 로 재매칭 안 됨.)
    .replace(/(?<![\\A-Za-z])inf(?![A-Za-z])/gi, '\\infty ');

  // 1.6c) HWP 전용 집합 기호 + ASCII 화살표 (2026-09-02, 사대부고 실사고)
  //   한글 수식은 ∩·∪ 를 SMALLINTER/SMALLUNION 으로 내보낸다. LaTeX 에 없는 이름이라
  //   BACKSLASH_CMDS 로는 못 잡고, 그대로 두면 "A SMALLINTER B" 가 글자로 렌더된다.
  //   (실측 499건. `SMALLDIFFERENCE`(차집합)도 같은 계열.)
  //   ★ NSUBSET / notSUBSET = ⊄ ("부분집합이 아니다"). SUBSET(⊂) 과 뜻이 반대라
  //     먼저 처리한다. 뒤에 대문자 집합명이 붙어 오는 형태도 같이 받는다(`A NSUBSETX`).
  s = s.replace(/(?<![\\A-Za-z])(?:n|not)SUBSET(?=[^A-Za-z]|[A-Z](?![A-Za-z]))/gi, '\\not\\subset ');

  //   ★ 피연산자가 공백 없이 붙어 오는 형태가 흔하다:
  //     `A SMALLINTERC`(집합) · `X SUBSETA` · `Q SMALLUNIONS` · `f CIRCf`(함수, 소문자).
  //     "뒤에 글자가 붙으면 낱말" 규칙만 두면 이게 전부 안 잡힌다(실측 66+19건 잔존).
  //     **한 글자 + 낱말 경계** 일 때만 피연산자로 보고 떼어낸다 —
  //     이래야 CIRCLE(=CIRC+LE, 두 글자)은 안 건드린다. 토큰은 대문자 전용(/i 아님).
  //     ★ BIGCIRC(○)는 합성 ∘ 가 아니다 — 앞 글자 G 때문에 lookbehind 가 막아준다.
  s = s.replace(
    /(?<![\\A-Za-z])(SMALLINTER|SMALLUNION|SMALLDIFFERENCE|EMPTYSET|CIRC|SUBSET|SUPSET|NOTIN)([A-Za-z])(?![A-Za-z])/g,
    (_m, cmd: string, operand: string) => {
      const map: Record<string, string> = {
        SMALLINTER: '\\cap', SMALLUNION: '\\cup', SMALLDIFFERENCE: '\\setminus',
        EMPTYSET: '\\emptyset', CIRC: '\\circ',
        SUBSET: '\\subset', SUPSET: '\\supset', NOTIN: '\\notin',
      };
      return `${map[cmd]} ${operand}`;
    },
  );

  s = s
    .replace(/(?<![\\A-Za-z])smallinter(?![A-Za-z])/gi, '\\cap ')
    .replace(/(?<![\\A-Za-z])smallunion(?![A-Za-z])/gi, '\\cup ')
    .replace(/(?<![\\A-Za-z])smalldifference(?![A-Za-z])/gi, '\\setminus ')
    // 함수 정의역 표기 `f : X -> X`. 순서 주의 — `<->` 를 `->` 보다 먼저 본다.
    .replace(/<->/g, '\\leftrightarrow ')
    .replace(/->/g, '\\to ')
    .replace(/(?<![<-])<-(?!>)/g, '\\leftarrow ');

  // 1.7) 연립방정식 cases → \begin{cases} (over/명령 처리 전에)
  s = convertCases(s);

  // 2) 분수 (over) — 백슬래시 붙이기 전에 처리
  s = convertOver(s);

  // 2.1) n제곱근 root/of → \sqrt[n]{x} (BACKSLASH_CMDS 전에! \root/\of 는 KaTeX 미지원)
  s = convertRoot(s);

  // 2.45) rmbar(=rm+bar 붙은 형태) → \overline. bar 정규식은 "앞 글자 없음" 요구라 rmbar 를
  //   못 잡아 화면에 "rmbar" 글자로 노출되던 사고(전 코퍼스 다수). 선분 인자 있으면 묶어줌.
  s = s.replace(/(?<![\\A-Za-z])rmbar\s+([A-Za-z][A-Za-z0-9]*)/gi, '\\overline{$1}'); // rmbar PQ → \overline{PQ}
  s = s.replace(/(?<![\\A-Za-z])rmbar(?![A-Za-z])/gi, '\\overline');                  // 나머지 rmbar{…}
  // 2.46) prime → ' (도함수·각 표기). HWP 가 ' 를 prime 토큰으로 내보냄. 미변환 시 "prime" 글자 노출.
  s = s.replace(/(?<![\\A-Za-z])prime(?![A-Za-z])/gi, "'"); // f prime → f '  (KaTeX 가 ' 를 프라임으로 렌더)

  // 2.5) bar → \overline (선분 표기). KaTeX \bar 는 멀티문자(AB)에 짧은 막대라 선분이 어색.
  //   \overline 은 양 글자 위 전체 막대 — 선분 AB·평균 x̄ 모두 자연스러움. (대소문자 무시)
  s = s.replace(/(?<![\\A-Za-z])bar(?![A-Za-z])/gi, '\\overline');

  // 2.6) box{…} → \boxed{…} (빈칸 채우기 네모칸). 미변환 시 KaTeX 가 "box…" 텍스트로 노출.
  //   (\boxed 의 box 는 뒤가 "ed{" 라 재매칭 안 됨)
  s = s.replace(/(?<![\\A-Za-z])box(?=\s*\{)/gi, '\\boxed');

  // 3) 스타일 토큰 제거 (대소문자 무시 — 일부 파일이 RM/IT 대문자로 내보냄. 청운고 "RM 2km")
  //   ★ 뒤 경계는 (?![A-Za-z]) — `\b` 면 `it_{6}` 처럼 뒤에 `_`(단어문자) 오면 경계 불성립으로
  //     `it` 이 안 지워져 순열·조합 `it_{n}{ {P}}it_{r}` 가 그대로 노출(동인고 #1). _·{·숫자 뒤도 제거.
  for (const t of DROP_TOKENS) {
    s = s.replace(new RegExp(`(?<![\\\\A-Za-z])${t}(?![A-Za-z])`, 'gi'), ' ');
  }

  // 3.5) 베이스 없는 좌측 첨자 → `{}` 보강. 순열·조합 `_{n} P _{r}`(it 제거 후)·식 시작/연산자 뒤
  //   `_`/`^` 는 베이스가 없어 KaTeX 가 어색하게(또는 에러로) 렌더. 앞에 `{}` 를 붙여 정상 첨자로.
  //   진짜 베이스(x_5 의 x) 는 `[([{,+=]`·시작 뒤가 아니므로 안 건드림. (동인고 #1 ₆Pᵣ·ₙCᵣ)
  s = s.replace(/(^|[([{,+=])\s*([_^])/g, '$1{}$2');

  // 4) 명령어 백슬래시 보정. 구조/연산/함수 명령은 대소문자 무시(LEFT/RIGHT/CDOTS 등
  //   대문자로 내보내는 파일 대응 — 거제여중 중2). 그리스 문자만 정확 매칭(\pi≠\Pi).
  for (const cmd of BACKSLASH_CMDS) {
    const flags = GREEK_EXACT.has(cmd) ? 'g' : 'gi';
    s = s.replace(new RegExp(`(?<![\\\\A-Za-z])${cmd}(?![A-Za-z])`, flags), `\\${cmd}`);
  }

  // 4.5) \left { / \right } → \left\{ / \right\} (한글 집합기호 중괄호).
  //   \left 직후의 { 는 그룹이 아니라 구분자 중괄호 → KaTeX 는 \{ 필요. 안 바꾸면
  //   "\left {a_n \right }" 가 KaTeX parse error (청운고 집합표기 left {a_n right }).
  s = s.replace(/\\left\s*\{/g, '\\left\\{').replace(/\\right\s*\}/g, '\\right\\}');

  // 4.6) 집합 조건제시법 중간 막대 — \left\{ ... \left| ... → \middle| (그 \left| 는 짝 없는
  //   구분자라 KaTeX 불균형. \middle 은 \left…\right 안의 중간 구분자용). 절댓값 \left|…\right|
  //   은 \left\{ 안이 아니므로 보존. \right 를 넘어가지 않게 스코프 제한(다른 집합/괄호 침범 방지).
  s = s.replace(/\\left\\\{((?:(?!\\right)[\s\S])*?)\\left\|/g, '\\left\\{$1\\middle|');

  // 4.65) 끝의 짝 없는 \right 제거 — 원문 결함으로 \right 가 \left 보다 많을 때(끝에 `\right .` 만
  //   남는 등). 미제거 시 KaTeX "Expected matching \left" 에러로 수식 통째 빨강(동인고 #15).
  {
    let leftN = (s.match(/\\left(?![A-Za-z])/g) || []).length;
    let rightN = (s.match(/\\right(?![A-Za-z])/g) || []).length;
    let guard = 0;
    while (rightN > leftN && guard++ < 10) {
      const before = s;
      s = s.replace(/\\right\s*(?:\\?[.)\]}|]|\\rangle|\\rbrace)?\s*$/, '').trimEnd();
      if (s === before) break; // 끝이 아니면 중단(섣불리 중간 제거 안 함)
      rightN--;
    }
  }

  // 4.7) 행렬 플레이스홀더 복원 (모든 토큰 변환 끝난 뒤 — 열 `&`·행 `\\` 가 위 단계들에 안 지워짐)
  s = s.split(MAT_COL).join(' & ').split(MAT_ROW).join(' \\\\ ');

  // 5) 공백 정리
  s = s.replace(/[ \t]{2,}/g, ' ').trim();
  return s;
}

/** 본문 삽입용 — 인라인 수식으로 `$...$` 래핑. 빈 문자열이면 빈 문자열 반환. */
export function hangulEquationToInlineLatex(script: string): string {
  const latex = hangulEquationToLatex(script);
  return latex ? `$${latex}$` : '';
}
