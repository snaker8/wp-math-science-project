'use client';

// ============================================================================
// 교재 자료실 — 과정을 고르면 시중교재가 카드로, 본문·해설·정답 버튼을 누르면 내려받기
// ============================================================================
//
// 2026-11-11 대표: "수학교재 파일 사이트 — 권한 있는 사람만 다운받아지게, 권한은 관리자가 설정".
// 받을 수 있는 학교급(중등/고등)만 서버가 내려준다. 내려받기는 매번 서버가 권한을 다시 확인하고
// 5분짜리 주소를 준다 (/api/textbooks/files/[id]/download).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Library, Loader2, Lock, Search, Settings2, X } from 'lucide-react';
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
const CHIP = 'whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm transition-colors';
const CHIP_OFF = 'border-white/[.08] bg-white/[.03] text-content-secondary hover:bg-white/[.06] hover:text-content-primary';
const CHIP_ON = 'border-white/[.14] bg-white/[.10] text-content-primary';

export default function TextbooksPage() {
  const href = useTrackHref();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [level, setLevel] = useState<TextbookLevel | null>(null);
  const [course, setCourse] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/textbooks', { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.message || '교재 목록을 불러오지 못했습니다.');
        return body as ListResponse;
      })
      .then((body) => {
        if (!alive) return;
        setData(body);
        let saved: string | null = null;
        try { saved = localStorage.getItem(LAST_COURSE_KEY); } catch { /* 저장소 막힘 */ }
        const first = body.courses.find((c) => `${c.level}|${c.course}` === saved)
          ?? body.courses.find((c) => c.course === '공통수학1')
          ?? body.courses[0];
        if (first) { setLevel(first.level); setCourse(first.course); }
        else if (body.levels[0]) setLevel(body.levels[0]);
      })
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const pickCourse = useCallback((c: CatalogCourse) => {
    setLevel(c.level);
    setCourse(c.course);
    setQuery('');
    try { localStorage.setItem(LAST_COURSE_KEY, `${c.level}|${c.course}`); } catch { /* 무시 */ }
  }, []);

  const download = useCallback(async (file: CatalogFile, book: string) => {
    if (busyId) return;
    setBusyId(file.id);
    try {
      const r = await fetch(`/api/textbooks/files/${file.id}/download`, { method: 'POST' });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body.url) throw new Error(body.message || '내려받기 주소를 만들지 못했습니다.');
      window.location.assign(body.url as string);
      setToast({ text: `${book} ${file.label} 내려받기를 시작했습니다.`, tone: 'ok' });
    } catch (e) {
      setToast({ text: (e as Error).message, tone: 'err' });
    } finally {
      setBusyId(null);
    }
  }, [busyId]);

  const courses = useMemo(() => data?.courses ?? [], [data]);
  const totals = useMemo(() => ({
    books: courses.reduce((n, c) => n + c.books.length, 0),
    files: courses.reduce((n, c) => n + c.fileCount, 0),
  }), [courses]);

  const q = query.trim().toLowerCase();
  const searchHits = useMemo(() => {
    if (!q) return [];
    return courses
      .map((c) => ({ ...c, books: c.books.filter((b) => b.book.toLowerCase().includes(q)) }))
      .filter((c) => c.books.length);
  }, [courses, q]);

  const current = courses.find((c) => c.level === level && c.course === course) ?? null;

  return (
    <div className="space-y-5 text-content-primary">
      {/* 머리 */}
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
            <span className="whitespace-nowrap rounded border border-white/[.08] bg-white/[.04] px-2 py-0.5 text-xs text-content-secondary tabular-nums">
              교재 {totals.books}종 · 파일 {totals.files}개
            </span>
          )}
          {data?.expiresAt && (
            <span className="whitespace-nowrap rounded border border-white/[.08] bg-white/[.04] px-2 py-0.5 text-xs text-content-secondary tabular-nums">
              {data.expiresAt}까지 이용 가능
            </span>
          )}
          {data?.manager && (
            <Link
              href={href('/dashboard/textbooks/manage')}
              className={`inline-flex items-center gap-1.5 ${RADIUS.control} border border-white/[.08] bg-white/[.04] px-3 py-1.5 text-sm text-content-secondary hover:bg-white/[.06] hover:text-content-primary`}
            >
              <Settings2 className="h-4 w-4" aria-hidden />
              <span className="whitespace-nowrap">교재 권한 관리</span>
            </Link>
          )}
        </div>
      </header>

      {loadError && (
        <div className={`${RADIUS.panel} border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300`}>
          {loadError} 새로고침해도 계속되면 관리자에게 알려 주세요.
        </div>
      )}

      {!data && !loadError && <LoadingSkeleton />}

      {data && data.levels.length === 0 && (
        <div className={`${RADIUS.panel} ${PANEL_SURFACE} flex flex-col items-center gap-2 px-6 py-14 text-center`}>
          <Lock className="h-6 w-6 text-content-tertiary" aria-hidden />
          <p className="font-medium">아직 교재를 받을 권한이 없습니다</p>
          <p className="text-sm text-content-tertiary">
            {data.expiresAt ? `이용 기간(${data.expiresAt}까지)이 끝났습니다. ` : ''}
            관리자에게 중등·고등 교재 권한을 요청해 주세요.
          </p>
        </div>
      )}

      {data && data.levels.length > 0 && (
        <>
          {/* 검색 + 과정 고르기 */}
          <div className={`${RADIUS.panel} ${PANEL_SURFACE} space-y-3 p-4`}>
            <label className="relative block">
              <span className="sr-only">교재 이름 검색</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" aria-hidden />
              <input
                id="textbook-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="교재 이름으로 전체 과정에서 찾기 (예: 쎈, 블랙라벨, 개념원리)"
                className={`w-full ${RADIUS.control} border border-chrome-border bg-chrome-input py-2 pl-9 pr-9 text-sm text-content-primary placeholder:text-content-muted focus:border-white/[.20] focus:outline-none`}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="검색어 지우기"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-content-muted hover:text-content-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </label>

            {data.levels.map((lv) => (
              <div key={lv} className="flex flex-wrap items-center gap-1.5">
                <span className="w-10 shrink-0 text-xs font-medium text-content-muted">{lv}</span>
                {courses.filter((c) => c.level === lv).map((c) => {
                  const on = !q && c.level === level && c.course === course;
                  return (
                    <button
                      key={c.course}
                      type="button"
                      onClick={() => pickCourse(c)}
                      aria-pressed={on}
                      className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
                    >
                      {c.course}
                      <span className="ml-1.5 text-xs text-content-muted tabular-nums">{c.books.length}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* 본문 */}
          {q ? (
            searchHits.length ? (
              <div className="space-y-6">
                <p className="text-sm text-content-tertiary">
                  「{query.trim()}」 {searchHits.reduce((n, c) => n + c.books.length, 0)}종
                </p>
                {searchHits.map((c) => (
                  <section key={`${c.level}|${c.course}`} className="space-y-2.5">
                    <h2 className="text-sm font-semibold text-content-secondary">
                      {c.level} · {c.course}
                    </h2>
                    <BookGrid books={c.books} busyId={busyId} onDownload={download} />
                  </section>
                ))}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-content-tertiary">찾는 교재가 없습니다.</p>
            )
          ) : current ? (
            <section className="space-y-2.5">
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-semibold">{current.course}</h2>
                <span className="text-xs text-content-muted tabular-nums">
                  교재 {current.books.length}종 · 파일 {current.fileCount}개
                </span>
              </div>
              <BookGrid books={current.books} busyId={busyId} onDownload={download} />
            </section>
          ) : (
            <p className="py-10 text-center text-sm text-content-tertiary">위에서 과정을 골라 주세요.</p>
          )}
        </>
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 ${RADIUS.control} border px-4 py-2.5 text-sm ${
            toast.tone === 'ok'
              ? 'border-white/[.12] bg-surface-card text-content-primary'
              : 'border-red-500/30 bg-surface-card text-red-300'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function BookGrid({
  books, busyId, onDownload,
}: {
  books: CatalogBook[];
  busyId: string | null;
  onDownload: (f: CatalogFile, book: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {books.map((b) => (
        <article key={b.book} className={`${RADIUS.panel} ${PANEL_SURFACE} flex min-w-0 flex-col gap-3 p-4`}>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold" title={b.book}>{b.book}</h3>
            {b.editions.length > 0 && (
              <p className="mt-0.5 text-xs text-content-muted">{b.editions.join(' · ')}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {b.files.map((f) => {
              const main = f.kind === '본문';
              const busy = busyId === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onDownload(f, b.book)}
                  disabled={!!busyId}
                  title={`${f.label} · ${f.ext.toUpperCase()} · ${formatSize(f.size)}`}
                  className={`inline-flex items-center gap-1.5 ${RADIUS.control} border px-2.5 py-1.5 text-sm transition-colors disabled:cursor-wait ${
                    main
                      ? 'border-white/[.16] bg-white/[.10] text-content-primary hover:bg-white/[.14]'
                      : 'border-white/[.08] bg-white/[.03] text-content-secondary hover:bg-white/[.06] hover:text-content-primary'
                  }`}
                >
                  {busy
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    : <Download className="h-3.5 w-3.5 opacity-70" aria-hidden />}
                  <span className="whitespace-nowrap">{f.label}</span>
                  {f.ext !== 'pdf' && <span className="text-[11px] uppercase text-content-muted">{f.ext}</span>}
                </button>
              );
            })}
          </div>
        </article>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="교재 목록 불러오는 중">
      <div className={`${RADIUS.panel} ${PANEL_SURFACE} h-28 animate-pulse`} />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`${RADIUS.panel} ${PANEL_SURFACE} h-24 animate-pulse`} />
        ))}
      </div>
    </div>
  );
}
