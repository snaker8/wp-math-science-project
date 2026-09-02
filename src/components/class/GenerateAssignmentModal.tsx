'use client';

// ============================================================================
// 취약 과제 · 오답 과제 만들기
// ----------------------------------------------------------------------------
// docs/PLAN_CLASS_HUB_REBUILD.md 단계 4 · 매쓰홀릭 조사 08-type-analysis §10-1.
//
// ★ 흐름을 거꾸로 잡았다 — **결과가 이미 다 선택된 채로 온다. 교사는 빼기만 한다.**
//   고를 게 수십 개인데 하나씩 담게 하면 아무도 안 쓴다. 매쓰홀릭이 이렇게 한다.
//
// 취약 = 약한 유형(γ/β)에서 **새 문제**를 뽑는다.
// 오답 = **틀린 그 문제**를 다시 낸다.
// 둘 다 AI 를 안 쓴다. 이미 채점된 기록만 본다 — 비용 0.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';

export type GenKind = 'weak' | 'wrong';

interface PickProblem {
  id: string;
  content: string;
  difficulty: number | null;
  /** 오답 과제에서만 — 이 문제를 틀린 학생 */
  missedBy?: string[];
}

interface PickGroup {
  code: string;
  name: string;
  status?: 'gamma' | 'beta';
  studentNames?: string[];
  problems: PickProblem[];
}

