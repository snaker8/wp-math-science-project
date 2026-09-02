'use client';

import React, { memo, useMemo } from 'react';
import katex from 'katex';
import { stripDollarsInsideMathEnv } from './math-env-dollar';
import { wrapBareLatex } from './wrap-bare-latex';
import { stripDollarBeforeEnv, stripDollarAfterEnv } from './env-dollar-cleanup';
import { MathRenderer } from './MathRenderer';
import { convertChoiceTabularBox, extractConditionBoxes, classifyTabularBlock, matchBoxedLabel, splitLabeledBoxItems } from './box-conversion';

// ★ 풀이 박스 전용 KaTeX 직접 렌더 (2026-05-18)
//   MathRenderer 가 \begin{aligned} 발견 시 stretchArrays 로 \\[Npt] 자동 삽입 +
//   \def\arraystretch{1.3} 자동 wrapping → KaTeX 가 nested \boxed{aligned} 에서 fail.
//   풀이 박스는 stretchArrays 거치지 않고 KaTeX 직접 호출로 처리.
function SolutionBoxRender({ body }: { body: string }) {
  const html = useMemo(() => {
    try {
      const cleaned = body
        // \\[Npt] 같은 spacing 옵션 제거 (KaTeX 가 일부 환경에서 못 풂)
        .replace(/\\\\\s*\[[^\]]*\]/g, '\\\\')
        // \displaystyle 잔여 제거 (displayMode 가 자동 처리)
        .replace(/\\displaystyle\s+/g, '')
        // ★ 분수 크기 정상화 (2026-05-18): displayMode 에서 \frac 가
        //   본문 글자 대비 너무 크게 그려져 박스가 어색해 보임. \tfrac (textstyle)
        //   으로 강제해 본문 글자 비례에 맞춤. \dfrac 사용자는 명시 의도이므로 보존.
        .replace(/\\frac(?![a-zA-Z])/g, '\\tfrac')
        // ★ % 는 TeX 주석 문자 — 수식 안 % 가 뒤를 주석 처리. \% 로 이스케이프. (2026-06-20)
        .replace(/(?<!\\)%/g, '\\%');
      return katex.renderToString(
        `\\begin{aligned}${cleaned}\\end{aligned}`,
        {
          displayMode: true,
          throwOnError: false,
          strict: false,
          trust: true,
        }
      );
    } catch {
      return `<pre style="color:#dc2626;font-size:11px">${body}</pre>`;
    }
  }, [body]);
  return <div className="solution-box-content" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ★ 표 셀용 수식 정제 — 짝 안 맞는 $ / \displaystyle 으로 인한 KaTeX 렌더 실패 방지
//   셀 내용은 MathRenderer가 math 모드로 감싸므로 내부 $ 는 불필요하며 오히려 파싱 에러 유발
//   \displaystyle 는 좁은 셀에서 레이아웃 깨짐 — 제거해도 의미 손실 없음
function sanitizeMathCell(raw: string): string {
  return raw
    .replace(/^\$+|\$+$/g, '')       // 시작/끝 $ 제거
    .replace(/\$/g, '')               // 내부 $ 도 제거 (짝 안 맞는 경우 방어)
    .replace(/\\displaystyle\s*/g, '') // \displaystyle 제거
    .trim();
}

