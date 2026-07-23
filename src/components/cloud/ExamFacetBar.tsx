'use client';

// ============================================================================
// 조건 바 — 폴더 트리가 못 하는 "여러 축 동시 좁히기"를 제목 기반으로 처리.
//
// ★ 설계 원칙 (2026-07-23)
//   1. 폴더를 대체하지 않는다. 현재 선택된 폴더 범위 "안에서" 더 좁힐 뿐.
//   2. 후보값은 지금 목록에 실제로 있는 것만 — 눌러서 0건 되는 칩은 만들지 않는다.
//   3. 값이 한 종류뿐인 축은 아예 감춘다 (중3 폴더 안에서 '학년' 칩은 무의미).
//   4. 조건이 하나도 없으면 기존 목록과 100% 동일 — 켜기 전엔 아무것도 안 바뀐다.
//
//   시각 언어는 진단 리포트(report-primitives)를 따른다: 반투명 표면 + 조용한
//   테두리 + 등폭 숫자 + 액센트는 인디고 하나.
// ============================================================================

import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import {
  buildFacetOptions,
  hasAnyFacet,
  toggleFacet,
  type ExamFacetSelection,
  type FacetOption,
} from '@/lib/exams/parse-exam-title';
import type { ParsedExamTitle } from '@/lib/exams/parse-exam-title';
import { PANEL_SURFACE, RADIUS } from '@/components/ui/surface';

interface Props {
  /** 현재 폴더 범위의 시험지들을 파싱한 결과 (순서 무관) */
  parsedList: Array<ParsedExamTitle | null>;
  value: ExamFacetSelection;
  onChange: (next: ExamFacetSelection) => void;
  /** 조건 적용 후 남은 건수 — 바 오른쪽에 표시 */
  resultCount: number;
  /** 전체 시험지 범위로 넓히기 (폴더 넘나드는 자료를 한 번에 보기 위함). 없으면 버튼 숨김 */
  onExpandScope?: () => void;
  /** 이미 전체 범위면 확장 버튼 의미 없음 */
  isAllScope?: boolean;
}

const AXES: Array<{ key: keyof ExamFacetSelection; label: string }> = [
  { key: 'level', label: '학교급' },
  { key: 'grade', label: '학년' },
  { key: 'term', label: '학기' },
  { key: 'kind', label: '구분' },
  { key: 'year', label: '연도' },
];

function Chip({
  option, active, onClick,
}: { option: FacetOption; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium
        transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
        ${active
          ? 'bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-500/40'
          : 'bg-white/[.04] text-content-secondary hover:bg-white/[.08] hover:text-content-primary'}`}
    >
      {option.label}
      <span
        className={`font-mono text-[10px] tabular-nums ${active ? 'text-indigo-200' : 'text-content-tertiary'}`}
      >
        {option.count}
      </span>
    </button>
  );
}

export function ExamFacetBar({
  parsedList, value, onChange, resultCount, onExpandScope, isAllScope,
}: Props) {
  const options = useMemo(() => buildFacetOptions(parsedList), [parsedList]);
  const active = hasAnyFacet(value);

  // 값이 2개 이상인 축만 노출 — 하나뿐이면 누를 이유가 없다.
  const visibleAxes = AXES.filter(({ key }) => options[key].length >= 2);

  // 조건을 걸 수 있는 축이 없고 선택도 없으면 바 자체를 감춘다 (교재 폴더 등).
  if (visibleAxes.length === 0 && !active) return null;

  return (
    // 표면 규칙은 surface.tsx 한 곳에서 — 여기서 배경·테두리를 직접 정하지 않는다.
    <div className={`mb-3 ${RADIUS.panel} ${PANEL_SURFACE} px-3.5 py-3`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
        {visibleAxes.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-semibold text-content-tertiary">
              {label}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {options[key].map((opt) => (
                <Chip
                  key={opt.value}
                  option={opt}
                  active={value[key].includes(opt.value)}
                  onClick={() => onChange(toggleFacet(value, key, opt.value))}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="ml-auto flex items-center gap-2.5">
          {active && (
            <span className="font-mono text-xs tabular-nums text-content-secondary">
              <span className="font-bold text-indigo-300">{resultCount}</span>건
            </span>
          )}
          {active && !isAllScope && onExpandScope && (
            // 같은 학교 자료가 여러 폴더에 흩어져 있어(운영 실측 47곳 중 19곳),
            // 조건을 켠 채 범위만 전체로 넓히면 폴더를 옮겨 다닐 필요가 없다.
            <button
              type="button"
              onClick={onExpandScope}
              className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-medium
                text-content-tertiary transition-colors hover:border-indigo-500/40 hover:text-indigo-200
                focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              전체에서 찾기
            </button>
          )}
          {active && (
            <button
              type="button"
              onClick={() => onChange({ year: [], grade: [], term: [], kind: [], level: [] })}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs
                text-content-tertiary transition-colors hover:bg-white/[.06] hover:text-content-secondary
                focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <X className="h-3 w-3" /> 초기화
            </button>
          )}
        </div>
      </div>

      {active && options.unparsed > 0 && (
        // 조건을 켜면 제목 형식이 아닌 자료(교재류)는 빠지므로, 조용히 사라진 게
        // 아니라는 것을 알린다.
        <p className="mt-2 border-t border-white/[.05] pt-2 text-xs text-content-tertiary">
          제목에 학년·학기 표기가 없는 {options.unparsed}건은 조건 적용 시 제외됩니다
        </p>
      )}
    </div>
  );
}
