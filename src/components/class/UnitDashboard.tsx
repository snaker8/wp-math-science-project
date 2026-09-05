'use client';

// ============================================================================
// 유형분석 ▸ 단원분석 보기 — 행 = 학생 × 열 = 소단원, 칸 = 유형 타일 격자 (매쓰홀릭 /ug-dashboard 대응)
// ----------------------------------------------------------------------------
// 실측(스크린샷 2026-09-04): 난이도 [기본][실력] 심화(다중) · 대단원 탭 · 행=학생(▾) · 열=소단원 · 칸=그 소단원 유형들이
// 작은 색 타일(≈14px) 격자로 초록/노랑/빨강/회색. 유형분석은 학생 하나를 깊게, 단원분석은 반을 넓게 — 같은 데이터, 축만 전치.
//
// 재료·판정은 유형분석(MasteryMatrix)과 같다: 판 = 과정의 유형 전체(문제 없는 유형은 숨김), 판정 = judgeCell(문항·정답).
// ============================================================================

import { useMemo, useState } from 'react';
import type { MasteryPayload } from '@/app/api/classes/[classId]/mastery/route';
import {
  BAND_SCHEMES, type BandScheme, bandOf, judgeCell, LEVEL_LABEL, type CellLevel, subjectOf, unitOf, midOf, depthOf,
} from '@/lib/class/mastery-bands';

interface Props {
  data: MasteryPayload;
  subject: string;
  scheme: BandScheme;
  students: Array<{ id: string; name: string }>;
  from: string;
  to: string;
  /** 타일 클릭 → 유형분석에서 그 유형에 초점 */
  onPickType?: (code: string) => void;
}

const TILE: Record<CellLevel, string> = {
  master: 'bg-emerald-400', good: 'bg-emerald-500', shaky: 'bg-amber-400', weak: 'bg-red-500',
  severe: 'bg-red-700', thin: 'bg-zinc-500', none: 'bg-zinc-600',
};