interface MixedContentRendererProps {
  content: string;
  className?: string;
  /** 수식 클릭 시 호출 — (원본 LaTeX, display 여부) */
  onMathClick?: (latex: string, isDisplay: boolean) => void;
  /** true면 wrapper를 <span style={{display:'contents'}}>로 렌더 — 뱃지 같은 인라인 요소 뒤에 올 때 줄바꿈 방지 */
  inline?: boolean;
  /**
   * true 면 (가)/(나)/(다) 또는 <보기> 패턴이 있어도 조건 박스로 그리지 않음.
   * 선택지 본문이 "(가)는 음이온이다" 처럼 한글 라벨로 시작할 때
   * 분석 페이지가 자동 박스 처리하는 사고 방지.
   * 기본값 false (수학 라인 영향 0).
   */
  disableConditionBox?: boolean;
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
function MixedContentRendererInner({ content, className, onMathClick, inline, disableConditionBox }: MixedContentRendererProps) {
  if (!content) return <span className={className}>(문제 내용 없음)</span>;
  // ★★ 풀이 박스 추출 (preprocess 이전 — 2026-05-18 회귀 #4 최종 해결)
  //   PR #191/#193 의 추출은 preprocessMathpixContent 호출 *후* 라 그 사이
  //   line 730~ 의 "전체 LaTeX 줄 → $...$ 감싸기" 가 \boxed{\begin{aligned} 단독 줄을
  //   $\boxed{\begin{aligned}$ 로 잘못 wrap → MathRenderer inline → \displaystyle prefix
  //   → KaTeX fail → raw 텍스트. 해결: 풀이 박스를 raw content 에서 가장 먼저 추출.
  const solutionBoxes: string[] = [];
  let rawWithMarkers = content;
  // 패턴 1: \boxed{\begin{aligned}...\end{aligned}} — 줄바꿈 + 한글/text 가드
  rawWithMarkers = rawWithMarkers.replace(
    /\\boxed\s*\{\s*(?:\\,\s*)?(?:\\def\\arraystretch\s*\{[^}]+\}\s*)?\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}\s*(?:\\,\s*)?\}/gi,
    (m, body) => {
      const hasLineBreak = /\\\\/.test(body);
      const hasKoreanOrText = /[가-힣]|\\text/.test(body);
      if (!(hasLineBreak && hasKoreanOrText)) return m;
      const idx = solutionBoxes.length;
      solutionBoxes.push(body.trim());
      return `__SOLUTION_BOX_${idx}__`;
    }
  );
  // 패턴 2: \begin{array}{|l|}\hline ... \end{array} — hline 필수
  rawWithMarkers = rawWithMarkers.replace(
    /\\begin\{array\}\s*\{\|[^}]*\|\}([\s\S]*?)\\end\{array\}/gi,
    (m, body) => {
      if (!/\\hline/.test(body)) return m;
      const idx = solutionBoxes.length;
      const cleaned = body
        .replace(/\\hline\s*/g, '')
        .replace(/\\\\\s*\[[^\]]*\]/g, '\\\\');
      solutionBoxes.push(cleaned.trim());
      return `__SOLUTION_BOX_${idx}__`;
    }
  );
  // 외부 $$ 감싼 케이스 정리
  rawWithMarkers = rawWithMarkers.replace(/\$\$\s*(__SOLUTION_BOX_\d+__)\s*\$\$/g, '$1');

  // ★ OCR 교정 패턴 로깅 제거 — 매 렌더마다 require + console.log 발생해서 성능 저하 주범
  // 문제 발생 시에는 렌더링 자체가 깨져서 바로 확인 가능하므로 로깅 불필요

  // 전처리: Mathpix 특유 포맷 정규화 (마커는 환경 토큰 아니라서 변환에 무영향)
  let normalized = preprocessMathpixContent(rawWithMarkers)
    // ★ $ 밖의 \displaystyle 수식 블록 → $$...$$ 로 감싸기 (KaTeX 렌더링)
    .replace(/(?<!\$)\\displaystyle\s+([\s\S]*?)(?=\n\s*[가-힣①②③④⑤]|\n\s*$|$)/gm, (_m, expr) => `$$${expr.trim()}$$`)
    .replace(/(?<!\$)\\\\displaystyle\s+([\s\S]*?)(?=\n\s*[가-힣①②③④⑤]|\n\s*$|$)/gm, (_m, expr) => `$$${expr.trim()}$$`)
    // ★ 이미 $ 안에 있는 \displaystyle은 단순 제거
    .replace(/\\displaystyle\s*/g, '')
    // ★ ㄱ./ㄴ./ㄷ. 보기가 붙어있으면 줄바꿈 삽입 (조건 박스 파싱용)
    .replace(/([^\n])\s+(ㄱ\s*[.)])/g, '$1\n$2')
    .replace(/([^\n])\s+(ㄴ\s*[.)])/g, '$1\n$2')
    .replace(/([^\n])\s+(ㄷ\s*[.)])/g, '$1\n$2')
    .replace(/([^\n])\s+(ㄹ\s*[.)])/g, '$1\n$2')
    .replace(/([^\n])\s+(ㅁ\s*[.)])/g, '$1\n$2');

  // "수식:" 섹션 분리 (보조 수식 블록)
  const mathSectionIndex = normalized.indexOf('\n\n수식:\n');
  const bodyText = mathSectionIndex >= 0 ? normalized.substring(0, mathSectionIndex) : normalized;

  // ★ 방어망: 짝 안 맞는(orphan) 표 마크업 제거 — 정상(짝 맞는) 표는 안 건드림.
  //   그림 객관식 표가 잘못 잘려 \begin{tabular} 가 열린 채 본문에 남거나 보기에 \end{tabular}·& 잔재가
  //   리터럴로 노출되던 사고(온천중 #10) 의 기존 자산화 데이터를 DB 수정 없이 화면에서 정리.
  const bodyWithoutTrailingChoices = stripTrailingChoiceLines(stripOrphanTabular(bodyText));

  // ★ $\begin{array}...\end{array}$ 에서 보기형이면 $ 래퍼 제거 (KaTeX가 한글 처리 못함)
  // 1) $$...$$로 감싸진 경우
  // 2) $...$ 로 감싸진 경우
  // ★ 캡처 전부 `[^$]*?` — 표가 "진짜 수식 안"(내부에 $ 없음, 중첩 불가)일 때만 매칭.
  //   `[\s\S]*?` 면 다른 $…$ 와 한글을 건너뛰어 본문 중간 standalone 표(셀에 $ 있음) 앞뒤의
  //   별개 $(${C}$ 닫는 $ 와 $40$ 여는 $)를 짝지어 $ 래퍼를 벗겨 ${A}$ 가 깨지던 사고
  //   (거제여중 #18: { {A}} 중괄호 노출 + 공백 붕괴). 셀에 $ 있는 데이터 표는 [^$] 에 안 걸려 보존.
  let bodyForTabular = bodyWithoutTrailingChoices;
  // $$...$$
  bodyForTabular = bodyForTabular.replace(
    /\$\$([^$]*?\\begin\{(?:tabular|array)\}[^$]*?\\end\{(?:tabular|array)\}[^$]*?)\$\$/gi,
    (_m, inner) => {
      if (/[가나다라마]/.test(inner) || /\\text/.test(inner)) {
        return inner;
      }
      return _m;
    }
  );
  // $...$  (단일)
  bodyForTabular = bodyForTabular.replace(
    /\$([^$]*?\\begin\{(?:tabular|array)\}[^$]*?\\end\{(?:tabular|array)\}[^$]*?)\$/gi,
    (_m, inner) => {
      if (/[가나다라마]/.test(inner) || /\\text/.test(inner)) {
        return inner;
      }
      return _m;
    }
  );

  // ★★ 풀이 박스 (Solution Box) 추출 — KaTeX 가 못 푸는 복잡 LaTeX 환경 (2026-05-18)
  //    배경: 사용자 보고 — MathJax 가 정상 렌더하는 풀이 박스 양식이 KaTeX 에서 fail.
  //          \boxed{\begin{aligned}...\end{aligned}} (외부 박스 + 식 정리 + 한글) 또는
  //          \begin{array}{|l|}\hline...\hline\end{array} 같은 풀이 박스.
  //    전략: 외부 박스는 HTML CSS (.solution-box) 로 그리고,
  //          내부는 단순 aligned 만 추출해 KaTeX 가 처리 가능한 form 으로 변환.
  //          \boxed{(\text{가})} 같은 단일 식 placeholder 는 KaTeX 처리 가능 — 그대로 유지.
  // (풀이 박스 추출은 함수 시작 부분에서 raw content 에서 이미 완료 — preprocess 이전)

  // ★ tabular/array 블록 처리
  // 보기형 tabular (ㄱ./ㄴ./ㄷ. 포함)는 조건박스로 변환, 나머지는 보호
  const tabularProtected: string[] = [];
  let protectedBody = bodyForTabular.replace(
    /\\begin\{(?:tabular|array)\}(?:\{[^}]*\})?[\s\S]*?\\end\{(?:tabular|array)\}/gi,
    (m) => {
      // ★ 풀이 박스 감지 (보기형 아님 — 2026-05-18 사고)
      //   사용자 보고: \begin{array}{|l|} ... \boxed{(가)} ... \end{array} 가 보기형으로 오인되어
      //   LaTeX 환경이 해체되며 raw 텍스트로 표시됨.
      //
      //   ★ 회귀 방지 원칙: "정상 단일 컬럼 보기형(\begin{tabular}{l} ㄱ. 식 \\ ...)" 도
      //      변환되어야 함. 따라서 "단일 컬럼" 만으로는 풀이 박스로 판정 X.
      //
      //   풀이 박스 전용 시그니처 3개 중 하나라도 있으면 보호 (일반 tabular 로):
      //     1) colSpec 에 vertical bar `|` 포함 ({|l|}, {l|}, {|c|c|} 등)
      //     2) \hline 포함 (가로 구분선 — 풀이 박스 특유 양식)
      //     3) \begin{aligned} 중첩 (식 정리 풀이)
      //   + boxed 본문은 placeholder 라 라벨 카운트에서 제거
      const { looksLikeSolutionBox, isChoiceTabular } = classifyTabularBlock(m);

      // ★ 풀이 박스 — KaTeX 비호환 토큰 정규화 (2026-05-18 사고)
      //   PR #188 가드로 array 환경은 보호됐지만 KaTeX 가 다음 토큰 못 풀어
      //   raw 텍스트(빨간색 errorColor)로 표시되던 사고:
      //     - verticals `|` 컬럼 spec (KaTeX 미지원)
      //     - `\hline` (array{|l|} 안에서 잘 안 됨)
      //     - `\\[10pt]` 커스텀 spacing (KaTeX 가 spacing 인자 처리 불완전)
      //     - nested aligned (KaTeX 가 환경 중첩 처리 불완전)
      //   → KaTeX 친화 form 으로 변환해서 보호 (의미는 보존, 시각 약간 단순)
      if (looksLikeSolutionBox) {
        const normalized = m
          // verticals 제거: {|l|} → {l}
          .replace(/(\\begin\{(?:tabular|array)\}\s*)\{([^}]*)\}/g, (_outer, prefix, spec) =>
            `${prefix}{${spec.replace(/\|/g, '').trim() || 'l'}}`
          )
          // \hline 제거 (KaTeX 가 비- ruled array 안에서 미지원)
          .replace(/\\hline\s*/g, '')
          // \\[10pt] → \\ (spacing 인자 제거)
          .replace(/\\\\\s*\[[^\]]*\]/g, '\\\\')
          // 잔여 \displaystyle 토큰 (수식 밖에서 의미 없음) 정리
          .replace(/\\displaystyle\s+(?=\\end\{)/g, '');
        const idx = tabularProtected.length;
        tabularProtected.push(normalized);
        return `__TABULAR_PROTECT_${idx}__`;
      }

      if (isChoiceTabular) {
        return convertChoiceTabularBox(m);
      }
      // 일반 tabular: 보호 (조건박스 오인 방지)
      const idx = tabularProtected.length;
      tabularProtected.push(m);
      return `__TABULAR_PROTECT_${idx}__`;
    }
  );

  // 조건 박스 추출: (가)...(나)... 또는 <보기>... 블록을 분리
  // ★ disableConditionBox=true 면 박스 분리 스킵 (선택지 컨텍스트 등) — 본문 그대로 사용
  const { mainContent, conditionBoxes, conditionHeaderLabels } = disableConditionBox
    ? { mainContent: protectedBody, conditionBoxes: [], conditionHeaderLabels: [] }
    : extractConditionBoxes(protectedBody);

  // tabular 블록 복원
  let restoredMainContent = mainContent;
  const restoredConditionBoxes = conditionBoxes.map(box =>
    box.replace(/__TABULAR_PROTECT_(\d+)__/g, (_, idx) => tabularProtected[parseInt(idx, 10)] || '')
  );
  restoredMainContent = restoredMainContent.replace(
    /__TABULAR_PROTECT_(\d+)__/g, (_, idx) => tabularProtected[parseInt(idx, 10)] || ''
  );

  const elements = parseMixedContent(restoredMainContent);

  // 수식 클릭 가능 스타일
  const mathClickStyle = onMathClick ? 'cursor-pointer hover:bg-blue-100/20 rounded px-0.5 transition-colors' : '';

  // compactInlineMath: 조건/보기 박스 안에서 인라인 cases 등을 textstyle 로(=\displaystyle 생략)
  //   렌더해 항목 세로 간격을 좁힌다. 박스 밖(본문)은 false → 기존 동작 유지.
  const renderElement = (el: ContentElement, i: number, compactInlineMath = false) => {
    if (el.type === 'text') {
      return <TextSegment key={i} text={el.value} />;
    }
    if (el.type === 'display-math') {
      // ★ 조건/보기 박스 안 연립방정식(cases) — 디스플레이 블록(가운데 정렬 + my-2 + 자기 줄)이라
      //   ㄱ~ㅁ 항목 사이가 과하게 벌어진다(여명중 23년). 박스(compactInlineMath) 안 cases 는
      //   라벨(ㄱ.) 옆에 붙는 compact 인라인으로 렌더 → 원본처럼 촘촘·좌측정렬. 박스 밖 본문의
      //   단독 cases 는 compactInlineMath=false 라 기존 디스플레이 블록 그대로(무영향).
      if (compactInlineMath && /\\begin\{cases\}/.test(el.value)) {
        return (
          <span
            key={i}
            className={`inline ${mathClickStyle}`}
            data-math-click="true"
            onClick={onMathClick ? (e) => { e.stopPropagation(); onMathClick(el.value, false); } : undefined}
            title={onMathClick ? '클릭하여 수식 편집' : undefined}
          >
            <MathRenderer content={el.value} className="mx-0.5" compact />
          </span>
        );
      }
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
                          <MathRenderer key={ci} content={sanitizeMathCell(trimmed)} />
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
                                <MathRenderer content={sanitizeMathCell(trimmed)} />
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
      // ★ 표가 컨테이너(2단 컬럼 등) 폭을 초과해 다른 컬럼/페이지 영역을 침범하던 사고 방지.
      //   max-w-full + overflow-x:auto 로 가로 스크롤 처리. 인쇄 시엔 보통 폭 안에 들어감.
      return (
        <span key={i} className="block my-3 max-w-full overflow-x-auto">
          <table className="border-collapse mx-auto text-sm" style={{ maxWidth: '100%' }}>
            <tbody>
              {el.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => {
                    // 세로줄: verticalLines에 해당 열 인덱스가 있으면 왼쪽에 border
                    const hasLeftBorder = vLines.includes(ci);
                    // ★ 마지막 열 오른쪽 border: vLines에 열 개수(ci+1)가 있으면
                    const hasRightBorder = ci === row.length - 1 && vLines.includes(ci + 1);
                    // ★ 윗줄: hasHlines[ri]가 true면 이 행 위에 경계선
                    //   (border-collapse 상태에서는 <tr> 경계가 렌더 안 되므로 <td>에 적용)
                    const topBorder = el.hasHlines[ri] ? 'border-t-2 border-t-gray-500' : '';
                    // ★ 마지막 행 밑줄: trailing \hline은 hasHlines[rows.length]에 저장됨
                    const bottomBorder = ri === el.rows.length - 1 && el.hasHlines[el.rows.length] ? 'border-b-2 border-b-gray-500' : '';
                    const leftBorder = hasLeftBorder ? 'border-l-2 border-l-gray-500' : '';
                    const rightBorder = hasRightBorder ? 'border-r-2 border-r-gray-500' : '';
                    return (
                      <td
                        key={ci}
                        className={`px-3 py-1.5 text-center ${topBorder} ${bottomBorder} ${leftBorder} ${rightBorder}`}
                      >
                        {cell.trim() ? (
                          /[\\^_{}$]/.test(cell) ? (
                            <MathRenderer content={sanitizeMathCell(cell)} />
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
    // ★ \boxed{ ㉠ } 빈칸 라벨 박스 — KaTeX 폭 문제로 HTML 박스로 렌더 (위 matchBoxedLabel 주석)
    const boxed = el.type === 'inline-math' ? matchBoxedLabel(el.value) : null;
    if (boxed) {
      return (
        <span
          key={i}
          className="inline-flex items-center justify-center align-middle mx-0.5 px-1.5 py-0.5 min-w-[1.5em] min-h-[1.4em] rounded-[3px] border border-current leading-none"
        >
          {boxed.label}
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
        <MathRenderer
          content={el.value}
          className="mx-0.5"
          // ★ 박스 안이라도 compact 는 cases(중괄호 연립)에만 — 분수 등 다른 인라인 수식은
          //   기존대로 \displaystyle 유지(축소되면 안 됨). 사용자가 지목한 "중괄호 연립" 한정.
          compact={compactInlineMath && /\\begin\{cases\}/.test(el.value)}
        />
      </span>
    );
  };

  const Wrapper: React.ElementType = inline ? 'span' : 'div';
  const wrapperStyle = inline ? { display: 'contents' as const } : undefined;
  return (
    <Wrapper className={className} style={wrapperStyle}>
      {elements.map((el, i) => {
        // ★ 풀이 박스 placeholder 감지: __SOLUTION_BOX_N__ 패턴 (2026-05-18)
        //   외부 박스는 HTML CSS, 내부는 \begin{aligned}...\end{aligned} 만 KaTeX 처리
        if (el.type === 'text') {
          const solMatch = el.value.match(/^__SOLUTION_BOX_(\d+)__$/);
          if (solMatch) {
            const solIdx = parseInt(solMatch[1], 10);
            const solBody = solutionBoxes[solIdx];
            if (solBody !== undefined) {
              // 내부 LaTeX 정규화: \\[Npt] → \\, \displaystyle 제거 (KaTeX 호환)
              const cleanedBody = solBody
                .replace(/\\\\\s*\[[^\]]*\]/g, '\\\\')
                .replace(/\\displaystyle\s+/g, '');
              return (
                <div
                  key={`sbox-${solIdx}`}
                  className="my-3 px-4 py-3 rounded-md border border-gray-500 max-w-full"
                  style={{ overflowWrap: 'anywhere', boxSizing: 'border-box' }}
                >
                  {/* ★ SolutionBoxRender 사용 (2026-05-18 회귀 fix #3):
                       MathRenderer 의 stretchArrays 가 \begin{aligned} 자동 wrapping +
                       \\[Npt] 삽입 → KaTeX nested \boxed{aligned} fail.
                       SolutionBoxRender 는 KaTeX 직접 호출 (전처리 우회) → 정상 렌더. */}
                  <SolutionBoxRender body={cleanedBody} />
                </div>
              );
            }
          }
        }
        // 조건 박스 placeholder 감지: __CONDITION_BOX_N__ 패턴
        if (el.type === 'text') {
          const boxMatch = el.value.match(/^__CONDITION_BOX_(\d+)__$/);
          if (boxMatch) {
            const boxIdx = parseInt(boxMatch[1], 10);
            const boxContent = restoredConditionBoxes[boxIdx];
            const headerLabel = conditionHeaderLabels[boxIdx];
            if (boxContent) {
              return (
                // ★ cases(연립방정식)가 여러 개 든 보기 박스만 줄간격을 좁힌다(leading-snug).
                //   텍스트 조건 박스((가)(나) 문장)는 relaxed 그대로 — 가독성 보존.
                (() => {
                  const hasCases = /\\begin\{cases\}/.test(boxContent);
                  // ★ cases 여러 개 든 보기 박스 → 라벨(ㄱ~ㅁ) 단위로 쪼개 가로 2열 그리드로 배치
                  //   (2026-07-24 사용자 요청: "너무 붙어 있으니 가로 2개 정도로 자연스럽게").
                  //   원본 시험지처럼 촘촘하면서도 세로로 안 길어진다. cases 박스에만 적용 —
                  //   텍스트 조건 박스((가)(나) 문장)는 gridItems=null 로 폴백(회귀 0).
                  const gridItems = hasCases ? splitLabeledBoxItems(boxContent) : null;
                  const base = 1000 + boxIdx * 100;
                  return (
                <div key={`cbox-${boxIdx}`} className={`my-3 px-4 py-3 rounded-md border border-gray-500 max-w-full ${hasCases ? 'leading-snug' : 'leading-relaxed'}`}>
                  {headerLabel && (
                    <div className="text-xs font-bold text-gray-700 mb-1.5 -mt-0.5">&lt;{headerLabel}&gt;</div>
                  )}
                  {gridItems ? (
                    // 가로 2열 — 좁은 화면(모바일 카드)에선 1열로 접힘. 각 셀 = 라벨 + compact 인라인 cases.
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
                      {gridItems.map((item, k) => (
                        <div key={k} className="min-w-0">
                          {parseMixedContent(item).map((bel, bei) => renderElement(bel, base + k * 20 + bei, true))}
                        </div>
                      ))}
                    </div>
                  ) : (
                  <FitToWidth>
                    {/* ★ compact=true — 박스 안 인라인/디스플레이 cases 를 라벨 옆 compact 인라인으로.
                        cases 아닌 수식(분수 등)은 renderElement 에서 compact 제외. 본문 단독 cases 무영향. */}
                    {parseMixedContent(boxContent).map((bel, bei) => renderElement(bel, base + bei, true))}
                  </FitToWidth>
                  )}
                </div>
                  );
                })()
              );
            }
          }
        }
        return renderElement(el, i);
      })}
    </Wrapper>
  );
}

// ★ 메모이제이션 — content 동일하면 리렌더 skip (KaTeX 재파싱 비용 높음)
export const MixedContentRenderer = memo(MixedContentRendererInner, (prev, next) => {
  return (
    prev.content === next.content &&
    prev.className === next.className &&
    prev.onMathClick === next.onMathClick &&
    prev.inline === next.inline &&
    prev.disableConditionBox === next.disableConditionBox
  );
});

// ★ 조건박스 자동 축소 (2026-07-01, 주례여고 #14 c_n 줄 인쇄 우측 잘림 사고) —
//   조건박스 내용(예: $$\left\{\begin{array}…$$ 긴 점화식)이 칼럼 폭을 넘으면 KaTeX 가 줄바꿈을
//   안 해 오른쪽으로 삐져나가고, 인쇄 칼럼 overflow:hidden 이 그걸 잘라냄. 폭이 넘칠 때만
//   transform: scale 로 축소해 박스 안에 담는다. ★ 안 넘으면 scale=1 → 완전 무변화(회귀 0).
//   조건박스 한 곳에서만 사용 — 다른 렌더 경로 불변.
const useIsoLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

function FitToWidth({ children }: { children: React.ReactNode }) {
  const outerRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);
  const [boxH, setBoxH] = React.useState<number | undefined>(undefined);

  useIsoLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      const avail = outer.clientWidth;
      // transform 은 scrollWidth/Height 에 영향 없음 → 항상 자연 크기로 측정.
      const w = inner.scrollWidth;
      const h = inner.scrollHeight;
      if (!avail || !w) return;
      const s = w > avail ? Math.max(0.4, avail / w) : 1;
      setScale(s);
      setBoxH(s < 1 ? Math.ceil(h * s) : undefined);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    // KaTeX 웹폰트 로딩 후 폭이 바뀌므로 재측정 (인쇄 전 안정화).
    const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (fonts?.ready) fonts.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [children]);

  return (
    <div ref={outerRef} style={{ width: '100%', height: boxH, overflow: scale < 1 ? 'hidden' : undefined }}>
      <div
        ref={innerRef}
        style={{
          transformOrigin: 'top left',
          transform: scale < 1 ? `scale(${scale})` : undefined,
        }}
      >
        {children}
      </div>
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
 * 인라인 포맷팅: **bold**, ㄱ./ㄴ./ㄷ./ㄹ. 굵은 라벨
 */
function renderInlineFormatting(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // **bold** + ㄱ~ㅁ 보기 라벨 (굵은 텍스트 + 마침표)
  const formatRegex = /\*\*(.+?)\*\*|([ㄱㄴㄷㄹㅁ])\s*([.)]\s*)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = formatRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.substring(lastIdx, match.index));
    }
    if (match[1] !== undefined) {
      // **bold**
      parts.push(<strong key={`b${match.index}`} className="font-bold">{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      // ㄱ. ㄴ. ㄷ. ㄹ. ㅁ. → 굵은 텍스트 라벨 (사각형 없음)
      parts.push(
        <span key={`k${match.index}`} className="font-bold mr-0.5">
          {match[2]}.
        </span>
      );
    }
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
 * ★ 방어망 — 짝이 안 맞는(orphan) 표 마크업 제거.
 *   `\begin{tabular}` 와 `\end{tabular}` 개수가 같으면(=정상 표) 원문 그대로 반환(절대 안 건드림).
 *   개수가 다르면(잘려서 한쪽만 남은 잔재) 표 토큰(begin/end/hline/셀&·행\\)을 제거 — 어차피 렌더 불가.
 *   그림 객관식 표가 splitChoices 로 잘려 본문에 \begin{tabular} 가 열린 채 남거나 보기에 \end{tabular}
 *   잔재가 리터럴로 노출되던 기존 자산화 데이터(온천중 #10)를 DB 수정 없이 화면에서 정리.
 */
export function stripOrphanTabular(text: string): string {
  if (!text || text.indexOf('\\begin{tabular}') < 0 && text.indexOf('\\end{tabular}') < 0 && text.indexOf('\\hline') < 0) return text;
  // ★ 이미지 든 표(matched)는 격자 렌더 불가 → 표 토큰만 제거하고 [도형]·텍스트는 인라인(per-block 판정).
  //   [도형] 없는 데이터 표(x/y표·요금박스 등)는 그대로 둬서 격자 보존(parseTabularBlock). 기존 자산화
  //   데이터(온천중 #21/#22 그림 나열·그림+설명 표)를 재가져오기 없이 화면에서 정리.
  if (text.includes('[도형]')) {
    text = text.replace(/\\begin\{tabular\}\s*\{[^}]*\}([\s\S]*?)\\end\{tabular\}/g, (full, inner: string) =>
      inner.includes('[도형]')
        ? inner.replace(/\\hline/g, '').replace(/\s*&\s*/g, ' ').replace(/\\\\(?![A-Za-z])/g, ' ').replace(/[ \t]{2,}/g, ' ').trim()
        : full // 이미지 없는 데이터 표 → 격자 보존
    );
  }
  const begins = (text.match(/\\begin\{tabular\}/g) || []).length;
  const ends = (text.match(/\\end\{tabular\}/g) || []).length;
  if (begins === ends && begins > 0) return text; // 짝 맞는 정상 표 → 손대지 않음
  if (begins === 0 && ends === 0) {
    // 표는 없는데 \hline 만 떠도는 잔재(보기 조각 등) → \hline 만 제거
    return text.replace(/\\hline/g, '').replace(/[ \t]{2,}/g, ' ').trim();
  }
  // orphan(짝 안 맞음) → 표 마크업 토큰 전부 제거 (잘린 잔재라 렌더 불가)
  return text
    .replace(/\\begin\{tabular\}\s*\{[^}]*\}/g, '')
    .replace(/\\end\{tabular\}/g, '')
    .replace(/\\hline/g, '')
    .replace(/\s*&\s*/g, ' ')        // 셀 구분 잔재
    .replace(/\\\\(?![A-Za-z])/g, ' ') // 행 구분 잔재 (\command 는 보존)
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * content_latex 끝에 포함된 선택지 줄 제거
 * OCR 결과에 ①~⑤ 또는 (1)~(5) 선택지가 본문에 포함되어 있으면
 * choices 배열과 중복 렌더링되므로, 마지막 선택지 블록을 제거
 */
function stripTrailingChoiceLines(text: string): string {
  const lines = text.split('\n');

  // 끝에서부터 선택지 줄 찾기
  let lastNonEmptyIdx = lines.length - 1;
  while (lastNonEmptyIdx >= 0 && !lines[lastNonEmptyIdx].trim()) lastNonEmptyIdx--;

  // 선택지 패턴: ①~⑤, (1)~(5), 1)~5)
  const choiceLinePattern = /^\s*(?:[①②③④⑤]|\(\s*[1-5]\s*\)|[1-5]\s*\))/;

  let firstChoiceIdx = -1;
  for (let i = lastNonEmptyIdx; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue; // 빈 줄 건너뛰기
    if (choiceLinePattern.test(trimmed)) {
      firstChoiceIdx = i;
    } else {
      break; // 선택지가 아닌 줄을 만나면 중단
    }
  }

  if (firstChoiceIdx >= 0) {
    // ★ 서술형 소문제 (1)(2) 오인식 방지:
    // 연속 선택지 줄이 3개 미만이면 서술형 소문제일 가능성 높으므로 제거하지 않음
    const choiceLineCount = lastNonEmptyIdx - firstChoiceIdx + 1;
    if (choiceLineCount < 3) return text;
    const choiceBlock = lines.slice(firstChoiceIdx, lastNonEmptyIdx + 1).join('\n');
    // ★ (1)~(5) 5개 모두 있을 때만 객관식. 4개 이하 (1)(2)(3) / (1)(2)(3)(4) 는 서답형 보존.
    //   한국 수학 시험지 객관식은 항상 5개. CLAUDE.md / extractChoicesFromLatex /
    //   removeChoicesFromContent 의 서답형 보호 정책 일관성.
    //   사고 (2026-05-27 사직여중 15·18번): (1)(2)(3)(4) 4개 본문이 객관식 오인되어
    //   본문에서 통째로 제거됨. 소문제가 "~기" 액션 동사만이라 키워드 매칭도 실패해
    //   stripTrailingChoiceLines 가 선택지 블록 통째 strip.
    const parenChoiceCount = (choiceBlock.match(/\(\s*[1-5]\s*\)/g) || []).length;
    if (parenChoiceCount > 0 && parenChoiceCount < 5) return text;
    // ★ 서술형 키워드가 포함된 줄이 있으면 서술형 소문제이므로 제거하지 않음
    const subProblemKeywords = /구하시오|구하여라|구해라|서술하시오|설명하시오|증명하시오|나타내시오|보이시오|판단하시오|풀이\s*과정|쓰시오|쓰고|답하시오|완성하시오|그리시오|작도하시오|구하세요|구해\s*보시오|넓이를?\s*구|길이를?\s*구|값을?\s*구|과정을?\s*쓰|\[\s*\d+\s*점\s*\]|\d+점/;
    if (subProblemKeywords.test(choiceBlock)) return text;
    // 선택지 블록 제거
    return lines.slice(0, firstChoiceIdx).join('\n').trimEnd();
  }

  return text;
}

/**
 * 조건 박스 추출: (가)...(나)... 또는 <보기>/<규칙>/<조건>... 블록을 본문에서 분리
 * 시험지에서 조건이 사각형 테두리 박스 안에 들어가는 형식을 구현.
 * 헤더 라벨은 원본 그대로 보존(보기/규칙/조건/...) — 렌더 시 동일 라벨 표시.
 */


/** 조건 블록이 끝나는지 판단 */
function isEndOfConditionBlock(trimmed: string, lines: string[], currentIdx: number): boolean {
  // 빈 줄 → 박스 종료
  if (!trimmed) return true;
  // ★ 단독 \ (LaTeX 줄바꿈) → 박스 종료 (수동 구분자)
  if (/^\\+$/.test(trimmed)) return true;
  // 선택지 시작
  if (/^\s*[\(（]\s*[1-5]\s*[\)）]/.test(trimmed)) return true;
  if (/^\s*[①②③④⑤]/.test(trimmed)) return true;
  // 이미지/도형
  if (/^!\[/.test(trimmed) || /^\[도형\]/.test(trimmed)) return true;
  // ★ 질문 패턴 — 단, 조건 라벨((가)(나), ㄱ.ㄴ.)로 시작하는 줄은 제외
  const isConditionLabel = /^\s*[\(（]\s*[가나다라마]\s*[\)）]/.test(trimmed) ||
                           /^\s*[ㄱㄴㄷㄹㅁ]\s*[.)]/.test(trimmed);
  if (!isConditionLabel && /구하시오|구하여라|값은\s*\?|값을\s*구|의\s*값은/.test(trimmed)) return true;
  return false;
}

/**
 * Mathpix Markdown 전처리
 * - \(...\) → $...$
 * - \[...\] → $$...$$
 * - \begin{aligned}...\end{aligned} → $$\begin{aligned}...\end{aligned}$$
 * - \textbf{...} bare → **...**
 */
// ★ 초성 자모(U+1100~1112, 결합형) → 호환 자모(U+3131~, 자판으로 치는 형태) 매핑.
//   NFC 로도 "단독" 초성은 안 바뀌므로 명시 매핑 필요. (보기/객관식 ㄱㄴㄷ 통일용)
const CHOSEONG_TO_COMPAT: Record<string, string> = {
  'ᄀ': 'ㄱ', 'ᄁ': 'ㄲ', 'ᄂ': 'ㄴ', 'ᄃ': 'ㄷ', 'ᄄ': 'ㄸ',
  'ᄅ': 'ㄹ', 'ᄆ': 'ㅁ', 'ᄇ': 'ㅂ', 'ᄈ': 'ㅃ', 'ᄉ': 'ㅅ',
  'ᄊ': 'ㅆ', 'ᄋ': 'ㅇ', 'ᄌ': 'ㅈ', 'ᄍ': 'ㅉ', 'ᄎ': 'ㅊ',
  'ᄏ': 'ㅋ', 'ᄐ': 'ㅌ', 'ᄑ': 'ㅍ', 'ᄒ': 'ㅎ',
};

/**
 * 집합 조건제시법 막대 — `\left\{ … \left| … \right\}` 의 조건 구분 `\left|` 를 `\middle|` 로.
 *   `\left|` 는 짝(`\right|`)이 없어 `\left\{…\right\}` 안에서 \left/\right 불균형 → KaTeX 렌더 실패
 *   (현대청운고 고급대수 #19·#20 빨간 raw). 중첩 `\left(…\right)` 가 사이에 있어도 동작(깊이 추적).
 *   집합 밖 절댓값 `\left|x\right|` 은 `\left\{` 스코프 밖이라 안 건드림. 깊이 1(집합 직속)만 변환.
 */
function convertSetBuilderBar(s: string): string {
  const OPEN = '\\left\\{';
  let scanFrom = 0;
  for (;;) {
    const start = s.indexOf(OPEN, scanFrom);
    if (start === -1) break;
    let depth = 1;
    let j = start + OPEN.length;
    while (j < s.length && depth > 0) {
      if (s.startsWith('\\left|', j)) {
        if (depth === 1) { s = s.slice(0, j) + '\\middle|' + s.slice(j + 6); j += 8; continue; }
        depth++; j += 6; continue;
      }
      if (s.startsWith('\\left', j)) { depth++; j += 5; continue; }
      if (s.startsWith('\\right', j)) { depth--; j += 6; continue; }
      j++;
    }
    scanFrom = start + OPEN.length;
  }
  return s;
}

function preprocessMathpixContent(text: string): string {
  // ★ 한글 자모 통일 (Mac/OCR 결합형 ↔ 자판형) — 보기/객관식 ㄱㄴㄷ 라벨이 초성자모
  //   (U+1100~, 결합형)로 들어와 호환자모(U+3131~, 자판형)와 섞여 "왔다갔다"·다르게
  //   렌더되던 사고. ① NFC 로 분해된 한글 음절(중=중) 먼저 재결합 → 음절 안 깨짐.
  //   ② 남은 "단독" 초성자모만 호환자모로 매핑 → 모든 ㄱㄴㄷ 자판형 통일([ㄱ-ㅎ] 일관 매칭).
  let result = text.normalize('NFC').replace(/[ᄀ-ᄒ]/g, (c) => CHOSEONG_TO_COMPAT[c] || c);

  // ═══ Phase 0a: 단독 \ 줄 제거 (조건박스 구분자 — 렌더링 불필요) ═══
  result = result.replace(/^\s*\\+\s*$/gm, '');

  // ═══ Phase 0: 전각 ASCII → 반각 정규화 (Mathpix가 ．，（）？등 전각 출력) ═══
  result = result.replace(/[\uff01-\uff5e]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );

  // 0-1. 인라인 <보기> 태그 → 〈보기〉 (전각 꺾쇠)로 통일 (HTML 태그 오인식 방지)
  result = result.replace(/(?:〈|<)\s*보\s*기\s*(?:〉|>)/g, '〈보기〉');
  // "보기>" 잔여 (< 가 누락된 경우) → 〈보기〉로 복원
  result = result.replace(/(?<!〈)보기(?:〉|>)\s*/g, '〈보기〉 ');

  // ═══ Phase 1: Format 변환 (Mathpix → 표준 $...$) ═══

  // 1-0. Mathpix # 접두사 → \ 변환
  result = result.replace(/#begin\{/g, '\\begin{');
  result = result.replace(/#end\{/g, '\\end{');
  result = result.replace(/#hline\b/g, '\\hline');
  result = result.replace(/##/g, '\\\\');
  result = result.replace(/#([a-zA-Z]+)/g, '\\$1');

  // 1-1. \(...\) → $...$ (인라인 수식, Mathpix 스타일)
  // ★ \left(, \right) 등 LaTeX 명령어 뒤의 괄호는 구분자가 아님
  //    먼저 임시 치환 → \( \) 변환 → 복원
  result = result.replace(/\\left\(/g, '\uE001');
  result = result.replace(/\\right\)/g, '\uE002');
  result = result.replace(/\\\((.+?)\\\)/gs, (_, inner) => `$${inner.trim()}$`);
  result = result.replace(/\uE001/g, '\\left(');
  result = result.replace(/\uE002/g, '\\right)');
  // 1-1b. 불완전한 \( → $
  result = result.replace(/\\\(([^$\n]+?)$/gm, (_, inner) => `$${inner.trim()}$`);
  result = result.replace(/^([^$\n]+?)\\\)/gm, (_, inner) => `$${inner.trim()}$`);

  // 1-1c. ★ KaTeX에서 \square가 기호로 인식 안 되는 문제 → 빈 네모 박스로 변환
  result = result.replace(/\\square/g, '\\boxed{\\phantom{X}}');

  // 1-2. \[...\] → $$...$$
  result = result.replace(/\\\[(.+?)\\\]/gs, (_, inner) => `$$${inner.trim()}$$`);

  // 1-3. 고립된 $ + \begin/\end 정리 — env-dollar-cleanup.ts 로 분리(회귀 테스트 대상).
  //   ★ 닫는 쪽은 같은 줄 공백만 본다. `\s*` 면 다음 줄을 여는 `$` 까지 지운다(사대부고 #17).
  result = stripDollarBeforeEnv(result);
  result = stripDollarAfterEnv(result);

  // 1-3b. ★ \displaystyle \begin{cases} $ ... \end{cases} 패턴 정리
  // Mathpix가 \displaystyle + $ 를 섞어서 출력하는 경우
  result = result.replace(
    /\\displaystyle\s*\\begin\{(cases|array)\}\s*\$?/g,
    '\\begin{$1}'
  );

  // 1-4. bare \begin{...}...\end{...} → $$...$$
  // ★ 버그 수정: `$ ... \left\{ \begin{array}... \end{array} \right. ... $` 같이
  //   이미 $...$ 블록 내부에 있는 환경이 단일문자 룩비하인드 `(?<!\$)` 만으론
  //   보호되지 않아 중복 래핑되던 문제. 오프셋 기준 $-balance 로 정확히 판정.
  {
    const snapshot = result;
    result = result.replace(
      /(?:\\displaystyle\s*)?\\begin\{(aligned|align|gather|cases|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|equation|equation\*)\}([\s\S]*?)\\end\{\1\}/g,
      (match, envName, _inner, offset) => {
        if (typeof offset !== 'number') return match;
        // offset 위치가 $-블록 내부인지 판정
        const before = snapshot.substring(0, offset);
        const ddCount = (before.match(/\$\$/g) || []).length;
        if (ddCount % 2 === 1) return match; // $$ 안 → 그대로
        const sdCount = (before.replace(/\$\$/g, '').match(/\$/g) || []).length;
        if (sdCount % 2 === 1) return match; // $ 안 → 그대로
        if (envName === 'array' && /&/.test(match)) return match;
        // ★ 2026-08-31 사고 — 수식 환경 **안쪽**에 $ 가 섞여 들어오는 경우.
        //   Mathpix 가 연립방정식의 두 줄 중 한 줄만 $ 로 감싸 내보내는 일이 있다:
        //   이걸 그대로 $$ 로 감싸면 수식 모드 안에 $ 가 남아 KaTeX 가 통째로 실패하고,
        //   화면에는 cases 원문이 날것(LaTeX 문자열)으로 노출된다 — 서여고 미적분1 실측.
        //   수식 환경 안에서 $ 는 어떤 경우에도 유효한 문법이 아니므로 전부 걷어낸다.
        return `$$${stripDollarsInsideMathEnv(match)}$$`;
      }
    );
  }

  // 1-5. bare \textbf{...} → **...**
  result = result.replace(/(?<!\$)\\textbf\{([^}]*)\}(?!\$)/g, '**$1**');

  // 1-6. 전체가 LaTeX인 줄 → $...$로 감싸기
  result = result.replace(/^(\\[a-zA-Z]+[\s\S]*?)$/gm, (line) => {
    if (line.trim().startsWith('$')) return line;
    if (/\\(begin|end)\{(?:tabular|array)\}|\\hline|&/.test(line)) return line;
    if (/\\[a-zA-Z]+/.test(line) && !/[가-힣]/.test(line)) {
      return `$${line.trim()}$`;
    }
    return line;
  });

  // ═══ Phase 2: OCR 후처리 (이제 모든 수식이 $...$로 통일됨) ═══

  // 2-1. OCR ㄱ→\neg/¬ 오인식 보정
  // (a) $\neg$ 단독 → ㄱ
  result = result.replace(/\$\\neg\$/g, 'ㄱ');
  // (b) $\neg . MATH$ → ㄱ. $MATH$ (라벨이 수식 블록 안에 갇힌 경우 분리)
  result = result.replace(/\$\\neg\s*\.\s*/g, 'ㄱ. $');
  result = result.replace(/\$¬\s*\.\s*/g, 'ㄱ. $');
  // (c) ¬ (유니코드) 뒤에 점/쉼표 → ㄱ
  result = result.replace(/¬(?=\s*[.,)}\s])/g, 'ㄱ');
  // (d) bare \neg 뒤에 점/쉼표 → ㄱ
  result = result.replace(/\\neg(?=\s*[.,)])/g, 'ㄱ');

  // 2-1b. ★ 본문 한글 자모 KaTeX wrapping 자동 해제 (2026-05-25, 9c614b2 패턴 확장)
  //   본문(특히 <보기> 박스 안)에서 ㄱ,ㄴ,ㄷ 가 $\text{ㄱ}$ 또는 \text{ㄱ,ㄴ} 형태로 OCR 되면
  //   KaTeX 의 fallback 폰트로 그려져 글씨체가 다르게 보임. 본문 텍스트 흐름에 맞게 unwrap.
  //   - $\text{ㄱ}$ → ㄱ
  //   - \text{ㄱ,ㄴ} → ㄱ,ㄴ
  //   - $ㄱ$ → ㄱ (단독 자모만, 수식 안 깨도록 보수적 매칭)
  result = result.replace(/\$\s*\\text\{\s*([ㄱ-ㅎ][ㄱ-ㅎ\s,]*)\s*\}\s*\$/g, '$1');
  result = result.replace(/\\text\{\s*([ㄱ-ㅎ][ㄱ-ㅎ\s,]*)\s*\}/g, '$1');
  result = result.replace(/\$\s*([ㄱ-ㅎ](?:\s*,\s*[ㄱ-ㅎ])*)\s*\$/g, '$1');

  // 2-2. \displaystyle 정리 (MathRenderer가 자동 추가하므로 중복 제거)
  // (a) $\displaystyle$ 단독 → 제거 (OCR 아티팩트)
  result = result.replace(/\$\s*\\displaystyle\s*\$/g, '');
  // (b) $\displaystyle ...$ → $...$
  result = result.replace(/\$\s*\\displaystyle\s+/g, '$');
  // (c) $$\displaystyle ...$$ → $$...$$
  result = result.replace(/\$\$\s*\\displaystyle\s+/g, '$$');
  // (d) bare \displaystyle (수식 밖, 한글 앞 포함) → 제거 (₩ = U+20A9 한글 원화 기호도 포함)
  result = result.replace(/[\\₩]displaystyle\s*/g, '');

  // 2-3. 선택지 (1)(2)(3)(4)(5) → ①②③④⑤ 정규화
  result = normalizeChoiceParensForRender(result);

  // 2-4a-0. 두 연립방정식 비교 — 같은 줄 인접 `$cases$ , $cases$` 를 한 디스플레이 블록
  //   `$$cases \qquad cases$$` 로 병합 → 두 시스템이 나란히(가로). 단일 cases 는 미해당(아래 2-4a
  //   가 그대로 디스플레이=중앙 처리). "두 연립방정식 A, B 의 해가…"(거제여중 #18) 가 세로로 쌓이던 사고.
  result = result.replace(
    /\$([^$\n]*?\\begin\{cases\}[\s\S]*?\\end\{cases\}[^$\n]*?)\$\s*[,，、]?\s*\$([^$\n]*?\\begin\{cases\}[\s\S]*?\\end\{cases\}[^$\n]*?)\$/g,
    (_m, a, b) => `$$${a}\\qquad ${b}$$`
  );

  // 2-4a. $...\begin{env}...\end{env}...$ (멀티라인 환경 포함 단일$) → $$...$$ (디스플레이로 승격)
  // KaTeX는 $...$에서 멀티라인 환경을 처리 못하고, 디스플레이여야 분수·중괄호가 크게 보임
  // ★ 이전엔 $\begin{cases}...\end{cases}$ (정확히 begin/end만 감싼) 케이스만 매칭 → "f(x) = \begin{cases}..." 같이 앞뒤 텍스트 있으면 누락
  // ★ 버그 수정: lookbehind/lookahead `(?<!\$)` `(?!\$)` 추가. 이미 $$..$$로 감싸진 환경의
  //   안쪽 $..$ (실제론 $$의 두 번째 $와 다음 $$의 첫 $) 까지 매칭해서 $$$..$$$ 로 만들던
  //   버그 (신곡중 13번 array 가 $$$로 깨져 KaTeX 렌더 실패하던 원인).
  //   ★ 2026-06-20: matrix 계열(matrix/pmatrix/bmatrix/vmatrix) 제외 — 문장 중간 인라인
  //     열벡터 `$\left(\begin{matrix}1\\1\end{matrix}\right)$` 까지 디스플레이로 승격되어
  //     "각각 [큰 행렬 가운데 줄바꿈], [큰 행렬]" 처럼 블록으로 빠지던 사고(현대청운고 고급대수 #6).
  //     행렬은 인라인 유지(문장 흐름 안 가로 배치) — 연립방정식 cases/aligned/array 는 디스플레이 유지.
  result = result.replace(
    /(?<!\$)\$([^$\n]*?\\begin\{(?:array|cases|aligned)\}[\s\S]*?\\end\{(?:array|cases|aligned)\}[^$\n]*?)\$(?!\$)/g,
    (_m, inner) => {
      // ★ 2026-06-29: \left( / \left[ / \left| 로 감싼 array = 인라인 행렬·행벡터 → 디스플레이 승격 금지.
      //   (matrix 계열과 동일 취지 — 문장 중간 가로 유지. "제 N 행은 $\left(\begin{array}{lll}6 & 8 & 0\end{array}\right)$이다"
      //    가 디스플레이로 승격되어 가운데 정렬·줄바꿈으로 빠지던 사고. 경남고 #5.)
      //   \left\{ (cases/연립방정식) · 맨몸 array(연립) 는 디스플레이 유지 → 아래 promote.
      if (/\\left\s*[([|]\s*\\begin\{array\}/.test(inner)) return _m;
      return `$$${inner}$$`;
    }
  );

  // 2-4a-1. 집합 조건제시 막대 \left| → \middle| (\left\{…\right\} 안, KaTeX 불균형 해소).
  //   ★ \left\{…\right. (cases/piecewise) 변환 전에 — 집합은 \right\}(brace) 라 아래 변환과 무관.
  result = convertSetBuilderBar(result);

  // 2-4b. piecewise 함수: \left\{\begin{array}...\end{array}\right. → \begin{cases}...\end{cases}
  // cases 환경은 KaTeX가 자동으로 큰 중괄호를 렌더링
  result = result.replace(
    /\\left\s*\\?\{\s*\\begin\{array\}(?:\{[^}]*\})?([\s\S]*?)\\end\{array\}\s*\\right\s*\./g,
    (_match, inner) => `\\begin{cases}${inner}\\end{cases}`
  );
  // \left\{...\right. (array 없이) → \begin{cases}...\end{cases}
  // ★ $/$$ 내부의 \left\{...\right. 은 KaTeX가 처리하므로 건드리지 않음
  result = result.replace(
    /\\left\s*\\?\{([\s\S]*?)\\right\s*\./g,
    (_match, inner, offset) => {
      const before = result.substring(0, offset);
      const ddCount = (before.match(/\$\$/g) || []).length;
      if (ddCount % 2 === 1) return _match; // $$ 안 → 그대로
      const sdCount = (before.replace(/\$\$/g, '').match(/\$/g) || []).length;
      if (sdCount % 2 === 1) return _match; // $ 안 → 그대로
      // 내부에 \\ (행 구분) 또는 & (열 구분)가 있으면 cases로 변환
      if (/\\\\|&/.test(inner)) {
        return `\\begin{cases}${inner}\\end{cases}`;
      }
      // 단일 내용이면 그냥 중괄호로
      return `\\lbrace ${inner}`;
    }
  );
  // 고아 \left\{ (매칭 \right 없음) → \lbrace
  // ★ 매칭되는 \right\} 또는 \right.이 뒤에 있으면 변환하지 않음 (정상 LaTeX 보호)
  // ★ $/$$ 안의 \left\{도 변환하지 않음
  {
    const snapshot = result; // 현재 문자열 스냅샷
    result = result.replace(/\\left\s*\\?\{/g, (match, offset) => {
      // 1) $/$$ 내부 체크
      const before = snapshot.substring(0, offset);
      const stripped = before.replace(/\$\$/g, '\x00\x00'); // $$ → placeholder
      const ddCount = (before.match(/\$\$/g) || []).length;
      if (ddCount % 2 === 1) return match; // $$ 내부
      const sdCount = (stripped.match(/\$/g) || []).length;
      if (sdCount % 2 === 1) return match; // $ 내부
      // 2) 뒤에 매칭되는 \right\} 또는 \right. 가 있는지 확인
      const after = snapshot.substring(offset + match.length);
      if (/\\right\s*[\\}.]/.test(after)) return match; // 매칭 \right 있음 → 보존
      return '\\lbrace';
    });
  }
  // 고아 \right. → 제거 (★ $/$$ 안에서는 KaTeX가 처리하므로 제거하지 않음)
  {
    const snapshot = result;
    result = result.replace(/\\right\s*\./g, (match, offset) => {
      const before = snapshot.substring(0, offset);
      const ddCount = (before.match(/\$\$/g) || []).length;
      if (ddCount % 2 === 1) return match;
      const sdCount = (before.replace(/\$\$/g, '').match(/\$/g) || []).length;
      if (sdCount % 2 === 1) return match;
      return '';
    });
  }
  // $$ 만 남은 빈 블록 제거 (★ $$는 display math 구분자이므로 보존!)
  result = result.replace(/\$\s+\$/g, '');           // $ (공백) $ → 제거
  result = result.replace(/\$\$\s+\$\$/g, '');       // $$ (공백) $$ → 제거

  // 2-5. <보기> 태그 분리 복구
  // "것을 <에서" 또는 "것을 < 에서" → "것을 〈보기〉 에서"
  result = result.replace(/<\s*에서/g, '〈보기〉 에서');
  // "< 에서" 패턴이 아닌 줄 끝의 고아 '<' → 〈보기〉로 복원 (문맥상 보기 태그인 경우)
  result = result.replace(/<\s*$/gm, '〈보기〉');
  // "<보기>" 잔여 → 〈보기〉 (전각 꺾쇠로 통일)
  result = result.replace(/<보기>/g, '〈보기〉');

  return result;
}

// bare LaTeX 감싸기는 wrap-bare-latex.ts 로 분리 (2026-09-02).
//   vitest 가 .tsx 를 import 못 해 테스트가 구현을 복제하던 문제 때문 — 그 사이
//   실제 코드의 결함(구분자 누락)이 테스트를 통과한 채 운영까지 갔다.

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
  // ★ 안전장치: \displaystyle 잔여 제거 (preprocessMathpixContent에서 놓친 경우)
  // ₩ (U+20A9) = 한국어 Windows에서 백슬래시 대체 문자
  text = text.replace(/\$\s*[\\₩]displaystyle\s*\$/g, '');
  text = text.replace(/\$\s*[\\₩]displaystyle\s+/g, '$');
  text = text.replace(/\$\$\s*[\\₩]displaystyle\s+/g, '$$');
  text = text.replace(/[\\₩]displaystyle\s*/g, '');
  // ★ 보기> 잔여 텍스트 → 〈보기〉 복원 (OCR에서 <보기> 태그가 깨진 경우)
  text = text.replace(/(?<!〈)보기(?:〉|>)\s*/g, '〈보기〉 ');

  // 0단계: \begin{tabular}...\end{tabular} 및 \begin{array}...\end{array} 블록을 플레이스홀더로 대체
  // 조립제법, 진리표 등 array 환경도 표로 렌더링
  // ★ 단, \left\{ 뒤의 array는 piecewise 수식이므로 KaTeX에서 처리 → 추출 안 함
  const tabularBlocks: ContentElement[] = [];
  let textWithPlaceholders = text.replace(
    /\\begin\{(?:tabular|array)\}(?:\{[^}]*\})?[\s\S]*?\\end\{(?:tabular|array)\}/gi,
    (match, offset, fullText) => {
      // ★ \left( / \left[ / \left{ / \left| / \left\{ 등 \left+구분자 뒤의 array 는 "행렬·piecewise 수식"이라
      //   블록 표로 추출 금지 → KaTeX 인라인. 데이터 표(조립제법·진리표)는 \left 를 안 써서 영향 없음.
      //   ($ 패리티 가드가 본문/앞 보기의 $ 누적으로 어긋나 행렬을 블록으로 잘못 빼 줄바꿈되던 사고:
      //    자산화 객관식 "제 N 행은 (a b c) 이다" 행렬 보기).
      const before = fullText.substring(Math.max(0, offset - 20), offset);
      if (/\\left\s*[([{|\\]/.test(before)) {
        return match; // KaTeX가 처리하도록 그대로 둠
      }
      // $...$나 $$...$$ 내부의 array도 KaTeX가 처리해야 함
      // ★ tabular는 항상 추출 (tabular 내부에 $...$가 있어 $ 카운팅이 꼬이므로)
      // array만 수식 내부 체크 (cases/piecewise 함수 등)
      if (/\\begin\{array\}/i.test(match)) {
        const textBefore = fullText.substring(0, offset);
        const dollarCount = (textBefore.match(/(?<!\$)\$(?!\$)/g) || []).length;
        const doubleDollarCount = (textBefore.match(/\$\$/g) || []).length;
        if (dollarCount % 2 === 1 || doubleDollarCount % 2 === 1) {
          return match; // array가 수식 내부 → 추출 안 함
        }
      }
      const tableEl = parseTabularBlock(match);
      const idx = tabularBlocks.length;
      tabularBlocks.push(tableEl);
      // ★ 줄바꿈으로 감싸서 wrapBareLatex가 _ 를 첨자로 인식하는 것을 방지
      return `\n__TABULAR_${idx}__\n`;
    }
  );

  // 0.5단계: $...$나 $$...$$ 내부에 TABULAR 플레이스홀더가 있으면 분리 (수식이 표를 감싼 경우)
  // 예: "$$k __TABULAR_0__$$" → "$$k$$" + "\n__TABULAR_0__\n"
  // 예: "$k __TABULAR_0__$" → "$k$" + "\n__TABULAR_0__\n"
  // ★ before/after 는 `[^$]*?` — 다른 $…$ 를 건너뛰지 않게(표 앞뒤 별개 수식을 짝지어 본문 전체를
  //   한 수식으로 잘못 감싸던 사고). + 여는 delim 앞 $ 개수가 짝수일 때만 분리(=진짜 수식 시작).
  //   홀수면 그 $ 는 앞 수식의 "닫는" 기호 → 표 앞 ${C}$ 와 표 뒤 $40$ 를 잘못 짝지어 한글·중괄호가
  //   통째로 깨지던 사고(거제여중 #18 표: { {A}} 중괄호 노출 + 공백 붕괴). $ 패리티로 차단.
  textWithPlaceholders = textWithPlaceholders.replace(
    /(\$\$|\$)([^$]*?)(__TABULAR_\d+__)([^$]*?)\1/g,
    (_match, delim, before, placeholder, after, offset, full) => {
      const dollarsBefore = (full.slice(0, offset).match(/\$/g) || []).length;
      if (dollarsBefore % 2 !== 0) return _match; // 여는 $ 가 실제로는 닫는 기호 → 분리 안 함
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
  // ★ SOLUTION_BOX 포함 — 누락 시 wrapBareLatexInSegment 가 `N_BOX_0__` 의
  //   `N`+`_` 를 첨자로 인식해 마커를 깨뜨림 (30번 회귀 #5, 2026-05-18)
  const placeholders: string[] = [];
  textWithPlaceholders = textWithPlaceholders.replace(/__(?:TABULAR|CONDITION_BOX|SOLUTION_BOX)_\d+__/g, (m) => {
    const idx = placeholders.length;
    placeholders.push(m);
    return `\x00PH${idx}\x00`;
  });
  let preprocessed = wrapBareLatex(textWithPlaceholders);
  // 플레이스홀더 복원
  preprocessed = preprocessed.replace(/\x00PH(\d+)\x00/g, (_, idx) => placeholders[parseInt(idx, 10)]);

  const elements: ContentElement[] = [];

  // 통합 정규식: 이미지 → tabular/condition/solution placeholder → $$display$$ → $inline$ 순서로 매칭
  // $$...$$ 에서 내부에 줄바꿈을 허용 ([\s\S]+? non-greedy)
  // ★ SOLUTION_BOX 추가 — renderElement 의 `^__SOLUTION_BOX_(\d+)__$` 매치를 위해
  //   마커가 *단독 text element* 로 분리되어야 함 (앞뒤 텍스트와 섞이면 매치 실패)
  const regex = /!\[([^\]]*)\]\(([^)]+)\)|__TABULAR_(\d+)__|__CONDITION_BOX_(\d+)__|__SOLUTION_BOX_(\d+)__|\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g;
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
      // solution-box placeholder: __SOLUTION_BOX_N__ → 단독 text element 로 분리
      //   renderElement 의 `^__SOLUTION_BOX_(\d+)__$` 매치 → SolutionBoxRender 로 연결
      elements.push({ type: 'text', value: `__SOLUTION_BOX_${match[5]}__` });
    } else if (match[6] !== undefined) {
      // display math: $$...$$
      elements.push({ type: 'display-math', value: match[6].trim() });
    } else if (match[7] !== undefined) {
      // inline math: $...$
      elements.push({ type: 'inline-math', value: match[7] });
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

/**
 * 렌더링 시점에서 (1)(2)(3)(4)(5) → ①②③④⑤ 선택지 정규화
 * DB에 이미 저장된 데이터에 대한 보정용
 *
 * ★ 매우 보수적 규칙 (서술형 오변환 방지):
 * - (1)~(5) 5개 모두 존재해야만 변환 (4개 이하는 서술형 소문제일 수 있음)
 * - 이미 ①②③이 있으면 변환하지 않음
 * - 수식 내부($...$)의 (1)은 변환하지 않음
 * - 서술형 키워드가 하나라도 있으면 변환하지 않음
 * - 각 (N) 사이 간격이 너무 넓으면(소문제) 변환하지 않음
 */
function normalizeChoiceParensForRender(text: string): string {
  // 이미 원문자가 있으면 변환 불필요
  if (/[①②③④⑤]/.test(text)) return text;

  const circleMap: Record<string, string> = { '1': '①', '2': '②', '3': '③', '4': '④', '5': '⑤' };
  const parenRegex = /\(([1-5])\)/g;

  // 수식 밖에서만 매칭 수집
  const matches: { index: number; num: string; fullMatch: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = parenRegex.exec(text)) !== null) {
    const before = text.substring(0, m.index);
    const dollarCount = (before.match(/\$/g) || []).length;
    if (dollarCount % 2 === 0) {
      // ★ 바로 앞에 영문/한글/숫자/닫는괄호가 있으면 함수 호출이므로 변환하지 않음
      // 예: f(1), g(2), sin(3), 값(1) 등
      const charBefore = m.index > 0 ? text[m.index - 1] : '';
      if (/[a-zA-Zㄱ-힣0-9_)\]}]/.test(charBefore)) continue;
      matches.push({ index: m.index, num: m[1], fullMatch: m[0] });
    }
  }

  // ★ 5개 모두 있어야만 변환 (서술형은 보통 (1)(2)(3) 3개 또는 (1)(2)(3)(4) 4개)
  const nums = new Set(matches.map(m => m.num));
  if (!nums.has('1') || !nums.has('2') || !nums.has('3') || !nums.has('4') || !nums.has('5')) {
    return text;
  }

  // ★ 서술형 키워드가 하나라도 있으면 무조건 변환하지 않음
  if (/구하시오|구하여라|구해라|풀이하시오|증명하시오|보이시오|서술하시오|나타내시오|설명하시오|구하세요|풀어라|값을\s*구하|의\s*값은|을\s*구하|를\s*구하|\[\s*\d+\s*점\s*\]|서답형|서술형|주관식/.test(text)) {
    return text;
  }

  // ★ 각 (N) 사이 평균 간격이 50자 이상이면 소문제일 가능성 높음 → 변환하지 않음
  // 선택지는 보통 "(1) ㄱ (2) ㄴ (3) ㄱ,ㄴ" 처럼 간격이 짧음
  if (matches.length > 1) {
    const avgSpacing = (matches[matches.length - 1].index - matches[0].index) / (matches.length - 1);
    if (avgSpacing > 50) return text;
  }

  // 역순 치환 (인덱스가 밀리지 않도록)
  let result = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const { index, num, fullMatch } = matches[i];
    result = result.substring(0, index) + circleMap[num] + result.substring(index + fullMatch.length);
  }
  return result;
}
