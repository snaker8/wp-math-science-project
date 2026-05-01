'use client';

// ============================================================================
// 시험지 출제 페이지 (1차) — 필터 + 검색
// /dashboard/exam-create
//
// CLAUDE.md 다음 우선순위:
//   문제은행에서 단원·유형·난이도 필터 → 문제 선택 → 시험지 생성 → PDF 출력
//
// 1차 PR 범위:
//   - 단원(mathsecr 트리 picker) + 난이도 multi-select + 키워드 검색
//   - 검색 결과 카드 리스트 (typeName, difficulty, content preview)
// 다음 PR (2차): 문제 선택 + 시험지 편성 + 저장
// 다음 PR (3차): PDF 출력
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  Search,
  Filter,
  BookOpen,
  Loader2,
  Layers,
  Plus,
  Check,
} from 'lucide-react';
import { MixedContentRenderer } from '@/components/shared/MixedContentRenderer';
import { MathsecrTreePicker } from '@/components/papers/MathsecrTreePicker';

interface ProblemRow {
  id: string;
  content_latex: string;
  source_name: string | null;
  source_year: number | null;
  classifications:
    | {
        type_code: string;
        expanded_type_code: string | null;
        difficulty: string;
        cognitive_domain: string;
      }
    | Array<{ type_code: string; difficulty: string }>;
}

interface SearchResponse {
  problems: ProblemRow[];
}

const DIFFICULTIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function ExamCreatePage() {
  const [typeCode, setTypeCode] = useState<string>('');
  const [typeName, setTypeName] = useState<string>('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedDiffs, setSelectedDiffs] = useState<Set<number>>(new Set());
  const [keyword, setKeyword] = useState('');
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const handleSearch = async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (typeCode) params.set('typeCode', typeCode);
      if (selectedDiffs.size === 1) {
        params.set('difficulty', String(Array.from(selectedDiffs)[0]));
      }
      if (keyword.trim()) params.set('q', keyword.trim());
      params.set('limit', '50');

      const res = await fetch(`/api/problems/search?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as SearchResponse;
      // 다난이도 필터는 클라이언트에서
      let filtered = data.problems || [];
      if (selectedDiffs.size > 1) {
        filtered = filtered.filter((p) => {
          const cls = Array.isArray(p.classifications) ? p.classifications[0] : p.classifications;
          if (!cls) return false;
          const d = parseInt(String(cls.difficulty), 10);
          return selectedDiffs.has(d);
        });
      }
      setProblems(filtered);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '검색 실패');
    } finally {
      setLoading(false);
    }
  };

  // 단원 선택 시 자동 검색
  useEffect(() => {
    if (typeCode) handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeCode]);

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black text-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-800/50 bg-gradient-to-r from-indigo-900/30 to-zinc-900/30 px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10">
              <BookOpen className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">시험지 출제</h1>
              <p className="mt-0.5 text-xs text-zinc-400">
                단원·유형·난이도로 문제은행을 검색하여 시험지에 편성
              </p>
            </div>
          </div>
          <div className="text-[11px] text-zinc-400">
            선택한 문항 <span className="font-bold text-cyan-400">{picked.size}</span>개
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 좌측 필터 */}
        <aside className="w-[320px] flex-shrink-0 overflow-y-auto border-r border-zinc-800/50 bg-zinc-950/40 p-5 space-y-4">
          {/* 단원 picker */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              단원 / 유형
            </label>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-left text-sm text-amber-300 hover:bg-amber-500/10"
            >
              {typeCode ? (
                <>
                  <div className="font-mono text-xs">{typeCode}</div>
                  <div className="mt-0.5 truncate text-[10px] text-zinc-400">{typeName}</div>
                </>
              ) : (
                <span className="text-zinc-500">트리에서 선택...</span>
              )}
            </button>
            {typeCode && (
              <button
                type="button"
                onClick={() => {
                  setTypeCode('');
                  setTypeName('');
                  setProblems([]);
                }}
                className="mt-1 text-[10px] text-zinc-500 hover:text-zinc-300"
              >
                선택 해제
              </button>
            )}
          </div>

          {/* 난이도 multi-select */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              난이도 (1~10, 다중 선택)
            </label>
            <div className="grid grid-cols-5 gap-1">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setSelectedDiffs((prev) => {
                      const next = new Set(prev);
                      if (next.has(d)) next.delete(d);
                      else next.add(d);
                      return next;
                    });
                  }}
                  className={`rounded-md px-2 py-1.5 text-xs font-bold transition-colors ${
                    selectedDiffs.has(d)
                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50'
                      : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-white'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* 키워드 */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              본문 키워드
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="예: 미생물, 함수"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-1.5 pl-9 pr-3 text-xs text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* 검색 버튼 */}
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading || !typeCode}
            className="w-full rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                검색 중...
              </>
            ) : (
              <>
                <Filter className="mr-1 inline h-3 w-3" />
                검색
              </>
            )}
          </button>

          {!typeCode && (
            <p className="text-[10px] text-zinc-500">
              먼저 단원/유형을 선택하세요. 트리에서 과목별로 분류된 단원·세부유형을 고를 수 있습니다.
            </p>
          )}
        </aside>

        {/* 우측 결과 */}
        <main className="flex-1 overflow-y-auto p-6">
          {err && (
            <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-2 text-xs text-rose-300">
              {err}
            </div>
          )}

          {loading && problems.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-zinc-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="text-sm">검색 중...</span>
            </div>
          ) : problems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
              <Layers className="mb-3 h-10 w-10 text-zinc-700" />
              <p className="text-sm">
                {typeCode
                  ? '검색 결과가 없습니다. 필터를 조정해 보세요.'
                  : '좌측 필터에서 단원/유형을 선택하면 결과가 표시됩니다.'}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs text-zinc-400">
                  검색 결과 <span className="font-bold text-white">{problems.length}</span>건
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {problems.map((p) => {
                  const cls = Array.isArray(p.classifications) ? p.classifications[0] : p.classifications;
                  const diff = cls ? parseInt(String(cls.difficulty), 10) : 0;
                  const code = cls?.type_code || '';
                  const isPicked = picked.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePick(p.id)}
                      className={`text-left rounded-xl border p-4 transition-all ${
                        isPicked
                          ? 'border-cyan-500/50 bg-cyan-500/10'
                          : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {diff > 0 && (
                            <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                              난이도 {diff}
                            </span>
                          )}
                          <code className="truncate text-[10px] text-zinc-500">{code}</code>
                        </div>
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                            isPicked ? 'bg-cyan-500 text-white' : 'border border-zinc-700'
                          }`}
                        >
                          {isPicked ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 text-zinc-500" />}
                        </div>
                      </div>
                      <div className="line-clamp-3 text-xs text-zinc-300">
                        <MixedContentRenderer content={(p.content_latex || '').slice(0, 200)} />
                      </div>
                      {p.source_name && (
                        <div className="mt-2 truncate text-[10px] text-zinc-500">
                          {p.source_name}{p.source_year ? ` · ${p.source_year}` : ''}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </main>
      </div>

      {/* 트리 picker */}
      <MathsecrTreePicker
        open={pickerOpen}
        initialSubjectCode={(typeCode.match(/^MS(\d{2})/) || [])[1] || '09'}
        onSelect={(code, fullPath) => {
          setTypeCode(code);
          setTypeName(fullPath);
          setPicked(new Set()); // 단원 바뀌면 선택 초기화
        }}
        onClose={() => setPickerOpen(false)}
      />

      {/* 푸터 — 다음 PR에서 시험지 편성 액션 */}
      {picked.size > 0 && (
        <div className="flex-shrink-0 border-t border-cyan-500/30 bg-cyan-500/10 px-8 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-cyan-200">
              <span className="font-bold">{picked.size}</span>개 문항 선택됨 — 시험지 편성 (2차 PR 예정)
            </span>
            <button
              type="button"
              disabled
              className="rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-4 py-1.5 text-xs font-bold text-cyan-300 opacity-60 cursor-not-allowed"
            >
              다음: 시험지 편성
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
