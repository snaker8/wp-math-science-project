'use client';

// ============================================================================
// 취약 과제 · 오답 과제 · 매트릭스 칸 과제 만들기
// ----------------------------------------------------------------------------
// docs/PLAN_CLASS_HUB_REBUILD.md 단계 4·5 · 매쓰홀릭 조사 08-type-analysis §5-1, §10-1.
//
// ★ 흐름을 거꾸로 잡았다 — **결과가 이미 다 선택된 채로 온다. 교사는 빼기만 한다.**
//   고를 게 수십 개인데 하나씩 담게 하면 아무도 안 쓴다. 매쓰홀릭이 이렇게 한다.
//
// 취약 = 약한 유형(γ/β)에서 **새 문제**를 뽑는다.
// 오답 = **틀린 그 문제**를 다시 낸다.
// 칸  = 숙달 매트릭스에서 고른 (소단원 × 난이도) 칸마다 **새 문제** N개. (매쓰홀릭 유형과제)
// 셋 다 AI 를 안 쓴다. 이미 채점된 기록만 본다 — 비용 0.
//
// 매쓰홀릭 과제 옵션 모달(08 §5-1)에서 가져온 것:
//   · 과제명 자동 제안 3종 + [적용] — 타이핑이 없다
//   · 「마지막 설정 기간」 재사용 — 매번 날짜 찍는 수고를 없앤다
//   · 유형(칸)당 출제 문제 수 1 / 2 / 3
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';

export type GenKind = 'weak' | 'wrong' | 'cells';

/** 숙달 매트릭스에서 고른 칸 — 소단원 코드 + 난이도 enum 라벨들 */
export interface CellSpec {
  unit: string;
  levels: string[];
  label: string;
}

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
  /** 칸 과제 — 후보 수 · 이미 풀어서 뺀 수 */
  supply?: number;
  excluded?: number;
}

