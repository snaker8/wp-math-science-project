'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ShoppingCart,
  Sparkles,
  BarChart3,
  LayoutList,
  ScrollText,
  CheckSquare,
  BookOpenCheck,
  MoreVertical,
  Copy,
  Pencil,
  AlertCircle,
  Printer,
  Columns2,
  AlignJustify,
  Check,
  X,
  Image as ImageIcon,
  Type,
  RefreshCw,
  Shapes,
  Trash2,
  CheckCheck,
  FileEdit,
  Move,
  ScanLine,
  Loader2,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { FigureRenderer, figureTypeLabel } from '@/components/shared/FigureRenderer';
import { ImagePositionEditor } from '@/components/shared/ImagePositionEditor';
import { TwinProblemModal } from '@/components/papers/TwinProblemModal';
import { ExamStatsModal } from '@/components/papers/ExamStatsModal';
import { ProblemEditModal } from '@/components/papers/ProblemEditModal';
import { ExamPaperHeader } from '@/components/exam/ExamPaperHeader';
import { TemplateSelector } from '@/components/exam/TemplateSelector';
import { DEFAULT_EXAM_META, type ExamMeta } from '@/config/exam-templates';
import { useExamProblems } from '@/hooks/useExamProblems';
import type { InterpretedFigure } from '@/types/ocr';

// ============================================================================
// Types
// ============================================================================

interface ProblemData {
  id: string;
  number: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  cognitiveDomain: 'CALCULATION' | 'UNDERSTANDING' | 'INFERENCE' | 'PROBLEM_SOLVING';
  content: string;
  choices: string[];
  answer: number | string;
  solution: string;
  year: string;
  typeCode: string;
  typeName: string;
  source: string;
  images?: Array<{ url: string; type: string; label: string }>;
  hasFigure?: boolean;
  figureSvg?: string;
  figureData?: InterpretedFigure;
}

type DifficultyKey = 1 | 2 | 3 | 4 | 5;
type DomainKey = 'CALCULATION' | 'UNDERSTANDING' | 'INFERENCE' | 'PROBLEM_SOLVING' | 'UNASSIGNED';

// ============================================================================
// Constants
// ============================================================================