export function UnitDashboard({ data, subject, scheme, students, from, to, onPickType }: Props) {
  const allBands = BAND_SCHEMES[scheme];
  const [bandsOn, setBandsOn] = useState<Set<string>>(() => new Set(allBands.map((b) => b.key)));
  const [l1, setL1] = useState<string>('');

  // 트리: 대단원 → 소단원 → 유형 (문제 있는 유형만 — 매쓰홀릭 판엔 문제 없는 유형이 없다)
  const tree = useMemo(() => {
    const names = new Map<string, string>();
    const l1s: Array<{ code: string; name: string }> = [];
    const unitsByL1 = new Map<string, string[]>();
    const typesByUnit = new Map<string, string[]>();
    const supplied = new Set<string>();
    for (const s of data.supply) if (subjectOf(s.code) === subject) supplied.add(s.code);
    for (const n of data.tree) {
      if (subjectOf(n.code) !== subject) continue;
      names.set(n.code, n.name);
      if (n.depth === 2) { l1s.push({ code: n.code, name: n.name }); if (!unitsByL1.has(n.code)) unitsByL1.set(n.code, []); }
      else if (n.depth === 4) {
        const top = n.code.split('-').slice(0, 2).join('-');
        if (!unitsByL1.has(top)) unitsByL1.set(top, []);
        unitsByL1.get(top)!.push(n.code);
        if (!typesByUnit.has(n.code)) typesByUnit.set(n.code, []);
      } else if (n.depth === 5) {
        const u = unitOf(n.code)!;
        if (!typesByUnit.has(u)) typesByUnit.set(u, []);
        if (supplied.has(n.code)) typesByUnit.get(u)!.push(n.code);
      }
    }
    // depth4 코드로만 분류된 문제 → 그 소단원의 유형 미지정 칸
    for (const code of supplied) if (depthOf(code) === 4 && typesByUnit.has(code) && !typesByUnit.get(code)!.includes(code)) typesByUnit.get(code)!.push(code);
    return { names, l1s, unitsByL1, typesByUnit };
  }, [data, subject]);

  // 대표 난이도(문제은행에 가장 많은 층) — 난이도 필터용
  const repBand = useMemo(() => {
    const per = new Map<string, Map<string, number>>();
    for (const s of data.supply) {
      if (subjectOf(s.code) !== subject) continue;
      const b = bandOf(s.d, scheme); if (!b) continue;
      const m = per.get(s.code) ?? new Map<string, number>();
      m.set(b, (m.get(b) ?? 0) + s.count);
      per.set(s.code, m);
    }
    const out = new Map<string, string>();
    for (const [code, m] of per) {
      let best = 0; let key = allBands[0].key;
      for (const b of allBands) { const v = m.get(b.key) ?? 0; if (v > best) { best = v; key = b.key; } }
      out.set(code, key);
    }
    return out;
  }, [data, subject, scheme, allBands]);

  // 학생 × 유형 → 판정
  const byStudent = useMemo(() => {
    const m = new Map<string, Map<string, { n: number; correct: number }>>();
    for (const it of data.items) {
      if (subjectOf(it.code) !== subject) continue;
      const day = it.at.slice(0, 10);
      if (from && day < from) continue;
      if (to && day > to) continue;
      const sm = m.get(it.s) ?? new Map<string, { n: number; correct: number }>();
      const c = sm.get(it.code) ?? { n: 0, correct: 0 };
      c.n += 1; if (it.ok) c.correct += 1;
      sm.set(it.code, c);
      m.set(it.s, sm);
    }
    return m;
  }, [data, subject, from, to]);

  const l1Code = l1 || tree.l1s[0]?.code || '';
  const units = (tree.unitsByL1.get(l1Code) ?? []).map((u) => ({
    code: u,
    name: tree.names.get(u) ?? u,
    short: (tree.names.get(midOf(u) ?? '') ?? '').slice(0, 6),
    types: (tree.typesByUnit.get(u) ?? []).filter((t) => bandsOn.has(repBand.get(t) ?? allBands[0].key)),
  })).filter((u) => u.types.length > 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-1.5 py-1">
          <span className="mr-1 whitespace-nowrap text-content-muted">난이도</span>
          {allBands.map((b) => {
            const on = bandsOn.has(b.key);
            return (
              <button key={b.key}
                onClick={() => setBandsOn((prev) => { const n = new Set(prev); if (n.has(b.key)) { if (n.size > 1) n.delete(b.key); } else n.add(b.key); return n; })}
                className={`rounded-full px-2 py-0.5 transition-colors ${on ? 'bg-white text-black' : 'text-content-tertiary hover:text-content-primary'}`}>
                {b.label}
              </button>
            );
          })}
        </span>
        <span className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-white/10 px-1.5 py-1">
          <span className="mr-1 whitespace-nowrap text-content-muted">대단원</span>
          {tree.l1s.map((g, i) => (
            <button key={g.code} onClick={() => setL1(g.code)}
              className={`rounded-full px-2 py-0.5 transition-colors ${l1Code === g.code ? 'bg-white text-black' : 'text-content-tertiary hover:text-content-primary'}`}>
              {i + 1} {g.name}
            </button>
          ))}
        </span>
        <span className="ml-auto text-content-muted">칸 = 소단원의 유형 타일 · 색 = 그 학생의 판정 · 회색 = 미학습</span>
      </div>

      {units.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-6 py-12 text-center text-sm text-content-secondary">
          이 대단원엔 문제은행에 분류된 유형이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-content-tertiary">
                <th className="sticky left-0 z-10 bg-surface-base px-3 py-2 text-left font-medium">목차</th>
                {units.map((u) => (
                  <th key={u.code} className="px-2 py-2 text-left align-bottom font-medium" title={`${u.short} › ${u.name}`}>
                    <span className="block max-w-[9rem] truncate text-content-secondary">{u.name}</span>
                    <span className="block text-[10px] tabular-nums text-content-muted">유형 {u.types.length}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((st) => {
                const sm = byStudent.get(st.id);
                return (
                  <tr key={st.id} className="border-b border-white/5 last:border-0">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-surface-base px-3 py-2 align-top text-content-primary">{st.name}</td>
                    {units.map((u) => (
                      <td key={u.code} className="px-2 py-2 align-top">
                        <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${Math.min(6, Math.max(2, Math.ceil(Math.sqrt(u.types.length))))}, 14px)` }}>
                          {u.types.map((t) => {
                            const c = sm?.get(t);
                            const j = judgeCell(c?.n ?? 0, c?.correct ?? 0);
                            const name = tree.names.get(t) ?? t;
                            return (
                              <button
                                key={t}
                                onClick={() => onPickType?.(t)}
                                title={`${name}\n${LEVEL_LABEL[j.level]}${j.pct != null ? ` ${j.pct}%` : ''}${c ? ` · ${c.correct}/${c.n}` : ''}`}
                                className={`h-[14px] w-[14px] rounded-[3px] ${TILE[j.level]} transition-transform hover:scale-125`}
                              />
                            );
                          })}
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
