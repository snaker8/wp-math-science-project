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
                .trim();

            // ★ cases / aligned / array 행간 자동 리사이징 — 완전 비활성화 (2026-05-26 fix 2/2):
            //   `\\[2pt]` / `\\[8pt]` 행 spacing 자동 추가도 inline math 의 array 환경에서
            //   KaTeX render fail 만드는 사고 발견 (성취도평가 16번 행렬식).
            //   no-op 으로 변경 — DB 의 원본 LaTeX 그대로 KaTeX 호출.
            //   시각적으로 행간이 약간 좁아지지만 KaTeX 깨짐보다 훨씬 나음.
            const stretchArrays = (s: string): string => s;
            const widened = stretchArrays(stripped);
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
                    .replace(/^\s*\\displaystyle\s*/, '').trim();
                if (!fallback) return '';
                // ★ fallback 도 동일 — stretchArrays no-op (행 spacing 자동 추가 X, 2026-05-26)
                const fallbackWidened = fallback;
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
