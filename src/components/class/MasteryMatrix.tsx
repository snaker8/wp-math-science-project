'use client';

// ============================================================================
// 반 허브 ▸ 숙달 — 유형 숙달 매트릭스 (매쓰홀릭 유형분석 /ug-score 대응)
// ----------------------------------------------------------------------------
// docs/PLAN_CLASS_HUB_REBUILD.md 단계 5 · 조사 docs/benchmark/matholic/08-type-analysis.md
//
// ★ 판의 원리 (대표, 2026-09-04): "우리 유형분석 판은 수학비서 코드로 분류된 유형별로 만들고,
//   거기에 난이도별로 문제들이 적층되어, 학생들이 그걸 풀었을 때 완성도 색이 변하는" 것.
//
//   판 = 과정(과목)의 수학비서 유형(depth5) 전체 — 과정마다 고정. 채점의 산출물이 아니다.
//   칸 = 유형 하나. 칸 안에 개념→기본→실력→심화 층이 세로로 쌓인다(아래가 개념).
//   층 = 그 유형·난이도의 문제은행 문제. 없으면 점선(문제 없음), 있는데 안 풀면 회색(미학습),
//        풀면 색 — 색조=정답률(초록/노랑/빨강), 진하기=얼마나 풀었나(푼 문제/있는 문제).
//   지금은 문제가 적어 판이 듬성하다 — 대표: "당연히 문제량이 작으니. 실제 고등부 자료가 많으니까."
//   판이 듬성한 건 판의 문제가 아니라 문제은행 완성도의 문제고, 그 숫자를 상단에 그대로 보인다.
//
// 매쓰홀릭에 있고 여기 있는 것:
//   4단계/6단계 · 학생 선택 · 칸/줄 덩어리 선택 · 「선택된 칸 N + 과제 만들기」 · 범례 실측 카운트 ·
//   기간 · 대단원 필터 · 칸 툴팁 + 대표 문제 · ● 추정(규칙, 근거 문장, 토글 — **기본 꺼짐**)
// ★ 순서(대표): 실데이터로 판 완성 → 예측은 그 다음. 그래서 추정은 기본 꺼짐.
// ★ 판정은 1~2문항에 색 판정을 주지 않는다(판정 보류).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertCircle, RotateCcw, ClipboardList, X } from 'lucide-react';
import type { MasteryPayload, MasteryItem } from '@/app/api/classes/[classId]/mastery/route';
import {
  BAND_SCHEMES, type BandScheme, bandOf, LEVEL_LABEL, type CellLevel, isWeakLevel,
  midOf, unitOf, depthOf, cellKey, subjectOf, summarizeType, type TypeLayer, type TypeSummary,
} from '@/lib/class/mastery-bands';
import { inferCells, type InferredCell } from '@/lib/class/mastery-infer';
import { GenerateAssignmentModal, previewText, type CellSpec } from './GenerateAssignmentModal';

interface Props {
  classId: string;
  className: string;
  students: Array<{ id: string; name: string }>;
  /** 이력 탭 「이 시점의 판 보기」 — 이 날짜까지의 채점으로 연다 */
  initialTo?: string;
}

/** 칸 = 유형 하나 */
interface TypeCell {
  code: string;
  name: string;
  unit: string;
  layers: TypeLayer[];          // bands 순서 (개념 → 심화)
  summary: TypeSummary;
  /** 표시 단계 — 관측 판정, 없으면 추정 */
  level: CellLevel;
  inferred: InferredCell | null;
  /** 이 유형이 놓이는 난이도 열 — 문제은행에 가장 많은 층(같으면 쉬운 쪽). 문제도 채점도 없으면 null */
  repBand: string | null;
}

const LEVEL_ORDER: CellLevel[] = ['master', 'good', 'shaky', 'weak', 'severe', 'thin', 'none'];
/**
 * 칸 색 — 매쓰홀릭 유형분석 실측(스크린샷 2026-09-04): 22px 안팎의 **진한 단색 사각형**.
 * 마스터 초록+별 · 잘함 초록 · 불안정 노랑 · 약점 빨강 · 심각 진빨강 · 미학습 회색 · 판정 보류 회색+? · 예측은 원형.
 * 검은 배경에서도 한눈에 읽혀야 한다 — 반투명·점선 금지.
 */
