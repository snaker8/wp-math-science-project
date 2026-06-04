// ============================================================================
// 진단평가 종합 리포트 — 룰베이스 분석 서술 (학부모용)
//
// 목적: "우리 아이가 이 진단으로 어느 단원이 약하고, 이번 시험 대비에 무엇을
//       준비해야 하는지"를 데이터 기반 한국어 문장으로 결정적(deterministic) 생성.
//       LLM 없이 임계값 → 템플릿. 비용 0·즉시·항상 일관.
//
// 입력: comprehensive-report API 응답의 일부 (overall / byDifficulty / byUnit / byType).
// ============================================================================

export interface UnitStat { code: string; name: string; total: number; correct: number; pct: number; }
export interface TypeStat { code: string; unitCode: string; name: string; total: number; correct: number; pct: number; }
export interface DiffStat { difficulty: number; total: number; correct: number; pct: number | null; }

export type Achievement = 'strong' | 'caution' | 'weak';

export interface UnitPrescription {
  unit: UnitStat;
  level: Achievement;
  /** 처방 한 줄 */
  prescription: string;
  /** 이 단원에서 가장 약한 세부유형(있으면) */
  weakType: TypeStat | null;
}

export interface ReportNarrative {
  readiness: { level: Achievement; label: string; emoji: string; oneLine: string };
  summary: string;                 // 총평 단락
  difficultyInsight: string;       // 난이도 → 시험 시사점
  weakUnits: UnitPrescription[];   // 취약/주의 단원 (취약 우선)
  strongUnits: UnitStat[];         // 강점 단원
  actionPlan: string[];            // 시험 대비 순서 (우선순위)
}

// 임계값 — 단원/밴드 공통
const MIN_ITEMS = 2;            // 단원 신뢰 최소 문항
const T_STRONG = 80;
const T_CAUTION = 60;

function levelOf(pct: number): Achievement {
  if (pct >= T_STRONG) return 'strong';
  if (pct >= T_CAUTION) return 'caution';
  return 'weak';
}

/** setTitle 에서 범위만 추출. "중2-1 F 진단평가(연립~일차함수)" → "연립~일차함수" */
function extractRange(setTitle: string): string {
  const m = setTitle.match(/\(([^)]+)\)/);
  if (m) return m[1].trim();
  return setTitle.replace(/진단평가.*$/, '').trim() || setTitle;
}

/** 대단원 full_path "중2-1 > 일차함수" → "일차함수" */
function shortName(name: string): string {
  const idx = name.lastIndexOf('>');
  return idx >= 0 ? name.slice(idx + 1).trim() : name;
}

/** 난이도 구간 집계 정답률 (lo~hi inclusive). 데이터 없으면 null. */
function bandPct(byDifficulty: DiffStat[], lo: number, hi: number): number | null {
  let t = 0, c = 0;
  for (const d of byDifficulty) {
    if (d.difficulty >= lo && d.difficulty <= hi) { t += d.total; c += d.correct; }
  }
  return t > 0 ? Math.round((c / t) * 100) : null;
}

