'use client';

// ============================================================================
// /dashboard/exam-analysis/[examId]/students/[studentId]
//
// 학생 1인 시험 1회 성취도 리포트 (A4 2page, 인쇄용).
// 디자인 원본: 학습분석리포트(이사님 작업).
//
// 페이지 구성:
//   Page 1 — 종합 성취도 (점수카드 + 학습 종합 분석 + 단원/난이도/유형 차트)
//   Page 2 — 문항별 상세 정오표 (2열 카드 그리드)
//
// 이 페이지는 대시보드의 다크 테마와 분리된 라이트 테마 (report.css 의 .student-report-root)
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Printer,
  Share2,
  Check,
  Loader2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  Target,
  BarChart3,
  Layers,
  PieChart as PieIcon,
  CheckSquare,
  Sparkles,
} from 'lucide-react';
import './report.css';
import { StudentExamReportDark } from '@/components/exam-report/StudentExamReportDark';
import { Panel } from '@/components/diagnostics/report-primitives';
import { useSmartBack } from '@/lib/navigation/useSmartBack';

// ============================================================================
// Types — API 응답 그대로
// ============================================================================

interface ResultRow {
  qNum: number;
  majorUnit: string;
  minorUnit: string;
  subUnit: string;
  fineUnit: string;
  cognitiveDomain: string;
  type: string;
  difficulty: number; // 1~10
  fullScore: number;
  earnedScore: number;
  status: 'O' | '△' | 'X';
  isCorrect: boolean;
  concept: string;
  typeCode: string | null;
}

interface FineUnitStat {
  name: string;
  fullPath: string;
  total: number;
  correct: number;
  pct: number;
}

interface CognitiveStat {
  code: string;
  total: number;
  correct: number;
  pct: number;
}

interface AiCommentJson {
  strong: string;
  weak: string;
  method: string;
  generatedAt: string;
  model: string;
}

interface TeacherCommentJson {
  text: string;
  updatedBy: string;
  updatedAt: string;
}

interface UnitTrendRow {
  name: string;
  prevCorrect: number;
  prevTotal: number;
  prevPct: number;
  currCorrect: number;
  currTotal: number;
  currPct: number;
  delta: number;
}
interface UnitTrend {
  prevExamId: string;
  prevExamTitle: string;
  prevConductedAt: string | null;
  units: UnitTrendRow[];
}

interface ReportData {
  student: {
    id: string;
    name: string;
    grade: number | null;
    classLabel: string | null;
  };
  exam: { id: string; title: string };
  examType?: string | null;
  isDiagnostic?: boolean;
  totalEarned: number;
  totalPossible: number;
  scorePct: number;
  results: ResultRow[];
  fineUnitStats?: FineUnitStat[];
  cognitiveDomainStats?: CognitiveStat[];
  classPercentile?: number | null;
  classRank?: number | null;
  classSize?: number;
  classAvg?: number | null;
  unitTrend?: UnitTrend | null;
  aiComment?: AiCommentJson | null;
  teacherComment?: TeacherCommentJson | null;
  reportStyle?: 'legacy' | 'unified'; // 센터별 스타일 (unified=share/exam warm 톤)
  message?: string;
}

const COG_LABEL: Record<string, string> = {
  CALCULATION: '계산',
  UNDERSTANDING: '이해',
  INFERENCE: '추론',
  PROBLEM_SOLVING: '문제해결',
};
const COG_ORDER = ['CALCULATION', 'UNDERSTANDING', 'INFERENCE', 'PROBLEM_SOLVING'];
const COG_COLOR: Record<string, string> = {
  CALCULATION: '#0ea5e9',
  UNDERSTANDING: '#10b981',
  INFERENCE: '#8b5cf6',
  PROBLEM_SOLVING: '#f97316',
};

// ============================================================================
// 단원 정규화 — typeCode 매핑에서 빠진 경우 fallback (CEO HTML 의 cleanMajorUnit 포트)
// ============================================================================

function cleanMajorUnit(s: string): string {
  if (!s) return '미분류';
  let str = String(s);
  if (str.includes('>')) str = str.split('>')[0];
  str = str.replace(/[\(\[\{<].*?[\)\]\}>]/g, '');
  str = str.replace(/[0-9\-\:\>_]/g, '');
  str = str.trim();
  if (str.includes('미분류')) return '미분류';
  if (
    str.includes('수와 연산') ||
    str.includes('유리수') ||
    str.includes('소수') ||
    str.includes('제곱근') ||
    str.includes('실수') ||
    str.includes('소인수분해') ||
    str.includes('정수')
  )
    return '수와 연산';
  if (
    str.includes('문자와 식') ||
    str.includes('방정식') ||
    str.includes('부등식') ||
    str.includes('다항식') ||
    str.includes('인수분해')
  )
    return '문자와 식';
  if (str.includes('함수') || str.includes('그래프')) return '함수';
  if (
    str.includes('기하') ||
    str.includes('도형') ||
    str.includes('삼각형') ||
    str.includes('사각형') ||
    str.includes('피타고라스') ||
    str.includes('삼각비') ||
    str.includes('원의 성질') ||
    str.includes('원과 직선')
  )
    return '기하';
  if (
    str.includes('확률') ||
    str.includes('통계') ||
    str.includes('경우의 수') ||
    str.includes('대푯값') ||
    str.includes('산포도') ||
    str.includes('자료')
  )
    return '확률과 통계';
  return str || '기타 단원';
}

// ============================================================================
// AI 코멘트 생성 — CEO HTML L360 generateAIComment 포트
// ============================================================================

const KICE_GUIDELINES: Record<string, string> = {
  '수와 연산':
    '실수의 체계와 성질을 명확히 이해하고, 빠르고 정확한 연산을 요구합니다.',
  '문자와 식':
    '주어진 조건을 수식으로 정확히 표현하고, 다항식의 전개와 인수분해, 그리고 방정식 및 부등식을 논리적으로 해결하는 능력이 필요합니다.',
  함수: '함수의 정의를 바탕으로 그래프를 그리고, x절편, y절편, 기울기, 꼭짓점 등의 기하학적 의미를 파악하는 것이 중요합니다.',
  기하: '도형의 성질(합동, 닮음, 피타고라스 정리, 삼각비, 원 등)을 이용하여 보조선을 긋고 길이나 넓이를 구하는 공간 지각력이 요구됩니다.',
  '확률과 통계':
    '경우의 수를 빠짐없이 구하고, 확률의 기본 성질 및 대푯값과 산포도의 의미를 바탕으로 실생활 상황을 해석하는 사고방식이 필요합니다.',
};

interface Comments {
  strong: string;
  weak: string;
  method: string;
}

