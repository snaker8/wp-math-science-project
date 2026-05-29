'use client';

// ============================================================================
// 학부모 공유 페이지 — 학생 1인 성취도 리포트 (공개·인증 불필요)
// /share/student-report/[token]
//
// 강사 리포트 페이지와 디자인 동일. 단 다음 컨트롤은 제거:
//   - "시험 분석으로" 돌아가기
//   - AI 코멘트 생성·재생성 버튼
//   - 강사 코멘트 편집 textarea
//   - 반 백분위·시계열 추이 (API 에서 미포함)
// 인쇄 버튼은 유지 (학부모도 인쇄 가능)
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Printer,
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
import '@/app/dashboard/exam-analysis/[examId]/students/[studentId]/report.css';

// ============================================================================
// Types — 강사 페이지와 동일 (API 응답 형식 일치)
// ============================================================================

interface ResultRow {
  qNum: number;
  majorUnit: string;
  minorUnit: string;
  subUnit: string;
  fineUnit: string;
  cognitiveDomain: string;
  type: string;
  difficulty: number;
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

interface ReportData {
  student: {
    id: string;
    name: string;
    grade: number | null;
    classLabel: string | null;
  };
  exam: { id: string; title: string };
  totalEarned: number;
  totalPossible: number;
  scorePct: number;
  results: ResultRow[];
  fineUnitStats?: FineUnitStat[];
  cognitiveDomainStats?: CognitiveStat[];
  aiComment?: AiCommentJson | null;
  teacherComment?: TeacherCommentJson | null;
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
// 단원 정규화
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
    str.includes('피타고라스') ||
    str.includes('삼각비') ||
    str.includes('원')
  )
    return '기하';
  if (
    str.includes('확률') ||
    str.includes('통계') ||
    str.includes('자료')
  )
    return '확률과 통계';
  return str || '기타 단원';
}

// ============================================================================
// 정형 코멘트 (AI 없을 때 폴백)
// ============================================================================
const KICE: Record<string, string> = {
  '수와 연산': '실수의 체계와 성질을 명확히 이해하고, 빠르고 정확한 연산을 요구합니다.',
  '문자와 식': '주어진 조건을 수식으로 정확히 표현하고, 다항식의 전개와 인수분해, 그리고 방정식 및 부등식을 논리적으로 해결하는 능력이 필요합니다.',
  함수: '함수의 정의를 바탕으로 그래프를 그리고, x절편, y절편, 기울기, 꼭짓점 등의 기하학적 의미를 파악하는 것이 중요합니다.',
  기하: '도형의 성질을 이용하여 보조선을 긋고 길이나 넓이를 구하는 공간 지각력이 요구됩니다.',
  '확률과 통계': '경우의 수를 빠짐없이 구하고, 확률의 기본 성질 및 대푯값과 산포도의 의미를 바탕으로 자료를 해석합니다.',
};

interface FallbackComments { strong: string; weak: string; method: string }

function generateComments(unitData: { name: string; total: number; correct: number }[], scorePct: number): FallbackComments {
  if (unitData.length === 0) return { strong: '-', weak: '-', method: '데이터가 부족합니다.' };
  const u = unitData.map((u) => ({ name: u.name, pct: (u.correct / u.total) * 100 })).sort((a, b) => b.pct - a.pct);
  const best = u[0]?.pct ?? 0;
  const strong = u.filter((x) => x.pct === best || x.pct >= 90).slice(0, 2).map((x) => x.name).join(', ');
  const weakCand = u.filter((x) => x.pct <= 70).sort((a, b) => a.pct - b.pct);
  let weak = '-', primary = '-';
  if (weakCand.length) {
    weak = weakCand.slice(0, 2).map((x) => x.name).join(', ');
    primary = weakCand[0].name;
  } else {
    weak = '전반적으로 양호함';
    primary = u[u.length - 1]?.name ?? '-';
  }
  const matched = KICE[primary] || '전반적인 수학 기본 개념을 탄탄히 다지는 것이 중요합니다.';
  let method = '';
  if (scorePct >= 90) method = `전체적인 개념 이해도가 매우 우수합니다. 심화 문제를 집중적으로 풀어보세요.\n\n📌 ${matched}`;
  else if (scorePct >= 70) method = `기본 개념은 잘 잡혀 있으나 특정 단원에서 오답이 발생하고 있습니다.\n\n📌 ${matched}`;
  else method = `전반적인 기초 개념 다지기가 우선되어야 합니다.\n\n📌 ${matched}`;
  return { strong, weak, method };
}

