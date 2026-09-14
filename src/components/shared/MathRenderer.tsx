'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import katex from 'katex';
import { balanceBraces, balanceLeftRight } from './latex-balance';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface MathRendererProps {
    content: string;
    block?: boolean;
    className?: string;
    /**
     * ★ compact (2026-07-23) — 인라인 수식에 붙이는 \displaystyle 을 생략(textstyle 로 렌더).
     *   기본 false(=기존 동작 유지). 조건/보기 박스처럼 인라인 cases 가 여러 개 세로로 쌓이는
     *   곳에서만 true — \displaystyle cases 가 키가 커 항목 사이 간격이 과하게 벌어지던 문제
     *   (여명중 23년 보기 박스). 선형식뿐이라 크기만 줄고 모양은 동일. block 렌더엔 무영향.
     */
    compact?: boolean;
}

// ★ cases/array 안 행에서 분수·거듭제곱근 등 키 큰 수식 감지용 (모듈 스코프)
const TALL_RE = /\\d?frac|\\dfrac|\\tfrac|\\sqrt|\\binom|\\overline|\\underline/;

// ★ #23 (2026-05-30): cases(연립방정식) 안 분수 행 겹침 해결 — cases 만 대상(행렬 불변).
//   KaTeX 는 cases 안 \frac 를 textstyle(작게) 로 렌더 → 이전엔 globals.css 의
//   `.katex .mtable .mfrac{font-size:1.4em}` CSS 로 키웠지만, CSS 확대는 행을 절대위치
//   (vlist)로 깔아 분모·분자가 겹쳤음(dev 렌더로 실증). \frac→\dfrac 로 바꾸면 KaTeX 가
//   display 분수에 맞는 행간을 네이티브로 계산 → 겹침 0 + 분수 크게.
//   ⚠ 2026-05-26 `\\[2pt]` 행간 주입 사고(inline 행렬식 렌더 깨짐)와 다름 — dfrac 은 표준
//   명령이라 inline/block 모두 throwOnError 통과(검증 완료).
//   ★ 범위 = cases 환경 안에서만. 행렬(pmatrix 등)·array·smallmatrix·첨자/단독 분수는
//     미변환(보존). "행렬은 문제 없으니 건드리지 말 것" 사용자 지시 반영.
//   globals.css 는 `.math-content .katex .mtable .col-align-l .mfrac{font-size:1em}` 로
//   cases(왼쪽정렬=col-align-l) 확대만 무력화 → 행렬(col-align-c)은 1.4em 그대로 무손상.
const CASES_ENV_RE = /\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g;
function dfracInCases(s: string): string {
    return s.replace(CASES_ENV_RE, (_full, inner: string) =>
        `\\begin{cases}${inner.replace(/\\frac(?![a-zA-Z])/g, '\\dfrac')}\\end{cases}`);
}


