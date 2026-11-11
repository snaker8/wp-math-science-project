'use client';

// ============================================================================
// 교재 자료실 — 과정을 고르면 시중교재가 카드로, 본문·해설·정답 버튼을 누르면 내려받기
// ============================================================================
//
// 2026-11-11 대표: "수학교재 파일 사이트 — 권한 있는 사람만 다운받아지게, 권한은 관리자가 설정".
// 받을 수 있는 학교급(중등/고등)만 서버가 내려준다. 내려받기는 매번 서버가 권한을 다시 확인하고
// 5분짜리 주소를 준다 (/api/textbooks/files/[id]/download).
//
// UX 기준 (ui-ux-pro-max 점검):
//  - 고른 과정은 주소(?course=)에 남는다 → 링크로 공유·뒤로가기 그대로.
//  - 모든 버튼에 키보드 초점 표시, 누를 곳은 높이 36px 이상, 글자는 12px 이상.
//  - 내려받기: 누르는 동안 회전 표시, 끝나면 그 버튼에 「받음」 체크 (이번 방문 동안).
//  - 검색 결과가 없으면 비슷한 교재 이름을 눌러 볼 수 있게 제안.
//  - 「/」 키로 검색창.

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Check, Download, Library, Loader2, Lock, Search, Settings2, X } from 'lucide-react';
import { PANEL_SURFACE, RADIUS } from '@/components/ui/surface';
import { useTrackHref } from '@/lib/track/hooks';
import { formatSize, type CatalogBook, type CatalogCourse, type CatalogFile } from '@/lib/textbooks/catalog';
import type { TextbookLevel } from '@/lib/textbooks/access';

type ListResponse = {
  levels: TextbookLevel[];
  manager: boolean;
  expiresAt: string | null;
  courses: CatalogCourse[];
};

const LAST_COURSE_KEY = 'textbooks:lastCourse';
const FOCUS = 'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/70';
const CHIP = `inline-flex min-h-9 items-center whitespace-nowrap ${RADIUS.control} border px-3 text-sm transition-colors ${FOCUS}`;
const CHIP_OFF = 'border-white/[.08] bg-white/[.03] text-content-secondary hover:bg-white/[.06] hover:text-content-primary';
const CHIP_ON = 'border-white/[.16] bg-white/[.10] text-content-primary';
const META_PILL = 'whitespace-nowrap rounded border border-white/[.08] bg-white/[.04] px-2 py-0.5 text-xs text-content-secondary tabular-nums';

// useSearchParams 는 Suspense 안에서만 (Next 14.1 빌드 규칙)
export default function TextbooksPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <TextbooksLibrary />
    </Suspense>
  );
}

