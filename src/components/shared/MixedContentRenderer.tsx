'use client';

import React from 'react';
import { MathRenderer } from './MathRenderer';

interface MixedContentRendererProps {
  content: string;
  className?: string;
  /** 수식 클릭 시 호출 — (원본 LaTeX, display 여부) */
  onMathClick?: (latex: string, isDisplay: boolean) => void;
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
export function MixedContentRenderer({ content, className, onMathClick }: MixedContentRendererProps) {
  if (!content) return <span className={className}>(문제 내용 없음)</span>;

  // 전처리: Mathpix 특유 포맷 정규화
  const normalized = preprocessMathpixContent(content);

  // "수식:" 섹션 분리 (보조 수식 블록)
  const mathSectionIndex = normalized.indexOf('\n\n수식:\n');
  const bodyText = mathSectionIndex >= 0 ? normalized.substring(0, mathSectionIndex) : normalized;

  // 조건 박스 추출: (가)...(나)... 또는 <보기>... 블록을 분리
  const { mainContent, conditionBoxes } = extractConditionBoxes(bodyText);

  const elements = parseMixedContent(mainContent);

  // 수식 클릭 가능 스타일
  const mathClickStyle = onMathClick ? 'cursor-pointer hover:bg-blue-100/20 rounded px-0.5 transition-colors' : '';

  const renderElement = (el: ContentElement, i: number) => {
    if (el.type === 'text') {
      return <TextSegment key={i} text={el.value} />;
    }
    if (el.type === 'display-math') {
      return (
        <span
          key={i}
          className={`block ${mathClickStyle}`}
          data-math-click="true"
          onClick={onMathClick ? (e) => { e.stopPropagation(); onMathClick(el.value, true); } : undefined}
          title={onMathClick ? '클릭하여 수식 편집' : undefined}
        >
          <MathRenderer content={el.value} block className="my-2" />
        </span>
      );
    }
    if (el.type === 'image') {
      return (
        <span key={i} className="block my-3">
          <img
            src={el.value}
            alt={el.alt || '문제 이미지'}
            className="max-w-full h-auto rounded-lg border border-gray-200 shadow-sm"
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
        <span key={i} className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-gray-100 text-gray-600 text-[11px] font-medium">
          {el.value}
        </span>
      );
    }
    if (el.type === 'table') {
      const vLines = el.verticalLines || [];
      // ★ 조립제법 감지: 세로줄이 1개 (보통 col 1)이고 hline이 있는 표
      const isSyntheticDiv = vLines.length === 1 && el.hasHlines.some(h => h);

      if (isSyntheticDiv) {
        // ═══ 조립제법 전용 렌더링 ═══
        // L자형: 첫 열 오른쪽에 전체 높이 세로줄 + 마지막 행 위에 가로줄
        const vLineCol = vLines[0]; // 세로줄 위치 (보통 1)
        return (
          <span key={i} className="block my-3">
            <div className="inline-flex mx-auto" style={{ display: 'flex', justifyContent: 'center' }}>
              {/* 왼쪽 영역 (나누는 수 k) */}
              <div className="flex flex-col">
                {el.rows.map((row, ri) => {
                  const hlineAbove = el.hasHlines[ri];
                  return (
                    <div
                      key={ri}
                      className={`px-3 py-1 text-center text-sm ${hlineAbove ? 'border-t-2 border-gray-600' : ''}`}
                    >
                      {row.slice(0, vLineCol).map((cell, ci) => {
                        const trimmed = cell.trim();
                        if (!trimmed) return <span key={ci} className="text-gray-300">□</span>;
                        return /[\\^_{}$]/.test(trimmed) ? (
                          <MathRenderer key={ci} content={trimmed.replace(/^\$+|\$+$/g, '').trim()} />
                        ) : (
                          <span key={ci}>{trimmed}</span>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              {/* 세로줄 */}
              <div className="border-l-2 border-gray-600" />
              {/* 오른쪽 영역 (계수들) */}
              <div className="flex flex-col">
                {el.rows.map((row, ri) => {
                  const hlineAbove = el.hasHlines[ri];
                  return (
                    <div
                      key={ri}
                      className={`flex ${hlineAbove ? 'border-t-2 border-gray-600' : ''}`}
                    >
                      {row.slice(vLineCol).map((cell, ci) => {
                        const trimmed = cell.trim();
                        return (
                          <div key={ci} className="px-3 py-1 text-center text-sm min-w-[2.5rem]">
                            {trimmed ? (
                              /[\\^_{}$]/.test(trimmed) ? (
                                <MathRenderer content={trimmed.replace(/^\$+|\$+$/g, '').trim()} />
                              ) : (
                                <span>{trimmed}</span>
                              )
                            ) : (
                              <span className="text-gray-300">□</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </span>
        );
      }

      // ═══ 일반 표 렌더링 ═══
      return (
        <span key={i} className="block my-3">
          <table className="border-collapse mx-auto text-sm">
            <tbody>
              {el.rows.map((row, ri) => (
                <tr
                  key={ri}
                  className={el.hasHlines[ri] ? 'border-t-2 border-gray-500' : ''}
                >
                  {row.map((cell, ci) => {
                    // 세로줄: verticalLines에 해당 열 인덱스가 있으면 왼쪽에 border
                    const hasLeftBorder = vLines.includes(ci);
                    const bottomBorder = ri === el.rows.length - 1 && el.hasHlines[ri] ? 'border-b-2 border-b-gray-500' : '';
                    const leftBorder = hasLeftBorder ? 'border-l-2 border-l-gray-500' : '';
                    return (
                      <td
                        key={ci}
                        className={`px-3 py-1.5 text-center ${bottomBorder} ${leftBorder}`}
                      >
                        {cell.trim() ? (
                          /[\\^_{}$]/.test(cell) ? (
                            <MathRenderer content={cell.replace(/^\$+|\$+$/g, '').trim()} />
                          ) : (
                            <span>{cell.trim()}</span>
                          )
                        ) : (
                          <span className="text-gray-300">□</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </span>
      );
    }
    // inline-math
    return (
      <span
        key={i}
        className={`inline ${mathClickStyle}`}
        data-math-click="true"
        onClick={onMathClick ? (e) => { e.stopPropagation(); onMathClick(el.value, false); } : undefined}
        title={onMathClick ? '클릭하여 수식 편집' : undefined}
      >
        <MathRenderer content={el.value} className="mx-0.5" />
      </span>
    );
  };

  return (
    <div className={className}>
      {elements.map((el, i) => {
        // 조건 박스 placeholder 감지: __CONDITION_BOX_N__ 패턴
        if (el.type === 'text') {
          const boxMatch = el.value.match(/^__CONDITION_BOX_(\d+)__$/);
          if (boxMatch) {
            const boxIdx = parseInt(boxMatch[1], 10);
            const boxContent = conditionBoxes[boxIdx];
            if (boxContent) {
              return (
                <div key={`cbox-${boxIdx}`} className="my-3 px-4 py-3 rounded-lg border border-gray-300 bg-gray-50/50">
                  {parseMixedContent(boxContent).map((bel, bei) => renderElement(bel, 1000 + boxIdx * 100 + bei))}
                </div>
              );
            }
          }
        }
        return renderElement(el, i);
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
  | { type: 'tag'; value: string }
  | { type: 'table'; rows: string[][]; hasHlines: boolean[]; verticalLines?: number[] };

/**
 * 조건 박스 추출: (가)...(나)... 또는 <보기>... 블록을 본문에서 분리
 * 시험지에서 조건이 사각형 테두리 박스 안에 들어가는 형식을 구현
 */
function extractConditionBoxes(text: string): { mainContent: string; conditionBoxes: string[] } {
  const lines = text.split('\n');
  const conditionBoxes: string[] = [];
  const mainLines: string[] = [];

  // (가)/(나)/(다) 또는 <보기> 블록 감지
  let inConditionBlock = false;
  let conditionLines: string[] = [];
  let boxIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // 조건 시작: (가), (나), (다), <보기>, ㄱ., ㄴ., ㄷ.
    const isConditionStart = /^\s*[\(（]\s*[가나다라마]\s*[\)）]/.test(trimmed) ||
                             /^\s*<\s*보기\s*>/.test(trimmed) ||
                             /^\s*[ㄱㄴㄷㄹ]\s*[.)]/.test(trimmed);

    if (isConditionStart && !inConditionBlock) {
      inConditionBlock = true;
      conditionLines = [lines[i]];
      continue;
    }

    if (inConditionBlock) {
      // 조건 계속: (나), (다), ㄴ., ㄷ. 등이 나오거나 이전 조건에 이어지는 줄
      const isContinuation = /^\s*[\(（]\s*[나다라마]\s*[\)）]/.test(trimmed) ||
                             /^\s*[ㄴㄷㄹ]\s*[.)]/.test(trimmed);

      if (isContinuation || (trimmed && !isEndOfConditionBlock(trimmed, lines, i))) {
        conditionLines.push(lines[i]);
        continue;
      } else {
        // 조건 블록 종료 → placeholder를 본문에 삽입
        if (conditionLines.length > 0) {
          conditionBoxes.push(conditionLines.join('\n'));
          mainLines.push(`__CONDITION_BOX_${boxIndex}__`);
          boxIndex++;
        }
        inConditionBlock = false;
        conditionLines = [];
        // 현재 줄은 본문에 추가
        mainLines.push(lines[i]);
        continue;
      }
    }

    mainLines.push(lines[i]);
  }

  // 마지막 조건 블록 처리
  if (inConditionBlock && conditionLines.length > 0) {
    conditionBoxes.push(conditionLines.join('\n'));
    mainLines.push(`__CONDITION_BOX_${boxIndex}__`);
  }

  return { mainContent: mainLines.join('\n'), conditionBoxes };
}

/** 조건 블록이 끝나는지 판단 */
function isEndOfConditionBlock(trimmed: string, lines: string[], currentIdx: number): boolean {
  // 문제 지시어("구하시오", "구하여라" 등)가 나오면 조건 블록 종료
  if (/구하시오|구하여라|구해라|값은\?|값을\s*구/.test(trimmed)) return true;
  // 선택지 시작 (1) 2) ① 등
  if (/^\s*[\(（]\s*[1-5]\s*[\)）]/.test(trimmed)) return true;
  if (/^\s*[①②③④⑤]/.test(trimmed)) return true;
  // 빈 줄 후 비조건 내용이 오면 종료
  if (!trimmed && currentIdx + 1 < lines.length) {
    const nextTrimmed = lines[currentIdx + 1].trim();
    if (nextTrimmed && !/^\s*[\(（]\s*[가나다라마]\s*[\)）]/.test(nextTrimmed) &&
        !/^\s*[ㄱㄴㄷㄹ]\s*[.)]/.test(nextTrimmed)) {
      return true;
    }
  }
  return false;
}

/**
 * Mathpix Markdown 전처리
 * - \(...\) → $...$
 * - \[...\] → $$...$$
 * - \begin{aligned}...\end{aligned} → $$\begin{aligned}...\end{aligned}$$
 * - \textbf{...} bare → **...**
 */
function preprocessMathpixContent(text: string): string {
  let result = text;

  // 0. Mathpix # 접두사 → \ 변환 (모든 #LaTeX 명령어)
  // #begin, #end, #hline, #sqrt, #frac, #bar, #text 등 모두 처리
  result = result.replace(/#begin\{/g, '\\begin{');
  result = result.replace(/#end\{/g, '\\end{');
  result = result.replace(/#hline\b/g, '\\hline');
  // ## → \\ (행 구분자) — 먼저 처리
  result = result.replace(/##/g, '\\\\');
  // 나머지 # + LaTeX 명령어 → \ + 명령어
  // 예: #sqrt → \sqrt, #frac → \frac, #bar → \bar, #text → \text 등
  result = result.replace(/#([a-zA-Z]+)/g, '\\$1');

  // 1. \(...\) → $...$ (인라인 수식, Mathpix 스타일) — 's' 플래그로 멀티라인 허용
  result = result.replace(/\\\((.+?)\\\)/gs, (_, inner) => `$${inner.trim()}$`);

  // 1b. 불완전한 \( 변환: \( 는 있지만 \)가 없는 경우 → $ 처리
  //     예: "\( -x^{2}-2 x-8" (선택지 분리 시 잘림) → "$ -x^{2}-2 x-8$"
  result = result.replace(/\\\(([^$\n]+?)$/gm, (_, inner) => `$${inner.trim()}$`);
  // 1c. 반대: \)만 있고 시작 \(가 없는 경우 → 앞부분을 $로 감싸기
  result = result.replace(/^([^$\n]+?)\\\)/gm, (_, inner) => `$${inner.trim()}$`);

  // 2. \[...\] → $$...$$ (디스플레이 수식, Mathpix 스타일)
  result = result.replace(/\\\[(.+?)\\\]/gs, (_, inner) => `$$${inner.trim()}$$`);

  // 2b. 고립된 $ 기호 정리: "$\begin{array}" 같이 $ + \begin이 붙은 경우
  // → $를 제거하고 step 3에서 $$로 감싸기
  result = result.replace(/\$\\begin\{/g, '\\begin{');
  result = result.replace(/\\end\{([^}]+)\}\s*\$/g, '\\end{$1}');

  // 3. \begin{...}...\end{...} 블록이 $$ 안에 없으면 $$로 감싸기
  // ★ 주의: array/tabular 환경은 HTML 표로 렌더링하므로 $$로 감싸지 않음
  result = result.replace(
    /(?<!\$)\\begin\{(aligned|align|gather|cases|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|equation|equation\*)\}([\s\S]*?)\\end\{\1\}(?!\$)/g,
    (match, envName) => {
      // array 환경 중 & 셀 구분이 있으면 표(tabular)로 처리 → $$로 감싸지 않음
      if (envName === 'array' && /&/.test(match)) {
        return match; // parseMixedContent에서 tabular placeholder로 처리됨
      }
      return `$$${match}$$`;
    }
  );

  // 4. bare \textbf{...} (수식 바깥) → **...**
  // 주의: $...$ 내부의 \textbf는 건드리지 않음 (wrapBareLatex에서 처리)
  result = result.replace(/(?<!\$)\\textbf\{([^}]*)\}(?!\$)/g, '**$1**');

  // 5. 전체가 LaTeX인 줄 감지: 줄 전체가 수식 표현인 경우 $...$로 감싸기
  // 예: "\frac{1}{2} + \frac{3}{4}" 전체 줄
  result = result.replace(/^(\\[a-zA-Z]+[\s\S]*?)$/gm, (line) => {
    // 이미 $로 감싸져 있으면 스킵
    if (line.trim().startsWith('$')) return line;
    // tabular/array 블록 관련 줄은 스킵 (HTML 표로 별도 처리)
    if (/\\(begin|end)\{(?:tabular|array)\}|\\hline|&/.test(line)) return line;
    // LaTeX 명령어가 있고, 한글이 없는 줄이면 수식으로 감싸기
    if (/\\[a-zA-Z]+/.test(line) && !/[가-힣]/.test(line)) {
      return `$${line.trim()}$`;
    }
    return line;
  });

  return result;
}

/**
 * bare LaTeX 명령어(\frac, \sqrt 등)가 $...$로 감싸져 있지 않으면 자동으로 감싸기
 * 예: "곱은 \frac{105}{4}이다" → "곱은 $\frac{105}{4}$이다"
 *
 * 전략: 텍스트를 문자 단위로 스캔하여 \ 로 시작하는 LaTeX 명령어를 찾고,
 * 중괄호/첨자/수식 기호를 포함한 전체 수식 범위를 파악하여 $...$로 감싼다.
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

/** LaTeX 명령어 목록 — \command 형태 인식용 */
const LATEX_COMMANDS = new Set([
  // 분수/루트
  'frac', 'dfrac', 'tfrac', 'sqrt', 'root',
  // 적분/합/극한
  'sum', 'int', 'iint', 'iiint', 'oint', 'lim', 'prod', 'coprod',
  // 삼각함수/로그
  'log', 'ln', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  // 그리스 문자
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon',
  'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa',
  'lambda', 'mu', 'nu', 'xi', 'pi', 'varpi',
  'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon',
  'phi', 'varphi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi',
  'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
  // 기호
  'infty', 'cdot', 'cdots', 'ldots', 'ddots', 'vdots',
  'times', 'div', 'pm', 'mp', 'ast', 'star', 'circ', 'bullet',
  'leq', 'geq', 'neq', 'approx', 'equiv', 'sim', 'simeq', 'cong',
  'propto', 'perp', 'parallel', 'angle',
  'subset', 'supset', 'subseteq', 'supseteq', 'cup', 'cap',
  'in', 'notin', 'ni', 'forall', 'exists', 'nexists',
  'nabla', 'partial', 'prime',
  'rightarrow', 'leftarrow', 'Rightarrow', 'Leftarrow',
  'leftrightarrow', 'Leftrightarrow', 'uparrow', 'downarrow',
  'to', 'gets', 'mapsto', 'implies', 'iff',
  // 괄호/구분자
  'left', 'right', 'big', 'Big', 'bigg', 'Bigg',
  'langle', 'rangle', 'lfloor', 'rfloor', 'lceil', 'rceil',
  'lvert', 'rvert', 'lVert', 'rVert',
  // 장식
  'overline', 'underline', 'hat', 'vec', 'bar', 'dot', 'ddot', 'tilde',
  'widehat', 'widetilde', 'overbrace', 'underbrace',
  'overrightarrow', 'overleftarrow',
  // 글꼴/스타일
  'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt', 'mathcal', 'mathbb', 'mathfrak',
  'boldsymbol', 'text', 'textbf', 'textit', 'textrm',
  'displaystyle', 'textstyle', 'scriptstyle',
  // 박스/공간
  'boxed', 'phantom', 'hspace', 'vspace', 'quad', 'qquad',
  'not', 'neg', 'cancel', 'bcancel', 'xcancel',
  // 기타
  'stackrel', 'overset', 'underset', 'choose', 'binom',
]);

/**
 * 텍스트 세그먼트(수식 밖)에서 bare LaTeX를 찾아 $...$로 감싼다.
 * 문자 단위 스캐닝으로 중괄호 depth를 추적하여 정확한 범위를 잡는다.
 */
function wrapBareLatexInSegment(segment: string): string {
  const result: string[] = [];
  let i = 0;
  const len = segment.length;

  while (i < len) {
    // \ 로 시작하는 LaTeX 명령어 감지
    if (segment[i] === '\\') {
      // 명령어 이름 추출
      let cmdEnd = i + 1;
      while (cmdEnd < len && /[a-zA-Z]/.test(segment[cmdEnd])) cmdEnd++;
      const cmd = segment.substring(i + 1, cmdEnd);

      if (cmd && LATEX_COMMANDS.has(cmd)) {
        // LaTeX 수식 범위를 확장하여 전체 수식을 캡처
        const mathStart = i;
        let pos = cmdEnd;
        pos = expandMathExpression(segment, pos);
        const mathExpr = segment.substring(mathStart, pos);
        if (mathExpr.length > 2) {
          result.push('$', mathExpr, '$');
        } else {
          result.push(mathExpr);
        }
        i = pos;
        continue;
      }
    }

    // 일반 문자 — 수식 기호 패턴 감지 (예: x^2, a_n, 2^{10})
    // 영문자/숫자 뒤에 ^나 _가 오면 수식으로 처리
    if (i < len - 1 && /[a-zA-Z0-9)]/.test(segment[i]) && (segment[i + 1] === '^' || segment[i + 1] === '_')) {
      const mathStart = i;
      let pos = i + 1;
      pos = expandMathExpression(segment, pos);
      // 앞의 문자까지 포함
      const mathExpr = segment.substring(mathStart, pos);
      if (mathExpr.length > 1) {
        result.push('$', mathExpr, '$');
        i = pos;
        continue;
      }
    }

    result.push(segment[i]);
    i++;
  }

  // 연속된 $...$를 합치기: $A$$B$ → $A B$ (연속 수식 병합)
  let joined = result.join('');
  joined = joined.replace(/\$\$(?!\$)/g, (match, offset) => {
    // $$ 가 display-math가 아닌지 확인 (연속된 inline-math 종료+시작)
    // 앞뒤 문맥을 봐서 display math가 아닌 경우 공백으로 병합
    const before = joined[offset - 1];
    const after = joined[offset + 2];
    if (before && before !== '\n' && after && after !== '\n') {
      return ' ';
    }
    return match;
  });

  return joined;
}

/**
 * 주어진 위치에서 수식 표현식을 확장한다.
 * 중괄호, 첨자(^, _), 후속 LaTeX 명령어, 수식 기호를 포함하여 최대 범위를 반환.
 */
function expandMathExpression(text: string, pos: number): number {
  const len = text.length;

  while (pos < len) {
    const ch = text[pos];

    // 중괄호 블록 {…}
    if (ch === '{') {
      pos = skipBraces(text, pos);
      continue;
    }

    // 첨자 ^ 또는 _
    if (ch === '^' || ch === '_') {
      pos++;
      if (pos < len) {
        if (text[pos] === '{') {
          pos = skipBraces(text, pos);
        } else if (text[pos] === '\\') {
          // \command 뒤의 첨자
          let cmdEnd = pos + 1;
          while (cmdEnd < len && /[a-zA-Z]/.test(text[cmdEnd])) cmdEnd++;
          pos = cmdEnd;
          pos = expandMathExpression(text, pos);
        } else {
          // 단일 문자 (예: ^2, _n)
          pos++;
        }
      }
      continue;
    }

    // 후속 LaTeX 명령어 (\left, \right, \frac 등)
    if (ch === '\\') {
      let cmdEnd = pos + 1;
      while (cmdEnd < len && /[a-zA-Z]/.test(text[cmdEnd])) cmdEnd++;
      const cmd = text.substring(pos + 1, cmdEnd);
      if (cmd && LATEX_COMMANDS.has(cmd)) {
        pos = cmdEnd;
        pos = expandMathExpression(text, pos);
        continue;
      }
      // 특수 이스케이프: \, \; \! \> \: 등 spacing
      if (cmdEnd === pos + 1 && pos + 1 < len) {
        const nextCh = text[pos + 1];
        if (',;!>:| '.includes(nextCh) || nextCh === '(' || nextCh === ')' || nextCh === '[' || nextCh === ']') {
          pos = pos + 2;
          continue;
        }
      }
      break;
    }

    // 수식 연결 문자: +, -, =, <, >, (, ), 쉼표, 공백 등은 수식 내부에서 계속
    if ('+-=<>(),.|!:;'.includes(ch)) {
      pos++;
      continue;
    }

    // 공백 후 수식이 계속되는지 확인
    if (ch === ' ') {
      let lookahead = pos + 1;
      while (lookahead < len && text[lookahead] === ' ') lookahead++;
      if (lookahead < len) {
        const nextCh = text[lookahead];
        // 수식이 이어지는 경우: \command, {, ^, _, 숫자, 수식기호
        if (nextCh === '\\' || nextCh === '{' || nextCh === '^' || nextCh === '_' ||
            /[0-9a-zA-Z+\-=<>(]/.test(nextCh)) {
          // 공백 뒤에 LaTeX 명령어가 있으면 계속
          if (nextCh === '\\') {
            let nc = lookahead + 1;
            while (nc < len && /[a-zA-Z]/.test(text[nc])) nc++;
            const nextCmd = text.substring(lookahead + 1, nc);
            if (nextCmd && LATEX_COMMANDS.has(nextCmd)) {
              pos = lookahead;
              continue;
            }
          }
          // 공백 뒤 수식 기호가 아니라 한글이면 중단
          if (/[가-힣]/.test(text[lookahead])) break;
          // 수식 내 공백 허용
          pos = lookahead;
          continue;
        }
      }
      break;
    }

    // 숫자, 영문자 — 수식 내 변수/상수
    if (/[0-9a-zA-Z]/.test(ch)) {
      pos++;
      continue;
    }

    // 그 외 (한글 등) — 수식 종료
    break;
  }

  return pos;
}

/** 중괄호 블록을 건너뛴다. {…{…}…} 중첩 지원 */
function skipBraces(text: string, pos: number): number {
  if (text[pos] !== '{') return pos;
  let depth = 1;
  pos++;
  while (pos < text.length && depth > 0) {
    if (text[pos] === '{') depth++;
    else if (text[pos] === '}') depth--;
    pos++;
  }
  return pos;
}

/**
 * \begin{tabular}...\end{tabular} 또는 \begin{array}...\end{array} 블록을 파싱하여 table element로 변환
 * 조립제법, 진리표 등 다양한 표 형식을 지원
 */
function parseTabularBlock(block: string): ContentElement {
  // column spec에서 세로줄(|) 위치 추출: {c|cccc} → [1] (1번째 열 뒤에 세로줄)
  const verticalLines: number[] = [];
  const colSpecMatch = block.match(/\\begin\{(?:tabular|array)\}\{([^}]*)\}/i);
  if (colSpecMatch) {
    const spec = colSpecMatch[1];
    let colIdx = 0;
    for (const ch of spec) {
      if (ch === '|') {
        verticalLines.push(colIdx);
      } else if (/[clr]/.test(ch)) {
        colIdx++;
      }
    }
  }

  // \begin{tabular}{...} / \begin{array}{...} 과 \end{tabular} / \end{array} 제거
  let inner = block
    .replace(/\\begin\{(?:tabular|array)\}(?:\{[^}]*\})?\s*/i, '')
    .replace(/\s*\\end\{(?:tabular|array)\}/i, '')
    .trim();

  const rows: string[][] = [];
  const hasHlines: boolean[] = [];

  // \\ 또는 줄바꿈으로 행 분리
  const rawRows = inner.split(/\\\\\s*|\n/).filter(r => r.trim());

  for (const rawRow of rawRows) {
    const trimmed = rawRow.trim();

    // \hline만 있는 줄: 다음 행에 윗선 표시
    if (/^\\hline\s*$/.test(trimmed)) {
      // 다음 행에 hline 플래그
      hasHlines[rows.length] = true;
      continue;
    }

    // \hline이 행 시작에 붙어있는 경우: "\\hline 1 & 1 & -3 & 14"
    let rowContent = trimmed;
    if (rowContent.startsWith('\\hline')) {
      hasHlines[rows.length] = true;
      rowContent = rowContent.replace(/^\\hline\s*/, '');
    }

    if (!rowContent) continue;

    // & 로 셀 분리
    const cells = rowContent.split('&').map(cell => cell.trim());
    rows.push(cells);

    // hline 플래그가 아직 설정 안 되어있으면 false
    if (hasHlines[rows.length - 1] === undefined) {
      hasHlines[rows.length - 1] = false;
    }
  }

  return { type: 'table', rows, hasHlines, verticalLines: verticalLines.length > 0 ? verticalLines : undefined };
}

function parseMixedContent(text: string): ContentElement[] {
  // ★ 디버그: 표 관련 콘텐츠 감지
  if (text.includes('array') || text.includes('tabular') || text.includes('hline')) {
    console.log('[MixedContent] ★ 표 입력 감지:', text.substring(0, 500));
  }

  // 0단계: \begin{tabular}...\end{tabular} 및 \begin{array}...\end{array} 블록을 플레이스홀더로 대체
  // 조립제법, 진리표 등 array 환경도 표로 렌더링
  const tabularBlocks: ContentElement[] = [];
  let textWithPlaceholders = text.replace(
    /\\begin\{(?:tabular|array)\}(?:\{[^}]*\})?[\s\S]*?\\end\{(?:tabular|array)\}/gi,
    (match) => {
      const tableEl = parseTabularBlock(match);
      const idx = tabularBlocks.length;
      tabularBlocks.push(tableEl);
      console.log(`[MixedContent] 표 추출 #${idx}:`, tableEl.type === 'table' ? { rows: tableEl.rows, vLines: tableEl.verticalLines, hlines: tableEl.hasHlines } : tableEl);
      // ★ 줄바꿈으로 감싸서 wrapBareLatex가 _ 를 첨자로 인식하는 것을 방지
      return `\n__TABULAR_${idx}__\n`;
    }
  );

  // 0.5단계: $...$나 $$...$$ 내부에 TABULAR 플레이스홀더가 있으면 분리
  // 예: "$$k __TABULAR_0__$$" → "$$k$$" + "\n__TABULAR_0__\n"
  // 예: "$k __TABULAR_0__$" → "$k$" + "\n__TABULAR_0__\n"
  textWithPlaceholders = textWithPlaceholders.replace(
    /(\$\$|\$)([\s\S]*?)(__TABULAR_\d+__)([\s\S]*?)\1/g,
    (_match, delim, before, placeholder, after) => {
      let result = '';
      const trimBefore = before.trim();
      if (trimBefore) {
        result += `${delim}${trimBefore}${delim}`;
      }
      result += `\n${placeholder}\n`;
      const trimAfter = after.trim();
      if (trimAfter) {
        result += `${delim}${trimAfter}${delim}`;
      }
      return result;
    }
  );

  // 1단계: bare LaTeX를 $...$로 감싸기
  // ★ 플레이스홀더 보호: wrapBareLatex가 __ 를 첨자로 인식하는 것을 방지
  const placeholders: string[] = [];
  textWithPlaceholders = textWithPlaceholders.replace(/__(?:TABULAR|CONDITION_BOX)_\d+__/g, (m) => {
    const idx = placeholders.length;
    placeholders.push(m);
    return `\x00PH${idx}\x00`;
  });
  let preprocessed = wrapBareLatex(textWithPlaceholders);
  // 플레이스홀더 복원
  preprocessed = preprocessed.replace(/\x00PH(\d+)\x00/g, (_, idx) => placeholders[parseInt(idx, 10)]);

  const elements: ContentElement[] = [];

  // 통합 정규식: 이미지 → tabular placeholder → $$display$$ → $inline$ 순서로 매칭
  // $$...$$ 에서 내부에 줄바꿈을 허용 ([\s\S]+? non-greedy)
  const regex = /!\[([^\]]*)\]\(([^)]+)\)|__TABULAR_(\d+)__|__CONDITION_BOX_(\d+)__|\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(preprocessed)) !== null) {
    if (match.index > lastIndex) {
      const before = preprocessed.substring(lastIndex, match.index);
      if (before) elements.push({ type: 'text', value: before });
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      // 이미지: ![alt](url)
      elements.push({ type: 'image', value: match[2], alt: match[1] });
    } else if (match[3] !== undefined) {
      // tabular placeholder: __TABULAR_N__
      const tabIdx = parseInt(match[3], 10);
      if (tabularBlocks[tabIdx]) {
        elements.push(tabularBlocks[tabIdx]);
      }
    } else if (match[4] !== undefined) {
      // condition-box placeholder: __CONDITION_BOX_N__ → 별도 text element로 분리
      elements.push({ type: 'text', value: `__CONDITION_BOX_${match[4]}__` });
    } else if (match[5] !== undefined) {
      // display math: $$...$$
      elements.push({ type: 'display-math', value: match[5].trim() });
    } else if (match[6] !== undefined) {
      // inline math: $...$
      elements.push({ type: 'inline-math', value: match[6] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < preprocessed.length) {
    elements.push({ type: 'text', value: preprocessed.substring(lastIndex) });
  }

  // ★ 후처리: 조립제법 표 직전의 짧은 텍스트/수식을 표의 첫 번째 열에 병합
  // OCR에서 "$k" 같은 텍스트가 표 바깥에 나오는 경우 처리
  // (사이에 공백/줄바꿈 텍스트 요소가 있을 수 있으므로 최대 2칸 뒤까지 탐색)
  for (let ei = 1; ei < elements.length; ei++) {
    const cur = elements[ei];
    if (cur.type !== 'table' || !cur.verticalLines || cur.verticalLines.length !== 1) continue;
    // 조립제법 표인 경우 — 직전 요소 또는 2칸 전 요소에서 짧은 텍스트/수식 탐색
    let mergeIdx = -1;
    let mergeVal = '';
    for (let back = 1; back <= Math.min(2, ei); back++) {
      const candidate = elements[ei - back];
      if (candidate.type === 'text' && candidate.value.trim() === '') continue; // 공백만 있는 텍스트 건너뛰기
      if (candidate.type !== 'inline-math' && candidate.type !== 'text' && candidate.type !== 'display-math') break;
      const val = candidate.value.trim().replace(/^\$+|\$+$/g, '').trim();
      if (val.length > 0 && val.length <= 15) {
        mergeIdx = ei - back;
        mergeVal = val;
      }
      break; // 공백이 아닌 요소를 찾으면 종료
    }
    if (mergeIdx === -1 || !mergeVal) continue;
    // 표의 첫 번째 행, 첫 번째 셀이 비어있거나 공백/□만 있으면 병합
    if (cur.rows.length > 0 && cur.rows[0].length > 0) {
      const firstCell = cur.rows[0][0].replace(/\\square|□|\s+/g, '').trim();
      if (firstCell === '') {
        cur.rows[0][0] = mergeVal;
        // mergeIdx부터 ei-1까지의 요소 제거 (공백 포함)
        elements.splice(mergeIdx, ei - mergeIdx);
        ei = mergeIdx;
      }
    }
  }

  return elements;
}