const DIFFICULTY_CONFIG: Record<DifficultyKey, { label: string; border: string; bg: string; text: string }> = {
  1: { label: '최하', border: 'border-zinc-500', bg: 'bg-surface-raised', text: 'text-content-secondary' },
  2: { label: '하', border: 'border-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  3: { label: '중', border: 'border-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  4: { label: '상', border: 'border-red-500', bg: 'bg-red-500/10', text: 'text-red-400' },
  5: { label: '최상', border: 'border-red-700', bg: 'bg-red-700/10', text: 'text-red-300' },
};

const DOMAIN_CONFIG: Record<string, { label: string; border: string; bg: string; text: string }> = {
  CALCULATION: { label: '계산', border: 'border-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  UNDERSTANDING: { label: '이해', border: 'border-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  INFERENCE: { label: '추론', border: 'border-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400' },
  PROBLEM_SOLVING: { label: '해결', border: 'border-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  UNASSIGNED: { label: '미지정', border: 'border-zinc-600', bg: 'bg-surface-raised', text: 'text-content-tertiary' },
};

// ============================================================================
// Mock Data Generator
// ============================================================================

function generateMockProblems(): ProblemData[] {
  const problems: ProblemData[] = [
    {
      id: 'p1', number: 1, difficulty: 2, cognitiveDomain: 'CALCULATION',
      content: '다항식 $A = x^2 + xy + 3y^2$, $B = 2x^2 - xy + 2y^2$ 에 대하여\n$3(A - X) = 3B - 2X$ 를 만족시키는 다항식 X 는?',
      choices: ['① $x^2 + 2xy + y^2$', '② $-x^2 + 2xy + y^2$', '③ $x^2 - 4xy - 4y^2$', '④ $3x^2 + 3xy + 3y^2$', '⑤ $-3x^2 + 6xy + 3y^2$'],
      answer: 5, solution: '$3(A-X) = 3B - 2X$에서 $X = 3A - 3B = -3x^2+6xy+3y^2$',
      year: '2025', typeCode: 'A001', typeName: '다항식의 덧셈과 뺄셈', source: '용인고',
    },
    {
      id: 'p2', number: 2, difficulty: 2, cognitiveDomain: 'UNDERSTANDING',
      content: '$x - y = -3$, $xy = 3$일 때, $\\frac{x^2}{y} - \\frac{y^2}{x}$ 의 값은?',
      choices: ['① $-18$', '② $-9$', '③ $-3$', '④ $3$', '⑤ $18$'],
      answer: 1, solution: '$\\frac{x^3-y^3}{xy} = \\frac{(-3)(18)}{3} = -18$',
      year: '2025', typeCode: 'A006', typeName: '곱셈공식의 변형(문자 2개)', source: '용인고',
    },
    {
      id: 'p3', number: 3, difficulty: 3, cognitiveDomain: 'UNDERSTANDING',
      content: '이차방정식 $2x^2 + kx - 3 = 0$의 두 근이 $\\alpha$, $\\beta$이고\n$(1-\\alpha)(2-2\\beta) = 6$일 때, $(1+\\alpha)(1+\\beta)$의 값은?',
      choices: ['① $-7$', '② $-6$', '③ $-5$', '④ $-4$', '⑤ $-3$'],
      answer: 4, solution: '근과 계수의 관계에서 $k=7$이고 $(1+\\alpha)(1+\\beta) = -4$',
      year: '2025', typeCode: 'A058', typeName: '이차방정식의 근과 계수의 관계', source: '용인고',
    },
    {
      id: 'p4', number: 4, difficulty: 4, cognitiveDomain: 'INFERENCE',
      content: '다항식 $x^{20} - x$를 $(x-1)^2$으로 나누었을 때의 나머지를\n$R(x)$라 할 때, $R(2)$의 값은?',
      choices: ['① $18$', '② $19$', '③ $20$', '④ $21$', '⑤ $22$'],
      answer: 2, solution: '$f\'(1)=19$에서 $R(x)=19x-19$, $R(2)=19$',
      year: '2025', typeCode: 'A036', typeName: '인수정리를 이용한 인수분해', source: '용인고',
    },
  ];

  return problems;
}

// ============================================================================
// Sub-Components
// ============================================================================

function DifficultyBadge({ level }: { level: DifficultyKey }) {
  const cfg = DIFFICULTY_CONFIG[level];
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${cfg.border} ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function DomainBadge({ domain }: { domain: string }) {
  const cfg = DOMAIN_CONFIG[domain] || DOMAIN_CONFIG['UNASSIGNED'];
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${cfg.border} ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function FilterBadge({
  label,
  count,
  borderColor,
  active,
  onClick,
}: {
  label: string;
  count: number;
  borderColor: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium transition-colors ${
        active
          ? `${borderColor} bg-white/5`
          : 'border-subtle bg-surface-raised/50 text-content-tertiary hover:border-zinc-500'
      }`}
    >
      <span className="text-[10px] pr-1">{label}</span>
      <span className="font-bold">{count}</span>
    </button>
  );
}

/** [도형] 마커를 SVG 또는 크롭 이미지로 교체하여 콘텐츠를 분할 */
function splitContentByFigureMarker(content: string): Array<{ type: 'text' | 'figure'; text: string }> {
  const marker = '[도형]';
  if (!content.includes(marker)) return [{ type: 'text', text: content }];

  const parts: Array<{ type: 'text' | 'figure'; text: string }> = [];
  const segments = content.split(marker);
  segments.forEach((seg, i) => {
    if (seg.trim()) parts.push({ type: 'text', text: seg });
    if (i < segments.length - 1) parts.push({ type: 'figure', text: '' });
  });
  return parts;
}

function ProblemCardView({
  problem,
  onTwinGenerate,
  onEdit,
  onRescan,
  onGenerateFigure,
  onDeleteFigure,
  onUpdateContent,
  isSelectionMode,
  isSelected,
  onToggleSelect,
  viewMode: globalViewMode,
  isGeneratingFigure,
  isRescanning,
}: {
  problem: ProblemData;
  onTwinGenerate: (p: ProblemData) => void;
  onEdit?: (p: ProblemData) => void;
  onRescan?: (p: ProblemData) => void;
  onGenerateFigure?: (p: ProblemData) => void;
  onDeleteFigure?: (p: ProblemData) => void;
  onUpdateContent?: (problemId: string, content: string) => Promise<void>;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  viewMode?: 'clean' | 'original';
  isGeneratingFigure?: boolean;
  isRescanning?: boolean;
}) {
  const [isEditingPosition, setIsEditingPosition] = useState(false);
  const [showFigureCompare, setShowFigureCompare] = useState(false);
  const cropImage = problem.images?.find(img => img.type === 'crop');
  const showOriginal = globalViewMode === 'original' && !!cropImage;
  const hasFigureContent = problem.figureData || problem.figureSvg || cropImage;

  // ★ 클린 모드: 콘텐츠 내 마크다운 이미지 참조 제거
  // figureData가 있거나 cropImage가 있으면 이미지 URL은 별도 렌더링됨
  const cleanContent = problem.content.replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();

  const contentParts = splitContentByFigureMarker(cleanContent);
  const hasFigureMarker = contentParts.some(p => p.type === 'figure');

  return (
    <div
      className={`group rounded-xl border transition-all cursor-pointer ${
        isSelectionMode && isSelected
          ? 'border-cyan-500 bg-cyan-500/5 ring-1 ring-cyan-500/30'
          : isEditingPosition
          ? 'border-violet-500 bg-violet-500/5 ring-1 ring-violet-500/20'
          : 'border-subtle bg-surface-card/80 hover:border-accent/30'
      }`}
      onClick={isSelectionMode ? () => onToggleSelect?.(problem.id) : undefined}
    >
      {/* 카드 헤더: 난이도 + 인지영역 + 액션 버튼/체크 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-1.5">
          <DifficultyBadge level={problem.difficulty} />
          <DomainBadge domain={problem.cognitiveDomain} />
          {cropImage && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
              원본 있음
            </span>
          )}
          {problem.hasFigure && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
              problem.figureData || problem.figureSvg
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
            }`}>
              {problem.figureData
                ? figureTypeLabel(problem.figureData.figureType)
                : problem.figureSvg ? '도형 SVG' : '도형 있음'}
            </span>
          )}
        </div>
        {isSelectionMode ? (
          <div
            className={`flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all ${
              isSelected
                ? 'border-cyan-500 bg-cyan-500 text-white'
                : 'border-zinc-600 bg-surface-raised text-transparent hover:border-zinc-400'
            }`}
          >
            <Check className="h-3.5 w-3.5" />
          </div>
        ) : (
          <div className="flex items-center gap-0.5">
            {/* ★ 이미지 위치 편집 버튼 (도형/크롭 이미지가 있을 때) */}
            {hasFigureContent && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsEditingPosition(!isEditingPosition); }}
                className={`p-1 rounded transition-colors ${
                  isEditingPosition
                    ? 'text-violet-400 bg-violet-500/20'
                    : 'text-content-muted hover:text-violet-400 hover:bg-violet-500/10'
                }`}
                title="이미지 위치 편집"
              >
                <Move className="h-3.5 w-3.5" />
              </button>
            )}
            {/* ★ 도형 재생성 버튼 (크롭 이미지 있거나, 도형이 있었던 문제면 항상 표시) */}
            {(cropImage || problem.hasFigure || (problem.images && problem.images.length > 0)) && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onGenerateFigure?.(problem); }}
                className={`p-1 rounded transition-colors ${
                  isGeneratingFigure
                    ? 'text-amber-400 animate-spin'
                    : 'text-content-muted hover:text-orange-400 hover:bg-orange-500/10'
                }`}
                title={problem.figureData ? '도형 재생성' : problem.figureSvg ? '도형 재생성' : '도형 AI 생성'}
                disabled={isGeneratingFigure}
              >
                {isGeneratingFigure ? <RefreshCw className="h-3.5 w-3.5" /> : <Shapes className="h-3.5 w-3.5" />}
              </button>
            )}
            {/* ★ 도형 삭제 버튼 (AI 생성 도형이 있을 때만) */}
            {(problem.figureData || problem.figureSvg) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('AI 생성 도형을 삭제하시겠습니까?\n원본 크롭 이미지는 유지됩니다.')) {
                    onDeleteFigure?.(problem);
                  }
                }}
                className="p-1 rounded text-content-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="AI 도형 삭제 (원본 유지)"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            {/* ★ 원본/AI 비교 토글 (크롭 이미지 + AI 도형 둘 다 있을 때) */}
            {cropImage && (problem.figureData || problem.figureSvg) && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowFigureCompare(!showFigureCompare); }}
                className={`p-1 rounded transition-colors ${
                  showFigureCompare
                    ? 'text-blue-400 bg-blue-500/20'
                    : 'text-content-muted hover:text-blue-400 hover:bg-blue-500/10'
                }`}
                title="원본/AI 도형 비교"
              >
                <Columns2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onTwinGenerate(problem); }}
              className="p-1 rounded text-content-muted hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
              title="유사문제 만들기"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="p-1 rounded text-content-muted hover:text-content-primary hover:bg-surface-raised transition-colors" title="복사해서 만들기">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRescan?.(problem); }}
              className={`p-1 rounded transition-colors ${isRescanning ? 'text-green-400 animate-pulse' : 'text-content-muted hover:text-green-400 hover:bg-green-500/10'}`}
              title="이미지로 재스캔 (문제 교체)"
              disabled={isRescanning}
            >
              {isRescanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit?.(problem); }}
              className="p-1 rounded text-content-muted hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
              title="수정하기"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 문제 본문 */}
      <div className="px-4 pb-3">
        {isEditingPosition && hasFigureContent ? (
          /* ★ 이미지 위치 편집 모드 */
          <div>
            <span className="text-sm font-bold text-content-primary mr-2 mb-2 inline-block">{problem.number}.</span>
            <ImagePositionEditor
              content={cleanContent}
              figureData={problem.figureData}
              figureSvg={problem.figureSvg}
              cropImageUrl={cropImage?.url}
              onSave={async (updatedContent) => {
                await onUpdateContent?.(problem.id, updatedContent);
                setIsEditingPosition(false);
              }}
              onCancel={() => setIsEditingPosition(false)}
            />
          </div>
        ) : showOriginal ? (
          /* 원본 크롭 이미지 모드 */
          <div className="relative">
            <img
              src={cropImage!.url}
              alt={`문제 ${problem.number} 원본`}
              className="w-full rounded-lg border"
              loading="lazy"
            />
          </div>
        ) : (
          /* 클린 렌더링 모드 (기본) */
          <>
            <div className="mb-2">
              <span className="text-sm font-bold text-content-primary mr-2">{problem.number}.</span>
              {hasFigureMarker ? (
                /* 도형 마커가 있는 경우: 텍스트/도형 분할 렌더링 */
                <div className="inline">
                  {contentParts.map((part, i) => (
                    part.type === 'text' ? (
                      <MixedContentRenderer
                        key={i}
                        content={part.text}
                        className="inline text-sm text-content-secondary leading-relaxed"
                      />
                    ) : (problem.figureData || problem.figureSvg) ? (
                      /* ① AI 도형 생성됨 → AI 도형 표시 (비교 모드 포함) */
                      showFigureCompare && cropImage ? (
                        <div key={i} className="my-2 grid grid-cols-2 gap-3">
                          <div className="flex flex-col items-center">
                            <span className="text-[10px] text-blue-400 font-semibold mb-1">원본</span>
                            <img src={cropImage.url} alt="원본 도형" className="rounded border border-blue-500/30 max-h-48 object-contain" loading="lazy" />
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-[10px] text-emerald-400 font-semibold mb-1">AI 생성</span>
                            <div className="border border-emerald-500/30 rounded p-1">
                              <FigureRenderer figureData={problem.figureData} figureSvg={problem.figureSvg} maxWidth={200} darkMode />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div key={i} className="my-2 flex justify-center">
                          <FigureRenderer figureData={problem.figureData} figureSvg={problem.figureSvg} maxWidth={300} darkMode />
                        </div>
                      )
                    ) : cropImage ? (
                      /* ② AI 도형 아직 없음 → 원본 크롭 이미지로 도형 위치 표시 */
                      <div key={i} className="my-2 flex justify-center">
                        <div className="relative">
                          <img
                            src={cropImage.url}
                            alt={`문제 ${problem.number} 원본 도형`}
                            className="rounded-lg border border-zinc-700 max-h-64 object-contain"
                            loading="lazy"
                            onError={(e) => {
                              const parent = e.currentTarget.parentElement;
                              if (parent) {
                                parent.innerHTML = `<div class="flex flex-col items-center justify-center gap-2 py-6 px-8 border-2 border-dashed border-orange-500/30 rounded-lg bg-orange-500/5"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-orange-400"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg><span class="text-xs text-orange-400 font-medium">도형 포함 — 도형 생성 버튼을 클릭하세요</span></div>`;
                              }
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      /* ③ 크롭 이미지도 없음 → 플레이스홀더 */
                      <div key={i} className="my-2 flex justify-center">
                        <div className="flex flex-col items-center justify-center gap-2 py-6 px-8 border-2 border-dashed border-orange-500/30 rounded-lg bg-orange-500/5">
                          <Shapes className="h-6 w-6 text-orange-400" />
                          <span className="text-xs text-orange-400 font-medium">도형 포함 — 도형 생성 버튼을 클릭하세요</span>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              ) : (
                /* 일반 콘텐츠 렌더링 */
                <>
                  <MixedContentRenderer
                    content={cleanContent}
                    className="inline text-sm text-content-secondary leading-relaxed"
                  />
                  {/* AI 도형이 있지만 마커가 없는 경우 (기존 문제) → 하단에 표시 */}
                  {(problem.figureData || problem.figureSvg) && (
                    showFigureCompare && cropImage ? (
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-blue-400 font-semibold mb-1">원본</span>
                          <img src={cropImage.url} alt="원본 도형" className="rounded border border-blue-500/30 max-h-48 object-contain" loading="lazy" />
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-emerald-400 font-semibold mb-1">AI 생성</span>
                          <div className="border border-emerald-500/30 rounded p-1">
                            <FigureRenderer figureData={problem.figureData} figureSvg={problem.figureSvg} maxWidth={200} darkMode />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex justify-center">
                        <FigureRenderer figureData={problem.figureData} figureSvg={problem.figureSvg} maxWidth={300} darkMode />
                      </div>
                    )
                  )}
                </>
              )}
            </div>

            {/* 선택지/소문제 — 유형+길이에 따라 레이아웃 자동 전환 */}
            {problem.choices.length > 0 && (() => {
              // ★ 소문제 판별: (1) 형식이거나 "구하시오/[N점]" 포함
              const subProblemPatterns = /구하시오|구하여라|구해라|서술하시오|설명하시오|증명하시오|나타내시오|보이시오|판단하시오|풀이과정|\[\s*\d+\s*점\s*\]/;
              const hasParenPrefix = problem.choices.some(c => /^\(\d+\)/.test(c));
              const isSubProblem = hasParenPrefix || problem.choices.some(c => subProblemPatterns.test(c));

              if (isSubProblem) {
                // 소문제: (1), (2), (3) 세로 배치
                return (
                  <div className="mt-3 space-y-2 pl-4">
                    {problem.choices.map((choice, i) => {
                      const stripped = choice.replace(/^[①②③④⑤]\s*/, '').replace(/^\(\d+\)\s*/, '').trim();
                      return (
                        <div key={i} className="flex items-start gap-1.5 text-[13px] text-content-secondary">
                          <span className="flex-shrink-0 text-cyan-500 font-medium">({i + 1})</span>
                          <MixedContentRenderer content={stripped} className="text-content-secondary" />
                        </div>
                      );
                    })}
                  </div>
                );
              }

              // 객관식 보기
              const processed = problem.choices.map((choice, i) => {
                const circled = ['①', '②', '③', '④', '⑤'][i] || '';
                const stripped = choice.replace(/^[①②③④⑤]\s*/, '');
                return { circled, stripped };
              });
              const maxLen = Math.max(...processed.map(c => c.stripped.replace(/\$[^$]*\$/g, 'XX').replace(/\\[a-z]+/gi, '').length));
              // 짧은 보기: 가로 나열
              if (maxLen <= 12) {
                return (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-4">
                    {processed.map((c, i) => (
                      <div key={i} className="flex items-center gap-1 text-[13px] text-content-secondary">
                        <span className="flex-shrink-0 text-content-tertiary">{c.circled}</span>
                        <MixedContentRenderer content={c.stripped} className="text-content-secondary" />
                      </div>
                    ))}
                  </div>
                );
              }
              // 중간 길이: 2열 그리드
              if (maxLen <= 30) {
                return (
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 pl-4">
                    {processed.map((c, i) => (
                      <div key={i} className="flex items-start gap-1 text-[13px] text-content-secondary">
                        <span className="flex-shrink-0 text-content-tertiary">{c.circled}</span>
                        <MixedContentRenderer content={c.stripped} className="text-content-secondary" />
                      </div>
                    ))}
                  </div>
                );
              }
              // 긴 수식: 1열 세로 배치
              return (
                <div className="mt-2 space-y-1.5 pl-4">
                  {processed.map((c, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[13px] text-content-secondary">
                      <span className="flex-shrink-0 text-content-tertiary">{c.circled}</span>
                      <MixedContentRenderer content={c.stripped} className="text-content-secondary" />
                    </div>
                  ))}
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* 카드 하단: 출처 + 유형코드.유형명 + 연도 (참조사이트 스타일) */}
      <div className="border-t border-subtle px-4 py-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {problem.source && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {problem.source}
            </span>
          )}
          {problem.typeCode && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
              {problem.typeCode}. {problem.typeName}
            </span>
          )}
          {problem.year && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {problem.year}
            </span>
          )}
        </div>
      </div>

      {/* 유형 footer (편집 가능 영역) */}
      {problem.typeCode && (
        <div className="flex items-center justify-between px-4 py-1.5 border-t border-subtle bg-surface-card/60">
          <span className="text-[11px] text-content-tertiary">유형: {problem.typeCode}. {problem.typeName}</span>
          <button type="button" className="p-0.5 text-content-muted hover:text-content-secondary" title="유형 변경">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// (MOCK_ANSWERS/MOCK_SOLUTIONS 제거됨 - ProblemData.answer/solution 사용)

// ============================================================================
// Exam Paper View (시험지)
// ============================================================================

function ExamPaperView({
  problems,
  examTitle,
  templateId,
  examMeta,
  onOpenTemplateModal,
}: {
  problems: ProblemData[];
  examTitle: string;
  templateId: string;
  examMeta: ExamMeta;
  onOpenTemplateModal: () => void;
}) {
  const [columns, setColumns] = useState<1 | 2>(2);
  const [gap, setGap] = useState(20);
  const [perPagePreset, setPerPagePreset] = useState<number | null>(null); // null=자동, 4, 6, 8
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [printSections, setPrintSections] = useState({ exam: true, answer: true, solution: false });
  const printMenuRef = useRef<HTMLDivElement>(null);

  // 출력 메뉴 외부 클릭 닫기
  useEffect(() => {
    if (!showPrintMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (printMenuRef.current && !printMenuRef.current.contains(e.target as Node)) setShowPrintMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPrintMenu]);

  const COLUMN_GAP = 28; // 고정 컬럼 간격 (px)

  // === 측정 기반 페이지네이션 ===
  const measureRef = useRef<HTMLDivElement>(null);
  const [problemHeights, setProblemHeights] = useState<number[]>([]);
  const [measured, setMeasured] = useState(false);

  // 설정 변경 시 재측정 (gap은 측정에 영향 없으므로 제외)
  useEffect(() => {
    setMeasured(false);
    setProblemHeights([]);
  }, [problems, columns]);

  // 문제 높이 측정
  useLayoutEffect(() => {
    if (measureRef.current && !measured && problems.length > 0) {
      const timer = setTimeout(() => {
        if (!measureRef.current) return;
        const els = measureRef.current.querySelectorAll('[data-problem-idx]');
        const heights = Array.from(els).map(el => el.getBoundingClientRect().height);
        if (heights.length === problems.length) {
          setProblemHeights(heights);
          setMeasured(true);
        }
      }, 300); // KaTeX 렌더링 대기
      return () => clearTimeout(timer);
    }
  }, [problems, measured]);

  // A4 상수
  const A4_W = 794;
  const A4_H = 1123;
  const PAGE_PAD = 57; // ~15mm
  const FOOTER_H = 36;
  const HEADER_H = 130;
  const CONTENT_H = A4_H - PAGE_PAD * 2 - FOOTER_H;
  const FIRST_CONTENT_H = CONTENT_H - HEADER_H;

  // 페이지 분할
  const pages = useMemo(() => {
    // 프리셋 모드: 지정된 문제 수로 강제 분할
    if (perPagePreset) {
      const result: ProblemData[][] = [];
      for (let i = 0; i < problems.length; i += perPagePreset) {
        result.push(problems.slice(i, i + perPagePreset));
      }
      return result.length > 0 ? result : [[]];
    }

    if (!measured || problemHeights.length === 0) {
      // 폴백: 대략 분할
      const perPage = columns === 2 ? 10 : 5;
      const result: ProblemData[][] = [];
      for (let i = 0; i < problems.length; i += perPage) {
        result.push(problems.slice(i, i + perPage));
      }
      return result.length > 0 ? result : [[]];
    }

    const colMult = columns === 2 ? 2 : 1;
    const result: ProblemData[][] = [];
    let currentPage: ProblemData[] = [];
    let usedH = 0;

    for (let i = 0; i < problems.length; i++) {
      const h = (problemHeights[i] + gap) / colMult;
      const maxH = result.length === 0 ? FIRST_CONTENT_H : CONTENT_H;

      if (currentPage.length > 0 && usedH + h > maxH) {
        result.push(currentPage);
        currentPage = [];
        usedH = 0;
      }
      currentPage.push(problems[i]);
      usedH += h;
    }
    if (currentPage.length > 0) result.push(currentPage);
    return result.length > 0 ? result : [[]];
  }, [problems, problemHeights, measured, columns, gap, perPagePreset, FIRST_CONTENT_H, CONTENT_H]);

  // === 프리셋 모드: 페이지별 자동 간격 계산 ===
  const pageAutoGaps = useMemo(() => {
    if (!perPagePreset || !measured || problemHeights.length === 0) return null;

    const colMult = columns === 2 ? 2 : 1;
    let globalIdx = 0;

    return pages.map((pageProblems, pageIdx) => {
      const maxH = pageIdx === 0 ? FIRST_CONTENT_H : CONTENT_H;
      let totalH = 0;
      for (let i = 0; i < pageProblems.length; i++) {
        if (globalIdx + i < problemHeights.length) {
          totalH += problemHeights[globalIdx + i];
        }
      }
      globalIdx += pageProblems.length;

      // 사용 가능 높이 = 컬럼 수 × 페이지 높이 - 전체 문제 높이
      const availableSpace = colMult * maxH - totalH;
      const numProblems = pageProblems.length;
      // 문제 간 간격을 균등 분배 (최소 8px)
      const autoGap = numProblems > 0 ? Math.max(8, Math.floor(availableSpace / numProblems)) : 20;
      return autoGap;
    });
  }, [perPagePreset, measured, problemHeights, pages, columns, FIRST_CONTENT_H, CONTENT_H]);

  // 현재 유효 간격 (프리셋 모드면 자동, 아니면 슬라이더)
  const getEffectiveGap = (pageIdx: number) => {
    if (perPagePreset && pageAutoGaps && pageAutoGaps[pageIdx] !== undefined) {
      return pageAutoGaps[pageIdx];
    }
    return gap;
  };

  // 출력 — DOM 복제 방식 (KaTeX 수식 호환)
  const handlePrint = useCallback(() => {
    setShowPrintMenu(false);
    const printRoot = document.createElement('div');
    printRoot.id = 'exam-print-root';

    // 1. 시험지 섹션
    if (printSections.exam) {
      const pages = document.querySelectorAll('.exam-page');
      pages.forEach(page => {
        printRoot.appendChild(page.cloneNode(true));
      });
    }

    // 2. 빠른정답 섹션
    if (printSections.answer) {
      const answerEl = document.querySelector('.quick-answer-print');
      if (answerEl) {
        const clone = answerEl.cloneNode(true) as HTMLElement;
        clone.classList.add('exam-page');
        clone.style.cssText = 'background:white; padding:15mm; box-sizing:border-box;';
        printRoot.appendChild(clone);
      }
    }

    // 3. 해설지 섹션
    if (printSections.solution) {
      const solutionPages = document.querySelectorAll('.solution-page');
      solutionPages.forEach(page => {
        const clone = page.cloneNode(true) as HTMLElement;
        clone.classList.add('exam-page');
        printRoot.appendChild(clone);
      });
    }

    if (printRoot.children.length === 0) return;

    document.body.appendChild(printRoot);
    window.print();
    document.body.removeChild(printRoot);
  }, [printSections]);

  // 문제 렌더링 헬퍼 (시험지 출력용)
  const renderProblem = (problem: ProblemData) => {
    const hasAiFigure = problem.figureData || problem.figureSvg;
    // ★ AI 도형 있으면 콘텐츠 내 마크다운 이미지 참조 제거 (중복 방지)
    const cleanContent = hasAiFigure
      ? problem.content.replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim()
      : problem.content;
    const parts = splitContentByFigureMarker(cleanContent);
    const hasFigureInContent = parts.some(p => p.type === 'figure');

    // 시험지 출력: AI 도형만 표시
    const renderFigureForPrint = () => {
      if (hasAiFigure) {
        return <FigureRenderer figureData={problem.figureData} figureSvg={problem.figureSvg} maxWidth={240} darkMode={false} />;
      }
      return null;
    };

    return (
      <div className="flex gap-2.5">
        <span className="text-[14.5px] font-bold text-gray-900 flex-shrink-0" style={{ minWidth: '24px', lineHeight: '1.7' }}>
          {problem.number}.
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] text-gray-800 whitespace-pre-line" style={{ lineHeight: '1.7' }}>
            {hasFigureInContent ? (
              parts.map((part, pi) => (
                part.type === 'text' ? (
                  <MixedContentRenderer key={pi} content={part.text} className="text-gray-800" />
                ) : (
                  <div key={pi} className="my-2 flex justify-center">
                    {renderFigureForPrint()}
                  </div>
                )
              ))
            ) : (
              <>
                <MixedContentRenderer content={cleanContent} className="text-gray-800" />
                {hasAiFigure && (
                  <div className="mt-2 flex justify-center">
                    {renderFigureForPrint()}
                  </div>
                )}
              </>
            )}
          </div>
          {problem.choices.length > 0 && (() => {
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

            const maxLen = Math.max(...problem.choices.map(c => c.replace(/^[①②③④⑤]\s*/, '').replace(/\$[^$]*\$/g, 'XX').replace(/\\[a-z]+/gi, '').length));
            if (maxLen <= 12) {
              return (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5">
                  {problem.choices.map((choice, ci) => (
                    <div key={ci} className="text-[13.5px] text-gray-700" style={{ lineHeight: '1.65' }}>
                      <MixedContentRenderer content={choice} className="text-gray-700" />
                    </div>
                  ))}
                </div>
              );
            }
            if (maxLen <= 30) {
              return (
                <div className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-2">
                  {problem.choices.map((choice, ci) => (
                    <div key={ci} className="text-[13.5px] text-gray-700" style={{ lineHeight: '1.65' }}>
                      <MixedContentRenderer content={choice} className="text-gray-700" />
                    </div>
                  ))}
                </div>
              );
            }
            return (
              <div className="mt-2.5 space-y-1.5">
                {problem.choices.map((choice, ci) => (
                  <div key={ci} className="text-[13.5px] text-gray-700" style={{ lineHeight: '1.65' }}>
                    <MixedContentRenderer content={choice} className="text-gray-700" />
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  // 측정용 컬럼 너비 (고정 컬럼 간격 사용)
  const measureWidth = columns === 2
    ? (A4_W - PAGE_PAD * 2 - COLUMN_GAP) / 2
    : A4_W - PAGE_PAD * 2;

  return (
    <div className="flex flex-col h-full exam-print-container">
      {/* 컨트롤 바 */}
      <div className="exam-controls flex items-center justify-between border-b border-subtle px-5 py-2 flex-shrink-0 bg-surface-raised/50">
        <div className="flex items-center gap-3">
          {/* 1단/2단 토글 */}
          <div className="flex items-center gap-1 rounded-lg border overflow-hidden">
            <button
              type="button"
              onClick={() => setColumns(1)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                columns === 1
                  ? 'bg-cyan-500/10 text-cyan-400'
                  : 'text-content-tertiary hover:text-content-primary'
              }`}
            >
              <AlignJustify className="h-3.5 w-3.5" />
              1단
            </button>
            <button
              type="button"
              onClick={() => setColumns(2)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                columns === 2
                  ? 'bg-cyan-500/10 text-cyan-400'
                  : 'text-content-tertiary hover:text-content-primary'
              }`}
            >
              <Columns2 className="h-3.5 w-3.5" />
              2단
            </button>
          </div>

          {/* 페이지당 문제 수 프리셋 */}
          <div className="flex items-center gap-1 rounded-lg border overflow-hidden">
            {([null, 4, 6, 8] as const).map((preset) => (
              <button
                key={preset ?? 'auto'}
                type="button"
                onClick={() => setPerPagePreset(preset)}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  perPagePreset === preset
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-content-tertiary hover:text-content-primary'
                }`}
              >
                {preset === null ? '자동' : `${preset}문제`}
              </button>
            ))}
          </div>

          {/* 세로 간격 슬라이더 (자동 모드에서만 표시) */}
          {!perPagePreset && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-content-tertiary">간격</span>
              <input
                type="range"
                min={8}
                max={700}
                value={gap}
                onChange={(e) => setGap(Number(e.target.value))}
                className="w-32 h-1 accent-cyan-500 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-xs text-content-tertiary w-8 text-right tabular-nums">{gap}</span>
            </div>
          )}
          {/* 프리셋 모드에서는 자동 간격 표시 */}
          {perPagePreset && pageAutoGaps && (
            <span className="text-xs text-emerald-400/70">자동 배치</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenTemplateModal}
            className="flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-sm font-medium text-violet-400 hover:bg-violet-500/20 transition-colors"
          >
            <FileEdit className="h-4 w-4" />
            템플릿
          </button>
          <div className="relative" ref={printMenuRef}>
            <button
              type="button"
              onClick={() => setShowPrintMenu(!showPrintMenu)}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors"
            >
              <Printer className="h-4 w-4" />
              출력
            </button>
            {showPrintMenu && (
              <div className="absolute top-full right-0 mt-1 w-48 rounded-lg border border-zinc-600 bg-zinc-800 shadow-xl z-50">
                <div className="px-3 py-2 border-b border-zinc-700">
                  <span className="text-xs font-bold text-content-secondary">출력할 항목 선택</span>
                </div>
                <div className="p-2 space-y-1">
                  {[
                    { key: 'exam' as const, label: '시험지' },
                    { key: 'answer' as const, label: '빠른정답' },
                    { key: 'solution' as const, label: '해설지' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={printSections[key]}
                        onChange={() => setPrintSections(prev => ({ ...prev, [key]: !prev[key] }))}
                        className="w-4 h-4 rounded border-zinc-500 text-cyan-500 focus:ring-cyan-500 bg-zinc-700"
                      />
                      <span className="text-sm text-content-secondary">{label}</span>
                    </label>
                  ))}
                </div>
                <div className="px-2 pb-2">
                  <button
                    type="button"
                    onClick={handlePrint}
                    disabled={!printSections.exam && !printSections.answer && !printSections.solution}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-600 disabled:text-zinc-400 px-3 py-2 text-sm font-bold text-white transition-colors"
                  >
                    <Printer className="h-4 w-4" />
                    출력하기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 숨겨진 측정 영역 */}
      <div
        ref={measureRef}
        aria-hidden
        style={{
          position: 'absolute',
          visibility: 'hidden',
          top: -99999,
          left: -99999,
          width: `${measureWidth}px`,
          fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif",
          fontSize: '14px',
          lineHeight: '1.7',
        }}
      >
        {problems.map((problem, idx) => (
          <div key={problem.id} data-problem-idx={idx} style={{ marginBottom: '8px' }}>
            {renderProblem(problem)}
          </div>
        ))}
      </div>

      {/* A4 페이지들 */}
      <div className="exam-page-scroll-bg flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 flex flex-col items-center py-6 bg-surface-raised/30">
        {pages.map((pageProblems, pageIdx) => (
          <div
            key={pageIdx}
            className="exam-page bg-white"
            style={{
              width: `${A4_W}px`,
              minHeight: `${A4_H}px`,
              padding: '15mm',
              marginBottom: pageIdx < pages.length - 1 ? '24px' : 0,
              boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
              borderRadius: '4px',
              position: 'relative',
              boxSizing: 'border-box',
              fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif",
            }}
          >
            {/* 헤더 — 첫 페이지만 */}
            {pageIdx === 0 && (
              <div style={{ marginBottom: '16px' }}>
                <ExamPaperHeader templateId={templateId} meta={examMeta} examTitle={examTitle} />
              </div>
            )}

            {/* 문제 영역 */}
            <div
              style={{
                columns: columns === 2 ? 2 : 1,
                columnGap: `${COLUMN_GAP}px`,
                columnRule: columns === 2 ? '1px solid #e5e5e5' : undefined,
              }}
            >
              {pageProblems.map((problem) => (
                <div
                  key={problem.id}
                  className="break-inside-avoid"
                  style={{ marginBottom: `${getEffectiveGap(pageIdx)}px` }}
                >
                  {renderProblem(problem)}
                </div>
              ))}
            </div>

            {/* 페이지 번호 */}
            <div style={{
              position: 'absolute',
              bottom: '8mm',
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: '10px',
              color: '#aaa',
            }}>
              페이지 {pageIdx + 1}
            </div>
          </div>
        ))}
      </div>

      {/* 시험지 수식 스타일 + 인쇄 */}
      <style jsx global>{`
        /* ── 시험지 KaTeX 미세 보정 ── */
        .exam-page .katex {
          font-size: 1.05em !important;
        }

        /* 평소에는 숨김 (handlePrint에서 동적 생성) */
        #exam-print-root { display: none; }
        #exam-print-root .katex {
          font-size: 1.05em !important;
        }

        @media print {
          /* 기존 앱 전체 숨김, 복제된 인쇄 루트만 표시 */
          body > *:not(#exam-print-root) { display: none !important; }
          #exam-print-root {
            display: block !important;
          }
          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }
          /* 각 A4 페이지 */
          #exam-print-root .exam-page {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            margin: 0 !important;
            padding: 15mm !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            page-break-after: always;
            overflow: hidden !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #exam-print-root .exam-page:last-child { page-break-after: auto; }
          /* 인쇄 시 간격은 화면 설정 그대로 반영 (인라인 스타일 유지) */
          #exam-print-root .break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
        @page { size: A4 portrait; margin: 0; }
      `}</style>
    </div>
  );
}

// ============================================================================
// Quick Answer View (빠른정답)
// ============================================================================

function QuickAnswerView({
  problems,
  examTitle,
  templateId,
  examMeta,
}: {
  problems: ProblemData[];
  examTitle: string;
  templateId: string;
  examMeta: ExamMeta;
}) {
  const circledNumbers = ['', '①', '②', '③', '④', '⑤'];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 flex justify-center py-6 bg-surface-raised/30">
      <div className="quick-answer-print w-full max-w-[900px] bg-white rounded-lg shadow-2xl shadow-black/50 mx-4">
        {/* 헤더 — 템플릿 기반 */}
        <ExamPaperHeader
          templateId={templateId}
          meta={examMeta}
          examTitle={examTitle}
        />

        {/* 빠른 정답 제목 */}
        <div className="text-center pt-8 pb-5">
          <h2 className="text-xl font-bold text-gray-900 tracking-wider">빠 른 정 답</h2>
        </div>

        {/* 정답 테이블 */}
        <div className="px-12 pb-10">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '38%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '38%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="border-2 border-gray-800 bg-gray-100 py-2.5 text-center text-sm font-bold text-gray-700">문항</th>
                <th className="border-2 border-gray-800 bg-gray-100 py-2.5 text-center text-sm font-bold text-gray-700">정답</th>
                <th className="border-2 border-gray-800 bg-gray-100 py-2.5 text-center text-sm font-bold text-gray-700">문항</th>
                <th className="border-2 border-gray-800 bg-gray-100 py-2.5 text-center text-sm font-bold text-gray-700">정답</th>
              </tr>
            </thead>
            <tbody>
            {Array.from({ length: Math.ceil(problems.length / 2) }).map((_, rowIdx) => {
              const leftNum = rowIdx + 1;
              const rightNum = rowIdx + 1 + Math.ceil(problems.length / 2);
              const leftP = problems.find((p) => p.number === leftNum);
              const rightP = problems.find((p) => p.number === rightNum);

              const formatAnswer = (ans: number | string | undefined): React.ReactNode => {
                if (ans === undefined || ans === '-') return '-';
                if (typeof ans === 'number' && ans >= 1 && ans <= 5) return circledNumbers[ans];
                const str = String(ans);
                const hasMath = /\$|\\frac|\^|[a-zA-Z].*[=+\-*/]/.test(str);
                if (hasMath) {
                  return <MixedContentRenderer content={str} className="text-blue-700" />;
                }
                return str;
              };

              return (
                <tr key={rowIdx}>
                  <td className="border border-gray-400 py-3 text-center text-sm font-semibold text-gray-800">
                    {leftNum}
                  </td>
                  <td className="border border-gray-400 py-3 text-center text-base font-bold text-blue-700">
                    {formatAnswer(leftP?.answer)}
                  </td>
                  <td className="border border-gray-400 py-3 text-center text-sm font-semibold text-gray-800">
                    {rightNum <= problems.length ? rightNum : ''}
                  </td>
                  <td className="border border-gray-400 py-3 text-center text-base font-bold text-blue-700">
                    {rightNum <= problems.length ? formatAnswer(rightP?.answer) : ''}
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Solution View (해설지)
// ============================================================================

function SolutionView({
  problems,
  examTitle,
  templateId,
  examMeta,
  onOpenTemplateModal,
}: {
  problems: ProblemData[];
  examTitle: string;
  templateId: string;
  examMeta: ExamMeta;
  onOpenTemplateModal: () => void;
}) {
  const [columns, setColumns] = useState<1 | 2>(2);
  const [gap, setGap] = useState(20);
  const circledNumbers = ['', '①', '②', '③', '④', '⑤'];

  // ── 측정 기반 A4 페이지 분할 (시험지와 동일 방식) ──
  const measureRef = useRef<HTMLDivElement>(null);
  const [problemHeights, setProblemHeights] = useState<number[]>([]);
  const [measured, setMeasured] = useState(false);

  useEffect(() => { setMeasured(false); setProblemHeights([]); }, [problems, columns]);

  useLayoutEffect(() => {
    if (measureRef.current && !measured && problems.length > 0) {
      const timer = setTimeout(() => {
        if (!measureRef.current) return;
        const els = measureRef.current.querySelectorAll('[data-sol-idx]');
        const heights = Array.from(els).map(el => el.getBoundingClientRect().height);
        if (heights.length === problems.length) {
          setProblemHeights(heights);
          setMeasured(true);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [problems, measured]);

  // A4 상수
  const A4_W = 794;
  const A4_H = 1123;
  const PAGE_PAD = 57;
  const FOOTER_H = 36;
  const HEADER_H = 80;
  const CONTENT_H = A4_H - PAGE_PAD * 2 - FOOTER_H;
  const FIRST_CONTENT_H = CONTENT_H - HEADER_H;
  const COLUMN_GAP = 28;

  // 2단일 때 측정 영역 너비 = (A4 - 좌우패딩*2 - 컬럼간격) / 2
  const measureWidth = columns === 2 ? Math.floor((A4_W - PAGE_PAD * 2 - COLUMN_GAP) / 2) : (A4_W - PAGE_PAD * 2);

  const pages = useMemo(() => {
    if (!measured || problemHeights.length === 0) {
      const perPage = columns === 2 ? 8 : 4;
      const result: ProblemData[][] = [];
      for (let i = 0; i < problems.length; i += perPage) result.push(problems.slice(i, i + perPage));
      return result.length > 0 ? result : [[]];
    }

    const colMult = columns === 2 ? 2 : 1;
    const result: ProblemData[][] = [];
    let currentPage: ProblemData[] = [];
    let usedH = 0;

    for (let i = 0; i < problems.length; i++) {
      const h = (problemHeights[i] + gap) / colMult;
      const maxH = result.length === 0 ? FIRST_CONTENT_H : CONTENT_H;

      if (currentPage.length > 0 && usedH + h > maxH) {
        result.push(currentPage);
        currentPage = [];
        usedH = 0;
      }
      currentPage.push(problems[i]);
      usedH += h;
    }
    if (currentPage.length > 0) result.push(currentPage);
    return result.length > 0 ? result : [[]];
  }, [problems, problemHeights, measured, columns, gap, FIRST_CONTENT_H, CONTENT_H]);

  // 정답 표시 헬퍼
  const formatSolAnswer = (ans: number | string | undefined): React.ReactNode => {
    if (ans === undefined || ans === '-') return '-';
    if (typeof ans === 'number' && ans >= 1 && ans <= 5) return circledNumbers[ans];
    const str = String(ans);
    const hasMath = /\$|\\frac|\^|[a-zA-Z].*[=+\-*/]/.test(str);
    if (hasMath) return <MixedContentRenderer content={str} className="text-blue-700" />;
    return str;
  };

  // 해설 한 문제 렌더 (측정 + 실제 공통)
  const renderSolution = (problem: ProblemData) => (
    <div className="break-inside-avoid">
      {/* 문제 번호 + 정답 배지 + 난이도 */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[14px] font-extrabold text-gray-900">{problem.number}.</span>
        <span className="inline-flex items-center rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-xs font-bold text-blue-700">
          정답 {formatSolAnswer(problem.answer)}
        </span>
        <DifficultyBadgeLight level={problem.difficulty} />
      </div>

      {/* 해설 본문 */}
      <div className="pl-5 text-[13px] text-gray-700 whitespace-pre-line" style={{ lineHeight: '1.7' }}>
        <MixedContentRenderer content={problem.solution || '해설이 등록되지 않았습니다.'} className="text-gray-700" />
      </div>

      {/* 구분선 */}
      <div className="mt-2 border-b border-gray-200" />
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* 상단 컨트롤 바 */}
      <div className="flex items-center justify-between border-b border-subtle px-5 py-2 flex-shrink-0 bg-surface-raised/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border overflow-hidden">
            <button
              type="button"
              onClick={() => setColumns(1)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                columns === 1
                  ? 'bg-cyan-500/10 text-cyan-400'
                  : 'text-content-tertiary hover:text-content-primary'
              }`}
            >
              <AlignJustify className="h-3.5 w-3.5" />
              1단
            </button>
            <button
              type="button"
              onClick={() => setColumns(2)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                columns === 2
                  ? 'bg-cyan-500/10 text-cyan-400'
                  : 'text-content-tertiary hover:text-content-primary'
              }`}
            >
              <Columns2 className="h-3.5 w-3.5" />
              2단
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-content-tertiary">간격</span>
            <input
              type="range"
              min={8}
              max={700}
              value={gap}
              onChange={(e) => setGap(Number(e.target.value))}
              className="w-32 h-1 accent-cyan-500 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs text-content-tertiary w-8 text-right tabular-nums">{gap}</span>
          </div>
        </div>
      </div>

      {/* 숨겨진 측정 영역 */}
      <div
        ref={measureRef}
        aria-hidden
        style={{
          position: 'absolute',
          visibility: 'hidden',
          top: -99999,
          left: -99999,
          width: `${measureWidth}px`,
          fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif",
          fontSize: '13px',
          lineHeight: '1.7',
        }}
      >
        {problems.map((problem, idx) => (
          <div key={problem.id} data-sol-idx={idx} style={{ marginBottom: '8px' }}>
            {renderSolution(problem)}
          </div>
        ))}
      </div>

      {/* A4 페이지들 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 flex flex-col items-center py-6 bg-surface-raised/30">
        {pages.map((pageProblems, pageIdx) => (
          <div
            key={pageIdx}
            className="solution-page bg-white"
            style={{
              width: `${A4_W}px`,
              minHeight: `${A4_H}px`,
              padding: '15mm',
              marginBottom: pageIdx < pages.length - 1 ? '24px' : 0,
              boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
              borderRadius: '4px',
              position: 'relative',
              boxSizing: 'border-box',
              fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif",
            }}
          >
            {/* 헤더 — 첫 페이지만 */}
            {pageIdx === 0 && (
              <div style={{ marginBottom: '16px' }}>
                <ExamPaperHeader
                  templateId={templateId}
                  meta={examMeta}
                  examTitle={`${examTitle} — 해설`}
                />
              </div>
            )}

            {/* 해설 영역 */}
            <div
              style={{
                columns: columns === 2 ? 2 : 1,
                columnGap: `${COLUMN_GAP}px`,
                columnRule: columns === 2 ? '1px solid #e5e5e5' : undefined,
              }}
            >
              {pageProblems.map((problem) => (
                <div
                  key={problem.id}
                  className="break-inside-avoid"
                  style={{ marginBottom: `${gap}px` }}
                >
                  {renderSolution(problem)}
                </div>
              ))}
            </div>

            {/* 페이지 번호 */}
            <div style={{
              position: 'absolute',
              bottom: '8mm',
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: '10px',
              color: '#aaa',
            }}>
              해설 {pageIdx + 1}
            </div>
          </div>
        ))}
      </div>

      {/* 해설지 KaTeX 스타일 */}
      <style jsx global>{`
        .solution-page .katex {
          font-size: 1.05em !important;
        }
      `}</style>
    </div>
  );
}

/** 라이트 테마용 난이도 배지 (해설지에서 사용) */
function DifficultyBadgeLight({ level }: { level: DifficultyKey }) {
  const config: Record<DifficultyKey, { label: string; classes: string }> = {
    1: { label: '최하', classes: 'bg-gray-100 text-gray-500 border-gray-300' },
    2: { label: '하', classes: 'bg-blue-50 text-blue-600 border-blue-200' },
    3: { label: '중', classes: 'bg-amber-50 text-amber-600 border-amber-200' },
    4: { label: '상', classes: 'bg-red-50 text-red-600 border-red-200' },
    5: { label: '최상', classes: 'bg-red-100 text-red-700 border-red-300' },
  };
  const cfg = config[level];
  return (
    <span className={`inline-flex items-center rounded border px-1 py-0.5 text-[10px] font-bold ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function CloudExamDetailPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.examId as string;

  // DB에서 문제 로드
  const { problems: dbProblems, examInfo, isLoading: dbLoading, refetch: refetchProblems } = useExamProblems(examId);

  // DB 데이터 사용 (mock fallback 제거)
  const problems: ProblemData[] = useMemo(() => {
    return dbProblems.map((p) => ({
      id: p.id,
      number: p.number,
      difficulty: p.difficulty,
      cognitiveDomain: p.cognitiveDomain as ProblemData['cognitiveDomain'],
      content: p.content,
      choices: p.choices,
      answer: p.answer,
      solution: p.solution,
      year: p.year,
      typeCode: p.typeCode,
      typeName: p.typeName,
      source: p.source,
      images: p.images,
      hasFigure: p.hasFigure,
      figureSvg: p.figureSvg,
      figureData: p.figureData,
    }));
  }, [dbProblems]);

  const examTitle = examInfo?.title || '(제목 없음)';

  // Filter state
  const [activeDifficulty, setActiveDifficulty] = useState<DifficultyKey | null>(null);
  const [activeDomain, setActiveDomain] = useState<DomainKey | null>(null);
  const [activeView, setActiveView] = useState<'spread' | 'exam' | 'answer' | 'solution'>('spread');
  const [twinModalProblem, setTwinModalProblem] = useState<ProblemData | null>(null);
  const [editModalProblem, setEditModalProblem] = useState<ProblemData | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);

  // 원본/클린 렌더링 모드 (펼쳐보기에서 적용)
  const [renderMode, setRenderMode] = useState<'clean' | 'original'>('clean');

  // 시험지 템플릿
  const [templateId, setTemplateId] = useState('simple');
  const [examMeta, setExamMeta] = useState<ExamMeta>({ ...DEFAULT_EXAM_META });
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // 도형 재생성 상태
  const [generatingFigures, setGeneratingFigures] = useState<Set<string>>(new Set());

  const handleGenerateFigure = useCallback(async (problem: ProblemData): Promise<boolean> => {
    if (generatingFigures.has(problem.id)) return false;

    setGeneratingFigures(prev => new Set(prev).add(problem.id));

    try {
      console.log(`[generate-figure] Starting for problem #${problem.number} (${problem.id}), images: ${JSON.stringify(problem.images?.map(i => ({ type: i.type, url: i.url?.substring(0, 80) })))}`);

      const res = await fetch(`/api/problems/${problem.id}/generate-figure`, {
        method: 'POST',
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg = data.error || `서버 오류 (${res.status})`;
        console.warn(`[generate-figure] Problem ${problem.number}: ${errMsg}`);
        alert(`도형 생성 실패 (#${problem.number}): ${errMsg}`);
        return false;
      }

      if (data.noFigure) {
        console.log(`[generate-figure] Problem ${problem.number}: 도형 없음`);
        alert(`문제 ${problem.number}: 도형이 감지되지 않았습니다.`);
        return false;
      }

      console.log(`[generate-figure] Problem ${problem.number}: 성공! type=${data.figureType}`);
      // SVG 생성 성공 → 목록 갱신
      refetchProblems();
      return true;
    } catch (err) {
      console.error('[generate-figure] Error:', err);
      alert(`도형 생성 중 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
      return false;
    } finally {
      setGeneratingFigures(prev => {
        const next = new Set(prev);
        next.delete(problem.id);
        return next;
      });
    }
  }, [generatingFigures, refetchProblems]);

  // ★ 콘텐츠 업데이트 (이미지 위치 변경 시)
  const handleUpdateContent = useCallback(async (problemId: string, updatedContent: string) => {
    try {
      const res = await fetch(`/api/problems/${problemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_latex: updatedContent }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('[updateContent] Failed:', data.error);
        return;
      }
      refetchProblems();
    } catch (err) {
      console.error('[updateContent] Error:', err);
    }
  }, [refetchProblems]);

  // ★ AI 도형 삭제 (figureData/figureSvg 제거, 크롭 이미지 유지)
  const handleDeleteFigure = useCallback(async (problem: ProblemData) => {
    try {
      // Supabase RPC로 figureData, figureSvg 필드만 삭제
      // ai_analysis JSONB에서 해당 키만 제거
      const patchRes = await fetch(`/api/problems/${problem.id}/delete-figure`, {
        method: 'POST',
      });

      if (!patchRes.ok) {
        console.error('[deleteFigure] Failed:', await patchRes.text());
        return;
      }

      console.log(`[deleteFigure] Cleared figureData/figureSvg for problem ${problem.id}`);
      refetchProblems();
    } catch (err) {
      console.error('[deleteFigure] Error:', err);
    }
  }, [refetchProblems]);

  // ★ 단일 문제 재스캔 (이미지 업로드 → OCR → 교체)
  const [rescanningId, setRescanningId] = useState<string | null>(null);
  const rescanInputRef = useRef<HTMLInputElement>(null);
  const rescanTargetRef = useRef<ProblemData | null>(null);

  const handleRescanProblem = useCallback((problem: ProblemData) => {
    rescanTargetRef.current = problem;
    rescanInputRef.current?.click();
  }, []);

  const handleRescanFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const problem = rescanTargetRef.current;
    if (!file || !problem) return;
    e.target.value = ''; // reset input

    setRescanningId(problem.id);
    try {
      // 1. 파일 → base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // data:image/...;base64, 제거
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 2. OCR + 분류
      const ocrRes = await fetch('/api/workflow/reanalyze-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          fullAnalysis: true,
          problemNumber: problem.number,
        }),
      });

      if (!ocrRes.ok) {
        const errData = await ocrRes.json().catch(() => ({}));
        throw new Error(errData.error || `OCR 실패 (${ocrRes.status})`);
      }

      const ocrData = await ocrRes.json();
      console.log('[Rescan] OCR result:', ocrData);

      // 3. 문제 업데이트
      const updateBody: Record<string, unknown> = {
        content_latex: ocrData.ocrText,
      };

      // 선택지가 있으면 answer_json에 포함
      if (ocrData.choices && ocrData.choices.length > 0) {
        updateBody.answer_json = {
          correct_answer: problem.answer, // 기존 정답 유지
          choices: ocrData.choices,
        };
      }

      // 분류 결과가 있으면 ai_analysis 업데이트
      if (ocrData.classification) {
        updateBody.ai_analysis = {
          ...ocrData.classification,
          hasFigure: problem.hasFigure,
          figureData: problem.figureData,
          figureSvg: problem.figureSvg,
        };
      }

      const patchRes = await fetch(`/api/problems/${problem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateBody),
      });

      if (!patchRes.ok) {
        const errData = await patchRes.json().catch(() => ({}));
        throw new Error(errData.error || `저장 실패 (${patchRes.status})`);
      }

      console.log(`[Rescan] Problem #${problem.number} updated successfully`);
      refetchProblems();
    } catch (err) {
      console.error('[Rescan] Error:', err);
      alert(`재스캔 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setRescanningId(null);
      rescanTargetRef.current = null;
    }
  }, [refetchProblems]);

  // Selection mode state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedProblems, setSelectedProblems] = useState<Set<string>>(new Set());

  const toggleSelectProblem = useCallback((id: string) => {
    setSelectedProblems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedProblems(new Set());
    setIsSelectionMode(false);
  }, []);

  const handleCreateExam = useCallback(() => {
    // 선택된 문제 데이터를 sessionStorage에 저장하고 시험지 만들기 페이지로 이동
    const selected = problems.filter((p) => selectedProblems.has(p.id));
    sessionStorage.setItem('selectedProblems', JSON.stringify(selected));
    sessionStorage.setItem('sourceExamTitle', examTitle);
    router.push('/dashboard/cloud/create-exam');
  }, [problems, selectedProblems, examTitle, router]);

  // Counts
  const difficultyCounts = useMemo(() => {
    const counts: Record<DifficultyKey, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    problems.forEach((p) => { counts[p.difficulty]++; });
    return counts;
  }, [problems]);

  const domainCounts = useMemo(() => {
    const counts: Record<DomainKey, number> = {
      CALCULATION: 0, UNDERSTANDING: 0, INFERENCE: 0, PROBLEM_SOLVING: 0, UNASSIGNED: 0,
    };
    problems.forEach((p) => { counts[p.cognitiveDomain]++; });
    return counts;
  }, [problems]);

  // Filtered problems
  const filteredProblems = useMemo(() => {
    return problems.filter((p) => {
      if (activeDifficulty !== null && p.difficulty !== activeDifficulty) return false;
      if (activeDomain !== null && activeDomain !== 'UNASSIGNED' && p.cognitiveDomain !== activeDomain) return false;
      return true;
    });
  }, [problems, activeDifficulty, activeDomain]);

  // ★ 전체 선택
  const selectAll = useCallback(() => {
    const allIds = new Set(filteredProblems.map(p => p.id));
    setSelectedProblems(allIds);
  }, [filteredProblems]);

  // ★ 선택 삭제
  const [isDeleting, setIsDeleting] = useState(false);
  const handleDeleteSelected = useCallback(async () => {
    if (selectedProblems.size === 0) return;
    if (!confirm(`선택한 ${selectedProblems.size}개 문제를 삭제하시겠습니까?\n삭제된 문제는 복구할 수 없습니다.`)) return;

    setIsDeleting(true);
    let deleted = 0;
    let failed = 0;

    for (const problemId of selectedProblems) {
      try {
        const res = await fetch(`/api/problems/${problemId}`, { method: 'DELETE' });
        if (res.ok) {
          deleted++;
        } else {
          failed++;
          console.error(`[Delete] Problem ${problemId} failed:`, await res.text());
        }
      } catch (err) {
        failed++;
        console.error(`[Delete] Problem ${problemId} error:`, err);
      }
    }

    setIsDeleting(false);
    setSelectedProblems(new Set());
    setIsSelectionMode(false);
    refetchProblems();

    if (failed > 0) {
      alert(`${deleted}개 삭제 완료, ${failed}개 실패`);
    }
  }, [selectedProblems, refetchProblems]);

  const toggleDifficulty = (d: DifficultyKey) => {
    setActiveDifficulty((prev) => (prev === d ? null : d));
  };

  const toggleDomain = (d: DomainKey) => {
    setActiveDomain((prev) => (prev === d ? null : d));
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-surface-base text-content-primary">
      {/* ======== Header ======== */}
      <div className="flex items-center justify-between border-b border-subtle px-5 py-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => router.push('/dashboard/cloud')}
            className="p-1 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-raised transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-bold text-content-primary truncate max-w-[500px]">
            {examTitle}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* 기능 버튼들 */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (isSelectionMode) {
                  clearSelection();
                } else {
                  setIsSelectionMode(true);
                }
              }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                isSelectionMode
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                  : 'border bg-surface-card text-content-secondary hover:bg-surface-raised'
              }`}
            >
              <ShoppingCart className="h-4 w-4" />
              <span>{isSelectionMode ? `선택 중 (${selectedProblems.size})` : '문제 선택하기'}</span>
              {isSelectionMode && (
                <X className="h-3.5 w-3.5 ml-0.5 text-content-secondary hover:text-content-primary" />
              )}
            </button>
            <button type="button" className="flex items-center gap-1.5 rounded-lg border bg-surface-card px-3 py-2 text-sm font-medium text-content-secondary hover:bg-surface-raised transition-colors">
              <Sparkles className="h-4 w-4" />
              <span>유형 자동매핑</span>
            </button>
            <button
              type="button"
              onClick={() => setShowStatsModal(true)}
              className="flex items-center gap-1.5 rounded-lg border bg-surface-card px-3 py-2 text-sm font-medium text-content-secondary hover:bg-surface-raised transition-colors"
            >
              <BarChart3 className="h-4 w-4" />
              <span>통계 보기</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('spread')}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                activeView === 'spread'
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                  : 'border bg-surface-card text-content-secondary hover:bg-surface-raised'
              }`}
            >
              <LayoutList className="h-4 w-4" />
              <span>펼쳐보기</span>
            </button>
          </div>

          {/* 시험지/빠른정답/해설지 */}
          <div className="flex items-center gap-1 ml-2">
            <button
              type="button"
              onClick={() => setActiveView('exam')}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors ${
                activeView === 'exam'
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                  : 'border bg-surface-card text-content-secondary hover:bg-surface-raised'
              }`}
            >
              <ScrollText className="h-4 w-4" />
              <span>시험지</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('answer')}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors ${
                activeView === 'answer'
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                  : 'border bg-surface-card text-content-secondary hover:bg-surface-raised'
              }`}
            >
              <CheckSquare className="h-4 w-4" />
              <span>빠른정답</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('solution')}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors ${
                activeView === 'solution'
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                  : 'border bg-surface-card text-content-secondary hover:bg-surface-raised'
              }`}
            >
              <BookOpenCheck className="h-4 w-4" />
              <span>해설지</span>
            </button>
          </div>

          {/* 문항 수 + 더보기 */}
          <span className="text-sm text-content-secondary ml-2">{problems.length} 문항</span>
          <button type="button" className="p-2 text-content-secondary hover:text-content-primary">
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ======== Filter Bar (Sticky) ======== */}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-subtle bg-surface-base/80 backdrop-blur-md px-5 py-2.5 flex-shrink-0">
        {/* 전체 문제 수 */}
        <button
          type="button"
          onClick={() => { setActiveDifficulty(null); setActiveDomain(null); }}
          className="flex items-center rounded-md border border-zinc-500 bg-surface-raised px-2 py-1 text-sm font-bold text-content-primary hover:bg-zinc-600 transition-colors"
        >
          {filteredProblems.length}
          <span className="text-xs font-medium pl-1">문제</span>
        </button>

        {/* 난이도 필터 */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase text-content-tertiary mr-1">난이도</span>
          {([5, 4, 3, 2, 1] as DifficultyKey[]).map((d) => (
            <FilterBadge
              key={d}
              label={DIFFICULTY_CONFIG[d].label}
              count={difficultyCounts[d]}
              borderColor={`${DIFFICULTY_CONFIG[d].border} ${DIFFICULTY_CONFIG[d].text}`}
              active={activeDifficulty === d}
              onClick={() => toggleDifficulty(d)}
            />
          ))}
        </div>

        {/* 인지영역 필터 */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase text-content-tertiary mr-1">인지</span>
          {(['CALCULATION', 'UNDERSTANDING', 'INFERENCE', 'PROBLEM_SOLVING', 'UNASSIGNED'] as DomainKey[]).map((d) => (
            <FilterBadge
              key={d}
              label={DOMAIN_CONFIG[d].label}
              count={d === 'UNASSIGNED' ? domainCounts.UNASSIGNED : domainCounts[d as Exclude<DomainKey, 'UNASSIGNED'>]}
              borderColor={`${DOMAIN_CONFIG[d].border} ${DOMAIN_CONFIG[d].text}`}
              active={activeDomain === d}
              onClick={() => toggleDomain(d)}
            />
          ))}
        </div>

        {/* 원본/클린 토글 */}
        {activeView === 'spread' && (
          <div className="flex items-center gap-0.5 rounded-lg border overflow-hidden ml-auto">
            <button
              type="button"
              onClick={() => setRenderMode('clean')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
                renderMode === 'clean'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-content-tertiary hover:text-content-primary'
              }`}
              title="LaTeX 클린 렌더링"
            >
              <Type className="h-3.5 w-3.5" />
              클린
            </button>
            <button
              type="button"
              onClick={() => setRenderMode('original')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${
                renderMode === 'original'
                  ? 'bg-violet-500/15 text-violet-400'
                  : 'text-content-tertiary hover:text-content-primary'
              }`}
              title="원본 크롭 이미지"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              원본
            </button>
          </div>
        )}

        {/* 도형 일괄 생성 버튼 (크롭 이미지가 있는 문제 대상) */}
        {problems.some(p => p.images?.some(img => img.type === 'crop') && !p.figureSvg) && (
          <button
            type="button"
            onClick={async () => {
              const targets = problems.filter(
                p => p.images?.some(img => img.type === 'crop') && !p.figureSvg
              );
              if (targets.length === 0) return;
              if (!confirm(`${targets.length}개 문제를 분석하여 도형을 AI로 생성합니다. 도형이 없는 문제는 자동으로 건너뜁니다. 진행하시겠습니까?`)) return;
              let generated = 0;
              let skipped = 0;
              for (const p of targets) {
                const success = await handleGenerateFigure(p);
                if (success) generated++;
                else skipped++;
              }
              alert(`완료: ${generated}개 도형 생성, ${skipped}개 건너뜀 (도형 없음)`);
            }}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors"
            disabled={generatingFigures.size > 0}
          >
            <Shapes className="h-3.5 w-3.5" />
            {generatingFigures.size > 0 ? `생성 중 (${generatingFigures.size})...` : '도형 일괄 생성'}
          </button>
        )}

        {/* 정보 버튼 */}
        <button type="button" className="ml-1 p-1 rounded-full border text-content-tertiary hover:text-content-primary transition-colors">
          <AlertCircle className="h-4 w-4" />
        </button>
      </div>

      {/* ======== Content Area (View-dependent) ======== */}
      {activeView === 'spread' && (
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 px-4 py-4">
          {dbLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-content-tertiary">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-cyan-500 mb-3" />
              <p className="text-sm">문제 로딩 중...</p>
            </div>
          ) : filteredProblems.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProblems.map((problem) => (
                <ProblemCardView
                  key={problem.id}
                  problem={problem}
                  onTwinGenerate={setTwinModalProblem}
                  onEdit={setEditModalProblem}
                  onRescan={handleRescanProblem}
                  onGenerateFigure={handleGenerateFigure}
                  onDeleteFigure={handleDeleteFigure}
                  onUpdateContent={handleUpdateContent}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedProblems.has(problem.id)}
                  onToggleSelect={toggleSelectProblem}
                  viewMode={renderMode}
                  isGeneratingFigure={generatingFigures.has(problem.id)}
                  isRescanning={rescanningId === problem.id}
                />
              ))}
            </div>
          ) : problems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-content-tertiary">
              <AlertCircle className="h-10 w-10 mb-3 text-content-muted" />
              <p className="text-sm font-medium">아직 자산화된 문제가 없습니다</p>
              <p className="text-xs text-content-muted mt-1">분석 워크플로우에서 자산화를 완료하면 여기에 문제가 표시됩니다.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-content-tertiary">
              <AlertCircle className="h-10 w-10 mb-3 text-content-muted" />
              <p className="text-sm font-medium">필터 조건에 맞는 문제가 없습니다</p>
              <button
                type="button"
                onClick={() => { setActiveDifficulty(null); setActiveDomain(null); }}
                className="mt-2 text-xs text-cyan-400 hover:text-cyan-300"
              >
                필터 초기화
              </button>
            </div>
          )}
        </div>
      )}

      {activeView === 'exam' && (
        <ExamPaperView
          problems={filteredProblems}
          examTitle={examTitle}
          templateId={templateId}
          examMeta={examMeta}
          onOpenTemplateModal={() => setShowTemplateModal(true)}
        />
      )}

      {activeView === 'answer' && (
        <QuickAnswerView
          problems={filteredProblems}
          examTitle={examTitle}
          templateId={templateId}
          examMeta={examMeta}
        />
      )}

      {activeView === 'solution' && (
        <SolutionView
          problems={filteredProblems}
          examTitle={examTitle}
          templateId={templateId}
          examMeta={examMeta}
          onOpenTemplateModal={() => setShowTemplateModal(true)}
        />
      )}

      {/* 인쇄용 숨겨진 빠른정답/해설지 (시험지 탭에서 출력 시 DOM 복제용) */}
      {activeView === 'exam' && (
        <div style={{ position: 'absolute', left: -99999, top: -99999, width: 900 }} aria-hidden>
          <QuickAnswerView
            problems={filteredProblems}
            examTitle={examTitle}
            templateId={templateId}
            examMeta={examMeta}
          />
          <SolutionView
            problems={filteredProblems}
            examTitle={examTitle}
            templateId={templateId}
            examMeta={examMeta}
            onOpenTemplateModal={() => {}}
          />
        </div>
      )}

      {/* ======== Floating Selection Bar ======== */}
      <AnimatePresence>
        {isSelectionMode && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border bg-surface-card/95 backdrop-blur-lg px-5 py-3 shadow-xl shadow-black/30"
          >
            {/* 전체 선택 */}
            <button
              type="button"
              onClick={selectAll}
              className="flex items-center gap-1.5 text-sm text-content-secondary hover:text-content-primary transition-colors"
            >
              <CheckCheck className="h-4 w-4" />
              <span>전체 선택</span>
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="text-sm text-content-tertiary hover:text-content-primary transition-colors"
            >
              초기화
            </button>

            <div className="w-px h-6 bg-surface-raised" />

            {/* 선택 개수 표시 */}
            <span className="text-sm font-bold text-content-primary">
              {selectedProblems.size}개 선택
            </span>

            <div className="w-px h-6 bg-surface-raised" />

            {/* 시험지 만들기 */}
            {selectedProblems.size > 0 && (
              <button
                type="button"
                onClick={handleCreateExam}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-sm font-bold text-white transition-all"
              >
                <ShoppingCart className="h-4 w-4" />
                <span>시험지 만들기</span>
              </button>
            )}

            {/* ★ 선택 삭제 */}
            {selectedProblems.size > 0 && (
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-bold text-white transition-all disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>{isDeleting ? '삭제 중...' : '삭제'}</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 유사문제 만들기 모달 */}
      {twinModalProblem && (
        <TwinProblemModal
          problem={twinModalProblem}
          onClose={() => setTwinModalProblem(null)}
        />
      )}

      {/* 통계 보기 모달 */}
      {showStatsModal && (
        <ExamStatsModal
          examTitle={examTitle}
          problems={problems}
          onClose={() => setShowStatsModal(false)}
        />
      )}

      {/* 숨겨진 재스캔 파일 입력 */}
      <input
        ref={rescanInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleRescanFileChange}
      />

      {/* 문제 수정 모달 */}
      {editModalProblem && (
        <ProblemEditModal
          problemId={editModalProblem.id}
          initialContent={editModalProblem.content}
          initialSolution={editModalProblem.solution || ''}
          initialAnswer={{ correct_answer: editModalProblem.answer }}
          initialChoices={editModalProblem.choices}
          initialDifficulty={editModalProblem.difficulty}
          initialCognitiveDomain={editModalProblem.cognitiveDomain}
          initialTypeCode={editModalProblem.typeCode}
          initialTypeName={editModalProblem.typeName}
          onClose={() => setEditModalProblem(null)}
          onSaved={() => {
            // DB 데이터 새로고침
            refetchProblems();
          }}
          onDelete={async () => {
            try {
              const res = await fetch(`/api/problems/${editModalProblem.id}`, { method: 'DELETE' });
              if (!res.ok) throw new Error('삭제 실패');
              refetchProblems();
            } catch (err) {
              console.error('[Delete] Error:', err);
            }
          }}
        />
      )}

      {/* 템플릿 선택 모달 */}
      <TemplateSelector
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        templateId={templateId}
        meta={examMeta}
        onApply={(id, meta) => {
          setTemplateId(id);
          setExamMeta(meta);
        }}
      />
    </div>
  );
}
