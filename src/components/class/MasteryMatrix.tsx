'use client';

// ============================================================================
// 반 허브 ▸ 숙달 — 유형 숙달 매트릭스 (매쓰홀릭 유형분석 /ug-score 대응)
// ----------------------------------------------------------------------------
// docs/PLAN_CLASS_HUB_REBUILD.md 단계 5 · 조사 docs/benchmark/matholic/08-type-analysis.md
//
// 매쓰홀릭 화면 그대로: 행 = 단원, 열 = 난이도(4/6단계), 칸 하나 = 유형 하나, 색 = 숙달.
// 우측에서 학생을 고르면 그 학생 색으로 다시 칠하고, 칸을 눌러 모은 뒤 그 자리에서 과제로 낸다.
//
// 우리 트리 대응 (lib/class/mastery-bands.ts 머리말):
//   행 = 중단원(depth3) · 칸 = 소단원(depth4) × 난이도 밴드 · 칸 안 세부유형은 문제 뽑을 때 분산.
//
// 매쓰홀릭에 있고 여기 있는 것:
//   4단계/6단계 토글 · 학생 선택 · 칸/행/열 덩어리 선택 · 선택된 칸 N + 과제 만들기 ·
//   ● 추정 칸(AI 예측 대응 — 규칙 추정, 근거 문장 포함, 토글 · **기본 꺼짐**) · 범례 실측 카운트 ·
//   기간(유형분석 시작일) · 과정 전체/데이터 있는 단원만 · 칸 툴팁 + 대표 문제 미리보기
// 매쓰홀릭에 있고 여기 없는 것 (자료가 없다): 교재별 매트릭스 전환 · 서술형/고난도 탭 ·
//   9주 이력 차트(단계 6 — 같은 재료로 그린다).
//
// ★ 판(매트릭스)은 채점의 산출물이 아니다 — 대표(2026-09-04): "모든 과정마다의 히트맵이 있다."
//   과정(과목)의 수학비서 트리 전체(소단원 × 난이도)가 판이고, 채점은 그 판을 색칠할 뿐이다.
//   문제은행에 문제가 없는 칸도 판에 있다(「문제 없음」) — 그게 「미학습」과 다른 것이 보여야
//   문제은행 완성도(문제 있는 칸/전체)와 학습 진행도(학습한 칸/문제 있는 칸)를 따로 잴 수 있다.
// ★ 판정은 1~2문항에 색을 주지 않는다(판정 보류). 추정은 형제 칸 근거가 있을 때만, 원형으로.
// ★ 순서(대표, 2026-09-04): 실제 채점으로 히트맵을 먼저 완성 → 예측은 그 다음 단계. 그래서 추정은 기본 꺼짐.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertCircle, RotateCcw, ClipboardList, X } from 'lucide-react';
import type { MasteryPayload, MasteryItem } from '@/app/api/classes/[classId]/mastery/route';
import {
  BAND_SCHEMES, type BandScheme, bandOf, judgeCell, LEVEL_LABEL, type CellLevel,
  isWeakLevel, midOf, unitOf, cellKey, subjectOf,
} from '@/lib/class/mastery-bands';
import { inferCells, type InferredCell } from '@/lib/class/mastery-infer';
import { GenerateAssignmentModal, previewText, type CellSpec } from './GenerateAssignmentModal';

interface Props {
  classId: string;
  className: string;
  students: Array<{ id: string; name: string }>;
}

interface Square {
  key: string;
  unit: string;
  band: string;
  level: CellLevel;
  pct: number | null;
  n: number;
  correct: number;
  supply: number;
  inferred: boolean;
  basis?: string;
}

