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
            const processedContent = block ? stripped : `\\displaystyle ${stripped}`;

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
                const fallbackContent = block ? fallback : `\\displaystyle ${fallback}`;
                return katex.renderToString(fallbackContent, {
                    throwOnError: false,
                    displayMode: block,
                    strict: false,
                    trust: true,
                });
            } catch {
                console.error('KaTeX rendering error (after fallback):', error);
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
