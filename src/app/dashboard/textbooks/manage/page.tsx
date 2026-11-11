'use client';

// ============================================================================
// 교재 권한 관리 — 관리자가 선생님마다 중등/고등 교재 내려받기 권한과 만료일을 정한다
// ============================================================================
//
// ★ /admin 아래가 아니라 여기 있는 이유: /admin/* 는 플랫폼 super_admin 만 들어갈 수 있어서
//   역할 ADMIN(학원 관리자)이 못 연다. 권한 판단은 /api/textbooks/access 가 한다.
//
// UX 기준 (ui-ux-pro-max 점검):
//  - 바꾸면 그 줄만 바로 저장. 실패하면 원래 값으로 되돌리고 그 줄에 이유를 보여 준다.
//  - 여러 명 한꺼번에: 줄 앞 체크 → 아래 막대에서 「중등 켜기 / 고등 켜기 / 모두 끄기 / 만료일」.
//  - 만료일은 달력 + 빠른 선택(3개월·6개월·학년말). 14일 안에 끝나는 사람은 「곧 만료」.
//  - 스위치는 눌리는 영역 36px, 키보드 초점 표시, 화면 읽기 프로그램용 이름.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Clock, Loader2, Search, ShieldCheck, X } from 'lucide-react';
import { PANEL_SURFACE, RADIUS } from '@/components/ui/surface';
import { useTrackHref } from '@/lib/track/hooks';

type StaffRow = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  institute: string | null;
  isManager: boolean;
  canMiddle: boolean;
  canHigh: boolean;
  expiresAt: string | null;
  expired: boolean;
  lastDownloadAt: string | null;
  downloadCount: number;
};
type Patch = Partial<Pick<StaffRow, 'canMiddle' | 'canHigh' | 'expiresAt'>>;
type RowState = { s: 'saving' | 'saved' | 'error'; msg?: string };

const ROLE_LABEL: Record<string, string> = { ADMIN: '관리자', ORG_ADMIN: '원장', TEACHER: '선생님', TUTOR: '조교' };
const FOCUS = 'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/70';
const BTN = `inline-flex min-h-9 items-center gap-1.5 ${RADIUS.control} border border-white/[.08] bg-white/[.04] px-3 text-sm text-content-secondary hover:bg-white/[.07] hover:text-content-primary disabled:opacity-40 ${FOCUS}`;

