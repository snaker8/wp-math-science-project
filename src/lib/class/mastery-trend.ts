// ============================================================================
// 숙달 이력 — 주차별 추이 (순수 함수). 매쓰홀릭 「유형이력」(/score-history) 대응
// ----------------------------------------------------------------------------
// 실측(docs/benchmark/matholic/10 §1 · 스크린샷 2026-09-04): 학생 하나 · 기준일(2026/08/31) · 「이전 9주간 학습이력」
// 꺾은선 3개 — GREEN(마스터+잘함) · RED(불안정+약점+심각) · GRAY(미학습). 그 아래 그 시점의 판.
// 범례 카운트 `⭐59 🟩176 🟨119 🟥3 💀0 ⬜100 ❓0` 이 각 주의 y 값이다.
//
// 우리는 스냅샷 테이블 없이 그린다 — 숙달 API 가 문항별 채점 시각(at)을 주므로,
// 각 주의 일요일 24:00(KST) 까지 누적한 문항으로 판을 다시 판정하면 그 주의 값이 된다.
// (판정 규칙은 mastery-bands.judgeCell 과 동일 — 숙달 탭과 숫자가 어긋나지 않게)
// ============================================================================

import { judgeCell, type CellLevel } from './mastery-bands';
import { weekStartKST } from './learning-goals';

export interface TrendItem {
  /** 유형 코드 (판의 칸) */
  code: string;
  ok: boolean;
  /** 채점 시각 ISO */
  at: string;
}

export interface TrendPoint {
  /** 그 주 월요일 KST 날짜 "2026-08-31" */
  week: string;
  /** 그 주 일요일 KST 날짜 — 라벨용 */
  weekEnd: string;
  /** 누적 판정 — 판의 유형 수로 합이 고정된다 */
  counts: Record<CellLevel, number>;
  green: number;   // master + good
  red: number;     // shaky + weak + severe
  gray: number;    // none
  pending: number; // thin (판정 보류)
  /** 그 주에 새로 채점한 문항 */
  graded: number;
  correct: number;
  pct: number | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstDate(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * @param items     채점 문항 (유형 코드 · 정오 · 시각)
 * @param typeCodes 판 — 이 과목의 유형 전체 (미학습 = 판 − 손댄 유형)
 * @param asOf      기준 시각 (이 주가 마지막 점)
 * @param weeks     주 수 (매쓰홀릭 기본 9)
 */
export function weeklyTrend(items: TrendItem[], typeCodes: string[], asOf: Date | number | string, weeks = 9): TrendPoint[] {
  const asOfMs = asOf instanceof Date ? asOf.getTime() : typeof asOf === 'number' ? asOf : Date.parse(asOf);
  const lastStart = weekStartKST(asOfMs);
  const universe = new Set(typeCodes);

  // 시각순 정렬 — 주가 넘어갈 때마다 누적을 이어 간다 (주마다 처음부터 다시 세지 않는다)
  const sorted = items
    .map((it) => ({ ...it, t: Date.parse(it.at) }))
    .filter((it) => Number.isFinite(it.t))
    .sort((a, b) => a.t - b.t);

  const acc = new Map<string, { n: number; correct: number }>();
  let idx = 0;
  const out: TrendPoint[] = [];

  for (let w = weeks - 1; w >= 0; w -= 1) {
    const start = lastStart - w * WEEK_MS;
    const end = start + WEEK_MS;   // 다음 주 월요일 00:00 KST (미포함)
    let graded = 0; let correct = 0;
    while (idx < sorted.length && sorted[idx].t < end) {
      const it = sorted[idx];
      const c = acc.get(it.code) ?? { n: 0, correct: 0 };
      c.n += 1; if (it.ok) c.correct += 1;
      acc.set(it.code, c);
      if (it.t >= start) { graded += 1; if (it.ok) correct += 1; }
      idx += 1;
    }
    const counts: Record<CellLevel, number> = { master: 0, good: 0, shaky: 0, weak: 0, severe: 0, thin: 0, none: 0 };
    for (const code of universe) {
      const c = acc.get(code);
      counts[judgeCell(c?.n ?? 0, c?.correct ?? 0).level] += 1;
    }
    // 판 밖 코드(트리 갱신 전 분류)로 채점된 것도 판정엔 넣는다 — 미학습 수는 판 기준이라 안 건드린다
    for (const [code, c] of acc) {
      if (universe.has(code)) continue;
      const lv = judgeCell(c.n, c.correct).level;
      if (lv !== 'none') counts[lv] += 1;
    }
    out.push({
      week: kstDate(start),
      weekEnd: kstDate(end - 1),
      counts,
      green: counts.master + counts.good,
      red: counts.shaky + counts.weak + counts.severe,
      gray: counts.none,
      pending: counts.thin,
      graded, correct,
      pct: graded > 0 ? Math.round((correct * 100) / graded) : null,
    });
  }
  return out;
}
