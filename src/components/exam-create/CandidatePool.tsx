'use client';

// ============================================================================
// 후보풀 — 담은 문항 하나를 기준으로 「대신 넣을 문제」를 보여준다 (설계서 S3 ❸)
// ----------------------------------------------------------------------------
// 매쓰홀릭에 있고 우리에게 없던 개념: **[교체]와 [추가]를 나눈다.**
//   교체 = 그 자리를 대신한다 (번호 유지). 추가 = 새 문항으로 붙인다.
//   한 버튼으로 뭉쳐 두면 "이걸 누르면 원래 문제가 빠지나?"를 매번 헷갈린다.
//
// 탭: 유사(같은 유형·난이도 가까운 순) · 기출(학교기출) · 고난도(더 높은 난이도) · 서술형(서답형)
// AI 안 쓴다 — 전부 우리 분류·출처로 찾는다. AI 변형 후보는 설계서 S5(비용 별건).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Repeat2, Plus } from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import type { CandidateProblem, CandidateKind } from '@/app/api/problems/candidates/route';

const TABS: Array<{ kind: CandidateKind; label: string; hint: string }> = [
  { kind: 'similar', label: '유사', hint: '같은 유형 · 난이도가 가까운 순' },
  { kind: 'past', label: '기출', hint: '같은 유형의 학교기출' },
  { kind: 'hard', label: '고난도', hint: '같은 유형의 더 높은 난이도' },
  { kind: 'essay', label: '서술형', hint: '같은 유형의 서답형' },
];

const BAND_CLS: Record<string, string> = {
  '개념': 'border-sky-500/40 text-sky-300',
  '기본': 'border-emerald-500/40 text-emerald-300',
  '실력': 'border-amber-500/40 text-amber-300',
  '심화': 'border-orange-500/40 text-orange-300',
  '고난도': 'border-rose-500/40 text-rose-300',
};

export function CandidatePool({
  baseId, baseIndex, excludeIds, onReplace, onAdd,
}: {
  /** 기준 문항 (이 자리를 대신할 후보를 찾는다) */
  baseId: string;
  /** 시험지에서 몇 번째인지 — [교체] 가 어느 번호를 바꾸는지 보이게 */
  baseIndex: number;
  excludeIds: string[];
  onReplace: (candidate: CandidateProblem) => void;
  onAdd: (candidate: CandidateProblem) => void;
}) {
  const [kind, setKind] = useState<CandidateKind>('similar');
  const [items, setItems] = useState<CandidateProblem[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setReason(null);
    try {
      const q = new URLSearchParams({ problemId: baseId, kind, exclude: excludeIds.join(',') });
      const res = await fetch(`/api/problems/candidates?${q}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setItems((j.items || []) as CandidateProblem[]);
      setReason(j.reason ?? null);
    } catch (e) {
      setItems([]); setReason(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [baseId, kind, excludeIds]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="flex h-full flex-col border-l border-zinc-800">
      <div className="border-b border-zinc-800 px-3 py-2">
        <div className="mb-1.5 text-[11px] text-zinc-400">
          <b className="text-zinc-200">{baseIndex + 1}번</b> 자리에 넣을 후보
        </div>
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.kind}
              type="button"
              onClick={() => setKind(t.kind)}
              title={t.hint}
              className={`rounded-full px-2 py-0.5 text-[11px] transition-colors ${
                kind === t.kind ? 'bg-white font-semibold text-black' : 'border border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-6 text-[11px] text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> 찾는 중
          </div>
        ) : items.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-zinc-500">
            {reason ?? '후보가 없습니다.'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((c) => (
              <li key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
                <div className="mb-1 flex flex-wrap items-center gap-1 text-[10px]">
                  {c.bandLabel && (
                    <span className={`rounded border px-1.5 py-0.5 tabular-nums ${BAND_CLS[c.bandLabel] ?? 'border-zinc-700 text-zinc-400'}`}>
                      {c.bandLabel} {c.difficulty}
                    </span>
                  )}
                  {c.school && <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-zinc-400">{c.school}</span>}
                  {c.sourceYear && <span className="text-zinc-600 tabular-nums">{c.sourceYear}</span>}
                </div>
                <div className="line-clamp-3 text-[11px] text-zinc-300">
                  <MixedContentRenderer content={(c.content || '').slice(0, 200)} />
                </div>
                <div className="mt-1.5 flex gap-1">
                  <button
                    type="button"
                    onClick={() => onReplace(c)}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-zinc-700 py-1 text-[11px] text-zinc-300 transition-colors hover:border-white/30 hover:text-white"
                    title={`${baseIndex + 1}번을 이 문제로 바꾼다 (번호 유지)`}
                  >
                    <Repeat2 className="h-3 w-3" /> 교체
                  </button>
                  <button
                    type="button"
                    onClick={() => onAdd(c)}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-white py-1 text-[11px] font-semibold text-black transition-opacity hover:opacity-90"
                    title="맨 뒤에 새 문항으로 추가"
                  >
                    <Plus className="h-3 w-3" /> 추가
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
