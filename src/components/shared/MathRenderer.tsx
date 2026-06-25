'use client';

import React, { useMemo } from 'react';
import katex from 'katex';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface MathRendererProps {
    content: string;
    block?: boolean;
    className?: string;
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

/**
 * 중괄호 균형 복구 — 짝 안 맞는 `}`(짝 없는 닫기) 제거 + 안 닫힌 `{` 만큼 `}` 추가.
 *   ★ 원본 수식 오타(예: `z_{1}}` 닫기 1개 더, 해운대고 #9)로 KaTeX 가 통째로 실패→빨간 raw 되던 것 구제.
 *   `\{`·`\}`(구분자 이스케이프)는 그룹이 아니므로 카운트 제외. 렌더 실패 시 폴백에서만 호출(정상 콘텐츠 무영향).
 */
function balanceBraces(s: string): string {
  let depth = 0, out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const esc = i > 0 && s[i - 1] === '\\';
    if (ch === '{' && !esc) { depth++; out += ch; }
    else if (ch === '}' && !esc) { if (depth > 0) { depth--; out += ch; } /* 짝 없는 } 는 버림 */ }
    else out += ch;
  }
  return out + '}'.repeat(Math.max(0, depth));
}

export function MathRenderer({ content, block = false, className }: MathRendererProps) {
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
            const widened = dfracInCases(stretchArrays(balanceBraces(stripped)));
            const processedContent = block ? widened : `\\displaystyle ${widened}`;

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
                const fallbackContent = block ? fallbackWidened : `\\displaystyle ${fallbackWidened}`;
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
    }, [content, block]);

    return (
        <span
            className={cn('math-content', block ? 'block my-2' : 'inline-block', className)}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
