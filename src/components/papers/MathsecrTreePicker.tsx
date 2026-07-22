'use client';

// ============================================================================
// MathsecrTreePicker — 수학비서 분류 트리 selector 모달 (Phase C-2c-3)
//
// 목적:
//  - 강사가 분류 보정 시 typeCode를 트리에서 직접 선택 → 텍스트 입력 사고 차단
//    (PR #17 sanitize는 server-side 안전망이고, 이 picker가 client 측 근본 해결)
//  - 보정이 쉬워질수록 classification_corrections 누적 데이터 풍부 → self-compiling 가속
//
// 데이터: GET /api/mathsecr-types?subject={subjectCode}
// 사용:
//  <MathsecrTreePicker open initialSubjectCode="09"
//    onSelect={(code, fullPath) => ...} onClose={...} />
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';

interface MathsecrNode {
  code: string;
  name: string;
  fullPath: string;
  depth: number;
  problemCount: number;
  children: MathsecrNode[];
}

const SUBJECT_OPTIONS: Array<{ code: string; name: string; level: '중' | '고' }> = [
  { code: '01', name: '중1-1', level: '중' },
  { code: '02', name: '중1-2', level: '중' },
  { code: '03', name: '중2-1', level: '중' },
  { code: '04', name: '중2-2', level: '중' },
  { code: '05', name: '중3-1', level: '중' },
  { code: '06', name: '중3-2', level: '중' },
  { code: '07', name: '공통수학1', level: '고' },
  { code: '08', name: '공통수학2', level: '고' },
  { code: '09', name: '대수', level: '고' },
  { code: '10', name: '미적분1', level: '고' },
  { code: '11', name: '확률과 통계', level: '고' },
  { code: '12', name: '미적분2', level: '고' },
  { code: '13', name: '기하', level: '고' },
];

interface Props {
  open: boolean;
  initialSubjectCode?: string;
  onSelect: (code: string, fullPath: string) => void;
  onClose: () => void;
}

export function MathsecrTreePicker({ open, initialSubjectCode, onSelect, onClose }: Props) {
  const [subjectCode, setSubjectCode] = useState(initialSubjectCode || '09');
  const [tree, setTree] = useState<MathsecrNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<MathsecrNode | null>(null);

  // 트리 fetch
  useEffect(() => {
    if (!open || !subjectCode) return;
    setLoading(true);
    setSelected(null);
    setSearch('');
    fetch(`/api/mathsecr-types?subject=${subjectCode}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        setTree(d.tree || []);
        // 초기 — 1단계(대단원)만 expand
        const initialExpand = new Set<string>();
        (d.tree || []).forEach((n: MathsecrNode) => {
          if (n.depth <= 2) initialExpand.add(n.code);
        });
        setExpanded(initialExpand);
      })
      .catch((e) => console.error('[MathsecrTreePicker] fetch error:', e))
      .finally(() => setLoading(false));
  }, [open, subjectCode]);

  // 검색 필터 (full_path 또는 name substring)
  const filteredTree = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.toLowerCase().replace(/\s+/g, '');
    function filter(nodes: MathsecrNode[]): MathsecrNode[] {
      const out: MathsecrNode[] = [];
      for (const n of nodes) {
        const childMatched = filter(n.children);
        const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
        const selfMatched = norm(n.name).includes(q) || norm(n.fullPath).includes(q);
        if (selfMatched || childMatched.length > 0) {
          out.push({ ...n, children: childMatched });
        }
      }
      return out;
    }
    return filter(tree);
  }, [tree, search]);

  // 검색 시 자동 expand
  useEffect(() => {
    if (!search.trim()) return;
    const all = new Set<string>();
    function walk(nodes: MathsecrNode[]) {
      nodes.forEach((n) => {
        all.add(n.code);
        walk(n.children);
      });
    }
    walk(filteredTree);
    setExpanded(all);
  }, [search, filteredTree]);

  if (!open) return null;

  const handleConfirm = () => {
    if (selected) {
      onSelect(selected.code, selected.fullPath);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[85vh] w-[760px] max-w-[95vw] flex-col rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <div>
            <h2 className="text-base font-bold text-white">매쓰싸이 뱅크 분류 트리</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              과목 선택 후 트리에서 정확한 유형 노드를 골라 보정하세요
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar — 과목 + 검색 */}
        <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-3">
          <select
            value={subjectCode}
            onChange={(e) => setSubjectCode(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
          >
            <optgroup label="중학교">
              {SUBJECT_OPTIONS.filter((s) => s.level === '중').map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="고등학교">
              {SUBJECT_OPTIONS.filter((s) => s.level === '고').map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          </select>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="단원·유형명 검색 (예: 상용로그, 식 세우기)"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-1.5 pl-9 pr-3 text-xs text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-zinc-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span className="text-xs">로딩 중...</span>
            </div>
          ) : filteredTree.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              {search.trim() ? '검색 결과 없음' : '데이터 없음'}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filteredTree.map((n) => (
                <TreeNode
                  key={n.code}
                  node={n}
                  expanded={expanded}
                  onToggle={(c) => {
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(c)) next.delete(c);
                      else next.add(c);
                      return next;
                    });
                  }}
                  selected={selected}
                  onPick={setSelected}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-3">
          <div className="min-w-0 flex-1 text-[11px]">
            {selected ? (
              <>
                <div className="font-mono text-amber-400">{selected.code}</div>
                <div className="mt-0.5 truncate text-zinc-400">{selected.fullPath}</div>
              </>
            ) : (
              <span className="text-zinc-600">노드를 선택하세요</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selected}
              className="rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-4 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              선택 적용
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TreeNode({
  node,
  expanded,
  onToggle,
  selected,
  onPick,
}: {
  node: MathsecrNode;
  expanded: Set<string>;
  onToggle: (code: string) => void;
  selected: MathsecrNode | null;
  onPick: (n: MathsecrNode) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isOpen = expanded.has(node.code);
  const isSelected = selected?.code === node.code;
  // 깊이 들여쓰기 — depth 2부터 시작 (depth 1은 root)
  const indent = Math.max(0, node.depth - 1) * 14;

  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors ${
          isSelected ? 'bg-indigo-500/15 text-indigo-300' : 'text-zinc-300 hover:bg-zinc-900'
        }`}
        style={{ paddingLeft: 6 + indent }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.code)}
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-white"
          >
            {isOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <button
          type="button"
          onClick={() => onPick(node)}
          className="flex flex-1 items-center gap-2 truncate text-left"
        >
          <span className="truncate">{node.name}</span>
          {node.problemCount > 0 && (
            <span className="ml-auto shrink-0 text-[10px] text-zinc-500">
              {node.problemCount}
            </span>
          )}
        </button>
      </div>
      {hasChildren && isOpen && (
        <ul className="space-y-0.5">
          {node.children.map((c) => (
            <TreeNode
              key={c.code}
              node={c}
              expanded={expanded}
              onToggle={onToggle}
              selected={selected}
              onPick={onPick}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
