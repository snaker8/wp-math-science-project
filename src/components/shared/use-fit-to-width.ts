'use client';

// ============================================================================
// 폭에 맞춰 줄이기 — 인쇄에서 단 밖으로 넘쳐 잘리는 것을 막는다
// ----------------------------------------------------------------------------
// ★ 사고 (2026-09-15, 대표: "인쇄 랜더가 제대로 되는게 제일 시급하다"):
//   긴 수식·넓은 표는 2단 인쇄의 단 폭을 넘는다. 그런데 globals.css 가 가로 스크롤바를
//   **숨기고** 있어서 화면에선 잘린 줄 모르고 **인쇄하면 넘친 부분이 그냥 사라진다**.
//   실측: 140자 넘는 수식 858건(최대 323자), 셀 24개 넘는 표 67건.
//
// ★ transform: scale 이 아니라 **font-size** 로 줄인다.
//   이 프로젝트는 높이를 재서 페이지를 나눈다(측정↔렌더↔인쇄 기하 통일 가드).
//   transform 은 레이아웃 박스를 그대로 두기 때문에 측정값이 실제와 어긋나 페이지가 깨진다.
//
// ★ 어디에 거느냐가 대상마다 다르다 — 헤드리스 크롬 실측으로 하나씩 잡았다:
//   · 수식('host') : `.katex` 에 걸면 globals.css 의 `font-size: 1em !important` 가 눌러버린다.
//                    바깥에 걸어야 `.katex` 의 1em 이 줄어든 값을 따라온다. (385px → 336px)
//   · 표('target') : 표는 `text-sm`(rem 기준)이라 **바깥 크기를 안 따른다.** 표 자신에게
//                    px 로 걸어야 한다. 게다가 셀 여백이 px 고정이라 한 번에 안 들어가
//                    **들어갈 때까지 반복**해야 한다. (417px → 359px → 337px)
//
// ★ 폭은 getBoundingClientRect 로 잰다. `.katex` 는 **인라인** 이라 scrollWidth 가 0 이다
//   (처음엔 scrollWidth 로 짰다가 아무 일도 안 하는 코드를 만들 뻔했다).
// ============================================================================

import { useEffect, type RefObject } from 'react';

interface Options {
  /** 'host' = 바깥 요소의 font-size 를 em 으로 (수식) / 'target' = 대상에 px 로 (표) */
  apply?: 'host' | 'target';
  /** 더는 줄이지 않는 하한. 그보다 작으면 인쇄에서 못 읽는다 */
  minScale?: number;
}

/**
 * host 안의 대상이 부모 폭을 넘으면 글자 크기를 줄여 맞춘다.
 *
 * 하한에서도 넘치면 거기서 멈춘다 — 못 읽게 만드느니 넘치는 게 보이는 편이 낫다
 * (최소한 문제를 알아챈다).
 */
export function useFitToWidth(
  hostRef: RefObject<HTMLElement | null>,
  selector: string | null,
  deps: unknown[],
  { apply = 'host', minScale = 0.55 }: Options = {},
) {
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const fit = () => {
      const target = selector ? host.querySelector<HTMLElement>(selector) : host;
      if (!target) return;
      // 다시 재기 전 초기화
      host.style.fontSize = '';
      target.style.fontSize = '';

      const avail = host.parentElement?.clientWidth || host.clientWidth;
      if (!avail) return;
      if (target.getBoundingClientRect().width <= avail + 1) return;   // 들어간다

      if (apply === 'host') {
        const need = target.getBoundingClientRect().width;
        host.style.fontSize = `${Math.max(minScale, avail / need).toFixed(3)}em`;
        return;
      }

      // target(px) — 여백·테두리가 px 고정이라 한 번에 안 들어간다. 몇 번 더 조인다.
      const base = parseFloat(getComputedStyle(target).fontSize) || 13;
      let cur = base;
      for (let pass = 0; pass < 5; pass++) {
        const w = target.getBoundingClientRect().width;
        if (w <= avail + 1) break;
        const next = Math.max(base * minScale, cur * (avail / w));
        if (next >= cur - 0.05) break;        // 더 줄여도 소용없다
        cur = next;
        target.style.fontSize = `${cur.toFixed(2)}px`;
      }
    };

    fit();
    // 전용 글꼴(KaTeX)이 늦게 붙으면 폭이 바뀐다 — 준비된 뒤 한 번 더
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) fonts.ready.then(fit).catch(() => {});
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
