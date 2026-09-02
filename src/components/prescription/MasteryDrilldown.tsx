'use client';

// ============================================================================
// MasteryDrilldown — 단원별 유형 숙달 드릴다운 (매쓰홀릭 유형분석 등가)
//   대단원 → 중단원 → 소단원 → 유형(level4) 트리. 각 레벨에 숙달 분포(α/β/γ) 막대,
//   유형 리프엔 ★(마스터)/색 + 점수. 약점 유형은 "처방" 콜백.
//   데이터원: diagnostics.student_node_status (두 채점 라인 통합, 20260605_001) +
//             public.mathsecr_types 계층. 시험본 유형만 표시 → 데이터 쌓일수록 densify.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Target, Sparkles, FilePlus2 } from 'lucide-react';
import { useTrackHref } from '@/lib/track/hooks';
import { getMathsecrNodesByCodes } from '@/app/dashboard/prescription/lib/queries';
import { STATUS_COLOR, STATUS_LABEL } from '@/app/dashboard/prescription/lib/types';
import type { StudentNodeStatus, NodeStatus, MathsecrNode } from '@/app/dashboard/prescription/lib/types';

type Agg = { alpha: number; beta: number; gamma: number; unknown: number; total: number; score: number; scoreN: number };
const emptyAgg = (): Agg => ({ alpha: 0, beta: 0, gamma: 0, unknown: 0, total: 0, score: 0, scoreN: 0 });
function addToAgg(a: Agg, s: NodeStatus, score: number | null) {
  a[s] = (a[s] ?? 0) + 1;
  a.total += 1;
  if (typeof score === 'number') { a.score += score; a.scoreN += 1; }
}

interface TypeLeaf {
  code: string;
  name: string;
  status: NodeStatus;
  score: number | null;
  itemsTotal: number;
  itemsCorrect: number;
}
interface SubUnit { key: string; name: string; agg: Agg; types: TypeLeaf[]; }
interface MidUnit { key: string; name: string; agg: Agg; subs: SubUnit[]; }
interface BigUnit { key: string; name: string; agg: Agg; mids: MidUnit[]; }
interface SubjectGroup { key: string; name: string; agg: Agg; bigs: BigUnit[]; }

const RANK: Record<NodeStatus, number> = { gamma: 0, beta: 1, alpha: 2, unknown: 3 };

/**
 * 출제로 넘길 코드 — 소단원까지만 남긴다.
 * `MS07-04-02-06-03`(세부유형) → `MS07-04-02-06`(소단원)
 *
 * 세부유형 하나로 좁히면 문제은행에 그 유형이 1~2개뿐인 경우가 많아 연습지가 안 나온다
 * (실측: 오답 유형 166가지 중 36가지는 그 문제 하나뿐). 소단원까지 넓혀야 후보가 생긴다.
 * 검색 API 가 `type_code like '<코드>%'` 로 받으므로 접두어만 주면 하위가 전부 잡힌다.
 */
function toSubunitCode(code: string): string {
  const seg = code.split('-');
  return seg.length >= 5 ? seg.slice(0, -1).join('-') : code;
}

/** 약한 유형일수록 쉬운 난이도부터 — γ는 하~중, β는 중 */
function diffRangeFor(status: NodeStatus): string {
  if (status === 'gamma') return '1,2,3,4';
  if (status === 'beta') return '3,4,5,6';
  return '';
}

function MasteryBar({ agg }: { agg: Agg }) {
  const segs: Array<[NodeStatus, number]> = [
    ['gamma', agg.gamma], ['beta', agg.beta], ['alpha', agg.alpha], ['unknown', agg.unknown],
  ];
  return (
    <div className="flex h-2 w-24 overflow-hidden rounded-full bg-zinc-800 flex-shrink-0">
      {segs.map(([st, n]) =>
        n > 0 ? (
          <div key={st} style={{ width: `${(n / agg.total) * 100}%`, background: STATUS_COLOR[st] }} />
        ) : null
      )}
    </div>
  );
}

function CountChips({ agg }: { agg: Agg }) {
  return (
    <span className="text-[10px] text-content-tertiary tabular-nums">
      {agg.gamma > 0 && <span style={{ color: STATUS_COLOR.gamma }}>γ{agg.gamma} </span>}
      {agg.beta > 0 && <span style={{ color: STATUS_COLOR.beta }}>β{agg.beta} </span>}
      {agg.alpha > 0 && <span style={{ color: STATUS_COLOR.alpha }}>α{agg.alpha}</span>}
    </span>
  );
}

