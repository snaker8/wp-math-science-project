'use client';

import React, { useState, useMemo, useCallback } from 'react';
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
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { TwinProblemModal } from '@/components/papers/TwinProblemModal';
import { ExamStatsModal } from '@/components/papers/ExamStatsModal';
import { ProblemEditModal } from '@/components/papers/ProblemEditModal';
import { useExamProblems } from '@/hooks/useExamProblems';

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
}

type DifficultyKey = 1 | 2 | 3 | 4 | 5;
type DomainKey = 'CALCULATION' | 'UNDERSTANDING' | 'INFERENCE' | 'PROBLEM_SOLVING' | 'UNASSIGNED';

// ============================================================================
// Constants
// ============================================================================

const DIFFICULTY_CONFIG: Record<DifficultyKey, { label: string; border: string; bg: string; text: string }> = {
  1: { label: '최하', border: 'border-zinc-500', bg: 'bg-zinc-800', text: 'text-zinc-400' },
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
  UNASSIGNED: { label: '미지정', border: 'border-zinc-600', bg: 'bg-zinc-800', text: 'text-zinc-500' },
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
          : 'border-zinc-700 bg-zinc-800/50 text-zinc-500 hover:border-zinc-500'
      }`}
    >
      <span className="text-[10px] pr-1">{label}</span>
      <span className="font-bold">{count}</span>
    </button>
  );
}

function ProblemCardView({
  problem,
  onTwinGenerate,
  onEdit,
  isSelectionMode,
  isSelected,
  onToggleSelect,
}: {
  problem: ProblemData;
  onTwinGenerate: (p: ProblemData) => void;
  onEdit?: (p: ProblemData) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  return (
    <div
      className={`group rounded-xl border transition-all cursor-pointer ${
        isSelectionMode && isSelected
          ? 'border-cyan-500 bg-cyan-500/5 ring-1 ring-cyan-500/30'
          : 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-600'
      }`}
      onClick={isSelectionMode ? () => onToggleSelect?.(problem.id) : undefined}
    >
      {/* 카드 헤더: 난이도 + 인지영역 + 액션 버튼/체크 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-1.5">
          <DifficultyBadge level={problem.difficulty} />
          <DomainBadge domain={problem.cognitiveDomain} />
        </div>
        {isSelectionMode ? (
          <div
            className={`flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all ${
              isSelected
                ? 'border-cyan-500 bg-cyan-500 text-white'
                : 'border-zinc-600 bg-zinc-800 text-transparent hover:border-zinc-400'
            }`}
          >
            <Check className="h-3.5 w-3.5" />
          </div>
        ) : (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onTwinGenerate(problem); }}
              className="p-1 rounded text-zinc-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
              title="유사문제 만들기"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800" title="복사해서 만들기">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit?.(problem); }}
              className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              title="수정하기"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 문제 본문 */}
      <div className="px-4 pb-3">
        <div className="mb-2">
          <span className="text-sm font-bold text-zinc-200 mr-2">{problem.number}.</span>
          <MixedContentRenderer
            content={problem.content}
            className="inline text-sm text-zinc-300 leading-relaxed"
          />
        </div>

        {/* 선택지 */}
        {/* 선택지 */}
        {problem.choices.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 pl-4">
            {problem.choices.map((choice, i) => {
              const circled = ['①', '②', '③', '④', '⑤'][i] || '';
              const stripped = choice.replace(/^[①②③④⑤]\s*/, '');
              return (
                <div key={i} className="flex items-start gap-1 text-[13px] text-zinc-400">
                  <span className="flex-shrink-0 text-zinc-500">{circled}</span>
                  <MixedContentRenderer content={stripped} className="text-zinc-400" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 카드 하단: 연도 + 유형코드 + 유형명 + 출처 */}
      <div className="flex items-center justify-between border-t border-zinc-800/50 px-4 py-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {problem.year && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              {problem.year}
            </span>
          )}
          {problem.typeCode && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {problem.typeCode}. {problem.typeName}
            </span>
          )}
          {problem.source && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">
              {problem.source}
            </span>
          )}
        </div>
        <button type="button" className="p-1 text-zinc-600 hover:text-zinc-400" title="유형 상세">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>

      {/* 유형 footer (참조사이트 스타일) */}
      {problem.typeCode && (
        <div className="px-4 py-1.5 border-t border-zinc-800/30 bg-zinc-900/60">
          <span className="text-[11px] text-zinc-500">유형: {problem.typeCode}. {problem.typeName}</span>
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
}: {
  problems: ProblemData[];
  examTitle: string;
}) {
  const [columns, setColumns] = useState<1 | 2>(2);
  const [gap, setGap] = useState(24);

  return (
    <div className="flex flex-col h-full">
      {/* 상단 컨트롤 바 */}
      <div className="flex items-center justify-between border-b border-zinc-800/50 px-5 py-2 flex-shrink-0 bg-zinc-950/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-zinc-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setColumns(1)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                columns === 1
                  ? 'bg-cyan-500/10 text-cyan-400'
                  : 'text-zinc-500 hover:text-zinc-300'
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
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Columns2 className="h-3.5 w-3.5" />
              2단
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">간격</span>
            <input
              type="range"
              min={8}
              max={48}
              value={gap}
              onChange={(e) => setGap(Number(e.target.value))}
              className="w-24 h-1 accent-cyan-500 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs text-zinc-500 w-6">{gap}</span>
          </div>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors"
        >
          <Printer className="h-4 w-4" />
          출력
        </button>
      </div>

      {/* 시험지 본문 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 flex justify-center py-6 bg-zinc-950/30">
        <div className="w-full max-w-[900px] bg-white rounded-lg shadow-2xl shadow-black/50 mx-4">
          {/* 시험지 헤더 테이블 */}
          <div className="border-b-2 border-gray-800 p-0">
            <table className="w-full border-collapse text-black">
              <tbody>
                <tr>
                  <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-16 bg-gray-50">과목</td>
                  <td className="border border-gray-400 px-3 py-2 text-sm font-bold">공통수학 1</td>
                  <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-20 bg-gray-50">시험지명</td>
                  <td className="border border-gray-400 px-3 py-2 text-sm font-bold" colSpan={2}>
                    {examTitle}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-16 bg-gray-50">담당</td>
                  <td className="border border-gray-400 px-3 py-2 text-sm font-bold w-20"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 문제 영역 */}
          <div
            className={`p-6 ${columns === 2 ? 'columns-2 gap-8' : ''}`}
            style={{ columnGap: columns === 2 ? `${gap}px` : undefined }}
          >
            {problems.map((problem, idx) => (
              <div
                key={problem.id}
                className="break-inside-avoid mb-0"
                style={{ marginBottom: `${gap}px` }}
              >
                <div className="flex gap-2">
                  <span className="text-sm font-bold text-gray-900 flex-shrink-0 pt-0.5">
                    {problem.number}.
                  </span>
                  <div className="flex-1">
                    <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                      <MixedContentRenderer content={problem.content} className="text-gray-800" />
                    </div>
                    {problem.choices.length > 0 && (
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
                        {problem.choices.map((choice, ci) => (
                          <div key={ci} className="text-[13px] text-gray-700">
                            <MixedContentRenderer content={choice} className="text-gray-700" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Quick Answer View (빠른정답)
// ============================================================================

function QuickAnswerView({
  problems,
  examTitle,
}: {
  problems: ProblemData[];
  examTitle: string;
}) {
  const circledNumbers = ['', '①', '②', '③', '④', '⑤'];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 flex justify-center py-6 bg-zinc-950/30">
      <div className="w-full max-w-[900px] bg-white rounded-lg shadow-2xl shadow-black/50 mx-4">
        {/* 헤더 테이블 */}
        <div className="border-b-2 border-gray-800 p-0">
          <table className="w-full border-collapse text-black">
            <tbody>
              <tr>
                <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-16 bg-gray-50">과목</td>
                <td className="border border-gray-400 px-3 py-2 text-sm font-bold">공통수학 1</td>
                <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-20 bg-gray-50">시험지명</td>
                <td className="border border-gray-400 px-3 py-2 text-sm font-bold" colSpan={2}>
                  {examTitle}
                </td>
                <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-16 bg-gray-50">담당</td>
                <td className="border border-gray-400 px-3 py-2 text-sm font-bold w-20"></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 빠른 정답 제목 */}
        <div className="text-center py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">빠른 정답</h2>
        </div>

        {/* 정답 그리드 */}
        <div className="p-8">
          <div className="grid grid-cols-4 gap-0 border border-gray-400">
            {/* 헤더 */}
            <div className="bg-gray-100 border-b border-r border-gray-400 px-3 py-2 text-center text-xs font-bold text-gray-600">문항</div>
            <div className="bg-gray-100 border-b border-r border-gray-400 px-3 py-2 text-center text-xs font-bold text-gray-600">정답</div>
            <div className="bg-gray-100 border-b border-r border-gray-400 px-3 py-2 text-center text-xs font-bold text-gray-600">문항</div>
            <div className="bg-gray-100 border-b border-gray-400 px-3 py-2 text-center text-xs font-bold text-gray-600">정답</div>

            {/* 정답 행들 - 좌우 2열 배치 */}
            {Array.from({ length: Math.ceil(problems.length / 2) }).map((_, rowIdx) => {
              const leftNum = rowIdx + 1;
              const rightNum = rowIdx + 1 + Math.ceil(problems.length / 2);
              const leftP = problems.find((p) => p.number === leftNum);
              const rightP = problems.find((p) => p.number === rightNum);
              const isLast = rowIdx === Math.ceil(problems.length / 2) - 1;

              const formatAnswer = (ans: number | string | undefined) => {
                if (ans === undefined || ans === '-') return '-';
                if (typeof ans === 'number' && ans >= 1 && ans <= 5) return circledNumbers[ans];
                return String(ans);
              };

              return (
                <React.Fragment key={rowIdx}>
                  {/* 왼쪽 */}
                  <div className={`${!isLast ? 'border-b' : ''} border-r border-gray-400 px-3 py-2.5 text-center text-sm font-bold text-gray-900`}>
                    {leftNum}
                  </div>
                  <div className={`${!isLast ? 'border-b' : ''} border-r border-gray-400 px-3 py-2.5 text-center text-lg font-bold text-blue-600`}>
                    {formatAnswer(leftP?.answer)}
                  </div>
                  {/* 오른쪽 */}
                  <div className={`${!isLast ? 'border-b' : ''} border-r border-gray-400 px-3 py-2.5 text-center text-sm font-bold text-gray-900`}>
                    {rightNum <= problems.length ? rightNum : ''}
                  </div>
                  <div className={`${!isLast ? 'border-b' : ''} border-gray-400 px-3 py-2.5 text-center text-lg font-bold text-blue-600`}>
                    {rightNum <= problems.length ? formatAnswer(rightP?.answer) : ''}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
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
}: {
  problems: ProblemData[];
  examTitle: string;
}) {
  const [columns, setColumns] = useState<1 | 2>(2);
  const [gap, setGap] = useState(24);
  const circledNumbers = ['', '①', '②', '③', '④', '⑤'];

  return (
    <div className="flex flex-col h-full">
      {/* 상단 컨트롤 바 */}
      <div className="flex items-center justify-between border-b border-zinc-800/50 px-5 py-2 flex-shrink-0 bg-zinc-950/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-zinc-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setColumns(1)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                columns === 1
                  ? 'bg-cyan-500/10 text-cyan-400'
                  : 'text-zinc-500 hover:text-zinc-300'
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
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Columns2 className="h-3.5 w-3.5" />
              2단
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">간격</span>
            <input
              type="range"
              min={8}
              max={48}
              value={gap}
              onChange={(e) => setGap(Number(e.target.value))}
              className="w-24 h-1 accent-cyan-500 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs text-zinc-500 w-6">{gap}</span>
          </div>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm font-medium text-cyan-400 hover:bg-cyan-500/20 transition-colors"
        >
          <Printer className="h-4 w-4" />
          출력
        </button>
      </div>

      {/* 해설지 본문 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 flex justify-center py-6 bg-zinc-950/30">
        <div className="w-full max-w-[900px] bg-white rounded-lg shadow-2xl shadow-black/50 mx-4">
          {/* 헤더 테이블 */}
          <div className="border-b-2 border-gray-800 p-0">
            <table className="w-full border-collapse text-black">
              <tbody>
                <tr>
                  <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-16 bg-gray-50">과목</td>
                  <td className="border border-gray-400 px-3 py-2 text-sm font-bold">공통수학 1</td>
                  <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-20 bg-gray-50">시험지명</td>
                  <td className="border border-gray-400 px-3 py-2 text-sm font-bold" colSpan={2}>
                    {examTitle} (해설)
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-xs font-bold text-gray-600 w-16 bg-gray-50">담당</td>
                  <td className="border border-gray-400 px-3 py-2 text-sm font-bold w-20"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 해설 영역 */}
          <div
            className={`p-6 ${columns === 2 ? 'columns-2 gap-8' : ''}`}
            style={{ columnGap: columns === 2 ? `${gap}px` : undefined }}
          >
            {problems.map((problem) => {
              const answerDisplay = typeof problem.answer === 'number' && problem.answer >= 1 && problem.answer <= 5
                ? circledNumbers[problem.answer]
                : String(problem.answer || '-');

              return (
                <div
                  key={problem.id}
                  className="break-inside-avoid mb-0"
                  style={{ marginBottom: `${gap}px` }}
                >
                  {/* 문제 번호 + 정답 */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-bold text-gray-900">{problem.number}.</span>
                    <span className="inline-flex items-center rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-xs font-bold text-blue-700">
                      정답 {answerDisplay}
                    </span>
                    <DifficultyBadgeLight level={problem.difficulty} />
                  </div>

                  {/* 해설 본문 */}
                  <div className="pl-5 text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    <MixedContentRenderer content={problem.solution || '해설이 등록되지 않았습니다.'} className="text-gray-700" />
                  </div>

                  {/* 구분선 */}
                  <div className="mt-2 border-b border-gray-200" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
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

  // DB에서 문제 로드 (없으면 mock fallback)
  const { problems: dbProblems, examInfo, isLoading: dbLoading, refetch: refetchProblems } = useExamProblems(examId);
  const mockProblems = useMemo(() => generateMockProblems(), []);

  // DB 데이터가 있으면 사용, 없으면 mock
  const problems: ProblemData[] = useMemo(() => {
    if (dbProblems.length > 0) {
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
      }));
    }
    return mockProblems;
  }, [dbProblems, mockProblems]);

  const examTitle = examInfo?.title || '용인고등학교(부산 동래구) 2025 1-1 중간 공통수학_1854.pdf';

  // Filter state
  const [activeDifficulty, setActiveDifficulty] = useState<DifficultyKey | null>(null);
  const [activeDomain, setActiveDomain] = useState<DomainKey | null>(null);
  const [activeView, setActiveView] = useState<'spread' | 'exam' | 'answer' | 'solution'>('spread');
  const [twinModalProblem, setTwinModalProblem] = useState<ProblemData | null>(null);
  const [editModalProblem, setEditModalProblem] = useState<ProblemData | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);

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

  const toggleDifficulty = (d: DifficultyKey) => {
    setActiveDifficulty((prev) => (prev === d ? null : d));
  };

  const toggleDomain = (d: DomainKey) => {
    setActiveDomain((prev) => (prev === d ? null : d));
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black text-white">
      {/* ======== Header ======== */}
      <div className="flex items-center justify-between border-b border-zinc-800/50 px-5 py-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => router.push('/dashboard/cloud')}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-bold text-white truncate max-w-[500px]">
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
                  : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <ShoppingCart className="h-4 w-4" />
              <span>{isSelectionMode ? `선택 중 (${selectedProblems.size})` : '문제 선택하기'}</span>
              {isSelectionMode && (
                <X className="h-3.5 w-3.5 ml-0.5 text-zinc-400 hover:text-white" />
              )}
            </button>
            <button type="button" className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors">
              <Sparkles className="h-4 w-4" />
              <span>유형 자동매핑</span>
            </button>
            <button
              type="button"
              onClick={() => setShowStatsModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
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
                  : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
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
                  : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
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
                  : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
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
                  : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              <BookOpenCheck className="h-4 w-4" />
              <span>해설지</span>
            </button>
          </div>

          {/* 문항 수 + 더보기 */}
          <span className="text-sm text-zinc-400 ml-2">{problems.length} 문항</span>
          <button type="button" className="p-2 text-zinc-400 hover:text-zinc-200">
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ======== Filter Bar (Sticky) ======== */}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-zinc-800/50 bg-black/80 backdrop-blur-md px-5 py-2.5 flex-shrink-0">
        {/* 전체 문제 수 */}
        <button
          type="button"
          onClick={() => { setActiveDifficulty(null); setActiveDomain(null); }}
          className="flex items-center rounded-md border border-zinc-500 bg-zinc-700 px-2 py-1 text-sm font-bold text-zinc-100 hover:bg-zinc-600 transition-colors"
        >
          {filteredProblems.length}
          <span className="text-xs font-medium pl-1">문제</span>
        </button>

        {/* 난이도 필터 */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase text-zinc-500 mr-1">난이도</span>
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
          <span className="text-[10px] uppercase text-zinc-500 mr-1">인지</span>
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

        {/* 정보 버튼 */}
        <button type="button" className="ml-1 p-1 rounded-full border border-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors">
          <AlertCircle className="h-4 w-4" />
        </button>
      </div>

      {/* ======== Content Area (View-dependent) ======== */}
      {activeView === 'spread' && (
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 px-4 py-4">
          {filteredProblems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProblems.map((problem) => (
                <ProblemCardView
                  key={problem.id}
                  problem={problem}
                  onTwinGenerate={setTwinModalProblem}
                  onEdit={setEditModalProblem}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedProblems.has(problem.id)}
                  onToggleSelect={toggleSelectProblem}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
              <AlertCircle className="h-10 w-10 mb-3 text-zinc-600" />
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
        <ExamPaperView problems={filteredProblems} examTitle={examTitle} />
      )}

      {activeView === 'answer' && (
        <QuickAnswerView problems={filteredProblems} examTitle={examTitle} />
      )}

      {activeView === 'solution' && (
        <SolutionView problems={filteredProblems} examTitle={examTitle} />
      )}

      {/* ======== Floating Selection Bar ======== */}
      <AnimatePresence>
        {isSelectionMode && selectedProblems.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-6 right-8 z-50 flex items-center gap-3"
          >
            <button
              type="button"
              onClick={clearSelection}
              className="text-sm text-zinc-400 hover:text-zinc-200 underline underline-offset-2 transition-colors"
            >
              선택 초기화
            </button>
            <button
              type="button"
              onClick={handleCreateExam}
              className="flex items-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-500/25 transition-all hover:shadow-cyan-500/40"
            >
              <ShoppingCart className="h-4 w-4" />
              <span>선택한 문제보기</span>
              <span className="flex items-center justify-center bg-white/20 rounded-full w-6 h-6 text-xs font-bold">
                {selectedProblems.size}
              </span>
            </button>
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
    </div>
  );
}
