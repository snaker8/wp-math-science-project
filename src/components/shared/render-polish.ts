/**
 * 렌더 직전 다듬기 — 저장된 본문은 건드리지 않고 화면·인쇄에서만 고친다.
 * 카드·인쇄가 함께 쓰는 MixedContentRenderer / MathRenderer 에서 부른다.
 */

/** 한글 수식의 「빈 행렬」 버팀목 — 괄호를 키우려고 넣은 `\begin{matrix} \\ \end{matrix}` */
const STRUT = String.raw`\\begin\{matrix\}\s*(?:\\\\\s*)*\\end\{matrix\}`;

/** 한글 수식 낱말이 LaTeX 로 안 바뀐 채 저장된 것 (옛 변환기. 62문항 실측 2026-11-17) */
const HML_WORDS: Array<[RegExp, string]> = [
  [/EMPTY\s?SET/g, String.raw`\emptyset `],
  [/SMALLINTER/g, String.raw`\cap `],
  [/SMALLUNION/g, String.raw`\cup `],
];

/**
 * ① 빈 행렬 버팀목 제거 — 남겨 두면 `$…\begin{matrix}…$` 가 디스플레이 승격 규칙에 걸려 `$` 짝이 어긋나고
 *    뒤 수식이 글자로 샌다 (센텀여고 25-1-2-F 공통수학2 #8 「단, -\dfrac{21}{20} < k …」).
 * ② 안이 빈 `\left( \right.` → `(`  (버팀목을 빼면 키울 것이 없다)
 * ③ 수식 안 EMPTYSET·SMALLINTER·SMALLUNION → LaTeX (신도고 #8 보기 「= EMPTYSET」)
 */
export function cleanHmlLeftovers(text: string): string {
  if (!text) return text;
  let r = text;
  if (r.includes('matrix')) {
    // 버팀목만 든 수식은 통째로
    r = r.replace(new RegExp(String.raw`(?<!\$)\$\s*` + STRUT + String.raw`\s*\$(?!\$)`, 'g'), '');
    r = r.replace(new RegExp(STRUT, 'g'), '');
    r = r.replace(/\\left\s*(\\?[({\[|])\s*\\right\s*\./g, '$1');
    r = r.replace(/\\left\s*\.\s*\\right\s*(\\?[)}\]|])/g, '$1');
  }
  if (/EMPTY\s?SET|SMALLINTER|SMALLUNION/.test(r)) {
    r = r.replace(/\$[^$]+\$/g, (m) => HML_WORDS.reduce((s, [re, to]) => s.replace(re, to), m));
  }
  return r;
}

/**
 * 긴 인라인 수식 끝의 짧은 우변(「… = 0」)이 혼자 다음 줄로 떨어지지 않게 한다.
 * KaTeX 는 관계 기호 뒤에서 줄을 바꿀 수 있어, 좁은 인쇄 단에서 「…+9} =」/「0」 으로 갈렸다 (센텀여고 #14).
 * `=` 뒤에 \nobreak 를 넣으면 그 앞의 연산 기호(×, + 등)에서 대신 끊긴다.
 */
export function keepShortRhs(latex: string): string {
  if (latex.length < 30 || latex.includes('\\begin')) return latex;
  return latex.replace(
    /(=|\\neq|\\leq?|\\geq?|<|>)\s*(-?\s*[0-9A-Za-z]{1,3})\s*$/,
    (_m, rel: string, rhs: string) => `${rel}\\nobreak ${rhs}`,
  );
}

/**
 * 빠른 정답 칸에서 긴 한 줄 수식(집합 `\{-6,-5,-2,3,6,7\}`)이 옆 칸으로 넘치지 않게,
 * 쉼표 뒤에서 줄을 바꿀 수 있게 한다. 분수·행렬·근호가 든 수식은 건드리지 않는다.
 */
export function allowBreakAtCommas(text: string): string {
  return text.replace(/\$[^$]+\$/g, (m) => {
    if (/\\begin|\\d?frac|\\sqrt/.test(m)) return m;
    const s = m.replace(/\\left\s*(?=\\?[({\[|.])/g, '').replace(/\\right\s*(?=\\?[)}\]|.])/g, '');
    let depth = 0;
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '\\') { out += ch + (s[i + 1] ?? ''); i++; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      out += ch;
      if (ch === ',' && depth === 0) out += '\\allowbreak ';
    }
    return out;
  });
}
