'use client';

import React from 'react';
import { MathRenderer } from './MathRenderer';

interface MixedContentRendererProps {
  content: string;
  className?: string;
}

/**
 * 텍스트 + $LaTeX$ + 이미지 혼합 콘텐츠를 파싱하여 렌더링
 * Mathpix Markdown 포맷 지원:
 * - $...$ → 인라인 수식
 * - $$...$$ → 디스플레이 수식
 * - \(...\) → 인라인 수식 (Mathpix 스타일)
 * - \[...\] → 디스플레이 수식 (Mathpix 스타일)
 * - ![alt](url) → 이미지 렌더링
 * - **bold** → 볼드 텍스트
 * - \textbf{...} → 볼드 텍스트
 * - \begin{...}...\end{...} → 디스플레이 수식 블록
 * - <보기>, (가), (나) 등 → 구조적 텍스트 처리
 */
export function MixedContentRenderer({ content, className }: MixedContentRendererProps) {
  if (!content) return <span className={className}>(문제 내용 없음)</span>;

  // 전처리: Mathpix 특유 포맷 정규화
  const normalized = preprocessMathpixContent(content);

  // "수식:" 섹션 분리 (보조 수식 블록)
  const mathSectionIndex = normalized.indexOf('\n\n수식:\n');
  const bodyText = mathSectionIndex >= 0 ? normalized.substring(0, mathSectionIndex) : normalized;

  const elements = parseMixedContent(bodyText);

  return (
    <div className={className}>
      {elements.map((el, i) => {
        if (el.type === 'text') {
          return <TextSegment key={i} text={el.value} />;
        }
        if (el.type === 'display-math') {
          return <MathRenderer key={i} content={el.value} block className="my-2" />;
        }
        if (el.type === 'image') {
          return (
            <span key={i} className="block my-3">
              <img
                src={el.value}
                alt={el.alt || '문제 이미지'}
                className="max-w-full h-auto rounded-lg border border-zinc-600/30 shadow-sm"
                style={{ maxHeight: '400px' }}
                loading="lazy"
              />
            </span>
          );
        }
        if (el.type === 'bold') {
          return <strong key={i} className="font-bold">{el.value}</strong>;
        }
        if (el.type === 'tag') {
          return (
            <span key={i} className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-zinc-700/50 text-zinc-300 text-[11px] font-medium">
              {el.value}
            </span>
          );
        }
        // inline-math
        return <MathRenderer key={i} content={el.value} className="mx-0.5" />;
      })}
    </div>
  );
}

/**
 * 텍스트 세그먼트: 줄바꿈 + 마크다운 볼드(**bold**) + 한글 스타일링
 */
function TextSegment({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <React.Fragment>
      {lines.map((line, j) => (
        <React.Fragment key={j}>
          {j > 0 && <br />}
          {renderInlineFormatting(line)}
        </React.Fragment>
      ))}
    </React.Fragment>
  );
}

/**
 * 인라인 포맷팅: **bold**, __(보기)__ 등
 */
function renderInlineFormatting(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // **bold** 패턴
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.substring(lastIdx, match.index));
    }
    parts.push(<strong key={`b${match.index}`} className="font-bold">{match[1]}</strong>);
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    parts.push(text.substring(lastIdx));
  }

  return parts.length > 0 ? parts : [text];
}

type ContentElement =
  | { type: 'text'; value: string }
  | { type: 'inline-math'; value: string }
  | { type: 'display-math'; value: string }
  | { type: 'image'; value: string; alt?: string }
  | { type: 'bold'; value: string }
  | { type: 'tag'; value: string };

/**
 * Mathpix Markdown 전처리
 * - \(...\) → $...$
 * - \[...\] → $$...$$
 * - \begin{aligned}...\end{aligned} → $$\begin{aligned}...\end{aligned}$$
 * - \textbf{...} bare → **...**
 */
function preprocessMathpixContent(text: string): string {
  let result = text;

  // 1. \(...\) → $...$ (인라인 수식, Mathpix 스타일)
  result = result.replace(/\\\((.+?)\\\)/g, (_, inner) => `$${inner}$`);

  // 2. \[...\] → $$...$$ (디스플레이 수식, Mathpix 스타일)
  result = result.replace(/\\\[(.+?)\\\]/gs, (_, inner) => `$$${inner}$$`);

  // 3. \begin{...}...\end{...} 블록이 $$ 안에 없으면 $$로 감싸기
  result = result.replace(
    /(?<!\$)\\begin\{(aligned|align|gather|cases|array|matrix|pmatrix|bmatrix|equation)\}([\s\S]*?)\\end\{\1\}(?!\$)/g,
    (match) => `$$${match}$$`
  );

  // 4. bare \textbf{...} (수식 바깥) → **...**
  // 주의: $...$ 내부의 \textbf는 건드리지 않음 (wrapBareLatex에서 처리)
  result = result.replace(/(?<!\$)\\textbf\{([^}]*)\}(?!\$)/g, '**$1**');

  return result;
}

/**
 * bare LaTeX 명령어(\frac, \sqrt 등)가 $...$로 감싸져 있지 않으면 자동으로 감싸기
 * 예: "곱은 \frac{105}{4}이다" → "곱은 $\frac{105}{4}$이다"
 */
function wrapBareLatex(text: string): string {
  // 이미 $...$로 감싸진 부분은 보존하면서, bare LaTeX만 처리
  const parts: string[] = [];
  const mathRegex = /\$\$[\s\S]+?\$\$|\$[^$\n]+\$/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = mathRegex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      parts.push(wrapBareLatexInSegment(text.substring(lastIdx, m.index)));
    }
    parts.push(m[0]);
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    parts.push(wrapBareLatexInSegment(text.substring(lastIdx)));
  }

  return parts.join('');
}

function wrapBareLatexInSegment(segment: string): string {
  return segment.replace(
    /\\(?:frac|sqrt|sum|int|lim|prod|log|ln|sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|nu|pi|sigma|omega|phi|psi|infty|cdot|cdots|ldots|times|div|pm|mp|leq|geq|neq|approx|equiv|subset|supset|cup|cap|in|notin|forall|exists|nabla|partial|left|right|overline|underline|hat|vec|bar|dot|ddot|tilde|mathrm|mathbf|boldsymbol|displaystyle|boxed)(?:\{[^}]*\}|[_^](?:\{[^}]*\}|\w)|\s*)*/g,
    (match) => {
      if (match.length <= 2) return match;
      return `$${match}$`;
    }
  );
}

function parseMixedContent(text: string): ContentElement[] {
  // 1단계: bare LaTeX를 $...$로 감싸기
  const preprocessed = wrapBareLatex(text);

  const elements: ContentElement[] = [];

  // 통합 정규식: 이미지 → $$display$$ → $inline$ 순서로 매칭
  // $$...$$ 에서 내부에 줄바꿈을 허용 ([\s\S]+? non-greedy)
  const regex = /!\[([^\]]*)\]\(([^)]+)\)|\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(preprocessed)) !== null) {
    if (match.index > lastIndex) {
      const before = preprocessed.substring(lastIndex, match.index);
      if (before) elements.push({ type: 'text', value: before });
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      elements.push({ type: 'image', value: match[2], alt: match[1] });
    } else if (match[3] !== undefined) {
      elements.push({ type: 'display-math', value: match[3].trim() });
    } else if (match[4] !== undefined) {
      elements.push({ type: 'inline-math', value: match[4] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < preprocessed.length) {
    elements.push({ type: 'text', value: preprocessed.substring(lastIndex) });
  }

  return elements;
}