function TextbooksLibrary() {
  const href = useTrackHref();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<ListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  // ── 목록 불러오기 ──
  useEffect(() => {
    let alive = true;
    fetch('/api/textbooks', { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.message || '교재 목록을 불러오지 못했습니다.');
        return body as ListResponse;
      })
      .then((body) => alive && setData(body))
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => { alive = false; };
  }, []);

  const courses = useMemo(() => data?.courses ?? [], [data]);

  // ── 지금 과정: 주소(?course=중등|중2-1) → 마지막 본 과정 → 공통수학1 → 첫 과정 ──
  const current = useMemo(() => {
    if (!courses.length) return null;
    const key = (c: CatalogCourse) => `${c.level}|${c.course}`;
    const fromUrl = params.get('course');
    let saved: string | null = null;
    try { saved = localStorage.getItem(LAST_COURSE_KEY); } catch { /* 저장소 막힘 */ }
    return courses.find((c) => key(c) === fromUrl)
      ?? courses.find((c) => key(c) === saved)
      ?? courses.find((c) => c.course === '공통수학1')
      ?? courses[0];
  }, [courses, params]);

  const pickCourse = useCallback((c: CatalogCourse) => {
    const key = `${c.level}|${c.course}`;
    setQuery('');
    try { localStorage.setItem(LAST_COURSE_KEY, key); } catch { /* 무시 */ }
    const next = new URLSearchParams(params.toString());
    next.set('course', key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  // ── 「/」 로 검색창 ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── 내려받기 ──
  const download = useCallback(async (file: CatalogFile, book: string) => {
    if (busyId) return;
    setBusyId(file.id);
    try {
      const r = await fetch(`/api/textbooks/files/${file.id}/download`, { method: 'POST' });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body.url) throw new Error(body.message || '내려받기 주소를 만들지 못했습니다.');
      window.location.assign(body.url as string);
      setDoneIds((s) => new Set(s).add(file.id));
      setToast({ text: `${book} · ${file.label} 내려받기를 시작했습니다 (${formatSize(file.size)}).`, tone: 'ok' });
    } catch (e) {
      setToast({ text: (e as Error).message, tone: 'err' });
    } finally {
      setBusyId(null);
    }
  }, [busyId]);

  // ── 검색 (전체 과정) ──
  const q = query.trim().toLowerCase();
  const searchHits = useMemo(() => {
    if (!q) return [];
    return courses
      .map((c) => ({ ...c, books: c.books.filter((b) => b.book.toLowerCase().includes(q) || c.course.toLowerCase().includes(q)) }))
      .filter((c) => c.books.length);
  }, [courses, q]);
  const hitCount = searchHits.reduce((n, c) => n + c.books.length, 0);

  // 결과가 없을 때 제안할 교재 이름 — 가장 많은 과정에 있는 교재부터
  const suggestions = useMemo(() => {
    const count = new Map<string, number>();
    for (const c of courses) for (const b of c.books) {
      const base = b.book.split(' ')[0];
      count.set(base, (count.get(base) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name]) => name);
  }, [courses]);

  const totals = useMemo(() => ({
    books: courses.reduce((n, c) => n + c.books.length, 0),
    files: courses.reduce((n, c) => n + c.fileCount, 0),
  }), [courses]);

  return (
    <div className="space-y-5 text-content-primary">
      {/* ── 머리 ── */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Library className="h-5 w-5 text-content-tertiary" aria-hidden />
            <h1 className="text-lg font-semibold">교재 자료실</h1>
          </div>
          <p className="mt-1 text-sm text-content-tertiary">
            과정을 고르고 교재의 본문·해설·정답을 누르면 내려받습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && data.levels.length > 0 && (
            <span className={META_PILL}>
              {data.levels.join('·')} · 교재 {totals.books}종 · 파일 {totals.files}개
            </span>
          )}
          {data?.expiresAt && <span className={META_PILL}>{data.expiresAt}까지 이용</span>}
          {data?.manager && (
            <Link
              href={href('/dashboard/textbooks/manage')}
              className={`inline-flex min-h-9 items-center gap-1.5 ${RADIUS.control} border border-white/[.08] bg-white/[.04] px-3 text-sm text-content-secondary hover:bg-white/[.06] hover:text-content-primary ${FOCUS}`}
            >
              <Settings2 className="h-4 w-4" aria-hidden />
              <span className="whitespace-nowrap">교재 권한 관리</span>
            </Link>
          )}
        </div>
      </header>

      {loadError && (
        <div role="alert" className={`${RADIUS.panel} border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300`}>
          {loadError} 새로고침해도 계속되면 관리자에게 알려 주세요.
        </div>
      )}

      {!data && !loadError && <LoadingSkeleton />}

      {/* ── 권한 없음 ── */}
      {data && data.levels.length === 0 && (
        <div className={`${RADIUS.panel} ${PANEL_SURFACE} mx-auto flex max-w-lg flex-col items-center gap-2 px-6 py-14 text-center`}>
          <Lock className="h-6 w-6 text-content-tertiary" aria-hidden />
          <p className="font-medium">아직 교재를 받을 권한이 없습니다</p>
          <p className="text-sm leading-relaxed text-content-tertiary">
            {data.expiresAt ? `이용 기간(${data.expiresAt}까지)이 끝났습니다. ` : ''}
            원장님이나 관리자에게 <b className="font-medium text-content-secondary">중등·고등 교재 권한</b>을 요청해 주세요.
            권한이 켜지면 이 화면을 새로고침하면 바로 보입니다.
          </p>
        </div>
      )}

      {data && data.levels.length > 0 && courses.length === 0 && (
        <div className={`${RADIUS.panel} ${PANEL_SURFACE} px-6 py-14 text-center text-sm text-content-tertiary`}>
          교재를 올리는 중입니다. 잠시 뒤 새로고침해 주세요.
        </div>
      )}

      {data && courses.length > 0 && (
        <>
          {/* ── 검색 + 과정 고르기 ── */}
          <div className={`${RADIUS.panel} ${PANEL_SURFACE} space-y-3 p-4`}>
            <div className="relative">
              <label htmlFor="textbook-search" className="sr-only">교재 이름 검색</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" aria-hidden />
              <input
                ref={searchRef}
                id="textbook-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
                placeholder="교재 이름으로 전체 과정에서 찾기 — 예: 쎈, 블랙라벨, 개념원리"
                autoComplete="off"
                className={`h-10 w-full ${RADIUS.control} border border-chrome-border bg-chrome-input pl-9 pr-16 text-sm text-content-primary placeholder:text-content-tertiary focus:border-white/[.24] focus:outline-none`}
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => { setQuery(''); searchRef.current?.focus(); }}
                  aria-label="검색어 지우기"
                  className={`absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-content-tertiary hover:bg-white/[.06] hover:text-content-primary ${FOCUS}`}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-white/[.10] px-1.5 text-xs text-content-tertiary">/</kbd>
              )}
            </div>

            <nav aria-label="과정" className="space-y-2">
              {data.levels.map((lv) => {
                const list = courses.filter((c) => c.level === lv);
                if (!list.length) return null;
                return (
                  <div key={lv} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-full text-xs font-medium text-content-tertiary sm:w-10 sm:shrink-0">{lv}</span>
                    {list.map((c) => {
                      const on = !q && current?.level === c.level && current?.course === c.course;
                      return (
                        <button
                          key={c.course}
                          type="button"
                          onClick={() => pickCourse(c)}
                          aria-current={on ? 'page' : undefined}
                          className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
                        >
                          {c.course}
                          <span className={`ml-1.5 text-xs tabular-nums ${on ? 'text-content-secondary' : 'text-content-tertiary'}`}>
                            {c.books.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </div>

          {/* ── 본문 ── */}
          <div aria-live="polite" className="sr-only">
            {q ? `검색 결과 교재 ${hitCount}종` : current ? `${current.course} 교재 ${current.books.length}종` : ''}
          </div>

          {q ? (
            hitCount ? (
              <div className="space-y-6">
                <p className="text-sm text-content-tertiary">
                  「{query.trim()}」 — 교재 {hitCount}종
                </p>
                {searchHits.map((c) => (
                  <section key={`${c.level}|${c.course}`} className="space-y-2.5" aria-label={`${c.level} ${c.course}`}>
                    <h2 className="text-sm font-semibold text-content-secondary">{c.level} · {c.course}</h2>
                    <BookGrid books={c.books} busyId={busyId} doneIds={doneIds} onDownload={download} />
                  </section>
                ))}
              </div>
            ) : (
              <div className={`${RADIUS.panel} ${PANEL_SURFACE} space-y-3 px-6 py-10 text-center`}>
                <p className="text-sm">「{query.trim()}」 교재가 없습니다.</p>
                <p className="text-sm text-content-tertiary">이 교재들은 있습니다 — 눌러서 찾아보세요.</p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => setQuery(s)} className={`${CHIP} ${CHIP_OFF}`}>{s}</button>
                  ))}
                </div>
              </div>
            )
          ) : current ? (
            <section className="space-y-2.5" aria-label={`${current.course} 교재`}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h2 className="text-base font-semibold">{current.course}</h2>
                <span className="text-xs text-content-tertiary tabular-nums">
                  교재 {current.books.length}종 · 파일 {current.fileCount}개
                </span>
              </div>
              <BookGrid books={current.books} busyId={busyId} doneIds={doneIds} onDownload={download} />
            </section>
          ) : null}
        </>
      )}

      {/* ── 알림 (스크린리더에도 읽힘) ── */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast && (
          <div
            role={toast.tone === 'err' ? 'alert' : 'status'}
            className={`pointer-events-auto max-w-xl ${RADIUS.control} border bg-surface-card px-4 py-2.5 text-sm ${
              toast.tone === 'ok' ? 'border-white/[.12] text-content-primary' : 'border-red-500/40 text-red-300'
            }`}
          >
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}

function BookGrid({
  books, busyId, doneIds, onDownload,
}: {
  books: CatalogBook[];
  busyId: string | null;
  doneIds: Set<string>;
  onDownload: (f: CatalogFile, book: string) => void;
}) {
  return (
    <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {books.map((b) => (
        <li key={b.book} className={`${RADIUS.panel} ${PANEL_SURFACE} flex min-w-0 flex-col gap-3 p-4`}>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{b.book}</h3>
            {b.editions.length > 0 && (
              <p className="mt-0.5 text-xs text-content-tertiary">{b.editions.join(' · ')}</p>
            )}
          </div>
          <div className="mt-auto flex flex-wrap gap-1.5">
            {b.files.map((f) => {
              const main = f.kind === '본문';
              const busy = busyId === f.id;
              const done = doneIds.has(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onDownload(f, b.book)}
                  disabled={!!busyId && !busy}
                  aria-busy={busy || undefined}
                  aria-label={`${b.book} ${f.label} 내려받기, ${f.ext.toUpperCase()} ${formatSize(f.size)}`}
                  title={`${f.ext.toUpperCase()} · ${formatSize(f.size)}`}
                  className={`inline-flex min-h-9 items-center gap-1.5 ${RADIUS.control} border px-3 text-sm transition-colors disabled:opacity-50 ${FOCUS} ${
                    main
                      ? 'border-white/[.18] bg-white/[.10] text-content-primary hover:bg-white/[.15]'
                      : 'border-white/[.08] bg-white/[.03] text-content-secondary hover:bg-white/[.06] hover:text-content-primary'
                  }`}
                >
                  {busy
                    ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden />
                    : done
                      ? <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                      : <Download className="h-3.5 w-3.5 opacity-70" aria-hidden />}
                  <span className="whitespace-nowrap">{f.label}</span>
                  {f.ext !== 'pdf' && <span className="text-xs uppercase text-content-tertiary">{f.ext}</span>}
                </button>
              );
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="교재 목록 불러오는 중">
      <div className={`${RADIUS.panel} ${PANEL_SURFACE} h-32 motion-safe:animate-pulse`} />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`${RADIUS.panel} ${PANEL_SURFACE} h-28 motion-safe:animate-pulse`} />
        ))}
      </div>
    </div>
  );
}