const CELL_CLASS: Record<CellLevel, string> = {
  master: 'bg-emerald-400 text-black',
  good: 'bg-emerald-500 text-black',
  shaky: 'bg-amber-400 text-black',
  weak: 'bg-red-500 text-white',
  severe: 'bg-red-700 text-white',
  thin: 'bg-zinc-500 text-black',
  none: 'bg-zinc-600 text-white',
};
const LEGEND_SWATCH: Record<CellLevel, string> = {
  master: 'bg-emerald-400', good: 'bg-emerald-500', shaky: 'bg-amber-400', weak: 'bg-red-500',
  severe: 'bg-red-700', thin: 'bg-zinc-500', none: 'bg-zinc-600',
};

const PREF_SCHEME = 'mastery:scheme';
const PREF_INFER = 'mastery:infer';
const PSEUDO_TYPE_NAME = '(유형 미지정)';

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

export function MasteryMatrix({ classId, className, students, initialTo }: Props) {
  const [data, setData] = useState<MasteryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [subject, setSubject] = useState<string>('');
  const [scheme, setScheme] = useState<BandScheme>(4);
  // ★ 기본 꺼짐 — 예측은 실제 채점으로 판을 완성한 뒤 갈 기능 (대표 2026-09-04)
  const [showInfer, setShowInfer] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(false);
  /** 문제은행에 문제가 없는 유형 — 매쓰홀릭 판엔 없다. 기본 숨김, 문제은행 완성도 숫자로만 */
  const [showNoSupply, setShowNoSupply] = useState(false);
  /** 매쓰홀릭 「난이도」 칩 — 열을 켜고 끈다 */
  const [hiddenBands, setHiddenBands] = useState<Set<string>>(new Set());
  const [l1Filter, setL1Filter] = useState<string>('');
  const [studentSel, setStudentSel] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(initialTo ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<TypeCell | null>(null);
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

  const allBands = BAND_SCHEMES[scheme];
  const bands = useMemo(() => allBands.filter((b) => !hiddenBands.has(b.key)), [allBands, hiddenBands]);

  // ── 문항 (과목 · 기간) ──
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

  // ── 트리 (이 과목) — 대단원 → 중단원 → 소단원 → 유형(칸) ──
  const tree = useMemo(() => {
    const names = new Map<string, string>();
    const l1: Array<{ code: string; name: string }> = [];
    const midsByL1 = new Map<string, string[]>();
    const unitsByMid = new Map<string, string[]>();
    const typesByUnit = new Map<string, string[]>();
    if (!data || !subject) return { names, l1, midsByL1, unitsByMid, typesByUnit };
    const ensure = <K,>(m: Map<K, string[]>, k: K) => { if (!m.has(k)) m.set(k, []); return m.get(k)!; };
    for (const n of data.tree) {
      if (subjectOf(n.code) !== subject) continue;
      names.set(n.code, n.name);
      const parts = n.code.split('-');
      if (n.depth === 2) { l1.push({ code: n.code, name: n.name }); ensure(midsByL1, n.code); }
      else if (n.depth === 3) { ensure(midsByL1, parts.slice(0, 2).join('-')).push(n.code); ensure(unitsByMid, n.code); }
      else if (n.depth === 4) { ensure(unitsByMid, midOf(n.code)!).push(n.code); ensure(typesByUnit, n.code); }
      else if (n.depth === 5) { ensure(typesByUnit, unitOf(n.code)!).push(n.code); }
    }
    // depth4 코드로만 분류된 문제·채점은 그 소단원의 「유형 미지정」 칸으로 — 판에서 사라지면 안 된다
    const pseudo = new Set<string>();
    for (const s of data.supply) if (subjectOf(s.code) === subject && depthOf(s.code) === 4) pseudo.add(s.code);
    for (const it of data.items) if (subjectOf(it.code) === subject && depthOf(it.code) === 4) pseudo.add(it.code);
    for (const code of pseudo) {
      if (!typesByUnit.has(code)) continue;
      const arr = typesByUnit.get(code)!;
      if (!arr.includes(code)) arr.push(code);
    }
    return { names, l1, midsByL1, unitsByMid, typesByUnit };
  }, [data, subject]);

  // ── 층별 공급 (유형 × 밴드) ──
  const supplyByLayer = useMemo(() => {
    const m = new Map<string, number>();
    if (!data) return m;
    for (const s of data.supply) {
      if (subjectOf(s.code) !== subject) continue;
      const b = bandOf(s.d, scheme);
      if (!b) continue;
      const k = cellKey(s.code, b);
      m.set(k, (m.get(k) ?? 0) + s.count);
    }
    return m;
  }, [data, subject, scheme]);

  // ── 관측 (유형 × 밴드) · 소단원 합계 ──
  const observed = useMemo(() => {
    const layers = new Map<string, { n: number; correct: number; pids: Set<string> }>();
    const noBand = new Map<string, { n: number; correct: number }>();
    const unitTotals = new Map<string, { n: number; correct: number }>();
    for (const it of itemsView) {
      const unit = unitOf(it.code);
      if (unit) {
        const r = unitTotals.get(unit) ?? { n: 0, correct: 0 };
        r.n += 1; if (it.ok) r.correct += 1;
        unitTotals.set(unit, r);
      }
      const band = bandOf(it.d, scheme);
      if (!band) {
        const c = noBand.get(it.code) ?? { n: 0, correct: 0 };
        c.n += 1; if (it.ok) c.correct += 1;
        noBand.set(it.code, c);
        continue;
      }
      const k = cellKey(it.code, band);
      const c = layers.get(k) ?? { n: 0, correct: 0, pids: new Set<string>() };
      c.n += 1; if (it.ok) c.correct += 1; c.pids.add(it.pid);
      layers.set(k, c);
    }
    return { layers, noBand, unitTotals };
  }, [itemsView, scheme]);

  const allTypeCodes = useMemo(() => {
    const out: string[] = [];
    for (const arr of tree.typesByUnit.values()) out.push(...arr);
    return out;
  }, [tree]);

  // ── 추정 (기본 꺼짐) — 형제 = 같은 소단원의 유형들 ──
  const inferred = useMemo<Map<string, InferredCell>>(() => {
    if (!showInfer) return new Map();
    const obs = Array.from(observed.layers.entries()).map(([k, c]) => {
      const [unit, band] = k.split('|');
      return { unit, band, n: c.n, correct: c.correct };
    });
    const universe = allTypeCodes.flatMap((code) => bands.map((b) => ({ unit: code, band: b.key })));
    return inferCells(obs, universe, tree.typesByUnit, bands, tree.names);
  }, [showInfer, observed, allTypeCodes, tree, bands]);

  // ── 칸 만들기 ──
  const cellOf = useCallback((code: string): TypeCell => {
    const layers: TypeLayer[] = allBands.map((b) => {
      const k = cellKey(code, b.key);
      const o = observed.layers.get(k);
      const supply = supplyByLayer.get(k) ?? 0;
      return { band: b.key, supply, solved: o ? o.pids.size : 0, n: o?.n ?? 0, correct: o?.correct ?? 0 };
    });
    const extra = observed.noBand.get(code);
    const summary = summarizeType(layers);
    if (extra) {
      // 난이도 미상 문항 — 층엔 못 놓지만 정답률 판정엔 넣는다
      summary.n += extra.n; summary.correct += extra.correct;
      const pct = Math.round((summary.correct * 100) / summary.n);
      summary.judgement = summary.n >= 3
        ? { level: pct >= 90 && summary.n >= 5 ? 'master' : pct >= 80 ? 'good' : pct >= 60 ? 'shaky' : pct >= 30 ? 'weak' : 'severe', pct }
        : { level: 'thin', pct };
    }
    let inf: InferredCell | null = null;
    if (summary.judgement.level === 'none' || summary.judgement.level === 'thin') {
      for (const b of allBands) { const c = inferred.get(cellKey(code, b.key)); if (c) { inf = c; break; } }
    }
    const name = depthOf(code) === 4 ? `${tree.names.get(code) ?? code} ${PSEUDO_TYPE_NAME}` : (tree.names.get(code) ?? code);
    let repBand: string | null = null;
    let best = 0;
    for (const l of layers) if (l.supply > best) { best = l.supply; repBand = l.band; }
    if (!repBand) { best = 0; for (const l of layers) if (l.n > best) { best = l.n; repBand = l.band; } }
    return {
      code, name, unit: unitOf(code) ?? code, layers, summary,
      level: inf ? inf.level : summary.judgement.level,
      inferred: inf,
      repBand,
    };
  }, [allBands, observed, supplyByLayer, inferred, tree]);

  const rows = useMemo(() => {
    const out: Array<{
      l1: { code: string; name: string };
      mids: Array<{
        code: string; name: string;
        units: Array<{ code: string; name: string; cells: TypeCell[]; total: { n: number; correct: number } | undefined }>;
      }>;
    }> = [];
    for (const l1 of tree.l1) {
      if (l1Filter && l1.code !== l1Filter) continue;
      const mids = (tree.midsByL1.get(l1.code) ?? []).map((mid) => {
        const units = (tree.unitsByMid.get(mid) ?? []).map((unit) => ({
          code: unit,
          name: tree.names.get(unit) ?? unit,
          cells: (tree.typesByUnit.get(unit) ?? []).map(cellOf),
          total: observed.unitTotals.get(unit),
        })).map((u) => ({ ...u, cells: showNoSupply ? u.cells : u.cells.filter((c) => c.summary.supply > 0 || c.summary.n > 0) }))
          .filter((u) => u.cells.length > 0)
          .filter((u) => !hideEmpty || u.total || u.cells.some((c) => c.inferred));
        return { code: mid, name: tree.names.get(mid) ?? mid, units };
      }).filter((m) => m.units.length > 0);
      if (mids.length > 0) out.push({ l1, mids });
    }
    return out;
  }, [tree, cellOf, observed, hideEmpty, l1Filter, showNoSupply]);

  const allCells = useMemo(() => rows.flatMap((r) => r.mids.flatMap((m) => m.units.flatMap((u) => u.cells))), [rows]);
  /** 판 전체(숨긴 문제 없음 포함) — 문제은행 완성도의 분모 */
  const boardTotal = useMemo(() => {
    let total = 0; let withSupply = 0;
    for (const arr of tree.typesByUnit.values()) for (const code of arr) {
      total += 1;
      for (const b of bands) if ((supplyByLayer.get(cellKey(code, b.key)) ?? 0) > 0) { withSupply += 1; break; }
    }
    return { total, withSupply };
  }, [tree, bands, supplyByLayer]);

  // ── 완성도 두 개 · 범례 ──
  const stats = useMemo(() => {
    const c: Record<CellLevel, number> = { master: 0, good: 0, shaky: 0, weak: 0, severe: 0, thin: 0, none: 0 };
    let withSupply = 0; let touched = 0; let supply = 0; let solved = 0; let inferredCount = 0;
    for (const cell of allCells) {
      if (cell.summary.supply > 0) { withSupply += 1; c[cell.level] += 1; }
      else if (cell.summary.n > 0) c[cell.level] += 1;
      if (cell.summary.n > 0) touched += 1;
      if (cell.inferred) inferredCount += 1;
      supply += cell.summary.supply;
      solved += cell.summary.solved;
    }
    const total = boardTotal.total;
    return {
      c, total, withSupply: boardTotal.withSupply, touched, supply, solved, inferredCount,
      noSupply: total - boardTotal.withSupply,
      bankPct: total > 0 ? Math.round((boardTotal.withSupply * 100) / total) : 0,
      progressPct: supply > 0 ? Math.round((solved * 100) / supply) : 0,
    };
  }, [allCells, boardTotal]);

  // ── 선택 ──
  const toggleCodes = (codes: string[]) => {
    if (codes.length === 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = codes.every((k) => next.has(k));
      for (const k of codes) { if (allOn) next.delete(k); else next.add(k); }
      return next;
    });
  };
  const selectWeak = () => {
    setSelected(new Set(allCells.filter((c) => isWeakLevel(c.level) && c.summary.supply > 0).map((c) => c.code)));
  };

  // ── 대표 문제 (클릭한 칸) ──
  const focusCell = useCallback(async (cell: TypeCell) => {
    setFocus(cell);
    if (previews.has(cell.code) || cell.summary.supply === 0) return;
    const reqId = ++previewReq.current;
    try {
      const res = await fetch('/api/clinic/cell-problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cells: [{ unit: cell.code, levels: bands.flatMap((b) => b.levels) }], preview: true }),
      });
      const json = await res.json();
      if (reqId !== previewReq.current) return;
      const p = res.ok ? (json.groups?.[0]?.problems?.[0] ?? null) : null;
      setPreviews((prev) => new Map(prev).set(cell.code, p ? { content: p.content ?? '', difficulty: p.difficulty ?? null } : null));
    } catch {
      /* 미리보기는 있으면 좋은 것 — 실패해도 칸 정보는 그대로 */
    }
  }, [bands, previews]);

  const cellByCode = useMemo(() => new Map(allCells.map((c) => [c.code, c])), [allCells]);

  /** 과제 — 안 푼 문제가 남은 층만 겨냥한다. 다 풀었으면 문제 있는 층 전체 */
  const cellSpecs = useMemo<CellSpec[]>(() => {
    const specs: CellSpec[] = [];
    for (const code of selected) {
      const cell = cellByCode.get(code);
      if (!cell) continue;
      const left = cell.layers.filter((l) => l.supply > Math.min(l.solved, l.supply));
      const useLayers = left.length > 0 ? left : cell.layers.filter((l) => l.supply > 0);
      const levels = useLayers.flatMap((l) => bands.find((b) => b.key === l.band)?.levels ?? []);
      specs.push({ unit: code, levels: levels.length ? levels : bands.flatMap((b) => b.levels), label: cell.name });
    }
    return specs;
  }, [selected, cellByCode, bands]);

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
        <p className="text-sm text-content-secondary">아직 이 반의 채점 기록이 없어 어느 과정의 판을 열지 모릅니다.</p>
        <p className="mt-1 text-xs text-content-muted">
          시험지를 QR 로 채점하면 그 과정의 유형 판이 열리고 푼 만큼 칸이 찹니다.
          {data && data.unplaced > 0 && ` (유형이 안 붙은 문항 ${data.unplaced}개는 놓지 못했습니다)`}
        </p>
      </div>
    );
  }

  const bandLabel = (k: string) => bands.find((b) => b.key === k)?.label ?? k;
  const bandSupply = bands.map((b) => allCells.filter((c) => c.repBand === b.key).reduce((n, c) => n + c.summary.supply, 0));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_248px]">
      <div className="min-w-0">
        {/* 도구 줄 */}
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <select
            value={subject}
            onChange={(e) => { setSubject(e.target.value); setSelected(new Set()); setFocus(null); setL1Filter(''); }}
            className="rounded-lg border border-white/10 bg-white/[.03] px-2.5 py-1.5 text-sm text-content-primary focus:border-white/20 focus:outline-none"
          >
            {data.subjects.map((s) => (
              <option key={s.code} value={s.code} className="bg-black">{s.name} · {s.items}문항</option>
            ))}
          </select>

          <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-1.5 py-1">
            <span className="mr-1 text-content-muted">난이도</span>
            {allBands.map((b) => {
              const on = !hiddenBands.has(b.key);
              return (
                <button
                  key={b.key}
                  onClick={() => setHiddenBands((prev) => { const n = new Set(prev); if (n.has(b.key)) n.delete(b.key); else if (n.size < allBands.length - 1) n.add(b.key); return n; })}
                  className={`rounded-full px-2 py-0.5 transition-colors ${on ? 'bg-white text-black' : 'text-content-tertiary hover:text-content-primary'}`}
                  title={on ? '이 열 숨기기' : '이 열 보이기'}
                >
                  {b.label}
                </button>
              );
            })}
          </span>

          <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-1.5 py-1">
            <span className="mr-1 text-content-muted">난이도구분</span>
            {([4, 6] as const).map((n) => (
              <button
                key={n}
                onClick={() => { setScheme(n); setHiddenBands(new Set()); writePref(PREF_SCHEME, String(n)); }}
                className={`rounded-full px-2 py-0.5 transition-colors ${scheme === n ? 'bg-white text-black' : 'text-content-tertiary hover:text-content-primary'}`}
              >
                {n}단계
              </button>
            ))}
          </span>

          <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-1.5 py-1">
            <span className="mr-1 text-content-muted">분석 방법</span>
            <button
              onClick={() => { const v = !showInfer; setShowInfer(v); writePref(PREF_INFER, v ? '1' : '0'); }}
              className={`rounded-full px-2 py-0.5 transition-colors ${showInfer ? 'bg-white text-black' : 'text-content-tertiary hover:text-content-primary'}`}
              title="안 푼 유형을 형제 유형 근거로 추정해 원형 칸으로 채운다 (기본 꺼짐)"
            >
              추정
            </button>
          </span>

          <button
            onClick={() => { setSelected(new Set()); setHiddenBands(new Set()); setL1Filter(''); setFrom(''); setTo(''); setStudentSel(null); setHideEmpty(false); }}
            className="rounded-lg border border-white/10 px-2.5 py-1.5 text-content-secondary transition-colors hover:border-white/20 hover:text-content-primary"
          >
            초기화
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-content-secondary">
            <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} className="h-3.5 w-3.5 accent-white" />
            학습한 단원만
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-content-secondary" title="문제은행에 문제가 없는 유형은 매쓰홀릭 판엔 없다. 완성도 숫자로만 센다">
            <input type="checkbox" checked={showNoSupply} onChange={(e) => setShowNoSupply(e.target.checked)} className="h-3.5 w-3.5 accent-white" />
            문제 없는 유형도
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

        {/* 대단원 필터 — 매쓰홀릭 단원분석의 대단원 탭 */}
        <div className="mb-2 flex flex-wrap gap-1 text-xs">
          <button
            onClick={() => setL1Filter('')}
            className={`rounded-md px-2 py-1 transition-colors ${l1Filter === '' ? 'bg-white text-black' : 'border border-white/10 text-content-secondary hover:border-white/20 hover:text-content-primary'}`}
          >
            전체
          </button>
          {tree.l1.map((g, i) => (
            <button
              key={g.code}
              onClick={() => setL1Filter(g.code)}
              className={`rounded-md px-2 py-1 transition-colors ${l1Filter === g.code ? 'bg-white text-black' : 'border border-white/10 text-content-secondary hover:border-white/20 hover:text-content-primary'}`}
            >
              {i + 1} {g.name}
            </button>
          ))}
        </div>

        {/* 범례 + 완성도 두 개 */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-content-tertiary">
          {LEVEL_ORDER.map((lv) => (
            <span key={lv} className="inline-flex items-center gap-1">
              <span className={`inline-block h-2.5 w-2.5 rounded-[2px] ${LEGEND_SWATCH[lv]}`} />
              {LEVEL_LABEL[lv]} <span className="tabular-nums text-content-muted">{stats.c[lv]}</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1" title="문제은행에 이 유형 문제가 아직 없다 — 판에서 숨김">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] border border-dashed border-white/30" />
            문제 없음 <span className="tabular-nums text-content-muted">{stats.noSupply}</span>
          </span>
          {showInfer && (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-[2px] border border-emerald-400/70" />
              추정 <span className="tabular-nums text-content-muted">{stats.inferredCount}</span>
            </span>
          )}
          <span className="ml-auto text-content-muted" title="문제은행 완성도 = 문제 있는 유형 / 판의 유형 · 학습 진행도 = 푼 문제 / 있는 문제">
            판 {stats.total}유형 · 문제은행 완성도{' '}
            <span className="tabular-nums text-content-secondary">{stats.withSupply}/{stats.total} ({stats.bankPct}%)</span>
            {' · '}{studentSel ? (students.find((s) => s.id === studentSel)?.name ?? '학생') : '반 전체'} 진행도{' '}
            <span className="tabular-nums text-content-secondary">{stats.solved}/{stats.supply}문제 ({stats.progressPct}%)</span>
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-6 py-12 text-center text-sm text-content-secondary">
            표시할 단원이 없습니다.
            <p className="mt-1 text-xs text-content-muted">{hideEmpty ? '「데이터 있는 단원만」을 끄면 판 전체가 보입니다.' : '수학비서 트리에 이 과목 단원이 없습니다.'}</p>
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
                        onClick={() => toggleCodes(allCells.filter((c) => c.repBand === b.key && c.summary.supply > 0).map((c) => c.code))}
                        className="inline-flex flex-col items-start leading-tight hover:text-content-primary"
                        title="이 열 전체 선택/해제"
                      >
                        <span>{b.label} <span className="text-content-muted">{b.levels[0]}{b.levels.length > 1 ? `~${b.levels[b.levels.length - 1]}` : ''}</span></span>
                        <span className="text-[10px] tabular-nums text-content-muted">문제 {bandSupply[i]}</span>
                      </button>
                    </th>
                  ))}
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">정답률</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <RowGroup
                    key={g.l1.code}
                    group={g}
                    selected={selected}
                    focusCode={focus?.code ?? null}
                    bands={bands}
                    bandLabel={bandLabel}
                    onToggle={(cell) => { if (cell.summary.supply > 0) toggleCodes([cell.code]); void focusCell(cell); }}
                    onToggleRow={(codes) => toggleCodes(codes)}
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
          <p className="text-[11px] uppercase tracking-wider text-content-tertiary">선택된 유형</p>
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
                약한 유형 모두
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
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-content-tertiary">유형 정보</p>
          {focus ? (
            <div className="text-xs">
              <p className="text-[11px] text-content-muted">{focus.unit !== focus.code ? (tree.names.get(focus.unit) ?? focus.unit) : ''}</p>
              <p className="text-sm text-content-primary">{focus.name}</p>
              <p className="mt-0.5 text-content-tertiary">
                <span className={focus.inferred ? 'text-content-secondary' : pctTone(focus.summary.judgement.pct)}>
                  {LEVEL_LABEL[focus.level]}
                  {focus.inferred ? ` ${focus.inferred.pct}% (추정)` : focus.summary.judgement.pct != null ? ` ${focus.summary.judgement.pct}%` : ''}
                </span>
                {' · '}진행도{' '}
                <span className="tabular-nums text-content-secondary">
                  {focus.summary.progressPct == null ? '—' : `${focus.summary.solved}/${focus.summary.supply} (${focus.summary.progressPct}%)`}
                </span>
              </p>
              <table className="mt-2 w-full text-[11px] tabular-nums">
                <thead>
                  <tr className="text-content-muted">
                    <th className="py-0.5 text-left font-normal">층</th>
                    <th className="py-0.5 text-right font-normal">문제</th>
                    <th className="py-0.5 text-right font-normal">푼</th>
                    <th className="py-0.5 text-right font-normal">맞음</th>
                  </tr>
                </thead>
                <tbody>
                  {[...focus.layers].reverse().map((l) => (
                    <tr key={l.band} className="border-t border-white/5 text-content-secondary">
                      <td className="py-0.5">{bandLabel(l.band)}</td>
                      <td className="py-0.5 text-right">{l.supply || <span className="text-content-muted">—</span>}</td>
                      <td className="py-0.5 text-right">{l.solved || <span className="text-content-muted">—</span>}</td>
                      <td className={`py-0.5 text-right ${l.n > 0 ? pctTone(Math.round((l.correct * 100) / l.n)) : ''}`}>
                        {l.n > 0 ? `${l.correct}/${l.n}` : <span className="text-content-muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {focus.inferred && <p className="mt-1 leading-relaxed text-content-muted">근거 — {focus.inferred.basis}</p>}
              {focus.summary.judgement.level === 'thin' && (
                <p className="mt-1 leading-relaxed text-content-muted">문항이 3개 미만이라 판정을 보류했습니다.</p>
              )}
              {focus.summary.supply === 0 && (
                <p className="mt-1 leading-relaxed text-content-muted">문제은행에 이 유형 문제가 아직 없습니다. 분류가 붙으면 층이 생깁니다.</p>
              )}
              {focus.summary.supply > 0 && (
                <div className="mt-2 rounded-md border border-white/10 bg-white/[.03] p-2">
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-content-muted">대표 문제</p>
                  {previews.has(focus.code) ? (
                    previews.get(focus.code) ? (
                      <p className="leading-relaxed text-content-secondary">
                        {previewText(previews.get(focus.code)!.content)}
                        {previews.get(focus.code)!.difficulty != null && (
                          <span className="ml-1 text-content-muted">· 난이도 {previews.get(focus.code)!.difficulty}</span>
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
              칸을 누르면 여기에 층별 문제·푼 수·정답률과 대표 문제가 나옵니다. 소단원 이름을 누르면 그 줄의 유형이 통째로 선택됩니다.
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

// ── 행 묶음 (대단원 → 중단원 → 소단원 줄 · 열 = 난이도 · 칸 = 유형) ──
function RowGroup({
  group, selected, focusCode, bands, bandLabel, onToggle, onToggleRow,
}: {
  group: {
    l1: { code: string; name: string };
    mids: Array<{
      code: string; name: string;
      units: Array<{ code: string; name: string; cells: TypeCell[]; total: { n: number; correct: number } | undefined }>;
    }>;
  };
  selected: Set<string>;
  focusCode: string | null;
  bands: readonly { key: string; label: string }[];
  bandLabel: (k: string) => string;
  onToggle: (cell: TypeCell) => void;
  onToggleRow: (codes: string[]) => void;
}) {
  const span = bands.length + 2;
  return (
    <>
      <tr className="border-b border-white/5 bg-white/[.03]">
        <td colSpan={span} className="px-3 py-1.5 text-[11px] font-semibold tracking-wide text-content-secondary">
          {group.l1.name}
        </td>
      </tr>
      {group.mids.map((m) => (
        <MidRows key={m.code} mid={m} span={span} selected={selected} focusCode={focusCode} bands={bands} bandLabel={bandLabel} onToggle={onToggle} onToggleRow={onToggleRow} />
      ))}
    </>
  );
}

/** 칸 하나 — 매쓰홀릭 유형분석 칸: 28px 단색 사각형 · 마스터 ★ · 보류 ? · 추정 원형 · 선택은 파란 칸 */
function TypeSquare({ cell, sel, focused, bandLabel, onToggle }: {
  cell: TypeCell; sel: boolean; focused: boolean; bandLabel: (k: string) => string; onToggle: (cell: TypeCell) => void;
}) {
  const s = cell.summary;
  const layerLines = [...cell.layers].reverse()
    .filter((l) => l.supply > 0 || l.n > 0)
    .map((l) => `${bandLabel(l.band)} ${l.solved}/${l.supply}${l.n > 0 ? ` (${l.correct}/${l.n} 정답)` : ''}`);
  const title = [
    cell.name,
    `${LEVEL_LABEL[cell.level]}${cell.inferred ? ` ${cell.inferred.pct}% (추정)` : s.judgement.pct != null ? ` ${s.judgement.pct}%` : ''}`
      + ` · 진행도 ${s.progressPct == null ? '—' : `${s.solved}/${s.supply} (${s.progressPct}%)`}`,
    ...layerLines,
    s.supply === 0 ? '(문제은행에 문제가 없어 과제로는 못 냅니다)' : '',
    cell.inferred ? `근거: ${cell.inferred.basis}` : '',
  ].filter(Boolean).join('\n');
  const noSupply = s.supply === 0 && s.n === 0;
  const face = sel
    ? 'bg-sky-500 text-white ring-2 ring-sky-300 ring-offset-2 ring-offset-black'
    : noSupply
      ? 'border border-dashed border-white/25 bg-transparent text-content-muted'
      : CELL_CLASS[cell.level];
  return (
    <button
      onClick={() => onToggle(cell)}
      title={title}
      aria-pressed={sel}
      className={`relative flex h-7 w-7 shrink-0 items-center justify-center text-[11px] font-bold leading-none transition-transform hover:scale-110 ${
        cell.inferred ? 'rounded-full' : 'rounded-md'
      } ${face} ${!sel && focused ? 'ring-2 ring-white/50 ring-offset-1 ring-offset-black' : ''}`}
    >
      {cell.level === 'master' ? '★' : cell.level === 'thin' && !noSupply ? '?' : ''}
    </button>
  );
}

function MidRows({
  mid, span, selected, focusCode, bands, bandLabel, onToggle, onToggleRow,
}: {
  mid: { code: string; name: string; units: Array<{ code: string; name: string; cells: TypeCell[]; total: { n: number; correct: number } | undefined }> };
  span: number;
  selected: Set<string>;
  focusCode: string | null;
  bands: readonly { key: string; label: string }[];
  bandLabel: (k: string) => string;
  onToggle: (cell: TypeCell) => void;
  onToggleRow: (codes: string[]) => void;
}) {
  const inBand = (u: { cells: TypeCell[] }, key: string, first: string) =>
    u.cells.filter((c) => (c.repBand ?? first) === key);
  return (
    <>
      {mid.units.map((u, ui) => {
        const rowCodes = u.cells.filter((c) => c.summary.supply > 0).map((c) => c.code);
        const rowAll = rowCodes.length > 0 && rowCodes.every((k) => selected.has(k));
        const rowSome = !rowAll && rowCodes.some((k) => selected.has(k));
        const pct = u.total && u.total.n > 0 ? Math.round((u.total.correct * 100) / u.total.n) : null;
        return (
          <tr key={u.code} className="border-b border-white/5 last:border-0 hover:bg-white/[.02]">
            {/* 행 머리 — 매쓰홀릭: [☐ 중단원] / [☐ 소단원] / 유형그룹 선택 + */}
            <td className="px-3 py-2 align-top">
              {ui === 0 && <p className="mb-0.5 text-[11px] text-content-muted">{mid.name}</p>}
              <label className="flex cursor-pointer items-start gap-1.5">
                <input
                  type="checkbox"
                  checked={rowAll}
                  ref={(el) => { if (el) el.indeterminate = rowSome; }}
                  onChange={() => onToggleRow(rowCodes)}
                  disabled={rowCodes.length === 0}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-white disabled:opacity-30"
                />
                <span className="text-xs leading-snug text-content-primary">{u.name}</span>
              </label>
              <button
                onClick={() => onToggleRow(rowCodes)}
                disabled={rowCodes.length === 0}
                className="mt-1 text-[11px] text-content-tertiary transition-colors hover:text-content-primary disabled:opacity-30"
                title="이 줄의 유형 전체 선택/해제"
              >
                유형그룹 선택 +
              </button>
            </td>
            {bands.map((b) => {
              const group = inBand(u, b.key, bands[0].key);
              const codes = group.filter((c) => c.summary.supply > 0).map((c) => c.code);
              const all = codes.length > 0 && codes.every((k) => selected.has(k));
              const some = !all && codes.some((k) => selected.has(k));
              return (
                <td key={b.key} className="px-2 py-2 align-top">
                  {group.length > 0 && (
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={all}
                        ref={(el) => { if (el) el.indeterminate = some; }}
                        onChange={() => onToggleRow(codes)}
                        disabled={codes.length === 0}
                        className="mt-2 h-3.5 w-3.5 shrink-0 accent-white disabled:opacity-30"
                        title={`${u.name} · ${b.label} 전체 선택/해제`}
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {group.map((cell) => (
                          <TypeSquare key={cell.code} cell={cell} sel={selected.has(cell.code)} focused={focusCode === cell.code} bandLabel={bandLabel} onToggle={onToggle} />
                        ))}
                      </div>
                    </div>
                  )}
                </td>
              );
            })}
            <td className={`whitespace-nowrap px-3 py-2 text-right align-top text-xs tabular-nums ${pctTone(pct)}`}>
              {pct == null ? <span className="text-content-muted">—</span> : `${pct}%`}
              {u.total && <span className="ml-1 text-content-muted">{u.total.n}</span>}
            </td>
          </tr>
        );
      })}
    </>
  );
}
