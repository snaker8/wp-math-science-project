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
            const processedContent = block ? content : `\\displaystyle ${content}`;

            return katex.renderToString(processedContent, {
                throwOnError: false,
                displayMode: block,
                strict: false,
                trust: true,
            });
        } catch (error) {
            console.error('KaTeX rendering error:', error);
            return content;
        }
    }, [content, block]);

    return (
        <span
            className={cn('math-content', block ? 'block my-2' : 'inline-block', className)}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