function generateComments(
  unitData: { name: string; total: number; correct: number }[],
  scorePct: number
): Comments {
  if (unitData.length === 0) {
    return { strong: '-', weak: '-', method: '데이터가 부족합니다.' };
  }
  const unitsWithPct = unitData
    .map((u) => ({ name: u.name, pct: (u.correct / u.total) * 100 }))
    .sort((a, b) => b.pct - a.pct);

  let strongText = '-';
  let weakText = '-';
  let primaryWeakUnit = '-';

  if (unitsWithPct.length > 0) {
    const bestScore = unitsWithPct[0].pct;
    const strongUnits = unitsWithPct
      .filter((u) => u.pct === bestScore || u.pct >= 90)
      .slice(0, 2);
    strongText = strongUnits.map((u) => u.name).join(', ');

    const weakCandidates = unitsWithPct
      .filter((u) => u.pct <= 70)
      .sort((a, b) => a.pct - b.pct);
    if (weakCandidates.length > 0) {
      weakText = weakCandidates
        .slice(0, 2)
        .map((u) => u.name)
        .join(', ');
      primaryWeakUnit = weakCandidates[0].name;
    } else {
      const nextWeak = unitsWithPct
        .filter((u) => u.pct < 100)
        .sort((a, b) => a.pct - b.pct);
      if (nextWeak.length > 0) {
        weakText = '전반적으로 양호함';
        primaryWeakUnit = nextWeak[0].name;
      } else {
        weakText = '취약 단원 없음 (완벽함!)';
        primaryWeakUnit = unitsWithPct[unitsWithPct.length - 1]?.name || '-';
      }
    }
  }

  const matched =
    KICE_GUIDELINES[primaryWeakUnit] ||
    '전반적인 수학 기본 개념을 탄탄히 다지는 것이 중요합니다.';

  let method = '';
  if (scorePct >= 100) {
    method =
      '모든 단원의 개념을 완벽하게 이해하고 있습니다! 🎉 현재의 훌륭한 학습 패턴을 유지하며, 심화 문제나 선행 학습을 가볍게 시작해 보는 것을 적극 추천합니다.';
    weakText = '취약 단원 없음 (완벽함!)';
  } else if (scorePct >= 90) {
    if (weakText === '취약 단원 없음 (완벽함!)' || weakText === '전반적으로 양호함') {
      method =
        '전체적인 개념 이해도가 매우 우수합니다. 간혹 실수하는 문제나 고난도 심화 문제를 집중적으로 풀어보며 100점을 향한 훈련을 진행하세요.';
      weakText = '전반적으로 우수함';
    } else {
      method = `전체적인 개념 이해도가 매우 우수합니다. 간혹 실수하는 문제나 고난도 심화 문제를 집중적으로 풀어보며 100점을 향한 훈련을 진행하세요.\n\n📌 [KICE 평가원 기준 학습 조언]\n${matched}`;
    }
  } else if (scorePct >= 70) {
    if (weakText === '취약 단원 없음 (완벽함!)' || weakText === '전반적으로 양호함') {
      method =
        '기본적인 개념은 잘 잡혀 있습니다. 틀린 문제들의 오답 노트를 작성하고 기본 예제를 다시 한 번 풀어보며 실수를 줄여보세요.';
      weakText = '전반적으로 양호함';
    } else {
      method = `기본적인 개념은 잘 잡혀 있으나 특정 단원([${weakText}])에서 오답이 발생하고 있습니다.\n\n📌 [KICE 평가원 기준 학습 조언]\n${matched}\n\n위 지침을 바탕으로 오답 노트를 작성하며 빈틈을 메워주세요.`;
    }
  } else {
    method = `전반적인 기초 개념 다지기가 우선되어야 합니다. 어려운 문제보다는 교과서 위주의 기본 문제를 반복해서 풀며 원리를 정확히 이해하는 학습이 필요합니다.\n\n📌 [최우선 보완 단원 조언]\n${matched}`;
  }

  return { strong: strongText, weak: weakText, method };
}

// ============================================================================
// 분포 계산
// ============================================================================

interface UnitData {
  name: string;
  total: number;
  correct: number;
}
interface DiffData {
  name: string;
  total: number;
  correct: number;
  color: string;
}
interface TypeStats {
  [type: string]: { total: number; correct: number };
}

function computeStats(results: ResultRow[]): {
  unitData: UnitData[];
  diffData: DiffData[];
  typeStats: TypeStats;
} {
  // 단원별
  const unitMap: Record<string, { total: number; correct: number }> = {};
  for (const r of results) {
    const m = cleanMajorUnit(r.majorUnit);
    if (!unitMap[m]) unitMap[m] = { total: 0, correct: 0 };
    unitMap[m].total++;
    if (r.earnedScore > 0) unitMap[m].correct++;
  }
  const unitData: UnitData[] = Object.entries(unitMap).map(([name, s]) => ({
    name,
    ...s,
  }));

  // 난이도별 (1~10 → 상/중/하)
  const diffMap: Record<string, { total: number; correct: number }> = {
    상: { total: 0, correct: 0 },
    중: { total: 0, correct: 0 },
    하: { total: 0, correct: 0 },
  };
  for (const r of results) {
    let key: '상' | '중' | '하' = '중';
    if (r.difficulty >= 7) key = '상';
    else if (r.difficulty <= 2) key = '하';
    diffMap[key].total++;
    if (r.earnedScore > 0) diffMap[key].correct++;
  }
  const order = ['하', '중', '상'];
  const diffData: DiffData[] = order
    .map((name) => {
      const s = diffMap[name];
      const color =
        name === '상' ? '#f97316' : name === '중' ? '#10b981' : '#fde047';
      return { name, total: s.total, correct: s.correct, color };
    })
    .filter((d) => d.total > 0)
    .sort((a, b) => order.indexOf(b.name) - order.indexOf(a.name));

  // 유형별
  const typeStats: TypeStats = {};
  for (const r of results) {
    const t = r.type || '기타';
    if (!typeStats[t]) typeStats[t] = { total: 0, correct: 0 };
    typeStats[t].total++;
    if (r.earnedScore > 0) typeStats[t].correct++;
  }

  return { unitData, diffData, typeStats };
}

// ============================================================================
// 차트 컴포넌트
// ============================================================================