/** 칸 색 — 데이터 그래픽이라 채도색을 쓴다 (design guard allowlist) */
const LEVEL_CLASS: Record<CellLevel, string> = {
  master: 'bg-emerald-300',
  good: 'bg-emerald-500/75',
  shaky: 'bg-amber-400/80',
  weak: 'bg-red-500/80',
  severe: 'bg-red-800',
  thin: 'bg-white/20 border border-dashed border-white/50',
  none: 'bg-white/[.06] border border-white/10',
};
const LEVEL_ORDER: CellLevel[] = ['master', 'good', 'shaky', 'weak', 'severe', 'thin', 'none'];
/** 판에는 있는데 문제은행에 문제가 없는 칸 — 미학습과 구분 (문제은행 완성도의 구멍) */
const NO_SUPPLY_CLASS = 'border border-dashed border-white/15 bg-transparent';

const PREF_SCHEME = 'mastery:scheme';
const PREF_INFER = 'mastery:infer';

function readPref<T>(key: string, fallback: T, parse: (v: string) => T | null): T {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return fallback;
    return parse(v) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* 저장 못 해도 화면은 된다 */ }
}

function pctTone(pct: number | null): string {
  if (pct == null) return 'text-content-tertiary';
  if (pct >= 80) return 'text-emerald-400';
  if (pct < 60) return 'text-red-400';
  return 'text-content-primary';
}

