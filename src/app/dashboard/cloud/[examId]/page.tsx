'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
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
  ZoomIn,
  Wand2,
  PlusCircle,
  FileText,
  Search,
  Folder,
  Shapes as ShapesIcon,
  Zap,
  BookOpen,
  Filter,
  SlidersHorizontal,
  Download,
  ListChecks,
  MoreHorizontal,
  BarChart2,
  Square,
  CircleDot,
} from 'lucide-react';
import './cloud-exam-editor.css';
import { MixedContentRenderer, stripOrphanTabular } from '@/components/shared/MixedContentRenderer';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { trackBatchSolution } from '@/components/BatchSolutionNotifier';
import { cleanLatexContent, cleanChoiceText, injectSubQuestionPoints } from '@/lib/utils/clean-latex';
import { FigureRenderer, figureTypeLabel } from '@/components/shared/FigureRenderer';
import { ExamProblemRenderer } from '@/components/shared/ExamProblemRenderer';
import { ImagePositionEditor } from '@/components/shared/ImagePositionEditor';
import { useOrganizationName } from '@/hooks/useUserScope';
// ★ 무거운 모달은 dynamic import (열 때만 로드) — 페이지 청크 축소·전환 가속. 동작 변화 없음.
const TwinProblemModal = dynamic(() => import('@/components/papers/TwinProblemModal').then(m => m.TwinProblemModal), { ssr: false });
const ExamStatsModal = dynamic(() => import('@/components/papers/ExamStatsModal').then(m => m.ExamStatsModal), { ssr: false });
const ProblemEditModal = dynamic(() => import('@/components/papers/ProblemEditModal').then(m => m.ProblemEditModal), { ssr: false });
const AddProblemsModal = dynamic(() => import('@/components/papers/AddProblemsModal'), { ssr: false });
import { DiagramBrowserModal } from '@/components/papers/DiagramBrowserModal';
import { ExamPaperHeader } from '@/components/exam/ExamPaperHeader';
import { EditableExamHeader } from '@/components/exam/EditableExamHeader';
const AnswerMatchModal = dynamic(() => import('@/components/exam/AnswerMatchModal').then(m => m.AnswerMatchModal), { ssr: false });
import { TemplateSelector } from '@/components/exam/TemplateSelector';
import { DEFAULT_EXAM_META, type ExamMeta } from '@/config/exam-templates';
import { useExamProblems } from '@/hooks/useExamProblems';
import { useSmartBack } from '@/lib/navigation/useSmartBack';
import type { InterpretedFigure } from '@/types/ocr';

