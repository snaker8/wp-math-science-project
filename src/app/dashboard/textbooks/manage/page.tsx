'use client';

// ============================================================================
// 교재 권한 관리 — 관리자가 선생님마다 중등/고등 교재 내려받기 권한과 만료일을 정한다
// ============================================================================
//
// ★ /admin 아래가 아니라 여기 있는 이유: /admin/* 는 플랫폼 super_admin 만 들어갈 수 있어서
//   역할 ADMIN(학원 관리자)이 못 연다. 권한 판단은 /api/textbooks/access 가 한다.
// 바꾸면 바로 저장된다 (줄마다). 실패하면 원래 값으로 되돌리고 이유를 보여 준다.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, Search, ShieldCheck } from 'lucide-react';
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

type RowState = 'idle' | 'saving' | 'saved' | 'error';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: '관리자', ORG_ADMIN: '원장', TEACHER: '선생님', TUTOR: '조교',
};

export default function TextbookAccessPage() {
  const href = useTrackHref();
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [today, setToday] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, { s: RowState; msg?: string }>>({});
  const [query, setQuery] = useState('');
  const [onlyGranted, setOnlyGranted] = useState(false);

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

  const save = useCallback(async (row: StaffRow, patch: Partial<Pick<StaffRow, 'canMiddle' | 'canHigh' | 'expiresAt'>>) => {
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
      setTimeout(() => setState((s) => (s[row.id]?.s === 'saved' ? { ...s, [row.id]: { s: 'idle' } } : s)), 1800);
    } catch (e) {
      setRows((rs) => rs?.map((x) => (x.id === row.id ? row : x)) ?? rs); // 되돌리기
      setState((s) => ({ ...s, [row.id]: { s: 'error', msg: (e as Error).message } }));
    }
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) =>
      (!q || r.name.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q) || (r.institute ?? '').toLowerCase().includes(q))
      && (!onlyGranted || r.isManager || r.canMiddle || r.canHigh));
  }, [rows, query, onlyGranted]);

  const granted = (rows ?? []).filter((r) => !r.isManager && (r.canMiddle || r.canHigh) && !r.expired).length;

  return (
    <div className="space-y-5 text-content-primary">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href={href('/dashboard/textbooks')} className="mb-2 inline-flex items-center gap-1 text-xs text-content-tertiary hover:text-content-primary">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> 교재 자료실
          </Link>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-content-tertiary" aria-hidden />
            <h1 className="text-lg font-semibold">교재 권한 관리</h1>
          </div>
          <p className="mt-1 text-sm text-content-tertiary">
            체크한 학교급의 교재만 내려받을 수 있습니다. 바꾸면 바로 저장되고, 체크를 풀면 그 즉시 막힙니다.
          </p>
        </div>
        {rows && (
          <span className="whitespace-nowrap rounded border border-white/[.08] bg-white/[.04] px-2 py-0.5 text-xs text-content-secondary tabular-nums">
            권한 있는 선생님 {granted}명 / 전체 {rows.length}명
          </span>
        )}
      </header>

      {error && (
        <div className={`${RADIUS.panel} border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300`}>{error}</div>
      )}

      {!rows && !error && <div className={`${RADIUS.panel} ${PANEL_SURFACE} h-64 animate-pulse`} aria-busy="true" />}

      {rows && (
        <div className={`${RADIUS.panel} ${PANEL_SURFACE} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-3 border-b border-white/[.08] p-3">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">이름·이메일·소속 검색</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" aria-hidden />
              <input
                id="access-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름·이메일·소속으로 찾기"
                className={`w-full ${RADIUS.control} border border-chrome-border bg-chrome-input py-1.5 pl-9 pr-3 text-sm placeholder:text-content-muted focus:border-white/[.20] focus:outline-none`}
              />
            </label>
            <label className="flex items-center gap-2 whitespace-nowrap text-sm text-content-secondary">
              <input id="only-granted" type="checkbox" checked={onlyGranted} onChange={(e) => setOnlyGranted(e.target.checked)} className="accent-white" />
              권한 있는 사람만
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-white/[.06] text-left text-xs text-content-muted">
                  <th className="px-4 py-2.5 font-medium">이름</th>
                  <th className="px-4 py-2.5 font-medium">소속</th>
                  <th className="px-4 py-2.5 text-center font-medium">중등</th>
                  <th className="px-4 py-2.5 text-center font-medium">고등</th>
                  <th className="px-4 py-2.5 font-medium">만료일</th>
                  <th className="px-4 py-2.5 font-medium">최근 내려받기</th>
                  <th className="w-28 px-4 py-2.5 font-medium"><span className="sr-only">저장 상태</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const st = state[r.id];
                  return (
                    <tr key={r.id} className="border-b border-white/[.04] last:border-0 hover:bg-white/[.02]">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-content-muted">{r.email}</div>
                      </td>
                      <td className="px-4 py-2.5 text-content-secondary">
                        <div className="whitespace-nowrap">{r.institute ?? '—'}</div>
                        <div className="text-xs text-content-muted">{ROLE_LABEL[r.role] ?? r.role}</div>
                      </td>
                      {r.isManager ? (
                        <td colSpan={3} className="px-4 py-2.5 text-center text-xs text-content-tertiary">
                          관리자는 언제나 전부 받을 수 있습니다
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-2.5 text-center">
                            <Switch label={`${r.name} 중등`} on={r.canMiddle} disabled={st?.s === 'saving'} onChange={(v) => save(r, { canMiddle: v })} />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <Switch label={`${r.name} 고등`} on={r.canHigh} disabled={st?.s === 'saving'} onChange={(v) => save(r, { canHigh: v })} />
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <input
                                id={`expires-${r.id}`}
                                type="date"
                                min={today}
                                value={r.expiresAt ?? ''}
                                disabled={st?.s === 'saving' || (!r.canMiddle && !r.canHigh)}
                                onChange={(e) => save(r, { expiresAt: e.target.value || null })}
                                aria-label={`${r.name} 만료일`}
                                className={`${RADIUS.control} border border-chrome-border bg-chrome-input px-2 py-1 text-sm tabular-nums disabled:opacity-40 [color-scheme:dark]`}
                              />
                              {r.expired && <span className="whitespace-nowrap text-xs text-red-300">만료됨</span>}
                              {!r.expiresAt && (r.canMiddle || r.canHigh) && (
                                <span className="whitespace-nowrap text-xs text-content-muted">기한 없음</span>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                      <td className="px-4 py-2.5 text-xs text-content-tertiary tabular-nums">
                        {r.lastDownloadAt
                          ? <>{r.lastDownloadAt.slice(0, 10)} <span className="text-content-muted">· {r.downloadCount}회</span></>
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {st?.s === 'saving' && <span className="inline-flex items-center gap-1 text-content-tertiary"><Loader2 className="h-3.5 w-3.5 animate-spin" />저장 중</span>}
                        {st?.s === 'saved' && <span className="inline-flex items-center gap-1 text-emerald-400"><Check className="h-3.5 w-3.5" />저장됨</span>}
                        {st?.s === 'error' && <span className="text-red-300" title={st.msg}>{st.msg}</span>}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-content-tertiary">해당하는 선생님이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
        on ? 'border-white/[.30] bg-white/[.85]' : 'border-white/[.12] bg-white/[.06]'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
          on ? 'translate-x-[18px] bg-surface-base' : 'translate-x-[3px] bg-white/[.55]'
        }`}
      />
    </button>
  );
}