export function MasteryMatrix({ classId, className, students }: Props) {
  const [data, setData] = useState<MasteryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [subject, setSubject] = useState<string>('');
  const [scheme, setScheme] = useState<BandScheme>(4);
  // ★ 기본 꺼짐 — 대표 판단(2026-09-04): 예측은 실제 채점으로 유형 히트맵을 완성한 뒤에 갈 기능.
  //   지금은 「우리 학생이 실제로 푼 것」만 색이다. 켜면 원형 추정 칸이 보인다.
  const [showInfer, setShowInfer] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [studentSel, setStudentSel] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<Square | null>(null);
  const [previews, setPreviews] = useState<Map<string, { content: string; difficulty: number | null } | null>>(new Map());
  const [gen, setGen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const previewReq = useRef(0);

  useEffect(() => {
    setScheme(readPref(PREF_SCHEME, 4, (v) => (v === '6' ? 6 : v === '4' ? 4 : null)));
    setShowInfer(readPref(PREF_INFER, false, (v) => (v === '0' ? false : v === '1' ? true : null)));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/mastery`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const p = json as MasteryPayload;
      setData(p);
      setSubject((cur) => (cur && p.subjects.some((s) => s.code === cur) ? cur : (p.subjects[0]?.code ?? '')));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [classId]);
  useEffect(() => { void load(); }, [load]);

  const bands = BAND_SCHEMES[scheme];

  // ── 트리 (이 과목) ──
  const tree = useMemo(() => {
    const names = new Map<string, string>();
    const l1: Array<{ code: string; name: string }> = [];
    const midsByL1 = new Map<string, string[]>();
    const unitsByMid = new Map<string, string[]>();
    if (!data || !subject) return { names, l1, midsByL1, unitsByMid };
    for (const n of data.tree) {
      if (subjectOf(n.code) !== subject) continue;
      names.set(n.code, n.name);
      if (n.depth === 2) { l1.push({ code: n.code, name: n.name }); midsByL1.set(n.code, []); }
      else if (n.depth === 3) {
        const parent = n.code.split('-').slice(0, 2).join('-');
        if (!midsByL1.has(parent)) { midsByL1.set(parent, []); l1.push({ code: parent, name: parent }); }
        midsByL1.get(parent)!.push(n.code);
        unitsByMid.set(n.code, []);
      } else if (n.depth === 4) {
        const mid = midOf(n.code)!;
        if (!unitsByMid.has(mid)) unitsByMid.set(mid, []);
        unitsByMid.get(mid)!.push(n.code);
      }
    }
    return { names, l1, midsByL1, unitsByMid };
  }, [data, subject]);

  // ── 공급 (소단원 × 밴드) ──
  const supplyByCell = useMemo(() => {
    const m = new Map<string, number>();
    if (!data) return m;
    for (const s of data.supply) {
      if (subjectOf(s.unit) !== subject) continue;
      const b = bandOf(s.d, scheme);
      if (!b) continue;
      const k = cellKey(s.unit, b);
      m.set(k, (m.get(k) ?? 0) + s.count);
    }
    return m;
  }, [data, subject, scheme]);

  // ── 문항 (과목 · 기간 · 학생) ──
  const itemsAll = useMemo<MasteryItem[]>(() => {
    if (!data) return [];
    return data.items.filter((it) => {
      if (subjectOf(it.code) !== subject) return false;
      const day = it.at.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [data, subject, from, to]);

  const itemsView = useMemo(
    () => (studentSel ? itemsAll.filter((it) => it.s === studentSel) : itemsAll),
    [itemsAll, studentSel],
  );

  const itemCountByStudent = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of itemsAll) m.set(it.s, (m.get(it.s) ?? 0) + 1);
    return m;
  }, [itemsAll]);

  // ── 관측 칸 · 행 합계 ──
  const observed = useMemo(() => {
    const cells = new Map<string, { n: number; correct: number }>();
    const rowTotals = new Map<string, { n: number; correct: number; noDiff: number }>();
    for (const it of itemsView) {
      const mid = midOf(it.code);
      if (mid) {
        const r = rowTotals.get(mid) ?? { n: 0, correct: 0, noDiff: 0 };
        r.n += 1; if (it.ok) r.correct += 1; if (it.d == null) r.noDiff += 1;
        rowTotals.set(mid, r);
      }
      const unit = unitOf(it.code);
      const band = bandOf(it.d, scheme);
      if (!unit || !band) continue;
      const k = cellKey(unit, band);
      const c = cells.get(k) ?? { n: 0, correct: 0 };
      c.n += 1; if (it.ok) c.correct += 1;
      cells.set(k, c);
    }
    return { cells, rowTotals };
  }, [itemsView, scheme]);

  // ── 판 = 이 과정의 트리 전체 (소단원 × 밴드). 문제 유무와 무관하게 칸은 항상 있다 ──
  const universe = useMemo(() => {
    const out: Array<{ unit: string; band: string }> = [];
    const seen = new Set<string>();
    for (const units of tree.unitsByMid.values()) {
      for (const u of units) for (const b of bands) { out.push({ unit: u, band: b.key }); seen.add(cellKey(u, b.key)); }
    }
    // 트리에 없는 코드로 채점된 것도 자리는 준다 (트리 갱신 전 분류)
    for (const k of observed.cells.keys()) {
      if (!seen.has(k)) { const [unit, band] = k.split('|'); out.push({ unit, band }); }
    }
    return out;
  }, [tree, bands, observed]);

  const inferred = useMemo<Map<string, InferredCell>>(() => {
    if (!showInfer) return new Map();
    const obs = Array.from(observed.cells.entries()).map(([k, c]) => {
      const [unit, band] = k.split('|');
      return { unit, band, n: c.n, correct: c.correct };
    });
    return inferCells(obs, universe, tree.unitsByMid, bands, tree.names);
  }, [showInfer, observed, universe, tree, bands]);

  // ── 칸 만들기 ──
  const squareOf = useCallback((unit: string, band: string): Square => {
    const key = cellKey(unit, band);
    const c = observed.cells.get(key);
    const j = judgeCell(c?.n ?? 0, c?.correct ?? 0);
    const inf = (j.level === 'none' || j.level === 'thin') ? inferred.get(key) : undefined;
    return {
      key, unit, band,
      level: inf ? inf.level : j.level,
      pct: inf ? inf.pct : j.pct,
      n: c?.n ?? 0, correct: c?.correct ?? 0,
      supply: supplyByCell.get(key) ?? 0,
      inferred: !!inf,
      basis: inf?.basis,
    };
  }, [observed, inferred, supplyByCell]);

  const rows = useMemo(() => {
    const out: Array<{
      l1: { code: string; name: string };
      mids: Array<{ code: string; name: string; byBand: Square[][]; total: { n: number; correct: number; noDiff: number } | undefined }>;
    }> = [];
    for (const l1 of tree.l1) {
      const mids = (tree.midsByL1.get(l1.code) ?? []).map((mid) => {
        const units = tree.unitsByMid.get(mid) ?? [];
        const byBand = bands.map((b) => units.map((u) => squareOf(u, b.key)));
        return { code: mid, name: tree.names.get(mid) ?? mid, byBand, total: observed.rowTotals.get(mid) };
      }).filter((m) => !hideEmpty || m.total || m.byBand.some((sq) => sq.some((s) => s.inferred)));
      if (mids.length > 0) out.push({ l1, mids });
    }
    return out;
  }, [tree, bands, squareOf, observed, hideEmpty]);

  const allSquares = useMemo(() => rows.flatMap((r) => r.mids.flatMap((m) => m.byBand.flat())), [rows]);

  const legendCounts = useMemo(() => {
    const c: Record<CellLevel, number> = { master: 0, good: 0, shaky: 0, weak: 0, severe: 0, thin: 0, none: 0 };
    let inferredCount = 0;
    let withSupply = 0;   // 문제은행에 문제가 있는 칸
    let studied = 0;      // 학생이 실제로 푼 칸 (n > 0)
    for (const s of allSquares) {
      c[s.level] += 1;
      if (s.inferred) inferredCount += 1;
      if (s.supply > 0) withSupply += 1;
      if (s.n > 0) studied += 1;
    }
    const total = allSquares.length;
    return {
      c, inferredCount, total, withSupply, studied,
      noSupply: total - withSupply,
      /** 문제은행 완성도 — 판의 칸 중 문제가 있는 비율 */
      bankPct: total > 0 ? Math.round((withSupply * 100) / total) : 0,
      /** 학습 진행도 — 문제 있는 칸 중 학생이 푼 비율 */
      studyPct: withSupply > 0 ? Math.round((studied * 100) / withSupply) : 0,
    };
  }, [allSquares]);

  const bandSupply = useMemo(
    () => bands.map((b) => allSquares.filter((s) => s.band === b.key).reduce((n, s) => n + s.supply, 0)),
    [bands, allSquares],
  );

  // ── 선택 ──
  const toggleKeys = (keys: string[]) => {
    if (keys.length === 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = keys.every((k) => next.has(k));
      for (const k of keys) { if (allOn) next.delete(k); else next.add(k); }
      return next;
    });
  };
  const selectWeak = () => {
    setSelected(new Set(allSquares.filter((s) => isWeakLevel(s.level) && s.supply > 0).map((s) => s.key)));
  };

  // ── 대표 문제 미리보기 (클릭한 칸) ──
  const focusSquare = useCallback(async (sq: Square) => {
    setFocus(sq);
    if (previews.has(sq.key) || sq.supply === 0) return;
    const reqId = ++previewReq.current;
    const band = bands.find((b) => b.key === sq.band);
    try {
      const res = await fetch('/api/clinic/cell-problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cells: [{ unit: sq.unit, levels: band?.levels ?? [] }], preview: true }),
      });
      const json = await res.json();
      if (reqId !== previewReq.current) return;
      const p = res.ok ? (json.groups?.[0]?.problems?.[0] ?? null) : null;
      setPreviews((prev) => new Map(prev).set(sq.key, p ? { content: p.content ?? '', difficulty: p.difficulty ?? null } : null));
    } catch {
      /* 미리보기는 있으면 좋은 것 — 실패해도 칸 정보는 그대로 */
    }
  }, [bands, previews]);

  const cellSpecs = useMemo<CellSpec[]>(() => {
    const specs: CellSpec[] = [];
    for (const k of selected) {
      const [unit, bandKey] = k.split('|');
      const band = bands.find((b) => b.key === bandKey);
      if (!band) continue;
      specs.push({ unit, levels: band.levels, label: `${tree.names.get(unit) ?? unit} · ${band.label}` });
    }
    return specs;
  }, [selected, bands, tree]);

  const targetStudentIds = studentSel ? [studentSel] : students.map((s) => s.id);
  // ── 렌더 ──
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-content-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        채점 기록에서 숙달을 계산하는 중
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
        <AlertCircle className="h-4 w-4" />
        {error}
      </div>
    );
  }
  if (!data || data.subjects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 px-6 py-14 text-center">
        <p className="text-sm text-content-secondary">아직 이 반의 채점 기록이 없어 숙달을 그릴 수 없습니다.</p>
        <p className="mt-1 text-xs text-content-muted">
          시험지를 QR 로 채점하면 그 문항의 단원·난이도가 여기에 칸으로 쌓입니다.
          {data && data.unplaced > 0 && ` (유형이 안 붙은 문항 ${data.unplaced}개는 놓지 못했습니다)`}
        </p>
      </div>
    );
  }

  const subjectMeta = data.subjects.find((s) => s.code === subject);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_248px]">
      <div className="min-w-0">
        {/* 도구 줄 */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <select
            value={subject}
            onChange={(e) => { setSubject(e.target.value); setSelected(new Set()); setFocus(null); }}
            className="rounded-lg border border-white/10 bg-white/[.03] px-2.5 py-1.5 text-sm text-content-primary focus:border-white/20 focus:outline-none"
          >
            {data.subjects.map((s) => (
              <option key={s.code} value={s.code} className="bg-black">{s.name} · {s.items}문항</option>
            ))}
          </select>

          <span className="inline-flex overflow-hidden rounded-lg border border-white/10">
            {([4, 6] as const).map((n) => (
              <button
                key={n}
                onClick={() => { setScheme(n); writePref(PREF_SCHEME, String(n)); setSelected(new Set()); }}
                className={`px-2.5 py-1.5 transition-colors ${scheme === n ? 'bg-white text-black' : 'text-content-secondary hover:text-content-primary'}`}
              >
                {n}단계
              </button>
            ))}
          </span>

          <label className="inline-flex cursor-pointer items-center gap-1.5 text-content-secondary">
            <input
              type="checkbox"
              checked={showInfer}
              onChange={(e) => { setShowInfer(e.target.checked); writePref(PREF_INFER, e.target.checked ? '1' : '0'); }}
              className="h-3.5 w-3.5 accent-white"
            />
            추정 표시
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-content-secondary">
            <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} className="h-3.5 w-3.5 accent-white" />
            데이터 있는 단원만
          </label>

          <span className="ml-auto inline-flex items-center gap-1 text-content-tertiary">
            기간
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-white/10 bg-white/[.03] px-1.5 py-1 text-content-primary" />
            ~
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-white/10 bg-white/[.03] px-1.5 py-1 text-content-primary" />
            {(from || to) && (
              <button onClick={() => { setFrom(''); setTo(''); }} className="text-content-tertiary hover:text-content-primary" title="기간 지우기">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </div>

        {/* 범례 — 매쓰홀릭처럼 실측 카운트를 같이 */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-content-tertiary">
          {LEVEL_ORDER.map((lv) => (
            <span key={lv} className="inline-flex items-center gap-1">
              <span className={`inline-block h-2.5 w-2.5 rounded-[2px] ${LEVEL_CLASS[lv]}`} />
              {LEVEL_LABEL[lv]}{' '}
              <span className="tabular-nums text-content-muted">
                {lv === 'none' ? legendCounts.c.none - legendCounts.noSupply : legendCounts.c[lv]}
              </span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1" title="판에는 있지만 문제은행에 이 단원·난이도 문제가 아직 없는 칸">
            <span className={`inline-block h-2.5 w-2.5 rounded-[2px] ${NO_SUPPLY_CLASS}`} />
            문제 없음 <span className="tabular-nums text-content-muted">{legendCounts.noSupply}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500/75 opacity-70" />
            ● 추정 <span className="tabular-nums text-content-muted">{legendCounts.inferredCount}</span>
          </span>
          <span className="ml-auto text-content-muted" title="문제은행 완성도 = 문제 있는 칸 / 판 전체 · 학습 진행도 = 학생이 푼 칸 / 문제 있는 칸">
            판 {legendCounts.total}칸 · 문제은행 완성도{' '}
            <span className="tabular-nums text-content-secondary">{legendCounts.withSupply}/{legendCounts.total} ({legendCounts.bankPct}%)</span>
            {' · '}{studentSel ? (students.find((s) => s.id === studentSel)?.name ?? '학생') : '반 전체'} 진행도{' '}
            <span className="tabular-nums text-content-secondary">{legendCounts.studied}/{legendCounts.withSupply} ({legendCounts.studyPct}%)</span>
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-6 py-12 text-center text-sm text-content-secondary">
            {subjectMeta ? `${subjectMeta.name} 에 표시할 단원이 없습니다.` : '표시할 단원이 없습니다.'}
            <p className="mt-1 text-xs text-content-muted">수학비서 트리에 이 과목 단원이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-content-tertiary">
                  <th className="w-56 px-3 py-2 text-left font-medium">단원</th>
                  {bands.map((b, i) => (
                    <th key={b.key} className="whitespace-nowrap px-2 py-2 text-left font-medium">
                      <button
                        onClick={() => toggleKeys(allSquares.filter((s) => s.band === b.key && s.supply > 0).map((s) => s.key))}
                        className="group inline-flex flex-col items-start leading-tight hover:text-content-primary"
                        title="이 열 전체 선택/해제"
                      >
                        <span>{b.label} <span className="text-content-muted">{b.levels[0]}{b.levels.length > 1 ? `~${b.levels[b.levels.length - 1]}` : ''}</span></span>
                        <span className="text-[10px] tabular-nums text-content-muted">문제 {bandSupply[i]}</span>
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">전체</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <RowGroup
                    key={g.l1.code}
                    group={g}
                    selected={selected}
                    focusKey={focus?.key ?? null}
                    onToggle={(sq) => { if (sq.supply > 0) toggleKeys([sq.key]); void focusSquare(sq); }}
                    onToggleRow={(keys) => toggleKeys(keys)}
                    names={tree.names}
                    bandLabel={(k) => bands.find((b) => b.key === k)?.label ?? k}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 우측 패널 — 매쓰홀릭: 선택된 유형 N / 과제 만들기 / 학생 목록 */}
      <aside className="space-y-3 self-start lg:sticky lg:top-4">
        <div className="rounded-xl border border-white/10 p-3">
          <p className="text-[11px] uppercase tracking-wider text-content-tertiary">선택된 칸</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-content-primary">{selected.size}</p>
          <div className="mt-2 flex flex-col gap-1.5">
            <button
              onClick={() => setGen(true)}
              disabled={selected.size === 0 || targetStudentIds.length === 0}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              과제 만들기
            </button>
            <div className="flex gap-1.5">
              <button
                onClick={selectWeak}
                className="flex-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-content-secondary transition-colors hover:border-white/20 hover:text-content-primary"
              >
                약한 칸 모두
              </button>
              <button
                onClick={() => setSelected(new Set())}
                disabled={selected.size === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-content-secondary transition-colors hover:border-white/20 hover:text-content-primary disabled:opacity-40"
              >
                <RotateCcw className="h-3 w-3" />
                초기화
              </button>
            </div>
          </div>
          {done && <p className="mt-2 text-xs text-emerald-400">{done}</p>}
        </div>

        <div className="rounded-xl border border-white/10 p-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-content-tertiary">학생</p>
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => { setStudentSel(null); setSelected(new Set()); }}
              className={`flex items-center justify-between rounded-md px-2 py-1 text-left text-sm transition-colors ${
                studentSel === null ? 'bg-white text-black' : 'text-content-secondary hover:bg-white/5 hover:text-content-primary'
              }`}
            >
              반 전체
              <span className={`text-xs tabular-nums ${studentSel === null ? 'text-black/60' : 'text-content-muted'}`}>{itemsAll.length}</span>
            </button>
            {students.map((s) => {
              const on = studentSel === s.id;
              const cnt = itemCountByStudent.get(s.id) ?? 0;
              return (
                <button
                  key={s.id}
                  onClick={() => { setStudentSel(s.id); setSelected(new Set()); }}
                  className={`flex items-center justify-between rounded-md px-2 py-1 text-left text-sm transition-colors ${
                    on ? 'bg-white text-black' : cnt === 0 ? 'text-content-muted hover:bg-white/5' : 'text-content-secondary hover:bg-white/5 hover:text-content-primary'
                  }`}
                >
                  {s.name}
                  <span className={`text-xs tabular-nums ${on ? 'text-black/60' : 'text-content-muted'}`}>{cnt || '—'}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 p-3">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-content-tertiary">칸 정보</p>
          {focus ? (
            <div className="text-xs">
              <p className="text-sm text-content-primary">{tree.names.get(focus.unit) ?? focus.unit}</p>
              <p className="mt-0.5 text-content-tertiary">
                {bands.find((b) => b.key === focus.band)?.label} ·{' '}
                <span className={focus.inferred ? 'text-content-secondary' : pctTone(focus.pct)}>
                  {LEVEL_LABEL[focus.level]}{focus.pct != null && ` ${focus.pct}%`}
                </span>
                {focus.inferred && ' (추정)'}
              </p>
              <p className="mt-1 text-content-muted">
                채점 {focus.n}문항{focus.n > 0 && ` · 정답 ${focus.correct}`} · 문제은행 {focus.supply}개
              </p>
              {focus.basis && <p className="mt-1 leading-relaxed text-content-muted">근거 — {focus.basis}</p>}
              {focus.level === 'thin' && (
                <p className="mt-1 leading-relaxed text-content-muted">문항이 3개 미만이라 색을 주지 않았습니다.</p>
              )}
              {focus.supply === 0 && (
                <p className="mt-1 leading-relaxed text-content-muted">문제은행에 이 단원·난이도 문제가 아직 없습니다. 분류가 붙으면 채워집니다.</p>
              )}
              {focus.supply > 0 && (
                <div className="mt-2 rounded-md border border-white/10 bg-white/[.03] p-2">
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-content-muted">대표 문제</p>
                  {previews.has(focus.key) ? (
                    previews.get(focus.key) ? (
                      <p className="leading-relaxed text-content-secondary">
                        {previewText(previews.get(focus.key)!.content)}
                        {previews.get(focus.key)!.difficulty != null && (
                          <span className="ml-1 text-content-muted">· 난이도 {previews.get(focus.key)!.difficulty}</span>
                        )}
                      </p>
                    ) : (
                      <p className="text-content-muted">이 학원이 낼 수 있는 문제가 없습니다.</p>
                    )
                  ) : (
                    <p className="inline-flex items-center gap-1 text-content-muted"><Loader2 className="h-3 w-3 animate-spin" /> 불러오는 중</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-content-muted">
              칸을 누르면 여기에 문항 수·정답률·근거·대표 문제가 나옵니다. 단원 이름을 누르면 그 줄, 열 이름을 누르면 그 열이 통째로 선택됩니다.
            </p>
          )}
        </div>
      </aside>

      {gen && (
        <GenerateAssignmentModal
          classId={classId}
          studentIds={targetStudentIds}
          kind="cells"
          cells={cellSpecs}
          className={className}
          onClose={() => setGen(false)}
          onDone={() => {
            setGen(false);
            setSelected(new Set());
            setDone(`과제를 냈습니다 · ${studentSel ? (students.find((s) => s.id === studentSel)?.name ?? '') : `학생 ${students.length}명`}`);
            setTimeout(() => setDone(null), 6000);
          }}
        />
      )}
    </div>
  );
}

// ── 행 묶음 (대단원 → 중단원 줄) ──
function RowGroup({
  group, selected, focusKey, onToggle, onToggleRow, names, bandLabel,
}: {
  group: {
    l1: { code: string; name: string };
    mids: Array<{ code: string; name: string; byBand: Square[][]; total: { n: number; correct: number; noDiff: number } | undefined }>;
  };
  selected: Set<string>;
  focusKey: string | null;
  onToggle: (sq: Square) => void;
  onToggleRow: (keys: string[]) => void;
  names: Map<string, string>;
  bandLabel: (k: string) => string;
}) {
  return (
    <>
      <tr className="border-b border-white/5 bg-white/[.02]">
        <td colSpan={99} className="px-3 py-1.5 text-[11px] font-medium tracking-wide text-content-tertiary">
          {group.l1.name}
        </td>
      </tr>
      {group.mids.map((m) => {
        const rowKeys = m.byBand.flat().filter((s) => s.supply > 0).map((s) => s.key);
        const total = m.total;
        const pct = total && total.n > 0 ? Math.round((total.correct * 100) / total.n) : null;
        return (
          <tr key={m.code} className="border-b border-white/5 last:border-0 hover:bg-white/[.03]">
            <td className="px-3 py-1.5 align-top">
              <button
                onClick={() => onToggleRow(rowKeys)}
                disabled={rowKeys.length === 0}
                className="text-left text-xs text-content-secondary transition-colors hover:text-content-primary disabled:cursor-default disabled:hover:text-content-secondary"
                title="이 줄 전체 선택/해제"
              >
                {m.name}
              </button>
            </td>
            {m.byBand.map((squares, i) => (
              <td key={i} className="px-2 py-1.5 align-top">
                <div className="flex flex-wrap gap-1">
                  {squares.map((sq) => {
                    const sel = selected.has(sq.key);
                    const title = [
                      `${names.get(sq.unit) ?? sq.unit} · ${bandLabel(sq.band)}`,
                      `${LEVEL_LABEL[sq.level]}${sq.pct != null ? ` ${sq.pct}%` : ''}${sq.inferred ? ' (추정)' : ''} · 채점 ${sq.n}문항 · 문제은행 ${sq.supply}개`,
                      sq.basis ? `근거: ${sq.basis}` : '',
                    ].filter(Boolean).join('\n');
                    return (
                      <button
                        key={sq.key}
                        onClick={() => onToggle(sq)}
                        title={sq.supply === 0 && sq.n === 0 ? `${title}\n(문제은행에 문제가 없어 과제로는 못 냅니다)` : title}
                        aria-pressed={sel}
                        className={`h-3.5 w-3.5 shrink-0 transition-transform hover:scale-125 ${
                          sq.inferred ? 'rounded-full opacity-70' : 'rounded-[3px]'
                        } ${sq.supply === 0 && sq.n === 0 ? NO_SUPPLY_CLASS : LEVEL_CLASS[sq.level]} ${sel ? 'ring-2 ring-white ring-offset-1 ring-offset-black' : ''} ${
                          focusKey === sq.key && !sel ? 'ring-1 ring-white/60' : ''
                        }`}
                      />
                    );
                  })}
                </div>
              </td>
            ))}
            <td className={`px-3 py-1.5 text-right align-top text-xs tabular-nums ${pctTone(pct)}`} title={total?.noDiff ? `난이도 미상 ${total.noDiff}문항 포함` : undefined}>
              {pct == null ? <span className="text-content-muted">—</span> : `${pct}%`}
              {total && <span className="ml-1 text-content-muted">{total.n}</span>}
            </td>
          </tr>
        );
      })}
    </>
  );
}