/** 해설에서 [선택지 검증] 섹션 제거 (기존 DB 데이터 호환) */
function stripChoiceAnalysis(s: string): string {
  if (!s) return s;
  return s.replace(/\[선택지 검증\][\s\S]*?(?=\n\[|∴|💡|$)/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

// ============================================================================
// Types
// ============================================================================

interface ProblemData {
  id: string;
  number: number;
  /** ★ 시험지에 적용된 배점 */
  points?: number;
  difficulty: number; // 수학비서 기준 1~10
  cognitiveDomain: 'CALCULATION' | 'UNDERSTANDING' | 'INFERENCE' | 'PROBLEM_SOLVING';
  content: string;
  choices: string[];
  /** ★ 그림 객관식: 선택지별 이미지 URL (choices 인덱스 정렬, null = 텍스트 옵션) */
  choiceImages?: (string | null)[];
  /** ★ 표 형식 선택지 열 헤더 (예: ["ㄱ","ㄴ","ㄷ","ㄹ"]) */
  choiceHeaders?: string[];
  /** ★ 저장된 선택지 레이아웃 (1=1열, 2=2열, 5=가로) */
  choiceLayout?: number;
  answer: number | string;
  /** ★ 원본 answer_json 전체 */
  answerJson?: Record<string, unknown>;
  solution: string;
  year: string;
  typeCode: string;
  typeName: string;
  source: string;
  images?: Array<{ url: string; type: string; label: string }>;
  hasFigure?: boolean;
  figureSvg?: string;
  figureData?: InterpretedFigure;
  /** ★ 업스케일된 크롭 이미지 URL */
  upscaledCropUrl?: string;
  /** 도형 소스 타입 */
  figureSource?: 'upscaled_crop' | 'ai_generated';
}

type DifficultyKey = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
type DomainKey = 'CALCULATION' | 'UNDERSTANDING' | 'INFERENCE' | 'PROBLEM_SOLVING' | 'UNASSIGNED';

// ============================================================================
// Constants — 수학비서 난이도 기준 (1~10)
// ============================================================================

// 수학비서: 쉬움(1~2)=yellow, 보통(3~4)=green, 어려움(5~6)=red, 매우어려움(7~10)=black
function getDifficultyConfig(level: number): { label: string; border: string; bg: string; text: string } {
  if (level <= 2) return { label: `쉬움${level}`, border: 'border-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400' };
  if (level <= 4) return { label: `보통${level}`, border: 'border-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400' };
  if (level <= 6) return { label: `어려움${level}`, border: 'border-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400' };
  return { label: `매우어려움${level}`, border: 'border-red-600', bg: 'bg-red-600/10', text: 'text-red-400' };
}

const DIFFICULTY_CONFIG: Record<number, { label: string; border: string; bg: string; text: string }> = Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [i + 1, getDifficultyConfig(i + 1)])
);

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

function DifficultyBadge({ level }: { level: number }) {
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

/** [도형] / [도형:right:40%] 마커를 파싱하여 콘텐츠를 분할 */
function splitContentByFigureMarker(content: string): Array<{
  type: 'text' | 'figure';
  text: string;
  floatMode?: 'right' | 'left';
  widthPercent?: number;
}> {
  // ★ [도형] 으로 쪼개기 전 전체 content 에 표 마크업 방어망 — 이미지 든 표(matched+[도형])를 인라인.
  //   쪼갠 뒤엔 \begin{tabular}/\end{tabular} 가 조각마다 흩어져 짝 카운트가 어긋나 방어가 안 되므로,
  //   반드시 쪼개기 전 전체에 적용(온천중 #21/#22 그림 표 마크업 노출 — 기존 자산화 데이터 정리).
  content = stripOrphanTabular(content);
  // [도형], [도형:right:40%], [도형:left:35%] 등 모든 형태 매칭
  const markerRegex = /\[도형(?::(\w+[-\w]*))?(?::(\d+)%?)?\]/;
  if (!markerRegex.test(content)) return [{ type: 'text', text: content }];

  const parts: Array<{ type: 'text' | 'figure'; text: string; floatMode?: 'right' | 'left'; widthPercent?: number }> = [];
  // 글로벌 매칭으로 분할
  const globalRegex = /\[도형(?::(\w+[-\w]*))?(?::(\d+)%?)?\]/g;
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

    parts.push({
      type: 'figure',
      text: '',
      floatMode,
      widthPercent: widthStr ? parseInt(widthStr, 10) : undefined,
    });
    lastIndex = match.index + match[0].length;
  }

  const after = content.slice(lastIndex);
  if (after.trim()) parts.push({ type: 'text', text: after });
  return parts;
}

/**
 * Supabase Storage 직접 URL → 프록시 URL 변환
 * private 버킷이라 직접 접근 불가 → /api/storage/image 프록시 경유
 */
function getProxiedImageUrl(url: string): string {
  if (!url) return url;
  // 이미 프록시 URL이면 그대로 반환
  if (url.startsWith('/api/storage/image')) return url;
  // Supabase storage URL 패턴: .../storage/v1/object/public/source-files/problem-crops/...
  const storageMatch = url.match(/\/storage\/v1\/object\/(?:public|sign(?:ed)?)\/source-files\/(.+)/);
  if (storageMatch) {
    return `/api/storage/image?path=${encodeURIComponent(storageMatch[1])}`;
  }
  return url;
}

// ============================================================================
// FigureMarkerRenderer — [도형] / [도형:right:40%] 마커 기반 렌더링
// 라인 모드: 기존 블록 사이 삽입 / 플로트 모드: CSS float로 텍스트 감싸기
// ============================================================================

function FigureMarkerRenderer({
  contentParts,
  problem,
  cropImage,
  showFigureCompare,
  getProxiedImageUrl: proxyUrl,
  pointsBadge,
}: {
  contentParts: Array<{ type: 'text' | 'figure'; text: string; floatMode?: 'right' | 'left'; widthPercent?: number }>;
  problem: ProblemData;
  cropImage?: { url: string; type: string } | undefined;
  showFigureCompare: boolean;
  getProxiedImageUrl: (url: string) => string;
  pointsBadge?: React.ReactNode;
}) {
  // ★ 텍스트의 첫 '?' / 첫 줄 끝 / 텍스트 끝 순으로 배지 자리 찾기 ($...$ 수식 외부만)
  //   서답형 헤더가 ".으로 끝나고 [도형] 마커가 따로 있는 케이스 (신도중 [서·논술형 6·7])
  //   처럼 '?'가 없으면 첫 \n 직전에, 그것도 없으면 마지막에 배지 박는다.
  const splitAtQuestion = (text: string): [string, string, boolean] => {
    let inBlock = false;
    let inInline = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];
      if (ch === '$' && next === '$') { inBlock = !inBlock; i++; continue; }
      if (ch === '$' && !inBlock) { inInline = !inInline; continue; }
      if (ch === '?' && !inBlock && !inInline) {
        return [text.slice(0, i + 1), text.slice(i + 1), true];
      }
    }
    // ★ '?' 없을 때 — 본문 어디서든 지시어(~시오/하라/여라/구하라)로 끝나는 문장이 줄끝/텍스트끝인
    //   첫 위치 뒤에 배지. (ExamProblemRenderer.splitAtFirstQuestionMark 와 동일 — 가드 #4 동기화).
    //   기존엔 "첫 줄"만 봐서 지문/표 뒤에 질문 오는 서답형(쇼핑몰류: 표\n…구하시오\n(1)…)에서
    //   배지가 소문제·보기/표 박스 끝에 붙던 사고 해결. "의 해는" 등 비지시어 뒤 오삽입 회귀 없음.
    const directiveRe = /(?:시오|하라|여라|구하라)\s*[.?]?(?=\s*(?:\n|$))/;
    const dm = directiveRe.exec(text);
    if (dm) {
      const end = dm.index + dm[0].length;
      return [text.slice(0, end), text.slice(end), true];
    }
    return [text, '', false];
  };
  let badgeInserted = false;
  // 텍스트 파트를 렌더하면서 배지 인라인 주입
  const renderTextWithBadge = (text: string, key: string, className: string) => {
    if (!pointsBadge || badgeInserted) {
      return <MixedContentRenderer key={key} content={text} className={className} />;
    }
    const [before, after, found] = splitAtQuestion(text);
    if (!found) {
      // 자리 못 찾음 — 배지를 텍스트 끝에 강제 부착 (단일 라인 본문 폴백)
      badgeInserted = true;
      return (
        <React.Fragment key={key}>
          <MixedContentRenderer content={text} className={className} inline />
          {pointsBadge}
        </React.Fragment>
      );
    }
    badgeInserted = true;
    return (
      <React.Fragment key={key}>
        <MixedContentRenderer content={before} className={className} inline />
        {pointsBadge}
        {after && <MixedContentRenderer content={after} className={className} inline />}
      </React.Fragment>
    );
  };
  const hasFigureSource = problem.figureData || problem.figureSvg || problem.upscaledCropUrl;
  const proxiedCrop = cropImage?.url ? proxyUrl(cropImage.url) : undefined;

  // 플로트 모드인 figure 파트가 있는지 확인
  const floatPart = contentParts.find(p => p.type === 'figure' && p.floatMode);
  const isFloatMode = !!floatPart;

  // ═══ 플로트 모드 렌더링 ═══
  if (isFloatMode && floatPart) {
    const figureIdx = contentParts.indexOf(floatPart);
    const beforeParts = contentParts.slice(0, figureIdx);
    const afterParts = contentParts.slice(figureIdx + 1);
    const floatSide = floatPart.floatMode === 'left' ? 'float-left mr-3' : 'float-right ml-3';
    const widthPct = floatPart.widthPercent || 40;

    return (
      <div className="inline">
        {/* 플로트 전 텍스트 */}
        {beforeParts.map((part, i) =>
          part.type === 'text'
            ? renderTextWithBadge(part.text, `pre-${i}`, 'inline text-sm text-content-secondary leading-relaxed')
            : null
        )}
        {/* 플로트 이미지 + 이후 텍스트가 감싸는 영역 */}
        <div>
          <div
            className={`${floatSide} mb-2`}
            style={{ width: `${widthPct}%`, maxWidth: '240px' }}
          >
            {hasFigureSource ? (
              <FigureRenderer
                figureData={problem.figureData}
                figureSvg={problem.figureSvg}
                upscaledCropUrl={problem.upscaledCropUrl ? getProxiedImageUrl(problem.upscaledCropUrl) : undefined}
                figureSource={problem.figureSource}
                cropImageUrl={proxiedCrop}
                maxWidth={240}
                darkMode
                editable
                problemId={problem.id}
              />
            ) : proxiedCrop ? (
              <img
                src={proxiedCrop}
                alt={`문제 ${problem.number} 도형`}
                className="rounded-lg border border-zinc-700 w-full object-contain"
                loading="lazy"
              />
            ) : (
              <div className="flex items-center justify-center py-4 border-2 border-dashed border-orange-500/30 rounded-lg bg-orange-500/5">
                <Shapes className="h-5 w-5 text-orange-400" />
              </div>
            )}
          </div>
          {afterParts.map((part, i) =>
            part.type === 'text'
              ? renderTextWithBadge(part.text, `post-${i}`, 'text-sm text-content-secondary leading-relaxed')
              : null
          )}
          <div style={{ clear: 'both' }} />
        </div>
      </div>
    );
  }

  // ═══ 라인 모드 렌더링 ═══
  // ★ 다중 [도형] 마커 지원: figure_crop 배열에서 순서대로 이미지 매칭
  const allFigureCrops = problem.images?.filter((img: { type: string }) => img.type === 'figure_crop') || [];
  let figureCounter = 0;
  // ★ 그림 나열(여러 작은 도형) — 각 그림을 전체폭으로 세로 쌓으면 거대해짐(온천중 #21/#22). 2개↑면
  //   작게(인라인블록) 가로로 흘러 줄바꿈되게 → 원본 격자에 가깝게. 단일 도형은 기존(큰 중앙).
  const multiFig = allFigureCrops.length >= 2;

  // ★ 각 그림 밑 캡션 짝짓기 — 표가 [그림행][캡션행] 구조라, 연속 그림 런 다음 텍스트의 캡션 수가 런 길이와
  //   일치(온천중 #21 "[N개]", #22 "①설명"). 런 단위로 그림[k]↔캡션[k] 매칭하고, 캡션은 텍스트에서 제거(중복 방지).
  const figCaptions: string[] = [];
  if (multiFig) {
    let fIdx = 0;
    for (let pi = 0; pi < contentParts.length; pi++) {
      if (contentParts[pi].type !== 'figure') continue;
      let runLen = 0;
      while (pi + runLen < contentParts.length && contentParts[pi + runLen].type === 'figure') runLen++;
      const nextPart = contentParts[pi + runLen];
      const nextText = nextPart && nextPart.type === 'text' ? nextPart.text : '';
      // ★ 캡션 영역은 다음 소문제 "(1)" 전까지 — 그 뒤의 ①② 는 소문제 본문이라 캡션 아님
      //   (온천중 #22 ⑤⑥ 뒤에 (1)①② 가 붙어 마커수 불일치로 짝짓기 실패하던 사고). tail 은 텍스트로 보존.
      const subQ = nextText.search(/(?:^|\n)\s*\(\d+\)/);
      const capZone = subQ >= 0 ? nextText.slice(0, subQ) : nextText;
      const tail = subQ >= 0 ? nextText.slice(subQ) : '';
      const brackets = capZone.match(/\[[^\][]+\]/g);
      const circled = capZone.match(/[①②③④⑤⑥⑦⑧⑨⑩][^①②③④⑤⑥⑦⑧⑨⑩]*/g);
      let caps: string[] = [];
      if (brackets && brackets.length === runLen) {
        caps = brackets.map((s) => s.trim());
        nextPart.text = `${capZone.replace(/\[[^\][]+\]/g, '').trim()} ${tail}`.trim();
      } else if (circled && circled.length === runLen) {
        caps = circled.map((s) => s.trim());
        nextPart.text = `${capZone.replace(/[①②③④⑤⑥⑦⑧⑨⑩][^①②③④⑤⑥⑦⑧⑨⑩]*/g, '').trim()} ${tail}`.trim();
      }
      for (let k = 0; k < runLen; k++) figCaptions[fIdx + k] = caps[k] || '';
      fIdx += runLen;
      pi += runLen - 1;
    }
  }

  return (
    <div className="inline">
      {contentParts.map((part, i) => {
        if (part.type === 'text') {
          // ★ 캡션 추출로 비워진 텍스트는 스킵(빈 content → "(문제 내용 없음)" 표시되던 사고).
          if (!part.text || !part.text.trim()) return null;
          // ★ 그림 나열(multiFig)에선 텍스트를 block 으로 — inline 이면 그림 뒤 텍스트("(1)" 등)가
          //   그림 옆으로 흘러 붙음. block 이면 그림 아래 줄로 떨어짐.
          return renderTextWithBadge(part.text, String(i), `${multiFig ? 'block' : 'inline'} text-sm text-content-secondary leading-relaxed`);
        }

        // figure 파트 — figureCounter로 순서 매칭
        const currentFigureIdx = figureCounter++;
        const matchedCrop = allFigureCrops[currentFigureIdx];

        // 첫 번째 도형: 기존 FigureRenderer (upscaledCropUrl/figureData 등)
        if (currentFigureIdx === 0 && hasFigureSource) {
          return showFigureCompare && cropImage ? (
            <div key={i} className="my-2 grid grid-cols-2 gap-3">
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-blue-400 font-semibold mb-1">원본</span>
                <img src={proxyUrl(cropImage.url)} alt="원본 도형" className="rounded border border-blue-500/30 max-h-48 object-contain" loading="lazy" />
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-emerald-400 font-semibold mb-1">AI 생성</span>
                <div className="border border-emerald-500/30 rounded p-1">
                  <FigureRenderer figureData={problem.figureData} figureSvg={problem.figureSvg} upscaledCropUrl={problem.upscaledCropUrl ? getProxiedImageUrl(problem.upscaledCropUrl) : undefined} figureSource={problem.figureSource} cropImageUrl={proxiedCrop} maxWidth={200} darkMode editable problemId={problem.id} problemContent={problem.content} />
                </div>
              </div>
            </div>
          ) : (
            <div key={i} className="my-2 flex justify-center">
              <FigureRenderer figureData={problem.figureData} figureSvg={problem.figureSvg} upscaledCropUrl={problem.upscaledCropUrl ? getProxiedImageUrl(problem.upscaledCropUrl) : undefined} figureSource={problem.figureSource} cropImageUrl={proxiedCrop} maxWidth={300} darkMode editable problemId={problem.id} problemContent={problem.content} />
            </div>
          );
        }

        // 2번째 이후 도형 또는 첫 번째에 figureSource 없을 때: figure_crop 이미지 직접 표시
        if (matchedCrop) {
          // ★ 그림 나열(2개↑) → 작게 가로 흐름(줄바꿈) + 그림 밑 캡션([N개]/①설명).
          return multiFig ? (
            <span key={i} className="inline-flex flex-col items-center align-top m-1 max-w-[200px]">
              <img
                src={proxyUrl(matchedCrop.url)}
                alt={matchedCrop.label || `도형 ${currentFigureIdx + 1}`}
                className="rounded-lg border border-zinc-600 bg-white max-h-32 object-contain shadow-sm"
                loading="lazy"
              />
              {figCaptions[currentFigureIdx] && (
                <span className="text-[11px] text-content-secondary mt-1 text-center leading-snug">{figCaptions[currentFigureIdx]}</span>
              )}
            </span>
          ) : (
            <div key={i} className="my-2 flex justify-center">
              <img
                src={proxyUrl(matchedCrop.url)}
                alt={matchedCrop.label || `도형 ${currentFigureIdx + 1}`}
                className="rounded-lg border border-zinc-600 bg-white max-h-64 object-contain shadow-sm"
                loading="lazy"
              />
            </div>
          );
        }

        // figure_crop도 없으면 일반 crop 또는 플레이스홀더
        if (cropImage && currentFigureIdx === 0) {
          return (
            <div key={i} className="my-2 flex justify-center">
              <img
                src={proxyUrl(cropImage.url)}
                alt={`문제 ${problem.number} 원본 도형`}
                className="rounded-lg border border-zinc-700 max-h-64 object-contain"
                loading="lazy"
              />
            </div>
          );
        }

        return (
          <div key={i} className="my-2 flex justify-center">
            <div className="flex flex-col items-center justify-center gap-2 py-6 px-8 border-2 border-dashed border-orange-500/30 rounded-lg bg-orange-500/5">
              <Shapes className="h-6 w-6 text-orange-400" />
              <span className="text-xs text-orange-400 font-medium">도형 포함 — 도형 생성 버튼을 클릭하세요</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// 서술형 소문제 파서·테이블
// 본문에서 [서·논술형 N-M] 또는 [서•논술형 N-M] 패턴을 찾아 sub-question 목록 반환
// ============================================================================

interface SubQuestion {
  number: string;       // "1-1", "2-1" 등
  text: string;         // 소문제 본문 (다음 [서·논술형] 까지 또는 끝)
  answer: string;       // 사용자 입력 답
  points: number | null; // 사용자 입력 배점
}

function parseSubQuestions(
  content: string,
  choices: string[],
  saved: Array<{ number: string; answer: string; points: number | null }>
): SubQuestion[] {
  // 통합 매칭 — 본문/선택지 모두에서 소문제 추출
  const subKeyword = /구하시오|구하여라|구해라|서술하시오|설명하시오|증명하시오|나타내시오|보이시오|판단하시오|풀이\s*과정|쓰시오|쓰고|답하시오|완성하시오|그리시오|작도하시오|구하세요|구해\s*보시오/;

  // ★ 본문 안에서 [N점] / (N점) 추출 헬퍼 — 소문제 본문 끝/내부에 표기된 배점을 자동 인식.
  //   "그냥 배점 있으면 다 표기" 요구사항: 본문에 보이는 점수를 입력 박스 기본값으로 채워넣음.
  //   사용자가 직접 입력한(saved) 값이 있으면 그것 우선, 없을 때만 자동 추출값.
  const extractPointsFromText = (text: string): number | null => {
    const mm = text.match(/[\[(]\s*(\d+(?:\.\d+)?)\s*점\s*[\])]/);
    return mm ? parseFloat(mm[1]) : null;
  };

  // 1) [서·논술형 N-M] 패턴 (본문)
  //    ★ 중점(·•.)은 optional — OCR 결과에 따라 "[서 논술형 4-3]" 처럼 공백만 있는 경우도 동일 패턴.
  //      누락 사례: 신도중 2-1 [서 논술형 4-3] 이 4-1·4-2 와 함께 안 잡혀 입력 박스에서 사라지던 사고.
  const reNested = /\[\s*서\s*[·•.]?\s*논술형\s*(\d+\s*-\s*\d+)\s*\]/g;
  const nested: { number: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = reNested.exec(content)) !== null) {
    nested.push({ number: m[1].replace(/\s+/g, ''), index: m.index });
  }
  if (nested.length > 0) {
    return nested.map((mt, i) => {
      const start = mt.index;
      const end = i + 1 < nested.length ? nested[i + 1].index : content.length;
      const text = content.substring(start, end).replace(/^\[[^\]]+\]\s*/, '').trim();
      const savedItem = saved.find(s => s.number === mt.number);
      return {
        number: mt.number,
        text,
        answer: savedItem?.answer || '',
        points: savedItem?.points ?? extractPointsFromText(text),
      };
    });
  }

  // 1.5) 라인 시작 "N-M." 패턴 — 대괄호 헤더 없이 소문제만 본문에 나열된 케이스.
  //      예: 동백중 2-1 [서논술형 5/6] 은 헤더가 [서논술형5] (단일) 이고
  //          본문에 "5-1.", "5-2.", "5-3.", "5-4." 형식으로만 소문제 표기.
  //      누락 사례: SubQuestionTable 자체가 안 떠서 사용자가 답·배점 입력 자체 못 함.
  const reLineSub = /(?:^|\n)\s*(\d+\s*-\s*\d+)\s*[.．]\s*/g;
  const lineSubs: { number: string; index: number; matchEnd: number }[] = [];
  while ((m = reLineSub.exec(content)) !== null) {
    lineSubs.push({ number: m[1].replace(/\s+/g, ''), index: m.index, matchEnd: m.index + m[0].length });
  }
  // 같은 대문제 번호로 시작하는 N-M 가 2개 이상이어야 진짜 소문제 (N=대문제, M=소문제 인덱스)
  // 첫 N 만 추출해서 같은 N 그룹이 ≥ 2 인지 확인
  if (lineSubs.length >= 2) {
    const firstParent = lineSubs[0].number.split('-')[0];
    const sameParent = lineSubs.filter(s => s.number.split('-')[0] === firstParent);
    if (sameParent.length >= 2) {
      return sameParent.map((mt, i) => {
        const start = mt.matchEnd;
        const end = i + 1 < sameParent.length ? sameParent[i + 1].index : content.length;
        const text = content.substring(start, end).trim();
        const savedItem = saved.find(s => s.number === mt.number);
        return {
          number: mt.number,
          text,
          answer: savedItem?.answer || '',
          points: savedItem?.points ?? extractPointsFromText(text),
        };
      });
    }
  }

  // 1.6) [N-M] 단순 대괄호 패턴 — "서·논술형" 키워드 없이 그냥 [3-1] [3-2] 식으로 표기된 케이스.
  //      예: "물음에 답하시오. [3-1] $\\sqrt{60/x}$ ... [3-2] ..." 같은 시험지 (헤더 없는 묶음).
  //      [총 N점] / [N점] / [도형] 등은 N-M 형식이 아니므로 매칭 안 됨.
  //      lineSubs 와 동일하게 같은 부모 N 그룹이 ≥ 2 일 때만 인정 (false positive 차단).
  const reBracketSub = /\[\s*(\d+)\s*-\s*(\d+)\s*\]/g;
  const bracketSubs: { number: string; index: number; matchEnd: number }[] = [];
  while ((m = reBracketSub.exec(content)) !== null) {
    bracketSubs.push({
      number: `${m[1]}-${m[2]}`,
      index: m.index,
      matchEnd: m.index + m[0].length,
    });
  }
  if (bracketSubs.length >= 2) {
    const firstParent = bracketSubs[0].number.split('-')[0];
    const sameParent = bracketSubs.filter(s => s.number.split('-')[0] === firstParent);
    if (sameParent.length >= 2) {
      return sameParent.map((mt, i) => {
        const start = mt.matchEnd;
        const end = i + 1 < sameParent.length ? sameParent[i + 1].index : content.length;
        const text = content.substring(start, end).trim();
        const savedItem = saved.find(s => s.number === mt.number);
        return {
          number: mt.number,
          text,
          answer: savedItem?.answer || '',
          points: savedItem?.points ?? extractPointsFromText(text),
        };
      });
    }
  }

  // 2) 본문에 (1) (2) (3) ... 가 연속 + 서술형 키워드 포함 → 소문제로 인식
  const reParenBody = /\(([1-9])\)/g;
  const parensAll: { number: string; index: number }[] = [];
  while ((m = reParenBody.exec(content)) !== null) {
    parensAll.push({ number: m[1], index: m.index });
  }
  // ★ 순차(1,2,3…)인 것만 진짜 소문제로 인정 (2026-06-02).
  //   "(2) … (1)의 상수 …" 처럼 본문 중간의 (1) 참조는 번호가 안 이어지므로 제외.
  //   누락 사례: 서답형3(21번) = (1)(2) 인데 (2) 안의 "(1)의" 참조까지 잡혀 "1,2,1" 3행 +
  //   (2) 본문이 그 참조에서 잘리던 사고.
  const parens: { number: string; index: number }[] = [];
  let expectedSub = 1;
  for (const pp of parensAll) {
    if (parseInt(pp.number, 10) === expectedSub) { parens.push(pp); expectedSub++; }
  }
  // (1) (2) (3) 가 순차로 있고 + 본문 어딘가에 서술형 키워드가 있으면 소문제
  if (parens.length >= 2 && subKeyword.test(content)) {
    return parens.map((mt, i) => {
      const start = mt.index;
      const end = i + 1 < parens.length ? parens[i + 1].index : content.length;
      const text = content.substring(start, end).replace(/^\(\d+\)\s*/, '').trim();
      const savedItem = saved.find(s => s.number === mt.number);
      return {
        number: mt.number,
        text,
        answer: savedItem?.answer || '',
        points: savedItem?.points ?? extractPointsFromText(text),
      };
    });
  }

  // 3) choices 배열에 소문제가 들어있는 경우 (OCR 단계에서 분리된 케이스)
  //    isSubProblem 판정과 동일 로직 (서술형 키워드 또는 (1) 접두 prefix)
  if (choices.length >= 2) {
    const looksLikeSub = choices.some(c => subKeyword.test(c)) || choices.every(c => /^\(\d+\)/.test(c));
    if (looksLikeSub) {
      return choices.map((c, i) => {
        const num = (c.match(/^\((\d+)\)/)?.[1]) || `${i + 1}`;
        const text = c.replace(/^\(\d+\)\s*/, '').trim();
        const savedItem = saved.find(s => s.number === num);
        return {
          number: num,
          text,
          answer: savedItem?.answer || '',
          points: savedItem?.points ?? extractPointsFromText(text),
        };
      });
    }
  }

  return [];
}

function SubQuestionTable({
  problemId,
  subQuestions,
  onSaved,
  onTotalPointsChange,
}: {
  problemId: string;
  subQuestions: SubQuestion[];
  onSaved?: () => void;
  // ★ 합계 점수가 변하면 호출 — 부모(ProblemCardView)가 exam_problems.points 로 반영.
  //   소문제별 입력값(answer_json.subQuestions)만 저장하던 기존 동작을 카드 헤더 배점 배지/시험지 총점까지 연동.
  onTotalPointsChange?: (total: number | null) => void | Promise<void>;
}) {
  const [items, setItems] = React.useState(subQuestions);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => { setItems(subQuestions); }, [subQuestions.length]);

  const persist = useCallback(async (next: SubQuestion[]) => {
    try {
      await fetch(`/api/problems/${problemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer_json_patch: {
            subQuestions: next.map(it => ({
              number: it.number,
              answer: it.answer,
              points: it.points,
            })),
          },
        }),
      });
      // ★ 입력된 점수가 하나라도 있으면 합계, 전부 비어있으면 null (사용자 미입력으로 둠).
      if (onTotalPointsChange) {
        const hasAny = next.some(it => typeof it.points === 'number' && Number.isFinite(it.points));
        const total = hasAny ? next.reduce((s, it) => s + (it.points || 0), 0) : null;
        try { await onTotalPointsChange(total); } catch (e) { console.warn('[SubQuestion] points sync failed:', e); }
      }
      onSaved?.();
    } catch (e) {
      console.warn('[SubQuestion] save failed:', e);
    }
  }, [problemId, onSaved, onTotalPointsChange]);

  const update = (idx: number, patch: Partial<SubQuestion>) => {
    setItems(prev => {
      const next = prev.map((it, i) => (i === idx ? { ...it, ...patch } : it));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(next), 600);
      return next;
    });
  };

  const totalPoints = items.reduce((s, it) => s + (it.points || 0), 0);

  return (
    <div className="mt-3 border border-amber-500/30 rounded-md bg-amber-500/5">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-amber-500/20 text-[11px] font-semibold text-amber-400">
        <span>소문제별 답·배점</span>
        <span className="text-amber-300">합계: {totalPoints}점</span>
      </div>
      <div className="divide-y divide-amber-500/10">
        {items.map((it, idx) => (
          <div key={it.number} className="flex items-center gap-2 px-3 py-1.5">
            <span className="text-[11px] font-bold text-cyan-400 w-10 flex-shrink-0">{it.number}</span>
            <input
              type="text"
              placeholder="답"
              value={it.answer}
              onChange={(e) => update(idx, { answer: e.target.value })}
              className="flex-1 bg-zinc-900/60 border border-zinc-700 rounded px-2 py-1 text-[12px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500"
            />
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              placeholder="점수"
              value={it.points ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                update(idx, { points: v === '' ? null : Number(v) });
              }}
              className="w-16 bg-zinc-900/60 border border-zinc-700 rounded px-2 py-1 text-[12px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 text-right"
            />
            <span className="text-[11px] text-zinc-500">점</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProblemCardView({
  problem,
  onTwinGenerate,
  onEdit,
  onRescan,
  onGenerateFigure,
  onGenerateAIFigure,
  onDeleteFigure,
  onReplaceDiagram,
  onUpdateContent,
  onUpdatePoints,
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
  onGenerateAIFigure?: (p: ProblemData) => void;
  onDeleteFigure?: (p: ProblemData) => void;
  onReplaceDiagram?: (p: ProblemData, figureIndex?: number) => void;
  onUpdateContent?: (problemId: string, content: string) => Promise<void>;
  onUpdatePoints?: (problemId: string, points: number | null) => Promise<void>;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  viewMode?: 'clean' | 'original';
  isGeneratingFigure?: boolean;
  isRescanning?: boolean;
}) {
  const [isEditingPosition, setIsEditingPosition] = useState(false);
  const [showFigureCompare, setShowFigureCompare] = useState(false);
  // ★ 배점 인라인 편집
  const [isEditingPoints, setIsEditingPoints] = useState(false);
  const [pointsDraft, setPointsDraft] = useState<string>(String(problem.points ?? ''));
  useEffect(() => {
    setPointsDraft(String(problem.points ?? ''));
  }, [problem.points]);
  const figureCropImage = problem.images?.find(img => img.type === 'figure_crop');
  const cropImage = figureCropImage || problem.images?.find(img => img.type === 'crop');
  const showOriginal = globalViewMode === 'original' && !!cropImage;
  const hasFigureContent = problem.upscaledCropUrl || problem.figureData || problem.figureSvg || cropImage;

  // ★ 클린 모드: LaTeX 전처리 (공통 유틸 사용)
  // ★ 소문제별 배점(answer_json.subQuestions) 을 본문 "N-M." 라인 뒤에 인라인 주입.
  //   사용자가 SubQuestionTable 에 입력한 점수가 화면에 즉시 반영되어야 시험지 출력에도 그대로 따라감.
  const savedSubsForInject = (problem.answerJson as { subQuestions?: Array<{ number: string; answer: string; points: number | null }> })?.subQuestions || [];
  const cleanContent = injectSubQuestionPoints(cleanLatexContent(problem.content), savedSubsForInject);

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
          {/* ★ HML 가져오기 검증 루프 — 룰베이스 자동검증이 의심 잡은 문제. 사유는 툴팁. */}
          {(() => {
            const hmlWarnings = (problem.answerJson as { _hmlWarnings?: string[] })?._hmlWarnings;
            if (!hmlWarnings?.length) return null;
            return (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 cursor-help"
                title={`검수 필요:\n· ${hmlWarnings.join('\n· ')}`}
              >
                ⚠️ 검수 {hmlWarnings.length}
              </span>
            );
          })()}
          {/* ★ 해설 미완성 배지 — 일괄 해설 생성에서 '미완성만 재처리'로 걸러냄 */}
          {!problem.solution?.trim() && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20"
              title="AI 해설이 아직 생성되지 않음">
              해설 없음
            </span>
          )}
          {problem.hasFigure && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
              problem.upscaledCropUrl || problem.figureData || problem.figureSvg
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
            }`}>
              {problem.upscaledCropUrl
                ? '업스케일'
                : problem.figureData
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
            {/* ★ 도형 업스케일 버튼 (도형 있고 아직 업스케일/AI 안 됨) */}
            {problem.hasFigure && !problem.upscaledCropUrl && !problem.figureData && !problem.figureSvg && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onGenerateFigure?.(problem); }}
                className={`px-2 py-1 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors ${
                  isGeneratingFigure
                    ? 'text-blue-400 bg-blue-500/20 animate-pulse'
                    : 'text-blue-400 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20'
                }`}
                title="도형 업스케일 (원본 정리)"
                disabled={isGeneratingFigure}
              >
                {isGeneratingFigure ? <Loader2 className="h-3 w-3 animate-spin" /> : <ZoomIn className="h-3 w-3" />}
                업스케일
              </button>
            )}
            {/* ★ AI 도형 생성 버튼 (도형 또는 크롭 이미지가 있는 문제) */}
            {(problem.hasFigure || cropImage) && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onGenerateAIFigure?.(problem); }}
                className={`px-2 py-1 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors ${
                  isGeneratingFigure
                    ? 'text-orange-400 bg-orange-500/20 animate-pulse'
                    : 'text-orange-400 bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20'
                }`}
                title="AI 도형 생성 (Vision AI)"
                disabled={isGeneratingFigure}
              >
                {isGeneratingFigure ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                AI 생성
              </button>
            )}
            {/* ★ 원본 사용 버튼 (AI 생성 도형 → 원본 크롭으로 되돌리기) */}
            {cropImage && (problem.figureData || problem.figureSvg) && (
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!confirm('AI 생성 도형을 제거하고 원본 크롭 이미지를 사용하시겠습니까?')) return;
                  try {
                    const existRes = await fetch(`/api/problems/${problem.id}`);
                    const existData = existRes.ok ? await existRes.json() : {};
                    const ai = { ...(existData.ai_analysis || {}) };
                    // ★ 원본 이미지: figureData의 원본 → figure_crop → crop 순서
                    const originalUrl = (ai.figureData as Record<string, unknown>)?.originalImageUrl as string
                      || figureCropImage?.url
                      || cropImage?.url;
                    delete ai.figureData;
                    delete ai.figureSvg;
                    ai.upscaledCropUrl = originalUrl;
                    ai.figureSource = 'original_crop';
                    ai.hasFigure = true;
                    await fetch(`/api/problems/${problem.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ai_analysis: ai }),
                    });
                    // ★ 교정 이력 기록 (원본 사용 = AI 생성 거부 신호)
                    fetch('/api/figure-corrections', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        problemId: problem.id,
                        correctionType: 'use_original',
                        correctedImageUrl: originalUrl,
                      }),
                    }).then(r => {
                      if (r.ok) console.log('[figure-corrections] ✅ 원본사용 교정 기록 저장');
                      else console.error('[figure-corrections] ❌ 원본사용 교정 실패:', r.status);
                    }).catch(err => console.error('[figure-corrections] ❌ API 호출 실패:', err));
                    window.dispatchEvent(new CustomEvent('problems-updated'));
                  } catch (err) {
                    console.error('[OriginalCrop] Error:', err);
                  }
                }}
                className="px-2 py-1 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors text-violet-400 bg-violet-500/10 border border-violet-500/30 hover:bg-violet-500/20"
                title="AI 도형 제거, 원본 크롭 이미지 사용"
              >
                <ImageIcon className="h-3 w-3" />
                원본사용
              </button>
            )}
            {/* ★ 도식 교체 버튼 (다중 이미지: content 내 이미지 개수 기준) */}
            {(problem.hasFigure || cropImage) && (() => {
              // content에 이미지가 몇 개 필요한지 = [도형] 마커 또는 ![이미지] 개수
              const imageCount = Math.max(
                (problem.content.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length,
                (problem.images?.filter(img => img.type === 'figure_crop') || []).length,
                1
              );
              return (
                <>
                  {imageCount <= 1 ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onReplaceDiagram?.(problem, 0); }}
                      className="px-2 py-1 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors text-teal-400 bg-teal-500/10 border border-teal-500/30 hover:bg-teal-500/20"
                      title="도식 DB에서 이미지 교체"
                    >
                      <ImageIcon className="h-3 w-3" />
                      도식교체
                    </button>
                  ) : (
                    <>
                      {Array.from({ length: imageCount }, (_, idx) => (
                        <button
                          key={`replace-${idx}`}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onReplaceDiagram?.(problem, idx); }}
                          className="px-2 py-1 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors text-teal-400 bg-teal-500/10 border border-teal-500/30 hover:bg-teal-500/20"
                          title={`도식 ${idx + 1} 교체`}
                        >
                          <ImageIcon className="h-3 w-3" />
                          도식{idx + 1}
                        </button>
                      ))}
                    </>
                  )}
                </>
              );
            })()}
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
              cropImageUrl={cropImage?.url ? getProxiedImageUrl(cropImage.url) : undefined}
              upscaledCropUrl={problem.upscaledCropUrl ? getProxiedImageUrl(problem.upscaledCropUrl) : undefined}
              figureSource={problem.figureSource}
              // ★ 멀티 figure 지원 (2026-05-19): 2번째 이후 figure_crop 들도 전달.
              //   첫 figure 가 cropImage(=figure_crop 첫개 or crop) 와 동일하면 skip,
              //   아니면 첫 figure_crop 부터 모두 추가. 이전 사고: 2번째 도형이 [도형] 텍스트로 남음.
              extraFigureUrls={(() => {
                const figureCrops = problem.images?.filter((img: { type: string }) => img.type === 'figure_crop') || [];
                if (figureCrops.length === 0) return [];
                // 첫 cropImage 가 cropImage 와 동일하면 두번째부터, 아니면 첫번째부터
                const startIdx = (cropImage && figureCrops[0]?.url === cropImage.url) ? 1 : 0;
                return figureCrops.slice(startIdx).map((img: { url: string }) => getProxiedImageUrl(img.url));
              })()}
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
              src={getProxiedImageUrl(cropImage!.url)}
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
              {(() => {
                // ★ 배점 배지 — '?' 바로 뒤에 삽입. 없으면 content 끝에.
                const pointsBadge = isEditingPoints ? (
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={pointsDraft}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setPointsDraft(e.target.value)}
                    onBlur={async () => {
                      setIsEditingPoints(false);
                      const trimmed = pointsDraft.trim();
                      // 빈 입력 → NULL 저장 (배점 미지정으로)
                      if (trimmed === '') {
                        if (problem.points != null) {
                          try { await onUpdatePoints?.(problem.id, null); } catch {}
                        }
                        return;
                      }
                      const next = parseFloat(trimmed);
                      if (!Number.isFinite(next) || next === problem.points) return;
                      try { await onUpdatePoints?.(problem.id, next); } catch {}
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                      if (e.key === 'Escape') { setIsEditingPoints(false); setPointsDraft(String(problem.points ?? '')); }
                    }}
                    className="inline-block w-14 ml-1 px-1.5 py-0.5 text-xs rounded bg-amber-500/10 border border-amber-500/40 text-amber-300 outline-none focus:ring-1 focus:ring-amber-500"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIsEditingPoints(true); }}
                    title="배점 수정"
                    className="inline-flex items-center ml-1 px-1.5 py-0.5 text-xs font-semibold rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                  >
                    [{typeof problem.points === 'number' ? problem.points : '-'}점]
                  </button>
                );

                // content 내부 첫 '?' / 첫 줄 끝 위치 찾기 ($...$ 수식 외부만)
                //   1) '?' 우선 — 일반 객관식·단답 문제
                //   2) 없으면 첫 줄 끝 (\n 직전) — 서답형 헤더 라인 ("[서·논술형 4] 식을 간단히 하시오.") 끝에 자연스럽게 배지 부착.
                //      ★ 이전엔 "?"가 없으면 content 전체 끝에 박혀 [4-3] 마지막 라인 끝에 [N점] 배지가 붙는 사고.
                //   3) 첫 줄도 없으면 content 끝 (single-line 본문)
                const splitAtQuestion = (text: string): [string, string, boolean] => {
                  let inBlock = false;
                  let inInline = false;
                  for (let i = 0; i < text.length; i++) {
                    const ch = text[i];
                    const next = text[i + 1];
                    if (ch === '$' && next === '$') { inBlock = !inBlock; i++; continue; }
                    if (ch === '$' && !inBlock) { inInline = !inInline; continue; }
                    if (ch === '?' && !inBlock && !inInline) {
                      return [text.slice(0, i + 1), text.slice(i + 1), true];
                    }
                  }
                  // ★ '?' 없을 때 — 지시어(~시오/하라/여라/구하라)로 끝나는 문장이 줄끝/텍스트끝인 첫
                  //   위치 뒤에 배지. (ExamProblemRenderer 와 동일 directiveRe — 가드 #4 동기화). 기존엔
                  //   "첫 줄"만 봐서 지문/표 뒤 질문 서답형(쇼핑몰류)에서 배지가 소문제·박스 끝에 붙던 사고.
                  const directiveRe = /(?:시오|하라|여라|구하라)\s*[.?]?(?=\s*(?:\n|$))/;
                  const dm = directiveRe.exec(text);
                  if (dm) {
                    return [text.slice(0, dm.index + dm[0].length), text.slice(dm.index + dm[0].length), true];
                  }
                  return [text, '', false];
                };

                if (hasFigureMarker) {
                  // 도형 마커 있는 경우: FigureMarkerRenderer가 첫 텍스트 파트의 '?' 뒤에 배지 인라인 삽입
                  // (도형 위치와 무관하게 질문 끝에 배치 → 이미지 밑으로 안 떨어짐)
                  return (
                    <FigureMarkerRenderer
                      contentParts={contentParts}
                      problem={problem}
                      cropImage={cropImage}
                      showFigureCompare={showFigureCompare}
                      getProxiedImageUrl={getProxiedImageUrl}
                      pointsBadge={pointsBadge}
                    />
                  );
                }

                const [before, after, foundQ] = splitAtQuestion(cleanContent);
                if (!foundQ) {
                  // '?' 없음 — content 전체 뒤에 배지
                  return (
                    <>
                      <MixedContentRenderer
                        content={cleanContent}
                        className="inline text-sm text-content-secondary leading-relaxed"
                      />
                      {pointsBadge}
                    </>
                  );
                }

                return (
                  <>
                    <MixedContentRenderer
                      content={before}
                      className="inline text-sm text-content-secondary leading-relaxed"
                      inline
                    />
                    {pointsBadge}
                    {after && (
                      <MixedContentRenderer
                        content={after}
                        className="inline text-sm text-content-secondary leading-relaxed"
                      />
                    )}
                  </>
                );
              })()}
              {!hasFigureMarker && (
                <>
                  {/* AI 도형 또는 업스케일 이미지가 있지만 마커가 없는 경우 → 하단에 표시 */}
                  {(problem.figureData || problem.figureSvg || problem.upscaledCropUrl) && (
                    showFigureCompare && cropImage ? (
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-blue-400 font-semibold mb-1">원본</span>
                          <img src={getProxiedImageUrl(cropImage.url)} alt="원본 도형" className="rounded border border-blue-500/30 max-h-48 object-contain" loading="lazy" />
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-emerald-400 font-semibold mb-1">AI 생성</span>
                          <div className="border border-emerald-500/30 rounded p-1">
                            <FigureRenderer figureData={problem.figureData} figureSvg={problem.figureSvg} upscaledCropUrl={problem.upscaledCropUrl ? getProxiedImageUrl(problem.upscaledCropUrl) : undefined} figureSource={problem.figureSource} cropImageUrl={cropImage?.url ? getProxiedImageUrl(cropImage.url) : undefined} maxWidth={200} darkMode editable problemId={problem.id} problemContent={problem.content} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex justify-center">
                        <FigureRenderer figureData={problem.figureData} figureSvg={problem.figureSvg} upscaledCropUrl={problem.upscaledCropUrl ? getProxiedImageUrl(problem.upscaledCropUrl) : undefined} figureSource={problem.figureSource} cropImageUrl={cropImage?.url ? getProxiedImageUrl(cropImage.url) : undefined} maxWidth={300} darkMode editable problemId={problem.id} problemContent={problem.content} />
                      </div>
                    )
                  )}
                </>
              )}
            </div>

            {/* 선택지/소문제 — 유형+길이에 따라 레이아웃 자동 전환 */}
            {problem.choices.length > 0 && (() => {
              const headers = problem.choiceHeaders;
              const hasTableHeaders = headers && headers.length > 0;

              // ★ 표 형식 선택지: choiceHeaders가 있으면 테이블로 렌더링
              if (hasTableHeaders) {
                const colCount = headers.length;
                return (
                  <div className="mt-2 pl-2 overflow-x-auto">
                    <table className="border-collapse text-[13px]">
                      <thead>
                        <tr>
                          <th className="px-2 py-1" />
                          {headers.map((h, i) => (
                            <th key={i} className="px-3 py-1 text-center font-bold text-blue-400 border-b border-blue-500/20 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {problem.choices.map((choice, i) => {
                          const circled = ['①', '②', '③', '④', '⑤'][i] || `(${i + 1})`;
                          const stripped = choice.replace(/^[①②③④⑤]\s*/, '').replace(/^\(\s*\d+\s*\)\s*/, '').trim();
                          // | 구분자로 셀 분리 (백워드 호환: PR #124 가 ' / ' 로 join 한 초기 데이터도 인식)
                          const cells = stripped.split(/\s*\|\s*|\s+\/\s+/).map(s => s.trim());
                          return (
                            <tr key={i}>
                              <td className="px-2 py-0.5 text-content-tertiary whitespace-nowrap">{circled}</td>
                              {Array.from({ length: colCount }, (_, ci) => (
                                <td key={ci} className="px-3 py-0.5 text-center text-content-secondary whitespace-nowrap">
                                  <MixedContentRenderer content={cells[ci] || ''} className="text-content-secondary" />
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

              // 객관식 보기 — 항상 ①②③④⑤ 사용
              const processed = problem.choices.map((choice, i) => {
                const circled = ['①', '②', '③', '④', '⑤'][i] || `(${i + 1})`;
                const stripped = cleanChoiceText(choice.replace(/^[①②③④⑤]\s*/, '').replace(/^\(\s*\d+\s*\)\s*/, ''));
                // ★ 그림 객관식: 옵션별 이미지 URL
                const imgUrl = problem.choiceImages?.[i] || null;
                return { circled, stripped, imgUrl };
              });
              const hasAnyChoiceImage = processed.some(c => !!c.imgUrl);
              const maxLen = Math.max(...processed.map(c => c.stripped.replace(/\$[^$]*\$/g, 'XX').replace(/\\[a-z]+/gi, '').length));

              // ★ 저장된 choiceLayout 우선 적용 (1=1열, 2=2열, 3=3열, 5=가로)
              const savedLayout = problem.choiceLayout ?? (problem.answerJson as { choiceLayout?: number })?.choiceLayout;

              // 레이아웃 결정: savedLayout이 있으면 무조건 우선, 없으면 maxLen 자동감지
              // ★ 그림 객관식이면 inline(가로 한 줄) 모드는 강제 해제 — 이미지가 줄을 깨므로 grid로 강제
              let gridClass = 'mt-2 space-y-1.5 pl-4'; // 기본: 1열
              let isInline = false;
              if (savedLayout) {
                if (savedLayout === 5 && !hasAnyChoiceImage) { isInline = true; }
                // ★ 그림 보기 + 원본 가로(5) → 5열로 깔면 그래프가 1/5 폭으로 찌그러짐(동해중 #9 회귀).
                //   인쇄용 ExamProblemRenderer 와 동일하게 2열로(이미지 적당 크기). PR #366 회귀 fix.
                else if (savedLayout === 5 && hasAnyChoiceImage) { gridClass = 'mt-2 grid grid-cols-2 gap-x-4 gap-y-2 pl-4'; }
                else if (savedLayout === 3) { gridClass = 'mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 pl-4'; }
                else if (savedLayout === 2) { gridClass = 'mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 pl-4'; }
                // savedLayout === 1 → 기본 1열
              } else {
                if (maxLen <= 12 && !hasAnyChoiceImage) isInline = true;
                else if (maxLen <= 30 || hasAnyChoiceImage) gridClass = 'mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 pl-4';
              }

              if (isInline) {
                return (
                  <div className="mt-2 flex flex-wrap items-center gap-x-7 gap-y-1.5 pl-4">
                    {processed.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-[13px] text-content-secondary">
                        <span className="flex-shrink-0 text-content-tertiary">{c.circled}</span>
                        <MixedContentRenderer content={c.stripped} className="text-content-secondary" />
                      </div>
                    ))}
                  </div>
                );
              }
              return (
                <div className={gridClass}>
                  {processed.map((c, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[13px] text-content-secondary">
                      <span className="flex-shrink-0 text-content-tertiary">{c.circled}</span>
                      <div className="flex flex-col gap-1 min-w-0">
                        {/* 그림 객관식: 이미지 있으면 표시
                            ★ 프록시 URL 변환 필수 (2026-05-19): private storage 라
                            직접 접근 불가 → 변환 누락 시 이미지 로드 실패로
                            선택지 자체가 안 보이던 사고 차단. */}
                        {c.imgUrl && (
                          <img
                            src={getProxiedImageUrl(c.imgUrl)}
                            alt={`선택지 ${i + 1}`}
                            className="max-h-24 max-w-full rounded border border bg-white object-contain"
                          />
                        )}
                        {/* 텍스트 — 비어있어도 항상 렌더(렌더러에서 빈 문자열 처리) */}
                        {c.stripped && (
                          <MixedContentRenderer content={c.stripped} className="text-content-secondary" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </>
        )}

        {/* ★ 서술형 소문제 답·배점 입력 — 본문/선택지 어디든 소문제 패턴 있으면 자동 표시 */}
        {(() => {
          const savedSubs = (problem.answerJson as { subQuestions?: Array<{ number: string; answer: string; points: number | null }> })?.subQuestions || [];
          const subs = parseSubQuestions(problem.content || '', problem.choices || [], savedSubs);
          if (subs.length === 0) return null;
          return (
            <SubQuestionTable
              problemId={problem.id}
              subQuestions={subs}
              onSaved={() => { /* silent — refetch 안 해서 카드 깜빡임 방지 */ }}
              // ★ 합계 → exam_problems.points 자동 반영. 카드 헤더 배점 배지/시험지 총점까지 즉시 동기화.
              onTotalPointsChange={onUpdatePoints ? (total) => onUpdatePoints(problem.id, total) : undefined}
            />
          );
        })()}
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
              {problem.typeCode}{problem.typeName && problem.typeName !== problem.typeCode ? `. ${problem.typeName}` : ''}
            </span>
          )}
          {problem.year && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {problem.year}
            </span>
          )}
        </div>
      </div>

      {/* 유형 footer 제거 — 상단 amber 태그(970~974)와 중복 */}
    </div>
  );
}

// (MOCK_ANSWERS/MOCK_SOLUTIONS 제거됨 - ProblemData.answer/solution 사용)

// ★ 인쇄 상하 여백 — 시중 시험지 표준 ~20mm(76px @96dpi). 모듈 레벨이라 ExamPaperView·
//   SolutionView 등 모든 컴포넌트에서 참조 가능(컴포넌트별 PAGE_PAD 와 달리 스코프 안전).
//   좌우 여백은 각 컴포넌트의 PAGE_PAD 유지. CONTENT_H 가 이 값을 반영해 페이지 분할 → 하단 잘림 없음.
const PRINT_PAD_Y = 76; // ~20mm

// ============================================================================
// Exam Paper View (시험지)
// ============================================================================

function ExamPaperView({
  problems,
  examTitle,
  examId,
  templateId,
  examMeta,
  onOpenTemplateModal,
  onTemplateChange,
  onMetaChange,
  refetchProblems,
}: {
  problems: ProblemData[];
  examTitle: string;
  examId: string;
  templateId: string;
  examMeta: ExamMeta;
  onOpenTemplateModal: () => void;
  onTemplateChange?: (id: string, meta: ExamMeta) => void;
  onMetaChange?: (meta: ExamMeta) => void;
  refetchProblems?: () => void;
}) {
  const [columns, setColumns] = useState<1 | 2>(2);
  const [gap, setGap] = useState(20);
  // ★ 좌우 여백 사용자 조절 (기본 38px ≈ 10mm — 기존 57px(15mm) 보다 줄여 컨텐츠 폭 확보)
  //   슬라이더로 20~70px 사이에서 변경 가능. 표·긴 보기가 컬럼 폭을 침범하던 사고 완화.
  const [pagePad, setPagePad] = useState(38);
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
  // ★ pagePad state 사용 (사용자 조절 가능, 기본 38px ≈ 10mm)
  const PAGE_PAD = pagePad;
  const FOOTER_H = 36;
  const HEADER_H = 130;
  const CONTENT_H = A4_H - PRINT_PAD_Y * 2 - FOOTER_H;
  const FIRST_CONTENT_H = CONTENT_H - HEADER_H;

    // 페이지 분할
  const pages = useMemo(() => {
    // ★ 세로(열 우선) + 줄 정렬 — grid-auto-flow:column 으로 좌=앞부분(1·2), 우=뒤부분(3·4)이면서
    //   같은 줄(1·3, 2·4)이 정렬된다. 페이지 분할도 그 짝((r, r+R), R=ceil(n/2))으로 측정해야 일치.
    //   페이지 높이 = Σ_r max(좌행, 우행) ≤ maxH → 잘림 차단. (1단은 단순 합)
    const colFlowTotal = (hs: number[]): number => {
      const n = hs.length;
      if (n === 0) return 0;
      if (columns === 1) return hs.reduce((s, h) => s + h, 0);
      const R = Math.ceil(n / 2);
      let t = 0;
      for (let r = 0; r < R; r++) {
        const a = hs[r];
        const b = r + R < n ? hs[r + R] : 0;
        t += Math.max(a, b);
      }
      return t;
    };
    // 풀이공간 추정 (getWritingSpace 동일 — 아래 정의보다 먼저 쓰여 TDZ 회피 위해 인라인)
    const writingSpaceOf = (p: ProblemData): number => {
      const isMC = (p.choices?.length ?? 0) > 0;
      const cLen = (p.content || '').length;
      if (!isMC) return 280;
      if (cLen < 80) return 100;
      if (cLen < 200) return 160;
      return 220;
    };

    // 프리셋 모드: 페이지당 최대 N문제 — 단, content(풀이공간 최소화)만으로도 넘치면 조기 분할.
    //   ★ 2026-06-11: 과거엔 무조건 N개 chunk 라 키 큰 문제 4개가 한 페이지에 들어가 잘림.
    //   이제 측정 높이 기준으로 N 도달 OR 넘침 중 먼저인 지점에서 끊음. 추정 오차는 "조금 일찍
    //   끊김"(여백↑) 쪽으로만 빗나가 잘림 0. 미측정 시엔 기존 블라인드 chunk 폴백.
    if (perPagePreset) {
      if (!measured || problemHeights.length === 0) {
        const result: ProblemData[][] = [];
        for (let i = 0; i < problems.length; i += perPagePreset) {
          result.push(problems.slice(i, i + perPagePreset));
        }
        return result.length > 0 ? result : [[]];
      }
      const MIN_ANSWER = 24; // presetAnswerSpaces 최소 풀이공간과 동일
      const result: ProblemData[][] = [];
      let pageItems: ProblemData[] = [];
      let pageHs: number[] = [];
      for (let i = 0; i < problems.length; i++) {
        // content-only(풀이공간 제외) + 최소 풀이공간 — presetAnswerSpaces 모델과 일치.
        const ch = Math.max(0, (problemHeights[i] ?? 0) - writingSpaceOf(problems[i])) + MIN_ANSWER;
        const maxH = result.length === 0 ? FIRST_CONTENT_H : CONTENT_H;
        const atCap = pageItems.length >= perPagePreset;
        const overflow = pageItems.length > 0 && colFlowTotal([...pageHs, ch]) > maxH;
        if (pageItems.length > 0 && (atCap || overflow)) {
          result.push(pageItems);
          pageItems = [];
          pageHs = [];
        }
        pageItems.push(problems[i]);
        pageHs.push(ch);
      }
      if (pageItems.length > 0) result.push(pageItems);
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

    const result: ProblemData[][] = [];
    let pageItems: ProblemData[] = [];
    let pageHs: number[] = [];
    for (let i = 0; i < problems.length; i++) {
      const h = problemHeights[i] + gap;
      const maxH = result.length === 0 ? FIRST_CONTENT_H : CONTENT_H;
      if (pageItems.length > 0 && colFlowTotal([...pageHs, h]) > maxH) {
        result.push(pageItems);
        pageItems = [];
        pageHs = [];
      }
      pageItems.push(problems[i]);
      pageHs.push(h);
    }
    if (pageItems.length > 0) result.push(pageItems);
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

      const availableSpace = colMult * maxH - totalH;
      const numProblems = pageProblems.length;
      // ★ 2026-06-04: 자동분배 간격 상한 48px — 적게 든 페이지에서 빈 공간을
      //   문제 사이로 과하게 벌리지 않게(그리드 행 정렬 후 "공간 너무 크다" 대응).
      //   남는 공간은 페이지 하단에 두고, 문제는 위쪽에 촘촘히.
      const autoGap = numProblems > 0 ? Math.min(48, Math.max(8, Math.floor(availableSpace / numProblems))) : 20;
      return autoGap;
    });
  }, [perPagePreset, measured, problemHeights, pages, columns, FIRST_CONTENT_H, CONTENT_H]);

  // ★ 카드별 풀이 공간 결정 — 어제 create-exam 양식 동일
  //   짧은 객관식 100 / 보통 160 / 김 220 / 서답형 280 (px)
  const getWritingSpace = useCallback((problem: ProblemData): number => {
    const isMC = (problem.choices?.length ?? 0) > 0;
    const cLen = (problem.content || '').length;
    if (!isMC) return 280;
    if (cLen < 80) return 100;
    if (cLen < 200) return 160;
    return 220;
  }, []);

  // ★ 2026-06-04: 프리셋(4문제 등) 모드 — 풀이공간을 페이지에 맞게 자동 조절.
  //   4문제를 강제로 한 페이지에 넣을 때 고정 풀이공간(280)이 넘쳐 잘리던 문제 해결.
  //   행별 content(풀이공간 제외) 높이 합을 빼고, 남는 공간을 행마다 풀이공간으로 분배.
  //   → 빡빡하면 최소 24까지 줄여 잘림 차단, 여유 있으면 채움 = "자동 간격조절".
  const presetAnswerSpaces = useMemo(() => {
    if (!perPagePreset || !measured || problemHeights.length === 0) return null;
    const numCols = columns === 2 ? 2 : 1;
    let g = 0;
    return pages.map((pageProblems, pageIdx) => {
      const maxH = pageIdx === 0 ? FIRST_CONTENT_H : CONTENT_H;
      const contentOnly = pageProblems.map((p, i) =>
        Math.max(0, (problemHeights[g + i] ?? 0) - getWritingSpace(p))
      );
      g += pageProblems.length;
      let rowSum = 0, rows = 0;
      for (let i = 0; i < contentOnly.length; i += numCols) {
        let m = 0;
        for (let j = i; j < Math.min(i + numCols, contentOnly.length); j++) m = Math.max(m, contentOnly[j]);
        rowSum += m; rows++;
      }
      return rows > 0 ? Math.max(24, Math.floor((maxH - rowSum) / rows)) : 120;
    });
  }, [perPagePreset, measured, problemHeights, pages, columns, FIRST_CONTENT_H, CONTENT_H, getWritingSpace]);

  // 카드 아래 풀이공간 — 프리셋이면 자동(페이지 채움·잘림방지), 아니면 고정.
  const getAnswerSpace = (problem: ProblemData, pageIdx: number) => {
    if (presetAnswerSpaces && presetAnswerSpaces[pageIdx] !== undefined) {
      return presetAnswerSpaces[pageIdx];
    }
    return getWritingSpace(problem);
  };

  // 현재 유효 간격 (프리셋 모드면 자동, 아니면 슬라이더)
  const getEffectiveGap = (pageIdx: number) => {
    if (perPagePreset && pageAutoGaps && pageAutoGaps[pageIdx] !== undefined) {
      return pageAutoGaps[pageIdx];
    }
    return gap;
  };

  // 출력 — DOM 복제 방식 (원본 exam-page 노드를 #exam-print-root로 복제)
  // 폰트(KaTeX) 로드 완료 기다린 뒤 print → 수식 누락 방지
  const handlePrint = useCallback(() => {
    setShowPrintMenu(false);

    const printRoot = document.createElement('div');
    printRoot.id = 'exam-print-root';

    if (printSections.exam) {
      document.querySelectorAll('.exam-page').forEach((page) => {
        printRoot.appendChild(page.cloneNode(true));
      });
    }
    if (printSections.answer) {
      const answerEl = document.querySelector('.quick-answer-print');
      if (answerEl) {
        const clone = answerEl.cloneNode(true) as HTMLElement;
        clone.classList.add('exam-page');
        clone.style.cssText = 'background:white; padding:15mm; box-sizing:border-box;';
        printRoot.appendChild(clone);
      }
    }
    if (printSections.solution) {
      document.querySelectorAll('.solution-page').forEach((page) => {
        const clone = page.cloneNode(true) as HTMLElement;
        clone.classList.add('exam-page');
        printRoot.appendChild(clone);
      });
    }

    if (printRoot.children.length === 0) return;

    document.body.appendChild(printRoot);

    // ★ 브라우저 PDF 저장 파일명 = document.title. 인쇄 동안만 "시험지명 + 접미사"로 바꾸고 복원.
    //   (전역 'Math×Sci Bank' 가 파일명으로 나오던 문제 방지 / 접미사: 문제지·해설·빠른답)
    const prevTitle = document.title;
    const baseTitle = (examTitle || '시험지')
      .replace(/[\\/:*?"<>|\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim() || '시험지';
    const suffix = printSections.exam ? '문제지' : printSections.solution ? '해설' : printSections.answer ? '빠른답' : '문제지';
    document.title = baseTitle.endsWith(suffix) ? baseTitle : `${baseTitle} ${suffix}`;

    const cleanup = () => {
      document.title = prevTitle;
      try { document.body.removeChild(printRoot); } catch { /* already removed */ }
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 60000); // 백업

    const runPrint = () => { try { window.print(); } catch { cleanup(); } };
    // KaTeX 폰트 로드 완료 대기 (최초 오픈 시 수식 공간 깨짐 방지)
    if ((document as any).fonts?.ready) {
      (document as any).fonts.ready.then(runPrint).catch(runPrint);
    } else {
      runPrint();
    }
  }, [printSections, examTitle]);

  // ★ 문제 렌더링 헬퍼 (시험지 출력용) — 공통 컴포넌트 사용
  //   numberOnTop: 번호를 본문 위로 → 문제를 칼럼 전체 폭으로 넓게.
  //   textSize 13.5px: 기본 14px 보다 아주 조금 작게(사용자 요청). 측정·렌더 같은 헬퍼라 분할 일치.
  const renderProblem = (problem: ProblemData) => (
    <ExamProblemRenderer problem={problem} gap={gap} numberOnTop textSize="13.5px" />
  );

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
          {/* ★ 좌우 여백 슬라이더 — 표·긴 보기가 컬럼 폭 침범할 때 줄여서 컨텐츠 폭 확보 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-content-tertiary">여백</span>
            <input
              type="range"
              min={20}
              max={70}
              value={pagePad}
              onChange={(e) => setPagePad(Number(e.target.value))}
              className="w-24 h-1 accent-cyan-500 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              title="페이지 좌우 여백 (px)"
            />
            <span className="text-xs text-content-tertiary w-8 text-right tabular-nums">{pagePad}</span>
          </div>
          {/* 프리셋 모드에서는 자동 간격 표시 */}
          {perPagePreset && pageAutoGaps && (
            <span className="text-xs text-emerald-400/70">자동 배치</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              const input = prompt('총점을 입력하세요 (기본 100)', '100');
              if (!input) return;
              const total = parseInt(input, 10);
              if (!Number.isFinite(total) || total < problems.length || total > 1000) {
                alert(`유효하지 않은 총점. 문제 수(${problems.length}) 이상, 1000 이하`);
                return;
              }
              try {
                const res = await fetch(`/api/exams/${examId}/distribute-points`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ total }),
                });
                if (!res.ok) {
                  const t = await res.text().catch(() => '');
                  alert(`배점 분배 실패: ${res.status} ${t.substring(0, 200)}`);
                  return;
                }
                const data = await res.json();
                alert(`배점 분배 완료: ${data.count}문제, 총 ${total}점`);
                refetchProblems?.();
              } catch (e) {
                alert(`오류: ${String(e)}`);
              }
            }}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
          >
            <BarChart3 className="h-4 w-4" />
            배점 자동 분배
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!confirm('배점을 모두 지우시겠습니까?')) return;
              try {
                const res = await fetch(`/api/exams/${examId}/distribute-points`, { method: 'DELETE' });
                if (!res.ok) {
                  const t = await res.text().catch(() => '');
                  alert(`배점 초기화 실패: ${res.status} ${t.substring(0, 200)}`);
                  return;
                }
                const data = await res.json();
                alert(`배점 초기화 완료: ${data.cleared}문제`);
                refetchProblems?.();
              } catch (e) {
                alert(`오류: ${String(e)}`);
              }
            }}
            className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-sm font-medium text-rose-400 hover:bg-rose-500/20 transition-colors"
            title="모든 문제의 배점을 지웁니다"
          >
            <Trash2 className="h-4 w-4" />
            배점 초기화
          </button>
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

                {/* ★ Phase 시험지 출제 3차: 별도 PDF 페이지 — KaTeX 서버 렌더 + 학생/강사 variant */}
                <div className="border-t border-zinc-700 px-2 pt-2 pb-2">
                  <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    별도 PDF 페이지 (새 창)
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      window.open(`/api/exams/${examId}/print?variant=student`, '_blank');
                      setShowPrintMenu(false);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-300 transition-colors"
                  >
                    학생 배포용 (이름란)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      window.open(`/api/exams/${examId}/print?variant=teacher`, '_blank');
                      setShowPrintMenu(false);
                    }}
                    className="mt-1 w-full flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-300 transition-colors"
                  >
                    강사용 (분류·난이도 라벨)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      window.open(`/api/exams/${examId}/print?variant=teacher&withAnswer=true`, '_blank');
                      setShowPrintMenu(false);
                    }}
                    className="mt-1 w-full flex items-center justify-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20 px-3 py-1.5 text-xs font-bold text-violet-300 transition-colors"
                  >
                    강사용 + 정답·해설
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 숨겨진 측정 영역
          ★ className="exam-page" 필수 — .exam-page 자손 스코프 KaTeX 보정
          (.katex font-size 1.05em / .mtable padding 0.18em / #259 :has(.mtable) padding-top 3em)
          이 측정 subtree 에도 동일 적용되어야 실제 렌더와 높이가 일치 → 페이지 분할 정확.
          누락 시 cases/행렬 문제가 ~3em 낮게 측정 → 과다 적재 → 인쇄 넘침·잘림. */}
      <div
        ref={measureRef}
        aria-hidden
        className="exam-page"
        style={{
          position: 'absolute',
          visibility: 'hidden',
          top: -99999,
          left: -99999,
          width: `${measureWidth}px`,
          fontFamily: "'Nanum Myeongjo', 'Batang', 'Pretendard', 'Noto Sans KR', serif",
          fontSize: '14px',
          lineHeight: '1.5',
        }}
      >
        {problems.map((problem, idx) => (
          <div key={problem.id} data-problem-idx={idx} style={{ marginBottom: '8px' }}>
            {renderProblem(problem)}
            {/* ★ 카드별 풀이 공간 — 측정에 포함되어야 페이지 분할 정확 */}
            <div style={{ height: `${getWritingSpace(problem)}px` }} aria-hidden />
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
              padding: `${PRINT_PAD_Y}px ${PAGE_PAD}px`,
              marginBottom: pageIdx < pages.length - 1 ? '24px' : 0,
              boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
              borderRadius: '4px',
              position: 'relative',
              boxSizing: 'border-box',
              // ★ 시험지 명조 폰트 — 한국 시험지 표준 양식
              fontFamily: "'Nanum Myeongjo', 'Batang', 'Pretendard', 'Noto Sans KR', serif",
            }}
          >
            {/* 헤더 — 첫 페이지만. 가운데 구분선(page-anchored)이 헤더 위로 지나가지 않도록
                흰 배경 + z-index 로 선을 덮음. */}
            {pageIdx === 0 && (
              <div style={{ marginBottom: '16px', position: 'relative', zIndex: 2, background: '#fff' }}>
                <EditableExamHeader
                  templateId={templateId}
                  meta={examMeta}
                  examTitle={examTitle}
                  editable={true}
                  onTemplateChange={onTemplateChange}
                  onMetaChange={onMetaChange}
                />
              </div>
            )}

            {/* 문제 영역 — 2단은 CSS Grid + auto-flow:column (열 우선 세로 읽기 + 줄 정렬):
                좌=앞부분(1·2·3), 우=뒤부분(4·5·6) 이면서 같은 줄(1·4, 2·5...)이 같은 높이에 정렬.
                gridTemplateRows = ceil(n/2) 행. (측정 colFlowTotal 과 동일 짝이라 잘림 없음) */}
            {columns === 2 ? (
              <div
                style={{
                  display: 'grid',
                  // ★ minmax(0,1fr) — 정확히 반반 고정. '1fr'(=minmax(auto,1fr))은 넓은 내용
                  //   (18번 cases 등)이 든 칸을 늘려 좌우 폭이 틀어지고 가운데 선이 칸 중앙을 벗어났음.
                  //   measureWidth=(A4_W-PAGE_PAD*2-COLUMN_GAP)/2 와도 일치 → 측정·분할 정확.
                  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                  gridTemplateRows: `repeat(${Math.max(1, Math.ceil(pageProblems.length / 2))}, auto)`,
                  gridAutoFlow: 'column',
                  columnGap: `${COLUMN_GAP}px`,
                  alignItems: 'start',
                }}
              >
                {pageProblems.map((problem) => (
                  <div
                    key={problem.id}
                    className="break-inside-avoid"
                    style={{
                      marginBottom: `${presetAnswerSpaces ? 0 : getEffectiveGap(pageIdx)}px`,
                      breakInside: 'avoid',
                      pageBreakInside: 'avoid',
                    }}
                  >
                    {renderProblem(problem)}
                    <div style={{ height: `${getAnswerSpace(problem, pageIdx)}px` }} aria-hidden />
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {pageProblems.map((problem) => (
                  <div
                    key={problem.id}
                    className="break-inside-avoid"
                    style={{ marginBottom: `${presetAnswerSpaces ? 0 : getEffectiveGap(pageIdx)}px` }}
                  >
                    {renderProblem(problem)}
                    <div style={{ height: `${getAnswerSpace(problem, pageIdx)}px` }} aria-hidden />
                  </div>
                ))}
              </div>
            )}

            {/* ★ 가운데 세로 구분선 — 2단일 때 페이지 하단까지.
                ★★ 그리드/내용이 아니라 페이지(.exam-page, 고정 높이) 자체에 앵커한 독립 absolute 선.
                   top/bottom = PRINT_PAD_Y(내용영역 상·하단)라 내용 길이와 무관하게 항상 끝까지 내려감.
                   width:0 out-of-flow → 측정·페이지분할·KaTeX 레이아웃에 일절 영향 없음(수식 회귀 차단).
                   border 라 브라우저 '배경 그래픽' 설정과 무관하게 인쇄됨. 헤더(z-index:2 흰배경)가 윗부분을 덮음. */}
            {columns === 2 && (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: `${PRINT_PAD_Y}px`,
                  bottom: `${PRINT_PAD_Y}px`,
                  width: 0,
                  borderLeft: '1px solid #d4d4d4',
                  zIndex: 1,
                }}
              />
            )}

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
        /* ★ KaTeX cases/array 행간 — 거듭제곱근·분수가 위 행과 닿는 사고 차단 */
        .exam-page .katex-display .mtable .col-align-l > .vlist-t > .vlist-r > .vlist > span,
        .exam-page .katex-display .mtable .col-align-c > .vlist-t > .vlist-r > .vlist > span,
        .exam-page .katex-display .mtable .col-align-r > .vlist-t > .vlist-r > .vlist > span {
          padding: 0.18em 0;
        }
        /* ★ KaTeX display 위/아래 — 분수·cases 위 텍스트 충돌 완화.
           ★★ overflow-y: hidden 제거 (2026-05-31): 이게 cases 중괄호·분수 상하 잘림의 원인이었음
           (하니스 측정: box 51 < content 56 → 5px 잘림). overflow:visible 로 박스가 내용에 맞게
           커지게 함. 행간은 위 padding 0.18em 으로 확보. */
        .exam-page .katex-display {
          max-width: 100%;
          overflow: visible;
          margin: 0.5em 0;
        }
        /* ★ #259 의 cases padding-top:3em 을 cases 에서 제거 (2026-06-02, 브라우저 실측).
           cases(col-align-l)는 dfracInCases + neutralizer 로 제 높이로 그려져 안 솟음
           (실측: 분수 포함 cases 11개 전부 솟음 0) → 3em(+42px/개) 불필요·헛 패딩이라 제거.
           단 행렬(col-align-c)은 1.4em 확대가 남아 솟을 수 있어 3em 보존(행렬 불변). */
        .exam-page .katex-display:has(.col-align-c) {
          padding-top: 3em;
          padding-bottom: 0.5em;
        }
        .exam-page .katex-display > .katex {
          max-width: 100%;
        }
        .exam-page table {
          max-width: 100%;
        }
        .exam-page img {
          max-width: 100%;
          height: auto;
          /* ★ 2026-06-04: 과도하게 큰 문제 그림(24번 등) 높이 상한 — 행이 너무 커져
             앞 페이지에 빈 공간이 생기는 것 방지. 비율 유지하며 축소. */
          max-height: 280px;
          object-fit: contain;
        }
        /* ★ 2026-06-04: 그림이 <img> 가 아니라 FigureRenderer 의 SVG 컨테이너로
           그려지는 경우도 동일 높이 상한 — viewBox 가 있어 비율 유지하며 축소. */
        .exam-page .figure-svg-container > svg,
        .exam-page .figure-graph-container > svg {
          max-height: 280px !important;
        }
        .exam-page .figure-svg-container,
        .exam-page .figure-graph-container {
          max-height: 280px;
        }

        /* 평소에는 숨김 (handlePrint에서 동적 생성) */
        #exam-print-root { display: none; }
        #exam-print-root .katex {
          font-size: 1.05em !important;
        }

        #exam-print-root { display: none; }
        @media print {
          /* ★ cloneNode로 생성된 #exam-print-root만 표시, 기존 앱 전체 숨김 */
          body > *:not(#exam-print-root) { display: none !important; }
          #exam-print-root { display: block !important; }
          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }
          #exam-print-root .exam-page {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            margin: 0 !important;
            /* ★ 화면·측정과 동일: 좌우 ${PAGE_PAD}px, 상하 ${PRINT_PAD_Y}px(~20mm 시중 표준).
               CONTENT_H 가 상하 ${PRINT_PAD_Y}px 반영해 분할 → 인쇄 297mm 초과 잘림 없음. */
            padding: ${PRINT_PAD_Y}px ${PAGE_PAD}px !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            page-break-after: always;
            overflow: hidden !important;
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #exam-print-root .exam-page:last-child { page-break-after: auto; }
          #exam-print-root .break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          #exam-print-root .katex-display {
            max-width: 100%;
            overflow: visible;   /* ★ hidden 제거 (2026-05-31) — 인쇄 시 cases/분수 상하 잘림 원인 */
            margin: 0.5em 0;
          }
          /* ★ #259 cases 3em 제거 (인쇄도 화면과 동일). 행렬(col-align-c)만 3em 보존. */
          #exam-print-root .katex-display:has(.col-align-c) {
            padding-top: 3em;
            padding-bottom: 0.5em;
          }
          #exam-print-root .katex-display > .katex { max-width: 100%; }
          #exam-print-root table { max-width: 100%; table-layout: auto; }
          #exam-print-root img { max-width: 100%; height: auto; max-height: 280px; object-fit: contain; }
          /* 해설지 자연 흐름 */
          #exam-print-root .exam-page.solution-page {
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            page-break-after: auto;
            page-break-inside: auto;
            padding: 15mm 15mm 20mm 15mm !important;
          }
          #exam-print-root .exam-page.solution-page .break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 8mm;
            padding-top: 2mm;
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

/**
 * 복수정답("모두 고르기"형) 표시 — "③④"/"③, ④" → "③④".
 *   isMC 일 때만 "3,4" 같은 숫자+구분자도 원형숫자로 변환(주관식 값 나열 오인 방지).
 *   단일정답·주관식이면 null → 호출부의 기존 단일 처리로 폴백(동작 불변).
 */
function multiObjectiveDisplay(str: string, isMC: boolean): string | null {
  let nums: number[] = [];
  const circled = str.match(/[①②③④⑤]/g);
  if (circled && circled.length) {
    nums = circled.map((c) => '①②③④⑤'.indexOf(c) + 1);
  } else if (isMC && /^[1-5]\s*번?(?:[\s,，、]+[1-5]\s*번?)+$/.test(str.trim())) {
    nums = (str.match(/[1-5]/g) || []).map(Number);
  }
  const uniq = Array.from(new Set(nums)).filter((n) => n >= 1 && n <= 5).sort((a, b) => a - b);
  return uniq.length >= 2 ? uniq.map((n) => '①②③④⑤'[n - 1]).join('') : null;
}

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

              const formatAnswer = (p?: ProblemData): React.ReactNode => {
                if (!p || p.answer === undefined || p.answer === '-') return '-';
                const ans = p.answer;
                const isMC = (p.choices?.length ?? 0) >= 2;

                // 숫자 1~5 → 원형숫자 (객관식)
                if (typeof ans === 'number' && ans >= 1 && ans <= 5 && isMC) return circledNumbers[ans];
                const str = String(ans).trim();
                // ★ 객관식일 때만 원형숫자/번호 변환 시도
                if (isMC) {
                  // 복수정답("모두 고르기"형) — "③④"/"3,4" → "③④" 모두 표시
                  const multi = multiObjectiveDisplay(str, true);
                  if (multi) return multi;
                  if (/^[1-5]$/.test(str)) return circledNumbers[parseInt(str)];
                  if (/^[①②③④⑤]$/.test(str)) return str;
                  const circledPrefix = str.match(/^([①②③④⑤])/);
                  if (circledPrefix) return circledPrefix[1];
                  const sameParen = str.match(/^\s*([1-5])\s*\(\s*([1-5])\s*번\s*\)\s*$/);
                  if (sameParen && sameParen[1] === sameParen[2]) return circledNumbers[parseInt(sameParen[1])];
                  const verboseParen = str.match(/^\s*([1-5])\s*\(\s*(?:정답\s*)?(?:번호\s*[:：]?\s*)?([1-5])\s*\)\s*$/);
                  if (verboseParen && verboseParen[1] === verboseParen[2]) return circledNumbers[parseInt(verboseParen[1])];
                  const banOnly = str.match(/^\s*\(?\s*([1-5])\s*\)?\s*번\s*$/);
                  if (banOnly) return circledNumbers[parseInt(banOnly[1])];
                }

                // ★ 단답형·서술형 모두 "값"만 수식으로 렌더 — 학생 채점 가능한 형태
                //   빠른정답은 수식 LaTeX 그대로 노출돼선 안 되고 KaTeX로 정식 렌더돼야 함
                if (!isMC) {
                  let display = str;
                  // ★ 다부분 서답형((1)(2)(3))·여러 줄·연립({cases}) 답은 결론부 추출/$강제래핑이
                  //   답을 망가뜨린다 (예: "...y=125$ (3) 빨래..."에서 "125$ (3)..."만 잘려 + 닫는 $ 고아).
                  //   → 구조형이면 추출/래핑 모두 건너뛰고 원문 그대로 렌더.
                  const isMultiPart = /\(\s*[1-9]\s*\)[\s\S]*\(\s*[2-9]\s*\)/.test(str)
                    || /\n/.test(str)
                    || /\\begin\{(?:cases|aligned|array)\}/.test(str);
                  if (!isMultiPart) {
                    const tailEq = str.match(/=\s*([^=]+?)\s*(?:이다\s*[.]?|입니다\s*[.]?|\.?)\s*$/);
                    const conclusion = str.match(/(?:따라서|그러므로|∴|답은|정답은|최종\s*답은?)\s*([^.]+?)(?:\s*이다\s*[.]?|\s*입니다\s*[.]?|\.?)\s*$/);
                    if (str.length > 40 && tailEq && tailEq[1].trim().length < 40) {
                      display = tailEq[1].trim();
                    } else if (str.length > 40 && conclusion && conclusion[1].trim().length < 40) {
                      display = conclusion[1].trim();
                    }
                    // ★ $ 래핑 없으면 수식 기호 탐지해 자동 래핑 (KaTeX 렌더링 보장)
                    //   예: "b^{-4}" → "$b^{-4}$", "6x^5y^8" → "$6x^5y^8$", "x=5" → "$x=5$"
                    const hasDollar = /\$/.test(display);
                    const looksLikeMath = /[\\^_{}]|\\frac|\\sqrt|\\dfrac|[a-zA-Z]\s*[=+\-*/]|[0-9]+\s*[+\-*/]\s*[0-9]/.test(display);
                    if (!hasDollar && looksLikeMath) {
                      display = `$${display}$`;
                    }
                  }
                  // ★ 서답형은 다줄 답이 좁게 들어가지 않도록 세로 여유 확보 (빠른답 행 간격)
                  return (
                    <div className="flex items-center justify-center min-h-[2.6em] leading-relaxed">
                      <MixedContentRenderer content={display} className="text-blue-700" />
                    </div>
                  );
                }

                // 수식 포함 → LaTeX 렌더
                const hasMath = /\$|\\frac|\\sqrt|\\dfrac|\^|_\{|[a-zA-Z].*[=+\-*/]/.test(str);
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
                    {formatAnswer(leftP)}
                  </td>
                  <td className="border border-gray-400 py-3 text-center text-sm font-semibold text-gray-800">
                    {rightNum <= problems.length ? rightNum : ''}
                  </td>
                  <td className="border border-gray-400 py-3 text-center text-base font-bold text-blue-700">
                    {rightNum <= problems.length ? formatAnswer(rightP) : ''}
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
  examId,
  templateId,
  examMeta,
  onOpenTemplateModal,
  refetchProblems,
}: {
  problems: ProblemData[];
  examTitle: string;
  examId: string;
  templateId: string;
  examMeta: ExamMeta;
  onOpenTemplateModal: () => void;
  refetchProblems: () => void;
}) {
  const [columns, setColumns] = useState<1 | 2>(2);
  const [gap, setGap] = useState(20);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [showBatchSolutionModal, setShowBatchSolutionModal] = useState(false);
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const circledNumbers = ['', '①', '②', '③', '④', '⑤'];

  // ★ 공용 폴링 시작자 — 버튼 클릭/재진입 모두에서 사용
  const startBatchPolling = useCallback(() => {
    if (pollIntervalRef.current) return; // 이미 폴링 중
    let pollErrors = 0;
    let idleCount = 0;
    const poll = async () => {
      // ★ 탭 숨김 상태면 스킵 (리소스 절약)
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const statusRes = await fetch(`/api/exams/${examId}/batch-solutions`);
        if (statusRes.ok) {
          const status = await statusRes.json();
          pollErrors = 0;
          setBatchProgress({ current: status.done, total: status.total });
          if (!status.isRunning) {
            idleCount++;
            if (idleCount >= 2) {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              setIsGeneratingBatch(false);
              refetchProblems();
              // ★ 브라우저 Notification — 페이지 백그라운드일 때도 완료 통지
              try {
                if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                  const total = status.total ?? 0;
                  const done = status.done ?? 0;
                  const failed = status.failed ?? 0;
                  const body = failed > 0
                    ? `성공 ${done}건 / 실패 ${failed}건. 실패 카드는 ✨ 버튼으로 개별 재시도.`
                    : `${total}건 모두 완료.`;
                  new Notification(`해설 생성 완료 — ${examTitle}`, {
                    body,
                    icon: '/favicon.ico',
                    tag: `batch-solutions-${examId}`,
                  });
                }
              } catch (e) { console.warn('[Notification] 실패:', e); }
            }
          } else {
            idleCount = 0;
          }
        } else {
          pollErrors++;
        }
      } catch {
        pollErrors++;
      }
      if (pollErrors >= 5 && pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        setIsGeneratingBatch(false);
        console.warn('[batch-solutions] 폴링 연속 실패 — 중단');
      }
    };
    poll();
    pollIntervalRef.current = setInterval(poll, 2000);
  }, [examId, refetchProblems]);

  // ★ SolutionView 진입 시 서버에 진행 중인 배치가 있는지 조회 → 있으면 상태 복구 + 폴링 재개
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch(`/api/exams/${examId}/batch-solutions`);
        if (!r.ok) return;
        const s = await r.json();
        if (cancelled) return;
        if (s.isRunning) {
          setIsGeneratingBatch(true);
          setBatchProgress({ current: s.done || 0, total: s.total || 0 });
          startBatchPolling();
          // 진행 중인 배치 발견 시 전역 Notifier에도 자동 등록
          trackBatchSolution(examId, examTitle);
        }
      } catch {
        // 네트워크 에러 무시
      }
    };
    check();
    return () => {
      cancelled = true;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [examId, startBatchPolling]);

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
  const CONTENT_H = A4_H - PRINT_PAD_Y * 2 - FOOTER_H;
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

    // ★ CSS columns(흐름식) 가정 — 시험지와 동일.
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
    const str = String(ans).trim();
    // ★ 복수정답("모두 고르기"형) — "③④" 등 원형숫자 2개 이상이면 모두 표시
    const multi = multiObjectiveDisplay(str, false);
    if (multi) return multi;
    // ★ 이미 원형숫자
    if (/^[①②③④⑤]$/.test(str)) return str;
    // ★ 순수 숫자 1~5
    if (/^[1-5]$/.test(str)) return circledNumbers[parseInt(str)];
    // ★ 원형숫자 prefix
    const circledPrefix = str.match(/^([①②③④⑤])/);
    if (circledPrefix) return circledPrefix[1];
    // ★ verbose 객관식 패턴 — "2 (2번)" / "4 (정답 번호: 4)" / "3번"
    const sameParen = str.match(/^\s*([1-5])\s*\(\s*([1-5])\s*번\s*\)\s*$/);
    if (sameParen && sameParen[1] === sameParen[2]) return circledNumbers[parseInt(sameParen[1])];
    const verboseParen = str.match(/^\s*([1-5])\s*\(\s*(?:정답\s*)?(?:번호\s*[:：]?\s*)?([1-5])\s*\)\s*$/);
    if (verboseParen && verboseParen[1] === verboseParen[2]) return circledNumbers[parseInt(verboseParen[1])];
    const banOnly = str.match(/^\s*\(?\s*([1-5])\s*\)?\s*번\s*$/);
    if (banOnly) return circledNumbers[parseInt(banOnly[1])];
    // 수식 포함
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
      <div className="pl-5 text-[13px] text-gray-700 whitespace-pre-line" style={{ lineHeight: '1.85' }}>
        <MixedContentRenderer content={stripChoiceAnalysis(problem.solution || '') || '해설이 등록되지 않았습니다.'} className="text-gray-700" />
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
        {/* ★ 배점 자동 분배 — 난이도 기반 100점 분배 */}
        <button
          type="button"
          onClick={async () => {
            const input = prompt('총점을 입력하세요 (기본 100)', '100');
            if (!input) return;
            const total = parseInt(input, 10);
            if (!Number.isFinite(total) || total < problems.length || total > 1000) {
              alert(`유효하지 않은 총점. 문제 수(${problems.length}) 이상, 1000 이하`);
              return;
            }
            try {
              const res = await fetch(`/api/exams/${examId}/distribute-points`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ total }),
              });
              if (!res.ok) {
                const t = await res.text().catch(() => '');
                alert(`배점 분배 실패: ${res.status} ${t.substring(0, 200)}`);
                return;
              }
              const data = await res.json();
              alert(`배점 분배 완료: ${data.count}문제, 총 ${total}점`);
              refetchProblems();
            } catch (e) {
              alert(`오류: ${String(e)}`);
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          배점 자동 분배
        </button>
        {/* ★ 배점 초기화 — points → null 일괄 */}
        <button
          type="button"
          onClick={async () => {
            if (!confirm('배점을 모두 지우시겠습니까?')) return;
            try {
              const res = await fetch(`/api/exams/${examId}/distribute-points`, { method: 'DELETE' });
              if (!res.ok) {
                const t = await res.text().catch(() => '');
                alert(`배점 초기화 실패: ${res.status} ${t.substring(0, 200)}`);
                return;
              }
              const data = await res.json();
              alert(`배점 초기화 완료: ${data.cleared}문제`);
              refetchProblems();
            } catch (e) {
              alert(`오류: ${String(e)}`);
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
          title="모든 문제의 배점을 지웁니다"
        >
          <Trash2 className="h-3.5 w-3.5" />
          배점 초기화
        </button>
        {/* ★ 해설 생성 버튼 — 클릭 시 선택 모달 오픈 */}
        <button
          type="button"
          disabled={isGeneratingBatch}
          onClick={() => {
            // 모달 열 때 기본값: 미완성 문제 선택
            const unsolvedIds = problems
              .filter(p => !p.solution || p.solution.trim().length < 30)
              .map(p => p.id);
            setSelectedForBatch(new Set(unsolvedIds));
            setShowBatchSolutionModal(true);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            isGeneratingBatch
              ? 'bg-cyan-500/20 text-cyan-400 animate-pulse'
              : 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20'
          }`}
        >
          <Wand2 className="h-3.5 w-3.5" />
          {isGeneratingBatch
            ? `서버에서 생성 중 ${batchProgress.current}/${batchProgress.total}...`
            : `해설 생성 (${problems.filter(p => !p.solution || p.solution.trim().length < 30).length}/${problems.length}문제 미완)`
          }
        </button>
      </div>

      {/* ★ 해설 생성 선택 모달 */}
      {showBatchSolutionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-subtle bg-surface-card shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-subtle">
              <h2 className="text-sm font-bold text-content-primary">해설 생성 — 문제 선택</h2>
              <button
                onClick={() => setShowBatchSolutionModal(false)}
                className="p-1 text-content-muted hover:text-content-secondary"
              >
                <X size={18} />
              </button>
            </div>

            {/* 빠른 선택 버튼 */}
            <div className="flex items-center gap-2 px-5 py-2.5 border-b border-subtle text-xs">
              <button
                type="button"
                onClick={() => {
                  const unsolvedIds = problems
                    .filter(p => !p.solution || p.solution.trim().length < 30)
                    .map(p => p.id);
                  setSelectedForBatch(new Set(unsolvedIds));
                }}
                className="px-2.5 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
              >
                미완성만 ({problems.filter(p => !p.solution || p.solution.trim().length < 30).length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedForBatch(new Set(problems.map(p => p.id)))}
                className="px-2.5 py-1 rounded bg-surface-raised border border-subtle text-content-secondary hover:bg-surface-card"
              >
                전체 ({problems.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedForBatch(new Set())}
                className="px-2.5 py-1 rounded bg-surface-raised border border-subtle text-content-muted hover:bg-surface-card"
              >
                선택 해제
              </button>
              <span className="ml-auto text-content-muted">
                선택 <span className="text-content-primary font-semibold">{selectedForBatch.size}</span>개
              </span>
            </div>

            {/* 문제 리스트 (체크박스) */}
            <div className="flex-1 overflow-auto px-3 py-2">
              <div className="grid grid-cols-5 gap-1.5">
                {problems.map(p => {
                  const hasSol = p.solution && p.solution.trim().length >= 30;
                  const checked = selectedForBatch.has(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer text-xs transition-colors ${
                        checked
                          ? 'bg-cyan-500/10 border-cyan-500/50'
                          : 'bg-surface-raised/50 border-subtle hover:bg-surface-raised'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedForBatch(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(p.id);
                            else next.delete(p.id);
                            return next;
                          });
                        }}
                        className="shrink-0"
                      />
                      <span className="font-semibold text-content-primary">#{p.number}</span>
                      <span className={hasSol ? 'text-emerald-400' : 'text-amber-400'}>
                        {hasSol ? '있음' : '없음'}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 실행 버튼 */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-subtle">
              <button
                type="button"
                onClick={() => setShowBatchSolutionModal(false)}
                className="px-4 py-2 rounded-lg text-xs text-content-secondary hover:text-content-primary"
              >
                취소
              </button>
              <button
                type="button"
                disabled={selectedForBatch.size === 0}
                onClick={async () => {
                  const targetIds = problems.filter(p => selectedForBatch.has(p.id)).map(p => p.id);
                  setShowBatchSolutionModal(false);
                  if (targetIds.length === 0) return;

                  // ★ server-side batch-solutions trigger + 클라이언트 폴링 구조.
                  //   페이지 떠나도 서버에서 계속 진행. chain 신뢰성은 서버 측에서 강화 (chain
                  //   발사를 단건 처리 *전* 으로 옮김 + sweep 모드로 누락 보완).
                  //   완료 시 브라우저 Notification 으로 사용자 알림.
                  try {
                    // 브라우저 알림 권한 (사용자가 default 면 한 번만 요청)
                    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                      try { await Notification.requestPermission(); } catch { /* 거부도 OK */ }
                    }

                    setIsGeneratingBatch(true);
                    setBatchProgress({ current: 0, total: targetIds.length });
                    const res = await fetch(`/api/exams/${examId}/batch-solutions`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ problemIds: targetIds }),
                    });
                    if (res.ok) {
                      startBatchPolling();
                      trackBatchSolution(examId, examTitle);
                    } else {
                      const errText = await res.text().catch(() => '');
                      console.error('[batch-solutions] 시작 실패:', res.status, errText);
                      setIsGeneratingBatch(false);
                      alert(`해설 생성 시작 실패 (${res.status}): ${errText.substring(0, 200)}`);
                    }
                  } catch (err) {
                    console.error('[batch-solutions] 요청 에러:', err);
                    setIsGeneratingBatch(false);
                    alert(`해설 생성 요청 실패: ${String(err)}`);
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Wand2 className="h-3.5 w-3.5" />
                선택한 {selectedForBatch.size}개 해설 생성
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 숨겨진 측정 영역
          ★ className="solution-page" 필수 — .solution-page 자손 스코프 KaTeX 보정
          (#259 :has(.mtable) padding-top 3em 등)이 측정 subtree 에도 적용되어야
          실제 해설지 렌더와 높이 일치 → 페이지 분할 정확 (시험지 측정 영역과 동일 원리). */}
      <div
        ref={measureRef}
        aria-hidden
        className="solution-page"
        style={{
          position: 'absolute',
          visibility: 'hidden',
          top: -99999,
          left: -99999,
          width: `${measureWidth}px`,
          fontFamily: "'Nanum Myeongjo', 'Batang', 'Pretendard', 'Noto Sans KR', serif",
          fontSize: '13px',
          lineHeight: '1.85',
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
              padding: `${PRINT_PAD_Y}px ${PAGE_PAD}px`,
              marginBottom: pageIdx < pages.length - 1 ? '24px' : 0,
              boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
              borderRadius: '4px',
              position: 'relative',
              boxSizing: 'border-box',
              fontFamily: "'Nanum Myeongjo', 'Batang', 'Pretendard', 'Noto Sans KR', serif",
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

            {/* 해설 영역 — 2단은 CSS columns column-balance (questi 양식) */}
            {columns === 2 ? (
              <div
                style={{
                  columnCount: 2,
                  columnGap: `${COLUMN_GAP}px`,
                  columnFill: 'balance',
                  columnRule: '1px solid #e5e5e5',
                }}
              >
                {pageProblems.map((problem) => (
                  <div
                    key={problem.id}
                    className="break-inside-avoid"
                    style={{
                      marginBottom: `${gap}px`,
                      breakInside: 'avoid',
                      pageBreakInside: 'avoid',
                    }}
                  >
                    {renderSolution(problem)}
                  </div>
                ))}
              </div>
            ) : (
              <div>
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
            )}

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
        /* ★ KaTeX display 위/아래 — 분수·cases 위 텍스트 충돌 완화 (시험지와 동일) */
        .solution-page .katex-display {
          max-width: 100%;
          overflow: visible;   /* ★ hidden 제거 (2026-05-31) — cases/분수 상하 잘림 원인 */
          margin: 0.5em 0;
        }
        /* ★ cases/행렬 솟음 → 박스 안에 담기 (#259, 시험지와 동일) */
        .solution-page .katex-display:has(.mtable) {
          padding-top: 3em;
          padding-bottom: 0.5em;
        }
        /* 인라인 분수 위/아래 줄 침범 차단 — 시험지와 동일 */
        .solution-page .katex {
          vertical-align: middle;
        }
        .solution-page .katex .mfrac {
          vertical-align: middle;
        }
        .solution-page .katex-html {
          padding: 0.1em 0;
        }
        .solution-page .katex-display > .katex {
          max-width: 100%;
        }
      `}</style>
    </div>
  );
}

/** 라이트 테마용 난이도 배지 (해설지에서 사용) */
function DifficultyBadgeLight({ level }: { level: number }) {
  function getLightCfg(lv: number): { label: string; classes: string } {
    if (lv <= 2) return { label: `쉬움${lv}`, classes: 'bg-emerald-50 text-emerald-600 border-emerald-200' };
    if (lv <= 4) return { label: `보통${lv}`, classes: 'bg-blue-50 text-blue-600 border-blue-200' };
    if (lv <= 6) return { label: `어려움${lv}`, classes: 'bg-amber-50 text-amber-600 border-amber-200' };
    return { label: `매우어려움${lv}`, classes: 'bg-red-100 text-red-700 border-red-300' };
  }
  const cfg = getLightCfg(level);
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
  const goBack = useSmartBack('/dashboard/cloud');
  const params = useParams();
  const examId = params.examId as string;
  // ★ 학원명 prefix (2026-05-17)
  const orgName = useOrganizationName('과사람');

  // DB에서 문제 로드
  const { problems: dbProblems, examInfo, isLoading: dbLoading, refetch: refetchProblems } = useExamProblems(examId);

  // DB 데이터 사용 (mock fallback 제거)
  const problems: ProblemData[] = useMemo(() => {
    return dbProblems.map((p) => ({
      id: p.id,
      number: p.number,
      points: p.points,  // ★ 배점 (자동 분배/수동 지정값) — ExamProblemRenderer가 [N점] 배지로 표시
      difficulty: p.difficulty,
      cognitiveDomain: p.cognitiveDomain as ProblemData['cognitiveDomain'],
      content: p.content,
      choices: p.choices,
      choiceImages: p.choiceImages,
      choiceHeaders: p.choiceHeaders,
      choiceLayout: p.choiceLayout,
      answer: p.answer,
      answerJson: p.answerJson,
      solution: p.solution,
      year: p.year,
      typeCode: p.typeCode,
      typeName: p.typeName,
      source: p.source,
      images: p.images,
      hasFigure: p.hasFigure,
      figureSvg: p.figureSvg,
      figureData: p.figureData,
      upscaledCropUrl: p.upscaledCropUrl,
      figureSource: p.figureSource,
    }));
  }, [dbProblems]);

  const examTitle = examInfo?.title || '(제목 없음)';

  // ★ 자동 검증 — 문제 목록 로드 후 이슈 감지
  const validationIssues = useMemo(() => {
    if (problems.length === 0) return [];
    const issues: Array<{ problemNum: number; type: string; message: string }> = [];
    for (const p of problems) {
      // 1. 빈 content — choices가 있으면 내용 있는 것으로 간주
      const totalContentLen = (p.content?.trim().length || 0) + (p.choices?.join('').length || 0);
      if (totalContentLen < 5) {
        issues.push({ problemNum: p.number, type: 'empty', message: '내용이 비어있음 (OCR 실패 가능)' });
      }
      // 2. 분류 누락
      if (!p.typeName && !p.typeCode) {
        issues.push({ problemNum: p.number, type: 'unclassified', message: '분류 미완료' });
      }
      // 3. 서술형 소문제 오인식 감지 — 제거 (오탐이 많아서 비활성화)
      // 4. 도형 있는데 이미지 없음
      if (p.hasFigure && !p.upscaledCropUrl && !p.figureData && !p.figureSvg && (!p.images || !p.images.some(img => img.type === 'figure_crop'))) {
        issues.push({ problemNum: p.number, type: 'missing_figure', message: '도형 표시 필요하지만 이미지 없음' });
      }
    }
    return issues;
  }, [problems]);

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

  // ★ 시험지 로드 시 examMeta 를 DB 값으로 초기화 (subject/grade/examType)
  //   기존엔 빈 DEFAULT_EXAM_META 로 시작해서 사용자 편집 전엔 헤더가 항상 비어있고,
  //   인쇄 시 placeholder/기본값으로 떨어지던 버그.
  //   학원/학교 이름은 시험지 title 에서 자동 추출 (예: "26 동해중 2-1 중간" → "동해중").
  useEffect(() => {
    if (!examInfo) return;
    const title = examInfo.title || '';
    const schoolMatch = title.match(/([가-힣]{1,6}(?:고|중|초|학원))\d*/);
    const schoolName = schoolMatch ? schoolMatch[1] : '';
    setExamMeta((prev) => ({
      ...prev,
      schoolName: prev.schoolName || schoolName,
      subject: prev.subject || examInfo.subject || '',
      grade: prev.grade || examInfo.grade || '',
      examType: prev.examType || examInfo.examType || '',
    }));
  }, [examInfo]);

  // ★ examMeta 변경 → DB 저장 (subject/grade/examType 만, debounced 800ms)
  //   schoolName/teacher/timeLimit 등은 exams 테이블 컬럼이 아니라 페이지 로컬 메타
  //   (시험지별 표시용). DB 컬럼 있는 3개만 PATCH.
  const lastSavedExamMetaRef = useRef<{ subject: string; grade: string; examType: string } | null>(null);
  useEffect(() => {
    if (!examId || !examInfo) return;
    const current = {
      subject: examMeta.subject || '',
      grade: examMeta.grade || '',
      examType: examMeta.examType || '',
    };
    const last = lastSavedExamMetaRef.current;
    // 처음엔 examInfo 와 같은 상태로 ref 초기화 (저장 안 함)
    if (!last) {
      lastSavedExamMetaRef.current = {
        subject: examInfo.subject || '',
        grade: examInfo.grade || '',
        examType: examInfo.examType || '',
      };
      return;
    }
    if (last.subject === current.subject && last.grade === current.grade && last.examType === current.examType) return;
    const timer = setTimeout(async () => {
      try {
        const updates: Record<string, string> = {};
        if (current.subject !== last.subject) updates.subject = current.subject;
        if (current.examType !== last.examType) updates.examType = current.examType;
        if (current.grade !== last.grade) updates.grade = current.grade;
        if (Object.keys(updates).length === 0) return;
        await fetch(`/api/exams/${examId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        lastSavedExamMetaRef.current = current;
      } catch (e) {
        console.warn('[examMeta] PATCH save failed:', e);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [examMeta.subject, examMeta.grade, examMeta.examType, examId, examInfo]);

  // 도형 재생성 상태
  const [generatingFigures, setGeneratingFigures] = useState<Set<string>>(new Set());

  // ★ 도식 교체 모달 상태
  const [diagramBrowserProblem, setDiagramBrowserProblem] = useState<ProblemData | null>(null);
  const [diagramReplaceIndex, setDiagramReplaceIndex] = useState<number>(-1); // -1 = 새로 추가

  const handleReplaceDiagram = useCallback((problem: ProblemData, figureIndex?: number) => {
    setDiagramBrowserProblem(problem);
    setDiagramReplaceIndex(figureIndex ?? -1);
  }, []);

  const handleDiagramSelected = useCallback(async (imageUrl: string, meta?: { svgSource?: string; correctionType?: string }) => {
    if (!diagramBrowserProblem) return;
    try {
      // ★ figure_crop 인덱스별 교체 (다중 이미지 지원)
      const allImages = diagramBrowserProblem.images || [];
      const figureCrops = allImages.filter((img) => img.type === 'figure_crop');
      const nonFigureCrops = allImages.filter((img) => img.type !== 'figure_crop');

      let newFigureCrops: Array<{ url: string; type: string; label: string }>;
      if (diagramReplaceIndex >= 0 && diagramReplaceIndex < figureCrops.length) {
        // 특정 인덱스 교체
        newFigureCrops = figureCrops.map((img, idx) =>
          idx === diagramReplaceIndex
            ? { url: imageUrl, type: 'figure_crop', label: `도식 DB 교체 ${idx + 1}` }
            : img
        );
      } else {
        // 새로 추가 (-1 또는 범위 밖)
        newFigureCrops = [
          ...figureCrops,
          { url: imageUrl, type: 'figure_crop', label: `도식 DB 교체 ${figureCrops.length + 1}` },
        ];
      }

      const newImages = [...nonFigureCrops, ...newFigureCrops];

      // ai_analysis에 hasFigure + upscaledCropUrl 설정
      const existRes = await fetch(`/api/problems/${diagramBrowserProblem.id}`);
      let existingAi: Record<string, unknown> = {};
      if (existRes.ok) {
        const existData = await existRes.json();
        existingAi = existData.ai_analysis || {};
      }

      const updatedAi: Record<string, unknown> = {
        ...existingAi,
        hasFigure: true,
        figureSource: meta?.svgSource ? 'ai_generated' : 'diagram_db',
      };
      // ★ 첫 번째 이미지(index 0) 교체 시
      if (diagramReplaceIndex <= 0) {
        delete updatedAi.figureData;
        if (meta?.svgSource) {
          // ★ SVG 코드: figureSvg에 저장 + upscaledCropUrl 삭제 (SVG가 최우선)
          updatedAi.figureSvg = meta.svgSource;
          delete updatedAi.upscaledCropUrl;
          console.log(`[DiagramReplace] ★ SVG 코드 저장 (${meta.svgSource.length}자), upscaledCropUrl 삭제`);
        } else {
          // 이미지 교체: upscaledCropUrl 설정
          updatedAi.upscaledCropUrl = imageUrl;
          delete updatedAi.figureSvg;
        }
      }

      const patchRes = await fetch(`/api/problems/${diagramBrowserProblem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: newImages,
          ai_analysis: updatedAi,
        }),
      });

      if (patchRes.ok) {
        console.log(`[DiagramReplace] Problem #${diagramBrowserProblem.number} 도식 교체 완료`);
        refetchProblems();

        // ★ 교정 이력 자동 기록 (자동 학습용)
        try {
          const corrRes = await fetch('/api/figure-corrections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              problemId: diagramBrowserProblem.id,
              correctionType: meta?.correctionType || 'diagram_db',
              correctedImageUrl: imageUrl,
              correctedSvgSource: meta?.svgSource || null,
            }),
          });
          if (corrRes.ok) {
            console.log(`[figure-corrections] ✅ 교정 기록 저장 성공 (${meta?.correctionType || 'diagram_db'})`);
          } else {
            const errData = await corrRes.json().catch(() => ({}));
            console.error(`[figure-corrections] ❌ 교정 기록 저장 실패: ${corrRes.status}`, errData);
          }
        } catch (corrErr) {
          console.error('[figure-corrections] ❌ 교정 기록 API 호출 실패:', corrErr);
        }
      } else {
        const err = await patchRes.json().catch(() => ({}));
        alert(`도식 교체 실패: ${err.error || patchRes.status}`);
      }
    } catch (err) {
      console.error('[DiagramReplace] Error:', err);
      alert(`도식 교체 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setDiagramBrowserProblem(null);
    }
  }, [diagramBrowserProblem, diagramReplaceIndex, refetchProblems]);

  // ★ 업스케일 전용 (AI Vision 안 함, 실패 시 silent)
  const handleUpscaleFigure = useCallback(async (problem: ProblemData): Promise<boolean> => {
    if (generatingFigures.has(problem.id)) return false;

    setGeneratingFigures(prev => new Set(prev).add(problem.id));

    try {
      console.log(`[upscale-figure] Starting upscale for problem #${problem.number} (${problem.id})`);

      const res = await fetch(`/api/problems/${problem.id}/generate-figure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upscaleOnly: true }), // ★ 업스케일만, AI 폴백 없음
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.warn(`[upscale-figure] Problem ${problem.number}: ${data.error}`);
        return false; // 자동 업스케일 실패는 alert 안 함
      }

      if (data.noFigure) {
        console.log(`[upscale-figure] Problem ${problem.number}: 업스케일 불가 (${data.reason})`);
        return false;
      }

      console.log(`[upscale-figure] Problem ${problem.number}: 업스케일 성공!`);
      refetchProblems(); // ★ DB에 저장된 upscaledCropUrl을 반영하기 위해 즉시 refetch
      return true;
    } catch (err) {
      console.error('[upscale-figure] Error:', err);
      return false;
    } finally {
      setGeneratingFigures(prev => {
        const next = new Set(prev);
        next.delete(problem.id);
        return next;
      });
    }
  }, [generatingFigures, refetchProblems]);

  // ★ AI Vision 도형 생성 (사용자가 명시적으로 클릭 시)
  const handleGenerateAIFigure = useCallback(async (problem: ProblemData): Promise<boolean> => {
    if (generatingFigures.has(problem.id)) return false;

    setGeneratingFigures(prev => new Set(prev).add(problem.id));

    try {
      console.log(`[ai-figure] Starting AI generation for problem #${problem.number} (${problem.id})`);

      const res = await fetch(`/api/problems/${problem.id}/generate-figure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceAI: true }), // ★ AI Vision 강제
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg = data.error || `서버 오류 (${res.status})`;
        alert(`AI 도형 생성 실패 (#${problem.number}): ${errMsg}`);
        return false;
      }

      if (data.noFigure) {
        if (data.keepExisting) {
          alert(`문제 ${problem.number}: AI 재생성 실패 (기존 도형 유지). 다시 시도해 주세요.`);
        } else {
          alert(`문제 ${problem.number}: AI가 도형을 감지하지 못했습니다.`);
        }
        return false;
      }

      console.log(`[ai-figure] Problem ${problem.number}: AI 생성 성공! type=${data.figureType}`);
      refetchProblems();
      return true;
    } catch (err) {
      console.error('[ai-figure] Error:', err);
      alert(`AI 도형 생성 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
      return false;
    } finally {
      setGeneratingFigures(prev => {
        const next = new Set(prev);
        next.delete(problem.id);
        return next;
      });
    }
  }, [generatingFigures, refetchProblems]);

  // 호환성 유지 (기존 참조)
  const handleGenerateFigure = handleUpscaleFigure;

  // ★ 페이지 로드 시 자동 업스케일: hasFigure=true + 크롭 있음 + 아직 업스케일 안 된 문제
  const [autoUpscaleRan, setAutoUpscaleRan] = useState(false);

  useEffect(() => {
    if (dbLoading || problems.length === 0 || autoUpscaleRan) return;

    const targets = problems.filter(p =>
      p.hasFigure &&
      p.images?.some((img: { type: string }) => img.type === 'crop') &&
      !p.upscaledCropUrl &&
      !p.figureData &&
      !p.figureSvg
    );

    setAutoUpscaleRan(true);

    if (targets.length === 0) return;

    console.log(`[auto-upscale] ${targets.length}개 문제 자동 업스케일 시작...`);

    // 순차 처리 (서버 부하 방지) → 전부 완료 후 1회 refetch
    (async () => {
      let success = 0;
      for (const p of targets) {
        const ok = await handleUpscaleFigure(p);
        if (ok) success++;
      }
      console.log(`[auto-upscale] 완료: ${success}/${targets.length} 성공`);
      if (success > 0) refetchProblems();
    })();
  }, [dbLoading, problems, autoUpscaleRan, handleUpscaleFigure, refetchProblems]);

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

  // ★ 문제 배점 수정 — exam_problems.points (null 보내면 NULL 저장)
  const handleUpdatePoints = useCallback(async (problemId: string, points: number | null) => {
    try {
      const res = await fetch(`/api/exams/${examId}/problems`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemId, points }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('[updatePoints] Failed:', data.error);
        alert(`배점 수정 실패: ${data.error || res.status}`);
        return;
      }
      refetchProblems();
    } catch (err) {
      console.error('[updatePoints] Error:', err);
    }
  }, [examId, refetchProblems]);

  // ★ GraphModal에서 수정 저장 후 자동 refetch (FigureRenderer가 이벤트 발행)
  // ★ AI 도형 생성 중이면 refetch를 지연 (경쟁 상태 방지)
  useEffect(() => {
    const handler = () => {
      if (generatingFigures.size > 0) {
        console.log('[problems-updated] AI 도형 생성 중 → refetch 스킵');
        return;
      }
      console.log('[graph-edited] 그래프 수정 감지 → refetch');
      refetchProblems();
    };
    window.addEventListener('graph-edited', handler);
    window.addEventListener('problems-updated', handler);
    return () => {
      window.removeEventListener('graph-edited', handler);
      window.removeEventListener('problems-updated', handler);
    };
  }, [refetchProblems, generatingFigures]);

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

  // ★ 도식 교체 모달 안에서 [이미지 삭제] — 현재 figure_crop 인덱스 제거 + 첫 이미지면 ai_analysis 도 정리.
  const handleDeleteCurrentDiagramFromModal = useCallback(async () => {
    if (!diagramBrowserProblem) return;
    try {
      const allImages = diagramBrowserProblem.images || [];
      const figureCrops = allImages.filter((img) => img.type === 'figure_crop');
      const nonFigureCrops = allImages.filter((img) => img.type !== 'figure_crop');

      // 인덱스 제거 (-1 이거나 범위 밖이면 첫 번째 제거)
      const idx = diagramReplaceIndex >= 0 && diagramReplaceIndex < figureCrops.length ? diagramReplaceIndex : 0;
      const newFigureCrops = figureCrops.filter((_, i) => i !== idx);
      const newImages = [...nonFigureCrops, ...newFigureCrops];

      // ai_analysis 정리 — 첫 번째 이미지(idx 0) 삭제 시 figureData/figureSvg/upscaledCropUrl 도 같이 제거
      const existRes = await fetch(`/api/problems/${diagramBrowserProblem.id}`);
      let existingAi: Record<string, unknown> = {};
      if (existRes.ok) {
        const existData = await existRes.json();
        existingAi = existData.ai_analysis || {};
      }
      const updatedAi: Record<string, unknown> = { ...existingAi };
      if (idx === 0) {
        delete updatedAi.figureData;
        delete updatedAi.figureSvg;
        delete updatedAi.upscaledCropUrl;
        // hasFigure 는 남은 figure_crop 이 있을 때만 유지
        updatedAi.hasFigure = newFigureCrops.length > 0;
      }

      const patchRes = await fetch(`/api/problems/${diagramBrowserProblem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: newImages, ai_analysis: updatedAi }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}));
        alert(`이미지 삭제 실패: ${err.error || patchRes.status}`);
        return;
      }
      console.log(`[DiagramDelete] Problem #${diagramBrowserProblem.number} 이미지 #${idx} 삭제 완료`);
      refetchProblems();
    } catch (err) {
      console.error('[DiagramDelete] Error:', err);
      alert(`이미지 삭제 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setDiagramBrowserProblem(null);
    }
  }, [diagramBrowserProblem, diagramReplaceIndex, refetchProblems]);

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

      // 2. OCR + 분류 + 이미지 Storage 저장
      const ocrRes = await fetch('/api/workflow/reanalyze-crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          fullAnalysis: true,
          analyzeGraph: false,
          problemNumber: problem.number,
          problemId: problem.id,
        }),
      });

      if (!ocrRes.ok) {
        const errData = await ocrRes.json().catch(() => ({}));
        throw new Error(errData.error || `OCR 실패 (${ocrRes.status})`);
      }

      const ocrData = await ocrRes.json();
      console.log('[Rescan] OCR result:', ocrData);

      // 3. 문제 업데이트 — OCR 텍스트가 있을 때만 갱신
      const updateBody: Record<string, unknown> = {};
      if (ocrData.ocrText && ocrData.ocrText.trim().length > 0) {
        updateBody.content_latex = ocrData.ocrText;
      }

      // 선택지가 있으면 answer_json에 포함
      if (ocrData.choices && ocrData.choices.length > 0) {
        updateBody.answer_json = {
          correct_answer: problem.answer, // 기존 정답 유지
          choices: ocrData.choices,
        };
      }

      // 분류 결과가 있으면 ai_analysis 업데이트 — 기존 도형 데이터 완전 보존
      // DB에서 기존 ai_analysis를 먼저 가져옴
      let existingAi: Record<string, unknown> = {};
      try {
        const existRes = await fetch(`/api/problems/${problem.id}`);
        if (existRes.ok) {
          const existData = await existRes.json();
          existingAi = existData.ai_analysis || {};
        }
      } catch {}
      const aiAnalysis: Record<string, unknown> = {
        ...existingAi,
        ...(ocrData.classification || {}),
      };

      // Storage에 저장된 크롭 URL이 있으면 ai_analysis에 추가
      if (ocrData.cropUrl) {
        aiAnalysis.cropImageUrl = ocrData.cropUrl;
      }

      // 재스캔: 원본 이미지를 업스케일 크롭으로 우선 표시
      // (AI 그래프 생성은 사용자가 "AI 생성" 버튼을 누를 때)
      if (ocrData.cropUrl) {
        aiAnalysis.hasFigure = true;
        aiAnalysis.upscaledCropUrl = ocrData.cropUrl;
        aiAnalysis.figureSource = 'upscaled_crop';
        // 기존 AI 생성 도형 제거 (원본 우선)
        delete aiAnalysis.figureData;
        delete aiAnalysis.figureSvg;
      }

      updateBody.ai_analysis = aiAnalysis;

      // images 배열 업데이트 (크롭 이미지 교체)
      if (ocrData.cropUrl) {
        const existingImages = (problem.images || []).filter(
          (img: { type: string }) => img.type !== 'crop'
        );
        updateBody.images = [
          { url: ocrData.cropUrl, type: 'crop', label: '재스캔 크롭' },
          ...existingImages,
        ];
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
  const [showAddProblemsModal, setShowAddProblemsModal] = useState(false);
  const [showAnswerMatchModal, setShowAnswerMatchModal] = useState(false);
  const [isSyncingFromSolutions, setIsSyncingFromSolutions] = useState(false);
  const [selectedProblems, setSelectedProblems] = useState<Set<string>>(new Set());
  const [isAutoMapping, setIsAutoMapping] = useState(false);

  // 해설에서 빠른답 자동 추출 (진단평가 BS_H1S1_R1 류 사고 차단 회로)
  const handleSyncAnswersFromSolutions = useCallback(async () => {
    if (isSyncingFromSolutions) return;
    if (!confirm('이 시험지의 해설(solution_latex)에서 빠른답을 자동 추출해 채웁니다. 이미 빠른답이 있는 문제는 건너뜁니다. 진행할까요?')) return;
    setIsSyncingFromSolutions(true);
    try {
      const res = await fetch(`/api/exams/${examId}/sync-answers-from-solutions`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      console.log('[sync-answers] 응답:', data);
      const lines = [
        `${data.updatedCount}개 문제에 답이 자동 추출되어 박혔습니다.`,
        `이미 답 있음: ${data.skippedAlreadyFilled}건`,
        `해설 없음: ${data.skippedNoSolution}건`,
        `추출 실패: ${data.skippedNoExtraction}건`,
      ];
      if (Array.isArray(data.failed) && data.failed.length > 0) {
        lines.push(`업데이트 실패: ${data.failed.length}건 (콘솔 확인)`);
      }
      alert(lines.join('\n'));
      refetchProblems();
    } catch (err) {
      console.error('[sync-answers] 오류:', err);
      alert(`해설→빠른답 동기화 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally {
      setIsSyncingFromSolutions(false);
    }
  }, [examId, isSyncingFromSolutions, refetchProblems]);

  // ★ 펼쳐보기 카드 드래그앤드롭 재정렬 (optimistic UI)
  const [draggedProblemId, setDraggedProblemId] = useState<string | null>(null);
  const [dragOverProblemId, setDragOverProblemId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  // 드롭 즉시 반영될 낙관적 순서 (id 배열). API 성공+refetch 후 null 로 해제.
  const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);

  const handleReorderDrop = useCallback(async (draggedId: string, targetId: string) => {
    if (!draggedId || !targetId || draggedId === targetId) return;
    // 현재 표시 순서(낙관적 순서 우선, 아니면 DB 번호 순)
    const allSorted = [...problems].sort((a, b) => (a.number || 0) - (b.number || 0));
    const baseIds = optimisticOrder ?? allSorted.map(p => p.id);
    const fromIdx = baseIds.indexOf(draggedId);
    const toIdx = baseIds.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reorderedIds = [...baseIds];
    const [moved] = reorderedIds.splice(fromIdx, 1);
    reorderedIds.splice(toIdx, 0, moved);

    // ★ 즉시 UI 반영 — API 응답 기다리지 않음
    setOptimisticOrder(reorderedIds);
    setDraggedProblemId(null);
    setDragOverProblemId(null);
    setIsReordering(true);

    try {
      const res = await fetch(`/api/exams/${examId}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedProblemIds: reorderedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 롤백
        setOptimisticOrder(null);
        alert('순서 변경 실패: ' + (data.error || `HTTP ${res.status}`));
        return;
      }
      // DB 동기화 후 낙관적 상태 해제
      await refetchProblems();
      setOptimisticOrder(null);
    } catch (err) {
      setOptimisticOrder(null);
      alert('순서 변경 실패: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsReordering(false);
    }
  }, [problems, optimisticOrder, examId, refetchProblems]);

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
    // ★ 원본 시험지 과목 전달 — create-exam 이 '수학1' 하드코딩으로 엉뚱한 폴더 분류되던 것 방지.
    if (examInfo?.subject) sessionStorage.setItem('sourceExamSubject', examInfo.subject);
    else sessionStorage.removeItem('sourceExamSubject');
    router.push('/dashboard/cloud/create-exam');
  }, [problems, selectedProblems, examTitle, examInfo, router]);

  // Counts — DifficultyKey 가 1~10 이라 모두 0 으로 초기화
  const difficultyCounts = useMemo(() => {
    const counts: Record<DifficultyKey, number> = {
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0,
    };
    problems.forEach((p) => { counts[p.difficulty as DifficultyKey]++; });
    return counts;
  }, [problems]);

  const domainCounts = useMemo(() => {
    const counts: Record<DomainKey, number> = {
      CALCULATION: 0, UNDERSTANDING: 0, INFERENCE: 0, PROBLEM_SOLVING: 0, UNASSIGNED: 0,
    };
    problems.forEach((p) => { counts[p.cognitiveDomain]++; });
    return counts;
  }, [problems]);

  // Filtered problems (번호 순 정렬)
  const filteredProblems = useMemo(() => {
    const filtered = problems.filter((p) => {
      if (activeDifficulty !== null && p.difficulty !== activeDifficulty) return false;
      if (activeDomain !== null && activeDomain !== 'UNASSIGNED' && p.cognitiveDomain !== activeDomain) return false;
      return true;
    });

    // ★ 드래그 직후 낙관적 순서가 있으면 그 순서대로 정렬 + 번호 1..N 로 재부여
    //   (API/refetch 완료 전에도 즉시 새 순서 + 새 번호 보이도록)
    if (optimisticOrder) {
      const idToProblem = new Map(filtered.map(p => [p.id, p]));
      const ordered: typeof filtered = [];
      let seq = 1;
      for (const id of optimisticOrder) {
        const p = idToProblem.get(id);
        if (p) {
          ordered.push({ ...p, number: seq });
          seq++;
        }
      }
      return ordered;
    }

    return filtered.sort((a, b) => (a.number || 0) - (b.number || 0));
  }, [problems, activeDifficulty, activeDomain, optimisticOrder]);

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
    <div className="ce-shell">
      <div className="ce-body-grid">
        {/* ═══════ MAIN ═══════ */}
        <main className="ce-main">
          {/* SUBBAR */}
          <div className="ce-subbar">
            <div className="ce-breadcrumb">
              <button type="button" onClick={goBack}>
                <ArrowLeft className="inline h-3 w-3 mr-1" />
                시험지 목록
              </button>
              <span className="sep">/</span>
              <span>{orgName}클라우드</span>
              <span className="sep">/</span>
              <span style={{ color: 'var(--chrome-fg-2)' }}>{examTitle}</span>
            </div>
            <div className="ce-sub-main">
              <input
                className="ce-exam-title"
                value={examTitle}
                readOnly
                spellCheck={false}
              />
              <span className="ce-exam-meta-chip">{problems.length}문항</span>

              <div className="ce-sub-actions">
                {/* 기능 버튼들 (원본 색 코딩 유지) */}
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
            <button
              type="button"
              disabled={isAutoMapping}
              onClick={() => {
                console.log('[AutoMap] click fired, isAutoMapping=', isAutoMapping);
                if (isAutoMapping) {
                  console.log('[AutoMap] 이미 진행 중 — 무시');
                  return;
                }
                let confirmed = true;
                try {
                  confirmed = confirm('전체 문제를 강제 재분류합니다. 백그라운드에서 진행되며 완료 시 알림이 뜹니다. 진행할까요?');
                } catch (confErr) {
                  console.warn('[AutoMap] confirm() 차단됨 — 그대로 진행:', confErr);
                }
                if (!confirmed) {
                  console.log('[AutoMap] 사용자 취소');
                  return;
                }
                console.log('[AutoMap] 시작:', examId);
                setIsAutoMapping(true);
                // ★ 백그라운드 실행 — await 하지 않음. 사용자가 다른 작업 가능.
                (async () => {
                  try {
                    const res = await fetch(`/api/exams/${examId}/auto-fix?force=1`, { method: 'POST' });
                    console.log('[AutoMap] 응답:', res.status);
                    if (!res.ok) {
                      alert('자동매핑 실패: HTTP ' + res.status);
                      setIsAutoMapping(false);
                      return;
                    }
                    const data = await res.json();
                    console.log('[AutoMap] 데이터:', data);
                    const fixCount = data.fixedProblems || data.results?.filter((f: any) => f.fixes?.length > 0).length || 0;
                    alert(`✅ 자동매핑 완료: ${fixCount}개 문제 수정됨. 화면을 새로고침합니다.`);
                    window.location.reload();
                  } catch (e) {
                    console.error('[AutoMap] 오류:', e);
                    alert('자동매핑 실패: ' + (e instanceof Error ? e.message : '알 수 없는 오류'));
                    setIsAutoMapping(false);
                  }
                })();
                // 즉시 시작 알림 (백그라운드 진행 중)
                try {
                  alert('🔄 자동매핑이 백그라운드에서 시작되었습니다.\n완료까지 1~3분 정도 걸립니다. 다른 작업 하셔도 됩니다.');
                } catch { /* alert 차단 무시 */ }
              }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                isAutoMapping
                  ? 'bg-violet-500/10 border-violet-500/40 text-violet-300 cursor-wait'
                  : 'bg-surface-card text-content-secondary hover:bg-surface-raised'
              }`}
            >
              {isAutoMapping ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span>{isAutoMapping ? '자동매핑 중…' : '유형 자동매핑'}</span>
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
              onClick={() => router.push(`/dashboard/exam-analysis/${examId}`)}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-3 py-2 text-sm font-medium text-indigo-400 hover:bg-indigo-500/20 transition-colors"
            >
              <BarChart3 className="h-4 w-4" />
              <span>유형 분석</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddProblemsModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-blue-500/50 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/20 transition-colors"
            >
              <PlusCircle className="h-4 w-4" />
              <span>문제 추가</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAnswerMatchModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              <FileText className="h-4 w-4" />
              <span>빠른답/해설</span>
            </button>
            <button
              type="button"
              onClick={handleSyncAnswersFromSolutions}
              disabled={isSyncingFromSolutions}
              title="해설에서 정답을 자동 추출해 빠른답 칸을 채웁니다 (이미 답 있는 문제는 건너뜀)"
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              <span>{isSyncingFromSolutions ? '추출 중...' : '해설→빠른답'}</span>
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

          {/* 문항 수 + 제목 편집 */}
          <span className="text-sm text-chrome-fg-3 ml-2">{problems.length} 문항</span>
          <button
            type="button"
            title="시험지 이름 수정"
            onClick={async () => {
              const newTitle = prompt('시험지 이름을 입력하세요 (같은 이름 입력 시 태그 동기화만 수행)', examTitle);
              if (!newTitle || !newTitle.trim()) return;
              const trimmed = newTitle.trim();
              try {
                const res = await fetch(`/api/exams/${examId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  // title 동일하더라도 PATCH 실행 + syncProblemSources=true로 태그 강제 동기화
                  body: JSON.stringify({ title: trimmed, syncProblemSources: true }),
                });
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  alert(`이름 변경 실패: ${err.error || res.status}`);
                  return;
                }
                const data = await res.json();
                alert(`이름 변경 완료 — 문제 ${data.syncedProblems || 0}개 태그도 동기화됨`);
                refetchProblems();
              } catch (err) {
                alert(`이름 변경 요청 실패: ${String(err)}`);
              }
            }}
            className="p-2 text-chrome-fg-3 hover:text-chrome-fg-1"
          >
            <Pencil className="h-5 w-5" />
          </button>
                </div>
              </div>
            </div>

      {/* ======== 자동 검증 배너 ======== */}
      {validationIssues.length > 0 && (
        <div className="mx-5 mt-2 mb-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold mb-1">
            <span>⚠ 자동 검증: {validationIssues.length}건 이슈 감지</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {validationIssues.map((issue, idx) => (
              <span key={idx} className={`text-[10px] px-1.5 py-0.5 rounded border ${
                issue.type === 'empty' ? 'border-red-500/30 bg-red-500/10 text-red-400' :
                issue.type === 'unclassified' ? 'border-orange-500/30 bg-orange-500/10 text-orange-400' :
                issue.type === 'choice_misdetect' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' :
                'border-violet-500/30 bg-violet-500/10 text-violet-400'
              }`}>
                #{issue.problemNum} {issue.message}
              </span>
            ))}
          </div>
        </div>
      )}

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

        {/* ★ 자동수정 버튼 — 분류/서술형/점수 등 공통 오류 일괄 수정 */}
        <button
          type="button"
          onClick={async () => {
            if (!confirm('자동수정을 실행합니다.\n- 과목/학년 불일치 수정\n- 서술형 소문제 복원\n- 점수 표기 정리\n- LaTeX 렌더 수정 (구간정의함수 등)\n- 학습된 수정 규칙 자동 적용\n\n진행하시겠습니까?')) return;
            try {
              const res = await fetch(`/api/exams/${examId}/auto-fix?mode=fix`, { method: 'POST' });
              const data = await res.json();
              if (data.error) {
                alert('오류: ' + data.error);
                return;
              }
              const msg = `자동수정 완료!\n\n` +
                `총 ${data.totalProblems}문제 중 ${data.fixedProblems}문제 수정\n` +
                `총 ${data.totalFixes}건 수정, ${data.totalErrors}건 오류\n` +
                `시험지 과목: ${data.examSubject || '미감지'}\n` +
                `학년: ${data.examGrade || '미감지'}\n\n` +
                (data.results || []).map((r: { number: number; fixes: string[] }) =>
                  `#${r.number}: ${r.fixes.join(', ')}`
                ).filter((s: string) => s.includes(':')).join('\n');
              alert(msg);
              refetchProblems();
            } catch (err) {
              alert('자동수정 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
            }
          }}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
        >
          <Wand2 className="h-3.5 w-3.5" />
          자동수정
        </button>

        {/* ★ 도형 일괄 업스케일 (크롭 이미지가 있고 아직 처리 안 된 문제 대상) */}
        {problems.some(p => p.hasFigure && p.images?.some(img => img.type === 'crop') && !p.upscaledCropUrl && !p.figureData && !p.figureSvg) && (
          <button
            type="button"
            onClick={async () => {
              const targets = problems.filter(
                p => p.hasFigure && p.images?.some(img => img.type === 'crop') && !p.upscaledCropUrl && !p.figureData && !p.figureSvg
              );
              if (targets.length === 0) return;
              if (!confirm(`${targets.length}개 문제의 도형을 업스케일합니다. 진행하시겠습니까?`)) return;
              let success = 0;
              for (const p of targets) {
                const ok = await handleUpscaleFigure(p);
                if (ok) success++;
              }
              if (success > 0) refetchProblems();
              alert(`완료: ${success}/${targets.length}개 업스케일 성공`);
            }}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
            disabled={generatingFigures.size > 0}
          >
            <ZoomIn className="h-3.5 w-3.5" />
            {generatingFigures.size > 0 ? `업스케일 중 (${generatingFigures.size})...` : '도형 일괄 업스케일'}
          </button>
        )}
        {/* ★ AI 일괄 생성 (업스케일 완료 후 AI 도형 교체 원할 때) */}
        {problems.some(p => p.hasFigure && (p.upscaledCropUrl || p.images?.some(img => img.type === 'crop')) && !p.figureData && !p.figureSvg) && (
          <button
            type="button"
            onClick={async () => {
              const targets = problems.filter(
                p => p.hasFigure && (p.upscaledCropUrl || p.images?.some(img => img.type === 'crop')) && !p.figureData && !p.figureSvg
              );
              if (targets.length === 0) return;
              if (!confirm(`${targets.length}개 문제에 AI Vision으로 도형을 생성합니다.\n잘못된 도형이 생성될 수 있습니다. 진행하시겠습니까?`)) return;
              let generated = 0;
              let skipped = 0;
              for (const p of targets) {
                const ok = await handleGenerateAIFigure(p);
                if (ok) generated++;
                else skipped++;
              }
              alert(`완료: ${generated}개 AI 도형 생성, ${skipped}개 건너뜀`);
            }}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors"
            disabled={generatingFigures.size > 0}
          >
            <Wand2 className="h-3.5 w-3.5" />
            {generatingFigures.size > 0 ? `AI 생성 중 (${generatingFigures.size})...` : 'AI 일괄 생성'}
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
            <>
              {/* ★ 드래그앤드롭 안내 — 필터 활성 시 경고 */}
              {(activeDifficulty !== null || activeDomain !== null) && (
                <div className="mb-3 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                  필터가 적용된 상태에서는 순서 변경이 불가능합니다. 필터를 해제해 주세요.
                </div>
              )}
              {isReordering && (
                <div className="mb-3 text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2">
                  순서 변경 중…
                </div>
              )}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProblems.map((problem) => {
                  const canDrag = activeDifficulty === null && activeDomain === null && !isSelectionMode && !isReordering;
                  const isDragOver = dragOverProblemId === problem.id && draggedProblemId !== problem.id;
                  return (
                    <div
                      key={problem.id}
                      draggable={canDrag}
                      onDragStart={(e) => {
                        if (!canDrag) return;
                        setDraggedProblemId(problem.id);
                        e.dataTransfer.effectAllowed = 'move';
                        // drag image 는 브라우저 기본 사용
                      }}
                      onDragEnd={() => {
                        setDraggedProblemId(null);
                        setDragOverProblemId(null);
                      }}
                      onDragOver={(e) => {
                        if (!canDrag || !draggedProblemId) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverProblemId !== problem.id) setDragOverProblemId(problem.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverProblemId === problem.id) setDragOverProblemId(null);
                      }}
                      onDrop={(e) => {
                        if (!canDrag) return;
                        e.preventDefault();
                        const dragged = draggedProblemId;
                        if (dragged && dragged !== problem.id) {
                          void handleReorderDrop(dragged, problem.id);
                        }
                      }}
                      className={`transition-all ${
                        isDragOver ? 'ring-2 ring-cyan-500 scale-[1.01]' : ''
                      } ${draggedProblemId === problem.id ? 'opacity-40' : ''}`}
                      style={{ cursor: canDrag ? 'grab' : undefined }}
                    >
                      <ProblemCardView
                        problem={problem}
                        onTwinGenerate={setTwinModalProblem}
                        onEdit={setEditModalProblem}
                        onRescan={handleRescanProblem}
                        onGenerateFigure={handleUpscaleFigure}
                        onGenerateAIFigure={handleGenerateAIFigure}
                        onDeleteFigure={handleDeleteFigure}
                        onReplaceDiagram={handleReplaceDiagram}
                        onUpdateContent={handleUpdateContent}
                        onUpdatePoints={handleUpdatePoints}
                        isSelectionMode={isSelectionMode}
                        isSelected={selectedProblems.has(problem.id)}
                        onToggleSelect={toggleSelectProblem}
                        viewMode={renderMode}
                        isGeneratingFigure={generatingFigures.has(problem.id)}
                        isRescanning={rescanningId === problem.id}
                      />
                    </div>
                  );
                })}
              </div>
            </>
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
          examId={examId}
          templateId={templateId}
          examMeta={examMeta}
          onOpenTemplateModal={() => setShowTemplateModal(true)}
          onTemplateChange={(id, meta) => { setTemplateId(id); setExamMeta(meta); }}
          onMetaChange={setExamMeta}
          refetchProblems={refetchProblems}
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
          examId={examId}
          templateId={templateId}
          examMeta={examMeta}
          onOpenTemplateModal={() => setShowTemplateModal(true)}
          refetchProblems={refetchProblems}
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
            examId={examId}
            templateId={templateId}
            examMeta={examMeta}
            onOpenTemplateModal={() => {}}
            refetchProblems={refetchProblems}
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

      {showAddProblemsModal && (
        <AddProblemsModal
          examId={examId}
          onClose={() => setShowAddProblemsModal(false)}
          onAdded={(count) => {
            refetchProblems();
            setShowAddProblemsModal(false);
          }}
        />
      )}

      {/* 빠른답/해설 매칭 모달 */}
      {showAnswerMatchModal && (
        <AnswerMatchModal
          isOpen={showAnswerMatchModal}
          examId={examId}
          problems={problems.map(p => ({ id: p.id, number: p.number, answer: p.answer }))}
          onClose={() => setShowAnswerMatchModal(false)}
          onApplied={() => refetchProblems()}
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
          initialAnswer={editModalProblem.answerJson || { correct_answer: editModalProblem.answer }}
          initialChoices={editModalProblem.choices}
          initialChoiceImages={editModalProblem.choiceImages}
          initialDifficulty={editModalProblem.difficulty}
          initialCognitiveDomain={editModalProblem.cognitiveDomain}
          initialTypeCode={editModalProblem.typeCode}
          initialTypeName={editModalProblem.typeName}
          initialImages={editModalProblem.images}
          cropImageUrl={editModalProblem.images?.find(img => img.type === 'crop')?.url}
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

      {/* 도식 교체 모달 */}
      <DiagramBrowserModal
        isOpen={!!diagramBrowserProblem}
        onClose={() => setDiagramBrowserProblem(null)}
        onSelect={handleDiagramSelected}
        onDelete={handleDeleteCurrentDiagramFromModal}
        currentImageUrl={diagramBrowserProblem?.images?.find(img => img.type === 'figure_crop' || img.type === 'crop')?.url}
        problemNumber={diagramBrowserProblem?.number}
      />

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
        </main>

        {/* RIGHT PANEL 제거됨 — 서브바와 완전 중복 (필터/뷰옵션/내보내기 모두 서브바에 존재) */}
      </div>
    </div>
  );
}