export function MathRenderer({ content, block = false, className, compact = false }: MathRendererProps) {
    const html = useMemo(() => {
        try {
            // 인라인 수식에서 분수(\frac), 합(\sum) 등이 축소되지 않도록
            // \displaystyle 을 자동 적용 (한국 수학 교재 표준)
            // ★ 이미 \displaystyle이 있으면 중복 추가하지 않음
            const stripped = content
                .replace(/^\s*\\displaystyle\s*/, '')
                // ★ KaTeX에서 \square가 기호로 인식 안 되는 문제 → 빈 네모 박스로 변환
                .replace(/\\square/g, '\\boxed{\\phantom{X}}')
                // ★ % 는 KaTeX(TeX) 주석 문자 — 수식 안 `$20%$` 가 `%`부터 주석 처리돼 통째로
                //   사라지던 사고. 이스케이프 안 된 % 를 \% 로(백분율 기호). (2026-06-20 긴급)
                .replace(/(?<!\\)%/g, '\\%')
                .trim();

            // ★ cases / aligned / array 행간 자동 리사이징 — 완전 비활성화 (2026-05-26 fix 2/2):
            //   `\\[2pt]` / `\\[8pt]` 행 spacing 자동 추가도 inline math 의 array 환경에서
            //   KaTeX render fail 만드는 사고 발견 (성취도평가 16번 행렬식).
            //   no-op 으로 변경 — DB 의 원본 LaTeX 그대로 KaTeX 호출.
            //   시각적으로 행간이 약간 좁아지지만 KaTeX 깨짐보다 훨씬 나음.
            const stretchArrays = (s: string): string => s;
            // ★ #23: cases 안 \frac→\dfrac (행 겹침 해결, 위 dfracInCases 주석 참고). 행렬 불변.
            // ★ 중괄호 균형 복구 — KaTeX 는 throwOnError:false 라 짝 안 맞는 } 를 빨간 raw 로 렌더(폴백 안 탐).
            //   메인에서 미리 균형(정상 콘텐츠엔 no-op) → 원본 오타(해운대고 #9 z_{1}}) 도 렌더됨.
            // ★ left, right 짝도 같이 - 짝 없는 left 하나로 본문 전체가 빨간 raw 가
            //   되던 사고(연립방정식 2벌 나란히, 2026-09-02). 짝 맞으면 no-op.
            const widened = dfracInCases(stretchArrays(balanceLeftRight(balanceBraces(stripped))));
            // compact: 인라인이라도 \displaystyle 생략 (박스 안 cases 세로 간격 축소용)
            const processedContent = (block || compact) ? widened : `\\displaystyle ${widened}`;

            return katex.renderToString(processedContent, {
                throwOnError: false,
                displayMode: block,
                strict: false,
                trust: true,
            });
        } catch (error) {
            // ★ KaTeX 렌더링 실패 시 orphan \left/\right 제거 후 재시도
            // OCR에서 piecewise 함수의 \left\{와 \right.가 분리된 경우
            try {
                let fallback = content
                    .replace(/\\left\s*\\?[{([\]|.]/g, (m) => {
                        // \left\{ → \lbrace, \left( → (, \left[ → [
                        if (m.includes('{')) return '\\lbrace';
                        if (m.includes('(')) return '(';
                        if (m.includes('[')) return '[';
                        return '';
                    })
                    .replace(/\\right\s*\\?[})\]|.]/g, (m) => {
                        if (m.includes('}')) return '\\rbrace';
                        if (m.includes(')')) return ')';
                        if (m.includes(']')) return ']';
                        return '';
                    })
                    .replace(/(?<!\\)%/g, '\\%')
                    .replace(/^\s*\\displaystyle\s*/, '').trim();
                fallback = balanceBraces(fallback); // ★ 원본 중괄호 오타 복구 (해운대고 #9)
                if (!fallback) return '';
                // ★ fallback 도 동일 — stretchArrays no-op (행 spacing 자동 추가 X, 2026-05-26)
                //   #23: cases 안 \frac→\dfrac (행 겹침 해결) — 메인 경로와 동일. 행렬 불변.
                const fallbackWidened = dfracInCases(fallback);
                const fallbackContent = (block || compact) ? fallbackWidened : `\\displaystyle ${fallbackWidened}`;
                return katex.renderToString(fallbackContent, {
                    throwOnError: false,
                    displayMode: block,
                    strict: false,
                    trust: true,
                });
            } catch {
                console.error('KaTeX rendering error (after fallback):', error);
                // ★ 에러 자동 로깅
                try {
                  const { logRenderingErrorDedup } = require('@/lib/error-logger');
                  logRenderingErrorDedup({
                    errorType: 'katex',
                    errorDetail: error instanceof Error ? error.message : 'Unknown KaTeX error',
                    rawInput: content.substring(0, 500),
                  });
                } catch { /* ignore */ }
                return content;
            }
        }
    }, [content, block, compact]);

    // ★★ 단 폭을 넘는 수식을 **줄여서 넣는다** (2026-09-15, 대표: "인쇄 렌더가 제일 시급").
    //   KaTeX 는 수식을 줄바꿈하지 않는다(.katex { white-space: nowrap }). 그래서 2단 인쇄처럼
    //   좁은 단에서 긴 수식은 단 밖으로 넘친다. 게다가 globals.css 가 그 가로 스크롤바를
    //   **숨기고** 있어서, 화면에선 잘린 줄 모르고 **인쇄하면 넘친 부분이 그냥 사라진다**.
    //   실측: 본문에 140자 넘는 인라인 수식이 944건(평균 452자). 적지 않다.
    //
    //   ★ transform: scale 이 아니라 **font-size** 로 줄인다.
    //     이 프로젝트는 높이를 재서 페이지를 나눈다(측정↔렌더↔인쇄 기하 통일 가드).
    //     transform 은 레이아웃 박스를 그대로 두기 때문에 측정값이 실제와 어긋나 페이지가 깨진다.
    //     font-size 는 폭과 높이가 같이 줄어 측정이 그대로 맞는다.
    //   ★ 0.55em 이 바닥 — 그보다 작으면 인쇄에서 읽을 수 없다. 거기서도 넘치면 줄이길 멈춘다
    //     (읽을 수 없게 만드느니 넘치는 걸 보이는 편이 낫다 — 최소한 문제를 알아챈다).
    const hostRef = useRef<HTMLSpanElement | null>(null);
    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const fit = () => {
            const k = host.querySelector<HTMLElement>('.katex');
            if (!k) return;
            host.style.fontSize = '';                    // 다시 재기 전 초기화
            const avail = host.parentElement?.clientWidth || host.clientWidth;
            if (!avail) return;
            // ★ .katex 는 **인라인** 요소다 — scrollWidth/clientWidth 가 0 이라 못 쓴다.
            //   (실제로 처음엔 scrollWidth 로 짰다가 헤드리스 측정에서 0 이 나와 잡았다.)
            const need = k.getBoundingClientRect().width;
            if (need <= avail + 1) return;               // 들어간다 — 손대지 않는다
            const ratio = Math.max(0.55, avail / need);
            // ★ .katex 가 아니라 **바깥(host)** 에 건다.
            //   globals.css 의 `.katex { font-size: 1em !important }` 가 .katex 인라인 지정을
            //   눌러버려 아무 일도 안 일어난다(헤드리스 측정으로 확인: 385px 그대로).
            //   host 에 걸면 .katex 의 1em 이 줄어든 값을 기준으로 잡혀 같이 작아진다.
            //   실측 85mm 단 기준: 385px → 336px, 넘침 0.
            host.style.fontSize = `${ratio.toFixed(3)}em`;
        };
        // KaTeX 전용 글꼴이 늦게 붙으면 폭이 바뀐다 — 글꼴 준비 후 한 번 더 잰다
        fit();
        const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
        if (fonts?.ready) fonts.ready.then(fit).catch(() => {});
        window.addEventListener('resize', fit);
        return () => window.removeEventListener('resize', fit);
    }, [html]);

    return (
        <span
            ref={hostRef}
            className={cn('math-content', block ? 'block my-2' : 'inline-block', className)}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
