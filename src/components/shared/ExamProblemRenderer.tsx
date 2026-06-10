'use client';

import React, { memo } from 'react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { FigureRenderer } from '@/components/shared/FigureRenderer';
import { cleanLatexContent, cleanChoiceText, injectSubQuestionPoints } from '@/lib/utils/clean-latex';
import type { InterpretedFigure } from '@/types/ocr';

// ============================================================================
// 공통 시험지 문제 렌더러 — 클라우드 페이지 + 시험지 관리 공용
// ============================================================================

export interface ExamRenderProblem {
  id: string;
  number: number;
  /** ★ 시험지에 적용된 배점 — 있으면 "[N점]" 배지로 표시 */
  points?: number;
  content: string;
  choices: string[];
  /** ★ 표 형식 선택지 열 헤더 (예: ["ㄱ","ㄴ","ㄷ","ㄹ"]) */
  choiceHeaders?: string[];
  /** ★ 저장된 선택지 레이아웃 (1=1열, 2=2열, 5=가로) */
  choiceLayout?: number;
  /** ★ 그림 객관식 — 선택지별 이미지 URL (index 0~4 = ①~⑤, null=텍스트 보기) */
  choiceImages?: (string | null)[];
  figureData?: InterpretedFigure;
  figureSvg?: string;
  upscaledCropUrl?: string;
  figureSource?: 'upscaled_crop' | 'ai_generated';
  images?: Array<{ url: string; type: string; label: string }>;
  hasFigure?: boolean;
  /** ★ 서술형 소문제별 답·배점 — 본문 "N-M." 라인 뒤에 [N점] 인라인 주입용 */
  subQuestions?: Array<{ number: string; answer?: string; points: number | null }>;
  /** answerJson fallback (subQuestions 가 직접 안 채워진 경우 여기서 추출) */
  answerJson?: Record<string, unknown> | null;
}

/**
 * Supabase Storage private 버킷 URL → 프록시 URL 변환
 */
function proxyUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('/api/storage/image')) return url;
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign(?:ed)?)\/source-files\/(.+)/);
  return m ? `/api/storage/image?path=${encodeURIComponent(m[1])}` : url;
}

/**
 * [도형] 마커 기준으로 content를 분할
 */
function splitByFigureMarker(content: string): Array<{ type: 'text' | 'figure'; text: string; floatMode?: 'right' | 'left'; widthPercent?: number }> {
  const globalRegex = /\[도형(?::(\w+[-\w]*))?(?::(\d+)%?)?\]/g;
  if (!globalRegex.test(content)) return [{ type: 'text', text: content }];
  globalRegex.lastIndex = 0;

  const parts: Array<{ type: 'text' | 'figure'; text: string; floatMode?: 'right' | 'left'; widthPercent?: number }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = globalRegex.exec(content)) !== null) {
    const before = content.slice(lastIndex, match.index);
    if (before.trim()) parts.push({ type: 'text', text: before });
    const modeStr = match[1];
    const widthStr = match[2];
    let floatMode: 'right' | 'left' | undefined;
    if (modeStr === 'right' || modeStr === 'float-right') floatMode = 'right';
    else if (modeStr === 'left' || modeStr === 'float-left') floatMode = 'left';
    parts.push({ type: 'figure', text: '', floatMode, widthPercent: widthStr ? parseInt(widthStr, 10) : undefined });
    lastIndex = match.index + match[0].length;
  }
  const after = content.slice(lastIndex);
  if (after.trim()) parts.push({ type: 'text', text: after });
  return parts;
}

/**
 * 시험지 문제 렌더러 (A4 뷰용)
 * - [도형] 마커 인라인 렌더링 (다중 도형 지원)
 * - ![이미지](url) → [도형] 자동 변환
 * - figure_crop / AI SVG / upscaled crop 모두 지원
 * - float 모드 (우측/좌측 배치) 지원
 */
