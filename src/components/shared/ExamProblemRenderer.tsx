'use client';

import React, { memo } from 'react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { FigureRenderer } from '@/components/shared/FigureRenderer';
import { cleanLatexContent } from '@/lib/utils/clean-latex';
import type { InterpretedFigure } from '@/types/ocr';

// ============================================================================
// 공통 시험지 문제 렌더러 — 클라우드 페이지 + 시험지 관리 공용
// ============================================================================

export interface ExamRenderProblem {
  id: string;
  number: number;
  content: string;
  choices: string[];
  /** ★ 표 형식 선택지 열 헤더 (예: ["ㄱ","ㄴ","ㄷ","ㄹ"]) */
  choiceHeaders?: string[];
  /** ★ 저장된 선택지 레이아웃 (1=1열, 2=2열, 5=가로) */
  choiceLayout?: number;
  figureData?: InterpretedFigure;
  figureSvg?: string;
  upscaledCropUrl?: string;
  figureSource?: 'upscaled_crop' | 'ai_generated';
  images?: Array<{ url: string; type: string; label: string }>;
  hasFigure?: boolean;
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
  lineHeight = '1.7',
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
  const cleanContent = cleanLatexContent(
    rawContent
      .replace(/^\s*\d+\.\s*/, '')
      .replace(/\[\s*\d+(\.\d+)?\s*점\s*\]/g, '')
      .trim()
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
          <table className="border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="px-1.5 py-0.5" />
                {headers.map((h, i) => (
                  <th key={i} className="px-3 py-0.5 text-center font-bold text-gray-500 border-b border-gray-300 whitespace-nowrap text-[12px]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {problem.choices.map((choice, ci) => {
                const prefix = ['①', '②', '③', '④', '⑤'][ci] || '';
                const stripped = choice.replace(/^[①②③④⑤]\s*/, '').replace(/^\(\s*\d+\s*\)\s*/, '').trim();
                const cells = stripped.split('|').map(s => s.trim());
                return (
                  <tr key={ci}>
                    <td className="px-1.5 py-0.5 text-gray-500 whitespace-nowrap">{prefix}</td>
                    {Array.from({ length: colCount }, (_, j) => (
                      <td key={j} className="px-3 py-0.5 text-center text-gray-700 whitespace-nowrap">
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
            const stripped = choice.replace(/^[①②③④⑤]\s*/, '').replace(/^\(\d+\)\s*/, '').trim();
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
      content: c.replace(/^[①②③④⑤]\s*/, '').replace(/^\(\s*\d+\s*\)\s*/, ''),
    }));
    const maxLen = Math.max(...items.map(c => c.content.replace(/\$[^$]*\$/g, 'XX').replace(/\\[a-z]+/gi, '').length + 2));

    // ★ 저장된 choiceLayout 우선 적용 (1=1열, 2=2열, 3=3열, 5=가로)
    const savedLayout = problem.choiceLayout;
    let gridClass = 'mt-2.5 space-y-1.5'; // 기본: 1열
    let isInline = false;
    if (savedLayout) {
      if (savedLayout === 5) { isInline = true; }
      else if (savedLayout === 3) { gridClass = 'mt-2.5 grid grid-cols-3 gap-x-4 gap-y-2'; }
      else if (savedLayout === 2) { gridClass = 'mt-2.5 grid grid-cols-2 gap-x-6 gap-y-2'; }
    } else {
      if (maxLen <= 12) isInline = true;
      else if (maxLen <= 30) gridClass = 'mt-2.5 grid grid-cols-2 gap-x-6 gap-y-2';
    }

    if (isInline) {
      return (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {items.map((it, ci) => (
            <div key={ci} className="flex items-center gap-1 text-[13.5px] text-gray-700" style={{ lineHeight: '1.65' }}>
              <span className="flex-shrink-0 text-gray-500">{it.prefix}</span>
              <MixedContentRenderer content={it.content} className="text-gray-700" />
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
            <MixedContentRenderer content={it.content} className="text-gray-700" />
          </div>
        ))}
      </div>
    );
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
        return (
          <>
            {before.map((p, pi) => p.type === 'text' ? <MixedContentRenderer key={`b-${pi}`} content={p.text} className="text-gray-800" /> : null)}
            <div>
              <div className={`${side} mb-2`} style={{ width: `${wPct}%`, maxWidth: `${maxFigureWidth}px` }}>
                {renderFigure(0)}
              </div>
              {after.map((p, pi) => p.type === 'text' ? <MixedContentRenderer key={`a-${pi}`} content={p.text} className="text-gray-800" /> : null)}
              <div style={{ clear: 'both' }} />
            </div>
          </>
        );
      }

      // 일반 인라인 모드
      let figCounter = 0;
      return parts.map((part, pi) =>
        part.type === 'text' ? (
          <MixedContentRenderer key={pi} content={part.text} className="text-gray-800" />
        ) : (
          <div key={pi} className="my-2 flex justify-center">
            {renderFigure(figCounter++)}
          </div>
        )
      );
    }

    // 마커 없으면 기본: content 뒤에 도형
    return (
      <>
        <MixedContentRenderer content={cleanContent} className="text-gray-800" />
        {hasFigureSource && (
          <div className="mt-2 flex justify-center">
            {renderFigure(0)}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="flex gap-2.5">
      <span className="font-bold text-gray-900 flex-shrink-0" style={{ fontSize: textSize, minWidth: '24px', lineHeight }}>
        {problem.number}.
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-gray-800 whitespace-pre-line" style={{ fontSize: textSize, lineHeight }}>
          {renderContentWithFigures()}
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