function addMonths(today: string, months: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
/** 학년말 = 다음 2월 말일 */
function schoolYearEnd(today: string): string {
  const y = Number(today.slice(0, 4)) + (Number(today.slice(5, 7)) >= 3 ? 1 : 0);
  return new Date(Date.UTC(y, 2, 0)).toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
}

export default function TextbookAccessPage() {
  const href = useTrackHref();
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [today, setToday] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, RowState>>({});
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'granted' | 'none'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/textbooks/access', { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.message || '선생님 목록을 불러오지 못했습니다.');
        setRows(body.staff as StaffRow[]);
        setToday(body.today as string);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  /** 한 사람 저장. 성공 여부를 돌려준다 (일괄 처리에서 셈). */
  const save = useCallback(async (row: StaffRow, patch: Patch): Promise<boolean> => {
    const next = { ...row, ...patch };
    setRows((rs) => rs?.map((r) => (r.id === row.id ? next : r)) ?? rs);
    setState((s) => ({ ...s, [row.id]: { s: 'saving' } }));
    try {
      const r = await fetch('/api/textbooks/access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: row.id, canMiddle: next.canMiddle, canHigh: next.canHigh, expiresAt: next.expiresAt }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.message || '저장하지 못했습니다.');
      setRows((rs) => rs?.map((x) => (x.id === row.id ? { ...next, expired: !!body.expired } : x)) ?? rs);
      setState((s) => ({ ...s, [row.id]: { s: 'saved' } }));
      setTimeout(() => setState((s) => {
        if (s[row.id]?.s !== 'saved') return s;
        const { [row.id]: _drop, ...rest } = s;
        return rest;
      }), 1800);
      return true;
    } catch (e) {
      setRows((rs) => rs?.map((x) => (x.id === row.id ? row : x)) ?? rs); // 되돌리기
      setState((s) => ({ ...s, [row.id]: { s: 'error', msg: (e as Error).message } }));
      return false;
    }
  }, []);

  const editable = useMemo(() => (rows ?? []).filter((r) => !r.isManager), [rows]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (q && !(`${r.name} ${r.email ?? ''} ${r.institute ?? ''}`.toLowerCase().includes(q))) return false;
      const has = r.isManager || ((r.canMiddle || r.canHigh) && !r.expired);
      return filter === 'all' || (filter === 'granted' ? has : !has);
    });
  }, [rows, query, filter]);

  const visibleEditable = visible.filter((r) => !r.isManager);
  const allChecked = visibleEditable.length > 0 && visibleEditable.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(visibleEditable.map((r) => r.id)));
  const toggleOne = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const bulk = useCallback(async (label: string, patch: Patch) => {
    const targets = editable.filter((r) => selected.has(r.id));
    if (!targets.length) return;
    setBulkBusy(true);
    setBulkMsg(`${label} — ${targets.length}명 저장 중…`);
    let ok = 0;
    for (const r of targets) if (await save(r, patch)) ok += 1; // 한 명씩 (서버 부담·순서 보장)
    setBulkBusy(false);
    setBulkMsg(ok === targets.length ? `${label} — ${ok}명 저장했습니다.` : `${label} — ${ok}명 저장, ${targets.length - ok}명 실패 (줄에 이유 표시)`);
    if (ok === targets.length) setSelected(new Set());
  }, [editable, selected, save]);

  const counts = useMemo(() => {
    const e = editable;
    return {
      granted: e.filter((r) => (r.canMiddle || r.canHigh) && !r.expired).length,
      soon: e.filter((r) => r.expiresAt && !r.expired && today && daysBetween(today, r.expiresAt) <= 14).length,
      total: e.length,
    };
  }, [editable, today]);

  return (
    <div className="space-y-5 pb-24 text-content-primary">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href={href('/dashboard/textbooks')} className={`mb-2 inline-flex min-h-8 items-center gap-1 rounded text-xs text-content-tertiary hover:text-content-primary ${FOCUS}`}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> 교재 자료실
          </Link>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-content-tertiary" aria-hidden />
            <h1 className="text-lg font-semibold">교재 권한 관리</h1>
          </div>
          <p className="mt-1 text-sm text-content-tertiary">
            켠 학교급의 교재만 내려받을 수 있습니다. 바꾸면 바로 저장되고, 끄면 그 즉시 막힙니다.
          </p>
        </div>
        {rows && (
          <div className="flex flex-wrap gap-2 text-xs tabular-nums">
            <span className="rounded border border-white/[.08] bg-white/[.04] px-2 py-0.5 text-content-secondary">권한 있음 {counts.granted} / {counts.total}명</span>
            {counts.soon > 0 && (
              <span className="inline-flex items-center gap-1 rounded border border-white/[.12] bg-white/[.06] px-2 py-0.5 text-content-primary">
                <Clock className="h-3 w-3" aria-hidden /> 14일 안에 만료 {counts.soon}명
              </span>
            )}
          </div>
        )}
      </header>

      {error && (
        <div role="alert" className={`${RADIUS.panel} border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300`}>{error}</div>
      )}
      {!rows && !error && <div className={`${RADIUS.panel} ${PANEL_SURFACE} h-72 motion-safe:animate-pulse`} aria-busy="true" aria-label="선생님 목록 불러오는 중" />}

      {rows && (
        <div className={`${RADIUS.panel} ${PANEL_SURFACE} overflow-hidden`}>
          {/* 찾기·거르기 */}
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[.08] p-3">
            <div className="relative min-w-[200px] flex-1">
              <label htmlFor="access-search" className="sr-only">이름·이메일·소속 검색</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" aria-hidden />
              <input
                id="access-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름·이메일·소속으로 찾기"
                className={`h-9 w-full ${RADIUS.control} border border-chrome-border bg-chrome-input pl-9 pr-3 text-sm placeholder:text-content-tertiary focus:border-white/[.24] focus:outline-none`}
              />
            </div>
            <div role="group" aria-label="보기" className={`inline-flex ${RADIUS.control} border border-white/[.08] p-0.5`}>
              {([['all', '전체'], ['granted', '권한 있음'], ['none', '권한 없음']] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  aria-pressed={filter === k}
                  className={`min-h-8 rounded-md px-3 text-sm ${FOCUS} ${filter === k ? 'bg-white/[.10] text-content-primary' : 'text-content-tertiary hover:text-content-primary'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">선생님별 교재 권한</caption>
              <thead>
                <tr className="border-b border-white/[.06] text-left text-xs text-content-tertiary">
                  <th scope="col" className="w-10 px-3 py-2.5">
                    <input
                      id="select-all"
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                      aria-label="보이는 선생님 모두 선택"
                      className={`h-4 w-4 accent-white ${FOCUS}`}
                    />
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">이름</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">소속</th>
                  <th scope="col" className="px-3 py-2.5 text-center font-medium">중등</th>
                  <th scope="col" className="px-3 py-2.5 text-center font-medium">고등</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">만료일</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">최근 내려받기</th>
                  <th scope="col" className="w-32 px-3 py-2.5"><span className="sr-only">저장 상태</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const st = state[r.id];
                  const saving = st?.s === 'saving' || bulkBusy;
                  const left = r.expiresAt && today ? daysBetween(today, r.expiresAt) : null;
                  return (
                    <tr key={r.id} className={`border-b border-white/[.04] last:border-0 ${selected.has(r.id) ? 'bg-white/[.04]' : 'hover:bg-white/[.02]'}`}>
                      <td className="px-3 py-2">
                        {!r.isManager && (
                          <input
                            id={`sel-${r.id}`}
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleOne(r.id)}
                            aria-label={`${r.name} 선택`}
                            className={`h-4 w-4 accent-white ${FOCUS}`}
                          />
                        )}
                      </td>
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-content-tertiary">{r.email}</div>
                      </th>
                      <td className="px-3 py-2 text-content-secondary">
                        <div className="whitespace-nowrap">{r.institute ?? '—'}</div>
                        <div className="text-xs text-content-tertiary">{ROLE_LABEL[r.role] ?? r.role}</div>
                      </td>
                      {r.isManager ? (
                        <td colSpan={3} className="px-3 py-2 text-center text-xs text-content-tertiary">
                          관리자는 언제나 전부 받을 수 있습니다
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-center">
                            <Switch label={`${r.name} 중등 교재`} on={r.canMiddle} disabled={saving} onChange={(v) => save(r, { canMiddle: v })} />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Switch label={`${r.name} 고등 교재`} on={r.canHigh} disabled={saving} onChange={(v) => save(r, { canHigh: v })} />
                          </td>
                          <td className="px-3 py-2">
                            <ExpiryField
                              id={`expires-${r.id}`}
                              name={r.name}
                              value={r.expiresAt}
                              today={today}
                              disabled={saving || (!r.canMiddle && !r.canHigh)}
                              onChange={(v) => save(r, { expiresAt: v })}
                            />
                            {r.expired && <div className="mt-1 text-xs text-red-300">만료됨 — 날짜를 늦추면 다시 열립니다</div>}
                            {!r.expired && left !== null && left <= 14 && (
                              <div className="mt-1 inline-flex items-center gap-1 text-xs text-content-primary">
                                <Clock className="h-3 w-3" aria-hidden /> {left === 0 ? '오늘까지' : `${left}일 남음`}
                              </div>
                            )}
                          </td>
                        </>
                      )}
                      <td className="px-3 py-2 text-xs text-content-tertiary tabular-nums">
                        {r.lastDownloadAt
                          ? <>{r.lastDownloadAt.slice(0, 10)}<span className="ml-1">· {r.downloadCount}회</span></>
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs" aria-live="polite">
                        {st?.s === 'saving' && <span className="inline-flex items-center gap-1 text-content-tertiary"><Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden />저장 중</span>}
                        {st?.s === 'saved' && <span className="inline-flex items-center gap-1 text-emerald-400"><Check className="h-3.5 w-3.5" aria-hidden />저장됨</span>}
                        {st?.s === 'error' && <span role="alert" className="text-red-300">{st.msg}</span>}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-content-tertiary">
                      조건에 맞는 선생님이 없습니다.{' '}
                      {(query || filter !== 'all') && (
                        <button type="button" onClick={() => { setQuery(''); setFilter('all'); }} className={`underline underline-offset-2 hover:text-content-primary ${FOCUS}`}>
                          거르기 풀기
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 여러 명 한꺼번에 ── */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div role="toolbar" aria-label={`${selected.size}명 한꺼번에 바꾸기`} className={`flex flex-wrap items-center gap-2 ${RADIUS.panel} border border-white/[.14] bg-surface-card px-3 py-2`}>
            <span className="px-1 text-sm font-medium tabular-nums">{selected.size}명 선택</span>
            <button type="button" disabled={bulkBusy} onClick={() => bulk('중등 켜기', { canMiddle: true })} className={BTN}>중등 켜기</button>
            <button type="button" disabled={bulkBusy} onClick={() => bulk('고등 켜기', { canHigh: true })} className={BTN}>고등 켜기</button>
            <button type="button" disabled={bulkBusy} onClick={() => bulk('둘 다 켜기', { canMiddle: true, canHigh: true })} className={BTN}>둘 다 켜기</button>
            <button type="button" disabled={bulkBusy} onClick={() => bulk('모두 끄기', { canMiddle: false, canHigh: false })} className={`${BTN} text-red-300 hover:text-red-200`}>모두 끄기</button>
            {today && (
              <button type="button" disabled={bulkBusy} onClick={() => bulk(`학년말(${schoolYearEnd(today)})까지`, { expiresAt: schoolYearEnd(today) })} className={BTN}>
                학년말까지
              </button>
            )}
            <button type="button" onClick={() => { setSelected(new Set()); setBulkMsg(null); }} aria-label="선택 풀기" className={`${BTN} px-2`}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
      <div aria-live="polite" className="sr-only">{bulkMsg}</div>
      {bulkMsg && selected.size === 0 && (
        <div role="status" className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div className={`${RADIUS.control} border border-white/[.12] bg-surface-card px-4 py-2.5 text-sm`}>
            {bulkMsg}
            <button type="button" onClick={() => setBulkMsg(null)} aria-label="알림 닫기" className={`ml-3 align-middle text-content-tertiary hover:text-content-primary ${FOCUS}`}>
              <X className="inline h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExpiryField({
  id, name, value, today, disabled, onChange,
}: {
  id: string; name: string; value: string | null; today: string; disabled: boolean; onChange: (v: string | null) => void;
}) {
  const presets = today ? [
    ['3개월', addMonths(today, 3)], ['6개월', addMonths(today, 6)], ['학년말', schoolYearEnd(today)],
  ] as const : [];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label htmlFor={id} className="sr-only">{name} 만료일</label>
      <input
        id={id}
        type="date"
        min={today}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        className={`h-8 ${RADIUS.control} border border-chrome-border bg-chrome-input px-2 text-sm tabular-nums [color-scheme:dark] disabled:opacity-40 ${FOCUS}`}
      />
      {!disabled && (
        <select
          aria-label={`${name} 만료일 빠른 선택`}
          value=""
          onChange={(e) => e.target.value && onChange(e.target.value === 'none' ? null : e.target.value)}
          className={`h-8 ${RADIUS.control} border border-white/[.08] bg-white/[.03] px-1.5 text-xs text-content-secondary ${FOCUS}`}
        >
          <option value="">빠른 선택</option>
          {presets.map(([label, date]) => <option key={label} value={date}>{label} ({date})</option>)}
          {value && <option value="none">기한 없애기</option>}
        </select>
      )}
      {!value && !disabled && <span className="whitespace-nowrap text-xs text-content-tertiary">기한 없음</span>}
    </div>
  );
}

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`group inline-flex h-9 w-12 items-center justify-center rounded-lg disabled:cursor-wait ${FOCUS}`}
    >
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors group-disabled:opacity-50 ${
          on ? 'border-white/[.30] bg-white/[.85]' : 'border-white/[.14] bg-white/[.06] group-hover:bg-white/[.10]'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full motion-safe:transition-transform ${
            on ? 'translate-x-[18px] bg-surface-base' : 'translate-x-[3px] bg-white/[.60]'
          }`}
        />
      </span>
      <span className="sr-only">{on ? '켜짐' : '꺼짐'}</span>
    </button>
  );
}