// ============================================================================
// 분포 계산
// ============================================================================
interface UnitData { name: string; total: number; correct: number }
interface DiffData { name: string; total: number; correct: number; color: string }
interface TypeStats { [type: string]: { total: number; correct: number } }

function computeStats(results: ResultRow[]) {
  const unitMap: Record<string, { total: number; correct: number }> = {};
  for (const r of results) {
    const m = cleanMajorUnit(r.majorUnit);
    if (!unitMap[m]) unitMap[m] = { total: 0, correct: 0 };
    unitMap[m].total++;
    if (r.earnedScore > 0) unitMap[m].correct++;
  }
  const unitData: UnitData[] = Object.entries(unitMap).map(([name, s]) => ({ name, ...s }));

  const diffMap: Record<string, { total: number; correct: number }> = {
    상: { total: 0, correct: 0 }, 중: { total: 0, correct: 0 }, 하: { total: 0, correct: 0 },
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
    .map((name) => ({
      name,
      ...diffMap[name],
      color: name === '상' ? '#f97316' : name === '중' ? '#10b981' : '#fde047',
    }))
    .filter((d) => d.total > 0)
    .sort((a, b) => order.indexOf(b.name) - order.indexOf(a.name));

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
// 차트 컴포넌트들
// ============================================================================
function HorizontalBarChart({ data, defaultColor = '#4f46e5' }: {
  data: { name: string; total: number; correct: number; color?: string }[];
  defaultColor?: string;
}) {
  return (
    <div className="flex flex-col gap-4 w-full">
      {data.map((item, i) => {
        const pct = item.total === 0 ? 0 : Math.round((item.correct / item.total) * 100);
        const color = item.color || defaultColor;
        return (
          <div key={i} className="flex flex-col gap-1.5 w-full">
            <div className="flex justify-between items-end w-full">
              <span className="text-[14px] font-bold text-slate-700 flex-1 pr-2">{item.name}</span>
              <span className="text-xs text-slate-400 font-bold shrink-0">{item.correct}/{item.total}</span>
            </div>
            <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex relative shadow-inner">
              <div className="h-full rounded-full flex items-center justify-end px-2" style={{ width: `${pct}%`, backgroundColor: color }}>
                {pct > 15 && <span className={`text-[10px] font-bold ${item.name === '하' ? 'text-slate-700' : 'text-white'}`}>{pct}%</span>}
              </div>
              {pct <= 15 && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-bold">{pct}%</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ data, title }: { data: { name: string; value: number; color: string }[]; title: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;
  let cumulative = 0;
  const pctTop = Math.round((data[0]?.value / total) * 100) || 0;
  return (
    <div className="flex flex-col items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex-1 min-w-[140px] max-w-[200px]">
      <h4 className="text-[13px] font-black text-slate-700 mb-3 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200 w-full text-center truncate">{title}</h4>
      <div className="relative flex items-center justify-center w-full">
        <svg viewBox="-1.2 -1.2 2.4 2.4" className="w-full h-full -rotate-90 drop-shadow-sm max-w-[90px] max-h-[90px]">
          {data.map((slice, i) => {
            const pct = slice.value / total;
            if (pct === 0) return null;
            const startX = Math.cos(2 * Math.PI * cumulative);
            const startY = Math.sin(2 * Math.PI * cumulative);
            cumulative += pct;
            const endX = Math.cos(2 * Math.PI * cumulative);
            const endY = Math.sin(2 * Math.PI * cumulative);
            const largeArc = pct > 0.5 ? 1 : 0;
            const path = pct === 1
              ? `M 1 0 A 1 1 0 1 1 -1 0 A 1 1 0 1 1 1 0`
              : `M ${startX} ${startY} A 1 1 0 ${largeArc} 1 ${endX} ${endY} L 0 0`;
            return <path key={i} d={path} fill={slice.color} stroke="#fff" strokeWidth="0.1" strokeLinejoin="round" />;
          })}
          <circle cx="0" cy="0" r="0.65" fill="#fff" />
          <text x="0" y="0.05" textAnchor="middle" dominantBaseline="middle" className="text-[0.45px] font-black fill-indigo-600" style={{ transform: 'rotate(90deg)' }}>{pctTop}%</text>
        </svg>
      </div>
      <div className="flex flex-col gap-1.5 mt-4 w-full px-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-xs w-full">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: d.color }} />
              <span className="font-bold text-slate-600">{d.name}</span>
            </div>
            <span className="text-slate-500 font-bold shrink-0">{d.value}개</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailRowItem({ r }: { r: ResultRow }) {
  const major = cleanMajorUnit(r.majorUnit);
  let diffLabel: { txt: string; cls: string };
  if (r.difficulty >= 7) diffLabel = { txt: `어려움 ${r.difficulty}`, cls: 'text-rose-600 bg-rose-50 border-rose-100' };
  else if (r.difficulty <= 2) diffLabel = { txt: `쉬움 ${r.difficulty}`, cls: 'text-emerald-600 bg-emerald-50 border-emerald-100' };
  else diffLabel = { txt: `보통 ${r.difficulty}`, cls: 'text-amber-600 bg-amber-50 border-amber-100' };
  const statusBadge =
    r.status === 'O' ? (
      <div className="w-9 h-9 rounded-full border-2 border-emerald-500 text-emerald-500 flex items-center justify-center font-black text-[15px] bg-emerald-50">O</div>
    ) : r.status === '△' ? (
      <div className="w-9 h-9 rounded-full border-2 border-orange-500 text-orange-500 flex items-center justify-center font-black text-[18px] bg-orange-50 pb-0.5">△</div>
    ) : (
      <div className="w-9 h-9 rounded-full border-2 border-rose-500 text-rose-500 flex items-center justify-center font-black text-[15px] bg-rose-50">X</div>
    );
  return (
    <div className="flex items-start justify-between p-3.5 bg-white rounded-xl border border-slate-200 shadow-sm break-inside-avoid">
      <div className="flex items-start gap-3 w-full">
        <div className="mt-0.5 w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-black flex items-center justify-center shrink-0 text-sm shadow-sm border border-slate-200">{r.qNum}</div>
        <div className="flex flex-col flex-1 min-w-0 pr-2">
          <span className="text-[14px] font-bold text-slate-800 mb-1.5 leading-snug break-words">
            {major}
            <span className="text-slate-400 font-normal text-[12px] inline-block ml-1">| {r.minorUnit || '-'}</span>
          </span>
          <div className="flex flex-wrap gap-1.5 text-[10px] items-center">
            <span className="bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 font-bold whitespace-nowrap">{r.type || '-'}</span>
            <span className={`px-1.5 py-0.5 rounded font-bold border whitespace-nowrap ${diffLabel.cls}`}>{diffLabel.txt}</span>
            {r.fullScore > 0 && (
              <span className="text-indigo-500 font-bold px-1.5 py-0.5 whitespace-nowrap">
                {r.status === '△' ? `${r.earnedScore}점 / ${r.fullScore}점` : `${r.fullScore}점`}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center justify-center ml-1 mt-0.5">{statusBadge}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================
export default function PublicStudentReportPage() {
  const params = useParams();
  const token = params?.token as string;

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/share/student-report/${token}`, { cache: 'no-store' });
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
    return () => { cancelled = true };
  }, [token]);

  const { unitData, diffData, typeStats, comments } = useMemo(() => {
    if (!data) return { unitData: [], diffData: [], typeStats: {}, comments: { strong: '-', weak: '-', method: '' } };
    const stats = computeStats(data.results);
    return { ...stats, comments: generateComments(stats.unitData, data.scorePct) };
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-4 p-8">
        <AlertCircle className="w-10 h-10 text-rose-500" />
        <p className="text-slate-800 font-bold">리포트를 불러오지 못했습니다</p>
        <p className="text-slate-500 text-sm">{error || '유효하지 않은 링크입니다.'}</p>
      </div>
    );
  }

  const periodLabel = data.exam.title.replace(/^기출분석\s*/, '');
  const schoolBadge = (() => {
    const m = data.exam.title.match(/[가-힣]{2,4}(?:중|고)/);
    return m ? m[0] : '';
  })();

  // AI 코멘트 우선, 없으면 정형
  const isAi = !!data.aiComment;
  const strong = isAi ? data.aiComment!.strong : comments.strong;
  const weak = isAi ? data.aiComment!.weak : comments.weak;
  const method = isAi ? data.aiComment!.method : comments.method;
  const weakOk = weak.includes('완벽함') || weak.includes('양호함') || weak.includes('우수함');

  return (
    <div className="student-report-root">
      <div className="student-report-no-print sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[210mm] mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-slate-500 text-sm font-bold flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-500" />
            학습 분석 리포트
          </span>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors"
          >
            <Printer size={16} /> A4 인쇄
          </button>
        </div>
      </div>

      <div className="pt-8">
        {/* Page 1 */}
        <div className="a4-page bg-white print-page-1">
          <div className="border-b-4 border-indigo-900 pb-6 mb-8 flex justify-between items-end">
            <div>
              <div className="text-indigo-600 font-black text-xs tracking-widest mb-1 uppercase">Achievement Report</div>
              <div className="flex items-baseline gap-3">
                <h1 className="text-[28px] font-black text-slate-900 leading-tight">{periodLabel} 수학 성취도 리포트</h1>
                {schoolBadge && <span className="text-[17px] font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-md">{schoolBadge}</span>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500 font-bold mb-1 uppercase tracking-tighter">Student Name</p>
              <p className="text-2xl font-black text-slate-800 bg-indigo-50 px-4 py-1 rounded-lg shadow-sm border border-indigo-100">{data.student.name}</p>
            </div>
          </div>

          <div className="flex gap-6 mb-10">
            <div className="w-1/3 bg-indigo-600 rounded-2xl p-6 text-white flex flex-col justify-center items-center relative overflow-hidden shadow-xl">
              <Target size={120} className="absolute -right-4 -top-4 opacity-10" />
              <span className="text-[10px] font-bold uppercase opacity-70 tracking-widest z-10">Total Score</span>
              <div className="flex items-baseline gap-1 z-10">
                <span className="text-6xl font-black tracking-tighter">{data.totalEarned}</span>
                <span className="text-2xl font-bold">점</span>
              </div>
              <div className="mt-3 text-xs font-bold opacity-80 z-10 bg-indigo-800/50 px-4 py-1.5 rounded-full text-center">
                {data.results.filter((r) => r.earnedScore > 0).length} / {data.results.length} 문항 부분/전체 정답
              </div>
            </div>

            <div className="w-2/3 bg-slate-50 rounded-2xl border border-slate-200 p-6 flex flex-col justify-center shadow-sm">
              <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2 tracking-tight">
                <Sparkles size={18} className="text-amber-500" />
                학습 종합 분석
                {isAi && <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full ml-1">AI 맞춤</span>}
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-white p-3 rounded-xl border border-emerald-100 flex items-start gap-3 shadow-sm">
                  <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600 shrink-0"><TrendingUp size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-slate-400 font-bold mb-1">강한 단원</p>
                    <p className="text-[13px] font-black text-slate-800 leading-snug break-keep">{strong}</p>
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-rose-100 flex items-start gap-3 shadow-sm">
                  <div className="bg-rose-100 p-2 rounded-lg text-rose-600 shrink-0"><TrendingDown size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-slate-400 font-bold mb-1">{weakOk ? '특이사항' : '보완 단원'}</p>
                    <p className={`text-[13px] font-black leading-snug break-keep ${weak.includes('완벽함') ? 'text-emerald-600' : 'text-slate-800'}`}>{weak}</p>
                  </div>
                </div>
              </div>
              <div className="text-[13.5px] text-slate-700 leading-relaxed font-medium bg-white p-4 rounded-xl border border-slate-100 shadow-sm whitespace-pre-wrap break-keep">
                <span className="font-bold text-indigo-600 flex items-center gap-1 mb-2">
                  <Lightbulb size={16} /> {isAi ? 'AI 맞춤 학습 가이드' : '전문 학습 가이드'}
                </span>
                {method}
              </div>
            </div>
          </div>

          {/* 강사 코멘트 (있을 때만) */}
          {data.teacherComment?.text && (
            <div className="mb-8 bg-amber-50/40 border-2 border-amber-200 rounded-2xl p-5 shadow-sm break-inside-avoid">
              <h3 className="text-[15px] font-black text-amber-800 flex items-center gap-2 mb-3">
                ✏️ 선생님 한마디
              </h3>
              <div className="text-[13.5px] text-slate-800 leading-relaxed font-medium whitespace-pre-wrap break-keep">
                {data.teacherComment.text}
              </div>
            </div>
          )}

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
                          { name: '오답', value: stats.total - stats.correct, color: '#e2e8f0' },
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

        {/* Page 2 */}
        <div className="a4-page bg-white flex flex-col print-page-auto">
          <div className="border-b-2 border-slate-200 pb-4 mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2 tracking-tight">
              <CheckSquare size={24} className="text-indigo-600" />
              문항별 상세 정오표
            </h2>
            <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">{data.results.length} Questions</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 flex-1 items-start content-start">
            {data.results.map((r) => <DetailRowItem key={r.qNum} r={r} />)}
          </div>
          <div className="mt-8 text-center text-[10px] text-slate-300 font-bold tracking-[0.2em] uppercase pt-4 border-t border-slate-50">
            Academic Analysis System — Page 2
          </div>
        </div>

        {/* Page 3 — 심화 분석 */}
        {((data.fineUnitStats?.length ?? 0) > 0 || (data.cognitiveDomainStats?.length ?? 0) > 0) && (
          <div className="a4-page bg-white flex flex-col print-page-auto">
            <div className="border-b-2 border-slate-200 pb-4 mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2 tracking-tight">
                <Sparkles size={24} className="text-indigo-600" />
                심화 분석
              </h2>
              <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Detailed Insights</span>
            </div>

            {(data.fineUnitStats?.length ?? 0) > 0 && (
              <section className="mb-8">
                <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2 border-l-4 border-rose-400 pl-3">
                  <BarChart3 size={18} className="text-rose-500" />
                  세부유형별 정답률
                  <span className="text-xs font-normal text-slate-400 ml-2">(약점 순)</span>
                </h3>
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex flex-col gap-3">
                    {data.fineUnitStats!.slice(0, 8).map((u, i) => {
                      const color = u.pct < 50 ? '#f43f5e' : u.pct < 80 ? '#f59e0b' : '#10b981';
                      return (
                        <div key={i} className="flex flex-col gap-1">
                          <div className="flex justify-between items-baseline">
                            <span className="text-[13px] font-bold text-slate-800 flex-1 pr-2 truncate" title={u.fullPath}>{u.name}</span>
                            <span className="text-[11px] font-bold text-slate-500 shrink-0">
                              {u.correct}/{u.total} · <span style={{ color }} className="font-black">{u.pct}%</span>
                            </span>
                          </div>
                          <div className="w-full h-2.5 bg-white rounded-full overflow-hidden border border-slate-200">
                            <div className="h-full rounded-full" style={{ width: `${u.pct}%`, backgroundColor: color }} />
                          </div>
                          {u.fullPath && <span className="text-[10px] text-slate-400 leading-snug">{u.fullPath}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {(data.cognitiveDomainStats?.length ?? 0) > 0 && (
              <section className="mb-8 break-inside-avoid">
                <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2 border-l-4 border-indigo-400 pl-3">
                  <Layers size={18} className="text-indigo-500" />
                  인지영역별 정답률
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {COG_ORDER.map((code) => {
                    const stat = data.cognitiveDomainStats!.find((c) => c.code === code);
                    if (!stat || stat.total === 0) return null;
                    const color = COG_COLOR[code] || '#64748b';
                    return (
                      <div key={code} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
                        <span className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color }}>{COG_LABEL[code]}</span>
                        <div className="text-3xl font-black text-slate-800">{stat.pct}%</div>
                        <div className="text-[11px] text-slate-500 font-bold mt-1">{stat.correct}/{stat.total}</div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-3">
                          <div className="h-full rounded-full" style={{ width: `${stat.pct}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    );
                  })}
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
