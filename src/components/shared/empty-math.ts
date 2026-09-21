// 빈 수식 `$ $` / `$$ $$` 제거 — 단, 진짜 "여는 기호"에서 시작할 때만.
//
// ★ 사고 (2026-09-21, 양운고 25-2-1-M #20, 채팅형 고급분석으로 고쳐도 계속 빨간 원문)
//   `…\end{cases}$$⏎⏎$g(x)$를 …` 에서 옛 규칙 `/\$\s+\$/` 가 **`$$` 의 두 번째 `$` + 줄바꿈 두 개 + 다음 문단의
//   여는 `$`** 를 "빈 인라인 수식"으로 보고 지웠다. 디스플레이 블록의 닫는 기호가 사라져 그 뒤 본문
//   `g(x)$를 $(x-2)^{2}$` 까지 한 수식으로 묶이고, KaTeX 가 `$` 를 수식 안에서 만나 통째로 실패했다.
//   `$$ $$` 규칙도 같은 꼴(`A$$⏎⏎$$B` 의 닫는·여는 기호를 지움)이라 함께 고친다.
//
// 규칙: 여는 `$` 앞의 `$` 개수(`$$` 는 뺀 뒤)가 짝수이고, `$$` 의 일부가 아니며, 인라인은 같은 줄 공백만.
//   디스플레이는 앞의 `$$` 개수가 짝수일 때만(= 진짜 여는 `$$`).

export function stripEmptyMath(input: string): string {
  const src = input;
  let out = src.replace(/\$([ \t]+)\$/g, (m, _ws, off: number) => {
    if (src[off - 1] === '$' || src[off + m.length] === '$') return m; // $$ 의 일부
    const before = src.slice(0, off).replace(/\$\$/g, '');
    const singles = (before.match(/\$/g) || []).length;
    return singles % 2 === 0 ? '' : m; // 홀수면 이 $ 는 앞 수식의 닫는 기호
  });
  const src2 = out;
  out = src2.replace(/\$\$(\s+)\$\$/g, (m, _ws, off: number) => {
    const doubles = (src2.slice(0, off).match(/\$\$/g) || []).length;
    return doubles % 2 === 0 ? '' : m;
  });
  return out;
}
