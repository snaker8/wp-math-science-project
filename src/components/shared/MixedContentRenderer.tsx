'use client';

import React from 'react';
import { MathRenderer } from './MathRenderer';

interface MixedContentRendererProps {
  content: string;
  className?: string;
}

/**
 * 텍스트 + $LaTeX$ 혼합 콘텐츠를 파싱하여 렌더링
 * - $...$ → 인라인 수식
 * - $$...$$ → 디스플레이 수식
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
        // inline-math
        return <MathRenderer key={i} content={el.value} className="mx-0.5" />;
      })}
    </div>
  );
}

type ContentElement =
  | { type: 'text'; value: string }
  | { type: 'inline-math'; value: string }
  | { type: 'display-math'; value: string };

function parseMixedContent(text: string): ContentElement[] {
  const elements: ContentElement[] = [];
  // $$...$$ 또는 $...$ 매칭 ($$를 먼저 매칭)
  const regex = /\$\$([^$]+)\$\$|\$([^$\n]+)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // 매치 이전 텍스트
    if (match.index > lastIndex) {
      const before = text.substring(lastIndex, match.index);
      if (before) elements.push({ type: 'text', value: before });
    }

    if (match[1] !== undefined) {
      // $$...$$ display math
      elements.push({ type: 'display-math', value: match[1] });
    } else if (match[2] !== undefined) {
      // $...$ inline math
      elements.push({ type: 'inline-math', value: match[2] });
    }

    lastIndex = match.index + match[0].length;
  }

  // 나머지 텍스트
  if (lastIndex < text.length) {
    elements.push({ type: 'text', value: text.substring(lastIndex) });
  }

  return elements;
}