function ExamProblemRendererInner({
  problem,
  gap = 20,
  textSize = '14px',
  lineHeight = '1.65',
  maxFigureWidth = 240,
}: {
  problem: ExamRenderProblem;
  gap?: number;
  textSize?: string;
  lineHeight?: string;
  maxFigureWidth?: number;
}) {
  // 도형 소스 준비
  const figureCrops = problem.images?.filter(img => img.type === 'figure_crop') || [];
  const hasAiFigure = problem.figureData || problem.figureSvg || problem.upscaledCropUrl;
  const hasFigureCrops = figureCrops.length > 0;
  const hasFigureSource = hasAiFigure || hasFigureCrops;

  // content 정리: 문제번호 중복 제거 + 점수 제거 + ![이미지] → [도형] + LaTeX 정규화
  const rawContent = problem.content || '';
  // ★ subQuestions: 명시적 prop 우선, 없으면 answerJson 에서 추출
  const subQs = problem.subQuestions
    || (problem.answerJson && Array.isArray((problem.answerJson as Record<string, unknown>).subQuestions)
        ? (problem.answerJson as { subQuestions: Array<{ number: string; answer?: string; points: number | null }> }).subQuestions
        : undefined);
  const cleanContent = injectSubQuestionPoints(
    cleanLatexContent(
      rawContent
        .replace(/^\s*\d+\.\s*/, '')
        .replace(/\[\s*\d+(\.\d+)?\s*점\s*\]/g, '')
        .trim()
    ),
    subQs
  );

  const parts = splitByFigureMarker(cleanContent);
  const hasFigureInContent = parts.some(p => p.type === 'figure');

  // 도형 렌더 헬퍼
  const renderFigure = (figIdx: number = 0) => {
    const cropUrl = figureCrops[figIdx]?.url ? proxyUrl(figureCrops[figIdx].url) : undefined;
    const printCropImage = problem.images?.find(img => img.type === 'crop');
    const fallbackCrop = printCropImage?.url ? proxyUrl(printCropImage.url) : undefined;

    // figure_crop 우선 (도식 교체)
    if (cropUrl) {
      if (figIdx === 0 && hasAiFigure) {
        return <FigureRenderer figureData={problem.figureData} figureSvg={problem.figureSvg} upscaledCropUrl={problem.upscaledCropUrl} figureSource={problem.figureSource} cropImageUrl={cropUrl} maxWidth={maxFigureWidth} darkMode={false} />;
      }
      return <img src={cropUrl} alt={`도형 ${figIdx + 1}`} className="max-h-48 max-w-full object-contain" />;
    }
    // AI 생성 도형
    if (figIdx === 0 && hasAiFigure) {
      return <FigureRenderer figureData={problem.figureData} figureSvg={problem.figureSvg} upscaledCropUrl={problem.upscaledCropUrl} figureSource={problem.figureSource} cropImageUrl={fallbackCrop} maxWidth={maxFigureWidth} darkMode={false} />;
    }
    return null;
  };

  // 선택지 렌더링
  const renderChoices = () => {
    if (problem.choices.length === 0) return null;

    const headers = problem.choiceHeaders;
    const hasTableHeaders = headers && headers.length > 0;

    // ★ 표 형식 선택지: choiceHeaders가 있으면 테이블로 렌더링
    if (hasTableHeaders) {
      const colCount = headers.length;
      return (
        <div className="mt-2 overflow-x-auto">
          {/* ★ 컬럼 간격 확장 (2026-05-18): (가)/(나) 등 헤더가 너무 붙어있다는
                사용자 보고. px-3 → px-10 으로 보기 컬럼 간격 ↑. prefix 컬럼은
                좌측 여백 그대로 유지 (px-1.5). */}
          <table className="border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="px-1.5 py-0.5" />
                {headers.map((h, i) => (
                  <th key={i} className="px-10 py-0.5 text-center font-bold text-gray-500 border-b border-gray-300 whitespace-nowrap text-[12px]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {problem.choices.map((choice, ci) => {
                const prefix = ['①', '②', '③', '④', '⑤'][ci] || '';
                const stripped = choice.replace(/^[①②③④⑤]\s*/, '').replace(/^\(\s*\d+\s*\)\s*/, '').trim();
                // 백워드 호환: PR #124 가 ' / ' 로 join 한 초기 데이터도 인식 (이후 저장은 모두 ' | ')
                const cells = stripped.split(/\s*\|\s*|\s+\/\s+/).map(s => cleanChoiceText(s.trim()));
                return (
                  <tr key={ci}>
                    <td className="px-1.5 py-0.5 text-gray-500 whitespace-nowrap">{prefix}</td>
                    {Array.from({ length: colCount }, (_, j) => (
                      <td key={j} className="px-10 py-0.5 text-center text-gray-700 whitespace-nowrap">
                        <MixedContentRenderer content={cells[j] || ''} className="text-gray-700" />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    // 서술형 문제 감지
    const subProblemPatterns = /구하시오|구하여라|구해라|서술하시오|설명하시오|증명하시오|나타내시오|보이시오|판단하시오|풀이과정|\[\s*\d+\s*점\s*\]/;
    const hasParenPrefix = problem.choices.some(c => /^\(\d+\)/.test(c));
    const isSubProblem = hasParenPrefix || problem.choices.some(c => subProblemPatterns.test(c));

    if (isSubProblem) {
      return (
        <div className="mt-2 space-y-1.5">
          {problem.choices.map((choice, ci) => {
            const stripped = cleanChoiceText(
              choice.replace(/^[①②③④⑤]\s*/, '').replace(/^\(\d+\)\s*/, '').trim()
            );
            return (
              <div key={ci} className="flex items-start gap-1.5 text-[13.5px] text-gray-700" style={{ lineHeight: '1.65' }}>
                <span className="flex-shrink-0 font-semibold text-gray-900">({ci + 1})</span>
                <MixedContentRenderer content={stripped} className="text-gray-700" />
              </div>
            );
          })}
        </div>
      );
    }

    const items = problem.choices.map((c, ci) => ({
      prefix: ['①', '②', '③', '④', '⑤'][ci] || '',
      content: cleanChoiceText(
        c.replace(/^[①②③④⑤]\s*/, '').replace(/^\(\s*\d+\s*\)\s*/, '')
      ),
      // ★ 그림 객관식 보기 이미지 (index 0~4 = ①~⑤). Storage URL 은 proxyUrl 로 변환.
      imgUrl: (problem.choiceImages?.[ci] || null),
    }));
    const maxLen = Math.max(...items.map(c => c.content.replace(/\$[^$]*\$/g, 'XX').replace(/\\[a-z]+/gi, '').length + 2));

    // ★ 그림 객관식 — 보기에 이미지가 하나라도 있으면 inline(가로) 회피하고 그리드/세로로.
    //   이미지 보기는 텍스트가 비어 "(문제 내용 없음)" 으로 떨어지던 사고 → <img> 로 렌더.
    const hasChoiceImage = items.some((it) => !!it.imgUrl);

    // ★ 저장된 choiceLayout 우선 적용 (1=1열, 2=2열, 3=3열, 5=가로)
    const savedLayout = problem.choiceLayout;
    let gridClass = 'mt-2.5 space-y-1.5'; // 기본: 1열
    let isInline = false;
    if (savedLayout) {
      if (savedLayout === 5) { isInline = true; }
      else if (savedLayout === 3) { gridClass = 'mt-2.5 grid grid-cols-3 gap-x-6 gap-y-2.5'; }
      else if (savedLayout === 2) { gridClass = 'mt-2.5 grid grid-cols-2 gap-x-8 gap-y-2.5'; }
    } else {
      if (maxLen <= 12) isInline = true;
      else if (maxLen <= 24) gridClass = 'mt-2.5 grid grid-cols-2 gap-x-8 gap-y-2.5';
    }
    // ★ 그림 객관식이면 inline 강제 해제 + 2열 그리드 기본 (그래프 보기는 폭이 커서 가로 부적합).
    if (hasChoiceImage) {
      isInline = false;
      if (!savedLayout || savedLayout === 5) gridClass = 'mt-2.5 grid grid-cols-2 gap-x-8 gap-y-2.5';
    }

    // ★ 보기 1개 렌더 — 이미지 있으면 <img>(+캡션), 없으면 텍스트.
    const renderChoiceBody = (it: { content: string; imgUrl: string | null }) =>
      it.imgUrl ? (
        <div className="flex flex-col gap-0.5">
          <img
            src={proxyUrl(it.imgUrl)}
            alt="보기"
            className="max-w-full h-auto rounded border border-gray-200"
            style={{ maxHeight: '170px' }}
            loading="lazy"
          />
          {it.content && <MixedContentRenderer content={it.content} className="text-gray-700" />}
        </div>
      ) : (
        <MixedContentRenderer content={it.content} className="text-gray-700" />
      );

    if (isInline) {
      return (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-9 gap-y-2">
          {items.map((it, ci) => (
            <div key={ci} className="flex items-center gap-2 text-[13.5px] text-gray-700" style={{ lineHeight: '1.65' }}>
              <span className="flex-shrink-0 text-gray-500">{it.prefix}</span>
              {renderChoiceBody(it)}
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className={gridClass}>
        {items.map((it, ci) => (
          <div key={ci} className="flex items-start gap-1 text-[13.5px] text-gray-700" style={{ lineHeight: '1.65' }}>
            <span className="flex-shrink-0 text-gray-500">{it.prefix}</span>
            {renderChoiceBody(it)}
          </div>
        ))}
      </div>
    );
  };

  // ★ 배점 배지 — '?' 바로 뒤에 배치 (사용자 요청: ? 뒤에 배점)
  //   content 내부 '?' 없으면 content 끝에 표시
  const hasPoints = typeof problem.points === 'number' && problem.points > 0;
  const pointsBadge = hasPoints ? (
    <span className="ml-1 text-gray-500 font-medium" style={{ fontSize: `calc(${textSize} - 1px)` }}>
      [{problem.points}점]
    </span>
  ) : null;

  /**
   * 텍스트에서 첫 번째 '?'를 찾아 그 직후에 배지를 삽입한다.
   * $$...$$ 수식 내부의 '?'는 무시 (보통 문제문 '?'는 수식 밖)
   * @returns [beforeWithQ, afterQ, found]
   */
  const splitAtFirstQuestionMark = (text: string): [string, string, boolean] => {
    let inDollar = false;
    let inSingleDollar = false;
    let firstNewlineIdx = -1;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];
      // $$ (block math) 진입/종료
      if (ch === '$' && next === '$') { inDollar = !inDollar; i++; continue; }
      // 단일 $ 진입/종료 (블록 모드 아닐 때만)
      if (ch === '$' && !inDollar) { inSingleDollar = !inSingleDollar; continue; }
      // 수식 밖의 '?'만 매칭 — 있으면 그 뒤에 배지
      if (ch === '?' && !inDollar && !inSingleDollar) {
        return [text.slice(0, i + 1), text.slice(i + 1), true];
      }
      // 수식 밖 첫 줄바꿈 기억 (폴백용)
      if (ch === '\n' && !inDollar && !inSingleDollar && firstNewlineIdx === -1) {
        firstNewlineIdx = i;
      }
    }
    // ★ '?' 없을 때 — 첫 줄이 "질문 지시어(~시오/~하라 등)"로 끝나는 경우에만 첫 \n 직전에 배지.
    //   (15번류: "…구하시오.\n<보기>" → 보기 박스 위에 배지.)
    //   첫 줄이 지시어로 안 끝나면(3번류: "연립방정식{…}\n의 해는\n…구하시오." 처럼 cases가
    //   먼저·질문이 뒤) 폴백하지 않고 false → isLastText 가 텍스트 끝(질문 뒤)에 배지 부착.
    //   ※ 단순 첫-\n 폴백은 3번 배지를 "의 해는" 뒤(중간)로 보내는 회귀를 일으켰음(브라우저 실측).
    if (firstNewlineIdx > 0) {
      const before = text.slice(0, firstNewlineIdx).trimEnd();
      if (/(시오|하라|여라|하시오|구하라)\s*[.?]?$/.test(before)) {
        return [text.slice(0, firstNewlineIdx), text.slice(firstNewlineIdx), true];
      }
    }
    return [text, '', false];
  };

  /** 배지가 이미 삽입됐는지 추적 (첫 번째 텍스트 파트에만 삽입) */
  let badgeInserted = false;
  const renderTextWithBadge = (rawText: string, key: string, isLastText = false) => {
    // ★ 도형/보기 주변 텍스트 파트의 선행·후행 빈 줄 제거 — 질문↔도형↔보기 과한 세로 간격 차단.
    //   (내부 \n 은 보존 → 줄바꿈·배지 \n 폴백 로직 불변)
    const text = rawText.replace(/^\s*\n+\s*/, '').replace(/\s*\n+\s*$/, '');
    if (!hasPoints || badgeInserted) {
      return <MixedContentRenderer key={key} content={text} className="text-gray-800" />;
    }
    const [before, after, found] = splitAtFirstQuestionMark(text);
    if (found) {
      badgeInserted = true;
      // before에 inline prop → MCR wrapper가 <span display:contents>로 렌더 → 뱃지가 같은 줄에 표시
      return (
        <React.Fragment key={key}>
          <MixedContentRenderer content={before} className="text-gray-800" inline />
          {pointsBadge}
          {after && <MixedContentRenderer content={after} className="text-gray-800" />}
        </React.Fragment>
      );
    }
    // '?' 없음 — 마지막 텍스트 파트면 끝에 붙여 그림 아래로 떨어지지 않게 한다
    if (isLastText) {
      badgeInserted = true;
      return (
        <React.Fragment key={key}>
          <MixedContentRenderer content={text} className="text-gray-800" inline />
          {pointsBadge}
        </React.Fragment>
      );
    }
    return <MixedContentRenderer key={key} content={text} className="text-gray-800" />;
  };

  // content + 인라인 도형 렌더링
  const renderContentWithFigures = () => {
    if (hasFigureInContent && hasFigureSource) {
      // 플로트 모드 체크
      const floatPart = parts.find(p => p.type === 'figure' && p.floatMode);
      if (floatPart) {
        const fIdx = parts.indexOf(floatPart);
        const before = parts.slice(0, fIdx);
        const after = parts.slice(fIdx + 1);
        const side = floatPart.floatMode === 'left' ? 'float-left mr-3' : 'float-right ml-3';
        const wPct = floatPart.widthPercent || 40;
        // 마지막 텍스트 파트의 인덱스 (after 가 비어있으면 before 의 마지막)
        const lastTextInAfter = [...after].reverse().findIndex(p => p.type === 'text');
        const lastTextInAfterIdx = lastTextInAfter >= 0 ? after.length - 1 - lastTextInAfter : -1;
        const lastTextInBefore = [...before].reverse().findIndex(p => p.type === 'text');
        const lastTextInBeforeIdx = lastTextInBefore >= 0 ? before.length - 1 - lastTextInBefore : -1;
        const useAfterAsLast = lastTextInAfterIdx >= 0;
        return (
          <>
            {before.map((p, pi) =>
              p.type === 'text'
                ? renderTextWithBadge(p.text, `b-${pi}`, !useAfterAsLast && pi === lastTextInBeforeIdx)
                : null
            )}
            <div>
              <div className={`${side} mb-1`} style={{ width: `${wPct}%`, maxWidth: `${maxFigureWidth}px` }}>
                {renderFigure(0)}
              </div>
              {after.map((p, pi) =>
                p.type === 'text'
                  ? renderTextWithBadge(p.text, `a-${pi}`, useAfterAsLast && pi === lastTextInAfterIdx)
                  : null
              )}
              <div style={{ clear: 'both' }} />
            </div>
          </>
        );
      }

      // 일반 인라인 모드
      let figCounter = 0;
      const lastText = [...parts].reverse().findIndex(p => p.type === 'text');
      const lastTextIdx = lastText >= 0 ? parts.length - 1 - lastText : -1;
      return parts.map((part, pi) =>
        part.type === 'text' ? (
          renderTextWithBadge(part.text, String(pi), pi === lastTextIdx)
        ) : (
          <div key={pi} className="my-1 flex justify-center">
            {renderFigure(figCounter++)}
          </div>
        )
      );
    }

    // 마커 없으면 기본: content 뒤에 도형 — 단일 텍스트라 곧 마지막
    return (
      <>
        {renderTextWithBadge(cleanContent, 'main', true)}
        {hasFigureSource && (
          <div className="mt-1 flex justify-center">
            {renderFigure(0)}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="flex gap-2.5 items-start">
      <span className="font-bold text-gray-500 flex-shrink-0" style={{ fontSize: `calc(${textSize} + 7px)`, minWidth: '30px', lineHeight: 1.1 }}>
        {problem.number}.
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-gray-800 whitespace-pre-line" style={{ fontSize: textSize, lineHeight }}>
          {renderContentWithFigures()}
          {/* '?' 없는 경우 fallback: 콘텐츠 끝에 표시 */}
          {hasPoints && !badgeInserted && pointsBadge}
        </div>
        {renderChoices()}
      </div>
    </div>
  );
}

// ★ 메모이제이션 — problem이 동일하면 리렌더 skip (성능 크게 개선)
export const ExamProblemRenderer = memo(ExamProblemRendererInner, (prev, next) => {
  return (
    prev.problem === next.problem &&
    prev.gap === next.gap
  );
});
