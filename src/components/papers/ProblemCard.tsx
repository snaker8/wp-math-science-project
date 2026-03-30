'use client';

import React from 'react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { COGNITIVE_DOMAIN_LABELS } from '@/types/analytics';

// papers/page.tsx의 Problem 인터페이스와 동일
interface Problem {
  id: string;
  content_latex: string | null;
  solution_latex: string | null;
  answer_json: Record<string, any> | null;
  images?: Array<{ url: string; type: string; label: string }> | null;
  status: string;
  source_name: string | null;
  ai_analysis: Record<string, any> | null;
  tags: string[] | null;
  created_at: string;
  classifications?: {
    type_code: string;
    difficulty: string;
    cognitive_domain: string;
    ai_confidence: number;
  }[];
}

interface ProblemCardProps {
  index: number;
  problem: Problem;
  points?: number;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  '1': '최하', '2': '하', '3': '중', '4': '상', '5': '최상',
};

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  '1': { bg: 'bg-blue-100', text: 'text-blue-700' },
  '2': { bg: 'bg-green-100', text: 'text-green-700' },
  '3': { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  '4': { bg: 'bg-orange-100', text: 'text-orange-700' },
  '5': { bg: 'bg-red-100', text: 'text-red-700' },
};

const DOMAIN_COLORS: Record<string, { bg: string; text: string }> = {
  CALCULATION: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  UNDERSTANDING: { bg: 'bg-blue-100', text: 'text-blue-700' },
  INFERENCE: { bg: 'bg-purple-100', text: 'text-purple-700' },
  PROBLEM_SOLVING: { bg: 'bg-amber-100', text: 'text-amber-700' },
};

