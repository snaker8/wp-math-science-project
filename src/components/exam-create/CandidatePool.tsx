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
import { Loader2, Repeat2, Plus, Sparkles, X, AlertTriangle } from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { truncateLatexPreview } from '@/lib/utils/latex-preview';
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

// ============================================================================
// AI 변형 (설계서 S5) — 같은 유형에 쓸 문제가 없을 때의 마지막 수단
// ----------------------------------------------------------------------------
// ★ 버튼 한 번에 **한 건**. 배치도 자동 재시도도 없다 (대표 비용 규율).
// ★ 누르자마자 돈이 나가지 않게 **2단 확인**. window.confirm 은 안 쓴다(자동화 탭이 멈춘다).
// ★ 미리보기는 저장되지 않는다. 「담기」를 눌러야 문제은행에 들어간다.
// ============================================================================
interface VariantState {
  content: string; choices: string[]; answer: string; solution: string; changed: string;
}

function AiVariantBox({ baseId, baseIndex, onPicked }: {
  baseId: string;
  baseIndex: number;
  onPicked: (c: CandidateProblem, how: 'replace' | 'add') => void;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [variant, setVariant] = useState<VariantState | null>(null);
  const [meta, setMeta] = useState<{ typeCode: string | null; difficulty: string | null; warning: string | null; cost: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => { setArmed(false); setVariant(null); setMeta(null); setErr(null); };

  const generate = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/problems/${baseId}/ai-variant`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setVariant(j.variant as VariantState);
      const u = j.usage as { input: number; output: number } | undefined;
      setMeta({
        typeCode: j.typeCode ?? null,
        difficulty: j.difficulty ?? null,
        warning: j.warning ?? null,
        cost: u ? `입력 ${u.input} · 출력 ${u.output} 토큰` : '',
      });
      setArmed(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const commit = async (how: 'replace' | 'add') => {
    if (!variant) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/problems/${baseId}/ai-variant`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commit: true, variant }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const d = meta?.difficulty != null ? parseInt(String(meta.difficulty), 10) : null;
      onPicked({
        id: j.id as string,
        content: variant.content,
        typeCode: (j.typeCode as string) ?? meta?.typeCode ?? '',
        difficulty: Number.isFinite(d as number) ? (d as number) : null,
        bandLabel: null,
        sourceName: 'AI 변형',
        sourceYear: null,
        school: null,
      }, how);
      reset();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="border-b border-zinc-800 px-3 py-2">
      {err && (
        <div className="mb-1.5 flex items-start gap-1.5 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] leading-snug text-rose-200">
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span className="min-w-0 flex-1">{err}</span>
          <button type="button" onClick={() => setErr(null)} className="text-rose-300 hover:text-white"><X className="h-3 w-3" /></button>
        </div>
      )}

      {variant ? (
        <div className="rounded-lg border border-white/15 bg-white/[.04] p-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10px]">
            <span className="rounded bg-white px-1.5 py-0.5 font-bold text-black">AI 변형</span>
            <span className="text-zinc-500">아직 저장 전입니다</span>
            {meta?.cost && <span className="ml-auto text-zinc-600">{meta.cost}</span>}
          </div>
          {meta?.warning && (
            <p className="mb-1 rounded bg-amber-500/10 px-1.5 py-1 text-[10px] leading-snug text-amber-200">{meta.warning}</p>
          )}
          <div className="max-h-40 overflow-y-auto text-[11px] leading-relaxed text-zinc-200">
            <MixedContentRenderer content={variant.content} />
            {variant.choices.length > 0 && (
              <div className="mt-1 space-y-0.5 text-zinc-400">
                {variant.choices.map((c, i) => <div key={i}><MixedContentRenderer content={c} /></div>)}
              </div>
            )}
          </div>
          <div className="mt-1.5 space-y-0.5 text-[10px] text-zinc-500">
            <div>정답 <span className="text-zinc-300">{variant.answer || '(없음)'}</span></div>
            {variant.changed && <div>바뀐 점 · {variant.changed}</div>}
          </div>
          <div className="mt-1.5 flex gap-1">
            <button type="button" disabled={busy} onClick={() => void commit('replace')}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-zinc-700 py-1 text-[11px] text-zinc-300 hover:border-white/30 hover:text-white disabled:opacity-40">
              <Repeat2 className="h-3 w-3" /> {baseIndex + 1}번 교체
            </button>
            <button type="button" disabled={busy} onClick={() => void commit('add')}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-white py-1 text-[11px] font-semibold text-black hover:opacity-90 disabled:opacity-40">
              <Plus className="h-3 w-3" /> 담기
            </button>
            <button type="button" disabled={busy} onClick={reset}
              className="rounded border border-zinc-800 px-2 text-[11px] text-zinc-500 hover:text-zinc-300 disabled:opacity-40">
              버리기
            </button>
          </div>
        </div>
      ) : armed ? (
        <div className="rounded-lg border border-white/15 bg-white/[.04] p-2">
          <p className="text-[10px] leading-snug text-zinc-400">
            같은 유형의 <b className="text-zinc-200">새 문제 1건</b>을 AI 로 만듭니다. 원본의 구조는 두고 숫자·조건만 바꿉니다.
            <br />건당 <b className="text-zinc-200">약 35원</b>이 듭니다(실측). 만든 것을 보고 <b className="text-zinc-200">담기</b>를 눌러야 저장됩니다.
          </p>
          <div className="mt-1.5 flex gap-1">
            <button type="button" disabled={busy} onClick={() => void generate()}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-white py-1 text-[11px] font-semibold text-black hover:opacity-90 disabled:opacity-40">
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {busy ? '만드는 중' : '만들기'}
            </button>
            <button type="button" disabled={busy} onClick={() => setArmed(false)}
              className="rounded border border-zinc-800 px-2 text-[11px] text-zinc-500 hover:text-zinc-300">
              취소
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setArmed(true)}
          className="flex w-full items-center justify-center gap-1 rounded-full border border-zinc-700 py-1 text-[11px] text-zinc-400 transition-colors hover:border-white/25 hover:text-zinc-200"
          title="같은 유형의 새 문제를 AI 로 1건 만든다 (실측 약 35원)">
          <Sparkles className="h-3 w-3" /> AI 변형 만들기
        </button>
      )}
    </div>
  );
}

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

      {/* ★ AI 변형은 「유사」 탭에서만 — 기출·고난도·서술형은 우리 자료로 찾는 자리다 */}
      {kind === 'similar' && (
        <AiVariantBox
          baseId={baseId}
          baseIndex={baseIndex}
          onPicked={(c, how) => { if (how === 'replace') onReplace(c); else onAdd(c); }}
        />
      )}

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
                  <MixedContentRenderer content={truncateLatexPreview(c.content, 200)} />
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