export function MasteryDrilldown({
  nodeStatus,
  onPrescribe,
}: {
  nodeStatus: StudentNodeStatus[];
  onPrescribe?: (code: string, name: string) => void;
}) {
  const href = useTrackHref();   // 트랙 prefix (/math/…) 유지 — 안 쓰면 not-found
  const [nodes, setNodes] = useState<Map<string, MathsecrNode>>(new Map());
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const codes = useMemo(() => nodeStatus.map((n) => n.mathsecr_code), [nodeStatus]);

  useEffect(() => {
    let cancelled = false;
    if (codes.length === 0) { setNodes(new Map()); return; }
    setLoading(true);
    getMathsecrNodesByCodes(codes)
      .then((rows) => {
        if (cancelled) return;
        const m = new Map<string, MathsecrNode>();
        for (const r of rows) m.set(r.code, r);
        setNodes(m);
      })
      .catch(() => { if (!cancelled) setNodes(new Map()); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [codes]);

  // 트리 빌드 (시험본 유형을 계층으로 묶음)
  const tree = useMemo<SubjectGroup[]>(() => {
    const subjects = new Map<string, SubjectGroup>();
    const ensure = <T extends { key: string }>(arr: T[], key: string, make: () => T): T => {
      let f = arr.find((x) => x.key === key);
      if (!f) { f = make(); arr.push(f); }
      return f;
    };
    for (const ns of nodeStatus) {
      const node = nodes.get(ns.mathsecr_code);
      const subjKey = node?.subject_code || '기타';
      const subjName = node?.subject_name || '기타 / 미분류';
      const bigName = node?.level1_name || '(대단원 미상)';
      const midName = node?.level2_name || '(중단원 미상)';
      const subName = node?.level3_name || '(소단원 미상)';
      const typeName = node?.level4_name || node?.level3_name || ns.mathsecr_code;

      const subj = ensure(Array.from(subjects.values()), subjKey, () => {
        const g: SubjectGroup = { key: subjKey, name: subjName, agg: emptyAgg(), bigs: [] };
        subjects.set(subjKey, g);
        return g;
      });
      const big = ensure(subj.bigs, `${subjKey}|${bigName}`, () => ({ key: `${subjKey}|${bigName}`, name: bigName, agg: emptyAgg(), mids: [] }));
      const mid = ensure(big.mids, `${big.key}|${midName}`, () => ({ key: `${big.key}|${midName}`, name: midName, agg: emptyAgg(), subs: [] }));
      const sub = ensure(mid.subs, `${mid.key}|${subName}`, () => ({ key: `${mid.key}|${subName}`, name: subName, agg: emptyAgg(), types: [] }));

      sub.types.push({
        code: ns.mathsecr_code, name: typeName, status: ns.status,
        score: ns.last_score, itemsTotal: ns.items_total, itemsCorrect: ns.items_correct,
      });
      for (const a of [subj.agg, big.agg, mid.agg, sub.agg]) addToAgg(a, ns.status, ns.last_score);
    }
    // 약점(γ) 우선 정렬
    const byWeak = (a: { agg: Agg }, b: { agg: Agg }) => (b.agg.gamma - a.agg.gamma) || (b.agg.total - a.agg.total);
    const groups = Array.from(subjects.values());
    for (const s of groups) {
      s.bigs.sort(byWeak);
      for (const b of s.bigs) { b.mids.sort(byWeak); for (const m of b.mids) { m.subs.sort(byWeak); for (const u of m.subs) u.types.sort((x, y) => RANK[x.status] - RANK[y.status]); } }
    }
    groups.sort((a, b) => a.key.localeCompare(b.key));
    return groups;
  }, [nodeStatus, nodes]);

  // 기본 펼침: 과목 + γ 있는 대단원
  useEffect(() => {
    const init = new Set<string>();
    for (const s of tree) {
      init.add(s.key);
      for (const b of s.bigs) if (b.agg.gamma > 0) init.add(b.key);
    }
    setExpanded(init);
  }, [tree]);

  const toggle = (k: string) => setExpanded((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const isOpen = (k: string) => expanded.has(k);

  if (nodeStatus.length === 0) {
    return <div className="py-8 text-center text-content-tertiary text-sm">진단·채점 데이터가 쌓이면 단원별 유형 숙달이 표시됩니다.</div>;
  }

  return (
    <div className="space-y-3">
      {loading && <div className="text-xs text-content-tertiary">단원 정보 불러오는 중…</div>}
      {tree.map((subj) => (
        <div key={subj.key} className="rounded-xl border border-subtle bg-surface-card/40">
          {/* 과목 */}
          <button type="button" onClick={() => toggle(subj.key)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
            <ChevronRight size={14} className={`transition-transform ${isOpen(subj.key) ? 'rotate-90' : ''}`} />
            <span className="text-sm font-bold text-content-primary">{subj.name}</span>
            <MasteryBar agg={subj.agg} />
            <CountChips agg={subj.agg} />
            <span className="ml-auto text-[10px] text-content-tertiary">{subj.agg.total}유형</span>
          </button>
          {isOpen(subj.key) && (
            <div className="border-t border-subtle/60 px-2 pb-2">
              {subj.bigs.map((big) => (
                <div key={big.key} className="mt-1">
                  {/* 대단원 */}
                  <button type="button" onClick={() => toggle(big.key)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-raised/40">
                    <ChevronRight size={12} className={`transition-transform ${isOpen(big.key) ? 'rotate-90' : ''}`} />
                    <span className="text-xs font-semibold text-content-secondary">{big.name}</span>
                    <MasteryBar agg={big.agg} />
                    <CountChips agg={big.agg} />
                  </button>
                  {isOpen(big.key) && big.mids.map((mid) => (
                    <div key={mid.key} className="ml-4">
                      {/* 중단원 */}
                      <button type="button" onClick={() => toggle(mid.key)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-surface-raised/30">
                        <ChevronRight size={11} className={`transition-transform ${isOpen(mid.key) ? 'rotate-90' : ''}`} />
                        <span className="text-[11px] text-content-secondary">{mid.name}</span>
                        <CountChips agg={mid.agg} />
                      </button>
                      {isOpen(mid.key) && mid.subs.map((sub) => (
                        <div key={sub.key} className="ml-5 border-l border-subtle/40 pl-2">
                          {/* 소단원 */}
                          <div className="flex items-center gap-2 px-1 py-1">
                            <span className="text-[11px] font-medium text-content-secondary">{sub.name}</span>
                            <CountChips agg={sub.agg} />
                            {sub.agg.gamma > 0 && (() => {
                              const weak = sub.types.find((t) => t.status === 'gamma') || sub.types[0];
                              if (!weak) return null;
                              const qs = new URLSearchParams({ typeCode: toSubunitCode(weak.code), typeName: sub.name });
                              const diffs = diffRangeFor(weak.status);
                              if (diffs) qs.set('diff', diffs);
                              return (
                                <span className="ml-auto flex items-center gap-1">
                                  {onPrescribe && (
                                    <button
                                      type="button"
                                      onClick={() => onPrescribe(weak.code, sub.name)}
                                      className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold text-rose-300 hover:bg-rose-500/25"
                                    >
                                      <Target size={9} /> 처방
                                    </button>
                                  )}
                                  {/* ★ 약점 → 출제 인계. 이 링크가 없으면 약점을 찾아도 시험지로 못 넘어간다. */}
                                  <Link
                                    href={href(`/dashboard/exam-create?${qs.toString()}`)}
                                    title={`${sub.name} 문제로 시험지 만들기`}
                                    className="inline-flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-content-secondary hover:bg-white/20"
                                  >
                                    <FilePlus2 size={9} /> 출제
                                  </Link>
                                </span>
                              );
                            })()}
                          </div>
                          {/* 유형 리프 */}
                          <div className="flex flex-wrap gap-1 pb-1.5">
                            {sub.types.map((t) => (
                              <span
                                key={t.code}
                                title={`${t.name} · ${STATUS_LABEL[t.status]} · ${t.itemsCorrect}/${t.itemsTotal}${t.score != null ? ` (${t.score}%)` : ''}`}
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
                                style={{ background: `${STATUS_COLOR[t.status]}1f`, color: STATUS_COLOR[t.status] }}
                              >
                                {t.status === 'alpha' && <Sparkles size={9} />}
                                <span className="max-w-[140px] truncate">{t.name}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
