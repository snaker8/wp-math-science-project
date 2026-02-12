'use client';

import React from 'react';
import { MathRenderer } from './MathRenderer';

interface MixedContentRendererProps {
  content: string;
  className?: string;
}

/**
 * 텍스트 + $LaTeX$ + 이미지 혼합 콘텐츠를 파싱하여 렌더링
 * - $...$ → 인라인 수식
 * - $$...$$ → 디스플레이 수식
 * - ![alt](url) → 이미지 렌더링
 * - \n\n수식:\n 이후 부분은 디스플레이 수식으로 처리
 */
export function MixedContentRenderer({ content, className }: MixedContentRendererProps) {
  if (!content) return <span className={className}>(문제 내용 없음)</span>;

  // "수식:" 섹션 분리
  const mathSectionIndex = content.indexOf('\n\n수식:\n');
  const bodyText = mathSectionIndex >= 0 ? content.substring(0, mathSectionIndex) : content;

  const elements = parseMixedContent(bodyText);

  return (
    <div className={className}>
      {elements.map((el, i) => {
        if (el.type === 'text') {
          // 줄바꿈 처리
          const lines = el.value.split('\n');
          return (
            <React.Fragment key={i}>
              {lines.map((line, j) => (
                <React.Fragment key={j}>
                  {j > 0 && <br />}
                  {line}
                </React.Fragment>
              ))}
            </React.Fragment>
          );
        }
        if (el.type === 'display-math') {
          return <MathRenderer key={i} content={el.value} block className="my-2" />;
        }
        if (el.type === 'image') {
          return (
            <span key={i} className="inline-block my-2">
              <img
                src={el.value}
                alt={el.alt || '문제 이미지'}
                className="max-w-full h-auto rounded border border-gray-200"
                style={{ maxHeight: '300px' }}
                loading="lazy"
              />
            </span>
          );
        }
        // inline-math
        return <MathRenderer key={i} content={el.value} className="mx-0.5" />;
      })}
    </div>
  );
}

type ContentElement =
  | { type: 'text'; value: string }
  | { type: 'inline-math'; value: string }
  | { type: 'display-math'; value: string }
  | { type: 'image'; value: string; alt?: string };

/**
 * bare LaTeX 명령어(\frac, \sqrt 등)가 $...$로 감싸져 있지 않으면 자동으로 감싸기
 * 예: "곱은 \frac{105}{4}이다" → "곱은 $\frac{105}{4}$이다"
 */
function wrapBareLatex(text: string): string {
  // 이미 $...$로 감싸진 부분은 보존하면서, bare LaTeX만 처리
  // 전략: $...$와 $$...$$ 구간을 먼저 식별하고, 나머지 텍스트에서만 bare LaTeX를 감싸기
  const parts: string[] = [];
  const mathRegex = /\$\$[^$]+\$\$|\$[^$\n]+\$/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = mathRegex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      // 수식 바깥 텍스트 → bare LaTeX 처리
      parts.push(wrapBareLatexInSegment(text.substring(lastIdx, m.index)));
    }
    parts.push(m[0]); // 수식 부분 그대로
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    parts.push(wrapBareLatexInSegment(text.substring(lastIdx)));
  }

  return parts.join('');
}

function wrapBareLatexInSegment(segment: string): string {
  // bare LaTeX 패턴: \frac{...}{...}, \sqrt{...}, \sum, \int, \lim, \alpha, \beta 등
  // LaTeX 명령어가 포함된 연속 구간을 찾아 $...$로 감싸기
  // 패턴: \로 시작하는 명령어 + 뒤따르는 {}, ^, _ 등
  return segment.replace(
    /\\(?:frac|sqrt|sum|int|lim|prod|log|ln|sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|nu|pi|sigma|omega|phi|psi|infty|cdot|cdots|ldots|times|div|pm|mp|leq|geq|neq|approx|equiv|subset|supset|cup|cap|in|notin|forall|exists|nabla|partial|left|right|overline|underline|hat|vec|bar|dot|ddot|tilde|text|textbf|mathrm|mathbf|boldsymbol)(?:\{[^}]*\}|[_^](?:\{[^}]*\}|\w)|\s*)*/g,
    (match) => {
      // 이미 짧은 단일 문자 이스케이프는 무시 (예: \, 자체)
      if (match.length <= 2) return match;
      return `$${match}$`;
    }
  );
}

function parseMixedContent(text: string): ContentElement[] {
  // 1단계: bare LaTeX를 $...$로 감싸기
  const preprocessed = wrapBareLatex(text);

  const elements: ContentElement[] = [];
  // 이미지, $$...$$, $...$ 매칭 (이미지와 display math를 먼저 매칭)
  const regex = /!\[([^\]]*)\]\(([^)]+)\)|\$\$([^$]+)\$\$|\$([^$\n]+)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(preprocessed)) !== null) {
    // 매치 이전 텍스트
    if (match.index > lastIndex) {
      const before = preprocessed.substring(lastIndex, match.index);
      if (before) elements.push({ type: 'text', value: before });
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      // ![alt](url) image
      elements.push({ type: 'image', value: match[2], alt: match[1] });
    } else if (match[3] !== undefined) {
      // $$...$$ display math
      elements.push({ type: 'display-math', value: match[3] });
    } else if (match[4] !== undefined) {
      // $...$ inline math
      elements.push({ type: 'inline-math', value: match[4] });
    }

    lastIndex = match.index + match[0].length;
  }

  // 나머지 텍스트
  if (lastIndex < preprocessed.length) {
    elements.push({ type: 'text', value: preprocessed.substring(lastIndex) });
  }

  return elements;
}
