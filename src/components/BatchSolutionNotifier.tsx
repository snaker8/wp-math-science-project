'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, X } from 'lucide-react';

/**
 * 일괄 해설 생성 배치 상태 전역 모니터.
 * - dashboard layout에 마운트되어 모든 페이지에서 작동
 * - localStorage의 "batch_solution_watches"에 등록된 examId들을 5초마다 폴링
 * - 완료 감지 시 브라우저 알림 + 화면 우측 하단 토스트
 * - 실행 중인 배치가 있으면 우측 하단에 진행바 표시 (다른 페이지에서도 확인 가능)
 *
 * 등록 방법 (다른 컴포넌트에서):
 *   import { trackBatchSolution } from '@/components/BatchSolutionNotifier';
 *   trackBatchSolution(examId, examTitle);
 */

const LS_KEY = 'batch_solution_watches';

type Watch = { examId: string; title: string; startedAt: number };
type Status = { done: number; total: number; isRunning: boolean; errors?: number };
type Snapshot = Watch & Status;

function readWatches(): Watch[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeWatches(w: Watch[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(w));
}

export function trackBatchSolution(examId: string, title: string) {
  if (typeof window === 'undefined') return;
  const cur = readWatches();
  if (cur.some((w) => w.examId === examId)) return;
  cur.push({ examId, title, startedAt: Date.now() });
  writeWatches(cur);
  window.dispatchEvent(new Event('batch-solution-watches-changed'));
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export function BatchSolutionNotifier() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [toast, setToast] = useState<{ title: string; done: number; total: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 알림 권한 선제 요청 (거절 상태는 다시 안 물음)
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const prevStatus = new Map<string, Status>();

    const poll = async () => {
      const watches = readWatches();
      if (watches.length === 0) {
        setSnapshots([]);
        return;
      }

      const next: Snapshot[] = [];
      const finishedIds: string[] = [];

      for (const w of watches) {
        try {
          const r = await fetch(`/api/exams/${w.examId}/batch-solutions`, { cache: 'no-store' });
          if (!r.ok) {
            // 재시도; 6시간 지난 건 정리
            if (Date.now() - w.startedAt > 6 * 60 * 60 * 1000) finishedIds.push(w.examId);
            else next.push({ ...w, done: 0, total: 0, isRunning: false });
            continue;
          }
          const s: Status = await r.json();
          const prev = prevStatus.get(w.examId);
          prevStatus.set(w.examId, s);
          next.push({ ...w, ...s });

          // 완료 감지: 이전에 running이었고 지금은 아닐 때
          if (prev?.isRunning && !s.isRunning && (s.total ?? 0) > 0) {
            if ('Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('해설 생성 완료', {
                  body: `${w.title} · ${s.done}/${s.total} 문제`,
                  tag: `batch-${w.examId}`,
                });
              } catch { /* notification 실패 무시 */ }
            }
            setToast({ title: w.title, done: s.done, total: s.total });
            setTimeout(() => setToast(null), 8000);
            finishedIds.push(w.examId);
          }
        } catch {
          // 네트워크 에러는 그냥 스킵
        }
      }

      if (finishedIds.length > 0) {
        writeWatches(readWatches().filter((w) => !finishedIds.includes(w.examId)));
      }
      setSnapshots(next.filter((s) => !finishedIds.includes(s.examId)));
    };

    const onWatchesChanged = () => poll();
    window.addEventListener('batch-solution-watches-changed', onWatchesChanged);
    window.addEventListener('visibilitychange', onWatchesChanged);

    poll();
    const iv = setInterval(poll, 5000);
    return () => {
      clearInterval(iv);
      window.removeEventListener('batch-solution-watches-changed', onWatchesChanged);
      window.removeEventListener('visibilitychange', onWatchesChanged);
    };
  }, []);

  const running = snapshots.filter((s) => s.isRunning);

  return (
    <>
      {/* 진행 중 고정 배지 (우측 하단) */}
      {running.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2">
          {running.map((s) => (
            <Link
              key={s.examId}
              href={`/dashboard/cloud/${s.examId}`}
              className="flex items-center gap-3 rounded-xl border border-indigo-500/40 bg-zinc-900/95 backdrop-blur px-4 py-3 shadow-2xl min-w-[280px] hover:border-indigo-400 transition-colors"
            >
              <Sparkles className="h-4 w-4 text-indigo-400 animate-pulse flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-indigo-300 truncate">{s.title}</div>
                <div className="text-[11px] text-content-tertiary mt-0.5">
                  해설 생성 중 · {s.done}/{s.total}
                </div>
                <div className="mt-1 h-1 bg-zinc-800 rounded overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all"
                    style={{ width: `${s.total > 0 ? (s.done / s.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 완료 토스트 */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-[100] flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-zinc-900/95 backdrop-blur px-4 py-3 shadow-2xl min-w-[280px] animate-in slide-in-from-bottom-2">
          <Sparkles className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-emerald-300 truncate">✅ 해설 생성 완료</div>
            <div className="text-[11px] text-content-tertiary mt-0.5">
              {toast.title} · {toast.done}/{toast.total}
            </div>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-content-tertiary hover:text-content-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