/** 수식·마크업을 걷어낸 한 줄 미리보기 — 고르는 자리에선 본문 렌더까지 필요 없다 */
export function previewText(latex: string): string {
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

const LAST_DUE_KEY = 'assignments:lastDueAt';

const KIND_TITLE: Record<GenKind, string> = {
  weak: '취약 과제 만들기',
  wrong: '오답 과제 만들기',
  cells: '고른 칸으로 과제 만들기',
};
const KIND_PREFIX: Record<GenKind, string> = { weak: '취약 보충', wrong: '오답 보충', cells: '숙달 보충' };

function readLastDue(): string {
  try {
    const v = localStorage.getItem(LAST_DUE_KEY);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
  } catch {
    return '';
  }
}

export function GenerateAssignmentModal({
  classId, studentIds, kind, cells, className, onClose, onDone,
}: {
  classId: string;
  studentIds: string[];
  kind: GenKind;
  /** kind === 'cells' 일 때 — 매트릭스에서 고른 칸 */
  cells?: CellSpec[];
  /** 과제명 제안용 */
  className?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<PickGroup[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openGroup, setOpenGroup] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 유형(칸)당 문제 수 — 취약·칸 과제에서만 의미 있다 */
  const [perType, setPerType] = useState<1 | 2 | 3>(kind === 'cells' ? 2 : 1);

  const today = new Date();
  const md = `${today.getMonth() + 1}/${today.getDate()}`;
  const [title, setTitle] = useState(`${KIND_PREFIX[kind]} ${md}`);
  const [dueAt, setDueAt] = useState('');
  const [lastDue, setLastDue] = useState('');
  useEffect(() => { setLastDue(readLastDue()); }, []);

  const cellsKey = useMemo(() => (cells ?? []).map((c) => `${c.unit}|${c.levels.join(',')}`).join(';'), [cells]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      let url: string;
      let body: Record<string, unknown>;
      if (kind === 'weak') {
        url = '/api/clinic/weak-types';
        body = { studentIds, perType };
      } else if (kind === 'wrong') {
        url = '/api/clinic/wrong-problems';
        body = { studentIds, limit: 60 };
      } else {
        url = '/api/clinic/cell-problems';
        body = { classId, studentIds, cells: cells ?? [], perCell: perType };
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const gs = ((data.groups || []) as Array<Record<string, unknown>>).map((g) => ({
        code: g.code as string,
        name: (g.name as string) || (g.code as string),
        status: g.status as 'gamma' | 'beta' | undefined,
        studentNames: (g.studentNames as string[]) || undefined,
        supply: typeof g.supply === 'number' ? (g.supply as number) : undefined,
        excluded: typeof g.excluded === 'number' ? (g.excluded as number) : undefined,
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
    // cells 는 내용 키(cellsKey)로 비교 — 부모가 매 렌더마다 새 배열을 만들어도 다시 안 부른다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, studentIds, perType, classId, cellsKey]);

  useEffect(() => { void load(); }, [load]);

  const total = useMemo(() => groups.reduce((n, g) => n + g.problems.length, 0), [groups]);

  /** 매쓰홀릭 「추천 과제명」 — (날짜) 출제단원 / 출제범위 / (날짜) 수업명 */
  const suggestions = useMemo(() => {
    const first = groups.find((g) => g.problems.length > 0)?.name ?? '';
    const short = first.split(' > ').pop()?.replace(/\s*·\s*[^·]+$/, '') ?? first;
    const withCount = groups.length > 1 ? `${short} 외 ${groups.length - 1}` : short;
    const out: string[] = [];
    if (short) out.push(`(${md}) ${withCount}`);
    if (short) out.push(withCount);
    if (className) out.push(`(${md}) ${className} ${KIND_PREFIX[kind]}`);
    return Array.from(new Set(out.filter((s) => s.trim() && s !== title)));
  }, [groups, className, kind, md, title]);

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
          // 칸 과제는 매쓰홀릭 「유형과제」에 해당 — assignments.kind 'type'
          kind: kind === 'cells' ? 'type' : kind,
          problemIds: ordered,
          dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : null,
          studentIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (dueAt) {
        try { localStorage.setItem(LAST_DUE_KEY, dueAt); } catch { /* 저장 못 해도 과제는 나갔다 */ }
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const emptyMain = kind === 'weak'
    ? '약한 유형이 아직 잡히지 않았습니다.'
    : kind === 'wrong'
      ? '모아 낼 오답이 없습니다.'
      : '고른 칸에 낼 문제가 없습니다.';
  const emptyHint = kind === 'cells'
    ? '문제은행에 이 단원·난이도로 분류된 문제가 있어야 나옵니다. 분류가 진행되면 채워집니다.'
    : '채점 기록이 쌓여야 나옵니다. 시험을 한 번 채점하면 그때부터 여기에 모입니다.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-card">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-content-primary">{KIND_TITLE[kind]}</h2>
            <p className="mt-0.5 text-xs text-content-tertiary">
              {kind === 'weak' && `약한 유형에서 뽑았습니다. 앞에서부터 ${DEFAULT_PICK}문항이 담겨 있습니다.`}
              {kind === 'wrong' && `실제로 틀린 문제입니다. 많이 틀린 것부터 ${DEFAULT_PICK}문항이 담겨 있습니다.`}
              {kind === 'cells' && `매트릭스에서 고른 ${cells?.length ?? 0}칸 · 칸당 ${perType}문제. 이미 푼 문제는 뺐습니다.`}
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
              {kind === 'cells' ? '문제은행에서 뽑는 중' : '채점 기록에서 찾는 중'}
            </div>
          ) : total === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <AlertCircle className="h-5 w-5 text-content-muted" />
              <p className="text-sm text-content-secondary">{emptyMain}</p>
              <p className="max-w-sm text-xs leading-relaxed text-content-muted">{emptyHint}</p>
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
                        {g.problems.length === 0 && (
                          <span className="shrink-0 text-xs text-content-muted">
                            {g.supply === 0 ? '분류된 문제 없음' : '낼 문제 없음'}
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

                    {on && g.problems.length > 0 && (
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
                                  {previewText(p.content)}
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
              {suggestions.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setTitle(s)}
                      title="이 이름 적용"
                      className="max-w-full truncate rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-content-tertiary transition-colors hover:border-white/20 hover:text-content-primary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-content-tertiary">마감</label>
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-1.5 text-sm text-content-primary focus:border-white/20 focus:outline-none"
              />
              {lastDue && lastDue !== dueAt && (
                <button
                  type="button"
                  onClick={() => setDueAt(lastDue)}
                  className="mt-1.5 rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-content-tertiary transition-colors hover:border-white/20 hover:text-content-primary"
                >
                  마지막 마감 {lastDue.slice(5).replace('-', '/')} 적용
                </button>
              )}
            </div>
          </div>

          {err && <p className="mb-2 text-sm text-red-400">{err}</p>}

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs tabular-nums text-content-tertiary">
                {loading ? ' ' : `문제 ${picked.size}/${total} · 학생 ${studentIds.length}명`}
              </span>
              {kind !== 'wrong' && (
                <span className="inline-flex items-center gap-1 text-[11px] text-content-tertiary">
                  {kind === 'cells' ? '칸당' : '유형당'}
                  {([1, 2, 3] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPerType(n)}
                      disabled={loading}
                      className={`rounded px-1.5 py-0.5 tabular-nums transition-colors ${
                        perType === n ? 'bg-white text-black' : 'border border-white/10 hover:border-white/20'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  문제
                </span>
              )}
            </div>
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