export function ProblemCard({ index, problem, points }: ProblemCardProps) {
  const cls = problem.classifications?.[0];
  const ai = problem.ai_analysis as any;
  const classification = ai?.classification;

  // 유형 코드 & 이름
  const typeCode = cls?.type_code || classification?.typeCode || '';
  const typeName = classification?.typeName || '';

  // 난이도
  const diffStr = cls?.difficulty || String(classification?.difficulty || '3');
  const diffLabel = DIFFICULTY_LABELS[diffStr] || '중';
  const diffColor = DIFFICULTY_COLORS[diffStr] || DIFFICULTY_COLORS['3'];

  // 인지영역
  const domain = cls?.cognitive_domain || classification?.cognitiveDomain || '';
  const domainLabel = COGNITIVE_DOMAIN_LABELS[domain] || domain;
  const domainColor = DOMAIN_COLORS[domain] || DOMAIN_COLORS['UNDERSTANDING'];

  // 정답
  const answerJson = problem.answer_json as any;
  const finalAnswer = answerJson?.finalAnswer || answerJson?.correct_answer || '';

  // 콘텐츠 분리: 본문 vs 선택지
  const content = problem.content_latex || '';
  const { body, choices: extractedChoices } = extractChoices(content);

  // ★ 1순위: answer_json.choices (자산화 시 별도 저장된 선택지), 2순위: content_latex에서 추출
  const answerChoices: string[] = Array.isArray(answerJson?.choices) ? answerJson.choices : [];
  const choices = answerChoices.length > 0 ? answerChoices : extractedChoices;
  // answer_json.choices가 있으면 body를 full content로 사용 (content_latex에서 추출할 필요 없음)
  const bodyText = answerChoices.length > 0 ? content : body;

  // source에서 학교/연도 추출
  const sourceTags = extractSourceTags(problem.source_name);

  return (
    <div className="pb-4 mb-4 border-b border-gray-200 last:border-b-0 last:mb-0 last:pb-0">
      {/* 헤더: 번호 + 유형코드 + 유형명 + 배지 */}
      <div className="flex items-start gap-2 mb-2 flex-wrap">
        <span className="text-base font-bold text-gray-900 shrink-0">
          {String(index).padStart(2, '0')}
        </span>

        {typeCode && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
            {typeCode}
          </span>
        )}

        {typeName && (
          <span className="text-xs text-gray-600">{typeName}</span>
        )}

        {/* 난이도 배지 */}
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${diffColor.bg} ${diffColor.text}`}>
          {diffLabel}
        </span>

        {/* 인지영역 배지 */}
        {domainLabel && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${domainColor.bg} ${domainColor.text}`}>
            {domainLabel}
          </span>
        )}
      </div>

      {/* 문제 본문 */}
      <div className="pl-7">
        <MixedContentRenderer
          content={bodyText}
          className="text-sm text-gray-800 leading-relaxed"
        />

        {/* 크롭 이미지 표시: 도형 포함 문제(hasFigure)이고 AI 도형이 아직 없는 경우에만 원본 크롭 표시 */}
        {(() => {
          const hasFigure = problem.ai_analysis?.hasFigure === true;
          const hasAIFigure = !!(problem.ai_analysis?.figureData || problem.ai_analysis?.figureSvg || problem.ai_analysis?.upscaledCropUrl);
          const figureImages = (problem.images || []).filter(img => img.type === 'crop');
          // 도형 문제이면서 AI 도형이 아직 없는 경우에만 원본 크롭 이미지 표시
          if (hasFigure && !hasAIFigure && figureImages.length > 0 && !content.includes('![')) {
            return (
              <div className="mt-2 space-y-2">
                {figureImages.map((img, i) => (
                  <img
                    key={i}
                    src={img.url}
                    alt={img.label || '문제 이미지'}
                    className="max-w-full h-auto rounded-lg border border-gray-200 shadow-sm"
                    style={{ maxHeight: '400px' }}
                    loading="lazy"
                  />
                ))}
              </div>
            );
          }
          return null;
        })()}

        {/* 배점 표시 */}
        {points && (
          <span className="text-xs text-gray-400 ml-1">[{points}점]</span>
        )}

        {/* 선택지 — ① 번호를 분리하여 MixedContentRenderer의 stripTrailingChoiceLines 회피 */}
        {choices.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
            {choices.map((choice, i) => {
              const stripped = choice.replace(/^[①②③④⑤]\s*/, '').replace(/^\(\s*\d+\s*\)\s*/, '');
              const prefix = ['①', '②', '③', '④', '⑤'][i] || '';
              return (
                <div key={i} className="flex items-start gap-1 text-sm text-gray-700">
                  <span className="flex-shrink-0 text-gray-500">{prefix}</span>
                  <MixedContentRenderer content={stripped} />
                </div>
              );
            })}
          </div>
        )}

        {/* 태그: 학교/연도 */}
        {sourceTags.length > 0 && (
          <div className="mt-2 flex gap-1">
            {sourceTags.map((tag, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-500">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * content_latex에서 선택지 (①②③④⑤ 또는 (1)(2)(3)(4)(5)) 분리
 */
function extractChoices(text: string): { body: string; choices: string[] } {
  const circledNumbers = ['①', '②', '③', '④', '⑤'];

  // 1차: ①~⑤ 패턴 시도
  const firstCircledIdx = circledNumbers
    .map((c) => text.indexOf(c))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];

  if (firstCircledIdx !== undefined) {
    const body = text.substring(0, firstCircledIdx).trim();
    const choiceSection = text.substring(firstCircledIdx);

    const choices: string[] = [];
    for (let i = 0; i < circledNumbers.length; i++) {
      const start = choiceSection.indexOf(circledNumbers[i]);
      if (start < 0) continue;
      const nextStarts = circledNumbers
        .slice(i + 1)
        .map((c) => choiceSection.indexOf(c))
        .filter((idx) => idx > start);
      const end = nextStarts.length > 0 ? Math.min(...nextStarts) : choiceSection.length;
      choices.push(choiceSection.substring(start, end).trim());
    }

    // ★ 서술형 소문제 검증: 선택지 내용이 길거나 서술형 키워드가 있으면 선택지가 아님
    const subProblemKeywords = /구하시오|구하여라|구해라|서술하시오|설명하시오|증명하시오|나타내시오|보이시오|판단하시오|풀이\s*과정|쓰시오|쓰고|답하시오|완성하시오|그리시오|작도하시오|구하세요|구해\s*보시오|넓이를?\s*구|길이를?\s*구|값을?\s*구|과정을?\s*쓰|\[\s*\d+\s*점\s*\]|\d+점/;
    const choiceTexts = choices.map(c => c.replace(/^[①②③④⑤]\s*/, '').trim());
    const longCount = choiceTexts.filter(c => c.length > 30).length;
    const subProblemCount = choiceTexts.filter(c => subProblemKeywords.test(c)).length;
    if (subProblemCount > 0 || (longCount >= 2 && choices.length <= 3)) {
      // 서술형 소문제 → 선택지 분리 안 함
      return { body: text, choices: [] };
    }

    return { body, choices };
  }

  // 2차: (1)~(5) 패턴 시도 → 소문제인지 선택지인지 판별
  const firstNumberedIdx = text.indexOf('(1)');
  if (firstNumberedIdx !== -1) {
    const remaining = text.substring(firstNumberedIdx);

    // ★ 소문제 판별: (1) 뒤에 "구하시오", "구하여라", "구해라", "[N점]", "서술하시오" 등이 있으면 소문제
    const subProblemPatterns = /구하시오|구하여라|구해라|서술하시오|설명하시오|증명하시오|나타내시오|보이시오|판단하시오|풀이과정|\[\s*\d+\s*점\s*\]/;
    if (subProblemPatterns.test(remaining)) {
      // 소문제이므로 선택지로 분리하지 않고 본문에 포함
      return { body: text, choices: [] };
    }

    // 선택지 분리
    const numberedMarkers = ['(1)', '(2)', '(3)', '(4)', '(5)'];
    const body = text.substring(0, firstNumberedIdx).trim();

    const choices: string[] = [];
    for (let i = 0; i < numberedMarkers.length; i++) {
      const marker = numberedMarkers[i];
      const nextMarker = numberedMarkers[i + 1];
      const startIdx = remaining.indexOf(marker);
      if (startIdx === -1) continue;

      let endIdx = nextMarker ? remaining.indexOf(nextMarker) : remaining.length;
      if (endIdx === -1) endIdx = remaining.length;

      let choiceText = remaining.substring(startIdx, endIdx).trim();
      // (1) → ① 변환
      choiceText = choiceText.replace(/^\((\d)\)/, (_, num: string) => circledNumbers[parseInt(num) - 1] || `(${num})`);
      if (choiceText) choices.push(choiceText);
    }

    return { body, choices };
  }

  return { body: text, choices: [] };
}

/**
 * source_name에서 학교명/연도 태그 추출
 * 예: "2025 경남고1 공통수학1 1학기 중간.pdf" → ["경남고", "2025"]
 */
function extractSourceTags(sourceName: string | null): string[] {
  if (!sourceName) return [];
  const tags: string[] = [];

  // 연도 추출
  const yearMatch = sourceName.match(/(\d{4})/);
  if (yearMatch) tags.push(yearMatch[1]);

  // 학교명 추출 (한글로 된 ~고, ~중 패턴)
  const schoolMatch = sourceName.match(/([가-힣]+(?:고|중|대))/);
  if (schoolMatch) tags.push(schoolMatch[1]);

  return tags;
}
