// ============================================================================
// 연립식(cases) 뒤의 짧은 괄호 덧말을 같은 줄에 붙인다 (2026-11-16 해운대여고 25-1-2-F #16)
//
//   $h(x)= \begin{cases}…\end{cases} \left(k \right.$는 상수$)$
//
// cases 가 든 인라인 수식은 디스플레이($$…$$)로 승격돼 제 줄을 차지한다. 그러면 뒤에 남은
// 「는 상수)」가 다음 줄로 떨어져 「(k」와 갈라진다. 덧말이 짧은 괄호 한 덩이일 때만 수식 안으로 들인다.
//
// 들이는 조건(하나라도 어긋나면 손대지 않는다):
//   - 같은 줄, 40자 이하, 다른 환경(\begin)·그림 마커·$$ 없음, $ 짝수
//   - A) 수식 안에서 연 괄호가 덧말에서 닫힌다  「… (k $는 상수$)$」
//   - B) 덧말 전체가 괄호 한 덩이               「… $ (단, $k$는 상수)」
// ============================================================================

const count = (s: string, ch: string) => s.split(ch).length - 1;

/** 덧말(글+인라인 수식 섞임) → 수식 안에 넣을 TeX */
function remarkToTex(rest: string): string {
  return rest
    .split(/\$([^$]*)\$/)
    .map((seg, i) => (i % 2 === 1 ? seg : seg ? `\\text{${seg.replace(/[{}\\]/g, '')}}` : ''))
    .join('');
}

export function absorbCasesTrailingRemark(text: string): string {
  return text.replace(
    /\$\$([^$]*?\\end\{cases\}[^$]*?)\$\$[ \t]*([^\n]{1,40})(?=\n|$)/g,
    (m, inner: string, restRaw: string) => {
      const rest = restRaw.trimEnd();
      if (!rest || /\\begin|\[도형|\$\$/.test(rest) || count(rest, '$') % 2 !== 0) return m;
      const plainRest = rest.replace(/\$/g, '');
      const unbalanced = count(inner, '(') > count(inner, ')');
      const a = unbalanced && /\)$/.test(plainRest) && count(inner + plainRest, '(') === count(inner + plainRest, ')');
      const b = !unbalanced && /^\(.*\)$/.test(plainRest.trim()) && count(plainRest, '(') === 1;
      if (!a && !b) return m;
      // A: 끝의 「\left( k \right.」 는 맨 괄호로 — 닫는 쪽이 맨 「)」 라 크기를 맞춘다
      const body = a ? inner.replace(/\\left\s*\(([^()]*?)\\right\s*\.\s*$/, '($1') : `${inner.trimEnd()} \\quad `;
      return `$$${body}${remarkToTex(a ? rest : rest.trim())}$$`;
    },
  );
}
