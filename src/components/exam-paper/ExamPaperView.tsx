'use client';

// ============================================================================
// ExamPaperView — 시험지 인쇄 미리보기·출력 엔진 (측정→분할→렌더→인쇄 + 한글 다운로드)
// ----------------------------------------------------------------------------
// ★ 2026-07-17: cloud/[examId]/page.tsx 에서 "로직 무변경" 기계적 추출.
//   출제(exam-management)와 인쇄 레이아웃이 반복적으로 갈라져(부분 복제),
//   클라우드 검증본을 단일 소스로 삼아 양쪽이 재사용한다.
//   ⚠ 측정↔렌더↔인쇄 기하 동기화 가드 영역 — 수정 시 클라우드·출제 양쪽 육안 확인 필수.
// ============================================================================

import React, { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import {
  Printer,
  FileDown,
  Trash2,
  Wand2,
  AlignJustify,
  Columns2,
  BarChart3,
  Minus,
  Plus,
  Save,
  ChevronDown,
  X,
} from 'lucide-react';
import { trackBatchSolution } from '@/components/BatchSolutionNotifier';
import type { InterpretedFigure } from '@/types/ocr';
import { MixedContentRenderer, stripOrphanTabular } from '@/components/shared/MixedContentRenderer';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { cleanLatexContent, cleanChoiceText, injectSubQuestionPoints } from '@/lib/utils/clean-latex';
import { FigureRenderer } from '@/components/shared/FigureRenderer';
import { ExamProblemRenderer } from '@/components/shared/ExamProblemRenderer';
import { ExamPaperHeader } from '@/components/exam/ExamPaperHeader';
import { EditableExamHeader, HEADER_THEMES, HeaderDesignGallery } from '@/components/exam/EditableExamHeader';
import { DEFAULT_EXAM_META, type ExamMeta } from '@/config/exam-templates';

/** 해설에서 [선택지 검증] 섹션 제거 (기존 DB 데이터 호환) — 페이지에서 함께 이동 */
function stripChoiceAnalysis(s: string): string {
  if (!s) return s;
  return s.replace(/\[선택지 검증\][\s\S]*?(?=\n\[|∴|💡|$)/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

export interface ProblemData {
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

// ★ 인쇄 상하 여백 — 시중 시험지 표준 ~20mm(76px @96dpi). 모듈 레벨이라 ExamPaperView·
//   SolutionView 등 모든 컴포넌트에서 참조 가능(컴포넌트별 PAGE_PAD 와 달리 스코프 안전).
//   좌우 여백은 각 컴포넌트의 PAGE_PAD 유지. CONTENT_H 가 이 값을 반영해 페이지 분할 → 하단 잘림 없음.
const PRINT_PAD_Y = 76; // ~20mm

// ============================================================================
// 한글(.hwpx) 헤더 구조 갤러리 — 미리보기 카드 모달 (수학비서 '기본틀' 선택 대응)
//   미리보기는 각 구조를 CSS 로 그린 축소판 (실제 한글 렌더 아님 — 구조 감만 전달).
// ============================================================================
export const HWPX_HEADER_STYLES: Array<{ id: string; label: string; desc: string }> = [
  { id: 'editorial', label: '에디토리얼', desc: '메타 → 큰 제목 → 학년 → 이름·점수줄' },
  { id: 'classic', label: '클래식 표', desc: '학원/학교·시험명·과목… 격자 표' },
  { id: 'boxed', label: '박스형', desc: '좌 제목 블록 + 우 회색 정보칸' },
  { id: 'mock', label: '모의고사형', desc: '수능지 — 가운데 과목명 + 굵은 밑줄' },
  { id: 'band', label: '밴드형', desc: '회색 타이틀 밴드 + 컬러 포인트' },
];

function HwpxHeaderPreview({ id, accent }: { id: string; accent: string }) {
  // 공통 축소판 캔버스 (흰 종이 위 회색/검정 블록)
  const bar = (w: string, h = 5, bg = '#cbd5e1', extra?: React.CSSProperties) => (
    <div style={{ width: w, height: h, background: bg, borderRadius: 1, ...extra }} />
  );
  const wrap = (children: React.ReactNode) => (
    <div style={{ width: '100%', height: 84, background: '#fff', borderRadius: 4, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden' }}>
      {children}
    </div>
  );
  if (id === 'classic') {
    return wrap(
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, marginTop: 6 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ height: 16, background: i % 2 === 0 ? '#e2e8f0' : '#fff', border: '1px solid #94a3b8' }} />
        ))}
      </div>,
    );
  }
  if (id === 'boxed') {
    return wrap(
      <div style={{ display: 'flex', gap: 6, marginTop: 4, border: '1px solid #94a3b8', padding: 5, height: 56 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'center' }}>
          {bar('40%', 4)}{bar('80%', 9, '#334155')}{bar('30%', 4)}
        </div>
        <div style={{ width: 56, background: '#e2e8f0', border: '1px solid #94a3b8', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
          {bar('70%', 4, '#475569')}{bar('80%', 3)}{bar('80%', 3)}
        </div>
      </div>,
    );
  }
  if (id === 'mock') {
    return wrap(
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, marginTop: 3 }}>
        {bar('34%', 4)}
        {bar('56%', 11, '#1e293b')}
        {bar('44%', 4)}
        <div style={{ width: '100%', height: 3, background: '#111', marginTop: 3 }} />
        <div style={{ alignSelf: 'flex-end' }}>{bar('90px', 4)}</div>
      </div>,
    );
  }
  if (id === 'band') {
    return wrap(
      <>
        <div style={{ display: 'flex', height: 34, marginTop: 4 }}>
          <div style={{ width: 12, background: accent }} />
          <div style={{ flex: 1, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {bar('55%', 9, '#334155')}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          {bar('34%', 4)}{bar('26%', 4)}
        </div>
      </>,
    );
  }
  // editorial (기본)
  return wrap(
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>{bar('30%', 4)}{bar('16%', 4)}</div>
      {bar('62%', 10, '#1e293b')}
      {bar('14%', 4)}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 2 }}>
        {bar('30%', 4)}{bar('22%', 4)}
      </div>
      <div style={{ width: '100%', height: 2, background: accent }} />
    </>,
  );
}

function HwpxHeaderGalleryModal({
  active,
  accentColor,
  onSelect,
  onClose,
}: {
  active: string;
  accentColor: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const accent = accentColor || '#334155';
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-[680px] max-w-[92vw] rounded-xl border border-zinc-600 bg-zinc-800 shadow-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-bold text-white">한글(.hwpx) 헤더 구조</div>
            <div className="text-xs text-zinc-400 mt-0.5">한글 다운로드에 적용됩니다 · 미리보기는 구조 참고용 축소판</div>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white text-sm px-2">✕</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {HWPX_HEADER_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={`rounded-lg border p-2 text-left transition-colors ${
                active === s.id ? 'border-sky-400 ring-2 ring-sky-400/40 bg-sky-500/10' : 'border-zinc-600 hover:border-zinc-400 bg-zinc-700/40'
              }`}
            >
              <HwpxHeaderPreview id={s.id} accent={accent} />
              <div className="mt-2 text-sm font-semibold text-white">{s.label}</div>
              <div className="text-[11px] text-zinc-400 leading-snug">{s.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Exam Paper View (시험지)
// ============================================================================

export function ExamPaperView({
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
  // ★ 미리보기 줌 (0.5~1.5) — .exam-page 부모 래퍼에만 적용, 인쇄물(클론)엔 영향 없음
  const [zoom, setZoom] = useState(1);

  // ★ 헤더 상단 강조색 (우리식 색 테마) — null=없음(기본). 매쓰홀릭 곡선/특정디자인 카피 X, 깔끔한 색 띠만.
  const [headerColor, setHeaderColor] = useState<string | null>(null);
  const [headerTheme, setHeaderTheme] = useState<string>('none'); // 헤더 꾸밈 테마 (none/line/double/wave/corner/dots)
  const [showDesignGallery, setShowDesignGallery] = useState(false); // 헤더 디자인 갤러리 모달
  const HEADER_COLORS: Array<{ c: string | null; label: string }> = [
    { c: null, label: '없음' },
    { c: '#4f46e5', label: '인디고' },
    { c: '#0891b2', label: '시안' },
    { c: '#059669', label: '에메랄드' },
    { c: '#e11d48', label: '로즈' },
    { c: '#d97706', label: '앰버' },
    { c: '#334155', label: '슬레이트' },
  ];

  // ★ 출력 설정 저장/불러오기 ("내 설정") — 단·간격·여백·배열을 이름 붙여 저장 후 원클릭 적용.
  //   브라우저 localStorage 사용 (서버/스키마 변경 없음). 매쓰홀릭 "저장한 템플릿" 등가.
  type PrintPreset = { name: string; columns: 1 | 2; gap: number; pagePad: number; perPagePreset: number | null; headerColor?: string | null; headerTheme?: string | null };
  const [printPresets, setPrintPresets] = useState<PrintPreset[]>([]);
  useEffect(() => {
    try { const raw = localStorage.getItem('msb_print_presets'); if (raw) setPrintPresets(JSON.parse(raw)); } catch { /* ignore */ }
  }, []);
  const persistPresets = (next: PrintPreset[]) => {
    setPrintPresets(next);
    try { localStorage.setItem('msb_print_presets', JSON.stringify(next)); } catch { /* ignore */ }
  };
  const saveCurrentPreset = () => {
    const name = (prompt('이 출력 설정의 이름을 입력하세요 (예: 내신 2단)') || '').trim();
    if (!name) return;
    persistPresets([...printPresets.filter((p) => p.name !== name), { name, columns, gap, pagePad, perPagePreset, headerColor, headerTheme }]);
  };
  const applyPreset = (name: string) => {
    const p = printPresets.find((x) => x.name === name);
    if (!p) return;
    setColumns(p.columns); setGap(p.gap); setPagePad(p.pagePad); setPerPagePreset(p.perPagePreset);
    setHeaderColor(p.headerColor ?? null);
    setHeaderTheme(p.headerTheme ?? 'none');
  };

  const [showPrintMenu, setShowPrintMenu] = useState(false);
  // ★ 측정 완료 전 인쇄 요청 보류 — 미측정 시 폴백(블라인드 10문제) 페이지가 인쇄돼 잘림 차단 (#2 견고화)
  const [pendingPrint, setPendingPrint] = useState(false);
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

  // ★ 프리셋 풀이공간 — "문제 크기에 따라 적당히 + 칸 꽉 채움" (per-problem, per-column).
  //   각 칸(flex 독립칼럼)의 실제 내용합 기준 남는 공간을, 문제별 자연 풀이공간(getWritingSpace) 비율로 분배.
  //   → 큰 문제(서답형)는 큰 칸, 작은 문제(짧은 객관식)는 작은 칸. 칸은 maxH 까지 채움(밑 빈공간 최소).
  //   안전: Σ분배 ≤ leftover → 칸높이 ≤ maxH → 넘침/잘림 없음. (rowSum 과대계산으로 덜 채워지던 문제 해결)
  const presetAnswerByProblem = useMemo(() => {
    if (!perPagePreset || !measured || problemHeights.length === 0) return null;
    const map = new Map<string, number>();
    let g = 0;
    pages.forEach((pageProblems, pageIdx) => {
      const maxH = pageIdx === 0 ? FIRST_CONTENT_H : CONTENT_H;
      const half = columns === 2 ? Math.max(1, Math.ceil(pageProblems.length / 2)) : pageProblems.length;
      const colRanges: Array<[number, number]> = columns === 2
        ? [[0, half], [half, pageProblems.length]]
        : [[0, pageProblems.length]];
      for (const [s, e] of colRanges) {
        if (e <= s) continue;
        let contentSum = 0, wSum = 0;
        const items: Array<{ id: string; w: number }> = [];
        for (let i = s; i < e; i++) {
          const p = pageProblems[i];
          const w = getWritingSpace(p);
          contentSum += Math.max(0, (problemHeights[g + i] ?? 0) - w);
          wSum += w;
          items.push({ id: p.id, w });
        }
        const leftover = Math.max(0, maxH - contentSum);
        for (const it of items) {
          const share = wSum > 0 ? leftover * (it.w / wSum) : leftover / items.length;
          map.set(it.id, Math.max(24, Math.floor(share)));
        }
      }
      g += pageProblems.length;
    });
    return map;
  }, [perPagePreset, measured, problemHeights, pages, columns, FIRST_CONTENT_H, CONTENT_H, getWritingSpace]);

  // 카드 아래 풀이공간 — 프리셋이면 자동(페이지 채움·잘림방지), 아니면 고정.
  const getAnswerSpace = (problem: ProblemData, pageIdx: number) => {
    // ★ 프리셋: 문제 크기별 분배값(칸 꽉 채움 + 크기비례). 없으면 자연 풀이공간.
    if (presetAnswerByProblem) {
      return presetAnswerByProblem.get(problem.id) ?? getWritingSpace(problem);
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
  // 실제 인쇄 실행 (가드 통과 후) — .exam-page 복제 → window.print. 측정 여부 검사 안 함(가드는 handlePrint/타임아웃에서).
  const doPrint = useCallback(() => {
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

  const handlePrint = useCallback(() => {
    setShowPrintMenu(false);
    // ★ 측정 미완료 시 인쇄 보류 — 폴백(블라인드 10문제) 분할이라 키 큰 문제 잘림. 측정 완료/타임아웃 시 자동 재개.
    if (problems.length > 0 && !measured) {
      setPendingPrint(true);
      return;
    }
    doPrint();
  }, [measured, problems.length, doPrint]);

  // ★ 보류된 인쇄 재개 — 측정 완료되면 정상 분할 페이지로 인쇄 (#2 견고화)
  useEffect(() => {
    if (pendingPrint && measured) {
      setPendingPrint(false);
      doPrint();
    }
  }, [pendingPrint, measured, doPrint]);

  // ★ 안전 타임아웃 — 측정이 지연/실패해도 인쇄가 영영 막히지 않게 (최대 4s 후 그대로 인쇄). hang 차단.
  useEffect(() => {
    if (!pendingPrint) return;
    const t = setTimeout(() => { setPendingPrint(false); doPrint(); }, 4000);
    return () => clearTimeout(t);
  }, [pendingPrint, doPrint]);

  // ★ 한글(.hwpx) 다운로드 — 현재 출력 설정(단수·간격·N문제 배열·섹션)을 그대로 전달.
  //   exam-management handleDownloadHwpx 와 동일 패턴 (서버 export-hwp 가 DB 조회·생성).
  const [isDownloadingHwpx, setIsDownloadingHwpx] = useState(false);
  // 한글 헤더 구조 선택 (수학비서 기본틀 선택 대응) — localStorage 유지
  const [hwpxHeaderStyle, setHwpxHeaderStyle] = useState<string>('editorial');
  useEffect(() => {
    try { const v = localStorage.getItem('msb_hwpx_header_style'); if (v) setHwpxHeaderStyle(v); } catch { /* ignore */ }
  }, []);
  const pickHwpxHeaderStyle = (v: string) => {
    setHwpxHeaderStyle(v);
    try { localStorage.setItem('msb_hwpx_header_style', v); } catch { /* ignore */ }
  };
  const [showHwpxHeaderModal, setShowHwpxHeaderModal] = useState(false);
  const handleDownloadHwpx = useCallback(async () => {
    if (!examId || isDownloadingHwpx) return;
    setIsDownloadingHwpx(true);
    try {
      const perPageQ = perPagePreset ? `&perPage=${perPagePreset}` : '';
      // ★ 자동 배열(프리셋 없음): 미리보기의 측정 기반 페이지 분할 결과를 그대로 전달 —
      //   한글 자체 reflow 에 맡기면 미리보기와 페이지 구성이 달라짐 (2026-07-18).
      const pageCountsQ = !perPagePreset && measured && pages.length > 0
        ? `&pageCounts=${pages.map((pg) => pg.length).join(',')}`
        : '';
      // 헤더 디자인 갤러리 강조색·테마 → 한글 헤더에도 반영 (네이티브 3종 매핑)
      const decoQ = (headerColor ? `&headerColor=${encodeURIComponent(headerColor)}` : '')
        + (headerTheme && headerTheme !== 'none' ? `&headerTheme=${encodeURIComponent(headerTheme)}` : '')
        + (hwpxHeaderStyle && hwpxHeaderStyle !== 'editorial' ? `&headerStyle=${encodeURIComponent(hwpxHeaderStyle)}` : '');
      const res = await fetch(
        `/api/exams/${examId}/export-hwp?withAnswer=${printSections.answer}&withSolutions=${printSections.solution}&columns=${columns}&gap=${gap}${perPageQ}${pageCountsQ}${decoQ}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'HWP 생성 실패');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${examTitle || '시험지'}.hwpx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setShowPrintMenu(false);
      // ★ 검증 루프 — 잔재 경고 표시 (파일은 정상 다운로드됨)
      const warnHeader = res.headers.get('X-Hwpx-Warnings');
      if (warnHeader) {
        const summary = decodeURIComponent(warnHeader);
        console.warn('[한글 다운로드] 변환 경고:', summary);
        alert(`한글 파일은 다운로드됐지만 일부 변환 경고가 있습니다 (${summary}).\n해당 부분이 한글에서 원문 그대로 보일 수 있어요 — 개발팀 로그에 기록됐습니다.`);
      }
    } catch (error) {
      console.error('HWPX download error:', error);
      alert(`HWP 생성 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsDownloadingHwpx(false);
    }
  }, [examId, isDownloadingHwpx, perPagePreset, measured, pages, printSections.answer, printSections.solution, columns, gap, examTitle, headerColor, headerTheme, hwpxHeaderStyle]);

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
      {/* ★ flex-wrap — 좁은 컨테이너(출제 페이지 등)에서 우측 버튼(출력·한글)이 잘려 안 보이던 문제 (2026-07-18) */}
      <div className="exam-controls flex flex-wrap items-center justify-between gap-y-2 border-b border-subtle px-5 py-2 flex-shrink-0 bg-surface-raised/50">
        <div className="flex flex-wrap items-center gap-3 gap-y-2">
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
          {/* ★ 미리보기 줌 (인쇄물엔 영향 없음 — 미리보기만 확대/축소) */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-content-tertiary">줌</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
              className="px-1.5 py-0.5 rounded border text-xs text-content-tertiary hover:text-content-primary"
              title="미리보기 축소"
            >−</button>
            <span className="text-xs text-content-tertiary w-9 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))}
              className="px-1.5 py-0.5 rounded border text-xs text-content-tertiary hover:text-content-primary"
              title="미리보기 확대"
            >+</button>
          </div>
          {/* ★ 출력 설정 저장/불러오기 ("내 설정") */}
          <div className="flex items-center gap-1">
            <select
              value=""
              onChange={(e) => { if (e.target.value) applyPreset(e.target.value); }}
              className="rounded border bg-surface-raised text-content-secondary text-xs px-1.5 py-1 cursor-pointer"
              title="저장한 출력 설정 불러오기"
            >
              <option value="">내 설정 불러오기</option>
              {printPresets.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
            <button
              type="button"
              onClick={saveCurrentPreset}
              className="px-2 py-1 rounded border text-xs text-content-tertiary hover:text-content-primary"
              title="현재 출력 설정을 이름 붙여 저장"
            >설정 저장</button>
          </div>
          {/* ★ PDF(화면 인쇄) 헤더 디자인 갤러리 — 한글 헤더 갤러리와 구분되게 라벨 명시 */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-content-tertiary">PDF 디자인</span>
            <button
              type="button"
              onClick={() => setShowDesignGallery(true)}
              className="flex items-center gap-1 rounded border bg-surface-raised text-content-secondary text-xs px-2 py-1 cursor-pointer hover:text-content-primary transition-colors"
              title="헤더 디자인 갤러리"
            >
              {HEADER_THEMES.find((t) => t.id === headerTheme)?.label ?? '없음'}
              <span className="text-[9px] opacity-70">▾</span>
            </button>
          </div>
          {showDesignGallery && (
            <HeaderDesignGallery
              activeTheme={headerTheme}
              onSelect={(theme, color, layout) => {
                setHeaderTheme(theme);
                setHeaderColor(color);
                if (onTemplateChange) onTemplateChange(layout, examMeta);
              }}
              onClose={() => setShowDesignGallery(false)}
            />
          )}
          {/* ★ 헤더 강조색 (테마 색) */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-content-tertiary">색</span>
            {HEADER_COLORS.map(({ c, label }) => (
              <button
                key={c ?? 'none'}
                type="button"
                onClick={() => setHeaderColor(c)}
                title={label}
                className={`w-4 h-4 rounded-full border border-zinc-500 flex items-center justify-center ${headerColor === c ? 'ring-2 ring-cyan-400' : ''}`}
                style={c ? { background: c } : { background: 'transparent' }}
              >
                {c === null && <span className="text-[8px] text-content-tertiary leading-none">✕</span>}
              </button>
            ))}
          </div>
          {/* 프리셋 모드에서는 자동 간격 표시 */}
          {perPagePreset && pageAutoGaps && (
            <span className="text-xs text-emerald-400/70">자동 배치</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 gap-y-2">
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
          {/* 한글 헤더 갤러리 — 미리보기 카드 모달 (수학비서 '기본틀' 대응, 한글 다운로드에만 적용) */}
          <button
            type="button"
            onClick={() => setShowHwpxHeaderModal(true)}
            className="flex items-center gap-1 rounded-lg border border-sky-500/30 bg-surface-raised px-2 py-1.5 text-sm text-sky-300 hover:bg-sky-500/10 transition-colors"
            title="한글(.hwpx) 헤더 구조 선택 — 미리보기에서 고르기"
          >
            <span className="text-xs text-content-tertiary">한글 헤더</span>
            {HWPX_HEADER_STYLES.find((s) => s.id === hwpxHeaderStyle)?.label ?? '에디토리얼'}
            <span className="text-[9px] opacity-70">▾</span>
          </button>
          {showHwpxHeaderModal && (
            <HwpxHeaderGalleryModal
              active={hwpxHeaderStyle}
              accentColor={headerColor}
              onSelect={(id) => { pickHwpxHeaderStyle(id); setShowHwpxHeaderModal(false); }}
              onClose={() => setShowHwpxHeaderModal(false)}
            />
          )}
          {/* ★ 한글 다운로드 — 드롭다운 속에선 안 보인다는 피드백으로 툴바 독립 버튼으로 승격 (2026-07-18) */}
          <button
            type="button"
            onClick={handleDownloadHwpx}
            disabled={isDownloadingHwpx}
            className="flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-sm font-medium text-sky-300 hover:bg-sky-500/20 disabled:opacity-50 transition-colors"
            title="현재 단수·간격·N문제 배열 설정 그대로 편집 가능한 한글 파일 생성"
          >
            <FileDown className="h-4 w-4" />
            {isDownloadingHwpx ? '한글 생성 중…' : '한글'}
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
          fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
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
        {/* ★ 미리보기 줌 래퍼 — .exam-page 의 부모(인쇄 시 클론 제외)라 인쇄물엔 영향 없음 */}
        <div style={{ zoom }} className="flex flex-col items-center w-full">
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
              fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
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
                  accentColor={headerColor}
                  headerTheme={headerTheme}
                />
              </div>
            )}

            {/* 문제 영역 — 2단은 CSS Grid + auto-flow:column (열 우선 세로 읽기 + 줄 정렬):
                좌=앞부분(1·2·3), 우=뒤부분(4·5·6) 이면서 같은 줄(1·4, 2·5...)이 같은 높이에 정렬.
                gridTemplateRows = ceil(n/2) 행. (측정 colFlowTotal 과 동일 짝이라 잘림 없음) */}
            {columns === 2 ? (
              // ★ 2단 = flex 독립 칼럼 (좌=앞 절반, 우=뒤 절반)으로 각 칸을 빈틈없이 채움. (매쓰홀릭 방식)
              //   기존 grid 줄맞춤(gridAutoFlow:column + 행정렬)은 한쪽이 길면 반대쪽에 빈칸이 생겨
              //   "정렬 안 됨"으로 보였음. flex 독립칼럼이면 좌·우가 서로 줄맞춤 안 하고 자연스럽게 채워짐.
              //   각 칸 폭 = (전체 - COLUMN_GAP)/2 = measureWidth 와 일치 → 측정·분할 기하 그대로(잘림 무증가).
              //   읽기 순서(열 우선: 좌 위→아래, 우 위→아래)도 동일.
              <div style={{ display: 'flex', gap: `${COLUMN_GAP}px`, alignItems: 'flex-start' }}>
                {(() => {
                  const half = Math.max(1, Math.ceil(pageProblems.length / 2));
                  return [pageProblems.slice(0, half), pageProblems.slice(half)].map((colProbs, ci) => (
                    <div key={ci} style={{ flex: 1, minWidth: 0 }}>
                      {colProbs.map((problem) => (
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
                  ));
                })()}
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

export function QuickAnswerView({
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

export function SolutionView({
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
          fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
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
              fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
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