export function buildNarrative(input: {
  studentName: string;
  setTitle: string;
  overallPct: number | null;
  byDifficulty: DiffStat[];
  byUnit: UnitStat[];
  byType: TypeStat[];
}): ReportNarrative {
  const { studentName, setTitle, overallPct, byDifficulty, byUnit, byType } = input;
  const range = extractRange(setTitle);
  const name = studentName?.trim() || '학생';

  // ── 단원 분류 (신뢰 문항 수 충족만) ──
  const meaningful = byUnit.filter((u) => u.total >= MIN_ITEMS);
  const weak = meaningful.filter((u) => levelOf(u.pct) === 'weak').sort((a, b) => a.pct - b.pct);
  const caution = meaningful.filter((u) => levelOf(u.pct) === 'caution').sort((a, b) => a.pct - b.pct);
  const strong = meaningful.filter((u) => levelOf(u.pct) === 'strong').sort((a, b) => b.pct - a.pct);

  // ── 난이도 밴드 ──
  const basicPct = bandPct(byDifficulty, 1, 4);     // 기본·기초
  const advPct = bandPct(byDifficulty, 6, 10);      // 변별·심화

  // ── 시험 준비도 신호등 ──
  let readinessLevel: Achievement;
  const hasSevereWeak = weak.some((u) => u.total >= 3 && u.pct < 50);
  if ((overallPct != null && overallPct < 65) || hasSevereWeak) {
    readinessLevel = 'weak';
  } else if (overallPct != null && overallPct >= 85 && weak.length === 0) {
    readinessLevel = caution.length === 0 ? 'strong' : 'caution';
  } else {
    readinessLevel = 'caution';
  }
  const readinessMeta = {
    strong: { label: '시험 준비 안정', emoji: '🟢', oneLine: '전반적으로 잘 준비되어 있습니다. 실전 마무리에 집중하세요.' },
    caution: { label: '부분 보강 필요', emoji: '🟡', oneLine: '기본은 되어 있으나 일부 단원·유형 보강이 필요합니다.' },
    weak: { label: '집중 보강 필요', emoji: '🔴', oneLine: '시험 전 취약 단원의 개념부터 다시 다질 필요가 있습니다.' },
  }[readinessLevel];

  // ── 총평 단락 ──
  const parts: string[] = [];
  const overallStr = overallPct != null ? `${overallPct}%` : '-';
  let basicClause: string;
  if (basicPct == null) basicClause = '기초 문항 데이터가 충분하지 않습니다';
  else if (basicPct >= 85) basicClause = '기초 개념과 계산은 안정적입니다';
  else if (basicPct >= 70) basicClause = '기초는 대체로 갖췄습니다';
  else basicClause = '기초 개념부터 다시 다질 필요가 있습니다';
  parts.push(`${name} 학생은 『${range}』 범위 진단에서 합산 정답률 ${overallStr}로, ${basicClause}.`);

  // 변별 + 취약 단원
  const weakNames = [...weak, ...caution].slice(0, 2).map((u) => shortName(u.name));
  if (weakNames.length > 0) {
    let advClause = '';
    if (advPct != null && basicPct != null && advPct + 15 < basicPct) {
      advClause = ' 기본기에 비해 변별력 있는 응용·심화 문항에서 실점이 두드러지며,';
    }
    parts.push(`${advClause} 특히 ${weakNames.join(', ')} 단원에서 정답률이 낮아 시험 전 집중 보강이 필요합니다.`.trim());
  } else if (advPct != null && advPct >= 80) {
    parts.push('응용·심화 문항까지 무난히 해결해 전반적으로 안정적입니다.');
  } else {
    parts.push('두드러진 취약 단원은 없으나, 실전 문제로 마무리 점검을 권장합니다.');
  }
  const summary = parts.join(' ');

  // ── 난이도 시사점 ──
  let difficultyInsight: string;
  if (basicPct != null && advPct != null) {
    if (basicPct >= 80 && advPct < 60) {
      difficultyInsight = `기본 문항(난이도 1~4)은 ${basicPct}%로 탄탄하나 변별 문항(난이도 6+)은 ${advPct}% — 내신 고득점을 위해 응용·심화 훈련이 핵심입니다.`;
    } else if (basicPct < 70) {
      difficultyInsight = `기본 문항(난이도 1~4)이 ${basicPct}%로, 응용보다 먼저 기초 개념·계산을 확실히 잡아야 합니다.`;
    } else {
      difficultyInsight = `기본 ${basicPct}% · 변별 ${advPct}%로 균형 잡힌 편입니다. 약한 단원 위주로 난이도를 올려가며 연습하세요.`;
    }
  } else if (basicPct != null) {
    difficultyInsight = `기본 문항(난이도 1~4) 정답률 ${basicPct}%. 변별 난이도 문항이 적어 심화 진단은 추가 평가가 필요합니다.`;
  } else {
    difficultyInsight = '난이도 분류된 문항이 충분하지 않아 난이도 분석은 제한적입니다.';
  }

  // ── 단원별 처방 ──
  function typeForUnit(unitCode: string): TypeStat | null {
    const inUnit = byType.filter((t) => t.unitCode === unitCode && t.total >= 1).sort((a, b) => a.pct - b.pct);
    const w = inUnit.find((t) => t.pct < 80);
    return w ?? inUnit[0] ?? null;
  }
  const weakUnits: UnitPrescription[] = [...weak, ...caution].map((u) => {
    const level = levelOf(u.pct);
    const weakType = typeForUnit(u.code);
    const typeShort = weakType ? shortName(weakType.name) : null;
    let prescription: string;
    if (level === 'weak') {
      prescription = `개념·기본 문제부터 다시 점검이 필요합니다${typeShort ? ` (특히 '${typeShort}' 유형)` : ''}.`;
    } else {
      prescription = `개념은 이해했으나 적용에서 실수가 있어 응용 문제 추가 훈련을 권장합니다${typeShort ? ` (특히 '${typeShort}' 유형)` : ''}.`;
    }
    return { unit: u, level, prescription, weakType };
  });

  // ── 액션플랜 (취약 우선 순서) ──
  const actionPlan: string[] = [];
  weakUnits.forEach((wp, i) => {
    actionPlan.push(`${i + 1}. ${shortName(wp.unit.name)} — ${wp.prescription}`);
  });
  if (advPct != null && advPct < 70 && (basicPct == null || basicPct >= 70)) {
    actionPlan.push(`${actionPlan.length + 1}. 변별 난이도(6+) 응용·심화 문제로 실전 감각 끌어올리기.`);
  }
  if (actionPlan.length === 0) {
    actionPlan.push('현재 수준이 안정적입니다. 기출·실전 모의로 마무리 점검하세요.');
  }

  return {
    readiness: { level: readinessLevel, ...readinessMeta },
    summary,
    difficultyInsight,
    weakUnits,
    strongUnits: strong,
    actionPlan,
  };
}

export { shortName as unitShortName };