function HorizontalBarChart({
  data,
  defaultColor = '#4f46e5',
}: {
  data: { name: string; total: number; correct: number; color?: string }[];
  defaultColor?: string;
}) {
  return (
    <div className="flex flex-col gap-4 w-full">
      {data.map((item, i) => {
        const pct =
          item.total === 0 ? 0 : Math.round((item.correct / item.total) * 100);
        const color = item.color || defaultColor;
        const isLight = item.name === '하';
        return (
          <div key={i} className="flex flex-col gap-1.5 w-full">
            <div className="flex justify-between items-end w-full">
              <span className="text-[14px] font-bold text-slate-700 leading-tight flex-1 pr-2">
                {item.name}
              </span>
              <span className="text-xs text-slate-400 font-bold shrink-0">
                {item.correct}/{item.total}
              </span>
            </div>
            <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex relative shadow-inner">
              <div
                className="h-full rounded-full flex items-center justify-end px-2"
                style={{
                  width: `${pct}%`,
                  backgroundColor: color,
                  transition: 'width 1s',
                }}
              >
                {pct > 15 && (
                  <span
                    className={`text-[10px] font-bold ${
                      isLight ? 'text-slate-700' : 'text-white'
                    }`}
                  >
                    {pct}%
                  </span>
                )}
              </div>
              {pct <= 15 && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-bold">
                  {pct}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({
  data,
  title,
}: {
  data: { name: string; value: number; color: string }[];
  title: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;
  let cumulative = 0;
  const pctTop = Math.round((data[0]?.value / total) * 100) || 0;
  return (
    <div className="flex flex-col items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex-1 min-w-[140px] max-w-[200px]">
      <h4 className="text-[13px] font-black text-slate-700 mb-3 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200 w-full text-center truncate">
        {title}
      </h4>
      <div className="relative flex items-center justify-center w-full">
        <svg
          viewBox="-1.2 -1.2 2.4 2.4"
          className="w-full h-full -rotate-90 drop-shadow-sm max-w-[90px] max-h-[90px]"
        >
          {data.map((slice, i) => {
            const pct = slice.value / total;
            if (pct === 0) return null;
            const startX = Math.cos(2 * Math.PI * cumulative);
            const startY = Math.sin(2 * Math.PI * cumulative);
            cumulative += pct;
            const endX = Math.cos(2 * Math.PI * cumulative);
            const endY = Math.sin(2 * Math.PI * cumulative);
            const largeArc = pct > 0.5 ? 1 : 0;
            const path =
              pct === 1
                ? `M 1 0 A 1 1 0 1 1 -1 0 A 1 1 0 1 1 1 0`
                : `M ${startX} ${startY} A 1 1 0 ${largeArc} 1 ${endX} ${endY} L 0 0`;
            return (
              <path
                key={i}
                d={path}
                fill={slice.color}
                stroke="#fff"
                strokeWidth="0.1"
                strokeLinejoin="round"
              />
            );
          })}
          <circle cx="0" cy="0" r="0.65" fill="#fff" />
          <text
            x="0"
            y="0.05"
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-[0.45px] font-black fill-indigo-600"
            style={{ transform: 'rotate(90deg)' }}
          >
            {pctTop}%
          </text>
        </svg>
      </div>
      <div className="flex flex-col gap-1.5 mt-4 w-full px-1">
        {data.map((d, i) => (
          <div
            key={i}
            className="flex items-center justify-between text-xs w-full"
          >
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className="w-2.5 h-2.5 rounded-full shadow-sm"
                style={{ backgroundColor: d.color }}
              />
              <span className="font-bold text-slate-600">{d.name}</span>
            </div>
            <span className="text-slate-500 font-bold shrink-0">{d.value}개</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 정오표 카드 1행
function DetailRowItem({ r }: { r: ResultRow }) {
  const major = cleanMajorUnit(r.majorUnit);

  // 난이도 라벨 (1~10 → 쉬움/보통/어려움)
  let diffLabel: { txt: string; cls: string };
  if (r.difficulty >= 7)
    diffLabel = {
      txt: `어려움 ${r.difficulty}`,
      cls: 'text-rose-600 bg-rose-50 border-rose-100',
    };
  else if (r.difficulty <= 2)
    diffLabel = {
      txt: `쉬움 ${r.difficulty}`,
      cls: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    };
  else
    diffLabel = {
      txt: `보통 ${r.difficulty}`,
      cls: 'text-amber-600 bg-amber-50 border-amber-100',
    };

  const statusBadge =
    r.status === 'O' ? (
      <div className="w-9 h-9 rounded-full border-2 border-emerald-500 text-emerald-500 flex items-center justify-center font-black text-[15px] bg-emerald-50">
        O
      </div>
    ) : r.status === '△' ? (
      <div className="w-9 h-9 rounded-full border-2 border-orange-500 text-orange-500 flex items-center justify-center font-black text-[18px] bg-orange-50 pb-0.5">
        △
      </div>
    ) : (
      <div className="w-9 h-9 rounded-full border-2 border-rose-500 text-rose-500 flex items-center justify-center font-black text-[15px] bg-rose-50">
        X
      </div>
    );

  return (
    <div className="flex items-start justify-between p-3.5 bg-white rounded-xl border border-slate-200 shadow-sm break-inside-avoid">
      <div className="flex items-start gap-3 w-full">
        <div className="mt-0.5 w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-black flex items-center justify-center shrink-0 text-sm shadow-sm border border-slate-200">
          {r.qNum}
        </div>
        <div className="flex flex-col flex-1 min-w-0 pr-2">
          <span className="text-[14px] font-bold text-slate-800 mb-1.5 leading-snug break-words">
            {major}
            <span className="text-slate-400 font-normal text-[12px] inline-block ml-1">
              | {r.minorUnit || '-'}
            </span>
          </span>
          <div className="flex flex-wrap gap-1.5 text-[10px] items-center">
            <span className="bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 font-bold whitespace-nowrap">
              {r.type || '-'}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded font-bold border whitespace-nowrap ${diffLabel.cls}`}
            >
              {diffLabel.txt}
            </span>
            {r.fullScore > 0 && (
              <span className="text-indigo-500 font-bold px-1.5 py-0.5 whitespace-nowrap">
                {r.status === '△'
                  ? `${r.earnedScore}점 / ${r.fullScore}점`
                  : `${r.fullScore}점`}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center justify-center ml-1 mt-0.5">
          {statusBadge}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function StudentReportPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params?.examId as string;
  const studentId = params?.studentId as string;
  const track = params?.track as string | undefined;
  const examAnalysisHref = track
    ? `/${track}/dashboard/exam-analysis/${examId}`
    : `/dashboard/exam-analysis/${examId}`;
  const goBack = useSmartBack(examAnalysisHref);

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI 코멘트 생성/재생성 상태
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // AI 맞춤 생성 설정 (팝오버) — 길이 / 어조 / 강조 포커스
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiLength, setAiLength] = useState<'short' | 'normal' | 'detailed'>('normal');
  const [aiTone, setAiTone] = useState<'warm' | 'concise' | 'professional'>('warm');
  const [aiFocus, setAiFocus] = useState<string[]>([]); // 'unit'|'cognitive'|'method'|'nextexam'

  // 심화 분석(세부유형+인지영역, Page 3) 표시 토글 — 기본 끔, 선택 시에만 노출/인쇄
  const [showDeepAnalysis, setShowDeepAnalysis] = useState(false);
  useEffect(() => {
    try {
      setShowDeepAnalysis(localStorage.getItem('student-report.deepAnalysis') === '1');
    } catch {
      /* localStorage 비활성 환경 무시 */
    }
  }, []);
  const toggleDeepAnalysis = () => {
    setShowDeepAnalysis((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('student-report.deepAnalysis', next ? '1' : '0');
      } catch {
        /* 무시 */
      }
      return next;
    });
  };

  // 강사 코멘트 편집 상태
  const [teacherText, setTeacherText] = useState('');
  const [teacherSaving, setTeacherSaving] = useState(false);
  const [teacherSaved, setTeacherSaved] = useState<string | null>(null);

  // 학부모 공유 링크 상태
  const [shareBusy, setShareBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  // 발급 + 즉시 클립보드 복사 — 세트 리포트(ParentLinkBar)와 동일 원클릭 UX
  const handleShareParent = async () => {
    if (!examId || !studentId || shareBusy) return;
    setShareBusy(true);
    try {
      const r = await fetch(
        `/api/exams/${examId}/students/${studentId}/share`,
        { method: 'POST' }
      );
      const d = await r.json();
      if (!r.ok || !d.token) {
        alert(`공유 링크 발급 실패: ${d.error || r.status}`);
        return;
      }
      const url = `${window.location.origin}/share/student-report/${d.token}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      } catch {
        // 클립보드 차단 시 아래 URL 바에서 수동 복사
        setShareCopied(false);
      }
    } finally {
      setShareBusy(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // 클립보드 권한 없으면 무시 (URL 박스에서 수동 복사 가능)
    }
  };

  const handleRevokeShare = async () => {
    if (!examId || !studentId || shareBusy) return;
    if (!confirm('현재 학부모 공유 링크를 즉시 무효화할까요? 학부모가 더는 접근할 수 없게 됩니다.')) return;
    setShareBusy(true);
    try {
      const r = await fetch(
        `/api/exams/${examId}/students/${studentId}/share`,
        { method: 'DELETE' }
      );
      if (r.ok) {
        setShareUrl(null);
      }
    } finally {
      setShareBusy(false);
    }
  };

  // data 도착 시 강사 코멘트 초기값 동기화
  useEffect(() => {
    setTeacherText(data?.teacherComment?.text ?? '');
  }, [data?.teacherComment?.text]);

  const handleGenerateAi = async (force = false) => {
    if (!examId || !studentId || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    setAiPanelOpen(false);
    try {
      const r = await fetch(
        `/api/exams/${examId}/students/${studentId}/report/ai-comment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // 형식은 그대로 두고 본문 내용만 옵션에 맞춰 생성 (길이/어조/강조 포커스)
          body: JSON.stringify({
            force,
            options: { length: aiLength, tone: aiTone, focus: aiFocus },
          }),
        }
      );
      const d = await r.json();
      if (!r.ok) {
        setAiError(d.error || `HTTP ${r.status}`);
        return;
      }
      // data 의 aiComment 만 갱신 — 점수/제목/레이아웃은 불변, 본문 텍스트만 교체
      setData((prev) => (prev ? { ...prev, aiComment: d.ai_comment } : prev));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  const toggleAiFocus = (key: string) => {
    setAiFocus((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSaveTeacherComment = async () => {
    if (!examId || !studentId || teacherSaving) return;
    setTeacherSaving(true);
    setTeacherSaved(null);
    try {
      const r = await fetch(
        `/api/exams/${examId}/students/${studentId}/report/ai-comment`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacherComment: teacherText }),
        }
      );
      const d = await r.json();
      if (!r.ok) {
        setTeacherSaved(`저장 실패: ${d.error || r.status}`);
        return;
      }
      setData((prev) =>
        prev ? { ...prev, teacherComment: d.teacher_comment } : prev
      );
      setTeacherSaved('저장됨');
      setTimeout(() => setTeacherSaved(null), 2000);
    } catch (e) {
      setTeacherSaved(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTeacherSaving(false);
    }
  };

  // 학생 리포트 페이지 mount 시 body 에 클래스 추가 → 인쇄 시 TopNav/패딩 등 숨김
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.add('student-report-printing');
    return () => {
      document.body.classList.remove('student-report-printing');
    };
  }, []);

  // ★ PDF 저장 파일명 = document.title → "학생이름 시험명 리포트" (전역 'Math×Sci Bank' 방지)
  useEffect(() => {
    if (!data) return;
    const prev = document.title;
    const clean = (s: string) => (s || '').replace(/[\\/:*?"<>|\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
    const name = clean(data.student.name) || '학생';
    const exam = clean(data.exam.title);
    document.title = `${name}${exam ? ` ${exam}` : ''} 리포트`.replace(/\s+/g, ' ').trim();
    return () => { document.title = prev; };
  }, [data]);

  useEffect(() => {
    if (!examId || !studentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(
          `/api/exams/${examId}/students/${studentId}/report`,
          { cache: 'no-store' }
        );
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          if (!cancelled) setError(d.error || `HTTP ${r.status}`);
          return;
        }
        const d = (await r.json()) as ReportData;
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId, studentId]);

  const { unitData, diffData, typeStats, comments } = useMemo(() => {
    if (!data) {
      return {
        unitData: [],
        diffData: [],
        typeStats: {},
        comments: { strong: '-', weak: '-', method: '' },
      };
    }
    const stats = computeStats(data.results);
    return {
      ...stats,
      comments: generateComments(stats.unitData, data.scorePct),
    };
  }, [data]);

  // 시험 제목 정규화 + 학교명 추출 + 표시용 짧은 라벨
  // ★ early return 이전에 위치 — React error #310 (hooks 순서) 회피
  const { periodLabel, schoolBadge } = useMemo(() => {
    const raw = data?.exam.title || '';
    // 학교명 추출 — "중간고사"의 "중간고" 같은 false positive 방지 (한글 경계)
    const sm = raw.match(/(?<![가-힣])([가-힣]{2,4}(?:중|고))(?![가-힣])/);
    const school = sm ? sm[1] : '';
    // 학년·학기 추출 (예: "중2-1", "2-1")
    const gm = raw.match(/(?:중|고)?(\d-\d)/);
    const semester = gm ? gm[1] : '';
    // 시험 종류 추출
    const em = raw.match(/(중간고사|기말고사|중간|기말|모의|성취도(?:평가)?)/);
    const examKind = em ? em[1] : '';
    const shortParts = [semester, examKind].filter(Boolean);
    return {
      periodLabel:
        shortParts.length > 0
          ? shortParts.join(' ')
          : raw.replace(/^기출분석\s*/, '').slice(0, 30),
      schoolBadge: school,
    };
  }, [data?.exam.title]);

  // ============================================================================
  // Render
  // ============================================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-content-tertiary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 p-8">
        <AlertCircle className="w-10 h-10 text-rose-400" />
        <p className="text-content-primary font-bold">리포트를 불러오지 못했습니다</p>
        <p className="text-zinc-400 text-sm">{error || '데이터 없음'}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-bold flex items-center gap-2"
        >
          <ArrowLeft size={16} /> 돌아가기
        </button>
      </div>
    );
  }

  if (data.results.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 p-8">
        <AlertCircle className="w-10 h-10 text-amber-400" />
        <p className="text-content-primary font-bold">채점 기록이 없습니다</p>
        <p className="text-zinc-400 text-sm">{data.message}</p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-bold flex items-center gap-2"
        >
          <ArrowLeft size={16} /> 돌아가기
        </button>
      </div>
    );
  }

  // periodLabel/schoolBadge 는 위에서 useMemo 로 계산됨 (early return 이전, hooks 순서 안전)

  // ── unified 센터: 진단 세트 리포트와 동일한 다크 통일 뷰 ──
  //   legacy(동부산 등)는 아래 기존 A4 라이트 그대로 유지 (무영향).
  if (data.reportStyle === 'unified') {
    const ai = data.aiComment;
    return (
      <div className="report-dark-root min-h-screen bg-zinc-950 text-white">
        <div className="report-print-pad mx-auto max-w-5xl px-4 sm:px-6 py-6">
          {/* 툴바 (인쇄 시 숨김) */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
            <button onClick={goBack} className="inline-flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white">
              <ArrowLeft size={16} /> 시험 분석
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => handleGenerateAi(true)} disabled={aiBusy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-1.5 text-xs font-bold text-content-secondary hover:bg-white/[.06] hover:text-content-primary disabled:opacity-50">
                <Sparkles size={14} /> {aiBusy ? '생성 중…' : 'AI 코멘트 생성'}
              </button>
              <button onClick={handleShareParent} disabled={shareBusy}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-zinc-200 disabled:opacity-50">
                {shareBusy ? <Loader2 size={14} className="animate-spin" /> : shareCopied ? <Check size={14} /> : <Share2 size={14} />}
                {shareBusy ? '발급 중…' : shareCopied ? '복사됨!' : '학부모 링크 복사'}
              </button>
              <button onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-1.5 text-xs font-bold text-content-secondary hover:bg-white/[.06] hover:text-content-primary">
                <Printer size={14} /> 인쇄
              </button>
            </div>
          </div>

          {aiError && <div className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 print:hidden">{aiError}</div>}
          {shareUrl && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs print:hidden">
              <span className="text-zinc-400">학부모 링크</span>
              <input readOnly value={shareUrl} className="min-w-0 flex-1 bg-transparent text-zinc-200 outline-none" />
              <button onClick={handleCopyShareUrl} className="rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-800">{shareCopied ? '복사됨' : '복사'}</button>
              <button onClick={handleRevokeShare} className="rounded border border-rose-500/40 px-2 py-1 text-rose-300 hover:bg-rose-500/10">무효화</button>
            </div>
          )}

          <StudentExamReportDark
            data={data}
            commentSlot={
              <div className="space-y-3">
                <Panel title="AI 학습 가이드" hint={ai ? '' : '상단 “AI 코멘트 생성”으로 생성'}>
                  {ai ? (
                    <div className="space-y-3 text-sm leading-relaxed">
                      <div><span className="text-emerald-300 font-bold">강점 </span><span className="text-zinc-200">{ai.strong}</span></div>
                      <div><span className="text-rose-300 font-bold">보완 </span><span className="text-zinc-200">{ai.weak}</span></div>
                      <div><span className="text-zinc-300 font-bold">학습법 </span><span className="text-zinc-200">{ai.method}</span></div>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">아직 생성된 AI 코멘트가 없습니다.</p>
                  )}
                </Panel>
                <Panel title="강사 한마디" hint={teacherSaved ?? ''}>
                  <textarea value={teacherText} onChange={(e) => setTeacherText(e.target.value)} rows={3}
                    placeholder="학생/학부모에게 전할 한마디를 입력하세요."
                    className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-white/[.25] print:border-transparent print:bg-transparent" />
                  <div className="mt-2 flex justify-end print:hidden">
                    <button onClick={handleSaveTeacherComment} disabled={teacherSaving}
                      className="rounded-lg border border-white/[.08] bg-white/[.04] px-3 py-1.5 text-xs font-bold text-content-secondary hover:bg-white/[.06] hover:text-content-primary disabled:opacity-50">
                      {teacherSaving ? '저장 중…' : '저장'}
                    </button>
                  </div>
                </Panel>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="student-report-root"
    >
      {/* 상단 액션 바 (인쇄 시 숨김) */}
      <div className="student-report-no-print sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[210mm] mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 text-sm font-bold"
          >
            <ArrowLeft size={16} /> 시험 분석으로
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleDeepAnalysis}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors border ${
                showDeepAnalysis
                  ? 'bg-slate-100 border-slate-400 text-slate-800'
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'
              }`}
              title="세부유형·인지영역 심화 분석 페이지 포함 여부 (데이터가 적으면 부정확할 수 있어 기본 꺼짐)"
            >
              <Layers size={16} /> 심화 분석 {showDeepAnalysis ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors"
            >
              <Printer size={16} /> A4 인쇄
            </button>
            <button
              onClick={handleShareParent}
              disabled={shareBusy}
              className="flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
              title="학부모용 공유 링크 발급/조회"
            >
              {shareBusy ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
              학부모 링크
            </button>
          </div>
        </div>

        {shareUrl && (
          <div className="max-w-[210mm] mx-auto px-4 pb-3 -mt-1">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3">
              <span className="shrink-0 text-[12px] font-bold text-slate-600">공유 URL:</span>
              <input
                type="text"
                readOnly
                value={shareUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 min-w-0 bg-white border border-slate-200 rounded-md px-2 py-1 text-[12px] text-slate-800 font-medium focus:outline-none"
              />
              <button
                onClick={handleCopyShareUrl}
                className="shrink-0 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] font-bold px-2.5 py-1.5 rounded-md"
              >
                {shareCopied ? '복사됨' : '복사'}
              </button>
              <button
                onClick={() => window.open(shareUrl, '_blank', 'noopener')}
                className="shrink-0 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-[11px] font-bold px-2.5 py-1.5 rounded-md"
              >
                미리보기
              </button>
              <button
                onClick={handleRevokeShare}
                className="shrink-0 bg-white border border-rose-300 text-rose-600 hover:bg-rose-50 text-[11px] font-bold px-2.5 py-1.5 rounded-md"
              >
                무효화
              </button>
              <button
                onClick={() => setShareUrl(null)}
                className="shrink-0 text-slate-400 hover:text-slate-700"
                title="닫기"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="pt-8">
        {/* ============================================================== */}
        {/* Page 1 — 종합 성취도 */}
        {/* ============================================================== */}
        <div className="a4-page bg-white print-page-1">
          {/* Header */}
          <div className="border-b-4 border-indigo-900 pb-5 mb-8 flex justify-between items-end gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-indigo-600 font-black text-[11px] tracking-widest mb-1 uppercase">
                Achievement Report
              </div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {schoolBadge && (
                  <span className="text-[13px] font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-md whitespace-nowrap">
                    {schoolBadge}
                  </span>
                )}
                <h1 className="text-[24px] font-black text-slate-900 leading-tight break-keep">
                  {periodLabel} 수학 성취도 리포트
                </h1>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] text-slate-500 font-bold mb-1 uppercase tracking-tighter">
                Student
              </p>
              <p className="text-xl font-black text-slate-800 bg-indigo-50 px-3 py-1 rounded-lg shadow-sm border border-indigo-100 whitespace-nowrap">
                {data.student.name}
              </p>
            </div>
          </div>

          {/* 점수 카드 + 학습 종합 분석 */}
          <div className="flex gap-6 mb-10">
            <div className="w-1/3 bg-indigo-600 rounded-2xl p-6 text-white flex flex-col justify-center items-center relative overflow-hidden shadow-xl">
              <Target
                size={120}
                className="absolute -right-4 -top-4 opacity-10"
              />
              <span className="text-[10px] font-bold uppercase opacity-70 tracking-widest z-10">
                Total Score
              </span>
              <div className="flex items-baseline gap-1 z-10">
                <span className="text-6xl font-black tracking-tighter">
                  {data.totalEarned}
                </span>
                <span className="text-2xl font-bold">점</span>
              </div>
              <div className="mt-3 text-xs font-bold opacity-80 z-10 bg-indigo-800/50 px-4 py-1.5 rounded-full text-center">
                {data.results.filter((r) => r.earnedScore > 0).length} /{' '}
                {data.results.length} 문항 부분/전체 정답
              </div>
              {data.classRank && data.classSize && data.classSize >= 2 && (
                <div className="mt-2 text-[11px] font-black z-10 bg-amber-300 text-amber-900 px-3 py-1 rounded-full text-center shadow-sm">
                  반 {data.classRank}등 / {data.classSize}명
                  {data.classPercentile !== null && data.classPercentile !== undefined
                    ? ` · 상위 ${data.classPercentile}%`
                    : ''}
                </div>
              )}
              {data.classAvg !== null && data.classAvg !== undefined && data.classSize && data.classSize >= 2 && (
                <div className="mt-1.5 text-[10px] font-bold z-10 opacity-80 text-center">
                  반 평균 {data.classAvg}%{' '}
                  <span className={data.scorePct >= data.classAvg ? 'text-emerald-200' : 'text-rose-200'}>
                    ({data.scorePct - data.classAvg >= 0 ? '+' : ''}
                    {data.scorePct - data.classAvg}%p)
                  </span>
                </div>
              )}
            </div>

            <div className="w-2/3 bg-slate-50 rounded-2xl border border-slate-200 p-6 flex flex-col justify-center shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 tracking-tight">
                  <Sparkles size={18} className="text-amber-500" />
                  학습 종합 분석
                  {data.aiComment && (
                    <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full ml-1">
                      AI 맞춤
                    </span>
                  )}
                </h3>
                <div className="student-report-no-print relative">
                  <button
                    type="button"
                    className="text-[11px] font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:border-slate-400 px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 flex items-center gap-1"
                    onClick={() => setAiPanelOpen((v) => !v)}
                    disabled={aiBusy}
                    title="AI 맞춤 코멘트 생성 — 길이·어조·강조 설정"
                  >
                    {aiBusy ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Sparkles size={12} />
                    )}
                    {aiBusy
                      ? '생성 중...'
                      : data.aiComment
                        ? 'AI 재생성'
                        : 'AI 맞춤 생성'}
                  </button>

                  {aiPanelOpen && !aiBusy && (
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-3.5 text-left">
                      <p className="text-[11px] font-black text-slate-700 mb-2">AI 맞춤 설정</p>

                      {/* 길이 */}
                      <div className="mb-2.5">
                        <p className="text-[10px] font-bold text-slate-400 mb-1">길이</p>
                        <div className="flex gap-1">
                          {([['short', '요약'], ['normal', '보통'], ['detailed', '상세']] as const).map(
                            ([v, label]) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setAiLength(v)}
                                className={`flex-1 text-[11px] font-bold py-1 rounded-md border ${
                                  aiLength === v
                                    ? 'bg-slate-800 text-white border-slate-800'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                                }`}
                              >
                                {label}
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      {/* 어조 */}
                      <div className="mb-2.5">
                        <p className="text-[10px] font-bold text-slate-400 mb-1">어조</p>
                        <div className="flex gap-1">
                          {([['warm', '따뜻함'], ['concise', '간결'], ['professional', '전문']] as const).map(
                            ([v, label]) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setAiTone(v)}
                                className={`flex-1 text-[11px] font-bold py-1 rounded-md border ${
                                  aiTone === v
                                    ? 'bg-slate-800 text-white border-slate-800'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                                }`}
                              >
                                {label}
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      {/* 강조 포커스 (복수 선택) */}
                      <div className="mb-3">
                        <p className="text-[10px] font-bold text-slate-400 mb-1">강조 포커스 (복수)</p>
                        <div className="grid grid-cols-2 gap-1">
                          {([['unit', '단원'], ['cognitive', '인지영역'], ['method', '학습법'], ['nextexam', '다음 시험']] as const).map(
                            ([v, label]) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => toggleAiFocus(v)}
                                className={`text-[11px] font-bold py-1 rounded-md border ${
                                  aiFocus.includes(v)
                                    ? 'bg-slate-200 text-slate-800 border-slate-400'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                                }`}
                              >
                                {label}
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleGenerateAi(true)}
                        className="w-full bg-slate-800 hover:bg-slate-900 text-white text-[12px] font-bold py-1.5 rounded-md flex items-center justify-center gap-1"
                      >
                        <Sparkles size={13} />{' '}
                        {data.aiComment ? '이 설정으로 재생성' : '이 설정으로 생성'}
                      </button>
                      <p className="text-[10px] text-slate-400 mt-2 leading-snug">
                        형식·점수는 그대로, 분석 본문만 설정에 맞춰 갱신됩니다.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {(() => {
                const isAi = !!data.aiComment;
                const strong = isAi ? data.aiComment!.strong : comments.strong;
                const weak = isAi ? data.aiComment!.weak : comments.weak;
                const method = isAi ? data.aiComment!.method : comments.method;
                const weakOk =
                  weak.includes('완벽함') ||
                  weak.includes('양호함') ||
                  weak.includes('우수함');
                return (
                  <>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-white p-3 rounded-xl border border-emerald-100 flex items-start gap-3 shadow-sm">
                        <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600 shrink-0">
                          <TrendingUp size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-slate-400 font-bold mb-1">
                            강한 단원
                          </p>
                          <p className="text-[13px] font-black text-slate-800 leading-snug break-keep">
                            {strong}
                          </p>
                        </div>
                      </div>
                      <div className="bg-white p-3 rounded-xl border border-rose-100 flex items-start gap-3 shadow-sm">
                        <div className="bg-rose-100 p-2 rounded-lg text-rose-600 shrink-0">
                          <TrendingDown size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-slate-400 font-bold mb-1">
                            {weakOk ? '특이사항' : '보완 단원'}
                          </p>
                          <p
                            className={`text-[13px] font-black leading-snug break-keep ${weak.includes('완벽함') ? 'text-emerald-600' : 'text-slate-800'}`}
                          >
                            {weak}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="text-[13.5px] text-slate-700 leading-relaxed font-medium bg-white p-4 rounded-xl border border-slate-100 shadow-sm whitespace-pre-wrap break-keep">
                      <span className="font-bold text-indigo-600 flex items-center gap-1 mb-2">
                        <Lightbulb size={16} /> 전문 학습 가이드
                      </span>
                      {method}
                    </div>
                    {aiError && (
                      <p className="student-report-no-print mt-2 text-[11px] text-rose-600 font-bold">
                        AI 생성 실패: {aiError}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* 강사 추가 의견 박스 — 인쇄 시에도 박스 그대로 나옴 */}
          <div
            className={`mb-8 bg-amber-50/40 border-2 border-amber-200 rounded-2xl p-5 shadow-sm break-inside-avoid ${
              !data.teacherComment?.text ? 'print:hidden' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-black text-amber-800 flex items-center gap-2">
                ✏️ 선생님 한마디
              </h3>
              <div className="student-report-no-print flex items-center gap-2">
                {teacherSaved && (
                  <span className="text-[11px] font-bold text-emerald-600">
                    {teacherSaved}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSaveTeacherComment}
                  disabled={teacherSaving}
                  className="text-[11px] font-bold text-amber-700 hover:text-amber-900 bg-white border border-amber-300 hover:border-amber-500 px-2.5 py-1 rounded-md disabled:opacity-50"
                >
                  {teacherSaving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
            {/* 편집 영역 (인쇄 시 숨김) */}
            <textarea
              className="student-report-no-print w-full min-h-[80px] bg-white border border-amber-200 rounded-lg p-3 text-[13.5px] text-slate-700 leading-relaxed font-medium resize-y focus:outline-none focus:border-amber-500"
              placeholder="학생/학부모에게 전할 추가 메시지를 입력하세요. 비워두면 박스가 표시되지 않습니다."
              value={teacherText}
              onChange={(e) => setTeacherText(e.target.value)}
              maxLength={1000}
            />
            {/* 인쇄용 표시 — textarea 와 달리 인쇄에 나옴 */}
            {data.teacherComment?.text && (
              <div className="hidden print:block text-[13.5px] text-slate-800 leading-relaxed font-medium whitespace-pre-wrap break-keep">
                {data.teacherComment.text}
              </div>
            )}
            {data.teacherComment?.updatedAt && (
              <p className="text-[10px] text-amber-700 mt-2 font-bold opacity-70">
                {new Date(data.teacherComment.updatedAt).toLocaleString('ko-KR')}{' '}
                기준
              </p>
            )}
          </div>

          {/* 단원/난이도/유형 차트 */}
          <div className="grid grid-cols-2 gap-10 mb-8">
            <div className="col-span-1 border-r border-slate-100 pr-10">
              <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2 border-b-2 border-indigo-50 pb-2 tracking-tight">
                <BarChart3 className="text-indigo-500" size={18} />
                단원별 성취도
              </h3>
              <HorizontalBarChart data={unitData} defaultColor="#4f46e5" />
            </div>

            <div className="col-span-1 flex flex-col gap-8">
              <div>
                <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2 border-b-2 border-emerald-50 pb-2 tracking-tight">
                  <Layers className="text-emerald-500" size={18} />
                  난이도별 성취도
                </h3>
                <HorizontalBarChart data={diffData} defaultColor="#10b981" />
              </div>

              {Object.keys(typeStats).length > 0 && (
                <div>
                  <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2 border-b-2 border-amber-50 pb-2 tracking-tight">
                    <PieIcon className="text-amber-500" size={18} />
                    문제유형별 정답률
                  </h3>
                  <div className="flex flex-wrap gap-4 justify-center md:justify-start w-full">
                    {Object.entries(typeStats).map(([type, stats]) => (
                      <DonutChart
                        key={type}
                        title={type}
                        data={[
                          { name: '정답', value: stats.correct, color: '#4f46e5' },
                          {
                            name: '오답',
                            value: stats.total - stats.correct,
                            color: '#e2e8f0',
                          },
                        ]}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="absolute bottom-10 left-0 right-0 text-center text-[10px] text-slate-300 font-bold tracking-[0.2em] uppercase">
            Academic Analysis System — Page 1
          </div>
        </div>

        {/* ============================================================== */}
        {/* Page 2 — 문항별 상세 정오표 */}
        {/* ============================================================== */}
        <div className="a4-page bg-white flex flex-col print-page-auto">
          <div className="border-b-2 border-slate-200 pb-4 mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2 tracking-tight">
              <CheckSquare size={24} className="text-indigo-600" />
              문항별 상세 정오표
            </h2>
            <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">
              {data.results.length} Questions
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 flex-1 items-start content-start">
            {data.results.map((r) => (
              <DetailRowItem key={r.qNum} r={r} />
            ))}
          </div>

          <div className="mt-8 text-center text-[10px] text-slate-300 font-bold tracking-[0.2em] uppercase pt-4 border-t border-slate-50">
            Academic Analysis System — Page 2
          </div>
        </div>

        {/* ============================================================== */}
        {/* Page 3 — 심화 분석 (세부유형 + 인지영역) */}
        {/* ============================================================== */}
        {showDeepAnalysis &&
          ((data.fineUnitStats?.length ?? 0) > 0 ||
            (data.cognitiveDomainStats?.length ?? 0) > 0) && (
          <div className="a4-page bg-white flex flex-col print-page-auto">
            <div className="border-b-2 border-slate-200 pb-4 mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2 tracking-tight">
                <Sparkles size={24} className="text-indigo-600" />
                심화 분석
              </h2>
              <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                Detailed Insights
              </span>
            </div>

            {/* 세부유형 약점 — 정답률 낮은 순 상위 8개 */}
            {(data.fineUnitStats?.length ?? 0) > 0 && (
              <section className="mb-8">
                <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2 border-l-4 border-rose-400 pl-3">
                  <BarChart3 size={18} className="text-rose-500" />
                  세부유형별 정답률
                  <span className="text-xs font-normal text-slate-400 ml-2">
                    (약점 순)
                  </span>
                </h3>
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex flex-col gap-3">
                    {data.fineUnitStats!
                      .slice(0, 8)
                      .map((u, i) => {
                        const color =
                          u.pct < 50
                            ? '#f43f5e'
                            : u.pct < 80
                              ? '#f59e0b'
                              : '#10b981';
                        return (
                          <div key={i} className="flex flex-col gap-1">
                            <div className="flex justify-between items-baseline">
                              <span
                                className="text-[13px] font-bold text-slate-800 flex-1 pr-2 truncate"
                                title={u.fullPath}
                              >
                                {u.name}
                              </span>
                              <span className="text-[11px] font-bold text-slate-500 shrink-0">
                                {u.correct}/{u.total} ·{' '}
                                <span style={{ color }} className="font-black">
                                  {u.pct}%
                                </span>
                              </span>
                            </div>
                            <div className="w-full h-2.5 bg-white rounded-full overflow-hidden border border-slate-200">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${u.pct}%`,
                                  backgroundColor: color,
                                  transition: 'width 1s',
                                }}
                              />
                            </div>
                            {u.fullPath && (
                              <span className="text-[10px] text-slate-400 leading-snug">
                                {u.fullPath}
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                  {data.fineUnitStats!.length > 8 && (
                    <p className="text-[11px] text-slate-400 mt-3 text-right">
                      외 {data.fineUnitStats!.length - 8}개 세부유형
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* 인지영역별 4축 분석 */}
            {(data.cognitiveDomainStats?.length ?? 0) > 0 && (
              <section className="mb-8 break-inside-avoid">
                <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2 border-l-4 border-indigo-400 pl-3">
                  <Layers size={18} className="text-indigo-500" />
                  인지영역별 정답률
                  <span className="text-xs font-normal text-slate-400 ml-2">
                    (계산·이해·추론·문제해결)
                  </span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {COG_ORDER.map((code) => {
                    const stat = data.cognitiveDomainStats!.find(
                      (c) => c.code === code
                    );
                    if (!stat || stat.total === 0) return null;
                    const color = COG_COLOR[code] || '#64748b';
                    return (
                      <div
                        key={code}
                        className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center"
                      >
                        <span
                          className="text-[11px] font-black uppercase tracking-widest mb-1"
                          style={{ color }}
                        >
                          {COG_LABEL[code]}
                        </span>
                        <div className="text-3xl font-black text-slate-800">
                          {stat.pct}%
                        </div>
                        <div className="text-[11px] text-slate-500 font-bold mt-1">
                          {stat.correct}/{stat.total}
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-3">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${stat.pct}%`,
                              backgroundColor: color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                  ※ 인지영역은 문제에 요구되는 사고 유형 분류입니다. <strong>계산</strong> 약하면 연산 정확도, <strong>이해</strong> 약하면 개념·정의, <strong>추론</strong> 약하면 논리·증명, <strong>문제해결</strong> 약하면 조건 해석·복합 적용 훈련이 필요합니다.
                </p>
              </section>
            )}

            {/* 시계열 추이 — 같은 학생의 이전 시험과 단원별 비교 */}
            {data.unitTrend && data.unitTrend.units.length > 0 && (
              <section className="mb-8 break-inside-avoid">
                <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2 border-l-4 border-emerald-400 pl-3">
                  <TrendingUp size={18} className="text-emerald-500" />
                  시계열 추이
                  <span className="text-xs font-normal text-slate-400 ml-2">
                    vs. {data.unitTrend.prevExamTitle}
                    {data.unitTrend.prevConductedAt
                      ? ` (${new Date(data.unitTrend.prevConductedAt).toLocaleDateString(
                          'ko-KR',
                          { year: '2-digit', month: '2-digit', day: '2-digit' }
                        )})`
                      : ''}
                  </span>
                </h3>
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <div className="grid grid-cols-1 gap-3">
                    {data.unitTrend.units.map((u, i) => {
                      const isUp = u.delta > 0;
                      const isDown = u.delta < 0;
                      const arrow = isUp ? '↑' : isDown ? '↓' : '→';
                      const color = isUp
                        ? '#10b981'
                        : isDown
                          ? '#f43f5e'
                          : '#64748b';
                      return (
                        <div
                          key={i}
                          className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-slate-800 mb-1.5">
                              {u.name}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500">
                              <span>
                                이전:{' '}
                                <span className="font-bold text-slate-700">
                                  {u.prevPct}%
                                </span>{' '}
                                ({u.prevCorrect}/{u.prevTotal})
                              </span>
                              <span className="text-slate-300">→</span>
                              <span>
                                현재:{' '}
                                <span className="font-bold text-slate-700">
                                  {u.currPct}%
                                </span>{' '}
                                ({u.currCorrect}/{u.currTotal})
                              </span>
                            </div>
                          </div>
                          <div
                            className="shrink-0 text-right font-black text-lg leading-tight px-3"
                            style={{ color }}
                          >
                            {arrow} {Math.abs(u.delta)}%p
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                    ※ 같은 학생의 가장 최근 다른 시험과 단원별 정답률 비교입니다.
                    상승 단원은 유지·심화, 하락 단원은 즉시 보완이 필요합니다.
                  </p>
                </div>
              </section>
            )}

            <div className="mt-auto pt-4 border-t border-slate-50 text-center text-[10px] text-slate-300 font-bold tracking-[0.2em] uppercase">
              Academic Analysis System — Page 3
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