/** 수식·마크업을 걷어낸 한 줄 미리보기 — 고르는 자리에선 본문 렌더까지 필요 없다 */
function preview(latex: string): string {
  const s = latex
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' [그림] ')
    .replace(/\$\$?[^$]*\$\$?/g, ' □ ')
    .replace(/\\begin\{[^}]*\}[\s\S]*?\\end\{[^}]*\}/g, ' □ ')
    .replace(/[\\{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 90 ? `${s.slice(0, 90)}…` : s || '(본문 없음)';
}

const STATUS_LABEL: Record<string, string> = { gamma: '취약', beta: '흔들림' };

/** 한 번에 낼 만한 분량. 20문항이면 보통 한 타임에 푼다. */
const DEFAULT_PICK = 20;

export function GenerateAssignmentModal({
  classId, studentIds, kind, onClose, onDone,
}: {
  classId: string;
  studentIds: string[];
  kind: GenKind;
  onClose: () => void;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<PickGroup[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openGroup, setOpenGroup] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const today = new Date();
  const [title, setTitle] = useState(
    `${kind === 'weak' ? '취약' : '오답'} 보충 ${today.getMonth() + 1}/${today.getDate()}`
  );
  const [dueAt, setDueAt] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const url = kind === 'weak' ? '/api/clinic/weak-types' : '/api/clinic/wrong-problems';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'weak' ? { studentIds, perType: 1 } : { studentIds, limit: 60 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const gs = ((data.groups || []) as Array<Record<string, unknown>>).map((g) => ({
        code: g.code as string,
        name: (g.name as string) || (g.code as string),
        status: g.status as 'gamma' | 'beta' | undefined,
        studentNames: (g.studentNames as string[]) || undefined,
        problems: ((g.problems || []) as Array<Record<string, unknown>>).map((p) => ({
          id: p.id as string,
          content: (p.content as string) || '',
          difficulty: (p.difficulty as number | null) ?? null,
          missedBy: (p.missedBy as string[]) || undefined,
        })),
      })) as PickGroup[];
      setGroups(gs);
      // ★ 선택된 채로 시작하되 **상한을 둔다.**
      //   한 반의 약한 유형은 쉽게 80개가 넘는다(실측: 중3 5명에 82유형).
      //   그걸 다 담으면 80문항짜리 과제가 나가는데, 그건 아무도 안 푼다.
      //   앞쪽(가장 약한 유형)부터 DEFAULT_PICK 개만 담고 나머지는 보여만 준다.
      const flat = gs.flatMap((g) => g.problems.map((p) => p.id));
      setPicked(new Set(flat.slice(0, DEFAULT_PICK)));
      setOpenGroup(new Set(gs.slice(0, 3).map((g) => g.code)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [kind, studentIds]);

  useEffect(() => { void load(); }, [load]);

  const total = useMemo(() => groups.reduce((n, g) => n + g.problems.length, 0), [groups]);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleGroup = (g: PickGroup) => {
    const ids = g.problems.map((p) => p.id);
    const allOn = ids.every((id) => picked.has(id));
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of ids) { if (allOn) next.delete(id); else next.add(id); }
      return next;
    });
  };

  const submit = async () => {
    if (picked.size === 0) { setErr('문제를 하나 이상 남겨 주세요'); return; }
    setBusy(true);
    setErr(null);
    try {
      // 화면에 보이는 순서(유형 → 문제)를 시험지 순서로 그대로 쓴다
      const ordered = groups.flatMap((g) => g.problems.map((p) => p.id)).filter((id) => picked.has(id));
      const res = await fetch(`/api/classes/${classId}/assignments/from-problems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          kind,
          problemIds: ordered,
          dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-card">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-content-primary">
              {kind === 'weak' ? '취약 과제 만들기' : '오답 과제 만들기'}
            </h2>
            <p className="mt-0.5 text-xs text-content-tertiary">
              {kind === 'weak'
                ? `약한 유형에서 뽑았습니다. 앞에서부터 ${DEFAULT_PICK}문항이 담겨 있습니다.`
                : `실제로 틀린 문제입니다. 많이 틀린 것부터 ${DEFAULT_PICK}문항이 담겨 있습니다.`}
            </p>
          </div>
          <button onClick={onClose} className="text-content-tertiary hover:text-content-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-16 text-sm text-content-tertiary">
              <Loader2 className="h-4 w-4 animate-spin" />
              채점 기록에서 찾는 중
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <AlertCircle className="h-5 w-5 text-content-muted" />
              <p className="text-sm text-content-secondary">
                {kind === 'weak' ? '약한 유형이 아직 잡히지 않았습니다.' : '모아 낼 오답이 없습니다.'}
              </p>
              <p className="max-w-sm text-xs leading-relaxed text-content-muted">
                채점 기록이 쌓여야 나옵니다. 시험을 한 번 채점하면 그때부터 여기에 모입니다.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {groups.map((g) => {
                const on = openGroup.has(g.code);
                const cnt = g.problems.filter((p) => picked.has(p.id)).length;
                return (
                  <div key={g.code} className="rounded-lg border border-white/10">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button
                        onClick={() => setOpenGroup((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.code)) next.delete(g.code); else next.add(g.code);
                          return next;
                        })}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {on ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-content-tertiary" />
                            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-content-tertiary" />}
                        {g.status && (
                          <span className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-content-tertiary">
                            {STATUS_LABEL[g.status] ?? g.status}
                          </span>
                        )}
                        <span className="truncate text-sm text-content-primary">{g.name}</span>
                        {g.studentNames && g.studentNames.length > 0 && (
                          <span className="hidden shrink-0 text-xs text-content-muted sm:inline">
                            {g.studentNames.slice(0, 3).join('·')}
                            {g.studentNames.length > 3 && ` 외 ${g.studentNames.length - 3}`}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => toggleGroup(g)}
                        className="shrink-0 text-xs tabular-nums text-content-tertiary transition-colors hover:text-content-primary"
                      >
                        {cnt}/{g.problems.length}
                      </button>
                    </div>

                    {on && (
                      <div className="border-t border-white/5">
                        {g.problems.map((p) => {
                          const sel = picked.has(p.id);
                          return (
                            <button
                              key={p.id}
                              onClick={() => toggle(p.id)}
                              className={`flex w-full items-start gap-2.5 border-b border-white/5 px-3 py-2 text-left last:border-0 transition-colors ${
                                sel ? 'hover:bg-white/5' : 'opacity-40 hover:opacity-70'
                              }`}
                            >
                              <span
                                className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px] ${
                                  sel ? 'border-white bg-white text-black' : 'border-white/20'
                                }`}
                              >
                                {sel ? '✓' : ''}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs text-content-secondary">
                                  {preview(p.content)}
                                </span>
                                <span className="mt-0.5 block text-[11px] text-content-muted">
                                  {p.difficulty != null && `난이도 ${p.difficulty}`}
                                  {p.missedBy && p.missedBy.length > 0 && (
                                    <>
                                      {p.difficulty != null && ' · '}
                                      {p.missedBy.length}명 오답 ({p.missedBy.slice(0, 3).join('·')}
                                      {p.missedBy.length > 3 && ' 외'})
                                    </>
                                  )}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 px-5 py-3">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-content-tertiary">과제 이름</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-1.5 text-sm text-content-primary focus:border-white/20 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-content-tertiary">마감</label>
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-1.5 text-sm text-content-primary focus:border-white/20 focus:outline-none"
              />
            </div>
          </div>

          {err && <p className="mb-2 text-sm text-red-400">{err}</p>}

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs tabular-nums text-content-tertiary">
              {loading ? ' ' : `문제 ${picked.size}/${total} · 학생 ${studentIds.length}명`}
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-sm text-content-secondary transition-colors hover:text-content-primary"
              >
                취소
              </button>
              <button
                onClick={() => void submit()}
                disabled={busy || loading || picked.size === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                과제로 내기
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
